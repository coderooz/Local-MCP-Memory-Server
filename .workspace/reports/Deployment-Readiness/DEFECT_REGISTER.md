# Defect Register — Comprehensive Findings & Triage

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  

---

## 1. Severity Classification Matrix

- **P0 (Critical)**: Data loss, privilege escalation, remote compromise, severe security failure.
- **P1 (High)**: Core functionality broken, major isolation failure, process deadlock.
- **P2 (Medium)**: Significant feature defect, naming inconsistency, cross-port collision.
- **P3 (Low)**: Minor usability issue, documentation mismatch, non-blocking warning.

---

## 2. Tracked Defects & Remediation Status

| ID | Severity | Category | Description | Root Cause | Status |
|---|---|---|---|---|---|
| **DEF-001** | P1 | Concurrency | Process boot hangs on startup lock file (`Failed to acquire lock: startup`) | Abrupt process termination left orphaned `.lock` files. 5s timeout was inadequate without PID validation. | **RESOLVED** (PID liveness check added; stale locks cleared) |
| **DEF-002** | P1 | Networking | Cross-port hijacking during parallel test runs (`app-e2e-test.js` failure) | `server.js` unconditionally reused existing runtime file on port 47005 even when port 3799 was explicitly requested. | **RESOLVED** (`portMatches` check added before runtime reuse) |
| **DEF-003** | P2 | Identity | Inconsistent package and executable identity (`local-memory-mcp` vs canonical `local-mcp-memory`) | Candidate name from earlier task draft was inserted into `bin/cli.js`, docs, and `package.json`. | **RESOLVED** (Canonical `local-mcp-memory` applied everywhere; aliases preserved) |
| **DEF-004** | P2 | Global Setup | Antigravity global MCP server failed to register in session tool list | `mcp_config.json` contained unsupported non-standard fields (`resilience`, `enabled`) and pointed to `mcp-server.js` without `MONGO_URI`. | **RESOLVED** (Standardized schema applied; pointed to `mcp-shim.js` with `MONGO_URI`) |
| **DEF-005** | P2 | Search | Hyphenated keyword search failed in SQLite FTS5 | Hyphens in FTS5 are interpreted as column negation syntax unless tokens are quoted. | **RESOLVED** (Tokens wrapped in double quotes in `core/mcp/models.js`) |
| **DEF-006** | P3 | Platform | Windows PID check failed for privileged/cross-session processes | `process.kill(pid, 0)` on Windows throws `EPERM` for living system processes (e.g. PID 4) and `ESRCH` for dead processes. | **RESOLVED** (`isValidPID` checks error code: only `ESRCH` treated as dead) |
| **DEF-007** | P3 | Config | Agent instructions (`agent-instruction.js`) lacked documentation for 8 new v2.6.0 subsystems | Contract was not updated after registry, sandbox, browser, and chat tools were added. | **RESOLVED** (Instructions expanded to 20 subsystems with full tool surface) |
