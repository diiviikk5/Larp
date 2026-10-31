# larp-tui

Larp in the terminal: watch tasks live, read the conversation between agents, approve requests, accept results, send new tasks, and see what Meko remembered. An ASCII sea scrolls along the top.

```
 █   ▄▀█ █▀█ █▀█                                          Two families · build
 █▄▄ █▀█ █▀▄ █▀▀                                               Divik · meko on
∼≈∽~-~∼≈∽~-~∼≈∽~-~∼≈∽~-~∼≈∽~-~∼≈∽~-~∼≈∽~-~∼≈<°)))≈∽~-~∼≈∽~-~∼≈∽~-~∼≈∽~
-∼∽-∼∽-∼∽><>-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽-∼∽
 1 Tasks │ 2 Approvals (1) │ 3 New task │ 4 Agents │ 5 Memory │ 6 Activity
▸ Sol    Add settle() with tests from Byte        ● asked an agent  ⇄ asked Byte
  Byte   Sol asks: Please write tests for settle  ● needs approval  ↳ asked by Sol
```

## Build

Go 1.22 or later:

```
cd tui
go build -o larp-tui .
```

## Run

| Command | Connects to |
|---|---|
| `larp-tui` | The space the Larp desktop app on this computer is in, as the person signed in there |
| `larp-tui pair <address> <code>` | Any space: in Larp, Settings → Phones → Pair a new phone, then use that code (like a phone). Saved for next time. |
| `larp-tui --url <address> --token <token>` | Explicitly |
| `larp-tui --check` | Prints who it connects as and what it sees, then exits |

## Keys

| Where | Keys |
|---|---|
| Anywhere | `1`–`6` or `tab` switch view · `s` next space · `q` quit |
| Tasks | `↑↓` move · `enter` open |
| A task | `a` accept · `r` ask for changes (type, `ctrl+s` sends) · `o` open the other agent's task · `esc` back |
| Approvals | `y` approve · `n` deny |
| New task | `↑↓` agent · `tab` next field · `←→` code changes or just an answer · `ctrl+s` send |
| Memory | `m` turns Meko memory on or off, to compare |

It follows the space live through the same event stream the app uses.
