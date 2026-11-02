# DECISION LOG — Local Execution Sandbox

**Report ID:** DECISION_LOG_ExecutionSandbox_20261017
**Status:** Active (append-only; never silently revise — supersede with rationale)
**Project:** local-mcp-memory

> Each entry: Decision ID · Context · Options · Selected · Rejected · Reasoning · Security
> impact · Compatibility impact · Validation evidence · Reversal conditions.

---

## D-001 — Isolation backend

- **Context:** Directive §6.1 requires empirical selection of an isolation backend for hostile
  generated code on this host.
- **Options considered:**
  1. **Docker Linux container (WSL2)** — strongest available boundary; matches directive §6.2
     control list (non-root, read-only rootfs, network-off, CPU/mem/pids limits, cleanup).
  2. Windows child process with restricted env + Job Object — pure Node stdlib, no daemon needed,
     but same-user, host-filesystem-reachable.
  3. Playwright/Chromium sandbox — real browser, _not_ a general code-isolation boundary.
  4. gVisor / Firecracker / disposable VM — strongest conceptually, no runtime present, needs deps.
- **Selected:** **Docker Linux container**, behind a feature flag, **fail-closed**.
- **Rejected:** (2) rejected as _insufficient_ for hostile code per §2.4/§6.1 — would silently
  substitute unrestricted host execution. (3) rejected as a category error. (4) rejected as
  unavailable without new dependencies.
- **Reasoning:** Only Docker satisfies the mandated control set. The daemon is currently DOWN
  (BASELINE §2), so the feature must degrade to `SANDBOX_START_FAILED` rather than weaken
  isolation.
- **Security impact:** Positive — no weak fallback. Negative — feature inert until daemon runs.
- **Compatibility impact:** None; all behind a disabled-by-default flag.
- **Validation evidence:** `docker version`/`docker info` fail (npipe missing) — BASELINE §2/§3.
- **Reversal conditions:** If the user mandates daemon-less operation, a _separate_ decision must
  explicitly lower the threat model to "trusted, non-hostile scripts only" and re-document §6.

## D-002 — Feature flag / fail-closed default

- **Context:** Directive §15 requires existing behavior unchanged when disabled and no
  unrestricted execution by default.
- **Selected:** Sandbox **disabled by default**. When disabled, execution tools are either not
  advertised or return a structured `SANDBOX_DISABLED`-style error. When enabled but the runtime
  is missing → **fail closed** (`SANDBOX_START_FAILED`), never a host-privileged fallback.
- **Rejected:** Enabling read-only execution via bare `child_process` when Docker is absent.
- **Reasoning:** §2.4 — "Never weaken sandbox restrictions to make a test pass."
- **Security impact:** Strong default-deny posture.
- **Compatibility impact:** Zero behavior change for existing clients.
- **Validation evidence:** To be proven in Phase 2 adversarial tests.
- **Reversal conditions:** Only via an explicit, recorded decision that changes the threat model.

## D-003 — Tool registration approach (additive)

- **Context:** §9 says integrate into existing registration, not a parallel MCP server.
- **Options:** (1) append an `getExecutionTools()` array in the `tools/list` concat; (2) create a
  second MCP server; (3) modify the `ToolRegistry` class path.
- **Selected:** **(1)** — mirror the working `tools/mcpRegistryTools.js` pattern; add
  `getExecutionTools()` and spread it into the `tools/list` array; each tool delegates to a new
  `/execution/*` route family in `server.js`.
- **Rejected:** (2) violates §9. (3) rejected because the live stdio path does not actually use
  `ToolRegistry` for dispatch (BASELINE §5) — modifying it would be a rewrite, not an addition.
- **Reasoning:** Smallest compatible change; zero edits to existing tool entries.
- **Security impact:** Neutral; no existing contract altered.
- **Compatibility impact:** None — purely additive.
- **Validation evidence:** BASELINE §5 (`mcp-server.js:1831`).
- **Reversal conditions:** None planned.

## D-004 — Persistence: extend existing SQLite, no new engine

- **Context:** §8 mandates durable job state using existing persistence conventions.
- **Selected:** Add an `execution_jobs` table (plus supporting tables) to
  `src/core/database/sqlite/schema.js` via `createSchema`, matching existing column/index/WAL/FK
  conventions, exposed through the existing MongoDB-compatible collection API.
- **Rejected:** Any new storage engine, an ORM, or filesystem-only job logs.
- **Reasoning:** §8 explicit; also reuses proven idempotency and UNIQUE-index patterns already in
  `tasks`.
- **Security impact:** Neutral; audit records live in the protected DB, not script-writable space.
- **Compatibility impact:** Additive schema only; no existing table altered.
- **Validation evidence:** BASELINE §6; `tests/database-integrity-test.js` asserts 19 tables (will
  become N+new and must be updated deliberately).
- **Reversal conditions:** None planned.

## D-005 — Identity is server-injected, never caller-asserted

- **Context:** §9/§10 forbid trusting caller identity or project-root fields.
- **Selected:** Reuse `CONFIG.agent` / `CONFIG.project` (injected in `mcp-server.js`) and existing
  `validateProjectName` / `validateAgentId` guards. Caller `project`/`agent` fields are treated as
  _requests_ that must resolve to the trusted value or be rejected (`PROJECT_SCOPE_DENIED`).
