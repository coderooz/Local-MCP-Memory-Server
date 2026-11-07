import { MongoClient } from 'mongodb';

async function inspect() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('mcp_memory');
  const collections = await db.listCollections().toArray();
  console.log('MongoDB Collections in mcp_memory:');
  let total = 0;
  const inventory = [];
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`- ${col.name}: ${count}`);
    inventory.push({ name: col.name, count });
    total += count;
  }
  console.log('Total collections:', collections.length);
  console.log('Total documents:', total);
  await client.close();
}

inspect().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
