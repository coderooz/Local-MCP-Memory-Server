---
title: Design Principles
category: foundation
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
  - contributors
last_reviewed: 2026-10-21
---

# Design Principles

How to build within this system without fighting its architecture. Philosophy lives in
[system-philosophy](system-philosophy.md); hard rules live in
[invariants](../governance/invariants.md). This file is the engineering middle layer.

## 1. Trust identity comes from server configuration, not callers

On the MCP path, `agent`/`project`/`scope` are injected from resolved configuration and
stamped onto every write. Never accept caller-asserted identity where a trusted source
exists; where the HTTP API inherently relies on client-claimed actors (coordination routes),
treat ownership signals as _advisory by construction_ and say so. The execution domain
formally rejects caller-supplied identity.

## 2. Warn at the edges, block only for correctness

Document writes proceed under concurrent-change warnings; hard denial is reserved for:
lock acquisition against a foreign owner, claim-once task races, input validation failures,
and destructive operations awaiting confirmation. When adding a guard, ask: _is this a
correctness boundary or a coordination signal?_ Signals warn; correctness blocks.

## 3. Surface conflicts; never smooth them

Any overlap detection (version/timestamp mismatch, foreign lock, foreign ownership) must
produce a visible, durable signal — warnings in responses, activity records, `conflictsWith`
links, metrics. Do not silently overwrite, merge, or discard competing state.

## 4. Snapshot before mutation; prefer relabeling over deletion

Memory changes capture a version snapshot first (non-fatally on storage hiccup). Cleanup
means lifecycle relabeling (`deprecated`/`archived`), not row deletion. Actual deletion is
restricted to explicit, confirmed reset operations.

## 5. Schema evolution is additive-only

New columns/tables/indexes; never destructive migrations of existing data. Gate new columns
behind existence checks so older databases upgrade in place. Derivative indexes (like
full-text sync) may be rebuilt — rebuilds are logic-only, data untouched.

## 6. Validate before executing; structure every failure

Input validation runs before any handler (invalid arguments → structured `INVALID_INPUT`
protocol errors). Errors carry a stable machine code plus `{error, message, details}` —
never bare strings or stack traces to callers. Unknown tools get a distinct code.

## 7. Classify side effects: primary vs best-effort

- **Primary writes** (the record the caller asked for) are single-attempt and decisive.
- **Observability side effects** (audit rows, version capture) are best-effort: they must
  never throw into the caller or mask a policy decision — but failures are surfaced
  (e.g. on the receipt), never hidden.

Never let a telemetry hiccup corrupt business outcomes, and never let a business path skip
its trace.

## 8. Retry only what is safe; break circuits under load

Reads and allow-listed idempotent reads may retry on timeout/network/upstream failures;
writes are single-shot. Outbound calls (HTTP backend, registry proxy) are bounded by named
timeouts and per-target circuit breakers that fail fast rather than pile up.

## 9. Redact before persistence, mask before exposure

Sensitive values (secrets, tokens, source, env, absolute host paths, stacks) are redacted
_before_ they hit storage; credentials are encrypted at rest when a key exists, fail closed
when it does not, and are masked on every external surface (routes, tool output, logs).

## 10. Keep the protocol surface honest

Advertise only capabilities that actually exist (a deliberate decision keeps tool-list
notifications off until implemented). stdout carries protocol output only; diagnostics go
to stderr. New tools register **additively** — existing tool contracts are not modified.

## 11. Prefer explicit links over inference

Relationships between memory, tasks, issues, actions, and agents are stored as explicit
arrays on records (the "context graph"). Don't invent implicit coupling the data model
doesn't express.

## 12. Design for local-first, embedded operation

No external service may be _required_ for core function. Storage must survive process
restarts (WAL, foreign keys on, busy timeouts), and runtime discovery files must be
validated (never blindly trusted).

## Evidence

- `src/core/execution/index.js`, `policy.js`, `audit.js` — trusted identity, narrow-only
  permissions, redaction + best-effort audit invariants
- `mcp-server.js` — validation-before-dispatch, structured errors, retry allow-list,
  capability advertisement decision
- `src/core/database/sqlite/schema.js` — additive-migration rationale comment
- `utils/memoryEngine.js`, `utils/collaborationEngine.js`, `server.js` — snapshot-first,
  warn-not-block behavior
- `src/core/mcp-registry/crypto.js`, `proxy.js` — encrypt/fail-closed/mask + scrubbing

**Status:** Confirmed — every principle maps to cited implementation behavior.
