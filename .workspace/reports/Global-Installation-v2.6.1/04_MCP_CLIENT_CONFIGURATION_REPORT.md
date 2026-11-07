# Report 04: Global MCP Client Configuration Report

**Campaign:** 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Systems & Configuration Auditor  

---

## 1. Executive Summary

This report documents the cutover of the Google Antigravity MCP client configuration from the historical v2.5.0 directory and `mcp-shim.js` to the globally installed npm package `local-mcp-memory@2.6.1`.

---

## 2. Pre-Cutover Configuration Backups

Prior to making any modifications, timestamped backups of all client configuration files were created:

- `C:\Users\ranit\.gemini\antigravity\mcp_config.json.bak-20261107-200145`
- `C:\Users\ranit\.gemini\config\mcp_config.json.bak-20261107-200145`

Both backup files contain the exact pre-migration state, enabling immediate one-step rollback if ever needed.

---

## 3. Preserved Unrelated MCP Servers

In `C:\Users\ranit\.gemini\config\mcp_config.json`, the third-party server `"firebase-mcp-server"` was strictly preserved:
```json
"firebase-mcp-server": {
  "command": "npx",
  "args": ["-y", "firebase-tools@latest", "mcp"]
}
```

---

## 4. Canonical Global Server Configuration

Both configuration files (`.gemini/antigravity/mcp_config.json` and `.gemini/config/mcp_config.json`) were updated to invoke the global npm package entry point directly:

```json
{
  "mcpServers": {
    "local-mcp-memory": {
      "command": "node",
      "args": [
        "C:/Users/ranit/AppData/Roaming/npm/node_modules/local-mcp-memory/mcp-server.js"
      ],
      "env": {
        "MCP_AGENT": "antigravity"
      }
    }
  }
}
```

### 4.1 Invariants Upheld
1. **Zero Legacy References**: Removed all references to `C:/Code_Works/.../website/local-mcp-memory` and `mcp-shim.js`.
2. **Zero Mongo Dependency**: Removed `MONGO_URI`. The v2.6.1 runtime automatically reads and writes from the persistent embedded SQLite engine at `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`.
3. **Robust Execution**: Direct invocation of `node.exe` with the absolute path to the installed `mcp-server.js` avoids Windows shell-escape issues associated with `.cmd` batch wrappers.
4. **JSON Validation**: Verified via PowerShell `ConvertFrom-Json` with 100% syntax compliance.
