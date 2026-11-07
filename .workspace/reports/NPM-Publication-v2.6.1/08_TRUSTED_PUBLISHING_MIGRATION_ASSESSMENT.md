# Report 08: npm Trusted Publishing (OIDC) Migration Assessment

**Campaign:** 12 — npm v2.6.1 Publication, Trusted Publishing Assessment & Post-Publication Verification  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Security & Identity Architecture Auditor  

---

## 1. Executive Summary

This report evaluates the migration path from long-lived authentication tokens (`NPM_TOKEN`) to npm **Trusted Publishing** via GitHub Actions OpenID Connect (OIDC).

---

## 2. Comparison: Token-Based vs Trusted Publishing

| Attribute | Current Token Approach | npm Trusted Publishing (OIDC) |
| :--- | :--- | :--- |
| **Credential Type** | Long-lived secret stored in GitHub repository | Ephemeral, short-lived OIDC token minted per job |
| **Secret Management**| Risk of token leaks, requires manual rotation | Zero stored secrets; no rotation needed |
| **2FA Friction** | Blocked by account-level write 2FA (`EOTP`) | Bypasses 2FA via cryptographically signed OIDC claim |
| **Build Provenance** | Requires token permissions + OIDC signing | Natively integrated with Sigstore provenance |
| **Industry Standard**| Legacy (npm deprecating bypass tokens by 2027) | Current modern supply-chain standard |

---

## 3. Trusted Publishing Implementation Guide for `local-mcp-memory`

To migrate `local-mcp-memory` to Trusted Publishing:

### Step 1: Configure Pending Publisher on npmjs.com
Because `local-mcp-memory` is a new package not yet registered on npm:
1. Log in to [npmjs.com](https://www.npmjs.com/).
2. Navigate to **Account Settings** -> **Publishing Access**.
3. Under **Pending Publishers**, click **Add Pending Publisher**.
4. Fill in the repository bindings:
   - **Package Name**: `local-mcp-memory`
   - **GitHub Organization / User**: `coderooz`
   - **Repository Name**: `Local-MCP-Memory-Server`
   - **Workflow Filename**: `publish-npm.yml`
   - **Environment**: *(leave blank unless using GitHub environments)*

### Step 2: Update Workflow Configuration
When Trusted Publishing is active, `actions/setup-node` does not require `NODE_AUTH_TOKEN`. npm automatically detects the GitHub Actions OIDC environment (`ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN`) and exchanges it for a single-use publish token.

---

## 4. Strategic Recommendation

1. **Immediate Release (v2.6.1)**:
   - Complete initial publication using the token-based path by enabling **"Bypass two-factor authentication (2FA) for publish actions"** on the npm token, or creating a Classic **Automation** token, or providing the interactive 6-digit OTP to the workflow input.
2. **Post-Publication (v2.7+)**:
   - Once `local-mcp-memory` is published, bind `coderooz/Local-MCP-Memory-Server` as a Trusted Publisher directly in the package settings, and delete the repository secret `NPM_TOKEN`.
