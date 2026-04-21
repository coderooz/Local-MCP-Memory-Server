#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = __dirname;

const MCP_PROJECT = process.env.MCP_PROJECT || 'local-mcp-memory';
const MCP_SCOPE = process.env.MCP_SCOPE || 'project';

console.log('='.repeat(60));
console.log('MCP PROJECT CONFIGURATION');
console.log('='.repeat(60));
console.log('PROJECT:', MCP_PROJECT);
console.log('SCOPE:', MCP_SCOPE);
console.log('ROOT:', PROJECT_ROOT);
console.log('='.repeat(60));

async function loadProjectConfig() {
  const { getProjectConfig, getConfigValue } = await import('../core/config/project-config-loader.js');

  const config = getProjectConfig();
  console.log('\n[CONFIG] Loaded:', JSON.stringify({
    project: config.project,
    mcp: config.mcp,
    agents: config.agent
  }, null, 2));

  return config;
}

async function checkRuntimeState() {
  const { getRuntimeState, getRuntimeFilePath } = await import('../core/config/runtime-state.js');

  console.log('\n[RUNTIME] File path:', getRuntimeFilePath());
  const runtime = getRuntimeState();
  console.log('[RUNTIME] State:', JSON.stringify(runtime, null, 2));

  return runtime;
}

async function startMcpServer() {
  console.log('\n[SERVER] Starting MCP server...');
  console.log('[SERVER] Using runtime:', process.env.MCP_RUNTIME_FILE || '.mcp-runtime.json');

  const { startServer } = await import('../server.js');

  try {
    const server = await startServer({
      silent: true,
      autoDiscoverPort: true,
      healthCheck: true
    });

    console.log('[SERVER] Started on port:', server.port);
    console.log('[SERVER] Database:', server.db.databaseName);

    return server;
  } catch (error) {
    console.error('[SERVER] Failed to start:', error.message);
    throw error;
  }
}

async function connectToMcp(options = {}) {
  console.log('\n[CLIENT] Connecting to MCP server...');

  const { getConnectionManager } = await import('../utils/mcp-connection-manager.js');
  const cm = getConnectionManager();

  try {
    const result = await cm.connect(options);
    console.log('[CLIENT] Connected:', result.port, '-', result.baseUrl);
    return result;
  } catch (error) {
    console.error('[CLIENT] Connection failed:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'help';

  console.log('\n[ACTION]', action);

  switch (action) {
    case 'config':
      await loadProjectConfig();
      break;

    case 'runtime':
      await checkRuntimeState();
      break;

    case 'start':
      await loadProjectConfig();
      await startMcpServer();
      await checkRuntimeState();
      break;

    case 'connect':
      await loadProjectConfig();
      await checkRuntimeState();
      await connectToMcp();
      break;

    case 'status':
      const config = await loadProjectConfig();
      const runtime = await checkRuntimeState();
      console.log('\n[STATUS]');
      console.log('  Project:', MCP_PROJECT);
      console.log('  Scope:', MCP_SCOPE);
      console.log('  MCP Status:', runtime.status);
      console.log('  Port:', runtime.port);
      console.log('  PID:', runtime.pid);
      break;

    case 'help':
    default:
      console.log(`
USAGE: node project-mcp-setup.js <action>

ACTIONS:
  config     - Load and display project configuration
  runtime    - Check runtime state file
  start      - Start MCP server with project config
  connect    - Connect to running MCP server
  status     - Show MCP and project status
  help       - Show this help

EXAMPLES:
  # Check project configuration
  node scripts/project-mcp-setup.js config

  # Start MCP server
  node scripts/project-mcp-setup.js start

  # Connect to MCP server (from another terminal)
  node scripts/project-mcp-setup.js connect

  # Check status
  node scripts/project-mcp-setup.js status

ENVIRONMENT:
  MCP_PROJECT=my-project    # Project name
  MCP_SCOPE=project        # project|global
  MCP_SERVER_URL=...        # Server URL override
`);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});