#!/usr/bin/env node

import readline from "readline";
import path from "path";
import util from "util";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { startMemoryServer } from "./startMemoryServer.js";
import { GLOBAL_AGENT_INSTRUCTION } from "./agent-instruction.js";
import { resolveProjectIdentity } from "./utils/projectIdentity.js";
import * as browserTools from "./tools/browserTools.js";
import { successResponse, errorResponse, toMCPResponse, createMCPContentResponse, STATUS_CODES } from "./shared/utils/responseFormatter.js";
import { setMcpStopped, invalidateRuntime, validatePortWithHealth } from "./core/config/runtime-state.js";
import { getIntegrationTools, handleIntegrationTool } from "./mcp-integration-tools.js";
import { isFeatureEnabled } from "./core/config/project-config-loader.js";
import { getConnectionResolver, RECOVERY_STRATEGY } from "./core/config/connectionResolver.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

console.log = (...args) => {
  process.stderr.write(`${util.format(...args)}\n`);
};

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
  crlfDelay: Infinity
});

const { projectRoot, derivedProject } = resolveProjectIdentity(
  process.cwd(),
  process.env
);

if (!process.env.MCP_PROJECT_ROOT) {
  process.env.MCP_PROJECT_ROOT = projectRoot;
}

if (!process.env.MCP_PROJECT && derivedProject) {
  process.env.MCP_PROJECT = derivedProject;
}

const CONFIG = {
  agent: process.env.MCP_AGENT || "unknown",
  project: process.env.MCP_PROJECT || derivedProject || "default-project",
  scope: process.env.MCP_SCOPE || "project",
  projectRoot
};

const memoryServerReady = startMemoryServer();
const resolver = getConnectionResolver({
  projectName: CONFIG.project,
  projectRoot: CONFIG.projectRoot,
  recoveryStrategy: RECOVERY_STRATEGY.SCAN,
  maxRetries: 5
});

let cachedServerUrl = process.env.MCP_SERVER_URL || null;
let lastServerHealthCheckAt = 0;
let serverHealthProbePromise = null;

const RELIABILITY = {
  timeoutMs: Number(process.env.MCP_HTTP_TIMEOUT_MS || 5000),
  maxSafeRetries: Math.max(0, Number(process.env.MCP_HTTP_SAFE_RETRIES || 2)),
  circuitFailureThreshold: Math.max(1, Number(process.env.MCP_CIRCUIT_FAILURE_THRESHOLD || 5)),
  circuitCooldownMs: Math.max(1000, Number(process.env.MCP_CIRCUIT_COOLDOWN_MS || 10000)),
  maxArgumentStringLength: Math.max(1000, Number(process.env.MCP_MAX_ARGUMENT_STRING_LENGTH || 20000)),
  maxArgumentPayloadBytes: Math.max(2048, Number(process.env.MCP_MAX_ARGUMENT_PAYLOAD_BYTES || 256000)),
  healthCacheMs: Math.max(200, Number(process.env.MCP_HEALTH_CACHE_MS || 1000))
};

const CHAOS = {
  failureRate: Math.max(0, Math.min(1, Number(process.env.MCP_CHAOS_FAILURE_RATE || 0))),
  delayMs: Math.max(0, Number(process.env.MCP_CHAOS_DELAY_MS || 0))
};

const SAFE_RETRY_POST_PATTERNS = [
  /^\/context\/search$/,
  /^\/agent\/list$/,
  /^\/task\/list$/,
  /^\/issue\/list$/,
  /^\/metrics$/,
  /^\/feedback\/list$/,
  /^\/chat\/room\/[^/]+\/messages$/,
  /^\/chat\/room\/list$/
];

const AGENT_ID_FIELD_PATTERN = /(^agent$|agent_id|from_agent|to_agent|assigned_to|created_by)/i;
const AGENT_ID_SAFE_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const circuitState = {
  consecutiveFailures: 0,
  openedUntil: 0
};

class MCPStructuredError extends Error {
  constructor(error, message, details = {}) {
    super(message);
    this.name = "MCPStructuredError";
    this.error = error || "INTERNAL_ERROR";
    this.details = details || {};
  }
}

