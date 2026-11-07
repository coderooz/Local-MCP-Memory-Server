/**
 * MongoDB (v2.5.x) -> SQLite (v2.6.x) migration.
 *
 * The v2.5.x server persisted everything in MongoDB. v2.6.x uses a single
 * per-user SQLite database. This module copies every collection into its
 * matching table while preserving identifiers, timestamps, relationships,
 * project mappings and agent identities.
 *
 * Safety contract
 *  - dry run by default: nothing is written without `apply: true`
 *  - a complete, checksum-verified JSONL backup of the source is written
 *    before the first destination write
 *  - a checksum-verified snapshot of the destination database is written
 *    before the first destination write, so `rollbackMigration()` can restore it
 *  - the destination must be idle: an exclusive lock is required for apply
 *  - writes are idempotent (upsert by primary key) and batched per collection,
 *    so an interrupted run can be resumed with `resume: true`
 *  - the run finishes with integrity, foreign-key, count and sample checks
 *
 * The module never talks to the live v2.5.x server: it only reads MongoDB.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import Database from 'better-sqlite3';

import { getDataDir, getDbPath } from '../paths/index.js';
import { createSchema, rebuildFTS } from '../database/sqlite/schema.js';

export const MIGRATION_VERSION = 1;
export const BACKUP_MANIFEST = 'manifest.json';
export const DESTINATION_SNAPSHOT = 'destination-before-migration.db';
const BATCH_SIZE = 500;
const SAMPLE_LIMIT = 5;

// ---------------------------------------------------------------------------
// Collection specifications
// ---------------------------------------------------------------------------

/**
 * Every destination table, the source collection that feeds it, and the
 * columns that need JSON encoding. Tables without a source collection are
 * listed so the report can state explicitly that they were absent.
 */
export const COLLECTIONS = [
  {
    name: 'contexts',
    table: 'contexts',
    idFrom: ['id'],
    jsonColumns: [
      'tags',
      'metadata',
      'relatedContexts',
      'relatedActions',
      'relatedTasks',
      'relatedIssues',
      'relatedAgents',
      'conflictsWith'
    ],
    sampleFields: ['content', 'summary']
  },
  {
    name: 'memory_versions',
    table: 'memory_versions',
    idFrom: ['id'],
    jsonColumns: ['tags', 'metadata', 'snapshot'],
    references: [{ column: 'context_id', table: 'contexts' }],
    fallbacks: { changedAt: (row) => row.updatedAt || row.createdAt }
  },
  {
    name: 'actions',
    table: 'actions',
    idFrom: ['id'],
    jsonColumns: ['contextRefs', 'outcome', 'tags', 'metadata'],
    sampleFields: ['summary', 'actionType']
  },
  {
    name: 'sessions',
    table: 'sessions',
    idFrom: ['id'],
    jsonColumns: ['contextIds', 'actionIds', 'tags', 'metadata'],
    fallbacks: { startedAt: (row) => row.createdAt }
  },
  {
    name: 'agents',
    table: 'agents',
    idFrom: ['id'],
    jsonColumns: ['capabilities', 'tags', 'metadata'],
    sampleFields: ['name', 'status', 'role'],
    fallbacks: { last_seen: (row) => row.updatedAt || row.createdAt }
  },
  {
    name: 'tasks',
    table: 'tasks',
    idFrom: ['id'],
    jsonColumns: [
      'dependencies',
      'required_capabilities',
      'relatedContexts',
      'relatedIssues',
      'relatedAgents',
      'conflictsWith',
      'tags',
      'metadata'
    ],
    sampleFields: ['title', 'status', 'assigned_to']
  },
  {
    name: 'messages',
    table: 'messages',
    idFrom: ['id'],
    jsonColumns: ['tags', 'metadata'],
    sampleFields: ['content', 'from_agent', 'to_agent']
  },
  {
    name: 'issues',
    table: 'issues',
    idFrom: ['id'],
    jsonColumns: [
      'relatedContexts',
      'relatedTasks',
      'relatedIssues',
      'relatedAgents',
      'conflictsWith',
      'tags',
      'metadata'
    ],
    sampleFields: ['title', 'status', 'type']
  },
  {
    name: 'project_map',
    table: 'project_map',
    idFrom: ['id'],
    jsonColumns: [
      'dependencies',
      'exports',
      'key_details',
      'related_tasks',
      'related_agents',
      'conflictsWith',
      'relationships',
      'tags',
      'metadata'
    ],
    sampleFields: ['file_path', 'summary', 'type'],
    fallbacks: { last_verified_at: (row) => row.updatedAt || row.createdAt }
  },
  {
    name: 'activity',
    table: 'activity',
    idFrom: ['id'],
    jsonColumns: ['tags', 'metadata'],
    sampleFields: ['message', 'type'],
    fallbacks: { timestamp: (row) => row.createdAt }
  },
  {
    name: 'resource_locks',
    table: 'resource_locks',
    idFrom: ['id'],
    jsonColumns: ['tags', 'metadata'],
    uniqueTuples: [['project', 'resource', 'locked_by']]
  },
  {
    name: 'metrics',
    table: 'metrics',
    idFrom: ['id'],
    jsonColumns: ['data', 'tags', 'metadata'],
    sampleFields: ['name', 'metric_type', 'value'],
    fallbacks: { recordedAt: (row) => row.createdAt }
  },
  {
    name: 'feedbacks',
    table: 'feedbacks',
    idFrom: ['feedback_id', 'id'],
    jsonColumns: [
      'voters',
      'related_contexts',
      'related_tasks',
      'related_issues',
      'tags',
      'metadata'
    ],
    sampleFields: ['title', 'status', 'type']
  },
  {
    name: 'chat_rooms',
    table: 'chat_rooms',
    idFrom: ['room_id', 'id'],
    rename: { scope: 'room_scope' },
    jsonColumns: ['participants', 'admins', 'tags', 'metadata'],
    sampleFields: ['name', 'room_scope']
  },
  {
    name: 'chat_messages',
    table: 'chat_messages',
    idFrom: ['message_id', 'id'],
    jsonColumns: ['tags', 'metadata'],
    references: [{ column: 'room_id', table: 'chat_rooms' }],
    sampleFields: ['content', 'from_agent'],
    fallbacks: {
      // v2.5.x chat messages carry no project/agent/updatedAt. The project is
      // inherited from the owning room so project isolation survives; the
      // authoring agent becomes the record's agent.
      updatedAt: (row) => row.createdAt,
      agent: (row) => row.from_agent || 'system'
    },
    derive: (row, context) => {
      // v2.5.x messages carry no agent/scope/project of their own: the schema
      // defaults would otherwise win over the spec fallbacks.
      if (row.from_agent && (!row.agent || row.agent === 'unknown' || row.agent === 'system')) {
        row.agent = row.from_agent;
      }
      if (!row.room_id) return;
      const project = context.roomProjects.get(row.room_id);
      if (project && (!row.project || row.project === 'default')) row.project = project;
      const scope = context.roomScopes.get(row.room_id);
      if (scope) row.scope = scope;
    }
  },
  {
    name: 'logs',
    table: 'logs',
    idFrom: ['id'],
    rename: { context: 'log_context' },
    jsonColumns: ['log_context', 'tags', 'metadata'],
    sampleFields: ['message', 'type'],
    fallbacks: { updatedAt: (row) => row.createdAt }
  },
  {
    name: 'emulators',
    table: 'emulators',
    idFrom: ['emulator_id', 'id'],
    jsonColumns: ['capabilities', 'tags', 'metadata'],
    fallbacks: { last_checked: (row) => row.updatedAt || row.createdAt }
  },
  {
    name: 'connections',
    table: 'connections',
    idFrom: ['connectionId', 'id'],
    jsonColumns: ['tags', 'metadata'],
    fallbacks: { lastActivityAt: (row) => row.updatedAt || row.createdAt }
  },
  {
    name: 'mcp_servers',
    table: 'mcp_servers',
    idFrom: ['server_id', 'id'],
    jsonColumns: ['env', 'auth_config', 'health', 'capabilities', 'tags', 'metadata'],
    fallbacks: { name: (row) => row.server_id || 'Unnamed MCP Server' }
  },
  {
    name: 'execution_jobs',
    table: 'execution_jobs',
    idFrom: ['job_id', 'id'],
    jsonColumns: [
      'effective_policy',
      'approval_binding',
      'requested_permissions',
      'artifacts',
      'changed_files'
    ],
    fallbacks: { runtime: () => 'unknown' }
  },
  {
    name: 'execution_approvals',
    table: 'execution_approvals',
    idFrom: ['approval_id', 'id'],
    jsonColumns: ['permissions'],
    fallbacks: {
      binding: (row) => row.approval_id || 'unknown',
      runtime: () => 'unknown',
      requesting_agent: () => 'unknown',
      approver: () => 'system',
      granted_at: (row) => row.createdAt,
      expires_at: (row) => row.createdAt
    }
  }
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Remove credentials from a MongoDB connection string before it is written to
 * a report or a backup manifest.
 */
export function redactUri(uri) {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    if (parsed.username && parsed.password === '***') {
      // keep the username; the password is what must never leak
    }
    return parsed.toString();
  } catch {
    return String(uri).replace(/\/\/[^/@]*@/, '//***@');
  }
}

