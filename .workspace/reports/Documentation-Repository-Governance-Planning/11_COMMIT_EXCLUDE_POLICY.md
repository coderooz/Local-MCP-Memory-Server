# Report 11: Repository Commit, Exclude, and Reporting Policy

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. The Core Repository Governance Dilemma

An active AI-assisted project generates extensive documentation: logs, test outputs, execution traces, migration dry-runs, and audit reports.
- **Over-committing** turns the Git repository into an unmanageable data swamp, bloating clone times, complicating diffs, and risking secret leakage.
- **Under-committing** destroys historical context, causing subsequent developers or AI agents to duplicate audits, lose architectural rationale, and repeat previously resolved errors.

---

## 2. Commit / Exclude / Optional Policy Matrix

| Category | Policy | Justification & Guidelines |
| :--- | :---: | :--- |
| **`.workspace/PRI/`** | **COMMIT** | Authoritative structural codebase reference index. Required by human contributors and AI agents. |
| **`.workspace/LFI/`** | **COMMIT** | Authoritative logic and runtime control-flow index. Required for safe code modifications. |
| **`.agent/` Canonical Workspace** | **COMMIT** | Non-negotiable universal agent rules, policies, schemas, maps, and templates. Eliminates multi-agent drift. |
| **Root Bootstrap Files** | **COMMIT** | Lightweight compatibility pointers (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `OPENCODE.md`, `.clinerules`). |
| **`.workspace/decisions/` (ADRs)**| **COMMIT** | Architecture Decision Records represent permanent engineering decisions and must be versioned. |
| **`.workspace/specifications/`** | **COMMIT** | Technical specifications for MCP tools, storage engines, and sandboxes. |
| **`.workspace/plans/`** | **COMMIT** | Active release, migration, and cutover roadmaps. |
| **`.workspace/resources/`** | **COMMIT** | 33 deep domain and conceptual architecture guides. |
| **`.workspace/reports/`** | **SELECTIVE** | **Authoritative summaries and milestone packages must be committed; raw ephemeral logs excluded.** |
| **`.backups/`** | **EXCLUDE** | Local SQLite and MongoDB database backups contain binary data. Never commit to Git. |
| **`scratch/`, `.workspace/scratch/`**| **EXCLUDE** | Disposable test scripts and one-off debug files. |
| **`.workspace/temp/`** | **EXCLUDE** | Temporary generation artifacts. |
| **`data/` & Local Databases** | **EXCLUDE** | Runtime SQLite databases (`*.db`, `*.sqlite`, `wal`, `shm`) must never enter version control. |
| **Secrets & Session Files** | **EXCLUDE** | `.env`, `.mcp-token*`, `.mcp-session*` must remain strictly excluded. |

---

## 3. Durable Reporting Policy

To maintain a clean repository without losing critical engineering evidence:

1. **What to Commit in `.workspace/reports/`:**
   - **Master Indexes:** `.workspace/reports/README.md` and `.workspace/reports/INDEX.md`.
   - **Milestone Final Packages:** The numbered summary reports from finalized campaigns (e.g., Campaign 4 `Deployment-Readiness`, Campaign 8 `Migration-Integrity`, Campaign 9 `Agent-Workspace-Governance`, Campaign 10 `Final-Release-Preflight`, and `Documentation-Repository-Governance-Planning`).
2. **What to Exclude from Git:**
   - Ephemeral terminal dumps, raw test traces, temporary memory logs, and redundant iteration scratchpads.
3. **Recommended `.gitignore` Additions:**
   ```gitignore
   # Local database backups and snapshots
   .backups/
   
   # Ephemeral scratch scripts and workspaces
   scratch/
   .workspace/scratch/
   .workspace/temp/
   
   # SQLite database files and WAL logs outside data/
   *.db
   *.db-wal
   *.db-shm
   *.sqlite
   *.sqlite3
   ```
