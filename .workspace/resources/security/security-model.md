---
title: Security Model
category: security
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Security Model

The security philosophy of a **local-first coordination layer**: fail-closed where it
matters, advisory where humans must stay in control, and redacted everywhere state is
kept or shown.

## The stance in one sentence

Convenience may degrade **with warning**; secrecy and isolation never degrade **silently**.

That asymmetry runs through every security decision in this system.

## Fail-closed defaults

| Surface               | Default posture                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Execution sandbox     | **Off** (feature flag); when enabled, refuses to execute without verified Docker isolation (`SANDBOX_START_FAILED`) — **no host fallback, ever** |
| Encrypted credentials | Decrypt **fails closed** without the key; a plaintext-degrade path may _write_ for migration but **emits an explicit warning**                   |
| Destructive resets    | Require escalating, literal confirmation codes; every reset is logged                                                                            |
| Unresolved identity   | Work **stops**; reserved fallback identities are misconfigurations, not identities                                                               |

Dangerous capability is opt-in and verified, never assumed.

## Redaction and masking

Two layers, applied in order:

1. **Redaction before persistence** — sensitive values (secrets, tokens, source content,
   environment values, absolute host paths, stack traces) are stripped _before_ they hit
   storage (audit-path concept: a sensitive-key list governs what may be recorded).
2. **Masking on every external surface** — stored credentials are never echoed through
   routes, tool output, or logs ([server-registry](../mcp/server-registry.md)).

The ordering matters: redact first so even a storage-level leak is already clean; mask
later so even correct storage can't leak through display.

## Least privilege

- Execution-domain permissions are **narrow-only** (additive capability grants; nothing
  widens, nothing implies a shell or host mounts) — enforced at policy computation, before
  any approval exists ([change-guidelines](../governance/change-guidelines.md) on changing it).
- **Identity is never caller-asserted** where a trusted source exists: the MCP path
  injects `(agent, project, scope)` from resolved configuration; the execution domain
  formally rejects caller-supplied identity ([design-principles](../foundation/design-principles.md) §1).
- Capability (a skill claim) is kept distinct from permission (an authority grant) — see
  [authentication-authorization](authentication-authorization.md).

## Auditability

Three traces, none optional-by-omission:

- **Activity stream** — every meaningful operation, including resets, is recorded
  (implicit audit trail — [activity-model](../collaboration/activity-model.md)).
- **Version snapshots** — every memory mutation captures prior state first.
- **Execution audit (opt-in domain)** — redacted, best-effort, and _must never throw_:
  an audit hiccup may not block or mask a decision, and the failure is surfaced on the
  receipt rather than hidden.

## Trust stance: local-first

The HTTP API assumes a **trusted local network** (localhost / LAN tooling). This is a
deliberate posture, not an oversight: coordination state is a local development-time
concern, and the documented guidance is to put a reverse proxy with real authentication
in front before exposing it. What is guarded today (registry routes) versus assumed-local
today (core coordination routes) is spelled out in
[trust-boundaries](trust-boundaries.md) — and both are **dated facts to re-verify**, not
permanent promises.

## Concepts kept distinct

| Concept        | Question                                 | Where it lives                                               |
| -------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Authentication | Who proved they are?                     | JWT / API keys                                               |
| Authorization  | May this actor do this?                  | Roles/permissions (registry); narrow-only policy (execution) |
| Identity       | Which actor is stamped on this record?   | Trusted config injection                                     |
| Capability     | What can this actor _do_ (skill)?        | Agent/task routing — not security                            |
| Trust          | Which network/surfaces are assumed safe? | Local-first stance + boundaries                              |
| Auditability   | What trace remains?                      | Activity, versions, redacted audit                           |

Collapsing any two of these is how security bugs start — e.g. treating a capability
claim as a permission, or a lock as authentication.

## Invariants (see [invariants](../governance/invariants.md))

- Credentials: encrypted at rest, fail-closed decryption, masked on all external surfaces.
- Redaction happens _before_ persistence; masking _before_ exposure.
- Dangerous features default off; isolation failures refuse to degrade to host execution.
- Best-effort telemetry never throws, blocks, or masks a decision.
- Destructive operations require escalating confirmation and are logged.

## Evidence

- `src/core/execution/policy.js`, `audit.js`, `index.js` — fail-closed, narrow-only, redact-before-persist, best-effort audit
- `src/core/mcp-registry/crypto.js` — encrypt / fail-closed / plaintext-degrade-with-warning
- `utils/resetEngine.js` — confirmation-gated, logged destruction
- `src/core/auth/` — authentication concepts
- `SECURITY.md` — stated posture (note: contains dated statements — verify against code)

**Status:** Confirmed (postures verified in code); SECURITY.md and route-guard coverage
carry **dated observations** — see [trust-boundaries](trust-boundaries.md).
