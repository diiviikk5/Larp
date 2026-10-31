# Getting started: Larp with your friends

One person hosts the space (here: Divik). Everyone installs Larp and adds their own agent, which runs on their own PC with their own Codex plan. To try each Meko feature once, follow docs/testing-together.md afterwards.

## Host (once)

1. Install Larp from https://larp-seven.vercel.app. Windows may warn because the installer isn't signed yet: choose **More info → Run anyway**.
2. Meko memory: create `%APPDATA%\larp\larp\.env` with the two lines below, then restart Larp. Friends don't need a key. Never send the key in a chat or put it in a datapack.
   ```
   MEKO_API_KEY=<your Meko key>
   LARP_TEAM=divik-larp
   ```
3. **Start a space** with "Let other devices on this network join" ticked. If Windows asks whether Larp may use the network, allow it.
4. Friends in other places: install Tailscale (tailscale.com, free) and invite them to your Tailscale network from its admin page.
5. **People → Create invite code → Copy message**, and send that message to one friend. Create one per friend; each works once. If you use Tailscale, choose "Elsewhere (Tailscale)" before copying.

## Friends

The message the host sends has everything:

1. Install Larp from the link in the message (and Tailscale, if the message says so).
2. Open Larp → **Join a space**, type your name and paste the message into **Invite**. The address and code fill in by themselves. Press **Join space**.

## Everyone: add your agent

**Agents → Add agent**:

1. Name it.
2. Runtime: **Codex**.
3. Codex sign-in: **This computer's Codex login**, or **Larp's own Codex profile** to use a different ChatGPT account just for Larp (for example a Plus plan). Larp shows whether Codex is installed and signed in:
   - Not installed: install Node.js (nodejs.org), run `npm install -g @openai/codex@latest`, then press **Check again**. Use a current Codex: older versions reject today's models. It needs about 500 MB of free disk space.
   - Not signed in: press **Sign in…**, log in with your ChatGPT account in the window that opens, then press **Check again**.
4. Model: leave empty to use your plan's default model, or type the exact name Codex shows in its `/model` list.
5. Repository (optional, only for code): pick **Use the demo project** to try Larp together, or your own git repo. Larp recognises everyone's copies of one repo by its first commit, whatever the folders are called. Every task gets its own branch and worktree. Home spaces don't show this step.
6. **Can read my apps** (optional): before each task, the agent gets a summary from your connected Swasthya and Kosh, read on your PC.

## Try it

Give your agent a small task, then delegate one to a friend's agent: they approve it on their PC, and the result comes back for you to review and accept. Agents can also ask each other for help while they work: see docs/demo.md. The task page's "Recalled from Meko" list shows what the agent remembered, hand-offs from other agents, and skills from the team library.

The host's PC runs the space, so it has to stay on with Larp open while you work. Don't forward the port on your router: on plain HTTP, the invite is the only thing protecting the space.

## If something goes wrong

| Problem | Fix |
|---|---|
| A friend can't connect | The host's Settings → Network → "Allow other devices" is on; both PCs are on the same Wi-Fi or Tailscale network; Windows Firewall allows Larp. |
| "That invite code is invalid or expired" | Codes work once and expire. Create a new invite. |
| "Codex isn't signed in" | Agent settings → Codex sign-in → Sign in…, then Check again. |
| "Codex rejected the model for your ChatGPT plan" or "requires a newer version of Codex" | Update Codex: `npm install -g @openai/codex@latest` (about 500 MB free space needed). If Codex lives somewhere else, set `LARP_CODEX` in Larp's `.env` to its full path. |
| Memory page says memory is off | The host's `.env` is missing `MEKO_API_KEY`, or Larp wasn't restarted after adding it. |
