# Feasibility Analysis — Dynamic MCP Management & Project-Level MCP Registry

**Date:** 2026-09-19
**Phase:** 1 (Feasibility Gate)
**Status:** ANALYSIS COMPLETE — PROCEED WITH CONSTRAINTS

---

## 1. Problem Statement

The user wants to add an MCP Management Layer to `local-mcp-memory` — an MCP control plane for registered, authorized, project-scoped, runtime-managed MCP capabilities. This means:

- **Registry**: Store and manage MCP server configurations (name, command, env, auth, scope)
- **Authorization**: Control which MCP servers are allowed for each project
- **Runtime Connection**: Actually connect to registered MCP servers and expose their tools
- **Client Tool Exposure**: Make registered MCP server tools available through our MCP server

---

## 2. MCP Protocol Capabilities (from spec analysis)

### What MCP Supports

| Capability          | Supported | Details                                                                         |
| ------------------- | --------- | ------------------------------------------------------------------------------- |
| Dynamic tool lists  | **YES**   | `notifications/tools/list_changed` — server can notify client when tools change |
| Tool definition     | **YES**   | Name, description, inputSchema, outputSchema, annotations                       |
| Tool execution      | **YES**   | `tools/call` with JSON-RPC                                                      |
| Server capabilities | **YES**   | Server declares `tools`, `prompts`, `resources`, `logging`, `tasks`             |
| Session management  | **YES**   | `MCP-Session-Id` header for HTTP transport                                      |
| Transports          | **YES**   | stdio and Streamable HTTP                                                       |

### What MCP Does NOT Support

| Limitation                       | Impact                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| **No server-to-server protocol** | MCP is strictly client↔server. A server cannot connect to another server as a client. |
| **No gateway/proxy standard**    | Gateway patterns are in the MCP roadmap but NOT yet standardized                      |
| **No dynamic server discovery**  | Clients connect to statically configured servers                                      |
| **No tool forwarding spec**      | No standard way to proxy tools from Server A through Server B                         |

### Key Constraint

> **MCP protocol is client↔server only.** An MCP server cannot initiate an MCP connection to another MCP server. The `initialize` handshake is client→server, not server→server.

---

## 3. OpenCode Runtime Capabilities

### MCP Server Configuration

OpenCode discovers MCP servers via static JSON config:

```jsonc
// ~/.config/opencode/opencode.jsonc
"mcp": {
    "local-mcp-memory": {
      "type": "local",
      "command": ["node", "mcp-server.js"],
      "environment": { "MCP_PROJECT": "docs-repo" },
      "enabled": true,
      "timeout": 30000
    }
}
```

### What OpenCode CAN Do

| Capability               | Supported | Details                                       |
| ------------------------ | --------- | --------------------------------------------- |
| Static MCP server config | **YES**   | Defined in `opencode.jsonc` under `"mcp"` key |
| Multiple MCP servers     | **YES**   | Each gets its own client connection           |
| MCP tool calls           | **YES**   | Via `tools/call` on connected servers         |
| MCP tool discovery       | **YES**   | Via `tools/list` on connected servers         |

### What OpenCode CANNOT Do (Currently)

| Limitation                         | Impact                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| **No dynamic MCP server addition** | Config is static JSON, no API to add servers at runtime     |
| **No hot-reload of MCP config**    | Changes require OpenCode restart                            |
| **No programmatic MCP connection** | No API to connect to a new MCP server from within a session |

---

## 4. Current System Architecture (local-mcp-memory)

### Existing Components

| Component         | File                                   | Purpose                                                     |
| ----------------- | -------------------------------------- | ----------------------------------------------------------- |
| MCP stdio server  | `mcp-server.js`                        | Entry point, tool registration, HTTP bridge                 |
| HTTP API server   | `server.js`                            | Express routes, all domain services                         |
| SQLite database   | `src/core/database/sqlite/`            | 18 tables, FTS5 search                                      |
| Project identity  | `utils/projectIdentity.js`             | 4-level config hierarchy                                    |
| Config loader     | `core/config/project-config-loader.js` | Rich default config with features/plugins                   |
| Integration tools | `mcp-integration-tools.js`             | Feature-gated tool registration (Redis, Knowledge, Browser) |
| Auth system       | `src/core/auth/`                       | JWT, API keys, middleware                                   |

