---
title: Issue Model
category: orchestration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Issue Model

Issues are the system's **explicit observation ledger**: bugs, notes, blockers, and
insights tracked to resolution. Their contract: _use issues for bugs, notes, blockers,
and insights; link them to memory and tasks; resolve them explicitly when no longer
active._

## Lifecycle

```text
open  →  resolved
```

Two states, deliberately minimal:

- **open** — the observation is active and relevant.
- **resolved** — explicitly closed by an actor _because it is no longer active_.

There is no automatic expiry, no staleness-driven closure, and no bulk dismissal — an
issue leaves the active set only through explicit resolution, which is recorded (activity

- timestamp + resolving actor).

## Types

| Type      | Use                                                          |
| --------- | ------------------------------------------------------------ |
| `bug`     | Something is broken (root-cause worth tracking)              |
| `note`    | Durable observation worth recording                          |
| `blocker` | Something prevents progress (often linked to a blocked task) |
| `insight` | Discovery that may redirect work                             |

Types are labels, not workflows — all share the same open→resolved lifecycle.

## Linking

Issues carry **advisory links** to memory and tasks (stored link arrays, never inferred —
see [memory-model](../memory/memory-model.md)). Typical shapes:

- A `blocker` issue linked to the task it blocks
- A `bug` issue linked to the memory entry describing the root cause
- An `insight` issue linked to the tasks it will redirect

Links are advisory: they organize; they do not create referential lock-step. Issues and
tasks remain independent lifecycles — resolving a task does not resolve its linked issues,
and vice versa.

## Division of labor

| If you are recording…                       | Use                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Work to be done (multi-step/shared)         | [Task](task-model.md)                                                  |
| An observation (broken/interesting/blocked) | Issue                                                                  |
| Durable knowledge (decision/constraint/fix) | [Memory](../memory/memory-model.md)                                    |
| An event that happened                      | [Activity](../collaboration/activity-model.md) (automatic or explicit) |

An insight issue often _becomes_ memory once understood; a bug issue often spawns a task
once scoped. Issues are the hinge between noticing and doing.

## Semantics

- **Create/resolve/update** flow through the canonical write flow: validation,
  collaboration warnings (live layer), versioning, activity recording.
- **Resolution is never silent**: the resolving actor, timestamp, and event are recorded.
- **Cross-project isolation** applies as everywhere: issues are project-scoped.

## Invariants

- Issues resolve only explicitly (never auto-closed).
- Resolution records actor + time + activity entry.
- Links to tasks/memory are advisory, stored explicitly, never inferred.

## Evidence

- `core/mcp/models.js` — issue model, statuses, types
- `utils/*` issue routes in `server.js` — canonical write flow participation
- `agent-instruction.js` — issue usage rules (create/link/resolve explicitly)
- `tests/integration-modules-test.js` — issue lifecycle behavior

**Status:** Confirmed (two-state lifecycle, explicit resolution, advisory links); the type
vocabulary is **open** (the four documented types are conventional, not enforced).
