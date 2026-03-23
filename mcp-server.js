#!/usr/bin/env node

const readline = require("readline");

// Node 18+ has global fetch. If not, install node-fetch and uncomment:
// const fetch = require("node-fetch");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

/**
 * 🔧 CONFIG (ENV-DRIVEN)
 */
const CONFIG = {
  agent: process.env.MCP_AGENT || "roo-architect",
  project: process.env.MCP_PROJECT || "default-project",
  scope: process.env.MCP_SCOPE || "project",
  serverUrl: process.env.MCP_SERVER_URL || "http://localhost:4000"
};

/**
 * ❌ NEVER log to stdout
 * ✅ Safe logging via API
 */
async function logMCPError(error, context = {}) {
  try {
    await fetch(`${CONFIG.serverUrl}/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "mcp_error",
        message: error.message,
        stack: error.stack,
        context
      })
    });
  } catch {}
}

/**
 * ✅ MCP Response Helper
 */
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

/**
 * 🔁 Handle MCP Requests
 */
rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);

    /**
     * 🔌 INITIALIZE
     */
    if (request.method === "initialize") {
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
          author: "Coderooz",
        }
      });
    }

    /**
     * 🫀 PING
     */
    if (request.method === "ping") {
      return respond(request.id, {});
    }

    /**
     * 📦 LIST TOOLS
     */
    if (request.method === "tools/list") {
      return respond(request.id, {
        tools: [
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
                id: { type: "string", description: "Context ID" },
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
                status: { type: "string", description: "Session status (active, paused, completed)" },
              },
              required: ["status"]
            }
          }
        ]
      });
    }

    /**
     * ⚡ TOOL EXECUTION
     */
    if (request.method === "tools/call") {
      const { name, arguments: args = {} } = request.params || {};

      /**
       * 🧠 STORE CONTEXT
       */
      if (name === "store_context") {
        const res = await fetch(`${CONFIG.serverUrl}/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            scope: CONFIG.scope,
            content: args.content
          })
        });

        const data = await res.json();

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `✅ Stored memory\nID: ${data.context.id}`
            }
          ]
        });
      }

      /**
       * 🔍 SEARCH CONTEXT
       */
      if (name === "search_context") {
        const res = await fetch(`${CONFIG.serverUrl}/context/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            query: args.query
          })
        });

        const data = await res.json();

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.length
                ? data.map(d => `• ${d.content}`).join("\n")
                : "No memory found."
            }
          ]
        });
      }

      /**
       * ⚡ LOG ACTION
       */
      if (name === "log_action") {
        const res = await fetch(`${CONFIG.serverUrl}/action`, {
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

        const data = await res.json();

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `⚡ Action logged\nID: ${data.action.id}`
            }
          ]
        });
      }

      /**
       * 📦 GET FULL CONTEXT
       */
      if (name === "get_full_context") {
        const res = await fetch(
          `${CONFIG.serverUrl}/context/${args.id}/full`
        );

        const data = await res.json();

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2)
            }
          ]
        });
      }

      /**
       * 🧭 START SESSION
       */
      if (name === "start_session") {
        const res = await fetch(`${CONFIG.serverUrl}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: CONFIG.agent,
            project: CONFIG.project,
            status: args.status
          })
        });

        const data = await res.json();

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `🧭 Session started\nID: ${data.session.sessionId}`
            }
          ]
        });
      }

      return respondError(request.id, -32601, `Unknown tool: ${name}`);
    }
  } catch (err) {
    await logMCPError(err, { rawInput: line });
    try {
      const request = JSON.parse(line);
      if (request && Object.prototype.hasOwnProperty.call(request, "id")) {
        return respondError(request.id, -32603, err.message || "Internal error");
      }
    } catch {}
  }
});
