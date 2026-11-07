# Report 10: Git and NPM Package Hygiene Audit

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Git Exclusion Audit (`.gitignore`)

Inspection of `.gitignore` revealed that while standard Node.js artifacts (`node_modules/`, `coverage/`, `.env`) are excluded, several critical development, database, and backup directories are omitted:

| Directory / Pattern | Current `.gitignore` Status | Danger / Impact | Recommended Action |
| :--- | :---: | :--- | :--- |
| `.backups/` | **NOT IGNORED** | Database backups and SHA-256 files appear as untracked files | Add to `.gitignore` |
| `scratch/` | **NOT IGNORED** | Ephemeral scratchpad scripts appear as untracked files | Add to `.gitignore` |
| `.workspace/scratch/` | **NOT IGNORED** | Ephemeral workspace scratch files appear untracked | Add to `.gitignore` |
| `.workspace/temp/` | **NOT IGNORED** | Temporary workspace generation files appear untracked | Add to `.gitignore` |
| `*.db`, `*.sqlite`, `*.sqlite3` | **PARTIAL** (only `data/` ignored) | Any test database outside `data/` could be accidentally committed | Add explicit glob to `.gitignore` |
| `*-wal`, `*-shm` | **NOT IGNORED** | SQLite WAL and shared-memory index files could be committed | Add explicit glob to `.gitignore` |
| `.mcp-token*`, `.mcp-session*` | **IGNORED** | Session tokens safely excluded | Preserve |
| `.env*`, `!.env.example` | **IGNORED** | Plaintext environment secrets safely excluded | Preserve |

---

## 2. NPM Package Hygiene Audit

### A. Mechanism: `files` Allowlist vs. `.npmignore`
- In `package.json`, the `files` array is explicitly configured with 20 directory and file paths (`bin/`, `src/`, `core/`, `utils/`, `tools/`, `plugins/`, `dashboard/`, `shared/`, entry scripts, and docs).
- **Result:** `npm pack` strictly includes only files matching this allowlist. Development files (`tests/`, `.agent/`, `.workspace/`, `.github/`, `scripts/`, `.backups/`) are **100% excluded from the npm package by design.**
- **Verification Evidence:** `npm pack --dry-run` and clean-room installation in `scripts/verify-disposable-package-install.mjs` confirmed that:
  - Tarball contains exactly 127 files (308.3 kB compressed).
  - Zero test fixtures, local databases, or secret files exist in the tarball.

### B. Hygiene Defense-in-Depth Recommendation
While `package.json` `files` is effective, omitting `.npmignore` means that if a developer drops a test `.db` or `.env` directly inside `src/` or `utils/`, npm will pack it.
**Recommendation:** Create an explicit `.npmignore` file in the repository root as a fail-safe defense-in-depth:
```text
# Fail-safe exclusions inside shipped directories
*.db
*.sqlite
*.sqlite3
*-wal
*-shm
*.bak*
*.tmp
*.log
.env*
```

---

## 3. Package Verification Protocol for Releases

Every production release must run the automated verification protocol codified in `scripts/verify-disposable-package-install.mjs`:
1. Generate `local-mcp-memory-<version>.tgz` via `npm pack`.
2. Inspect tarball file inventory and assert zero matching forbidden patterns (`.git`, `.agent`, `.workspace`, `tests`, `*.db`).
3. Install tarball into a clean, disposable temporary directory in `os.tmpdir()`.
4. Spawn MCP stdio server and assert handshake with protocol `2024-11-05`.
5. Execute `tools/list` and assert all 63 tools are discoverable.
6. Execute `store_context` and `search_context` round-trip in an isolated database.
