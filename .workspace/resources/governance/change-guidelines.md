---
title: Change Guidelines
category: governance
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
  - contributors
last_reviewed: 2026-10-21
---

# Change Guidelines

How to change this system without violating its architecture: change classes, the
invariant-preserving checklist, per-domain evaluation rules, and documentation
synchronization duties.

## Change classes

| Class          | Examples                                                                                                               | Required diligence                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Local**      | New tool following existing patterns; bug fix inside one engine; new flag-gated feature group                          | Invariants checklist (below); targeted tests                                                                                   |
| **Contract**   | Any change to an existing tool's semantics, warn-vs-block boundaries, error codes, scoping rules, retry classification | ADR update + affected resources updated in the same change + behavioral tests                                                  |
| **Structural** | Schema evolution, layer consolidation, boundary moves, auth coverage changes                                           | ADR **required** + [invariants](invariants.md) review + [trust-boundaries](../security/trust-boundaries.md) review + full gate |

Rule of thumb: if two actors (human or agent) could observe different behavior after your
change, it is at least a contract change.

## The invariant-preserving checklist (run before merging)

1. Does this change affect **identity injection** or fallback identities? (INV-01)
2. Does every new read/write path respect **project/visibility scoping**? (INV-02)
3. Does anything **delete or mutate memory** outside the snapshot + lifecycle + reset
   rules? (INV-03/04)
4. Does any new overlap/lock/ownership signal **warn + materialize** (or is it a
   justified, documented correctness block)? (INV-05/06/07)
5. Does any work-owning feature keep **claim-once + explicit reassignment**? (INV-08)
6. Are inputs **validated before execution** and errors **structured**? (INV-09)
7. Does anything **auto-retry a write**? (INV-10 — must be no)
8. Does anything **print to stdout** from the MCP process? (INV-11 — must be no)
9. Does anything touch **credentials, secrets, or audit**? Re-check encrypt/fail-closed/
   mask/redact-before-persist/best-effort-never-throws. (INV-12/13)
10. Is schema change **additive and existence-gated**? (INV-14)
11. Do **flag defaults** stay posture-correct (risky = off)? (INV-15)
12. Is any destructive path **confirmation-gated and logged**? (INV-16)
13. Is activity still **append-only**? (INV-17)
14. Is advertised surface still **honest** (ship capability + advertisement together)? (INV-18)
15. Do **session/project isolation** properties survive? (INV-02/20)

If any answer is uncomfortable, the change is a contract/structural change — stop and
follow the heavier path.

## Per-domain evaluation rules

### Schema changes

- Additive only (INV-14); existence-gated; new entities inherit the universal columns
  (id/agent/project/session/scope/tags/metadata/version/timestamps) so scoping and
  versioning come free.
- New cross-entity references are **soft links** (stored id arrays) unless referential
  integrity is specifically justified; add idempotency uniqueness where creates can
  replay.
- Update [context-model](../architecture/context-model.md) if entity shape changes.

### MCP contract changes

- New tools: additive registration, validated schema, structured errors, honest
  description (INV-09/18).
- Existing tool changes: new tool or explicitly-versioned semantics — never silent redefinition.
- Warn-vs-block boundaries and retry classification are contract surfaces: changing them
  requires an ADR ([tool-contracts](../mcp/tool-contracts.md)).

### Authentication / trust changes

- Guard-coverage changes alter the trust model: update
  [trust-boundaries](../security/trust-boundaries.md) and
  [authentication-authorization](../security/authentication-authorization.md) in the same
  change; treat the local-first stance as an explicit decision, not a default to erode.
- Any new credential handling inherits encrypt / fail-closed / mask (INV-12).

### Memory-model changes

- Lifecycle, versioning, ranking factors, and conflict resolution order (importance →
  recency) are load-bearing: changes ripple into retrieval, collaboration, and agent
  workflows. Update [memory-model](../memory/memory-model.md),
  [memory-lifecycle](../memory/memory-lifecycle.md),
  [context-retrieval](../memory/context-retrieval.md) together.

### Collaboration-semantics changes

- The warn-vs-block boundary is the system's most user-visible contract. Moving a signal
  across it (or adding a new one) requires: ADR, [conflict-handling](../collaboration/conflict-handling.md)
  update, and explicit consideration of the human-override property.

## The dual-layer rule (current structural debt)

The tree contains a live layer and an unwired second layer with **diverging semantics**
([architectural-decisions.md](architectural-decisions.md) — open debt). Until
consolidated: **verify which layer a code path belongs to before extending it**, and do
not "fix" divergence by editing the dormant layer expecting it to matter — it is not
reachable through either entry point today.

## Documentation synchronization (same change, not later)

| When you change…                 | Update in the same change                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| An ADR-relevant decision         | [architectural-decisions.md](architectural-decisions.md) + affected domain resources |
| An invariant's enforcement       | [invariants.md](invariants.md) (statement or enforcement column)                     |
| Terminology                      | [terminology.md](../foundation/terminology.md) + every usage                         |
| A subsystem's responsibilities   | [component-responsibilities.md](../architecture/component-responsibilities.md)       |
| Behavior described in a resource | The resource itself — **code wins, then fix the document**                           |

Resources carry `last_reviewed` dates: bump them only on actual review against code.
Dated observations ("as of …") are re-checked during review, not silently trusted.

## When an ADR is required

- Any **structural** change (schema, boundaries, layers, auth coverage)
- Any change to a **recorded decision** (AD-01…AD-14) — reversal or material amendment
- Any **flag-default flip** on a risky feature (posture change = decision)
- Retiring or adding an **invariant**
- Anything whose rationale a future agent could not recover from the code alone — write
  the reasoning down while you know it

## Changing safely, in practice

1. Read the relevant domain resource + invariants **before** designing.
2. Classify the change (local / contract / structural) honestly.
3. Verify layer wiring if touching coordination semantics (dual-layer rule).
4. Implement with the checklist; add behavioral tests at the right layer
   ([validation-principles](../reliability/validation-principles.md)).
5. Run the smallest relevant suites, then the full default gate; claim only observed
   results.
6. Update synchronized documentation in the same change; commit resources alongside the
   code they describe.

## Evidence

- `AGENTS.md`, governance docs — repository change discipline this file formalizes
- `src/core/database/sqlite/schema.js` — additive-migration precedent
- `mcp-server.js`, `utils/*` — the semantics the checklist protects
- `resources/governance/invariants.md` — the invariant references used above

**Status**: Confirmed (procedures derive from recorded invariants/decisions and repo
governance); the dual-layer rule is a **dated interim rule** pending consolidation.
