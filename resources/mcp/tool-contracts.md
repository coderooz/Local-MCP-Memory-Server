---
title: Tool Contracts
category: mcp
status: active
stability: durable
audience:
  - ai-agents
  - maintainers
last_reviewed: 2026-10-21
---

# Tool Contracts

The contract principles every tool on this server honors: validation, identity,
additivity, and the warn-vs-block mechanics that make collaboration advisory.

## Anatomy of a tool

Each tool is a name, a schema, and a description exposed through discovery. Descriptions
are part of the contract: agent instructions and usage guidance ride the initialize
handshake and tool metadata, so honest, accurate descriptions are a coordination surface,
not documentation garnish.

## Contract principles

### 1. Validate before executing

Arguments are schema-validated **before** any handler runs. Invalid input is refused with
a structured `INVALID_INPUT` protocol error — never partially executed, never coerced
silently. This is a hard-block boundary ([conflict-handling](../collaboration/conflict-handling.md)).

### 2. Identity comes from trusted configuration

On the MCP path, `agent`/`project`/`scope` are **injected from resolved configuration**
and stamped onto every write ([project-identity](../projects/project-identity.md)). A
caller cannot assert false attribution. (The execution domain formalizes this further by
rejecting caller-supplied identity outright.)

### 3. Additive registration

Tool groups register additively: base tools, feature-flagged groups (registry, execution,
integrations), and dynamically discovered proxied tools ([extensibility](../architecture/extensibility.md)).
**Existing tool contracts are not modified** when new tools appear — clients that don't
know a new tool are unaffected.

### 4. Honest advertisement

The server deliberately withholds advertising capabilities it hasn't implemented (a
recorded decision — tool-list notifications stay off until there is something real to
announce). Advertising is committing.

### 5. Structured everything

Errors carry a stable machine code plus `{error, message, details}` — no bare strings, no
stack traces to callers. Unknown tools get a distinct code from failing tools.

## Warn-vs-block mechanics (how advisory works at the protocol edge)

```text
Backend response { success:true, warnings[] }
    → tool result: success, warnings surfaced to the caller (advisory)

Backend response { error } or { success:false, error }
    → tool throws → structured JSON-RPC error (hard failure)
```

The mechanical rule: **a string `error` field means hard failure; `warnings[]` means the
operation succeeded and something overlapped.** Collaboration signals ride `warnings[]`;
correctness boundaries ride `error`. This is the protocol-edge half of the
warn-and-coordinate stance ([human-agent-collaboration](../collaboration/human-agent-collaboration.md)).

## Retry classification (contract-relevant)

Tool calls are classified: **reads/safe calls may retry** on timeout, network, or
upstream failure; **writes are single-shot, never auto-retried**. Clients therefore never
need idempotency keys for tool writes — a failed write is reported as failed, full stop
(see [reliability-model](../reliability/reliability-model.md)).

## What tool contracts must not do

- Change semantics of an existing tool in place (add a new tool instead)
- Leak internals (stack traces, storage details, credentials) in errors
- Accept caller-asserted identity where configuration exists
- Advertise unimplemented capability
- Auto-retry a write

## Invariants

- Validation precedes execution; invalid input is a structured refusal.
- Identity is injected from trusted configuration.
- Tool registration is additive; existing contracts are immutable in place.
- Warnings ride success; errors are structured and coded.

## Evidence

- `mcp-server.js` — validation-before-dispatch, error structuring, retry classification,
  capability-advertisement decision
- `src/interfaces/mcp-tools/tool-definitions.js` — contract shapes
- `tests/mcp-architecture-audit-test.js`, `tests/mcp-resilience-test.js` — protocol behavior

**Status:** Confirmed (all five principles + warn-vs-block mechanics).
