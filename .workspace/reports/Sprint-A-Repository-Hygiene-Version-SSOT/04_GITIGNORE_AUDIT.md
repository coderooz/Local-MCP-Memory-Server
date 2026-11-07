# Sprint A — Gitignore and Repository Hygiene Audit

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `04_GITIGNORE_AUDIT.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Objective

Audit and strengthen `.gitignore` to ensure that local database files, write-ahead logs, backups, ephemeral scratch directories, and private keys can never accidentally enter Git history, while strictly preserving trackable architecture documentation, PRI/LFI indices, and agent templates.

---

## 2. Identified Gaps in Prior `.gitignore`

Prior to Sprint A, `.gitignore` contained comprehensive rules for Node.js development, but lacked protection for several project-specific runtime and engineering artifacts:
1. **Missing Backup Directory Exclusions:** `.backups/` and `backups/` were untracked and visible in `git status`.
2. **Missing Scratch & Staging Exclusions:** `scratch/` and `.workspace/scratch/` were exposed as untracked folders.
3. **Missing SQLite WAL & SHM Patterns:** While `data/` was ignored, loose local SQLite files (`*.db-wal`, `*.db-shm`, `*.sqlite-wal`) lacked explicit global patterns.
4. **Missing Cryptographic Material Patterns:** `*.pem`, `*.key`, `*.cert` were not explicitly forbidden.

---

## 3. Implemented Improvements in `.gitignore`

The following clean, categorized hygiene block was appended to `.gitignore`:

```gitignore
# Local databases, WAL/SHM journals, and locks
*.db
*.db-journal
*.db-wal
*.db-shm
*.sqlite
*.sqlite3
*.sqlite-wal
*.sqlite-shm

# Local backups, dumps, and archive directories
.backups/
backups/
*.dump
*.bson
*.archive

# Ephemeral scratch, temporary, and staging directories
scratch/
.workspace/scratch/
temp/
tmp/
.workspace/temp/
*.tmp
.agent/scratch/
.agent/temp/

# Private keys, certificates, and credentials
*.pem
*.key
*.cert
*.crt
```

---

## 4. Verification via `git check-ignore`

Rules were tested against actual paths using `git check-ignore -v`:

```
+------------------------------------+-----------------------+-----------------------------+
| Tested Target Path                 | Matching Rule Line    | Verification Status         |
+------------------------------------+-----------------------+-----------------------------+
| `.backups/`                        | `.gitignore:193`      | IGNORED (PASS)              |
| `scratch/`                         | `.gitignore:200`      | IGNORED (PASS)              |
| `.workspace/scratch/`              | `.gitignore:201`      | IGNORED (PASS)              |
| `test.db`                          | `.gitignore:183`      | IGNORED (PASS)              |
| `test.db-wal`                      | `.gitignore:185`      | IGNORED (PASS)              |
| `test.pem`                         | `.gitignore:210`      | IGNORED (PASS)              |
+------------------------------------+-----------------------+-----------------------------+
```

---

## 5. Verification of Tracked Governance Assets

Critical governance documents were tested to confirm they remain trackable and are NOT inadvertently ignored:

```
+--------------------------------------------------------+-------------------------------------+
| Critical Governance File                               | git check-ignore Result             |
+--------------------------------------------------------+-------------------------------------+
| `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`            | NOT IGNORED (Eligible for Git)      |
| `.workspace/LFI/LOGIC_FLOW_INDEX.md`                   | NOT IGNORED (Eligible for Git)      |
| `.agent/instructions/SYSTEM.md`                        | NOT IGNORED (Eligible for Git)      |
| `.agent/config/agent-policy.json`                      | NOT IGNORED (Eligible for Git)      |
| `.env.example`                                         | NOT IGNORED (Explicit allow rule)   |
| `.workspace/reports/*`                                 | NOT IGNORED (Durable audit history) |
+--------------------------------------------------------+-------------------------------------+
```

---

## 6. Git Status Impact

Following this remediation, `git status --short` immediately cleaned up untracked noise:
- `.backups/` disappeared from untracked list.
- `scratch/` disappeared from untracked list.
- `.workspace/scratch/` disappeared from untracked list.
- Zero tracked files were deleted or destabilized.
