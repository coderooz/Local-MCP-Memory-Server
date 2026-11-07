# Report 05: Pre-Publication Gate Evaluation

**Campaign:** 12 — npm v2.6.1 Publication, Trusted Publishing Assessment & Post-Publication Verification  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Quality & Release Gate Auditor  

---

## 1. Release Gate Evaluation Matrix

Prior to executing the release publication, all 10 mandatory release gates were evaluated:

| Gate # | Release Gate | Required Result | Observed Evaluation | Gate Verdict |
| :---: | :--- | :--- | :--- | :---: |
| **G1** | **Package Identity** | `local-mcp-memory` | `package.json` `"name": "local-mcp-memory"` | **PASS** |
| **G2** | **Version SSOT** | `2.6.1` | Authoritative version matches `2.6.1` across all entry points | **PASS** |
| **G3** | **npm Registry Uniqueness** | Version not yet published | `npm view local-mcp-memory@2.6.1` returns 404 Not Found | **PASS** |
| **G4** | **Git Tag Alignment** | Tag `v2.6.1` exists | Tag `v2.6.1` exists locally and on remote `origin` | **PASS** |
| **G5** | **GitHub Release** | Live & valid source | Live at `coderooz/Local-MCP-Memory-Server/releases/tag/v2.6.1` | **PASS** |
| **G6** | **CI Status** | Required checks green | Run #42348001909 is 100% green across all 6 jobs | **PASS** |
| **G7** | **Artifact Verification** | Clean-room install | 127 files, 63 tools, memory round-trip verified (100%) | **PASS** |
| **G8** | **Authentication** | Active token / OIDC | Token is authentic (`coderooz`), but enforces interactive 2FA | **BLOCKER** |
| **G9** | **Provenance** | Supported | Configured via `id-token: write` and `--provenance` | **PASS** |
| **G10** | **Security & Hygiene** | No leaked credentials | 0 secrets tracked; repository and tarball clean | **PASS** |

---

## 2. Gate Decision & Blocker Analysis

Gates G1 through G7, G9, and G10 passed with 100% compliance.

Gate G8 encountered a specific configuration constraint:
- The token in `NPM_TOKEN` is authenticated as `coderooz`.
- However, npm requires an interactive One-Time Password (`EOTP`) for write actions because the token does not have "Bypass two-factor authentication (2FA) for publish actions" enabled on npmjs.com.
- Therefore, headless automated publication cannot complete without either:
  1. Enabling "Bypass 2FA" on the token (or creating a Classic Automation token).
  2. Providing a live 6-digit OTP to the workflow input.
