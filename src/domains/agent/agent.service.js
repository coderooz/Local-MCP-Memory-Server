import { v4 as uuidv4 } from 'uuid';
import {
  AgentModel,
  MEMORY_SCOPE,
  normalizeMemory,
  toStringArray,
  clampNumber,
} from '../../../core/mcp/models.js';

export { AgentModel };

const OFFLINE_AFTER_MS = 120000;
const IDLE_AFTER_MS = 45000;

function safeDate(value, fallback = new Date(0)) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function deriveAgentStatus(agent, now = new Date()) {
  const lastSeen = safeDate(agent?.last_seen, new Date(0));
  const ageMs = now.getTime() - lastSeen.getTime();

  if (ageMs > OFFLINE_AFTER_MS) {
    return 'offline';
  }

  if (agent?.current_task) {
    return 'active';
  }

  if (ageMs > IDLE_AFTER_MS) {
    return 'idle';
  }

  return agent?.status === 'active' ? 'active' : 'idle';
}

export async function registerAgent(
  db,
  { name, role = 'worker', capabilities = [], agent_id, agent, project = 'default' }
) {
  const finalAgentId = agent_id || uuidv4();

  const existingAgent = await db.collection('agents').findOne({ agent_id: finalAgentId });

  if (existingAgent) {
    await db.collection('agents').updateOne(
      { agent_id: finalAgentId },
      {
        $set: {
          name: name || existingAgent.name,
          role: role || existingAgent.role,
          capabilities: toStringArray(capabilities),
          status: 'idle',
          last_seen: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const updatedAgent = await db.collection('agents').findOne({ agent_id: finalAgentId });
    return { agent: updatedAgent, created: false };
  }

  const newAgent = new AgentModel({
    agent_id: finalAgentId,
    name: name || 'Unnamed Agent',
    role,
    capabilities: toStringArray(capabilities),
    status: 'idle',
    agent: agent || 'system',
    project,
    scope: MEMORY_SCOPE.PROJECT,
    last_seen: new Date(),
  });

  await db.collection('agents').insertOne(normalizeMemory(newAgent));

  const storedAgent = await db.collection('agents').findOne({ agent_id: finalAgentId });
  return { agent: storedAgent, created: true };
}

export async function heartbeatAgent(db, { agent_id, current_task, status, agent, project }) {
  const updateFields = {
    last_seen: new Date(),
    updatedAt: new Date(),
  };

  if (current_task !== undefined) {
    updateFields.current_task = current_task;
  }

  if (status !== undefined) {
    updateFields.status = status;
  }

  const updatedAgent = await db
    .collection('agents')
    .findOneAndUpdate({ agent_id }, { $set: updateFields }, { returnDocument: 'after' });

  if (!updatedAgent) {
    throw new Error(`Agent not found: ${agent_id}`);
  }

  return { agent: updatedAgent };
}

export async function listAgents(db, { project, status } = {}) {
  const filter = {};

  if (project) {
    filter.project = project;
  }

  if (status) {
    filter.status = status;
  }

  return db.collection('agents').find(filter).sort({ last_seen: -1 }).toArray();
}

export async function refreshAgentStatuses(db, project) {
  const filter = project ? { project } : {};
  const agents = await db.collection('agents').find(filter).toArray();
  const now = new Date();

  await Promise.all(
    agents.map(async (agent) => {
      const status = deriveAgentStatus(agent, now);

      if (status !== agent.status) {
        await db.collection('agents').updateOne(
          { agent_id: agent.agent_id },
          {
            $set: {
              status,
              updatedAt: now,
            },
          }
        );
      }
    })
  );
}

export async function getAgentById(db, agentId) {
  return db.collection('agents').findOne({ agent_id: agentId });
}

export async function findAgentsByCapabilities(db, project, requiredCapabilities = []) {
  if (!requiredCapabilities.length) {
    return db.collection('agents').find({ project }).toArray();
  }

  return db
    .collection('agents')
    .find({
      project,
      capabilities: { $in: requiredCapabilities },
    })
    .toArray();
}

export async function findAvailableAgents(db, project) {
  await refreshAgentStatuses(db, project);

  return db
    .collection('agents')
    .find({
      project,
      status: { $in: ['active', 'idle'] },
    })
    .toArray();
}
