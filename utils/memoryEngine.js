import {
  ContextModel,
  MEMORY_LIFECYCLE,
  MemoryVersionModel,
  ProjectDescriptorModel,
  normalizeMemory,
} from '../core/mcp/models.js';

function stripMongoId(document) {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  return rest;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function buildConflictKey(context) {
  const metadataKey = normalizeText(context?.metadata?.key);
  const summary = normalizeText(context?.summary);
  return metadataKey || summary;
}

function compareContexts(left, right) {
  const importanceDelta = (right.importance || 0) - (left.importance || 0);

  if (importanceDelta !== 0) {
    return importanceDelta;
  }

  return (
    new Date(right.updatedAt || right.createdAt || 0).getTime() -
    new Date(left.updatedAt || left.createdAt || 0).getTime()
  );
}

export function buildProjectDescriptorFilter(project) {
  return {
    project,
    type: 'project',
    scope: 'project',
  };
}

export async function captureMemoryVersion(
  db,
  previousContext,
  { reason, change_type = 'update', changedBy = 'system' } = {}
) {
  if (!previousContext?.id) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentVersion = await db.collection('contexts').findOne({ id: previousContext.id });
      const newVersion = currentVersion?.version || 1;

      const version = new MemoryVersionModel({
        agent: previousContext.agent,
        project: previousContext.project,
        scope: previousContext.scope,
        context_id: previousContext.id,
        context_version: newVersion,
        change_type,
        reason: reason || 'No reason provided',
        changedBy,
        snapshot: stripMongoId(previousContext),
      });

      await db.collection('memory_versions').insertOne(normalizeMemory(version));
      return version;
    } catch (error) {
      if (error.code === 11000 && attempt < 2) {
        continue;
      }
      if (error.code !== 11000) {
        console.error('Memory version capture error:', error.message);
      }
      return null;
    }
  }
  return null;
}

export async function upsertProjectDescriptor(db, payload) {
  const descriptor = new ProjectDescriptorModel(payload);
  const filter = buildProjectDescriptorFilter(descriptor.project);
  const existing = await db.collection('contexts').findOne(filter);

  if (!existing) {
    await db.collection('contexts').insertOne(normalizeMemory(descriptor));
    return db.collection('contexts').findOne({ id: descriptor.id });
  }

  await captureMemoryVersion(db, existing, {
    reason: payload.reason || 'Project descriptor updated',
    change_type: 'project_descriptor_update',
    changedBy: payload.agent || 'system',
  });

  const nextDocument = normalizeMemory({
    ...stripMongoId(existing),
    ...stripMongoId(descriptor),
    id: existing.id,
    createdAt: existing.createdAt,
    version: (existing.version || 1) + 1,
    updateReason: payload.reason || 'Project descriptor updated',
  });

  await db.collection('contexts').updateOne({ id: existing.id }, { $set: nextDocument });

  return db.collection('contexts').findOne({ id: existing.id });
}

export async function updateContextWithVersioning(
  db,
  contextId,
  updates,
  { reason = 'Context updated', changedBy = 'system' } = {}
) {
  const existing = await db.collection('contexts').findOne({ id: contextId });

  if (!existing) {
    return null;
  }

  await captureMemoryVersion(db, existing, {
    reason,
    changedBy,
  });

  const nextDocument = normalizeMemory(
    new ContextModel({
      ...stripMongoId(existing),
      ...stripMongoId(updates),
      id: existing.id,
      createdAt: existing.createdAt,
      version: (existing.version || 1) + 1,
      updateReason: reason,
    })
  );

  await db.collection('contexts').updateOne({ id: contextId }, { $set: nextDocument });

  return db.collection('contexts').findOne({ id: contextId });
}

export async function evaluateMemoryState(
  db,
  context,
  { reason = 'Memory state evaluation', changedBy = 'system' } = {}
) {
  if (!context?.id || context.type === 'project') {
    return context;
  }

  const now = Date.now();
  const lastTouch = new Date(
    context.lastAccessedAt || context.updatedAt || context.createdAt || now
  ).getTime();
  const inactiveDays = Math.floor((now - lastTouch) / 86400000);

  let nextImportance = context.importance || 3;
  let nextLifecycle = context.lifecycle || MEMORY_LIFECYCLE.ACTIVE;
  const reasons = [];

  if ((context.accessCount || 0) >= 8 && nextImportance < 5) {
    nextImportance += 1;
    reasons.push('promoted_from_usage');
  }

  if (inactiveDays >= 45 && nextImportance > 1) {
    nextImportance -= 1;
    reasons.push('decayed_for_staleness');
  }

  if (inactiveDays >= 75 && nextLifecycle === MEMORY_LIFECYCLE.ACTIVE && nextImportance <= 2) {
    nextLifecycle = MEMORY_LIFECYCLE.DEPRECATED;
    reasons.push('deprecated_for_staleness');
  }

  if (inactiveDays >= 120 && (context.accessCount || 0) < 3 && nextImportance <= 2) {
    nextLifecycle = MEMORY_LIFECYCLE.ARCHIVED;
    reasons.push('archived_for_staleness');
  }

  if (nextImportance === context.importance && nextLifecycle === context.lifecycle) {
    return context;
  }

  await captureMemoryVersion(db, context, {
    reason: `${reason}: ${reasons.join(', ')}`,
    change_type: 'lifecycle_evaluation',
    changedBy,
  });

  await db.collection('contexts').updateOne(
    { id: context.id },
    {
      $set: {
        importance: nextImportance,
        lifecycle: nextLifecycle,
        version: (context.version || 1) + 1,
        updatedAt: new Date(),
        updateReason: `${reason}: ${reasons.join(', ')}`,
      },
    }
  );

  return db.collection('contexts').findOne({ id: context.id });
}

