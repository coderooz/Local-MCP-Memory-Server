# Implementation Plan — Dynamic MCP Management & Project-Level MCP Registry (Completion)

**Date:** 2026-10-07
**Phase:** 3 (Implementation Planning)
**Based on:** `01 feasibility-analysis.md` (Option C — Combined Registry + HTTP Proxy), `02 architecture-design.md`
**Status:** PLAN READY — awaiting approval to execute
**Verification performed:** 2026-10-07, all findings confirmed against live source with file:line evidence

---

## 1. Baseline — What Is Already Done (verified)

| #   | Component                                                                                                                          | Evidence                                                       | Status      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| 1   | `mcp_servers` table + 4 indexes (additive)                                                                                         | `src/core/database/sqlite/schema.js:407-429, 525-528`          | ✅ Done     |
| 2   | Registry core (CRUD, connect, discover, proxy, health, tool cache)                                                                 | `src/core/mcp-registry/index.js` — 19 exports                  | ✅ Done     |
| 3   | HTTP routes (11 endpoints, auth middleware, project scoping)                                                                       | `src/core/mcp-registry/routes.js`, mounted `server.js:144,157` | ✅ Done     |
| 4   | 9 MCP tool definitions + dispatcher                                                                                                | `tools/mcpRegistryTools.js`                                    | ✅ Done     |
| 5   | `mcp-server.js` wiring (import L27-32, tools/list L1825-1829, allowlist L2788-2798, dispatch L2800-2802, proxied tools L2810-2812) | —                                                              | ✅ Done     |
| 6   | Feature flag `mcpRegistry: true`                                                                                                   | `core/config/project-config-loader.js:112`                     | ✅ Done     |
| 7   | JSON field inflation (`env`, `auth_config`, `health`)                                                                              | `src/core/database/sqlite/collection.js:115-125`               | ✅ Done     |
| 8   | Test suite 11/11 green; `npm test` green (check + feedback 7/7 + chat 9/9)                                                         | run 2026-10-07                                                 | ✅ Verified |
| 9   | Prettier clean on all 4 registry files; `node --check` clean                                                                       | run 2026-10-07                                                 | ✅ Verified |

## 2. Verified Gap Register

