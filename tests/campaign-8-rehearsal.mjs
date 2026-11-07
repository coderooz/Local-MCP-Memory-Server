import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

import {
  runMigration,
  verifyBackup,
  rollbackMigration
} from '../src/core/migration/mongo-to-sqlite.js';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `camp8-${prefix}-`));
}

function createSyntheticSource() {
  const contexts = [
    {
      _id: 'ctx-001',
      id: 'ctx-uuid-1',
      project: 'proj-alpha',
      agent: 'agent-1',
      content: 'Production-like memory with Unicode 🚀 and special characters & < > "',
      summary: 'Unicode test memory',
      score: 9.8, // unmapped field
      importance: 5,
      accessCount: 12,
      lifecycle: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      _id: 'ctx-002',
      id: 'ctx-uuid-2',
      project: 'proj-beta',
      agent: 'agent-2',
      content: 'Large memory snapshot test ' + 'X'.repeat(50000), // 50 KB
      summary: 'Large memory',
      score: 4.2,
      importance: 3,
      accessCount: 1,
      lifecycle: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const memory_versions = [
    {
      _id: 'mv-001',
      id: 'mv-uuid-1',
      context_id: 'ctx-uuid-1',
      version: 1,
      changedBy: 'agent-1',
      change_type: 'create',
      reason: 'initial creation',
      snapshot: { content: 'Initial version' },
      importance: 5, // unmapped on version
      accessCount: 12, // unmapped on version
      lifecycle: 'active', // unmapped on version
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const agents = [
    {
      _id: 'agent-001',
      id: 'agent-normal-1',
      name: 'Agent Alpha',
      project: 'proj-alpha',
      agent_id: 'agent-alpha-id',
      agent: 'agent-alpha',
      status: 'active',
      role: 'worker',
      capabilities: ['code', 'test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      _id: 'agent-002',
      id: '62245e58-cce6-4780-b9ba-151ce0dd7016',
      name: 'Agent-1',
      project: 'vuln-test-project',
      agent_id: { $gt: '' }, // malformed NoSQL operator
      agent: { $gt: '' },    // malformed NoSQL operator
      status: 'active',
      role: 'worker',
      capabilities: ['coding', 'testing'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const chat_rooms = [
    {
      _id: 'room-001',
      room_id: 'room-uuid-1',
      name: 'test-room',
      project: 'proj-alpha',
      scope: 'project',
      participants: ['agent-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const chat_messages = [
    {
      _id: 'msg-001',
      message_id: 'msg-uuid-1',
      room_id: 'test-room', // name-based reference that must resolve
      from_agent: 'agent-1',
      content: 'Hello in room',
      type: 'text',
      createdAt: new Date().toISOString()
    }
  ];

  const tasks = [
    {
      _id: 'task-001',
      id: 'task-uuid-1',
      title: 'Coordinate deployment',
      project: 'proj-alpha',
      assigned_to: 'agent-1',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const store = {
    contexts,
    memory_versions,
    agents,
    chat_rooms,
    chat_messages,
    tasks
  };

  return {
    database: 'synthetic_rehearsal',
    uri: 'memory://mock',
    async listCollections() {
      return Object.keys(store);
    },
    async estimatedCount(name) {
      return (store[name] || []).length;
    },
    async *stream(name) {
      for (const doc of store[name] || []) yield doc;
    },
    async close() {}
  };
}

async function runRehearsal() {
  console.log('=== Campaign 8: Synthetic Migration Rehearsal ===\n');
  const root = tempDir('rehearsal');
  const dbPath = path.join(root, 'rehearsal.db');
  const backupDir = path.join(root, 'backups');

  const source = createSyntheticSource();

  console.log('1. Testing Dry-Run...');
  const dryReport = await runMigration({
    source,
    dbPath,
    apply: false,
    reportPath: path.join(root, 'dry-run.json')
  });
  assert.equal(dryReport.ok, true);
  assert.equal(fs.existsSync(dbPath), false, 'Dry-run must not create destination SQLite database');
  console.log('  ✔ Dry-run passed: 0 writes to disk, report generated.');

  console.log('\n2. Testing Apply Mode with Malformed Agent & Unmapped Fields...');
  const applyReport = await runMigration({
    source,
    dbPath,
    apply: true,
    backupDir,
    reportPath: path.join(root, 'apply.json')
  });
  assert.equal(applyReport.ok, true, `Apply failed: ${applyReport.error}`);
  console.log('  ✔ Apply succeeded.');

  console.log('\n3. Verifying Data Fidelity & Schema in SQLite...');
  const db = new Database(dbPath, { readonly: true });
  try {
    // Verify contexts
    const ctx1 = db.prepare("SELECT * FROM contexts WHERE id = 'ctx-uuid-1'").get();
    assert.ok(ctx1, 'Context 1 must exist');
    assert.ok(ctx1.content.includes('🚀'), 'Unicode must survive roundtrip');
    assert.equal(ctx1.importance, 5, 'Importance column mapped correctly');
    assert.equal(ctx1.accessCount, 12, 'AccessCount column mapped correctly');
    assert.equal(ctx1.lifecycle, 'active', 'Lifecycle column mapped correctly');
    const meta1 = JSON.parse(ctx1.metadata);
    assert.equal(meta1._migration.unmapped.score, 9.8, 'Unmapped score preserved in metadata');
    console.log('  ✔ Contexts data fidelity & unmapped preservation verified.');

    // Verify 50KB large context
    const ctx2 = db.prepare("SELECT * FROM contexts WHERE id = 'ctx-uuid-2'").get();
    assert.equal(ctx2.content.length, 'Large memory snapshot test '.length + 50000);
    console.log('  ✔ Large 50KB payload preserved intact.');

    // Verify malformed agent
    const vulnAgent = db.prepare("SELECT * FROM agents WHERE id = '62245e58-cce6-4780-b9ba-151ce0dd7016'").get();
    assert.ok(vulnAgent, 'Vuln agent must exist in SQLite');
    const vulnMeta = JSON.parse(vulnAgent.metadata);
    assert.ok(vulnMeta._migration.coerced.agent_id, 'Malformed query operator preserved in coerced metadata');
    assert.ok(vulnMeta._migration.coerced.agent, 'Malformed query operator preserved in coerced metadata');
    console.log('  ✔ Malformed agent handled safely; raw operator preserved in metadata._migration.coerced.');

    // Verify chat room name resolution
    const chatMsg = db.prepare("SELECT * FROM chat_messages WHERE message_id = 'msg-uuid-1'").get();
    assert.equal(chatMsg.room_id, 'room-uuid-1', 'Room name "test-room" must resolve to "room-uuid-1"');
    console.log('  ✔ Chat message room name dynamically resolved to parent room UUID.');

    // Verify FTS5 search
    const ftsSearch = db.prepare("SELECT * FROM contexts_fts WHERE contexts_fts MATCH 'Unicode'").all();
    assert.equal(ftsSearch.length, 1, 'FTS5 search must find indexed context');
    console.log('  ✔ FTS5 full-text indexing verified.');
  } finally {
    db.close();
  }

  console.log('\n4. Verifying Source Backup Integrity...');
  const backupVerify = await verifyBackup({ backupDir });
  assert.equal(backupVerify.ok, true, 'Backup verification must pass');
  console.log('  ✔ Pre-migration JSONL backup verified with valid SHA-256 manifest.');

  console.log('\n5. Testing Rollback Restoration...');
  const rollbackRes = await rollbackMigration({
    backupDir,
    dbPath,
    yes: true
  });
  assert.equal(rollbackRes.ok, true, `Rollback failed: ${rollbackRes.error}`);
  console.log('  ✔ Rollback successfully restored initial destination state.');

  console.log('\n=== ALL SYNTHETIC REHEARSAL TESTS PASSED (100%) ===');
}

runRehearsal().catch((err) => {
  console.error('Rehearsal failed:', err);
  process.exit(1);
});
