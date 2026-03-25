
- `agent_instruction.js`

```js
export const GLOBAL_AGENT_INSTRUCTION = `
You are an AI engineering agent operating within a multi-agent system using MCP (Model Context Protocol) with persistent memory.

Your role:
→ Produce correct, maintainable, system-aware solutions  
→ Coordinate with system state (tasks, messages, memory)  
→ Contribute reusable knowledge to shared memory  

Treat this instruction as a strict execution contract.

========================
CORE RULES
========================
- Prioritize correctness over speed
- Never hallucinate APIs, tools, or system behavior
- If uncertain → explicitly say so
- Ask for clarification when needed
- Do not act on incomplete or conflicting information

========================
SYSTEM REALITY (MCP)
========================
- Memory is persistent (MongoDB-backed)
- Shared across agents, sessions, and projects
- Agent/project/scope are injected automatically
- store_context accepts ONLY: { content }
- search_context returns ranked text results
- get_full_context returns structured JSON
- get_logs is ONLY for backend debugging

Do NOT assume hidden fields or capabilities.

========================
EXECUTION MODES
========================

SIMPLE MODE:
- trivial, isolated queries  
→ respond directly  
→ skip tools unless useful  

SYSTEM MODE:
- multi-step, coding, debugging, coordination  
→ MUST follow full workflow  

========================
SYSTEM WORKFLOW (MANDATORY)
========================

1. Memory
→ search_context if context may affect outcome  

2. Tasks
→ fetch_tasks  
→ avoid duplication  

3. Messages
→ request_messages  
→ check coordination  

4. Decision
→ system state > memory > user request  

5. Action
→ execute OR create OR route task  

6. Communication
→ send_message if needed  

7. Persistence
→ store_context (if reusable)  
→ log_action (if meaningful change)  

Do NOT skip steps in SYSTEM MODE.

========================
MEMORY RULES
========================

Search BEFORE acting when:
- task is non-trivial  
- system/history matters  

Store ONLY:
- decisions
- constraints
- bugs + fixes
- reusable patterns  

Do NOT store:
- trivial conversation
- temporary reasoning
- unverified ideas  

Write memory as:

Type: decision | bug | pattern | constraint  
Title: short  
Context: where  
Details: what  
Why: reasoning  
Impact: future behavior  

========================
MEMORY PRIORITIZATION
========================

Prefer:
1. Relevance  
2. Recency  
3. Importance  
4. Usage frequency  

If conflict:
→ identify explicitly  
→ do NOT guess  
→ ask user if needed  

Do NOT reuse stale memory blindly.

========================
TOOL USAGE
========================

MANDATORY (system mode):
- search_context → before decisions  
- fetch_tasks → before acting  
- request_messages → before execution  

TOOLS:

search_context  
→ retrieve decisions/patterns  

store_context  
→ store reusable knowledge only  

log_action  
→ record meaningful changes  

get_full_context  
→ inspect specific memory  

start_session  
→ mark long tasks  

get_logs  
→ backend debugging only  

create_task / fetch_tasks  
→ system work tracking  

send_message / request_messages  
→ agent coordination  

register_agent / list_agents  
→ agent identity + discovery  

Rules:
- Do not use tools blindly  
- Do not skip when system state matters  

========================
MULTI-AGENT SYSTEM
========================

- You are NOT the only agent  
- Tasks may already exist  
- Respect ownership  
- Avoid duplicate work  

Always check:
→ tasks  
→ messages  
→ assignments  

Communicate explicitly.

========================
TASK RULES
========================

Create task if:
- multi-step  
- system impact  
- coordination required  

Do NOT create tasks for trivial work.

Task lifecycle:
pending → in_progress → completed / blocked  

Never leave tasks ambiguous.

========================
ROLE SYSTEM
========================

Roles:

planner → defines tasks  
executor → implements  
reviewer → validates  
observer → analyzes  

Priority:
planner > reviewer > executor > observer  

Do NOT violate role unless system is blocked.

========================
FAILURE HANDLING
========================

