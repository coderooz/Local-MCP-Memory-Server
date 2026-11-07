# Git Release Candidate Governance Plan

**Date:** 2026-11-06  
**Auditing Agent:** Google Antigravity  
**Repository Target:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  

---

## 1. File Classification and Change Audit

Every modified and untracked file in the repository was reviewed against its originating campaign:

| Path | Classification | Originating Scope | Required for v2.6.0? |
|---|---|---|---|
| `bin/cli.js`, `package.json`, `package-lock.json` | Production CLI & Package | Identity & CLI Campaign | **YES** |
| `src/core/cli/`, `src/core/paths/`, `src/core/config/` | Production Submodules | Identity & CLI Campaign | **YES** |
| `src/core/database/sqlite/` | Production Core DB | SQLite Engine Campaign | **YES** |
| `src/core/migration/mongo-to-sqlite.js` | Production Migration | Migration Engine Campaign | **YES** |
| `src/core/mcp-registry/session.js`, `proxy.js` | Production MCP Transport | Conformance Campaign | **YES** |
| `src/core/browser/`, `src/domains/browser/` | Production Browser Support | Playwright Integration | **YES** |
| `src/core/setup/agent-configs.js`, `jsonc.js` | Production Agent Setup | Multi-Agent Integration | **YES** |
| `server.js`, `src/core/auth/` | Production HTTP & Auth | Express 5 / Auth Route | **YES** |
| `.env.example`, `README.md`, `CHANGELOG.md` | Core Documentation | Documentation Alignment | **YES** |
| `tests/identity-reconciliation-test.js` | Test Suite | Identity Testing | **YES** |
| `tests/mcp-protocol-conformance-test.js` | Test Suite | Conformance Testing | **YES** |
| `tests/migration-test.js` | Test Suite | Migration Testing | **YES** |
| `tests/fixtures/mcp-http-stub.js` | Test Fixture | Conformance Testing | **YES** |
| `.reports/` | Engineering Audit Records | Governance Policy | Retained in git per audit policy |
| `.workspace/scratch/` | Scratch Evaluation Scripts | Transient Testing | Ignored / developer workspace |

---

## 2. Proposed Logical Commit Architecture

To ensure a clean, reviewable, and bisectable release history on branch `main`, the changes are structured into 4 logical atomic commits:

### Commit 1: Core Architecture, SQLite Persistence & CLI Framework
- **Summary:** `feat(core): implement sqlite persistence, production cli suite, and path resolution`
- **Files:** `package.json`, `package-lock.json`, `bin/cli.js`, `src/core/cli/*`, `src/core/paths/*`, `src/core/config/*`, `src/core/database/sqlite/*`, `core/config/*`, `utils/*`
- **Validation:** `npm run check`, `npm test`

### Commit 2: MCP Registry Protocol Conformance & Security Boundaries
- **Summary:** `feat(mcp): add conformant session negotiation, upstream proxying, and fail-closed execution`
- **Files:** `src/core/mcp-registry/*`, `src/core/browser/*`, `src/core/auth/*`, `server.js`, `mcp-server.js`, `tools/*`, `tests/fixtures/*`, `tests/mcp-protocol-conformance-test.js`, `tests/mcp-registry-test.js`
- **Validation:** `npm run test:conformance`, `npm run test:execution`

### Commit 3: Migration Engine, Identity Reconciliation & Test Suites
- **Summary:** `feat(migration): implement v2.5 to v2.6 migration engine with verified backup and rollback`
- **Files:** `src/core/migration/*`, `src/core/setup/*`, `tests/migration-test.js`, `tests/identity-reconciliation-test.js`, `tests/app-e2e-test.js`, `tests/mcp-resilience-test.js`, `agent-instruction.js`
- **Validation:** `npm run test:migration`, `npm run test:identity`

### Commit 4: Release Documentation, PRI/LFI Alignment & Engineering Audit Reports
- **Summary:** `docs(governance): align README, CHANGELOG, PRI/LFI, and add comprehensive audit reports`
- **Files:** `README.md`, `CHANGELOG.md`, `.env.example`, `AGENTS.md`, `docs/*`, `.workspace/PRI/*`, `.workspace/LFI/*`, `.reports/*`
- **Validation:** `npm pack --dry-run`

---

## 3. Git Hygiene and Authorization Boundary

1. **Clean Packaging:** Verified that `data/`, test databases, `.env`, and temporary directories are excluded from npm packaging and ignored by `.gitignore`.
2. **Strict Non-Destructive Boundary:** No git commands that modify git history (`git reset`, `git checkout .`, `git clean`) were executed.
3. **Authorization Boundary:** Staging, committing, pushing to remote (`git push`), and tag creation are deferred until the user explicitly reviews this governance plan and issues an authorization command.
