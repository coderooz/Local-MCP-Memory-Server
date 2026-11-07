# Testing Guide — `local-mcp-memory`

This guide explains how to execute, write, and maintain automated test suites in `local-mcp-memory`.

---

## 1. Test Architecture

The testing framework uses Node.js's native test runner (`node:test`) and strict assertion library (`node:assert/strict`). No external test frameworks (Jest, Mocha) are required.

Total active assertions: **249 unique passing assertions across 16 test suites**.

---

## 2. Test Commands Reference

### Primary Test Suite
```bash
# Run syntax checks and the 9 primary test suites
npm test
```

### Individual Test Suites
```bash
# Version Single Source of Truth (SSOT) regression tests (7 assertions)
npm run test:ssot

# Canonical project identity and adapter naming (6 assertions)
npm run test:identity

# MCP protocol conformance and session recovery (14 assertions)
npm run test:conformance

# SQLite schema, WAL mode, foreign keys, triggers, and FTS5 (34 assertions)
npm run test:db

# Full end-to-end HTTP API and Dashboard flows (15 assertions)
npm run test:e2e

# SQLite resilience, connection recovery, and timeout handling (19 assertions)
npm run test:resilience

# Multi-project context isolation (18 assertions)
npm run test:isolation

# Execution sandbox policy and fail-closed validation (40 assertions)
npm run test:execution

# MongoDB-to-SQLite data migration fidelity (11 assertions)
npm run test:migration

# Workspace governance and PRI/LFI validation (6 assertions)
node tests/workspace-governance-test.mjs
```

### Chaos & Clean-Room Testing
```bash
# Run chaos resilience and stdio stream purity verification
npm run chaos:test

# Verify package build and disposable clean-room installation
node scripts/verify-disposable-package-install.mjs
```

---

## 3. Writing a New Test

When adding tests:
1. Place test files in `tests/` named `<feature>-test.js` or `<feature>-test.mjs`.
2. Use `node:test` and `node:assert/strict`:
   ```javascript
   import test from 'node:test';
   import assert from 'node:assert/strict';

   test('Feature - should perform expected behavior', async () => {
     const result = await someFunction();
     assert.equal(result.status, 'ok');
   });
   ```
3. Ensure tests clean up any temporary SQLite files or directories created.
4. Add the new test to `package.json` scripts and the `npm run check` syntax list.
