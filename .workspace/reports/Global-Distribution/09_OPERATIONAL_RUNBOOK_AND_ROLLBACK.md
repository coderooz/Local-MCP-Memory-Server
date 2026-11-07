# Operational Runbook and Rollback Procedures

## 1. Developer & User Setup Workflows

### 1.1 Fresh Installation via npm / npx
To initialize Local MCP Memory on any workstation:

```bash
# 1. Preview changes (non-destructive)
npx local-memory-mcp init --dry-run

# 2. Perform initialization and register detected AI agents
npx local-memory-mcp init

# 3. Verify health and environment
npx local-memory-mcp doctor
```

### 1.2 Global Installation Workflow
```bash
npm install -g local-memory-mcp
local-memory-mcp init
local-memory-mcp status
```

---

## 2. Upgrading from Legacy Instance A (v2.5.0) to Instance B (v2.6.0)

### Step 1: Pre-Migration Health Check
Ensure MongoDB is running and verify document counts:
```bash
npx local-memory-mcp migrate --from mongodb://127.0.0.1:27017/mcp_memory
```

### Step 2: Execute Migration with Backup
```bash
npx local-memory-mcp migrate --from mongodb://127.0.0.1:27017/mcp_memory --apply
```
The migration command will:
1. Export raw MongoDB collections into a verified JSON snapshot backup.
2. Open the destination SQLite database (`%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`).
3. Migrate and normalize each collection into relational domain tables.
4. Convert MongoDB ObjectID strings to canonical IDs.
5. Align foreign key dependencies (rooms -> chat messages -> contexts).
6. Rebuild full-text search indices (`rebuildFTS()`).
7. Generate a cryptographic verification hash.

### Step 3: Switch Agent Configurations
```bash
npx local-memory-mcp init
```

### Step 4: Validate AI Agent Connectivity
Restart your IDE or AI agent (OpenCode, Codex, Claude Desktop, Cursor). Ask the agent:
> "Check our project memory context and list the latest tasks."

---

## 3. Rollback Procedure

If any issue arises during or after migration:

### Rollback Path 1: SQLite Snapshot Restoration
```bash
npx local-memory-mcp migrate --rollback
```
Restores the SQLite database from the pre-migration snapshot taken immediately prior to data import.

### Rollback Path 2: Reverting Agent Configurations to Instance A
If the developer desires to revert to legacy Instance A:
1. Locate the automatic backup files created during `init`:
   - OpenCode: `%USERPROFILE%\.config\opencode\opencode.json.bak.<timestamp>`
   - Codex: `%USERPROFILE%\.codex\config.toml.bak.<timestamp>`
   - Claude: `%APPDATA%\Claude\claude_desktop_config.json.bak.<timestamp>`
   - Cursor: `%USERPROFILE%\.cursor\mcp.json.bak.<timestamp>`
2. Rename the backup file over the active configuration file.
3. The legacy MongoDB database remained completely untouched throughout the migration process, guaranteeing 100% data preservation.
