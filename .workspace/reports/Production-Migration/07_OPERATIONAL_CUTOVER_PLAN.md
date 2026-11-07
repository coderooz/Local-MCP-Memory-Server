# Report 07: Operational Cutover Plan & Smoke Test Protocol

**Campaign:** Campaign 7 — Production Data Migration & Operational Memory Activation  
**Package:** `local-mcp-memory`  
**Target Version:** `2.6.0`  
**Audit Date:** 2026-11-06  
**Auditor / Agent:** Google Antigravity  

---

## 1. Executive Summary

This plan outlines the exact sequence of engineering actions required to migrate the 29,827 production records from MongoDB to the local SQLite runtime, verify data accessibility, activate the v2.6.0 server for daily use, and validate client operations via smoke tests.

**No part of this plan will be executed until the user explicitly authorizes the operation.**

---

## 2. Prerequisites & Preflight Checklist

Before initiating cutover, verify:
- [ ] MongoDB is online at `mongodb://127.0.0.1:27017/mcp_memory`.
- [ ] No local-mcp-memory processes are writing to SQLite (`node bin/cli.js doctor` reports healthy).
- [ ] Native pre-migration backup exists at `.backups/sqlite-pre-migration/mcp-memory-pre-migration.db`.
- [ ] Disk space exceeds 100 MB on `%LOCALAPPDATA%`.

---

## 3. Step-by-Step Migration Execution Procedure

### Step 1: Execute Migration with Verified Resume & Backup
Run the migration engine in `apply` mode with `--resume` (to merge into the existing SQLite database without clashing with the 31 test records):

```bash
node bin/cli.js migrate \
  --from mongodb://127.0.0.1:27017/mcp_memory \
  --resume \
  --apply \
  --report .reports/Production-Migration/migration-apply-report.json
```

*Expected Duration:* 15–25 seconds for 29,827 documents.  
*Expected Result:*
- Source backup created in `%LOCALAPPDATA%\local-mcp-memory\migration-backups\<timestamp>\`.
- Pre-migration destination snapshot saved as `destination-before-migration.db`.
- 29,827 documents inserted across 16 tables in batches of 500.
- FTS5 full-text indexes rebuilt automatically.

---

## 4. Post-Migration Verification & Smoke Tests

### Test 1: System Health & Table Count Verification
```bash
node bin/cli.js doctor
node bin/cli.js status
```
*Criteria:* 8 checks passing, table row count in `contexts` increased to ~2,649 (2,618 migrated + 31 test).

### Test 2: MCP Stdio Protocol Smoke Test
Spawn a temporary stdio session using `node tests/local-setup-mcp-verify.mjs` or direct JSON-RPC:
- Verify `initialize` handshake succeeds.
- Verify `tools/list` returns all 63 tools.

### Test 3: Historical Memory Retrieval Smoke Test
Query for well-known historical project memories across different project scopes:
```bash
# Start background HTTP server
npm run start:dashboard

# Search for historical records
node bin/cli.js search "LocalCart"
node bin/cli.js search "brain-network"
```
*Criteria:* Returns authentic historical context records created in past sessions.

### Test 4: Task & Issue Retrieval Smoke Test
```bash
node bin/cli.js list-tasks
node bin/cli.js list-issues
```
*Criteria:* Correctly displays tasks migrated from the 789 historical tasks.

---

## 5. Antigravity Global MCP Client Cutover (Optional Post-Approval Step)

Only after the user reviews post-migration verification results and approves switching Google Antigravity:

Update `C:\Users\ranit\.gemini\antigravity\mcp_config.json`:
```json
{
  "mcpServers": {
    "local-mcp-memory": {
      "command": "node",
      "args": [
        "C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/mcp-server.js"
      ],
      "env": {
        "MCP_SCOPE": "project",
        "NODE_ENV": "production"
      },
      "cwd": "C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory"
    }
  }
}
```

*Fallback / Rollback:* Revert `mcp_config.json` to point back to `website/local-mcp-memory/mcp-shim.js` with `MONGO_URI`.

---

## 6. Cutover Plan Verdict

**CUTOVER PLAN: READY FOR AUTHORIZATION**  
All commands, smoke tests, validation criteria, and cutover steps are defined and ready.
