import { useCallback, useEffect, useRef, useState } from 'react';
import type { State } from './types';

export type Session = { url: string; token: string };

export async function call<T = any>(session: Session, method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${session.url}/api/${route}`, {
    method,
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

/** Listen for "changed" pings from the coordinator, reconnecting with backoff. */
function subscribe(session: Session, onChange: () => void, onStatus: (online: boolean) => void) {
  let stopped = false;
  let controller: AbortController | null = null;
  (async () => {
    let delay = 1000;
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch(`${session.url}/api/stream`, { headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('stream');
        onStatus(true);
        delay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            if (block.startsWith('event: changed')) onChange();
          }
        }
      } catch {
        // reconnect below
      }
      if (stopped) return;
      onStatus(false);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15000);
    }
  })();
  return () => { stopped = true; controller?.abort(); };
}

export function useLarp(session: Session | null) {
  const [state, setState] = useState<State | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    if (pending.current) { again.current = true; return pending.current; }
    pending.current = (async () => {
      try {
        setState(await call<State>(session, 'GET', 'state'));
        setError('');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        pending.current = null;
        if (again.current) { again.current = false; refresh(); }
      }
    })();
    return pending.current;
  }, [session?.url, session?.token]);

  useEffect(() => {
    setState(null);
    if (!session) return;
    refresh();
    return subscribe(session, refresh, setOnline);
  }, [session?.url, session?.token, refresh]);

  const act = useCallback(async <T = any,>(method: string, route: string, body?: unknown) => {
    if (!session) throw new Error('Not signed in');
    const result = await call<T>(session, method, route, body);
    refresh();
    return result;
  }, [session?.url, session?.token, refresh]);

  return { state, online, error, refresh, act };
}

export type Larp = ReturnType<typeof useLarp>;
