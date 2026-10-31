// A small agent loop for any OpenAI-compatible chat API: Ollama, LM Studio,
// OpenRouter, Gemini's compatible endpoint, or OpenAI itself. The model can only
// list, read and write files inside the working folder.
import fs from 'node:fs/promises';
import path from 'node:path';

const TOOLS = [
  { name: 'list_files', description: 'List files in a folder of the workspace (recursive, max 200).', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] } },
  { name: 'read_file', description: 'Read a text file from the workspace.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a text file in the workspace with the full new content.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'finish', description: 'Call when the task is done, with a short summary of what changed.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
].map((fn) => ({ type: 'function', function: fn }));

const SKIP = new Set(['.git', 'node_modules', 'dist', '.next', 'target', '__pycache__']);

export async function runOpenAICompatible({ prompt, cwd, config, onLog, signal }) {
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

  const tools = {
    async list_files({ path: dir = '.' }) {
      const out = [];
      async function walk(folder) {
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
          if (out.length >= 200 || SKIP.has(entry.name)) continue;
          const full = path.join(folder, entry.name);
          if (entry.isDirectory()) await walk(full);
          else out.push(path.relative(root, full).replaceAll('\\', '/'));
        }
      }
      await walk(inside(dir));
      return out.join('\n') || '(empty)';
    },
    async read_file({ path: file }) {
      const text = await fs.readFile(inside(file), 'utf8');
      return text.length > 60_000 ? text.slice(0, 60_000) + '\n…(truncated)' : text;
    },
    async write_file({ path: file, content }) {
      await fs.mkdir(path.dirname(inside(file)), { recursive: true });
      await fs.writeFile(inside(file), String(content ?? ''));
      return `Wrote ${file}`;
    },
  };

  const messages = [
    { role: 'system', content: 'You are a careful coding agent working in a git worktree. Use the tools to inspect and change files. You cannot run commands; the workspace runs its own check after you finish. Make the smallest change that does the job, then call finish.' },
    { role: 'user', content: prompt },
  ];

  for (let step = 0; step < 30; step++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2 }),
    });
    if (!response.ok) throw new Error(`Model API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
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
