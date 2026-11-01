# Larp

A shared workspace where people's AI agents work together, each on its owner's machine, with its owner in charge.

- **Build spaces:** delegate coding tasks to your own agent or a teammate's. Each task runs on the agent owner's machine in an isolated git worktree. Larp then runs the requested check there and returns the diff and result. Overlapping edits across tasks are flagged. Accepting a result applies it as a new branch on your own machine.
- **Home spaces:** ask everyone's agents a question ("free Saturday?", "budget?"). Each agent answers from private data on its owner's device, within the sharing rules they set. Plus shared expenses with settle-up, and care checklists.
- **Phones:** pair a phone to approve requests for your agents, follow tasks, and use the home tools.
- **Agent memory (Meko):** each agent remembers its work across days, in its own Meko datapack. When work changes hands, agents pass notes to each other. Lessons a person approves become knowledge every agent in the space recalls. The Memory page shows every Meko call live, with replay. See [docs/memory.md](docs/memory.md).
- **Agents ask agents:** while working, an agent can ask another person's agent for help (a question, or part of the code). That person approves, the other agent works on their own computer, and its answer and changes come back into the asking agent's workspace. The task page shows the conversation. See [docs/demo.md](docs/demo.md).
- **Apps:** Swasthya (family health), Kosh (family finance) and Citylines (family transport) ship inside Larp and open from the Apps page. Agents can read their owner's Swasthya and Kosh, on the owner's computer ("Can read my apps").
- **Telegram:** approve requests, get results and accept them, take checklist items and send tasks from Telegram. Family members can join a space from one Telegram link, without installing anything.
- **Terminal:** `larp-tui` (Go) drives a space from the terminal: live tasks, the agents' conversation, approvals, new tasks, Meko memory. See [tui/](tui/).
- **Updates:** installed copies update themselves from the website.
- **Ocean mode:** Settings → Appearance → Ocean. An ASCII sea (src/ocean, after stackedlol/ascii-sharks) behind frosted glass, with one question and one box on the home screen.
- **Several people, one laptop:** a shared family laptop can host several people's agents. Each person pairs their own phone, and approvals go to the right person.

## hackCBS 9.0 · Meko track

| Criterion | Where it is |
|---|---|
| **The idea (A3)** | People's agents working together, each on its owner's computer. Context decides the outcome: an agent that recalls a teammate's lesson fixes the bug, without it the same task fails (`npm run test:memory`, step "Same task with memory off"). |
| **Meko on vs off (A1)** | Memory page switch (or `m` in the TUI). Off: no Meko calls, agents get only the task, and the task page says so. On: recall, hand-offs and lessons change what the agent does. |
| **Meko uses, each with a reason (A2)** | [docs/memory.md](docs/memory.md): per-agent memory (remember across days), hand-offs between agents' datapacks (context follows the work), lessons promoted with `memory_promote` (a person decides what the space knows), knowledge royalties from `token_savings` (credit whose memory helped), sleep with `memory_get_all`/`memory_update` (memory stays clean), proof locker with `artifact_put` (identical results recognised), skills and apps libraries with `knowledgebase_search` (agents find the right skill or API). |
| **Context the user can see (A4)** | Every task shows "Recalled from Meko" (source, score, forget link) and the agent conversation; the Memory page shows every Meko call live, royalties, sleep digests and proofs. |
| **Works, 5-minute demo, 5-command setup, honest and private (A5)** | Demo: [docs/demo.md](docs/demo.md). Setup: "Run" below. Privacy: "Safety model" below; Meko only ever gets task text and results, never calendars, health or money data. |
| **Built with Meko** | We built Larp with coding agents connected to Meko and a shared build datapack `larp`: decisions and gotchas promoted, docs in its knowledge base, test proofs as artifacts. The protocol is in [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md). |
| **Meko feature proposal** | [docs/meko-feature-proposal.md](docs/meko-feature-proposal.md): hand-offs between datapacks. |
| **Storage** | YugabyteDB (YSQL): state snapshots, the event history and every Meko call, with the Memory page's all-time numbers from SQL ([server/db.mjs](server/db.mjs)). |

## How it fits together

```
 Laptop A (hosts the space)            Laptop B
 ┌───────────────────────────┐         ┌──────────────────────┐
 │ Coordinator  ◄────────────┼─────────┤ Host: Arjun's agents │
 │ Host: Divik's agents      │  HTTP   └──────────────────────┘
 └─────────────▲─────────────┘
               │ phones (browser, paired with a code)
```

- **Coordinator** (`server/coordinator.mjs`): shared state for spaces, people, agents, tasks, approvals, plans, expenses, checklists, and an event log. It never runs agents and never receives private data.
- **Host** (`server/host.mjs`): runs one or more agents on a machine, connects out to the coordinator, and keeps private data local.
- **Agent runtimes** (`server/adapters/`):
  - Claude Code CLI and Codex CLI, using each person's own sign-in on their own machine.
  - Any OpenAI-compatible endpoint (Ollama, LM Studio, or an API key from an environment variable).
  - Hermes over ACP.
  - An offline scripted agent for tests.
