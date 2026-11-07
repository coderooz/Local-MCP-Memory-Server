# Execution Sandbox Report — Phase 1 Contracts & Policy Foundation

**Audit Date:** 2026-11-05  
**Subsystem:** `src/core/execution/`  
**Tools:** `tools/executionTools.js`  
**Status:** DELIBERATE FAIL-CLOSED PHASE 1 FOUNDATION  

---

## 1. Design & Security Model

The execution sandbox implements a policy-driven, human-in-the-loop execution state machine designed to prevent untrusted AI code execution on host developer machines.

```
+--------------------------------------------------------------------------------+
|                             EXECUTION STATE MACHINE                            |
|                                                                                |
|  [submit] ---> VALIDATING ---> AWAITING_APPROVAL ---> QUEUED ---> RUNNING ...  |
|                     |                |                   |           |         |
|                     v                v                   v           v         |
|                   FAILED           FAILED              FAILED      FAILED      |
|           (POLICY_DENIED)   (APPROVAL_EXPIRED)  (SANDBOX_START)   (TIMEOUT)    |
+--------------------------------------------------------------------------------+
```

### Key Security Invariants:
1. **Script Hashing**: All submitted scripts are hashed with SHA-256 (`scriptHash`).
2. **Approval Binding**: Approvals are cryptographically bound to `(scriptHash, project, runtime, permissions)`. Changing any byte of the script invalidates the approval.
3. **No Self-Approval**: The submitting agent cannot approve its own execution (`POLICY_DENIED`).
4. **Idempotency**: Submissions with identical `idempotencyKey` return the existing job.
5. **Auditing**: Every transition is logged to `action_logs` and `activity`.

---

## 2. Phase 1 Implementation Reality

In v2.6.0, the Docker sandbox adapter (`src/core/execution/sandbox-adapter.js`) is intentionally configured as a **fail-closed stub**:
- `isAvailable()` returns `false`.
- No subprocesses or child containers are spawned on the host system.
- Jobs that are approved and dispatched transition immediately to state `failed` with error code `SANDBOX_START_FAILED`.

### Verdict:
This behavior is fully compliant with the security specification for Phase 1. It guarantees that untrusted agent code cannot break out into the host OS while container infrastructure is absent.
In Phase 2, the Docker adapter will connect to an active local Docker daemon. Until then, the system safely rejects execution requests without crashing.
