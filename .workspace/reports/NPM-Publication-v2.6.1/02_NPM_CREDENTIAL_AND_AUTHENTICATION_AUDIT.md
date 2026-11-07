# Report 02: npm Credential & Authentication Audit

**Campaign:** 12 — npm v2.6.1 Publication, Trusted Publishing Assessment & Post-Publication Verification  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Security & Release Auditor  

---

## 1. Executive Summary

This report documents the authentication audit of the replaced GitHub Actions secret `NPM_TOKEN` provided by the repository owner for the publication of `local-mcp-memory@2.6.1`.

---

## 2. Authentication Verification in CI

During workflow run **`42377486532`** on GitHub Actions, a dedicated non-disclosing authentication probe was executed:

```bash
npm whoami
```
**Environment Configuration**: `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`  
**Registry**: `https://registry.npmjs.org/`

### 2.1 Audit Results
| Check | Expected | Observed | Status |
| :--- | :--- | :--- | :--- |
| **Secret Presence** | `NPM_TOKEN` configured | Injected into runner environment | **PASS** |
| **Token Validity** | Active, non-revoked | Accepted by npm registry | **PASS** |
| **Identity Resolution** | Account match | Authenticated as `coderooz` | **PASS** |
| **Token Type Config** | Bypass 2FA enabled | 2FA OTP prompt triggered (`EOTP`) | **FAIL** |

---

## 3. Defect Analysis: Root Cause of `EOTP`

During the publication step, the npm CLI returned:
```text
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
npm error You can provide one with --otp=<code>, or by entering it when prompted.
```

### 3.1 Technical Explanation
The user's npm account (`coderooz`) has Two-Factor Authentication enforced on authorization and write operations.

When generating a token on npmjs.com:
1. **Granular Access Tokens**: By default, Granular Access Tokens require interactive 2FA OTP on publish *unless* the creator explicitly checks the box:
   > **"Bypass two-factor authentication (2FA) for publish actions"**
2. **Classic Tokens**: A classic token created as "Publish" requires 2FA OTP. Only classic tokens generated under the specific type **"Automation"** automatically bypass 2FA prompts in headless CI/CD environments.

Because the token lacks the Bypass 2FA setting, headless CI/CD execution is halted waiting for a live 6-digit one-time password.

---

## 4. Zero-Trust Security Compliance Attestation

1. **Zero Secret Disclosure**: The `NPM_TOKEN` secret was accessed strictly via GitHub Actions runners where GitHub masks the secret as `***`.
2. **Log Cleanliness**: Neither runner logs nor local workspace files contain any portion of the token string.
