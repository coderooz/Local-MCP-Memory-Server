#!/usr/bin/env node

import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { startMemoryServer } from "./startMemoryServer.js";
import { GLOBAL_AGENT_INSTRUCTION } from "./agent-instruction.js";
import { resolveProjectIdentity } from "./utils/projectIdentity.js";

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

const { projectRoot, derivedProject } = resolveProjectIdentity(
  process.cwd(),
  process.env
);

if (!process.env.MCP_PROJECT_ROOT) {
  process.env.MCP_PROJECT_ROOT = projectRoot;
}

const CONFIG = {
  agent: process.env.MCP_AGENT || "unknown",
  project: process.env.MCP_PROJECT || derivedProject || "default-project",
  scope: process.env.MCP_SCOPE || "project",
  projectRoot,
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

function buildEndpoint(pathname, params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
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
      description: "Create a task in the current project so agents can coordinate ownership and progress.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assigned_to: {
            type: "string",
            description: "Optional agent ID to assign immediately"
          },
          priority: {
            type: "number",
            description: "Task priority from 1-5"
          },
          dependencies: {
            type: "array",
            items: { type: "string" },
            description: "Task IDs that must be completed first"
          },
          status: {
            type: "string",
            description: "Initial task status"
          }
        },
        required: ["title"]
      }
    },
    {
      name: "assign_task",
      description: "Assign or claim a task so agents do not compete for the same work.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to claim or assign"
          },
          agent_id: {
            type: "string",
            description: "Optional target agent ID. Defaults to the current agent."
          }
        },
        required: ["task_id"]
      }
    },
    {
      name: "update_task",
      description: "Update task status, ownership, blockers, or completion details.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to update"
          },
          title: { type: "string" },
          description: { type: "string" },
          assigned_to: { type: "string" },
          status: {
            type: "string",
            description: "pending, in_progress, blocked, or completed"
          },
          priority: { type: "number" },
          dependencies: {
            type: "array",
            items: { type: "string" }
          },
          result: {
            type: "string",
            description: "Completion summary or handoff result"
          },
          blocker: {
            type: "string",
            description: "Reason the task is blocked"
          }
        },
        required: ["task_id"]
      }
    },
    {
      name: "send_message",
      description: "Send message between agents",
      inputSchema: {
        type: "object",
        properties: {
          to_agent: { type: "string" },
          content: { type: "string" },
          type: {
            type: "string",
            description: "info, warning, handoff, or status"
          },
          related_task: {
            type: "string",
            description: "Optional related task ID"
          }
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
      description: "Fetch project-scoped tasks with optional filters for ownership and status.",
      inputSchema: {
        type: "object",
        properties: {
          assigned_only: {
            type: "boolean",
            description: "If true, fetch only tasks assigned to current agent"
          },
          assigned_to: {
            type: "string",
            description: "Fetch tasks assigned to a specific agent"
          },
          created_by: {
            type: "string",
            description: "Fetch tasks created by a specific agent"
          },
          status: {
            type: "string",
            description: "Filter by task status"
          },
          include_completed: {
            type: "boolean",
            description: "Include completed tasks. Defaults to true."
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return"
          }
        }
      }
    },
    {
      name: "request_messages",
      description: "Fetch messages for the current agent",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of messages to return"
          }
        }
      }
    },
    {
      name: "create_project_map",
      description: "Store a structured project-map entry so agents can reuse codebase understanding.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Relative file or module path. Use . for project-root summaries."
          },
          type: {
            type: "string",
            description: "Entry type such as file, folder, module, service, or project"
          },
          summary: {
            type: "string",
            description: "Short explanation of what this path or module is responsible for"
          },
          dependencies: {
            type: "array",
            items: { type: "string" }
          },
          exports: {
            type: "array",
            items: { type: "string" }
          },
          key_details: {
            type: "array",
            items: { type: "string" },
            description: "Important architectural details, constraints, or conventions"
          },
          related_tasks: {
            type: "array",
            items: { type: "string" },
            description: "Task IDs related to this map entry"
          },
          relationships: {
            type: "object",
            properties: {
              parent: { type: "string" },
              children: {
                type: "array",
                items: { type: "string" }
              }
            }
          },
          tags: {
            type: "array",
            items: { type: "string" }
          },
          metadata: {
            type: "object",
            description: "Extra structured details to preserve with the entry"
          }
        },
        required: ["file_path", "type", "summary"]
      }
    },
    {
      name: "fetch_project_map",
      description: "Fetch structured project-map entries for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Fetch a specific file or module path"
          },
          type: {
            type: "string",
            description: "Filter by project-map entry type"
          },
          query: {
            type: "string",
            description: "Text search across summary and structural details"
          },
          limit: {
            type: "number",
            description: "Maximum number of entries to return"
          }
        }
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
            project: CONFIG.project,
            created_by: args.created_by || CONFIG.agent
          })
        });

        return respond(request.id, {
          content: [{ type: "text", text: `Task created: ${data.task.task_id}` }]
        });
      }

      if (name === "assign_task") {
        const data = await callMemoryApi("/task/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: args.task_id,
            agent_id: args.agent_id || CONFIG.agent
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? `Task assigned: ${args.task_id}`
                : data.error || "Task assignment failed"
            }
          ]
        });
      }

      if (name === "update_task") {
        const data = await callMemoryApi("/task/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: args.task_id,
            updates: {
              title: args.title,
              description: args.description,
              assigned_to: args.assigned_to,
              status: args.status,
              priority: args.priority,
              dependencies: args.dependencies,
              result: args.result,
              blocker: args.blocker
            }
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? JSON.stringify(data.task, null, 2)
                : data.error || "Task update failed"
            }
          ]
        });
      }

      if (name === "fetch_tasks") {
        const data = await callMemoryApi(
          buildEndpoint("/task/list", {
            project: CONFIG.project,
            assigned_to: args.assigned_only ? CONFIG.agent : args.assigned_to,
            created_by: args.created_by,
            status: args.status,
            include_completed: args.include_completed,
            limit: args.limit
          })
        );

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        });
      }

      if (name === "send_message") {
        await callMemoryApi("/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_agent: CONFIG.agent,
            project: CONFIG.project,
            ...args
          })
        });

        return respond(request.id, {
          content: [{ type: "text", text: "Message sent" }]
        });
      }

      if (name === "request_messages") {
        const data = await callMemoryApi(
          buildEndpoint(`/message/${CONFIG.agent}`, {
            project: CONFIG.project,
            limit: args.limit
          })
        );

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        });
      }

      if (name === "create_project_map") {
        const data = await callMemoryApi("/project-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...args,
            agent: CONFIG.agent,
            project: CONFIG.project,
            scope: CONFIG.scope
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? `Project map stored\nPath: ${data.entry.file_path}`
                : data.error || "Project map storage failed"
            }
          ]
        });
      }

      if (name === "fetch_project_map") {
        const data = await callMemoryApi(
          buildEndpoint("/project-map", {
            project: CONFIG.project,
            file_path: args.file_path,
            type: args.type,
            query: args.query,
            limit: args.limit
          })
        );

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
