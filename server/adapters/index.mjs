// Agent runtimes. Each adapter runs one task in a working folder and reports progress.
//
//   run({ prompt, cwd, config, onLog, requestApproval, signal }) -> { summary }
//
// onLog(kind, text) streams progress ('say', 'tool', 'note').
// requestApproval(title, detail) resolves to true/false once the agent's owner answers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsonLines, run } from './process.mjs';
import { runOpenAICompatible } from './openai.mjs';
import { runHermes } from './hermes.mjs';
import runtimePaths from '../runtime-paths.cjs';

const MODEL = /^[\w.:\-/]{1,80}$/;

/** The Codex CLI to run: LARP_CODEX (a full path, for a copy installed elsewhere) or `codex` on the PATH. */
export const codexCommand = runtimePaths.codexCommand;

/** The environment for a child agent CLI, minus markers that make it think it is nested in another session. */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key === 'ELECTRON_RUN_AS_NODE') delete env[key];
  }
  return env;
}

export const RUNTIMES = {
  scripted: { label: 'Scripted (offline test agent)', needs: [] },
  claude: { label: 'Claude Code CLI (your own sign-in)', needs: ['claude'] },
  codex: { label: 'Codex CLI (your own sign-in)', needs: ['codex'] },
  openai: { label: 'OpenAI-compatible API (Ollama, LM Studio, API key)', needs: [] },
  hermes: { label: 'Hermes Agent (ACP)', needs: ['hermes'] },
};

export async function runAgent(runtime, options) {
  try {
    switch (runtime) {
      case 'scripted': return await runScripted(options);
      case 'claude': return await runClaude(options);
      case 'codex': return await runCodex(options);
      case 'openai': return await runOpenAICompatible(options);
      case 'hermes': return await runHermes(options);
      default: throw new Error(`Unknown runtime: ${runtime}`);
    }
  } catch (error) {
    throw new Error(explain(runtime, error.message));
  }
}

const NAMES = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes', openai: 'the model endpoint' };

/** Put a plain next step in front of provider errors, keeping the original message after it. */
export function explain(runtime, message) {
  const who = NAMES[runtime] || runtime;
  const hints = [
    [/insufficient[_ ]balance|\b402\b|credit balance is too low|quota exceeded/i, `The account ${who} uses has run out of credit. Top it up, or switch this agent to another runtime.`],
    [/not supported when using Codex with a ChatGPT account|model_not_found/i, 'Codex rejected the model for your ChatGPT plan. Update the Codex CLI (npm install -g @openai/codex), or set a model your plan offers in this agent’s settings.'],
    [/unavailable for free|use this slug instead/i, `The model set in ${who}'s own config is no longer free. Pick another model there.`],
    [/\b401\b|unauthori[sz]ed|invalid api key|not logged in|please (log|sign) in/i, `${who} isn’t signed in on this computer. Sign in with its own CLI, then try again.`],
    [/ENOENT|not recognized as an internal or external command|Could not start/i, `${who} isn’t installed on this computer, or isn’t on the PATH Larp sees.`],
    [/ECONNREFUSED|fetch failed/i, `Couldn’t reach ${who}. If it’s a local server like Ollama or LM Studio, make sure it’s running.`],
    [/\b429\b|rate limit/i, `${who} is rate-limiting this account. Wait a bit and ask for a revision to retry.`],
  ];
  const hint = hints.find(([pattern]) => pattern.test(message));
  return hint && !message.startsWith(hint[1]) ? `${hint[1]}\n\n${message}` : message;
}

/**
 * A deterministic agent for offline tests and demos without a model. It understands:
 *   create file <path> with content "<text>"
 *   replace "<old>" with "<new>" in <path>
 */
async function runScripted({ prompt, cwd, onLog }) {
  const inside = (p) => {
    const target = path.resolve(cwd, p);
    if (!target.startsWith(path.resolve(cwd) + path.sep)) throw new Error(`Refusing to touch ${p} outside the workspace`);
    return target;
  };
  const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  let changes = 0;
  for (const m of prompt.matchAll(/create file ([\w./-]+) with content "((?:[^"\\]|\\.)*)"/gi)) {
    onLog('tool', `write ${m[1]}`);
    await fs.mkdir(path.dirname(inside(m[1])), { recursive: true });
    await fs.writeFile(inside(m[1]), unescape(m[2]));
    changes++;
  }
  for (const m of prompt.matchAll(/replace "((?:[^"\\]|\\.)*)" with "((?:[^"\\]|\\.)*)" in ([\w./-]+)/gi)) {
    onLog('tool', `edit ${m[3]}`);
    const file = inside(m[3]);
    const before = await fs.readFile(file, 'utf8');
    if (!before.includes(unescape(m[1]))) {
      // Steps are replayed on revisions; skip ones that were already applied or superseded.
      onLog('note', `"${m[1]}" not found in ${m[3]}; skipping`);
      continue;
    }
    await fs.writeFile(file, before.split(unescape(m[1])).join(unescape(m[2])));
    changes++;
  }
  const summary = changes ? `Made ${changes} scripted change${changes === 1 ? '' : 's'}.` : 'No scripted instructions found; nothing changed.';
  onLog('say', summary);
  return { summary };
}

