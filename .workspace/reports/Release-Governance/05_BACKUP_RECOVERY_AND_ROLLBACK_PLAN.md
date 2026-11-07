# Backup, Recovery, and Rollback Operational Runbook

**Date:** 2026-11-06  
**Auditing Agent:** Google Antigravity  
**Project:** `local-mcp-memory`  

---

## 1. Operational Safeguards Overview

The migration and cutover architecture is designed around multi-layer rollback guarantees:

```
+-------------------------------------------------------------------------+
|                  LAYER 1: SOURCE IMMUTABILITY (MONGODB)                 |
|  - MongoDB is accessed with read-only cursors; never mutated or dropped |
|  - v2.5.0 directory and configuration remain intact on developer disk    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                    LAYER 2: CRYPTOGRAPHIC BACKUP                        |
|  - Full JSONL export of all source collections created before writes   |
|  - SHA-256 checksums verified in manifest.json                          |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                 LAYER 3: DESTINATION SNAPSHOT & ROLLBACK                |
|  - Destination SQLite checkpointed and copied prior to migration        |
|  - rollbackMigration() restores destination snapshot on command        |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                 LAYER 4: MCP CLIENT CONFIGURATION BACKUP                |
|  - ~/.gemini/config/mcp_config.json backup created prior to cutover     |
|  - Immediate reversion to v2.5.0 shim if v2.6.0 server fails            |
+-------------------------------------------------------------------------+
```

---

## 2. Pre-Migration Backup Procedures

### Step 1: MongoDB Source Dump (Manual Snapshot)
Although `runMigration` automatically exports JSONL backups, an operator should run a standard `mongodump` as an extra safeguard:
```bash
mongodump --db mcp_memory --out "C:\path\to\safe_backup\mongo_mcp_memory_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
```

### Step 2: Client MCP Configuration Backup
Verify and back up the Antigravity global MCP configuration:
```powershell
Copy-Item "C:\Users\ranit\.gemini\config\mcp_config.json" "C:\Users\ranit\.gemini\config\mcp_config.json.backup_cutover"
```

---

## 3. Recovery Procedures (When Migration Encounters Errors)

### Scenario A: Migration Fails Mid-Run (Interrupted Connection / Power Loss)
1. Do not panic; source MongoDB was not written to.
2. Inspect the latest migration log under `%LOCALAPPDATA%\local-mcp-memory\logs\`.
3. Re-run migration with `--resume` to pick up unmigrated batches without duplicating:
   ```bash
   npx local-mcp-memory migrate --apply --resume
   ```

### Scenario B: Target Database Corruption Post-Migration
1. Locate the backup directory generated during the migration (e.g. `%LOCALAPPDATA%\local-mcp-memory\migration-backups\<timestamp>\`).
2. Verify backup manifest integrity:
   ```bash
   node -e "import('./src/core/migration/mongo-to-sqlite.js').then(m => m.verifyBackup({ backupDir: '<backupDir>' })).then(console.log)"
   ```
3. Execute automated rollback:
   ```bash
   npx local-mcp-memory migrate --rollback --from "<backupDir>" --yes
   ```

---

## 4. Cutover Rollback Procedure (Emergency Reversion to v2.5.0)

If a production cutover occurs and v2.6.0 fails to start or exhibits runtime issues:

1. **Stop v2.6.0 Process:** Terminate any running `local-mcp-memory` instances.
2. **Restore Global MCP Configuration:**
   ```powershell
   Copy-Item "C:\Users\ranit\.gemini\config\mcp_config.json.backup_20261105" "C:\Users\ranit\.gemini\config\mcp_config.json" -Force
   ```
3. **Verify v2.5.0 Accessibility:**
   - Antigravity restarts connection to `C:/Code_Works/HTML_CSS_JS/workProjects/website/local-mcp-memory/mcp-shim.js`.
   - Send `tools/list` $\to$ 54 tools returned.
   - Send `search_context` $\to$ historical memories retrieved from MongoDB.
4. **Zero Data Loss:** Because MongoDB was never mutated, all operational memory remains 100% intact.
