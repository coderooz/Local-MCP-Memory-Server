# Report 07: Repository Hygiene, Exclusion Rules & Git Governance

**Campaign:** 11 — Final v2.6.1 Release Verification, GitHub Issue Closure & Workflow Remediation  
**Target Version:** `v2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Engineering & Repository Governance Auditor  

---

## 1. Executive Summary

This report assesses repository hygiene, version-control exclusion rules (`.gitignore`), package tarball distribution rules (`files` whitelist in `package.json`), and filesystem cleanliness for `local-mcp-memory` v2.6.1.

---

## 2. `.gitignore` Rule Analysis and Audit

The repository `.gitignore` was audited against common secret leaks, test runner artifacts, database files, and local runtime state:

| Category | Targeted Patterns | Verification Outcome |
| :--- | :--- | :--- |
| **Secrets & Keys** | `*.pem`, `*.key`, `*.cert`, `*.crt`, `.env*` (except `.env.example`) | PASS — Zero secrets tracked or committable |
| **Databases & Journals** | `*.db`, `*.sqlite`, `*.db-wal`, `*.sqlite-wal`, `data/` | PASS — SQLite databases excluded from Git |
| **Backups & Dumps** | `.backups/`, `backups/`, `*.dump`, `*.bson`, `*.archive` | PASS — Local migration dumps strictly excluded |
| **Scratch & Temp** | `scratch/`, `.workspace/scratch/`, `tmp/`, `.agent/scratch/` | PASS — Ephemeral agent scripts excluded |
| **Runtime MCP State** | `.mcp-runtime.json`, `*.mcp-runtime.json`, `.mcp-port` | PASS — Dynamic process state excluded |
| **Public Docs & Specs** | `docs/`, `.workspace/resources/`, `README.md` | PASS — All user/developer documentation tracked |

---

## 3. Working Tree and Staging Verification

Executing `git status --ignored` in the development root confirms:
```text
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  .workspace/reports/Post-Release-Closure-v2.6.1/

Ignored files:
  .backups/
  .mcp-runtime.json
  .opencode/node_modules/
  .workspace/scratch/
  data/
  node_modules/
  scratch/
```

- Zero extraneous, temporary, or untracked code files exist.
- No binary tarball (`*.tgz`) remains in the repository root.
- The working tree is pristine.
