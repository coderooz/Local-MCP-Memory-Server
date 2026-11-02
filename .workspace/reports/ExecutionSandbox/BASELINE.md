# BASELINE — Local Execution Sandbox (Phase 0 Evidence)

**Report ID:** BASELINE_ExecutionSandbox_20261017
**Date:** 2026-10-17
**Phase:** 0 — Discovery & Baseline
**Status:** Final (baseline captured before any implementation change)
**Git HEAD:** `643fa30f734493d2400d6cbc0dbe43e59bf64b86` (branch `main`)

> Every finding below is labelled **FACT** (verified by direct inspection/execution),
> **INFERENCE** (derived from verified facts), or **ASSUMPTION** (not yet verified).

---

## 1. Working-tree state (pre-existing, PROTECTED)

**FACT** — `git status --porcelain` shows exactly three modified files, none created by this task:

```
 M .workspace/LFI/LOGIC_FLOW_INDEX.md
 M .workspace/PRI/PROJECT_REFERENCE_INDEX.md
 M PROJECT_ROADMAP.md
```

These are user/session work-in-progress (roadmap strikethroughs + PRI/LFI sync from the prior
task). **They must never be reset, stashed, or overwritten.** No git history rewrite, no commit
unless explicitly authorized. `git stash list` is empty.

---

## 2. Runtime & toolchain

| Component         | Value                                                      | Label |
| ----------------- | ---------------------------------------------------------- | ----- |
| Host OS           | Microsoft Windows NT 10.0.26200.0                          | FACT  |
| PowerShell        | 5.1.26100.9444                                             | FACT  |
| Node              | `C:\Program Files\nodejs\node.exe` (engines `>=20`)        | FACT  |
| Python            | `C:\Python314\python.exe` (3.14)                           | FACT  |
| npm               | present                                                    | FACT  |
| Package manager   | npm (`package-lock` conventions)                           | FACT  |
| Module system     | ESM only (`"type":"module"`), no TypeScript                | FACT  |
| Docker CLI        | `C:\Program Files\Docker\Docker\resources\bin\docker.exe`  | FACT  |
| Docker **daemon** | **DOWN** — `dockerDesktopLinuxEngine` named pipe not found | FACT  |
| WSL               | `C:\Windows\system31\wsl.exe` present                      | FACT  |

**Critical:** Docker is _installed_ but the daemon is _not running_. `docker version` /
`docker info` both fail with `failed to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine`. Container isolation is therefore **currently
unavailable** until Docker Desktop is started (requires user/host action).

---

## 3. Isolation capability assessment

**FACT** — the only adequate isolation backend for hostile generated code identified so far is
Docker Linux containers (via WSL2). It is currently unavailable.

**FACT** — no dependency is permitted beyond the existing set (`better-sqlite3`, `commander`,
`dotenv`, `express`, `jsonwebtoken`, `mongodb`, `playwright`, `uuid`). This rules out adding
`execa`, `dockerode`, `node-os-utils`, gVisor wrappers, etc.

**INFERENCE** — a plain Node `child_process.spawn` with an empty env and a confined cwd is **not**
strong isolation: the child runs as the same Windows user with the host filesystem reachable.
Per directive §2.4/§6.1 this must **not** be used to run hostile generated scripts.

**INFERENCE** — Windows offers no first-class namespace/seccomp equivalent reachable from Node
without native deps; Windows "Job Objects" + restricted tokens would be a _weaker_ boundary than
a Linux container and are not available through pure Node stdlib.

**Conclusion:** sandbox execution must be **fail-closed** and **feature-flagged off by default**,
with the Docker adapter as the isolation backend, degrading to a clear `SANDBOX_START_FAILED`
error when the daemon is absent.

---

## 4. Existing execution & process-spawning capabilities (overlap check)

**FACT** — process spawning already exists in four places:

| Location                          | Mechanism                            | Purpose                                | Overlap risk                                |
| --------------------------------- | ------------------------------------ | -------------------------------------- | ------------------------------------------- |
| `plugins/emulator/index.js:509`   | `execAsync(command, { timeout })`    | Android emulator ADB calls             | Plugin-scoped, not a general MCP shell tool |
| `tools/notificationTools.js:3,51` | `spawn(detached:true)` / `spawnSync` | Play notification sound via PowerShell | UI-only                                     |
| `bin/cli.js:12,109,127`           | `spawn('node', [...])`               | Start/stop the server itself           | Lifecycle only                              |
| `core/config/runtime-state.js:6`  | `exec` (netstat)                     | Runtime port discovery                 | Known e2e hang site                         |

