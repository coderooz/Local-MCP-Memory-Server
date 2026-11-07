# Connection Lifecycle & Recovery

## Overview

This document describes how the MCP connection lifecycle works, how runtime state is managed, and how the system recovers from connection failures.

---

## Multi-Node Connection Architecture

### The Problem

Multiple OpenCode terminals (nodes) could not connect to the same MCP server simultaneously. The first node connects, but subsequent nodes fail.

### Root Causes

1. **Cache never refreshed**: Runtime state was cached in each node's memory forever
2. **PID validation too strict**: `process.kill(pid, 0)` fails for cross-parent PIDs
3. **Validation blocked all**: Connection was rejected if PID validation failed, even when port was alive

### The Fix (v2.5.2 & v2.6.0)

1. **Cache TTL**: Runtime now auto-refreshes after 500ms
2. **Port-first validation**: Port liveness is checked BEFORE PID
3. **PID optional for clients**: If port is alive, PID validation failure doesn't block client connection
4. **Dynamic Port Range (v2.6.0)**: Port manager allocates in range `47000..47020` with `4000` backward compatibility
5. **Port Congruence (v2.6.0)**: Server validates `portMatches` before reusing runtime files to prevent cross-port hijacking
6. **Dead-PID Lock Recovery (v2.6.0)**: File lock acquisition detects crashed processes via `isValidPID` and clears stale locks immediately
7. **Windows Process Liveness (v2.6.0)**: Handles Windows `EPERM` vs `ESRCH` so non-killable system processes aren't misclassified as dead

### Shared State

All nodes share the same `.mcp-runtime.json` file:

```
Node A (terminal 1) → MCP Server :47000..47020 (or :4000)
Node B (terminal 2) → MCP Server :47000..47020 (or :4000)  (same server!)
Node C (terminal 3) → MCP Server :47000..47020 (or :4000)  (same server!)
```

### Connection Model

```
ONE MCP Server ←── MANY Clients (nodes)
     │
     ↓
.port file shared across all nodes
     │
     ↓
Each node: reads fresh from disk, validates port, connects
```

### Isolation Preserved

Isolation applies to:

- Memory (contexts scoped to project/agent)
- Tasks (assigned to specific agents)
- Messages (per-agent inbox)
- Agent registry (per-project)

Isolation does NOT apply to:

- Connection layer (shared port)
- Runtime state file (global)

---

## Runtime State Management

### Files

- **`.mcp-runtime.json`** - Runtime state file (auto-generated, git-ignored)
- **`core/config/runtime-state.js`** - Runtime state management module

### Runtime State Schema

```json
{
  "port": 4000,
  "pid": 12345,
  "startedAt": 1699999999999,
  "hostname": " workstation",
  "status": "running"
}
```

---

## Connection Flow

```
1. Agent starts
   ↓
2. Read .mcp-runtime.json
   ↓
3. Validate runtime (PID + port)
   ↓
4. If valid → connect to port
   ↓
5. If invalid → fallback discovery
   ↓
6. Connect or fail with error
```

---

## Validation Layer

### `validateRuntime(runtime)`

Before using the runtime state, the system validates:

1. **PID Validation** (`isValidPID`)
   - Uses `process.kill(pid, 0)` to check if process exists
   - Returns `false` if process doesn't exist or access denied

2. **Port Liveness** (`isPortAlive`)
   - Creates TCP socket connection to port
   - Returns `true` if connection succeeds (port is listening)
   - Returns `false` if connection fails (port not available)

### Validation Result

```js
{ valid: true, reason: 'ok' }
{ valid: false, reason: 'invalid_pid' }
{ valid: false, reason: 'port_not_alive' }
{ valid: false, reason: 'runtime_stopped' }
```

---

## Failure Recovery

### Scenario 1: Stale Runtime File

**Problem**: `.mcp-runtime.json` contains old PID/port but process is dead

**Solution**:

1. `validateRuntime()` returns `valid: false`
2. `invalidateRuntime()` deletes the runtime file
3. Fallback port discovery scans for available port

### Scenario 2: Port Not Listening

**Problem**: Runtime shows port 4000 but nothing is listening

**Solution**:

1. `isPortAlive(4000)` returns `false`
2. Port is marked as stale
3. New port discovery triggered

### Scenario 3: Process Killed

**Problem**: MCP server process killed but runtime not updated

**Solution**:

1. `isValidPID(pid)` returns `false` (signal 0 fails)
2. Runtime invalidated
3. Connection manager retries with fallback ports

---

## Shutdown Hooks

### server.js

```js
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', cleanupOnError);
```

On shutdown:

1. Closes HTTP server
2. Closes SQLite database
3. Calls `setMcpStopped()` to clear runtime

### mcp-server.js

```js
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

On shutdown:

1. Calls `setMcpStopped()`
2. Calls `invalidateRuntime()` to delete runtime file

---

## Port Discovery Fallback

Dynamic range and fallback ports in order:

```js
// Dynamic range: 47000..47020
// Default fallback ports:
[4000, 47000, 47001, 47002, 3000, 5000, 8080, 8888];
```

Discovery logic:

1. Try cached runtime port from `.mcp-runtime.json` (if valid and portMatches is true)
2. Scan dynamic port range (`47000..47020`) and fallback ports for available port
3. Clean up any dead PID file locks encountered during startup
4. Return first available port or bind dynamically

---

## Error Handling

| Error                                    | Cause                             | Recovery                       |
| ---------------------------------------- | --------------------------------- | ------------------------------ |
| `-32603: Cannot read properties of null` | Runtime was null or port was null | Clear runtime, retry discovery |
| `MCP port not available`                 | No ports available                | Wait for server start          |
| `Health check failed`                    | Server not ready                  | Retry with backoff             |

---

## Best Practices

1. **Never trust runtime file blindly** - Always validate before use
2. **Clean up on shutdown** - Ensure runtime file is cleared
3. **Use fallback ports** - Don't rely on single port
4. **Log validation failures** - Help debug connection issues
