---
title: Resource Index — Durable Architectural Knowledge
category: index
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
  - contributors
last_reviewed: 2026-10-21
---

# Local-MCP-Memory Resource Layer

This directory is the project's **durable architectural memory layer**: a collection of
knowledge documents about what Local-MCP-Memory is, why it exists, how its concepts relate,
what must never break, and how to reason about changes safely.

It is written to survive substantial refactoring. When implementation details change, the
concepts, invariants, and decisions recorded here should still be true — or be deliberately
revised through the process in [Change Guidelines](governance/change-guidelines.md).

## Purpose

- Teach future AI agents and maintainers **how to think about the system**, not where files live.
- Preserve design rationale that is otherwise only recoverable from scattered comments.
- Make architectural invariants explicit so they are not broken by accident.
- Give one canonical vocabulary ([Terminology](foundation/terminology.md)) for all project writing.

## What belongs in `resources/`

- Concepts, invariants, contracts, and lifecycle models
- Architectural decisions and their reasoning (when recoverable)
- Collaboration, security, and reliability semantics
- Terminology and evidence-backed subsystem responsibilities
- Guidance for reasoning about and changing the system

## What does NOT belong here

- API references, generated tool listings, dependency inventories
- Current versions, test counts, route paths, line numbers, directory layouts
- Temporary status, TODOs, issue numbers, deployment URLs
- Session-specific findings or reports (those live in `.workspace/reports/`)
- Anything better captured by source code (executable truth) or tests (behavioral evidence)

Volatile facts may appear only when necessary, labeled **(implementation-specific)** or
dated as an observation.

## Documentation roles

| Artifact              | Role                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `README.md`           | What the project is and how to get started                          |
| `docs/`               | Human-facing technical/product documentation (GitHub Pages)         |
| **`resources/`**      | Durable architectural knowledge and reusable system context         |
| Source code           | Executable truth — wins over any document on conflict               |
| Tests                 | Behavioral evidence — claims marked Confirmed are traceable to them |
| `.workspace/reports/` | Append-only historical session evidence (not durable knowledge)     |

If a resource contradicts the code, **the code is right**: fix the resource (see
[Change Guidelines](governance/change-guidelines.md)).

## Categories and resources

### [foundation/](foundation/) — What the project fundamentally is

| Resource                                                          | Description                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [project-purpose.md](foundation/project-purpose.md)               | The problem the system solves and why isolated agent memory is insufficient                    |
| [system-philosophy.md](foundation/system-philosophy.md)           | Core beliefs: persistent context, coordination over isolation, soft coordination, traceability |
| [terminology.md](foundation/terminology.md)                       | Canonical glossary — the single source of project vocabulary                                   |
| [design-principles.md](foundation/design-principles.md)           | How engineers are expected to build within this system                                         |
| [ai-agent-reading-guide.md](foundation/ai-agent-reading-guide.md) | Step-by-step reasoning flow for an agent entering an unfamiliar repository                     |

### [architecture/](architecture/) — Conceptual system structure

| Resource                                                                    | Description                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [system-architecture.md](architecture/system-architecture.md)               | Layered view of transports, engines, and persistence                     |
| [component-responsibilities.md](architecture/component-responsibilities.md) | Per-subsystem purpose, owned state, and explicit non-responsibilities    |
| [data-flow.md](architecture/data-flow.md)                                   | How reads, writes, and events move through the system                    |
| [context-model.md](architecture/context-model.md)                           | Conceptual entity relationships, identifiers, scoping, and derived state |
| [extensibility.md](architecture/extensibility.md)                           | Feature flags, plugins, tool registration, and safe extension points     |

### [memory/](memory/) — The persistent knowledge store

| Resource                                                    | Description                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [memory-model.md](memory/memory-model.md)                   | What memory and context are, how records are shaped, scoped, and linked        |
| [memory-lifecycle.md](memory/memory-lifecycle.md)           | Lifecycle states, promotion/decay, versioning, and conflict-driven deprecation |
| [context-retrieval.md](memory/context-retrieval.md)         | Search, ranking, connected-context graph expansion, retrieval side effects     |
| [knowledge-persistence.md](memory/knowledge-persistence.md) | Ephemeral vs persistent vs durable knowledge; what deserves to be stored       |

### [collaboration/](collaboration/) — Humans and agents working together

| Resource                                                                   | Description                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [human-agent-collaboration.md](collaboration/human-agent-collaboration.md) | The warn-and-coordinate model and why humans are never hard-blocked           |
| [multi-agent-coordination.md](collaboration/multi-agent-coordination.md)   | Concurrent actors, ownership, claim-once work, overlap avoidance              |
| [resource-locking.md](collaboration/resource-locking.md)                   | Soft advisory locks: semantics, expiry, and what locks deliberately do not do |
| [activity-model.md](collaboration/activity-model.md)                       | Append-only activity stream as the shared, observable project timeline        |
| [conflict-handling.md](collaboration/conflict-handling.md)                 | The three conflict mechanisms and the never-silently-smooth rule              |

### [agents/](agents/) — Actor identity and presence

