import { ActivityModel, normalizeMemory } from "../mcp.model.js";

export async function recordActivity(
  db,
  {
    agent = "system",
    project = "default",
    type = "action",
    message,
    related_task = null,
    resource = null,
    metadata = {}
  }
) {
  const activity = new ActivityModel({
    agent,
    project,
    scope: "project",
    type,
    message,
    related_task,
    resource,
    metadata
  });

  await db.collection("activity").insertOne(normalizeMemory(activity));
  return activity;
}
