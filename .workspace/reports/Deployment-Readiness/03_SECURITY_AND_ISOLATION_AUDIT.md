# Security and Production Isolation Audit

**Audit Date:** 2026-11-06  
**Repository Target:** `C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory`  

---

## 1. Route-Level Authentication and Authorization Matrix

Source-level inspection of `server.js`, `src/core/auth/routes.js`, and `src/core/mcp-registry/routes.js`:

| Route / Endpoint | Method | Authentication Required | Role / Privilege | Expected Access | Actual Verified Result |
|---|---|---|---|---|---|
| `/health` | GET | None (Public) | Any | Liveness status probe | Allowed (200 OK) |
| `/dashboard` | GET | None (Public) | Any | Web dashboard UI | Allowed (200 HTML) |
| `/ui` | GET | None (Public) | Any | Redirect to `/dashboard` | Redirected (302) |
| `/auth/register` | POST | None (First user) | Admin setup | Initial admin user creation | Allowed (201 Created) |
| `/auth/login` | POST | None (Credentials) | Registered user | JWT token generation | Allowed (200 JWT) |
| `/auth/health` | GET | None (Public) | Any | Auth status query | Allowed (200 OK) |
| `/context` | POST | Optional Auth* | Project-scoped | Context storage | Allowed & scoped |
| `/context/search` | POST | Optional Auth* | Project-scoped | Context search | Allowed & scoped |
| `/context/:id/full` | GET | Optional Auth* | Project-scoped | By-ID context retrieval | Scoped to project (F-03 closed) |
| `/context/update` | POST | Optional Auth* | Project-scoped | Context update | Scoped to project (F-03 closed) |
| `/task` | POST | Optional Auth* | Project-scoped | Task creation | Allowed & scoped |
| `/task/update` | POST | Optional Auth* | Project-scoped | Task mutation | Scoped to project |
| `/mcp/servers` | GET | Optional Auth* | Project-scoped | List upstream servers | Masked credentials |
| `/mcp/servers` | POST | Admin / Auth | Admin | Register upstream server | Protected |
| `/mcp/proxy/:id` | POST | Auth / Scoped | Project-scoped | Upstream tool proxying | Unmasked token upstream |

*\* `optionalAuth` allows unauthenticated access when `DISABLE_AUTH=true` (typical for local developer stdio operation), but strictly enforces Bearer JWT tokens when auth is active.*

---

## 2. Multi-Project and Session Isolation Audit

The project underwent rigorous isolation contract testing via `tests/multi-project-isolation-test.js` and `tests/isolation-gap-detectors-test.js`:

1. **By-ID Foreign Project Leak Prevention (F-03 / INV-01):**
   - Verified: `GET /context/:id/full` and `POST /context/update` enforce project boundaries. A foreign project querying an ID belonging to another project is denied access.
2. **Session-Bound Memory Isolation (INV-20):**
   - Verified: Session-bound memories are never leaked to another session or modified cross-session.
3. **Agent Registration Idempotency (INV-02):**
   - Verified: SQLite adapter properly handles `{ upsert: true }`, resolving historical 500 errors on new agent registrations.
4. **Project-Map Idempotency:**
   - Verified: `POST /project-map` successfully persists and updates project maps atomically.
5. **Teardown Invariants:**
   - Test suites explicitly verify listener cleanup, port release, and database detachment.

---

## 3. Execution Subsystem Fail-Closed Invariant

Comprehensive validation of `src/core/execution/sandbox-adapter.js` via `tests/execution-policy-test.js` (24 assertions) and `tests/execution-integration-test.js` (16 assertions):

- **Default Invariant:** `isAvailable() = false`.
- **Policy Enforcement:**
  - Missing identity $\to$ `IDENTITY_REQUIRED`.
  - Missing project $\to$ `PROJECT_SCOPE_DENIED`.
  - Unknown runtime $\to$ `UNKNOWN_RUNTIME`.
  - Path traversal attempt $\to$ Rejected.
- **Fail-Closed Guarantee:**
  - `executeJob` **ALWAYS** refuses in Phase 1.
  - Zero host processes are spawned.
  - Docker unavailability never causes silent fallback to host execution.
  - Audit rows are scrubbed and project-scoped.
