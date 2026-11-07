# Testing Standards & Verification Guidelines

## Test Suites
- **Syntax Check:** `npm run check` — Validates all JS files via `node --check`.
- **Core Tests:** `npm test` — Runs primary assertions using `node:test`.
- **Resilience:** `npm run test:resilience` — Verifies failure handling and connection recovery.
- **Multi-Session Isolation:** `npm run test:isolation` — Verifies that concurrent project sessions do not cross-contaminate memory.
- **Contract Conformance:** `npm run test:contract` — Verifies MCP 2024-11-05 JSON-RPC protocol compliance and 63-tool schema accuracy.
- **Execution Sandbox:** `npm run test:execution` — Validates execution sandbox isolation and fail-closed security.

## Testing Invariants
- 100% test pass rate required before any campaign checkpoint.
- No skipping tests or suppressing assertion errors without documented rationale.
- All new features or schema modifications must be accompanied by automated tests.