function toStructuredError(error, fallbackCode = "INTERNAL_ERROR", fallbackMessage = "Internal error") {
  if (error instanceof MCPStructuredError) {
    return {
      error: error.error,
      message: error.message,
      ...(error.details && Object.keys(error.details).length ? { details: error.details } : {})
    };
  }

  if (error && typeof error === "object") {
    if (typeof error.error === "string" && typeof error.message === "string") {
      return {
        error: error.error,
        message: error.message,
        ...(error.details && typeof error.details === "object" ? { details: error.details } : {})
      };
    }

    if (error.name === "AbortError") {
      return {
        error: "TIMEOUT",
        message: "Request exceeded limit",
        details: {
          timeoutMs: RELIABILITY.timeoutMs
        }
      };
    }

    if (typeof error.message === "string" && error.message.trim()) {
      return {
        error: fallbackCode,
        message: error.message
      };
    }
  }

  if (typeof error === "string" && error.trim()) {
    return {
      error: fallbackCode,
      message: error
    };
  }

  return {
    error: fallbackCode,
    message: fallbackMessage
  };
}

function createStructuredError(error, message, details = {}) {
  return new MCPStructuredError(error, message, details);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt, base = 200, max = 3200) {
  return Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), max);
}

function isCircuitOpen() {
  return Date.now() < circuitState.openedUntil;
}

function resetCircuitBreaker() {
  circuitState.consecutiveFailures = 0;
  circuitState.openedUntil = 0;
}

function recordCircuitFailure(details = {}) {
  circuitState.consecutiveFailures += 1;
  if (circuitState.consecutiveFailures >= RELIABILITY.circuitFailureThreshold) {
    circuitState.openedUntil = Date.now() + RELIABILITY.circuitCooldownMs;
    return createStructuredError("CIRCUIT_OPEN", "HTTP backend temporarily unavailable", {
      ...details,
      cooldownMs: RELIABILITY.circuitCooldownMs,
      consecutiveFailures: circuitState.consecutiveFailures
    });
  }

  return null;
}

function isSafeRetryOperation(endpoint, method = "GET") {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return true;
  }

  if (normalizedMethod !== "POST") {
    return false;
  }

  return SAFE_RETRY_POST_PATTERNS.some((pattern) => pattern.test(endpoint));
}

function isRetryableError(structuredError) {
  const code = structuredError?.error;
  return (
    code === "TIMEOUT" ||
    code === "NETWORK_FAILURE" ||
    code === "UPSTREAM_UNAVAILABLE" ||
    code === "SERVER_UNAVAILABLE"
  );
}

function createHttpFailure(status, endpoint, method, payload) {
  const message =
    typeof payload === "string"
      ? payload
      : payload?.message || payload?.error || `Request failed with status ${status}`;
  const error =
    status >= 500
      ? "UPSTREAM_UNAVAILABLE"
      : status === 408 || status === 504
        ? "TIMEOUT"
        : "UPSTREAM_ERROR";

  return createStructuredError(error, message, {
    status,
    endpoint,
    method
  });
}

