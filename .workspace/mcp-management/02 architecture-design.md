# Architecture Design — Dynamic MCP Management & Project-Level MCP Registry

**Date:** 2026-09-19
**Phase:** 2 (Architecture Design)
**Decision:** Option C — Combined Registry + HTTP Proxy
**Status:** DESIGN COMPLETE

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenCode Runtime                            │
│  (static MCP config → connects to local-mcp-memory via stdio)      │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ MCP protocol (stdio)
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   local-mcp-memory                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  MCP Server (mcp-server.js)                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Base Tools    │  │ Integration  │  │ MCP Registry     │  │  │
│  │  │ (memory,      │  │ Tools        │  │ Tools (NEW)      │  │  │
│  │  │  tasks, etc.) │  │ (redis,      │  │ - register_mcp   │  │  │
│  │  │               │  │  browser)    │  │ - list_mcp       │  │  │
│  │  └──────────────┘  └──────────────┘  │ - proxy_mcp_call │  │  │
│  │                                       └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │ HTTP bridge                              │
│  ┌───────────────────────▼──────────────────────────────────────┐  │
│  │  HTTP API Server (server.js :47000)                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Auth Routes   │  │ Dashboard    │  │ MCP Registry     │  │  │
│  │  │               │  │ Routes       │  │ Routes (NEW)     │  │  │
│  │  └──────────────┘  └──────────────┘  │ - POST /mcp/srv  │  │  │
│  │                                       │ - GET  /mcp/srv  │  │  │
│  │                                       │ - POST /mcp/proxy│  │  │
│  │                                       └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│  ┌───────────────────────▼──────────────────────────────────────┐  │
│  │  SQLite Database (19 tables)                                 │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │ mcp_servers (NEW)                                    │    │  │
│  │  │ - id, name, type, command, url, env, auth            │    │  │
│  │  │ - project, scope, status, health, last_checked       │    │  │
│  │  │ - capabilities, tags, metadata                       │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│  ┌───────────────────────▼──────────────────────────────────────┐  │
│  │  HTTP Proxy (NEW)                                           │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │ Forwards requests to registered MCP servers          │    │  │
│  │  │ - /mcp/proxy/:serverId/jsonrpc (MCP JSON-RPC)       │    │  │
│  │  │ - /mcp/proxy/:serverId/http (generic HTTP)           │    │  │
│  │  │ - Connection pooling, circuit breaker, auth           │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                        │ HTTP
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Registered MCP Servers (external)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐        │
│  │ Server A     │  │ Server B     │  │ Server C          │        │
│  │ (HTTP)       │  │ (HTTP)       │  │ (stdio-only)      │        │
│  │ tools: [...] │  │ tools: [...] │  │ metadata only     │        │
│  └──────────────┘  └──────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Design

### 2.1 SQLite Schema — `mcp_servers` Table

**Location:** `src/core/database/sqlite/schema.js` (additive, no destructive changes)

```sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL DEFAULT 'unknown',
  project TEXT NOT NULL DEFAULT 'default',
  sessionId TEXT,
  scope TEXT NOT NULL DEFAULT 'private',
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'http',          -- 'http' | 'stdio' | 'sse'
  command TEXT,                                -- for stdio type
  url TEXT,                                    -- for http/sse type
  env TEXT NOT NULL DEFAULT '{}',             -- JSON env vars
  auth_type TEXT NOT NULL DEFAULT 'none',     -- 'none' | 'api_key' | 'bearer' | 'basic'
  auth_config TEXT NOT NULL DEFAULT '{}',     -- encrypted auth config
  status TEXT NOT NULL DEFAULT 'registered',  -- 'registered' | 'connected' | 'error' | 'disabled'
  health TEXT NOT NULL DEFAULT '{}',          -- { lastCheck, latency, errorCount }
  capabilities TEXT NOT NULL DEFAULT '[]',    -- discovered capabilities
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

**Indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_mcp_servers_project ON mcp_servers(project, status);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_server_id ON mcp_servers(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers(type);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_session ON mcp_servers(sessionId);
```

