#!/usr/bin/env node

import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { startMemoryServer } from "./startMemoryServer.js";
import { GLOBAL_AGENT_INSTRUCTION } from "./agent-instruction.js";
import { resolveProjectIdentity } from "./utils/projectIdentity.js";
import * as browserTools from "./tools/browserTools.js";

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

function unwrapBrowserToolData(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Browser tool returned an invalid response");
  }
  if (!result.success) {
    throw new Error(result.error || "Browser tool failed");
  }
  return result.data || {};
}

const BROWSER_TOOL_NAMES = new Set([
  "open_browser",
  "close_browser",
  "navigate_to_url",
  "get_page_content",
  "click_element",
  "fill_input",
  "get_element_text",
  "evaluate_javascript",
  "take_screenshot",
  "wait_for_selector",
  "get_page_title",
  "get_current_url",
  "reload_page",
  "go_back",
  "go_forward",
  "get_elements",
  "set_viewport",
  "clear_cookies",
  "get_cookies",
  "set_cookies"
]);

const browserRequestQueues = new Map();

function getRequestQueueKey(request) {
  if (request?.method !== "tools/call") {
    return null;
  }

  const { name, arguments: args = {} } = request.params || {};
  if (!BROWSER_TOOL_NAMES.has(name)) {
    return null;
  }

  if (name === "close_browser" && !args.sessionId) {
    return "__browser_global__";
  }

  return args.sessionId ? `browser:${args.sessionId}` : "__browser_global__";
}

