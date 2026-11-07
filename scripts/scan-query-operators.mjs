import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/mcp_memory';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  const colls = await db.listCollections().toArray();
  let foundAny = false;

  for (const c of colls) {
    const docs = await db.collection(c.name).find({
      $or: [
        { agent_id: { $type: 'object' } },
        { agent: { $type: 'object' } },
        { project: { $type: 'object' } },
        { id: { $type: 'object' } }
      ]
    }).toArray();

    if (docs.length > 0) {
      foundAny = true;
      console.log(`Collection "${c.name}" has ${docs.length} documents with object in scalar fields:`);
      for (const d of docs) {
        console.log(`  id=${d.id} project=${JSON.stringify(d.project)} agent_id=${JSON.stringify(d.agent_id)} agent=${JSON.stringify(d.agent)} name=${d.name}`);
      }
    }
  }

  if (!foundAny) {
    console.log('No other collections have objects in scalar id/agent/project fields.');
  }
  await client.close();
}

main().catch(console.error);
