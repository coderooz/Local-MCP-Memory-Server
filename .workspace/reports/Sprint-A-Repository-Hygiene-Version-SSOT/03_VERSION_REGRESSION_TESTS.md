# Sprint A — Version Regression Tests

**Campaign:** Campaign 10.2 — Sprint A: Repository Hygiene, Package Consistency & Version SSOT  
**Document ID:** `03_VERSION_REGRESSION_TESTS.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & PASSING (7/7 Assertions)  

---

## 1. Objective

Establish an automated, non-brittle test suite that permanently prevents version drift across CLI entry points, MCP protocol handshakes, and HTTP health responses when future version bumps occur.

---

## 2. Test Suite Architecture: `tests/version-ssot-test.js`

A dedicated regression test file was implemented at `tests/version-ssot-test.js` using Node.js's native test runner (`node:test`) and strict assertions (`node:assert/strict`).

### Covered Test Cases

1. **`SSOT - package.json is valid and contains canonical version`**:
   - Asserts `package.json` exists.
   - Asserts `version` strictly matches SemVer regex `^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$`.
   - Asserts that during Sprint A, the version remains strictly `2.6.0`.
2. **`SSOT - package-lock.json matches package.json version`**:
   - Asserts root `package-lock.json` version matches `package.json`.
   - Asserts `packages[""].version` matches `package.json`.
3. **`SSOT - src/core/cli/package-info.js exports authoritative version`**:
   - Asserts `PACKAGE_ROOT` resolves to project root.
   - Asserts `getPackageInfo().version` equals `package.json.version`.
   - Asserts `getPackageInfo().name` equals `package.json.name`.
4. **`SSOT - CLI reports exact package.json version via --version`**:
   - Executes `node bin/cli.js --version` via `child_process.execFileSync`.
   - Asserts stdout equals `package.json.version`.
5. **`SSOT - No hardcoded server version literals in mcp-server.js serverInfo`**:
   - Analyzes AST/source code of `mcp-server.js`.
   - Verifies `serverInfo.version` dynamically calls `getPackageInfo().version`.
6. **`SSOT - No hardcoded server version literals in server.js health endpoints`**:
   - Analyzes AST/source code of `server.js`.
   - Verifies zero hardcoded `version: 'X.Y.Z'` literals exist in server responses.
   - Verifies `getPackageInfo().version` is used in both `/health` and `/health/detailed`.
7. **`SSOT - Both root entry points import getPackageInfo`**:
   - Asserts exact ESM import statements exist in both `mcp-server.js` and `server.js`.

---

## 3. Test Execution Verification

### Execution Command:
```bash
npm run test:ssot
```

### Verified Output:
```
✔ SSOT - package.json is valid and contains canonical version (3.3012ms)
✔ SSOT - package-lock.json matches package.json version (2.1744ms)
✔ SSOT - src/core/cli/package-info.js exports authoritative version (2.3636ms)
✔ SSOT - CLI reports exact package.json version via --version (108.7425ms)
✔ SSOT - No hardcoded server version literals in mcp-server.js serverInfo (0.6459ms)
✔ SSOT - No hardcoded server version literals in server.js health endpoints (0.6824ms)
✔ SSOT - Both root entry points import getPackageInfo (0.5149ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 223.6186
```

---

## 4. Integration into CI and Build Pipelines

- Added `tests/version-ssot-test.js` to `package.json` syntax validation script (`npm run check`).
- Added dedicated script `"test:ssot": "node --test tests/version-ssot-test.js"` to `package.json`.
- Integrated `npm run test:ssot` as the first test step in standard `npm test`.
