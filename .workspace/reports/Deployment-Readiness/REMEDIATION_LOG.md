# Remediation Log — Code Fixes & Technical Adjustments

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  

---

## 1. Remediation Chronology

### FIX-001: Dead-PID File Lock Auto-Recovery
- **Component**: `core/config/runtime-state.js` (`acquireFileLock`, `deleteRuntimeFile`, `withProjectLock`)
- **Fix**: Added reading of lock file JSON payload. If `lockData.pid` is present and `!(await isValidPID(lockData.pid))`, immediately unlinks orphaned lock file and acquires lock instead of blocking for 30s.

### FIX-002: Port Congruence Verification
- **Component**: `server.js` (`startServer`)
- **Fix**: Added `portMatches(existingRuntime.port, targetPort)` check before reusing existing runtime file on disk. Emits explicit port binding notice to `process.stderr`.

### FIX-003: Project Identity Reconciliation
- **Components**: `package.json`, `bin/cli.js`, `src/core/cli/doctor.js`, `agent-instruction.js`, `README.md`, `docs/app.js`
- **Fix**: Reconciled canonical project, package, and binary name to `local-mcp-memory`. Preserved `mcp-memory` and `local-memory-mcp` as aliases in `"bin"`.

### FIX-004: Global Antigravity MCP Registration
- **Component**: `~/.gemini/config/mcp_config.json` & `~/.gemini/antigravity/mcp_config.json`
- **Fix**: Removed non-standard JSON schema keys. Configured stdio transport pointing to `mcp-shim.js` with `MONGO_URI=mongodb://127.0.0.1:27017/mcp_memory` and `MCP_AGENT=antigravity`.

### FIX-005: FTS5 Hyphen Token Sanitization
- **Component**: `core/mcp/models.js`
- **Fix**: Wrapped FTS search query tokens containing hyphens in escaped double quotes to prevent SQLite query syntax errors.

### FIX-006: Master Agent Instruction Contract
- **Component**: `agent-instruction.js` (`GLOBAL_AGENT_INSTRUCTION`)
- **Fix**: Expanded documented subsystems from 12 to 20, adding MCP registry, dynamic proxying, execution sandbox, browser automation, chat rooms, feedback, notifications, and CLI management. Added 12-step execution lifecycle.

### FIX-007: Permanent Identity Regression Test Suite
- **Component**: `tests/identity-reconciliation-test.js`, `package.json`
- **Fix**: Added 6 automated assertions covering package metadata, CLI program name, runtime path constants, agent config adapter constants, project identity precedence, and empty/unverified identity rejection. Gated in `npm test`.
