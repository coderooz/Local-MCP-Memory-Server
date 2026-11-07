#!/usr/bin/env node

/**
 * MCP Protocol Conformance Tests (client side)
 *
 * The registry proxies to *external* MCP servers, so its outbound transport must
 * speak the MCP Streamable HTTP transport, not bare JSON-RPC.
 *
 * This suite proves that with two independent clients against one stub:
 *
 *   1. the official `@modelcontextprotocol/client` (an independent reference
 *      implementation) connects to the stub — establishing that the stub really
 *      is spec-faithful rather than tuned to our own implementation, then
 *   2. the registry's own session layer passes the same conformance checks.
 *
 * It also pins the regression that motivated the work: the legacy bare
 * `proxyRequest` is rejected by a conformant server.
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { startMcpStub } from './fixtures/mcp-http-stub.js';
import { proxyRequest, resetCircuitBreaker } from '../src/core/mcp-registry/proxy.js';
import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  call,
  closeSession,
  describeSession,
  ensureSession,
  resetSession,
} from '../src/core/mcp-registry/session.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`\u2713 ${name}`);
  } catch (error) {
    failed++;
    console.error(`\u2717 ${name}`);
    console.error(`  ${error.message}`);
  }
}

/** Build the RAW-shaped server record the session layer expects. */
function serverRecord(stub, overrides = {}) {
  return {
    server_id: 'srv_conformance',
    url: stub.url,
    type: 'http',
    auth_type: 'none',
    auth_config: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Oracle: the stub must satisfy the official client
// ---------------------------------------------------------------------------

await test('stub is spec-faithful: the official MCP client can connect', async () => {
  const stub = await startMcpStub();
  const client = new Client({ name: 'conformance-oracle', version: '1.0.0' });

  try {
    const transport = new StreamableHTTPClientTransport(new URL(stub.url));
    await client.connect(transport);

    const version = client.getServerVersion();
    assert(version && version.name === 'mcp-conformance-stub', 'oracle did not see serverInfo');
    assert(stub.stats.initializes === 1, `expected 1 initialize, got ${stub.stats.initializes}`);
    assert(
      stub.stats.initializedNotifications === 1,
      `expected 1 notifications/initialized, got ${stub.stats.initializedNotifications}`
    );

    const listed = await client.listTools();
    assert(listed.tools.length === 1 && listed.tools[0].name === 'echo', 'tools/list mismatch');

    const called = await client.callTool({ name: 'echo', arguments: { a: 1 } });
    assert(
      called.content?.[0]?.text === 'echo:{"a":1}',
      `tools/call mismatch: ${JSON.stringify(called)}`
    );

    await client.close();
  } finally {
    await stub.close();
  }
});

await test('stub refuses clients that do not accept event streams', async () => {
  const stub = await startMcpStub();
  try {
    const response = await fetch(stub.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    assert(response.status === 406, `expected 406, got ${response.status}`);
    assert(stub.stats.rejectedNoAccept === 1, 'stub did not record the rejection');
  } finally {
    await stub.close();
  }
});

await test('stub refuses post-initialize calls without a session', async () => {
  const stub = await startMcpStub();
  try {
    const response = await fetch(stub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(stub.stats.rejectedNoSession === 1, 'stub did not record the rejection');
  } finally {
    await stub.close();
  }
});

await test('stub answers an unknown session with 404', async () => {
  const stub = await startMcpStub();
  try {
    const response = await fetch(stub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': 'session-that-never-existed',
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    });
    assert(response.status === 404, `expected 404, got ${response.status}`);
  } finally {
    await stub.close();
  }
});

// ---------------------------------------------------------------------------
// Regression: the pre-fix transport cannot talk to a conformant server
// ---------------------------------------------------------------------------

await test('legacy bare proxyRequest is rejected by a conformant server', async () => {
  const stub = await startMcpStub();
  resetCircuitBreaker('srv_legacy');

  try {
    const raw = serverRecord(stub, { server_id: 'srv_legacy' });
    let error = null;
    try {
      await proxyRequest(raw, { method: 'tools/list' }, 5000);
    } catch (err) {
      error = err;
    }
    assert(error, 'bare JSON-RPC unexpectedly succeeded against a conformant server');
    assert(/HTTP 400/.test(error.message), `unexpected error: ${error.message}`);
    assert(stub.stats.initializes === 0, 'the legacy path performed an initialize handshake');
  } finally {
    await stub.close();
  }
});

// ---------------------------------------------------------------------------
// Native session layer
// ---------------------------------------------------------------------------

await test('ensureSession negotiates a version and captures the session id', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    const entry = await ensureSession(server, 5000);
    assert(entry.protocolVersion === PROTOCOL_VERSION, `version: ${entry.protocolVersion}`);
    assert(
      SUPPORTED_PROTOCOL_VERSIONS.includes(entry.protocolVersion),
      'negotiated version is not in the supported set'
    );
    assert(typeof entry.sessionId === 'string' && entry.sessionId.length > 0, 'no session id');
    assert(entry.serverInfo?.name === 'mcp-conformance-stub', 'serverInfo not captured');

    const described = describeSession(server);
    assert(described && described.sessionId === entry.sessionId, 'describeSession mismatch');
    assert(stub.stats.initializedNotifications === 1, 'handshake did not send initialized');
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('session is reused across calls (one handshake)', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    await call(server, 'tools/list', {}, 5000);
    await call(server, 'tools/list', {}, 5000);
    await call(server, 'ping', {}, 5000);
    assert(stub.stats.initializes === 1, `expected 1 initialize, got ${stub.stats.initializes}`);
    assert(
      stub.stats.toolListCalls === 2,
      `expected 2 tools/list, got ${stub.stats.toolListCalls}`
    );
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('concurrent callers share a single handshake', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    await Promise.all([
      call(server, 'ping', {}, 5000),
      call(server, 'ping', {}, 5000),
      call(server, 'ping', {}, 5000),
      call(server, 'ping', {}, 5000),
    ]);
    assert(stub.stats.initializes === 1, `expected 1 initialize, got ${stub.stats.initializes}`);
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('tools/list and tools/call round-trip through the session', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    const list = await call(server, 'tools/list', {}, 5000);
    assert(list.result.tools[0].name === 'echo', 'tools/list did not return the tool');

    const callResult = await call(
      server,
      'tools/call',
      { name: 'echo', arguments: { b: 2 } },
      5000
    );
    assert(
      callResult.result.content[0].text === 'echo:{"b":2}',
      `tools/call mismatch: ${JSON.stringify(callResult.result)}`
    );
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('SSE responses are parsed correctly', async () => {
  const stub = await startMcpStub({ sse: true });
  const server = serverRecord(stub);

  try {
    const result = await call(server, 'tools/list', {}, 5000);
    assert(
      result.result.tools.some((tool) => tool.name === 'echo'),
      'SSE response was not parsed'
    );
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('credentials are forwarded on every request including initialize', async () => {
  const stub = await startMcpStub({ requireAuth: 'Bearer conformance-token' });
  const server = serverRecord(stub, {
    auth_type: 'bearer',
    auth_config: { token: 'conformance-token' },
  });

  try {
    const result = await call(server, 'tools/list', {}, 5000);
    assert(result.result.tools.length === 1, 'authenticated call failed');
    assert(stub.stats.initializes === 1, 'initialize was not authenticated');
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('closeSession terminates the remote session', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    await ensureSession(server, 5000);
    await closeSession(server);
    assert(stub.stats.sessionDeletes === 1, `expected 1 DELETE, got ${stub.stats.sessionDeletes}`);
    assert(describeSession(server) === null, 'local session cache was not cleared');
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('a forgotten session is re-initialized once (404/400 recovery)', async () => {
  const stub = await startMcpStub();
  const server = serverRecord(stub);

  try {
    await call(server, 'tools/list', {}, 5000);
    // Simulate the server evicting the session.
    await fetch(stub.url, {
      method: 'DELETE',
      headers: { 'mcp-session-id': describeSession(server).sessionId },
    });

    const result = await call(server, 'tools/list', {}, 5000);
    assert(result.result.tools.length === 1, 'recovery call failed');
    assert(
      stub.stats.initializes === 2,
      `expected a second initialize, got ${stub.stats.initializes}`
    );
  } finally {
    resetSession('srv_conformance');
    await stub.close();
  }
});

await test('initialize errors are surfaced, not silently retried', async () => {
  const stub = await startMcpStub({ failInitialize: true });
  const server = serverRecord(stub);

  try {
    let error = null;
    try {
      await call(server, 'tools/list', {}, 5000);
    } catch (err) {
      error = err;
    }
    assert(error, 'a failing initialize was not surfaced');
    assert(/initialize refused/.test(error.message), `unexpected error: ${error.message}`);
    assert(stub.stats.toolListCalls === 0, 'tools/list ran without a session');
  } finally {
    resetSession('srv_conformance');
    resetCircuitBreaker('srv_conformance');
    await stub.close();
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
