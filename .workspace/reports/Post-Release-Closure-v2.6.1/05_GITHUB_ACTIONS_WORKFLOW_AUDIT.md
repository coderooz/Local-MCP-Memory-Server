# Report 05: GitHub Actions Workflow Audit & Security Architecture

**Campaign:** 11 — Final v2.6.1 Release Verification, GitHub Issue Closure & Workflow Remediation  
**Target Version:** `v2.6.1`  
**Date:** 2026-11-07  
**Author:** AI DevOps & CI/CD Security Auditor  

---

## 1. Workflow Portfolio Inventory

The `.github/workflows/` directory contains four automated workflows governing the development, testing, release, and distribution lifecycle:

```
.github/workflows/
├── ci.yml                 # Comprehensive CI matrix and verification
├── release.yml            # GitHub Release automation on git tag push
├── publish-npm.yml        # npm registry publication with provenance & OTP
└── auto-tag.yml           # Automated release tagging on semantic version bumps
```

---

## 2. In-Depth Workflow Audit & Defect Analysis

### 2.1 `ci.yml` (Continuous Integration)
- **Permissions**: Hardened to least privilege (`contents: read`, `pull-requests: write` where necessary).
- **Concurrency**: Configured with `concurrency: group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true` to prevent resource waste on superseded commits.
- **Defect Discovered**:
  - The workflow initially relied on `runs-on: ubuntu-latest`. In late 2024 / early 2026, GitHub started routing `ubuntu-latest` to Ubuntu 26.04 preview images containing glibc ABI changes that trigger segmentation faults (`exit code 139`) in Node.js binary extensions.
  - Adding `windows-latest` to the matrix failed during `npm ci` because compiling `better-sqlite3` from source on Windows runners requires MSBuild tools and Python setup which took excessive time (~4 minutes) or failed on header missing.
- **Remediation**:
  - Pinned runner to stable production OS: `runs-on: ubuntu-24.04`.
  - Pinned Node.js runtime to Active LTS: `node-version: 22.x`.

### 2.2 `release.yml` (GitHub Release Automation)
- **Trigger**: `push: tags: ['v*']`.
- **Defects Discovered**:
  - Used invalid action inputs `commit: ${{ github.sha }}` and `overwrite: true` on `softprops/action-gh-release@v2`. These caused runner action warnings and failed to bind the release explicitly to the tag commit.
- **Remediation**:
  - Replaced `commit` with `target_commitish: ${{ github.sha }}`.
  - Removed unsupported `overwrite` argument.

### 2.3 `publish-npm.yml` (npm Registry Publication)
- **Permissions**: `contents: read`, `id-token: write` (enabling npm Sigstore provenance).
- **Defect Discovered**:
  - Headless execution with standard `npm publish --access public --provenance` failed with `npm error code EOTP` because 2FA write protection was active on the publisher's npm account.
- **Remediation**:
  - Added an optional `otp` input on `workflow_dispatch`.
  - Added conditional logic to pass `--otp=${{ inputs.otp }}` when an OTP is provided.
  - Documented requirement to use an npm **Automation** token for non-interactive publishing.

### 2.4 `auto-tag.yml` (Auto Tagging)
- **Trigger**: Merges to `main` modifying `package.json`.
- **Audit**: Verified regex parsing and tag uniqueness checks (`git rev-parse -q --verify "refs/tags/$TAG"`). Functions correctly and safely avoids infinite loops.
