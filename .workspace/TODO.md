# TODO — ngrok Integration into local-mcp-memory MCP Server

**Created:** 2026-10-06
**Status:** PLANNED — no code changes made yet
**Goal:** Give AI agents ngrok tunnel control (start/stop/inspect tunnels) by adding `ngrok_*`
tools to this MCP server in the **dev copy** (`projects\`), verified standalone, with
authentication added last. Live rollout to agents happens only when the user promotes the dev
copy to the live `website\` copy (out of scope — see F1).
**Governance:** Planning artifact → `.workspace/` (per GOVERNANCE.md Rule 2, `.workspace/planning/` is the
designated home for plans; root-level `TODO.md` must NOT be used for this — the existing root
`TODO.md` is unrelated and untouched).

---

## 1. Verified Environment Baseline (checked 2026-10-06)

| Component | Value | Status |
|---|---|---|
| ngrok CLI | `3.39.11` (npm global → `C:\Users\ranit\AppData\Roaming\npm\node_modules\ngrok\bin\ngrok.exe`) | ✅ installed |
| ngrok authtoken | none — no config file at `%LOCALAPPDATA%\ngrok\ngrok.yml`, no `NGROK_AUTHTOKEN` / `NGROK_API_KEY` env | ❌ missing (Phase 6) |
| Node.js | `v24.21.0` | ✅ |
| npx | `12.1.0` | ✅ |
| Project runtime req | Node >= 20 (ESM) | ✅ |
| Official ngrok MCP server | does NOT exist (checked: 55 ngrok GitHub org repos, npm registry, PyPI) | ➖ build our own tools |
| OpenCode MCP registration | `local-mcp-memory` = **connected** in `opencode mcp list` | ✅ |
| ngrok tools in OpenCode today | none | ➖ this plan |

---

## 2. CRITICAL FINDINGS (read before executing)

### F1 — Two-copy architecture is INTENTIONAL (user-confirmed) ⚠️

| Copy | Role | Rules |
|---|---|---|
| `website\local-mcp-memory` | **LIVE runtime** — connected to this session and other AI agents. OpenCode global config (`~/.config/opencode/opencode.json` + `opencode.jsonc`) runs `node …\website\…\mcp-server.js` | 🚫 **DO NOT TOUCH — ever** |
| `projects\local-mcp-memory` | **Development line** — where the project is built and upgraded (this task's workspace) | ✅ all work happens here |

- Both are **separate git repos** (no symlink), on `main`, and diverged:
  - `website\`: **v2.5.0**, `mcp-server.js` = 2766 lines, last commit `7ea43c9` (2026-09-17)
    *"chore: snapshot project state for enhanced development"* — i.e. a **frozen snapshot**
  - `projects\`: **v2.6.0**, `mcp-server.js` = 2870 lines, last commit `aff3879` (2026-09-18) —
    active development
- **Consequence 1:** all ngrok work in this plan targets `projects\` ONLY. Nothing in this task
  modifies `website\`, the OpenCode global config, or any live agent connection.
- **Consequence 2:** the new `ngrok_*` tools reach live agents only **after** the user promotes
  `projects\` → `website\` through their own release process. That promotion is **out of scope**
  for this task and must never be done by the agent without explicit instruction.
- **Consequence 3:** Phase 5 "MCP works" verification is therefore done **standalone** against the
  `projects\` copy over stdio (no config changes, no live impact).
- Side note (not our concern in this task): both global config files define the server with
  different `MCP_PROJECT`/`MCP_SCOPE` env and different `timeout` (120000 vs 30000).

### F2 — Pre-existing uncommitted changes (do not disturb)
`git status` on `projects\` shows modified: `AGENTS.md`, `CHANGELOG.md`, `mcp-server.js`,
`opencode.jsonc`, `package.json`, `server.js`, `src/core/database/*`, etc., plus untracked
`.workspace/`, `bin/`. These are the user's work-in-progress. **Never revert, stage, or commit
them.** Our changes must be additive and reviewable alongside them.

### F3 — Latent pre-existing issue (OUT OF SCOPE, note only)
`src/core/mcp/tool-executor.js:1` imports `hasHandler` from `tool-registry.js`, but
`tool-registry.js` only exports `hasTool` (line 80) — `hasHandler` exists only as a class method
(line 35). `src/core/mcp/index.js` re-exports the executor. It never fails today because nothing
imports `src/core/mcp/index.js` at runtime and `npm run check` only does `node --check` (syntax,
no import resolution). Do NOT fix in this task; record as a separate issue if desired.

---

## 3. Architecture Decision

**Follow the `tools/mcpRegistryTools.js` pattern exactly** — the cleanest existing extension
pattern (self-contained, feature-gated, single dispatch entry point):

| Concern | Existing pattern | ngrok equivalent |
|---|---|---|
| Tool definitions | `getMCPRegistryTools()` — gated by `isFeatureEnabled('mcpRegistry')` | `getNgrokTools()` — gated by `isFeatureEnabled('ngrok')` |
| Dispatch | `handleMCPRegistryTool(name, args, CONFIG)` → `{content:[{type:'text',…}]}` | `handleNgrokTool(name, args, CONFIG)` — same return shape |
| List wiring | `mcp-server.js` `tools/list` → `...mcpRegistryTools` | add `...getNgrokTools()` |
| Call wiring | allowlist array + `if (…) { … }` block before `UNKNOWN_TOOL` fallback | add `ngrokToolNames` block |
| Config flag | `features.mcpRegistry: true` in `core/config/project-config-loader.js` | add `features.ngrok: true` |

**ngrok control mechanism:** spawn the installed ngrok CLI as a managed child process + read the
ngrok local inspection API (`http://127.0.0.1:4040/api/tunnels`). **No new npm dependencies.**

**Why not `@ngrok/ngrok` SDK?** It would add a native-binary dependency for what is a thin
process+HTTP wrapper; the CLI is already installed and version-pinned on this machine.

---

## 4. Tool Surface Spec (5 tools)

Naming follows the project's snake_case convention. All args validated by
`validateToolArguments()` (see Phase 2.4 — schemas must be added to the schema map or validation
is silently skipped).

### 4.1 `ngrok_status` — no args (must work BEFORE authtoken exists)
Returns JSON:
```json
{
  "binary": { "found": true, "path": "C:\\...\\ngrok.exe", "version": "3.39.11" },
  "authtokenConfigured": false,
  "api": { "reachable": false, "baseUrl": "http://127.0.0.1:4040" },
  "tunnels": { "count": 0 }
}
```
- Never print token values — only `true`/`false`.
- Detection order: `NGROK_AUTHTOKEN` env → config file exists + contains `authtoken:` →
  `authtokenConfigured: false`.
- This tool is the Phase 4 "MCP works" proof point (no auth needed).

### 4.2 `ngrok_start` — required: `port`; optional: `proto`, `region`, `host_header`, `name`
```jsonc
{
  "port":       { "type": "number" },                 // 1–65535, integer
  "proto":      { "type": "string", "enum": ["http","tcp","tls"] },  // default "http"
  "region":     { "type": "string" },                 // us|eu|ap|au|in|sa|jp — validate against allowlist
  "host_header":{ "type": "string" },                 // e.g. "localhost:3000"
  "name":       { "type": "string" }                  // tunnel name for tracking (default: ngrok-<port>)
}
```
Returns the public URL + tunnel name. On failure returns a structured error, notably a clear
`AUTH_REQUIRED` hint when the authtoken is missing (ngrok v3 refuses all tunnels without it).

### 4.3 `ngrok_stop` — optional: `name` | `all` (exactly one required)
- `name` → stop that tunnel (kill tracked child if we own it; error if externally owned)
- `all: true` → stop every tunnel this MCP server spawned (never kills user's manual ngrok)

### 4.4 `ngrok_list_tunnels` — no args
Reads `GET http://127.0.0.1:4040/api/tunnels` → `{ tunnels: [...], count }`. Works against an
externally-started ngrok too (observability without ownership).

### 4.5 `ngrok_get_url` — optional: `name`
Convenience: returns `public_url` of the named or first active tunnel.

---

## 5. Phased Action Plan

### Phase 0 — Baseline verification (before touching anything)
- [ ] Re-confirm versions: `ngrok version`, `node --version`
- [ ] Record pre-change green baseline: `npm run check`, `npm run lint`, `npm test`
      (if already failing, record failures as pre-existing — do not fix here)
- [ ] Re-read F1/F2: confirm config path divergence and dirty git state unchanged
- [ ] Confirm `git status` snapshot before/after so our diff is isolated

### Phase 1 — Core module (no wiring yet): `utils/ngrokManager.js`
- [ ] **Binary resolution** (Windows-safe), tried in order:
      1. `ngrokPath` from project config (opt-in override)
      2. `where.exe ngrok` → pick first path ending in `.exe`
      3. fallbacks: `%LOCALAPPDATA%\ngrok\ngrok.exe`, `C:\ngrok\ngrok.exe`,
         `%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe`
      ⚠️ `spawn('ngrok', …, {shell:false})` will **not** resolve npm's `.cmd` shim on Windows →
      always resolve to an absolute `ngrok.exe` path first.
- [ ] `runNgrok(args, {timeout})` — `spawn(exePath, argsArray, {shell:false})`, capture
      stdout/stderr, enforce timeout, never build a shell string (**command-injection safety**)
- [ ] Strict arg validation: port = integer 1–65535, `proto`/`region` enums, `name` matches
      `^[A-Za-z0-9_-]{1,64}$` (defense-in-depth even though `spawn` uses an args array)
- [ ] Child-process registry: `Map<name, child>` — one tracked ngrok per tunnel name
- [ ] Serialized start/stop via promise-queue mutex (mirror `enqueueBrowserRequest` in
      `mcp-server.js` to avoid racing the single local API)
- [ ] Local API client: `getTunnels()` → `GET :4040/api/tunnels` with short timeout; configurable
      base URL (`NGROK_API_URL`, default `http://127.0.0.1:4040`)
- [ ] **Conflict handling:** if :4040 answers but we own no process → user has an external ngrok;
      `start` returns an explanatory error, `list_tunnels`/`status` still work
- [ ] **Cleanup hooks:** on `process.on('exit'|'SIGINT'|'SIGTERM'|'SIGHUP')` kill tracked children
      (Windows: `spawnSync('taskkill', ['/pid', pid, '/T', '/F'])`, fallback `child.kill()`)
- [ ] Version/status probe: `runNgrok(['version'])` (never leaks env/config)
- [ ] Authtoken detection (read-only, Phase 1 = report only, never write)

### Phase 2 — Tool module: `tools/ngrokTools.js`
- [ ] 2.1 `getNgrokTools()` → the 5 definitions from §4, gated by `isFeatureEnabled('ngrok')`
- [ ] 2.2 `handleNgrokTool(name, args, config)` → switch dispatch, `{content:[{type:'text',…}]}` wrapper,
      try/catch returning `{ error: … }` (mirror `handleMCPRegistryTool` lines 223–288)
- [ ] 2.3 Feature flag: add `ngrok: true` to default `features` in
      `core/config/project-config-loader.js` (line ~106 block) — enabled by default, consistent
      with `mcpRegistry`/`emulator`
- [ ] 2.4 **Schema map:** add `...getNgrokTools()` to `getToolSchemaMap()` in `mcp-server.js`
      (line 1597) so `validateToolArguments()` actually validates ngrok inputs. (Note: registry
      tools are currently absent from this map — that is their gap; do not replicate it.)

### Phase 3 — Wiring: `mcp-server.js`
- [ ] 3.1 `import { getNgrokTools, handleNgrokTool } from './tools/ngrokTools.js';` (near line 27)
- [ ] 3.2 `tools/list` (line ~1829): add `...getNgrokTools()` to the returned array
- [ ] 3.3 `tools/call`: add allowlist block **before** the `UNKNOWN_TOOL` fallback (line ~2817),
      pattern-identical to the `mcpRegistryToolNames` block:
      `const ngrokToolNames = ['ngrok_status','ngrok_start','ngrok_stop','ngrok_list_tunnels','ngrok_get_url'];`
- [ ] 3.4 Add `node --check tools/ngrokTools.js && node --check utils/ngrokManager.js` to the
      `check` script in `package.json`
- [ ] 3.5 Add `"test:ngrok": "node tests/ngrok-tools-test.js"` script

### Phase 4 — Tests: `tests/ngrok-tools-test.js` (MCP-must-work proof, no auth needed)
- [ ] Template: `tests/mcp-registry-test.js` (same `test()`/`assert()`/pass-fail harness)
- [ ] Cases:
  - `getNgrokTools()` returns 5 defs with valid `name`/`description`/`inputSchema` shapes
  - feature flag off → `getNgrokTools()` returns `[]` and handler returns the
    "feature is disabled" message
  - `ngrok_status` returns `binary.found === true` and a semantic-version `version` **on this machine**
  - `ngrok_status` never leaks `NGROK_AUTHTOKEN` value (assert output excludes env value)
  - `ngrok_start` with `port: 99999` / `port: "abc"` → rejected by schema validation
  - `ngrok_start` with valid port **without authtoken** → structured `AUTH_REQUIRED`-style error,
    **no hang, no crash** (this is the expected current behavior)
  - `ngrok_stop` with neither `name` nor `all` → validation error
  - `ngrok_list_tunnels` with no ngrok running → graceful `{tunnels:[],count:0}` or clear error
  - binary-resolution unit test with a fake `ngrokPath` override (missing path → clean error)
- [ ] Run: `npm run test:ngrok`

### Phase 5 — Verification (MCP works — standalone, `projects\` copy only, live untouched)
- [ ] 5.1 `npm run check && npm run lint && npm run format:check && npm test`
- [ ] 5.2 Manual stdio handshake against the **projects\** copy:
      ```powershell
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' +
      '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' |
        node C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory\mcp-server.js
      ```
      → confirm all 5 `ngrok_*` tools present; note server boots its HTTP memory backend (may take a few seconds)
- [ ] 5.3 Call `ngrok_status` over stdio → structured JSON, `binary.found: true`
- [ ] 5.4 **Live OpenCode verification — DEFERRED (out of scope for this task).**
      The live agents keep running the `website\` snapshot, which this task must not modify.
      The ngrok tools become available to OpenCode/other agents only when the **user** promotes
      `projects\` → `website\` (their own release process) or explicitly instructs otherwise.
      - Optional (ONLY if user requests it): add a **separate, temporary** MCP entry pointing at
        the `projects\` copy for isolated testing — would spawn a second server instance; check
        DB path / HTTP backend port contention first (`PORT` default is dynamic per PRI, but
        `MCP_DB_PATH` defaults to `./data/mcp-memory.db`), and remove it after testing.
- [ ] 5.5 ~~`opencode service restart`~~ — **not performed in this task** (live config untouched);
      re-verify `opencode mcp list` only after a user-approved promotion (Phase 6.4 of their
      release process, not this plan)
- [ ] 5.6 After promotion (user-led): confirm `ngrok_*` tools appear in a **fresh** session —
      MCP `tools/list` changes only apply to newly spawned servers/sessions

### Phase 6 — Authentication (AFTER standalone verification 5.1–5.3 passes — user's explicit sequencing)
> Auth is tested against the `projects\` copy standalone (e.g. a local `ngrok_start` round-trip
> via stdio or a scratch script). Live-agent testing stays deferred with Phase 5.4.
- [ ] 6.1 User obtains token: https://dashboard.ngrok.com/get-started/your-authtoken
- [ ] 6.2 Configure **outside the repo and outside OpenCode config**:
      `ngrok config add-authtoken <token>` → writes `%LOCALAPPDATA%\ngrok\ngrok.yml`
      (alternative: set `NGROK_AUTHTOKEN` env var system-wide — user's choice; file preferred)
      🔒 Never commit the token, never put it in `opencode.json(c)` or `mcp.json`
- [ ] 6.3 End-to-end test: start a local server (e.g. `npx serve` on 3000) →
      `ngrok_start {port:3000}` → assert public `https://…ngrok-free.app` URL returned →
      `ngrok_list_tunnels` shows it → `ngrok_stop {name}` → tunnel gone
- [ ] 6.4 Verify cleanup: stop the MCP server → no orphaned `ngrok.exe` remains
      (`Get-Process ngrok`)
- [ ] 6.5 Re-run `npm run test:ngrok` (the no-auth test expectations may need updating now that
      a token exists — make auth-dependent assertions conditional on detected token)

### Phase 7 — Governance closeout
- [ ] 7.1 PRI sync (`.workspace/PRI/PROJECT_REFERENCE_INDEX.md`):
      - `tools/` contents: add `ngrokTools.js`
      - **MCP Tool Surface:** add an "ngrok Tunnel Tools (5 tools)" section
      - `utils/`: add `ngrokManager.js`
      - bump `Last Updated` / `Last Verified`, append entry to Reference Maintenance Log
- [ ] 7.2 LFI: add ngrok start/stop flow to `.workspace/LFI/LOGIC_FLOW_INDEX.md` +
      `COMPONENT_INTERACTIONS.md` (error paths: missing binary, missing authtoken, :4040 conflict)
- [ ] 7.3 Update root `CHANGELOG.md` (feature entry under Unreleased / next version) — append-only
      alongside the user's existing uncommitted edits
- [ ] 7.4 Update project `AGENTS.md` Key Features + Key Files if warranted
- [ ] 7.5 Docs (optional follow-up): `docs/` site ngrok tool reference
- [ ] 7.6 Verify enforcement checklist: no new root-level files (this TODO lives in `.workspace/`),
      reports indexed if any created, `.workspace/temp/` cleaned

---

## 6. Exact File Change List

| # | File | Change | Phase |
|---|---|---|---|
| 1 | `utils/ngrokManager.js` | **NEW** — binary resolution, spawn, child registry, API client, cleanup | 1 |
| 2 | `tools/ngrokTools.js` | **NEW** — 5 tool defs + `handleNgrokTool` dispatcher | 2 |
| 3 | `core/config/project-config-loader.js` | add `ngrok: true` to default `features` | 2 |
| 4 | `mcp-server.js` | import (≈L27), `tools/list` (≈L1829), dispatch block (≈L2817), schema map (≈L1597) | 3 |
| 5 | `package.json` | `check` script += 2 files; add `test:ngrok` script | 3 |
| 6 | `tests/ngrok-tools-test.js` | **NEW** — test suite | 4 |
| 7 | `.workspace/PRI/PROJECT_REFERENCE_INDEX.md` | structural sync | 7 |
| 8 | `.workspace/LFI/*` | behavioral sync | 7 |
| 9 | `CHANGELOG.md`, `AGENTS.md` | documentation | 7 |
| 10 | `~/.config/opencode/opencode.json(c)` + `website\` copy | 🚫 **NOT modified in this task** — live runtime stays untouched; promotion is user-led (F1) | — |

No other files. No dependency additions. No changes to the `website\` copy without explicit approval.

---

## 7. Security Requirements (non-negotiable)

1. **No shell string building** — always `spawn(absExePath, argsArray, {shell:false})`
2. **Strict input validation** — port range, enum allowlists, name pattern (§4) before any spawn
3. **No secrets in output** — status reports booleans only; token never echoed, never logged
4. **No token in any tracked file** — config file or env var only (Phase 6)
5. **Scoped process control** — `ngrok_stop {all}` kills only children we spawned; never a blanket
   `taskkill /im ngrok`
6. **Bounded timeouts** on every spawn and HTTP probe (no hangs in MCP tool execution)
7. **Feature gate** — `features.ngrok=false` must fully hide and disable the tool surface
8. **Structured errors** — missing binary / missing authtoken / API conflict return actionable
   messages, never raw stack traces

---

## 8. Verification Checklist (definition of done)

- [ ] `npm run check && npm run lint && npm run format:check` → clean
- [ ] `npm test` + `npm run test:ngrok` → green (pre-existing failures documented, not caused by us)
- [ ] stdio `tools/list` (projects\ copy) shows 5 `ngrok_*` tools
- [ ] `ngrok_status` works with **no authtoken** (proves MCP integration independent of auth)
- [ ] 🚫 `website\` copy and OpenCode global config untouched (verified via their git status /
      file mtimes)
- [ ] Live-agent availability of `ngrok_*` tools: **deferred to user-led promotion** (F1/5.4)
- [ ] Phase 6: real tunnel start/stop round-trip works against `projects\` standalone; no orphaned
      processes
- [ ] PRI/LFI/CHANGELOG synced; no root-level files added

---

## 9. Risks & Open Questions

| # | Risk / Question | Mitigation / Decision needed |
|---|---|---|
| R1 | Live agents run the frozen `website\` snapshot — ngrok tools invisible there until promoted | Accepted by design (F1); live verification deferred to user-led promotion (5.4) |
| R2 | Both `opencode.json` and `opencode.jsonc` define the live server differently (env/timeout) | Out of scope — live config untouched in this task; note to user only |
| R3 | ngrok v3 requires authtoken for ANY tunnel → `ngrok_start` fails until Phase 6 | By design; clear `AUTH_REQUIRED` error; status/list tools still work |
| R4 | :4040 occupied by user's own ngrok | Detect + explain; observe-only mode instead of hijacking |
| R5 | Windows orphaned processes on server crash | exit hooks + `taskkill /T`; verify in 6.4 |
| R6 | npm `.exe` vs `.cmd` resolution on Windows | Explicit `.exe` path resolution (Phase 1) |
| R7 | Dirty working tree (F2) — merge friction in `mcp-server.js` | Additive edits only; never stage/commit user's changes |
| R8 | MCP tool-list caching in running sessions | Service restart + fresh session required (5.5–5.6) |
| R9 | Free ngrok URLs are ephemeral (change each restart) | Document in tool description; paid `domain` arg optional |
| Q1 | Should ngrok tools be available to **all** agents or gated by permission? | OpenCode-side: optional `permissions` entry to deny `local-mcp-memory_ngrok_*` per agent |
| Q2 | Multiple concurrent tunnels supported? | Yes — tracked per name; keep 1-per-port default |
| Q3 | Should `ngrok_inspect` (request inspector via `:4040/api/requests`) be added later? | Deferred — not in MVP |

---

## 10. Execution Notes for the Future Agent

- **Sequencing is mandatory:** Phase 4/5 (MCP works) must pass BEFORE Phase 6 (auth), per user
  instruction. Do not configure the authtoken early.
- **Two-copy rule (F1):** work ONLY in `projects\local-mcp-memory`. The `website\` copy is the
  live runtime connected to this session and other agents — **never modify it**, never touch the
  OpenCode global MCP config, never restart the live service as part of this task. Promotion of
  new code to live is the user's decision and process.
- Do not run `git add`/`git commit`/`git checkout`/`git restore` — the tree is dirty with user
  work (F2).
- Follow `mcpRegistryTools.js` as the copy-paste structural template; keep Prettier formatting
  (`npm run format` before finishing).
- When done: update this file's Status, then execute Phase 7 governance closeout.
