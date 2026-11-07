import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sourceDbPath = path.join(process.env.LOCALAPPDATA, 'local-mcp-memory', 'mcp-memory.db');
const targetBackupDir = path.resolve('.backups', 'sqlite-pre-migration');
const targetBackupFile = path.join(targetBackupDir, 'mcp-memory-pre-migration.db');
const manifestFile = path.join(targetBackupDir, 'backup-manifest.json');

async function main() {
  console.log('=== SQLite Native Backup & Verification ===\n');
  if (!fs.existsSync(targetBackupDir)) {
    fs.mkdirSync(targetBackupDir, { recursive: true });
  }

  console.log('Source database:', sourceDbPath);
  console.log('Target backup file:', targetBackupFile);

  const sourceDb = new Database(sourceDbPath, { readonly: true });
  
  // Use better-sqlite3 native backup mechanism
  console.log('Initiating native SQLite backup...');
  await sourceDb.backup(targetBackupFile);
  console.log('Native backup completed.');
  sourceDb.close();

  // Verify backup integrity
  console.log('\nVerifying backup file integrity...');
  const backupDb = new Database(targetBackupFile, { readonly: true });
  const integrity = backupDb.pragma('integrity_check', { simple: true });
  const fkCheck = backupDb.pragma('foreign_key_check');
  const journalMode = backupDb.pragma('journal_mode', { simple: true });
  
  // Table row counts
  const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'").all();
  const tableCounts = {};
  for (const { name } of tables) {
    tableCounts[name] = backupDb.prepare(`SELECT count(*) as c FROM "${name}"`).get().c;
  }

  // FTS5 check
  let ftsOk = false;
  try {
    const ftsRes = backupDb.prepare("SELECT count(*) as c FROM contexts_fts").get();
    ftsOk = typeof ftsRes.c === 'number';
  } catch (e) {
    ftsOk = false;
  }

  backupDb.close();

  // Compute SHA-256 hash
  const fileBytes = fs.readFileSync(targetBackupFile);
  const sha256Hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
  const fileStat = fs.statSync(targetBackupFile);

  const manifest = {
    createdAt: new Date().toISOString(),
    sourcePath: sourceDbPath,
    backupPath: targetBackupFile,
    fileSizeBytes: fileStat.size,
    sha256: sha256Hash,
    integrityCheck: integrity,
    foreignKeyViolations: fkCheck.length,
    journalMode,
    fts5Verified: ftsOk,
    tableCounts
  };

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nBackup Verification Results:');
  console.log('  File Size:', fileStat.size, 'bytes');
  console.log('  SHA-256:', sha256Hash);
  console.log('  Integrity Check:', integrity);
  console.log('  Foreign Key Violations:', fkCheck.length);
  console.log('  Journal Mode:', journalMode);
  console.log('  FTS5 Available:', ftsOk);
  console.log('  Contexts Count:', tableCounts.contexts);
  console.log('  Memory Versions Count:', tableCounts.memory_versions);
  console.log('  Tasks Count:', tableCounts.tasks);
  console.log('  Activity Count:', tableCounts.activity);
  console.log('\nManifest written to:', manifestFile);
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
