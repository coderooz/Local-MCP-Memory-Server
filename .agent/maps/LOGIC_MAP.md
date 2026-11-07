# Logic Map — local-mcp-memory v2.6.0

## Request Processing Lifecycle
```
[MCP Client]
      │
      ▼
[stdio / SSE Transport]
      │
      ▼
[JSON-RPC Parser & Validator]
      │
      ├── (initialize) ──> [Negotiate Protocol & Declare Capabilities]
      ├── (tools/list) ──> [Filter & Return 63 Registered Tools]
      └── (tools/call) ──> [Execution Sandbox & Security Guard]
                                  │
                                  ▼
                         [Domain Handler]
                                  │
                                  ▼
                      [SQLite Storage Engine]
                                  │
                                  ▼
                        [JSON-RPC Response]
```
