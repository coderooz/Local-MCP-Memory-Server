---
title: Architectural Decisions
category: governance
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Architectural Decisions

Significant decisions, their reasoning, trade-offs, and what would justify revisiting
them. Where reasoning is not recoverable from repository evidence, that is stated
explicitly — **no rationale is manufactured**. Compact format; one section per decision.

## AD-01 — Embedded SQLite, no external database service

- **Problem**: coordination state must be durable, local-first, zero-setup.
- **Chosen**: embedded SQLite (WAL, FKs, FTS5) behind the persistence layer.
- **Reasoning**: matches the local-first philosophy — one process, one file, no service to
  install; survives restarts; supports full-text search natively.
- **Alternatives**: external DB (Mongo/Postgres) — rejected as a hard dependency for a
  dev-time tool; in-memory only — rejected (violates the persistence purpose).
- **Trade-offs**: single-host; logical (not physical) project isolation; concurrency via
  WAL/busy-timeout rather than distributed consensus.
- **Revisit when**: multi-host/multi-user scale or physical isolation becomes a goal.

## AD-02 — Mongo-compatible collection API over SQLite

- **Problem**: (historical) an earlier persistence generation used Mongo-style APIs.
- **Chosen**: a compatibility layer exposing collection-style operations over SQLite.
- **Reasoning**: migration continuity for existing call sites (legacy dependency traces
  remain in the tree).
- **Trade-offs**: an extra abstraction layer; query semantics constrained to what the
  shim translates.
- **Revisit when**: shim cost exceeds migration cost — consolidation is plausible but
  rationale for the interim is **Inferred** (no decision record recovered).
- **Status**: rationale partially not recoverable from repository evidence.

## AD-03 — MCP stdio server translating to an embedded HTTP backend

- **Problem**: expose coordination to any MCP client _and_ to humans, one state store.
- **Chosen**: MCP stdio server → HTTP calls to an embedded backend; dashboard shares the
  same API.
- **Reasoning**: protocol layer and business surface stay decoupled; the dashboard reuses
  exact semantics; the reliability envelope lives at one hop.
- **Trade-offs**: an internal HTTP hop; two entry points to keep coherent.
- **Revisit when**: hop overhead or dual-surface maintenance becomes dominant.

## AD-04 — Warn-and-coordinate collaboration (soft, never hard-block humans)

- **Problem**: parallel humans+agents need collision safety without lockout.
- **Chosen**: risk evaluation warns and materializes; writes proceed; hard denial only at
  correctness boundaries (INV-06).
- **Reasoning**: documented stance — the project exists to _warn and coordinate, not
  hard-block humans_; humans retain control of their project.
- **Alternatives**: pessimistic locking everywhere — rejected (lockout risk, deadlock
  surface); no signals — rejected (silent collisions).
- **Trade-offs**: weaker guarantees than hard locks; relies on actors honoring signals.
- **Revisit when**: abuse patterns show advisory signals are systematically ignored.

## AD-05 — Soft advisory locks with TTL and lazy expiry

- **Problem**: "who claims this resource right now?" without mutexes.
- **Chosen**: single-holder advisory claims, TTL expiry realized lazily on access.
- **Reasoning**: availability over strict exclusion; no sweeper jobs removes a failure
  class; TTL is the escape hatch for forgotten claims.
- **Trade-offs**: stale claims until touched; no deadlock detection (deliberate).
- **Revisit when**: workloads need hard mutual exclusion or exact-time expiry.

## AD-06 — FTS5 + application-side ranking (no vector embeddings)

- **Problem**: fast, dependency-free retrieval over memory.
- **Chosen**: FTS5 pre-filter + application-side ranking (overlap, importance, recency,
  access, lifecycle penalties).
- **Reasoning**: local-first simplicity; ranking tunable above storage; index self-repairs
  at boot.
- **Alternatives**: vector embeddings — a latent column exists but is unused; semantic
  search was not pursued (intent **Unknown** — no record recovered).
- **Trade-offs**: lexical, not semantic, recall; candidate fetch before final ordering.
- **Revisit when**: semantic retrieval becomes a requirement.

## AD-07 — Trusted-identity injection (config, not caller claims)

- **Problem**: records must mean who they say.
- **Chosen**: identity resolved from project files → global config → env → stop; injected
  at the MCP edge; execution domain rejects caller identity outright.
- **Reasoning**: security — impersonation structurally impossible where a trusted source
  exists; fallback values are misconfigurations, not identities.
- **Trade-offs**: HTTP coordination routes (no trusted source) remain client-claimed —
  mitigated by advisory-by-construction semantics.
- **Revisit when**: a real authentication layer covers coordination routes (then
  client-claimed identity can be replaced, not merely warned about).

## AD-08 — Fail-closed, opt-in, sandbox-only execution

