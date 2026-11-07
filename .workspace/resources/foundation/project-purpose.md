---
title: Project Purpose
category: foundation
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Project Purpose

## The problem

AI agents traditionally run with **isolated, session-scoped memory**: when a session ends,
its understanding of the project disappears; when a second agent starts, it starts blind.
Humans coordinating with agents — and agents coordinating with each other — have no shared
record of what is being decided, who owns which work, or what changed recently.

That produces four recurring failures:

1. **Context amnesia** — every session re-derives project knowledge that was already learned.
2. **Silent collisions** — two actors edit the same state without noticing each other.
3. **Invisible work** — no one can see what an agent just did, claimed, or decided.
4. **No coordination state** — ownership, blockers, and handoffs live nowhere durable.

## What this system is

Local-MCP-Memory is a **SQLite-backed coordination layer exposed over the Model Context
Protocol (MCP)**. It gives every participant — human or agent, across sessions and projects —
one persistent shared state containing:

- **Memory**: durable, ranked, versioned knowledge about the project
- **Project intelligence**: a project descriptor (identity and rules) and project maps (structure)
- **Coordination state**: tasks, issues, messages, soft locks, ownership
- **Observability**: an append-only activity stream and collaboration metrics

It is deliberately _local-first_: embedded storage, no external database service, and a
localhost HTTP backend behind an MCP stdio server — coordination state lives next to the
project, not in a hosted service.

## Why ordinary isolated memory is insufficient

- **Persistence across sessions**: knowledge must outlive any single agent process.
- **Shared, not private**: a second agent and the human must read the same state.
- **Coordination, not just storage**: memory alone cannot express _who is doing what now_.
- **Traceability**: decisions and actions need an observable history, not overwrite-in-place.

## Why human + multi-agent collaboration requires coordination state

Parallel work needs answers memory cannot provide:

| Question                                          | Coordinated by                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| What is this project, and what rules govern it?   | [Project descriptor](../projects/project-descriptors.md)                           |
| What did we already learn?                        | [Memory](../memory/memory-model.md)                                                |
| Who owns this work? What's blocked?               | [Tasks](../orchestration/task-model.md), [issues](../orchestration/issue-model.md) |
| Is someone else touching this resource right now? | [Soft locks](../collaboration/resource-locking.md)                                 |
| What just happened?                               | [Activity stream](../collaboration/activity-model.md)                              |
| Which actors exist and are they alive?            | [Agent model](../agents/agent-model.md)                                            |

## Design stance (summary)

The system upgrades the "agent executes, user waits" flow into a **parallel collaboration
model**: agents work alongside humans and other agents, surfaced through warnings, ownership,
and shared visibility rather than hard locks and blocked humans. See
[system-philosophy](system-philosophy.md) and
[human-agent-collaboration](../collaboration/human-agent-collaboration.md).

## Scope boundaries

- It is **not** a general database, a chat product, or a hosted multi-tenant service.
- It is **not** a code executor by default — sandboxed execution is an opt-in, fail-closed,
  isolated extension (see [security-model](../security/security-model.md)).
- It does **not** replace source control: it records knowledge and coordination, not history
  of code artifacts.

## Evidence

- `README.md` — overview, feature list, collaboration stance ("warn and coordinate, not hard-block humans")
- `package.json` — embedded stack, entry points (`mcp-server.js`, `server.js`)
- `docs/app.js`, `docs/reliability.md` — documented product concepts (soft locks, reliability gates)
- `agent-instruction.js`, `BEHAVIOR.md` — stated operating philosophy

**Status:** Confirmed (purpose and stance); Inferred (failure framing is synthesized from
documented motivation, not a single source).
