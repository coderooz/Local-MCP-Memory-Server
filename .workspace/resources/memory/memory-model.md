---
title: Memory Model
category: memory
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Memory Model

What memory and context _are_ in this system — conceptually, independent of physical tables.

## What memory is

Memory is the **persistent, project-scoped knowledge store**: durable, reusable understanding
that must outlive any single agent session. It is deliberately _not_ a scratchpad — project
rules restrict it to reusable knowledge (decisions, constraints, patterns, architecture,
bugs/fixes, collaboration rules); see [knowledge-persistence](knowledge-persistence.md).

A **context entry** (memory record) is one unit of that knowledge.

## Conceptual record shape

Every memory entry carries (Confirmed via schema + models):

| Aspect           | Content                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identity         | Opaque id (UUID-style)                                                                                                              |
| Content          | The knowledge itself, plus an optional summary                                                                                      |
| Type / namespace | Arbitrary label used for organization; one reserved subtype holds the [project descriptor](../projects/project-descriptors.md)      |
| Importance       | Ranking weight (highest reserved for the descriptor)                                                                                |
| Tags             | Free-form labels                                                                                                                    |
| Links            | Explicit arrays: related memory, tasks, issues, actions, versions, related agents — the **context graph** is stored, never inferred |
| Scope            | `private` (owning agent) / `project` / `global` — memory visibility, _not_ session scope                                            |
| Attribution      | Owning agent + project, stamped from **trusted server configuration**, never caller claims                                          |
| Version          | Per-record monotonic integer                                                                                                        |
| Lifecycle        | `draft → active → deprecated → archived` (see [memory-lifecycle](memory-lifecycle.md))                                              |
| Activity         | Created/updated timestamps; access counts                                                                                           |

## Universal persistence conventions

All domains (not just memory) share: opaque id, agent/project/session attribution, scope,
tags, metadata, version integer, timestamps. New domains inherit scoping for free by
following this shape — see [context-model](../architecture/context-model.md).

Storage is **embedded SQLite**: one database file with WAL, foreign keys on, busy timeouts,
and an FTS5 full-text index maintained by triggers and repaired at boot. Project isolation
is _logical_ (column-scoped), enforced and tested — not physical partitioning.

## How memory is stored

Writes follow the canonical flow ([data-flow](../architecture/data-flow.md)):

1. Input validation; identity injection from trusted config.
2. Collaboration risk check → **warnings only**, never a block for document writes.
3. **Version snapshot before mutation** (immutable history row capturing prior state,
   change reason, actor) — non-fatal if snapshot storage hiccups.
4. Primary write with version bump.
5. Observability side effects: activity row, metrics, event emission.

Content-duplicate detection runs on the update event: two entries sharing a key but
differing in content trigger automatic resolution — the lower-ranked entry is _deprecated_,
ordered by **importance, then recency**.

## How memory is retrieved

- **Search**: sanitized full-text pre-filter, then **application-side ranking** (keyword
  overlap, importance, recency, access frequency, lifecycle penalties, descriptor boost).
  Ranking is computed above storage, not inside SQL — see [context-retrieval](context-retrieval.md).
- **Full context by id**: the entry plus its connected context (link-graph expansion).
- **Connected context**: the explicit-link neighborhood — related memory, tasks, issues,
  actions, versions, agents, and the project descriptor.

Reads are not side-effect-free: hits increment access counters and can trigger lifecycle
re-evaluation.

## Scoping and isolation rules

- Anchor-based query filtering: private → own agent; project → same project; global → all.
- Unanchored reads (no agent/project anchor) intentionally skip the visibility filter so
  bare queries see everything the project wrote (documented design).
- Session scope is an orthogonal axis; strict session isolation rejects cross-session
  writes. Both axes are discussed in [context-model](../architecture/context-model.md).

## Persistence expectations

- **Primary write is decisive and single-attempt** (never auto-retried).
- **Version snapshot, activity, and metrics are best-effort-adjacent**: their failures
  surface (error response or surfaced telemetry) but must not corrupt the primary write
  path; a late failure can produce an HTTP error even though the row committed (known
  partial-failure window — [failure-model](../reliability/failure-model.md)).
- Deletion happens only via confirmed, logged reset levels — memory decay **relabels**, it
  never deletes.

## Key invariants (see [invariants](../governance/invariants.md))

- Project/agent attribution comes from trusted config; caller-asserted identity is never
  stored as authoritative.
- Version numbers increase monotonically per record; history rows are immutable.
- Overlap signals (expected version/timestamp mismatch) warn — the write proceeds, and the
  warning is materialized (activity + `conflictsWith` link + metric), never silenced.
- No silent disappearance of knowledge: no deletes outside confirmed resets.

## Evidence

- `src/core/database/sqlite/schema.js` — record columns, universal columns, FTS triggers
- `core/mcp/models.js` — entity shapes, scope enum, link arrays
- `utils/memoryEngine.js` — snapshot-first writes, conflict resolution, lifecycle hooks
- `server.js` — risk-check → write → warnings ordering on memory routes
- `tests/conflict-detection-test.js`, `tests/multi-project-isolation-test.js` — behavioral evidence

**Status:** Confirmed (shape, scoping, versioning, conflict semantics).
