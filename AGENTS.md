# Team protocol (hackCBS 9.0 · Meko)

We build with coding agents connected to Meko, and share decisions, skills and knowledge through one Meko datapack: **`larp`** (id `1d68ee1b-bee1-4f21-8796-221d4f7c3ca9`). Use the Meko connector (MCP) for it.

## Every task

0. Open a conversation first (`conversation_create`, agent_id `<client>:Commonwork`); every memory call needs its id.
1. **Before you start:** recall the build datapack for anything about the task (`context_search` in `larp`). Follow promoted decisions.
2. **When you finish:** save a short summary of what changed and why (`memory_add` in `larp`).
3. **Upload docs that change** (README, docs/*.md) to the knowledge base with `knowledgebase_upload_document`, so passages stay searchable. Upload a copy without backticks: Meko's indexer drops inline code. If the skills catalog or the apps contract changes, upload it to its own datapack (below).
4. **Promote every decision the others must follow** (API contracts, schemas, datapack names, gotchas) with `memory_promote`. Only promoted rows reach the rest of the team. Start each decision with the name of the teammate who made it, for example "Divik: Larp agent datapacks are named <team>-agent-<name>-xxxx".

## Datapacks

Your Meko account allows 10. See docs/testing-together.md for the full list and the budget.

| Datapack | Holds | Search it with |
|---|---|---|
| `larp` (1d68ee1b-bee1-4f21-8796-221d4f7c3ca9) | Decisions, docs, build proofs, field-test notes | `context_search` |
| `divik-larp-skills` (9b25fcd3-a6f7-47ac-8592-1bfcda30a120) | docs/skills-catalog.md, made by `node work/skills-catalog.mjs` | `knowledgebase_search` |
| `divik-larp-apps` (0ccee856-69be-45e3-8f87-5fbdc97a0ced) | docs/apps-api.md (Swasthya and Kosh API) | `knowledgebase_search` |

Larp's agents read the skills and apps datapacks before every task (as `<LARP_TEAM>-skills` and `<LARP_TEAM>-apps`), so keep them current. Store each passing test run as an artifact in `larp` named `proof-<suite>-<date>.txt`.

## Never

- Never put API keys, tokens or personal data in any datapack.
- Never point Larp itself (`MEKO_API_KEY` in .env) at `larp`. The app creates its own datapacks per agent and per space (`<LARP_TEAM>-agent-…`, `<LARP_TEAM>-space-…`), so project knowledge and product data stay apart.

## Project

- Design: `docs/memory.md` (agent memory with Meko, storage in YugabyteDB). Testing on two PCs: `docs/testing-together.md`.
- Meko client: `server/meko.mjs`. Larp memory flow: `server/memory.mjs`. YugabyteDB store: `server/db.mjs`.
