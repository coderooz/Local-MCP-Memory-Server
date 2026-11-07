# Report 01: Release and Tag Reconciliation

**Campaign:** 12 — npm v2.6.1 Publication, Trusted Publishing Assessment & Post-Publication Verification  
**Target Package:** `local-mcp-memory@2.6.1`  
**Registry Target:** `https://registry.npmjs.org/`  
**Date:** 2026-11-07  
**Author:** AI Lead Release Auditor  

---

## 1. Executive Summary

This report establishes the authoritative release baseline, Git tag anchor, commit lineage, and GitHub Release asset status for `local-mcp-memory@2.6.1` ahead of npm public distribution.

---

## 2. Git Tag & Commit Lineage

### 2.1 Git Tag Verification
- **Tag Name**: `v2.6.1`
- **Tag Type**: Annotated tag (`tagger: Ranit Saha <contact@coderooz.in>`)
- **Tagged Commit**: `6921592c9249d68577fd0307c8e598eff220c194`
- **Remote Tag Resolution**:
  ```text
  7555f76f6460ca04fe6c06f2f58ff0cde305b19d refs/tags/v2.6.1
  6921592c9249d68577fd0307c8e598eff220c194 refs/tags/v2.6.1^{}
  ```
- **Tag Policy Compliance**: Tag `v2.6.1` remains strictly immutable. It has not been deleted, moved, or rewritten.

### 2.2 Branch & Commit Evolution on `main`
Following the creation of tag `v2.6.1`, the `main` branch incorporated essential maintenance, Node.js 22 Active LTS modernization per user directive, CI runner pinning, and workflow hardening:

| Commit SHA | Author | Summary |
| :--- | :--- | :--- |
| `6921592` | Ranit Saha | `fix(ci): pin ubuntu-24.04 and harden release workflows` [Tagged as `v2.6.1`] |
| `5ebf03b` | Antigravity AI | `fix(ci): add npm rebuild better-sqlite3 and otp input to publish-npm` |
| `910f383` | Antigravity AI | `ci: configure Node 22.x matrix on ubuntu-24.04` |
| `1d99d15` | Antigravity AI | `chore(engine): upgrade Node.js requirement to v22 (Active LTS)` |
| `9967852` | Antigravity AI | `docs(governance): post-release v2.6.1 closure and issue reconciliation` |
| `df56f70` | Antigravity AI | `ci(publish): harden npm publish workflow with auth check, version guard, and provenance` |

---

## 3. GitHub Release Verification

- **Release Name**: `Release v2.6.1`
- **Release Tag**: `v2.6.1`
- **Target Commitish**: `6921592c9249d68577fd0307c8e598eff220c194`
- **Status**: Live, non-draft, public.
- **URL**: `https://github.com/coderooz/Local-MCP-Memory-Server/releases/tag/v2.6.1`
- **Published Timestamp**: `2026-11-07T06:28:28Z`
- **Attached Source Archives**: Automatically generated `zip` and `tar.gz` source archives.
