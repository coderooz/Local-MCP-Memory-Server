---
title: Project Descriptors
category: projects
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Project Descriptors

The descriptor is the project's **baseline context document** — the first thing an agent
should read before making architectural assumptions. Its documented workflow position is
binding: _read the project descriptor → then search memory → then coordinate work._

## Purpose

A descriptor answers, at a glance: _what is this project, what stack does it use, what are
its goals, constraints, and rules?_ It prevents every new actor from re-deriving basics
and from violating constraints it was never told about.

## What belongs

| Belongs                               | Does not belong                               |
| ------------------------------------- | --------------------------------------------- |
| Purpose / what the project is         | Transient state (tasks, bugs, in-flight work) |
| Category (SaaS, library, …)           | Secrets, credentials, tokens                  |
| Tech stack overview                   | Volatile facts (versions, counts, URLs)       |
| Goals                                 | Full API documentation (→ docs)               |
| Constraints (hard limits, compliance) | Scratch notes (→ memory/tasks)                |
| Rules contributors/agents must follow | Anything better kept in code/config           |

## Storage model (special memory entry)

Descriptors are **not a separate table** — they are a _specially-typed, highest-importance
memory entry_, one per project (upsert semantics):

- **Singleton per project** — re-setting the descriptor updates in place; no duplicates.
- **Highest importance** — it always outranks ordinary memory in ranking, and gets an
  explicit search boost (see [context-retrieval](../memory/context-retrieval.md)).
- **Never decayed** — exempt from lifecycle decay; the project's baseline must not age out
  (see [memory-lifecycle](../memory/memory-lifecycle.md)).
- **Versioned** — descriptor changes capture version snapshots like any memory mutation,
  so descriptor evolution has history.

## Identity and evolution

- The descriptor is keyed to the resolved project identity
  ([project-identity](project-identity.md)); it is _about_ the project, not _of_ any
  agent — no agent owns it.
- It **evolves**: descriptors are expected to be updated when the project's purpose,
  stack, or rules change — they are baseline _and_ living document, not immutable charter.
  Staleness is detected by review, not by decay.
- Descriptor edits flow through the same collaboration semantics as other writes: risk
  evaluation warns on overlap; changes are versioned; meaningful updates land in activity.

## How agents should use it

1. **Read it first**, before architectural assumptions or heavy memory searches.
2. **Treat constraints/rules as binding** — they are the project's stated will.
3. **Update it** (via the descriptor tool, not ad-hoc memory writes) when it is missing or
   demonstrably stale — per the documented workflow.
4. **Never** stuff session findings into it; durable discoveries go to memory, work goes
   to tasks.

## Invariants

- Exactly one descriptor per project (upsert, never duplicated).
- Highest importance, descriptor search boost, decay exemption.
- Descriptor writes are versioned and collaboration-checked like any memory write.

## Evidence

- `utils/memoryEngine.js` — singleton upsert, special type/importance, decay exemption
- `server.js` — descriptor route through canonical write flow
- `agent-instruction.js` — descriptor-before-memory workflow + update-on-stale rule
- `tests/integration-modules-test.js` — descriptor behavior

**Status:** Confirmed (singleton, importance, exemption, workflow position); the exact
typed label and boost weight are **implementation-specific**.
