# Report 15: v2.6.1 Staged Implementation Roadmap

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Roadmap Architecture & Execution Principles

This staged roadmap defines the exact sequence of engineering actions for the upcoming implementation campaign.

The stages are strictly dependency-ordered:
```text
[Sprint A: Versioning & Hygiene] 
             │
             ▼
[Sprint B: Documentation Overhaul] 
             │
             ▼
[Sprint C: GitHub Automation & CI] 
             │
             ▼
[Sprint D: Package & Release Automation] 
             │
             ▼
[Sprint E: Final Verification & Sign-Off]
```

---

## 2. Sprint Breakdown

### Sprint A — Versioning SSOT & Repository Hygiene (Estimated: 1-2 hours)
- **Goal:** Eliminate version divergence hazards and clean up Git/npm exclusions.
- **Tasks:**
  1. Refactor `mcp-server.js` and `server.js` to dynamically import package version from `src/core/cli/package-info.js`.
  2. Update `.gitignore` to add `.backups/`, `scratch/`, `.workspace/scratch/`, `.workspace/temp/`, `*.db`, `*.sqlite*`, `*-wal`, `*-shm`.
  3. Create explicit `.npmignore` as defense-in-depth against accidental binary packing.
  4. Verify working tree cleanliness with `git status` and `git diff --check`.
- **Exit Gate:** No hardcoded version literals; `git status` reports zero untracked scratch/backup files.

### Sprint B — Documentation System Overhaul (Estimated: 2-3 hours)
- **Goal:** Synchronize all public and contributor-facing documentation with the v2.6.x implementation.
- **Tasks:**
  1. **Rewrite `SECURITY.md`:** Update supported versions to `2.6.x` and `2.5.x`; accurately document JWT/API-key auth in `src/core/auth/` and AES-256-GCM encryption at rest in `src/core/mcp-registry/crypto.js`.
  2. **Overhaul `README.md`:** Correct default port to `3799`; add Google Antigravity and Roo Code to CLI Quickstart table; document `config` subcommands; cross-reference `.agent/` and `.workspace/`.
  3. **Overhaul `CONTRIBUTING.md`:** Add complete copy-pasteable testing commands for all 7 test suites; add step-by-step instructions for adding new MCP tools and storage queries.
  4. **Update `CHANGELOG.md`:** Finalize comprehensive entries for v2.6.0 and outline v2.6.1 hardening items.
- **Exit Gate:** Zero contradictory documentation claims; 100% accurate security policy.

### Sprint C — GitHub Automation & CI Hardening (Estimated: 2-3 hours)
- **Goal:** Modernize CI, fix ESM bugs, eliminate unvetted auto-tagging, and add version protection.
- **Tasks:**
  1. **Decommission `auto-tag.yml`:** Remove `.github/workflows/auto-tag.yml` to prevent accidental tag creation on `package.json` push.
  2. **Harden `ci.yml`:**
     - Add OS matrix (`ubuntu-latest`, `windows-latest`) and Node matrix (`20.x`, `22.x`).
     - Fix `build` job ESM bug (replace `require` with standard JSON import/read).
     - Add jobs for `test:resilience`, `test:execution`, `workspace-governance`, and clean-room package test.
  3. **Create `version-policy.yml`:** Enforce that PRs cannot accidentally bump `package.json` version without the `release` label.
  4. **Clean up Metadata Workflows:** Fix emoji encoding in `welcome.yml`; update reviewer in `dependabot.yml` to `@coderooz`.
- **Exit Gate:** CI passes across all 4 matrix permutations; PR version guard active.

### Sprint D — Package Distribution & Release Automation (Estimated: 2 hours)
- **Goal:** Establish a secure, repeatable, and verified release and publishing lifecycle.
- **Tasks:**
  1. **Refactor `release.yml`:** Make release creation an explicit, authorized `workflow_dispatch` event that runs the full test suite before tagging.
  2. **Create `publish-npm.yml`:** Implement automated npm publishing using GitHub OIDC trusted publishing, scoped permissions (`id-token: write`), and protected GitHub Environments.
  3. **Package Verification Integration:** Embed `scripts/verify-disposable-package-install.mjs` as a mandatory pre-publish gate.
- **Exit Gate:** Dry-run release workflow succeeds; npm OIDC configuration verified.

### Sprint E — Final Verification & Release Certification (Estimated: 1-2 hours)
- **Goal:** Comprehensive end-to-end regression validation and release authorization.
- **Tasks:**
  1. Run complete local regression test suite (`check`, `test`, `test:resilience`, `test:isolation`, `test:contract`, `test:gaps`, `test:execution`, `workspace-governance`).
  2. Run clean-room package installation test.
  3. Update `.agent/context/CURRENT_STATE.md`, `ACTIVE_WORK.md`, and PRI/LFI.
  4. Generate final v2.6.1 Release Certification Report.
- **Exit Gate:** 242/242 passing assertions; zero open P0/P1 risks; ready for owner release command.
