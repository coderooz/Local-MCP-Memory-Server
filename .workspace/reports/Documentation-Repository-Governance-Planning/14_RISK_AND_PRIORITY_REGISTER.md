# Report 14: Comprehensive Risk and Priority Register

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## Priority Classification Definitions
- **P0 — Critical:** Release integrity risk, accidental tag/publishing vulnerability, security inaccuracy, or silent data loss.
- **P1 — High:** Production readiness blocker, CI coverage gap, broken developer onboarding, or severe documentation divergence.
- **P2 — Medium:** Contributor friction, missing subcommands documentation, or missing test matrix.
- **P3 — Low:** Cosmetic flaws, formatting cleanup, or optional maintenance refinements.

---

## 1. Master Risk Register

| ID | Description | Evidence | Affected Files | Priority | Recommended Action | Complexity | Sprint |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| **RSK-01** | `auto-tag.yml` automatically creates Git tags on any `package.json` push to `main` without human approval or CI test gate | `.github/workflows/auto-tag.yml:4` | `.github/workflows/auto-tag.yml` | **P0** | Decommission `auto-tag.yml`. Replace with manual release dispatch workflow | Low | Sprint C |
| **RSK-02** | `SECURITY.md` contains dangerous misinformation: claims no auth, no encryption, and supported version is `2.4.x` | `SECURITY.md:7,19,30` | `SECURITY.md` | **P0** | Rewrite `SECURITY.md` to document JWT/API-key auth, AES-256 MCP registry encryption, and v2.6.x support | Low | Sprint B |
| **RSK-03** | Zero automated npm publishing workflow with OIDC provenance | Missing in `.github/workflows/` | `.github/workflows/publish-npm.yml` | **P0** | Create `publish-npm.yml` using GitHub OIDC trusted publishing & `npm-release` environment | Medium | Sprint D |
| **RSK-04** | Hardcoded version `'2.6.0'` in `mcp-server.js` and `server.js` | `mcp-server.js:1826`, `server.js:2049,2129` | `mcp-server.js`, `server.js` | **P1** | Dynamically import version from `package.json` via `getPackageInfo()` | Low | Sprint A |
| **RSK-05** | `.gitignore` omits `.backups/`, `scratch/`, and SQLite WAL files (`*.db-wal`, `*.db-shm`) | `.gitignore`, `git status` | `.gitignore` | **P1** | Add explicit exclusion rules for backups, scratch, and SQLite temporary files | Low | Sprint A |
| **RSK-06** | `ci.yml` omits resilience, execution sandbox, and workspace governance test suites | `.github/workflows/ci.yml` | `.github/workflows/ci.yml` | **P1** | Add jobs for `test:resilience`, `test:execution`, `workspace-governance`, and clean-room pack | Medium | Sprint C |
| **RSK-07** | `ci.yml` fails on Node ESM in `build` job due to `require('./package.json')` call | `ci.yml:128` | `.github/workflows/ci.yml` | **P1** | Replace `require()` with `node -p "fs.readFileSync..."` or import | Low | Sprint C |
| **RSK-08** | `README.md` lists outdated port (`PORT=4000`) and omits Antigravity and Roo Code adapters | `README.md:83,133` | `README.md` | **P1** | Update port to `3799` and add Antigravity and Roo Code to CLI Quickstart | Low | Sprint B |
| **RSK-09** | `CONTRIBUTING.md` lacks test documentation, tool authoring guides, and storage guides | `CONTRIBUTING.md` | `CONTRIBUTING.md`, `docs/` | **P2** | Add comprehensive 7-suite testing guide and step-by-step MCP tool authoring instructions | Medium | Sprint B |
| **RSK-10** | Missing version-policy protection gate on Pull Requests | Missing in `.github/workflows/` | `.github/workflows/version-policy.yml` | **P2** | Create `version-policy.yml` to block accidental PR version bumps | Low | Sprint C |
| **RSK-11** | `welcome.yml` contains corrupted emoji encodings | `.github/workflows/welcome.yml:18,24` | `.github/workflows/welcome.yml` | **P3** | Correct character encoding in greeting messages | Low | Sprint C |
| **RSK-12** | `dependabot.yml` has placeholder reviewer `- set` | `.github/workflows/dependabot.yml:29` | `.github/dependabot.yml` | **P3** | Update reviewer handle to `@coderooz` | Low | Sprint C |
