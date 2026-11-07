---
title: Orchestration Principles
category: orchestration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Orchestration Principles

The reasoning behind tasks, issues, and work routing — the _why_ beneath
[task-model](task-model.md) and [issue-model](issue-model.md).

## 1. Work should be visible before it is important

Multi-step or shared work belongs in a task **before** it becomes a collision. The
documented agent workflow encodes this: inspect tasks/messages first to avoid duplicating
owned work — visibility is cheap after the fact and impossible retroactively.

## 2. Ownership is explicit or it doesn't exist

There is no implicit ownership. Work is owned through a recorded assignment, a claim, or
a lock — all inspectable. "I was probably working on that" is not a coordination state
the system can honor.

## 3. One owner, one task

Claim-once and single-assignee semantics exist because parallel ownership of one unit of
work is incoherent: two owners means two plans. If work genuinely splits, it becomes two
tasks with a dependency — explicit structure, not shared ambiguity.

## 4. Routing matches honest declarations

Capability auto-assignment trusts declarations ([agent-capabilities](../agents/agent-capabilities.md)).
The principle generalizes: **the coordination layer works to the extent actors advertise
honestly** — capabilities, statuses, blockers. Overclaiming degrades routing for everyone.

## 5. Scheduling means readiness, not clocks

There are no timers, deadlines, or scheduled transitions. "When can this run?" is
answered by dependency readiness; "how urgently?" by derived priority. Time pressure is a
human/agent judgment expressed through explicit updates (priority bumps, reassignment,
communication) — the system records those judgments; it does not simulate them.

## 6. Blockers are stated, not endured

A stalled task becomes `blocked` with a linked issue. Silent stalling is the failure mode
this design attacks: the timeline and the issue ledger should make stuck work _findable_,
which is what makes reassignment and help-seeking possible at all.

## 7. The four-store division of labor

```text
task   → work that must happen (owner + status)
issue  → observations worth tracking (open → resolved explicitly)
memory → durable knowledge (decisions, constraints, fixes)
activity → what happened (append-only timeline)
```

Cross-posting is fine and expected (a blocker is an issue _and_ a task status _and_
possibly memory once understood); confusion between the stores is not. Work in the wrong
store becomes invisible to the workflows that read the right one.

## 8. Orchestration is advisory coordination, not command-and-control

Auto-assignment proposes; explicit assignment decides; humans always outrank. The
orchestration surface applies the same warn-and-coordinate philosophy as the rest of the
collaboration layer ([human-agent-collaboration](../collaboration/human-agent-collaboration.md)) —
with hard refusal reserved for correctness boundaries (claim races, lock contention,
invalid input).

## Invariants (drawn from the models)

- Multi-step/shared work is represented as tasks; ownership and status are explicit.
- Exactly one owner per task; reassignment is explicit.
- Blockers and completions are recorded, not inferred from silence.
- Resolution (issues) and completion (tasks) require deliberate actor action.

## Evidence

- `agent-instruction.js` — task-first workflow, ownership/blocker update rules
- `utils/coordinationEngine.js` — the enforcement of the above semantics
- `README.md` — coordination-over-isolation framing

**Status:** Confirmed (principles map to documented rules + enforced semantics); §5's
"no clocks" characterization is Confirmed by absence of timers across entry points
(strong negative evidence).
