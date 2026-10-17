# Diagrams — Logic Flow Index

**Project:** local-mcp-memory
**Version:** 2.6.0
**Last Updated:** 2026-09-19

---

## Node ID Convention

All diagrams use stable, traceable node IDs:

```
[Component][SequentialNumber]:[Type][Name]

Components:
  START  — Server startup
  TOOL   — MCP tool execution
  MEM    — Memory operations
  TASK   — Task coordination
  LOCK   — Soft lock operations
  PLUGIN — Plugin system
  BROWSER— Browser automation
  ERR    — Error handling

Types:
  Entry    — Starting point
  Process  — Processing step
  Decision — Branching point (diamond)
  Output   — Result/return
  Error    — Error handling path
  External — External service call
```

---

## Startup Flow

### MCP Server Startup

```mermaid
flowchart TD
    START1:Entry[mcp-server.js] --> START2:Process[Load Environment]
    START2:Process --> START3:Process[Resolve Project Identity]
    START3:Process --> START4:Process[Start Internal HTTP Server]
    START4:Process --> START5:Decision{Server Ready?}
    START5:Decision -->|YES| START6:Process[Initialize Connection Resolver]
    START5:Decision -->|NO| START5a:Error[Startup Failed]
    START6:Process --> START7:Process[Set Up stdio readline]
    START7:Process --> START8:Output[Ready for MCP Requests]

    style START1:Entry fill:#4CAF50,color:#fff
    style START8:Output fill:#2196F3,color:#fff
    style START5a:Error fill:#f44336,color:#fff
```

**Node ID → Source:**

- `START1:Entry` → `mcp-server.js:1`
- `START2:Process` → `mcp-server.js:23-26`
- `START3:Process` → `mcp-server.js:38-41`
- `START4:Process` → `mcp-server.js:58`
- `START5:Decision` → `startMemoryServer.js:6-23`
- `START6:Process` → `mcp-server.js:59-64`
- `START7:Process` → `mcp-server.js:32-36`
- `START8:Output` → `mcp-server.js:ready state`

### HTTP API Server Startup

```mermaid
flowchart TD
    START1:Entry[server.js] --> START2:Process[Load Environment]
    START2:Process --> START3:Process[Initialize SQLite Database]
    START3:Process --> START4:Decision{DB Ready?}
    START4:Decision -->|YES| START5:Process[Initialize Plugin Manager]
    START4:Decision -->|NO| START4a:Error[DB Init Failed]
    START5:Process --> START6:Process[Register Express Middleware]
    START6:Process --> START7:Process[Register API Routes]
    START7:Process --> START8:Process[Start Listening]
    START8:Process --> START9:Output[Server Healthy]

    style START1:Entry fill:#4CAF50,color:#fff
    style START9:Output fill:#2196F3,color:#fff
    style START4a:Error fill:#f44336,color:#fff
```

**Node ID → Source:**

- `START1:Entry` → `server.js:1`
- `START3:Process` → `server.js:5` (import initializeDatabase)
- `START4:Decision` → `server.js` (DB initialization check)
- `START5:Process` → `core/plugin/plugin-manager.js:17`
- `START6:Process` → `server.js` (middleware registration)
- `START7:Process` → `server.js` (route registration)
- `START8:Process` → `server.js` (listen call)

---

## Tool Execution Flow

```mermaid
flowchart TD
    TOOL1:Entry[MCP Request on stdin] --> TOOL2:Process[Parse JSON-RPC]
    TOOL2:Process --> TOOL3:Decision{Tool Exists?}
    TOOL3:Decision -->|NO| TOOL3a:Error[Tool Not Found]
    TOOL3:Decision -->|YES| TOOL4:Decision{Circuit Breaker Open?}
    TOOL4:Decision -->|YES| TOOL4a:Error[Circuit Open]
    TOOL4:Decision -->|NO| TOOL5:Process[Validate Argument Size]
    TOOL5:Process --> TOOL6:Decision{Size OK?}
    TOOL6:Decision -->|NO| TOOL6a:Error[Payload Too Large]
    TOOL6:Decision -->|YES| TOOL7:Process[Sanitize Agent IDs]
    TOOL7:Process --> TOOL8:External[HTTP to Internal Server]
    TOOL8:External --> TOOL9:Process[Route to Domain Service]
    TOOL9:Process --> TOOL10:Process[Execute Business Logic]
    TOOL10:Process --> TOOL11:External[SQLite Query]
    TOOL11:External --> TOOL12:Process[Format Response]
    TOOL12:Process --> TOOL13:Output[MCP Response on stdout]

    style TOOL1:Entry fill:#4CAF50,color:#fff
    style TOOL13:Output fill:#2196F3,color:#fff
    style TOOL3a:Error fill:#f44336,color:#fff
    style TOOL4a:Error fill:#f44336,color:#fff
    style TOOL6a:Error fill:#f44336,color:#fff
```

