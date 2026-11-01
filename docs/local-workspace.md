# Local agent workspace

Larp now opens on Workspace: one desktop hosts a space and up to eight agents per owner. The host runs up to three agents at once. Chat and Live work display the same tasks used by the paired phone UI and Telegram. Existing multi-device spaces remain usable.

## Start

1. Create a space, then open Set up team.
2. Choose the official Codex sign-in already on this computer, or connect an OpenAI API key. Keys are validated with OpenAI, encrypted with Electron safeStorage, and never returned to the renderer after saving. API key setup is desktop-only. Codex must be installed for subscription execution; the API runtime does not need Codex.
3. Choose a local Git repository, or connect GitHub CLI and clone owner/repository. Git and, for authenticated GitHub operations, gh must be installed.
4. Create a lead agent. Install skills in Skills and assign them to the agent. Ask it to spawn specialists or create additional agents yourself.
5. Give the lead a bounded task. Open Full trace for conversations, changes, checks and approvals. Accept a code result to apply it onto a separate accepted branch. Open draft PR explicitly pushes that branch and creates a draft on GitHub; it does not merge.

## Shared skills

The desktop reads the exact site/src/skills/skills.json catalog used by the website. The host clones a skill's GitHub source, pins its commit, and installs its directory and supporting files. Catalog install command strings are shown as reference, never blindly executed. Symlinks and dependency folders are excluded.

Agents share the installed source but receive separate copies in their task's .larp/skills folder, so an agent cannot mutate another agent's working copy. Each load records the skill title, commit and local path. Up to eight skills may be assigned to an agent. Supporting tools/accounts are not automatically installed. A loaded-skill receipt means the instructions entered the prompt, not that every instruction succeeded. Actual tool actions and results remain separate events.

## Agent protocol

- A lead writes .larp/spawn.json with name and skills and yields. The host creates the specialist with the same runtime, repository and app permission; skills must be a subset of the parent's assignments. Eight-agent limit; only lead tasks may spawn.
- A task writes .larp/ask-Name.md and yields. The coordinator creates a child task and delivers its answer and compatible repository patch back to the lead. Delegation to another owner requires approval. Nested delegation is disabled and a task can ask at most three times.
- Same-owner agent handoffs now use the Meko handoff and hand-back paths too. Memory scopes remain the product team datapack, distinct from the project's build datapack.
- Follow-ups append to the existing task. Running work takes them at the next turn boundary, not mid-command. Stopping a parent also cancels its active children.
- The API adapter has explicit spawn_agent, ask_agent and app_request tools, file tools, and approval-gated shell commands. A turn has at most 24 model steps and a 250,000-token usage cutoff. A continuation chain has a 20-turn cap. These are execution bounds, not a guaranteed dollar spending cap.

## Five apps

Swasthya and Kosh keep their authenticated local HTTP APIs. Agents can read additional routes and propose writes through the host; writes pause for owner approval. App tokens stay in the desktop main process.

Citylines, EduSpace and Studio synchronize their embedded local-storage records with a local AppRecords store. Open each app once to initialize its data. The iframe bridge validates the sender frame, uses revision checks to avoid stale overwrites, and refreshes the embedded app after host-side changes. Current routes: GET state or summary; POST records with collection and record; PATCH records with collection, id and patch. Collection names come from the current state. These generic record routes preserve existing collections but do not replace each app's domain-specific form validation; inspect proposed changes before approving.

All agent app writes require approval and log a success receipt only after the app returns success. No automatic bank transfers, medical decisions or other external transactions are introduced.

## Remote conversation

Settings > Phones pairs the responsive web UI. The desktop must stay awake and be reachable over the same network or a private VPN. Telegram long-polls from the desktop and does not require exposing a port.

Settings > Telegram connects a bot and pairs a chat. Plain text starts a task; @Name selects an agent. Reply to the bot's task acknowledgement to continue the same task. Commands: /chat TASK_ID message, /trace TASK_ID, /stop TASK_ID. Existing approval/result buttons still work. Chat users must be paired and authorized for the task.

## Inspect and test

Workspace displays recent successful Meko recall/write counts and whether persistence is YugabyteDB or local fallback. Memory retains the full graph and SQL-backed statistics. Skill/app/agent/usage events are recorded in task history and the event store.

Automated suites: node test/workspace.mjs (deterministic model stand-in), node test/workspace-ui.mjs (Electron, real upstream skill install, Studio sync and paired phone), node test/telegram.mjs, node test/agents-talk.mjs. Opt-in real account check: node test/workspace-live.mjs uses the current Codex subscription for a short lead/reviewer exchange with a real upstream skill. It does not publish changes.

Not verified by automated local tests: a real Telegram bot round-trip, a paid OpenAI API request with the user's key, and GitHub push/PR creation. These need the corresponding connected accounts. No release has been deployed by this local change.
