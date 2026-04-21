#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRpcClient({
  script = 'mcp-server.js',
  env = {},
  startupTimeoutMs = 30000,
  requestTimeoutMs = 30000
} = {}) {
  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, script)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MCP_SCOPE: 'project',
      MCP_PROJECT: process.env.MCP_PROJECT || 'local-mcp-server',
      ...env
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let idCounter = 0;
  let stdoutBuffer = '';
  const pending = new Map();
  const nonJsonStdout = [];
  const stderrChunks = [];
  let exited = false;

  function rejectAllPending(error) {
    for (const { reject, timeout } of pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    pending.clear();
  }

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;

    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        let message = null;
        try {
          message = JSON.parse(line);
        } catch {
          nonJsonStdout.push(line);
        }

        if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
          const pendingRequest = pending.get(message.id);
          if (pendingRequest) {
            clearTimeout(pendingRequest.timeout);
            pending.delete(message.id);
            pendingRequest.resolve(message);
          }
        }
      }

      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk);
  });

  child.on('exit', (code, signal) => {
    exited = true;
    rejectAllPending(new Error(`MCP process exited before response (code=${code}, signal=${signal})`));
  });

  child.on('error', (error) => {
    exited = true;
    rejectAllPending(error);
  });

  async function request(method, params = undefined, timeoutMs = requestTimeoutMs) {
    if (exited) {
      throw new Error('MCP process is not running');
    }

    const id = ++idCounter;
    const payload = {
      jsonrpc: '2.0',
      id,
      method
    };

    if (params !== undefined) {
      payload.params = params;
    }

    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response to ${method} (${id})`));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timeout });
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return responsePromise;
  }

  async function close() {
    if (exited) {
      return;
    }

    child.kill('SIGTERM');
    const startedAt = Date.now();
    while (!exited && Date.now() - startedAt < startupTimeoutMs) {
      await sleep(50);
    }

    if (!exited) {
      child.kill('SIGKILL');
    }
  }

  return {
    child,
    request,
    close,
    getNonJsonStdout: () => [...nonJsonStdout],
    getStderr: () => stderrChunks.join('')
  };
}

async function main() {
  const results = [];
  const token = `mcp-stabilization-${Date.now()}`;
  const testProject = `mcp-stdio-test-${Date.now()}`;
  const client = createRpcClient({
    env: {
      MCP_PROJECT: testProject,
      MCP_PROJECT_ROOT: PROJECT_ROOT
    }
  });

  try {
    const init = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'stabilization-test',
        version: '1.0.0'
      }
    });

    assert.ok(init.result, 'initialize must return a result');
    assert.equal(init.result.protocolVersion, '2024-11-05');
    assert.ok(init.result.capabilities?.tools, 'initialize must include tool capabilities');
    assert.equal(client.getNonJsonStdout().length, 0, 'stdout must contain only JSON-RPC');
    results.push('PASS Startup Test: initialize handshake and stdout purity');

    const list = await client.request('tools/list');
    const tools = list.result?.tools;
    assert.ok(Array.isArray(tools) && tools.length > 0, 'tools/list must return tool array');

    const storeTool = tools.find((tool) => tool.name === 'store_context');
    const searchTool = tools.find((tool) => tool.name === 'search_context');
    assert.ok(storeTool, 'store_context tool must be registered');
    assert.ok(searchTool, 'search_context tool must be registered');
    assert.equal(storeTool.inputSchema?.type, 'object');
    assert.equal(searchTool.inputSchema?.type, 'object');
    results.push('PASS Tool Discovery Test: store_context and search_context schemas are present');

    const store = await client.request('tools/call', {
      name: 'store_context',
      arguments: {
        content: `Stability token ${token}`,
        type: 'test',
        tags: ['stabilization']
      }
    });
    assert.ok(store.result?.content?.[0]?.text?.includes('Stored memory'));

    await sleep(150);

    const search = await client.request('tools/call', {
      name: 'search_context',
      arguments: {
        query: token,
        limit: 5
      }
    });
    assert.ok(search.result?.content?.[0]?.text?.includes(token));
    results.push('PASS Tool Execution Test: store_context and search_context round-trip works');

    const concurrentCalls = Array.from({ length: 10 }).map(() =>
      client.request('tools/call', {
        name: 'search_context',
        arguments: {
          query: token,
          limit: 1
        }
      })
    );
    const stressResponses = await Promise.all(concurrentCalls);
    assert.equal(stressResponses.length, 10);
    assert.ok(stressResponses.every((response) => !response.error), 'concurrent calls must not fail');

    const ping = await client.request('ping');
    assert.ok(ping.result, 'server should remain responsive after stress batch');
    results.push('PASS Stress Test: 10 concurrent tool calls completed without crash');

    const invalidInput = await client.request('tools/call', {
      name: 'store_context',
      arguments: {}
    });
    assert.ok(invalidInput.error, 'invalid input must produce JSON-RPC error');

    const unknownTool = await client.request('tools/call', {
      name: 'tool_does_not_exist',
      arguments: {}
    });
    assert.equal(unknownTool.error?.code, -32601, 'unknown tools must return method-not-found');
    results.push('PASS Failure Injection Test: invalid input and unknown tool fail gracefully');
  } finally {
    await client.close();
  }

  const brokenClient = createRpcClient({
    env: {
      MCP_PROJECT: `mcp-broken-${Date.now()}`,
      MCP_PROJECT_ROOT: PROJECT_ROOT,
      MONGO_URI: 'mongodb://127.0.0.1:1/mcp_memory?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500'
    },
    requestTimeoutMs: 15000
  });

  try {
    const initWhenBackendDown = await brokenClient.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'backend-down-test',
        version: '1.0.0'
      }
    });

    assert.ok(initWhenBackendDown.error, 'initialize should surface backend startup failure');
    results.push('PASS Failure Injection Test: backend-down scenario returns JSON-RPC error');
  } finally {
    await brokenClient.close();
  }

  for (const line of results) {
    process.stderr.write(`${line}\n`);
  }

  process.stderr.write(`PASS Summary: ${results.length} checks passed\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error.message}\n`);
  process.exit(1);
});
