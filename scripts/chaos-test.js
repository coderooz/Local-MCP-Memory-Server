#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CONFIG = {
  totalParallelCalls: Number(process.env.CHAOS_TOTAL_CALLS || 80),
  invalidInputRatio: Number(process.env.CHAOS_INVALID_RATIO || 0.15),
  requestTimeoutMs: Number(process.env.CHAOS_REQUEST_TIMEOUT_MS || 60000),
  maxReadRetries: Number(process.env.CHAOS_MAX_READ_RETRIES || 2),
  maxInterleaveDelayMs: Number(process.env.CHAOS_MAX_DELAY_MS || 120),
  seedOperations: Number(process.env.CHAOS_SEED_OPERATIONS || 12)
};

const CORE_TOOL_SET = [
  "store_context",
  "search_context",
  "update_context",
  "create_task",
  "send_message",
  "register_agent",
  "heartbeat_agent",
  "list_agents",
  "fetch_tasks",
  "request_messages",
  "get_connected_context"
];

const RETRYABLE_CODES = new Set(["TIMEOUT", "NETWORK_FAILURE", "CIRCUIT_OPEN", "SERVER_UNAVAILABLE"]);
const EXPECTED_INVALID_CODES = new Set(["INVALID_INPUT", "UPSTREAM_ERROR"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function nowIso() {
  return new Date().toISOString();
}

class MCPStdioClient {
  constructor({ projectName, projectRoot, agent = "chaos-agent", requestTimeoutMs = CONFIG.requestTimeoutMs } = {}) {
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.agent = agent;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pending = new Map();
    this.idCounter = 0;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.nonJsonStdoutCount = 0;
    this.exited = false;

    this.child = spawn(process.execPath, [path.join(PROJECT_ROOT, "mcp-server.js")], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        MCP_SCOPE: "project",
        MCP_PROJECT: projectName,
        MCP_PROJECT_ROOT: projectRoot,
        MCP_AGENT: agent
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");

    this.child.stdout.on("data", (chunk) => this.#onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderrBuffer += chunk;
    });

    this.child.on("exit", (code, signal) => {
      this.exited = true;
      const exitError = new Error(`MCP exited (code=${code}, signal=${signal})`);
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(exitError);
      }
      this.pending.clear();
    });

    this.child.on("error", (error) => {
      this.exited = true;
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(error);
      }
      this.pending.clear();
    });
  }

  #onStdout(chunk) {
    this.stdoutBuffer += chunk;

    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      newline = this.stdoutBuffer.indexOf("\n");

      if (!line) {
        continue;
      }

      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.nonJsonStdoutCount += 1;
        continue;
      }

      const pending = this.pending.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(parsed.id);
        pending.resolve(parsed);
      }
    }
  }

  async request(method, params) {
    if (this.exited) {
      throw new Error("MCP process is not running");
    }

    const id = ++this.idCounter;
    const payload = {
      jsonrpc: "2.0",
      id,
      method
    };
    if (params !== undefined) {
      payload.params = params;
    }

    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method} (${id})`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return responsePromise;
  }

  toolCall(name, args = {}) {
    return this.request("tools/call", {
      name,
      arguments: args
    });
  }

  async close() {
    if (this.exited) {
      return;
    }
    this.child.kill("SIGTERM");
    const start = Date.now();
    while (!this.exited && Date.now() - start < 15000) {
      await sleep(30);
    }
    if (!this.exited) {
      this.child.kill("SIGKILL");
    }
  }
}

function getStructuredError(response) {
  const data = response?.error?.data;
  if (data && typeof data === "object" && typeof data.error === "string") {
    return data;
  }
  if (response?.error?.message) {
    return {
      error: "JSONRPC_ERROR",
      message: response.error.message
    };
  }
  return null;
}

function getText(response) {
  return response?.result?.content?.[0]?.text || "";
}

function extractId(prefix, text) {
  const regex = new RegExp(`${prefix}\\s*:\\s*([^\\s]+)`, "i");
  const match = text.match(regex);
  return match?.[1] || null;
}

async function callWithRetry(client, name, args, tracker, retryable = false) {
  let attempts = 0;
  const startedAt = Date.now();

  while (true) {
    attempts += 1;
    try {
      const response = await client.toolCall(name, args);
      const elapsed = Date.now() - startedAt;

      if (!response.error) {
        tracker.responseTimesMs.push(elapsed);
        tracker.success += 1;
        tracker.byTool[name] = tracker.byTool[name] || { success: 0, failure: 0 };
        tracker.byTool[name].success += 1;
        return { response, attempts, elapsed };
      }

      const structured = getStructuredError(response);
      const code = structured?.error || "UNKNOWN";
      tracker.errorTypes[code] = (tracker.errorTypes[code] || 0) + 1;

      const canRetry = retryable && attempts <= CONFIG.maxReadRetries && RETRYABLE_CODES.has(code);
      if (canRetry) {
        tracker.retries += 1;
        await sleep(120 * attempts);
        continue;
      }

      tracker.responseTimesMs.push(elapsed);
      tracker.failure += 1;
      tracker.byTool[name] = tracker.byTool[name] || { success: 0, failure: 0 };
      tracker.byTool[name].failure += 1;
      return { response, attempts, elapsed };
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      const code = "REQUEST_TIMEOUT";
      tracker.errorTypes[code] = (tracker.errorTypes[code] || 0) + 1;
      tracker.responseTimesMs.push(elapsed);
      tracker.failure += 1;
      tracker.byTool[name] = tracker.byTool[name] || { success: 0, failure: 0 };
      tracker.byTool[name].failure += 1;
      return {
        response: {
          error: {
            data: {
              error: code,
              message: error.message
            }
          }
        },
        attempts,
        elapsed
      };
    }
  }
}

async function main() {
  const startedAt = Date.now();
  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-a-"));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-b-"));

  const projectA = `release-chaos-a-${Date.now()}`;
  const projectB = `release-chaos-b-${Date.now()}`;

  const clientA = new MCPStdioClient({
    projectName: projectA,
    projectRoot: tmpA,
    agent: "chaos-agent-a"
  });

  const clientB = new MCPStdioClient({
    projectName: projectB,
    projectRoot: tmpB,
    agent: "chaos-agent-b"
  });

  const tracker = {
    success: 0,
    failure: 0,
    retries: 0,
    errorTypes: {},
    responseTimesMs: [],
    byTool: {},
    invalidSent: 0,
    invalidRejected: 0
  };

  let crossSessionLeakage = false;
  let protocolIntegrity = true;
  const toolExecutionSeen = new Set();

  try {
    const initA = await clientA.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "chaos-test", version: "1.0.0" }
    });
    const initB = await clientB.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "chaos-test", version: "1.0.0" }
    });

    if (initA.error || initB.error) {
      throw new Error("initialize failed");
    }

    const list = await clientA.request("tools/list");
    const toolNames = new Set((list.result?.tools || []).map((tool) => tool.name));
    const missingCoreTools = CORE_TOOL_SET.filter((tool) => !toolNames.has(tool));

    const seedStore = await callWithRetry(
      clientA,
      "store_context",
      { content: `seed-context-${Date.now()}`, type: "test" },
      tracker,
      false
    );
    toolExecutionSeen.add("store_context");
    const contextId = extractId("ID", getText(seedStore.response));
    if (!contextId) {
      throw new Error("Failed to create base context for chaos run");
    }

    const seedTask = await callWithRetry(
      clientA,
      "create_task",
      { title: `seed-task-${Date.now()}`, description: "seed task" },
      tracker,
      false
    );
    toolExecutionSeen.add("create_task");
    const taskId = extractId("Task created", getText(seedTask.response));

    const seedMessage = await callWithRetry(
      clientA,
      "send_message",
      { content: `seed-message-${Date.now()}`, type: "info" },
      tracker,
      false
    );
    toolExecutionSeen.add("send_message");
    if (seedMessage.response.error) {
      throw new Error("send_message failed during seed setup");
    }

    const register = await callWithRetry(
      clientA,
      "register_agent",
      {
        name: "chaos-agent-a",
        role: "tester",
        capabilities: ["stress"],
        agent_id: "chaos-agent-a"
      },
      tracker,
      false
    );
    toolExecutionSeen.add("register_agent");
    const heartbeat = await callWithRetry(
      clientA,
      "heartbeat_agent",
      {
        agent_id: "chaos-agent-a",
        status: "active"
      },
      tracker,
      false
    );
    toolExecutionSeen.add("heartbeat_agent");

    if (register.response.error || heartbeat.response.error) {
      throw new Error("agent registration/heartbeat bootstrap failed");
    }

    const listAgents = await callWithRetry(clientA, "list_agents", {}, tracker, true);
    toolExecutionSeen.add("list_agents");
    const fetchTasks = await callWithRetry(clientA, "fetch_tasks", { limit: 5 }, tracker, true);
    toolExecutionSeen.add("fetch_tasks");
    const requestMessages = await callWithRetry(clientA, "request_messages", { limit: 5 }, tracker, true);
    toolExecutionSeen.add("request_messages");
    const connected = await callWithRetry(clientA, "get_connected_context", { id: contextId }, tracker, true);
    toolExecutionSeen.add("get_connected_context");
    if (listAgents.response.error || fetchTasks.response.error || requestMessages.response.error || connected.response.error) {
      throw new Error("bootstrap read checks failed");
    }

    const sessionTokenA = `isolation-A-${Date.now()}`;
    const sessionTokenB = `isolation-B-${Date.now()}`;

    await callWithRetry(clientA, "store_context", { content: sessionTokenA, type: "isolation" }, tracker, false);
    await callWithRetry(clientB, "store_context", { content: sessionTokenB, type: "isolation" }, tracker, false);

    const searchAForB = await callWithRetry(clientA, "search_context", { query: sessionTokenB, limit: 3 }, tracker, true);
    const searchBForA = await callWithRetry(clientB, "search_context", { query: sessionTokenA, limit: 3 }, tracker, true);
    toolExecutionSeen.add("search_context");
    if (getText(searchAForB.response).includes(sessionTokenB) || getText(searchBForA.response).includes(sessionTokenA)) {
      crossSessionLeakage = true;
    }

    const operationFactories = [
      () => ({
        tool: "store_context",
        args: {
          content: `chaos-store-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "test",
          tags: ["chaos"]
        },
        retryable: false,
        invalidArgs: {}
      }),
      () => ({
        tool: "search_context",
        args: {
          query: "chaos-store",
          limit: 5
        },
        retryable: true,
        invalidArgs: { query: 42 }
      }),
      () => ({
        tool: "update_context",
        args: {
          context_id: contextId,
          reason: "chaos update",
          updates: {
            summary: `chaos-summary-${Date.now()}`
          }
        },
        retryable: false,
        invalidArgs: { context_id: "", updates: "oops" }
      }),
      () => ({
        tool: "create_task",
        args: {
          title: `chaos-task-${Date.now()}`,
          description: "chaos-run task"
        },
        retryable: false,
        invalidArgs: { title: 12345 }
      }),
      () => ({
        tool: "send_message",
        args: {
          content: `chaos-message-${Date.now()}`,
          type: "status",
          ...(taskId ? { related_task: taskId } : {})
        },
        retryable: false,
        invalidArgs: { content: "x".repeat(30000) }
      })
    ];

    const chaosCalls = Array.from({ length: CONFIG.totalParallelCalls }).map(async () => {
      const factory = operationFactories[randomInt(operationFactories.length)];
      const op = factory();
      toolExecutionSeen.add(op.tool);
      await sleep(randomInt(CONFIG.maxInterleaveDelayMs + 1));

      const shouldSendInvalid = Math.random() < CONFIG.invalidInputRatio;
      const args = shouldSendInvalid ? op.invalidArgs : op.args;
      if (shouldSendInvalid) {
        tracker.invalidSent += 1;
      }

      const result = await callWithRetry(clientA, op.tool, args, tracker, op.retryable);
      if (shouldSendInvalid && result.response.error) {
        const structured = getStructuredError(result.response);
        if (structured && EXPECTED_INVALID_CODES.has(structured.error)) {
          tracker.invalidRejected += 1;
        }
      }
      return {
        shouldSendInvalid,
        result
      };
    });

    const chaosResults = await Promise.all(chaosCalls);

    protocolIntegrity = clientA.nonJsonStdoutCount === 0 && clientB.nonJsonStdoutCount === 0;
    const malformedCount = clientA.nonJsonStdoutCount + clientB.nonJsonStdoutCount;

    const validOps = Math.max(1, chaosResults.filter((entry) => !entry.shouldSendInvalid).length);
    const validSuccesses = chaosResults.filter(
      (entry) => !entry.shouldSendInvalid && !entry.result.response.error
    ).length;
    const validSuccessRate = validSuccesses / validOps;
    const invalidRejectionRate = tracker.invalidSent > 0 ? tracker.invalidRejected / tracker.invalidSent : 1;

    const missingExecutedCore = CORE_TOOL_SET.filter((tool) => !toolExecutionSeen.has(tool));

    const summary = {
      startedAt: nowIso(),
      durationMs: Date.now() - startedAt,
      config: CONFIG,
      checks: {
        toolsDiscovered: missingCoreTools.length === 0,
        allCoreToolsExecuted: missingExecutedCore.length === 0,
        protocolIntegrity,
        crossSessionLeakage: !crossSessionLeakage,
        noMalformedJson: malformedCount === 0
      },
      metrics: {
        success: tracker.success,
        failure: tracker.failure,
        successRate: Number((tracker.success / Math.max(1, tracker.success + tracker.failure)).toFixed(4)),
        validSuccessRate: Number(validSuccessRate.toFixed(4)),
        invalidSent: tracker.invalidSent,
        invalidRejected: tracker.invalidRejected,
        invalidRejectionRate: Number(invalidRejectionRate.toFixed(4)),
        retries: tracker.retries,
        responseTimeMs: {
          avg: Number((tracker.responseTimesMs.reduce((sum, n) => sum + n, 0) / Math.max(1, tracker.responseTimesMs.length)).toFixed(2)),
          p95: percentile(tracker.responseTimesMs, 95),
          max: tracker.responseTimesMs.length ? Math.max(...tracker.responseTimesMs) : 0
        },
        errorTypes: tracker.errorTypes,
        byTool: tracker.byTool
      },
      details: {
        missingCoreTools,
        missingExecutedCore,
        malformedStdoutLines: malformedCount
      }
    };

    const pass =
      summary.checks.toolsDiscovered &&
      summary.checks.allCoreToolsExecuted &&
      summary.checks.protocolIntegrity &&
      summary.checks.crossSessionLeakage &&
      summary.checks.noMalformedJson &&
      validSuccessRate >= 0.75 &&
      invalidRejectionRate >= 0.9;

    summary.result = pass ? "PASS" : "FAIL";
    summary.gate = pass ? "READY" : "BLOCKED";

    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = pass ? 0 : 1;
  } catch (error) {
    const fatal = {
      result: "FAIL",
      gate: "BLOCKED",
      fatal: true,
      message: error.message
    };
    console.log(JSON.stringify(fatal, null, 2));
    process.exitCode = 1;
  } finally {
    await clientA.close();
    await clientB.close();
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        result: "FAIL",
        gate: "BLOCKED",
        fatal: true,
        message: error.message
      },
      null,
      2
    )
  );
  process.exit(1);
});