**Node ID → Source:**

- `TOOL1:Entry` → `mcp-server.js` (readline handler)
- `TOOL2:Process` → `mcp-server.js` (JSON.parse)
- `TOOL3:Decision` → `src/core/mcp/tool-registry.js:27` (hasTool)
- `TOOL4:Decision` → `mcp-server.js:99-108` (circuit state)
- `TOOL5:Process` → `mcp-server.js:75-76` (RELIABILITY config)
- `TOOL7:Process` → `mcp-server.js:96-97` (AGENT_ID validation)
- `TOOL8:External` → `mcp-server.js` (HTTP fetch to server.js)
- `TOOL9:Process` → `src/core/mcp/tool-executor.js:14` (execute)
- `TOOL11:External` → `src/core/database/sqlite/index.js`

---

## Memory Flow

```mermaid
flowchart TD
    MEM1:Entry[Memory Request] --> MEM2:Process[Validate Input]
    MEM2:Process --> MEM3:Decision{Operation Type?}
    MEM3:Decision -->|CREATE| MEM4:Process[Generate UUID]
    MEM3:Decision -->|SEARCH| MEM5:Process[Build Query Filters]
    MEM3:Decision -->|UPDATE| MEM6:Process[Check Version Conflict]
    MEM3:Decision -->|DELETE| MEM7:Process[Soft Delete]

    MEM4:Process --> MEM8:External[Insert into contexts]
    MEM5:Process --> MEM9:Process[Apply Scope Filter]
    MEM9:Process --> MEM10:Process[Apply Text Search FTS5]
    MEM10:Process --> MEM11:External[Query contexts]

    MEM6:Decision -->|CONFLICT| MEM6a:Error[Version Conflict]
    MEM6:Decision -->|OK| MEM12:Process[Increment Version]
    MEM12:Process --> MEM13:External[Update contexts]
    MEM13:External --> MEM14:External[Insert context_versions]

    MEM7:Process --> MEM15:External[Set lifecycle=archived]

    MEM8:External --> MEM16:Process[Record Activity]
    MEM11:External --> MEM16:Process
    MEM14:External --> MEM16:Process
    MEM15:External --> MEM16:Process

    MEM16:Process --> MEM17:Output[Return Result]

    style MEM1:Entry fill:#4CAF50,color:#fff
    style MEM17:Output fill:#2196F3,color:#fff
    style MEM6a:Error fill:#f44336,color:#fff
```

**Node ID → Source:**

- `MEM1:Entry` → `utils/memoryEngine.js`
- `MEM2:Process` → `utils/security-validators.js` (validateInput)
- `MEM4:Process` → `utils/memoryEngine.js` (uuid generation)
- `MEM5:Process` → `src/domains/memory/memory.service.js:31` (searchContexts)
- `MEM6:Decision` → `utils/memoryEngine.js` (detectAndResolveMemoryConflicts)
- `MEM8:External` → `src/core/database/sqlite/collection.js` (insertOne)
- `MEM10:Process` → `src/core/database/sqlite/query-builder.js` (FTS5)
- `MEM12:Process` → `utils/memoryEngine.js` (updateContextWithVersioning)
- `MEM16:Process` → `utils/activityTracker.js` (recordActivity)

---

## Task Flow

