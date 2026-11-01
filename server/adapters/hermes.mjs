// Hermes Agent over the Agent Client Protocol (JSON-RPC on stdio).
// Hermes permission requests become approvals for the agent's owner.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';

function hermesExecutable() {
  if (process.env.LARP_HERMES) return process.env.LARP_HERMES;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'hermes', 'hermes-agent', 'bin', 'hermes.exe');
  }
  return 'hermes';
}

export function runHermes({ prompt, cwd, onLog, requestApproval, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(hermesExecutable(), ['acp'], { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const pending = new Map();
    let seq = 0;
    let said = '';
    let lastSaid = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      child.kill();
      error ? reject(error) : resolve(value);
    };
    const write = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    const call = (method, params) => new Promise((ok, no) => {
      const id = ++seq;
      pending.set(id, { ok, no });
      write({ id, method, params });
    });

    child.on('error', (error) => finish(new Error(`Could not start Hermes: ${error.message}`)));
    child.on('exit', (code) => finish(new Error(`Hermes exited (${code})`)));
    child.stderr.on('data', () => {});
    signal?.addEventListener('abort', () => finish(new Error('Cancelled')), { once: true });

    readline.createInterface({ input: child.stdout }).on('line', async (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id !== undefined && !msg.method) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.no(new Error(msg.error.message)) : p.ok(msg.result);
        return;
      }
      if (msg.method === 'session/request_permission') {
        const options = msg.params.options || [];
        const allow = options.find((o) => o.kind === 'allow_once');
        const reject = options.find((o) => o.kind === 'reject_once');
        const title = msg.params.toolCall?.title || 'Hermes wants to use a tool';
        const approved = allow ? await requestApproval(title, 'Requested by Hermes while working on this task.') : false;
        const choice = approved ? allow : reject;
        write({ id: msg.id, result: { outcome: choice ? { outcome: 'selected', optionId: choice.optionId } : { outcome: 'cancelled' } } });
        return;
      }
      if (msg.id !== undefined && msg.method) {
        write({ id: msg.id, error: { code: -32601, message: 'Not supported by Larp' } });
        return;
      }
      if (msg.method === 'session/update') {
        const u = msg.params.update;
        if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') said += u.content.text;
        else if (u.sessionUpdate === 'tool_call') {
          if (said.trim()) { onLog('say', said.trim()); lastSaid = said.trim(); said = ''; }
          onLog('tool', u.title || u.kind || 'tool');
        }
      }
    });

    (async () => {
      await call('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'larp', version: '0.6.5' } });
      const session = await call('session/new', { cwd, mcpServers: [] });
      const result = await call('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] });
      if (said.trim()) onLog('say', said.trim());
      if (result.stopReason !== 'end_turn') throw new Error(`Hermes stopped: ${result.stopReason}`);
      const final = said.trim() || lastSaid;
      // Hermes reports provider failures as an ordinary reply; treat them as the error they are.
      if (/^(API call failed|Error calling|HTTP [45]\d\d)/i.test(final)) throw new Error(final);
      finish(null, { summary: final || 'Hermes finished.' });
    })().catch((error) => finish(error));
  });
}