### 2.2 MCP Registry Business Logic

**Location:** `src/core/mcp-registry/index.js` (new module)

**Responsibilities:**

- CRUD operations on `mcp_servers` table
- Connection management for HTTP MCP servers
- Tool discovery via `tools/list` call to registered servers
- HTTP proxy forwarding with auth injection
- Health checking and status tracking

**Exports:**

```javascript
// Registry CRUD
export async function registerServer(serverConfig)
export async function unregisterServer(serverId)
export async function getServer(serverId)
export async function listServers(filters)
export async function updateServer(serverId, updates)

// Connection management
export async function connectToServer(serverId)
export async function disconnectFromServer(serverId)
export async function getServerStatus(serverId)

// Tool proxy
export async function proxyToolCall(serverId, toolName, args)
export async function discoverTools(serverId)

// Health
export async function checkServerHealth(serverId)
export async function getHealthSummary()
```

### 2.3 MCP Registry Tools (MCP Tool Surface)

**Location:** `tools/mcpRegistryTools.js` (new file)

**Tool Definitions:**

| Tool Name               | Description                           | Required Args                        |
| ----------------------- | ------------------------------------- | ------------------------------------ |
| `register_mcp_server`   | Register a new MCP server             | `name`, `type`, `url` or `command`   |
| `unregister_mcp_server` | Remove an MCP server                  | `server_id`                          |
| `list_mcp_servers`      | List registered servers               | none (optional: `project`, `status`) |
| `get_mcp_server`        | Get server details                    | `server_id`                          |
| `connect_mcp_server`    | Connect to a registered server        | `server_id`                          |
| `disconnect_mcp_server` | Disconnect from a server              | `server_id`                          |
| `proxy_mcp_call`        | Call a tool on a registered server    | `server_id`, `tool_name`, `args`     |
| `discover_mcp_tools`    | Discover tools on a registered server | `server_id`                          |
| `get_mcp_health`        | Get health status of servers          | none (optional: `server_id`)         |

### 2.4 HTTP API Routes

**Location:** `src/core/mcp-registry/routes.js` (new file)

| Method   | Endpoint                      | Description                      |
| -------- | ----------------------------- | -------------------------------- |
| `POST`   | `/mcp/servers`                | Register a new server            |
| `GET`    | `/mcp/servers`                | List all servers                 |
| `GET`    | `/mcp/servers/:id`            | Get server details               |
| `PUT`    | `/mcp/servers/:id`            | Update server config             |
| `DELETE` | `/mcp/servers/:id`            | Unregister server                |
| `POST`   | `/mcp/servers/:id/connect`    | Connect to server                |
| `POST`   | `/mcp/servers/:id/disconnect` | Disconnect from server           |
| `POST`   | `/mcp/servers/:id/health`     | Trigger health check             |
| `POST`   | `/mcp/proxy/:id/jsonrpc`      | Proxy MCP JSON-RPC request       |
| `POST`   | `/mcp/proxy/:id/http`         | Proxy generic HTTP request       |
| `GET`    | `/mcp/proxy/:id/tools`        | Get tools from registered server |

### 2.5 HTTP Proxy

**Location:** `src/core/mcp-registry/proxy.js` (new file)

**Responsibilities:**

- Forward JSON-RPC requests to registered MCP servers
- Inject auth headers (API key, bearer token, basic auth)
- Connection pooling (reuse HTTP connections)
- Circuit breaker (pause requests on repeated failures)
- Timeout management
- Response transformation

**Flow:**

```
1. Agent calls proxy_mcp_call(server_id="abc", tool_name="search", args={...})
2. mcp-server.js dispatches to mcpRegistryTools handler
3. Handler calls proxyToolCall("abc", "search", {...})
4. proxy.js:
   a. Looks up server config in SQLite
   b. Gets/creates HTTP connection from pool
   c. Injects auth headers
   d. Sends JSON-RPC request: { method: "tools/call", params: { name: "search", arguments: {...} } }
   e. Receives response
   f. Returns result to handler
5. Handler returns result to MCP response
```

