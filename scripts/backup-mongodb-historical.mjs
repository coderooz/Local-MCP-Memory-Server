import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function backupMongoDB() {
  const uri = 'mongodb://127.0.0.1:27017';
  const dbName = 'mcp_memory';

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestampStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  const baseBackupDir = 'C:\\Local-MCP-Memory-Backups\\pre-v260-retirement';
  const targetDir = path.join(baseBackupDir, timestampStr);
  const mongoDumpDir = path.join(targetDir, 'mongodb');

  fs.mkdirSync(mongoDumpDir, { recursive: true });

  console.log(`[Backup] Connecting to MongoDB at ${uri}...`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const collections = await db.listCollections().toArray();
  console.log(`[Backup] Found ${collections.length} collections in database '${dbName}'`);

  const inventory = [];
  const checksums = [];
  let totalDocs = 0;

  for (const colInfo of collections) {
    const colName = colInfo.name;
    const col = db.collection(colName);
    const count = await col.countDocuments();
    totalDocs += count;
    console.log(`[Backup] Exporting '${colName}' (${count} documents)...`);

    const outFile = path.join(mongoDumpDir, `${colName}.json`);
    const writeStream = fs.createWriteStream(outFile, { encoding: 'utf8' });
    const hash = crypto.createHash('sha256');

    // Stream documents as JSONL
    const cursor = col.find({});
    let exportedCount = 0;

    for await (const doc of cursor) {
      const line = JSON.stringify(doc) + '\n';
      writeStream.write(line);
      hash.update(line);
      exportedCount++;
    }

    await new Promise(res => writeStream.end(res));
    const digest = hash.digest('hex');

    if (exportedCount !== count) {
      throw new Error(`Count mismatch during export of ${colName}: expected ${count}, got ${exportedCount}`);
    }

    const fileSize = fs.statSync(outFile).size;
    inventory.push({
      collection: colName,
      documentCount: count,
      file: `mongodb/${colName}.json`,
      fileSizeBytes: fileSize,
      sha256: digest
    });

    checksums.push(`${digest}  mongodb/${colName}.json`);
    console.log(`[Backup] Completed '${colName}': ${count} docs, ${fileSize} bytes, sha256: ${digest.slice(0, 12)}...`);
  }

  await client.close();

  // Write inventory
  fs.writeFileSync(
    path.join(targetDir, 'collection-inventory.json'),
    JSON.stringify(inventory, null, 2)
  );

  // Write checksums
  fs.writeFileSync(
    path.join(targetDir, 'checksums.txt'),
    checksums.join('\n') + '\n'
  );

  // Write manifest
  const manifest = {
    database: dbName,
    sourceHost: '127.0.0.1:27017',
    backupTimestamp: now.toISOString(),
    backupDirectory: targetDir,
    totalCollections: collections.length,
    totalDocuments: totalDocs,
    verified: true
  };

  fs.writeFileSync(
    path.join(targetDir, 'backup-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Write Markdown Report
  const reportLines = [
    `# MongoDB Historical Database Backup Report`,
    ``,
    `- **Database**: \`${dbName}\``,
    `- **Host**: \`127.0.0.1:27017\``,
    `- **Timestamp**: ${now.toISOString()}`,
    `- **Backup Location**: \`${targetDir}\``,
    `- **Total Collections**: ${collections.length}`,
    `- **Total Documents**: ${totalDocs}`,
    `- **Verification Status**: **VERIFIED COMPLETE**`,
    ``,
    `## Collection Inventory`,
    ``,
    `| Collection | Documents | File Size (Bytes) | SHA256 Checksum |`,
    `| :--- | :--- | :--- | :--- |`,
    ...inventory.map(item => `| \`${item.collection}\` | ${item.documentCount} | ${item.fileSizeBytes.toLocaleString()} | \`${item.sha256}\` |`),
    ``,
    `## Verification Attestation`,
    `All ${collections.length} collections were exported and verified against MongoDB document counts. Checksums have been recorded in \`checksums.txt\`. The original database was accessed read-only and preserved completely in place.`
  ];

  fs.writeFileSync(path.join(targetDir, 'BACKUP_REPORT.md'), reportLines.join('\n'));

  console.log(`[Backup] Successfully created and verified backup at: ${targetDir}`);
  console.log(`[Backup] Total collections: ${collections.length}, Total documents: ${totalDocs}`);

  return { targetDir, manifest, inventory };
}

backupMongoDB().catch(err => {
  console.error('[Backup] Backup failed:', err);
  process.exit(1);
});
