#!/usr/bin/env node

/**
 * Migration Tests (MongoDB v2.5.x -> SQLite v2.6.x)
 *
 * Exercises `src/core/migration/mongo-to-sqlite.js` against an in-memory fake
 * MongoDB reader and throwaway SQLite databases:
 * - dry run writes nothing and reconciles every present collection
 * - apply writes a verified source backup and destination snapshot first
 * - re-apply with `resume` is idempotent (no duplicate rows)
 * - duplicate identifiers are detected (error / first policies)
 * - orphan references are detected and can be skipped
 * - chat_messages room NAMES resolve to real chat_rooms ids and inherit
 *   project/scope/agent
 * - unmapped source fields and coerced values are preserved under
 *   metadata._migration
 * - FTS5 indexes are searchable after migration
 * - rollback restores the pre-migration snapshot
 * - verifyBackup detects a tampered JSONL file
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { createSchema } from '../src/core/database/sqlite/schema.js';
import {
  MIGRATION_VERSION,
  redactUri,
  rollbackMigration,
  runMigration,
  verifyBackup
} from '../src/core/migration/mongo-to-sqlite.js';

const T = '2026-01-01T00:00:00.000Z';
const ABSENT = ['connections', 'emulators', 'execution_approvals', 'execution_jobs', 'mcp_servers'];

let passed = 0;
let failed = 0;
const tempRoots = [];

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

function tempRoot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lmcp-migration-${label}-`));
  tempRoots.push(dir);
  return dir;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Minimal read-only reader with the same surface as `createMongoReader`.
 */
function fakeReader(collections) {
  return {
    database: 'mcp_memory',
    uri: 'mongodb://localhost:27017/mcp_memory',
    async listCollections() {
      return Object.keys(collections).sort();
    },
    async estimatedCount(name) {
      return (collections[name] || []).length;
    },
    async *stream(name) {
      for (const doc of collections[name] || []) yield clone(doc);
    },
    async close() {}
  };
}

/**
 * A small, valid v2.5.x dataset covering every collection the migration maps.
 */
