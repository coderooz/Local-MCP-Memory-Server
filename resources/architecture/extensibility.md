---
title: Extensibility
category: architecture
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Extensibility

How the system is meant to grow: extension points, gating, and the rules for adding
capability without breaking contracts.

## Extension points

### 1. MCP tools (primary)

Tools are the product surface. Groups compose additively:

- **Base tools** — always present (memory, coordination, project intelligence, …).
- **Feature-gated tools** — exposed only when a feature flag enables the subsystem
  (integration tools, registry tools, execution tools).
- **Discovered (proxied) tools** — dynamic tools from connected external MCP servers,
  namespaced under a deterministic naming convention and dispatched to the proxy.

**Rules**: register additively; never modify an existing tool's contract in place; validate
inputs before dispatch; advertise only implemented capabilities; a new tool group gets its
own dispatch branch rather than hijacking another's.

### 2. Feature flags

Behavior toggles live in project configuration with **defaults that are part of the
security posture** (dangerous features default off — notably the execution sandbox).
Flag changes are configuration, not code, but flipping a flag changes the exposed tool
surface: treat flag defaults as architectural decisions (see
[architectural-decisions](../governance/architectural-decisions.md)).

### 3. External MCP servers (registry)

Register → connect → discover → health → proxy. External servers' tools become first-class
tools of _this_ server without code changes. This is the sanctioned way to integrate new
capabilities (Redis/knowledge/browser integrations follow the same flag-gated pattern).

### 4. Plugins

A plugin directory supports packaged extensions (e.g. emulator integration) loaded into the
HTTP surface. Plugins reuse existing routes/engines rather than adding parallel storage.

### 5. Events / listeners

In-process event emission (memory updates, task creation, session events) lets new
side-effects subscribe without editing write paths. Caveat: listeners run inline during
requests — keep them cheap and non-blocking (observability, not transactions).

### 6. Schema

Additive-only: new tables/columns/indexes with existence-gated migration. New domains get
their own tables plus the universal columns (id/agent/project/session/scope/tags/metadata/
version/timestamps) to inherit scoping for free.

## How to add a capability (pattern)

1. Decide the **domain state** it owns; reuse existing scoping/versioning conventions.
2. Expose via a tool (validated schema, structured errors, warn-vs-block per
   [design-principles](../foundation/design-principles.md)).
3. Gate behind a feature flag if it carries risk or heavy dependencies (default: off for
   risky, on for safe).
4. Emit activity/metrics for meaningful state changes (observability is part of the contract).
5. Register tests at the appropriate layer (targeted suite + chaos-relevant if protocol-
   facing) and document any new invariant in
   [invariants](../governance/invariants.md).

## What must not be extended casually

- **Auth semantics** — adding route protection inconsistently breaks the documented
  local-first model; see [authentication-authorization](../security/authentication-authorization.md).
- **Identity rules** — identity hierarchy changes ripple across every write.
- **The warn-vs-block boundary** — turning a warning into a block (or vice versa) is a
  collaboration-semantics change, requiring deliberate documentation updates.
- **Execution surface** — any host-execution fallback violates a foundational decision;
  only isolated backends are acceptable (fail-closed).
- **Protocol honesty** — advertising capabilities (e.g. list-changed notifications) before
  implementing them is explicitly disallowed by precedent.

## Divergence warning (current structural debt)

The repository maintains a second, currently-unwired service layer (domain services +
aspirational API routes) whose semantics diverge from the live layer on ownership,
idempotency, and optimistic concurrency. **Before extending coordination behavior, verify
which layer is wired**, and do not assume both layers agree. Consolidation is acknowledged
as planned work (roadmap phase for removing dual architecture). Status as of last review:
**Confirmed** existence; intended end-state **Unknown** pending that work.

## Evidence

- `mcp-server.js` — tool group composition + dispatch branches; capability advertisement
- `core/config/project-config-loader.js` — feature-flag defaults
- `tools/mcpRegistryTools.js`, `mcp-integration-tools.js` — gated tool groups
- `plugins/` — plugin surface
- `src/core/database/sqlite/schema.js` — additive migration pattern

**Status:** Confirmed.