If:
- tool fails  
- memory unclear  
- system inconsistent  

→ STOP  
→ retry OR fallback to:
   - memory
   - system reasoning
   - user clarification  

Never assume success.

========================
AMBIGUITY HANDLING
========================

If unclear:
- ask targeted questions  
- present options + tradeoffs  

Do NOT assume missing logic.

========================
CODE RULES
========================

- Write production-quality code  
- Follow project patterns  
- Prefer modular, maintainable design  
- Avoid unnecessary complexity  

For large work:
→ break into steps  

========================
DOCUMENTATION
========================

For important code:
- purpose  
- params  
- return  
- example  

Keep concise and useful.

========================
STRICT PROHIBITIONS
========================

- No hallucinated APIs or tools  
- No silent assumptions  
- No low-value memory storage  
- No ignoring system state  
- No duplicate work  

========================
GOAL
========================

Act as a coordinated system node that:

- uses memory intelligently  
- avoids duplication  
- produces reliable code  
- improves shared knowledge over time 
`;
```

- `logger.js`

```js
import { v4 as uuidv4 } from "uuid";

import { ContextModel, normalizeMemory } from "./mcp.model.js";

let dbInstance = null;

export function initLogger(db) {
  dbInstance = db;
}

async function logToDB(log) {
  if (!dbInstance) {
    return;
  }

  try {
    await dbInstance.collection("logs").insertOne({
      id: uuidv4(),
      ...log,
      createdAt: new Date()
    });
  } catch {}
}

export async function logError(error, context = {}) {
  await logToDB({
    type: "error",
    message: error.message,
    stack: error.stack,
    context
  });

  if (!dbInstance) {
    return;
  }

  try {
    const memory = new ContextModel({
      agent: context.agent || "system",
      project: context.project || "global",
      scope: "global",
      type: "error",
      content: error.message,
      metadata: context,
      tags: ["error", "debug"]
    });

    await dbInstance.collection("contexts").insertOne(normalizeMemory(memory));
  } catch (err) {
    process.stderr.write("Logger error: " + err.message + "\n");
  }
}

export async function logInfo(message, context = {}) {
  await logToDB({
    type: "info",
    message,
    context
  });
}
```

- `mcp-server.js`

```js
#!/usr/bin/env node

import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { startMemoryServer } from "./startMemoryServer.js";
import { GLOBAL_AGENT_INSTRUCTION } from "./agent-instruction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const fallbackProject = path.basename(process.cwd());

const CONFIG = {
  agent: process.env.MCP_AGENT || "unknown",
  project: process.env.MCP_PROJECT || fallbackProject || "default-project",
  scope: process.env.MCP_SCOPE || "project",
  serverUrl:
    process.env.MCP_SERVER_URL ||
    `http://localhost:${process.env.PORT || 4000}`
};

const memoryServerReady = startMemoryServer();

async function logMCPError(error, context = {}) {
  try {
    await fetch(`${CONFIG.serverUrl}/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "error",
        message: error.message,
        stack: error.stack,
        context: {
          ...context,
          agent: CONFIG.agent,
          project: CONFIG.project
        }
      })
    });
  } catch {}
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function waitForServer(url, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error("Memory server not reachable");
}

async function callMemoryApi(endpoint, options = {}) {
  await memoryServerReady;
  await waitForServer(CONFIG.serverUrl);

  const response = await fetch(`${CONFIG.serverUrl}${endpoint}`, options);
  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.error || `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload;
}

function respond(id, result) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result
    }) + "\n"
  );
}

function respondError(id, code, message) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    }) + "\n"
  );
}

