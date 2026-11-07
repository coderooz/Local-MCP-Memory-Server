---
title: Architectural Invariants
category: governance
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Architectural Invariants

Statements that must remain true **across implementations**. Each entry records: the
invariant, why it exists, what it protects, how it can be violated, how it is enforced
today, and how future work must preserve it. Retiring an invariant is a deliberate
architectural decision ([change-guidelines](change-guidelines.md)), never an accident of
refactoring.

## Identity and scoping

### INV-01 — Identity comes from trusted configuration

- **Statement**: `(agent, project, scope)` attribution is injected from resolved
  configuration; caller-asserted identity is never stored as authoritative where a trusted
  source exists.
- **Why / protects**: attribution integrity — records mean what they say; impersonation is
  structurally impossible on the MCP path.
- **Violated by**: accepting agent/project from tool arguments; defaulting silently to
  fallback identities (`unknown`/`default`) as if legitimate.
- **Enforced by**: MCP-layer identity injection; execution-domain identity rejection;
  project rules banning fallback identities.
- **Preserve by**: stamping identity at the edge, before dispatch; treating unresolved
  identity as a stop-condition, never a guess.

### INV-02 — Project scoping is enforced on anchored reads/writes

- **Statement**: anchored operations are filtered by project (and memory visibility scope);
  project isolation is logical but mandatory and tested.
- **Why / protects**: multi-project safety in one shared database — no cross-project
  leakage.
- **Violated by**: unscoped queries in product paths; trusting caller project without
  anchoring; assuming physical separation exists.
- **Enforced by**: anchor-based query filtering; isolation test suites.
- **Preserve by**: routing every read/write through the scoped query builder; extending
  scoping to any new entity's universal columns.

## Memory and history

### INV-03 — Memory never silently disappears

- **Statement**: no deletion outside confirmed, logged reset levels; lifecycle decay only
  relabels (`deprecated`/`archived`).
- **Why / protects**: durable knowledge must not depend on any single session or cleanup
  pass; history stays queryable.
- **Violated by**: `DELETE` as a decay/optimization side effect; silent pruning; overwrite
  without history.
- **Enforced by**: engine-level no-delete discipline; reset engine as the sole destructive
  path (confirmation + logging).
- **Preserve by**: expressing staleness as lifecycle labels; routing destruction exclusively
  through confirmed resets.

### INV-04 — Mutations snapshot first; versions are monotonic; history is immutable

- **Statement**: every accepted memory mutation captures an immutable version snapshot of
  prior state before writing and bumps a per-record monotonic version.
- **Why / protects**: traceability and conflict detection need honest before/after state.
- **Violated by**: updating rows in place without snapshots; reusing/reordering version
  numbers; mutating history rows.
- **Enforced by**: engine write path (snapshot non-fatal but mandatory-attempted);
  schema-level history table.
- **Preserve by**: keeping snapshot-before-write ordering in any rewritten write path;
  treating history as append-only.

### INV-19 — Durable knowledge outlives ephemeral sessions

- **Statement**: knowledge, coordination state, and their history persist independent of
  any agent process; derivable state (indexes, breaker state, presence) is rebuildable.
- **Why / protects**: the project's reason to exist — context continuity.
- **Violated by**: in-memory-only coordination state; treating runtime discovery files as
  authoritative; "rebuild the memory from scratch" recovery habits.
