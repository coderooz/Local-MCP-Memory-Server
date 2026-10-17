/**
 * SQLite Database Wrapper
 *
 * Provides a MongoDB-compatible interface using SQLite.
 * Drop-in replacement for MongoDB's Db object.
 * All existing code that uses db.collection('name').find() will work unchanged.
 */

import {
  connect,
  disconnect as disconnectSqlite,
  getDb as getSqliteDb,
  isConnected,
  getDbPath,
} from './connection.js';
import { createSchema, rebuildFTS } from './schema.js';
import { Collection } from './collection.js';

let database = null;
let collections = {};

class SQLiteDb {
  constructor(rawDb) {
    this._db = rawDb;
    collections = {};
  }

  collection(name) {
    if (!collections[name]) {
      collections[name] = new Collection(this._db, name);
    }
    return collections[name];
  }

  get collections() {
    return new Proxy(
      {},
      {
        get: (_, name) => this.collection(name),
      }
    );
  }

  command() {
    return { ok: 1 };
  }

  stats() {
    try {
      const tables = this._db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all();

      const collectionsInfo = {};
      for (const { name } of tables) {
        const count = this._db.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get();
        collectionsInfo[name] = { count: count.cnt || 0 };
      }
      return { collections: collectionsInfo };
    } catch {
      return { collections: {} };
    }
  }
}

export async function initializeDatabase(dbPath) {
  const rawDb = connect(dbPath);
  createSchema(rawDb);
  database = new SQLiteDb(rawDb);
  collections = {};
  return database;
}

export function getDatabase() {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return database;
}

export function getDb() {
  return getDatabase();
}

export async function disconnectDatabase() {
  collections = {};
  database = null;
  disconnectSqlite();
}

export { rebuildFTS, getDbPath };
export default {
  initializeDatabase,
  getDatabase,
  getDb,
  disconnectDatabase,
  rebuildFTS,
  getDbPath,
};
