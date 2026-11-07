---
title: Terminology — Canonical Glossary
category: foundation
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
  - contributors
last_reviewed: 2026-10-21
---

# Terminology

Canonical vocabulary for this project. Use these senses in all resources, docs, commits,
and issue text. Where a word has more than one technical sense in this system, the senses
are separated explicitly.

## Core knowledge terms

**Memory**
The persistent, project-scoped knowledge store. Holds durable, reusable knowledge
(decisions, constraints, patterns, architecture, bugs, collaboration rules). Implemented as
memory records with ranking, lifecycle, and version history.

**Context (memory entry)**
A single record within memory. In the schema it is a row in the contexts collection; in
tooling it is what `store_context` creates. "Context" also appears in compound terms
below — always disambiguate by prefix.

**Connected context (context graph)**
A memory entry expanded through its explicit links: related memory, tasks, issues, actions,
versions, related agents, and the project descriptor. The graph is _explicit_ — links are
stored on records, not derived by inference.

**Knowledge**
Information worth persisting beyond the current session (see
[knowledge-persistence](../memory/knowledge-persistence.md) for the ephemeral/persistent/
durable distinction).

## Project intelligence terms

**Project identity**
The resolved `(project, agent, scope)` triple that anchors every read and write. Resolved
through a strict hierarchy (project files → global config → environment → fallback). See
[project-identity](../projects/project-identity.md).

**Project descriptor**
The singleton baseline document describing a project: purpose, category, tech stack, goals,
constraints, rules. Stored as a specially-typed, highest-importance memory entry.

**Project map**
Reusable structural knowledge about a codebase — per-path entries with summaries,
dependencies, exports, key details, and relationships. Distinct from raw source code: it
stores _understanding_, not content.

## Coordination terms

**Task**
A unit of shared work with explicit status, ownership, priority, and dependencies. The
coordination backbone: multi-step or shared work should be a task.

**Issue**
A tracked observation — bug, note, blocker, or insight — linked to memory and tasks,
resolved explicitly when no longer active.

**Activity**
An append-only entry in the project's near-real-time timeline: decisions, claims, updates,
warnings. The shared observability surface for humans and agents.

**Message**
A persistent, pull-based inter-agent note (info/warning/handoff/status), addressed to a
specific agent or broadcast (`to_agent: null`).

**Resource lock (soft lock)**
An advisory claim on a shared resource (file, module, task, …) with an expiry. Warns and
coordinates; never gates data writes.

**Coordination**
The discipline of keeping concurrent actors aligned: ownership, locks, warnings, activity,
handoffs. Contrast with _control_ — this system coordinates, it does not enforce.

**Conflict**
Has three distinct senses in this system (see [conflict-handling](../collaboration/conflict-handling.md)):

1. **Overlap conflict** — an optimistic-concurrency mismatch (expected version/timestamp
   differs) → _warning_, write proceeds.
2. **Content conflict** — two memory entries share a key but differ in content → the lower-
   ranked one is _deprecated_ automatically (resolution order: importance, then recency).
3. **Contention** — a lock is held by another owner or a task is already claimed → _the
   specific operation is refused_.

## Actor terms

**Agent**
Any actor operating through the system, identified by a stable agent id. Humans interact
through the dashboard/API and are recorded as actors too; the system does not authenticate
human vs agent on coordination routes (see [trust-boundaries](../security/trust-boundaries.md)).

**Registration**
The idempotent upsert that creates/refreshes an agent's registry record (identity, role,
capabilities, status).

**Heartbeat**
A liveness signal updating `last_seen`. Presence is _derived_ from last-seen age, not from
a persistent connection.

**Capability**
A declared skill used for routing work (capability-aware auto-assignment). Distinct from
_permission_ (an authority to act).

**Status (agent)**
Derived presence state: `active`, `idle`, or `offline` — recomputed lazily from last-seen
age and current task, not trusted from callers.

## State and scoping terms

**Scope (memory visibility)**
One of `private` (owning agent only), `project` (same project), `global` (everyone).
Orthogonal to _session scope_.

**Session scope**
A per-session visibility filter (`sessionId` + agent + project) used for session isolation.
Two different mechanisms share the word "scope" — always qualify which one you mean.

**Lifecycle (memory)**
Record state: `draft → active → deprecated → archived`. Decay relabels lifecycle; it never
deletes.

**Version**
On a record: a monotonically increasing integer bumped by every accepted mutation. In
history: an immutable snapshot row capturing prior state before a change. (Version numbers
are per-record, not global.)

**Derived state**
Values the system computes rather than trusts: priority scores, schedule readiness, agent
status, effective task status after dependency evaluation.

**Feature flag**
Configuration gate (e.g. registry, integration features, execution sandbox) controlling
which tools/behaviors are exposed. Defaults are part of the security posture.

**MCP (Model Context Protocol)**
The protocol this server implements to expose tools to AI clients. In this repo, "MCP
server" (singular, internal) means _this_ server; "MCP servers" (plural, registry) means
_external_ servers registered and proxied through it — qualify which.

**Chaos validation**
Load/protocol stress harnesses that produce a PASS/FAIL release verdict covering protocol
integrity, tool discovery/execution, session isolation, and error behavior. See
[validation-principles](../reliability/validation-principles.md).

**Reset levels**
Escalating cleanup tiers (minor → severe) for controlled data removal; severe operations
require a literal confirmation code and all resets are logged.

## Evidence

- `core/mcp/models.js` — enums: scope, lifecycle, statuses, task/issue/message shapes
- `agent-instruction.js`, `BEHAVIOR.md` — coordination and memory vocabulary
- `src/core/mcp-registry/` — MCP-server-registry terminology
- `scripts/chaos-test.js` — chaos gate vocabulary

**Status:** Confirmed (definitions match schema enums and documented usage); "human vs agent
not distinguished on coordination routes" is Confirmed via code inspection.
