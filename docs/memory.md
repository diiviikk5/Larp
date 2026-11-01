# Agent memory in Larp: Meko and YugabyteDB

Larp is a shared workspace where each person's AI agents run on that person's machine, and people delegate work to each other's agents with the owner's approval. Without memory, every agent starts from zero on every task and agents can't tell each other what they know. With Meko, each agent remembers across days, agents pass context to each other when work changes hands, and what one task taught the space can change how a later task goes.

## Who and what

| Who | Kind | Does |
|---|---|---|
| A person (Divik, Arjun, …) | person | Asks for work, approves runs on their own machine, reviews, accepts, approves lessons |
| Their agents (Sol, Byte, …) | agent | Do the work in an isolated worktree; recall before working and remember after |
| The space keeper (first member) | person | Approves what becomes space knowledge |

## Datapacks

| Datapack | Written by | Read by | Holds |
|---|---|---|---|
| `<team>-team`, one for the whole team | Everyone's agents and lessons, each under its own `agent_id` | See below | Everything Larp remembers, plus result proofs |

Inside that one datapack, Meko keeps a separate memory collection per `agent_id`:

| `agent_id` | Written by | Recalled by | Holds |
|---|---|---|---|
| `agent-<name>-xxxx`, one per agent | That agent; other agents leave notes under it | That agent | What it did, reviewer feedback, hand-off notes from other agents |
| `space-<name>-xxxx`, one per space | Lessons a person proposed | Every agent in the space | Knowledge a person approved, promoted with `memory_promote`; tagged with its space so other spaces never see it |

One datapack keeps Larp within Meko's free tier, which allows very few datapacks (a datapack per agent hit `FREE_TIER_DATAPACK_LIMIT`).

Private home data (calendars, budgets, availability) never goes to Meko. It stays on the owner's machine, and only answers the owner approved are shared.

## Where Meko is called

| When | Meko tool | Where in the code |
|---|---|---|
| Before a task runs: the agent recalls its own memory and the space's knowledge | `context_search` ×2 (plus `knowledgebase_search` in the skills and apps libraries) | `Memory.prepare`, `server/memory.mjs` |
| Delegated task: the requester's agent recalls what it knows about the topic and writes a hand-off note into the working agent's datapack | `context_search`, `memory_add` into another agent's datapack | `Memory.prepare` |
| After a result: the exchange is saved and Meko extracts durable facts | `conversation_add_message` | `Memory.outcome` |
| Reviewer asks for a change: the feedback is kept for that agent's future work | `memory_add` | `Memory.feedback` |
| Delegated work accepted: the working agent hands the outcome back to the requester's agents | `memory_add` into another agent's datapack | `Memory.handBack` |
| A lesson is approved by the space keeper | `memory_add`, then `memory_promote` (one-way, so only after a person approves) | `Memory.promoteLesson` |
| A person removes something an agent recalled | `memory_delete_by_id` | `Memory.forget` |

### Team libraries: skills and apps

Two more datapacks hold documents every agent may need: `<team>-skills` (the skills catalog, [skills-catalog.md](skills-catalog.md)) and `<team>-apps` (the Swasthya and Kosh API contract, [apps-api.md](apps-api.md)). Before each task, `Memory.prepare` searches both with `knowledgebase_search` and adds up to two passages from each as "Skills and apps that may help". Larp only reads these datapacks and never creates them, so a team without them spends no datapacks.

Two things learned on real Meko:
- `context_search` drops knowledge-base passages beyond a fixed distance, and most catalog matches fall beyond it, so libraries use `knowledgebase_search`. That always returns something, so Larp keeps a passage only if it matched on words too (`hybrid`) or is closer than 0.75.
- Meko's indexer drops inline code (text in backticks). Documents uploaded to a knowledge base are written without backticks, or the names, commands and paths inside them are lost.

The host puts what was recalled into the agent's prompt in labelled parts: its own memory, notes handed over by other agents, and the space's knowledge. The task page shows each recalled item with its source, score and memory ID, plus a "forget" link.

## People and agents in sync

- **An agent acts on what a person recorded.** A reviewer's feedback, or a lesson the keeper approved, is recalled by an agent days later and changes what it does.
- **A person acts on what an agent recalled or flagged.** The task page shows the hand-off notes and recalled memory before the owner approves and reviews. A lesson proposed when accepting goes to the space keeper as an approval.

## Context changes the outcome

`npm run test:memory` runs this story with real hosts, git worktrees and check commands:

1. Day 1: Divik's agent Sol looks at `add()` in demo-app and remembers what it found.
2. Divik delegates "fix add" to Arjun's agent Byte. Sol's notes are written into Byte's datapack and shown to Byte.
3. The first attempt fails its check. Divik's feedback ("replace `a - b` with `a + b`") fixes it. Divik accepts and keeps the fix as a lesson, and it is promoted in the space datapack. Byte hands the outcome back to Sol.
4. Later, Arjun gives Byte a new task on a fresh copy: "make the add tests pass", with no hint about the fix. Byte recalls the lesson and the check passes.
5. The same task with memory switched off: no Meko calls, and the check fails.

The test agent is a scripted one that follows instructions found in its prompt, so in this test the recalled text is literally what changes the result. Real runtimes (Claude Code, Codex, a local model) get the same prompt sections.

## Memory view

The Memory page is drawn only from the log of real Meko calls (`MekoCall` entries recorded by `server/meko.mjs`):

- agents as nodes, plus the space's shared knowledge;
- one edge per pair that exchanged calls, numbered, with the latest call highlighted;
- counters for recalls, writes, notes between agents and promotions;
- a call stream with the tool, summary, latency and result count;
- a replay slider that steps through the log.

A switch turns memory off, for comparison.

## Beyond recall: three things only a shared workspace needs

