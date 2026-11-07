# Report 16: Acceptance Criteria and Verification Checklists

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Sprint Acceptance Checklists

### Sprint A: Versioning & Hygiene
- [ ] `mcp-server.js` imports version dynamically from `package-info.js` with zero hardcoded version literals.
- [ ] `server.js` imports version dynamically from `package-info.js` with zero hardcoded version literals.
- [ ] `.gitignore` contains `.backups/`, `scratch/`, `.workspace/scratch/`, `.workspace/temp/`, `*.db`, `*.sqlite*`, `*-wal`, `*-shm`.
- [ ] `git status` reports clean working tree (no untracked backup, scratch, or database files).
- [ ] Explicit `.npmignore` exists as defense-in-depth against packaging local artifacts.

### Sprint B: Documentation System
- [ ] `SECURITY.md` accurately documents support for `2.6.x` and `2.5.x`.
- [ ] `SECURITY.md` accurately describes JWT/API-key authentication and AES-256-GCM encryption at rest.
- [ ] `README.md` reflects correct default port (`3799`) and enumerates all 8 supported agent adapters (including Antigravity and Roo Code).
- [ ] `README.md` documents `config` subcommands (`path`, `get`, `set`).
- [ ] `CONTRIBUTING.md` includes copy-pasteable execution instructions for all 7 test suites.
- [ ] `CONTRIBUTING.md` includes step-by-step guidance for adding new MCP tools and database models.
- [ ] `CHANGELOG.md` contains comprehensive, structured entries for v2.6.0 and v2.6.1.

### Sprint C: GitHub Automation & CI
- [ ] `.github/workflows/auto-tag.yml` is deleted.
- [ ] `ci.yml` matrix runs on `ubuntu-latest` and `windows-latest` across Node.js 20 and 22.
- [ ] `ci.yml` `build` job passes without `require is not defined` ESM errors.
- [ ] `ci.yml` executes `test:resilience`, `test:execution`, and `workspace-governance-test.mjs`.
- [ ] `version-policy.yml` passes on PRs without version changes and blocks PRs with version changes unless labeled `release`.
- [ ] `welcome.yml` encoding is fixed and `dependabot.yml` reviewer is updated to a valid GitHub user.

### Sprint D: Package & Release Automation
- [ ] `release.yml` executes as an authorized `workflow_dispatch` event and verifies the full test suite before tagging.
- [ ] `publish-npm.yml` is configured with GitHub OIDC trusted publishing and protected GitHub Environments.
- [ ] `scripts/verify-disposable-package-install.mjs` executes cleanly in CI prior to publishing.

### Sprint E: Final Verification
- [ ] All 242 unique test assertions pass across all supported environments.
- [ ] Clean-room package installation test succeeds.
- [ ] PRI (`PROJECT_REFERENCE_INDEX.md`) and LFI (`LOGIC_FLOW_INDEX.md`) reflect all changes.
- [ ] Stable v2.5.0 (`website/local-mcp-memory`) remains 100% untouched.
- [ ] Production MongoDB remains 100% untouched.

---

## 2. Final Release Gate Verification

The release of `v2.6.1` is authorized only when 100% of the above checklist items are marked complete and verified by automated CI and test evidence.
