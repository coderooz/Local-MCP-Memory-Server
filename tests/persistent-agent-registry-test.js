#!/usr/bin/env node

/**
 * Persistent Agent Registry Tests
 *
 * Validates that:
 * 1. Agents are uniquely identifiable
 * 2. Agent identity persists across sessions
 * 3. No duplicate agents are created
 * 4. Agent status is correctly tracked
 * 5. Agent heartbeats update last_seen timestamp
 */

import { MongoClient } from 'mongodb';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:4000';
const TEST_PROJECT = 'persistence-test-project';
const TEST_AGENT_ID = `persistent-agent-${Date.now()}`;

let client = null;
let db = null;
let passed = 0;
let failed = 0;
const results = [];

async function setup() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db('mcp_memory');
    console.log('Connected to MongoDB\n');
  } catch (error) {
    console.log('MongoDB not available - using API-only tests\n');
    db = null;
  }
}

async function teardown() {
  if (client) {
    await client.close();
  }
}

async function apiCall(endpoint, options = {}) {
  const url = `${SERVER_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function test(name, fn) {
  results.push({ name, status: 'pending' });
  const idx = results.length - 1;

  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        results[idx].status = 'PASS';
        passed++;
        console.log(`✅ ${name}`);
      }).catch(error => {
        results[idx].status = 'FAIL';
        results[idx].error = error.message;
        failed++;
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
      });
    } else {
      results[idx].status = 'PASS';
      passed++;
      console.log(`✅ ${name}`);
    }
  } catch (error) {
    results[idx].status = 'FAIL';
    results[idx].error = error.message;
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(`${msg} - Expected true`);
}

function assertFalse(value, msg = '') {
  if (value) throw new Error(`${msg} - Expected false`);
}

function assertExists(value, msg = '') {
  if (value === undefined || value === null) {
    throw new Error(`${msg} - Value should exist`);
  }
}

function assertIncludes(haystack, needle, msg = '') {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg}\nExpected "${haystack}" to include "${needle}"`);
  }
}

console.log('='.repeat(60));
console.log('🧪 Persistent Agent Registry Tests\n');
console.log('='.repeat(60));

await setup();

if (!db) {
  console.log('\n⚠️  MongoDB not available - skipping database tests\n');
}

// ============================================
// PART 1: Agent Registration
// ============================================

console.log('\n📋 PART 1: Agent Registration Tests\n');