---

## 3. Integration Points

### 3.1 mcp-server.js Changes

**Minimal changes required:**

1. Import `getMCPRegistryTools` from `tools/mcpRegistryTools.js`
2. Add tools to `getTools()` return array:
   ```javascript
   function getTools() {
     const baseTools = [...]; // existing
     const integrationTools = getIntegrationTools(); // existing
     const mcpRegistryTools = getMCPRegistryTools(); // NEW
     return [...baseTools, ...integrationTools, ...mcpRegistryTools];
   }
   ```
3. Add tool dispatch cases for registry tools (following existing `if (name === "...")` pattern)
4. Update `tools/listChanged` to `true` when registry tools are dynamically added

### 3.2 server.js Changes

**Minimal changes required:**

1. Import `mcpRegistryRoutes` from `src/core/mcp-registry/routes.js`
2. Mount routes: `app.use('/mcp', mcpRegistryRoutes)`
3. Import `initMCPRegistrySchema` from `src/core/mcp-registry/index.js`
4. Call during SQLite init

### 3.3 SQLite Schema Changes

**Additive only:**

1. Add `mcp_servers` table creation in `schema.js`
2. Add indexes
3. No existing tables modified

### 3.4 Config Changes

**Add to `project-config-loader.js` defaults:**

```javascript
features: {
  // ... existing features ...
  mcpRegistry: true; // NEW: enable MCP registry feature
}
```

---

## 4. Security Design

### 4.1 Auth Credential Storage

- Auth credentials stored in `auth_config` column as JSON
- **Encrypt at rest** using AES-256-GCM with project-specific key
- Key derived from project name + master secret (from env or config)
- Never log auth credentials
- Never expose full auth_config in API responses (mask sensitive fields)

### 4.2 Proxy Auth Injection

- When proxying requests, inject appropriate auth headers:
  - `api_key` → `Authorization: ApiKey <key>` or custom header
  - `bearer` → `Authorization: Bearer <token>`
  - `basic` → `Authorization: Basic <base64>`
- Auth headers never logged

### 4.3 Access Control

- Registry operations require authentication (existing auth system)
- Project-scoped: servers registered under project X can only be accessed by agents in project X
- Admin operations (register/unregister) require elevated permissions

---

## 5. Error Handling

### 5.1 Connection Failures

```javascript
{
  error: "MCP_SERVER_UNAVAILABLE",
  message: "Cannot connect to registered MCP server",
  details: {
    server_id: "abc",
    server_name: "my-server",
    url: "http://localhost:3001",
    last_error: "Connection refused",
    retry_after: 30
  }
}
```

### 5.2 Tool Execution Failures

```javascript
{
  error: "MCP_PROXY_TOOL_ERROR",
  message: "Tool execution failed on remote server",
  details: {
    server_id: "abc",
    tool_name: "search",
    upstream_error: "Invalid query",
    upstream_code: -32602
  }
}
```

### 5.3 Circuit Breaker States

| State       | Behavior                                                           |
| ----------- | ------------------------------------------------------------------ |
| `closed`    | Normal operation, requests pass through                            |
| `open`      | Circuit tripped, requests fail immediately with retry hint         |
| `half-open` | Single test request allowed, if succeeds → closed, if fails → open |

---

## 6. Data Flow

### 6.1 Register Server

```
User → "Register MCP server X at http://localhost:3001"
  → Agent calls register_mcp_server(name="X", type="http", url="http://localhost:3001")
  → mcp-server.js dispatches to handler
  → Handler calls registerServer({ name: "X", type: "http", url: "..." })
  → SQLite INSERT into mcp_servers
  → Handler returns { server_id: "srv_xxx", status: "registered" }
  → Agent sees "Server X registered with ID srv_xxx"
```