| Resource                                              | Description                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| [agent-model.md](agents/agent-model.md)               | Agent identity, registration, capabilities, and lifecycle states      |
| [heartbeat-model.md](agents/heartbeat-model.md)       | Presence derivation, staleness thresholds, and lazy refresh semantics |
| [agent-capabilities.md](agents/agent-capabilities.md) | Capability declaration and capability-based task routing              |

### [projects/](projects/) — Project identity and intelligence

| Resource                                                  | Description                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| [project-identity.md](projects/project-identity.md)       | How project/agent identity is resolved and why the hierarchy exists      |
| [project-descriptors.md](projects/project-descriptors.md) | The baseline project document: content, singleton semantics, evolution   |
| [project-maps.md](projects/project-maps.md)               | Reusable structural knowledge about a codebase, distinct from raw source |

### [orchestration/](orchestration/) — Work coordination

| Resource                                                                 | Description                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [task-model.md](orchestration/task-model.md)                             | Task lifecycle, derived scheduling/priority state, assignment semantics |
| [issue-model.md](orchestration/issue-model.md)                           | Issue lifecycle, types, linking, and explicit resolution                |
| [orchestration-principles.md](orchestration/orchestration-principles.md) | Principles behind coordination: ownership, routing, division of labor   |

### [mcp/](mcp/) — Role in the MCP ecosystem

| Resource                                       | Description                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| [mcp-role.md](mcp/mcp-role.md)                 | What MCP provides, what this server adds, why coordination belongs in an MCP server |
| [tool-contracts.md](mcp/tool-contracts.md)     | Tool contract principles: validation, structured errors, warn-vs-block mechanics    |
| [server-registry.md](mcp/server-registry.md)   | External MCP server catalog: registration, health, proxying, credential handling    |
| [interoperability.md](mcp/interoperability.md) | Transports, protocol version, editor integration, proxied-tool naming               |

### [reliability/](reliability/) — Failure and validation philosophy

| Resource                                                         | Description                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [reliability-model.md](reliability/reliability-model.md)         | Timeouts, safe retries, circuit breakers, health, and what counts as success    |
| [failure-model.md](reliability/failure-model.md)                 | Failure taxonomy, stale state, partial-failure windows, and recovery mechanisms |
| [validation-principles.md](reliability/validation-principles.md) | Chaos/protocol validation concepts and what "verified" means in this repo       |

### [security/](security/) — Trust and protection

| Resource                                                                    | Description                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [security-model.md](security/security-model.md)                             | Security philosophy: fail-closed defaults, redaction, least privilege, auditability |
| [authentication-authorization.md](security/authentication-authorization.md) | Authentication vs authorization concepts and the local-first trust stance           |
| [trust-boundaries.md](security/trust-boundaries.md)                         | The system's boundaries and the rules each boundary enforces                        |

### [governance/](governance/) — Rules for staying true to the architecture

| Resource                                                            | Description                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [invariants.md](governance/invariants.md)                           | Statements that must remain true across implementations, with enforcement evidence |
| [architectural-decisions.md](governance/architectural-decisions.md) | Significant decisions: context, choice, trade-offs, revisit criteria               |
| [change-guidelines.md](governance/change-guidelines.md)             | How to change the system without violating its architecture                        |

## Recommended reading order (new AI agent)

1. [project-purpose.md](foundation/project-purpose.md) → [system-philosophy.md](foundation/system-philosophy.md)
2. [terminology.md](foundation/terminology.md) — adopt this vocabulary before reading further
3. [invariants.md](governance/invariants.md) — know the non-negotiables early
4. [system-architecture.md](architecture/system-architecture.md) + [component-responsibilities.md](architecture/component-responsibilities.md)
5. The domain resource for your task (memory / collaboration / orchestration / mcp / …)
6. [ai-agent-reading-guide.md](foundation/ai-agent-reading-guide.md) — the full before-work flow
   (descriptor → memory → tasks/activity → locks → work → validate → record)

## Evidence and confidence convention

Every non-trivial claim belongs to one of three levels:

- **Confirmed** — directly supported by source code, tests, schema, or configuration
- **Inferred** — strong architectural inference from multiple pieces of evidence
- **Unknown** — repository evidence is insufficient; stated as such, never guessed

Key claims are marked inline; each resource ends with an **Evidence** section listing a
small number of stable file references (deliberately without line numbers, which go stale).

## Rules for updating resources

1. Bump `last_reviewed` (YYYY-MM-DD) only when the file is actually reviewed against code.
2. When a decision changes, update [architectural-decisions.md](governance/architectural-decisions.md)
   and any resource that described the old behavior — in the same change.
3. When an invariant is intentionally retired or added, update
   [invariants.md](governance/invariants.md) **and** [change-guidelines.md](governance/change-guidelines.md).
4. Never convert a volatile fact into a durable claim; label it `(implementation-specific)`.
5. Keep links relative; keep terminology consistent with [terminology.md](foundation/terminology.md).
6. Historical reports in `.workspace/reports/` are append-only — do not rewrite them to match
   newer findings; supersede them with new reports or updated resources.

## Detecting stale information

- An **Evidence** link whose file no longer exists → the resource is stale until re-verified.
- Code contradicting a **Confirmed** claim → code wins; re-verify, then update the resource.
- Dated observations ("as of <month>") → re-check dates during reviews; they are findings, not truths.
- `last_reviewed` far in the past relative to a heavily changed subsystem → re-review that file first.