- **Problem**: future script execution must never endanger the host or MCP process.
- **Chosen**: feature-flag default-off; Docker-only isolation verified before execution;
  `SANDBOX_START_FAILED` refuses rather than degrading; MCP process never executes
  scripts; narrow-only policy pre-approval; hash-bound approvals.
- **Reasoning**: recorded as foundational invariants in the execution layer itself —
  refusal over unsafe fallback, always.
- **Trade-offs**: execution unavailable until Docker verified; more moving parts per job.
- **Revisit when**: an equally-isolated alternative backend is proposed (isolation
  _guarantee_ is the invariant, Docker the current mechanism).

## AD-09 — Credential encryption with explicit degrade, fail-closed reads

- **Problem**: external MCP server credentials at rest, plus a migration story.
- **Chosen**: encrypt with key derived from master secret; decrypt-without-key fails
  closed; plaintext-degrade path warns explicitly; mask on every surface.
- **Reasoning**: the security asymmetry — convenience may degrade _with warning_;
  secrecy never degrades _silently_.
- **Trade-offs**: plaintext window possible during migration (visible via warning).
- **Revisit when**: migration story matures (degrade path removable → always-encrypted).

## AD-10 — Safe-retry classification (writes single-shot)

- **Problem**: transient failures vs double-applied intent.
- **Chosen**: allow-listed read-shaped calls retry; everything else single-attempt.
- **Reasoning**: coordination writes are not universally idempotent; honest failure beats
  silent duplication.
- **Trade-offs**: retried reads can double-count access side effects (accepted; ranking
  tolerates).
- **Revisit when**: per-call idempotency keys make more writes safely retryable.

## AD-11 — Honest capability advertisement (list-change notifications withheld)

- **Problem**: announcing tool-list changes before implementing them would lie to clients.
- **Chosen**: keep list-change notifications off until genuinely implementable.
- **Reasoning**: recorded decision — advertising is committing.
- **Trade-offs**: clients don't get live tool-list updates yet.
- **Revisit when**: dynamic-tool refresh is actually implemented end-to-end.

## AD-12 — Additive-only schema migrations

- **Problem**: upgrades must never destroy data.
- **Chosen**: existence-gated additive migrations; derived indexes rebuildable.
- **Reasoning**: recorded rationale in schema code — in-place upgrade safety above
  tidiness.
- **Trade-offs**: occasional redundant columns/aliases until cleanup releases.
- **Revisit when**: a versioned, explicit, reviewed destructive migration process exists.

## AD-13 — Single validated runtime discovery file per project

- **Problem**: clients need to find the running server without a central registry.
- **Chosen**: one discovery file per project (host/port/PID), named from the project
  directory; every read revalidates via PID + port probes.
- **Reasoning**: files go stale (crashes, restarts, PID reuse) — validate, never trust.
- **Trade-offs**: probe cost on reuse; directory-derived naming constraints.
- **Revisit when**: a shared service registry replaces per-project files.

## AD-14 — Pull-based message inbox

- **Problem**: inter-agent handoffs without a delivery infrastructure.
- **Chosen**: persistent inbox; recipients poll; broadcast via null target.
- **Reasoning**: durability + simplicity — no push plumbing, no lost handoffs across
  restarts.
- **Trade-offs**: delivery latency = polling cadence; no read receipts.
- **Revisit when**: real-time delivery is required.

## Open structural debt — dual service layer

- **Observation (Confirmed)**: the tree contains a live layer (`server.js` + `utils/*`
  engines) and a second, currently-unwired layer (domain services + aspirational API
  routes) whose collaboration semantics **diverge** (warn vs block, idempotency,
  optimistic concurrency).
- **Decision rationale**: **not recoverable from repository evidence.** Whether the second
  layer is a migration in progress, an abandoned refactor, or a target architecture
  cannot be determined from the tree alone.
- **Acknowledged**: roadmap work references consolidating the dual architecture.
- **Interim rule** (until resolved): the live layer is the contract; verify which layer a
  code path uses before extending ([change-guidelines](change-guidelines.md)).

## Evidence

- `README.md`, `docs/reliability.md`, `docs/connection-lifecycle.md` — documented stances
- `src/core/execution/*` header comments — AD-08/INV rationale quotes
- `src/core/mcp-registry/crypto.js` — AD-09 mechanics + comments
- `src/core/database/sqlite/schema.js` — AD-12 rationale comment; AD-06 index design
- `mcp-server.js` — AD-10/AD-11 recorded decisions
- `agent-instruction.js` — AD-04/AD-07 stance text

**Status**: Confirmed for recorded decisions; AD-02 and AD-06 carry explicitly-marked
non-recoverable rationale; the dual-layer item is an open debt, not a decision.