function getTools() {
  return [
    {
      name: "store_context",
      description: "Store persistent memory such as architecture decisions, rules, or notes.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The memory content to store"
          }
        },
        required: ["content"]
      }
    },
    {
      name: "search_context",
      description: "Search stored memory using a query string.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find relevant memory"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "log_action",
      description: "Log an action such as a code change or fix for traceability.",
      inputSchema: {
        type: "object",
        properties: {
          actionType: {
            type: "string",
            description: "Type of action (e.g., create, update, fix)"
          },
          target: {
            type: "string",
            description: "Target of the action (file, API, component)"
          },
          summary: {
            type: "string",
            description: "Short summary of what changed"
          },
          contextRefs: {
            type: "array",
            items: { type: "string" },
            description: "Related context IDs"
          }
        },
        required: ["actionType", "target", "summary"]
      }
    },
    {
      name: "get_full_context",
      description: "Retrieve a context along with all related actions.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Context ID"
          }
        },
        required: ["id"]
      }
    },
    {
      name: "start_session",
      description: "Start a new working session for tracking agent activity.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Session status (active, paused, completed)"
          }
        },
        required: ["status"]
      }
    },
    {
      name: "get_agent_instructions",
      description: "Retrieve the global system instruction for agent behavior.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "get_logs",
      description: "Retrieve system logs (errors, info, debug)",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Filter by log type (error, info)"
          },
          limit: {
            type: "number",
            description: "Number of logs to return"
          }
        }
      }
    },
    {
      name: "list_agents",
      description: "List all registered agents",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "create_task",
      description: "Create a task",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" }
        },
        required: ["title"]
      }
    },
    {
      name: "send_message",
      description: "Send message between agents",
      inputSchema: {
        type: "object",
        properties: {
          to_agent: { type: "string" },
          content: { type: "string" }
        },
        required: ["content"]
      }
    },
    {
      name: "register_agent",
      description: "Register a new agent in the system",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          capabilities: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["name"]
      }
    },
    {
      name: "fetch_tasks",
      description: "Fetch all tasks or tasks assigned to this agent",
      inputSchema: {
        type: "object",
        properties: {
          assigned_only: {
            type: "boolean",
            description: "If true, fetch only tasks assigned to current agent"
          }
        }
      }
    },
    {
      name: "request_messages",
      description: "Fetch messages for the current agent",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ];
}

rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);

    if (request.method === "initialize") {
      await memoryServerReady;

      return respond(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "mcp-memory-server",
          version: "1.0.0",
          description: "Persistent multi-agent memory system for AI agents",
          author: "Ranit Saha (Coderooz)"
        },
        instructions: GLOBAL_AGENT_INSTRUCTION,
        
      });
    }

    if (request.method === "ping") {
      return respond(request.id, {});
    }

    if (request.method === "tools/list") {
      return respond(request.id, {
        tools: getTools()
      });
    }

    if (request.method === "tools/call") {
      const { name, arguments: args = {} } = request.params || {};

      if (name === "list_agents") {
        const data = await callMemoryApi("/agent/list");

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "register_agent") {
        const data = await callMemoryApi("/agent/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...args,
            agent: CONFIG.agent,
            project: CONFIG.project
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Agent registered: ${data.agent.agent_id}`
            }
          ]
        });
      }

      if (name === "create_task") {
        const data = await callMemoryApi("/task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...args,
            agent: CONFIG.agent,
            project: CONFIG.project
          })
        });

        return respond(request.id, {
          content: [{ type: "text", text: `Task created: ${data.task.task_id}` }]
        });
      }

      if (name === "fetch_tasks") {
        const data = await callMemoryApi("/task/list");

        let tasks = data;

        if (args.assigned_only) {
          tasks = tasks.filter(
            (t) => t.assigned_to === CONFIG.agent
          );
        }

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(tasks, null, 2)
            }
          ]
        });
      }

      if (name === "send_message") {
        const data = await callMemoryApi("/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_agent: CONFIG.agent,
            ...args
          })
        });

        return respond(request.id, {
          content: [{ type: "text", text: "Message sent" }]
        });
      }

      if (name === "request_messages") {
        const data = await callMemoryApi(`/message/${CONFIG.agent}`);

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        });
      }

      if (name === "store_context") {
        const data = await callMemoryApi("/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            scope: CONFIG.scope,
            content: args.content
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Stored memory\nID: ${data.context.id}`
            }
          ]
        });
      }

      if (name === "search_context") {
        const data = await callMemoryApi("/context/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            query: args.query
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.length
                ? data.map((entry) => `- ${entry.content}`).join("\n")
                : "No memory found."
            }
          ]
        });
      }

      if (name === "log_action") {
        const data = await callMemoryApi("/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            actionType: args.actionType,
            target: args.target,
            summary: args.summary,
            contextRefs: args.contextRefs || []
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Action logged\nID: ${data.action.id}`
            }
          ]
        });
      }

      if (name === "get_full_context") {
        const data = await callMemoryApi(`/context/${args.id}/full`);

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        });
      }

      if (name === "start_session") {
        const data = await callMemoryApi("/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            status: args.status
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Session started\nID: ${data.session.sessionId}`
            }
          ]
        });
      }

      if (name === "get_agent_instructions") {
        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  version: "1.0.0",
                  lastUpdated: new Date().toISOString(),
                  instruction: GLOBAL_AGENT_INSTRUCTION
                },
                null,
                2
              )
            }
          ]
        });
      }

      if (name === "get_logs") {
        const { type, limit = 20 } = args;
        const query = type ? { type } : {};

        const data = await callMemoryApi("/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.length
                ? data.map((log) => `[${log.type}] ${log.message}`).join("\n")
                : "No logs found"
            }
          ]
        });
      }

      return respondError(request.id, -32601, `Unknown tool: ${name}`);
    }
  } catch (error) {
    await logMCPError(error, { rawInput: line });

    try {
      const request = JSON.parse(line);

      if (request && Object.prototype.hasOwnProperty.call(request, "id")) {
        return respondError(request.id, -32603, error.message || "Internal error");
      }
    } catch {}
  }
});
```

- `mcp-shim.js`

```js
#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hasMarker(directory) {
  const markers = [
    ".git",
    ".roo",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    ".venv"
  ];

  return markers.some((marker) => fs.existsSync(path.join(directory, marker)));
}

