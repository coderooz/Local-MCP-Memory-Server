# Security & Isolation Audit

**Audit Date:** 2026-11-05  
**Version:** 2.6.0  
**Focus:** Authentication, Authorization, Isolation Boundaries, Credential Safety  

---

## 1. Authentication & Secret Management

1. **User Authentication**:
   - `POST /auth/register`: The first registered user bootstraps as `admin`. Subsequent registrations are strictly assigned role `user` (caller cannot supply role).
   - Password Hashing: PBKDF2 with 100,000 iterations and per-user salt.
   - Session Tokens: JSON Web Tokens (JWT) signed by a dynamically generated 256-bit secret stored in `secrets.json`.
2. **API Keys**:
   - Key generation: 32-byte cryptographically secure random string (`crypto.randomBytes(32)`).
   - Storage: Stored only as SHA-256 hash. Plaintext key shown only upon creation.
3. **External Server Credential Encryption**:
   - When registering external MCP servers with `auth_config`, credentials are encrypted at rest using AES-256-GCM (`enc:v1:<iv>:<tag>:<ciphertext>`), derived from `MCP_MASTER_SECRET`.
   - On all read operations (`GET /mcp/servers`, `list_mcp_servers`), secrets are masked (`slice(0, 4) + '****'`). Only internal proxy calls decrypt secrets.

---

## 2. Project & Agent Isolation Boundaries

1. **Namespace Partitioning**:
   - Every database record is partitioned by the `project` column.
   - MCP requests derive project identity from server-side environment or `.mcp-project` files. Caller-supplied overrides are rejected or validated against project scope.
2. **Untrusted Identity Handling**:
   - When callers attempt to query across projects without explicit `global` scope permissions, queries are restricted to the caller's bound project namespace.
3. **Cross-Port Hijacking Prevention**:
   - Server validates `portMatches` before reusing runtime state files, preventing a test or independent process on one port from taking over another server's state.

---

## 3. Security Vulnerability Assessments

| Vector | Finding | Status |
|---|---|---|
| **SQL Injection** | All SQLite queries use parameterized statements (`better-sqlite3` prepared statements). FTS5 inputs are quoted and sanitized. | MITIGATED |
| **Path Traversal** | Runtime directories enforce `path.resolve` and validate against allowed project roots. | MITIGATED |
| **SSRF** | External MCP proxying validates URLs against allowed schemas (`http:`, `https:`). Stdio servers are strictly forbidden from HTTP proxying. | MITIGATED |
| **Arbitrary Code Execution** | Sandbox Phase 1 fails closed (`SANDBOX_START_FAILED`). No shell commands spawned without approval bindings. | MITIGATED (FAIL-CLOSED) |
| **Credential Leakage** | All logs suppress credentials. Passwords, API keys, and auth secrets are masked. | MITIGATED |
