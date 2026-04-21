import { v4 as uuidv4 } from 'uuid';

import { ContextModel, normalizeMemory } from '../../core/mcp/models.js';

let dbInstance = null;

export function initLogger(db) {
  dbInstance = db;
}

async function logToDB(log) {
  if (!dbInstance) {
    return;
  }

  try {
    await dbInstance.collection('logs').insertOne({
      id: uuidv4(),
      ...log,
      createdAt: new Date(),
    });
  } catch {}
}

export async function logError(error, context = {}) {
  await logToDB({
    type: 'error',
    message: error.message,
    stack: error.stack,
    context,
  });

  if (!dbInstance) {
    return;
  }

  try {
    const memory = new ContextModel({
      agent: context.agent || 'system',
      project: context.project || 'global',
      scope: 'global',
      type: 'error',
      content: error.message,
      metadata: context,
      tags: ['error', 'debug'],
    });

    await dbInstance.collection('contexts').insertOne(normalizeMemory(memory));
  } catch (err) {
    process.stderr.write('Logger error: ' + err.message + '\n');
  }
}

export async function logInfo(message, context = {}) {
  await logToDB({
    type: 'info',
    message,
    context,
  });
}