- **Memory** (`server/meko.mjs`, `server/memory.mjs`): the coordinator recalls context before a task, saves outcomes and hand-offs after, and logs every Meko call. Works out of the box through Larp Cloud (`site/api`, keys held server-side; live counts at https://larp-seven.vercel.app/memory.html), or set your own `MEKO_API_KEY` in `.env`.
- **Storage** (`server/store.mjs`, `server/db.mjs`, `server/cloud.mjs`): local files, plus YugabyteDB through Larp Cloud by default. With your own `YUGABYTE_URL` set, state, events and the Meko call log go to YugabyteDB.
- **Desktop** (`electron/`, `src/`): the workbench. The same React app serves as the phone client.

## Run

Five commands from a fresh clone (Node 22, git):

```
npm install
cp .env.example .env        # optional: MEKO_API_KEY, LARP_TEAM, YUGABYTE_URL, YUGABYTE_CA
npm run meko:check          # optional: checks Meko with your key
npm run build
npm start
```

The first launch asks you to start a space or join one. To try two "laptops" on one machine, give the second instance its own data folder:

```
LARP_DATA_DIR=./tmp/laptop-b npx electron .
```

On launch, Larp shows a short splash while it starts its services. Turn it off in Settings → This computer, or set `LARP_NO_SPLASH=1`. It follows the system reduced-motion setting.

A coordinator can also run without the desktop app: `node server/cli.mjs init --name You`, then `node server/cli.mjs serve --lan`.

## Download and host

To set Larp up with friends (install, Codex sign-in, Meko key, invites, Tailscale for people elsewhere), see [docs/getting-started.md](docs/getting-started.md).

- **Installer:** `npm run dist:win` builds `release/Larp-Setup-<version>.exe`. Use `dist:mac` or `dist:linux` on those systems. `npm run test:packaged` launches the built app and joins a hosted server with it.
- **Hosted space:** deploy the `Dockerfile` (Render: `render.yaml`) behind HTTPS. Set `YUGABYTE_URL` (plus `YUGABYTE_CA_PEM` for Aeon) so the space survives restarts, and optionally `MEKO_API_KEY`. A fresh server prints a one-time setup code: in Larp choose *Join a space*, enter the https address and that code, and you own its first space. Agents still run on each person's computer and connect out.
- **Website:** `site/` (`npm --prefix site run build`). Put the installer in `site/public/downloads/`, or set `VITE_DOWNLOAD_BASE` to where releases are hosted.

## Test

The demo flows, end to end:

```
npm run test:talk      # agents ask agents on two hosts: Sol asks Byte, Byte's work comes back, applied across folders
npm run test:demo      # the same in two real desktop app copies, joining by a pasted invite
                       # (DEMO_RUNTIME=codex runs it with real Codex agents)
npm run test:round2    # two families' agents combine what their own apps know (real Codex)
npm run test:telegram  # approvals, results, checklists and joining from Telegram (stand-in Telegram API)
npm run test:apps      # Swasthya and Kosh start inside Larp and open, like Citylines
```

Everything else:

```
npm test               # coordinator, three hosts, real git repos and checks (scripted agent)
npm run test:loop      # Larp's own model loop against a fake OpenAI-compatible server
npm run test:ui        # two desktop instances plus a phone browser through every page
npm run test:ports     # a busy port falls back to the next free one
npm run test:ocean     # screenshots of Ocean mode and the connected apps in the desktop app
npm run test:hosted    # a server started like the Dockerfile; two laptops join it and delegate
npm run test:memory    # memory across days, agent hand-offs, lessons; memory on vs off (stand-in Meko server)
npm run test:sql       # the same, storing to a Postgres-wire database (YugabyteDB speaks YSQL)
npm run test:cloud     # Larp Cloud: two teams through the real site/api handlers, kept apart; database per team
npm run meko:check     # live connection to Meko with your key
npm run detect         # what agent runtimes this computer can run
npm run test:agents -- claude codex hermes   # one real task per runtime, using your own sign-ins
```

## Safety model

- Joining a space shares nothing. Delegated tasks need the agent owner's approval, and only the owner (desktop or paired phone) can give it.
- Agents work in isolated git worktrees. The Claude adapter gets edit tools only, with no shell or web access. The check command runs on the owner's machine, and the owner sees it before approving.
- Home answers are limited to the requested fields. Free time is derived from the calendar without event titles. Each field can be set to share automatically, ask each time, or never share.
- Each subscription or API key powers only its owner's agents. Larp launches the official CLIs and never reads their sign-in tokens.
- On a local network, connections are plain HTTP, gated by single-use invite and pairing codes. Don't forward a laptop's port to the internet; to reach people elsewhere, host the space on a server behind HTTPS (below).
- Larp records expenses and computes settlements. It never moves money.

## Piixpal

Bundled MIT-licensed Piixpal companions (`public/piixpal`, license included) are available in Appearance as optional decoration.
