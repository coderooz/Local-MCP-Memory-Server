import { MetricModel, normalizeMemory } from "../mcp.model.js";

export async function recordMetric(
  db,
  {
    agent = "system",
    project = "default",
    metric_type,
    name,
    value = 1,
    data = {}
  }
) {
  const metric = new MetricModel({
    agent,
    project,
    scope: "project",
    metric_type,
    name,
    value,
    data
  });

  await db.collection("metrics").insertOne(normalizeMemory(metric));
  return metric;
}
