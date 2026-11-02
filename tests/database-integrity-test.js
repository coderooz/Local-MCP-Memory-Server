#!/usr/bin/env node

/**
 * Database Integrity Tests
 *
 * Proves the internal SQLite database is deployment-ready end to end:
 * - PRAGMAs (foreign_keys, WAL), integrity_check, foreign_key_check
 * - Schema completeness: 21 domain tables + 2 FTS tables + triggers + indexes
 * - Adapter fidelity: boolean/Date binding, unknown-column filtering,
 *   $inc, $set, dotted-path sort, $regex (REGEXP), $gte with Date params
 * - Foreign keys: rejection, ON DELETE CASCADE, ON DELETE SET NULL
 * - Unique constraints + idempotency (tasks, chat_messages)
 * - Transactions (BEGIN/ROLLBACK)
 * - FTS5 external-content sync (insert/update/delete triggers)
 * - Service-level E2E: chat (room -> messages -> sequence -> default room)
 *   and task (create + idempotent replay)
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { initializeDatabase, getDatabase } from '../src/core/database/sqlite/index.js';
import { getDb as getRawDb } from '../src/core/database/sqlite/connection.js';
import { normalizeMemory } from '../core/mcp/models.js';
import {
  createRoom,
  getRoomById,
  sendMessage,
  getMessages,
  deleteRoom,
  getOrCreateDefaultRoom,
} from '../src/domains/chat/chat.service.js';
import { createTask } from '../src/domains/task/task.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TABLES = [
  'contexts',
  'memory_versions',
  'actions',
  'sessions',
  'agents',
  'tasks',
  'messages',
  'issues',
  'project_map',
  'activity',
  'resource_locks',
  'metrics',
  'feedbacks',
  'chat_rooms',
  'chat_messages',
  'logs',
  'emulators',
  'connections',
  'mcp_servers',
  'execution_jobs',
  'execution_approvals',
];

const FTS_TABLES = ['contexts_fts', 'project_map_fts'];

const FTS_TRIGGERS = [
  'contexts_ai',
  'contexts_ad',
  'contexts_au',
  'project_map_ai',
  'project_map_ad',
  'project_map_au',
];

const KEY_INDEXES = [
  'idx_resource_locks_unique',
  'idx_tasks_idempotency',
  'idx_chat_messages_idempotency',
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

const iso = () => new Date().toISOString();

/**
 * Build a minimal insert doc from PRAGMA table_info: fills every
 * NOT NULL column that lacks a DEFAULT so insertOne can succeed on
 * any table without hand-written fixtures.
 */
function buildMinimalDoc(raw, table) {
  const cols = raw.prepare(`PRAGMA table_info("${table}")`).all();
  const nowIso = iso();
  const doc = {};
  for (const col of cols) {
    const name = col.name;
    const lower = name.toLowerCase();
    // SQLite reports notnull=0 for "id TEXT PRIMARY KEY" columns, so the
    // PK must be filled before the NOT NULL guard below can skip it.
    if (name === 'id') {
      doc.id = uuidv4();
      continue;
    }
    if (!col.notnull || col.dflt_value !== null) continue;
    if (
      /createdat|updatedat|changedat|recordedat|expiresat|timestamp|edited_at|resolvedat|lastaccessedat|lastactivityat|last_seen/.test(
        lower
      )
    ) {
      doc[name] = nowIso;
    } else if (/INTEGER|REAL|NUMERIC|BIGINT/i.test(col.type || '')) {
      doc[name] = 1;
    } else {
      doc[name] = `dbtest-${name}`;
    }
  }
  return doc;
}