Recall is table stakes. These three use different Meko capabilities, each for a problem that only appears when several people's agents share work.

### Knowledge royalties: who made everyone faster?

**Meko capability:** every `context_search` returns `token_savings`, Meko's own count of tokens the recall saved, and each memory it returns carries its author (Larp writes `author` into every memory's metadata).

**What Larp does:** `Memory.payRoyalties` splits each recall's saved tokens among the authors of the memories it returned, weighted by score. Only reuse by *someone else's* agent counts. The Memory page shows a ledger (who saved others the most, reused how often, by how many agents) and the most valuable memories.

**Use cases:**
- A team lead sees that Arjun's fix for the flaky test saved three agents about 9k tokens this week, so that lesson is worth promoting.
- A family sees that Mum's notes on Dadi's medicines are the most reused knowledge in the home space.
- Contributors get credit for knowledge work that is normally invisible: writing down what worked.
- The space knows which memories earn their keep and which never get used.

### Agents that sleep: memory that stays clean

**Meko capability:** the full memory lifecycle: `memory_get_all` to review, `memory_update` to correct, `memory_delete_by_id` to forget.

**What Larp does:** around 3 a.m. (or on **Sleep now**), `Memory.sleep` reviews each agent's datapack. It merges near-duplicates (keeping the newest id with the fullest text), forgets hand-off notes older than a week, and suggests memories that other agents keep reusing as lessons. The morning digest shows what changed, and suggestions are shared only if a person approves.

**Use cases:**
- An agent that has been told "use pnpm" five times keeps one memory, not five.
- Notes passed between agents for an old task stop cluttering every later recall.
- The knowledge worth sharing surfaces by itself; a person decides.
- Recall gets better over time instead of noisier, which also means fewer tokens sent.

### Proof locker: has anyone already done this?

**Meko capability:** `artifact_put` stores files by content hash. Uploading the same bytes again returns the artifact stored first, **with its original filename**.

**What Larp does:** `Memory.proof` stores every result's diff as `proof-<task id>.patch` in the team's `proofs` datapack (index lines stripped, so the same change from different clones matches). When Meko answers with an earlier task's filename, Larp marks the result as a duplicate of that task, on the task page and in the Memory page's proof locker.

**Use cases:**
- Two teammates' agents fix the same bug: the second result says "identical to Arjun's accepted fix from Tuesday", with the proof.
- A reviewer can check that what was accepted is byte-for-byte what was tested.
- Proofs outlive the laptop: any machine on the team can fetch them by hash.

### The same three, used to build Larp itself

The project's own `larp` datapack (see CLAUDE.md) uses them too:
- **Proof locker:** each test suite's output is stored as an artifact after it passes (`proof-e2e-…`, `proof-test-memory-…`), so anyone can check what passed and when.
- **Sleep:** the coding agent reviews the datapack, corrects outdated memories with `memory_update` (for example the testing skill, when new test scripts were added) and flags anything off-topic instead of deleting it.
- **Royalties:** every recall made while building reports Meko's `token_savings`; recalls for this feature alone saved 40,400 tokens.

## Larp Cloud: memory with no setup

Every install gets Meko memory and YugabyteDB storage without a key. Larp Cloud is a few functions on the Larp website (`site/api`, deployed with the site on Vercel) that hold the Meko key and the database password as Vercel environment variables, so no key ever ships in the installer.

- On first start, each coordinator joins Larp Cloud (`POST /api/join`) and keeps its team token in `<data>/coordinator/cloud.json`.
- **Meko** (`POST /api/meko`): Larp sends each tool call there. Larp Cloud serves the shared `divik-larp-team` datapack plus the read-only skills and apps libraries, prefixes every `agent_id` with the team (`tm…~agent-sol-1a2b`), and removes anything another team wrote from results, including promoted lessons. Tools that delete in bulk or create datapacks are refused.
- **YugabyteDB** (`POST /api/db`): the coordinator's state, events and Meko call log go up in batches every couple of seconds, tagged with the team (`team_id`; the state row's id is the team). It attaches in the background, so startup never waits on the network.
- **Live page** (`GET /api/live`, https://larp-seven.vercel.app/memory.html): counts of every Meko call across all teams, by kind and day, and the latest calls (tool, time, result count). No task text, memory text, names or team ids.

Your own keys still win: a `MEKO_API_KEY` or `YUGABYTE_URL` in Larp's `.env` makes that coordinator talk to Meko or YugabyteDB directly, and `LARP_CLOUD=off` keeps everything on the computer. Setting up the service: `node work/cloud-env.mjs` stores the keys as Vercel environment variables, then `cd site && npx vercel --prod`. Test: `npm run test:cloud` runs the real handlers against a stand-in Meko and database, with two teams.

## YugabyteDB

When `YUGABYTE_URL` is set (or Larp Cloud is on), the coordinator stores its state snapshot, the full event history and every Meko call in YugabyteDB over YSQL (`server/db.mjs`: tables `larp_state`, `larp_events`, `larp_meko_calls`). The memory view's all-time counters, per-agent counts and agent-to-agent links come from SQL over that history. Without it, Larp keeps everything in local files and the view shows the recent log.

## Honest and private

- Nothing is shown as recalled unless Meko returned it.
- When memory is off, no Meko calls are made, and the call log says so.
- Only task text, results and reviewer feedback go to Meko. Calendars, budgets and other home data stay on the owner's machine.
- Keys live in Larp Cloud's environment variables (or your own `.env`), never in the installer, a datapack or the repo.
- Teams on Larp Cloud never see each other's memories, and the public live page shows counts only.

## Setup

```
npm install
cp .env.example .env        # add MEKO_API_KEY, optionally YUGABYTE_URL
npm run meko:check          # live check against Meko
npm run build
npm start
```