function findProjectRoot(startDirectory) {
  let current = path.resolve(startDirectory);

  while (true) {
    if (hasMarker(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDirectory);
    }

    current = parent;
  }
}

function slugifyProjectName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default-project";
}

const projectRoot = findProjectRoot(process.cwd());
const derivedProject = slugifyProjectName(path.basename(projectRoot));

if (!process.env.MCP_PROJECT) {
  process.env.MCP_PROJECT = derivedProject;
}

if (!process.env.MCP_SCOPE) {
  process.env.MCP_SCOPE = "project";
}

const child = spawn(
  process.execPath,
  [path.join(__dirname, "mcp-server.js")],
  {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  }
);

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

process.stdin.on("error", () => {});
child.stdin.on("error", () => {});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Failed to start MCP shim child process:", error);
  process.exit(1);
});
```

- `mcp.model.js`

```js
import { v4 as uuidv4 } from "uuid";

export const MEMORY_SCOPE = {
  PRIVATE: "private",
  PROJECT: "project",
  GLOBAL: "global"
};

export class BaseModel {
  constructor(data = {}) {
    this.id = data.id || uuidv4();

    this.agent = data.agent || "unknown";
    this.project = data.project || "default";
    this.sessionId = data.sessionId || null;

    this.scope = data.scope || MEMORY_SCOPE.PRIVATE;

    this.createdAt = data.createdAt || new Date();
    this.updatedAt = new Date();

    this.tags = data.tags || [];
    this.metadata = data.metadata || {};

    this.version = data.version || 1;
  }
}

export class ContextModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.type = data.type || "general";
    this.content = data.content || "";
    this.summary = data.summary || null;

    this.embedding = data.embedding || null;

    this.relatedContexts = data.relatedContexts || [];
    this.relatedActions = data.relatedActions || [];

    this.importance = data.importance ?? 3;
    this.accessCount = data.accessCount || 0;
    this.lastAccessedAt = data.lastAccessedAt || null;
  }
}

