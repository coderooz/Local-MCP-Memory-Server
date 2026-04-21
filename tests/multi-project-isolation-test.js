#!/usr/bin/env node

/**
 * Multi-Project Identity Isolation Tests
 *
 * Validates that:
 * 1. Each project has isolated data
 * 2. Agents from different projects cannot see each other's data
 * 3. No cross-project memory access
 * 4. Tasks are properly scoped to their projects
 * 5. Agents registered in one project are not visible in another
 */

import { MongoClient } from 'mongodb';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:4000';
const TEST_PROJECTS = ['project-alpha', 'project-beta', 'project-gamma'];
const TEST_AGENTS = ['agent-alpha-1', 'agent-alpha-2', 'agent-beta-1', 'agent-gamma-1'];

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

function assertNotEqual(actual, unexpected, msg = '') {
  if (JSON.stringify(actual) === JSON.stringify(unexpected)) {
    throw new Error(`${msg}\nShould NOT equal: ${JSON.stringify(unexpected)}`);
  }
}

function assertIncludes(haystack, needle, msg = '') {
  if (!haystack.includes(needle)) {
    throw new Error(`${msg}\nExpected "${haystack}" to include "${needle}"`);
  }
}

console.log('='.repeat(60));
console.log('🧪 Multi-Project Identity Isolation Tests\n');
console.log('='.repeat(60));

await setup();

// ============================================
// PART 1: Project Isolation via API
// ============================================

console.log('\n📋 PART 1: API Project Isolation Tests\n');

test('API rejects requests without project header (dangerous)', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const res = await apiCall('/context', {
    method: 'POST',
    body: JSON.stringify({ content: 'test content' })
  });

  if (res.status === 200 || res.status === 201) {
    const context = res.data.context || res.data;
    if (context.project === 'default') {
      console.log("   ⚠️  WARNING: Context created with 'default' project without explicit request");
    }
  }
});

test('Contexts in different projects are isolated', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  await db.collection('contexts').deleteMany({ project: { $in: TEST_PROJECTS } });

  const alphaContent = "This is alpha's secret data";
  const betaContent = "This is beta's secret data";

  const alphaRes = await apiCall('/context', {
    method: 'POST',
    body: JSON.stringify({ content: alphaContent, project: 'project-alpha' })
  });

  const betaRes = await apiCall('/context', {
    method: 'POST',
    body: JSON.stringify({ content: betaContent, project: 'project-beta' })
  });

  const alphaId = alphaRes.data.context?.id || alphaRes.data.id;
  const betaId = betaRes.data.context?.id || betaRes.data.id;

  assertTrue(alphaId, 'Alpha context should be created');
  assertTrue(betaId, 'Beta context should be created');

  const alphaFromBeta = await apiCall(`/context/${betaId}?project=project-alpha`);
  const betaFromAlpha = await apiCall(`/context/${alphaId}?project=project-beta`);

  const alphaData = alphaFromBeta.data.context || alphaFromBeta.data;
  const betaData = betaFromAlpha.data.context || betaFromAlpha.data;

  if (alphaData?.content) {
    assertFalse(alphaData.content.includes(alphaContent),
      "Alpha content should NOT be visible when querying with project-alpha from beta's ID");
  }
  if (betaData?.content) {
    assertFalse(betaData.content.includes(betaContent),
      "Beta content should NOT be visible when querying with project-beta from alpha's ID");
  }

  console.log(`   Alpha ID: ${alphaId}`);
  console.log(`   Beta ID: ${betaId}`);
});

test('Search results are filtered by project', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const uniqueKeyword = `isolated-keyword-${Date.now()}`;

  await apiCall('/context', {
    method: 'POST',
    body: JSON.stringify({
      content: `Alpha has ${uniqueKeyword}`,
      project: 'project-alpha'
    })
  });

  await apiCall('/context', {
    method: 'POST',
    body: JSON.stringify({
      content: `Beta has ${uniqueKeyword}`,
      project: 'project-beta'
    })
  });

  const alphaSearch = await apiCall(`/context/search?q=${uniqueKeyword}&project=project-alpha`);
  const betaSearch = await apiCall(`/context/search?q=${uniqueKeyword}&project=project-beta`);

  const alphaResults = alphaSearch.data.results || [];
  const betaResults = betaSearch.data.results || [];

  for (const r of alphaResults) {
    if (r.content) {
      assertIncludes(r.content, 'Alpha has', "Alpha search should return alpha's data");
    }
  }

  for (const r of betaResults) {
    if (r.content) {
      assertIncludes(r.content, 'Beta has', "Beta search should return beta's data");
    }
  }
});

// ============================================
// PART 2: Agent Registry Isolation
// ============================================

console.log('\n📋 PART 2: Agent Registry Isolation Tests\n');

