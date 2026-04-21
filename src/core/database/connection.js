import { MongoClient } from 'mongodb';

let client = null;
let db = null;
let startupPromise = null;

export const DB_NAME = process.env.MONGO_DB_NAME || 'mcp_memory';

export function getDb() {
  if (!db) {
    throw new Error('Database not ready');
  }
  return db;
}

export async function connect(uri = process.env.MONGO_URI) {
  if (db) {
    return { client, db };
  }

  if (!startupPromise) {
    startupPromise = (async () => {
      client = new MongoClient(uri);
      await client.connect();
      db = client.db(DB_NAME);
      return { client, db };
    })();
  }

  return startupPromise;
}

export async function disconnect() {
  if (client) {
    await client.close();
    client = null;
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
