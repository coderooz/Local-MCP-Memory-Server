---
title: Component Responsibilities
category: architecture
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Component Responsibilities

Per-subsystem contract: purpose, state owned, and explicit **non-responsibilities** (the
part most easily violated during refactors). Not tied to file names — see
[system-architecture](system-architecture.md) for entry points.

## MCP transport / tool layer

- **Purpose**: speak MCP (stdio JSON-RPC) — initialize, tool discovery, tool dispatch.
- **Inputs**: JSON-RPC requests; **Outputs**: JSON-RPC responses on stdout only.
- **State owned**: none (stateless protocol translation), plus in-process reliability state
  (circuit state, health cache, pending queues).
- **Must not**: execute business logic, persist data, authenticate callers (local stdio
  trust), retry writes, advertise unimplemented capabilities.

## HTTP API layer

- **Purpose**: single business surface for MCP layer, dashboard, and external HTTP clients.
- **Inputs**: REST-ish JSON requests; **Outputs**: `{success, …, warnings[]}` or
  `{error}` bodies; records activity/metrics as side effects.
- **State owned**: request/session context, rate-limit counters (in-process).
- **Must not**: trust client-asserted identity where config exists; hide overlap signals;
  couple route logic to storage internals.

## Persistence (embedded SQLite)

- **Purpose**: durable state for every domain; full-text search; referential backstops.
- **Inputs**: parameterized queries via collection/query-builder; **Outputs**: rows,
  match results, constraint errors (duplicate-key compatibility codes).
- **State owned**: the database file — schema, indexes, triggers, WAL mode.
- **Must not**: run domain rules (ranking, lifecycle, scoring live above it), perform
  destructive migrations, expose raw credentials.

## Memory engine

- **Purpose**: memory CRUD semantics — version snapshots, lifecycle evaluation, content-
  conflict resolution, descriptor upsert, connected-context expansion, search ranking.
- **State owned**: memory records, version history, conflict links.
- **Must not**: delete records as a side effect (decay relabels only), block writes on
  overlap (it warns), store coordination state (that belongs to tasks/issues/activity).

## Collaboration engine

- **Purpose**: advisory coordination — soft locks, risk evaluation (foreign lock / foreign
  ownership / expected-version mismatch), warning materialization.
- **State owned**: resource locks.
- **Must not**: gate document writes (advisory by design), enforce authentication, keep
  locks beyond expiry (lazy cleanup), hold state across projects.

## Coordination engine

- **Purpose**: agent presence derivation, task schedule/priority derivation, capability
  auto-assignment, claim-once semantics.
- **State owned**: none directly (derives over agent/task rows).
- **Must not**: invent deadlines (scheduling = dependency readiness + priority), assign to
  offline agents (auto-assign filters them), replace explicit human assignment.

## Activity + metrics

- **Purpose**: append-only observability — the shared timeline (activity) and collaboration
  health counters (metrics).
- **State owned**: activity rows (append-only), metric rows.
- **Must not**: be mutated or backdated in normal operation (cleanup only via confirmed
  resets), carry secrets (warnings are recorded redaction-free of credentials by design of
  their content — do not log credentials into them), serve as a coordination _enforcement_
  mechanism.

## Reset engine

- **Purpose**: controlled, escalating cleanup with confirmation and logging.
- **State owned**: nothing (mutates other domains under rules).
- **Must not**: delete without level-appropriate confirmation, skip logging, be invoked
  implicitly by any normal path.

## Auth subsystem

- **Purpose**: authenticate humans/clients (JWT, API keys), roles/permissions, credential
  hashing.
- **State owned**: user/key material (file-backed).
- **Must not**: leak key material (listing is redacted), gate what it is not configured to
  gate (do not _assume_ routes are protected — check), confuse authentication with actor
  identity on coordination routes.

## MCP registry

- **Purpose**: catalog, connect, discover, health-check, and JSON-RPC proxy external MCP
  servers; surface their tools dynamically.
- **State owned**: server rows incl. encrypted credentials; in-memory discovered-tool cache
  and per-server breaker state.
- **Must not**: return unmasked credentials on any external surface, proxy without
  fail-closed decryption, treat stdio servers as HTTP-proxiable.

## Session layer

- **Purpose**: session lifecycle and scope filtering for read/write isolation.
- **State owned**: session registry, per-session stats.
- **Must not**: be assumed present on every route (registered routes differ), replace
  project scoping (orthogonal mechanisms).

## Dashboard + docs site

- **Purpose**: human visibility (SPA over the same API) and published documentation.
- **Must not**: become a second business-logic surface (it calls the same routes), be
  confused with the docs site generator (different asset sets).

## Execution sandbox _(opt-in, Phase 1)_

- **Purpose**: durable job lifecycle — policy computation, hash-bound approvals, state
  machine, redacted best-effort audit — for future isolated script execution.
- **Must not**: execute code in the MCP process (never), fall back to host execution if
  isolation is unavailable (fail-closed), accept caller-supplied identity, register tools
  when its feature flag is off (additive gating).

## Secondary domains (chat, feedback, emulator, browser)

Purpose-built collaboration features layered on the same persistence and routes. They must
not fork core semantics (scoping, versioning, warnings) — they reuse them.

## Evidence

- `server.js` — route ↔ engine wiring, warning materialization
- `utils/memoryEngine.js`, `utils/collaborationEngine.js`, `utils/coordinationEngine.js`,
  `utils/activityTracker.js`, `utils/metrics.js`, `utils/resetEngine.js`
- `src/core/mcp-registry/*`, `src/core/auth/*`, `src/core/session/*`
- `src/core/execution/*` header comments — sandbox non-responsibilities
- `dashboard/routes.js` — SPA-over-API contract

**Status:** Confirmed (responsibilities match wiring); "must not" items are Confirmed where
cited as invariants, Inferred as guidance elsewhere.
