# Next Phase Roadmap: Release Preparation and Controlled Cutover

**Roadmap Date:** 2026-11-06  
**Project:** `local-mcp-memory`  

---

## 1. Release Milestone Roadmap

```
Current Status:
[Stage 1: Identity & Testing] ---> [Stage 2: Post-Remediation Verification] (COMPLETED)
                                            |
                                            v
                                   [Stage 3: Release Packaging & Staging]
                                            |
                                            v
                                   [Stage 4: User Authorization & Publish]
                                            |
                                            v
                                   [Stage 5: Production Migration & Cutover]
```

---

## 2. Milestone Detailed Breakdown

### Milestone 1: Release Candidate Staging (Immediate Next Step)
- Review modified files (33 files) and untracked files (13 paths) in `projects/local-mcp-memory`.
- Verify `.npmignore` / `package.json` `files` field using `npm pack --dry-run` to ensure no test fixtures, database binaries, or private configs are bundled.
- Stage changes and create release candidate commit on branch `main`.

### Milestone 2: User Authorization & Publishing
- Present the final verification report and release candidate tarball to the user.
- **Strict Rule:** Do not execute `npm publish` without explicit confirmation.
- Upon authorization, publish `local-mcp-memory@2.6.0` to the npm registry.

### Milestone 3: Controlled Migration & Agent Cutover (Post-Publish)
- Provide user with migration command:
  ```bash
  npx local-mcp-memory migrate --source "mongodb://127.0.0.1:27017/mcp_memory" --dry-run
  npx local-mcp-memory migrate --source "mongodb://127.0.0.1:27017/mcp_memory" --apply
  ```
- Validate migrated data in `%LOCALAPPDATA%/local-mcp-memory/mcp-memory.db`.
- Run `local-mcp-memory doctor` to inspect health across installed AI agents.
- Cut over Antigravity global MCP configuration from v2.5.0 shim to `local-mcp-memory start`.
- Archive Instance A (`website/local-mcp-memory`) with rollback safeguards.
