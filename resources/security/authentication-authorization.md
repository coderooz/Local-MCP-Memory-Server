---
title: Authentication and Authorization
category: security
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Authentication and Authorization

Concepts first, wiring second: what authentication _means_ here, what is enforced today,
and what is deliberately assumed-local.

## Concepts (kept distinct)

- **Authentication** — proving _who_ is calling (token/key verification).
- **Authorization** — whether that actor _may_ perform this operation (roles, permissions,
  policy).
- **Identity** — the actor attribution stamped onto records (from trusted config on the
  MCP path — never from caller claims where a trusted source exists).
- **Capability** — a declared skill for _routing_ work; **not** a security grant.

The system's coordination surface is intentionally light on authentication (see the trust
stance below); its execution surface is intentionally strict on _identity_ and _policy_
even in the absence of interactive auth. Knowing which surface you're reasoning about is
everything.

## The local-first trust stance

The documented posture: the HTTP API is a **local development-time surface** on a trusted
network. Coordination routes (memory, tasks, locks, activity, agents) are therefore
**unauthenticated by design today** — actor identity on those routes is client-claimed and
advisory-by-construction ([trust-boundaries](trust-boundaries.md)). Exposure beyond
localhost is expected to go through a reverse proxy that provides real authentication —
the project documents this rather than pretending the API is internet-safe.

This is a _stance with a boundary_: what is unauthenticated today is unauthenticated
because it is local, not because it is considered harmless. Coverage changes are contract
changes ([change-guidelines](../governance/change-guidelines.md)).

## What is guarded today (Confirmed, re-verify when relying on it)

| Surface                                                             | Posture (as of last review)                |
| ------------------------------------------------------------------- | ------------------------------------------ |
| **Registry routes** (external MCP servers — where credentials live) | Authenticated: JWT/API-key guard applied   |
| **Core coordination routes**                                        | Unauthenticated (local-first stance above) |
| **Auth routes themselves**                                          | Login/register endpoints issue tokens/keys |

An observed structural note (dated): an optional-auth middleware exists in the codebase
but is not wired into the core route chain — do not assume "auth exists" means "routes are
protected"; check the actual wiring for the route you care about.

## Credentials and keys (concepts)

- **Tokens** (JWT class) — short-lived proof of authentication for API sessions.
- **API keys** — longer-lived credentials, created through the auth flow, listed only in
  **redacted** form (key material is never returned after creation).
- **Key derivation** — stored key material is protected by salted derivation
  (implementation-specific algorithm) with expiry concepts.
- **Master secret** — a server-level secret that _keys credential encryption_ for the
  registry ([security-model](security-model.md)); when it is unset, encrypted credentials
  fail closed and plaintext-degrade writes warn — an unconfigured secret is a visible
  posture gap, not a silent one.

No secret values belong in documentation, logs, tests, or this resource layer.

## Authorization models by surface

| Surface          | Model                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Coordination API | None (advisory ownership; warnings, not denials — [conflict-handling](../collaboration/conflict-handling.md))                           |
| Registry         | Route guard (authenticated) + project-scoped rows                                                                                       |
| Execution domain | **Policy-first**: narrow-only permission computation before approvals; hash-bound approvals; caller-supplied identity rejected outright |
| MCP stdio        | Process-local trust; identity from resolved configuration                                                                               |

The execution domain is the template for how this system does strict security: _identity
from trusted sources, least-privilege policy computed before any grant, every grant
recorded._

## Anti-patterns

- Assuming a capability claim, lock, or ownership record is authentication (none of them are).
- Enabling auth on some coordination routes and not others without documenting the split —
  partial protection invites false confidence.
- Logging or documenting key material "just for tests."
- Treating the local-first stance as license to run the API on a public interface.

## Invariants

- Registry (credential-bearing) routes stay authenticated.
- Key material is never listed, logged, or returned post-creation.
- Execution identity is caller-independent; policy is narrow-only and computed pre-approval.
- Any change to _which_ routes are guarded is a documented contract change.

## Evidence

- `src/core/auth/` — tokens, API keys, derivation, login/register flow
- `server.js` — route guard application (registry) and the unwired optional-auth import
- `src/core/execution/policy.js`, `index.js` — policy-first, identity-rejection model
- `core/config/project-config-loader.js` — master-secret-driven encryption posture

**Status:** Confirmed (models, guard coverage as wired at last review); route coverage is
a **dated fact — re-verify** before relying on it.