function baseFixture() {
  return {
    contexts: [
      {
        id: 'ctx-1',
        project: 'alpha',
        agent: 'agent-a',
        sessionId: 'sess-1',
        scope: 'project',
        type: 'note',
        content: 'Alpha context about vector search',
        summary: 'alpha context',
        tags: ['alpha'],
        metadata: { origin: 'test' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        importance: 4,
        lifecycle: 'active',
        version: 2,
        accessCount: 7,
        legacyField: 'preserve-me'
      },
      {
        id: 'ctx-2',
        project: 'beta',
        agent: 'agent-b',
        scope: 'project',
        type: 'note',
        content: 'Beta context about sqlite indexes',
        summary: 'beta context',
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        importance: { nested: 1 }
      }
    ],
    memory_versions: [
      {
        id: 'mv-1',
        version_id: 'mv-1',
        context_id: 'ctx-1',
        project: 'alpha',
        version: 2,
        changedAt: '2026-01-02T00:00:00.000Z',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z'
      }
    ],
    actions: [
      {
        id: 'act-1',
        project: 'alpha',
        agent: 'agent-a',
        actionType: 'store',
        summary: 'stored a context',
        createdAt: T,
        updatedAt: T
      }
    ],
    sessions: [
      {
        id: 'ses-row-1',
        sessionId: 'sess-1',
        project: 'alpha',
        agent: 'agent-a',
        status: 'active',
        startedAt: T,
        createdAt: T,
        updatedAt: T
      }
    ],
    agents: [
      {
        id: 'agent-row-a',
        agent_id: 'agent-a',
        agent: 'agent-a',
        project: 'alpha',
        name: 'Agent A',
        status: 'active',
        role: 'agent',
        last_seen: T,
        createdAt: T,
        updatedAt: T
      },
      {
        id: 'agent-row-b',
        agent_id: { $gt: '' },
        agent: { $gt: '' },
        project: 'beta',
        name: 'Agent B',
        status: 'active',
        role: 'agent',
        last_seen: T,
        createdAt: T,
        updatedAt: T
      }
    ],
    tasks: [
      {
        id: 'task-1',
        task_id: 'task-1',
        project: 'alpha',
        agent: 'agent-a',
        title: 'Migrate the data',
        status: 'pending',
        priority: 'high',
        createdAt: T,
        updatedAt: T
      }
    ],
    messages: [
      {
        id: 'msg-row-1',
        message_id: 'msg-row-1',
        project: 'alpha',
        from_agent: 'agent-a',
        to_agent: 'agent-b',
        content: 'handoff',
        createdAt: T,
        updatedAt: T
      }
    ],
    issues: [
      {
        id: 'issue-row-1',
        issue_id: 'issue-row-1',
        project: 'alpha',
        title: 'Broken index',
        status: 'open',
        type: 'bug',
        createdAt: T,
        updatedAt: T
      }
    ],
    project_map: [
      {
        id: 'map-1',
        map_id: 'map-1',
        project: 'alpha',
        file_path: 'src/a.js',
        summary: 'module a',
        type: 'file',
        last_verified_at: T,
        createdAt: T,
        updatedAt: T
      }
    ],
    activity: [
      {
        id: 'activity-1',
        activity_id: 'activity-1',
        project: 'alpha',
        agent: 'agent-a',
        type: 'note',
        message: 'started work',
        timestamp: T,
        createdAt: T,
        updatedAt: T
      },
      {
        id: 'activity-2',
        activity_id: 'activity-2',
        project: 'beta',
        agent: 'agent-b',
        type: 'note',
        message: 'reviewed work',
        timestamp: T,
        createdAt: T,
        updatedAt: T
      }
    ],
    resource_locks: [
      {
        id: 'lock-1',
        lock_id: 'lock-1',
        project: 'alpha',
        resource: 'src/a.js',
        locked_by: 'agent-a',
        expiresAt: '2030-01-01T00:00:00.000Z',
        createdAt: T,
        updatedAt: T
      }
    ],
    metrics: [
      {
        id: 'metric-1',
        metric_id: 'metric-1',
        project: 'alpha',
        name: 'tasks_created',
        metric_type: 'counter',
        value: 3,
        recordedAt: T,
        createdAt: T,
        updatedAt: T
      }
    ],
    feedbacks: [
      {
        id: 'feedback-row-1',
        feedback_id: 'feedback-row-1',
        project: 'alpha',
        title: 'Nice tool',
        status: 'open',
        type: 'general',
        createdAt: T,
        updatedAt: T
      }
    ],
    chat_rooms: [
      {
        id: 'room-uuid-1',
        room_id: 'room-uuid-1',
        name: 'general-alpha',
        project: 'alpha',
        scope: 'project',
        created_by: 'agent-a',
        createdAt: T,
        updatedAt: T
      },
      {
        id: 'room-uuid-2',
        room_id: 'room-uuid-2',
        name: 'general-beta',
        project: 'beta',
        scope: 'project',
        created_by: 'agent-b',
        createdAt: T,
        updatedAt: T
      }
    ],
    chat_messages: [
      {
        id: 'chat-msg-1',
        message_id: 'chat-msg-1',
        room_id: 'general-alpha',
        from_agent: 'agent-a',
        content: 'hello alpha',
        createdAt: T,
        updatedAt: T
      },
      {
        id: 'chat-msg-2',
        message_id: 'chat-msg-2',
        room_id: 'general-beta',
        from_agent: 'agent-b',
        content: 'hello beta',
        createdAt: T,
        updatedAt: T
      }
    ],
    logs: [
      {
        id: 'log-1',
        type: 'info',
        message: 'server started',
        context: { module: 'server' },
        createdAt: T,
        updatedAt: T
      }
    ]
  };
}

function runOptions(root, collections, overrides = {}) {
  return {
    source: fakeReader(collections),
    dbPath: path.join(root, 'migration.db'),
    backupDir: path.join(root, 'backup'),
    reportPath: false,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test('dry run inspects every collection and writes nothing', async () => {
  const root = tempRoot('dry');
  const dbPath = path.join(root, 'migration.db');
  const report = await runMigration(runOptions(root, baseFixture()));

  assert(report.ok, `dry run failed: ${report.error}`);
  assert(report.mode === 'dry-run', `unexpected mode ${report.mode}`);
  assert(!fs.existsSync(dbPath), 'dry run created the destination database');
  assert(
    report.collections.length === 16,
    `expected 16 present collections, got ${report.collections.length}`
  );
  assert(
    JSON.stringify([...report.absentCollections].sort()) === JSON.stringify(ABSENT),
    `unexpected absent collections: ${report.absentCollections.join(', ')}`
  );
  assert(report.totals.read === 21, `expected 21 documents read, got ${report.totals.read}`);
  assert(report.totals.written === 21, `expected 21 writable rows, got ${report.totals.written}`);
  assert(report.checks.duplicateIdentifiers === 0, 'unexpected duplicate identifiers');
  assert(report.checks.orphanReferences === 0, 'unexpected orphan references');
  assert(MIGRATION_VERSION === 1, 'unexpected migration version');
});

await test('apply writes a verified backup and a destination snapshot', async () => {
  const root = tempRoot('apply');
  const dbPath = path.join(root, 'migration.db');
  const report = await runMigration(runOptions(root, baseFixture(), { apply: true }));

  assert(report.ok, `apply failed: ${report.error}`);
  assert(report.mode === 'apply', `unexpected mode ${report.mode}`);
  assert(fs.existsSync(dbPath), 'destination database was not created');

  const manifestPath = path.join(root, 'backup', 'manifest.json');
  assert(fs.existsSync(manifestPath), 'backup manifest is missing');
  assert(report.backup.verified === true, 'source backup self-verification failed');

  const verification = await verifyBackup({ backupDir: path.join(root, 'backup') });
  assert(verification.ok, 'verifyBackup reported a problem for a fresh backup');
  assert(verification.collections.length === 16, 'backup is missing collections');

  const snapshotPath = path.join(root, 'backup', 'destination-before-migration.db');
  // The destination file is created and snapshotted before the first write, so
  // the snapshot exists even for a brand-new destination; it records an empty
  // database and stays restorable.
  assert(fs.existsSync(snapshotPath), 'destination snapshot was not written');
  assert(report.destination.existedBefore === false, 'destination was reported as pre-existing');
  assert(report.snapshot.existed === true, 'snapshot should exist once the database is created');

  assert(report.checks.integrity === 'ok', `integrity: ${report.checks.integrity}`);
  assert(report.checks.foreignKeyViolations.length === 0, 'foreign key violations after migrate');
  assert(report.checks.ftsIntegrity === 'ok', `FTS integrity: ${report.checks.ftsIntegrity}`);
  assert(
    report.checks.reconciliation.every((entry) => entry.missing === 0),
    'reconciliation reported missing ids'
  );
  assert(
    report.checks.samples.every((entry) => entry.ok),
    `sample mismatches: ${JSON.stringify(report.checks.samples.filter((entry) => !entry.ok))}`
  );
  assert(report.totals.written === 21, `expected 21 inserted rows, got ${report.totals.written}`);

  const db = new Database(dbPath, { readonly: true });
  try {
    const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
    assert(count('contexts') === 2, 'contexts count mismatch');
    assert(count('chat_rooms') === 2, 'chat_rooms count mismatch');
    assert(count('chat_messages') === 2, 'chat_messages count mismatch');
    assert(count('activity') === 2, 'activity count mismatch');
    assert(count('agents') === 2, 'agents count mismatch');
  } finally {
    db.close();
  }
});

await test('resume re-applies idempotently without duplicating rows', async () => {
  const root = tempRoot('resume');
  const dbPath = path.join(root, 'migration.db');

  const first = await runMigration(
    runOptions(root, baseFixture(), { apply: true, backupDir: path.join(root, 'backup-1') })
  );
  assert(first.ok, `initial apply failed: ${first.error}`);

  const second = await runMigration(
    runOptions(root, baseFixture(), {
      apply: true,
      resume: true,
      backupDir: path.join(root, 'backup-2')
    })
  );
  assert(second.ok, `resume failed: ${second.error}`);
  assert(second.totals.written === 0, `resume wrote ${second.totals.written} new rows`);
  assert(
    second.collections.every((entry) => entry.inserted === 0),
    'resume inserted rows instead of updating'
  );
  assert(
    second.collections.every((entry) => entry.updated === entry.read),
    'resume did not update every source row'
  );

  const db = new Database(dbPath, { readonly: true });
  try {
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM contexts').get().count === 2,
      'resume duplicated contexts'
    );
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM resource_locks').get().count === 1,
      'resume duplicated resource locks'
    );
  } finally {
    db.close();
  }
});

await test('duplicate identifiers fail the run unless a policy is given', async () => {
  const duplicate = baseFixture();
  duplicate.contexts.push(clone(duplicate.contexts[0]));

  const strict = await runMigration(runOptions(tempRoot('dup-strict'), duplicate));
  assert(!strict.ok, 'duplicate identifiers were accepted');
  assert(
    /Duplicate identifier "ctx-1"/.test(strict.error || ''),
    `unexpected error: ${strict.error}`
  );

  const lenient = await runMigration(
    runOptions(tempRoot('dup-first'), duplicate, { onDuplicate: 'first' })
  );
  assert(lenient.ok, `first-wins run failed: ${lenient.error}`);
  const contexts = lenient.collections.find((entry) => entry.name === 'contexts');
  assert(contexts.duplicates === 1, 'duplicate was not counted');
  assert(contexts.wouldSkip === 1, 'duplicate was not skipped');
  assert(contexts.wouldInsert === 2, `unexpected insert count ${contexts.wouldInsert}`);
});

await test('orphan references fail the run and can be skipped explicitly', async () => {
  const fixture = baseFixture();
  fixture.chat_messages.push({
    id: 'chat-msg-3',
    message_id: 'chat-msg-3',
    room_id: 'missing-room',
    from_agent: 'agent-a',
    content: 'lost message',
    createdAt: T,
    updatedAt: T
  });

  const strict = await runMigration(
    runOptions(tempRoot('orphan-strict'), fixture, { apply: true })
  );
  assert(!strict.ok, 'orphan reference was accepted');
  assert(/Orphan reference/.test(strict.error || ''), `unexpected error: ${strict.error}`);

  const lenient = await runMigration(
    runOptions(tempRoot('orphan-skip'), fixture, { apply: true, orphans: 'skip' })
  );
  assert(lenient.ok, `skip policy failed: ${lenient.error}`);
  const chat = lenient.collections.find((entry) => entry.name === 'chat_messages');
  assert(chat.skipped === 1, `expected 1 skipped message, got ${chat.skipped}`);
  assert(chat.inserted === 2, `expected 2 inserted messages, got ${chat.inserted}`);
});

await test('chat message room names resolve and inherit room metadata', async () => {
  const root = tempRoot('chat');
  const dbPath = path.join(root, 'migration.db');
  const report = await runMigration(runOptions(root, baseFixture(), { apply: true }));
  assert(report.ok, `apply failed: ${report.error}`);

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT * FROM chat_messages ORDER BY id').all();
    assert(rows.length === 2, 'unexpected chat message count');
    assert(
      rows.every((row) => row.room_id.startsWith('room-uuid-')),
      'room names were not resolved to room ids'
    );

    const alpha = rows.find((row) => row.id === 'chat-msg-1');
    assert(alpha.room_id === 'room-uuid-1', `room_id: ${alpha.room_id}`);
    assert(alpha.project === 'alpha', `project not inherited: ${alpha.project}`);
    assert(alpha.agent === 'agent-a', `agent not derived: ${alpha.agent}`);
    assert(alpha.scope === 'project', `scope: ${alpha.scope}`);
    assert(alpha.updatedAt === alpha.createdAt, 'updatedAt did not fall back to createdAt');

    const beta = rows.find((row) => row.id === 'chat-msg-2');
    assert(beta.project === 'beta', `project not inherited: ${beta.project}`);
    assert(beta.agent === 'agent-b', `agent not derived: ${beta.agent}`);
  } finally {
    db.close();
  }
});