function enqueueBrowserRequest(queueKey, task) {
  const previous = browserRequestQueues.get(queueKey) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);

  browserRequestQueues.set(queueKey, next);

  return next.finally(() => {
    if (browserRequestQueues.get(queueKey) === next) {
      browserRequestQueues.delete(queueKey);
    }
  });
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
          },
          type: {
            type: "string",
            description: "Optional memory type such as general, project, note, or architecture"
          },
          summary: {
            type: "string",
            description: "Optional short summary for search and conflict detection"
          },
          importance: {
            type: "number",
            description: "Optional importance score from 1-5"
          },
          tags: {
            type: "array",
            items: { type: "string" }
          },
          metadata: {
            type: "object",
            description: "Optional structured metadata"
          },
          relatedContexts: {
            type: "array",
            items: { type: "string" }
          },
          relatedTasks: {
            type: "array",
            items: { type: "string" }
          },
          relatedIssues: {
            type: "array",
            items: { type: "string" }
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
          },
          limit: {
            type: "number",
            description: "Maximum number of entries to return"
          },
          lifecycle: {
            type: "string",
            description: "Optional lifecycle filter such as active or archived"
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
          },
          required_capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Capabilities required for auto-assignment"
          },
          relatedContexts: {
            type: "array",
            items: { type: "string" }
          },
          relatedIssues: {
            type: "array",
            items: { type: "string" }
          },
          expectedUpdatedAt: {
            type: "string",
            description: "Optional optimistic-concurrency timestamp"
          },
          expectedVersion: {
            type: "number",
            description: "Optional optimistic-concurrency version"
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
          required_capabilities: {
            type: "array",
            items: { type: "string" }
          },
          relatedContexts: {
            type: "array",
            items: { type: "string" }
          },
          relatedIssues: {
            type: "array",
            items: { type: "string" }
          },
          expectedUpdatedAt: {
            type: "string",
            description: "Optional optimistic-concurrency timestamp"
          },
          expectedVersion: {
            type: "number",
            description: "Optional optimistic-concurrency version"
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
          },
          agent_id: {
            type: "string",
            description: "Optional stable identifier for the agent"
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
          },
          expectedUpdatedAt: {
            type: "string",
            description: "Optional optimistic-concurrency timestamp"
          },
          expectedVersion: {
            type: "number",
            description: "Optional optimistic-concurrency version"
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
    },
    {
      name: "record_activity",
      description: "Append a live activity entry for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string" },
          message: { type: "string" },
          related_task: { type: "string" },
          resource: { type: "string" },
          metadata: { type: "object" }
        },
        required: ["message"]
      }
    },
    {
      name: "fetch_activity",
      description: "Fetch the live project activity stream.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string" },
          type: { type: "string" },
          related_task: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "acquire_resource_lock",
      description: "Acquire a soft lock for a file, module, task, or other shared resource.",
      inputSchema: {
        type: "object",
        properties: {
          resource: { type: "string" },
          expiresInMs: { type: "number" },
          metadata: { type: "object" }
        },
        required: ["resource"]
      }
    },
    {
      name: "release_resource_lock",
      description: "Release a soft lock previously acquired by the current agent.",
      inputSchema: {
        type: "object",
        properties: {
          resource: { type: "string" }
        },
        required: ["resource"]
      }
    },
    {
      name: "fetch_resource_locks",
      description: "Fetch active soft locks for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          resource: { type: "string" }
        }
      }
    },
    {
      name: "set_project_descriptor",
      description: "Store or update the current project's structured descriptor.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
          tech_stack: {
            type: "array",
            items: { type: "string" }
          },
          goals: {
            type: "array",
            items: { type: "string" }
          },
          constraints: {
            type: "array",
            items: { type: "string" }
          },
          rules: {
            type: "array",
            items: { type: "string" }
          },
          tags: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["name", "category", "description"]
      }
    },
    {
      name: "get_project_descriptor",
      description: "Fetch the current project's descriptor.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "update_context",
      description: "Update a memory entry with version tracking and lifecycle support.",
      inputSchema: {
        type: "object",
        properties: {
          context_id: { type: "string" },
          reason: { type: "string" },
          expectedUpdatedAt: {
            type: "string",
            description: "Optional optimistic-concurrency timestamp"
          },
          expectedVersion: {
            type: "number",
            description: "Optional optimistic-concurrency version"
          },
          updates: {
            type: "object",
            description: "Fields to update on the stored context"
          }
        },
        required: ["context_id", "updates"]
      }
    },
    {
      name: "get_connected_context",
      description: "Retrieve a context together with related memory, tasks, issues, actions, and versions.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" }
        },
        required: ["id"]
      }
    },
    {
      name: "optimize_memory",
      description: "Run the memory optimization engine for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" }
        }
      }
    },
    {
      name: "create_issue",
      description: "Create a project issue or note linked to memory and tasks.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string" },
          relatedContexts: {
            type: "array",
            items: { type: "string" }
          },
          relatedTasks: {
            type: "array",
            items: { type: "string" }
          },
          relatedIssues: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["title", "type"]
      }
    },
    {
      name: "resolve_issue",
      description: "Resolve an existing issue entry.",
      inputSchema: {
        type: "object",
        properties: {
          issue_id: { type: "string" },
          resolution: { type: "string" },
          expectedUpdatedAt: {
            type: "string",
            description: "Optional optimistic-concurrency timestamp"
          },
          expectedVersion: {
            type: "number",
            description: "Optional optimistic-concurrency version"
          }
        },
        required: ["issue_id"]
      }
    },
    {
      name: "fetch_issues",
      description: "Fetch issues for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          type: { type: "string" },
          related_task: { type: "string" },
          related_context: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "heartbeat_agent",
      description: "Send an agent heartbeat so registry status stays fresh.",
      inputSchema: {
        type: "object",
        properties: {
          current_task: { type: "string" },
          status: { type: "string" }
        }
      }
    },
    {
      name: "fetch_metrics",
      description: "Fetch recorded task and memory metrics for the current project.",
      inputSchema: {
        type: "object",
        properties: {
          metric_type: { type: "string" },
          name: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "open_browser",
      description: "Initialize and open the browser for automation.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "close_browser",
      description: "Close the browser and clean up resources.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "navigate_to_url",
      description: "Navigate to a specific URL.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          url: { type: "string", description: "The URL to navigate to" },
          waitUntil: { type: "string", description: "When to consider navigation complete (load, domcontentloaded, networkidle)" }
        },
        required: ["sessionId", "url"]
      }
    },
    {
      name: "get_page_content",
      description: "Get the current page content as text or HTML.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          format: { type: "string", enum: ["text", "html"], description: "Output format" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "click_element",
      description: "Click an element on the page by CSS selector.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          selector: { type: "string", description: "CSS selector for the element" },
          timeout: { type: "number", description: "Timeout in milliseconds" }
        },
        required: ["sessionId", "selector"]
      }
    },
    {
      name: "fill_input",
      description: "Fill an input field with a value.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          selector: { type: "string", description: "CSS selector for the input" },
          value: { type: "string", description: "Value to fill" },
          clear: { type: "boolean", description: "Clear before filling" }
        },
        required: ["sessionId", "selector", "value"]
      }
    },
    {
      name: "get_element_text",
      description: "Get text content of an element.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          selector: { type: "string", description: "CSS selector" }
        },
        required: ["sessionId", "selector"]
      }
    },
    {
      name: "evaluate_javascript",
      description: "Execute JavaScript in the browser context.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          script: { type: "string", description: "JavaScript code to execute" }
        },
        required: ["sessionId", "script"]
      }
    },
    {
      name: "take_screenshot",
      description: "Take a screenshot of the current page.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          path: { type: "string", description: "Optional file path to save screenshot" },
          fullPage: { type: "boolean", description: "Capture full page" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "wait_for_selector",
      description: "Wait for an element to appear or disappear.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          selector: { type: "string", description: "CSS selector" },
          state: { type: "string", enum: ["visible", "hidden", "attached", "detached"] },
          timeout: { type: "number", description: "Timeout in ms" }
        },
        required: ["sessionId", "selector"]
      }
    },
    {
      name: "get_page_title",
      description: "Get the current page title.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "get_current_url",
      description: "Get the current page URL.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "reload_page",
      description: "Reload the current page.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          waitUntil: { type: "string", description: "When to consider navigation complete" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "go_back",
      description: "Navigate back in browser history.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "go_forward",
      description: "Navigate forward in browser history.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "wait_for_timeout",
      description: "Wait for a specified duration.",
      inputSchema: {
        type: "object",
        properties: {
          ms: { type: "number", description: "Milliseconds to wait" }
        },
        required: ["ms"]
      }
    },
    {
      name: "get_elements",
      description: "Get all elements matching a selector.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          selector: { type: "string", description: "CSS selector" }
        },
        required: ["sessionId", "selector"]
      }
    },
    {
      name: "set_viewport",
      description: "Set the browser viewport size.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          width: { type: "number", description: "Viewport width" },
          height: { type: "number", description: "Viewport height" }
        },
        required: ["sessionId", "width", "height"]
      }
    },
    {
      name: "clear_cookies",
      description: "Clear all browser cookies.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "get_cookies",
      description: "Get all browser cookies.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" }
        },
        required: ["sessionId"]
      }
    },
    {
      name: "set_cookies",
      description: "Set browser cookies.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID from open_browser" },
          cookies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                value: { type: "string" },
                domain: { type: "string" },
                path: { type: "string" }
              }
            }
          }
        },
        required: ["sessionId", "cookies"]
      }
    }
  ];
}

