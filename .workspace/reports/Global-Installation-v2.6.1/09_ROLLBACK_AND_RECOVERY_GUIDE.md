# Report 09: Rollback & Disaster Recovery Guide

**Campaign:** 13 — Controlled Global Installation, MCP Cutover & Safe v2.5.0 Retirement  
**Target Package:** `local-mcp-memory@2.6.1`  
**Date:** 2026-11-07  
**Author:** AI Disaster Recovery & Operations Auditor  

---

## 1. Executive Summary

This guide outlines the precise, reversible disaster recovery protocol to restore the host environment to the pre-migration v2.5.0 state if unexpected issues arise.

---

## 2. Recovery Artifacts Inventory

All required recovery artifacts have been created, verified, and isolated outside the project trees:

| Recovery Artifact | Path on Host | Purpose |
| :--- | :--- | :--- |
| **Antigravity Config Backup** | `C:\Users\ranit\.gemini\antigravity\mcp_config.json.bak-20261107-200145` | Restores original client MCP server definition |
| **Global Gemini Config Backup**| `C:\Users\ranit\.gemini\config\mcp_config.json.bak-20261107-200145` | Restores global config and third-party servers |
| **Full v2.5.0 Codebase Archive**| `C:\Local-MCP-Memory-Backups\v250-retirement-archive\v250-full-backup\` | Complete mirror of retired application files |
| **MongoDB Historical Backup** | `C:\Local-MCP-Memory-Backups\pre-v260-retirement\2026-11-07_20-01-20\` | 16 verified collection JSON dumps + manifest |
| **Live MongoDB Database** | `mongodb://127.0.0.1:27017/mcp_memory` | Preserved untouched with 29,854 records |

---

## 3. Step-by-Step Rollback Procedure

In the event that rollback to v2.5.0 is requested:

### Step 1: Restore Client MCP Configurations
Run in PowerShell:
```powershell
Copy-Item "C:\Users\ranit\.gemini\antigravity\mcp_config.json.bak-20261107-200145" "C:\Users\ranit\.gemini\antigravity\mcp_config.json" -Force
Copy-Item "C:\Users\ranit\.gemini\config\mcp_config.json.bak-20261107-200145" "C:\Users\ranit\.gemini\config\mcp_config.json" -Force
```

### Step 2: Restore v2.5.0 Application Codebase
```powershell
New-Item -ItemType Directory -Path "C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory" -Force
Copy-Item -Path "C:\Local-MCP-Memory-Backups\v250-retirement-archive\v250-full-backup\*" -Destination "C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory" -Recurse -Force
```

### Step 3: (Optional) Uninstall Global npm Package
```powershell
npm uninstall -g local-mcp-memory
```

### Step 4: Verify MongoDB Service & Restore Integrity
```powershell
Get-Service MongoDB
```
Because the MongoDB database `mcp_memory` was never dropped or modified, v2.5.0 immediately reconnects to its 29,854 historical records without requiring a database restore.

### Step 5: Validate Restored State
Verify that Antigravity launches `mcp-shim.js` and recognizes the restored v2.5.0 server.
