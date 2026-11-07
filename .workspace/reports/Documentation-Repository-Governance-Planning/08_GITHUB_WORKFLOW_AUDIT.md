# Report 08: GitHub Workflow and Automation Audit

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Existing Workflow Inventory

The repository contains 7 GitHub Actions workflows in `.github/workflows/`:

| Workflow File | Triggers | Permissions | Evaluation & Risk Level |
| :--- | :--- | :--- | :--- |
| `ci.yml` | `push` & `pull_request` on `main`, `develop` | Default token | **MODERATE RISK:** Missing critical test suites; lacks OS matrix; has CommonJS bug in build job |
| `auto-tag.yml` | `push` on `main` when `package.json` changes; `workflow_dispatch` | `contents: write` | **CRITICAL RISK:** Automatically tags and pushes git releases on any package.json edit |
| `release.yml` | `push: tags: ['v*.*.*']`; `workflow_dispatch` | `contents: write` | **MODERATE RISK:** Creates GitHub release, but lacks npm publish automation and test gates |
| `security.yml` | Weekly cron + PRs on `main` | `security-events: write` | **HEALTHY:** Runs CodeQL JS/TS security analysis |
| `labeler.yml` | `pull_request: [opened, synchronize, reopened]` | `pull-requests: write` | **HEALTHY:** Automatically labels PRs based on file paths |
| `stale.yml` | Weekly cron | `issues: write`, `pull-requests: write` | **HEALTHY:** Marks inactive issues/PRs stale after 30 days |
| `welcome.yml` | First issue / first PR | Default token | **LOW:** Character encoding bug displays corrupted emojis |

---

## 2. In-Depth Defect Analysis

### A. Critical Flaw in `auto-tag.yml`
```yaml
on:
  push:
    branches: [main]
    paths: ['package.json']
```
- **Hazard:** Any push to `main` modifying `package.json` (such as adding a dev script, updating a dependency, or fixing a typo) immediately triggers `auto-tag.yml`.
- **Consequence:** `auto-tag.yml` extracts the version, executes `git tag v<version>`, and pushes the tag to GitHub. This in turn triggers `release.yml`, publishing a public GitHub Release for an unverified or accidental change!
- **Remediation:** `auto-tag.yml` **must be completely removed or replaced with an explicit release dispatch workflow.**

### B. Flaws and Coverage Gaps in `ci.yml`
1. **ESM Incompatibility in `build` job (line 128):**
   ```yaml
   node -e "const pkg = require('./package.json'); ..."
   ```
   In a strict ESM project (`"type": "module"`), calling `require()` inside `node -e` throws `ReferenceError: require is not defined in ES module scope`.
2. **Missing Test Suites:**
   `ci.yml` runs `npm run check`, `npm test`, `npm run test:isolation`, `npm run test:contract`, `npm run test:gaps`.
   It **fails to run**:
   - `npm run test:resilience` (19 assertions)
   - `npm run test:execution` (40 assertions)
   - `tests/workspace-governance-test.mjs` (6 assertions)
   - Package build & disposable installation test (`scripts/verify-disposable-package-install.mjs`)
3. **Missing Cross-Platform Matrix:**
   Runs exclusively on `ubuntu-latest`. Because `local-mcp-memory` runs on developer machines across Windows, macOS, and Linux, CI must test both Linux (`ubuntu-latest`) and Windows (`windows-latest`) on Node.js 20 and Node.js 22.

### C. Missing npm Publishing Workflow
There is currently **zero automation** for publishing the package to npm. Developers must either run `npm publish` manually from their workstations (posing supply-chain and credential risks) or risk forgetting to publish after a GitHub release.

### D. Audit of Supporting `.github/` Metadata
- **`dependabot.yml`:** Line 29 contains placeholder reviewer `- set`. This must be updated to a valid GitHub handle (e.g. `@coderooz`).
- **`CODEOWNERS`:** References `@coderooz/mcp-team`, `@coderooz/core-team`, etc. Valid structure, but requires active team membership in the GitHub organization.
