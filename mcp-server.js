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

const CONFIG = {
  agent: process.env.MCP_AGENT || "unknown",
  project: process.env.MCP_PROJECT || "default-project",
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
