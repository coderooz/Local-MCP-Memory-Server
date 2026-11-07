# Report 08: Backup, Recovery, and Rollback Plan

**Project:** local-mcp-memory  
**Version:** 2.6.0  
**Campaign:** Campaign 10 — Final Release Readiness, Production Migration Preflight & Controlled Cutover Authorization  
**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Status:** COMPLETE / VALIDATED  

---

## 1. Backup Strategy
Before executing the live production migration, an automated backup of both source and destination states is required.

### Target Backup Assets
1. **Destination SQLite Database:**
   - Source: `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db` (and `-wal`, `-shm`).
   - Destination: `.backups/sqlite-backup-<timestamp>.db`.
   - Algorithm: SHA-256 checksum calculated and saved to `.backups/sqlite-backup-<timestamp>.sha256`.
2. **MongoDB Production Snapshot:**
   - MongoDB remains intact as an independent database daemon. Since the migration only reads from MongoDB, the source database itself serves as the ultimate immutable rollback state.

---

## 2. Rollback Triggers & Criteria
A rollback must be initiated immediately if:
- Document count post-migration differs from source document count.
- Foreign-key violations are reported by `PRAGMA foreign_key_check`.
- Database corruption is reported by `PRAGMA integrity_check`.
- Critical tables fail to query or throw schema mismatch errors.

---

## 3. Step-by-Step Rollback Runbook
1. **Halt Process:** Terminate any running v2.6.0 processes.
2. **Restore SQLite DB:** Copy `.backups/sqlite-backup-<timestamp>.db` back to `%LOCALAPPDATA%\local-mcp-memory\mcp-memory.db`.
3. **Verify Restored Checksum:** Compute SHA-256 and assert match with `.sha256` file.
4. **Restart v2.5.0 Server:** Verify stable v2.5.0 resumes servicing memory requests.
