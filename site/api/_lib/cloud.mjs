// Larp Cloud: the hosted side of Larp's memory. It holds the Meko key and the YugabyteDB password
// (Vercel environment variables, never in the installer) and serves every Larp install:
//   POST /api/join   a new team token for a coordinator (no sign-up)
//   POST /api/meko   one Meko tool call, scoped to the caller's team
//   POST /api/db     the team's state, events and Meko call log in YugabyteDB
//   GET  /api/live   public counts for the website's live page (no text, no names)
// Teams share one Meko datapack (the free tier allows very few), each under its own agent_ids
// ("<team>~agent-sol-1a2b"), and results are filtered so a team only ever sees its own memories.
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Yugabyte } from './db.mjs';

const env = process.env;

// ---------- teams ----------

function secret() {
  if (!env.LARP_CLOUD_SECRET) throw Object.assign(new Error('Larp Cloud is not set up (LARP_CLOUD_SECRET)'), { status: 503 });
  return env.LARP_CLOUD_SECRET;
}

const sign = (team) => crypto.createHmac('sha256', secret()).update(team).digest('base64url').slice(0, 32);

export function newTeam() {
  const team = `tm${crypto.randomBytes(6).toString('hex')}`;
  return { team, token: `${team}.${sign(team)}` };
}

/** The caller's team from "Authorization: Bearer <team>.<signature>", or a 401. */
export function teamOf(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [team, sig] = token.split('.');
  const expected = /^tm[0-9a-f]{12}$/.test(team || '') ? Buffer.from(sign(team)) : null;
  const given = Buffer.from(String(sig || ''));
  const ok = expected && given.length === expected.length && crypto.timingSafeEqual(expected, given);
  if (!ok) throw Object.assign(new Error('Unknown Larp Cloud team'), { status: 401 });
  return team;
}

// ---------- Meko ----------

// The datapacks Larp Cloud serves, by the suffix Larp asks for (<LARP_TEAM>-team / -skills / -apps).
export const PACKS = {
  team: env.LARP_CLOUD_TEAM_PACK || 'b46f7a55-7d77-4542-a4df-c9948a4d9bbd', // divik-larp-team
  skills: env.LARP_CLOUD_SKILLS_PACK || '9b25fcd3-a6f7-47ac-8592-1bfcda30a120', // divik-larp-skills
  apps: env.LARP_CLOUD_APPS_PACK || '0ccee856-69be-45e3-8f87-5fbdc97a0ced', // divik-larp-apps
};
const PACK_KIND = new Map(Object.entries(PACKS).map(([kind, id]) => [id, kind]));

// What a team may do. Everything writes under its own agent_ids; the libraries are read-only.
const TOOLS = new Set(['memory_add', 'memory_search', 'context_search', 'knowledgebase_search', 'memory_get_all', 'memory_get_by_id',
  'artifact_put', 'artifact_get', 'memory_promote', 'memory_update', 'memory_delete_by_id', 'conversation_create', 'conversation_add_message']);
const LIBRARY_TOOLS = new Set(['knowledgebase_search', 'context_search', 'conversation_create']);

let mekoClient = null;
async function meko() {
  if (mekoClient) return mekoClient;
  const key = env.LARP_CLOUD_MEKO_KEY || env.MEKO_API_KEY;
  if (!key) throw Object.assign(new Error('Larp Cloud has no Meko key'), { status: 503 });
  const client = new Client({ name: 'larp-cloud', version: '0.6.4' });
  await client.connect(new StreamableHTTPClientTransport(new URL(env.MEKO_URL || 'https://mcp.mekodata.ai/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  }));
  mekoClient = client;
  return client;
}

async function callMeko(tool, args) {
  try {
    return await (await meko()).callTool({ name: tool, arguments: args });
  } catch (error) {
    // A connection kept from an earlier request may have gone stale: one fresh try.
    await mekoClient?.close().catch(() => {});
    mekoClient = null;
    return (await meko()).callTool({ name: tool, arguments: args });
  }
}

function parse(response) {
  const text = (response?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) return response?.structuredContent ?? null;
  try { return JSON.parse(text); } catch { return { text }; }
}

/** Drop anything another team wrote: memories and promoted passages carry the agent_id that wrote them. */
function ownOnly(value, prefix) {
  if (Array.isArray(value)) {
    return value.filter((item) => {
      const writer = item && typeof item === 'object' ? item.agent_id ?? item.metadata_filters?.agent_id : undefined;
      return writer === undefined || writer === null || String(writer).startsWith(prefix);
    }).map((item) => ownOnly(item, prefix));
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ownOnly(v, prefix)]));
  return value;
}

/** One Meko call for a team: checked, scoped to the team's agent_ids, and with others' results removed. */
export async function teamMeko(team, tool, input = {}) {
  const prefix = `${team}~`;
  const args = { ...input };
  // Larp finds its datapacks by name; Larp Cloud answers with its own (and never creates any).
  if (tool === 'datapack_search' || tool === 'datapack_create') {
    const name = String(args.name || '');
    const kind = Object.keys(PACKS).find((k) => name.endsWith(`-${k}`));
    const pack = kind ? { datapack_name: name, name, datapack_id: PACKS[kind] } : null;
    if (tool === 'datapack_create') {
      if (!pack) throw Object.assign(new Error('Larp Cloud only serves the team, skills and apps datapacks'), { status: 403 });
      return { result: pack, isError: false };
    }
    return { result: { datapacks: pack ? [pack] : [] }, isError: false };
  }
  if (!TOOLS.has(tool)) throw Object.assign(new Error(`Larp Cloud doesn't allow ${tool}`), { status: 403 });
  const kind = PACK_KIND.get(args.datapack_id);
  if (!kind) throw Object.assign(new Error('Unknown datapack'), { status: 403 });
  if (kind !== 'team' && !LIBRARY_TOOLS.has(tool)) throw Object.assign(new Error('The skills and apps libraries are read-only'), { status: 403 });
  args.agent_id = prefix + String(args.agent_id || 'larp').replace(/^tm[0-9a-f]{12}~/, '');
  if (args.session_id) args.session_id = `${team}-${args.session_id}`.slice(0, 200);
  const response = await callMeko(tool, args);
  let result = parse(response);
  if (kind === 'team') result = ownOnly(result, prefix);
  // Hand the team its own names back, without the prefix.
  result = JSON.parse(JSON.stringify(result ?? null).split(prefix).join(''));
  return { result, isError: Boolean(response.isError) };
}

// ---------- YugabyteDB ----------

let dbPromise = null;
export function database() {
  const url = env.LARP_CLOUD_DB_URL || env.YUGABYTE_URL;
  if (!url) throw Object.assign(new Error('Larp Cloud has no database'), { status: 503 });
  dbPromise ||= Yugabyte.connect(url, 4).catch((error) => { dbPromise = null; throw error; });
  return dbPromise;
}

export const cloudLabel = () => `YugabyteDB Aeon${env.YUGABYTE_REGION ? ` (${env.YUGABYTE_REGION})` : ''}`;

// ---------- request helpers ----------

export function handle(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (error) {
      const status = error.status || 502;
      if (status >= 500) console.error('[larp cloud]', error.message);
      res.status(status).json({ error: error.message.slice(0, 300) });
    }
  };
}

export function body(req) {
  if (req.method !== 'POST') throw Object.assign(new Error('Use POST'), { status: 405 });
  const value = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  return value;
}