async function maybeInjectChaosFault(stage, timeoutMs) {
  if (CHAOS.delayMs > 0) {
    if (CHAOS.delayMs > timeoutMs) {
      await sleep(timeoutMs + 5);
      throw createStructuredError("TIMEOUT", "Request exceeded limit", {
        simulated: true,
        stage,
        timeoutMs
      });
    }
    await sleep(CHAOS.delayMs);
  }

  if (CHAOS.failureRate > 0 && Math.random() < CHAOS.failureRate) {
    throw createStructuredError("NETWORK_FAILURE", "Simulated network failure", {
      simulated: true,
      stage
    });
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = RELIABILITY.timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createStructuredError("TIMEOUT", "Request exceeded limit", {
        timeoutMs,
        url
      });
    }
    throw createStructuredError("NETWORK_FAILURE", "Network request failed", {
      url,
      cause: error?.message || "Unknown network error"
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveServerUrl(forceRefresh = false) {
  if (!forceRefresh && cachedServerUrl) {
    try {
      const parsed = new URL(cachedServerUrl);
      const port = Number(parsed.port);
      const validation = await validatePortWithHealth(port, {
        expectedProject: CONFIG.project
      });
      if (validation.valid) {
        return cachedServerUrl;
      }
    } catch {}
  }

  const resolved = await resolver.resolveConnection();
  if (!resolved.success || !resolved.port) {
    throw new Error("MCP runtime not resolved");
  }

  cachedServerUrl = `http://localhost:${resolved.port}`;
  process.env.MCP_SERVER_URL = cachedServerUrl;
  process.env.PORT = String(resolved.port);
  return cachedServerUrl;
}

async function logMCPError(error, context = {}) {
  try {
    const serverUrl = await resolveServerUrl().catch(() => null);
    if (!serverUrl) {
      return;
    }

    await fetchWithTimeout(`${serverUrl}/log`, {
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
    }, RELIABILITY.timeoutMs);
  } catch {}
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function waitForServer(retries = 5) {
  if (cachedServerUrl && Date.now() - lastServerHealthCheckAt < RELIABILITY.healthCacheMs) {
    return cachedServerUrl;
  }

  if (serverHealthProbePromise) {
    return serverHealthProbePromise;
  }

  serverHealthProbePromise = (async () => {
    for (let i = 1; i <= retries; i++) {
      try {
        const serverUrl = await resolveServerUrl(i > 1);
        const healthRes = await fetchWithTimeout(`${serverUrl}/health`, {
          method: "GET",
          headers: { "X-MCP-Health-Check": "true" }
        }, RELIABILITY.timeoutMs);

        if (healthRes.ok || healthRes.status === 429) {
          lastServerHealthCheckAt = Date.now();
          return serverUrl;
        }

        if (i < retries) {
          await sleep(computeBackoffMs(i));
        }
      } catch {
        if (i >= retries) {
          break;
        }
        await sleep(computeBackoffMs(i));
      }
    }

    throw createStructuredError("SERVER_UNAVAILABLE", "Memory server not reachable", {
      retries
    });
  })();

  try {
    return await serverHealthProbePromise;
  } finally {
    serverHealthProbePromise = null;
  }
}

async function callMemoryApi(endpoint, options = {}) {
  await memoryServerReady;
  const method = String(options.method || "GET").toUpperCase();
  const safeRetry = options.safeRetry ?? isSafeRetryOperation(endpoint, method);
  const maxAttempts = safeRetry ? 1 + RELIABILITY.maxSafeRetries : 1;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (isCircuitOpen()) {
        throw createStructuredError("CIRCUIT_OPEN", "HTTP backend temporarily unavailable", {
          endpoint,
          method,
          retryAfterMs: Math.max(0, circuitState.openedUntil - Date.now())
        });
      }

      const serverUrl = await waitForServer();
      await maybeInjectChaosFault("request:start", RELIABILITY.timeoutMs);

      const response = await fetchWithTimeout(`${serverUrl}${endpoint}`, options, RELIABILITY.timeoutMs);
      const payload = await parseResponse(response);

      if (!response.ok) {
        throw createHttpFailure(response.status, endpoint, method, payload);
      }

      if (payload && typeof payload === "object") {
        if (payload.success === false && payload.error) {
          const parsedError =
            typeof payload.error === "string"
              ? { error: "UPSTREAM_ERROR", message: payload.error, details: payload }
              : {
                  error: payload.error.code || payload.error.type || "UPSTREAM_ERROR",
                  message: payload.message || payload.error.message || "Upstream operation failed",
                  details: payload.error.details || payload
                };
          throw createStructuredError(
            parsedError.error,
            parsedError.message,
            parsedError.details || {}
          );
        }

        if (typeof payload.error === "string" && payload.error.trim()) {
          throw createStructuredError("UPSTREAM_ERROR", payload.error, { endpoint, method });
        }
      }

      resetCircuitBreaker();
      return payload;
    } catch (error) {
      const structured = toStructuredError(error, "SERVER_UNAVAILABLE", "Memory server not reachable");
      lastError = structured;

      if (structured.error !== "CIRCUIT_OPEN") {
        const breakerError = recordCircuitFailure({
          endpoint,
          method,
          attempt
        });
        if (breakerError && attempt >= maxAttempts) {
          throw toStructuredError(breakerError);
        }
      }

      const shouldRetry = safeRetry && attempt < maxAttempts && isRetryableError(structured);
      if (!shouldRetry) {
        throw structured;
      }

      await sleep(computeBackoffMs(attempt));
    }
  }

  throw lastError || createStructuredError("SERVER_UNAVAILABLE", "Memory server not reachable");
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

function respondError(id, code, error) {
  const structured = toStructuredError(error);
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message: structured.message,
        data: structured
      }
    }) + "\n"
  );
}