```mermaid
flowchart TD
    TASK1:Entry[Task Request] --> TASK2:Process[Validate Input]
    TASK2:Process --> TASK3:Decision{Operation?}
    TASK3:Decision -->|CREATE| TASK4:Process[Create Task PENDING]
    TASK3:Decision -->|FETCH| TASK5:Process[Apply Filters]
    TASK3:Decision -->|ASSIGN| TASK6:Process[Claim/Assign Agent]
    TASK3:Decision -->|UPDATE| TASK7:Process[Update Status]

    TASK4:Process --> TASK8:Process[Check Dependencies]
    TASK8:Decision -->|DEPS MET| TASK9:Process[Auto-Assign]
    TASK8:Decision -->|DEPS UNMET| TASK10:Process[Keep PENDING]
    TASK9:Process --> TASK11:External[Insert into tasks]

    TASK6:Process --> TASK12:Decision{Already Assigned?}
    TASK12:Decision -->|YES| TASK12a:Error[Conflict]
    TASK12:Decision -->|NO| TASK13:External[Update tasks]

    TASK7:Process --> TASK14:Decision{New Status?}
    TASK14:Decision -->|COMPLETED| TASK15:Process[Check Dependent Tasks]
    TASK14:Decision -->|BLOCKED| TASK16:Process[Record Blocker]
    TASK14:Decision -->|IN_PROGRESS| TASK17:External[Update tasks]

    TASK15:Process --> TASK18:Process[Unlock Dependent Tasks]

    TASK11:External --> TASK19:Process[Record Activity]
    TASK13:External --> TASK19:Process
    TASK17:External --> TASK19:Process

    TASK19:Process --> TASK20:Output[Return Result]

    style TASK1:Entry fill:#4CAF50,color:#fff
    style TASK20:Output fill:#2196F3,color:#fff
    style TASK12a:Error fill:#f44336,color:#fff
```

**Node ID → Source:**

- `TASK1:Entry` → `utils/coordinationEngine.js`
- `TASK4:Process` → `src/domains/task/task.service.js`
- `TASK8:Process` → `utils/coordinationEngine.js` (buildTaskSchedule)
- `TASK9:Process` → `utils/coordinationEngine.js` (autoAssignTask)
- `TASK12:Decision` → `utils/coordinationEngine.js` (assignment check)
- `TASK14:Decision` → `src/domains/task/task.service.js` (status transition)
- `TASK15:Process` → `utils/coordinationEngine.js` (dependency resolution)

---

## Lock Flow

```mermaid
flowchart TD
    LOCK1:Entry[Lock Request] --> LOCK2:Process[Validate Resource]
    LOCK2:Process --> LOCK3:Decision{Lock Exists?}
    LOCK3:Decision -->|NO| LOCK4:Process[Acquire Lock with TTL]
    LOCK3:Decision -->|YES| LOCK5:Decision{Same Agent?}
    LOCK5:Decision -->|YES| LOCK6:Process[Refresh TTL]
    LOCK5:Decision -->|NO| LOCK7:Decision{TTL Expired?}
    LOCK7:Decision -->|YES| LOCK8:Process[Force Acquire]
    LOCK7:Decision -->|NO| LOCK9:Output[Warn: Locked by Other]

    LOCK4:Process --> LOCK10:External[Insert resource_locks]
    LOCK6:Process --> LOCK11:External[Update resource_locks]
    LOCK8:Process --> LOCK12:External[Replace resource_locks]

    LOCK10:External --> LOCK13:Process[Start Expiry Timer]
    LOCK11:External --> LOCK13:Process
    LOCK12:External --> LOCK13:Process

    LOCK13:Process --> LOCK14:Output[Lock Acquired]

    style LOCK1:Entry fill:#4CAF50,color:#fff
    style LOCK14:Output fill:#2196F3,color:#fff
    style LOCK9:Output fill:#FF9800,color:#fff
```

**Node ID → Source:**

- `LOCK1:Entry` → `utils/collaborationEngine.js`
- `LOCK3:Decision` → `utils/collaborationEngine.js` (listResourceLocks check)
- `LOCK4:Process` → `utils/collaborationEngine.js` (acquireResourceLock)
- `LOCK5:Decision` → `utils/collaborationEngine.js` (agent comparison)
- `LOCK7:Decision` → `utils/collaborationEngine.js` (TTL check)
- `LOCK13:Process` → `utils/collaborationEngine.js` (cleanupExpiredLocks timer)

---

## Plugin Flow

