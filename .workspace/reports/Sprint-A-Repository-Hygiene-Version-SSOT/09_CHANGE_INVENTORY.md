# Sprint A — Change Inventory

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `09_CHANGE_INVENTORY.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This document records the exact file modifications and additions performed during Sprint A. In accordance with Sprint A restrictions, changes were kept strictly minimal, focused solely on version SSOT, repository hygiene, package protection, and regression testing.

---

## 2. Modified Tracked Files

### 2.1 `mcp-server.js`
- **Scope:** Runtime MCP server entry point.
- **Change:**
  - Added `import { getPackageInfo } from './src/core/cli/package-info.js';`.
  - Replaced hardcoded `version: '2.6.0'` in `serverInfo` with `version: getPackageInfo().version`.
- **Diff:** +4 lines, -1 line.

### 2.2 `server.js`
- **Scope:** HTTP API server entry point.
- **Change:**
  - Added `import { getPackageInfo } from './src/core/cli/package-info.js';`.
  - Replaced hardcoded `version: '2.6.0'` in `/health` handler with `version: getPackageInfo().version`.
  - Replaced hardcoded `version: '2.6.0'` in `/health/detailed` handler with `version: getPackageInfo().version`.
- **Diff:** +4 lines, -2 lines.

### 2.3 `package.json`
- **Scope:** Package manifest and build scripts.
- **Change:**
  - Version preserved strictly at `"version": "2.6.0"`.
  - Added `node --check tests/version-ssot-test.js` to `"check"` script.
  - Added `"test:ssot": "node --test tests/version-ssot-test.js"` to `"scripts"`.
  - Added `npm run test:ssot` to `"test"` pipeline script.
- **Diff:** +3 lines, -2 lines.

### 2.4 `.gitignore`
- **Scope:** Git repository ignore rules.
- **Change:**
  - Appended explicit ignore rules for SQLite databases (`*.db`, `*.sqlite*`), journals (`*.db-wal`, `*.db-shm`), backups (`.backups/`, `backups/`), scratch directories (`scratch/`, `.workspace/scratch/`), temporary folders (`temp/`, `tmp/`), and keys (`*.pem`, `*.key`).
- **Diff:** +33 lines, -0 lines.

---

## 3. Newly Created Files

### 3.1 `.npmignore`
- **Scope:** Package distribution defense-in-depth denylist.
- **Content:** Explicitly denies local environment files, databases, backups, scratchpads, and git metadata from npm tarballs.

### 3.2 `tests/version-ssot-test.js`
- **Scope:** Automated regression test suite.
- **Content:** 7 automated test assertions validating SemVer format, lockfile synchronization, dynamic runtime version resolution, and absence of hardcoded literals in root servers.

### 3.3 Engineering Reports
- Authored 11 comprehensive reports in `.workspace/reports/Sprint-A-Repository-Hygiene-Version-SSOT/`.

---

## 4. Unmodified Boundaries & Invariants

- **Version Number:** Maintained strictly at `2.6.0` (zero premature bumps to `2.6.1`).
- **Lockfile (`package-lock.json`):** Maintained synchronized with `package.json` at `2.6.0`.
- **Database Files:** Zero modifications to live SQLite or MongoDB data.
- **Protected Instance:** Zero access or modifications to `website/local-mcp-memory`.
- **Global Antigravity Configuration:** Zero modifications.
- **GitHub Workflows:** Untouched (deferred to Sprint C).
