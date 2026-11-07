# Antigravity Client Cutover Preparation

**Date:** 2026-11-06  
**Auditing Agent:** Google Antigravity  
**Client Target:** Google Antigravity Global MCP  

---

## 1. Current Active Configuration Status (v2.5.0 Stable)

- **Config Path:** `C:\Users\ranit\.gemini\config\mcp_config.json`
- **Active Server Entry:**
  ```json
  {
    "mcpServers": {
      "local-memory": {
        "command": "node",
        "args": [
          "C:/Code_Works/HTML_CSS_JS/workProjects/website/local-mcp-memory/mcp-shim.js"
        ],
        "env": {
          "MONGO_URI": "mongodb://127.0.0.1:27017/mcp_memory",
          "MCP_AGENT": "antigravity"
        }
      }
    }
  }
  ```
- **Backup Path:** `C:\Users\ranit\.gemini\config\mcp_config.json.backup_20261105`
- **Active Operational State:** Fully operational with live MongoDB storage.

---

## 2. Prepared Non-Active Configuration Example (v2.6.0)

When the user authorizes production cutover following npm publication and data migration, the global configuration will transition to:

```json
{
  "mcpServers": {
    "local-memory": {
      "command": "npx",
      "args": [
        "local-mcp-memory",
        "start"
      ],
      "env": {
        "MCP_AGENT": "antigravity",
        "MCP_SCOPE": "project"
      }
    }
  }
}
```

### Key Differences in v2.6.0 Configuration:
- **No `MONGO_URI` Required:** The server uses embedded SQLite stored automatically in `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`.
- **Global Package Invocation:** Runs standard `npx local-mcp-memory start` or globally installed executable.
- **Port Isolation:** Uses dynamic ephemeral port allocation (`PORT=0`) to eliminate port collisions.

---

## 3. Step-by-Step Cutover Runbook

*This runbook is prepared for future execution once explicit authorization is granted.*

1. **Step 1: Install v2.6.0 Package Globally**
   ```bash
   npm install -g local-mcp-memory
   # or test with npx
   npx local-mcp-memory --version
   ```
2. **Step 2: Run Initial Diagnostic Check**
   ```bash
   local-mcp-memory doctor
   ```
3. **Step 3: Migrate Operational Memory from MongoDB to SQLite**
   ```bash
   local-mcp-memory migrate --from "mongodb://127.0.0.1:27017/mcp_memory" --apply
   ```
4. **Step 4: Back Up Current Antigravity Configuration**
   ```powershell
   Copy-Item "C:\Users\ranit\.gemini\config\mcp_config.json" "C:\Users\ranit\.gemini\config\mcp_config.json.backup_pre_cutover"
   ```
5. **Step 5: Apply v2.6.0 Server Configuration**
   Update `C:\Users\ranit\.gemini\config\mcp_config.json` with the v2.6.0 entry.
6. **Step 6: Restart Antigravity / Reload MCP Servers**
   Trigger MCP reload in Antigravity.
7. **Step 7: Smoke Test**
   - Call `tools/list` $\to$ verify 63 registered tools available.
   - Call `search_context` for a known historical memory $\to$ verify migrated memory is recalled.
   - Call `store_context` for a test memory $\to$ verify persistence in SQLite.
8. **Step 8: Cutover Confirmed**
   If smoke tests succeed, cutover is complete. If any failure occurs, immediately execute the Rollback Procedure in Document 05.
