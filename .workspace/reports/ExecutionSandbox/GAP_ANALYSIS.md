# GAP ANALYSIS — Local Execution Sandbox

**Report ID:** GAP_ANALYSIS_ExecutionSandbox_20261017
**Date:** 2026-10-17
**Phase:** 0
**Status:** Final
**Baseline commit:** `643fa30`

> Gap = distance between what the directive requires and what the repo provides today.
> **Exists** = capability already present (reuse it). **Gap** = must be built.

---

## A. Capability matrix

| #   | Directive requirement               | Current state                                                              | Verdict                         |
| --- | ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| 1   | MCP tool registration for new tools | `tools/list` concat in `mcp-server.js:1831`; registry-tools pattern exists | **Exists — reuse**              |
| 2   | Argument schema validation          | `validateToolArguments(name,args)` at `mcp-server.js:1843`                 | **Exists — reuse**              |
| 3   | Trusted agent/project identity      | `CONFIG.agent`/`CONFIG.project` server-injected; `projectIdentity.js`      | **Exists — reuse**              |
| 4   | Durable job repository              | SQLite schema + collection API + idempotency indexes                       | **Exists — extend** (new table) |
| 5   | Concurrency-safe state transitions  | Optimistic locking (`expectedVersion`) on tasks/contexts                   | **Exists — reuse pattern**      |
| 6   | Activity / audit stream             | `trackActivity`, `recordMetric`, `eventBus` in `server.js`                 | **Exists — reuse**              |
| 7   | Task ownership & soft locks         | `tasks`, `resource_locks` tables + engines                                 | **Exists — reuse**              |
| 8   | Human approval channel              | `src/core/auth/` JWT + API keys exist; **no approval workflow**            | **Partial — build workflow**    |
| 9   | Isolation backend                   | Docker CLI present, **daemon DOWN**                                        | **Gap / BLOCKED**               |
| 10  | Trusted runtime registry (py/node)  | none                                                                       | **Gap**                         |
| 11  | Execution policy engine             | none                                                                       | **Gap**                         |
| 12  | Job state machine                   | none                                                                       | **Gap**                         |
| 13  | Isolated workspace manager          | none (only git itself)                                                     | **Gap**                         |
| 14  | Bounded result collector            | none                                                                       | **Gap**                         |
| 15  | Feature flag / safe default         | config exists, no sandbox flag                                             | **Gap**                         |
| 16  | Execution tools (`execution_*`)     | none                                                                       | **Gap**                         |
| 17  | `/execution/*` HTTP routes          | none                                                                       | **Gap**                         |
| 18  | Security/adversarial tests          | none                                                                       | **Gap**                         |
| 19  | Unrestricted shell MCP tool         | **does not exist** (good — must stay absent)                               | **Satisfied**                   |

---

## B. Reuse map (avoid duplication — directive §2.2)

```
ExecutionService         -> reuses: CONFIG identity, validateProjectName/AgentId,
                            trackActivity, recordMetric, eventBus
ExecutionRepository      -> reuses: better-sqlite3, createSchema, collection API,
                            UNIQUE idempotency index pattern (from tasks)
ExecutionPolicyEngine    -> reuses: CONFIG.agent/project as trusted inputs
ApprovalService          -> reuses: src/core/auth/ JWT + API-key principal
WorkspaceManager         -> reuses: findProjectRoot() for authorized roots
SandboxAdapter (Docker)  -> NEW (no existing equivalent)
ResultCollector          -> NEW
Execution MCP tools      -> reuses: tools/mcpRegistryTools.js pattern + callMemoryApi routes
```

**Explicitly NOT duplicated:** identity resolver, task scheduler, logging system, DB driver —
directive §2.2 forbids competing implementations of these.

---

## C. Risk register

| Risk                                                    | Sev      | Mitigation                                                           |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Docker daemon unavailable → no real isolation           | **High** | Fail-closed; feature off by default; Phase 2 gated on daemon         |
| e2e suite already red (environmental) masks regressions | Med      | Track the 74-green baseline; never attribute e2e to sandbox          |
| Schema change breaks 34-test DB integrity suite         | Med      | Additive table only; update the table-count assertion deliberately   |
| New tools widen the MCP attack surface                  | Med      | Narrow surface (6 tools), authorization + project-scope on every one |
| Approval could be self-satisfied by an agent            | **High** | Bind approval to human principal; forbid agent self-approval (D-006) |
| Accidentally committing user's 3 dirty files            | Med      | Never `git add -A`; never commit (D-008)                             |
| Windows path/junction escapes in workspace containment  | Med      | realpath + handle reparse points; adversarial tests (Phase 3)        |

---

## D. Backward-compatibility guarantees

**FACT** — no existing MCP tool name/schema/contract is modified (GAP #19, D-003).
**FACT** — persistence change is additive (GAP #4).
**FACT** — feature is disabled by default (D-002), so existing clients observe zero change.

**Regression baseline to protect:** 74/89 green (feedback, chat, registry 24, db 34).

---

## E. Summary

The repo already provides ~8 of the required integration points (identity, validation,
persistence, idempotency, activity, locks, task ownership, auth). The genuine gaps are the
**execution subsystem itself** (policy, state machine, workspace, runtime registry, adapter,
collector, tools) and — most critically — **a usable isolation backend**, currently blocked by
the stopped Docker daemon.
