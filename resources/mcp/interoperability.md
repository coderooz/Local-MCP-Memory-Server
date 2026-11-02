---
title: Interoperability
category: mcp
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Interoperability

How this server fits the broader MCP ecosystem: transports, versioning, client
integration, and the surfaces it deliberately does _not_ implement.

## Protocol posture

- **JSON-RPC 2.0 over stdio** is the implemented client-facing transport, with a
  **pinned protocol version** — deliberate, so clients negotiate against a known
  contract instead of a moving target.
- **stdout purity**: stdout carries protocol output _only_; every diagnostic goes to
  stderr. A single stray log line on stdout corrupts the client's JSON-RPC stream — this
  is an invariant, not hygiene ([invariants](../governance/invariants.md)).

## Client integration

A **shim layer** sits between editors and the server process: it resolves project
identity and environment first ([project-identity](../projects/project-identity.md)), then
spawns the server as a child with piped stdio. Editors integrate with the shim; the shim
guarantees identity is resolved before any tool call runs. The same resolution-before-work
ordering the agent instructions mandate is therefore _structurally enforced_ for stdio
clients.

## One server, many projects

The stdio server serves many sessions and projects over its lifetime. Project isolation is
logical (identity stamped per request, scoped reads/writes), and runtime discovery files
derive from project directories — two projects never collide on runtime state even when
sharing one server binary. See
[multi-agent-coordination](../collaboration/multi-agent-coordination.md) and
[context-model](../architecture/context-model.md).

## Proxied interoperability

The registry extends interoperability to _other_ MCP servers: external tools are surfaced
under a deterministic per-server namespace and dispatched through the proxy
([server-registry](server-registry.md)). This is the sanctioned integration path —
capabilities from other servers become callable with this server's validation, retry
classification, and masking applied at the edge.

## Surfaces deliberately not implemented

Honest advertisement cuts both ways — the server does not implement several MCP surfaces,
and does not pretend to:

| Surface                        | Posture                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Prompts                        | Not implemented (not advertised)                                                                     |
| Resources                      | Not implemented (not advertised)                                                                     |
| Sampling                       | Not implemented (not advertised)                                                                     |
| Tool-list change notifications | Withheld until genuinely implementable (recorded decision)                                           |
| SSE/HTTP client transports     | The MCP client-facing transport is stdio; the HTTP API is a _separate_ surface, not an MCP transport |

Not implementing is a compatibility _feature_: clients see exactly what exists. Adding any
of the above is an additive change reviewed as a protocol-contract change
([change-guidelines](../governance/change-guidelines.md)).

## Compatibility expectations

What future implementations should preserve:

- Pinned, negotiated protocol version behavior
- stdout purity
- Additive-only tool surface changes
- Honest advertisement (never advertise-before-implement)
- Identity resolution before first tool call on the stdio path

What may change freely (implementation-specific):

- Shim internals, spawn strategy, environment plumbing
- Proxied-tool naming format (as long as namespacing prevents collisions)
- Timeout/retry constant values

## Invariants

- stdout carries JSON-RPC only; diagnostics go to stderr.
- Protocol version is pinned; tool-surface changes are additive.
- Advertised surface == implemented surface.

## Evidence

- `mcp-server.js` — transport, version pinning, stdout discipline
- `mcp-shim.js` — identity-then-spawn integration
- `mcp-integration-tools.js` — gated integration tool groups
- `tests/mcp-stdio-stabilization-test.js`, `tests/mcp-architecture-audit-test.js` — posture verified

**Status:** Confirmed (stdio posture, purity, unpromised surfaces).
