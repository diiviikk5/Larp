// Meko client for Larp agents. Every call is logged (for the swarm view) and can be
// switched off for the "Meko off" comparison, in which case no call is made and the agents get no context.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import crypto from 'node:crypto';

const KIND = {
  memory_add: 'write', conversation_add_message: 'write', conversation_create: 'write',
  memory_search: 'recall', context_search: 'recall', knowledgebase_search: 'recall', memory_get_all: 'review', memory_get_by_id: 'recall',
  artifact_put: 'proof', artifact_get: 'proof',
  memory_promote: 'promote', memory_update: 'correct', memory_delete_by_id: 'forget',
  datapack_search: 'setup', datapack_create: 'setup', datapack_describe: 'setup', datapack_list: 'setup',
};

// Tools that require a conversation_id from conversation_create (Meko uses it to nest traces).
const NEEDS_CONVERSATION = new Set(['memory_add', 'memory_search', 'memory_promote', 'memory_update', 'memory_delete_by_id',
  'memory_get_all', 'conversation_add_message', 'context_search', 'knowledgebase_search', 'artifact_put', 'artifact_get',
  // Live Meko also refuses these without one, although their schemas mark it optional.
  'datapack_search', 'datapack_create']);

export class Meko {
  constructor({ apiKey, url = 'https://mcp.mekodata.ai/mcp', team = 'larp', enabled = true, onCall } = {}) {
    this.apiKey = apiKey;
    this.url = url;
    this.team = team;
    this.enabled = enabled && Boolean(apiKey);
    this.onCall = onCall || (() => {});
    this.client = null;
    this.connecting = null;
    this.datapacks = new Map(); // short name -> id
    this.conversations = new Map(); // datapack id + agent -> conversation id
  }

  get configured() { return Boolean(this.apiKey); }

  setEnabled(on) { this.enabled = Boolean(on) && this.configured; }

  /** Full datapack name for a product agent, e.g. "desk" -> "<team>-desk". */
  name(short) { return `${this.team}-${short}`; }