async function runTests() {
  console.log('=== Database Integrity Tests ===\n');

  const dbPath = path.join(__dirname, '..', 'data', 'test-db-integrity.db');
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* fresh anyway */
    }
  }

  await initializeDatabase(dbPath);
  const db = getDatabase();
  const raw = getRawDb();

  console.log('Database initialized (fresh)\n');

  // ---------------------------------------------------------------
  // A. Pragmas & schema structure
  // ---------------------------------------------------------------
  await test('PRAGMA foreign_keys = ON', () => {
    const fk = raw.pragma('foreign_keys', { simple: true });
    assert(fk === 1, `foreign_keys pragma = ${fk}, expected 1`);
  });

  await test('PRAGMA journal_mode = WAL', () => {
    const mode = raw.pragma('journal_mode', { simple: true });
    assert(mode === 'wal', `journal_mode = ${mode}, expected wal`);
  });

  await test('PRAGMA integrity_check = ok', () => {
    const result = raw.pragma('integrity_check', { simple: true });
    assert(result === 'ok', `integrity_check returned ${result}`);
  });

  await test('PRAGMA foreign_key_check reports no violations', () => {
    const violations = raw.pragma('foreign_key_check');
    assert(violations.length === 0, `found ${violations.length} FK violations`);
  });

  await test('all 21 domain tables exist', () => {
    const names = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
    for (const t of TABLES) assert(names.includes(t), `missing table: ${t}`);
  });

  await test('both FTS virtual tables exist', () => {
    const names = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    for (const t of FTS_TABLES) assert(names.includes(t), `missing FTS table: ${t}`);
  });

  await test('FTS sync triggers exist (insert/update/delete x2)', () => {
    const names = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all()
      .map((r) => r.name);
    for (const trg of FTS_TRIGGERS) assert(names.includes(trg), `missing trigger: ${trg}`);
  });

  await test('key indexes exist (lock unique + both idempotency unique)', () => {
    const names = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => r.name);
    for (const idx of KEY_INDEXES) assert(names.includes(idx), `missing index: ${idx}`);
  });

  // ---------------------------------------------------------------
  // B. Adapter fidelity
  // ---------------------------------------------------------------
  await test('round-trip insert/read/delete on all 21 tables (extra columns filtered)', async () => {
    const seedCtxId = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id: seedCtxId,
        project: 'dbtest',
        content: 'fk seed for memory_versions',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );

    for (const table of TABLES) {
      const doc = buildMinimalDoc(raw, table);
      // memory_versions.context_id has ON DELETE CASCADE FK -> real parent
      if (table === 'memory_versions') doc.context_id = seedCtxId;

      const res = await db.collection(table).insertOne(normalizeMemory(doc));
      assert(res.acknowledged, `${table}: insert not acknowledged`);

      const back = await db.collection(table).findOne({ id: doc.id });
      assert(back, `${table}: row not found after insert`);
      assert(back.id === doc.id, `${table}: id mismatch on read-back`);

      for (const [k, v] of Object.entries(doc)) {
        if (k === 'updatedAt') continue; // normalizeMemory refreshes it
        assert(
          back[k] === v,
          `${table}.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(back[k])}`
        );
      }

      await db.collection(table).deleteOne({ id: doc.id });
    }

    await db.collection('contexts').deleteOne({ id: seedCtxId });
  });

  await test('binding: booleans and Dates survive insert and read-back', async () => {
    const id = uuidv4();
    await db.collection('chat_rooms').insertOne({
      id,
      room_id: 'dbtest-bind-room',
      name: 'binding room',
      project: 'dbtest',
      is_active: true,
      max_participants: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const back = await db.collection('chat_rooms').findOne({ id });
    assert(back, 'row missing after insert');
    assert(back.is_active === 1, `is_active expected 1, got ${back.is_active}`);
    assert(
      typeof back.createdAt === 'string' && back.createdAt.includes('T'),
      `createdAt not ISO string: ${back.createdAt}`
    );
    await db.collection('chat_rooms').deleteOne({ id });
  });

  await test('$set converts booleans and Dates', async () => {
    const id = uuidv4();
    await db.collection('chat_rooms').insertOne({
      id,
      room_id: 'dbtest-set-room',
      name: 'set room',
      project: 'dbtest',
      createdAt: iso(),
      updatedAt: iso(),
    });
    await db
      .collection('chat_rooms')
      .updateOne({ id }, { $set: { is_active: false, updatedAt: new Date() } });
    const back = await db.collection('chat_rooms').findOne({ id });
    assert(back.is_active === 0, `is_active expected 0, got ${back.is_active}`);
    assert(
      typeof back.updatedAt === 'string' && back.updatedAt.includes('T'),
      `updatedAt not ISO string: ${back.updatedAt}`
    );
    await db.collection('chat_rooms').deleteOne({ id });
  });

  await test('$inc increments an existing column', async () => {
    const id = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id,
        project: 'dbtest-inc',
        content: 'increment target',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    await db.collection('contexts').updateOne({ id }, { $inc: { accessCount: 2 } });
    const back = await db.collection('contexts').findOne({ id });
    assert(back.accessCount === 2, `accessCount expected 2, got ${back.accessCount}`);
    await db.collection('contexts').deleteOne({ id });
  });

  await test('$inc on a missing column throws SQLITE_MISSING_COLUMN', async () => {
    let err = null;
    try {
      await db
        .collection('contexts')
        .updateOne({ id: uuidv4() }, { $inc: { not_a_real_column: 1 } });
    } catch (e) {
      err = e;
    }
    assert(err, 'expected $inc on missing column to throw');
    assert(err.code === 'SQLITE_MISSING_COLUMN', `expected SQLITE_MISSING_COLUMN, got ${err.code}`);
  });

  await test('$gte with a Date param filters correctly', async () => {
    const oldId = uuidv4();
    const newId = uuidv4();
    for (const [id, createdAt] of [
      [oldId, '2020-01-01T00:00:00.000Z'],
      [newId, '2030-01-01T00:00:00.000Z'],
    ]) {
      await db.collection('contexts').insertOne(
        normalizeMemory({
          id,
          project: 'dbtest-gte',
          content: `gte ${createdAt}`,
          createdAt,
          updatedAt: iso(),
        })
      );
    }
    const hits = await db
      .collection('contexts')
      .find({
        project: 'dbtest-gte',
        createdAt: { $gte: new Date('2025-01-01T00:00:00.000Z') },
      })
      .toArray();
    assert(hits.length === 1, `expected 1 row, got ${hits.length}`);
    assert(hits[0].id === newId, 'wrong row matched the $gte filter');
    await db.collection('contexts').deleteOne({ id: oldId });
    await db.collection('contexts').deleteOne({ id: newId });
  });

  await test('$regex (RegExp) matches via the REGEXP user function', async () => {
    const id = uuidv4();
    await db.collection('chat_rooms').insertOne(
      normalizeMemory({
        id,
        room_id: 'dbtest-regex-room',
        name: 'dbtest main room',
        project: 'dbtest-regex',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    const hits = await db
      .collection('chat_rooms')
      .find({ project: 'dbtest-regex', name: { $regex: /MAIN ROOM/i } })
      .toArray();
    assert(hits.length === 1, `expected 1 regex match, got ${hits.length}`);
    assert(hits[0].id === id, 'regex matched the wrong room');
    await db.collection('chat_rooms').deleteOne({ id });
  });

  await test('dotted-path sort orders by metadata.sequence', async () => {
    const docs = [3, 1, 2].map((seq) => ({
      id: uuidv4(),
      message_id: `dbtest-sort-${seq}`,
      room_id: null,
      from_agent: 'tester',
      content: `sort ${seq}`,
      project: 'dbtest-sort',
      metadata: { sequence: seq },
      createdAt: iso(),
      updatedAt: iso(),
    }));
    for (const doc of docs) {
      await db.collection('chat_messages').insertOne(doc);
    }
    const rows = await db
      .collection('chat_messages')
      .find({ project: 'dbtest-sort' })
      .sort({ 'metadata.sequence': 1 })
      .toArray();
    const seqs = rows.map((r) => r.metadata.sequence).join(',');
    assert(seqs === '1,2,3', `expected sequence order 1,2,3 got ${seqs}`);
    for (const doc of docs) {
      await db.collection('chat_messages').deleteOne({ id: doc.id });
    }
  });

  await test('unknown doc fields are filtered on insert (not persisted)', async () => {
    const id = uuidv4();
    await db.collection('logs').insertOne(
      normalizeMemory({
        id,
        project: 'dbtest',
        message: 'filter test',
        bogus_field: 'should never persist',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    const back = await db.collection('logs').findOne({ id });
    assert(back, 'row missing');
    assert(back.bogus_field === undefined, `bogus_field persisted: ${back.bogus_field}`);
    await db.collection('logs').deleteOne({ id });
  });

  // ---------------------------------------------------------------
  // C. Foreign keys
  // ---------------------------------------------------------------
  await test('FK rejection: message cannot reference a nonexistent room', async () => {
    let err = null;
    try {
      await db.collection('chat_messages').insertOne(
        normalizeMemory({
          id: uuidv4(),
          message_id: 'dbtest-fk-bad',
          room_id: 'no-such-room-ever',
          from_agent: 'tester',
          content: 'bad fk',
          project: 'dbtest',
          createdAt: iso(),
          updatedAt: iso(),
        })
      );
    } catch (e) {
      err = e;
    }
    assert(err, 'expected FOREIGN KEY rejection');
    assert(/FOREIGN KEY/i.test(err.message), `unexpected error: ${err.message}`);
    assert(err.code !== 11000, 'FK error must not be mapped to duplicate-key 11000');
  });

  await test('FK cascade: deleting a context deletes its memory_versions', async () => {
    const ctxId = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id: ctxId,
        project: 'dbtest-cascade',
        content: 'cascade parent',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    const vDoc = buildMinimalDoc(raw, 'memory_versions');
    vDoc.context_id = ctxId;
    await db.collection('memory_versions').insertOne(normalizeMemory(vDoc));
    assert(await db.collection('memory_versions').findOne({ id: vDoc.id }), 'version not inserted');

    await db.collection('contexts').deleteOne({ id: ctxId });
    const gone = await db.collection('memory_versions').findOne({ id: vDoc.id });
    assert(!gone, 'version survived parent delete (CASCADE failed)');
  });

  await test('FK SET NULL: deleting a room orphans its messages', async () => {
    await createRoom(db, {
      room_id: 'dbtest-setnull-room',
      name: 'setnull room',
      project: 'dbtest-setnull',
    });
    const sent = await sendMessage(db, {
      room_id: 'dbtest-setnull-room',
      from_agent: 'tester',
      content: 'to be orphaned',
    });
    const before = await db.collection('chat_messages').findOne({ id: sent.message.insertedId });
    assert(before && before.room_id === 'dbtest-setnull-room', 'message room_id not set');

    await deleteRoom(db, 'dbtest-setnull-room');
    const orphan = await db.collection('chat_messages').findOne({ id: sent.message.insertedId });
    assert(orphan, 'message was deleted with the room (expected SET NULL)');
    assert(orphan.room_id === null, `room_id expected null, got ${orphan.room_id}`);
  });

  // ---------------------------------------------------------------
  // D. Uniqueness & idempotency
  // ---------------------------------------------------------------
  await test('unique lock index rejects duplicates (mapped to 11000)', async () => {
    const mkLock = () => ({
      id: uuidv4(),
      lock_id: uuidv4(),
      project: 'dbtest-lock',
      resource: 'file.js',
      locked_by: 'agent-1',
      expiresAt: iso(),
      createdAt: iso(),
      updatedAt: iso(),
    });
    const first = mkLock();
    await db.collection('resource_locks').insertOne(normalizeMemory(first));

    let err = null;
    try {
      await db.collection('resource_locks').insertOne(normalizeMemory(mkLock()));
    } catch (e) {
      err = e;
    }
    assert(err, 'expected duplicate lock insert to fail');
    assert(err.code === 11000, `expected code 11000, got ${err.code}: ${err.message}`);
    await db.collection('resource_locks').deleteOne({ id: first.id });
  });

  await test('createTask idempotent replay returns the same task', async () => {
    const key = 'dbtest-task-idem-1';
    const r1 = await createTask(db, {
      title: 'dbtest idempotent task',
      project: 'dbtest-task',
      idempotencyKey: key,
    });
    assert(
      r1.task && r1.task.task_id,
      `fresh create must return a task (got ${JSON.stringify(Object.keys(r1))})`
    );

    const r2 = await createTask(db, {
      title: 'dbtest idempotent task',
      project: 'dbtest-task',
      idempotencyKey: key,
    });
    assert(r2.idempotent === true, 'replay was not flagged idempotent');
    assert(r2.task.task_id === r1.task.task_id, 'replay returned a different task');

    const rows = await db.collection('tasks').find({ idempotencyKey: key }).toArray();
    assert(rows.length === 1, `expected exactly 1 task row, got ${rows.length}`);
  });

  await test('duplicate idempotencyKey insert fails with 11000', async () => {
    const key = 'dbtest-task-dup-2';
    const docA = {
      id: uuidv4(),
      task_id: 'dbtest-dup-a',
      title: 'dup a',
      idempotencyKey: key,
      project: 'dbtest-task-dup',
      createdAt: iso(),
      updatedAt: iso(),
    };
    await db.collection('tasks').insertOne(normalizeMemory(docA));

    let err = null;
    try {
      await db.collection('tasks').insertOne(
        normalizeMemory({
          id: uuidv4(),
          task_id: 'dbtest-dup-b',
          title: 'dup b',
          idempotencyKey: key,
          project: 'dbtest-task-dup',
          createdAt: iso(),
          updatedAt: iso(),
        })
      );
    } catch (e) {
      err = e;
    }
    assert(err, 'expected duplicate idempotencyKey to fail');
    assert(err.code === 11000, `expected code 11000, got ${err.code}: ${err.message}`);
    await db.collection('tasks').deleteOne({ id: docA.id });
  });

  // ---------------------------------------------------------------
  // E. Transactions
  // ---------------------------------------------------------------
  await test('BEGIN/ROLLBACK discards inserted rows', async () => {
    const before = await db.collection('tasks').find({ project: 'dbtest-tx' }).toArray();
    raw.exec('BEGIN');
    try {
      await db.collection('tasks').insertOne(
        normalizeMemory({
          id: uuidv4(),
          task_id: 'dbtest-tx-1',
          title: 'rollback target',
          project: 'dbtest-tx',
          createdAt: iso(),
          updatedAt: iso(),
        })
      );
    } finally {
      raw.exec('ROLLBACK');
    }
    const after = await db.collection('tasks').find({ project: 'dbtest-tx' }).toArray();
    assert(after.length === before.length, `rollback failed: ${before.length} -> ${after.length}`);
  });

  // ---------------------------------------------------------------
  // F. FTS5 external-content sync
  // ---------------------------------------------------------------
  await test('FTS insert trigger indexes new context content', async () => {
    const id = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id,
        project: 'dbtest-fts',
        type: 'note',
        content: 'zebrafish quantum experiment notes',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    const hits = await db
      .collection('contexts')
      .find({ $text: { $search: 'zebrafish' } })
      .toArray();
    assert(
      hits.some((h) => h.id === id),
      'new context not found via $text search (insert trigger failed)'
    );
    await db.collection('contexts').deleteOne({ id });
  });

  await test('FTS update trigger reindexes changed content', async () => {
    const id = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id,
        project: 'dbtest-fts',
        type: 'note',
        content: 'zebrafish quantum experiment notes',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    await db
      .collection('contexts')
      .updateOne({ id }, { $set: { content: 'wallaby migration patterns' } });

    const fresh = await db
      .collection('contexts')
      .find({ $text: { $search: 'wallaby' } })
      .toArray();
    assert(
      fresh.some((h) => h.id === id),
      'updated content not searchable (update trigger failed)'
    );
    const stale = await db
      .collection('contexts')
      .find({ $text: { $search: 'zebrafish' } })
      .toArray();
    assert(!stale.some((h) => h.id === id), 'stale content still matches after update');
    await db.collection('contexts').deleteOne({ id });
  });

  await test('FTS delete trigger removes deleted content', async () => {
    const id = uuidv4();
    await db.collection('contexts').insertOne(
      normalizeMemory({
        id,
        project: 'dbtest-fts',
        type: 'note',
        content: 'quokka sunset observation log',
        createdAt: iso(),
        updatedAt: iso(),
      })
    );
    await db.collection('contexts').deleteOne({ id });
    const hits = await db
      .collection('contexts')
      .find({ $text: { $search: 'quokka' } })
      .toArray();
    assert(
      !hits.some((h) => h.id === id),
      'deleted context still matches FTS (delete trigger failed)'
    );
  });

  // ---------------------------------------------------------------
  // G. Chat service E2E
  // ---------------------------------------------------------------
  await test('createRoom: PK equals natural room_id (FK alignment)', async () => {
    const res = await createRoom(db, {
      room_id: 'dbtest-e2e-room',
      name: 'e2e room',
      project: 'dbtest-e2e',
    });
    assert(res.insertedId === 'dbtest-e2e-room', `insertedId ${res.insertedId} != room_id`);
    const room = await getRoomById(db, 'dbtest-e2e-room');
    assert(room, 'room not found by room_id');
    assert(room.id === room.room_id, `PK ${room.id} != room_id ${room.room_id}`);
  });

  await test('sendMessage: $inc sequence with before-semantics (0 then 1)', async () => {
    const m1 = await sendMessage(db, {
      room_id: 'dbtest-e2e-room',
      from_agent: 'tester',
      content: 'first message',
      project: 'dbtest-e2e',
    });
    const m2 = await sendMessage(db, {
      room_id: 'dbtest-e2e-room',
      from_agent: 'tester',
      content: 'second message',
      project: 'dbtest-e2e',
    });
    assert(m1.sequence === 0, `first sequence expected 0, got ${m1.sequence}`);
    assert(m2.sequence === 1, `second sequence expected 1, got ${m2.sequence}`);
  });

  await test('getMessages: dotted sort + since(Date) filtering', async () => {
    const msgs = await getMessages(db, { room_id: 'dbtest-e2e-room', order: 'asc', limit: 10 });
    assert(msgs.length >= 2, `expected >= 2 messages, got ${msgs.length}`);
    assert(
      msgs[0].metadata?.sequence === 0,
      `first seq expected 0, got ${msgs[0].metadata?.sequence}`
    );
    assert(
      msgs[1].metadata?.sequence === 1,
      `second seq expected 1, got ${msgs[1].metadata?.sequence}`
    );

    const past = await getMessages(db, {
      room_id: 'dbtest-e2e-room',
      since: Date.now() - 3600000,
      order: 'asc',
    });
    assert(past.length >= 2, `since(past) expected >= 2, got ${past.length}`);

    const future = await getMessages(db, {
      room_id: 'dbtest-e2e-room',
      since: Date.now() + 3600000,
    });
    assert(future.length === 0, `since(future) expected 0, got ${future.length}`);
  });

  await test('sendMessage to a missing room throws ROOM_NOT_FOUND', async () => {
    let err = null;
    try {
      await sendMessage(db, {
        room_id: 'dbtest-missing-room',
        from_agent: 'tester',
        content: 'nope',
      });
    } catch (e) {
      err = e;
    }
    assert(err, 'expected ROOM_NOT_FOUND error');
    assert(err.code === 'ROOM_NOT_FOUND', `expected ROOM_NOT_FOUND, got ${err.code}`);
  });

  await test('sendMessage idempotent replay returns the same message', async () => {
    await createRoom(db, {
      room_id: 'dbtest-idem-room',
      name: 'idem room',
      project: 'dbtest-idem',
    });
    const key = 'dbtest-chat-idem-1';
    const s1 = await sendMessage(db, {
      room_id: 'dbtest-idem-room',
      from_agent: 'tester',
      content: 'idem once',
      idempotencyKey: key,
    });
    const s2 = await sendMessage(db, {
      room_id: 'dbtest-idem-room',
      from_agent: 'tester',
      content: 'idem once',
      idempotencyKey: key,
    });
    assert(s1.idempotent !== true, 'first send must not be flagged idempotent');
    assert(s2.idempotent === true, 'second send must be flagged idempotent');
    assert(s2.message?.id === s1.message?.insertedId, 'replay returned a different message');
  });

  await test('getOrCreateDefaultRoom is idempotent ($regex REGEXP path)', async () => {
    const d1 = await getOrCreateDefaultRoom(db, 'dbtest-defaultproj');
    const d2 = await getOrCreateDefaultRoom(db, 'dbtest-defaultproj');
    assert(d1 && d1.room_id, 'first default room creation failed');
    assert(
      d2 && d2.room_id === d1.room_id,
      `second call returned a different room (${d2?.room_id} vs ${d1?.room_id})`
    );
  });

  // ---------------------------------------------------------------
  // H. Task service E2E
  // ---------------------------------------------------------------
  await test('createTask round-trips through the tasks table', async () => {
    const res = await createTask(db, {
      title: 'dbtest roundtrip task',
      description: 'created by database integrity test',
      project: 'dbtest-task-rt',
    });
    assert(res.task?.task_id, 'createTask did not return a task');
    const back = await db.collection('tasks').findOne({ task_id: res.task.task_id });
    assert(back, 'task not persisted');
    assert(back.title === 'dbtest roundtrip task', `title mismatch: ${back.title}`);
    assert(back.version === 1, `version expected 1, got ${back.version}`);
  });

  // ---------------------------------------------------------------
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
