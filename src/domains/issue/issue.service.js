import { v4 as uuidv4 } from 'uuid';
import {
  IssueModel,
  MEMORY_SCOPE,
  normalizeMemory,
  toStringArray,
} from '../../../core/mcp/models.js';

export { IssueModel };

export async function createIssue(
  db,
  {
    title,
    description = '',
    type = 'note',
    agent = 'system',
    project = 'default',
    scope = MEMORY_SCOPE.PROJECT,
    relatedContexts = [],
    relatedTasks = [],
    relatedIssues = [],
    relatedAgents = [],
  }
) {
  const issueId = uuidv4();
  const warnings = [];

  const issue = new IssueModel({
    issue_id: issueId,
    title,
    description,
    type,
    agent,
    project,
    scope,
    relatedContexts: toStringArray(relatedContexts),
    relatedTasks: toStringArray(relatedTasks),
    relatedIssues: toStringArray(relatedIssues),
    relatedAgents: toStringArray(relatedAgents),
    status: 'open',
  });

  await db.collection('issues').insertOne(normalizeMemory(issue));

  if (relatedIssues.length) {
    for (const relId of relatedIssues) {
      const relIssue = await db.collection('issues').findOne({ issue_id: relId });
      if (!relIssue) {
        warnings.push(`Related issue not found: ${relId}`);
      } else {
        await db.collection('issues').updateOne(
          { issue_id: relId },
          {
            $addToSet: { relatedIssues: issueId },
          }
        );
      }
    }
  }

  if (relatedTasks.length) {
    for (const taskId of relatedTasks) {
      const relTask = await db.collection('tasks').findOne({ task_id: taskId });
      if (!relTask) {
        warnings.push(`Related task not found: ${taskId}`);
      }
    }
  }

  if (relatedContexts.length) {
    for (const ctxId of relatedContexts) {
      const relCtx = await db.collection('contexts').findOne({ id: ctxId });
      if (!relCtx) {
        warnings.push(`Related context not found: ${ctxId}`);
      }
    }
  }

  return {
    issue: await db.collection('issues').findOne({ issue_id: issueId }),
    warnings,
  };
}

export async function resolveIssue(
  db,
  {
    issue_id,
    resolution,
    resolvedBy = 'system',
    agent = 'system',
    expectedUpdatedAt,
    expectedVersion,
  }
) {
  const existingIssue = await db.collection('issues').findOne({ issue_id });

  if (!existingIssue) {
    return { success: false, error: 'Issue not found' };
  }

  if (existingIssue.status === 'resolved') {
    return { success: false, error: 'Issue already resolved' };
  }

  if (expectedUpdatedAt && expectedVersion) {
    const expectedDate = new Date(expectedUpdatedAt);
    const currentDate = new Date(existingIssue.updatedAt);

    if (expectedDate.getTime() !== currentDate.getTime()) {
      return {
        success: false,
        error: 'Concurrent update detected: timestamps do not match',
      };
    }

    if (Number(expectedVersion) !== Number(existingIssue.version)) {
      return {
        success: false,
        error: `Concurrent update detected: version mismatch (expected ${expectedVersion}, got ${existingIssue.version})`,
      };
    }
  }

  const now = new Date();

  await db.collection('issues').updateOne(
    { issue_id },
    {
      $set: {
        status: 'resolved',
        resolution: resolution || 'Resolved',
        resolvedBy: resolvedBy || agent,
        resolvedAt: now,
        updatedAt: now,
      },
    }
  );

  const resolvedRelatedTasks = existingIssue.relatedTasks || [];
  if (resolvedRelatedTasks.length) {
    await db.collection('tasks').updateMany(
      { task_id: { $in: resolvedRelatedTasks } },
      {
        $set: {
          updatedAt: now,
        },
      }
    );
  }

  const updatedIssue = await db.collection('issues').findOne({ issue_id });
  return { success: true, issue: updatedIssue };
}

export async function fetchIssues(
  db,
  { project, status = null, type = null, related_task = null, related_context = null, limit = 50 }
) {
  const filter = {};

  if (project) {
    filter.project = project;
  }

  if (status) {
    filter.status = status;
  }

  if (type) {
    filter.type = type;
  }

  if (related_task) {
    filter.relatedTasks = related_task;
  }

  if (related_context) {
    filter.relatedContexts = related_context;
  }

  const issues = await db
    .collection('issues')
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return issues;
}

export async function getIssueById(db, issueId) {
  return db.collection('issues').findOne({ issue_id: issueId });
}
