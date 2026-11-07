# Sprint A — Remaining Risks and Mitigation Plan

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `10_REMAINING_RISKS.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & DOCUMENTED  

---

## 1. Executive Summary

Sprint A successfully retired several key risks identified in Campaign 10.1 (specifically RSK-04: Hardcoded Version String Literals and RSK-05: Git & npm Hygiene Omissions). This document updates the risk register and outlines remaining risks that will be addressed in subsequent sprints.

---

## 2. Retired Risks (Resolved in Sprint A)

- **RSK-04 (Priority P1 / High) — RESOLVED**:
  - *Risk:* Hardcoded version literals in `mcp-server.js` and `server.js` would drift upon future version bumps.
  - *Remediation Applied:* Both entry points dynamically import `getPackageInfo().version`. Added `tests/version-ssot-test.js` to ensure zero drift.
- **RSK-05 (Priority P1 / High) — RESOLVED**:
  - *Risk:* Missing `.backups/`, `scratch/`, and SQLite WAL files in `.gitignore` risked staging private data.
  - *Remediation Applied:* Updated `.gitignore` with 33 comprehensive patterns and added `.npmignore` defense-in-depth denylist. Verified via `git check-ignore` and clean `npm pack --dry-run`.

---

## 3. Active Risks for Subsequent Sprints

```
+--------+----------+-------------------------------------------------------+---------------+
| Risk ID| Priority | Description & Current State                           | Target Sprint |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-01 | P0       | Uncontrolled Auto-Tagging & Release Hazard            | Sprint C      |
|        | (Blocker)| `.github/workflows/auto-tag.yml` creates public tags  |               |
|        |          | without authorization on push to main.                |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-02 | P0       | Inaccurate Public Security & Support Documentation    | Sprint B      |
|        | (Blocker)| `SECURITY.md` claims support is limited to `2.4.x`,   |               |
|        |          | denies auth exists, and denies crypto exists.         |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-03 | P0       | Lack of Automated npm Publishing Workflow             | Sprint C      |
|        | (Blocker)| No CI workflow exists to publish packages to npm via  |               |
|        |          | GitHub OIDC trusted publishing.                       |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-06 | P1       | CI ESM Scope Syntax Failure                           | Sprint C      |
|        | (High)   | `.github/workflows/ci.yml` line 128 uses `require()`  |               |
|        |          | inside an ESM package, breaking CI runs.              |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-07 | P1       | Incomplete CI Test Suite & OS Matrix                  | Sprint C      |
|        | (High)   | CI does not test on Windows or Node 22, and omits    |               |
|        |          | resilience and sandbox security test suites.          |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-08 | P1       | Documentation Default Port & CLI Quickstart Gaps      | Sprint B      |
|        | (High)   | `README.md` lists PORT=4000 (actual is 3799) and      |               |
|        |          | omits Antigravity and Roo Code from Quickstart.       |               |
+--------+----------+-------------------------------------------------------+---------------+
| RSK-09 | P2       | Contributor Onboarding Friction                       | Sprint D      |
|        | (Medium) | `CONTRIBUTING.md` lacks PR lifecycle and step-by-step |               |
|        |          | guides for adding tools or agent adapters.            |               |
+--------+----------+-------------------------------------------------------+---------------+
```

---

## 4. Next Step Recommendation

With Sprint A complete and verified, the repository is ready to proceed to **Sprint B: Documentation Synchronization & Gap Remediation**, which will resolve RSK-02 and RSK-08.
