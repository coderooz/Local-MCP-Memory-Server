# Report 03: Global npm Installation Report

**Campaign:** 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Systems & Release Auditor  

---

## 1. Executive Summary

This report documents the global installation of `local-mcp-memory@2.6.1` via npm, executable resolution across all declared binary aliases, and diagnostic validation in the host environment.

---

## 2. Installation Execution

```powershell
npm install -g local-mcp-memory@2.6.1
```

- **Execution Result**: Success (added 99 packages in 3s)
- **Global Package Root**: `C:\Users\ranit\AppData\Roaming\npm\node_modules\local-mcp-memory`
- **Global npm Listing**:
  ```text
  C:\Users\ranit\AppData\Roaming\npm
  `-- local-mcp-memory@2.6.1
  ```

---

## 3. Executable Path Resolution

Executing `where.exe` confirmed that all 3 binary aliases are globally accessible on the Windows system PATH:

| Executable Alias | Full Windows Path |
| :--- | :--- |
| `local-mcp-memory` | `C:\Users\ranit\AppData\Roaming\npm\local-mcp-memory.cmd` |
| `mcp-memory` | `C:\Users\ranit\AppData\Roaming\npm\mcp-memory.cmd` |
| `local-memory-mcp` | `C:\Users\ranit\AppData\Roaming\npm\local-memory-mcp.cmd` |

### 3.1 Verification Outside Project Workspace
All 3 binaries were executed from the root user directory (`C:\Users\ranit`):
- `local-mcp-memory --version` -> `2.6.1`
- `mcp-memory --version` -> `2.6.1`
- `local-memory-mcp --version` -> `2.6.1`

---

## 4. Environment Diagnostic: `local-mcp-memory doctor`

The global diagnostic utility was executed from outside the codebase:

```text
Doctor — local-mcp-memory 2.6.1
  ✔ Node.js version          v24.21.0
  ✔ Data directory           C:\Users\ranit\AppData\Local\local-mcp-memory
  ✔ Config directory         C:\Users\ranit\AppData\Roaming\local-mcp-memory
  ✔ User config              C:\Users\ranit\AppData\Roaming\local-mcp-memory\config.json
  ✔ Database                 31 tables, journal_mode=wal, integrity=ok
  ✔ Secrets file             C:\Users\ranit\AppData\Roaming\local-mcp-memory\secrets.json
  ✔ AI agent registration    opencode, codex, antigravity
  ! Running servers          none listening (normal when no MCP client is connected)

Summary
  7 passed, 1 warnings, 0 failures
```

**Gate C Verdict**: **PASSED**. The package is installed globally, all aliases resolve properly, and the environment diagnostic passes completely.
