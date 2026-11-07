import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getDbPath as resolveAppDbPath } from '../../paths/index.js';

let db = null;
let dbPath = null;

/**
 * Resolve the SQLite file path.
 *
 * Defaults to the per-user application data directory (see
 * `src/core/paths/index.js`), never the package directory or the cwd.
 * `MCP_DB_PATH` still overrides the location.
 */
export function getDbPath() {
  if (dbPath) return dbPath;
  dbPath = resolveAppDbPath();
  return dbPath;
}

export function connect(dbFilePath) {
  if (db) return db;

  const filePath = dbFilePath || getDbPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(filePath);

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('foreign_keys = ON');

  // Supports the "$regex" operator: convertMongoQuery serializes a RegExp as
  // "source flags" (space-separated) and SQLite invokes regexp(Y, X) for
  // "X REGEXP Y". The parser validates the trailing token against the flag
  // charset so patterns that merely contain spaces stay intact.
  db.function('REGEXP', { deterministic: true }, (pattern, value) => {
    if (value === null || value === undefined) return 0;
    let source = String(pattern);
    let flags = '';
    const cut = source.lastIndexOf(' ');
    if (cut !== -1) {
      const tail = source.slice(cut + 1);
      if (/^[gimsuy]*$/.test(tail)) {
        source = source.slice(0, cut);
        flags = tail;
      }
    }
    try {
      return new RegExp(source, flags).test(String(value)) ? 1 : 0;
    } catch {
      return 0;
    }
  });

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not ready. Call connect() first.');
  }
  return db;
}

export function isConnected() {
  return db !== null;
}

export function disconnect() {
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
    dbPath = null;
  }
}

export function getCollection(name) {
  return getDb().collection(name);
}

export function transaction(fn) {
  return getDb().transaction(fn)();
}
