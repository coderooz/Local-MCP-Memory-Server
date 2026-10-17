/**
 * Database Connection Module (SQLite)
 *
 * Drop-in replacement for MongoDB connection.
 * Maintains the same API: connect(), disconnect(), getDb(), getCollection(), isConnected().
 * All existing modules that import from this file continue to work unchanged.
 */

import { initializeDatabase, getDatabase, disconnectDatabase } from './sqlite/index.js';

let db = null;
let startupPromise = null;

export const DB_NAME = 'mcp-memory';

export function getDb() {
  if (!db) {
    throw new Error('Database not ready');
  }
  return db;
}

export async function connect(dbPath) {
  if (db) {
    return { client: null, db };
  }

  if (!startupPromise) {
    startupPromise = (async () => {
      try {
        db = await initializeDatabase(dbPath);
        return { client: null, db };
      } catch (error) {
        console.error('[database] Failed to initialize SQLite:', error.message);
        throw error;
      }
    })();
  }

  return startupPromise;
}

export async function disconnect() {
  if (db) {
    await disconnectDatabase();
    db = null;
    startupPromise = null;
  }
}

export function isConnected() {
  return db !== null;
}

export function getCollection(name) {
  if (!db) {
    throw new Error('Database not ready');
  }
  return db.collection(name);
}
