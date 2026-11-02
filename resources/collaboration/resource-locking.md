---
title: Resource Locking (Soft Locks)
category: collaboration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Resource Locking (Soft Locks)

Advisory claims on shared resources — how they coordinate work, and what they deliberately
**do not** do.

## What a soft lock is

A soft lock is an **advisory claim**: "actor X is working on resource R in project P,
until expiry." It is a coordination _signal_ stored as durable state, not an enforcement
mechanism. The dashboard's own framing: _"Soft locks, not hard blockers."_

## Semantics

| Property     | Behavior                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Identity     | `(project, resource)` is unique — at most one holder at a time (enforced by unique index)                                        |
| Owner        | Single actor (agent id)                                                                                                          |
| Expiry (TTL) | Locks carry a time-to-live; default TTL is **implementation-specific** (current: 300s)                                           |
| Staleness    | Expired locks are cleaned up **lazily** — there is no background sweeper; expiry is realized when the lock table is next touched |
| Re-acquire   | The same owner may re-acquire/refresh their own claim; a foreign owner is refused while unexpired                                |
| Release      | Owner-scoped: the owner releases; there is no silent takeover                                                                    |

## Warn vs block (the precise boundary)

Locking is the one place where advisory collaboration meets a **correctness boundary**:

- **Acquiring a lock held by another, unexpired owner → hard refusal.** This is the lock
  API's integrity rule: two actors must not both believe they hold the same claim. This is
  _contention_, not human blocking — a human who insists can wait for expiry or coordinate,
  but the system will never hand out a duplicate claim.
- **Everything downstream of a lock is advisory.** A document write by someone other than
  the lock holder produces an ownership **warning** — the write proceeds. Locks never gate
  data writes. (Confirmed in the live service layer; the dormant layer differs — see below.)

## What locks deliberately do NOT do

- **Not a write gate**: holding a lock is not required to write, and lacking one does not
  stop a write.
- **Not authentication**: a lock is a claim, not proof of identity — locks live on the
  local-first HTTP surface where actors are client-claimed.
- **Not a mutex for correctness**: no critical-section guarantees; no deadlock detection
  (TTL is the escape hatch).
- **Not cross-project**: locks are project-scoped; visibility follows project identity.
- **Not immortal**: TTL + lazy expiry means forgotten claims self-clear.

## Intended usage pattern

```text
1. Inspect active locks (are they held? by whom? unexpired?)
2. Acquire (hard-refused if held by someone else — that's your cue to coordinate)
3. Do the risky-window work
4. Release promptly (don't wait for TTL)
```

Lock the _contention window_, not the whole task — long-lived holds just decay into
staleness and block others who check honestly.

## Naming resources

Resource identifiers are free-form strings with conventional prefixes (file paths, module
names, task ids, etc.). The convention matters: readable, stable names make the lock table
legible to other actors — a lock nobody understands is a lock nobody coordinates with.

## Divergence note (Confirmed)

The dormant service layer treats foreign ownership as a _write block_; the live layer
treats it as a _warning_. Locks themselves (acquisition) are hard-refused in both. Verify
which layer a code path uses before reasoning about post-lock behavior.

## Invariants

- At most one unexpired holder per `(project, resource)`.
- Locks never gate document writes (advisory downstream).
- Expiry is lazy and time-based; no sweeper jobs exist.
- Lock operations are recorded in the activity stream (implicit audit trail).

## Evidence

- `utils/collaborationEngine.js` — acquire/release/expiry, uniqueness, advisory warnings
- `docs/app.js` — soft-lock advisory rationale
- `server.js` — lock routes and activity recording
- `tests/multi-agent-coordination-test.js` — contention behavior

**Status:** Confirmed (semantics, boundaries); exact default TTL is
**(implementation-specific)** and may change.