await test('unmapped fields and coerced values survive in metadata._migration', async () => {
  const root = tempRoot('fidelity');
  const dbPath = path.join(root, 'migration.db');
  const report = await runMigration(runOptions(root, baseFixture(), { apply: true }));
  assert(report.ok, `apply failed: ${report.error}`);

  const db = new Database(dbPath, { readonly: true });
  try {
    const ctx1 = db.prepare("SELECT * FROM contexts WHERE id = 'ctx-1'").get();
    const meta1 = JSON.parse(ctx1.metadata);
    assert(meta1.origin === 'test', 'application metadata was replaced');
    assert(meta1._migration.unmapped.legacyField === 'preserve-me', 'unmapped field was lost');
    assert(meta1._migration.sourceCollection === 'contexts', 'sourceCollection missing');
    assert(ctx1.accessCount === 7, `mapped accessCount lost: ${ctx1.accessCount}`);

    const ctx2 = db.prepare("SELECT * FROM contexts WHERE id = 'ctx-2'").get();
    const meta2 = JSON.parse(ctx2.metadata);
    assert(
      meta2._migration.coerced.importance && meta2._migration.coerced.importance.nested === 1,
      'object in numeric column was not preserved'
    );
    assert(ctx2.importance === 3, `expected default importance 3, got ${ctx2.importance}`);

    const agentB = db.prepare("SELECT * FROM agents WHERE id = 'agent-row-b'").get();
    const metaB = JSON.parse(agentB.metadata);
    assert(
      metaB._migration.coerced.agent_id &&
        Object.prototype.hasOwnProperty.call(metaB._migration.coerced.agent_id, '$gt'),
      'query operator was not preserved'
    );
    assert(agentB.agent_id === '', `agent_id should be empty, got "${agentB.agent_id}"`);
  } finally {
    db.close();
  }
});

