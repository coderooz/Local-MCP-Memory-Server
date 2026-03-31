#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true
});

const fromProject = process.argv[2] || "vscode";
const toProject = process.argv[3] || process.env.MCP_PROJECT;
const DB_NAME = process.env.MONGO_DB_NAME || "mcp_memory";

if (!process.env.MONGO_URI) {
  console.error("Missing MONGO_URI in .env");
  process.exit(1);
}

if (!toProject) {
  console.error(
    "Missing target project identifier. Set MCP_PROJECT in .env or pass it as the second argument."
  );
  process.exit(1);
}

const client = new MongoClient(process.env.MONGO_URI);
const collections = [
  "contexts",
  "actions",
  "sessions",
  "agents",
  "tasks",
  "messages",
  "project_map"
];

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);
  const results = [];

  for (const name of collections) {
    const result = await db.collection(name).updateMany(
      { project: fromProject },
      {
        $set: {
          project: toProject,
          updatedAt: new Date()
        }
      }
    );

    results.push({
      collection: name,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  }

  const logResult = await db.collection("logs").updateMany(
    { "context.project": fromProject },
    {
      $set: {
        "context.project": toProject
      }
    }
  );

  results.push({
    collection: "logs.context.project",
    matched: logResult.matchedCount,
    modified: logResult.modifiedCount
  });

  console.log(
    JSON.stringify(
      {
        fromProject,
        toProject,
        results
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
