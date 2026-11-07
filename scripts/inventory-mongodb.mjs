import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/mcp_memory';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  const collections = await db.listCollections().toArray();
  const report = {
    collections: [],
    orphans: {},
    duplicates: {},
    summary: { totalDocs: 0, totalCollections: collections.length }
  };

  console.log('=== MongoDB Production Source Inventory ===\n');

  // Cache context IDs and chat room IDs for orphan detection
  const contextIds = new Set(
    (await db.collection('contexts').find({}, { projection: { id: 1 } }).toArray())
      .map(d => d.id).filter(Boolean)
  );
  const chatRoomIds = new Set(
    (await db.collection('chat_rooms').find({}, { projection: { room_id: 1, id: 1 } }).toArray())
      .map(d => d.room_id || d.id).filter(Boolean)
  );

  console.log(`Indexed ${contextIds.size} context IDs and ${chatRoomIds.size} chat room IDs for relational integrity check.`);

  for (const collInfo of collections) {
    const name = collInfo.name;
    const coll = db.collection(name);
    const count = await coll.countDocuments();
    report.summary.totalDocs += count;

    let stats = null;
    try {
      stats = await db.command({ collStats: name });
    } catch (e) {
      // collStats might fail in some configurations
    }

    // Inspect fields from sample documents
    const sample = await coll.find().limit(20).toArray();
    const fieldSet = new Set();
    const types = {};
    for (const doc of sample) {
      for (const [k, v] of Object.entries(doc)) {
        fieldSet.add(k);
        const t = Array.isArray(v) ? 'array' : typeof v;
        types[k] = types[k] || new Set();
        types[k].add(t);
      }
    }

    const fieldSummary = {};
    for (const k of fieldSet) {
      fieldSummary[k] = Array.from(types[k] || []);
    }

    // Duplicate ID check
    let dupCount = 0;
    try {
      const dups = await coll.aggregate([
        { $match: { id: { $exists: true, $ne: null } } },
        { $group: { _id: '$id', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();
      dupCount = dups.length;
      if (dupCount > 0) {
        report.duplicates[name] = dups;
      }
    } catch (e) {
      // Aggregation error or no id
    }

    // Null/missing ID check
    const nullIdCount = await coll.countDocuments({ id: { $in: [null, ''] } });

    // Distinct projects / agents
    let distinctProjects = [];
    let distinctAgents = [];
    try {
      if (fieldSet.has('project')) distinctProjects = await coll.distinct('project');
      if (fieldSet.has('agent')) distinctAgents = await coll.distinct('agent');
      else if (fieldSet.has('from_agent')) distinctAgents = await coll.distinct('from_agent');
    } catch (e) {}

    const collData = {
      name,
      count,
      sizeBytes: stats?.size || 0,
      storageSizeBytes: stats?.storageSize || 0,
      avgObjSize: stats?.avgObjSize || 0,
      fields: fieldSummary,
      duplicateIdCount: dupCount,
      nullOrEmptyIdCount: nullIdCount,
      projectsCount: distinctProjects.length,
      sampleProjects: distinctProjects.slice(0, 5),
      agentsCount: distinctAgents.length,
      sampleAgents: distinctAgents.slice(0, 5)
    };

    report.collections.push(collData);
    console.log(`Collection: ${name}`);
    console.log(`  Count: ${count} | Size: ${(collData.sizeBytes / 1024).toFixed(1)} KB | Storage: ${(collData.storageSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Fields: ${Object.keys(fieldSummary).join(', ')}`);
    console.log(`  Duplicates: ${dupCount} | Null IDs: ${nullIdCount}`);
    if (distinctProjects.length) console.log(`  Projects (${distinctProjects.length}): ${distinctProjects.slice(0, 5).join(', ')}`);
  }

  // Check orphans in memory_versions
  const memVersions = await db.collection('memory_versions').find({}, { projection: { id: 1, context_id: 1 } }).toArray();
  const orphanMemoryVersions = memVersions.filter(v => v.context_id && !contextIds.has(v.context_id));
  report.orphans.memory_versions = orphanMemoryVersions.length;
  console.log(`\nOrphan memory_versions (missing context_id in contexts): ${orphanMemoryVersions.length}`);

  // Check orphans in chat_messages
  const chatMessages = await db.collection('chat_messages').find({}, { projection: { id: 1, message_id: 1, room_id: 1 } }).toArray();
  const orphanChatMessages = chatMessages.filter(m => m.room_id && !chatRoomIds.has(m.room_id));
  report.orphans.chat_messages = orphanChatMessages.length;
  console.log(`Orphan chat_messages (missing room_id in chat_rooms): ${orphanChatMessages.length}`);

  console.log(`\nTotal Documents across all collections: ${report.summary.totalDocs}`);
  await client.close();
}

main().catch(err => {
  console.error('Inventory failed:', err);
  process.exit(1);
});
