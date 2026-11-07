# CODEX Adapter — local-mcp-memory

## Integration Overview
This guide enables **codex** to interact seamlessly with `local-mcp-memory` v2.6.0.

## Configuration & Bootstrap
- **Bootstrap Pointer:** Root `AGENTS.md` (or `CODEX.md`).
- **Authoritative Rules:** `.agent/AGENTS.md`.
- **System Directives:** `.agent/instructions/SYSTEM.md`.

## MCP Connection Configuration
To register `local-mcp-memory` v2.6.0 into codex:
```json
{
  "mcpServers": {
    "local-mcp-memory": {
      "command": "node",
      "args": ["C:\\Code_Works\\HTML_CSS_JS\\workProjects\\projects\\local-mcp-memory\\mcp-server.js"],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_ENGINE": "sqlite"
      }
    }
  }
}
```
