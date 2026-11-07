import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const ROOT = 'C:\\Code_Works\\HTML_CSS_JS\\workProjects\\projects\\local-mcp-memory';
const MONGO_URI = 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = 'mcp_memory';

async function checkMongo() {
  console.log('--- Phase G: MongoDB Read-Only Preflight ---');
  try {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    const collections = await db.listCollections().toArray();
    console.log(`Connected to MongoDB: ${MONGO_URI}/${MONGO_DB_NAME}`);
    console.log(`Found ${collections.length} collections:`);

    let totalDocs = 0;
    const collectionCounts = {};
    for (const col of collections) {
      const name = col.name;
      const count = await db.collection(name).countDocuments({});
      collectionCounts[name] = count;
      totalDocs += count;
      console.log(`  - ${name}: ${count} documents`);
    }
    console.log(`Total Source MongoDB Documents: ${totalDocs}`);
    await client.close();
    return { ok: true, totalDocs, collectionCounts };
  } catch (err) {
    console.log(`MongoDB connection check failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function checkSqliteDestination() {
  console.log('\n--- Phase G: SQLite Destination Read-Only Preflight ---');
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
  const dbPath = path.join(localAppData, 'local-mcp-memory', 'mcp-memory.db');
  console.log(`Destination SQLite DB Path: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.log('Destination SQLite DB does not exist yet at target path.');
    return { exists: false };
  }

  const stat = fs.statSync(dbPath);
  console.log(`File size: ${(stat.size / 1024).toFixed(2)} KB`);

  // Open readonly
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`Found ${tables.length} tables in destination DB:`);
  const tableCounts = {};
  for (const t of tables) {
    if (t.name.startsWith('sqlite_')) continue;
    try {
      const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get().c;
      tableCounts[t.name] = count;
      console.log(`  - ${t.name}: ${count} rows`);
    } catch {}
  }

  const walMode = db.pragma('journal_mode', { simple: true });
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  console.log(`PRAGMA journal_mode: ${walMode}`);
  console.log(`PRAGMA foreign_keys: ${foreignKeys}`);
  db.close();

  return { exists: true, size: stat.size, tables: tables.length, tableCounts, walMode, foreignKeys };
}

function checkBackups() {
  console.log('\n--- Phase G: Backups Preflight ---');
  const backupDir = path.join(ROOT, '.backups');
  if (!fs.existsSync(backupDir)) {
    console.log('No .backups directory found.');
    return { count: 0 };
  }
  const files = fs.readdirSync(backupDir);
  console.log(`Found ${files.length} items in .backups/:`);
  for (const f of files) {
    const full = path.join(backupDir, f);
    const stat = fs.statSync(full);
    console.log(`  - ${f} (${(stat.size / 1024).toFixed(2)} KB)`);
  }
  return { count: files.length, files };
}

async function run() {
  const mongo = await checkMongo();
  const sqlite = checkSqliteDestination();
  const backups = checkBackups();
  console.log('\nPhase G Preflight checks completed.');
}

run();
