---
title: Conflict Handling
category: collaboration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Conflict Handling

How the system detects, classifies, and surfaces competing state. The governing rule,
stated in the project's agent instructions: _"Detect conflicts explicitly; never smooth
them over silently. If a resource changed since your last known version or timestamp,
treat that as meaningful."_

## The three mechanisms

The word "conflict" has three distinct senses in this system. Keeping them apart is
essential to reasoning about behavior:

```mermaid
flowchart TD
    C[Competing state detected] --> O[Overlap conflict<br/>optimistic-concurrency mismatch]
    C --> D[Content conflict<br/>same key, different content]
    C --> T[Contention<br/>owned resource / claimed work]
    O --> OW[Warning + write proceeds<br/>recorded: activity + conflictsWith + metric]
    D --> DD[Automatic resolution<br/>importance → recency; loser deprecated]
    T --> TB[Specific operation refused<br/>(hard-block exception)]
```

### 1. Overlap conflict — optimistic concurrency (warn)

A write supplies an expected version or timestamp; if the record changed since, the system
flags the mismatch, **lets the write proceed**, and returns warnings. This answers
"changed-since-read" without blocking anyone — the caller decides what to do with the
signal. (In the dormant layer this is elevated to a refusal; the live layer warns — see
[structural divergence](#structural-divergence-confirmed-observation).)

### 2. Content conflict — automatic resolution (deprecate)

When a memory update event finds two entries sharing a key but differing in content, the
system resolves it **automatically** under the documented order: **importance first, then
recency**. The lower-ranked entry is _deprecated_ — never deleted, never overwritten
silently. Resolution is automatic but _visible_: deprecation is a lifecycle label, and the
event lands in activity.

### 3. Contention — hard refusal (the correctness boundary)

Two cases refuse the operation outright:

- **Lock acquisition** against a foreign, unexpired owner (no duplicate claims).
- **Claim-once task race** — concurrent claims resolve to exactly one owner.

Contention blocks only the _specific operation_, never the actor and never downstream
writes. Waiting out a lock TTL or picking different work are always available.

## Never smooth silently — the materialization contract

Every surfaced conflict leaves durable traces:

| Signal               | Where it lands                                           |
| -------------------- | -------------------------------------------------------- |
| `warnings[]`         | The write response (caller sees it)                      |
| Activity row         | The project timeline (everyone sees it)                  |
| `conflictsWith` link | On the record (history stays connected to current state) |
| Metric increment     | Collaboration-health counters                            |

A conflict that exists only in a console is a conflict the system failed at.

## Resolution order (memory)

**Importance → recency.** Higher importance wins; on equal importance, the newer entry
wins; the loser is deprecated. This mirrors the ranking philosophy
([context-retrieval](../memory/context-retrieval.md)) so the store converges toward the
knowledge future reads will trust.

## Hard-block vs warn — summary map

| Situation                                                   | Behavior                               |
| ----------------------------------------------------------- | -------------------------------------- |
| Document write under overlap/foreign lock/foreign ownership | **Warn**, proceed                      |
| Expected version/timestamp mismatch                         | **Warn**, proceed                      |
| Memory content duplicate                                    | **Auto-deprecate** loser, visible      |
| Lock held by another unexpired owner                        | **Refuse** acquisition                 |
| Concurrent task claim                                       | **Refuse** the loser                   |
| Invalid input                                               | **Refuse** (validation, pre-execution) |
| Destructive reset without confirmation                      | **Refuse**                             |

## Human override

Because most signals warn, a human can always override by acting — that is by design
([human-agent-collaboration](human-agent-collaboration.md)). Override does not erase the
signal: the overlap remains recorded. The documented judgment for agents is symmetric:
proceed only when the change is still justified, and communicate.

## Structural divergence (Confirmed observation)

- **Live layer** (what users experience): overlap → warning; writes proceed.
- **Dormant layer** (unwired): overlap → refusal for non-owners.

Until the layers are consolidated (acknowledged as planned roadmap work), treat the live
layer's warn semantics as the contract, and verify which layer any new code path uses.

## Invariants

- Conflicts are surfaced and recorded; never silently absorbed.
- Content conflicts resolve by importance → recency; the loser is deprecated, not deleted.
- Hard blocks apply only to the specific correctness-boundary operation.
- Human actors are never locked out of their project by collaboration signals.

## Evidence

- `agent-instruction.js` — the never-smooth rule + resolution order
- `utils/memoryEngine.js` — expected-version/timestamp checks, content-conflict resolution
- `utils/collaborationEngine.js` — warn-only risk evaluation, materialization
- `tests/conflict-detection-test.js` — behavioral evidence for all three mechanisms

**Status:** Confirmed (three mechanisms, resolution order, materialization, block map).
