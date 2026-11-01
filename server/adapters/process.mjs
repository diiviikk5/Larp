// Small helpers for running child processes and reading line-based output.
import { spawn } from 'node:child_process';
import readline from 'node:readline';

/** Run a command and collect its output. Rejects only if it cannot start. */
export function run(command, args, { cwd, input, timeout = 600_000, shell = false, env, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, env: env || process.env, windowsHide: true });
    let output = '';
    const keep = (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > 200_000) output = output.slice(-150_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { output += `\n[larp] stopped after ${Math.round(timeout / 1000)}s`; child.kill(); }, timeout);
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({ exitCode, output });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Run a git command and return trimmed stdout, throwing with git's message on failure. */
export async function git(cwd, args, options = {}) {
  const { exitCode, output } = await run('git', args, { cwd, ...options });
  if (exitCode !== 0) throw new Error(`git ${args[0]} failed: ${output.trim().slice(0, 600)}`);
  return output;
}

/** Spawn a long-running process that emits one JSON object per line. */
export function jsonLines(command, args, { cwd, input, shell = false, env, signal, onJson, onText, isComplete, completionGraceMs = 1500 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, env: env || process.env, windowsHide: true });
    let stderr = '';
    let completionTimer;
    let completed = false;
    const stop = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill();
    };
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-8000); });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { onText?.(trimmed); return; }
      if (isComplete?.(parsed) && !completed) {
        completed = true;
        // A completed turn can leave CLI hooks/children holding stdout open.
        completionTimer = setTimeout(() => { stop(); child.stdout.destroy(); child.stderr.destroy(); }, completionGraceMs);
      }
      try { onJson(parsed); } catch (error) { console.error('[larp] adapter event error:', error); }
    });
    const abort = stop;
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => { clearTimeout(completionTimer); signal?.removeEventListener('abort', abort); reject(error); });
    child.on('close', (exitCode) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(completionTimer);
      resolve({ exitCode: completed ? 0 : exitCode, stderr });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
