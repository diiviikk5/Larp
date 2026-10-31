# Build in public: LinkedIn post and the 5-minute demo

## The post (draft, edit freely)

> My agent asked my friend's agent for help, and it worked.
>
> At hackCBS 9.0 we built **Larp**: a workspace where each person's AI agents run on their own computer, under their own account, and work together.
>
> In the demo, my agent Sol writes a feature and asks my friend's agent Byte to write the tests. My friend approves on their laptop, Byte writes them on their machine, and Sol picks them up and finishes: one change, both agents, tests passing. Then the same two agents plan a dinner for our two families, each reading only its own family's health and money apps.
>
> **What Meko does in it:** every agent has its own memory in @Meko, so it remembers across days. When work changes hands, the context goes with it. Lessons a person approves become knowledge every agent recalls. Meko's token savings tell us whose knowledge helped others most. Switch memory off and agents see only the task: in our tests, the same task then fails, because the remembered lesson was what fixed it.
>
> **@YugabyteDB** stores the space's history and every Meko call, so the Memory view is SQL over all of it.
>
> Also: Telegram control (grandma joins from one link), a Go terminal UI, and family apps built in.
>
> Built with coding agents connected to a shared Meko build datapack.
>
> #hackCBS #Meko #YugabyteDB #AIagents #buildinpublic
>
> [60–90 second video] · Download: https://larp-seven.vercel.app

Tag the Meko, YugabyteDB and hackCBS pages so the mentions link.

## The video (60–90 seconds, for the post)

1. **0–10s:** two laptops side by side, both on Larp. "My agent and my friend's agent are about to work together."
2. **10–35s:** New task to Sol (the settle() prompt from docs/demo.md). Cut to Sol's task: "Waiting on an agent", with the Agent conversation panel showing the request.
3. **35–50s:** the friend's laptop (or Telegram on a phone): "Run 'Sol asks…' on Byte?" → Approve.
4. **50–70s:** back to Sol: Attempt 2, "2 files changed", "Check passed on Divik's machine"; zoom on the file list (one file from each agent).
5. **70–85s:** the Memory page: calls between the agents, tokens saved, royalties. Flip the Meko switch off: "without memory, agents see only the task."
6. **85–90s:** the TUI with its sea; end on the website.

## The 5-minute judge demo

| Time | Show | Say |
|---|---|---|
| 0:00 | The Overview, two people in one space | "Larp: each person's agents run on their own computer. They work together, and the owner stays in charge." |
| 0:30 | Round 1 task to Sol; the agent conversation | "Sol writes the code and asks Byte, my friend's agent, for the tests. That request goes to my friend for approval." |
| 1:30 | Approval on the friend's laptop or Telegram | "Nothing runs on their machine without their OK." |
| 2:15 | Sol's finished task: both files, check passed, Accept | "Byte's tests came back into Sol's workspace. One change, both agents." |
| 2:45 | "Recalled from Meko" on Byte's task; the Memory page | "Before Byte started, Sol's notes were handed to it through Meko. Here's every Meko call, and whose knowledge saved tokens." |
| 3:30 | Memory switch off; a task's "Meko memory was off" note; the `npm run test:memory` result | "With Meko off, the agent sees only the task. In our test, the same task then fails: the remembered lesson is what fixed it." |
| 4:00 | Round 2 result: one plan naming both families | "Each agent read only its own owner's health and money apps. Neither family's data left its computer except inside the answer." |
| 4:30 | TUI, Telegram, YugabyteDB counters | "Drive it from a terminal or Telegram; the history and Meko calls live in YugabyteDB." |
