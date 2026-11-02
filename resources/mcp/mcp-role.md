---
title: MCP Role
category: mcp
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# MCP Role

What the Model Context Protocol provides, and what this server adds on top of it.

## What MCP provides

MCP (Model Context Protocol) is an open protocol for connecting AI clients (editors,
agent hosts, tools) to external capability servers. Conceptually it standardizes:

- **Transport** — a JSON-RPC 2.0 channel between client and server (this server uses stdio)
- **Tool discovery** — clients enumerate available tools with schemas and descriptions
- **Tool invocation** — clients call tools with structured arguments and receive results
  or structured errors
- **Instructions** — servers can embed usage guidance in the initialize handshake

MCP is the _control plane_ for capability exposure. It is stateless about your data — it
moves requests; it does not remember your project.

## What this server adds

Local-MCP-Memory is itself an MCP server, but its product is **persistent shared
coordination state** exposed _through_ MCP tools:

| MCP gives           | This server adds                                                  |
| ------------------- | ----------------------------------------------------------------- |
| Tool call transport | Durable, project-scoped memory that outlives sessions             |
| Schema'd invocation | Tasks, issues, locks, agents, activity — coordination primitives  |
| Discovery           | Project descriptors and maps — project intelligence               |
| —                   | MCP server registry: registering and proxying _other_ MCP servers |
| —                   | Cross-session, cross-actor continuity of all of the above         |

The key inversion: an ordinary MCP server is a _function_; this one is a _stateful
coordination layer_ that happens to speak MCP. Its tool calls read and write the same
persistent project state from every actor.

## Why an MCP server is the right shape for coordination

- **Universal client access**: any MCP-capable editor/agent host can coordinate without
  custom integration — the protocol is the integration.
- **Session independence**: the server's state persists between client sessions; a client
  disconnect changes nothing about the project.
- **Standard discovery**: agents discover coordination capabilities exactly how they
  discover any tool — no special-casing.
- **Local-first fit**: stdio servers run beside the project, matching the embedded,
  no-external-service stance ([system-philosophy](../foundation/system-philosophy.md) §9).

## The dual-surface architecture

This server exposes two surfaces over the same backend:

1. **MCP stdio server** — the primary agent-facing surface (tool discovery + invocation)
2. **HTTP API + dashboard** — the human/programmatic surface, same semantics, same state

The MCP layer translates tool calls into backend HTTP calls through a reliability envelope
(timeouts, safe-retry classification, circuit breaking) — see
[tool-contracts](tool-contracts.md) and [reliability-model](../reliability/reliability-model.md).

## Qualifying "MCP server"

The vocabulary separates two senses (see [terminology](../foundation/terminology.md)):

- **MCP server** (singular, internal) — _this_ server.
- **MCP servers** (plural, registry) — _external_ servers registered into the registry and
  proxied through this one ([server-registry](server-registry.md)).

Always qualify which sense is meant — "MCP server registry" means external servers.

## Invariants

- The MCP surface is additive: new tool groups register without modifying existing
  contracts.
- Advertised capabilities are implemented — honest advertisement is a protocol decision.
- stdout carries protocol output only; diagnostics go to stderr.

## Evidence

- `mcp-server.js` — protocol implementation, tool surface, initialization handshake
- `mcp-shim.js` — client integration path
- `README.md` — MCP-server positioning

**Status:** Confirmed (protocol role, dual surface, translation architecture).
