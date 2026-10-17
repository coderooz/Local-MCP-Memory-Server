# Error Paths — Logic Flow Index

**Project:** local-mcp-memory
**Version:** 2.6.0
**Last Updated:** 2026-09-19

---

## Error Classification

| Category       | Severity | Recovery        | Example             |
| -------------- | -------- | --------------- | ------------------- |
| STARTUP        | Critical | Abort           | DB init failure     |
| DATABASE       | High     | Retry/Abort     | Connection lost     |
| TOOL_EXECUTION | Medium   | Return error    | Tool not found      |
| VALIDATION     | Low      | Return error    | Invalid input       |
| CONCURRENCY    | Medium   | Conflict report | Version mismatch    |
| PLUGIN         | Low      | Skip plugin     | Plugin load failure |
| NETWORK        | High     | Circuit breaker | Server unreachable  |

---

## Startup Errors

### E-START-001: Database Initialization Failure

**Trigger:** SQLite database fails to initialize

**Error Type:** `Error('Failed to initialize SQLite: ${message}')`

**Handling Mechanism:**

- `src/core/database/sqlite/index.js` catches initialization errors
- Propagates to `src/core/database/connection.js:30-36`
- Connection promise rejects

**Recovery Path:**

1. Log error to stderr
2. Throw error (fatal — server cannot start)
3. Process exits with code 1

**User-Facing Behavior:**

- MCP server fails to start
- Error message on stderr

**Logging:** `console.error('[database] Failed to initialize SQLite:', error.message)`

---

### E-START-002: Port Binding Failure

**Trigger:** Express server cannot bind to configured port

**Error Type:** `EADDRINUSE` or similar

**Handling Mechanism:**

- `core/config/portManager.js` attempts port allocation
- Falls back to dynamic port selection
- `core/config/runtime-state.js` tracks runtime state

**Recovery Path:**

1. Try configured port
2. If EADDRINUSE, try next port (0 = dynamic)
3. If all ports exhausted, throw error

**User-Facing Behavior:**

- Server starts on alternative port
- Port logged to stderr

**Logging:** Port manager logs

---

### E-START-003: Plugin Initialization Failure

**Trigger:** Critical plugin fails to load

**Error Type:** `Error('Failed to load plugin "${name}": ${message}')`

**Handling Mechanism:**

- `core/plugin/plugin-manager.js:72-74` catches import errors
- Logs error but continues (non-fatal)
- Plugin marked as failed

**Recovery Path:**

1. Log error
2. Skip failed plugin
3. Continue with remaining plugins
4. Server starts without failed plugin

**User-Facing Behavior:**

- Warning logged
- Plugin-dependent features unavailable
- Server operational for non-plugin features

**Logging:** `console.error('[PluginManager] Failed to load plugin "${name}":', error.message)`

---

## Database Errors

### E-DB-001: Database Not Ready

**Trigger:** Database operation attempted before initialization

**Error Type:** `Error('Database not ready')`

**Handling Mechanism:**

- `src/core/database/connection.js:18` throws immediately
- Caught by caller

**Recovery Path:**

1. Wait for database initialization
2. Retry operation
3. If persistent, check startup logs

**User-Facing Behavior:**

- MCP tool returns error response
- HTTP API returns 503

**Logging:** Caller-dependent

---

### E-DB-002: Query Execution Failure

**Trigger:** SQLite query fails (syntax, constraint, etc.)

**Error Type:** SQLite error (various codes)

**Handling Mechanism:**

- `src/core/database/sqlite/collection.js` wraps SQLite errors
- Propagates to domain service
- Domain service formats error response

**Recovery Path:**

1. Log query and error
2. Return structured error to caller
3. No automatic retry (data integrity risk)

**User-Facing Behavior:**

- MCP tool returns error with details
- HTTP API returns 400/500

**Logging:** SQLite error + query context

---

### E-DB-003: Connection Lost

**Trigger:** SQLite connection unexpectedly closes

**Error Type:** `SQLITE_BUSY` or `SQLITE_LOCKED`

**Handling Mechanism:**