**FACT** — **no general-purpose shell-execution MCP tool exists.** Directive §2.4 ("never
introduce an unrestricted shell-execution MCP tool") is therefore satisfiable _without removing
anything_. No existing tool name, schema, or contract needs to change.

**FACT** — Playwright (`tools/browserTools.js`) is a dependency and launches real browsers, but it
is **not** an isolation boundary for arbitrary code and must not be repurposed as one.

---

## 5. MCP tool registration path (integration point)

**FACT** — `mcp-server.js:1831` builds the tool list by concatenation:

```js
if (request.method === 'tools/list') {
  const baseTools = getTools(); // tools/index.js
  const integrationTools = getIntegrationTools();
  const mcpRegistryTools = getMCPRegistryTools(); // tools/mcpRegistryTools.js
  const discoveredTools = getDiscoveredTools();
  return respond(request.id, {
    tools: [...baseTools, ...integrationTools, ...mcpRegistryTools, ...discoveredTools],
  });
}
```

**FACT** — `tools/call` (`mcp-server.js:1841`) first runs `validateToolArguments(name, args)`
(schema validation already in place — reuse for execution tools), then dispatches through an
`if`-chain that calls `callMemoryApi(...)` → HTTP → `server.js` route handlers.

**FACT** — `src/core/mcp/tool-registry.js` exposes a `ToolRegistry` class
(`registerTool(tool, handler)`), but the **live** stdio server path uses the `getTools()` +
`if`-chain + `callMemoryApi` route pattern. The MCP-registry tools
(`tools/mcpRegistryTools.js`, 9 tools) are the closest working model for adding a new tool
family and **must be the pattern followed** for execution tools.

**Decision:** add an `getExecutionTools()` source and append it to the `tools/list` array, with
each tool delegating to a new `/execution/*` route family in `server.js`, mirroring the registry
tools exactly. No existing entry is modified.

---

## 6. Persistence conventions

**FACT** — SQLite via `better-sqlite3`, schema defined in `src/core/database/sqlite/schema.js`
(`createSchema(db)`), **19 domain tables**, WAL mode, `PRAGMA foreign_keys = ON`, FTS5 virtual
tables + sync triggers.

**FACT** — a MongoDB-compatible collection API sits on top (`insertOne`, `find`, `$set`, `$inc`,
`$regex`, dotted-path sort), used by `routeHandler` in `server.js`.

**FACT** — idempotency already exists as a first-class concept: `tasks.idempotencyKey` has a UNIQUE
index, and `createTask` replays idempotently (verified by `tests/database-integrity-test.js`,
34/34).

**Decision:** the durable **execution job repository** is a new SQLite table (e.g.
`execution_jobs`) added to `createSchema`, following the exact existing column/index/normalization
conventions. It reuses the existing driver, init, and migration posture — no new storage engine.

---

## 7. Identity & project scope (trusted mechanism)

**FACT** — `utils/projectIdentity.js` defines `CONFIG_HIERARCHY` (project > global > environment >
none), `PROJECT_MARKERS`, and `findProjectRoot()`.

**FACT** — the MCP server **injects identity server-side**; callers cannot forge it. E.g.
`register_agent` (`mcp-server.js:1856`) and `create_task` (`:1898`) overwrite the body with
`agent: CONFIG.agent, project: CONFIG.project`.

**Decision:** execution tools must reuse `CONFIG.agent` / `CONFIG.project` and the existing
`validateProjectName` / `validateAgentId` guards. Requested identity/project fields are
**never** trusted as authoritative (directive §9).

---

## 8. Test baseline

**FACT** — `npm test` = `npm run check` + 5 suites. Recorded result on this tree:

| Suite                       | Result                      |
| --------------------------- | --------------------------- |
| `check` (syntax, ~50 files) | PASS                        |
| `test:feedback`             | PASS                        |
| `test:chat`                 | PASS                        |
| `test:mcp-registry`         | 24/24 PASS                  |
| `test:db`                   | 34/34 PASS                  |
| `test:e2e`                  | **15 FAIL — environmental** |

**FACT** — the e2e failure is `Server failed to become healthy. Boot output: [mcp-registry]
WARNING: MCP_MASTER_SECRET is not set … Test runner failed: Error: server boot failed`
(`tests/app-e2e-test.js:145`).

**FACT** — this is the **pre-existing, environmental** failure already root-caused and stored as
MCP memory context `08a859b2`: a live `website\` copy of `mcp-server.js` holds the runtime identity
the e2e boot tries to reclaim. It passed 15/15 ten days prior without that process. It is **not**
caused by, and must not be conflated with, this sandbox work.

**Baseline for regression comparison:** 74/89 green, e2e 15 red (environmental). Any post-change
run must not regress the 74.

---

## 9. Governance conventions (reporting)

**FACT** — GOVERNANCE.md Rule 1/2/3: reports live under `.workspace/reports/{Category}/`, named
`{CATEGORY}_{DESCRIPTOR}_{YYYYMMDD}.md`, indexed in a root `REPORT_INDEX.md` (an approved root
exception). Workspace files are **not** committed — with the explicit exception of PRI/LFI, which
are mandatory version-controlled artefacts.

**FACT** — `.reports/` (the directive's example path) does **not** exist in this repo.

**FACT** — canonical PRI = `.workspace/PRI/PROJECT_REFERENCE_INDEX.md`; canonical LFI =
`.workspace/LFI/` (already loaded and synced this session).

**Decision:** sandbox reports are created under `.workspace/reports/ExecutionSandbox/`, and the
_durable structural_ facts (new modules, routes, tables, tools) are registered into the committed
PRI/LFI rather than duplicating them. See `DECISION_LOG.md` D-007.

---

## 10. Unresolved questions (blockers to high-impact work)

1. **Docker daemon availability.** Can the user start Docker Desktop for this host? Without it,
   Phase 2 (real restricted execution) cannot be validated. **BLOCKER for Phase 2.**
2. **Approval channel.** There is no human-approval UI/CLI in this repo yet. Directive §7.3
   requires a trusted human channel or a documented pending-approval state. Must be designed, not
   faked.
3. **Feature-flag convention.** Exact config names must follow existing `.env` / `CONFIG`
   conventions (not yet fully enumerated) — resolved at Phase 1 start.
