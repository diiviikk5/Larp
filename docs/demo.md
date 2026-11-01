# The demo: two people's agents working together

Divik and Arjun each run Larp 0.6.7 on their own PC, with their own Codex plan. Divik's agent **Sol** and Arjun's agent **Byte** work on one repo together: Sol writes the code and asks Byte for the tests; Arjun approves; Byte writes them on Arjun's PC; Sol finishes with Byte's tests in its workspace; one combined change passes `npm test` and lands on Divik's PC. A second round shows the agents using what Arjun's apps know.

## Before (5 minutes, once)

**Divik (hosts the space)**
1. Install Larp from https://larp-seven.vercel.app and open it. Meko memory is already set up on this PC.
2. **People → Create invite code → Copy message**, send it to Arjun. Not on the same Wi-Fi: both install Tailscale first and pick "Elsewhere (Tailscale)" before copying.
3. **Agents → Add agent**: name **Sol**, runtime **Codex**, Codex sign-in **Larp's own Codex profile → Sign in…** (your Plus account), Repository **Use the demo project**. Leave **Can read my apps** ticked (Swasthya and Kosh run inside Larp, each PC with its own sample family). Under Model, **gpt-6-luna · cheaper** keeps cost and limits down.

**Arjun**
1. Install Larp, **Join a space**, paste Divik's message.
2. **Agents → Add agent**: name **Byte**, runtime **Codex** (his own sign-in), Repository **Use the demo project**. Leave **Can read my apps** ticked.

Both "Use the demo project" copies are the same repo (same first commit), so Larp can move work between them.

## Round 1: building together (about 5 minutes)

Divik: **New task** → agent **Sol** → check command `npm test` →

> Add settle(expenses) to this repo in src/settle.js: it returns who pays whom, with the fewest payments, as [{ from, to, amount }], using paidBy() and shares() from src/expenses.js. Write the code yourself, and ask Byte (Arjun's agent) to write the tests for it in test/settle.test.js. When Byte has answered and its tests are in your workspace, make sure `npm test` passes.

What everyone sees:
1. Sol writes `src/settle.js`, then asks Byte. Sol's task shows **Waiting on an agent**; the **Agent conversation** panel shows the request.
2. Arjun gets an approval: "Run 'Sol asks: …' on Byte?" (in Larp, or in Telegram if linked). He approves.
3. Byte writes `test/settle.test.js` on Arjun's PC. Its answer and changes go back automatically.
4. Sol resumes in the same workspace with Byte's tests applied, runs `npm test`, and finishes: **2 files changed, check passed**, one by each agent.
5. Divik presses **Accept**: the change lands on Divik's PC as a `larp/accepted-…` branch.
6. **Memory** page: Sol's notes were handed to Byte through Meko before Byte started, Byte's outcome was handed back to Sol, and the proof of the result is stored in Meko. Knowledge royalties show whose memory saved tokens.

## Round 2: agents and apps (about 3 minutes)

Divik: **New task** → **Sol** → What you want back: **Just an answer** →

> Plan a dinner this week for our two families. Use my Kosh and Swasthya to check my budget and when my family is busy, and ask Byte for Arjun's family's budget and free evenings from Arjun's apps. Suggest one evening and a place that fits both budgets.

Sol reads Divik's apps on Divik's PC, asks Byte, Arjun approves (the approval says Byte will read Arjun's apps), Byte answers from Arjun's apps on Arjun's PC, and Sol combines both into one plan. Neither person's raw health or money data leaves their PC except inside the agent's answer.

## If something goes wrong

| Problem | Fix |
|---|---|
| Sol finishes without asking Byte | Ask for changes: "Ask Byte to write the tests, as the task says." |
| Arjun never gets the approval | Arjun's Larp must be open and connected (green dot by the name). |
| Byte's tests didn't apply | Both agents must use "Use the demo project" (or clones of the same repo). |
| Memory says off | The host's `%APPDATA%\larp\larp\.env` needs `MEKO_API_KEY`; restart Larp. |

## Proven by tests

- `npm run test:talk`: Sol asks Byte on two hosts; Byte's tests come back; the combined change passes and is applied across differently named folders; Byte reads Arjun's apps.
- `npm run test:demo`: the same in two real copies of the desktop app, joining by pasted invite. `DEMO_RUNTIME=codex npm run test:demo` runs it with real Codex agents (passed: Byte wrote the tests, 9 tests green).
- `npm run test:round2`: round 2 with real Codex (gpt-6-luna): Sol read the Sharma family's apps, Byte read the Mehta family's, and Sol's plan named both families and picked an evening both were free.
- `npm run test:telegram`: approvals, results and checklists from Telegram, and joining from a Telegram invite.
