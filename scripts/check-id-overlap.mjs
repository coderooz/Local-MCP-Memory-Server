import Database from 'better-sqlite3';
import { MongoClient } from 'mongodb';
import path from 'path';

const sqliteDbPath = path.join(process.env.LOCALAPPDATA, 'local-mcp-memory', 'mcp-memory.db');
const mongoUri = 'mongodb://127.0.0.1:27017/mcp_memory';

async function main() {
  console.log('=== Checking ID Overlap: MongoDB vs SQLite ===\n');
  const sqlite = new Database(sqliteDbPath, { readonly: true });
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const mongoDb = mongoClient.db();

  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'").all();

  const overlapReport = {};
  let totalOverlapCount = 0;

  for (const { name } of tables) {
    // Get all IDs from SQLite table
    let sqliteIds = new Set();
    try {
      const rows = sqlite.prepare(`SELECT id FROM "${name}"`).all();
      sqliteIds = new Set(rows.map(r => r.id).filter(Boolean));
    } catch (e) {
      // Some tables might have different PK like room_id or feedback_id or job_id
      try {
        const rows = sqlite.prepare(`SELECT rowid, * FROM "${name}" LIMIT 1`).all();
        const pkCol = rows.length > 0 ? (rows[0].id ? 'id' : Object.keys(rows[0])[0]) : 'id';
        const allRows = sqlite.prepare(`SELECT "${pkCol}" as id FROM "${name}"`).all();
        sqliteIds = new Set(allRows.map(r => r.id).filter(Boolean));
      } catch (err) {}
    }

    if (sqliteIds.size === 0) {
      continue;
    }

    // Check if matching MongoDB collection exists
    try {
      const mongoColl = mongoDb.collection(name);
      const mongoDocs = await mongoColl.find({
        $or: [
          { id: { $in: Array.from(sqliteIds) } },
          { _id: { $in: Array.from(sqliteIds) } },
          { room_id: { $in: Array.from(sqliteIds) } },
          { feedback_id: { $in: Array.from(sqliteIds) } },
          { task_id: { $in: Array.from(sqliteIds) } },
          { message_id: { $in: Array.from(sqliteIds) } },
          { activity_id: { $in: Array.from(sqliteIds) } }
        ]
      }, { projection: { id: 1, _id: 1, room_id: 1, feedback_id: 1 } }).toArray();

      if (mongoDocs.length > 0) {
        overlapReport[name] = mongoDocs;
        totalOverlapCount += mongoDocs.length;
        console.log(`⚠️ Overlap detected in table "${name}": ${mongoDocs.length} matching IDs!`);
      } else {
        console.log(`✔ Table "${name}": ${sqliteIds.size} SQLite records, 0 overlapping IDs with MongoDB.`);
      }
    } catch (e) {
      console.log(`Note for table "${name}": ${e.message}`);
    }
  }

  console.log(`\nTotal overlapping IDs across all tables: ${totalOverlapCount}`);
  sqlite.close();
  await mongoClient.close();
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
