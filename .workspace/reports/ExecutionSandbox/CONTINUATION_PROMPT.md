# CONTINUATION PROMPT — Local Execution Sandbox

> Copy-paste the block below into a fresh OpenCode session to resume this work without repeating
> completed investigation.

---

## Paste-ready prompt

```
You are resuming implementation of the Local Execution Sandbox in the local-mcp-memory project
(working dir: C:\Code_Works\HTML_CSS_JS\workProjects\projects\local-mcp-memory).

MANDATORY FIRST STEPS (do not skip, do not re-investigate from scratch):
1. Read project AGENTS.md, then ~/.config/opencode/GOVERNANCE.md.
2. Read .workspace/PRI/PROJECT_REFERENCE_INDEX.md and .workspace/LFI/LOGIC_FLOW_INDEX.md.
3. Read .workspace/reports/ExecutionSandbox/INDEX.md and CURRENT_STATE.md.
4. Read .workspace/reports/ExecutionSandbox/phases/PHASE_1_FOUNDATION.md,
   DECISION_LOG.md (D-001..D-009), FAILURE_REGISTER.md (FR-001..FR-003), and
   ACTION_TEST_REPORT.md (RUN-001..RUN-006).
5. Run `git status` and CONFIRM the protected dirty files are still present and unmodified:
   .workspace/LFI/LOGIC_FLOW_INDEX.md, .workspace/PRI/PROJECT_REFERENCE_INDEX.md,
   PROJECT_ROADMAP.md. NEVER reset/stash/commit/push them without explicit user authorization.

VERIFIED BASELINE (do not re-derive): HEAD 643fa30, branch main. `npm test` = 74/89 green
(feedback 7, chat 9, mcp-registry 24/24, db 34/34); e2e 15 red for a KNOWN ENVIRONMENTAL reason
(website-copy MCP server PID 4364 holds the runtime identity for project local-mcp-memory on
port 47005; MCP memory context 08a859b2). `git diff server.js` is CLEAN. That is NOT a sandbox
regression — do not attempt to "fix" it by killing the user's other project's process.

PHASE 1 IS COMPLETE (verified this session). Implemented in src/core/execution/:
errors, state-machine (15 states), policy (deterministic effective-permissions), runtime-registry
(trusted python/node allowlist), tasks-registry (read-only approved tasks), repository
(execution_jobs + optimistic concurrency + idempotency), approval (hash-bound, expiring,
replay-proof, NO self-approval), sandbox-adapter (replaceable, Docker stub, fail-closed),
workspace (interface only), result-collector (bounded + redacted), audit (narrow adapter over
existing activity/metrics with redaction/truncation), index (service), service-bridge.
Plus src/interfaces/mcp-tools/execution-tool-definitions.js (6 schemas) and tools/executionTools.js,
wired into mcp-server.js ADDITIVELY (imports, tools/list, tools/call, getToolSchemaMap).
Feature flag features.executionSandbox=false in core/config/project-config-loader.js.

TESTS (all green, no process ever spawned, executeJob always refuses):
- npm run test:execution:policy  -> 24/24
- npm run test:execution:integration -> 16/16
- regression: feedback 7, chat 9, mcp-registry 24, db 34 (all green, unchanged)
- npm run check PASS; Prettier PASS on new files.

CURRENT STATE: Phase 1 COMPLETE. Execution is fail-closed by design. Blocker: Docker daemon is
DOWN (npipe dockerDesktopLinuxEngine missing) — the only isolation backend that satisfies the
mandated controls (D-001). Phase 2 (real restricted execution) is blocked on it.

NEXT ACTION: Confirm with me whether Docker Desktop can be started. Then proceed with PHASE 2
(real Docker isolation adapter + trusted runtime registration + resource/timeout/output
enforcement + cancellation + disposable workspaces + read-only approved tasks + adversarial
sandbox tests). Do NOT claim Phase 2 or full npm test success while execution is untested and
Docker is down.

HARD RULES: additive only; never weaken isolation to make a test pass; feature disabled by
default and fail-closed; no agent self-approval; keep the 74-green baseline from regressing;
no commit/push unless I explicitly authorize it; keep reports in
.workspace/reports/ExecutionSandbox/ and register durable structural facts in PRI/LFI.
```

---

## After resuming

- Verify the last checkpoint rather than assuming it succeeded.
- Do not repeat Phase 0 or Phase 1 unless validation indicates regression.
- Update `CURRENT_STATE.md`, `INDEX.md`, `DECISION_LOG.md`, and this prompt after each phase or
  major interruption.
