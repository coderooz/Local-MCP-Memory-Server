# Sprint B — Implementation Truth Matrix

**Campaign:** Campaign 10.3 — Sprint B: Documentation Synchronization & Gap Remediation  
**Document ID:** `02_IMPLEMENTATION_TRUTH_MATRIX.md`  
**Date:** 2026-11-07  
**Author:** Google Antigravity (Advanced Agentic Coding)  
**Status:** COMPLETE & INDEPENDENTLY VERIFIED  

---

## 1. Objective

Before updating documentation, establish the ground truth of the codebase through direct source code inspection. This prevents documenting planned or hypothetical features as existing capabilities.

---

## 2. Comprehensive Implementation-to-Documentation Truth Matrix

```
+---------------------+----------------------------------------------------+--------------------------+---------------------+
| Domain / Subsystem  | Verified Code Implementation (Source of Truth)     | Previous Doc Claim       | Verified Status     |
+---------------------+----------------------------------------------------+--------------------------+---------------------+
| Package Version     | `package.json` line 3: `"2.6.0"`                   | Varied (2.4.x / 2.6.0)   | VERIFIED: `2.6.0`   |
| Entry Points        | CLI: `bin/cli.js`, MCP: `mcp-server.js`,           | Incomplete list          | VERIFIED: 3 entries |
|                     | HTTP API: `server.js`                              |                          |                     |
| Database Engine     | Embedded SQLite (`better-sqlite3` v13.0.3),        | Mentions MongoDB / legacy| VERIFIED: SQLite    |
|                     | WAL mode, foreign_keys = ON, schema v2.6.0         |                          |                     |
| Migration Engine    | Native MongoDB driver (`mongodb` v7.1.0) strictly  | Unclear migration tools  | VERIFIED: Read-only |
|                     | read-only; writes exclusively to SQLite            |                          | migration engine    |
| HTTP API Port       | Dynamic allocation range `47000-47020`;            | Claimed hardcoded 4000   | VERIFIED: Dynamic / |
|                     | fallback / test default `3799`; env `PORT` override|                          | `3799` fallback     |
| HTTP Authentication | JWT (`jsonwebtoken` v9.0.3) + API Key              | Claimed "no built-in     | VERIFIED: JWT +     |
|                     | (`mcp_...` SHA-256) via `src/core/auth/index.js`   | authentication"          | API Key active      |
| Route Auth Coverage | `/auth/me`, `/auth/refresh`, `/auth/api-keys`      | Unspecified              | VERIFIED: Selected  |
|                     | require auth; `/health`, `/dashboard` are public   |                          | routes protected    |
| Encryption at Rest  | AES-256-GCM via HKDF-SHA256 (`MCP_MASTER_SECRET`)  | Claimed "no encryption   | VERIFIED: Column    |
|                     | for `mcp_servers.auth_config` column in SQLite     | at rest"                 | encryption active   |
| Whole-DB Encryption | None. SQLite database file is unencrypted plaintext| Unspecified              | VERIFIED: Plaintext |
|                     | (filesystem encryption recommended)                |                          | DB, encrypted keys  |
| CLI Commands        | Exactly 17 top-level commands in `bin/cli.js`      | Outdated / incomplete    | VERIFIED: 17 cmds   |
| Agent Adapters      | 8 verified adapters in `agent-configs.js`:         | Omitted Antigravity and  | VERIFIED: 8 agents  |
|                     | opencode, codex, claude, antigravity, cursor,      | Roo Code                 | supported           |
|                     | windsurf, cline, roo                               |                          |                     |
| Execution Sandbox   | Implemented in `src/core/execution/`, but          | Unspecified              | VERIFIED: Disabled  |
|                     | DISABLED by default (fail-closed, D-002)           |                          | (fail-closed)       |
| MCP Tools Count     | 63 discovered MCP tools via `tools/list`           | Claimed 48 / 60+         | VERIFIED: Exactly 63|
+---------------------+----------------------------------------------------+--------------------------+---------------------+
```

---

## 3. Detailed Verification of Technical Invariants

### 3.1 Port Precedence & Behavior
Direct inspection of `server.js` and `core/config/portManager.js` demonstrates:
1. If `--port <number>` CLI flag is passed, that port is requested.
2. If `PORT` environment variable is defined, that port is requested.
3. If neither is specified, dynamic allocation searches from `47000` to `47020`.
4. If a running instance exists, its port is discovered via `.mcp-runtime.json` or active port scanning.
5. In isolated E2E tests, `PORT=3799` is standard.
6. The legacy claim `PORT=4000` does not appear anywhere in v2.6.0 runtime logic.

### 3.2 Authentication & Authorization Scope
Inspection of `src/core/auth/index.js` and `src/core/auth/routes.js` reveals:
- **JWT:** 7-day default expiration (`JWT_EXPIRY`), signed with an auto-generated 48-byte secret stored in `secrets.json` (mode 0600) or `JWT_SECRET`.
- **API Keys:** Formatted as `mcp_<48 hex chars>`. Persisted solely as SHA-256 hashes in `api-keys.json`. Plaintext is shown once upon creation.
- **Protected Endpoints:**
  - `GET /auth/me` (requires JWT or API key)
  - `POST /auth/refresh` (requires JWT)
  - `POST /auth/api-keys` (requires JWT or API key)
  - `GET /auth/api-keys` (requires JWT or API key)
  - `DELETE /auth/api-keys/:key` (requires JWT or API key)
- **Public Endpoints:**
  - `GET /health`, `GET /health/detailed`
  - `GET /auth/health`
  - `POST /auth/login`, `POST /auth/register`
  - `GET /dashboard`, `GET /ui`
- **Optional Auth Endpoints:** Data routes (`/context`, `/task`, `/activity`, etc.) accept optional auth headers for tracking caller identity without rejecting unauthenticated local requests.

### 3.3 Cryptographic Token Storage Scope
Inspection of `src/core/mcp-registry/crypto.js` reveals:
- Uses `crypto.hkdfSync` with salt `local-mcp-memory-auth-v1` and info `mcp-registry-auth-config-v1`.
- AES-256-GCM produces ciphertext formatted as `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`.
- **Scope Limit:** Only the `auth_config` column of the `mcp_servers` table is encrypted. The primary memory database (`contexts`, `tasks`, `chat_messages`) remains standard plaintext SQLite.
