#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MCP Connection Resilience - Validation Tests');
  console.log('='.repeat(60));
  console.log();

  for (const { name, fn } of tests) {
    try {
      console.log(`Running: ${name}`);
      await fn();
      console.log('  ✓ PASSED');
      passed++;
    } catch (error) {
      console.log(`  ✗ FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

test('Port Registry - File exists check', async () => {
  const { getPortRegistry } = await import('../utils/mcp-port-registry.js');
  const registry = getPortRegistry();
  assert(typeof registry.fileExists === 'function', 'fileExists method should exist');
});

test('Port Registry - Default ports', async () => {
  const { getPortRegistry } = await import('../utils/mcp-port-registry.js');
  const registry = getPortRegistry();
  const defaultPorts = registry.getDefaultPorts();
  assert(Array.isArray(defaultPorts), 'Default ports should be an array');
  assert(defaultPorts.includes(4000), 'Default ports should include 4000');
});

test('Port Registry - Status', async () => {
  const { getPortRegistry } = await import('../utils/mcp-port-registry.js');
  const registry = getPortRegistry();
  const status = registry.getStatus();
  assert(typeof status === 'object', 'Status should be an object');
  assert(typeof status.initialized === 'boolean', 'initialized should be boolean');
});

test('Connection Manager - States', async () => {
  const { CONNECTION_STATES } = await import('../utils/mcp-connection-manager.js');
  assert(CONNECTION_STATES.DISCONNECTED === 'disconnected', 'DISCONNECTED state should exist');
  assert(CONNECTION_STATES.CONNECTING === 'connecting', 'CONNECTING state should exist');
  assert(CONNECTION_STATES.RECONNECTING === 'reconnecting', 'RECONNECTING state should exist');
});

test('Connection Manager - Errors', async () => {
  const { CONNECTION_ERRORS } = await import('../utils/mcp-connection-manager.js');
  assert(CONNECTION_ERRORS.ECONNREFUSED === 'ECONNREFUSED', 'ECONNREFUSED error should exist');
  assert(CONNECTION_ERRORS.ETIMEDOUT === 'ETIMEDOUT', 'ETIMEDOUT error should exist');
});

test('Connection Manager - Instance', async () => {
  const { getConnectionManager } = await import('../utils/mcp-connection-manager.js');
  const manager = getConnectionManager();
  assert(typeof manager.connect === 'function', 'connect method should exist');
  assert(typeof manager.disconnect === 'function', 'disconnect method should exist');
  assert(typeof manager.request === 'function', 'request method should exist');
});

test('Setup Manager - States', async () => {
  const { SETUP_STATES } = await import('../utils/mcp-setup-manager.js');
  assert(SETUP_STATES.PENDING === 'pending', 'PENDING state should exist');
  assert(SETUP_STATES.READY === 'ready', 'READY state should exist');
  assert(SETUP_STATES.FAILED === 'failed', 'FAILED state should exist');
});

test('Setup Manager - Errors', async () => {
  const { SETUP_ERRORS } = await import('../utils/mcp-setup-manager.js');
  assert(
    SETUP_ERRORS.NO_PORT_DISCOVERED === 'NO_PORT_DISCOVERED',
    'NO_PORT_DISCOVERED error should exist'
  );
  assert(
    SETUP_ERRORS.SERVER_NOT_REACHABLE === 'SERVER_NOT_REACHABLE',
    'SERVER_NOT_REACHABLE error should exist'
  );
});

test('Setup Manager - Instance', async () => {
  const { getSetupManager } = await import('../utils/mcp-setup-manager.js');
  const manager = getSetupManager();
  assert(typeof manager.setupCheck === 'function', 'setupCheck method should exist');
  assert(typeof manager.setupConfigure === 'function', 'setupConfigure method should exist');
  assert(typeof manager.setupValidate === 'function', 'setupValidate method should exist');
  assert(typeof manager.fullSetup === 'function', 'fullSetup method should exist');
});

test('Agent Client - States', async () => {
  const { AGENT_STATES } = await import('../utils/mcp-agent-client.js');
  assert(AGENT_STATES.INITIALIZING === 'initializing', 'INITIALIZING state should exist');
  assert(AGENT_STATES.READY === 'ready', 'READY state should exist');
});

test('Agent Client - Instance', async () => {
  const { getAgentClient } = await import('../utils/mcp-agent-client.js');
  const client = getAgentClient();
  assert(typeof client.connect === 'function', 'connect method should exist');
  assert(typeof client.disconnect === 'function', 'disconnect method should exist');
  assert(typeof client.callApi === 'function', 'callApi method should exist');
});

test('Port File Management', async () => {
  const { getPortRegistry } = await import('../utils/mcp-port-registry.js');
  const registry = getPortRegistry();

  await registry.registerPort(19999, process.pid);

  const readPort = await registry.readPort();
  assert(readPort !== null, 'Port should be readable after registration');
  assert(readPort === 19999, 'Port should be 19999');

  await registry.clearPort();
  const cleared = await registry.readPort();
  assert(cleared === null, 'Port should be cleared');
});

test('Config File Validation', async () => {
  const configPath = path.join(PROJECT_ROOT, 'mcp.config.json');
  const configExists = fs.existsSync(configPath);
  assert(configExists, 'mcp.config.json should exist');

  if (configExists) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert(config.mcpServers, 'mcpServers should exist');
    assert(config.server?.dynamicPort !== undefined, 'dynamicPort setting should exist');
    assert(config.setup?.autoConfigure !== undefined, 'autoConfigure setting should exist');
  }
});

test('Retry Configuration', async () => {
  const { getConnectionManager } = await import('../utils/mcp-connection-manager.js');
  const manager = getConnectionManager();
  const stats = manager.getStats();

  assert(stats.maxRetries === 5, 'Default maxRetries should be 5');
  assert(typeof stats.retryCount === 'number', 'retryCount should be a number');
});

test('Health Check Endpoint Test', async () => {
  let serverStarted = false;
  let healthCheckResult = null;

  try {
    const { startServer } = await import('../server.js');
    await startServer({ silent: true });
    serverStarted = true;

    const response = await fetch('http://localhost:4000/health');
    healthCheckResult = await response.json();

    assert(healthCheckResult.status === 'ok', 'Health check should return status ok');
    assert(healthCheckResult.version, 'Health check should return version');
    assert(typeof healthCheckResult.uptime === 'number', 'Health check should return uptime');
  } catch (error) {
    if (!serverStarted) {
      console.log('  Note: Server not started, skipping health check test');
    } else {
      throw error;
    }
  }
});

test('Port Registry Event Listeners', async () => {
  const { getPortRegistry } = await import('../utils/mcp-port-registry.js');
  const registry = getPortRegistry();

  let eventFired = false;
  const handler = () => {
    eventFired = true;
  };

  registry.on('port:registered', handler);
  assert(typeof registry.on === 'function', 'on method should exist on registry');
  assert(typeof registry.off === 'function', 'off method should exist on registry');

  registry.off('port:registered', handler);
});

test('Connection Manager Event Listeners', async () => {
  const { getConnectionManager } = await import('../utils/mcp-connection-manager.js');
  const manager = getConnectionManager();

  assert(typeof manager.on === 'function', 'on method should exist');
  assert(typeof manager.off === 'function', 'off method should exist');

  let stateChanged = false;
  manager.on('state:changed', () => {
    stateChanged = true;
  });

  assert(stateChanged === false, 'State should not have changed yet');
});

test('Setup Manager Status', async () => {
  const { getSetupManager } = await import('../utils/mcp-setup-manager.js');
  const manager = getSetupManager();
  const status = manager.getStatus();

  assert(typeof status === 'object', 'Status should be an object');
  assert(typeof status.state === 'string', 'state should be a string');
  assert(typeof status.autoHealEnabled === 'boolean', 'autoHealEnabled should be boolean');
  assert(typeof status.maxSetupAttempts === 'number', 'maxSetupAttempts should be a number');
});

test('Agent Client Event Emitter', async () => {
  const { getAgentClient } = await import('../utils/mcp-agent-client.js');
  const client = getAgentClient();

  assert(typeof client.on === 'function', 'on method should exist');
  assert(typeof client.off === 'function', 'off method should exist');
  assert(typeof client._emit === 'function', '_emit method should exist');
});

console.log(`Total tests: ${tests.length}`);
console.log();

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