### Existing Pattern: Feature-Gated Tool Registration

`mcp-integration-tools.js` already demonstrates **conditional tool registration**:

```javascript
export function getIntegrationTools() {
  const tools = [];
  if (isFeatureEnabled('redis')) {
    tools.push(...getRedisTools());
  }
  if (isFeatureEnabled('knowledgeBase')) {
    tools.push(...getKnowledgeTools());
  }
  if (isFeatureEnabled('browser')) {
    tools.push(...getBrowserTools());
  }
  return tools;
}
```

This pattern is **exactly what we need** for MCP server tools — register tools conditionally based on which MCP servers are active.

### Existing Schema (18 tables)

No existing `mcp_servers` table. The closest is `connections` which tracks client connections TO our server, not connections FROM our server to others.

---

## 5. Feasibility Decision Matrix

### Option A: Full Runtime MCP Gateway (Connect to Other MCP Servers)

**Concept**: Our server acts as an MCP client that connects to other MCP servers, then exposes their tools through our own tool list.

| Aspect                     | Assessment                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Protocol feasibility**   | PARTIAL — MCP doesn't define server-to-server, but we can implement an MCP client that connects to other servers via HTTP transport |
| **OpenCode compatibility** | HIGH — OpenCode sees one MCP server (us) with all tools, no config changes needed                                                   |
| **Dynamic registration**   | HIGH — Register new MCP servers via tools, connect at runtime, tools appear via `list_changed`                                      |
| **Complexity**             | HIGH — Need MCP client implementation, connection management, tool proxying, error handling                                         |
| **Risk**                   | MEDIUM — MCP client is well-specified, but proxying adds failure modes                                                              |
| **Authorization**          | MEDIUM — Need to validate credentials before connecting, manage per-project access                                                  |

**Verdict: FEASIBLE with significant implementation effort.**

### Option B: Project-Level Registry (Database-Only, No Runtime Connection)

**Concept**: Store MCP server configurations in SQLite, provide CRUD via tools and HTTP API, but DON'T actually connect to those servers.

| Aspect                     | Assessment                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| **Protocol feasibility**   | FULL — Just database operations + MCP tools                        |
| **OpenCode compatibility** | MEDIUM — Registry is metadata only, tools don't appear in OpenCode |
| **Dynamic registration**   | HIGH — Full CRUD via tools                                         |
| **Complexity**             | LOW — Standard database schema + API routes                        |
| **Risk**                   | LOW — No runtime connections to manage                             |
| **Authorization**          | HIGH — Just access control on registry entries                     |

**Verdict: FEASIBLE and simple, but provides no runtime tool exposure.**

### Option C: Combined Registry + HTTP Proxy

**Concept**: Registry in SQLite + HTTP API + optional HTTP proxy that forwards requests to registered MCP servers.

| Aspect                     | Assessment                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| **Protocol feasibility**   | FULL — HTTP proxy is standard, MCP servers expose HTTP endpoints      |
| **OpenCode compatibility** | HIGH — Tools from proxied servers appear in our tool list             |
| **Dynamic registration**   | HIGH — Register, connect, expose                                      |
| **Complexity**             | MEDIUM — Registry + HTTP proxy, no MCP client needed                  |
| **Risk**                   | MEDIUM — HTTP proxy adds failure modes but is simpler than MCP client |
| **Authorization**          | HIGH — Registry-based access control + HTTP auth forwarding           |

**Verdict: FEASIBLE — best balance of capability and complexity.**

### Option D: Hybrid — Registry + MCP Client + Tool Proxy

**Concept**: Full MCP client that connects to other servers, proxies their tools, stores metadata in SQLite.

