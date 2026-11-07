# Report 02: npm Credential Rotation Status & Security Protocol

**Campaign:** 11 — Final v2.6.1 Release Verification, GitHub Issue Closure & Workflow Remediation  
**Target Version:** `v2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Engineering & Security Auditor  

---

## 1. Security Context & Incident Review

During the execution of Campaign 10.4, user interface interactions included visible artifacts where an npm credential string was displayed in user-facing views. 

Under industry security best practices and our strict pair programming governance rules:
> **Zero-Trust Token Policy**: Any credential, API key, or authentication token displayed in unmasked user prompts, screenshots, or logs must be treated as immediately and permanently compromised.

---

## 2. Mandatory Remediation Protocol

To protect the `local-mcp-memory` package namespace and maintain supply-chain integrity, the following actions are mandated:

### 2.1 Action 1: Revocation of Compromised Token
1. Log in to [npmjs.com](https://www.npmjs.com/).
2. Navigate to **Account Settings** -> **Access Tokens**.
3. Identify the token that was active during Campaign 10.4.
4. Click **Delete / Revoke** immediately.

### 2.2 Action 2: Generation of a Dedicated Automation Token
1. On the same page, select **Generate New Token** -> **Automation Token**.
   - *Why an Automation Token?* Automation tokens are specifically designed for CI/CD pipelines (such as GitHub Actions). They bypass interactive Two-Factor Authentication (2FA OTP) while still enforcing granular package write permissions.
   - Do **not** select "Publish Token" or "Read and Publish Token" if your account enforces write 2FA, as those will fail in automated headless CI runs with `npm error code EOTP`.

### 2.3 Action 3: Secret Rotation in GitHub Repository
1. Navigate to repository settings:  
   `https://github.com/coderooz/Local-MCP-Memory-Server/settings/secrets/actions`
2. Update the secret named `NPM_TOKEN` with the new Automation token.
3. Verify that the secret has no leading or trailing whitespace.

---

## 3. Compliance and Audit Attestation

The AI Engineering Assistant hereby certifies:
1. **No Token Persistence**: The token was never written to any git repository file, workspace file, config, or log.
2. **Git History Inspection**: `git log -p` confirms no credentials exist anywhere in the git history or diffs.
3. **Workflow Security**: All GitHub Actions workflows (`publish-npm.yml`, `release.yml`, `ci.yml`) reference secrets strictly via `${{ secrets.NPM_TOKEN }}` and mask secret values in runner logs.