/** Claude Code in print mode. Edits only; no shell, no web. Larp runs the check itself. */
async function runClaude({ prompt, cwd, config, onLog, signal }) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Edit,Write,Glob,Grep',
    '--disallowedTools', 'Bash,WebFetch,WebSearch,NotebookEdit'];
  if (config.model && MODEL.test(config.model)) args.push('--model', config.model);
  let summary = '';
  let failed = null;
  const { exitCode, stderr } = await jsonLines('claude', args, {
    cwd, input: prompt, signal, env: cleanEnv(),
    onJson: (msg) => {
      if (msg.type === 'assistant') {
        for (const part of msg.message?.content || []) {
          if (part.type === 'text' && part.text.trim()) onLog('say', part.text.trim());
          if (part.type === 'tool_use') onLog('tool', `${part.name} ${part.input?.file_path || part.input?.pattern || part.input?.path || ''}`.trim());
        }
      } else if (msg.type === 'result') {
        summary = msg.result || summary;
        if (msg.is_error) failed = msg.result || msg.subtype || 'Claude reported an error';
      }
    },
  });
  if (signal?.aborted) throw new Error('Cancelled');
  if (failed) throw new Error(failed);
  if (exitCode !== 0) throw new Error(`Claude exited with code ${exitCode}: ${stderr.trim().slice(-400)}`);
  return { summary: summary || 'Claude finished.' };
}

/** Codex in exec mode, sandboxed to the worktree. */
async function runCodex(options) {
  const version = await run(codexCommand(), ['--version'], { env: cleanEnv(), timeout: 10000, shell: process.platform === 'win32' && !/\.exe$/i.test(codexCommand()), signal: options.signal });
  if (options.signal?.aborted) throw new Error('Cancelled');
  if (version.exitCode !== 0) throw new Error(`Could not start Codex: ${version.output.slice(-300)}`);
  options.onLog('note', `Runtime version: ${version.output.trim().split('\n')[0]}`);
  const parsed = version.output.match(/codex-cli (\d+)\.(\d+)/);
  if (options.config.model === 'gpt-6-luna' && parsed && Number(parsed[1]) === 0 && Number(parsed[2]) < 166) throw new Error('This installed Codex CLI is too old for gpt-6-luna in Larp. Update Codex or select the runtime default model.');
  try {
    return await runCodexOnce(options, []);
  } catch (error) {
    // Older configs carry service_tier = "default", which current Codex rejects before doing anything.
    // Override just that value for this run instead of touching the user's config file.
    if (!/service_tier|unknown variant `default`/.test(error.message) || options.signal?.aborted) throw error;
    options.onLog('note', 'This Codex CLI rejected the configured service tier; retrying this turn with service_tier=fast.');
    return runCodexOnce(options, ['-c', 'service_tier="fast"']);
  }
}

async function runCodexOnce({ prompt, cwd, config, onLog, signal }, overrides) {
  const args = [...overrides, 'exec', '--json', '--sandbox', config.executionMode === 'full-access' ? 'danger-full-access' : 'workspace-write', '--skip-git-repo-check'];
  if (config.model && MODEL.test(config.model)) args.push('-m', config.model);
  args.push('-');
  let summary = '';
  let failed = null;
  const { exitCode, stderr } = await jsonLines(codexCommand(), args, {
    // A separate Codex profile (its own sign-in and config) when the agent has one; otherwise the computer's own.
    cwd, input: prompt, signal, env: config.codexHome ? { ...cleanEnv(), CODEX_HOME: config.codexHome } : cleanEnv(),
    // codex is an npm .cmd shim on Windows, which needs a shell. Arguments are fixed or validated above.
    shell: process.platform === 'win32' && !/\.exe$/i.test(codexCommand()),
    isComplete: (msg) => msg.type === 'turn.completed' || msg.type === 'turn.failed',
    onJson: (msg) => {
      const item = msg.item;
      if (msg.type === 'error' || msg.type === 'turn.failed') failed = msg.message || msg.error?.message || 'Codex reported an error';
      if (!item || msg.type !== 'item.completed') return;
      if (item.type === 'agent_message' && item.text) { summary = item.text; onLog('say', item.text); }
      else if (item.type === 'command_execution') onLog('tool', `run ${item.command}`);
      else if (item.type === 'file_change') onLog('tool', `edit ${(item.changes || []).map((c) => c.path).join(', ')}`);
      else if (item.type === 'reasoning' && item.text) onLog('note', item.text.slice(0, 400));
    },
  });
  if (signal?.aborted) throw new Error('Cancelled');
  if (failed) throw new Error(failed);
  if (exitCode !== 0) throw new Error(`Codex exited with code ${exitCode}: ${stderr.trim().slice(-400)}`);
  return { summary: summary || 'Codex finished.' };
}
