---
title: Project Identity
category: projects
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Project Identity

Every read and write in this system is anchored to a resolved
`(project, agent, scope)` triple. How that triple is resolved — and why the hierarchy is
ordered — is foundational.

## Why identity exists

- **Isolation**: project state (memory, tasks, locks, activity) is logically scoped per
  project inside one shared storage file.
- **Continuity**: future actors must find the same project's state under the same identity
  across sessions, machines, and agents.
- **Attribution**: every record answers "which project, which actor, under what scope."

## Resolution hierarchy (strict order)

```text
1. Project-level marker file   (.mcp-project / .mcp-project.json in the project root)
2. Global user config          (~/.mcp/config.json)
3. Environment variables       (MCP_PROJECT / MCP_AGENT)
4. Fallback                    → STOP and prompt for setup
```

Properties (Confirmed):

- **Project beats global beats environment.** A local marker file always wins — the
  project's own declaration is authoritative for that project.
- **First existing path wins**; the chain is deterministic.
- **Fallback is a refusal, not a guess**: with nothing resolvable, the system stops and
  asks for setup rather than inventing identity. Project rules are explicit: _never
  operate_ with `agent=unknown` or `project=default` — those are misconfigurations.
- **Name normalization**: project names are normalized (slug-like) so identities are
  stable regardless of how the name was typed.
- **Runtime discovery files** (the per-project file naming the running server's
  host/port/PID) are **derived from the project directory, not from environment** —
  deliberately, so two projects with similar config never collide on runtime state.
  These files are validated, never trusted blindly (PID + port are probed).

## Identity vs session

Identity and **session scope** are orthogonal:

| Axis             | Answers             | Governs                                                                                     |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| Project identity | Which project/actor | Logical scoping of all state                                                                |
| Session scope    | Which session       | Read/write isolation between concurrent sessions (strict mode rejects cross-session writes) |

Both are stamped onto records; see [context-model](../architecture/context-model.md).

## Strict vs fallback modes

- **Strict**: unresolved identity halts work (the documented, recommended stance).
- **Fallback**: some integration paths can proceed with degraded attribution — but any
  use of reserved fallback values is a defect to fix, not a mode to rely on.

## Stability expectations

What should remain stable across versions:

- The _concept_ of the hierarchy and its precedence order
- Project-name normalization (identity must not fork due to casing/spacing)
- The refusal-to-guess property of the fallback step

What is implementation-specific (may change):

- Exact marker file names and formats
- Global config location
- Environment variable names

## Invariants

- Identity is resolved from trusted sources in strict precedence; never asserted by
  callers where configuration exists.
- Unresolved identity stops work (fallback values are misconfigurations, not identities).
- Runtime discovery files derive from the project directory and are revalidated before use.

## Evidence

- `mcp-shim.js`, `src/core/session/` — resolution chain, runtime-file derivation + validation
- `agent-instruction.js` — the configuration hierarchy + never-unknown/default rule
- `core/config/project-config-loader.js` — marker/global/env loading, normalization
- `tests/multi-project-isolation-test.js` — scoping behavior downstream of identity

**Status:** Confirmed (hierarchy, refusal-on-fallback, runtime derivation); exact file
names/locations are **implementation-specific**.
