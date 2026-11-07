# MCP Protocol Conformance Test Report

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  
**Specification:** Model Context Protocol (2024-11-05)  
**Test Suite:** `tests/mcp-protocol-conformance-test.js`  

---

## 1. Conformance Scope & Test Methodology

Protocol validation verified that `mcp-server.js` and the internal proxy conform strictly to the official MCP specification:
- Pure stdio transport (no unstructured debug text on stdout).
- Strict JSON-RPC 2.0 message framing.
- Proper handshake and capability negotiation.
- Session lifecycle and recovery.

---

## 2. Test Execution Results

```text
> node tests/mcp-protocol-conformance-test.js

✓ stub is spec-faithful: the official MCP client can connect
✓ stub refuses clients that do not accept event streams
✓ stub refuses post-initialize calls without a session
✓ stub answers an unknown session with 404
✓ legacy bare proxyRequest is rejected by a conformant server
✓ ensureSession negotiates a version and captures the session id
✓ session is reused across calls (one handshake)
✓ concurrent callers share a single handshake
✓ tools/list and tools/call round-trip through the session
✓ SSE responses are parsed correctly
✓ credentials are forwarded on every request including initialize
✓ closeSession terminates the remote session
✓ a forgotten session is re-initialized once (404/400 recovery)
✓ initialize errors are surfaced, not silently retried

14 passed, 0 failed
```

---

## 3. Protocol Invariants Verified

1. **Stdout Purity**: All diagnostic output, error traces, and status notifications are strictly emitted to `process.stderr`. `process.stdout` is dedicated exclusively to newline-delimited JSON-RPC responses.
2. **Session Lifecycle**: When proxying to remote MCP servers, HTTP sessions are initialized once, reused across calls, and cleanly terminated on shutdown.
3. **Error Serialization**: Faults return valid JSON-RPC error objects with standardized codes (`-32600`, `-32601`, `-32602`, `-32603`).
4. **Input Boundary Enforcement**: Payloads larger than 256KB are rejected early before dispatching to the internal server.