export class ActionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.actionType = data.actionType || "unknown";
    this.target = data.target || null;

    this.before = data.before || null;
    this.after = data.after || null;
    this.diff = data.diff || null;

    this.summary = data.summary || null;

    this.contextRefs = data.contextRefs || [];

    this.outcome = data.outcome || {
      success: true,
      error: null
    };
  }
}

export class SessionModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.sessionId = data.sessionId || uuidv4();
    this.status = data.status || "active";

    this.startedAt = data.startedAt || new Date();
    this.endedAt = data.endedAt || null;

    this.contextIds = data.contextIds || [];
    this.actionIds = data.actionIds || [];
  }
}


export class AgentModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.agent_id = data.agent_id || this.id;
    this.name = data.name || "Unnamed Agent";
    this.role = data.role || "worker";

    this.capabilities = data.capabilities || [];
    this.status = data.status || "idle"; // active | idle | offline

    this.current_task = data.current_task || null;
    this.last_seen = new Date();
  }
}

export class TaskModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.task_id = data.task_id || this.id;

    this.title = data.title || "";
    this.description = data.description || "";

    this.assigned_to = data.assigned_to || null;
    this.created_by = data.created_by || "system";

    this.status = data.status || "pending"; 
    // pending | in_progress | blocked | completed

    this.priority = data.priority || 3;
    this.dependencies = data.dependencies || [];
  }
}

export class MessageModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.message_id = data.message_id || this.id;

    this.from_agent = data.from_agent || "system";
    this.to_agent = data.to_agent || null;

    this.type = data.type || "info"; 
    // info | warning | handoff | status

    this.content = data.content || "";
    this.related_task = data.related_task || null;
  }
}

export class ProjectMapModel extends BaseModel {
  constructor(data = {}) {
    super(data);

    this.file_path = data.file_path || "";
    this.type = data.type || "unknown";

    this.summary = data.summary || "";

    this.dependencies = data.dependencies || [];
    this.exports = data.exports || [];

    this.relationships = data.relationships || {
      parent: null,
      children: []
    };
  }
}

export class MemoryQueryBuilder {
  static build({ agent, project, query, scope = "project", includeGlobal = true } = {}) {
    const conditions = [];

    if (agent) {
      conditions.push({ agent, scope: MEMORY_SCOPE.PRIVATE });
    }

    if (project && (scope === "project" || scope === "global")) {
      conditions.push({ project, scope: MEMORY_SCOPE.PROJECT });
    }

    if (includeGlobal) {
      conditions.push({ scope: MEMORY_SCOPE.GLOBAL });
    }

    const filters = [];

    if (conditions.length) {
      filters.push({ $or: conditions });
    }

    if (query?.trim()) {
      filters.push({ $text: { $search: query.trim() } });
    }

    if (!filters.length) {
      return {};
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return { $and: filters };
  }
}

export function normalizeMemory(memory) {
  return {
    ...JSON.parse(JSON.stringify(memory)),
    importance: memory.importance ?? 3,
    accessCount: memory.accessCount || 0,
    lastAccessedAt: memory.lastAccessedAt || null,
    createdAt: memory.createdAt || new Date(),
    updatedAt: new Date()
  };
}
```

- `package.json`

```json
{
  "name": "local-mcp-memory",
  "version": "1.1.0",
  "description": "Persistent multi-agent memory server using MCP protocol",
  "main": "mcp-server.js",
  "scripts": {
    "start": "node mcp-server.js",
    "start:api": "node server.js",
    "check": "node --check mcp-server.js && node --check mcp-shim.js && node --check server.js && node --check startMemoryServer.js && node --check mcp.model.js && node --check logger.js && node --check agent-instruction.js",
    "test": "npm run check"
  },
  "type": "module",
  "keywords": [],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/coderooz/Local-MCP-Memory-Server"
  },
  "dependencies": {
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "mongodb": "^7.1.0",
    "uuid": "^13.0.0"
  }
}
```

- `server.js`

```js
#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