function parseDefault(raw) {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw);
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toJsonText(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function toInteger(value, fallback) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toReal(value, fallback) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON */
    }
  }
  return {};
}

function isPlainObject(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)
  );
}

/**
 * True when an object is a leftover MongoDB query operator (for example
 * `{ $gt: '' }`) that was accidentally persisted as data.
 */
function isQueryOperator(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

// ---------------------------------------------------------------------------
// Source reader
// ---------------------------------------------------------------------------

/**
 * Read-only MongoDB reader. The migration never writes to the source.
 */
export async function createMongoReader({ uri, database = 'mcp_memory' }) {
  if (!uri) {
    throw new Error('No MongoDB connection string. Pass --from or set MONGO_URI.');
  }

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });
  await client.connect();
  const db = client.db(database);

  return {
    database,
    uri: redactUri(uri),
    async listCollections() {
      const list = await db.listCollections().toArray();
      return list.map((entry) => entry.name).sort();
    },
    async estimatedCount(name) {
      try {
        return await db.collection(name).countDocuments({});
      } catch {
        try {
          return await db.collection(name).estimatedDocumentCount();
        } catch {
          return 0;
        }
      }
    },
    async *stream(name) {
      const cursor = db.collection(name).find({});
      for await (const doc of cursor) yield doc;
    },
    async close() {
      await client.close();
    }
  };
}

// ---------------------------------------------------------------------------
// Destination helpers
// ---------------------------------------------------------------------------

function openDestination(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

function readColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((column) => ({
      name: column.name,
      type: String(column.type || '').toUpperCase(),
      notNull: Boolean(column.notnull),
      defaultValue: parseDefault(column.dflt_value)
    }));
}

function tableRowCount(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
  } catch {
    return 0;
  }
}

/**
 * Refuse to write while another process is using the database.
 *
 * `BEGIN EXCLUSIVE` is a cheap cross-platform probe: it succeeds only when no
 * other connection holds a read or write transaction on the file.
 */
