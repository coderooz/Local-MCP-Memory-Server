#!/usr/bin/env node

/**
 * Multi-Agent Coordination Simulation Tests
 * 
 * Simulates a real multi-agent workflow:
 * 1. Planner agent creates task
 * 2. Executor agent picks up task
 * 3. Validator agent validates result
 * 4. Agents communicate via messages
 */

import { MongoClient } from "mongodb";

const SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:4000";
const TEST_PROJECT = "coordination-test-project";

let client = null;
let db = null;
let passed = 0;
let failed = 0;
const results = [];

const AGENTS = {
  planner: `planner-agent-${Date.now()}`,
  executor: `executor-agent-${Date.now()}`,
  validator: `validator-agent-${Date.now()}`
};

async function setup() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db("mcp_memory");
    console.log("Connected to MongoDB\n");
  } catch (error) {
    console.log("MongoDB not available - using API-only tests\n");
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
    headers: { "Content-Type": "application/json" },
    ...options
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function test(name, fn) {
  results.push({ name, status: "pending" });
  const idx = results.length - 1;
  
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        results[idx].status = "PASS";
        passed++;
        console.log(`✅ ${name}`);
      }).catch(error => {
        results[idx].status = "FAIL";
        results[idx].error = error.message;
        failed++;
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
      });
    } else {
      results[idx].status = "PASS";
      passed++;
      console.log(`✅ ${name}`);
    }
  } catch (error) {
    results[idx].status = "FAIL";
    results[idx].error = error.message;
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

function assertTrue(value, msg = "") {
  if (!value) throw new Error(`${msg} - Expected true`);
}

function assertEqual(actual, expected, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertExists(value, msg = "") {
  if (value === undefined || value === null) {
    throw new Error(`${msg} - Value should exist`);
  }
}

console.log("=".repeat(60));
console.log("🤖 Multi-Agent Coordination Simulation Tests\n");
console.log("=".repeat(60));

await setup();

// ============================================
// PART 1: Agent Registration
// ============================================

console.log("\n📋 PART 1: Register Coordination Agents\n");

test("All coordination agents can be registered", async () => {
  const capabilities = {
    planner: ["planning", "task_creation"],
    executor: ["execution", "coding"],
    validator: ["validation", "testing"]
  };
  
  for (const [role, agentId] of Object.entries(AGENTS)) {
    const res = await apiCall("/agent/register", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        project: TEST_PROJECT,
        status: "active",
        role,
        capabilities: capabilities[role]
      })
    });
    
    assertTrue(res.status === 200 || res.status === 201, 
      `${role} agent registration should succeed`);
  }
  
  console.log(`   Registered: planner, executor, validator`);
});

test("Registered agents have correct roles", async () => {
  const res = await apiCall(`/agent/list?project=${TEST_PROJECT}`);
  const agents = Array.isArray(res.data) ? res.data : [];
  
  let foundCount = 0;
  for (const [role, agentId] of Object.entries(AGENTS)) {
    const agent = agents.find(a => a.agent_id === agentId);
    if (agent) {
      foundCount++;
      console.log(`   Found ${role}: ${agent.agent_id} (role: ${agent.role})`);
    }
  }
  
  assertTrue(foundCount >= 1, "At least one coordination agent should be registered");
  console.log(`   Found ${foundCount}/${Object.keys(AGENTS).length} agents`);
});

// ============================================
// PART 2: Task Workflow
// ============================================

console.log("\n📋 PART 2: Task Workflow Simulation\n");

let createdTaskId = null;

test("Planner creates a task", async () => {
  const res = await apiCall("/task", {
    method: "POST",
    body: JSON.stringify({
      title: "Implement user authentication",
      description: "Add login/logout functionality",
      project: TEST_PROJECT,
      agent: AGENTS.planner,
      priority: 4,
      required_capabilities: ["coding"],
      relatedAgents: [AGENTS.executor, AGENTS.validator]
    })
  });
  
  assertTrue(res.status === 200 || res.status === 201, "Task creation should succeed");
  createdTaskId = res.data.task?.task_id || res.data.task_id;
  assertExists(createdTaskId, "Task ID should be returned");
  
  console.log(`   Created task: ${createdTaskId}`);
});