import { initLogger, logError, logInfo } from "./logger.js";
import {
  ActionModel,
  ContextModel,
  MemoryQueryBuilder,
  SessionModel,
  normalizeMemory,
  AgentModel,
  TaskModel,
  MessageModel,
  ProjectMapModel
} from "./mcp.model.js";

import { routeHandler } from "./utils/routeHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

const DB_NAME = process.env.MONGO_DB_NAME || "mcp_memory";
const DEFAULT_PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(express.json());

let client = null;
let db = null;
let server = null;
let startupPromise = null;

// ========================
// DB HELPER
// ========================
function getDb() {
  if (!db) throw new Error("Database not ready");
  return db;
}


async function ensureIndexes(database) {
  await Promise.all([
    database.collection("contexts").createIndex({ id: 1 }, { unique: true }),
    database.collection("contexts").createIndex({
      content: "text",
      summary: "text",
      tags: "text"
    }),
    database.collection("actions").createIndex({ id: 1 }, { unique: true }),
    database.collection("actions").createIndex({ contextRefs: 1 }),
    database.collection("sessions").createIndex({ sessionId: 1 }, { unique: true }),
    database.collection("logs").createIndex({ createdAt: -1 }),

    database.collection("agents").createIndex({ agent_id: 1 }, { unique: true }),
    database.collection("tasks").createIndex({ task_id: 1 }, { unique: true }),
    database.collection("messages").createIndex({ message_id: 1 }, { unique: true }),
    database.collection("messages").createIndex({ to_agent: 1 }),
    database.collection("project_map").createIndex({ file_path: 1 })
  ]);
}

function rankSearchResults(results, query) {
  const now = new Date();
  const words = query.toLowerCase().split(" ").filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || "";

      const matches = words.filter((w) => content.includes(w)).length;
      score += matches * 2;

      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt)) / 3600000;
      score += Math.max(0, 5 - ageHours / 24);

      score += Math.log((item.accessCount || 0) + 1);

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ========================
// ROUTES
// ========================

app.post(
  "/context",
  routeHandler("contexts", async ({ req, collection }) => {
    const context = new ContextModel(req.body);
    await collection.insertOne(normalizeMemory(context));

    await logInfo("Context stored", {
      agent: context.agent,
      project: context.project
    });

    return { success: true, context };
  })
);

app.post(
  "/context/search",
  routeHandler("contexts", async ({ req, collection }) => {
    const { agent, project, query = "", limit = 10 } = req.body;

    const baseQuery = MemoryQueryBuilder.build({ agent, project, query });

    let results = await collection.find(baseQuery).limit(50).toArray();

    const ranked = rankSearchResults(results, query).slice(0, limit);

    const ids = ranked.map((r) => r.id);

    if (ids.length) {
      await collection.updateMany(
        { id: { $in: ids } },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );
    }

    return ranked;
  })
);

app.get(
  "/context/:id/full",
  routeHandler("contexts", async ({ req, db }) => {
    const context = await db
      .collection("contexts")
      .findOne({ id: req.params.id });

    if (!context) {
      return { error: "Context not found" };
    }

    const actions = await db
      .collection("actions")
      .find({ contextRefs: context.id })
      .toArray();

    return { context, actions };
  })
);

// ========================
// ACTIONS / SESSION
// ========================
app.post(
  "/action",
  routeHandler("actions", async ({ req, collection }) => {
    const action = new ActionModel(req.body);
    await collection.insertOne(normalizeMemory(action));

    return { success: true, action };
  })
);

app.post(
  "/session",
  routeHandler("sessions", async ({ req, collection }) => {
    const session = new SessionModel(req.body);
    await collection.insertOne(normalizeMemory(session));

    return { success: true, session };
  })
);

// ========================
// LOGS
// ========================
app.post(
  "/logs",
  routeHandler("logs", async ({ req, collection }) => {
    const { query = {}, limit = 20 } = req.body;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  })
);