function assertDestinationIdle(dbPath) {
  if (!fs.existsSync(dbPath)) return { idle: true, existed: false };

  const probe = new Database(dbPath);
  probe.pragma('busy_timeout = 750');
  try {
    probe.exec('BEGIN EXCLUSIVE');
    probe.exec('ROLLBACK');
    return { idle: true, existed: true };
  } catch (error) {
    return { idle: false, existed: true, error: error.message };
  } finally {
    probe.close();
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function resolveId(spec, doc) {
  for (const key of spec.idFrom) {
    const value = doc[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  if (doc._id !== undefined && doc._id !== null) return String(doc._id);
  return sha256(`${spec.name}:${JSON.stringify(doc)}`).slice(0, 32);
}

/**
 * Turn one source document into one destination row.
 *
 * - fields map by name (with the few documented renames)
 * - values are coerced to the destination column type
 * - missing NOT NULL columns use their schema default, then the spec fallback
 * - source fields with no destination column are preserved under
 *   `metadata._migration.unmapped` instead of being dropped
 */
export function normalizeDocument(spec, doc, columns, context = {}) {
  const now = context.now || nowIso();
  const warnings = [];
  const row = {};
  const rename = spec.rename || {};
  const jsonColumns = new Set(spec.jsonColumns || []);
  const known = new Map(columns.map((column) => [column.name, column]));
  const assigned = new Set();
  const unmapped = {};
  const coerced = {};

  const id = resolveId(spec, doc);
  row.id = id;
  assigned.add('id');

  // Natural key (room_id, feedback_id, ...) also lives in its own column.
  const naturalKey = spec.idFrom[0];
  if (naturalKey && naturalKey !== 'id' && known.has(naturalKey)) {
    const value = doc[naturalKey];
    row[naturalKey] = typeof value === 'string' && value.trim() ? value : id;
    assigned.add(naturalKey);
  }

  for (const [sourceKey, rawValue] of Object.entries(doc)) {
    if (sourceKey === '_id') continue;
    const columnName = rename[sourceKey] || sourceKey;
    const column = known.get(columnName);
    if (!column || assigned.has(columnName)) {
      if (!column && rawValue !== undefined && rawValue !== null) {
        unmapped[sourceKey] = rawValue;
      }
      continue;
    }

    let value = rawValue;
    if (isQueryOperator(value) && !jsonColumns.has(columnName)) {
      // v2.5.x occasionally persisted a MongoDB query operator (`{ $gt: '' }`)
      // into a data field. Keep the evidence in metadata instead of writing an
      // operator object into a text column.
      coerced[sourceKey] = value;
      warnings.push(`query operator in "${columnName}" coerced to empty`);
      value = null;
    } else if (column.type === 'INTEGER' || column.type === 'REAL') {
      if (isPlainObject(value)) {
        coerced[sourceKey] = value;
        warnings.push(`coerced object in numeric column "${columnName}"`);
        value = null;
      }
    } else if (column.type === 'BLOB') {
      if (Array.isArray(value)) value = Buffer.from(value);
      else if (!Buffer.isBuffer(value)) value = null;
    } else if (isPlainObject(value) && !jsonColumns.has(columnName)) {
      // A plain object in a text column is preserved as JSON text.
      value = JSON.stringify(value);
    }

    row[columnName] = coerceForColumn(column, value, jsonColumns.has(columnName));
    assigned.add(columnName);
  }

  for (const column of columns) {
    if (assigned.has(column.name)) continue;

    let value;
    if (column.defaultValue !== undefined) {
      value = column.defaultValue;
    } else if (column.notNull) {
      const fallback = spec.fallbacks?.[column.name];
      if (typeof fallback === 'function') value = fallback(row, context);
      else if (column.name === 'createdAt' || column.name === 'updatedAt') value = now;
      else value = '';
    } else {
      value = null;
    }

    if (value !== null && value !== undefined && column.type === 'TEXT') {
      value = toText(value);
    }
    row[column.name] = value;
  }

  // Preserve unmapped source fields and coerced values without changing the
  // meaning of application metadata.
  if (Object.keys(unmapped).length > 0 || Object.keys(coerced).length > 0) {
    const metadata = asObject(row.metadata);
    const migration = asObject(metadata._migration);
    if (Object.keys(unmapped).length > 0) migration.unmapped = unmapped;
    if (Object.keys(coerced).length > 0) migration.coerced = coerced;
    migration.sourceCollection = spec.name;
    metadata._migration = migration;
    row.metadata = JSON.stringify(metadata);
  }

  return { id, row, warnings, unmapped: Object.keys(unmapped) };
}

function coerceForColumn(column, value, isJson) {
  if (value === null || value === undefined) {
    if (column.notNull) {
      return column.defaultValue !== undefined ? column.defaultValue : '';
    }
    return null;
  }

  if (isJson) return toJsonText(value, '{}');

  if (column.type === 'INTEGER') return toInteger(value, column.defaultValue ?? 0);
  if (column.type === 'REAL') return toReal(value, column.defaultValue ?? 0);
  if (column.type === 'BLOB') return Buffer.isBuffer(value) ? value : null;

  const text = toText(value);
  if (text === null && column.notNull) {
    return column.defaultValue !== undefined ? column.defaultValue : '';
  }
  return text;
}

// ---------------------------------------------------------------------------
// Backup and snapshot
// ---------------------------------------------------------------------------

async function writeSourceBackup({ reader, collections, backupDir, onProgress }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const manifest = {
    migrationVersion: MIGRATION_VERSION,
    createdAt: nowIso(),
    source: { database: reader.database, uri: reader.uri || null },
    collections: [],
    totalDocuments: 0
  };

  for (const spec of collections) {
    const file = `${spec.name}.jsonl`;
    const filePath = path.join(backupDir, file);
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    const hash = crypto.createHash('sha256');
    let count = 0;

    try {
      for await (const doc of reader.stream(spec.name)) {
        const line = `${JSON.stringify(doc)}\n`;
        hash.update(line);
        if (!stream.write(line)) {
          await new Promise((resolve) => stream.once('drain', resolve));
        }
        count += 1;
      }
    } finally {
      await new Promise((resolve, reject) => {
        stream.end((error) => (error ? reject(error) : resolve()));
      });
    }

    const entry = {
      name: spec.name,
      table: spec.table,
      file,
      count,
      bytes: fileSize(filePath),
      sha256: hash.digest('hex')
    };
    manifest.collections.push(entry);
    manifest.totalDocuments += count;
    onProgress?.(`backed up ${spec.name}: ${count} document(s)`);
  }

  const manifestPath = path.join(backupDir, BACKUP_MANIFEST);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // Verification pass: every file is re-hashed and its line count re-checked.
  const verification = [];
  for (const entry of manifest.collections) {
    const filePath = path.join(backupDir, entry.file);
    const digest = await sha256File(filePath);
    const lines = countLines(filePath);
    verification.push({
      name: entry.name,
      ok: digest === entry.sha256 && lines === entry.count,
      expectedSha256: entry.sha256,
      actualSha256: digest,
      expectedCount: entry.count,
      actualCount: lines
    });
  }

  const ok = verification.every((entry) => entry.ok);
  manifest.verified = ok;
  manifest.verification = verification;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (!ok) {
    throw new Error('Source backup verification failed; refusing to write the destination.');
  }

  return { dir: backupDir, manifestPath, manifest, verified: ok };
}

/**
 * Persist the destination snapshot checksum in the backup manifest so
 * `rollbackMigration()` can verify it before restoring.
 */
function recordSnapshotInManifest(manifestPath, snapshot) {
  if (!manifestPath || !snapshot) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.snapshot = snapshot;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function countLines(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  if (!contents) return 0;
  let lines = 0;
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === '\n') lines += 1;
  }
  if (!contents.endsWith('\n')) lines += 1;
  return lines;
}

async function writeDestinationSnapshot({ dbPath, backupDir, onProgress }) {
  if (!fs.existsSync(dbPath)) {
    return { existed: false, path: null, sha256: null, verified: true };
  }

  // Flush WAL so the copied file is self-contained.
  const db = new Database(dbPath);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }

  const snapshotPath = path.join(backupDir, DESTINATION_SNAPSHOT);
  fs.copyFileSync(dbPath, snapshotPath);
  const digest = await sha256File(snapshotPath);

  const check = new Database(snapshotPath, { readonly: true });
  let integrity = 'unknown';
  try {
    integrity = check.pragma('integrity_check', { simple: true });
  } finally {
    check.close();
  }

  const verified = integrity === 'ok';
  if (!verified) {
    throw new Error(`Destination snapshot failed integrity check: ${integrity}`);
  }

  onProgress?.(
    `snapshot written: ${path.basename(snapshotPath)} (${fileSize(snapshotPath)} bytes)`
  );

  return {
    existed: true,
    path: snapshotPath,
    sha256: digest,
    bytes: fileSize(snapshotPath),
    integrity,
    verified
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function buildStatements(db, spec, columns) {
  const names = columns.map((column) => column.name);
  const quoted = names.map((name) => `"${name}"`).join(', ');
  const placeholders = names.map((name) => `@${name}`).join(', ');
  const insertSql = `INSERT INTO "${spec.table}" (${quoted}) VALUES (${placeholders})`;
  const updateSql = names
    .filter((name) => name !== 'id')
    .map((name) => `"${name}" = excluded."${name}"`)
    .join(', ');
  const upsertSql = `${insertSql} ON CONFLICT(id) DO UPDATE SET ${updateSql}`;

  return {
    insert: db.prepare(insertSql),
    upsert: db.prepare(upsertSql)
  };
}

function referenceResolver(spec, row, context) {
  const policy = context.orphanPolicy || 'error';

  for (const reference of spec.references || []) {
    const value = row[reference.column];
    if (value === null || value === undefined) continue;

    let resolved = null;
    if (reference.table === 'chat_rooms') {
      resolved = context.roomIds.get(value) || null;
    } else if (context.ids[reference.table]?.has(value)) {
      resolved = value;
    }

    if (resolved) {
      row[reference.column] = resolved;
      continue;
    }

    context.orphans.push({ collection: spec.name, column: reference.column, value });

    if (policy === 'skip') return { skip: true };
    if (policy === 'nullify') {
      const column = (context.columns[spec.table] || []).find(
        (entry) => entry.name === reference.column
      );
      if (column && !column.notNull) {
        row[reference.column] = null;
        continue;
      }
      return { skip: true };
    }

    throw new Error(
      `Orphan reference in "${spec.name}": ${reference.column}="${value}" has no ` +
        `matching row in "${reference.table}". ` +
        'Re-run with --orphans skip or --orphans nullify to proceed.'
    );
  }
  return { skip: false };
}

async function applyCollection({ db, spec, reader, context, options, report }) {
  const started = Date.now();
  const columns = context.columns[spec.table];
  const statements = buildStatements(db, spec, columns);
  const existingIds = new Set(
    db
      .prepare(`SELECT id FROM "${spec.table}"`)
      .all()
      .map((row) => row.id)
  );
  const sourceIds = new Set();
  // Map unique-tuple values to the row id that owns them, so a resumed run
  // recognises its own rows instead of reporting them as conflicts.
  const tupleOwners = new Map();
  const tupleKey = (tuple, row) => tuple.map((name) => row[name]).join('\u0000');
  for (const tuple of spec.uniqueTuples || []) {
    for (const row of db
      .prepare(`SELECT ${tuple.map((name) => `"${name}"`).join(', ')} FROM "${spec.table}"`)
      .all()) {
      tupleOwners.set(tupleKey(tuple, row), row.id);
    }
  }

  const counts = {
    name: spec.name,
    table: spec.table,
    sourceCount: await reader.estimatedCount(spec.name).catch(() => 0),
    read: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    duplicates: 0,
    warnings: [],
    unmappedFields: new Set(),
    samples: []
  };

  let batch = [];

  const flush = db.transaction((rows) => {
    for (const row of rows) {
      const existed = existingIds.has(row.id);
      const statement =
        existed || options.onDuplicate === 'last' ? statements.upsert : statements.insert;
      statement.run(row);
      existingIds.add(row.id);
      if (existed) counts.updated += 1;
      else counts.inserted += 1;
    }
  });

  try {
    for await (const doc of reader.stream(spec.name)) {
      counts.read += 1;
      const { id, row, warnings, unmapped } = normalizeDocument(spec, doc, columns, context);

      for (const warning of warnings) {
        if (counts.warnings.length < 50) counts.warnings.push(`${id}: ${warning}`);
      }
      for (const field of unmapped) counts.unmappedFields.add(field);

      if (sourceIds.has(id)) {
        counts.duplicates += 1;
        if (options.onDuplicate === 'error') {
          throw new Error(
            `Duplicate identifier "${id}" in collection "${spec.name}". ` +
              'Re-run with --on-duplicate first or --on-duplicate last.'
          );
        }
        if (options.onDuplicate === 'first') {
          counts.skipped += 1;
          continue;
        }
      }

      const reference = referenceResolver(spec, row, context);
      if (reference.skip) {
        counts.skipped += 1;
        continue;
      }

      spec.derive?.(row, context);

      if (spec.uniqueTuples) {
        const conflicts = [];
        for (const tuple of spec.uniqueTuples) {
          const key = tupleKey(tuple, row);
          const owner = tupleOwners.get(key);
          if (owner && owner !== row.id) conflicts.push({ tuple, key });
        }
        if (conflicts.length > 0) {
          counts.duplicates += 1;
          if (options.onDuplicate === 'error') {
            throw new Error(
              `Unique constraint collision in "${spec.table}" for ` +
                `${conflicts.map((entry) => entry.tuple.join('+')).join(', ')}.`
            );
          }
          if (options.onDuplicate === 'first') {
            counts.skipped += 1;
            continue;
          }
          for (const { tuple, key } of conflicts) {
            const where = tuple.map((name) => `"${name}" = @${name}`).join(' AND ');
            db.prepare(`DELETE FROM "${spec.table}" WHERE ${where} AND id <> @id`).run({
              ...Object.fromEntries(tuple.map((name) => [name, row[name]])),
              id: row.id
            });
            tupleOwners.delete(key);
          }
        }
        for (const tuple of spec.uniqueTuples) {
          tupleOwners.set(tupleKey(tuple, row), row.id);
        }
      }

      if (counts.samples.length < SAMPLE_LIMIT && spec.sampleFields) {
        counts.samples.push({
          id,
          fields: Object.fromEntries(spec.sampleFields.map((field) => [field, row[field] ?? null]))
        });
      }

      context.ids[spec.table]?.add(id);
      sourceIds.add(id);
      if (spec.table === 'chat_rooms') {
        context.roomIds.set(id, id);
        if (row.name) context.roomIds.set(row.name, id);
        if (row.project) context.roomProjects.set(id, row.project);
        if (row.room_scope) context.roomScopes.set(id, row.room_scope);
      }

      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        flush(batch);
        batch = [];
      }
    }

    if (batch.length > 0) flush(batch);
  } catch (error) {
    counts.error = error.message;
    throw error;
  } finally {
    counts.durationMs = Date.now() - started;
    counts.destinationCount = tableRowCount(db, spec.table);
    counts.sourceIds = sourceIds;
  }

  report.collections.push(counts);
  return counts;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyDestination({ db, context }) {
  const checks = {
    integrity: null,
    foreignKeyViolations: [],
    ftsIntegrity: null,
    reconciliation: [],
    samples: []
  };

  checks.integrity = db.pragma('integrity_check', { simple: true });

  checks.foreignKeyViolations = db.pragma('foreign_key_check').slice(0, 100);

  try {
    db.exec("INSERT INTO contexts_fts(contexts_fts) VALUES('integrity-check')");
    db.exec("INSERT INTO project_map_fts(project_map_fts) VALUES('integrity-check')");
    checks.ftsIntegrity = 'ok';
  } catch (error) {
    checks.ftsIntegrity = error.message;
  }

  for (const spec of COLLECTIONS) {
    if (!context.ids[spec.table]) continue;
    const sourceIds = context.sourceIds[spec.table];
    if (!sourceIds) continue;
    const destinationIds = new Set(
      db
        .prepare(`SELECT id FROM "${spec.table}"`)
        .all()
        .map((row) => row.id)
    );
    const missing = [...sourceIds].filter((id) => !destinationIds.has(id));
    checks.reconciliation.push({
      table: spec.table,
      sourceIds: sourceIds.size,
      destinationRows: destinationIds.size,
      missing: missing.length,
      missingSample: missing.slice(0, 5)
    });
  }

  for (const spec of COLLECTIONS) {
    const samples = context.samples[spec.table];
    if (!samples || samples.length === 0) continue;
    const statement = db.prepare(`SELECT * FROM "${spec.table}" WHERE id = ?`);
    for (const sample of samples) {
      const row = statement.get(sample.id);
      if (!row) {
        checks.samples.push({ table: spec.table, id: sample.id, ok: false, reason: 'missing' });
        continue;
      }
      const mismatches = Object.entries(sample.fields).filter(
        ([field, value]) => (row[field] ?? null) !== value
      );
      checks.samples.push({
        table: spec.table,
        id: sample.id,
        ok: mismatches.length === 0,
        mismatches: mismatches.map(([field]) => field)
      });
    }
  }

  // Project and agent spread must survive the migration.
  const distinct = (table, column) =>
    db.prepare(`SELECT COUNT(DISTINCT "${column}") AS count FROM "${table}"`).get().count;
  checks.projectSpread = {
    contexts: distinct('contexts', 'project'),
    tasks: distinct('tasks', 'project'),
    activity: distinct('activity', 'project')
  };
  checks.agentSpread = {
    contexts: distinct('contexts', 'agent'),
    tasks: distinct('tasks', 'agent'),
    activity: distinct('activity', 'agent')
  };

  return checks;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Migration report');
  lines.push('');
  lines.push(`- Mode: **${report.mode}**`);
  lines.push(`- Result: **${report.ok ? 'success' : 'failed'}**`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${report.durationMs} ms`);
  lines.push(`- Source: \`${report.source.uri || 'n/a'}\` / \`${report.source.database}\``);
  lines.push(`- Destination: \`${report.destination.dbPath}\``);
  if (report.backup) lines.push(`- Backup: \`${report.backup.dir}\``);
  if (report.error) lines.push(`- Error: ${report.error}`);
  lines.push('');
  lines.push('## Collections');
  lines.push('');
  lines.push('| Collection | Table | Source | Read | Inserted | Updated | Skipped | Warnings |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const entry of report.collections) {
    lines.push(
      `| ${entry.name} | ${entry.table} | ${entry.sourceCount} | ${entry.read} | ` +
        `${entry.inserted} | ${entry.updated} | ${entry.skipped} | ${entry.warnings.length} |`
    );
  }
  lines.push('');
  if (report.checks) {
    lines.push('## Checks');
    lines.push('');
    lines.push(`- Integrity: ${report.checks.integrity}`);
    lines.push(`- Foreign key violations: ${report.checks.foreignKeyViolations.length}`);
    lines.push(`- FTS integrity: ${report.checks.ftsIntegrity}`);
    lines.push(
      `- Sample checks: ${report.checks.samples.filter((s) => s.ok).length}/${report.checks.samples.length} passed`
    );
    lines.push('');
    lines.push('| Table | Source ids | Destination rows | Missing |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const entry of report.checks.reconciliation) {
      lines.push(
        `| ${entry.table} | ${entry.sourceIds} | ${entry.destinationRows} | ${entry.missing} |`
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, { reportPath, backupDir }) {
  const written = [];
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, json, 'utf8');
    written.push(reportPath);
  }

  if (backupDir) {
    const jsonPath = path.join(backupDir, 'migration-report.json');
    const markdownPath = path.join(backupDir, 'migration-report.md');
    fs.writeFileSync(jsonPath, json, 'utf8');
    fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
    written.push(jsonPath, markdownPath);
  }

  report.reportFiles = written;
  return written;
}

function defaultReportPath(mode) {
  return path.join(
    getDataDir(),
    'migration-reports',
    `migration-${mode}-${nowIso().replace(/[:.]/g, '-')}.json`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the migration.
 *
 * @param {object} options
 * @param {string} [options.uri]           MongoDB connection string
 * @param {string} [options.database]      source database (default mcp_memory)
 * @param {boolean} [options.apply]        write changes (default false)
 * @param {string} [options.backupDir]     backup directory
 * @param {string} [options.reportPath]    JSON report path (false disables)
 * @param {boolean} [options.resume]       allow a non-empty destination
 * @param {'error'|'first'|'last'} [options.onDuplicate]
 * @param {'error'|'skip'|'nullify'} [options.orphans]
 * @param {string} [options.dbPath]        destination database override
 * @param {object} [options.source]        reader override (tests)
 * @param {Function} [options.onProgress]
 * @returns {Promise<object>} report
 */
export async function runMigration(options = {}) {
  const startedAt = nowIso();
  const started = Date.now();
  const mode = options.apply ? 'apply' : 'dry-run';
  const dbPath = path.resolve(options.dbPath || getDbPath());
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const onDuplicate = options.onDuplicate || 'error';
  const orphans = options.orphans || 'error';

  const report = {
    ok: false,
    mode,
    migrationVersion: MIGRATION_VERSION,
    startedAt,
    finishedAt: null,
    durationMs: 0,
    source: {
      uri: options.uri ? redactUri(options.uri) : null,
      database: options.database || 'mcp_memory'
    },
    destination: {
      dbPath,
      existedBefore: fs.existsSync(dbPath),
      sizeBefore: fileSize(dbPath)
    },
    options: {
      apply: Boolean(options.apply),
      resume: Boolean(options.resume),
      onDuplicate,
      orphans
    },
    collections: [],
    checks: null,
    backup: null,
    snapshot: null,
    error: null,
    reportFiles: []
  };

  let reader = options.source || null;
  let db = null;
  let backupDir = options.backupDir
    ? path.resolve(options.backupDir)
    : path.join(getDataDir(), 'migration-backups', startedAt.replace(/[:.]/g, '-'));

  const context = {
    now: startedAt,
    ids: Object.fromEntries(COLLECTIONS.map((spec) => [spec.table, new Set()])),
    sourceIds: {},
    roomIds: new Map(),
    roomProjects: new Map(),
    roomScopes: new Map(),
    samples: {},
    orphans: [],
    columns: {},
    orphanPolicy: orphans
  };

  try {
    if (!reader) {
      reader = await createMongoReader({
        uri: options.uri || process.env.MONGO_URI,
        database: options.database || 'mcp_memory'
      });
    }

    onProgress?.('reading source collection list');
    const sourceCollections = new Set(await reader.listCollections());
    const present = COLLECTIONS.filter((spec) => sourceCollections.has(spec.name));
    const absent = COLLECTIONS.filter((spec) => !sourceCollections.has(spec.name));
    report.source.collections = sourceCollections.size;
    report.absentCollections = absent.map((spec) => spec.name);

    // Dry run: count and validate without touching the destination.
    if (!options.apply) {
      for (const spec of present) {
        const columns = readColumnsForDryRun(dbPath, spec.table);
        const counts = {
          name: spec.name,
          table: spec.table,
          sourceCount: await reader.estimatedCount(spec.name).catch(() => 0),
          read: 0,
          wouldInsert: 0,
          wouldSkip: 0,
          duplicates: 0,
          warnings: [],
          unmappedFields: new Set()
        };
        const seen = new Set();
        const seenTuples = new Set();

        for await (const doc of reader.stream(spec.name)) {
          counts.read += 1;
          const { id, row, warnings, unmapped } = normalizeDocument(spec, doc, columns, context);
          for (const warning of warnings) {
            if (counts.warnings.length < 50) counts.warnings.push(`${id}: ${warning}`);
          }
          for (const field of unmapped) counts.unmappedFields.add(field);

          if (seen.has(id)) {
            counts.duplicates += 1;
            if (onDuplicate === 'error') {
              throw new Error(`Duplicate identifier "${id}" in collection "${spec.name}".`);
            }
            if (onDuplicate === 'first') {
              counts.wouldSkip += 1;
              continue;
            }
          }
          seen.add(id);

          const reference = referenceResolver(spec, row, context);
          if (reference.skip) {
            counts.wouldSkip += 1;
            continue;
          }

          spec.derive?.(row, context);

          if (spec.uniqueTuples) {
            const conflict = spec.uniqueTuples.some((tuple) =>
              seenTuples.has(tuple.map((name) => row[name]).join('\u0000'))
            );
            if (conflict) {
              counts.duplicates += 1;
              if (onDuplicate === 'error') {
                throw new Error(`Unique constraint collision in "${spec.table}".`);
              }
              if (onDuplicate === 'first') {
                counts.wouldSkip += 1;
                continue;
              }
            }
            for (const tuple of spec.uniqueTuples) {
              seenTuples.add(tuple.map((name) => row[name]).join('\u0000'));
            }
          }

          counts.wouldInsert += 1;
          context.ids[spec.table].add(id);
          if (spec.table === 'chat_rooms') {
            context.roomIds.set(id, id);
            if (row.name) context.roomIds.set(row.name, id);
            if (row.project) context.roomProjects.set(id, row.project);
            if (row.room_scope) context.roomScopes.set(id, row.room_scope);
          }
        }

        counts.unmappedFields = [...counts.unmappedFields];
        report.collections.push(counts);
        onProgress?.(`inspected ${spec.name}: ${counts.read} document(s)`);
      }

      report.ok = true;
      report.checks = {
        duplicateIdentifiers: report.collections.reduce((sum, entry) => sum + entry.duplicates, 0),
        orphanReferences: context.orphans.length,
        orphanSample: context.orphans.slice(0, 10)
      };
      report.destination.sizeAfter = fileSize(dbPath);
      report.totals = summarize(report.collections, 'wouldInsert');
      report.finishedAt = nowIso();
      report.durationMs = Date.now() - started;
      writeReport(report, {
        reportPath:
          options.reportPath === false ? null : options.reportPath || defaultReportPath(mode),
        backupDir: null
      });
      return report;
    }

    // Apply preflight ------------------------------------------------------
    const idle = assertDestinationIdle(dbPath);
    if (!idle.idle) {
      throw new Error(
        `Destination database is in use (${idle.error}). ` +
          'Stop running local-mcp-memory servers, then retry.'
      );
    }

    db = openDestination(dbPath);
    for (const spec of present) {
      context.columns[spec.table] = readColumns(db, spec.table);
    }

    const nonEmpty = present
      .map((spec) => ({ table: spec.table, rows: tableRowCount(db, spec.table) }))
      .filter((entry) => entry.rows > 0);
    if (nonEmpty.length > 0 && !options.resume) {
      throw new Error(
        `Destination is not empty (${nonEmpty
          .map((entry) => `${entry.table}=${entry.rows}`)
          .join(', ')}). ` + 'Re-run with --resume to upsert by primary key.'
      );
    }

    onProgress?.('writing source backup');
    report.backup = await writeSourceBackup({
      reader,
      collections: present,
      backupDir,
      onProgress
    });

    onProgress?.('writing destination snapshot');
    report.snapshot = await writeDestinationSnapshot({ dbPath, backupDir, onProgress });
    recordSnapshotInManifest(report.backup.manifestPath, report.snapshot);

    // Seed reference sets from the destination so a resumed run can resolve
    // rows that were migrated in an earlier attempt.
    for (const table of ['contexts', 'chat_rooms']) {
      for (const row of db.prepare(`SELECT id FROM "${table}"`).all()) {
        context.ids[table].add(row.id);
      }
    }
    for (const row of db.prepare('SELECT id, name, project, room_scope FROM chat_rooms').all()) {
      context.roomIds.set(row.id, row.id);
      if (row.name) context.roomIds.set(row.name, row.id);
      if (row.project) context.roomProjects.set(row.id, row.project);
      if (row.room_scope) context.roomScopes.set(row.id, row.room_scope);
    }

    onProgress?.('applying collections');
    for (const spec of present) {
      const counts = await applyCollection({
        db,
        spec,
        reader,
        context,
        options: {
          ...options,
          onDuplicate,
          orphans
        },
        report
      });
      context.sourceIds[spec.table] = counts.sourceIds;
      context.samples[spec.table] = counts.samples;
      onProgress?.(
        `applied ${spec.name}: ${counts.inserted} inserted, ${counts.updated} updated, ` +
          `${counts.skipped} skipped`
      );
    }

    onProgress?.('rebuilding full-text indexes');
    rebuildFTS(db);

    onProgress?.('verifying destination');
    report.checks = verifyDestination({ db, context });

    report.ok =
      report.checks.integrity === 'ok' &&
      report.checks.foreignKeyViolations.length === 0 &&
      report.checks.ftsIntegrity === 'ok' &&
      report.checks.reconciliation.every((entry) => entry.missing === 0) &&
      report.checks.samples.every((entry) => entry.ok);

    report.totals = summarize(report.collections, 'inserted');
    report.destination.sizeAfter = fileSize(dbPath);
    report.finishedAt = nowIso();
    report.durationMs = Date.now() - started;

    if (!report.ok) {
      report.error = 'Destination verification failed. See checks.';
    }

    writeReport(report, {
      reportPath: options.reportPath === false ? null : options.reportPath || null,
      backupDir
    });

    return report;
  } catch (error) {
    report.ok = false;
    report.error = error.message;
    report.finishedAt = nowIso();
    report.durationMs = Date.now() - started;
    report.orphans = context.orphans.slice(0, 50);
    if (options.reportPath !== false) {
      try {
        writeReport(report, {
          reportPath: options.reportPath || defaultReportPath(mode),
          backupDir: fs.existsSync(backupDir) ? backupDir : null
        });
      } catch {
        /* reporting must never mask the original error */
      }
    }
    return report;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
    if (!options.source && reader?.close) {
      try {
        await reader.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function readColumnsForDryRun(dbPath, table) {
  // Dry runs must not create the destination database. When it already exists,
  // read the real column definitions; otherwise open an in-memory database
  // with the same schema so normalization uses identical defaults.
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    try {
      return readColumns(db, table);
    } finally {
      db.close();
    }
  }

  const memory = new Database(':memory:');
  try {
    createSchema(memory);
    return readColumns(memory, table);
  } finally {
    memory.close();
  }
}

function summarize(collections, writeKey) {
  return collections.reduce(
    (totals, entry) => {
      totals.sourceDocuments += entry.sourceCount || 0;
      totals.read += entry.read || 0;
      totals.written += entry[writeKey] || 0;
      totals.skipped += entry.skipped || entry.wouldSkip || 0;
      totals.warnings += entry.warnings?.length || 0;
      return totals;
    },
    { sourceDocuments: 0, read: 0, written: 0, skipped: 0, warnings: 0 }
  );
}

/**
 * Restore the destination database from the snapshot written before an apply.
 *
 * Requires explicit confirmation (`yes: true`). Refuses to restore while any
 * other process holds the database.
 */
export async function rollbackMigration({ backupDir, dbPath, yes = false } = {}) {
  const dir = backupDir ? path.resolve(backupDir) : null;
  const target = path.resolve(dbPath || getDbPath());

  if (!dir) return { ok: false, error: 'A backup directory is required.' };
  if (!yes) return { ok: false, error: 'Rollback requires explicit confirmation (--yes).' };

  const manifestPath = path.join(dir, BACKUP_MANIFEST);
  const snapshotPath = path.join(dir, DESTINATION_SNAPSHOT);

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `No migration manifest at ${manifestPath}.` };
  }
  if (!fs.existsSync(snapshotPath)) {
    return {
      ok: false,
      error:
        'No destination snapshot in the backup. The destination did not exist before ' +
        'the migration, so there is nothing to restore.'
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = (manifest.snapshot && manifest.snapshot.sha256) || null;
  const actual = await sha256File(snapshotPath);
  if (expected && expected !== actual) {
    return { ok: false, error: 'Snapshot checksum mismatch; refusing to restore.' };
  }

  const idle = assertDestinationIdle(target);
  if (!idle.idle) {
    return {
      ok: false,
      error: `Destination database is in use (${idle.error}). Stop the servers first.`
    };
  }

  fs.copyFileSync(snapshotPath, target);
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${target}${suffix}`, { force: true });
  }

  const check = new Database(target, { readonly: true });
  let integrity;
  try {
    integrity = check.pragma('integrity_check', { simple: true });
  } finally {
    check.close();
  }

  return {
    ok: integrity === 'ok',
    restoredFrom: snapshotPath,
    dbPath: target,
    integrity,
    error: integrity === 'ok' ? null : `Integrity check failed after restore: ${integrity}`
  };
}

/**
 * Verify a backup directory without restoring it.
 */
export async function verifyBackup({ backupDir }) {
  const dir = path.resolve(backupDir);
  const manifestPath = path.join(dir, BACKUP_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `No manifest at ${manifestPath}.` };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const collections = [];
  for (const entry of manifest.collections || []) {
    const filePath = path.join(dir, entry.file);
    if (!fs.existsSync(filePath)) {
      collections.push({ name: entry.name, ok: false, error: 'missing file' });
      continue;
    }
    const digest = await sha256File(filePath);
    const lines = countLines(filePath);
    collections.push({
      name: entry.name,
      ok: digest === entry.sha256 && lines === entry.count,
      expectedCount: entry.count,
      actualCount: lines
    });
  }

  const snapshotPath = path.join(dir, DESTINATION_SNAPSHOT);
  let snapshot = null;
  if (fs.existsSync(snapshotPath)) {
    const digest = await sha256File(snapshotPath);
    const expected = manifest.snapshot?.sha256;
    snapshot = { path: snapshotPath, ok: !expected || expected === digest, sha256: digest };
  }

  return {
    ok: collections.every((entry) => entry.ok) && (!snapshot || snapshot.ok),
    manifest,
    collections,
    snapshot
  };
}

export default {
  COLLECTIONS,
  MIGRATION_VERSION,
  createMongoReader,
  normalizeDocument,
  redactUri,
  rollbackMigration,
  runMigration,
  verifyBackup
};