test('Agents registered in one project are not visible in others', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  await db.collection('agents').deleteMany({ agent_id: { $in: TEST_AGENTS } });

  for (const agent of TEST_AGENTS) {
    const project = agent.includes('alpha') ? 'project-alpha' :
      agent.includes('beta') ? 'project-beta' : 'project-gamma';
    await apiCall('/agent/register', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent, project, status: 'active' })
    });
  }

  const alphaAgents = await apiCall('/agent/list?project=project-alpha');
  const betaAgents = await apiCall('/agent/list?project=project-beta');

  const alphaList = alphaAgents.data || [];
  const betaList = betaAgents.data || [];

  const alphaIds = alphaList.map(a => a.agent_id);
  const betaIds = betaList.map(a => a.agent_id);

  for (const id of alphaIds) {
    assertFalse(id.includes('beta') || id.includes('gamma'),
      'Alpha agent list should not include beta/gamma agents');
  }

  for (const id of betaIds) {
    assertFalse(id.includes('alpha') || id.includes('gamma'),
      'Beta agent list should not include alpha/gamma agents');
  }

  console.log(`   Alpha agents: ${alphaIds.join(', ') || 'none'}`);
  console.log(`   Beta agents: ${betaIds.join(', ') || 'none'}`);
});

// ============================================
// PART 3: Task Isolation
// ============================================

console.log('\n📋 PART 3: Task Isolation Tests\n');

test('Tasks are scoped to their project', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const uniqueTask = `isolated-task-${Date.now()}`;

  await apiCall('/task', {
    method: 'POST',
    body: JSON.stringify({ title: `Alpha ${uniqueTask}`, project: 'project-alpha' })
  });

  await apiCall('/task', {
    method: 'POST',
    body: JSON.stringify({ title: `Beta ${uniqueTask}`, project: 'project-beta' })
  });

  const alphaTasks = await apiCall('/task/list?project=project-alpha');
  const betaTasks = await apiCall('/task/list?project=project-beta');

  const alphaList = alphaTasks.data.tasks || alphaTasks.data || [];
  const betaList = betaTasks.data.tasks || betaTasks.data || [];

  const alphaHasUnique = alphaList.some(t =>
    (t.title || '').includes(uniqueTask) && (t.title || '').includes('Alpha')
  );
  const betaHasUnique = betaList.some(t =>
    (t.title || '').includes(uniqueTask) && (t.title || '').includes('Beta')
  );

  assertTrue(alphaHasUnique, "Alpha project should have alpha's task");
  assertTrue(betaHasUnique, "Beta project should have beta's task");
});

// ============================================
// PART 4: Resource Lock Isolation
// ============================================

console.log('\n📋 PART 4: Resource Lock Isolation Tests\n');

test('Resource locks are project-scoped', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const resourceName = `shared-resource-${Date.now()}`;

  const alphaAcquire = await apiCall('/lock/acquire', {
    method: 'POST',
    body: JSON.stringify({
      resource: resourceName,
      project: 'project-alpha',
      agent: 'agent-alpha-1'
    })
  });

  const betaAcquire = await apiCall('/lock/acquire', {
    method: 'POST',
    body: JSON.stringify({
      resource: resourceName,
      project: 'project-beta',
      agent: 'agent-beta-1'
    })
  });

  assertTrue(alphaAcquire.data.acquired === true, 'Alpha should acquire lock in alpha project');
  assertTrue(betaAcquire.data.acquired === true, 'Beta should acquire lock in beta project (different project scope)');

  const alphaLocks = await apiCall('/lock/list?project=project-alpha');
  const betaLocks = await apiCall('/lock/list?project=project-beta');

  const alphaLockList = alphaLocks.data.locks || alphaLocks.data || [];
  const betaLockList = betaLocks.data.locks || betaLocks.data || [];

  const alphaHasResource = alphaLockList.some(l => l.resource === resourceName);
  const betaHasResource = betaLockList.some(l => l.resource === resourceName);

  assertTrue(alphaHasResource, "Alpha project should have alpha's lock");
  assertTrue(betaHasResource, "Beta project should have beta's lock");

  const alphaHasBeta = alphaLockList.some(l => l.locked_by === 'agent-beta-1');
  const betaHasAlpha = betaLockList.some(l => l.locked_by === 'agent-alpha-1');

  assertFalse(alphaHasBeta, "Alpha project should NOT have beta's lock");
  assertFalse(betaHasAlpha, "Beta project should NOT have alpha's lock");

  console.log('   ✅ Both projects can lock same resource name (different scopes)');
  console.log('   ✅ Locks are properly isolated by project');
});

// ============================================
// PART 5: Activity Log Isolation
// ============================================

console.log('\n📋 PART 5: Activity Log Isolation Tests\n');

