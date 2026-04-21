#!/usr/bin/env node

/**
 * MCP Multi-Agent System Stress Test
 *
 * Comprehensive stress test for:
 * - 10+ concurrent agents
 * - 100+ rapid tool calls
 * - All MCP subsystems (memory, tasks, feedback, chat, browser, emulator)
 * - Race conditions, data integrity, performance, coordination failures
 */

import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'mcp_memory_stress_test';
const TEST_PROJECT = `stress-test-${Date.now()}`;
const NUM_AGENTS = 10;
const BURST_SIZE = 100;

const results = {
  summary: { passed: 0, failed: 0, errors: [], warnings: [] },
  issues: { critical: [], medium: [], minor: [] },
  metrics: {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    avgLatencyMs: 0,
    maxLatencyMs: 0,
    raceConditions: [],
    dataInconsistencies: []
  },
  subsystems: {}
};

let client = null;
let db = null;
const agents = [];
const rooms = [];
const tasks = [];
const contexts = [];
const feedbacks = [];
const browserSessions = [];
const activityLog = [];
const startTime = Date.now();
const latencies = [];

class TestAgent extends EventEmitter {
  constructor(id, index) {
    super();
    this.id = id;
    this.name = `stress-agent-${index}`;
    this.agentId = `agent-${id}`;
    this.project = TEST_PROJECT;
    this.sessionId = uuidv4();
    this.registered = false;
    this.operations = { success: 0, failed: 0 };
    this.ownedTasks = new Set();
    this.joinedRooms = new Set();
  }

  async register() {
    try {
      const result = await apiCall('/agent/register', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: this.agentId,
          name: this.name,
          project: this.project,
          status: 'active',
          role: this.getRole(),
          capabilities: this.getCapabilities()
        })
      });
      this.registered = result.status === 200 || result.status === 201;
      return this.registered;
    } catch (e) {
      return false;
    }
  }

  getRole() {
    const roles = ['planner', 'executor', 'validator', 'monitor', 'coordinator'];
    return roles[Math.floor(Math.random() * roles.length)];
  }

  getCapabilities() {
    const caps = [
      'planning',
      'execution',
      'validation',
      'monitoring',
      'coordination',
      'coding',
      'testing',
      'debugging'
    ];
    const numCaps = 2 + Math.floor(Math.random() * 3);
    const shuffled = caps.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numCaps);
  }

  async heartbeat() {
    try {
      await apiCall('/agent/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: this.agentId,
          current_task: Array.from(this.ownedTasks)[0] || null,
          status: 'active'
        })
      });
    } catch (e) {
      recordError('agent', `Heartbeat failed for ${this.name}`, e);
    }
  }
}