await test('full-text indexes are searchable after migration', async () => {
  const root = tempRoot('fts');
  const dbPath = path.join(root, 'migration.db');
  const report = await runMigration(runOptions(root, baseFixture(), { apply: true }));
  assert(report.ok, `apply failed: ${report.error}`);

  const db = new Database(dbPath, { readonly: true });
  try {
    const contexts = db
      .prepare("SELECT id FROM contexts_fts WHERE contexts_fts MATCH 'vector'")
      .all();
    assert(
      contexts.some((row) => row.id === 'ctx-1'),
      'contexts_fts did not index the migrated content'
    );

    const maps = db
      .prepare("SELECT id FROM project_map_fts WHERE project_map_fts MATCH 'module'")
      .all();
    assert(
      maps.some((row) => row.id === 'map-1'),
      'project_map_fts did not index the migrated summary'
    );
  } finally {
    db.close();
  }
});

await test('rollback restores the pre-migration destination', async () => {
  const root = tempRoot('rollback');
  const dbPath = path.join(root, 'migration.db');

  // A pre-existing destination with one sentinel row.
  const seed = new Database(dbPath);
  try {
    createSchema(seed);
    seed
      .prepare(
        'INSERT INTO contexts (id, project, agent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
      )
      .run('ctx-sentinel', 'alpha', 'agent-a', T, T);
  } finally {
    seed.close();
  }

  const backupDir = path.join(root, 'backup');
  const report = await runMigration(
    runOptions(root, baseFixture(), { apply: true, resume: true, backupDir })
  );
  assert(report.ok, `apply failed: ${report.error}`);
  assert(report.snapshot.existed === true, 'snapshot did not record the existing destination');
  assert(
    fs.existsSync(path.join(backupDir, 'destination-before-migration.db')),
    'destination snapshot is missing'
  );

  let db = new Database(dbPath, { readonly: true });
  try {
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM contexts').get().count === 3,
      'migration did not add rows to the seeded destination'
    );
  } finally {
    db.close();
  }

  const refused = await rollbackMigration({ backupDir, dbPath });
  assert(!refused.ok, 'rollback ran without confirmation');
  assert(/confirmation/i.test(refused.error || ''), `unexpected error: ${refused.error}`);

  const restored = await rollbackMigration({ backupDir, dbPath, yes: true });
  assert(restored.ok, `rollback failed: ${restored.error}`);
  assert(restored.integrity === 'ok', `integrity after rollback: ${restored.integrity}`);

  db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT id FROM contexts').all();
    assert(rows.length === 1 && rows[0].id === 'ctx-sentinel', 'pre-migration state not restored');
    assert(
      db.prepare('SELECT COUNT(*) AS count FROM chat_messages').get().count === 0,
      'post-migration rows survived the rollback'
    );
  } finally {
    db.close();
  }
});

await test('verifyBackup detects a tampered collection file', async () => {
  const root = tempRoot('tamper');
  const backupDir = path.join(root, 'backup');
  const report = await runMigration(runOptions(root, baseFixture(), { apply: true, backupDir }));
  assert(report.ok, `apply failed: ${report.error}`);

  const clean = await verifyBackup({ backupDir });
  assert(clean.ok, 'a fresh backup failed verification');

  fs.appendFileSync(
    path.join(backupDir, 'contexts.jsonl'),
    `${JSON.stringify({ id: 'ctx-injected' })}\n`,
    'utf8'
  );

  const tampered = await verifyBackup({ backupDir });
  assert(!tampered.ok, 'tampering was not detected');
  const entry = tampered.collections.find((item) => item.name === 'contexts');
  assert(entry && entry.ok === false, 'tampered collection was reported as valid');
});

await test('redactUri removes credentials from connection strings', async () => {
  const redacted = redactUri('mongodb://user:supersecret@127.0.0.1:27017/mcp_memory');
  assert(!redacted.includes('supersecret'), `password leaked: ${redacted}`);
  assert(redacted.includes('user'), `username was removed: ${redacted}`);
  assert(redactUri(null) === null, 'null uri handling changed');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const dir of tempRoots) {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
