---
title: Trust Boundaries
category: security
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Trust Boundaries

Where trust changes hands in this system, what crosses each boundary, and what each
boundary enforces. Boundaries are conceptual; the wiring that implements them is
implementation-specific and **re-verify before relying on coverage**.

```mermaid
flowchart TD
    C[MCP client<br/>editor / agent host] -->|B1: stdio JSON-RPC<br/>local process trust| S[mcp-server]
    S -->|B2: localhost HTTP<br/>internal| API[HTTP API + engines]
    D[Dashboard browser<br/>same-origin SPA] -->|B3: same-origin HTTP<br/>local-first| API
    X[External HTTP callers] -->|B4: local-first / proxy| API
    API <-->|B5: JSON-RPC + masked credentials| E[External MCP servers]
    S -.->|B6: policy + approvals only<br/>fail-closed| J[Docker sandbox (future exec)]
    API --> DB[(Embedded storage)]
```

## B1 — MCP client ↔ MCP server (stdio)

- **Trust**: the local process relationship — a client that can spawn/pipe the server is
  already machine-local trusted.
- **Enforced**: identity is injected from _resolved configuration_ before dispatch
  (callers cannot assert false attribution); validation precedes execution; stdout purity
  protects the client's parser.
- **Violates by**: piping untrusted remote input straight into tool calls as if it were
  local agent intent — the server trusts _configuration_, not remote content.

## B2 — MCP server ↔ HTTP backend (internal)

- **Trust**: internal localhost hop; the backend is embedded, not a remote service.
- **Enforced**: bounded timeouts, structured errors, circuit breaking — the reliability
  envelope is itself a boundary defense (a wedged backend fails fast, cleanly).
- **Violates by**: treating backend responses as validated at the wrong layer (the MCP
  layer still validates inputs; the backend still enforces scoping).

## B3 — Dashboard (browser) ↔ API

- **Trust**: same-origin SPA over the same API; human visibility surface.
- **Enforced**: it calls the _same routes_ with the _same semantics_ — no second
  business-logic path, so dashboard behavior can't diverge from API behavior.
- **Violates by**: adding dashboard-only privileged endpoints (a hidden second surface).

## B4 — External HTTP callers ↔ API (the sharpest edge)

- **Trust**: **local-first** — the API assumes a trusted local network; coordination
  routes are unauthenticated _by design today_; registry (credential-bearing) routes are
  guarded. Exposure beyond localhost is documented to go through a reverse proxy with
  real authentication ([authentication-authorization](authentication-authorization.md)).
- **Enforced**: route guard on registry; advisory (warning) semantics everywhere else —
  ownership/locks are coordination signals, not access control.
- **Violates by**: binding the API to a public interface without a proxy, or assuming
  client-claimed actor identity means anything to a hostile caller.

## B5 — Registry proxy ↔ external MCP servers

- **Trust**: explicitly _distrusted_: external servers are third parties carrying your
  tool calls — and holding _their_ credentials in your storage.
- **Enforced**: credentials encrypted at rest, fail-closed decryption, **masked on every
  external surface**; output scrubbing on proxied responses; per-server circuit breakers
  and named timeouts (a hostile/slow server cannot degrade the rest).
- **Violates by**: proxying without masking, logging proxied credentials, or trusting
  proxied tool output as validated input (it isn't — re-validate).

## B6 — Execution domain ↔ host (fail-closed)

- **Trust**: **none by default**: future script execution happens only inside an isolated
  Docker sandbox; the MCP process itself never executes scripts (foundational decision).
- **Enforced**: feature-flag off by default; sandbox-start verification before any
  execution (`SANDBOX_START_FAILED` refuses rather than degrading); policy computed
  narrow-only _before_ approvals; hash-bound approvals; caller identity rejected; redacted
  best-effort audit.
- **Violates by**: any host-execution fallback, any widening of policy after approval, any
  caller-supplied identity — these violate foundational decisions, not just config.

## Storage (cross-cutting)

One shared database file with **logical** project scoping (column-stamped, enforced,
tested — [context-model](../architecture/context-model.md)). The boundary is enforced at
query time via identity anchoring; physical partitioning is not used. Runtime discovery
files are validated (PID + port probed), never trusted as written.

## Rules for moving a boundary

Changing _what crosses_ or _what is enforced_ at any boundary is a **system-wide contract
change**: update the affected resources, [invariants](../governance/invariants.md), and the
relevant ADR in the same change ([change-guidelines](../governance/change-guidelines.md)).

## Evidence

- `mcp-server.js` — B1 validation/identity injection; B2 envelope; stdout purity
- `server.js` — B3/B4 route wiring and guard placement (re-verify coverage)
- `src/core/mcp-registry/` — B5 encryption, masking, scrubbing, breakers
- `src/core/execution/` — B6 fail-closed policy/approval model
- `src/core/session/` — runtime-file validation

**Status:** Confirmed (boundaries and their mechanisms); exact guard coverage on B4 is a
**dated fact — re-verify**.
