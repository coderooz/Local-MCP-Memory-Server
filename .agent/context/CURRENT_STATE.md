# Current State — local-mcp-memory v2.6.1 (Global Migration Complete & v2.5.0 Retired)

**Status Date:** 2026-11-07  
**Current Milestone:** Campaign 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Canonical Package:** `local-mcp-memory@2.6.1` (Published on npm Registry)  
**Active Installation:** Global npm (`C:\Users\ranit\AppData\Roaming\npm\node_modules\local-mcp-memory`)  
**Primary Database:** Embedded SQLite WAL (`C:\Users\ranit\AppData\Local\local-mcp-memory\mcp-memory.db`)  
**Release Status:** `A. GLOBAL MIGRATION SUCCESSFUL — V2.5.0 RETIRED` (All 15 Acceptance Criteria Passed)  

## 1. Environment & Migration Status
- **Public npm Registry**: `local-mcp-memory@2.6.1` is live and published on `https://registry.npmjs.org/` (`dist-tags.latest = 2.6.1`).
- **Global Installation**: Installed globally via `npm install -g local-mcp-memory@2.6.1`. Binaries `local-mcp-memory`, `mcp-memory`, and `local-memory-mcp` resolve in `C:\Users\ranit\AppData\Roaming\npm`.
- **Global MCP Client Configuration**: Google Antigravity configuration (`.gemini/antigravity/mcp_config.json` and `.gemini/config/mcp_config.json`) updated to invoke global `node .../mcp-server.js` with `MCP_AGENT=antigravity`. Third-party `firebase-mcp-server` preserved.
- **Real-World Verification**: 11/11 live MCP stdio tests passed (63 tools, store, search, update, agent, tasks, soft locks, restart persistence).
- **MongoDB Historical Preservation**: Original database `mcp_memory` on `127.0.0.1:27017` remains 100% intact with all 29,854 documents. Separate verified JSONL backup created in `C:\Local-MCP-Memory-Backups\pre-v260-retirement\2026-11-07_20-01-20\`.
- **v2.5.0 Decommissioning**: Full mirror archive preserved in `C:\Local-MCP-Memory-Backups\v250-retirement-archive\v250-full-backup\`. Obsolete v2.5.0 directory `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` cleanly retired and empty.
- **Development Repository**: `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory` preserved intact.
