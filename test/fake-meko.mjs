// A stand-in Meko MCP server for tests: same transport and tool names, memories in RAM,
// word-overlap search. It lets the e2e test check Larp's memory flow without a Meko account.
// The live check against real Meko is `npm run meko:check`.
import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);

export async function startFakeMeko({ token = 'test-token' } = {}) {
  const packs = new Map();     // id -> { id, name }
  const memories = new Map();  // id -> { id, datapack_id, text, promoted, metadata, agent_id }
  const calls = [];

  const conversations = new Set();
  const NEEDS = ['memory_add', 'memory_search', 'memory_promote', 'memory_update', 'memory_delete_by_id', 'conversation_add_message', 'context_search', 'memory_get_all', 'artifact_put', 'knowledgebase_search'];
  const artifacts = new Map(); // sha256 -> { artifact_id, filename, ... }
  const documents = [];        // { id, datapack_id, text }: knowledge-base chunks
  const kb = (datapack_id, query, limit) => {
    const q = words(query);
    return documents.filter((d) => d.datapack_id === datapack_id)
      .map((d) => { const w = words(d.text); return { ...d, score: q.size ? [...q].filter((x) => w.has(x)).length / q.size : 0 }; })
      .filter((d) => d.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
  };
  const meta = (m) => { try { return typeof m === 'string' ? JSON.parse(m) : m || null; } catch { return null; } };
  const search = (datapack_id, query, limit) => {
    const q = words(query);
    return [...memories.values()].filter((m) => m.datapack_id === datapack_id)
      .map((m) => { const w = words(m.text); const hit = [...q].filter((x) => w.has(x)).length; return { ...m, memory: m.text, score: q.size ? hit / q.size : 0 }; })
      .filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  };
  const tools = {
    conversation_create: ({ session_id }) => { const id = (session_id || crypto.randomUUID()).replace(/[^a-z0-9]/gi, '').slice(-32); conversations.add(id); return { id }; },
    datapack_search: ({ name, query }) => ({ datapacks: [...packs.values()].filter((p) => (name ? p.name === name : !query || p.name.includes(query))).map((p) => ({ datapack_id: p.id, datapack_name: p.name })) }),
    datapack_create: ({ name }) => {
      if ([...packs.values()].some((p) => p.name === name)) throw new Error('datapack name already taken');
      const p = { id: `dp_${crypto.randomBytes(4).toString('hex')}`, name }; packs.set(p.id, p); return { datapack_id: p.id, datapack_name: name };
    },
    memory_add: ({ datapack_id, text, metadata, agent_id }) => {
      const m = { id: `mem_${crypto.randomBytes(4).toString('hex')}`, datapack_id, text, metadata: meta(metadata), agent_id, promoted: false, created_at: new Date().toISOString() };
      memories.set(m.id, m);
      return { results: [{ id: m.id, memory: m.text, event: 'ADD' }] };
    },
    conversation_add_message: ({ datapack_id, input, output, agent_id, metadata }) => {
      // Real Meko extracts facts with a model; here the exchange itself becomes one memory.
      const m = { id: `mem_${crypto.randomBytes(4).toString('hex')}`, datapack_id, text: `${input} → ${output}`, agent_id, metadata: meta(metadata), promoted: false, created_at: new Date().toISOString() };
      memories.set(m.id, m);
      return { conversation_id: 'conv_test', queued: true };
    },
    memory_search: ({ datapack_id, query, limit = 5 }) => {
      const q = words(query);
      const results = [...memories.values()].filter((m) => m.datapack_id === datapack_id)
        .map((m) => { const w = words(m.text); const hit = [...q].filter((x) => w.has(x)).length; return { ...m, memory: m.text, score: q.size ? hit / q.size : 0 }; })
        .filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
      return { results };
    },
    // Shapes follow real Meko: buckets, token_savings, match_quality; memories carry metadata and their writer.
    context_search: ({ datapack_id, query, limit = 5, force_source = 'auto' }) => {
      const hits = force_source === 'knowledge_base' ? [] : search(datapack_id, query, limit);
      const docs = force_source === 'memory' ? [] : kb(datapack_id, query, limit);
      const sent = hits.reduce((n, m) => n + Math.ceil(m.text.length / 4), 0);
      return {
        results: { memory: hits.map((m) => ({ id: m.id, memory: m.text, score: m.score, metadata: m.metadata, agent_id: m.agent_id })), knowledge_base: docs.map((d) => ({ id: d.id, chunk_text: d.text, document_id: d.document_id, rerank_score: d.score })), conversation: { hits: [], thread: [] } },
        token_savings: { memory: { tokens_sent: sent, tokens_saved: hits.length * 900 }, tokens_saved: (hits.length + docs.length) * 900 },
        match_quality: hits[0]?.score >= 0.5 ? 'high' : hits.length ? 'mid' : 'low',
      };
    },
    // Like real Meko: always returns the closest passages; word matches are "hybrid", the rest "semantic" and far.
    knowledgebase_search: ({ datapack_id, query, limit = 5 }) => {
      const q = words(query);
      const scored = documents.filter((d) => d.datapack_id === datapack_id).map((d) => { const w = words(d.text); return { d, s: q.size ? [...q].filter((x) => w.has(x)).length / q.size : 0 }; });
      return { results: scored.sort((a, b) => b.s - a.s).slice(0, limit).map(({ d, s }) => ({ id: d.id, chunk_text: d.text, document_id: d.document_id, distance: s >= 0.2 ? 0.6 : 0.95, match_type: s >= 0.2 ? 'hybrid' : 'semantic' })) };
    },
    memory_get_all: ({ datapack_id }) => {
      const list = [...memories.values()].filter((m) => m.datapack_id === datapack_id).map((m) => ({ id: m.id, data: m.text, agent_id: m.agent_id, created_at: m.created_at }));
      return { memories: list, total: list.length, page: 1, total_pages: 1 };
    },
    artifact_put: ({ filename, content_base64, content_type }) => {
      const bytes = Buffer.from(content_base64, 'base64');
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (!artifacts.has(hash)) artifacts.set(hash, { artifact_id: crypto.randomUUID(), content_hash: hash, filename, content_type, size_bytes: bytes.length, stored_in: 'db' });
      return artifacts.get(hash);   // same bytes: the first artifact, with its original filename
    },
    memory_promote: ({ datapack_id, memory_ids }) => {
      for (const id of memory_ids) { const m = memories.get(id); if (!m || m.datapack_id !== datapack_id) throw new Error(`memory ${id} not in datapack`); m.promoted = true; }
      return { promoted: memory_ids.length };
    },
    memory_update: ({ memory_id, text }) => { memories.get(memory_id).text = text; return { ok: true }; },
    memory_delete_by_id: ({ memory_id }) => { memories.delete(memory_id); return { ok: true }; },
  };

  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{"error":"unauthorized"}'); return; }
    const mcp = new Server({ name: 'fake-meko', version: '0.0.0' }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: Object.keys(tools).map((name) => ({ name, inputSchema: { type: 'object' } })) }));
    mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      calls.push({ tool: params.name, args: params.arguments });
      try {
        const args = params.arguments || {};
        if (NEEDS.includes(params.name) && !conversations.has(args.conversation_id)) throw new Error('conversation_id_required');
        if (args.metadata !== undefined && typeof args.metadata !== 'string') throw new Error('metadata must be a JSON string');
        return { content: [{ type: 'text', text: JSON.stringify(tools[params.name](params.arguments || {})) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); mcp.close(); });
    await mcp.connect(transport);
    let body = '';
    for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    token, packs, memories, calls, artifacts, documents,
    /** Upload a document to a datapack's knowledge base (creating the datapack), one chunk per "## " section. */
    addDocument(name, text) {
      let p = [...packs.values()].find((x) => x.name === name);
      if (!p) { p = { id: `dp_${crypto.randomBytes(4).toString('hex')}`, name }; packs.set(p.id, p); }
      const document_id = crypto.randomUUID();
      for (const chunk of text.split(/\n(?=## )/)) documents.push({ id: crypto.randomUUID(), document_id, datapack_id: p.id, text: chunk.trim() });
    },
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}
