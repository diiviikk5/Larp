# Testing Larp together, with Meko on

How to test Larp on your PC and a friend's, and check every Meko feature while you do. For installing and hosting, see the README ("Run", "Download and host").

## Two ways to connect

| Setup | Who runs the space | How the friend joins |
|---|---|---|
| Same Wi-Fi | Your desktop app (Start a space) | Join a space with your LAN address and an invite code |
| Different places | A hosted server (Dockerfile, Render) behind HTTPS | Join a space with the https address and an invite code |

Agents always run on their owner's computer. Only the space (the coordinator) talks to Meko.

## Meko settings

Meko is used by the coordinator only, so only the computer or server that runs the space needs these. The friend's Larp needs no Meko key.

| Where the space runs | Put the settings in |
|---|---|
| Your desktop app, from the repo (`npm start`) | `E:\Commonwork\.env` |
| Your desktop app, installed | `%APPDATA%\Larp\larp\.env` |
| A hosted server | The server's environment variables |

```
MEKO_API_KEY=<your Meko key>
LARP_TEAM=divik-larp
```

Never put the key in a datapack, a chat or the repo. `LARP_TEAM` must stay `divik-larp`: that is how Larp finds the team's skills and apps libraries.

### Datapacks this uses

Your Meko account allows 10 datapacks.

| Datapack | Made by | Holds |
|---|---|---|
| `larp` | You (project) | Decisions, docs, build proofs and field-test notes for building Larp. Larp itself never touches it. |
| `divik-larp-skills` | You (project) | The skills catalog (docs/skills-catalog.md). Agents search it before every task. |
| `divik-larp-apps` | You (project) | The Swasthya and Kosh API contract (docs/apps-api.md). Agents search it before every task. |
| `divik-larp-team` | Larp | Every agent's memory and every space's lessons (each under its own `agent_id`), and result proofs |

With `meko_default_datapack` and `adlc-code-review-Oct31` already on the account, that leaves room for one space, the proofs pack and two agents. Add a third agent only after removing a datapack you don't need.

## What to try (about 20 minutes)

Each step exercises one Meko feature. Your agent is "A", your friend's is "B".

1. **Recall.** Give A a small coding task in a repo you both have. When it finishes, give A a follow-up on the same code. The task page's "Recalled from Meko" list shows what A remembered, with "Meko saved N tokens".
2. **Skills library.** Give A a task like "make the landing page less generic" or "add scroll animations". The recalled list shows a matching skill (orange "skill" label) with its install command.
3. **Hand-off.** Delegate a task to B. Your friend approves it on their PC. B's task shows a "hand-off" note from A.
4. **Lesson.** Ask for a change on B's result with specific feedback, then accept it and keep the fix as a lesson. Approve the lesson as the space keeper.
5. **Lesson reused.** Days later, or right away on a fresh copy, give B the same kind of task with no hint. B recalls the lesson.
6. **Royalties.** Open the Memory page: the knowledge royalties card credits whoever's memory saved the others tokens.
7. **Proof locker.** Have both agents make the exact same change. The second result says "Identical to …".
8. **Sleep.** On the Memory page, press "Sleep now" for an agent. The digest lists what was merged, forgotten or suggested.
9. **Forget.** On any task, use "forget" on a recalled memory. It is gone from the next recall.

Turn memory off (Memory page switch) and repeat step 5 to see the difference.

## Recording what happened

- A bug or surprise: save it to `larp` as a memory starting with "Field test:", saying what you did, what you expected and what happened. Promote it once it's a rule the team must follow.
- A run that passed: store its notes as an artifact in `larp` named `proof-field-<date>-<what>.txt`.
- Don't record personal data, keys, invite codes or addresses.
