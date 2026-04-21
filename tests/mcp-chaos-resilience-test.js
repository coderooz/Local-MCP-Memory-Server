#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const LONG_RUN_MS = Number(process.env.MCP_LONG_RUN_MS || 120000);
const CONCURRENCY_STORM_CALLS = Number(process.env.MCP_STORM_CALLS || 120);
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_REQUEST_TIMEOUT_MS || 70000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MCPStdioClient {
  constructor({
    env = {},
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    startupTimeoutMs = 30000
  } = {}) {
    this.requestTimeoutMs = requestTimeoutMs;
    this.startupTimeoutMs = startupTimeoutMs;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.nonJsonStdout = [];
    this.notifications = [];
    this.pending = new Map();
    this.idCounter = 0;
    this.exited = false;

    this.child = spawn(process.execPath, [path.join(PROJECT_ROOT, "mcp-server.js")], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        MCP_SCOPE: "project",
        ...env
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");

    this.child.stdout.on("data", (chunk) => this._handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderrBuffer += chunk;
    });

    this.child.on("exit", (code, signal) => {
      this.exited = true;
      const error = new Error(`MCP process exited unexpectedly (code=${code}, signal=${signal})`);
      for (const { reject, timeout } of this.pending.values()) {
        clearTimeout(timeout);
        reject(error);
      }
      this.pending.clear();
    });

    this.child.on("error", (error) => {
      this.exited = true;
      for (const { reject, timeout } of this.pending.values()) {
        clearTimeout(timeout);
        reject(error);
      }
      this.pending.clear();
    });
  }

  _handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      newline = this.stdoutBuffer.indexOf("\n");

      if (!line) {
        continue;
      }

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.nonJsonStdout.push(line);
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(message, "id") && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        pending.resolve(message);
      } else {
        this.notifications.push(message);
      }
    }
  }

  isAlive() {
    return !this.exited;
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
        reject(new Error(`Timed out waiting for response to ${method} (${id})`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return responsePromise;
  }

  toolCall(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }

  sendRaw(line) {
    if (this.exited) {
      throw new Error("MCP process is not running");
    }
    this.child.stdin.write(`${line}\n`);
  }

  async waitForNotification(predicate, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const index = this.notifications.findIndex(predicate);
      if (index >= 0) {
        return this.notifications.splice(index, 1)[0];
      }
      await sleep(20);
    }
    throw new Error("Timed out waiting for notification");
  }

  getStderr() {
    return this.stderrBuffer;
  }

  getNonJsonStdout() {
    return [...this.nonJsonStdout];
  }

  async close() {
    if (this.exited) {
      return;
    }

    this.child.kill("SIGTERM");
    const start = Date.now();
    while (!this.exited && Date.now() - start < this.startupTimeoutMs) {
      await sleep(25);
    }

    if (!this.exited) {
      this.child.kill("SIGKILL");
    }
  }
}

function getToolText(response) {
  return response?.result?.content?.[0]?.text || "";
}

function parseContextIdFromStoreResponse(response) {
  const text = getToolText(response);
  const match = text.match(/ID:\s*([^\s]+)/i);
  return match?.[1] || null;
}

function parseTaskIdFromCreateResponse(response) {
  const text = getToolText(response);
  const match = text.match(/Task created:\s*([^\s]+)/i);
  return match?.[1] || null;
}

function assertStructuredError(response, expectedCodes = []) {
  assert.ok(response?.error, "Expected JSON-RPC error response");
  const data = response.error.data;
  assert.ok(data && typeof data === "object", "Expected structured error data");
  assert.equal(typeof data.error, "string", "Expected structured error code");
  assert.equal(typeof data.message, "string", "Expected structured error message");

  if (expectedCodes.length > 0) {
    assert.ok(
      expectedCodes.includes(data.error),
      `Expected one of [${expectedCodes.join(", ")}], got ${data.error}`
    );
  }
}

function runtimeFilePath(projectRoot) {
  return path.join(projectRoot, ".mcp-runtime.json");
}

async function waitForRuntimePort(projectRoot, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const filePath = runtimeFilePath(projectRoot);
      if (fs.existsSync(filePath)) {
        const runtime = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (runtime?.port) {
          return Number(runtime.port);
        }
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("Timed out waiting for runtime port");
}

async function fetchHealth(port) {
  const response = await fetch(`http://localhost:${port}/health`, {
    headers: {
      "X-MCP-Health-Check": "true"
    }
  });
  if (response.status === 429) {
    return null;
  }
  assert.equal(response.ok, true, "Health endpoint should respond with 200");
  return response.json();
}

async function runPhase(name, fn, results) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({
      phase: name,
      status: "PASS",
      durationMs: Date.now() - started,
      detail
    });
    process.stderr.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({
      phase: name,
      status: "FAIL",
      durationMs: Date.now() - started,
      error: error.message
    });
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}

