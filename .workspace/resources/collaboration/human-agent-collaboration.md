---
title: Human-Agent Collaboration
category: collaboration
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Human-Agent Collaboration

How humans and agents are meant to work together on shared project state — and why the
system **warns and coordinates rather than hard-blocks**.

## The core stance

Documented plainly in the project overview: _"This is designed to warn and coordinate, not
hard-block humans."_ This is **Confirmed** in code: collaboration-risk evaluation on
document writes computes warnings and lets the write proceed — the warning path is taken
by memory, descriptor, task, issue, and project-map routes alike.

The rationale: coordination state should make parallel work _visible and safe_, never take
the human's own project away from them. Advisory signals (locks, warnings, ownership) are
requests and notices — a human can always act; they should simply see the signals first.

## Humans are first-class actors

There is **no human/agent type distinction** on coordination routes (Confirmed): an actor
is an actor. Consequences:

- Ownership, locks, and activity entries do not differentiate who or what holds them.
- A human updating a task an agent "owns" produces an ownership _warning_, not an error —
  in the live service layer.
- Human-visible surfaces are the dashboard and the same HTTP API agents use; there is no
  separate human enforcement layer.

Identity _is_ stamped from trusted server configuration on the MCP path (agents cannot
assert false attribution); the HTTP layer inherently relies on client-claimed actors,
which is exactly why ownership there is advisory by construction — see
[trust-boundaries](../security/trust-boundaries.md).

## What the human gets

| Signal                          | Meaning                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `warnings[]` on write responses | Your write overlapped something (foreign lock, foreign ownership, changed-since-read version) |
| Activity stream                 | The shared timeline: who did what, when, including materialized warnings                      |
| Task ownership                  | Explicit `assigned_to` on shared work                                                         |
| Resource locks                  | "Someone claims to be working on this right now"                                              |
| Dashboard                       | Human window into memory, tasks, locks, activity                                              |

Warnings are **materialized, not ephemeral**: they become activity rows, `conflictsWith`
links on records, and metrics — a warning is a durable observation, not console noise.

## The hard-block exceptions (and only these)

Hard denial exists at correctness boundaries, never at collaboration boundaries:

1. **Lock acquisition against a foreign, unexpired owner** — claiming an already-claimed
   resource is refused (the lock API itself is the correctness boundary).
2. **Claim-once task races** — two concurrent claims; exactly one wins.
3. **Input validation failures** — invalid arguments rejected before execution.
4. **Destructive operations awaiting confirmation** — reset levels require explicit
   confirmation codes.

Everything else — document writes under overlap, ownership mismatches, version mismatches —
warns and proceeds. See [conflict-handling](conflict-handling.md) for the full mechanism map.

## Coordination behavior in practice

- **Prefer signals over ceremony**: inspect locks/activity before touching shared
  resources; acquire locks for the risky window; release when done.
- **Warn, don't fight**: if a human overrides an agent's claim, the warning is the
  feedback loop — no rollback, no lockout, but the overlap is on record.
- **Explicit ownership beats implicit politeness**: multi-step or shared work should be a
  task, not an ad-hoc effort (project rule: tasks are the coordination backbone).
- **Traceability is mutual**: both human and agent actions land in the same activity
  stream, so neither side works blind.

## Anti-patterns

- Treating advisory signals as either hard guarantees (they aren't) or ignorable noise
  (they aren't that either — they are coordination requests).
- Performing shared work with no ownership record and no lock, then relying on nobody
  having collided.
- Reading a warning and silently re-resolving it instead of recording the resolution.

## Evidence

- `README.md` — the warn-and-coordinate stance (explicit)
- `docs/app.js` — "Soft locks, not hard blockers"
- `server.js` — risk-check → write → warnings ordering (seven routes)
- `utils/collaborationEngine.js` — warn-only evaluation, warning materialization
- `agent-instruction.js` — advisory-signal judgment rules for agents

**Status:** Confirmed (stance, no-actor-distinction, hard-block list).