- **Enforced by**: embedded durable storage; boot-time index repair; runtime-file
  validation (probe, don't trust).
- **Preserve by**: never making persistence contingent on a live actor; keeping derived
  state reconstructible.

## Collaboration

### INV-05 — Conflicts are surfaced and recorded, never smoothed

- **Statement**: every overlap (version mismatch, foreign lock, foreign ownership) produces
  visible warnings **and durable records** (activity + `conflictsWith` + metric).
- **Why / protects**: parallel actors can only coordinate what they can see; silent
  absorption hides collisions.
- **Violated by**: catching a conflict and proceeding without surfacing; merging
  competing state without record; logging-only warnings that vanish.
- **Enforced by**: warn path materialization on all document-write routes.
- **Preserve by**: treating materialization as part of the write contract, not optional
  telemetry.

### INV-06 — Document writes warn, not block

- **Statement**: overlap/ownership signals never refuse document writes; hard denial is
  reserved for correctness boundaries (lock acquisition, claim-once races, input
  validation, unconfirmed destruction).
- **Why / protects**: humans are never locked out of their own project; coordination stays
  advisory by construction.
- **Violated by**: turning a warning into a 4xx on a document write; adding
  authentication-gated writes without an explicit documented decision.
- **Enforced by**: warn-only risk evaluation in the live service layer.
- **Preserve by**: keeping correctness boundaries narrow and named; adding new guards only
  after classifying them as correctness vs coordination.

### INV-07 — Locks are advisory and single-holder

- **Statement**: at most one unexpired holder per `(project, resource)`; acquisition by a
  foreign owner is refused; locks **never gate data writes**; expiry is lazy, TTL-based.
- **Why / protects**: claim integrity without human lockout; no deadlock-prone hard
  mutexes.
- **Violated by**: requiring locks for writes; allowing duplicate holders; adding a lock
  sweeper that silently releases state.
- **Enforced by**: uniqueness on acquisition; advisory downstream warnings; TTL semantics.
- **Preserve by**: keeping the hard-refusal confined to acquisition; keeping expiry lazy.

### INV-08 — Work ownership is explicit; claiming is claim-once

- **Statement**: exactly one owner per claimed task; concurrent claims resolve to one
  winner; reassignment is explicit; auto-assign picks one eligible online actor.
- **Why / protects**: two owners means two plans; invisible work is uncoordinatable work.
- **Violated by**: broadcast assignment; silent reassignment; implicit ownership through
  activity alone.
- **Enforced by**: claim-once CAS semantics; capability routing filters.
- **Preserve by**: keeping claim/refuse atomicity; keeping reassignment a deliberate
  action.

### INV-17 — Activity is append-only

- **Statement**: activity entries are never edited, backdated, or deleted outside
  confirmed resets; resets are themselves recorded first.
- **Why / protects**: the shared timeline's credibility — traceability, mutual visibility,
  implicit audit.
- **Violated by**: "correcting" history in place; pruning activity outside resets;
  dropping reset logging.
- **Enforced by**: append-only write path; reset engine ordering.
- **Preserve by**: expressing corrections as new entries; keeping cleanup strictly
  confirmation-gated.

## Protocol and reliability

### INV-09 — Validate before execute; structure every failure

- **Statement**: inputs are schema-validated before handlers; failures carry stable codes
  plus `{error, message, details}`; unknown tools get a distinct code.
- **Why / protects**: no partial execution of invalid intent; callers can branch on failure
  kind; internals never leak.
- **Violated by**: handler-side coercion of bad input; bare-string/stack responses;
  conflating "tool missing" with "tool failed."
- **Enforced by**: dispatch-layer validation and error mapping.
- **Preserve by**: keeping validation ahead of dispatch in any rewritten pipeline.

### INV-10 — Writes are never auto-retried

- **Statement**: write-shaped calls are single-attempt; only allow-listed read-shaped calls
  retry on timeout/network/upstream failure.
- **Why / protects**: coordination writes are not universally idempotent; silent retry can
  double-apply intent (duplicate claims, double mutations).
- **Violated by**: blanket retry middleware; retry-on-5xx for POSTs.
- **Enforced by**: call classification in the MCP reliability envelope.
- **Preserve by**: adding retries only with explicit idempotency analysis per call.

### INV-11 — stdout carries protocol output only

- **Statement**: stdout is JSON-RPC only; all diagnostics go to stderr.
- **Why / protects**: one stray log line corrupts the client's protocol stream.
- **Violated by**: `console.log` in any code path reachable from the MCP process.
- **Enforced by**: stdio discipline + stabilization tests.
- **Preserve by**: routing every diagnostic to stderr; keeping protocol framing pure.

### INV-20 — Strict session isolation rejects cross-session writes

- **Statement**: session scope filtering applies to reads; strict mode _refuses_
  cross-session writes rather than merging them.
- **Why / protects**: concurrent sessions must not bleed state into each other.
- **Violated by**: relaxing strict mode silently; filtering reads but not writes.
- **Enforced by**: session layer + isolation suites.
- **Preserve by**: keeping rejection (not merging) as the failure mode.

## Security

### INV-12 — Credentials: encrypt, fail closed, mask

- **Statement**: credentials are encrypted at rest when a key exists; decryption without
  the key **fails closed**; plaintext-degrade writes warn explicitly; every external
  surface masks credential values.
- **Why / protects**: secrets never leak — not at rest, not in display, not in failure.
- **Violated by**: silent plaintext fallback; echoing stored secrets in listings/logs;
  decrypt-anyway behavior.
- **Enforced by**: registry crypto module; masking on routes/tool output; tests asserting
  masking and fail-closed reads.
- **Preserve by**: keeping the degrade asymmetry (convenience warns; secrecy never
  degrades silently).

### INV-13 — Redact before persist; best-effort telemetry never throws

- **Statement**: sensitive values are redacted _before_ storage; observability side effects
  (audit, version capture, activity) may fail but must never throw into callers, block
  decisions, or mask policy outcomes — and their failures are surfaced.
- **Why / protects**: telemetry neither corrupts business outcomes nor hides its own
  absence.
- **Violated by**: logging secrets "temporarily"; wrapping decisions in try/finally that
  swallows audit failures silently _or_ that lets them abort the decision.
- **Enforced by**: redaction gate before audit persistence; non-throwing best-effort
  wrappers with surfaced failures.
- **Preserve by**: keeping redaction _upstream_ of storage; keeping telemetry failures
  visible.

### INV-16 — Destructive operations require escalating confirmation and are logged

- **Statement**: reset/cleanup levels require level-appropriate (severe: literal code)
  confirmation; all resets are logged.
- **Why / protects**: no irreversible loss without deliberate human intent; every loss is
  traceable.
- **Violated by**: implicit cleanup paths; confirmation bypasses; unlogged deletion.
- **Enforced by**: reset engine confirmation + logging.
- **Preserve by**: routing any new destructive capability through the same escalation.

## Evolution

### INV-14 — Schema evolution is additive-only

- **Statement**: migrations add (columns/tables/indexes), gated by existence checks;
  existing data is never destructively altered; derived indexes may be rebuilt.
- **Why / protects**: in-place upgrades without data-loss risk.
- **Violated by**: DROP/rewrite migrations; unguarded column adds; repurposing existing
  columns' semantics.
- **Enforced by**: existence-gated migration code + integrity suites.
- **Preserve by**: treating any destructive change as a versioned, explicit, reviewed
  decision.

### INV-15 — Feature-flag defaults are security posture

- **Statement**: risky features default **off**; enabling a flag changes the exposed
  surface and is part of the security contract.
- **Why / protects**: dangerous capability (notably execution) is opt-in and verified.
- **Violated by**: defaulting sandbox/registry/integration flags on; enabling via config
  drift without review.
- **Enforced by**: loader defaults; tool registration gated on flags.
- **Preserve by**: reviewing any default flip as an ADR-level change.

### INV-18 — Advertise only what is implemented

- **Statement**: the tool surface (and any capability claim) is honest — nothing is
  advertised before it exists.
- **Why / protects**: clients/agents plan against advertised surface; dishonesty breaks
  coordination at the protocol level.
- **Violated by**: registering stub tools; pre-announcing list-change notifications;
  overclaiming agent capabilities.
- **Enforced by**: additive honest registration; withheld list-change notifications.
- **Preserve by**: shipping capability and advertisement in the same change.

## Evidence

- `src/core/execution/` (INV-01/13/15/16), `utils/memoryEngine.js` (INV-03/04),
  `utils/collaborationEngine.js` (INV-05/06/07), `utils/coordinationEngine.js` (INV-08),
  `mcp-server.js` (INV-09/10/11/18), `src/core/mcp-registry/crypto.js` (INV-12),
  `src/core/session/` (INV-19/20), `src/core/database/sqlite/schema.js` (INV-14),
  `agent-instruction.js` (INV-03/05/19 intent)
- Behavioral suites: `tests/conflict-detection-test.js`, `tests/multi-agent-coordination-test.js`,
  `tests/session-isolation-test.js`, `tests/mcp-registry-test.js`, `tests/mcp-architecture-audit-test.js`

**Status:** Confirmed — every invariant maps to cited enforcement; the set is Inferred as
_complete_ (a refactor could reveal unenforced-in-practice gaps; that is precisely what
the violation modes column anticipates).
