# Report 12: Contributor Onboarding and Developer Experience Audit

**Project:** `local-mcp-memory`  
**Target Release:** `v2.6.1`  
**Date:** 2026-11-07  
**Auditor:** Google Antigravity  

---

## 1. Developer Onboarding Friction Assessment

We evaluated the experience of a new human contributor cloning the repository with zero private access:

| Contributor Task | Current Experience | Friction Level | Identified Missing Guidance |
| :--- | :--- | :---: | :--- |
| **Clone & Install** | `npm install` works cleanly | **LOW** | Node.js >=20 requirement is clear, but `.nvmrc` presence is not mentioned in README |
| **Running Dev Server** | Documented in `README.md` | **MODERATE** | Outdated default port (`4000` vs `3799`); unclear distinction between `start` and `start:api` |
| **Running Test Suites**| Undocumented in `CONTRIBUTING.md` | **HIGH** | `CONTRIBUTING.md` only mentions `npm run check`, omitting `npm test`, isolation, and contract suites |
| **Adding a New MCP Tool**| Entirely undocumented | **HIGH** | No guide explaining how to register a tool in `tools/`, declare schema, and add tests |
| **Adding a Storage Table**| Entirely undocumented | **HIGH** | No guide explaining SQLite schema evolution, migrations, and FTS5 triggers |
| **Submitting a PR** | Basic steps in `CONTRIBUTING.md` | **MODERATE** | Lacks Conventional Commit guidelines and PR template details |

---

## 2. Copy-Pasteable Contributor Workflow Specification

The v2.6.1 overhaul of `CONTRIBUTING.md` will provide complete, executable commands for all major developer actions:

### A. Environment Initialization
```bash
# Clone repository
git clone https://github.com/coderooz/Local-MCP-Memory-Server.git
cd Local-MCP-Memory-Server

# Ensure Node.js 20+
node -v # Should report v20.x or v22.x

# Install dependencies cleanly
npm ci
```

### B. Running Local Development Servers
```bash
# Terminal 1: Start Express HTTP/SSE API Server (Default Port: 3799)
npm run start:api

# Terminal 2: Start MCP Stdio Server (for editor / client connection)
npm start
```

### C. Running Verification & Quality Checks
```powershell
# PowerShell
npm run check              # Syntax validation across all JS files
npm run lint               # ESLint check
npm run format:check       # Prettier check
npm test                   # Core test suite (120 assertions)
npm run test:resilience    # MCP fault recovery suite (19 assertions)
npm run test:isolation     # Multi-project session isolation (18 assertions)
npm run test:execution     # Fail-closed sandbox policy suite (40 assertions)
```
```bash
# Bash
npm run check              # Syntax validation across all JS files
npm run lint               # ESLint check
npm run format:check       # Prettier check
npm test                   # Core test suite (120 assertions)
npm run test:resilience    # MCP fault recovery suite (19 assertions)
npm run test:isolation     # Multi-project session isolation (18 assertions)
npm run test:execution     # Fail-closed sandbox policy suite (40 assertions)
```

---

## 3. Step-by-Step Guide for Adding an MCP Tool (To be added to `docs/`)

1. **Implement Tool Handler:** Create or modify handler in `tools/` (e.g. `tools/myTool.js`) accepting `(args, context)`.
2. **Define Schema:** Add MCP tool schema definition to `src/interfaces/mcp-tools/tool-definitions.js` with parameter validation.
3. **Register Tool:** Export tool in `tools/index.js` and register with `ToolRegistry`.
4. **Write Integration Test:** Add test assertions to `tests/` verifying JSON-RPC roundtrip.
5. **Update PRI/LFI:** Update `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` and `.workspace/LFI/LOGIC_FLOW_INDEX.md`.