  async connect() {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ name: 'larp', version: '0.6.2' });
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: { headers: { Authorization: `Bearer ${this.apiKey}` } },
      });
      await client.connect(transport);
      this.client = client;
      return client;
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async close() { await this.client?.close().catch(() => {}); this.client = null; }

  /**
   * Call a Meko tool and log it. `meta` describes the call for the swarm view:
   * { agent, to?, summary } — `to` is the agent whose datapack receives a note.
   */
  async call(tool, args, meta = {}) {
    const entry = {
      id: crypto.randomUUID(), at: new Date().toISOString(), tool, kind: KIND[tool] || 'other',
      agent: meta.agent || null, agentId: meta.agentId || null, to: meta.to || null, toId: meta.toId || null,
      datapack: meta.datapack ? this.name(meta.datapack) : null, spaceId: meta.spaceId || null, taskId: meta.taskId || null,
      space: Boolean(meta.space),
      summary: String(meta.summary || '').slice(0, 240), ok: true, ms: 0, skipped: false, error: null, resultCount: null, saved: null, quality: null,
    };
    if (!this.enabled) {
      entry.skipped = true;
      this.onCall(entry);
      return null;
    }
    const started = performance.now();
    try {
      const client = await this.connect();
      args = { ...args };
      if (args.metadata && typeof args.metadata !== 'string') args.metadata = JSON.stringify(args.metadata);
      if (NEEDS_CONVERSATION.has(tool) && !args.conversation_id) args.conversation_id = await this.conversation(args.datapack_id, args.agent_id || meta.agent);
      let response;
      try {
        response = await client.callTool({ name: tool, arguments: args });
      } catch (error) {
        // A dropped connection (flaky Wi-Fi) is retried once on a fresh connection; Meko's own errors aren't.
        if (!/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|terminated/i.test(error.message)) throw error;
        await this.close();
        response = await (await this.connect()).callTool({ name: tool, arguments: args });
      }
      const result = parse(response);
      if (response.isError || result?.error) throw new Error(typeof result?.error === 'string' ? result.error : JSON.stringify(result?.error || result).slice(0, 300));
      entry.ms = Math.round(performance.now() - started);
      entry.resultCount = Array.isArray(result?.results) ? result.results.length : Array.isArray(result?.results?.memory) ? result.results.memory.length + (result.results.knowledge_base?.length || 0) : null;
      // context_search reports how many tokens its recall saved: the number Larp's royalties are paid in.
      if (result?.token_savings) { entry.saved = Number(result.token_savings.tokens_saved) || 0; entry.quality = result.match_quality || null; }
      this.onCall(entry);
      return result;
    } catch (error) {
      entry.ok = false;
      entry.ms = Math.round(performance.now() - started);
      entry.error = error.message.slice(0, 300);
      this.onCall(entry);
      throw error;
    }
  }

  /** One conversation per agent per datapack, created once; a stable session id makes Meko reuse it across restarts. */
  async conversation(datapackId, agent) {
    const key = `${datapackId}|${agent}`;
    if (!this.conversations.has(key)) {
      this.conversations.set(key, (async () => {
        const client = await this.connect();
        const response = await client.callTool({ name: 'conversation_create', arguments: {
          datapack_id: datapackId, agent_id: agent || 'larp', title: `Larp: ${agent || 'larp'}`, session_id: `larp-${datapackId}-${agent}`,
        } });
        const result = parse(response);
        const id = result?.id || result?.conversation_id;
        if (response.isError || !id) throw new Error(`Meko didn't open a conversation: ${JSON.stringify(result).slice(0, 200)}`);
        return id;
      })().catch((error) => { this.conversations.delete(key); throw error; }));
    }
    return this.conversations.get(key);
  }

  /** Find a datapack by exact name without creating it. Returns its id, or null when there is none. */
  async find(short, agent = 'setup') {
    if (this.datapacks.has(short)) return this.datapacks.get(short);
    const name = this.name(short);
    const found = await this.call('datapack_search', { name, limit: 5 }, { agent, summary: `find ${name}` });
    const id = pickId(found?.datapacks?.find((d) => (d.datapack_name || d.name) === name));
    if (id) this.datapacks.set(short, id);
    return id || null;
  }

  /** Find a datapack by exact name, creating it if it doesn't exist yet. Returns its id. */
  async datapack(short, agent = 'setup') {
    if (this.datapacks.has(short)) return this.datapacks.get(short);
    // Several calls for one new datapack can arrive at once (a space's recalls run in parallel): share
    // one find-or-create, and if another writer created it first, read it back instead of failing.
    this.creating ||= new Map();
    if (!this.creating.has(short)) {
      this.creating.set(short, (async () => {
        let id = await this.find(short, agent);
        const name = this.name(short);
        if (!id) {
          try {
            const created = await this.call('datapack_create', { name }, { agent, summary: `create ${name}` });
            id = pickId(created?.datapack || created);
          } catch (error) {
            if (!/already|taken|exists/i.test(error.message)) throw error;
            this.datapacks.delete(short);
            id = await this.find(short, agent);
          }
        }
        if (!id) throw new Error(`Meko didn't return an id for datapack ${name}`);
        this.datapacks.set(short, id);
        return id;
      })().finally(() => this.creating.delete(short)));
    }
    return this.creating.get(short);
  }

  // ---------- what agents do with their memory ----------

  /** An agent remembers something in its own datapack (or, with `to`, leaves a note in another agent's). */
  async remember({ agent, key, datapack, text, metadata, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const result = await this.call('memory_add', { datapack_id: id, agent_id: key || agent, text, metadata }, { agent, datapack, summary: text, ...meta });
    return { result, id: memoryId(result) };
  }

  /** Recall before reasoning: what does this datapack know that's relevant? */
  async recall({ agent, key, datapack, query, limit = 5, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const result = await this.call('memory_search', { datapack_id: id, query, limit, ...(key ? { agent_id: key } : {}) }, { agent, datapack, summary: query, ...meta });
    return (result?.results || result?.memories || []).map((r) => ({ id: r.id || r.memory_id, text: r.memory || r.text || r.content || '', score: r.score ?? null, promoted: Boolean(r.promoted), metadata: r.metadata || null }));
  }

  /**
   * Recall through context_search: memory (and, with source 'auto', the knowledge base) in one call,
   * plus what Meko says the recall saved, its match quality, and who wrote each memory.
   */
  async search({ agent, key, datapack, query, limit = 5, source = 'memory', meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const r = await this.call('context_search', { datapack_id: id, agent_id: key || agent, query, limit, force_source: source }, { agent, datapack, summary: query, ...meta });
    const mem = (r?.results?.memory || []).map((m) => ({ id: m.id, text: m.memory || m.text || '', score: m.score ?? null, metadata: m.metadata || null, writer: m.agent_id || null, origin: 'memory' }));
    const kb = (r?.results?.knowledge_base || []).map((k) => ({ id: k.id, text: k.chunk_text || '', score: k.rerank_score ?? null, metadata: null, writer: null, origin: 'document' }));
    return { items: [...mem, ...kb], saved: Number(r?.token_savings?.tokens_saved) || 0, quality: r?.match_quality || null, hint: r?.agent_hint || null };
  }

  /** Every memory in a datapack, page by page (for the nightly review). */
  async listAll({ agent, key, datapack, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const r = await this.call('memory_get_all', { datapack_id: id, agent_id: key || agent, page, page_size: 100 }, { agent, datapack, summary: `review page ${page}`, ...meta });
      for (const m of r?.memories || []) out.push({ id: m.id, text: m.data || m.memory || '', at: m.created_at || null, conversation: m.conversation_id || null, writer: m.agent_id || null });
      if (!r || page >= (r.total_pages || 1)) break;
    }
    return out;
  }

  /**
   * Store a file as a Meko artifact. Meko keys artifacts by content: the same bytes return the artifact
   * stored first, with its original filename, so duplicate: true means someone already produced this.
   */
  async artifact({ agent, key, datapack, filename, text, contentType = 'text/plain', meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const r = await this.call('artifact_put', { datapack_id: id, agent_id: key || agent, filename, content_base64: Buffer.from(text, 'utf8').toString('base64'), content_type: contentType }, { agent, datapack, summary: filename, ...meta });
    return { artifactId: r?.artifact_id || null, hash: r?.content_hash || null, filename: r?.filename || filename, size: r?.size_bytes ?? null, duplicate: Boolean(r?.filename && r.filename !== filename) };
  }

  /**
   * Search the datapack's knowledge base (uploaded documents). Each passage keeps Meko's distance and
   * match type: "hybrid" means it matched on words as well as meaning.
   */
  async knowledge({ agent, datapack, query, limit = 5, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const result = await this.call('knowledgebase_search', { datapack_id: id, agent_id: agent, query, limit }, { agent, datapack, summary: query, ...meta });
    return (result?.results || []).map((k) => ({ id: k.id, text: k.chunk_text || '', distance: k.distance ?? null, match: k.match_type || null, document: k.document_id || null }));
  }

  /** Save an exchange; Meko extracts durable facts from it in the background. */
  async converse({ agent, key, datapack, conversationId, input, output, metadata, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    const args = { datapack_id: id, agent_id: key || agent, input, output, metadata, conversation_id: conversationId || await this.conversation(id, key || agent) };
    return this.call('conversation_add_message', args, { agent, datapack, summary: input, ...meta });
  }

  async startConversation({ agent, datapack, title, metadata }) {
    const id = await this.datapack(datapack, agent);
    const result = await this.call('conversation_create', { datapack_id: id, agent_id: agent, title, metadata }, { agent, datapack, summary: title });
    return result?.conversation_id || result?.id || result?.conversation?.id;
  }

  /** One-way: move memories into the datapack's shared knowledge. Only after a person approves. */
  async promote({ agent, key, datapack, memoryIds, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    return this.call('memory_promote', { datapack_id: id, agent_id: key || agent, memory_ids: memoryIds }, { agent, datapack, summary: `${memoryIds.length} memory to shared knowledge`, ...meta });
  }

  async correct({ agent, key, datapack, memoryId, text, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    return this.call('memory_update', { datapack_id: id, agent_id: key || agent, memory_id: memoryId, text }, { agent, datapack, summary: text, ...meta });
  }

  async forget({ agent, key, datapack, memoryId, meta = {} }) {
    const id = await this.datapack(datapack, agent);
    return this.call('memory_delete_by_id', { datapack_id: id, agent_id: key || agent, memory_id: memoryId }, { agent, datapack, summary: `forgot ${memoryId}`, ...meta });
  }

  async listTools() {
    const client = await this.connect();
    return (await client.listTools()).tools;
  }
}

/** MCP tool results arrive as text content; Meko's is JSON. */
function parse(response) {
  const text = (response?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) return response?.structuredContent ?? null;
  try { return JSON.parse(text); } catch { return { text }; }
}

/** memory_add may answer with the memory itself, a list of extracted memories, or an id. */
function memoryId(result) {
  return result?.id || result?.memory_id || result?.memory?.id || result?.results?.[0]?.id || result?.memories?.[0]?.id || null;
}

function pickId(obj) {
  return obj?.id || obj?.datapack_id || obj?.datapackId || null;
}

/** Read KEY=value lines from a .env file into process.env (without overriding what's already set). */
export async function loadEnv(file) {
  const fs = await import('node:fs/promises');
  try {
    const text = await fs.readFile(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* no .env */ }
}