| ID  | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence                        | Severity     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------ |
| G1  | **Proxy sends masked credentials.** `proxyToolCall`/`checkServerHealth`/`discoverTools` call `getServer()` which applies `maskAuth()` (`index.js:104`), so `buildHeaders()` (`index.js:292-325`) injects `Bearer bear****`-style values. **All authenticated proxy calls are functionally broken.**                                                                                                                                                                                                                                                                                    | `index.js:358→104`, `25-40`     | **CRITICAL** |
| G2  | **No `proxy.js` module.** Design §2.5 mandates dedicated proxy with pooling, circuit breaker (closed/open/half-open), timeout mgmt. Actual: inline `proxyRequest()` `index.js:327-355` — bare `fetch` + 10s AbortController only. `src/core/mcp-registry/proxy.js` does not exist.                                                                                                                                                                                                                                                                                                     | `Test-Path proxy.js → False`    | HIGH         |
| G3  | **No circuit breaker anywhere** (grep `circuit\|half-open\|pool` → 0 hits). Analysis rates proxy failure modes MEDIUM severity with circuit breaker as the mitigation.                                                                                                                                                                                                                                                                                                                                                                                                                 | —                               | HIGH         |
| G4  | **Credentials stored plaintext at rest.** `auth_config: JSON.stringify(...)` (`index.js:66`). Design §4.1 mandates AES-256-GCM; feasibility analysis rates this **HIGH** risk.                                                                                                                                                                                                                                                                                                                                                                                                         | `index.js:66`                   | HIGH         |
| G5  | **Registry tools bypass schema validation.** `getToolSchemaMap()` builds `[...getTools(), ...getIntegrationTools()]` only (`mcp-server.js:1597`); registry tools appended at L1829 but never enter the map → `validateToolArguments` returns `null` (`mcp-server.js:1704`) for all 9 tools.                                                                                                                                                                                                                                                                                            | `mcp-server.js:1595-1606`       | HIGH         |
| G6  | **Project-default mismatch bug.** `handleList` defaults to `'default-project'` (`mcpRegistryTools.js:329`) while `registerServer` defaults to `'default'` (`index.js:56`). Listing with no config project returns nothing for default-registered servers.                                                                                                                                                                                                                                                                                                                              | both files                      | MEDIUM       |
| G7  | **Inconsistent project scoping in MCP tool handlers.** `handleGet` scopes (`mcpRegistryTools.js:354-357`); `handleUnregister`, `handleConnect`, `handleDisconnect`, `handleProxyCall`, `handleDiscover`, `handleHealth` do **not**.                                                                                                                                                                                                                                                                                                                                                    | `mcpRegistryTools.js:315-409`   | MEDIUM       |
| G8  | **`requireAuth` doesn't accept API keys** despite its own error message and the routes.js header claiming "JWT or API key" (`routes.js:8`). `requireApiKey` exists (`auth/index.js:242-263`) but is never wired; `requireRole` (`auth/index.js:294-312`) unused — design §4.3 admin elevation missing.                                                                                                                                                                                                                                                                                 | `auth/index.js:215-237`         | MEDIUM       |
| G9  | **Health route lacks project scoping** — every other `:id` route checks `server.project !== req.user.project`; `POST /mcp/servers/:id/health` does not (`routes.js:194-201`).                                                                                                                                                                                                                                                                                                                                                                                                          | —                               | MEDIUM       |
| G10 | **Proxy JSON-RPC route bypasses auth injection.** `routes.js:261` builds `{ 'Content-Type': 'application/json' }` directly instead of using `buildHeaders` — proxied HTTP requests never carry credentials. Also no `response.ok` check.                                                                                                                                                                                                                                                                                                                                               | `routes.js:234-286`             | MEDIUM       |
| G11 | **Test suite not wired into `npm test`.** `test` script = `check && test:feedback && test:chat` (`package.json:84`); no `test:mcp-registry` script; `check` script (`package.json:79`) omits `node --check` for the 3 new source files + test.                                                                                                                                                                                                                                                                                                                                         | `package.json`                  | MEDIUM       |
| G12 | **No tests for the risky paths:** auth header injection, circuit breaker, encryption, mock-HTTP connect/discover/proxy round trip. Current 11 tests cover CRUD + naming + isolation only.                                                                                                                                                                                                                                                                                                                                                                                              | `tests/mcp-registry-test.js`    | MEDIUM       |
| G13 | **Governance closeout incomplete.** PRI has zero `mcp-registry`/`mcpRegistryTools`/`mcp_servers` entries (only unrelated `tool-registry.js`); LFI has no registry flows; `docs/app.js:530` passing mention only; **CHANGELOG documents wrong tool names** (`mcp_register_server` vs actual `register_mcp_server`, `mcp_server_health` vs `get_mcp_health` — `CHANGELOG.md:14,26,31`). **RESOLVED 2026-10-07 (Phase 7):** PRI, LFI (index/interactions/error paths), CHANGELOG (append-only corrections + amendments), and AGENTS.md all synced; maintenance logs bumped to 2026-10-07. | grep verified                   | MEDIUM       |
| G14 | **`listChanged: false`** (`mcp-server.js:1806`) while design §3.1 calls for `true` when dynamic tools are added — clients are never notified when `connect/disconnect` changes the discovered-tool set. **RESOLVED 2026-10-07:** documented inline at `mcp-server.js:1806` — capability stays `false` because no `tools/list_changed` notification exists in the codebase (see task 6.1 / Q1).                                                                                                                                                                                         | —                               | LOW          |
| G15 | **No periodic health scheduling** — health checks on-demand only; design implies a health cycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | no `setInterval` in `server.js` | LOW          |
| G16 | **Error shape deviates from design §5.1/5.2** (`{error:"MCP_SERVER_UNAVAILABLE", message, details}` vs actual `{success:false, error:msg}`).                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                               | LOW          |
| G17 | **ESLint/prettier comma-dangle conflict** — 119 eslint errors in the 4 new files, but `prettier --check` passes. Repo-wide lint already fails (1,973 problems pre-existing). Config conflict, not a code defect; out of scope to fix repo-wide.                                                                                                                                                                                                                                                                                                                                        | run 2026-10-07                  | INFO         |
| G18 | **No `args` support for stdio `command`** — schema has `command TEXT` only; `registerServer` silently drops extra fields (`index.js:53-75` constructs doc explicitly).                                                                                                                                                                                                                                                                                                                                                                                                                 | `index.js:53-75`                | LOW          |