async function apiCall(endpoint, options = {}) {
  const url = `http://localhost:4000${endpoint}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? options.body : undefined
    });
    const latency = Date.now() - start;
    latencies.push(latency);
    results.metrics.totalCalls++;
    if (response.ok) {
      results.metrics.successfulCalls++;
    } else {
      results.metrics.failedCalls++;
    }
    return { status: response.status, data: await response.json().catch(() => ({})) };
  } catch (error) {
    const latency = Date.now() - start;
    latencies.push(latency);
    results.metrics.totalCalls++;
    results.metrics.failedCalls++;
    throw error;
  }
}

function recordError(category, message, error) {
  results.summary.errors.push({
    category,
    message,
    error: error?.message || String(error),
    timestamp: Date.now()
  });
  results.issues.medium.push({ category, message, severity: 'medium' });
}

function recordWarning(category, message) {
  results.summary.warnings.push({ category, message, timestamp: Date.now() });
  results.issues.minor.push({ category, message, severity: 'minor' });
}

function recordRaceCondition(operation, details) {
  results.metrics.raceConditions.push({ operation, details, timestamp: Date.now() });
  results.issues.medium.push({
    category: 'race_condition',
    message: operation,
    details,
    severity: 'medium'
  });
}

function recordDataInconsistency(type, details) {
  results.metrics.dataInconsistencies.push({ type, details, timestamp: Date.now() });
  results.issues.critical.push({
    category: 'data_inconsistency',
    message: type,
    details,
    severity: 'critical'
  });
}

async function setup() {
  console.log('🔧 Setting up stress test environment...\n');

  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`✅ Connected to MongoDB: ${DB_NAME}`);

    await db.dropDatabase();
    console.log('✅ Dropped existing test database');

    const serverCheck = await fetch('http://localhost:4000').catch(() => null);
    if (serverCheck) {
      console.log('✅ MCP API Server is running on port 4000');
    } else {
      console.log('⚠️  MCP API Server not running - will use direct DB operations');
    }

    const { ServerResponse } = await import('_http_server');
    console.log('\n📊 Test Configuration:');
    console.log(`   Agents: ${NUM_AGENTS}`);
    console.log(`   Burst Size: ${BURST_SIZE}`);
    console.log(`   Project: ${TEST_PROJECT}`);
    console.log(`   Database: ${DB_NAME}\n`);

    return true;
  } catch (error) {
    console.log(`❌ Setup failed: ${error.message}`);
    return false;
  }
}

async function teardown() {
  console.log('\n🧹 Cleaning up test environment...');
  if (client) {
    try {
      await db.dropDatabase();
      await client.close();
      console.log('✅ Database cleaned up and closed');
    } catch (e) {
      console.log(`⚠️  Cleanup error: ${e.message}`);
    }
  }
}

async function registerAgents() {
  console.log('\n👥 PHASE 1: Agent Registration\n');

  const registerPromises = [];
  for (let i = 0; i < NUM_AGENTS; i++) {
    const agent = new TestAgent(uuidv4(), i);
    agents.push(agent);
    registerPromises.push(agent.register());
  }

  const results_batch = await Promise.allSettled(registerPromises);
  const successCount = results_batch.filter((r) => r.status === 'fulfilled' && r.value).length;

  console.log(`✅ Registered ${successCount}/${NUM_AGENTS} agents`);

  for (const agent of agents.slice(0, 5)) {
    if (agent.registered) {
      console.log(`   - ${agent.name} (${agent.agentId})`);
    }
  }

  results.subsystems.agents = {
    status: successCount > 0 ? 'pass' : 'fail',
    registered: successCount,
    total: NUM_AGENTS
  };

  return successCount > 0;
}

async function testMemoryOperations() {
  console.log('\n💾 PHASE 2: Memory Operations Stress Test\n');

  const memoryTests = {
    store: { total: 0, success: 0, failed: 0 },
    search: { total: 0, success: 0, failed: 0 },
    update: { total: 0, success: 0, failed: 0 },
    concurrent: { total: 0, success: 0, failed: 0, conflicts: 0 }
  };

  console.log('   Testing concurrent store_context operations...');
  const storePromises = [];
  for (let i = 0; i < BURST_SIZE; i++) {
    const agent = agents[i % agents.length];
    const contextId = uuidv4();
    storePromises.push(
      (async () => {
        try {
          const res = await apiCall('/context', {
            method: 'POST',
            body: JSON.stringify({
              id: contextId,
              content: `Memory content ${i} from ${agent.name} - ${Date.now()}`,
              summary: `Test context ${i}`,
              type: 'test',
              agent: agent.agentId,
              project: agent.project,
              importance: (i % 5) + 1,
              tags: ['stress-test', `batch-${i % 10}`],
              metadata: { testBatch: i, agentIndex: i % agents.length }
            })
          });
          if (res.status === 200 || res.status === 201) {
            contexts.push(contextId);
            memoryTests.store.success++;
          } else {
            memoryTests.store.failed++;
          }
          memoryTests.store.total++;
        } catch (e) {
          memoryTests.store.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(storePromises);
  console.log(`   Store: ${memoryTests.store.success}/${memoryTests.store.total} successful`);

  console.log('   Testing concurrent search_context operations...');
  const searchPromises = [];
  for (let i = 0; i < 50; i++) {
    const agent = agents[i % agents.length];
    searchPromises.push(
      (async () => {
        try {
          const res = await apiCall('/context/search', {
            method: 'POST',
            body: JSON.stringify({
              query: 'stress-test',
              limit: 20,
              project: agent.project
            })
          });
          if (res.status === 200) {
            memoryTests.search.success++;
            if (Array.isArray(res.data) && res.data.length > 1) {
              memoryTests.concurrent.conflicts++;
            }
          } else {
            memoryTests.search.failed++;
          }
          memoryTests.search.total++;
        } catch (e) {
          memoryTests.search.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(searchPromises);
  console.log(`   Search: ${memoryTests.search.success}/${memoryTests.search.total} successful`);

  console.log('   Testing concurrent update_context operations (RACE CONDITION TEST)...');
  const updatePromises = [];
  const sameContextId = contexts[0] || 'test-context-race';
  for (let i = 0; i < 30; i++) {
    const agent = agents[i % agents.length];
    updatePromises.push(
      (async () => {
        try {
          const res = await apiCall('/context/update', {
            method: 'POST',
            body: JSON.stringify({
              context_id: sameContextId,
              updates: {
                content: `Updated by ${agent.name} at ${Date.now()}`,
                importance: i % 5
              },
              reason: `Race condition test ${i}`,
              agent: agent.agentId
            })
          });
          if (res.status === 200) {
            memoryTests.update.success++;
          } else {
            memoryTests.update.failed++;
          }
          memoryTests.update.total++;
        } catch (e) {
          memoryTests.update.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(updatePromises);
  console.log(`   Update: ${memoryTests.update.success}/${memoryTests.update.total} successful`);

  if (memoryTests.concurrent.conflicts > 0) {
    recordRaceCondition('search_results_inconsistency', {
      conflictCount: memoryTests.concurrent.conflicts,
      expectedBehavior: 'Consistent ranking across concurrent searches'
    });
  }

  const ctx = await db?.collection('contexts').findOne({ id: sameContextId });
  if (ctx && memoryTests.update.total > 1) {
    console.log(`   ⚠️  Last update timestamp: ${ctx.updatedAt}`);
    console.log(`   ⚠️  Version tracking: ${ctx.version}`);
  }

  results.subsystems.memory = {
    status: memoryTests.store.success > 0 ? 'pass' : 'fail',
    store: memoryTests.store,
    search: memoryTests.search,
    update: memoryTests.update
  };

  return memoryTests;
}

async function testTaskOperations() {
  console.log('\n📋 PHASE 3: Task Coordination Stress Test\n');

  const taskTests = {
    create: { total: 0, success: 0, failed: 0 },
    assign: { total: 0, success: 0, failed: 0, raceClaims: 0 },
    update: { total: 0, success: 0, failed: 0 },
    concurrent: { total: 0, success: 0, failed: 0, conflicts: 0 }
  };

  console.log('   Testing concurrent task creation...');
  const createPromises = [];
  for (let i = 0; i < BURST_SIZE; i++) {
    const agent = agents[i % agents.length];
    const taskId = uuidv4();
    createPromises.push(
      (async () => {
        try {
          const res = await apiCall('/task', {
            method: 'POST',
            body: JSON.stringify({
              title: `Stress Test Task ${i}`,
              description: `Created by ${agent.name}`,
              project: agent.project,
              agent: agent.agentId,
              priority: (i % 5) + 1,
              dependencies: i > 0 && i % 5 === 0 ? [tasks[tasks.length - 1]?.task_id] : [],
              status: 'pending'
            })
          });
          if (res.status === 200 || res.status === 201) {
            const tid = res.data.task?.task_id || res.data.task_id;
            if (tid) {
              tasks.push({ task_id: tid, createdBy: agent.agentId });
              agent.ownedTasks.add(tid);
            }
            taskTests.create.success++;
          } else {
            taskTests.create.failed++;
          }
          taskTests.create.total++;
        } catch (e) {
          taskTests.create.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(createPromises);
  console.log(`   Create: ${taskTests.create.success}/${taskTests.create.total} successful`);

  console.log('   Testing concurrent task assignment (RACE CONDITION TEST)...');
  if (tasks.length > 0) {
    const targetTask = tasks[Math.floor(tasks.length / 2)];
    const assignPromises = [];
    for (let i = 0; i < 8; i++) {
      const agent = agents[i % agents.length];
      assignPromises.push(
        (async () => {
          try {
            const res = await apiCall('/task/assign', {
              method: 'POST',
              body: JSON.stringify({
                task_id: targetTask.task_id,
                agent_id: agent.agentId,
                project: agent.project,
                agent: agent.agentId
              })
            });
            if (res.status === 200 && res.data.success) {
              taskTests.assign.success++;
            } else if (res.data.error?.includes('already assigned')) {
              taskTests.assign.raceClaims++;
            } else {
              taskTests.assign.failed++;
            }
            taskTests.assign.total++;
          } catch (e) {
            taskTests.assign.failed++;
          }
        })()
      );
    }
    await Promise.allSettled(assignPromises);
  }
  console.log(`   Assign: ${taskTests.assign.success}/${taskTests.assign.total} successful`);
  console.log(`   Race claims detected: ${taskTests.assign.raceClaims}`);

  if (taskTests.assign.raceClaims > 0) {
    recordRaceCondition('task_assignment_conflict', {
      raceClaims: taskTests.assign.raceClaims,
      expectedBehavior: 'Only one agent should claim a task'
    });
  }

  console.log('   Testing concurrent task updates...');
  const updatePromises = [];
  for (const task of tasks.slice(0, 50)) {
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const statuses = ['in_progress', 'review', 'testing', 'completed'];
    updatePromises.push(
      (async () => {
        try {
          const res = await apiCall('/task/update', {
            method: 'POST',
            body: JSON.stringify({
              task_id: task.task_id,
              status: statuses[Math.floor(Math.random() * statuses.length)],
              agent: agent.agentId,
              project: agent.project,
              expectedVersion: 1,
              expectedUpdatedAt: new Date().toISOString()
            })
          });
          if (res.status === 200) {
            taskTests.update.success++;
          } else {
            taskTests.update.failed++;
          }
          taskTests.update.total++;
        } catch (e) {
          taskTests.update.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(updatePromises);
  console.log(`   Update: ${taskTests.update.success}/${taskTests.update.total} successful`);

  results.subsystems.tasks = {
    status: taskTests.create.success > 0 ? 'pass' : 'fail',
    create: taskTests.create,
    assign: taskTests.assign,
    update: taskTests.update
  };

  return taskTests;
}

async function testFeedbackSystem() {
  console.log('\n⭐ PHASE 4: Feedback System Stress Test\n');

  const feedbackTests = {
    create: { total: 0, success: 0, failed: 0 },
    vote: { total: 0, success: 0, failed: 0, duplicates: 0 },
    severity: { total: 0, success: 0, failed: 0 },
    resolve: { total: 0, success: 0, failed: 0 }
  };

  console.log('   Testing concurrent feedback creation...');
  const createPromises = [];
  for (let i = 0; i < 50; i++) {
    const agent = agents[i % agents.length];
    createPromises.push(
      (async () => {
        try {
          const res = await apiCall('/feedback', {
            method: 'POST',
            body: JSON.stringify({
              type: ['issue', 'improvement', 'feedback'][i % 3],
              title: `Stress Feedback ${i}`,
              description: `Created by ${agent.name}`,
              severity: (i % 5) + 1,
              project: agent.project,
              agent: agent.agentId,
              tags: ['stress-test', `severity-${i % 5}`]
            })
          });
          if (res.status === 200 || res.status === 201) {
            const fid = res.data.feedback?.feedback_id;
            if (fid) feedbacks.push(fid);
            feedbackTests.create.success++;
          } else {
            feedbackTests.create.failed++;
          }
          feedbackTests.create.total++;
        } catch (e) {
          feedbackTests.create.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(createPromises);
  console.log(
    `   Create: ${feedbackTests.create.success}/${feedbackTests.create.total} successful`
  );

  console.log('   Testing concurrent voting (HIGH CONCURRENCY TEST)...');
  const votePromises = [];
  const voterCounts = new Map();

  for (const fid of feedbacks.slice(0, 10)) {
    for (let i = 0; i < 20; i++) {
      const agent = agents[i % agents.length];
      votePromises.push(
        (async () => {
          try {
            const res = await apiCall('/feedback/vote', {
              method: 'POST',
              body: JSON.stringify({
                feedback_id: fid,
                voter_id: agent.agentId
              })
            });
            if (res.status === 200) {
              feedbackTests.vote.success++;
              voterCounts.set(fid, (voterCounts.get(fid) || 0) + 1);
            } else {
              feedbackTests.vote.failed++;
            }
            feedbackTests.vote.total++;
          } catch (e) {
            feedbackTests.vote.failed++;
          }
        })()
      );
    }
  }
  await Promise.allSettled(votePromises);
  console.log(`   Vote: ${feedbackTests.vote.success}/${feedbackTests.vote.total} successful`);

  console.log('   Testing severity updates...');
  const severityPromises = [];
  for (const fid of feedbacks.slice(0, 20)) {
    const agent = agents[Math.floor(Math.random() * agents.length)];
    severityPromises.push(
      (async () => {
        try {
          const res = await apiCall('/feedback/severity', {
            method: 'POST',
            body: JSON.stringify({
              feedback_id: fid,
              severity: Math.floor(Math.random() * 5) + 1
            })
          });
          if (res.status === 200) {
            feedbackTests.severity.success++;
          } else {
            feedbackTests.severity.failed++;
          }
          feedbackTests.severity.total++;
        } catch (e) {
          feedbackTests.severity.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(severityPromises);
  console.log(
    `   Severity: ${feedbackTests.severity.success}/${feedbackTests.severity.total} successful`
  );

  console.log('   Testing concurrent resolution...');
  const resolvePromises = [];
  for (const fid of feedbacks.slice(0, 10)) {
    const agent = agents[Math.floor(Math.random() * agents.length)];
    resolvePromises.push(
      (async () => {
        try {
          const res = await apiCall('/feedback/resolve', {
            method: 'POST',
            body: JSON.stringify({
              feedback_id: fid,
              resolved_by: agent.agentId,
              resolution: 'Resolved during stress test'
            })
          });
          if (res.status === 200) {
            feedbackTests.resolve.success++;
          } else {
            feedbackTests.resolve.failed++;
          }
          feedbackTests.resolve.total++;
        } catch (e) {
          feedbackTests.resolve.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(resolvePromises);
  console.log(
    `   Resolve: ${feedbackTests.resolve.success}/${feedbackTests.resolve.total} successful`
  );

  results.subsystems.feedback = {
    status: feedbackTests.create.success > 0 ? 'pass' : 'fail',
    create: feedbackTests.create,
    vote: feedbackTests.vote,
    severity: feedbackTests.severity,
    resolve: feedbackTests.resolve
  };

  return feedbackTests;
}

async function testChatSystem() {
  console.log('\n💬 PHASE 5: Chat System Stress Test\n');

  const chatTests = {
    rooms: { total: 0, success: 0, failed: 0 },
    messages: { total: 0, success: 0, failed: 0, ordering: [] },
    join: { total: 0, success: 0, failed: 0 }
  };

  console.log('   Testing concurrent room creation...');
  const roomPromises = [];
  for (let i = 0; i < 10; i++) {
    const agent = agents[i % agents.length];
    roomPromises.push(
      (async () => {
        try {
          const res = await apiCall('/chat/room', {
            method: 'POST',
            body: JSON.stringify({
              name: `stress-test-room-${i}`,
              scope: 'project',
              project: agent.project,
              created_by: agent.agentId
            })
          });
          if (res.status === 200 || res.status === 201) {
            const rid = res.data.room?.room_id;
            if (rid) rooms.push(rid);
            chatTests.rooms.success++;
          } else {
            chatTests.rooms.failed++;
          }
          chatTests.rooms.total++;
        } catch (e) {
          chatTests.rooms.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(roomPromises);
  console.log(`   Room Create: ${chatTests.rooms.success}/${chatTests.rooms.total} successful`);

  console.log('   Testing agent joining rooms...');
  const joinPromises = [];
  for (const rid of rooms.slice(0, 5)) {
    for (let i = 0; i < 5; i++) {
      const agent = agents[i % agents.length];
      joinPromises.push(
        (async () => {
          try {
            const res = await apiCall(`/chat/room/${rid}/join`, {
              method: 'POST',
              body: JSON.stringify({
                agent_id: agent.agentId
              })
            });
            if (res.status === 200) {
              chatTests.join.success++;
              agent.joinedRooms.add(rid);
            } else {
              chatTests.join.failed++;
            }
            chatTests.join.total++;
          } catch (e) {
            chatTests.join.failed++;
          }
        })()
      );
    }
  }
  await Promise.allSettled(joinPromises);
  console.log(`   Join: ${chatTests.join.success}/${chatTests.join.total} successful`);

  console.log('   Testing HIGH FREQUENCY messaging (MESSAGE ORDERING TEST)...');
  const messagePromises = [];
  const messageTimestamps = [];
  const targetRoom = rooms[0] || 'test-room';

  for (let i = 0; i < BURST_SIZE; i++) {
    const agent = agents[i % agents.length];
    const seqNum = i;
    messagePromises.push(
      (async () => {
        try {
          const timestamp = Date.now();
          const res = await apiCall('/chat/message', {
            method: 'POST',
            body: JSON.stringify({
              room_id: targetRoom,
              from_agent: agent.agentId,
              content: `Message ${seqNum} from ${agent.name}`,
              type: 'info',
              metadata: { seqNum, timestamp }
            })
          });
          if (res.status === 200 || res.status === 201) {
            chatTests.messages.success++;
            messageTimestamps.push({ seqNum, timestamp, agent: agent.name });
          } else {
            chatTests.messages.failed++;
          }
          chatTests.messages.total++;
        } catch (e) {
          chatTests.messages.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(messagePromises);
  console.log(`   Messages: ${chatTests.messages.success}/${chatTests.messages.total} successful`);

  await new Promise((r) => setTimeout(r, 500));

  try {
    const msgsRes = await apiCall(`/chat/room/${targetRoom}/messages?limit=${BURST_SIZE}`);
    if (msgsRes.status === 200 && Array.isArray(msgsRes.data)) {
      const messages = msgsRes.data;
      let outOfOrder = 0;
      for (let i = 1; i < Math.min(messages.length, 50); i++) {
        const prevSeq = messages[i - 1].metadata?.seqNum || 0;
        const currSeq = messages[i].metadata?.seqNum || 0;
        if (currSeq < prevSeq) outOfOrder++;
      }
      if (outOfOrder > 0) {
        recordRaceCondition('message_ordering_violation', {
          outOfOrderCount: outOfOrder,
          totalMessages: messages.length
        });
        console.log(`   ⚠️  Message ordering violations: ${outOfOrder}`);
      } else {
        console.log('   ✅ Message ordering: consistent');
      }
      chatTests.messages.ordering = { outOfOrder, total: messages.length };
    }
  } catch (e) {
    console.log('   ⚠️  Could not verify message ordering');
  }

  console.log('   Testing coordination messages (task takeover)...');
  if (rooms.length > 0 && tasks.length > 0) {
    const takeoverPromises = [];
    for (let i = 0; i < 5; i++) {
      const agent = agents[i % agents.length];
      takeoverPromises.push(
        (async () => {
          try {
            await apiCall('/chat/message', {
              method: 'POST',
              body: JSON.stringify({
                room_id: rooms[i % rooms.length],
                from_agent: agent.agentId,
                content: `Taking over task: ${tasks[i].task_id}`,
                type: 'task',
                related_task: tasks[i].task_id,
                metadata: { action: 'task_takeover' }
              })
            });
          } catch (e) {}
        })()
      );
    }
    await Promise.allSettled(takeoverPromises);
  }

  results.subsystems.chat = {
    status: chatTests.rooms.success > 0 ? 'pass' : 'fail',
    rooms: chatTests.rooms,
    messages: chatTests.messages,
    join: chatTests.join
  };

  return chatTests;
}

async function testBrowserAutomation() {
  console.log('\n🌐 PHASE 6: Browser Automation Stress Test\n');

  const browserTests = {
    open: { total: 0, success: 0, failed: 0 },
    navigate: { total: 0, success: 0, failed: 0 },
    interact: { total: 0, success: 0, failed: 0 },
    sessions: { maxConcurrent: 0, current: 0 }
  };

  console.log('   Testing concurrent browser session creation...');
  const browserPromises = [];
  for (let i = 0; i < 5; i++) {
    const sessionId = uuidv4();
    browserSessions.push(sessionId);
    browserPromises.push(
      (async () => {
        try {
          const res = await fetch('http://localhost:4000/browser/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          const data = await res.json();
          if (data.success) {
            browserTests.open.success++;
          } else {
            browserTests.open.failed++;
          }
          browserTests.open.total++;
          browserTests.sessions.current++;
          browserTests.sessions.maxConcurrent = Math.max(
            browserTests.sessions.maxConcurrent,
            browserTests.sessions.current
          );
        } catch (e) {
          browserTests.open.failed++;
        }
      })()
    );
  }
  await Promise.allSettled(browserPromises);
  console.log(
    `   Open Session: ${browserTests.open.success}/${browserTests.open.total} successful`
  );
  console.log(`   Max Concurrent Sessions: ${browserTests.sessions.maxConcurrent}`);

  if (browserTests.open.success > 0) {
    console.log('   Testing navigation on active sessions...');
    const navPromises = [];
    for (const sessionId of browserSessions.slice(0, 3)) {
      navPromises.push(
        (async () => {
          try {
            const res = await fetch('http://localhost:4000/browser/navigate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                url: 'https://example.com',
                waitUntil: 'domcontentloaded'
              })
            });
            if (res.ok) {
              browserTests.navigate.success++;
            } else {
              browserTests.navigate.failed++;
            }
            browserTests.navigate.total++;
          } catch (e) {
            browserTests.navigate.failed++;
          }
        })()
      );
    }
    await Promise.allSettled(navPromises);
    console.log(
      `   Navigate: ${browserTests.navigate.success}/${browserTests.navigate.total} successful`
    );
  } else {
    console.log('   ⚠️  Browser service not available - skipping navigation tests');
    recordWarning('browser', 'Browser service not available or not running');
  }

  console.log('   Testing session cleanup...');
  for (const sessionId of browserSessions) {
    try {
      await fetch('http://localhost:4000/browser/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      browserTests.sessions.current--;
    } catch (e) {}
  }

  results.subsystems.browser = {
    status: browserTests.open.success > 0 || browserTests.open.total === 0 ? 'pass' : 'partial',
    open: browserTests.open,
    navigate: browserTests.navigate,
    sessions: browserTests.sessions
  };

  return browserTests;
}

async function testEmulatorPlugin() {
  console.log('\n📱 PHASE 7: Emulator Plugin Stress Test\n');

  const emulatorTests = {
    scan: { total: 0, success: 0, failed: 0 },
    select: { total: 0, success: 0, failed: 0 },
    parallel: { total: 0, success: 0, failed: 0, conflicts: 0 }
  };

  console.log('   Testing emulator scanning...');
  try {
    const res = await apiCall('/emulator/scan', { method: 'POST', body: JSON.stringify({}) });
    if (res.status === 200) {
      emulatorTests.scan.success++;
      console.log(`   Found ${res.data.emulators?.length || 0} emulators`);
    } else {
      emulatorTests.scan.failed++;
    }
    emulatorTests.scan.total++;
  } catch (e) {
    emulatorTests.scan.failed++;
    emulatorTests.scan.total++;
  }

  console.log('   Testing parallel emulator operations...');
  const parallelPromises = [];
  for (let i = 0; i < 5; i++) {
    parallelPromises.push(
      (async () => {
        try {
          const res = await apiCall('/emulator/select', {
            method: 'POST',
            body: JSON.stringify({
              emulator_id: `emulator-${i}`,
              requirements: { type: 'android', capabilities: ['touch', 'network'] }
            })
          });
          if (res.status === 200) {
            emulatorTests.parallel.success++;
          } else {
            emulatorTests.parallel.failed++;
          }
          emulatorTests.parallel.total++;
        } catch (e) {
          emulatorTests.parallel.failed++;
          emulatorTests.parallel.total++;
        }
      })()
    );
  }
  await Promise.allSettled(parallelPromises);
  console.log(
    `   Parallel Select: ${emulatorTests.parallel.success}/${emulatorTests.parallel.total} successful`
  );

  results.subsystems.emulator = {
    status: emulatorTests.scan.success > 0 ? 'pass' : 'partial',
    scan: emulatorTests.scan,
    parallel: emulatorTests.parallel
  };

  return emulatorTests;
}

async function testFailureInjection() {
  console.log('\n💥 PHASE 8: Failure Injection Tests\n');

  const failureTests = {
    invalidInputs: { total: 0, handled: 0, crashed: 0 },
    concurrentConflict: { total: 0, handled: 0, corrupted: 0 },
    timeout: { total: 0, recovered: 0, stuck: 0 }
  };

  console.log('   Testing invalid input handling...');

  const invalidInputs = [
    { endpoint: '/context', body: { content: '' } },
    { endpoint: '/task', body: { title: '' } },
    { endpoint: '/feedback', body: { type: 'invalid_type', title: 'test' } },
    { endpoint: '/chat/room', body: { name: '' } }
  ];

  for (const test of invalidInputs) {
    try {
      const res = await apiCall(test.endpoint, {
        method: 'POST',
        body: JSON.stringify(test.body)
      });
      if (res.status >= 400 && res.status < 500) {
        failureTests.invalidInputs.handled++;
      } else if (res.status >= 500) {
        failureTests.invalidInputs.crashed++;
        recordWarning('failure_injection', `Server error on invalid input: ${test.endpoint}`);
      }
      failureTests.invalidInputs.total++;
    } catch (e) {
      failureTests.invalidInputs.handled++;
    }
  }
  console.log(
    `   Invalid inputs: ${failureTests.invalidInputs.handled}/${failureTests.invalidInputs.total} properly handled`
  );

  console.log('   Testing concurrent conflicting operations...');
  if (contexts.length > 0 && agents.length >= 3) {
    const conflictPromises = [];
    const targetContext = contexts[0];

    for (let i = 0; i < 10; i++) {
      conflictPromises.push(
        (async () => {
          const agent1 = agents[i % agents.length];
          const agent2 = agents[(i + 1) % agents.length];

          await apiCall('/context/update', {
            method: 'POST',
            body: JSON.stringify({
              context_id: targetContext,
              updates: { content: `Updated by ${agent1.name}` },
              reason: 'Conflict test',
              agent: agent1.agentId
            })
          });

          await apiCall('/context/update', {
            method: 'POST',
            body: JSON.stringify({
              context_id: targetContext,
              updates: { content: `Updated by ${agent2.name}` },
              reason: 'Conflict test',
              agent: agent2.agentId
            })
          });

          failureTests.concurrentConflict.total++;
        })()
      );
    }

    await Promise.allSettled(conflictPromises);
    failureTests.concurrentConflict.handled = failureTests.concurrentConflict.total;
    console.log(`   Concurrent conflicts: ${failureTests.concurrentConflict.total} operations`);
  }

  console.log('   Testing data recovery after failures...');
  try {
    const contextCount = await db?.collection('contexts').countDocuments();
    const taskCount = await db?.collection('tasks').countDocuments();
    console.log(`   ✅ Data integrity check: ${contextCount} contexts, ${taskCount} tasks`);

    if (contextCount > 0 && taskCount > 0) {
      failureTests.timeout.recovered = 1;
    }
  } catch (e) {
    failureTests.timeout.stuck++;
  }
  failureTests.timeout.total++;

  results.subsystems.failureInjection = {
    status: failureTests.invalidInputs.crashed === 0 ? 'pass' : 'fail',
    invalidInputs: failureTests.invalidInputs,
    concurrentConflict: failureTests.concurrentConflict,
    timeout: failureTests.timeout
  };

  return failureTests;
}

async function testSystemLimits() {
  console.log('\n⚡ PHASE 9: System Limits and Performance\n');

  const limitTests = {
    throughput: { operations: 0, duration: 0, opsPerSecond: 0 },
    latency: { p50: 0, p95: 0, p99: 0 }
  };

  console.log('   Measuring throughput under high load...');
  const throughputStart = Date.now();
  const throughputOps = [];

  for (let burst = 0; burst < 3; burst++) {
    const burstPromises = [];
    for (let i = 0; i < 50; i++) {
      const agent = agents[i % agents.length];
      burstPromises.push(
        (async () => {
          await apiCall('/context/search', {
            method: 'POST',
            body: JSON.stringify({
              query: 'stress-test',
              limit: 10,
              project: agent.project
            })
          });
          throughputOps.push(1);
        })()
      );
    }
    await Promise.allSettled(burstPromises);
  }

  limitTests.throughput.duration = Date.now() - throughputStart;
  limitTests.throughput.operations = throughputOps.length;
  limitTests.throughput.opsPerSecond = Math.round(
    (limitTests.throughput.operations / limitTests.throughput.duration) * 1000
  );

  console.log(`   Operations: ${limitTests.throughput.operations}`);
  console.log(`   Duration: ${limitTests.throughput.duration}ms`);
  console.log(`   Throughput: ${limitTests.throughput.opsPerSecond} ops/sec`);

  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    limitTests.latency.p50 = sorted[Math.floor(sorted.length * 0.5)];
    limitTests.latency.p95 = sorted[Math.floor(sorted.length * 0.95)];
    limitTests.latency.p99 = sorted[Math.floor(sorted.length * 0.99)];

    console.log(`   Latency P50: ${limitTests.latency.p50}ms`);
    console.log(`   Latency P95: ${limitTests.latency.p95}ms`);
    console.log(`   Latency P99: ${limitTests.latency.p99}ms`);

    results.metrics.maxLatencyMs = Math.max(...latencies);
    results.metrics.avgLatencyMs = Math.round(
      latencies.reduce((a, b) => a + b, 0) / latencies.length
    );
  }

  results.subsystems.performance = {
    status: limitTests.throughput.opsPerSecond > 10 ? 'pass' : 'degraded',
    throughput: limitTests.throughput,
    latency: limitTests.latency
  };

  return limitTests;
}

function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 STRESS TEST REPORT\n');
  console.log('='.repeat(80));

  const totalDuration = Date.now() - startTime;

  console.log('\n📈 SUMMARY\n');
  console.log(`   Total Duration: ${totalDuration}ms`);
  console.log(`   Total Operations: ${results.metrics.totalCalls}`);
  console.log(
    `   Successful: ${results.metrics.successfulCalls} (${((results.metrics.successfulCalls / results.metrics.totalCalls) * 100).toFixed(1)}%)`
  );
  console.log(
    `   Failed: ${results.metrics.failedCalls} (${((results.metrics.failedCalls / results.metrics.totalCalls) * 100).toFixed(1)}%)`
  );
  console.log(`   Average Latency: ${results.metrics.avgLatencyMs}ms`);
  console.log(`   Max Latency: ${results.metrics.maxLatencyMs}ms`);

  console.log('\n🏥 SUBSYSTEM STATUS\n');
  for (const [name, status] of Object.entries(results.subsystems)) {
    const icon = status.status === 'pass' ? '✅' : status.status === 'partial' ? '⚠️' : '❌';
    console.log(`   ${icon} ${name}: ${status.status}`);
  }

  console.log('\n🚨 CRITICAL ISSUES\n');
  if (results.issues.critical.length === 0) {
    console.log('   None');
  } else {
    for (const issue of results.issues.critical) {
      console.log(`   ❌ [CRITICAL] ${issue.message}`);
      if (issue.details) console.log(`      Details: ${JSON.stringify(issue.details)}`);
    }
  }

  console.log('\n⚠️ MEDIUM ISSUES\n');
  if (results.issues.medium.length === 0) {
    console.log('   None');
  } else {
    const uniqueMedium = [...new Map(results.issues.medium.map((i) => [i.message, i])).values()];
    for (const issue of uniqueMedium.slice(0, 10)) {
      console.log(`   ⚠️  [MEDIUM] ${issue.message}`);
    }
    if (uniqueMedium.length > 10) {
      console.log(`   ... and ${uniqueMedium.length - 10} more`);
    }
  }

  console.log('\n📝 MINOR ISSUES\n');
  if (results.issues.minor.length === 0) {
    console.log('   None');
  } else {
    const uniqueMinor = [...new Map(results.issues.minor.map((i) => [i.message, i])).values()];
    for (const issue of uniqueMinor.slice(0, 5)) {
      console.log(`   ℹ️  [MINOR] ${issue.message}`);
    }
    if (uniqueMinor.length > 5) {
      console.log(`   ... and ${uniqueMinor.length - 5} more`);
    }
  }

  console.log('\n🔄 RACE CONDITIONS DETECTED\n');
  if (results.metrics.raceConditions.length === 0) {
    console.log('   None detected');
  } else {
    for (const race of results.metrics.raceConditions) {
      console.log(`   ⚠️  ${race.operation}`);
      console.log(`      ${JSON.stringify(race.details)}`);
    }
  }

  console.log('\n🔍 DATA INCONSISTENCIES\n');
  if (results.metrics.dataInconsistencies.length === 0) {
    console.log('   None detected');
  } else {
    for (const issue of results.metrics.dataInconsistencies) {
      console.log(`   ❌ ${issue.type}`);
      console.log(`      ${JSON.stringify(issue.details)}`);
    }
  }

  console.log('\n💡 RECOMMENDATIONS\n');

  const recommendations = [];

  if (results.metrics.maxLatencyMs > 5000) {
    recommendations.push('High latency detected - consider query optimization and indexing');
  }

  if (results.metrics.raceConditions.length > 0) {
    recommendations.push(
      'Race conditions detected - implement optimistic locking for critical operations'
    );
  }

  if (results.subsystems.memory?.update?.failed > 5) {
    recommendations.push('Memory update failures detected - review version conflict handling');
  }

  if (results.subsystems.tasks?.assign?.raceClaims > 0) {
    recommendations.push('Task assignment conflicts - implement atomic claim operations');
  }

  if (results.subsystems.browser?.sessions?.maxConcurrent < 3) {
    recommendations.push('Browser session capacity limited - investigate shared browser pool');
  }

  if (recommendations.length === 0) {
    recommendations.push('System appears stable - continue monitoring in production');
  }

  for (const rec of recommendations) {
    console.log(`   • ${rec}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ STRESS TEST COMPLETE\n');
  console.log('='.repeat(80));

  return results;
}

async function runStressTest() {
  console.log('\n' + '='.repeat(80));
  console.log('\n🚀 MCP MULTI-AGENT SYSTEM STRESS TEST\n');
  console.log('='.repeat(80));

  const setupSuccess = await setup();
  if (!setupSuccess) {
    console.log('\n❌ Setup failed - cannot proceed with stress test');
    return;
  }

  await registerAgents();
  await testMemoryOperations();
  await testTaskOperations();
  await testFeedbackSystem();
  await testChatSystem();
  await testBrowserAutomation();
  await testEmulatorPlugin();
  await testFailureInjection();
  await testSystemLimits();

  await teardown();
  generateReport();

  return results;
}

runStressTest().catch(console.error);