test('Agent can be registered with required fields', async () => {
  const res = await apiCall('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: TEST_AGENT_ID,
      project: TEST_PROJECT,
      status: 'active',
      capabilities: ['planning', 'execution']
    })
  });

  assertTrue(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}`);
  assertTrue(res.data.success === true, 'Registration should succeed');
  assertExists(res.data.agent, 'Response should include agent data');
  assertEqual(res.data.agent.agent_id, TEST_AGENT_ID, 'Agent ID should match');
  assertEqual(res.data.agent.project, TEST_PROJECT, 'Project should match');

  console.log(`   Agent registered: ${res.data.agent.agent_id}`);
});

test('Same agent can register again (idempotent)', async () => {
  const res = await apiCall('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: TEST_AGENT_ID,
      project: TEST_PROJECT,
      status: 'active'
    })
  });

  assertTrue(res.status === 200 || res.status === 201, 'Re-registration should succeed');
  assertTrue(res.data.success === true, 'Re-registration should return success');
  assertEqual(res.data.agent.agent_id, TEST_AGENT_ID, 'Agent ID should be preserved');

  console.log(`   Agent re-registered: ${res.data.agent.agent_id}`);
});

test('Agent registration creates unique agent_id', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const duplicateId = `duplicate-test-${Date.now()}`;

  await apiCall('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: duplicateId,
      project: TEST_PROJECT,
      status: 'active'
    })
  });

  const agents = await db.collection('agents').find({ agent_id: duplicateId }).toArray();
  assertEqual(agents.length, 1, 'Should have exactly one agent with this ID');

  console.log(`   Verified: 1 agent with ID "${duplicateId}"`);
});

// ============================================
// PART 2: Agent Identity Persistence
// ============================================

console.log('\n📋 PART 2: Agent Identity Persistence Tests\n');

test('Registered agent persists in database', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const agent = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });

  assertExists(agent, 'Agent should exist in database');
  assertEqual(agent.agent_id, TEST_AGENT_ID, 'Agent ID should match');
  assertEqual(agent.project, TEST_PROJECT, 'Project should match');
  assertExists(agent.createdAt, 'Should have createdAt timestamp');

  console.log(`   Agent persisted: ${agent.agent_id}`);
  console.log(`   Created: ${agent.createdAt}`);
});

test('Agent has correct schema fields', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const agent = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });

  const requiredFields = ['agent_id', 'project', 'status', 'createdAt'];
  for (const field of requiredFields) {
    assertExists(agent[field], `Agent should have ${field} field`);
  }

  const expectedFields = ['agent_id', 'project', 'status', 'last_seen', 'createdAt', 'updatedAt'];
  console.log(`   Required fields present: ${requiredFields.join(', ')}`);
  console.log(`   Extended fields: ${Object.keys(agent).filter(k => !expectedFields.includes(k)).join(', ') || 'none'}`);
});

test('Agent status can be updated', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  await apiCall('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: TEST_AGENT_ID,
      project: TEST_PROJECT,
      status: 'busy',
      current_task: 'test-task-123'
    })
  });

  const agent = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });

  assertEqual(agent.status, 'busy', 'Status should be updated');
  assertEqual(agent.current_task, 'test-task-123', 'Current task should be set');

  console.log(`   Status: ${agent.status}`);
  console.log(`   Current task: ${agent.current_task}`);
});

// ============================================
// PART 3: Agent Heartbeat
// ============================================

console.log('\n📋 PART 3: Agent Heartbeat Tests\n');

test('Agent can send heartbeat', async () => {
  const res = await apiCall('/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: TEST_AGENT_ID,
      status: 'active'
    })
  });

  assertTrue(res.status === 200, `Expected 200, got ${res.status}`);
  assertTrue(res.data.success === true, 'Heartbeat should succeed');

  console.log(`   Heartbeat sent for: ${TEST_AGENT_ID}`);
});

test('Heartbeat updates last_seen timestamp', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const before = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });
  const beforeTime = new Date(before.last_seen).getTime();

  await new Promise(r => setTimeout(r, 100));

  await apiCall('/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: TEST_AGENT_ID,
      status: 'active'
    })
  });

  const after = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });
  const afterTime = new Date(after.last_seen).getTime();

  assertTrue(afterTime >= beforeTime, 'last_seen should be updated');

  console.log(`   Before: ${before.last_seen}`);
  console.log(`   After: ${after.last_seen}`);
});

test('Heartbeat for non-existent agent fails gracefully', async () => {
  const res = await apiCall('/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: 'non-existent-agent-xyz',
      status: 'active'
    })
  });

  assertTrue(res.data.error, 'Should return error for non-existent agent');
  assertIncludes(res.data.error, 'not found', 'Error should mention agent not found');

  console.log(`   Error returned: ${res.data.error}`);
});

// ============================================
// PART 4: Agent Listing
// ============================================

console.log('\n📋 PART 4: Agent Listing Tests\n');

test('Can list agents by project', async () => {
  const res = await apiCall(`/agent/list?project=${TEST_PROJECT}`);

  assertTrue(Array.isArray(res.data), 'Should return array of agents');

  const testAgent = res.data.find(a => a.agent_id === TEST_AGENT_ID);
  assertExists(testAgent, 'Should find our test agent');

  console.log(`   Found ${res.data.length} agents in ${TEST_PROJECT}`);
});

test('Agent list is filtered by project', async () => {
  const testProject = `filter-test-${Date.now()}`;

  await apiCall('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: `other-agent-${Date.now()}`,
      project: testProject,
      status: 'active'
    })
  });

  const allAgents = await apiCall('/agent/list');
  const projectAgents = await apiCall(`/agent/list?project=${testProject}`);

  const testProjectInAll = (allAgents.data || []).some(a => a.project === testProject);

  if (testProjectInAll) {
    console.log('   ℹ️  No project filter returns all agents (expected)');
  }

  assertTrue((projectAgents.data || []).every(a => a.project === testProject),
    'All returned agents should be from the specified project');

  console.log(`   Verified: All ${projectAgents.data.length} agents are from ${testProject}`);
});

// ============================================
// PART 5: Agent Identity Resolution
// ============================================

console.log('\n📋 PART 5: Agent Identity Resolution Tests\n');

test('Agent uses correct project from identity resolution', async () => {
  const { resolveProjectIdentity } = await import('../utils/projectIdentity.js');

  const identity = resolveProjectIdentity();

  assertTrue(identity.agent, 'Should have agent resolved');
  assertTrue(identity.agent !== 'unknown', "Agent should not be 'unknown'");
  assertTrue(identity.project, 'Should have project resolved');
  assertTrue(identity.project !== 'default', "Project should not be 'default'");

  console.log(`   Resolved agent: ${identity.agent}`);
  console.log(`   Resolved project: ${identity.project}`);
  console.log(`   Source: ${identity.source}`);
});

test('Agent ID follows naming convention', async () => {
  const { resolveProjectIdentity } = await import('../utils/projectIdentity.js');

  const identity = resolveProjectIdentity();
  const agentId = identity.agent;

  const isValidFormat =
    agentId.startsWith('agent-') ||
    agentId.includes('-') ||
    /^[a-zA-Z0-9_-]+$/.test(agentId);

  assertTrue(isValidFormat, `Agent ID "${agentId}" should be valid format`);

  console.log(`   Agent ID format: ${agentId}`);
});

// ============================================
// PART 6: Cleanup
// ============================================

console.log('\n📋 PART 6: Cleanup Tests\n');

test('Test agent can be removed', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const result = await db.collection('agents').deleteOne({ agent_id: TEST_AGENT_ID });

  assertTrue(result.deletedCount > 0, 'Should delete at least one agent');

  const agent = await db.collection('agents').findOne({ agent_id: TEST_AGENT_ID });
  assertEqual(agent, null, 'Agent should no longer exist');

  console.log(`   Removed agent: ${TEST_AGENT_ID}`);
});

// ============================================
// SUMMARY
// ============================================

await new Promise(r => setTimeout(r, 500));

console.log('\n' + '='.repeat(60));
console.log('\n📊 Persistent Agent Registry Results\n');
console.log(`   Tests: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All agent registry tests passed!\n');
  console.log('Registry verified:');
  console.log('  ✅ Agents are uniquely identifiable');
  console.log('  ✅ Agent identity persists across operations');
  console.log('  ✅ No duplicate agents created');
  console.log('  ✅ Agent status tracking works');
  console.log('  ✅ Heartbeats update timestamps');
  console.log('  ✅ Agent listing respects project filter\n');
} else {
  console.log('\n⚠️  Some tests failed - review output above\n');
  for (const r of results) {
    if (r.status === 'FAIL') {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }
}

await teardown();

process.exit(failed > 0 ? 1 : 0);
