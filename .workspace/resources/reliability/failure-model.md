---
title: Failure Model
category: reliability
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Failure Model

How this system categorizes, contains, and recovers from failure — and where it
_deliberately_ accepts failure windows.

## Failure taxonomy (stable machine codes)

Failures carry stable codes so callers can branch on _kind_, not string-matching:

| Category           | Codes / kinds                                                | Meaning                                                                           |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Transport          | `TIMEOUT`, `NETWORK_FAILURE`                                 | Backend/proxy unreachable or slow                                                 |
| Availability       | `SERVER_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`, `CIRCUIT_OPEN` | Target down or breaker open (fail-fast)                                           |
| Contract           | `INVALID_INPUT`, `UNKNOWN_TOOL`                              | Validation refusal (pre-execution); tool doesn't exist                            |
| Rate / quota       | rate-limit style errors                                      | Caller exceeding limits                                                           |
| Storage            | duplicate-key / constraint compatibility codes               | Idempotency or uniqueness refusals (mapped from storage errors to friendly codes) |
| Session            | session isolation errors                                     | Cross-session write rejected (strict mode)                                        |
| Execution (opt-in) | `SANDBOX_START_FAILED`                                       | Isolation could not start — **fail-closed**, never host-fallback                  |

The taxonomy is a contract: codes are stable; messages and details are not
([tool-contracts](../mcp/tool-contracts.md)).

## Stale state (soft failures by design)

Two kinds of staleness self-manage without a sweeper:

- **Stale agents** — presence decays from `last_seen` age; offline agents are excluded
  from assignment ([heartbeat-model](../agents/heartbeat-model.md)). Nothing is released or
  reassigned automatically; absence reduces eligibility, not state.
- **Stale locks** — TTL expiry is **lazy**: a forgotten claim clears when the lock table
  is next touched ([resource-locking](../collaboration/resource-locking.md)).

No timers means no dead-scheduler failure mode — the trade-off is that staleness is only
realized on access.

## Persistence failures

- WAL journal + foreign keys + busy timeouts make concurrent writes serialize safely;
  busy/duplicate conditions retry a **bounded** number of times, then fail honestly.
- Duplicate-key retries exist only on idempotent-create paths (replay-safe by design).
- The full-text index self-repairs at boot if it drifted from base tables — a detected
  inconsistency is _rebuildable derived state_, not data loss.

## Partial-failure windows (accepted, documented)

The system does not pretend to distributed transactions; it names its windows:

| Window                                              | Behavior                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Write commits, late observability side effect fails | HTTP error surfaces for a succeeded write — callers reconcile by reading (writes are single-shot; no auto-retry) |
| Version snapshot storage hiccups                    | Write proceeds; snapshot failure is surfaced, never blocking                                                     |
| Audit insert fails                                  | Decision stands; failure reported on the receipt — the audit is best-effort by invariant, and must never throw   |

The unifying rule: **primary intent is decisive; trace is best-effort but never silent.**

## Recovery mechanisms

| Mechanism                                  | Recovers what                                                       |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Runtime file validation (PID + port probe) | Stale/corrupt server discovery — refuses reuse rather than trusting |
| Full-text rebuild at boot                  | Drifted search indexes                                              |
| Additive, existence-gated migrations       | Old databases upgrade in place without destructive risk             |
| Reset levels (confirmation + logging)      | The only sanctioned path for removing accumulated state             |
| Lazy re-evaluation                         | Locks, staleness, lifecycle — realized on access                    |
| Breaker half-open probing                  | Targets recover into service after failures subside                 |

## Failure-handling philosophy (summary)

1. **Fail fast and structured** — never hang, never leak internals.
2. **Contain per target** — one failure doesn't cascade (breakers, per-server isolation).
3. **Classify and be honest** — writes fail once and say so; reads retry only when safe.
4. **Prefer refusal over guessing** — unresolved identity, undecryptable credentials, and
   unstartable isolation all _stop_, they never degrade into unsafe behavior.
5. **Name the windows** — accepted partial-failure semantics are documented, not hidden.

## Invariants

- No unbounded waits; all outbound calls have named timeouts.
- Writes never auto-retried; storage retries bounded and idempotency-scoped.
- Fail-closed refusal for undecryptable credentials and unstartable sandbox isolation.
- Derivable state (indexes, breaker state, presence) is rebuildable — data is never
  discarded as a recovery measure.

## Evidence

- `mcp-server.js` — error codes, retry bounds, breaker transitions
- `src/core/database/sqlite/connection.js` — pragmas, bounded dup-key retry
- `src/core/session/` — runtime file probe/validation
- `src/core/execution/` — `SANDBOX_START_FAILED` fail-closed semantics
- `tests/mcp-resilience-test.js`, `tests/mcp-chaos-resilience-test.js` — failure behavior

**Status:** Confirmed (taxonomy, windows, recovery); exact retry bounds and breaker
thresholds are **implementation-specific**.
