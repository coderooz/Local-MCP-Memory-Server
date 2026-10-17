#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import { initializeDatabase, getDatabase } from '../src/core/database/sqlite/index.js';
import {
  registerServer,
  getServer,
  getServerRaw,
  listServers,
  updateServer,
  unregisterServer,
  connectToServer,
  disconnectFromServer,
  proxyToolCall,
  startHealthSweep,
  stopHealthSweep,
  getDiscoveredTools,
  isProxiedTool,
  parseProxiedToolName,
  callProxiedTool,
} from '../src/core/mcp-registry/index.js';
import { handleMCPRegistryTool, getMCPRegistryTools } from '../tools/mcpRegistryTools.js';
import {
  proxyRequest,
  getCircuitState,
  configureCircuitBreaker,
  resetCircuitBreaker,
  BREAKER_DEFAULTS,
  scrubSecrets,
} from '../src/core/mcp-registry/proxy.js';
import {
  encryptAuthConfig,
  decryptAuthConfig,
  isEncrypted,
  getEncryptionStatus,
} from '../src/core/mcp-registry/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          console.log(`✓ ${name}`);
          passed++;
        })
        .catch((error) => {
          console.error(`✗ ${name}`);
          console.error(`  Error: ${error.message}`);
          failed++;
        });
    }
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('=== MCP Registry Tests ===\n');

  // Initialize database for tests
  const dbPath = path.join(__dirname, '..', 'data', 'test-mcp-registry.db');
  await initializeDatabase(dbPath);
  console.log('Database initialized\n');

  // Test 1: Register a server
  await test('registerServer should create a server record', async () => {
    const result = await registerServer({
      project: 'test-project',
      name: 'Test MCP Server',
      type: 'stdio',
      command: 'node',
      args: ['test-server.js'],
      description: 'A test server for unit tests',
    });
    assert(result.server_id, 'Server ID should be generated');
    assert(result.name === 'Test MCP Server', 'Name should match');
    assert(result.status === 'registered', 'Initial status should be registered');
  });

  // Test 2: Get server by ID
  await test('getServer should return the server', async () => {
    const servers = await listServers({ project: 'test-project' });
    assert(servers.length > 0, 'Should have at least one server');
    const server = await getServer(servers[0].server_id);
    assert(server, 'Server should exist');
    assert(server.name === servers[0].name, 'Name should match');
  });

  // Test 3: List servers with project filter
  await test('listServers should filter by project', async () => {
    const servers = await listServers({ project: 'test-project' });
    assert(servers.length >= 1, 'Should have at least one server for test-project');
    for (const s of servers) {
      assert(s.project === 'test-project', 'All servers should belong to test-project');
    }
  });

  // Test 4: Mask auth config in response
  await test('registerServer should mask sensitive auth fields', async () => {
    const result = await registerServer({
      project: 'test-project',
      name: 'Auth Server',
      type: 'http',
      url: 'http://localhost:3001',
      auth_config: {
        api_key: 'secret-api-key-12345',
        token: 'bearer-token-xyz',
      },
    });
    const server = await getServer(result.server_id);
    assert(server.auth_config, 'Auth config should exist');
    assert(server.auth_config.api_key === 'secr****', 'API key should be masked');
    assert(server.auth_config.token === 'bear****', 'Token should be masked');
  });

  // Test 5: Update server
  await test('updateServer should modify server fields', async () => {
    const servers = await listServers({ project: 'test-project' });
    const serverId = servers[0].server_id;
    const result = await updateServer(serverId, {
      name: 'Updated Test Server',
      env: { TEST_VAR: 'value123' },
    });
    assert(result.name === 'Updated Test Server', 'Name should be updated');
    assert(result.env && result.env.TEST_VAR === 'value123', 'Env should be set');
  });

  // Test 6: Unregister server
  await test('unregisterServer should remove the server', async () => {
    const servers = await listServers({ project: 'test-project' });
    const authServer = servers.find((s) => s.name === 'Auth Server');
    assert(authServer, 'Should find the Auth Server');
    const result = await unregisterServer(authServer.server_id);
    assert(result.success === true, 'Unregister should succeed');
    const check = await getServer(authServer.server_id);
    assert(check === null, 'Server should no longer exist');
  });

  // Test 7: Dynamic tool cache operations
  await test('getDiscoveredTools should return empty array initially', () => {
    const tools = getDiscoveredTools();
    assert(Array.isArray(tools), 'Should return an array');
  });

  // Test 8: isProxiedTool should detect proxied tool names
  await test('isProxiedTool should detect mcp__serverId__toolName pattern', () => {
    assert(isProxiedTool('mcp__srv_abc123__myTool') === true, 'Should detect valid proxied tool');
    assert(
      isProxiedTool('mcp__memory__store_context') === true,
      'Should detect double underscore format'
    );
    assert(isProxiedTool('regular_tool') === false, 'Should not detect regular tools');
    assert(isProxiedTool('mcp_') === false, 'Should not detect single underscore');
  });

  // Test 9: parseProxiedToolName
  await test('parseProxiedToolName should extract server ID and tool name', () => {
    const result = parseProxiedToolName('mcp__srv_abc123__myTool');
    assert(result.server_id === 'srv_abc123', 'Server ID should be extracted');
    assert(result.original_name === 'myTool', 'Tool name should be extracted');

    const result2 = parseProxiedToolName('mcp__memory__store_context');
    assert(result2.server_id === 'memory', 'Should handle underscore IDs');
    assert(result2.original_name === 'store_context', 'Should extract tool name with underscore');

    const result3 = parseProxiedToolName('invalid_tool');
    assert(result3 === null, 'Should return null for invalid format');
  });

  // Test 10: callProxiedTool should fail for disconnected server
  await test('callProxiedTool should fail for non-existent server', async () => {
    const result = await callProxiedTool('mcp__nonexistent__tool', {});
    assert(result.success === false, 'Should return success false');
    assert(result.error, 'Should have error message');
  });

  // Test 11: Multiple projects isolation
  await test('Servers should be isolated by project', async () => {
    await registerServer({
      project: 'project-a',
      name: 'Server A',
      type: 'stdio',
      command: 'echo',
    });
    await registerServer({
      project: 'project-b',
      name: 'Server B',
      type: 'stdio',
      command: 'echo',
    });

    const serversA = await listServers({ project: 'project-a' });
    const serversB = await listServers({ project: 'project-b' });

    assert(serversA.length >= 1, 'Project A should have servers');
    assert(serversB.length >= 1, 'Project B should have servers');

    for (const s of serversA) {
      assert(s.project === 'project-a', 'All servers should belong to project-a');
    }
    for (const s of serversB) {
      assert(s.project === 'project-b', 'All servers should belong to project-b');
    }
  });

  // Test 12 [G1 regression]: proxyToolCall must send REAL credentials upstream
  await test('proxyToolCall sends real (unmasked) bearer token upstream [G1]', async () => {
    const http = await import('node:http');
    let receivedAuth = null;

    const mock = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        receivedAuth = req.headers['authorization'] || null;
        let rpc = {};
        try {
          rpc = JSON.parse(body);
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id || 1,
            result: { content: [{ type: 'text', text: 'ok' }] },
          })
        );
      });
    });

    await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const port = mock.address().port;

    try {
      const reg = await registerServer({
        project: 'test-project',
        name: 'Bearer Mock Server',
        type: 'http',
        url: `http://127.0.0.1:${port}`,
        auth_type: 'bearer',
        auth_config: { token: 'real-token-abc123' },
      });

      const result = await proxyToolCall(reg.server_id, 'echo', { hi: 1 });
      assert(result.success === true, `Proxy should succeed, got: ${result.error}`);
      assert(
        receivedAuth === 'Bearer real-token-abc123',
        `Upstream must receive the real token, got: ${receivedAuth}`
      );

      // External surface stays masked; internal raw read is unmasked
      const masked = await getServer(reg.server_id);
      assert(
        masked.auth_config.token === 'real****',
        `External read must stay masked, got: ${masked.auth_config.token}`
      );
      const raw = await getServerRaw(reg.server_id);
      assert(
        raw.auth_config.token === 'real-token-abc123',
        'Raw internal read must return the real token'
      );

      await unregisterServer(reg.server_id);
    } finally {
      await new Promise((resolve) => mock.close(resolve));
    }
  });

  // Test 13 [G6 regression]: default project must match between register and list
  await test('list_mcp_servers with no project config finds default-registered servers [G6]', async () => {
    const reg = await handleMCPRegistryTool(
      'register_mcp_server',
      { name: 'Default Proj Server', type: 'stdio', command: 'echo' },
      {}
    );
    const regPayload = JSON.parse(reg.content[0].text);
    assert(regPayload.success === true, 'Register via MCP tool should succeed');

    const list = await handleMCPRegistryTool('list_mcp_servers', {}, {});
    const listPayload = JSON.parse(list.content[0].text);
    assert(listPayload.count >= 1, `Should find default-project servers, got ${listPayload.count}`);
    const found = (listPayload.servers || []).find((s) => s.name === 'Default Proj Server');
    assert(found, 'Default-registered server must be listed when no project is configured');

    await unregisterServer(found.server_id);
  });

  // Test 14 [G5 regression]: registry tool schemas must be validation-ready
  await test('registry tool schemas enforce required name and type enum [G5]', async () => {
    const tools = getMCPRegistryTools();
    assert(tools.length === 9, `Should expose 9 registry tools, got ${tools.length}`);

    const regTool = tools.find((t) => t.name === 'register_mcp_server');
    assert(regTool, 'register_mcp_server should exist');
    assert(
      Array.isArray(regTool.inputSchema.required) && regTool.inputSchema.required.includes('name'),
      "'name' must be required"
    );
    const typeProp = regTool.inputSchema.properties.type;
    assert(typeProp && Array.isArray(typeProp.enum), 'type must declare an enum');
    assert(
      typeProp.enum.includes('http') &&
        typeProp.enum.includes('sse') &&
        typeProp.enum.includes('stdio'),
      'enum must be http/sse/stdio'
    );

    // Every tool must carry an object inputSchema so getToolSchemaMap picks it up
    for (const t of tools) {
      assert(t.name && typeof t.name === 'string', 'each tool needs a name');
      assert(
        t.inputSchema && typeof t.inputSchema === 'object' && !Array.isArray(t.inputSchema),
        `tool ${t.name} needs an object inputSchema`
      );
    }
  });

  // Test 15 [G5 regression]: mcp-server.js schema map wiring includes registry tools
  await test('getToolSchemaMap wiring includes getMCPRegistryTools [G5]', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'mcp-server.js'), 'utf-8');
    const start = src.indexOf('function getToolSchemaMap');
    const end = src.indexOf('function resolveToolSchema');
    assert(start !== -1 && end !== -1 && end > start, 'Could not locate getToolSchemaMap source');
    const mapFn = src.slice(start, end);
    assert(
      mapFn.includes('getMCPRegistryTools()'),
      'getToolSchemaMap must spread getMCPRegistryTools() so registry tools get schema validation'
    );
  });

  // Test 16 [G3]: circuit breaker opens after threshold failures and recovers
  await test('circuit breaker opens after threshold failures and recovers via half-open probe [G3]', async () => {
    const http = await import('node:http');
    let mode = 'fail'; // 'fail' → HTTP 500, 'ok' → JSON-RPC success
    let requestCount = 0;

    const mock = http.createServer((req, res) => {
      requestCount++;
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (mode === 'fail') {
          res.statusCode = 500;
          res.end('boom');
          return;
        }
        let rpc = {};
        try {
          rpc = JSON.parse(body);
        } catch {
          /* ignore */
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id || 1, result: {} }));
      });
    });

    await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${mock.address().port}`;
    const raw = { server_id: 'srv_breaker_test', url, auth_type: 'none' };

    try {
      // 1) Trip the breaker: threshold consecutive failures
      for (let i = 0; i < BREAKER_DEFAULTS.failureThreshold; i++) {
        await proxyRequest(raw, { method: 'ping' }, 2000).catch(() => {});
      }
      assert(
        requestCount === BREAKER_DEFAULTS.failureThreshold,
        `Expected ${BREAKER_DEFAULTS.failureThreshold} requests, got ${requestCount}`
      );

      // 2) Fail fast — no network request while open
      let fastFail = null;
      await proxyRequest(raw, { method: 'ping' }, 2000).catch((e) => (fastFail = e));
      assert(
        fastFail && fastFail.code === 'CIRCUIT_OPEN',
        `Expected CIRCUIT_OPEN, got: ${fastFail?.message}`
      );
      assert(
        requestCount === BREAKER_DEFAULTS.failureThreshold,
        'Open breaker must not hit the network'
      );
      assert(getCircuitState('srv_breaker_test').state === 'open', 'State should be open');

      // 3) Half-open probe after cool-off → success closes the breaker
      mode = 'ok';
      configureCircuitBreaker({ coolOffMs: 50 });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const result = await proxyRequest(raw, { method: 'ping' }, 2000);
      assert(result && result.jsonrpc === '2.0', 'Half-open probe should succeed');
      assert(
        getCircuitState('srv_breaker_test').state === 'closed',
        'Breaker should close after successful probe'
      );
      assert(
        requestCount === BREAKER_DEFAULTS.failureThreshold + 1,
        'Exactly one probe request expected'
      );
    } finally {
      configureCircuitBreaker({ ...BREAKER_DEFAULTS });
      resetCircuitBreaker('srv_breaker_test');
      if (typeof mock.closeAllConnections === 'function') mock.closeAllConnections();
      await new Promise((resolve) => mock.close(resolve));
    }
  });

  // Test 17 [G3]: timeout policy enforced (no unbounded hangs)
  await test('proxyRequest enforces bounded timeout policy [G3]', async () => {
    const http = await import('node:http');
    const mock = http.createServer((req, res) => {
      // Never respond within the timeout window
      setTimeout(() => {
        try {
          res.end('{}');
        } catch {
          /* socket already closed */
        }
      }, 1000);
    });

    await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const raw = {
      server_id: 'srv_timeout_test',
      url: `http://127.0.0.1:${mock.address().port}`,
      auth_type: 'none',
    };

    try {
      const start = Date.now();
      let err = null;
      await proxyRequest(raw, { method: 'ping' }, 150).catch((e) => (err = e));
      const elapsed = Date.now() - start;

      assert(err, 'Timeout should reject');
      assert(/timed out/.test(err.message), `Expected timeout error, got: ${err.message}`);
      assert(elapsed < 900, `Should fail at ~150ms, took ${elapsed}ms`);
      assert(
        getCircuitState('srv_timeout_test').state !== 'open',
        'Single timeout should not trip the breaker'
      );
    } finally {
      resetCircuitBreaker('srv_timeout_test');
      if (typeof mock.closeAllConnections === 'function') mock.closeAllConnections();
      await new Promise((resolve) => mock.close(resolve));
    }
  });

  // Test 18 [G4]: crypto round-trip
  await test('crypto round-trip: encrypt → decrypt preserves object [G4]', async () => {
    const prev = process.env.MCP_MASTER_SECRET;
    process.env.MCP_MASTER_SECRET = 'unit-test-secret';
    try {
      const enc = encryptAuthConfig({ token: 'abc', password: 'p@ss' });
      assert(isEncrypted(enc), 'Should produce enc:v1: output');
      assert(
        !enc.includes('abc') && !enc.includes('p@ss'),
        'Ciphertext must not contain plaintext'
      );

      const dec = decryptAuthConfig(enc);
      assert(dec.token === 'abc' && dec.password === 'p@ss', 'Round trip must preserve values');
      assert(getEncryptionStatus() === 'enabled', 'Status should be enabled with secret');

      const enc2 = encryptAuthConfig({ token: 'abc', password: 'p@ss' });
      assert(enc !== enc2, 'IV must randomize ciphertext');

      // No-secret path degrades to plaintext JSON (dev ergonomics)
      delete process.env.MCP_MASTER_SECRET;
      const plain = encryptAuthConfig({ token: 'xyz' });
      assert(plain === JSON.stringify({ token: 'xyz' }), 'Without secret, store plaintext JSON');
      assert(getEncryptionStatus() === 'disabled', 'Status should be disabled without secret');
    } finally {
      if (prev === undefined) delete process.env.MCP_MASTER_SECRET;
      else process.env.MCP_MASTER_SECRET = prev;
    }
  });

  // Test 19 [G4]: auth_config encrypted at rest, still masked externally
  await test('auth_config is encrypted at rest and still masked on read [G4]', async () => {
    const prevSecret = process.env.MCP_MASTER_SECRET;
    process.env.MCP_MASTER_SECRET = 'test-master-secret-please-rotate';
    try {
      const reg = await registerServer({
        project: 'test-project',
        name: 'Encrypted Server',
        type: 'http',
        url: 'http://127.0.0.1:39999',
        auth_type: 'bearer',
        auth_config: { token: 'super-secret-token-999' },
      });

      // 1) Raw DB row holds ciphertext (inflation passes enc:v1: through)
      const db = getDatabase();
      const row = await db.collection('mcp_servers').findOne({ server_id: reg.server_id });
      assert(
        typeof row.auth_config === 'string' && row.auth_config.startsWith('enc:v1:'),
        `Expected enc:v1: ciphertext in DB, got: ${String(row.auth_config).slice(0, 40)}`
      );
      assert(
        !String(row.auth_config).includes('super-secret-token-999'),
        'Plaintext must not appear in raw DB value'
      );

      // 2) External read: decrypted then masked (object shape preserved)
      const masked = await getServer(reg.server_id);
      assert(
        masked.auth_config && typeof masked.auth_config === 'object',
        'Masked read should return an object'
      );
      assert(
        masked.auth_config.token === 'supe****',
        `Token should be masked, got: ${masked.auth_config.token}`
      );

      // 3) Internal read: real value for the proxy path
      const raw = await getServerRaw(reg.server_id);
      assert(
        raw.auth_config.token === 'super-secret-token-999',
        'Raw read must decrypt to the real token'
      );

      // 4) Updates re-encrypt
      await updateServer(reg.server_id, { auth_config: { token: 'rotated-token-111' } });
      const row2 = await db.collection('mcp_servers').findOne({ server_id: reg.server_id });
      assert(
        typeof row2.auth_config === 'string' && row2.auth_config.startsWith('enc:v1:'),
        'Updated credentials must be re-encrypted'
      );
      assert(!String(row2.auth_config).includes('rotated-token-111'), 'No updated plaintext leak');

      await unregisterServer(reg.server_id);
    } finally {
      if (prevSecret === undefined) delete process.env.MCP_MASTER_SECRET;
      else process.env.MCP_MASTER_SECRET = prevSecret;
    }
  });

  // Test 20 [G4]: legacy plaintext rows remain readable (no lockout)
  await test('legacy plaintext rows remain readable when secret is set [G4]', async () => {
    const db = getDatabase();
    const col = db.collection('mcp_servers');
    const legacyId = 'srv_legacy_test';
    await col.deleteOne({ server_id: legacyId }); // idempotent across reruns

    const ts = new Date().toISOString();
    await col.insertOne({
      id: legacyId,
      agent: 'test',
      project: 'test-project',
      sessionId: null,
      scope: 'private',
      server_id: legacyId,
      name: 'Legacy Server',
      type: 'http',
      command: null,
      url: 'http://127.0.0.1:39998',
      env: '{}',
      auth_type: 'bearer',
      auth_config: JSON.stringify({ token: 'legacy-plain-token' }),
      status: 'registered',
      health: JSON.stringify({ lastCheck: null, latency: null, errorCount: 0 }),
      capabilities: '[]',
      tags: '[]',
      metadata: '{}',
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    });

    const prevSecret = process.env.MCP_MASTER_SECRET;
    process.env.MCP_MASTER_SECRET = 'test-master-secret-please-rotate';
    try {
      const masked = await getServer(legacyId);
      assert(
        masked.auth_config?.token === 'lega****',
        `Legacy row must parse+mask, got: ${JSON.stringify(masked.auth_config)}`
      );
      const raw = await getServerRaw(legacyId);
      assert(
        raw.auth_config.token === 'legacy-plain-token',
        'Raw read of legacy row must return the real token'
      );
    } finally {
      if (prevSecret === undefined) delete process.env.MCP_MASTER_SECRET;
      else process.env.MCP_MASTER_SECRET = prevSecret;
      await unregisterServer(legacyId);
    }
  });

  // Test 21 [G4]: fail closed when secret disappears (no plaintext fallback)
  await test('ciphertext fails closed when MCP_MASTER_SECRET is missing [G4]', async () => {
    const prevSecret = process.env.MCP_MASTER_SECRET;
    process.env.MCP_MASTER_SECRET = 'test-master-secret-please-rotate';
    const reg = await registerServer({
      project: 'test-project',
      name: 'Lockout Server',
      type: 'http',
      url: 'http://127.0.0.1:39997',
      auth_type: 'bearer',
      auth_config: { token: 'lockout-token' },
    });

    try {
      delete process.env.MCP_MASTER_SECRET;

      let rawErr = null;
      await getServerRaw(reg.server_id).catch((e) => (rawErr = e));
      assert(
        rawErr && rawErr.code === 'ENCRYPTION_UNAVAILABLE',
        `Raw read must fail closed, got: ${rawErr?.code || 'no error'}`
      );

      const display = await getServer(reg.server_id);
      assert(
        display.auth_config?.encrypted === true && display.auth_config?.unavailable === true,
        'Display read must return a non-sensitive placeholder'
      );
      assert(
        JSON.stringify(display).indexOf('lockout-token') === -1,
        'No plaintext in display output'
      );
    } finally {
      if (prevSecret === undefined) delete process.env.MCP_MASTER_SECRET;
      else process.env.MCP_MASTER_SECRET = prevSecret;
      await unregisterServer(reg.server_id);
    }
  });

  // Test 22 [G8/G9]: HTTP routes enforce auth + project scoping
  await test('routes enforce 401/403 auth and project boundaries [G8][G9]', async () => {
    const { default: express } = await import('express');
    const { getAuthManager } = await import('../src/core/auth/index.js');
    const { registerMCPRegistryRoutes } = await import('../src/core/mcp-registry/routes.js');

    // Isolate API-key storage from the real data/api-keys.json
    const authManager = getAuthManager({
      dataDir: path.join(__dirname, '..', 'data', 'test-auth'),
    });

    const app = express();
    app.use(express.json());
    registerMCPRegistryRoutes(app);

    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const base = `http://127.0.0.1:${httpServer.address().port}`;

    const apiKey = authManager.createApiKey('registry-test-key', ['read', 'write'], null, 'proj-a');
    const tokenA = authManager.generateToken({ username: 'tester-a', project: 'proj-a' });
    const tokenB = authManager.generateToken({ username: 'tester-b', project: 'proj-b' });

    let createdId = null;

    try {
      // 1) No auth → 401
      const noAuth = await fetch(`${base}/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'no-auth-server' }),
      });
      assert(noAuth.status === 401, `Unauthenticated write must 401, got ${noAuth.status}`);

      // 2) Bad API key → 401
      const badKey = await fetch(`${base}/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'mcp_invalid_key' },
        body: JSON.stringify({ name: 'bad-key-server' }),
      });
      assert(badKey.status === 401, `Invalid key must 401, got ${badKey.status}`);

      // 3) Valid API key (scoped proj-a) → 201, server lands in proj-a
      const withKey = await fetch(`${base}/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey.key },
        body: JSON.stringify({ name: 'keyed-server', type: 'http' }),
      });
      assert(withKey.status === 201, `API-key write must 201, got ${withKey.status}`);
      const created = await withKey.json();
      createdId = created.server_id;
      assert(created, 'Server ID should be returned');

      // 4) Cross-project JWT PUT → 403
      const crossPut = await fetch(`${base}/mcp/servers/${createdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ name: 'hijacked' }),
      });
      assert(crossPut.status === 403, `Cross-project PUT must 403, got ${crossPut.status}`);

      // 5) Cross-project health trigger → 403 [G9 regression]
      const crossHealth = await fetch(`${base}/mcp/servers/${createdId}/health`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert(
        crossHealth.status === 403,
        `Cross-project health must 403, got ${crossHealth.status}`
      );

      // 6) Same-project JWT health → allowed (200)
      const sameHealth = await fetch(`${base}/mcp/servers/${createdId}/health`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert(sameHealth.status === 200, `Same-project health must 200, got ${sameHealth.status}`);

      // 7) Cross-project API key (scoped proj-b) DELETE → 403
      const keyB = authManager.createApiKey('cross-key', ['write'], null, 'proj-b');
      try {
        const crossDelete = await fetch(`${base}/mcp/servers/${createdId}`, {
          method: 'DELETE',
          headers: { 'X-API-Key': keyB.key },
        });
        assert(
          crossDelete.status === 403,
          `Cross-project API-key DELETE must 403, got ${crossDelete.status}`
        );
      } finally {
        authManager.revokeApiKey(keyB.key);
      }

      // 8) Same-scope API key DELETE → 200
      const del = await fetch(`${base}/mcp/servers/${createdId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey.key },
      });
      assert(del.status === 200, `Same-scope DELETE must 200, got ${del.status}`);
      createdId = null;
    } finally {
      if (createdId) await unregisterServer(createdId);
      authManager.revokeApiKey(apiKey.key);
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  // Test 23 [G8]: secret scrubbing in error output
  await test('scrubSecrets redacts credentials from error text [G8]', () => {
    const s1 = scrubSecrets('fetch failed: http://mcp.example.com/rpc?api_key=SECRET123&x=1');
    assert(!s1.includes('SECRET123'), `api_key query must be redacted, got: ${s1}`);

    const s2 = scrubSecrets('Unauthorized header: Bearer eyJhbGciOi.secret.value');
    assert(!s2.includes('eyJhbGciOi.secret.value'), `Bearer token must be redacted, got: ${s2}`);

    const s3 = scrubSecrets('HTTP 500: Internal Server Error');
    assert(s3 === 'HTTP 500: Internal Server Error', 'Benign messages must pass through');
  });

  // Test 24 [G15]: periodic health sweep updates connected servers
  await test('health sweep checks connected servers and updates lastCheck [G15]', async () => {
    const http = await import('node:http');
    const mock = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        let rpc = {};
        try {
          rpc = JSON.parse(body);
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id || 1, result: {} }));
      });
    });
    await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));

    const reg = await registerServer({
      project: 'test-project',
      name: 'Sweep Server',
      type: 'http',
      url: `http://127.0.0.1:${mock.address().port}`,
    });
    await updateServer(reg.server_id, { status: 'connected' });

    try {
      startHealthSweep(80);
      await new Promise((resolve) => setTimeout(resolve, 300));
      stopHealthSweep();

      const server = await getServer(reg.server_id);
      assert(server.health?.lastCheck, 'Sweep must update lastCheck');
      assert(typeof server.health.latency === 'number', 'Sweep must record latency');
      assert(server.status === 'connected', 'Healthy server stays connected');
    } finally {
      stopHealthSweep();
      await unregisterServer(reg.server_id);
      if (typeof mock.closeAllConnections === 'function') mock.closeAllConnections();
      await new Promise((resolve) => mock.close(resolve));
    }
  });

  // Print results
  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