rl.on("line", (line) => {
  let request;

  try {
    request = JSON.parse(line);
  } catch (error) {
    void logMCPError(error, { rawInput: line });
    return;
  }

  const run = async () => {
    try {
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
            version: "2.3.0",
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

      if (name === "heartbeat_agent") {
        const data = await callMemoryApi("/agent/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: args.agent_id || CONFIG.agent,
            current_task: args.current_task,
            status: args.status
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Heartbeat stored for ${data.agent.agent_id} (${data.agent.status})`
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
            created_by: args.created_by || CONFIG.agent,
            required_capabilities: args.required_capabilities,
            relatedContexts: args.relatedContexts,
            relatedIssues: args.relatedIssues,
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Task created: ${data.task.task_id}\nPriority Score: ${data.task.priorityScore}\nAssigned To: ${data.task.assigned_to || "unassigned"}${data.warnings?.length ? `\nWarnings: ${data.warnings.join(" | ")}` : ""}`
            }
          ]
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
              required_capabilities: args.required_capabilities,
              relatedContexts: args.relatedContexts,
              relatedIssues: args.relatedIssues,
              result: args.result,
              blocker: args.blocker
            },
            agent: CONFIG.agent,
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
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
            scope: CONFIG.scope,
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? `Project map stored\nPath: ${data.entry.file_path}${data.warnings?.length ? `\nWarnings: ${data.warnings.join(" | ")}` : ""}`
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

      if (name === "record_activity") {
        const data = await callMemoryApi("/activity", {
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
              text: `Activity recorded: ${data.activity.activity_id}`
            }
          ]
        });
      }

      if (name === "fetch_activity") {
        const data = await callMemoryApi(
          buildEndpoint("/activity", {
            project: CONFIG.project,
            agent: args.agent,
            type: args.type,
            related_task: args.related_task,
            limit: args.limit
          })
        );

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "acquire_resource_lock") {
        const data = await callMemoryApi("/lock/acquire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource: args.resource,
            expiresInMs: args.expiresInMs,
            metadata: args.metadata,
            agent: CONFIG.agent,
            project: CONFIG.project
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.acquired
                ? `Lock acquired: ${args.resource}`
                : `Lock not acquired: ${args.resource}\nWarnings: ${(data.warnings || []).join(" | ")}`
            }
          ]
        });
      }

      if (name === "release_resource_lock") {
        const data = await callMemoryApi("/lock/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource: args.resource,
            agent: CONFIG.agent,
            project: CONFIG.project
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.released
                ? `Lock released: ${args.resource}`
                : `No lock released: ${args.resource}`
            }
          ]
        });
      }

      if (name === "fetch_resource_locks") {
        const data = await callMemoryApi(
          buildEndpoint("/lock/list", {
            project: CONFIG.project,
            resource: args.resource
          })
        );

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "set_project_descriptor") {
        const data = await callMemoryApi("/project/descriptor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...args,
            agent: CONFIG.agent,
            project: CONFIG.project,
            scope: "project",
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `Project descriptor stored\nID: ${data.context.id}${data.warnings?.length ? `\nWarnings: ${data.warnings.join(" | ")}` : ""}`
            }
          ]
        });
      }

      if (name === "get_project_descriptor") {
        const data = await callMemoryApi(
          buildEndpoint("/project/descriptor", {
            project: CONFIG.project
          })
        );

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "update_context") {
        const data = await callMemoryApi("/context/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context_id: args.context_id,
            reason: args.reason,
            updates: args.updates,
            agent: CONFIG.agent,
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? `Context updated\nID: ${data.context.id}\nVersion: ${data.context.version}${data.warnings?.length ? `\nWarnings: ${data.warnings.join(" | ")}` : ""}`
                : data.error || "Context update failed"
            }
          ]
        });
      }

      if (name === "get_connected_context") {
        const data = await callMemoryApi(`/context/${args.id}/connected`);

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "optimize_memory") {
        const data = await callMemoryApi("/memory/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: CONFIG.project,
            agent: CONFIG.agent,
            limit: args.limit
          })
        });

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data.summary, null, 2) }]
        });
      }

      if (name === "create_issue") {
        const data = await callMemoryApi("/issue", {
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
              text: `Issue created: ${data.issue.issue_id}${data.warnings?.length ? `\nWarnings: ${data.warnings.join(" | ")}` : ""}`
            }
          ]
        });
      }

      if (name === "resolve_issue") {
        const data = await callMemoryApi("/issue/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issue_id: args.issue_id,
            resolution: args.resolution,
            resolvedBy: CONFIG.agent,
            agent: CONFIG.agent,
            expectedUpdatedAt: args.expectedUpdatedAt,
            expectedVersion: args.expectedVersion
          })
        });

        return respond(request.id, {
          content: [
            {
              type: "text",
              text: data.success
                ? `Issue resolved: ${data.issue.issue_id}`
                : data.error || "Issue resolution failed"
            }
          ]
        });
      }

      if (name === "fetch_issues") {
        const data = await callMemoryApi(
          buildEndpoint("/issue/list", {
            project: CONFIG.project,
            status: args.status,
            type: args.type,
            related_task: args.related_task,
            related_context: args.related_context,
            limit: args.limit
          })
        );

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        });
      }

      if (name === "fetch_metrics") {
        const data = await callMemoryApi(
          buildEndpoint("/metrics", {
            project: CONFIG.project,
            metric_type: args.metric_type,
            name: args.name,
            limit: args.limit
          })
        );

        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
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
            content: args.content,
            type: args.type,
            summary: args.summary,
            importance: args.importance,
            tags: args.tags,
            metadata: args.metadata,
            relatedContexts: args.relatedContexts,
            relatedTasks: args.relatedTasks,
            relatedIssues: args.relatedIssues
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
            query: args.query,
            limit: args.limit,
            lifecycle: args.lifecycle
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

      if (name === "open_browser") {
        const data = unwrapBrowserToolData(
          await browserTools.openBrowser({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [
            {
              type: "text",
              text: `${data.message}\nSession ID: ${data.sessionId}`
            }
          ]
        });
      }

      if (name === "close_browser") {
        const data = unwrapBrowserToolData(
          await browserTools.closeBrowser({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: data.message }]
        });
      }

      if (name === "navigate_to_url") {
        const data = unwrapBrowserToolData(
          await browserTools.navigateToUrl({
            sessionId: args.sessionId,
            url: args.url,
            waitUntil: args.waitUntil
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Navigated to: ${data.url}\nTitle: ${data.title}\nStatus: ${data.status}` }]
        });
      }

      if (name === "get_page_content") {
        const data = unwrapBrowserToolData(
          await browserTools.getPageContent({
            sessionId: args.sessionId,
            format: args.format || "text"
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: (data.content || "").substring(0, 10000) }]
        });
      }

      if (name === "click_element") {
        const data = unwrapBrowserToolData(
          await browserTools.clickElement({
            sessionId: args.sessionId,
            selector: args.selector,
            timeout: args.timeout
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Clicked: ${data.selector}` }]
        });
      }

      if (name === "fill_input") {
        const data = unwrapBrowserToolData(
          await browserTools.fillInput({
            sessionId: args.sessionId,
            selector: args.selector,
            value: args.value,
            clear: args.clear
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Filled ${data.selector} with: ${data.value}` }]
        });
      }

      if (name === "get_element_text") {
        const data = unwrapBrowserToolData(
          await browserTools.getElementText({
            sessionId: args.sessionId,
            selector: args.selector
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: data.text || "" }]
        });
      }

      if (name === "evaluate_javascript") {
        const data = unwrapBrowserToolData(
          await browserTools.evaluateJavaScript({
            sessionId: args.sessionId,
            script: args.script
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data.result, null, 2) }]
        });
      }

      if (name === "take_screenshot") {
        const data = unwrapBrowserToolData(
          await browserTools.takeScreenshot({
            sessionId: args.sessionId,
            path: args.path,
            fullPage: args.fullPage
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Screenshot taken (${data.screenshot.length} bytes, base64)` }]
        });
      }

      if (name === "wait_for_selector") {
        const data = unwrapBrowserToolData(
          await browserTools.waitForSelector({
            sessionId: args.sessionId,
            selector: args.selector,
            state: args.state,
            timeout: args.timeout
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Selector ${data.selector} is ${data.state}` }]
        });
      }

      if (name === "get_page_title") {
        const data = unwrapBrowserToolData(
          await browserTools.getPageTitle({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: data.title }]
        });
      }

      if (name === "get_current_url") {
        const data = unwrapBrowserToolData(
          await browserTools.getCurrentUrl({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: data.url }]
        });
      }

      if (name === "reload_page") {
        const data = unwrapBrowserToolData(
          await browserTools.reloadPage({
            sessionId: args.sessionId,
            waitUntil: args.waitUntil
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Reloaded: ${data.url}\nTitle: ${data.title}` }]
        });
      }

      if (name === "go_back") {
        const data = unwrapBrowserToolData(
          await browserTools.goBack({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Back to: ${data.url}\nTitle: ${data.title}` }]
        });
      }

      if (name === "go_forward") {
        const data = unwrapBrowserToolData(
          await browserTools.goForward({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Forward to: ${data.url}\nTitle: ${data.title}` }]
        });
      }

      if (name === "wait_for_timeout") {
        const data = unwrapBrowserToolData(
          await browserTools.waitForTimeout({ ms: args.ms })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Waited ${data.waited}ms` }]
        });
      }

      if (name === "get_elements") {
        const data = unwrapBrowserToolData(
          await browserTools.getElements({
            sessionId: args.sessionId,
            selector: args.selector
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data.elements, null, 2) }]
        });
      }

      if (name === "set_viewport") {
        const data = unwrapBrowserToolData(
          await browserTools.setViewport({
            sessionId: args.sessionId,
            width: args.width,
            height: args.height
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Viewport set to ${data.width}x${data.height}` }]
        });
      }

      if (name === "clear_cookies") {
        unwrapBrowserToolData(
          await browserTools.clearCookies({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: "Cookies cleared" }]
        });
      }

      if (name === "get_cookies") {
        const data = unwrapBrowserToolData(
          await browserTools.getCookies({ sessionId: args.sessionId })
        );
        return respond(request.id, {
          content: [{ type: "text", text: JSON.stringify(data.cookies, null, 2) }]
        });
      }

      if (name === "set_cookies") {
        const data = unwrapBrowserToolData(
          await browserTools.setCookies({
            sessionId: args.sessionId,
            cookies: args.cookies
          })
        );
        return respond(request.id, {
          content: [{ type: "text", text: `Set ${data.count} cookies` }]
        });
      }

      return respondError(request.id, -32601, `Unknown tool: ${name}`);
    }
    } catch (error) {
      await logMCPError(error, { rawInput: line });

      if (request && Object.prototype.hasOwnProperty.call(request, "id")) {
        return respondError(request.id, -32603, error.message || "Internal error");
      }
    }
  };

  const queueKey = getRequestQueueKey(request);
  if (queueKey) {
    void enqueueBrowserRequest(queueKey, run);
    return;
  }

  void run();
});
