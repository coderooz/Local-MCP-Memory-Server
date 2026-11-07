# Report 03: Publish Workflow Security Audit

**Campaign:** 12 — npm v2.6.1 Publication, Trusted Publishing Assessment & Post-Publication Verification  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI DevOps & CI/CD Security Auditor  

---

## 1. Workflow Architecture & Configuration

The publication workflow `.github/workflows/publish-npm.yml` governs the automated and manual publishing lifecycle of `local-mcp-memory`:

```yaml
name: Publish to npm

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      otp:
        description: 'NPM 2FA OTP Code (if 2FA is required)'
        required: false
        type: string
      tag:
        description: 'Tag or version to publish (defaults to package.json version)'
        required: false
        type: string

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

permissions:
  contents: read
  id-token: write
```

---

## 2. Hardening Measures Implemented in Campaign 12

In commit `df56f70`, the workflow was fortified with five critical release governance controls:

| Governance Check | Implementation | Protective Benefit |
| :--- | :--- | :--- |
| **Strict Version Guard** | `if [ "$CURRENT_VERSION" != "2.6.1" ]; then exit 1; fi` | Prevents unintended version publishing if repository HEAD drifts. |
| **Duplicate Publication Guard** | `if npm view local-mcp-memory@$CURRENT_VERSION version; then exit 0; fi` | Idempotent skip; avoids failed builds if re-triggered after successful release. |
| **Identity Verification Probe** | `npm whoami` | Non-disclosing confirmation of authentication status prior to publish. |
| **Native Dependency Rebuild** | `npm rebuild better-sqlite3` | Ensures native C++ bindings are compiled and linked on Ubuntu 24.04 runner. |
| **Sigstore Provenance Support** | `npm publish --access public --provenance` | Generates cryptographically verifiable build attestations via OIDC. |
| **Interactive OTP Fallback** | Optional `otp` workflow input | Allows manual OTP dispatch if the npm token enforces interactive 2FA. |

---

## 3. Least-Privilege & Security Audit

- **Permissions**: `contents: read` and `id-token: write`. No write access to repository contents is granted, preventing supply-chain token escalations.
- **Secret Isolation**: `NODE_AUTH_TOKEN` is passed exclusively to steps communicating with the npm registry. It is omitted from environment variables in checkout, build, and validation steps.