| Aspect                     | Assessment                                                     |
| -------------------------- | -------------------------------------------------------------- |
| **Protocol feasibility**   | FULL — MCP client + proxy pattern                              |
| **OpenCode compatibility** | HIGHEST — All tools from all registered servers appear         |
| **Dynamic registration**   | HIGHEST — Register, connect, auto-discover tools               |
| **Complexity**             | HIGHEST — MCP client + connection pool + tool proxy + registry |
| **Risk**                   | HIGHEST — Complex failure modes, connection management         |
| **Authorization**          | HIGH — Full control                                            |

**Verdict: FEASIBLE but highest risk and complexity.**

---

## 6. Recommended Approach

**Option C: Combined Registry + HTTP Proxy**

### Rationale

1. **No MCP client implementation needed** — We proxy HTTP requests to MCP servers' HTTP endpoints, not implement the MCP protocol client-side
2. **OpenCode compatibility** — Proxied tools appear in our tool list via `list_changed`
3. **Simplicity** — HTTP proxy is well-understood, no MCP handshake complexity
4. **Existing patterns** — `mcp-integration-tools.js` already shows conditional tool registration
5. **SQLite schema** — Clean addition of `mcp_servers` table alongside existing 18 tables
6. **Authorization** — Registry-based access control is straightforward

### What This Means

- We store MCP server configs in SQLite (`mcp_servers` table)
- We provide MCP tools for CRUD operations on the registry
- We provide HTTP API routes for management
- We provide an HTTP proxy endpoint that forwards requests to registered MCP servers
- We conditionally register tools from proxied servers in our `tools/list`
- OpenCode sees one MCP server with tools from all registered servers

### What This Does NOT Mean

- We do NOT implement a full MCP client
- We do NOT handle MCP handshake/initialization for other servers
- We do NOT do stdio-to-HTTP translation (only HTTP→HTTP proxy)
- We do NOT hot-reload OpenCode config

---

## 7. Constraints and Risks

### Hard Constraints

1. **MCP protocol is client↔server** — We cannot implement server-to-server MCP connections
2. **OpenCode config is static** — Cannot dynamically add MCP servers to OpenCode
3. **stdio servers cannot be proxied** — Only HTTP-exposed MCP servers can be proxied

### Soft Constraints

1. **Existing tests must pass** — `npm test` (16/16) must remain green
2. **ESM-only** — No CommonJS imports
3. **No TypeScript** — Pure JavaScript
4. **SQLite native driver** — No Mongoose

### Risks

| Risk                            | Severity | Mitigation                                                       |
| ------------------------------- | -------- | ---------------------------------------------------------------- |
| MCP servers may not expose HTTP | MEDIUM   | Document limitation, support stdio-only servers as metadata-only |
| Proxy adds latency              | LOW      | Connection pooling, timeout configuration                        |
| Proxy adds failure modes        | MEDIUM   | Circuit breaker pattern, health checks, graceful degradation     |
| SQLite schema migration         | LOW      | Additive only, no destructive changes                            |
| Auth credential storage         | HIGH     | Encrypt at rest, never log, secure memory handling               |

---

## 8. Decision

**PROCEED with Option C (Combined Registry + HTTP Proxy)**

The feasibility gate passes with the following constraints:

1. HTTP-exposed MCP servers can be proxied and their tools exposed
2. stdio-only MCP servers can be registered as metadata-only (no tool proxy)
3. No MCP client implementation — HTTP proxy only
4. No OpenCode config modification — tools appear via our existing MCP server
5. Registry stored in SQLite with proper schema migration

---

## 9. Next Steps

1. Create architecture design document (Phase 2)
2. Create database schema for `mcp_servers` table (Phase 3)
3. Implement MCP tools for registry CRUD (Phase 4)
4. Implement HTTP proxy for registered servers (Phase 5)
5. Implement tool registration from proxied servers (Phase 6)
6. Implement authorization layer (Phase 7)
7. Write tests (Phase 8)
8. Update documentation (Phase 9)