### 6.2 Connect & Discover Tools

```
User → "Connect to server X and show me its tools"
  → Agent calls connect_mcp_server(server_id="srv_xxx")
  → Handler calls connectToServer("srv_xxx")
  → proxy.js sends { method: "tools/list" } to http://localhost:3001
  → Remote server returns tools list
  → proxy.js stores capabilities in SQLite
  → Handler returns { tools: [...], count: 5 }
  → Agent sees "Server X has 5 tools: tool1, tool2, ..."
```

### 6.3 Proxy Tool Call

```
User → "Use tool1 from server X with args {...}"
  → Agent calls proxy_mcp_call(server_id="srv_xxx", tool_name="tool1", args={...})
  → mcp-server.js dispatches to handler
  → Handler calls proxyToolCall("srv_xxx", "tool1", {...})
  → proxy.js:
    1. Looks up server config
    2. Gets HTTP connection
    3. Injects auth
    4. Sends { method: "tools/call", params: { name: "tool1", arguments: {...} } }
    5. Receives result
  → Handler returns result to MCP response
  → Agent uses result
```

---

## 7. Implementation Modules

| Module        | File                                   | Purpose                      | Lines (est.) |
| ------------- | -------------------------------------- | ---------------------------- | ------------ |
| Schema        | `src/core/database/sqlite/schema.js`   | Add mcp_servers table        | ~30          |
| Registry Core | `src/core/mcp-registry/index.js`       | CRUD + connection management | ~300         |
| Proxy         | `src/core/mcp-registry/proxy.js`       | HTTP proxy + auth injection  | ~200         |
| Routes        | `src/core/mcp-registry/routes.js`      | HTTP API routes              | ~150         |
| MCP Tools     | `tools/mcpRegistryTools.js`            | Tool definitions + handlers  | ~250         |
| Config        | `core/config/project-config-loader.js` | Add mcpRegistry feature flag | ~5           |
| Tests         | `tests/mcp-registry.test.js`           | Unit + integration tests     | ~200         |

**Total estimated:** ~1,135 new lines across 7 files

---

## 8. Migration Strategy

### 8.1 Schema Migration

- Additive only: new `mcp_servers` table
- No existing tables modified
- No destructive changes
- SQLite `CREATE TABLE IF NOT EXISTS` ensures idempotency

### 8.2 Config Migration

- Add `mcpRegistry: true` to default features
- Existing configs without this key default to `true` (enabled)
- Can be disabled via config: `{ "features": { "mcpRegistry": false } }`

### 8.3 Tool Migration

- New tools added to `getTools()` return array
- Existing tools unchanged
- No breaking changes to existing tool interfaces

---

## 9. Testing Strategy

| Test Type   | Scope                                 | Tool                                 |
| ----------- | ------------------------------------- | ------------------------------------ |
| Unit        | Registry CRUD operations              | `node:test`                          |
| Unit        | Proxy auth injection                  | `node:test`                          |
| Unit        | Circuit breaker logic                 | `node:test`                          |
| Integration | Full register → connect → proxy flow  | `node:test` + mock HTTP server       |
| Integration | Health check cycle                    | `node:test` + mock HTTP server       |
| E2E         | MCP tool call → proxy → remote server | Manual (requires running MCP server) |

---

## 10. Open Questions (Resolved)

| Question                                   | Answer                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Can we connect MCP servers to MCP servers? | **No** — MCP is client↔server only. We use HTTP proxy.                            |
| Can we dynamically add tools to OpenCode?  | **No** — OpenCode config is static. Tools appear through our existing MCP server. |
| Do we need a full MCP client?              | **No** — HTTP proxy is sufficient for HTTP-exposed servers.                       |
| Can stdio-only servers be proxied?         | **No** — Only HTTP-exposed servers. stdio-only = metadata-only registry.          |