app.post("/log", async (req, res) => {
  try {
    const { type, message, context } = req.body;

    if (type === "error") {
      await logError(new Error(message), context);
    } else {
      await logInfo(message, context);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// AGENTS
// ========================
app.post(
  "/agent/register",
  routeHandler("agents", async ({ req, collection }) => {
    const agent = new AgentModel(req.body);

    await collection.updateOne(
      { agent_id: agent.agent_id },
      { $set: normalizeMemory(agent) },
      { upsert: true }
    );

    return { success: true, agent };
  })
);

app.get(
  "/agent/list",
  routeHandler("agents", async ({ collection }) => {
    return collection.find().limit(50).toArray();
  })
);

// ========================
// TASKS
// ========================
app.post(
  "/task",
  routeHandler("tasks", async ({ req, collection }) => {
    const task = new TaskModel(req.body);
    await collection.insertOne(normalizeMemory(task));

    return { success: true, task };
  })
);

app.post(
  "/task/assign",
  routeHandler("tasks", async ({ req, collection }) => {
    const { task_id, agent_id } = req.body;

    if (!task_id || !agent_id) {
      return { error: "Missing task_id or agent_id" };
    }

    await collection.updateOne(
      { task_id },
      { $set: { assigned_to: agent_id, status: "in_progress" } }
    );

    return { success: true };
  })
);

app.get(
  "/task/list",
  routeHandler("tasks", async ({ collection }) => {
    return collection.find().limit(50).toArray();
  })
);


// messages

app.post("/message", async (req, res) => {
  const message = new MessageModel(req.body);

  await getDb().collection("messages").insertOne(normalizeMemory(message));

  res.json({ success: true, message });
});

app.get("/message/:agent_id", async (req, res) => {
  const messages = await getDb()
    .collection("messages")
    .find({
      $or: [
        { to_agent: req.params.agent_id },
        { to_agent: null }
      ]
    })
    .toArray();

  res.json(messages);
});

// ========================
// PROJECT MAP
// ========================
app.post(
  "/project-map",
  routeHandler("project_map", async ({ req, collection }) => {
    const entry = new ProjectMapModel(req.body);

    await collection.insertOne(normalizeMemory(entry));

    return { success: true, entry };
  })
);

app.get(
  "/project-map",
  routeHandler("project_map", async ({ collection }) => {
    return collection.find().limit(100).toArray();
  })
);


// ========================
// ROOT
// ========================
app.get("/", (_req, res) => {
  res.send("MCP Memory Server Running");
});

// ========================
// SERVER START
// ========================
export async function startServer({ port = DEFAULT_PORT, silent = false } = {}) {
  if (server) return { app, db: getDb(), server, port };

  if (!startupPromise) {
    startupPromise = (async () => {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();

      db = client.db(DB_NAME);
      initLogger(db);

      await ensureIndexes(db);

      // 🔥 attach globals for routeHandler
      app.locals.db = db;
      app.locals.logError = logError;

      await logInfo("MongoDB connected", { dbName: DB_NAME });

      server = await new Promise((resolve, reject) => {
        const listener = app.listen(port, () => resolve(listener));
        listener.on("error", reject);
      });

      if (!silent) {
        console.log(`MCP Server running on port ${port}`);
      }

      return { app, db, server, port };
    })().catch(async (error) => {
      startupPromise = null;
      db = null;
      server = null;

      if (client) await client.close();

      throw error;
    });
  }

  return startupPromise;
}

// ========================
// STOP SERVER
// ========================
export async function stopServer() {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (client) await client.close();

  client = null;
  db = null;
  server = null;
  startupPromise = null;
}

// ========================
// AUTO START
// ========================
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error("Failed to start MCP Server:", error);
    process.exit(1);
  });
}
```

- `start-mcp.bat`

```bat
@echo off
cd /d C:\Code_Works\HTML_CSS_JS\workProjects\website\local-mcp-memory
start "" node mcp-server.js

```

- `startMemoryServer.js`
```js
import { startServer } from "./server.js";

let startupPromise = null;

export function startMemoryServer() {
  if (!startupPromise) {
    startupPromise = startServer({ silent: true }).catch((error) => {
      startupPromise = null;
      throw error;
    });
  }

  return startupPromise;
}
```
