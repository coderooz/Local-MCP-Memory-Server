---
title: Knowledge Persistence
category: memory
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Knowledge Persistence

The three tiers of state in this system, what belongs in each, and the durability
guarantees that separate them.

## Three tiers

```text
Ephemeral runtime state     →  lives in process memory only; dies with the process
Persistent project state    →  durable in storage; authoritative for coordination
Durable knowledge           →  the curated subset of memory that stays valuable across
                               versions, sessions, and refactors
```

### 1. Ephemeral runtime state

In-process only, intentionally non-durable:

- Circuit-breaker state, health caches, pending request queues
- Discovered-tool caches from connected MCP servers
- Rate-limit counters, session connection state
- Any derived index rebuilt on demand

Losing it is safe by design — it is rebuilt from persistent state.

### 2. Persistent project state

Everything coordination depends on, durable in embedded SQLite (WAL, foreign keys on,
busy timeouts):

- **Memory entries + version history**
- **Tasks, issues, messages** (coordination backbone)
- **Resource locks** (advisory claims with expiry)
- **Activity stream** (append-only timeline)
- **Agent registry + metrics**
- **Project descriptors and project maps**
- **MCP server registry rows** (with encrypted credentials)
- **Execution job/approval records** (opt-in domain)

Plus one deliberately thin file: the per-project **runtime discovery file** (host/port/PID
of the running server). It is _validated, never trusted_ — PID and port are probed before
reuse, because such files can be stale.

### 3. Durable knowledge

The curated subset worth keeping across future versions:

- Decisions and their rationale
- Constraints and rules
- Patterns and architecture
- Bugs and fixes
- Collaboration rules future actors need

Project rules are explicit about the boundary: **store only durable, reusable knowledge**;
do not store trivial chat, temporary scratch notes, or unsupported assumptions. The
[resource layer](../README.md) this document lives in is the extreme case of durable
knowledge — architectural memory that intentionally contains no volatile facts.

## Durability guarantees (and non-guarantees)

| Path                        | Guarantee                                                                |
| --------------------------- | ------------------------------------------------------------------------ |
| Primary record write        | Decisive, single-attempt (never auto-retried); authoritative             |
| Version snapshot            | Best-effort-adjacent; failure surfaced, never blocks the write           |
| Activity / metrics emission | Best-effort-adjacent; surfaces errors, may lag the committed write       |
| Execution audit             | Redacted, best-effort; deliberately must never throw or block a decision |
| Runtime discovery file      | Convenience only; always revalidated before reuse                        |

Known partial-failure window: a write can commit and a late observability side effect then
fail, producing an error response for a succeeded write. Callers should reconcile via read,
not blind retry (writes are single-shot). See [failure-model](../reliability/failure-model.md).

## What deserves to be durable knowledge

| Durable                                 | Not durable                                 |
| --------------------------------------- | ------------------------------------------- |
| "Why we chose X over Y"                 | "What file existed last Tuesday"            |
| Constraints that survive refactors      | Current test counts, versions, line numbers |
| Collaboration rules and ownership norms | Scratch notes for one task                  |
| Bug root-causes and fixes               | Unsupported assumptions                     |

The same test applies to both memory and this resource layer: _would this still be true and
useful after a substantial refactor?_

## Reset: the only deletion path

Destructive cleanup is restricted to **escalating reset levels** with confirmation codes
and mandatory logging. Nothing else removes persistent state; lifecycle and locks expire
lazily instead.

## Evidence

- `src/core/database/sqlite/connection.js` — WAL/foreign-keys/busy-timeout pragmas
- `utils/resetEngine.js` — confirmation-gated deletion + logging
- `src/core/session/` + `server.js` — runtime file validation (PID/port probes)
- `src/core/execution/audit.js` — redacted best-effort audit invariant
- `agent-instruction.js` — memory storage rules (durable knowledge only)

**Status:** Confirmed (tiers, guarantees, reset semantics).