export async function optimizeMemories(db, { project, limit = 100 } = {}) {
  const filter = project ? { project } : {};
  const contexts = await db
    .collection('contexts')
    .find(filter)
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();

  const summary = {
    scanned: contexts.length,
    changed: 0,
    promoted: 0,
    decayed: 0,
    archived: 0,
  };

  for (const context of contexts) {
    const next = await evaluateMemoryState(db, context, {
      reason: 'Optimization engine evaluation',
      changedBy: 'system',
    });

    if (!next || next.id !== context.id) {
      continue;
    }

    if (next.importance !== context.importance || next.lifecycle !== context.lifecycle) {
      summary.changed += 1;
    }

    if ((next.importance || 0) > (context.importance || 0)) {
      summary.promoted += 1;
    }

    if ((next.importance || 0) < (context.importance || 0)) {
      summary.decayed += 1;
    }

    if (
      next.lifecycle === MEMORY_LIFECYCLE.ARCHIVED &&
      context.lifecycle !== MEMORY_LIFECYCLE.ARCHIVED
    ) {
      summary.archived += 1;
    }
  }

  return summary;
}

export async function detectAndResolveMemoryConflicts(db, context) {
  if (!context?.id) {
    return [];
  }

  const conflictKey = buildConflictKey(context);

  if (!conflictKey) {
    return [];
  }

  const candidates = await db
    .collection('contexts')
    .find({
      project: context.project,
      type: context.type,
      id: { $ne: context.id },
      lifecycle: { $ne: MEMORY_LIFECYCLE.ARCHIVED },
    })
    .limit(25)
    .toArray();

  const conflicts = candidates.filter((candidate) => {
    const candidateKey = buildConflictKey(candidate);
    const sameContent = normalizeText(candidate.content) === normalizeText(context.content);

    return Boolean(candidateKey) && candidateKey === conflictKey && !sameContent;
  });

  if (!conflicts.length) {
    return [];
  }

  for (const candidate of conflicts) {
    const ordered = [context, candidate].sort(compareContexts);
    const winner = ordered[0];
    const loser = ordered[1];

    await db.collection('contexts').updateOne(
      { id: winner.id },
      {
        $addToSet: { conflictsWith: loser.id },
        $set: { updatedAt: new Date() },
      }
    );

    const currentLoser = await db.collection('contexts').findOne({ id: loser.id });

    if (!currentLoser) {
      continue;
    }

    await captureMemoryVersion(db, currentLoser, {
      reason: `Conflict detected against ${winner.id}`,
      change_type: 'conflict_resolution',
      changedBy: context.agent || 'system',
    });

    const loserUpdate = {
      updatedAt: new Date(),
      conflictsWith: Array.from(new Set([...(currentLoser.conflictsWith || []), winner.id])),
      updateReason: `Conflict detected against ${winner.id}`,
      version: (currentLoser.version || 1) + 1,
    };

    if (currentLoser.lifecycle !== MEMORY_LIFECYCLE.ARCHIVED) {
      loserUpdate.lifecycle = MEMORY_LIFECYCLE.DEPRECATED;
    }

    await db.collection('contexts').updateOne(
      { id: loser.id },
      {
        $set: loserUpdate,
      }
    );
  }

  return conflicts.map((candidate) => candidate.id);
}

export async function getConnectedContextData(db, contextId) {
  const context = await db.collection('contexts').findOne({ id: contextId });

  if (!context) {
    return null;
  }

  const relatedContextIds = Array.from(
    new Set([...(context.relatedContexts || []), ...(context.conflictsWith || [])])
  );

  const [actions, relatedContexts, relatedTasks, relatedIssues, versions, descriptor] =
    await Promise.all([
      db.collection('actions').find({ contextRefs: context.id }).toArray(),
      relatedContextIds.length
        ? db
            .collection('contexts')
            .find({ id: { $in: relatedContextIds } })
            .toArray()
        : [],
      (context.relatedTasks || []).length
        ? db
            .collection('tasks')
            .find({ task_id: { $in: context.relatedTasks } })
            .toArray()
        : [],
      (context.relatedIssues || []).length
        ? db
            .collection('issues')
            .find({ issue_id: { $in: context.relatedIssues } })
            .toArray()
        : [],
      db
        .collection('memory_versions')
        .find({ context_id: context.id })
        .sort({ changedAt: -1 })
        .limit(20)
        .toArray(),
      db.collection('contexts').findOne(buildProjectDescriptorFilter(context.project)),
    ]);

  const relatedAgentIds = Array.from(
    new Set(
      [
        context.agent,
        ...(context.relatedAgents || []),
        ...relatedTasks.flatMap((task) => [
          task.assigned_to,
          task.created_by,
          ...(task.relatedAgents || []),
        ]),
        ...relatedIssues.flatMap((issue) => [
          issue.agent,
          issue.resolvedBy,
          ...(issue.relatedAgents || []),
        ]),
      ].filter(Boolean)
    )
  );
  const relatedAgents = relatedAgentIds.length
    ? await db
        .collection('agents')
        .find({
          $or: [{ agent_id: { $in: relatedAgentIds } }, { agent: { $in: relatedAgentIds } }],
        })
        .toArray()
    : [];

  return {
    context,
    descriptor,
    actions,
    relatedContexts,
    relatedTasks,
    relatedIssues,
    relatedAgents,
    versions,
  };
}