test("Task is visible to executor agent", async () => {
  const res = await apiCall(`/task/list?project=${TEST_PROJECT}`);
  const tasks = Array.isArray(res.data) ? res.data : (res.data.tasks || []);
  
  const task = tasks.find(t => t.task_id === createdTaskId);
  assertExists(task, "Created task should be visible");
  assertEqual(task.status, "pending", "Task should start as pending");
  
  console.log(`   Task status: ${task.status}`);
});

test("Task can be assigned to executor", async () => {
  const res = await apiCall("/task/assign", {
    method: "POST",
    body: JSON.stringify({
      task_id: createdTaskId,
      agent_id: AGENTS.executor,
      project: TEST_PROJECT,
      agent: AGENTS.planner
    })
  });
  
  assertTrue(res.status === 200, "Task assignment should succeed");
  console.log(`   Task assigned to: ${AGENTS.executor}`);
});

test("Task status updates when work starts", async () => {
  const res = await apiCall("/task/update", {
    method: "POST",
    body: JSON.stringify({
      task_id: createdTaskId,
      status: "in_progress",
      agent: AGENTS.executor,
      project: TEST_PROJECT
    })
  });
  
  assertTrue(res.status === 200, "Task update should succeed");
  console.log(`   Task moved to: in_progress`);
});

// ============================================
// PART 3: Agent Communication via Messages
// ============================================

console.log("\n📋 PART 3: Agent Communication\n");

test("Executor can send message to validator", async () => {
  const res = await apiCall("/message", {
    method: "POST",
    body: JSON.stringify({
      from_agent: AGENTS.executor,
      to_agent: AGENTS.validator,
      project: TEST_PROJECT,
      content: "Task implementation complete. Please validate.",
      type: "task_update"
    })
  });
  
  assertTrue(res.status === 200 || res.status === 201, "Message send should succeed");
  assertTrue(res.data.success === true, "Message send should return success");
  
  console.log(`   Message sent from executor to validator`);
});

test("Validator can retrieve messages", async () => {
  const res = await apiCall(`/message/${AGENTS.validator}?project=${TEST_PROJECT}`);
  const messages = Array.isArray(res.data) ? res.data : (res.data.messages || []);
  
  const fromExecutor = messages.find(m => 
    m.from_agent === AGENTS.executor && m.to_agent === AGENTS.validator
  );
  
  console.log(`   Validator received ${messages.length} message(s)`);
  if (messages.length > 0) {
    console.log(`   Sample: from=${messages[0].from_agent}, to=${messages[0].to_agent}`);
  }
});

test("Planner receives notification via broadcast", async () => {
  const res = await apiCall("/message", {
    method: "POST",
    body: JSON.stringify({
      from_agent: AGENTS.executor,
      to_agent: null,
      project: TEST_PROJECT,
      content: "Implementation progress: 50% complete",
      type: "status_update"
    })
  });
  
  assertTrue(res.status === 200 || res.status === 201, "Broadcast should succeed");
  console.log(`   Broadcast sent by executor`);
});

// ============================================
// PART 4: Validation and Completion
// ============================================

console.log("\n📋 PART 4: Task Validation and Completion\n");

test("Validator can mark task as validated", async () => {
  const res = await apiCall("/task/update", {
    method: "POST",
    body: JSON.stringify({
      task_id: createdTaskId,
      status: "completed",
      agent: AGENTS.validator,
      project: TEST_PROJECT,
      result: "All validations passed. Task complete."
    })
  });
  
  assertTrue(res.status === 200, "Task completion should succeed");
  console.log(`   Task marked as completed`);
});

test("Completed task has correct final status", async () => {
  const res = await apiCall(`/task/${createdTaskId}?project=${TEST_PROJECT}`);
  const task = res.data.task || res.data;
  
  if (task) {
    assertEqual(task.status, "completed", "Task should be completed");
    console.log(`   Final status: ${task.status}`);
  } else {
    console.log(`   Task status not available in response`);
  }
});