**Refuted claims** (previously hypothesized, verified NOT gaps): routes project-scoping on CRUD/connect/disconnect/proxy — present (`routes.js:97,114,134,154,177,220,248`); mask-on-read — works (test 4 asserts it); syntax health — `node --check` clean on all 4 files.

---

## 3. Phased Action Plan

### Phase 0 — Baseline verification (S)

- [ ] Record pre-change green baseline: `npm test`, `node tests/mcp-registry-test.js`, `prettier --check` on the 4 registry files (already verified 2026-10-07; re-confirm at execution start)
- [ ] Snapshot `git status --short` to isolate our diff; never `add/commit/checkout/restore` (dirty tree = user WIP, F2-equivalent)
- [ ] Re-confirm constraints: ESM-only, no TS, no new deps (`uuid` present; `node:crypto` builtin for encryption), additive schema only, `projects\` copy only

### Phase 1 — Critical correctness fixes (S–M) — _closes G1, G5, G6, G7, G9_

- [ ] 1.1 **Fix masked-credential proxy bug (G1):** add internal `getServerRaw(serverId)` in `index.js` (unmasked read); switch `proxyToolCall`, `discoverTools`, `connectToServer`, `checkServerHealth` to it. Keep `getServer`/`listServers` masked for all external surfaces (routes + MCP tools).
- [ ] 1.2 **Fix schema-map gap (G5):** in `getToolSchemaMap()` (`mcp-server.js:1597`) add `...getMCPRegistryTools()`. (Discovered `mcp__*` tools keep dynamic passthrough — their schemas are remote and unknowable at map-build time; document this exception.)
- [ ] 1.3 **Fix project default mismatch (G6):** unify on `'default'` in `handleList` (`mcpRegistryTools.js:329`).
- [ ] 1.4 **Project-scope all MCP tool handlers (G7):** extract a `assertProjectAccess(server, config)` helper; apply to `handleUnregister`, `handleConnect`, `handleDisconnect`, `handleProxyCall`, `handleDiscover`, `handleHealth` (mirror `handleGet:354-357`).
- [ ] 1.5 **Add missing health-route scoping (G9):** insert the standard project check before `checkServerHealth` in `routes.js:194-201`.
- [ ] 1.6 Verification: `npm test` + `node tests/mcp-registry-test.js` green; new regression tests from Phase 1b pass.

### Phase 1b — Regression tests for Phase 1 (S)

- [ ] Test: `proxyToolCall` against a **local mock HTTP MCP server** (Node `http.createServer` speaking JSON-RPC) with `auth_type: 'bearer'` → assert upstream received the **real** token, not the masked value (locks G1).
- [ ] Test: `list_mcp_servers` with no project config returns default-registered servers (locks G6).
- [ ] Test: `register_mcp_server` with missing required `name` / invalid `type` enum now **rejected by schema validation** (locks G5).

### Phase 2 — Test wiring (S) — _closes G11_

- [ ] `package.json`: add `"test:mcp-registry": "node tests/mcp-registry-test.js"`; add it to the `test` chain → `check && test:feedback && test:chat && test:mcp-registry`.
- [ ] `check` script += `node --check src/core/mcp-registry/index.js && node --check src/core/mcp-registry/routes.js && node --check tools/mcpRegistryTools.js && node --check tests/mcp-registry-test.js` (and `proxy.js` once created in Phase 3).
- [ ] Verify `data/test-mcp-registry.db` is git-ignored or cleaned up by the test (currently lands in untracked `data/`).

### Phase 3 — Proxy module: `src/core/mcp-registry/proxy.js` (M) — _closes G2, G3, G10, partial G14_

- [ ] 3.1 Extract from `index.js`: `buildHeaders` (292-325), `proxyRequest` (327-355) → new `proxy.js`; `index.js` imports from it. **No behavior change on extraction** — verify tests still green immediately after.
- [ ] 3.2 **Circuit breaker** per `server_id`: states `closed → open → half-open` per design §5.3; thresholds in constants (e.g., 5 consecutive failures → open, 30s cool-off, single probe in half-open). Persist state in memory; surface `breaker: 'open'` with `retry_after` in error details (design §5.1 shape — also closes G16 for this path).
- [ ] 3.3 **Timeout policy:** health check 5s, tool call 10s, discovery 15s (named constants; replace magic numbers at `index.js:327,436`).
- [ ] 3.4 **Connection reuse:** rely on undici's global `fetch` agent (keep-alive is default) — no new deps; document as pooling strategy.
- [ ] 3.5 **Fix routes.js JSON-RPC proxy (G10):** `POST /mcp/proxy/:id/jsonrpc` must call the shared `proxyRequest` (auth headers + `response.ok` handling) instead of its inline fetch at `routes.js:261`.
- [ ] 3.6 Add `POST /mcp/proxy/:id/http` (design §2.4, generic HTTP forward) — **optional, defer to Phase 6 if effort spikes**; the JSON-RPC route covers the MCP path.
- [ ] 3.7 Tests: circuit breaker transitions (mock server returning 500s), timeout enforcement, auth header injection via route.

### Phase 4 — Credential encryption at rest (M) — _closes G4_

- [ ] 4.1 `src/core/mcp-registry/crypto.js` (new, `node:crypto` only): `encryptAuthConfig(obj)` / `decryptAuthConfig(str)` — AES-256-GCM, value format `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`.
- [ ] 4.2 Key derivation: HKDF/scrypt from `MCP_MASTER_SECRET` env (fallback: config master secret; if neither set → **log warning, store plaintext** for dev ergonomics, flag `encryption: 'disabled'` in health output).
- [ ] 4.3 Write path: encrypt in `registerServer` (`index.js:66`) and `updateServer` when `auth_config` changes. Read path: decrypt **only** in `getServerRaw` (the proxy path); `getServer`/`listServers` keep masking on the decrypted object.
- [ ] 4.4 ⚠️ **Checkpoint:** `collection.js:115-125` runs `ensureJsonObject('auth_config')` on every inflate — verify behavior with `enc:v1:` strings (may coerce to `{}` and destroy ciphertext). If so, either make `ensureJsonObject` pass through `enc:v1:`-prefixed strings, or store the encrypted blob under a separate non-inflated column. **Resolve before writing any encrypted rows.**
- [ ] 4.5 Legacy rows: plaintext (no `enc:v1:` prefix) → decrypt fallback = use as-is; re-encrypt on next update. No migration script needed.
- [ ] 4.6 Tests: round-trip encrypt/decrypt, ciphertext ≠ plaintext in raw DB dump, masked output unchanged, plaintext-legacy read path, missing-secret warning.

### Phase 5 — Authorization hardening (M) — _closes G8, design §4.3_

- [ ] 5.1 Make `requireAuth` (`auth/index.js:215`) also accept `X-API-Key` / `api_key` query via `authManager.validateApiKey` (align behavior with its own error text and `routes.js:8` header comment).
- [ ] 5.2 Admin elevation for `POST /mcp/servers` and `DELETE /mcp/servers/:id`: `requireRole('admin', 'owner')` — only if seeded roles exist; if the project has no role model in practice, gate behind config flag `features.mcpRegistryAdminGate` (default off) and document.
- [ ] 5.3 Never log `auth_config` / auth headers: audit `routes.js` + `index.js` error paths; ensure `err.message` from fetch can't echo headers (it can't — but upstream URLs with `?api_key=` query must be scrubbed).
- [ ] 5.4 Tests: unauthenticated write → 401; API-key write → 200; cross-project PUT/DELETE/connect → 403 (one already implied, make explicit); health route cross-project → 404/403.

### Phase 6 — Deferred / optional (S each)

- [x] 6.1 **RESOLVED 2026-10-07 (Q1): keep `listChanged: false`** — no `notifications/tools/list_changed` exists anywhere in the codebase (grep: 0 matches), so advertising `true` would misstate the capability. Decision documented inline at `mcp-server.js:1806`. Flip to `true` only if/when the notification is actually emitted on connect/disconnect.
- [ ] 6.2 Periodic health sweep (`setInterval`, default 60s, config-gated, only for `status='connected'` servers) in `server.js`.
- [ ] 6.3 `POST /mcp/proxy/:id/http` generic forward if not done in 3.6.
- [ ] 6.4 stdio `args` column (G18) — only if a real stdio-server registration use case appears.

### Phase 7 — Governance closeout (S) — _closes G13_

- [x] 7.1 PRI sync (`.workspace/PRI/PROJECT_REFERENCE_INDEX.md`): add `src/core/mcp-registry/{index,routes,proxy}.js`, `tools/mcpRegistryTools.js`, `tests/mcp-registry-test.js`; new "MCP Registry Tools (9 tools)" section under MCP Tool Surface; `mcp_servers` table row in schema tables; bump Last Updated + maintenance log.
- [x] 7.2 LFI sync: add register → connect → discover → proxy flow to `LOGIC_FLOW_INDEX.md`, `COMPONENT_INTERACTIONS.md`; error paths (unavailable, breaker open, stdio-not-proxied, masked auth) to `ERROR_PATHS.md`.
- [x] 7.3 **Fix CHANGELOG tool names** (`CHANGELOG.md:14,26,31`): `mcp_register_server` → `register_mcp_server`, `mcp_list_servers` → `list_mcp_servers`, `mcp_get_server` → `get_mcp_server`, `mcp_unregister_server` → `unregister_mcp_server`, `mcp_connect_server` → `connect_mcp_server`, `mcp_disconnect_server` → `disconnect_mcp_server`, `mcp_server_health` → `get_mcp_health`; remove non-existent `mcp_update_server` (update = HTTP `PUT` only); append new Phases 1-5 additions (proxy.js, crypto, breaker) as amendments — **append-only alongside user's uncommitted edits**.
- [x] 7.4 `AGENTS.md`: Key Files += `src/core/mcp-registry/`, `tools/mcpRegistryTools.js`.
- [ ] 7.5 `docs/`: registry tool reference page (optional follow-up).
- [x] 7.6 Enforcement checklist: no new root-level files; artifacts live in `.workspace/mcp-management/`; no `website\` or OpenCode config touched; `.workspace/temp/` clean. **Verified 2026-10-07:** zero new root-level files (stale test-created `local-mcp-memory.mcp-runtime.json` removed after confirming its PID was dead); website copy + `~/.config/opencode/opencode.jsonc` accessed read-only only (opencode.jsonc mtime still 2026-09-24, website git status clean); `.workspace/temp/` = 0 files after deleting all 11 probe artifacts; NOTE the bare `.mcp-runtime.json` was deliberately kept — PID 12320 alive on port 47001 (live website-copy server, pre-existing read-only artifact).

---

## 4. Exact File Change List

| #   | File                                                            | Change                                                                          | Phase       |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| 1   | `src/core/mcp-registry/index.js`                                | `getServerRaw()`; call sites switched; encrypt on write; import proxy module    | 1, 4        |
| 2   | `mcp-server.js`                                                 | `getToolSchemaMap()` += registry tools (L1597); optional `listChanged` (L1806)  | 1, 6        |
| 3   | `tools/mcpRegistryTools.js`                                     | default `'default'` (L329); project scoping helper on 6 handlers                | 1           |
| 4   | `src/core/mcp-registry/routes.js`                               | health-route scoping; JSON-RPC route → shared proxy; optional `/proxy/:id/http` | 1, 3        |
| 5   | `src/core/mcp-registry/proxy.js`                                | **NEW** — extraction + circuit breaker + timeouts + auth headers                | 3           |
| 6   | `src/core/mcp-registry/crypto.js`                               | **NEW** — AES-256-GCM helpers (`node:crypto`)                                   | 4           |
| 7   | `src/core/auth/index.js`                                        | `requireAuth` accepts API keys; optional `requireRole` wiring                   | 5           |
| 8   | `src/core/database/sqlite/collection.js`                        | `ensureJsonObject` passthrough for `enc:v1:` (if checkpoint 4.4 requires)       | 4           |
| 9   | `tests/mcp-registry-test.js`                                    | +mock-server proxy tests, validation tests, encryption tests, auth tests        | 1b, 3, 4, 5 |
| 10  | `package.json`                                                  | `test:mcp-registry` script; `test` chain; `check` += 4-5 files                  | 2           |
| 11  | `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`, `.workspace/LFI/*` | structural + behavioral sync                                                    | 7           |
| 12  | `CHANGELOG.md`, `AGENTS.md`                                     | tool-name corrections, new-file entries                                         | 7           |
| 13  | 🚫 `website\` copy, `~/.config/opencode/opencode.json(c)`       | **NOT modified — ever**                                                         | —           |

No other files. No new npm dependencies. No destructive schema changes (encryption reuses the existing `auth_config TEXT` column — **no migration**).

---

## 5. Security Requirements (non-negotiable)

1. Internal proxy path uses **unmasked** credentials; every external surface (routes, MCP tool output, logs) uses **masked** — never mix the two.
2. `auth_config` encrypted at rest with AES-256-GCM once `MCP_MASTER_SECRET` is available; ciphertext never logged, never returned by any API.
3. No auth header or token value in any error message or log line; scrub `api_key` from upstream URLs in error output.
4. Write routes require auth (JWT **or** API key); cross-project access denied with 403/404; no exceptions.
5. Circuit breaker fails fast — no unbounded hangs in MCP tool execution; all timeouts bounded constants.
6. Feature gate: `features.mcpRegistry = false` fully hides the 9 tools and disables dispatch (already true — preserve it).
7. Schema changes additive only; existing plaintext rows readable (no lockout), re-encrypted on write.
8. No git operations on the dirty tree; `website\` copy and OpenCode global config untouched.

---

## 6. Risks & Open Questions

| #      | Risk / Question                                                                                                                                                                                                     | Mitigation / Decision                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | `ensureJsonObject` may destroy `enc:v1:` ciphertext on inflate                                                                                                                                                      | Checkpoint 4.4 — verify **before** any encrypted write lands in DB                                                                                                     |
| R2     | Encryption without `MCP_MASTER_SECRET` weakens to plaintext silently                                                                                                                                                | Explicit `encryption: 'disabled'` flag in `get_mcp_health` output + startup warning                                                                                    |
| R3     | Circuit breaker false-opens on flaky networks                                                                                                                                                                       | Conservative thresholds, half-open single probe, `retry_after` in error                                                                                                |
| R4     | Mock-server tests flaky (ports, timing)                                                                                                                                                                             | Bind `127.0.0.1:0` (ephemeral port), generous timeouts, cleanup in `finally`                                                                                           |
| R5     | Dirty tree merge friction in `mcp-server.js`                                                                                                                                                                        | Minimal, targeted edits at known lines; never revert user changes                                                                                                      |
| R6     | Role model may not exist in practice (5.2)                                                                                                                                                                          | Config-gated admin check, default off                                                                                                                                  |
| **Q1** | **Should `listChanged` flip to `true`?** Requires actually emitting `notifications/tools/list_changed` on connect/disconnect; stdio clients (OpenCode) tolerate it, but unemitted notifications violate spec claims | **ANSWERED 2026-10-07: keep `false`, document only** — grep confirms no `notifications/*` exists in the codebase; documented inline at `mcp-server.js:1806` (task 6.1) |
| **Q2** | Defer `/proxy/:id/http` generic forward?                                                                                                                                                                            | Recommended: defer — JSON-RPC route covers the MCP use case                                                                                                            |
| Q3     | Periodic health sweep — default interval?                                                                                                                                                                           | Recommend 60s, config-gated, connected servers only                                                                                                                    |
| Q4     | ESLint/prettier `comma-dangle` conflict (G17) — repo-wide                                                                                                                                                           | Out of scope; registry files follow prettier. File a separate issue                                                                                                    |

---

## 7. Verification Checklist (Definition of Done)

- [ ] `npm test` green (now including `test:mcp-registry`) — pre-existing failures documented, none introduced
- [ ] `node tests/mcp-registry-test.js` green with **new** Phase 1b/3/4/5 tests
- [ ] Mock-server test proves **real** (unmasked) bearer token reaches upstream (G1 regression-locked)
- [ ] `register_mcp_server` with bad args rejected by schema validation (G5 regression-locked)
- [ ] Ciphertext visible in raw DB for `auth_config` when secret configured; API output still masked
- [ ] Unauthenticated write → 401; API-key write → 200; cross-project mutate → 403
- [ ] `prettier --check` clean on all touched files; `npm run check` includes new files
- [ ] PRI, LFI, CHANGELOG (tool names corrected), AGENTS.md synced; no root-level files added
- [ ] 🚫 `website\` copy + OpenCode global config untouched (git status / mtimes)
- [ ] No git staging/committing performed

**Effort summary:** Phase 0 **S** · Phase 1 **M** · Phase 1b **S** · Phase 2 **S** · Phase 3 **M** · Phase 4 **M** · Phase 5 **M** · Phase 6 **S–M (each, optional)** · Phase 7 **S**

**Recommended execution order:** 0 → 1 → 1b → 2 → 3 → 4 → 5 → 7, with Phase 6 items after user decisions on Q1–Q3.
