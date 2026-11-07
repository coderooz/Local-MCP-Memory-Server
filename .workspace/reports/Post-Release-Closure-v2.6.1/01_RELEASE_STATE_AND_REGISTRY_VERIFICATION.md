# Report 01: Release State and Registry Verification

**Campaign:** 11 — Final v2.6.1 Release Verification, GitHub Issue Closure & Workflow Remediation  
**Target Version:** `v2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Engineering & Release Auditor  

---

## 1. Executive Summary

This report provides the authoritative verification of the release and registry state for `local-mcp-memory` v2.6.1. Previous Sprint reports (Campaign 10.4) anticipated immediate npm availability upon tag creation. This independent audit confirms the exact status across Git, GitHub Releases, and the public npm registry.

| Component | Target Identifier | Observed Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Git Tag** | `v2.6.1` | **Verified Present** | Tag exists locally and on remote `origin`, pointing to commit `d79c15d` |
| **GitHub Release** | `v2.6.1` | **Verified Live** | `https://github.com/coderooz/Local-MCP-Memory-Server/releases/tag/v2.6.1` |
| **GitHub Actions CI** | Run `42348001909` | **100% Success (6/6)** | Security, Lint, Isolation, Tests, Syntax, Build & Package Verification |
| **npm Registry** | `local-mcp-memory@2.6.1` | **Unpublished (404)** | `npm view local-mcp-memory` returns HTTP 404 (E404 Not Found) |

---

## 2. Git Tag and GitHub Release Verification

### 2.1 Git Tag
- **Tag Name**: `v2.6.1`
- **Release Commit**: `d79c15dd05bbd9a24687d894b4cf008709322300`
- **Verification Command**:
  ```bash
  git tag -v v2.6.1
  git ls-remote --tags origin
  ```
- **Evidence**:
  ```text
  d79c15dd05bbd9a24687d894b4cf008709322300 refs/tags/v2.6.1
  ```

### 2.2 GitHub Release
- **URL**: `https://github.com/coderooz/Local-MCP-Memory-Server/releases/tag/v2.6.1`
- **Title**: `v2.6.1 — Production-Ready Migration, Hardened Isolation & CLI Suite`
- **Assets Attached**:
  - Source code (`zip`)
  - Source code (`tar.gz`)
  - Release tarball: `local-mcp-memory-2.6.1.tgz` (SHA256 verified)

---

## 3. npm Registry Reality Check

### 3.1 Verification Command & Output
```bash
npm view local-mcp-memory
```
**Observed Response**:
```text
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/local-mcp-memory - Not found
npm error 404 'local-mcp-memory' is not in this registry.
```

### 3.2 Root Cause Analysis
Examination of GitHub Actions run `42347450703` on workflow `publish-npm.yml` revealed the exact failure:
```text
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
npm error You can provide one with --otp=<code>, or by entering it when prompted.
```

The publisher's npmjs account has Two-Factor Authentication (2FA) enforced on write operations. A standard Publish Token created with 2FA requires an interactive OTP code.

### 3.3 Remediation Path
1. **Automation Token**: Generate an npm **Automation** token on [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens). Automation tokens bypass the interactive OTP prompt and are specifically designed for CI/CD environments.
2. **Interactive OTP Support**: In commit `6921592`, `.github/workflows/publish-npm.yml` was upgraded to accept an optional `otp` input on `workflow_dispatch`. If using a token subject to 2FA, the user can trigger the workflow manually with the live 6-digit code.
