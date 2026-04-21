# Reliability Guide

This document describes the production reliability model used by the MCP system.

## Scope

The system architecture is intentionally unchanged:
- MCP stdio JSON-RPC interface (`mcp-server.js`)
- Shim bridge for editor/runtime integration (`mcp-shim.js`)
- HTTP memory/task backend (`server.js`)

Reliability work is applied as hardening in the existing flow.

## Chaos Testing Approach

Primary release gate:
- `node scripts/chaos-test.js`

What it validates:
- parallel mixed MCP calls (`store_context`, `search_context`, `update_context`, `create_task`, `send_message`)
- controlled malformed input ratio
- random interleaving/delay
- retry-aware read execution paths
- tool discovery and core-tool execution
- multi-session isolation (cross-project leakage check)
- stdio protocol integrity (JSON-only stdout)
- structured pass/fail summary output

Additional resilience suites:
- `node tests/mcp-stdio-stabilization-test.js`
- `node tests/mcp-chaos-resilience-test.js`

## Reliability Mechanisms

### 1. Timeout + Abort
- All MCP -> HTTP requests use bounded timeouts.
- Timeout triggers an abort and returns a structured `TIMEOUT` error.

### 2. Safe Retries Only
- Retries apply to read/idempotent operations.
- Write operations are not retried by default to avoid duplicate side effects.

### 3. Circuit Breaker
- Repeated upstream failures open a short cooldown window.
- During cooldown, requests fail fast with structured `CIRCUIT_OPEN` errors.

### 4. Strict Input Validation
- MCP tool arguments are validated against tool schema before HTTP execution.
- Invalid payloads return structured `INVALID_INPUT` errors early.

### 5. Structured Error Contract
- MCP error payloads include normalized structured metadata:
  - `error` (code)
  - `message`
  - `details` (optional)

### 6. STDIO Purity
- MCP stdout emits JSON-RPC responses only.
- Logging and diagnostics go to stderr only.

### 7. Health Surface
- `GET /health` returns:
  - status/uptime/version
  - DB connectivity
  - active connection counts
  - session counts (`active`, `idle`, `total`)

### 8. Safe Shutdown
- `SIGINT` and `SIGTERM` handlers perform graceful runtime cleanup and shutdown.

## Release Gate

The system is considered release-ready when:
- chaos test gate reports `PASS` / `READY`
- stdio stabilization tests pass
- no protocol corruption or hanging request behavior is observed
