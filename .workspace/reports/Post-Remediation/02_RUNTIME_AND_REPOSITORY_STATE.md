# Runtime and Repository State Audit

**Audit Date:** 2026-11-06  
**Target Repository:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  
**Protected Usage Repository:** `C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory`  

---

## 1. Runtime Environment State

| Property | Detected Value | Verification Method | Status |
|---|---|---|---|
| **Node.js Runtime** | `v24.21.0` | `node -v` | Compatible (Requirement: Node 20+) |
| **npm Version** | `10.8.2` | `npm -v` | Compatible |
| **Host OS** | Windows 11 Enterprise (x64) | `process.platform` | Compatible |
| **Active MCP Process** | PID 5788 (v2.5.0 shim) | Live stdio probe | Preserved & Isolated |
| **Storage Engine (v2.5.0)** | MongoDB native driver | Port 27017 socket | Connected & Validated |
| **Storage Engine (v2.6.0)** | `better-sqlite3` v13.0.3 | Native binding test | Isolated & Validated |

---

## 2. Git Repository State (`projects/local-mcp-memory`)

- **Branch:** `main`
- **Latest Commit Hash:** `5962431` (`59624313f8e5b4c107...`)
- **Tracking:** Up to date with `origin/main`

### 2.1 Modified Working Tree Files (33 files)
The working tree contains carefully scoped changes supporting identity reconciliation, global distribution CLI, and test isolation:
1. `.gitignore` (ignores `*.mcp-runtime.json`, SQLite artifacts)
2. `.workspace/LFI/COMPONENT_INTERACTIONS.md` (reconciled architecture)
3. `.workspace/LFI/ERROR_PATHS.md` (reconciled error paths)
4. `.workspace/LFI/LOGIC_FLOW_INDEX.md` (reconciled CLI flow)
5. `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` (reconciled metadata)
6. `AGENTS.md` (reconciled role instructions)
7. `CHANGELOG.md` (v2.6.0 release notes)
8. `README.md` (reconciled CLI usage)
9. `agent-instruction.js` (reconciled global instructions)
10. `bin/cli.js` (canonical executable `local-mcp-memory` and aliases)
11. `core/config/connectionResolver.js` (resilience connection management)
12. `core/config/runtime-state.js` (runtime file naming & path resolution)
13. `core/mcp/models.js` (model definitions)
14. `docs/app.js` (dashboard and CLI documentation)
15. `docs/connection-lifecycle.md` (architecture documentation)
16. `mcp-server.js` (stdio server handling)
17. `mcp.config.json` (server configuration)
18. `package-lock.json` (dependency tree locked)
19. `package.json` (canonical name `local-mcp-memory` and bin entries)
20. `server.js` (Express 5 API server)
21. `src/core/auth/index.js` (authentication service)
22. `src/core/auth/routes.js` (auth endpoints)
23. `src/core/database/sqlite/connection.js` (SQLite connection pooling & WAL)
24. `src/core/mcp-registry/index.js` (MCP server registry)
25. `src/core/mcp-registry/proxy.js` (upstream MCP proxying)
26. `src/core/mcp-registry/routes.js` (registry HTTP routes)
27. `src/domains/browser/browser.service.js` (browser domain handler)
28. `tests/app-e2e-test.js` (end-to-end integration test)
29. `tests/mcp-registry-test.js` (registry test suite)
30. `tests/mcp-resilience-test.js` (resilience test suite)
31. `tools/browserTools.js` (browser automation MCP tools)
32. `utils/mcp-port-registry.js` (port coordination)
33. `docs-repo.project-mcp.json` (deleted stale file)

### 2.2 Untracked Files and New Infrastructure (13 paths)
1. `.reports/` (Audit and compliance reports)
2. `.workspace/scratch/` (Temporary migration and inspection scripts)
3. `src/core/browser/` (Playwright lazy loader)
4. `src/core/cli/` (`api-client.js`, `doctor.js`, `install-state.js`, `package-info.js`)
5. `src/core/config/` (`load-env.js`, `user-config.js`)
6. `src/core/mcp-registry/session.js` (Conformant MCP session negotiator)
7. `src/core/migration/` (`mongo-to-sqlite.js`)
8. `src/core/paths/` (`index.js` per-user cross-platform path resolver)
9. `src/core/setup/` (`agent-configs.js`, `jsonc.js`)
10. `tests/fixtures/` (`mcp-http-stub.js`)
11. `tests/identity-reconciliation-test.js` (Automated identity test suite)
12. `tests/mcp-protocol-conformance-test.js` (Conformance test suite)
13. `tests/migration-test.js` (Migration and rollback test suite)

---

## 3. Two-Instance Boundary Isolation Audit

| Boundary Dimension | Instance A (`website`) | Instance B (`projects`) | Separation Evidence |
|---|---|---|---|
| **Location** | `...\website\local-mcp-memory` | `...\projects\local-mcp-memory` | Independent file directories |
| **Database** | MongoDB (`localhost:27017/mcp_memory`) | SQLite (`data/mcp-memory.db` / test DBs) | Separate drivers & stores |
| **Global Agent Access** | Active in `~/.gemini/config/mcp_config.json` | Not configured globally | Verified via config inspection |
| **Role** | Stable Operational Instance | Authoritative Dev Instance | Strict directive compliance |
| **Modification Policy** | Zero modification / Read-only | Active engineering & test execution | Verified via git log / status |
