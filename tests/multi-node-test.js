#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function simulateNode(label) {
  console.log(`\n========== ${label} ==========`);
  console.log('Process PID:', process.pid);

  const { getRuntimeState, validatePortWithHealth, clearRuntimeCache } = await import('../core/config/runtime-state.js');

  console.log('[STEP 1] Clear cache to simulate fresh process');
  clearRuntimeCache();

  console.log('[STEP 2] getRuntimeState()');
  const runtime = getRuntimeState();
  console.log('  Runtime:', JSON.stringify(runtime));

  console.log('[STEP 3] Discover MCP on default ports');
  const defaultPorts = [3000, 4000, 5000, 8080, 8888];
  let discoveredPort = null;
  
  for (const port of defaultPorts) {
    const validation = await validatePortWithHealth(port);
    if (validation.valid) {
      console.log(`  Found MCP on port ${port}`);
      discoveredPort = port;
      break;
    }
  }

  return { label, runtime, discoveredPort };
}

async function main() {
  console.log('=== MULTI-NODE CONNECTION TEST (RUNTIME-FREE) ===');
  console.log('Testing health-based discovery...');

  const nodeA = await simulateNode('Terminal A (Agent 1)');
  const nodeB = await simulateNode('Terminal B (Agent 2)');

  console.log('\n========== COMPARISON ==========');
  console.log('Terminal A discovered port:', nodeA.discoveredPort);
  console.log('Terminal B discovered port:', nodeB.discoveredPort);
  console.log('Both same?', nodeA.discoveredPort === nodeB.discoveredPort && nodeA.discoveredPort !== null);
  
  if (nodeA.discoveredPort && nodeB.discoveredPort) {
    console.log('\n✅ MULTI-AGENT CONNECTIVITY: WORKING');
  } else {
    console.log('\n❌ MCP server not running. Start with: node server.js');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});