async function main() {
  const results = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-"));
  const projectName = `chaos-${Date.now()}`;
  let client = null;

  try {
    client = new MCPStdioClient({
      env: {
        MCP_PROJECT: projectName,
        MCP_PROJECT_ROOT: tempRoot
      }
    });

    await runPhase("Startup Handshake", async () => {
      const init = await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "chaos-test", version: "1.0.0" }
      });
      assert.ok(init.result?.capabilities?.tools, "initialize must include tools capability");

      const tools = await client.request("tools/list");
      assert.ok(Array.isArray(tools.result?.tools), "tools/list must return an array");
      return { toolCount: tools.result.tools.length };
    }, results);

    await runPhase("Concurrency Storm", async () => {
      const seedStore = await client.toolCall("store_context", {
        content: `seed-${Date.now()}`,
        type: "test"
      });
      const baseContextId = parseContextIdFromStoreResponse(seedStore);
      assert.ok(baseContextId, "Unable to parse base context ID");

      const tasks = [];

      const calls = Array.from({ length: CONCURRENCY_STORM_CALLS }).map(async (_, index) => {
        const mode = index % 5;
        if (mode === 0) {
          const token = `storm-store-${index}-${Date.now()}`;
          const response = await client.toolCall("store_context", {
            content: `Concurrency token ${token}`,
            type: "test",
            tags: ["storm"]
          });
          return { kind: "store", token, response };
        }
        if (mode === 1) {
          const response = await client.toolCall("search_context", {
            query: "Concurrency token",
            limit: 5
          });
          return { kind: "search", response };
        }
        if (mode === 2) {
          const response = await client.toolCall("update_context", {
            context_id: baseContextId,
            reason: "storm update",
            updates: {
              summary: `storm-${index}-${Date.now()}`
            }
          });
          return { kind: "update", response };
        }
        if (mode === 3) {
          const response = await client.toolCall("create_task", {
            title: `storm-task-${index}-${Date.now()}`,
            description: "chaos task"
          });
          const taskId = parseTaskIdFromCreateResponse(response);
          if (taskId) {
            tasks.push(taskId);
          }
          return { kind: "task", response };
        }
        const response = await client.toolCall("send_message", {
          content: `storm-message-${index}-${Date.now()}`,
          type: "info"
        });
        return { kind: "message", response };
      });

      const entries = await Promise.all(calls);
      assert.equal(entries.length, CONCURRENCY_STORM_CALLS);

      const errors = entries.filter((entry) => entry.response.error).map((entry) => entry.response);
      for (const errorResponse of errors) {
        assertStructuredError(errorResponse);
      }

      const successfulStoreTokens = entries
        .filter((entry) => entry.kind === "store" && !entry.response.error)
        .map((entry) => entry.token);

      const sampleTokens = successfulStoreTokens.slice(0, 12);
      let searchable = 0;
      for (const token of sampleTokens) {
        const search = await client.toolCall("search_context", { query: token, limit: 3 });
        if (!search.error && getToolText(search).includes(token)) {
          searchable += 1;
        }
      }

      if (sampleTokens.length > 0) {
        assert.ok(
          searchable >= Math.ceil(sampleTokens.length * 0.7),
          "Too many successfully stored entries were not discoverable"
        );
      }

      const ping = await client.request("ping");
      assert.ok(ping.result, "Server became unresponsive after storm");

      return {
        calls: CONCURRENCY_STORM_CALLS,
        structuredErrors: errors.length,
        storedSample: sampleTokens.length,
        searchable,
        createdTasks: tasks.length
      };
    }, results);

    await runPhase("Race Conditions", async () => {
      const seed = await client.toolCall("store_context", {
        content: `race-context-${Date.now()}`,
        type: "test"
      });
      const contextId = parseContextIdFromStoreResponse(seed);
      assert.ok(contextId, "Missing race context ID");

      const raceRequests = Array.from({ length: 25 }).map((_, index) =>
        client.toolCall("update_context", {
          context_id: contextId,
          reason: "race condition validation",
          expectedVersion: 1,
          updates: {
            summary: `race-${index}-${Date.now()}`
          }
        })
      );

      const raceResponses = await Promise.all(raceRequests);
      const raceSuccesses = raceResponses.filter((response) => !response.error).length;
      const raceFailures = raceResponses.length - raceSuccesses;

      const versions = raceResponses
        .map((response) => getToolText(response).match(/Version:\s*(\d+)/i)?.[1])
        .filter(Boolean)
        .map((value) => Number(value))
        .filter(Number.isFinite);

      if (raceFailures === 0 && versions.length > 1) {
        const minVersion = Math.min(...versions);
        const maxVersion = Math.max(...versions);
        assert.ok(
          maxVersion > minVersion,
          "Simultaneous updates did not show version advancement or conflict signals"
        );
      }

      const registerAndHeartbeat = Array.from({ length: 30 }).map(async (_, index) => {
        const agentId = `race-agent-${index}-${Date.now()}`;
        const register = await client.toolCall("register_agent", {
          name: agentId,
          role: "worker",
          capabilities: ["test"],
          agent_id: agentId
        });

        const heartbeat = await client.toolCall("heartbeat_agent", {
          agent_id: agentId,
          status: "active"
        });

        return { register, heartbeat };
      });

      const agentResponses = await Promise.all(registerAndHeartbeat);
      assert.equal(agentResponses.length, 30);
      assert.ok(client.isAlive(), "Client process crashed during agent race");

      return {
        raceSuccesses,
        raceFailures,
        observedVersions: versions.slice(0, 5),
        agentOps: agentResponses.length * 2
      };
    }, results);

    await runPhase("Partial Failure Handling", async () => {
      const downClient = new MCPStdioClient({
        env: {
          MCP_PROJECT: `chaos-down-${Date.now()}`,
          MCP_PROJECT_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-down-")),
          MONGO_URI: "mongodb://127.0.0.1:1/mcp_memory?serverSelectionTimeoutMS=1000&connectTimeoutMS=1000"
        },
        requestTimeoutMs: 15000
      });

      try {
        const init = await downClient.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "partial-failure", version: "1.0.0" }
        });
        assertStructuredError(init, ["SERVER_UNAVAILABLE"]);
      } finally {
        await downClient.close();
      }

      const timeoutClient = new MCPStdioClient({
        env: {
          MCP_PROJECT: `chaos-timeout-${Date.now()}`,
          MCP_PROJECT_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-timeout-")),
          MCP_HTTP_TIMEOUT_MS: "1000",
          MCP_CHAOS_DELAY_MS: "5000"
        },
        requestTimeoutMs: 20000
      });

      try {
        await timeoutClient.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "timeout-failure", version: "1.0.0" }
        });
        const timeoutResponse = await timeoutClient.toolCall("search_context", {
          query: "timeout-check",
          limit: 1
        });
        assertStructuredError(timeoutResponse, ["TIMEOUT", "CIRCUIT_OPEN", "SERVER_UNAVAILABLE"]);
      } finally {
        await timeoutClient.close();
      }

      const networkClient = new MCPStdioClient({
        env: {
          MCP_PROJECT: `chaos-network-${Date.now()}`,
          MCP_PROJECT_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-network-")),
          MCP_CHAOS_FAILURE_RATE: "1"
        },
        requestTimeoutMs: 20000
      });

      try {
        await networkClient.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "network-failure", version: "1.0.0" }
        });
        const networkResponse = await networkClient.toolCall("search_context", {
          query: "network-check",
          limit: 1
        });
        assertStructuredError(networkResponse, ["NETWORK_FAILURE", "CIRCUIT_OPEN", "SERVER_UNAVAILABLE"]);
      } finally {
        await networkClient.close();
      }

      return { scenarios: 3 };
    }, results);

    await runPhase("Invalid Input Storm", async () => {
      const invalidCalls = [];
      for (let i = 0; i < 100; i++) {
        const mode = i % 5;
        if (mode === 0) {
          invalidCalls.push(client.toolCall("store_context", {}));
        } else if (mode === 1) {
          invalidCalls.push(client.toolCall("store_context", { content: 12345 }));
        } else if (mode === 2) {
          invalidCalls.push(client.toolCall("create_task", { title: 12345 }));
        } else if (mode === 3) {
          invalidCalls.push(
            client.toolCall("send_message", {
              content: "x".repeat(30000)
            })
          );
        } else {
          invalidCalls.push(
            client.toolCall("heartbeat_agent", {
              agent_id: "invalid agent id!",
              status: "active"
            })
          );
        }
      }

      const responses = await Promise.all(invalidCalls);
      const invalidErrors = responses.filter((response) => response.error);
      assert.ok(invalidErrors.length >= 90, "Most malformed payloads should fail");
      for (const response of invalidErrors) {
        assertStructuredError(response, ["INVALID_INPUT"]);
      }

      const ping = await client.request("ping");
      assert.ok(ping.result, "Server became unresponsive after invalid-input storm");

      return { total: responses.length, rejected: invalidErrors.length };
    }, results);

    await runPhase("STDIO Integrity", async () => {
      client.sendRaw("THIS_IS_NOT_JSON");
      const parseError = await client.waitForNotification(
        (message) => message?.error?.code === -32700 || message?.id === null,
        5000
      );
      assertStructuredError(parseError, ["INVALID_JSON"]);

      const list = await client.request("tools/list");
      assert.ok(Array.isArray(list.result?.tools), "tools/list should still work after parse noise");
      assert.equal(client.getNonJsonStdout().length, 0, "Detected non-JSON output on MCP stdout");

      const strictClient = new MCPStdioClient({
        env: {
          MCP_PROJECT: `chaos-stdio-${Date.now()}`,
          MCP_PROJECT_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), "mcp-chaos-stdio-")),
          MCP_JSONRPC_STDOUT_ONLY: "false"
        }
      });

      try {
        await strictClient.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "stdio-check", version: "1.0.0" }
        });
        await strictClient.request("tools/list");
        assert.equal(strictClient.getNonJsonStdout().length, 0, "stdout protocol corruption detected");
      } finally {
        await strictClient.close();
      }

      return { parseErrorHandled: true };
    }, results);

    await runPhase("Long-Running Stability", async () => {
      const runtimePort = await waitForRuntimePort(tempRoot, 20000);
      const latencies = [];
      const heapSamples = [];
      const sessionSamples = [];
      const start = Date.now();

      while (Date.now() - start < LONG_RUN_MS) {
        const loopStart = Date.now();
        const operation = Math.floor(Math.random() * 5);
        if (operation === 0) {
          await client.toolCall("store_context", {
            content: `long-run-${Date.now()}`,
            type: "test"
          });
        } else if (operation === 1) {
          await client.toolCall("search_context", {
            query: "long-run",
            limit: 5
          });
        } else if (operation === 2) {
          await client.toolCall("create_task", {
            title: `long-run-task-${Date.now()}`,
            description: "long run stability task"
          });
        } else if (operation === 3) {
          await client.toolCall("send_message", {
            content: `long-run-message-${Date.now()}`,
            type: "status"
          });
        } else {
          await client.request("ping");
        }

        latencies.push(Date.now() - loopStart);

        if (latencies.length % 30 === 0) {
          const health = await fetchHealth(runtimePort);
          if (health) {
            heapSamples.push(health?.memory?.heapUsed || 0);
            sessionSamples.push(health?.sessions?.active || 0);
          }
        }

        await sleep(200);
      }

      assert.ok(client.isAlive(), "Process died during long-running loop");
      const minSamples = Math.max(4, Math.floor(LONG_RUN_MS / 10000));
      assert.ok(latencies.length >= minSamples, "Not enough long-run samples collected");
      if (heapSamples.length > 0) {
        const heapDelta = Math.max(...heapSamples) - Math.min(...heapSamples);
        assert.ok(heapDelta < 220, `Potential memory leak detected (heap delta ${heapDelta} MB)`);
      }

      const windowSize = Math.min(20, Math.max(5, Math.floor(latencies.length / 3)));
      const firstWindow = latencies.slice(0, windowSize);
      const lastWindow = latencies.slice(-windowSize);
      const firstAvg = firstWindow.reduce((sum, item) => sum + item, 0) / firstWindow.length;
      const lastAvg = lastWindow.reduce((sum, item) => sum + item, 0) / lastWindow.length;
      assert.ok(lastAvg <= firstAvg * 3 + 150, "Latency degraded significantly during long run");

      const maxActiveSessions = sessionSamples.length > 0 ? Math.max(...sessionSamples) : 0;
      if (sessionSamples.length > 0) {
        assert.ok(maxActiveSessions <= 20, "Possible orphaned-session growth detected");
      }

      const heapDelta =
        heapSamples.length > 0 ? Math.max(...heapSamples) - Math.min(...heapSamples) : null;

      return {
        durationMs: LONG_RUN_MS,
        operations: latencies.length,
        firstAvgLatencyMs: Math.round(firstAvg),
        lastAvgLatencyMs: Math.round(lastAvg),
        heapDeltaMb: heapDelta,
        maxActiveSessions,
        healthSamples: heapSamples.length
      };
    }, results);
  } finally {
    if (client) {
      await client.close();
    }
  }

  process.stderr.write("\nChaos Resilience Summary\n");
  for (const result of results) {
    if (result.status === "PASS") {
      process.stderr.write(`- PASS ${result.phase} (${result.durationMs}ms)\n`);
    } else {
      process.stderr.write(`- FAIL ${result.phase} (${result.durationMs}ms): ${result.error}\n`);
    }
  }

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`FATAL ${error.message}\n`);
  process.exit(1);
});
