import { v4 as uuidv4 } from 'uuid';
import {
  ContextModel,
  MemoryVersionModel,
  ProjectDescriptorModel,
  MEMORY_SCOPE,
  MEMORY_LIFECYCLE,
  normalizeMemory,
  toStringArray,
} from '../../../core/mcp/models.js';

export { ContextModel, MemoryVersionModel, ProjectDescriptorModel, MEMORY_SCOPE, MEMORY_LIFECYCLE };

export function buildProjectDescriptorFilter(project) {
  return {
    project,
    type: 'project',
    scope: MEMORY_SCOPE.PROJECT,
  };
}

export function createContext(db, contextData) {
  const context = new ContextModel(contextData);
  return db.collection('contexts').insertOne(normalizeMemory(context));
}

export function getContextById(db, contextId) {
  return db.collection('contexts').findOne({ id: contextId });
}

export function searchContexts(db, options = {}) {
  const { agent, project, query = '', limit = 10, lifecycle } = options;

  const conditions = [];

  if (agent) {
    conditions.push({ agent, scope: MEMORY_SCOPE.PRIVATE });
  }

  if (project) {
    conditions.push({ project, scope: MEMORY_SCOPE.PROJECT });
  }

  conditions.push({ scope: MEMORY_SCOPE.GLOBAL });

  const filters = [];

  if (conditions.length) {
    filters.push({ $or: conditions });
  }

  if (query?.trim()) {
    filters.push({ $text: { $search: query.trim() } });
  }

  if (lifecycle) {
    filters.push({ lifecycle });
  }

  const baseQuery = filters.length === 1 ? filters[0] : { $and: filters };

  return db.collection('contexts').find(baseQuery).limit(limit).toArray();
}

export function updateContext(db, contextId, updates, options = {}) {
  const { reason, changedBy } = options;

  const updateOps = {
    ...updates,
    updatedAt: new Date(),
  };

  if (reason) {
    updateOps.updateReason = reason;
  }

  return db
    .collection('contexts')
    .findOneAndUpdate({ id: contextId }, { $set: updateOps }, { returnDocument: 'after' });
}

export function createMemoryVersion(db, contextId, snapshot, options = {}) {
  const { changeType = 'update', reason = 'No reason provided', changedBy = 'system' } = options;

  const existingContext = db.collection('contexts').findOne({ id: contextId });
  if (!existingContext) {
    throw new Error('Context not found');
  }

  const version = new MemoryVersionModel({
    context_id: contextId,
    context_version: existingContext.version + 1,
    change_type: changeType,
    reason,
    snapshot,
    changedBy,
    project: existingContext.project,
  });

  db.collection('memory_versions').insertOne(version);

  db.collection('contexts').updateOne(
    { id: contextId },
    {
      $inc: { version: 1 },
      $set: { updatedAt: new Date() },
    }
  );

  return version;
}

export function getContextVersions(db, contextId, limit = 20) {
  return db
    .collection('memory_versions')
    .find({ context_id: contextId })
    .sort({ context_version: -1 })
    .limit(limit)
    .toArray();
}

export function upsertProjectDescriptor(db, descriptorData) {
  const project = descriptorData.project || 'default';
  const existingDescriptor = db
    .collection('contexts')
    .findOne(buildProjectDescriptorFilter(project));

  if (existingDescriptor) {
    const updates = {
      ...descriptorData,
      updatedAt: new Date(),
    };
    return db
      .collection('contexts')
      .findOneAndUpdate(
        { id: existingDescriptor.id },
        { $set: updates },
        { returnDocument: 'after' }
      );
  }

  const descriptor = new ProjectDescriptorModel(descriptorData);
  db.collection('contexts').insertOne(normalizeMemory(descriptor));
  return db.collection('contexts').findOne({ id: descriptor.id });
}

export async function getConnectedContextData(db, contextId) {
  const context = db.collection('contexts').findOne({ id: contextId });

  if (!context) {
    return null;
  }

  const [actions, versions] = await Promise.all([
    db.collection('actions').find({ contextRefs: contextId }).toArray(),
    getContextVersions(db, contextId),
  ]);

  return { context, actions, versions };
}

export function rankSearchResults(results, query) {
  const now = new Date();
  const words = query.toLowerCase().split(' ').filter(Boolean);

  return results
    .map((item) => {
      let score = 0;
      const content = item.content?.toLowerCase() || '';
      const summary = item.summary?.toLowerCase() || '';

      const matches = words.filter(
        (word) => content.includes(word) || summary.includes(word)
      ).length;

      score += matches * 2;
      score += (item.importance || 3) * 2;

      const ageHours = (now - new Date(item.createdAt || now)) / 3600000;
      score += Math.max(0, 5 - ageHours / 24);
      score += Math.log((item.accessCount || 0) + 1);

      if (item.type === 'project') {
        score += 6;
      }

      if (item.lifecycle === MEMORY_LIFECYCLE.DEPRECATED) {
        score -= 3;
      }

      if (item.lifecycle === MEMORY_LIFECYCLE.ARCHIVED) {
        score -= 8;
      }

      return { ...item, score };
    })
    .sort((left, right) => right.score - left.score);
}

export class MemoryQueryBuilder {
  static build({ agent, project, query, scope = 'project', includeGlobal = true, lifecycle } = {}) {
    const conditions = [];

    if (agent) {
      conditions.push({ agent, scope: MEMORY_SCOPE.PRIVATE });
    }

    if (project && (scope === 'project' || scope === 'global')) {
      conditions.push({ project, scope: MEMORY_SCOPE.PROJECT });
    }

    if (includeGlobal) {
      conditions.push({ scope: MEMORY_SCOPE.GLOBAL });
    }

    const filters = [];

    if (conditions.length) {
      filters.push({ $or: conditions });
    }

    if (query?.trim()) {
      filters.push({ $text: { $search: query.trim() } });
    }

    if (lifecycle) {
      filters.push({ lifecycle });
    }

    if (!filters.length) {
      return {};
    }

    return filters.length === 1 ? filters[0] : { $and: filters };
  }
}