- **Rejected:** Accepting a client-supplied project root or agent id.
- **Reasoning:** BASELINE §7 proves the server already overwrites these fields for
  `register_agent`/`create_task` — execution tools must match.
- **Security impact:** Prevents impersonation and cross-project access.
- **Compatibility impact:** None.
- **Validation evidence:** BASELINE §7.
- **Reversal conditions:** None.

## D-006 — Approval must be a real human channel, not agent self-approval

- **Context:** §7.3 requires binding approvals to exact script hash/project/action/expiry and
  forbids fake approval via a boolean from the script or an untrusted agent.
- **Selected:** Implement a **pending-approval state** plus an approval record bound to
  `(script_hash, project, action, permission_set, expiry)`. Until a trusted human channel exists,
  `execution_approve` requires an authenticated human principal (ties into the existing
  `src/core/auth/` JWT/API-key system) and **cannot** be satisfied by the requesting agent.
- **Rejected:** A boolean `approved: true` field; agent self-approval; any script-provided grant.
- **Reasoning:** §7.3 explicit; the repo already has JWT/API-key auth to bind a human principal.
- **Security impact:** Prevents approval replay/bypass and privilege escalation.
- **Compatibility impact:** None (new subsystem).
- **Validation evidence:** Auth system present (BASELINE §5/§7); approval-bypass tests planned in
  Phase 3.
- **Reversal conditions:** Only if a stronger trusted channel is introduced.

## D-007 — Report placement follows governance, not the directive's example tree

- **Context:** Directive §11.2 proposes `.reports/ExecutionSandbox/…`; GOVERNANCE.md Rule 1–3
  mandates `.workspace/reports/{Category}/` with `{CATEGORY}_{DESCRIPTOR}_{YYYYMMDD}.md` naming,
  and forbids root-level reports (with `REPORT_INDEX.md` as the only approved index exception).
- **Selected:** Reports live in `.workspace/reports/ExecutionSandbox/`. Durable _structural_
  facts (new modules, routes, tables, tools) are registered into the **committed** PRI/LFI rather
  than a competing doc set.
- **Rejected:** Creating `.reports/` in the repo root (governance violation); committing the whole
  working-report tree (workspace files are uncommitted by policy).
- **Reasoning:** GOVERNANCE.md is enforceable and the directive itself says "adapt to the
  repository's established conventions"; PRI/LFI already provide the committed durable layer.
- **Security impact:** None.
- **Compatibility impact:** None.
- **Validation evidence:** BASELINE §9.
- **Reversal conditions:** If the user directs committing the sandbox reports, that supersedes and
  must be recorded.

## D-008 — No commit / no push

- **Context:** Working tree contains unrelated user work (3 modified files).
- **Selected:** All sandbox work is left **uncommitted** unless the user explicitly authorizes a
  commit. Never `git add -A` blindly; never push; never reset/stash the pre-existing changes.
- **Rejected:** Auto-committing a snapshot; force-push; history rewrite.
- **Reasoning:** §2.3 protects existing user changes; the prior session established "never push
  unless explicitly asked."
- **Security impact:** None.
- **Compatibility impact:** None.
- **Validation evidence:** BASELINE §1.
- **Reversal conditions:** Explicit user instruction to commit.

## D-009 — Audit reuses existing activity/metrics services

- **Context:** Directive §4.1 requires the audit service to "use the existing logging and activity
  conventions where practical, with execution-specific records for details that do not fit
  existing models," and §2.2 forbids introducing an unrelated logging system.
- **Options considered:**
  1. **Narrow adapter over existing `recordActivity`/`recordMetric`** — writes `type: 'execution'`
     events into the existing `activity` table with redacted structured metadata; counters reuse
     the `metrics` table.
  2. New `execution_audit` table + bespoke logger — full control, but a second source of truth.
  3. Console/file logging only — no durable, queryable trail.
- **Selected:** **(1) narrow adapter** (`src/core/execution/audit.js`).
- **Rejected:** (2) rejected as a competing logging system (violates §2.2, D-007). (3) rejected —
  not durable or auditable.
- **Reasoning:** Reuses the proven activity/metrics path so execution events appear in the existing
  `fetchActivity`/`fetchMetrics` surfaces. Execution-specific detail that doesn't fit the base
  model lives in the redacted `metadata` object. Sensitive keys (source/secrets/env/stack/hostPath)
  are redacted and long strings truncated before persistence. Writes are best-effort and never
  throw into the caller so an audit-storage hiccup cannot mask a policy decision.
- **Security impact:** Positive — a generated script cannot write its own audit record (the
  recorder is built server-side from the trusted `db`+context and never exposed to script content).
- **Compatibility impact:** None — no existing table/model/service changed; additive only.
- **Validation evidence:** integration tests "audit events are persisted", "audit rows never
  persist raw script source", "redactAuditMetadata is pure and depth-bounded", "audit rows are
  project-scoped" (all green).
- **Reversal conditions:** If execution audit volume/shape outgrows the activity model, a dedicated
  table may be introduced — must be recorded as a superseding decision, not done silently.
