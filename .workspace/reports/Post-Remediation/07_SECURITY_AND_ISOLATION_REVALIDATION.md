# Security and Isolation Revalidation Report

**Date:** 2026-11-06  
**Auditor:** Google Antigravity  
**Target:** `local-mcp-memory` v2.6.0  

---

## 1. Security Architecture & Boundary Invariants

### 1.1 Execution Sandbox Fail-Closed Invariant
- **Component:** `src/core/execution/sandbox-adapter.js`
- **Design Invariant:** In Phase 1, `isAvailable()` returns `false`.
- **Enforcement:** Every call to `submit()`, `cancel()`, or `getStatus()` fails closed immediately with error code `SANDBOX_START_FAILED`.
- **Audit Result:** Confirmed intact. No mock execution, no unvetted shell execution, no bypass.

### 1.2 Path Traversal & File Protection
- **Component:** `src/core/paths/index.js`
- **Resolution:** All database, log, runtime, and configuration paths are resolved through canonical per-user platform directories (`%LOCALAPPDATA%/local-mcp-memory` on Windows, `~/.local-mcp-memory` fallback).
- **Protection:** Prevents path traversal vulnerabilities (`../`) from escaping application boundaries.
- **Audit Result:** Confirmed intact.

### 1.3 Secret Masking & Redaction
- **Components:** `src/core/cli/api-client.js`, `src/core/mcp-registry/crypto.js`, `src/core/migration/mongo-to-sqlite.js`
- **Enforcement:**
  - Upstream MCP server auth tokens are masked in `list_mcp_servers` and `get_mcp_server`.
  - Database connection strings are sanitized (`redactUri()`) to strip username and password components before logging or reporting.
  - AES-256-GCM encryption is supported at rest when `MCP_MASTER_SECRET` is provided.
- **Audit Result:** Confirmed intact.

### 1.4 Route-Level Authorization Matrix
- **Authentication Middleware:** `src/core/auth/index.js`
- **Route Boundaries:**
  - **Public Routes (Unauthenticated):**
    - `GET /health` — Health check endpoint.
    - `GET /dashboard` — Static web dashboard UI.
    - `GET /ui` — Redirect to `/dashboard`.
    - `POST /auth/register` — Initial admin registration.
    - `POST /auth/login` — JWT token generation.
    - `GET /auth/health` — Auth service health state.
  - **Protected Routes (Bearer JWT Required when auth enabled):**
    - `POST /context`
    - `POST /task`
    - `POST /activity`
    - `POST /mcp/*` (Registry mutations)
- **Audit Result:** Confirmed intact and validated by `tests/app-e2e-test.js`.

---

## 2. Multi-Project and Cross-Agent Isolation

- **Project Scoping:** Contexts, tasks, and issues are strictly scoped by `project` header/parameter.
- **Agent Identity Resolution:** Handled through `utils/projectIdentity.js`. Unverified or blank agent identities are refused (`tests/identity-reconciliation-test.js` assertion 6).
- **Two-Instance Separation:** v2.5.0 usage instance and v2.6.0 dev instance operate on completely separate storage backends with no cross-talk or shared ports.
