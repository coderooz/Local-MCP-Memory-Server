# INDEX — Local Execution Sandbox

**Report ID:** INDEX_ExecutionSandbox_20261018
**Updated:** 2026-10-18
**Author:** OpenCode agent
**Status:** Active

---

## Feature purpose & scope

Add a **Local Execution Sandbox** to the local-mcp-memory MCP server so authorized clients can run
approved, versioned tasks and restricted generated Python/Node scripts in an isolated workspace —
without compromising the existing memory system, project isolation, coordination, or audit trail.

- **Execution mode:** hybrid — approved tasks by default; generated scripts in a restricted sandbox.
- **Initial runtimes:** Python, Node.js.
- **Priorities:** security, backward compatibility, deterministic execution, auditability,
  recoverability.
- **Non-goal:** an unrestricted shell-execution tool (explicitly forbidden).

---

## Current phase

**Phase 1 — Execution Contracts & Policy Foundation — COMPLETE.**

## Current implementation status

~30%. Contracts, policy engine, state machine, durable job repository, approval binding, audit
trail, 6 MCP tool contracts, feature flag, and 40 tests are implemented and green.
**Execution is fail-closed by design** — no process is spawned, no untrusted code runs (real
execution is Phase 2, gated on Docker).

## Last completed action

Closed the audit-logging gap (§4.1/§10): created `src/core/execution/audit.js` (narrow adapter
over existing activity/metrics services, with redaction + truncation), wired it into every
lifecycle method, added 5 audit/security tests, and synced the governance set.

## Current blocker

**Docker daemon is DOWN** (`npipe:////./pipe/dockerDesktopLinuxEngine` not found). Container
isolation — the only backend that satisfies the mandated control set (D-001) — cannot be built or
validated until Docker Desktop runs. **Blocks Phase 2.**

Secondary (environmental, pre-existing): the `npm test` e2e gate is red because a live
website-copy process (PID 4364) squats the runtime identity. Not a sandbox defect — see
`FAILURE_REGISTER.md` FR-003.

## Next exact action

1. Ask the user to **start Docker Desktop** (or explicitly accept a lowered, daemon-less threat
   model, recorded as a superseding decision).
2. Begin **Phase 2** — real Docker isolation adapter, trusted runtime registration, resource /
   timeout / output enforcement, cancellation, disposable workspaces, read-only approved tasks,
   adversarial sandbox tests.

---

## Canonical documents

| Concern             | Canonical file                                                        |
| ------------------- | --------------------------------------------------------------------- |
| Architecture        | `IMPLEMENTATION_PLAN.md` + `phases/PHASE_1_FOUNDATION.md`             |
| Threat model        | `DECISION_LOG.md` D-001/D-002/D-006 + `GAP_ANALYSIS.md` risk register |
| Tool contracts      | `src/interfaces/mcp-tools/execution-tool-definitions.js` (6 schemas)  |
| State machine       | `src/core/execution/state-machine.js` (15 states)                     |
| Approval protocol   | `src/core/execution/approval.js` + `phases/PHASE_1_FOUNDATION.md`     |
| Baseline evidence   | `BASELINE.md`                                                         |
| Gaps & reuse map    | `GAP_ANALYSIS.md`                                                     |
| Current status      | `CURRENT_STATE.md`                                                    |
| Decisions           | `DECISION_LOG.md` (D-001..D-009)                                      |
| Validation evidence | `ACTION_TEST_REPORT.md` (RUN-001..RUN-006)                            |
| Failure register    | `FAILURE_REGISTER.md` (FR-001..FR-003)                                |
| Implementation log  | `IMPLEMENTATION_LOG.md`                                               |
| Continuation        | `CONTINUATION_PROMPT.md`                                              |

## Project-wide governance links

- **PRI:** `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` — registers `src/core/execution/*`,
  the 6 tools, `execution_jobs`/`execution_approvals` tables, and the new test files.
- **LFI:** `.workspace/LFI/LOGIC_FLOW_INDEX.md` — registers submit/status/cancel/approve/
  refuse flows.
- **Report location decision:** reports live in `.workspace/reports/ExecutionSandbox/` per
  GOVERNANCE.md Rule 1–3 (the directive's `.reports/` example path does not exist here). Durable
  _structural_ facts go into PRI/LFI, not a competing doc tree (D-007).

## Documents still to create (later phases)

`ARCHITECTURE.md`, `THREAT_MODEL.md`, `POLICY_MATRIX.md`, `API_CONTRACTS.md`, `JOB_LIFECYCLE.md`,
`WORKSPACE_PROTOCOL.md`, `RUNTIME_MATRIX.md`, `VALIDATION_STRATEGY.md`, `SECURITY_TEST_REPORT.md`,
`PERFORMANCE_BASELINE.md`, `ROLLOUT_AND_ROLLBACK.md`, and `phases/PHASE_2..5.md`.
(`IMPLEMENTATION_LOG.md`, `ACTION_TEST_REPORT.md`, `FAILURE_REGISTER.md`, `phases/PHASE_1_FOUNDATION.md`
now exist.)

## Continuation instructions

See `CONTINUATION_PROMPT.md`. Golden rule: **verify the last checkpoint before trusting it; do not
repeat Phase 0 or Phase 1; protect the dirty files; never commit or push without explicit
authorization; do not claim Phase 2/E2E success while execution is untested and Docker is down.**