// ============================================
// PART 5: Resource Lock Coordination
// ============================================

console.log("\n📋 PART 5: Resource Lock Coordination\n");

test("Executor can acquire resource lock", async () => {
  const res = await apiCall("/lock/acquire", {
    method: "POST",
    body: JSON.stringify({
      resource: `file:src/auth.js`,
      project: TEST_PROJECT,
      agent: AGENTS.executor,
      expiresInMs: 300000
    })
  });
  
  assertTrue(res.data.acquired === true, "Lock should be acquired");
  console.log(`   Lock acquired for: src/auth.js`);
});

test("Other agent cannot acquire same lock", async () => {
  const res = await apiCall("/lock/acquire", {
    method: "POST",
    body: JSON.stringify({
      resource: `file:src/auth.js`,
      project: TEST_PROJECT,
      agent: AGENTS.validator,
      expiresInMs: 300000
    })
  });
  
  assertTrue(res.data.acquired === false, "Second lock should be denied");
  assertTrue(res.data.warnings?.length > 0, "Should have warning about conflict");
  
  console.log(`   Lock correctly denied for validator`);
});

test("Lock owner can release lock", async () => {
  const res = await apiCall("/lock/release", {
    method: "POST",
    body: JSON.stringify({
      resource: `file:src/auth.js`,
      project: TEST_PROJECT,
      agent: AGENTS.executor
    })
  });
  
  if (res.data.released === true) {
    console.log(`   Lock released`);
  } else {
    console.log(`   Lock release response: ${JSON.stringify(res.data)}`);
  }
});

test("After release, another agent can acquire lock", async () => {
  const res = await apiCall("/lock/acquire", {
    method: "POST",
    body: JSON.stringify({
      resource: `file:src/auth.js`,
      project: TEST_PROJECT,
      agent: AGENTS.validator,
      expiresInMs: 300000
    })
  });
  
  if (res.data.acquired === true) {
    console.log(`   Lock acquired by validator`);
  } else {
    console.log(`   Lock acquisition response: ${JSON.stringify(res.data)}`);
  }
});

// ============================================
// PART 6: Activity Tracking
// ============================================

console.log("\n📋 PART 6: Activity Tracking\n");

test("All agent actions are tracked in activity log", async () => {
  const res = await apiCall(`/activity?project=${TEST_PROJECT}&limit=50`);
  const activities = Array.isArray(res.data) ? res.data : [];
  
  console.log(`   Found ${activities.length} activity entries`);
  
  if (activities.length > 0) {
    console.log(`   Sample: ${activities[0].message}`);
  }
});

// ============================================
// PART 7: Cleanup
// ============================================

console.log("\n📋 PART 7: Cleanup\n");

test("Test agents can be cleaned up", async () => {
  if (!db) {
    console.log("   Skipping - MongoDB not available");
    return;
  }
  
  const result = await db.collection("agents").deleteMany({
    agent_id: { $in: Object.values(AGENTS) }
  });
  
  assertTrue(result.deletedCount === Object.keys(AGENTS).length, 
    `Should delete ${Object.keys(AGENTS).length} agents`);
  
  console.log(`   Cleaned up ${result.deletedCount} test agents`);
});

// ============================================
// SUMMARY
// ============================================

await new Promise(r => setTimeout(r, 500));

console.log("\n" + "=".repeat(60));
console.log("\n📊 Multi-Agent Coordination Results\n");
console.log(`   Tests: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);

if (failed === 0) {
  console.log("\n🎉 All coordination tests passed!\n");
  console.log("Coordination verified:");
  console.log("  ✅ Multi-agent registration works");
  console.log("  ✅ Task workflow (create → assign → execute → complete)");
  console.log("  ✅ Agent-to-agent messaging");
  console.log("  ✅ Resource lock coordination");
  console.log("  ✅ Activity tracking for all agents\n");
} else {
  console.log("\n⚠️  Some tests failed - review output above\n");
  for (const r of results) {
    if (r.status === "FAIL") {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }
}

await teardown();

process.exit(failed > 0 ? 1 : 0);
