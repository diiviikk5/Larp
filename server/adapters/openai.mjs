// A small agent loop for any OpenAI-compatible chat API: Ollama, LM Studio,
// OpenRouter, Gemini's compatible endpoint, or OpenAI itself. The model can only
// list, read and write files inside the working folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { run } from './process.mjs';

const TOOLS = [
  { name: 'ask_agent', description: 'Delegate a bounded task to a named teammate and yield until it answers.', parameters: { type: 'object', properties: { name: { type: 'string' }, request: { type: 'string' } }, required: ['name', 'request'] } },
  { name: 'spawn_agent', description: 'Create a specialist inheriting your runtime and permissions, then yield. It can inherit your installed skills.', parameters: { type: 'object', properties: { name: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } } }, required: ['name'] } },
  { name: 'app_request', description: 'Read a connected app or request an approved write, then yield for its response.', parameters: { type: 'object', properties: { id: { type: 'string' }, method: { type: 'string' }, path: { type: 'string' }, body: { type: 'object', additionalProperties: true } }, required: ['id', 'method', 'path'] } },
  { name: 'run_command', description: 'Request permission to run a shell command in this task workspace, e.g. tests. Always requires user approval.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  { name: 'list_files', description: 'List files in a folder of the workspace (recursive, max 200).', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] } },
  { name: 'read_file', description: 'Read a text file from the workspace.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a text file in the workspace with the full new content.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'finish', description: 'Call when the task is done, with a short summary of what changed.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
].map((fn) => ({ type: 'function', function: fn }));

const SKIP = new Set(['.git', 'node_modules', 'dist', '.next', 'target', '__pycache__']);

export async function runOpenAICompatible({ prompt, cwd, config, onLog, signal, requestApproval }) {
  const baseUrl = String(config.baseUrl || 'http://127.0.0.1:11434/v1').replace(/\/$/, '');
  const model = config.model || 'qwen2.5-coder:7b';
  const key = config.apiKeyEnv ? process.env[config.apiKeyEnv] : null;
  if (config.apiKeyEnv && !key) throw new Error(`Environment variable ${config.apiKeyEnv} is not set`);
  const root = path.resolve(cwd);
  const inside = (p = '.') => {
    const target = path.resolve(root, p);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Path ${p} is outside the workspace`);
    return target;
  };
  const safePath = async (p) => {
    const target = inside(p);
    let cursor = target;
    while (cursor !== root) {
      try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Symbolic links are not allowed by file tools'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      cursor = path.dirname(cursor);
    }
    return target;
  };

  const tools = {
    async run_command({ command }) {
      if (!command || command.length > 2000) throw new Error('Invalid command');
      if (!requestApproval || !await requestApproval('Run command?', command)) return 'User declined this command';
      const result = await run(command, [], { cwd, shell: true, timeout: 120000, signal });
      return JSON.stringify(result).slice(-16000);
    },
    async list_files({ path: dir = '.' }) {
      const out = [];
      async function walk(folder) {
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          if (out.length >= 200 || SKIP.has(entry.name)) continue;
          const full = path.join(folder, entry.name);
          if (entry.isDirectory()) await walk(full);
          else out.push(path.relative(root, full).replaceAll('\\', '/'));
        }
      }
      await walk(await safePath(dir));
      return out.join('\n') || '(empty)';
    },
    async read_file({ path: file }) {
      const text = await fs.readFile(await safePath(file), 'utf8');
      return text.length > 60_000 ? text.slice(0, 60_000) + '\n…(truncated)' : text;
    },
    async write_file({ path: file, content }) {
      const target = await safePath(file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(content ?? ''));
      return `Wrote ${file}`;
    },
  };

  const messages = [
    { role: 'system', content: 'You are a careful agent in Larp. Use installed skills when relevant, inspect and change workspace files, ask specialist agents for bounded work, and request app operations. Commands require approval. Follow the task permissions. Make the smallest change that does the job, then call finish. Never claim a tool succeeded without a successful tool result.' },
    { role: 'user', content: prompt },
  ];

  let totalTokens = 0;
  for (let step = 0; step < 24; step++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', ...(baseUrl.includes('api.openai.com') ? { max_completion_tokens: 8192 } : { temperature: 0.2 }) }),
    });
    if (!response.ok) throw new Error(`Model API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    if (data.usage) {
      totalTokens += data.usage.total_tokens || 0;
      onLog('usage', `API step ${step + 1}: ${data.usage.prompt_tokens || 0} input + ${data.usage.completion_tokens || 0} output tokens; ${totalTokens} total this turn`);
      if (totalTokens > 250000) throw new Error('Per-turn token limit reached (250,000). Narrow the task or continue explicitly.');
    }
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Model API returned no message');
    messages.push(message);
    if (message.content?.trim()) onLog('say', message.content.trim());
    const calls = message.tool_calls || [];
    if (!calls.length) return { summary: message.content?.trim() || 'Finished.' };
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* reported below */ }
      const name = call.function.name;
      if (['ask_agent', 'spawn_agent', 'app_request'].includes(name)) {
        await fs.mkdir(path.join(root, '.larp'), { recursive: true });
        if (name === 'ask_agent') {
          if (!/^[A-Za-z0-9_-]{1,40}$/.test(args.name || '') || !args.request) throw new Error('Invalid agent request');
          await fs.writeFile(path.join(root, '.larp', `ask-${args.name}.md`), String(args.request));
        } else await fs.writeFile(path.join(root, '.larp', name === 'spawn_agent' ? 'spawn.json' : 'app-request.json'), JSON.stringify(args));
        onLog('tool', `${name}: ${args.name || args.id}`);
        return { summary: `Requested ${name}: ${args.name || args.id}` };
      }
      if (name === 'finish') {
        onLog('say', args.summary || 'Finished.');
        return { summary: args.summary || 'Finished.' };
      }
      onLog('tool', `${name} ${args.path || ''}`.trim());
      let result;
      try {
        if (!tools[name]) throw new Error(`Unknown tool ${name}`);
        result = await tools[name](args);
      } catch (error) {
        result = `Error: ${error.message}`;
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }
  throw new Error('Stopped after 30 steps without finishing');
}
