---
title: Reliability Model
category: reliability
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Reliability Model

The system's reliability philosophy: **bounded everything, structured failures, fail fast
under repeated failure, graceful degradation, and observable health.** Reliability here is
not uptime theater — it is the discipline that keeps a local coordination layer predictable
when processes, networks, and external servers misbehave.

## The eight mechanisms (Confirmed)

| #   | Mechanism                     | Principle                                                                                                       |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Bounded timeouts**          | Every outbound call (backend HTTP, registry proxy) carries a named timeout — no unbounded waits                 |
| 2   | **Structured errors**         | Failures are codes + `{error, message, details}`, never bare strings or leaked stacks                           |
| 3   | **Safe-retry classification** | Reads/safe calls retry on timeout/network/upstream failure; **writes are single-shot, never auto-retried**      |
| 4   | **Circuit breakers**          | Repeated failure per target opens a breaker → fail fast instead of piling up (per backend, per external server) |
| 5   | **Health surface**            | On-demand and periodic health reporting (registry health sweep, health endpoints)                               |
| 6   | **Graceful shutdown**         | Clean teardown of transports and in-flight state on exit                                                        |
| 7   | **stdio purity**              | Protocol output only on stdout; diagnostics to stderr — one stray log corrupts the client stream                |
| 8   | **Runtime file validation**   | Discovery files (host/port/PID) are probed — PID + port verified before reuse, never trusted blindly            |

## Retry asymmetry (a core contract)

```text
read-shaped, allow-listed  →  may retry on timeout / network / upstream failure
write / anything else      →  single attempt, reported honestly as failed
```

Writes are never auto-retried because coordination writes are not universally idempotent,
and silently retrying an ownership claim or a versioned mutation could double-apply intent.
A failed write surfaces as failed; the caller reconciles by reading, not by blind retry
(see [tool-contracts](../mcp/tool-contracts.md)).

The accepted cost: a retried _read_ may double-count access side effects — ranking
tolerates it (documented trade-off, [context-retrieval](../memory/context-retrieval.md)).

## What counts as a successful operation

A success is: **the caller's primary intent was achieved and any overlap signals were
surfaced** — not "nothing warned." Warnings ride success; they do not downgrade it. This
separation is what makes advisory collaboration compatible with reliable writes: the write
path has exactly one failure notion (primary write failed), and coordination signals live
entirely outside it.

## Partial-failure semantics

The system classifies side effects and keeps them from corrupting outcomes
([design-principles](../foundation/design-principles.md) §7):

- **Primary write** — decisive, single-attempt, authoritative.
- **Version snapshot** — non-fatal; failure is surfaced, never blocks the write.
- **Activity / metrics** — best-effort-adjacent; emitted after the primary write; a late
  failure surfaces as an error response even though the row committed (the known
  partial-failure window — [failure-model](failure-model.md)).
- **Execution audit** — redacted, best-effort, must never throw or influence a decision.

Telemetry may lag or fail; it may never mask business outcomes, and business paths may
never skip their trace.

## Circuit breaking in context

Breakers are **per target**: one unavailable external MCP server fails fast on its own
without degrading healthy ones ([server-registry](../mcp/server-registry.md)); the embedded
backend has its own breaker so a wedged backend produces fast, structured failures instead
of request pile-ups. Breaker state is ephemeral runtime state — rebuilt, never persisted
([knowledge-persistence](../memory/knowledge-persistence.md)).

## No background jobs (reliability-relevant)

There are **no timers, queues, or sweepers**. Lock expiry, agent staleness, lifecycle
decay, and index repair are all **lazy** — evaluated when state is next touched or at boot.
This removes an entire failure class (a dead scheduler silently not doing its job) at the
cost of staleness that is only realized on access. Consistency is eventual-by-laziness,
never guaranteed-by-timer.

## Health and observability

Health surfaces exist for the server and each registered external server; the activity
stream and metrics provide the collaboration-health view ([activity-model](../collaboration/activity-model.md)).
Health is for detection; it is not an enforcement mechanism.

## Invariants (see [invariants](../governance/invariants.md))

- All outbound calls are bounded by named timeouts.
- Writes are never auto-retried; reads retry only within the safe allow-list.
- Failures are structured and coded; internals never leak to callers.
- Breakers isolate failures per target.
- stdout carries protocol output only.

## Evidence

- `mcp-server.js` — timeout/retry/circuit-breaker envelope, error structuring, health
- `src/core/mcp-registry/` — per-server breakers, health sweep
- `src/core/session/` — runtime file validation (PID/port probes)
- `docs/reliability.md`, `docs/connection-lifecycle.md` — documented reliability claims
- `tests/mcp-resilience-test.js`, `tests/mcp-chaos-resilience-test.js` — behavioral evidence

**Status:** Confirmed (all eight mechanisms + retry asymmetry verified in code/tests).