```mermaid
flowchart TD
    PLUGIN1:Entry[PluginManager.initialize] --> PLUGIN2:Process[Read Plugin List]
    PLUGIN2:Process --> PLUGIN3:Process[For Each Plugin]
    PLUGIN3:Process --> PLUGIN4:Decision{Plugin Name?}
    PLUGIN4:Decision -->|redis| PLUGIN5:External[Import redis-adapter]
    PLUGIN4:Decision -->|browser| PLUGIN6:External[Import browser-controller]
    PLUGIN4:Decision -->|knowledgeBase| PLUGIN7:External[Import knowledge-store]
    PLUGIN4:Decision -->|emulator| PLUGIN8:External[Import emulator-plugin]
    PLUGIN4:Decision -->|unknown| PLUGIN9:Error[Unknown Plugin]

    PLUGIN5:External --> PLUGIN10:Decision{"initialize() success?"}
    PLUGIN6:External --> PLUGIN10:Decision
    PLUGIN7:External --> PLUGIN10:Decision
    PLUGIN8:External --> PLUGIN10:Decision

    PLUGIN10:Decision -->|SUCCESS| PLUGIN11:Process[Register Plugin]
    PLUGIN10:Decision -->|FAIL| PLUGIN12:Error[Log Error, Continue]

    PLUGIN11:Process --> PLUGIN13:Process[Run INIT Hooks]
    PLUGIN13:Process --> PLUGIN14:Output[Plugins Ready]

    style PLUGIN1:Entry fill:#4CAF50,color:#fff
    style PLUGIN14:Output fill:#2196F3,color:#fff
    style PLUGIN9:Error fill:#f44336,color:#fff
    style PLUGIN12:Error fill:#FF9800,color:#fff
```

**Node ID → Source:**

- `PLUGIN1:Entry` → `core/plugin/plugin-manager.js:17`
- `PLUGIN2:Process` → `core/plugin/plugin-manager.js:22` (getPluginList)
- `PLUGIN4:Decision` → `core/plugin/plugin-manager.js:42-57` (switch)
- `PLUGIN5-8:External` → `core/plugin/plugin-manager.js:44-55` (dynamic imports)
- `PLUGIN10:Decision` → `core/plugin/plugin-manager.js:62-63` (initialize check)
- `PLUGIN11:Process` → `core/plugin/plugin-manager.js:66-68` (register)
- `PLUGIN13:Process` → `core/plugin/plugin-manager.js:28` (\_runHook INIT)

---

## Browser Automation Flow

```mermaid
flowchart TD
    BROWSER1:Entry[Browser Tool Request] --> BROWSER2:Decision{Action?}
    BROWSER2:Decision -->|open_browser| BROWSER3:Process[Launch Playwright]
    BROWSER2:Decision -->|navigate| BROWSER4:Process[Goto URL]
    BROWSER2:Decision -->|click| BROWSER5:Process[Click Element]
    BROWSER2:Decision -->|fill| BROWSER6:Process[Fill Input]
    BROWSER2:Decision -->|screenshot| BROWSER7:Process[Capture Screenshot]
    BROWSER2:Decision -->|evaluate| BROWSER8:Process[Execute JavaScript]
    BROWSER2:Decision -->|close| BROWSER9:Process[Close Browser]

    BROWSER3:Process --> BROWSER10:Output[Session ID]
    BROWSER4:Process --> BROWSER11:Process[Wait for Load]
    BROWSER5:Process --> BROWSER12:Process[Find Selector]
    BROWSER6:Process --> BROWSER13:Process[Type Text]
    BROWSER7:Process --> BROWSER14:Output[Image Data]
    BROWSER8:Process --> BROWSER15:Output[JS Result]
    BROWSER9:Process --> BROWSER16:Output[Closed]

    BROWSER11:Process --> BROWSER17:Output[Page Loaded]
    BROWSER12:Process --> BROWSER18:Output[Element Clicked]
    BROWSER13:Process --> BROWSER19:Output[Input Filled]

    style BROWSER1:Entry fill:#4CAF50,color:#fff
    style BROWSER10:Output fill:#2196F3,color:#fff
    style BROWSER14:Output fill:#2196F3,color:#fff
    style BROWSER15:Output fill:#2196F3,color:#fff
    style BROWSER16:Output fill:#2196F3,color:#fff
```

**Node ID → Source:**

- `BROWSER1:Entry` → `tools/browserTools.js`
- `BROWSER3:Process` → `tools/browserTools.js` (open_browser handler)
- `BROWSER4:Process` → `tools/browserTools.js` (navigate_to_url handler)
- `BROWSER5:Process` → `tools/browserTools.js` (click_element handler)
- `BROWSER7:Process` → `tools/browserTools.js` (take_screenshot handler)
- `BROWSER8:Process` → `tools/browserTools.js` (evaluate_javascript handler)

---

## Reference Maintenance Log

### 2026-09-19

**Change:** Initial diagrams creation

**Classification:** ADDED

**Updated:**

- Created 7 Mermaid diagrams with stable node IDs
- Documented node ID → source code traceability
- All diagrams follow `[Component][Seq]:[Type][Name]` convention

**Verification:** FULL

---

_All diagrams use stable node IDs traceable to source code. Update when execution flows change._