function standardizeToolResponse(toolName, data, message = null) {
  if (data && data.success === false) {
    return errorResponse({
      message: data.message || data.error || "Tool execution failed",
      status: data.status || STATUS_CODES.SERVER_ERROR,
      errorCode: data.errorCode || "TOOL_ERROR",
      details: data.details,
      tool: toolName
    });
  }
  return successResponse({
    message: message || "Tool executed successfully",
    data: data,
    tool: toolName
  });
}

async function executeStandardizedTool(toolName, handler, args, config) {
  try {
    const result = await handler(args, config);
    const response = standardizeToolResponse(toolName, result);
    return toMCPResponse(response);
  } catch (error) {
    const errorResp = errorResponse({
      message: error.message || "Tool execution failed",
      errorCode: "TOOL_EXECUTION_ERROR",
      details: error.stack,
      tool: toolName
    });
    return toMCPResponse(errorResp);
  }
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

let toolSchemaCache = null;

function getToolSchemaMap() {
  const map = new Map();
  const allTools = [...getTools(), ...getIntegrationTools()];

  for (const tool of allTools) {
    if (tool?.name && tool?.inputSchema && typeof tool.inputSchema === "object") {
      map.set(tool.name, tool.inputSchema);
    }
  }

  return map;
}

function resolveToolSchema(toolName) {
  if (!toolSchemaCache) {
    toolSchemaCache = getToolSchemaMap();
  }

  if (!toolSchemaCache.has(toolName)) {
    const refreshed = getToolSchemaMap();
    if (refreshed.has(toolName)) {
      toolSchemaCache = refreshed;
    }
  }

  return toolSchemaCache.get(toolName) || null;
}

function validateSchemaValue(value, schema, path) {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} must be one of: ${schema.enum.join(", ")}`;
  }

  const type = schema.type;
  switch (type) {
    case "string":
      if (typeof value !== "string") {
        return `${path} must be a string`;
      }
      if (value.length > RELIABILITY.maxArgumentStringLength) {
        return `${path} exceeds maximum length of ${RELIABILITY.maxArgumentStringLength}`;
      }
      return null;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `${path} must be a number`;
      }
      return null;
    case "integer":
      if (!Number.isInteger(value)) {
        return `${path} must be an integer`;
      }
      return null;
    case "boolean":
      if (typeof value !== "boolean") {
        return `${path} must be a boolean`;
      }
      return null;
    case "array":
      if (!Array.isArray(value)) {
        return `${path} must be an array`;
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const issue = validateSchemaValue(value[i], schema.items, `${path}[${i}]`);
          if (issue) {
            return issue;
          }
        }
      }
      return null;
    case "object":
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return `${path} must be an object`;
      }
      if (Array.isArray(schema.required)) {
        for (const field of schema.required) {
          if (!(field in value)) {
            return `${path}.${field} is required`;
          }
        }
      }
      if (schema.properties && typeof schema.properties === "object") {
        for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
          if (value[propertyName] === undefined) {
            continue;
          }
          const issue = validateSchemaValue(
            value[propertyName],
            propertySchema,
            `${path}.${propertyName}`
          );
          if (issue) {
            return issue;
          }
        }
      }
      return null;
    default:
      return null;
  }
}

function validateToolArguments(toolName, args) {
  const schema = resolveToolSchema(toolName);
  if (!schema) {
    return null;
  }

  if (args === undefined) {
    args = {};
  }

  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return createStructuredError("INVALID_INPUT", "Tool arguments must be an object", {
      tool: toolName
    });
  }

  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify(args), "utf8");
  } catch {
    return createStructuredError("INVALID_INPUT", "Tool arguments must be JSON-serializable", {
      tool: toolName
    });
  }

  if (payloadSize > RELIABILITY.maxArgumentPayloadBytes) {
    return createStructuredError("INVALID_INPUT", "Tool arguments exceed maximum payload size", {
      tool: toolName,
      maxBytes: RELIABILITY.maxArgumentPayloadBytes,
      actualBytes: payloadSize
    });
  }

  const issues = [];
  for (const field of schema.required || []) {
    if (args[field] === undefined || args[field] === null) {
      issues.push(`arguments.${field} is required`);
    }
  }

  for (const [propertyName, propertySchema] of Object.entries(schema.properties || {})) {
    if (args[propertyName] === undefined) {
      continue;
    }
    const issue = validateSchemaValue(args[propertyName], propertySchema, `arguments.${propertyName}`);
    if (issue) {
      issues.push(issue);
    }
  }

  for (const [propertyName, value] of Object.entries(args)) {
    if (typeof value === "string" && AGENT_ID_FIELD_PATTERN.test(propertyName)) {
      if (!AGENT_ID_SAFE_PATTERN.test(value)) {
        issues.push(`arguments.${propertyName} contains invalid agent ID format`);
      }
    }
  }

  if (issues.length) {
    return createStructuredError("INVALID_INPUT", "Input validation failed", {
      tool: toolName,
      issues
    });
  }

  return null;
}

rl.on("line", (line) => {
  let request;

  try {
    request = JSON.parse(line);
  } catch (error) {
    void logMCPError(error, { rawInput: line });
    respondError(null, -32700, createStructuredError("INVALID_JSON", "Invalid JSON-RPC payload", {
      parseError: error.message
    }));
    return;
  }

  const run = async () => {
    try {
      if (request.method === "initialize") {
        try {
          await memoryServerReady;
        } catch (error) {
          throw createStructuredError("SERVER_UNAVAILABLE", "Memory server startup failed", {
            cause: error?.message || "Unknown startup error"
          });
        }

        return respond(request.id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: {
            name: "mcp-memory-server",
            version: "2.5.0",
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
        const baseTools = getTools();
        const integrationTools = getIntegrationTools();
        return respond(request.id, {
          tools: [...baseTools, ...integrationTools]
        });
      }

      if (request.method === "tools/call") {
        const { name, arguments: args = {} } = request.params || {};
        const validationError = validateToolArguments(name, args);
        if (validationError) {
          return respondError(request.id, -32602, validationError);
        }

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

      const integrationToolNames = [
        'redis_get', 'redis_set', 'redis_del', 'redis_exists', 'redis_keys',
        'store_knowledge', 'search_knowledge', 'get_knowledge', 'update_knowledge', 'delete_knowledge',
        'browser_open', 'browser_navigate', 'browser_get_content', 'browser_click', 'browser_fill',
        'browser_evaluate', 'browser_screenshot', 'browser_close', 'browser_list_sessions'
      ];

      if (integrationToolNames.includes(name)) {
        try {
          const result = await handleIntegrationTool(name, args);
          return respond(request.id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          });
        } catch (error) {
          return respondError(request.id, -32603, error);
        }
      }

      return respondError(
        request.id,
        -32601,
        createStructuredError("UNKNOWN_TOOL", `Unknown tool: ${name}`, {
          tool: name
        })
      );
    }
    } catch (error) {
      await logMCPError(error, { rawInput: line });

      if (request && Object.prototype.hasOwnProperty.call(request, "id")) {
        return respondError(request.id, -32603, error);
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

function setupShutdownHooks() {
  const cleanup = async () => {
    try {
      await setMcpStopped();
      invalidateRuntime();
    } catch {}
  };

  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0));
  });

  process.on('exit', (code) => {
    if (code !== 0) {
      invalidateRuntime();
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith('mcp-server.js')) {
  setupShutdownHooks();
}