- `better-sqlite3` busy timeout handles transient locks
- WAL mode allows concurrent reads
- `connectionResolver.js` handles reconnection

**Recovery Path:**

1. Busy timeout retries (default: 5s)
2. If persistent, reconnection attempt
3. If reconnection fails, server restart required

**User-Facing Behavior:**

- Transient: request delayed
- Persistent: error response

**Logging:** `connectionResolver.js` logs

---

## Tool Execution Errors

### E-TOOL-001: Tool Not Found

**Trigger:** MCP request for non-existent tool

**Error Type:** `Error('Tool handler not found: ${name}')`

**Handling Mechanism:**

- `src/core/mcp/tool-executor.js:16` throws
- Caught by `mcp-server.js` error handler
- MCP error response returned

**Recovery Path:**

1. Return MCP error response
2. No retry (tool doesn't exist)

**User-Facing Behavior:**

- MCP client receives error response
- Tool name included in error

**Logging:** stderr in mcp-server.js

---

### E-TOOL-002: Circuit Breaker Open

**Trigger:** Too many consecutive failures (threshold: 5)

**Error Type:** `Error('Circuit breaker open — server unreachable')`

**Handling Mechanism:**

- `mcp-server.js:99-108` tracks consecutive failures
- Opens circuit after threshold
- Cooldown period: 10s

**Recovery Path:**

1. Return error immediately (no HTTP call)
2. After cooldown, allow single probe request
3. If probe succeeds, close circuit
4. If probe fails, reopen circuit

**User-Facing Behavior:**

- Fast error response (no delay)
- Circuit state logged

**Logging:** Circuit state changes logged

---

### E-TOOL-003: Payload Too Large

**Trigger:** MCP argument exceeds size limit (256KB)

**Error Type:** `Error('Argument payload exceeds maximum size')`

**Handling Mechanism:**

- `mcp-server.js:75-76` validates payload size
- Rejects before HTTP call

**Recovery Path:**

1. Return validation error
2. No retry (input is invalid)

**User-Facing Behavior:**

- MCP error response with size limit info
- Suggestion to reduce payload

**Logging:** stderr in mcp-server.js

---

### E-TOOL-004: Agent ID Validation Failure

**Trigger:** Agent ID contains invalid characters

**Error Type:** Validation error response

**Handling Mechanism:**

- `mcp-server.js:96-97` validates agent ID pattern
- Pattern: `/^[a-zA-Z0-9_-]{1,128}$/`

**Recovery Path:**

1. Return validation error
2. Include expected format in error

**User-Facing Behavior:**

- MCP error response
- Agent ID format requirements shown

**Logging:** stderr in mcp-server.js

---

## Validation Errors

### E-VAL-001: Invalid Input

**Trigger:** Missing or malformed required fields

**Error Type:** `createErrorResponse('validation_error', message)`

**Handling Mechanism:**

- `utils/security-validators.js` validates all inputs
- Returns structured error (never throws)

**Recovery Path:**

1. Return validation error with details
2. Include field name and expected format

**User-Facing Behavior:**

- MCP/HTTP error response
- Clear error message

**Logging:** Input validation failures logged at debug level

---

### E-VAL-002: Project Name Invalid

**Trigger:** Project name contains invalid characters

**Error Type:** `createErrorResponse('invalid_project', message)`

**Handling Mechanism:**

- `utils/security-validators.js:validateProjectName()` checks format
- Pattern: alphanumeric, hyphens, underscores only

**Recovery Path:**

1. Return validation error
2. Sanitize suggestion provided

**User-Facing Behavior:**

- Error response with valid format example

**Logging:** Validation failure logged

---

## Concurrency Errors

### E-CONC-001: Version Conflict (Memory)

**Trigger:** Memory update conflicts with concurrent modification

**Error Type:** `createErrorResponse('version_conflict', message)`

**Handling Mechanism:**

- `utils/memoryEngine.js:detectAndResolveMemoryConflicts()` checks versions
- Optimistic concurrency control

**Recovery Path:**

1. Return conflict error with current version
2. Client re-reads and retries
3. No automatic merge

**User-Facing Behavior:**

- Error response with conflict details
- Current version included for retry

**Logging:** Conflict detected, versions compared

---

### E-CONC-002: Task Assignment Conflict

**Trigger:** Task already assigned to another agent

**Error Type:** `createErrorResponse('assignment_conflict', message)`

**Handling Mechanism:**

- `utils/coordinationEngine.js` checks assignment state
- Returns conflict without overwriting

**Recovery Path:**

1. Return conflict error
2. Include current assignee info
3. Client can force-assign or choose different task

**User-Facing Behavior:**

- Error with current assignment info

**Logging:** Assignment conflict logged

---

## Lock Errors

### E-LOCK-001: Resource Locked by Other Agent

**Trigger:** Soft lock held by different agent

**Error Type:** Warning (not error — soft lock)

**Handling Mechanism:**

- `utils/collaborationEngine.js` returns lock info
- Warning included in response (not blocking)

**Recovery Path:**

1. Return warning with lock holder info
2. Operation proceeds (soft lock)
3. Caller decides whether to proceed

**User-Facing Behavior:**

- Warning in response (operation succeeds)
- Lock holder agent ID included

**Logging:** Lock contention logged

---

### E-LOCK-002: Lock TTL Expired

**Trigger:** Lock held beyond TTL

**Error Type:** Automatic expiry (no error)

**Handling Mechanism:**

- `utils/collaborationEngine.js` cleanupExpiredLocks timer
- Removes expired locks

**Recovery Path:**

1. Expired lock automatically removed
2. New lock can be acquired
3. No manual intervention needed

**User-Facing Behavior:**

- Next lock request succeeds

**Logging:** Lock expiry logged

---

## Plugin Errors

### E-PLUGIN-001: Plugin Load Failure

**Trigger:** Dynamic import fails for plugin module

**Error Type:** `Error('Failed to load plugin "${name}": ${message}')`

**Handling Mechanism:**

- `core/plugin/plugin-manager.js:72-74` catches import errors
- Logs error, continues with other plugins

**Recovery Path:**

1. Log error
2. Skip failed plugin
3. Continue initialization
4. Server starts without plugin features

**User-Facing Behavior:**

- Warning logged
- Plugin features unavailable

**Logging:** `console.error('[PluginManager] Failed to load plugin...')`

---

### E-PLUGIN-002: Plugin Initialize Failure

**Trigger:** Plugin's initialize() method throws

**Error Type:** Plugin-specific error

**Handling Mechanism:**

- `core/plugin/plugin-manager.js:62-63` catches init errors
- Plugin registered but marked as failed

**Recovery Path:**

1. Log error
2. Plugin registered in failed state
3. Plugin methods may throw if called

**User-Facing Behavior:**

- Warning logged
- Plugin-dependent operations fail gracefully

**Logging:** Plugin init error logged

---

## Network Errors

### E-NET-001: Internal Server Unreachable

**Trigger:** mcp-server.js cannot reach internal server.js

**Error Type:** `fetch` timeout or connection refused

**Handling Mechanism:**

- `mcp-server.js` circuit breaker tracks failures
- Timeout: 5s (configurable)
- Retries: 2 (safe retries for GET)

**Recovery Path:**

1. Retry with backoff (safe retries)
2. If persistent, circuit opens
3. After cooldown, probe request
4. If probe succeeds, circuit closes

**User-Facing Behavior:**

- Delayed response (retry)
- Fast error (circuit open)

**Logging:** Connection failures logged

---

### E-NET-002: HTTP API Error Response

**Trigger:** Internal server returns error status

**Error Type:** HTTP 4xx/5xx

**Handling Mechanism:**

- `mcp-server.js` forwards error to MCP client
- Status code mapped to MCP error

**Recovery Path:**

1. Forward error response
2. No automatic retry (may not be safe)

**User-Facing Behavior:**

- MCP error response with HTTP status info

**Logging:** HTTP error logged

---

## Registry Errors

### E-REG-001: MCP Server Unavailable

**Trigger:** Connect/proxy/discover call to a registered HTTP(S) server that is down, unreachable, or timing out

**Error Type:** Network failure / timeout

**Handling Mechanism:**

- `src/core/mcp-registry/proxy.js` applies a bounded, named timeout policy per operation type (`TIMEOUTS`)
- Consecutive failures increment that server's breaker state (see `E-REG-002`)
- Registry records the failure against the server's health (error count)

**Recovery Path:**

1. Operator restores the upstream server
2. `connect_mcp_server` re-runs discovery
3. `get_mcp_health` confirms latency/error count recovery

**User-Facing Behavior:**

- MCP tool error response; server reported unhealthy by `get_mcp_server`

**Logging:** upstream error message recorded on the server health record

---

### E-REG-002: Proxy Circuit Breaker Open

**Trigger:** A single server accumulates consecutive proxy failures past the threshold

**Error Type:** Circuit breaker open (in-memory, per `server_id`)

**Handling Mechanism:**

- `BREAKER_DEFAULTS`: `failureThreshold: 5`, `coolOffMs: 30000`, `halfOpenMaxCalls: 1`
- While open, calls short-circuit without contacting the upstream server
- After `coolOffMs`, a single half-open probe is permitted

**Recovery Path:**

1. Cooldown elapses → half-open probe
2. Successful probe closes the breaker
3. Failed probe re-opens it for another cooldown

**User-Facing Behavior:**

- MCP tool error response, returned locally (no network call attempted)

**Logging:** breaker state transitions (exercised by `tests/mcp-registry-test.js`)

---

### E-REG-003: stdio Server Not Proxied

**Trigger:** `connect_mcp_server`, `discover_mcp_tools`, or `proxy_mcp_call` targeting a `type='stdio'` server

**Error Type:** Unsupported operation — stdio servers are metadata-only (registry design, Option C)

**Handling Mechanism:**

- `connect` → rejected: "stdio servers cannot be connected via HTTP proxy. Metadata-only registration available."
- `discover` → returns `{ tools: [], note: 'stdio servers - tool discovery not supported' }`
- `proxy` → rejected: "stdio servers cannot be proxied via HTTP"

**Recovery Path:**

1. Register the server's HTTP/SSE endpoint instead if proxying is required
2. Otherwise keep it as inventory/documentation only

**User-Facing Behavior:**

- Explicit error (or empty tool set with a note) naming the stdio limitation

**Logging:** rejection recorded with the stdio reason

---

### E-REG-004: Credential Masking on Read

**Trigger:** Any external read of a registered server — `list_mcp_servers`, `get_mcp_server`, HTTP `GET /mcp/*`

**Error Type:** Security control (not a failure)

**Handling Mechanism:**

- `auth_config` encrypted at rest as `enc:v1:` (AES-256-GCM, keyed by `MCP_MASTER_SECRET`)
- `maskAuth()` returns each string credential as `value.slice(0, 4) + '****'`
- Unmasked credentials are read only by the internal proxy path (`E-REG-001`/`002`)
- Cross-project reads are denied (project scoping on every `:id` route)

**Recovery Path:**

- N/A — intentional control. A missing `MCP_MASTER_SECRET` logs a warning and blocks decryption.

**User-Facing Behavior:**

- Masked credential fields in every external API/MCP response

**Logging:** missing-secret warning only — never the secret or the ciphertext

---

## Reference Maintenance Log

### 2026-10-07

**Change:** Registry governance closeout (gap G13) — added registry error paths

**Classification:** ADDED

**Updated:**

- Added `## Registry Errors` with `E-REG-001` (server unavailable), `E-REG-002` (breaker open), `E-REG-003` (stdio not proxied), `E-REG-004` (credential masking)
- Thresholds/constants taken from `src/core/mcp-registry/proxy.js` and `maskAuth()` in `index.js`

**Verification:** SPOT (message strings and constants read from source)

### 2026-09-19

**Change:** Initial error paths creation

**Classification:** ADDED

**Updated:**

- Documented 17 error scenarios
- Mapped trigger → type → handling → recovery → user-facing → logging
- Covered all major subsystems

**Verification:** FULL

---

_Update when error handling patterns change._
