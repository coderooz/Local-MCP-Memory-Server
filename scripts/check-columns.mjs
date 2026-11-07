import { createSchema } from '../src/core/database/sqlite/schema.js';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
createSchema(db);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'").all();

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all().map(c => c.name);
  const matched = ['importance', 'accessCount', 'lifecycle', 'score'].filter(f => cols.includes(f));
  if (matched.length > 0) {
    console.log(t.name.padEnd(20) + ': ' + matched.join(', '));
  } else {
    console.log(t.name.padEnd(20) + ': [none]');
  }
}
