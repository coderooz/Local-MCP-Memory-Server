# Report 03: Version 2.6.1 Release Eligibility and Versioning Strategy

**Project:** `local-mcp-memory`  
**Current Version:** `2.6.0`  
**Proposed Target:** `2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Version Inventory Across the Codebase

Our audit identified every location where version numbers are defined, reported, or asserted:

| Location | Form | Current Value | Nature | Synchronization Risk |
| :--- | :--- | :--- | :--- | :--- |
| `package.json` | JSON string | `"2.6.0"` | **Canonical Manifest** | Primary Source |
| `package-lock.json` | JSON string | `"2.6.0"` | Lockfile | Automated via npm |
| `src/core/cli/package-info.js` | Dynamic read | Reads `package.json` | Dynamic | None (reads manifest) |
| `bin/cli.js` | Method call | `program.version(pkg.version)` | Dynamic | None (reads `package-info`) |
| `mcp-server.js:1826` | Hardcoded literal | `version: '2.6.0'` | **Static Constant** | **HIGH (Manual edit required)** |
| `server.js:2049` | Hardcoded literal | `version: '2.6.0'` | **Static Constant** | **HIGH (Manual edit required)** |
| `server.js:2129` | Hardcoded literal | `version: '2.6.0'` | **Static Constant** | **HIGH (Manual edit required)** |
| `tests/local-setup-mcp-verify.mjs:183` | Assertion | `'2.6.0'` | Test expectation | Moderate (breaks if bumped) |
| `.agent/config/agent-policy.json` | JSON string | `"2.6.0"` | Policy schema | Low |
| `.agent/config/capabilities.json` | JSON string | `"2.6.0"` | Metadata | Low |
| `docs/connection-lifecycle.md` | Markdown text | `v2.6.0` | Documentation | Moderate |
| `CHANGELOG.md` | Markdown heading | `[v2.5.0]` | Release notes | High (v2.6.0 notes unfinalized) |

---

## 2. Semantic Versioning Analysis: Why v2.6.1?

### SemVer Rules (Major.Minor.Patch)
- **MAJOR:** Incompatible API / protocol breaking changes.
- **MINOR:** Backward-compatible new features.
  *(v2.6.0 introduced major new features: embedded SQLite engine, Express 5, MCP server registry, execution sandbox, and 63 tools)*.
- **PATCH:** Backward-compatible bug fixes, documentation, CI workflows, security hardening, and governance.

### Release Classification Rationale
The upcoming campaign focuses on **hardening the repository, synchronizing documentation, securing GitHub Actions, improving contributor experience, and eliminating release risks**. No public MCP tool schemas or protocol boundaries are broken. Therefore, **`2.6.1` is strictly and correctly classified as a PATCH release.**

---

## 3. Proposal: Single Source of Truth (SSOT) Architecture

To eliminate the danger of version divergence:
1. **Declare `package.json` as the Sole Authoritative Version Source.**
2. **Refactor `mcp-server.js` and `server.js`:**
   Instead of hardcoding `version: '2.6.0'`, import `getPackageInfo()` from `src/core/cli/package-info.js`:
   ```javascript
   import { getPackageInfo } from './src/core/cli/package-info.js';
   const { version: SERVER_VERSION } = getPackageInfo();
   // Use SERVER_VERSION in initialize responses
   ```
3. **Automated Synchronization in Release Workflow:**
   During release execution, `npm version patch --no-git-tag-version` automatically updates `package.json` and `package-lock.json`. Because `mcp-server.js` and `server.js` dynamically read `package.json`, they immediately reflect the new version with zero manual file edits.

---

## 4. Release Eligibility Assessment

| Release Prerequisite | Current Status | Blocker Description |
| :--- | :---: | :--- |
| **All Test Suites Passing** | **PASS** | 242/242 assertions green |
| **Single Version SSOT** | **FAIL** | Hardcoded version literals in `mcp-server.js` and `server.js` |
| **Clean Package Build** | **PASS** | Verified via `npm pack --dry-run` and clean-room install |
| **Safe Release CI Workflow** | **FAIL** | `auto-tag.yml` creates unvetted tags; no npm publish workflow |
| **Accurate Documentation** | **FAIL** | `SECURITY.md` and `README.md` contain critical inaccuracies |
| **Repository Hygiene** | **FAIL** | `.gitignore` missing `.backups/`, `scratch/`, and SQLite WAL files |

**Conclusion:** v2.6.1 is **NOT YET ELIGIBLE FOR IMMEDIATE TAGGING**. The planning roadmap (Sprint A–E) must be executed to resolve the 4 failing prerequisites.
