# Known Limitations & Operating Boundaries

## 1. Post-Cutover Status
- **v2.5.0 Retired**: Historical codebase at `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory` is retired. Full archive is persisted in `C:\Local-MCP-Memory-Backups\v250-retirement-archive\v250-full-backup\`.
- **Active MCP Server**: Global npm package `local-mcp-memory@2.6.1` is the active server for Google Antigravity.
- **Embedded Database**: The active database is embedded SQLite at `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`.
- **Historical MongoDB**: Database `mcp_memory` on `127.0.0.1:27017` is preserved read-only with 29,854 documents; it is not automatically synced with new SQLite operations.
- **Master Secret Warning**: If `MCP_MASTER_SECRET` is not set in environment or config, credentials in `mcp-registry` are stored in plaintext. Set `MCP_MASTER_SECRET` in user config (`%APPDATA%\local-mcp-memory\config.json`) to enable AES-256-GCM encryption.
- **Windows CLI Batch Spawning**: In GUI IDEs or custom scripts on Windows, invoke `node <npm_path>/mcp-server.js` directly to avoid `.cmd` batch wrapper shell requirements.
