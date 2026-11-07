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
      MCP_PROJECT: 'local-setup-verification',
      MCP_AGENT: 'local-setup-verifier',
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

  async function notify(method, params = undefined) {
    if (exited) return;
    const payload = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async function close() {
    if (exited) return;
    child.kill('SIGTERM');
    const startedAt = Date.now();
    while (!exited && Date.now() - startedAt < 3000) {
      await sleep(50);
    }
    if (!exited) {
      child.kill('SIGKILL');
    }
  }

  return {
    child,
    request,
    notify,
    close,
    getNonJsonStdout: () => [...nonJsonStdout],
    getStderr: () => stderrChunks.join('')
  };
}

async function runVerification() {
  console.log('=== Step 1: Launch MCP stdio server & Handshake ===');
  const client1 = createRpcClient();
  const testToken = `VERIFY_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let init1;
  let list1;
  let storedContextId;

  try {
    init1 = await client1.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'local-setup-tester',
        version: '1.0.0'
      }
    });

    console.log('Initialize response received:');
    console.log('  Server Name:', init1.result?.serverInfo?.name);
    console.log('  Server Version:', init1.result?.serverInfo?.version);
    console.log('  Protocol Version:', init1.result?.protocolVersion);
    console.log('  Capabilities:', Object.keys(init1.result?.capabilities || {}));

    assert.ok(
      init1.result?.serverInfo?.name === 'mcp-memory-server' ||
      init1.result?.serverInfo?.name === 'local-mcp-memory',
      `Server name unexpected: ${init1.result?.serverInfo?.name}`
    );
    assert.equal(init1.result?.serverInfo?.version, '2.6.0');
    assert.equal(init1.result?.protocolVersion, '2024-11-05');
    assert.ok(init1.result?.capabilities?.tools, 'Tool capabilities must be present');
    assert.equal(client1.getNonJsonStdout().length, 0, 'Stdout must be 100% pure JSON-RPC');

    await client1.notify('notifications/initialized');

    console.log('\n=== Step 2: Tools Discovery (List Tools) ===');
    list1 = await client1.request('tools/list');
    const tools = list1.result?.tools || [];
    console.log(`Total tools returned: ${tools.length}`);
    const toolNames = tools.map((t) => t.name).sort();
    console.log('All 63 Tool Names:', toolNames);

    // Spot-check key tools
    const expectedKeyTools = [
      'store_context',
      'search_context',
      'get_full_context',
      'create_task',
      'fetch_tasks',
      'acquire_resource_lock',
      'release_resource_lock',
      'register_agent',
      'list_agents',
      'start_session'
    ];

    for (const toolName of expectedKeyTools) {
      const found = tools.find((t) => t.name === toolName);
      assert.ok(found, `Required tool "${toolName}" must be in tools/list`);
      console.log(`  ✔ Found key tool: ${toolName}`);
    }

    console.log('\n=== Step 3: Test Memory Store & Search Roundtrip ===');
    const storeRes = await client1.request('tools/call', {
      name: 'store_context',
      arguments: {
        content: `Local verification token ${testToken} persisted test payload`,
        type: 'verification',
        tags: ['local-setup', 'v2.6.0-verification']
      }
    });

    console.log('Store response:', storeRes.result?.content?.[0]?.text);
    assert.ok(storeRes.result?.content?.[0]?.text?.includes('Stored memory'), 'Store must confirm storage');

    await sleep(250);

    const searchRes = await client1.request('tools/call', {
      name: 'search_context',
      arguments: {
        query: testToken,
        limit: 5
      }
    });

    console.log('Search response matches token:', searchRes.result?.content?.[0]?.text?.includes(testToken));
    assert.ok(searchRes.result?.content?.[0]?.text?.includes(testToken), 'Search must return the stored token');

  } finally {
    console.log('\nTerminating Server Instance 1...');
    await client1.close();
  }

  console.log('\n=== Step 4: Verify Persistence Across Server Restart ===');
  console.log('Launching Server Instance 2...');
  const client2 = createRpcClient();

  try {
    const init2 = await client2.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'local-setup-restart-verifier',
        version: '1.0.0'
      }
    });
    assert.ok(
      init2.result?.serverInfo?.name === 'mcp-memory-server' ||
      init2.result?.serverInfo?.name === 'local-mcp-memory',
      `Server name unexpected: ${init2.result?.serverInfo?.name}`
    );
    await client2.notify('notifications/initialized');

    console.log('Searching for previously stored token across restart:');
    const searchAfterRestart = await client2.request('tools/call', {
      name: 'search_context',
      arguments: {
        query: testToken,
        limit: 5
      }
    });

    const foundInSecondProcess = searchAfterRestart.result?.content?.[0]?.text?.includes(testToken);
    console.log(`Token found in new process: ${foundInSecondProcess}`);
    assert.ok(foundInSecondProcess, 'Stored record must persist across complete process restart');
    console.log('  ✔ Persistence across restart verified!');
  } finally {
    console.log('Terminating Server Instance 2...');
    await client2.close();
  }

  console.log('\n=== ALL MCP LOCAL RUNTIME VERIFICATIONS PASSED ===');
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
