# Meko feature proposal: hand-offs between datapacks

*Team Larp, hackCBS 9.0. Evidence: our build datapack `larp` (promoted decisions and gotchas, conversation `686d53d4…`) and Larp's code (`server/memory.mjs`, `server/meko.mjs`).*

## 1. The friction

Larp is a harness where each person's agents run on that person's computer, and agents work together: one asks another for help, or a task is delegated to a friend's agent. Every agent has its own datapack (`<team>-agent-<name>`). The moment work changes hands, the receiving agent needs what the sending agent knows. Meko has no notion of handing memory from one datapack to another, so we built it by hand:

- **Copying by search and re-add.** Before a delegated task, Larp runs `context_search` in the sender's datapack and `memory_add`s the hits, flattened into one text note ("Hand-off from Divik's agent Sol: …"), into the receiver's datapack. The link to the source memories is lost: the receiver can't tell which memory a fact came from, and correcting the source never reaches the copy.
- **No expiry.** Hand-off notes are only useful for one task, but they live forever and clutter every later recall. We wrote a nightly "sleep" pass that lists the whole datapack with `memory_get_all` and deletes notes older than 7 days by matching the text prefix `Hand-off from`. That works, but it's a string-matching garbage collector.
- **No credit.** `context_search` reports `token_savings` for the whole recall, not per memory. To show whose knowledge saved others tokens ("knowledge royalties"), we write `metadata.author` on every memory and split each recall's savings across the returned memories by score. It's an approximation done client-side.
- **No consent across owners.** Datapacks belong to one account. Two people with their own Meko accounts can't let each other's agents read a slice of their memory, so everything runs under the host's key: one account owns every agent's datapack, including the friend's.

Promoted rows in `larp` that record this: the hand-off design (agents ask agents through Larp, then answers return), the `metadata.author` rule for royalties, and the sleep rules (merge near-duplicates, forget hand-offs older than 7 days).

## 2. The feature

**Hand-offs**: a first-class, consented, expiring transfer of selected memories from one datapack to another, with provenance and per-memory credit.

- A hand-off **references** source memories, it doesn't flatten them. The receiver recalls them with their source datapack, memory id and author.
- It **expires** (`expires_in`), and Meko removes it; no client garbage collection.
- It can cross accounts through a **share grant** on the receiving datapack ("accept hand-offs from datapack X"), so a friend's agent in their own account can receive memories without anyone handing over a key.
- Recalls that use handed-off memories report **`token_savings.by_memory`**, so the original author gets the credit.
- Promotion still works: if the receiver keeps a handed-off memory as space knowledge, `memory_promote` records where it came from.

## 3. The interface

A new MCP tool, plus one field on existing results.

```jsonc
// Request
memory_handoff({
  "conversation_id": "c0a1…",
  "from_datapack_id": "dp-sol",          // sender (the caller must own it or hold a grant)
  "to_datapack_id": "dp-byte",           // receiver (owned, or granted "accept_handoffs")
  "query": "add() in math.js",           // or "memory_ids": ["mem_1", "mem_2"]
  "limit": 5,
  "note": "Sol's notes for 'Fix add', delegated by Divik",
  "expires_in": "7d",
  "requires_acceptance": false           // true: lands in the receiver's inbox until accepted
})

// Response
{
  "handoff_id": "ho_7f3c",
  "status": "delivered",                 // or "pending_acceptance"
  "expires_at": "2026-11-08T10:00:00Z",
  "memories": [
    { "source_memory_id": "mem_1", "source_datapack_id": "dp-sol", "author": "agent:sol", "score": 0.82,
      "text": "add() subtracts; tests in test.mjs expect add(2,3) === 5" }
  ]
}
```

On the receiving side, `context_search` gets a `handoffs` bucket, and savings are itemised:

```jsonc
{
  "results": {
    "memory": [ … ],
    "handoffs": [ { "handoff_id": "ho_7f3c", "source_memory_id": "mem_1", "from": "dp-sol", "author": "agent:sol", "text": "…", "expires_at": "…" } ]
  },
  "token_savings": { "tokens_saved": 2400, "by_memory": { "mem_1": 1800, "mem_9": 600 } }
}
```

Supporting calls: `handoff_list` (inbox and outbox for a datapack), `handoff_revoke(handoff_id)`, and `datapack_share(datapack_id, grantee, scope: "accept_handoffs" | "send_handoffs")`.

## 4. Scenario, before and after

**Before (today, in Larp):** Divik delegates "fix add" to Arjun's agent Byte.
1. Larp searches Sol's datapack, glues the hits into one note and adds it to Byte's datapack.
2. Byte recalls the note, but can't see where it came from.
3. A week later, the stale note still shows up in Byte's unrelated recalls until our nightly job deletes it by its text prefix.
4. The Memory page credits Sol by our own estimate.
5. Arjun's agent lives in Divik's Meko account, because there's no way to share across accounts.

**After:**
1. Larp calls `memory_handoff(dp-sol → dp-byte, query: task, expires_in: 7d)`.
2. Byte's recall shows the handed-off memories with their author and source.
3. When Sol corrects a fact, the hand-off still points at Sol's memory.
4. After a week the hand-off is gone, with no cleanup code.
5. `token_savings.by_memory` credits Sol exactly.
6. Arjun keeps Byte's datapack in his own account and grants Divik's datapacks `accept_handoffs`.

## 5. Why it's new

Context layers today store and recall memory **for one agent**, or pool it for a whole team. Nothing models **one owner's agent passing a scoped, time-limited slice of its memory to another owner's agent**, with consent, provenance and credit. That's exactly what happens whenever work changes hands between people's agents, and multi-agent harnesses (Larp, OpenClaw-style swarms, Hermes) all do it today by copying text into prompts.

## 6. Risks and limits

| Risk | Limit |
|---|---|
| **Privacy:** too much memory leaks to another person's agent | Only memories matching the query or listed ids, capped by `limit`. `requires_acceptance` and a sender-side preview in `handoff_list`. Knowledge-base documents are never handed off, only memories. |
| **Cost:** copies multiply storage and embeddings | Hand-offs are references to existing vectors, not new embeddings. They expire by default (7 days); the maximum expiry is capped. |
| **Abuse:** spam or memory poisoning through someone's inbox | Cross-account hand-offs need an explicit `datapack_share` grant, are rate-limited per grant, and carry provenance, so the receiver can filter or revoke a sender. Promotion of a handed-off memory records its source. |
| **Stale facts** | The reference follows the source memory: an update or delete at the source shows at the receiver. |

### Also hit while building (bug reports, not the proposal)

- `datapack_search` and `datapack_create` refuse calls without `conversation_id`, although their schemas mark it optional.
- The knowledge-base indexer drops inline code (text in backticks), losing commands and paths.
- `context_search` with `force_source: "knowledge_base"` returned nothing for good matches (distance 0.6–0.8) because of a fixed cutoff; `knowledgebase_search` found them.
