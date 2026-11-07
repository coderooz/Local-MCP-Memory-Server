---
title: Activity Model
category: collaboration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Activity Model

The activity stream is the project's **append-only, near-real-time timeline** — the shared
observability surface that makes parallel work legible to every actor.

## Purpose

- **Visibility**: what did the other agent/human just do? (documented workflow step:
  _"Check activity when coordination matters"_)
- **Traceability**: decisions, claims, updates, and warnings leave a durable record.
- **Implicit audit**: many operations record themselves as a side effect, so the timeline
  stays honest even when actors forget to narrate.

## What gets recorded

| Category      | Examples                                                                |
| ------------- | ----------------------------------------------------------------------- |
| Collaboration | Lock acquire/release, conflict warnings materialized, ownership claims  |
| Orchestration | Task creation, assignment, status transitions, completion, reassignment |
| Agents        | Registrations, heartbeats, status changes                               |
| Knowledge     | Memory/descriptor/map updates (meaningful state changes)                |
| Reset         | Cleanup operations (all reset levels are logged)                        |
| Explicit      | Actors deliberately announcing intent ("starting migration X")          |

A useful rule from the system's own operating instructions: **record meaningful activity**
when making decisions, claiming locks, or coordinating work — the stream is only as good
as what actors put into it, plus what operations auto-record.

## Warnings become timeline entries

Conflict warnings are **materialized, not ephemeral** ([conflict-handling](conflict-handling.md)):
a warning raised during a write becomes (1) `warnings[]` in the response, (2) an activity
row, (3) a `conflictsWith` link on the record, (4) a metric increment. The timeline
therefore permanently answers "when did this overlap happen, and between whom?"

## Ordering, scoping, retention

- **Ordering**: newest-first by timestamp; entries carry actor, project, and type.
- **Scoping**: entries are project-scoped; the stream serves that project's coordination.
- **Retention**: append-only in normal operation — **no edits, no deletions, no
  backdating**. Cleanup happens only through confirmed reset levels (and resets are
  themselves recorded first).
- **No background jobs**: the stream is written inline during operations; there is no
  queue or asynchronous writer.

## Activity vs other history

| Mechanism                       | Role                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| Activity stream                 | Human/agent-readable timeline of _events_                         |
| Version snapshots               | Point-in-time _content_ history of individual records             |
| Metrics                         | Aggregate counters derived from the same events                   |
| Execution audit (opt-in domain) | Redacted, best-effort _execution_ trace, stricter redaction rules |

These are complementary: activity answers "what happened?", versions answer "what did it
look like before?", metrics answer "how often?".

## Anti-patterns

- Reading the stream as an enforcement mechanism (it observes; it does not block).
- Logging secrets or credential material into activity content (warnings/messages are
  recorded as authored — do not author secrets into them).
- Expecting the stream to be complete for _decisions that were never recorded_ — the
  implicit trail covers operations, not thoughts; record decisions explicitly.
- Backfilling or rewriting history — history is append-only; corrections are new entries.

## Invariants

- Activity is append-only; no in-place edits or deletions outside confirmed resets.
- Every reset operation is itself recorded.
- Warnings raised by writes are materialized into the stream (never silently dropped).
- Entries carry actor + project attribution stamped at write time.

## Evidence

- `utils/activityTracker.js` — append-only write path, auto-recording hooks
- `server.js` — warning materialization into activity
- `utils/resetEngine.js` — reset logging
- `agent-instruction.js` — activity inspection/recording rules for agents

**Status:** Confirmed (append-only, materialization, auto-record categories); retention
beyond reset is **Unknown** by design (no archival mechanism exists).
