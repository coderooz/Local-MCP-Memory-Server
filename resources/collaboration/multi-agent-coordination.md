---
title: Multi-Agent Coordination
category: collaboration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Multi-Agent Coordination

How multiple agents stay aligned on shared project state. The operating assumption is
stated in the project's agent rules: _"Assume the user may edit files, tasks, or design
decisions while you work. Assume other agents may be reading or writing related project
state."_ Concurrency is the normal case, not the exception.

## Coordination primitives

| Primitive                                      | Question it answers                      |
| ---------------------------------------------- | ---------------------------------------- |
| [Tasks](../orchestration/task-model.md)        | Who owns which work? What's blocked?     |
| [Resource locks](resource-locking.md)          | Who claims this resource _right now_?    |
| [Messages](#messages-and-handoffs)             | What handoff/blocker is addressed to me? |
| [Activity](activity-model.md)                  | What just happened?                      |
| [Agent presence](../agents/heartbeat-model.md) | Which actors exist, and are they alive?  |
| [Conflict signals](conflict-handling.md)       | Did my write overlap someone else's?     |

## Ownership

- Ownership is **explicit**: tasks carry a single assignee; locks carry a single owner.
- Implicit ownership ("I started editing this file an hour ago") is not represented — the
  discipline is to claim explicitly (acquire lock / claim task) so others can see it.
- Ownership boundaries are respected by well-behaved agents: _if another actor owns the
  task or holds the resource lock, avoid overlap when possible, communicate clearly, and
  proceed only when the change is still justified_ (`agent-instruction.js`).

## Claim-once work

Task claiming implements **claim-once semantics**: a claim is a compare-and-set against
the task's current state; when two agents race, exactly one wins and the other is refused
(a hard-block exception — this is a correctness boundary, not a courtesy). This prevents
two agents from both believing they own the same unit of work.

Auto-assignment on task creation follows the same principle: a newly created task with
declared capabilities and no assignee is offered to one eligible agent, not broadcast as a
free-for-all — see [agent-capabilities](../agents/agent-capabilities.md).

## Capability-based routing

Work routes by **declared capability overlap**: a task requiring capabilities is only
auto-assigned to an agent whose declared capabilities cover them. This is the
multi-agent answer to "which actor should do this?" — honest capability advertisement is
a coordination contract, not marketing (see
[design-principles](../foundation/design-principles.md) §10).

## Messages and handoffs

A persistent **pull inbox** carries inter-agent notes: `info`, `warning`, `handoff`, and
`status` messages, addressed to a specific agent or broadcast (`to_agent: null`). Pull
semantics (recipients poll their inbox) keep the model simple and durable — no live
delivery requirement, no lost handoffs across restarts. Messages are the sanctioned way to
communicate ownership transitions and blockers without guessing who is listening.

## Presence and staleness

Coordination decisions exclude actors that are gone: presence is _derived_ from
last-seen age, and **offline agents are excluded from auto-assignment**. Staleness is
never trusted from callers — it is recomputed lazily. See
[heartbeat-model](../agents/heartbeat-model.md).

## Overlap avoidance workflow (the documented contract)

```text
inspect tasks/messages   → avoid duplicating owned work
inspect activity         → understand what others just did
inspect locks            → see active claims
acquire what you need    → claim explicitly
work                     → under your resolved identity
communicate              → handoffs/status via messages
release                  → locks, task updates, activity
```

## Structural divergence (important, Confirmed observation)

The repository contains two service layers with **different multi-agent semantics**:

- **Live layer** — document writes by a non-owner produce _warnings_; ownership is advisory.
- **Dormant layer** (unwired) — non-owner document updates are _blocked_ (hard rule).

The live, warn-based behavior is the one users experience today. The dormant layer is
aspirational and currently unreachable through either entry point. Agents reasoning about
coordination semantics should verify which layer a code path belongs to before extending
it — see [extensibility](../architecture/extensibility.md) and
[change-guidelines](../governance/change-guidelines.md).

## Invariants

- Claim-once: concurrent claims of the same task resolve to exactly one owner.
- Ownership and locks are single-holder (per project + resource / per task).
- Offline actors never receive new auto-assigned work.
- Overlaps are recorded, never smoothed (see [conflict-handling](conflict-handling.md)).

## Evidence

- `agent-instruction.js` — concurrency assumption, overlap-avoidance rules
- `utils/coordinationEngine.js` — claim-once, auto-assign, presence filtering
- `utils/collaborationEngine.js` (live) vs `src/domains/task/task.service.js` (dormant) —
  the warn-vs-block divergence
- `core/mcp/models.js` — message model (pull inbox, types, broadcast)
- `tests/multi-agent-coordination-test.js` — behavioral evidence

**Status:** Confirmed (primitives, claim-once, routing, divergence observation).
