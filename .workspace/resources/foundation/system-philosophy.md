---
title: System Philosophy
category: foundation
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# System Philosophy

Core beliefs the implementation is built around. Each is **Confirmed** unless marked
otherwise; evidence is cited inline or in the Evidence section.

## 1. Persistent context beats isolated memory

Knowledge belongs to the **project**, not to a session. Memory, descriptors, maps, tasks,
and activity all persist in embedded SQLite and are project-scoped, so any future actor can
pick up where previous ones left off.

## 2. Coordination, not isolation

The system exists to let humans and multiple agents work **in parallel** on shared state.
It assumes concurrency as the normal case: _"Assume the user may edit files, tasks, or design
decisions while you work. Assume other agents may be reading or writing related project
state."_ (`agent-instruction.js`)

## 3. Soft coordination over hard blocking

Signals (warnings, ownership, locks, activity) inform and coordinate; they do not remove
human control. Documented explicitly: _"This is designed to warn and coordinate, not
hard-block humans."_ (`README.md`) and _"Soft locks, not hard blockers"_ (`docs/app.js`).
Hard denial exists only where correctness demands it (lock acquisition, claim-once tasks,
input validation) — see [conflict-handling](../collaboration/conflict-handling.md).

## 4. Explicit state, observable work

Coordination state is written down, not implicit: ownership, blockers, decisions, and
handoffs are records. The append-only activity stream plus materialized collaboration
warnings make work **legible to everyone** after the fact.

## 5. Non-destructive collaboration

The system prefers **relabeling over deletion**:

- memory mutations snapshot prior state into version history before writing;
- lifecycle decay deprecates/archives rather than deletes;
- content conflicts deprecate the loser instead of overwriting;
- destructive cleanup exists only behind explicit, escalating reset confirmation.

## 6. Conflicts are surfaced, never smoothed

_"Detect conflicts explicitly; never smooth them over silently… If a resource changed since
your last known version or timestamp, treat that as meaningful."_ (`agent-instruction.js`)
Warnings become durable records (activity rows + `conflictsWith` links + metrics).

## 7. Recoverability and traceability

- Runtime discovery files are validated, never trusted blindly (PID + port probes).
- Full-text indexes self-repair on boot; schema evolution is additive-only.
- Actions, versions, activity, and (in the execution domain) redacted audit rows provide
  traceability for what changed and why.

## 8. Fail-closed security, advisory convenience

Dangerous capabilities default **off** and refuse to run without verified isolation
(execution sandbox); credentials fail closed when the encryption key is absent; but
day-to-day coordination remains advisory so humans are never locked out of their own
project. See [security-model](../security/security-model.md).

## 9. Local-first, embedded, low-friction

No external database service is required; one process pair (MCP stdio server + HTTP
backend) plus an optional dashboard. Coordination should be cheap enough to always be on.

## 10. Durable knowledge is earned, not accumulated

Memory is for reusable knowledge — decisions, constraints, patterns, architecture, bugs,
collaboration rules — not trivia or scratch notes (`agent-instruction.js` MEMORY RULES).
Lifecycles and ranking keep signal high as volume grows.

## Evidence

- `README.md` — collaboration stance, feature philosophy
- `agent-instruction.js`, `BEHAVIOR.md`, `MCP_AGENT_INSTRUCTIONS.md` — stated operating rules
- `docs/app.js` — soft-lock advisory rationale
- `utils/memoryEngine.js` — version-before-write, decay-not-delete behavior
- `utils/collaborationEngine.js`, `server.js` — warn-not-block paths
- `src/core/execution/` header comments — fail-closed sandbox philosophy

**Status:** Confirmed (each principle is traceable to code or documentation as cited).