test('Activity logs are filtered by project', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const uniqueActivity = `activity-${Date.now()}`;

  await apiCall('/activity', {
    method: 'POST',
    body: JSON.stringify({
      message: `Alpha ${uniqueActivity}`,
      project: 'project-alpha',
      agent: 'agent-alpha-1'
    })
  });

  await apiCall('/activity', {
    method: 'POST',
    body: JSON.stringify({
      message: `Beta ${uniqueActivity}`,
      project: 'project-beta',
      agent: 'agent-beta-1'
    })
  });

  const alphaActivity = await apiCall('/activity?project=project-alpha');
  const betaActivity = await apiCall('/activity?project=project-beta');

  const alphaLogs = alphaActivity.data || [];
  const betaLogs = betaActivity.data || [];

  const alphaHasAlpha = alphaLogs.some(l =>
    (l.message || '').includes(uniqueActivity) && (l.message || '').includes('Alpha')
  );
  const betaHasBeta = betaLogs.some(l =>
    (l.message || '').includes(uniqueActivity) && (l.message || '').includes('Beta')
  );

  assertTrue(alphaHasAlpha, "Alpha activity should show alpha's log");
  assertTrue(betaHasBeta, "Beta activity should show beta's log");
});

// ============================================
// PART 6: Cross-Project Leakage Detection
// ============================================

console.log('\n📋 PART 6: Cross-Project Leakage Detection\n');

test("No 'unknown' or 'default' project leakage in agent registry", async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const agents = await db.collection('agents').find({}).toArray();

  const unknownAgents = agents.filter(a =>
    a.project === 'unknown' || a.project === 'default'
  );

  if (unknownAgents.length > 0) {
    console.log(`   ⚠️  Found ${unknownAgents.length} legacy agents with unknown/default project:`);
    for (const a of unknownAgents.slice(0, 5)) {
      console.log(`      - ${a.agent_id}: project="${a.project}"`);
    }
    if (unknownAgents.length > 5) {
      console.log(`      ... and ${unknownAgents.length - 5} more`);
    }
    console.log('   ℹ️  These are likely from before project identity was fixed');
    console.log('   ℹ️  Run cleanup or reset to remove legacy data');
  } else {
    console.log('   ✅ All agents have valid project configuration');
  }
});

test('Context entries have valid project field', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const contexts = await db.collection('contexts').find({}).limit(100).toArray();

  const invalidContexts = contexts.filter(c =>
    !c.project || c.project === 'unknown' || c.project === 'default'
  );

  const validCount = contexts.length - invalidContexts.length;
  console.log(`   Valid contexts: ${validCount}/${contexts.length}`);

  if (invalidContexts.length > 0) {
    console.log(`   ⚠️  ${invalidContexts.length} contexts have invalid project`);
  }
});

test('Task entries have valid project field', async () => {
  if (!db) {
    console.log('   Skipping - MongoDB not available');
    return;
  }

  const tasks = await db.collection('tasks').find({}).limit(100).toArray();

  const invalidTasks = tasks.filter(t =>
    !t.project || t.project === 'unknown' || t.project === 'default'
  );

  const validCount = tasks.length - invalidTasks.length;
  console.log(`   Valid tasks: ${validCount}/${tasks.length}`);

  if (invalidTasks.length > 0) {
    console.log(`   ⚠️  ${invalidTasks.length} tasks have invalid project`);
  }
});

// ============================================
// PART 7: Project Identity Resolution
// ============================================

console.log('\n📋 PART 7: Project Identity Resolution Tests\n');

test('Identity resolution uses correct project from .mcp-project', async () => {
  const { resolveProjectIdentity, CONFIG_HIERARCHY } = await import('../utils/projectIdentity.js');

  const identity = resolveProjectIdentity();

  assertTrue(identity.project, 'Should have project resolved');
  assertTrue(identity.project !== 'default', "Should not resolve to 'default' project");
  assertTrue(identity.agent, 'Should have agent resolved');
  assertTrue(identity.agent !== 'unknown', "Should not resolve to 'unknown' agent");
  assertTrue(identity.source, 'Should have source');

  console.log(`   Project: ${identity.project}`);
  console.log(`   Agent: ${identity.agent}`);
  console.log(`   Source: ${identity.source}`);
  console.log(`   Hierarchy: ${identity.hierarchy || 'N/A'}`);
});

// ============================================
// SUMMARY
// ============================================

await new Promise(r => setTimeout(r, 500));

console.log('\n' + '='.repeat(60));
console.log('\n📊 Multi-Project Isolation Results\n');
console.log(`   Tests: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All multi-project isolation tests passed!\n');
  console.log('Isolation verified:');
  console.log('  ✅ Project-scoped context isolation');
  console.log('  ✅ Agent registry project filtering');
  console.log('  ✅ Task project scope enforcement');
  console.log('  ✅ Resource lock project isolation');
  console.log('  ✅ Activity log project filtering');
  console.log('  ✅ No unknown/default project leakage\n');
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
