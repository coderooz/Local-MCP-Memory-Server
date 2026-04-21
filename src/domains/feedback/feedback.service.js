import { v4 as uuidv4 } from 'uuid';
import {
  FeedbackModel,
  FEEDBACK_TYPE,
  FEEDBACK_STATUS,
  FEEDBACK_SEVERITY,
  normalizeMemory,
} from '../../../core/mcp/models.js';

export { FeedbackModel, FEEDBACK_TYPE, FEEDBACK_STATUS, FEEDBACK_SEVERITY };

export function createFeedback(db, feedbackData) {
  const feedback = new FeedbackModel({
    ...feedbackData,
    feedback_id: feedbackData.feedback_id || uuidv4(),
    created_by: feedbackData.created_by || 'system',
    severity: feedbackData.severity || FEEDBACK_SEVERITY.MEDIUM,
    votes: feedbackData.votes || 0,
    voters: feedbackData.voters || [],
    status: feedbackData.status || FEEDBACK_STATUS.OPEN,
    type: feedbackData.type || FEEDBACK_TYPE.FEEDBACK,
    related_contexts: feedbackData.related_contexts || [],
    related_tasks: feedbackData.related_tasks || [],
    related_issues: feedbackData.related_issues || [],
    tags: feedbackData.tags || [],
    metadata: feedbackData.metadata || {},
  });

  return db.collection('feedbacks').insertOne(normalizeMemory(feedback));
}

export function getFeedbackById(db, feedbackId) {
  return db.collection('feedbacks').findOne({ feedback_id: feedbackId });
}

export function listFeedbacks(db, options = {}) {
  const filter = {};

  if (options.project) {
    filter.project = options.project;
  }

  if (options.type) {
    filter.type = options.type;
  }

  if (options.status) {
    filter.status = options.status;
  }

  if (options.severity) {
    filter.severity = { $lte: options.severity };
  }

  if (options.created_by) {
    filter.created_by = options.created_by;
  }

  if (options.related_task) {
    filter.related_tasks = options.related_task;
  }

  if (options.related_context) {
    filter.related_contexts = options.related_context;
  }

  if (options.query) {
    filter.$text = { $search: options.query };
  }

  return db
    .collection('feedbacks')
    .find(filter)
    .sort({ severity: 1, votes: -1, createdAt: -1 })
    .limit(options.limit || 50)
    .toArray();
}

export function updateFeedback(db, feedbackId, updates) {
  const updateOps = { updatedAt: new Date() };
  const allowedFields = [
    'title',
    'description',
    'severity',
    'status',
    'related_contexts',
    'related_tasks',
    'related_issues',
    'tags',
    'metadata',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateOps[field] = updates[field];
    }
  }

  if (updates.resolution !== undefined) updateOps.resolution = updates.resolution;
  if (updates.resolved_by !== undefined) updateOps.resolved_by = updates.resolved_by;
  if (updates.resolved_at !== undefined) updateOps.resolved_at = updates.resolved_at;

  return db
    .collection('feedbacks')
    .findOneAndUpdate(
      { feedback_id: feedbackId },
      { $set: updateOps },
      { returnDocument: 'after' }
    );
}

export function voteFeedback(db, feedbackId, voterId) {
  const feedback = db.collection('feedbacks').findOne({ feedback_id: feedbackId });

  if (!feedback) {
    throw new Error('Feedback not found');
  }

  const voters = feedback.voters || [];
  const hasVoted = voters.includes(voterId);

  if (hasVoted) {
    return db.collection('feedbacks').findOneAndUpdate(
      { feedback_id: feedbackId },
      {
        $inc: { votes: -1 },
        $pull: { voters: voterId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );
  }

  return db.collection('feedbacks').findOneAndUpdate(
    { feedback_id: feedbackId },
    {
      $inc: { votes: 1 },
      $addToSet: { voters: voterId },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}

export function resolveFeedback(db, feedbackId, resolvedBy, resolution = null) {
  return db.collection('feedbacks').findOneAndUpdate(
    { feedback_id: feedbackId },
    {
      $set: {
        status: FEEDBACK_STATUS.RESOLVED,
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        resolution: resolution || 'Resolved',
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
}

export function updateFeedbackSeverity(db, feedbackId, newSeverity) {
  const severity = Math.min(5, Math.max(1, parseInt(newSeverity, 10) || 3));

  return db.collection('feedbacks').findOneAndUpdate(
    { feedback_id: feedbackId },
    {
      $set: {
        severity,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
}

export async function createFeedbackFromTestFailure(db, testData) {
  const feedback = {
    type: FEEDBACK_TYPE.ISSUE,
    title: `Test Failure: ${testData.testName || 'Unknown Test'}`,
    description: [
      `Test: ${testData.testName || 'Unknown'}`,
      `Suite: ${testData.testSuite || 'Unknown'}`,
      `Error: ${testData.error || 'No error message'}`,
      `Device: ${testData.device || 'Unknown'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    severity: FEEDBACK_SEVERITY.HIGH,
    related_contexts: testData.relatedContexts || [],
    related_tasks: testData.relatedTasks || [],
    tags: ['test-failure', 'automated', testData.testSuite || 'unknown'],
    metadata: {
      testFailure: true,
      testName: testData.testName,
      testSuite: testData.testSuite,
      device: testData.device,
    },
  };

  const result = await createFeedback(db, {
    ...feedback,
    project: testData.project || 'default',
    agent: testData.agent || 'system',
    created_by: testData.agent || 'system',
  });

  return result;
}

export async function createImprovementFromPattern(db, patternData) {
  const feedback = {
    type: FEEDBACK_TYPE.IMPROVEMENT,
    title: `Improvement: ${patternData.pattern || 'Repeated Pattern Detected'}`,
    description: [
      `Pattern: ${patternData.pattern || 'Unknown pattern'}`,
      `Occurrences: ${patternData.count || 1}`,
      `Suggestion: ${patternData.suggestion || 'Consider refactoring'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    severity: FEEDBACK_SEVERITY.MEDIUM,
    tags: ['improvement', 'automated', 'pattern-detected'],
    metadata: {
      improvement: true,
      pattern: patternData.pattern,
      locations: patternData.locations,
    },
  };

  const result = await createFeedback(db, {
    ...feedback,
    project: patternData.project || 'default',
    agent: patternData.agent || 'system',
    created_by: patternData.agent || 'system',
  });

  return result;
}

export function linkFeedbackToContext(db, feedbackId, contextId) {
  return db.collection('feedbacks').findOneAndUpdate(
    { feedback_id: feedbackId },
    {
      $addToSet: { related_contexts: contextId },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}

export function linkFeedbackToTask(db, feedbackId, taskId) {
  return db.collection('feedbacks').findOneAndUpdate(
    { feedback_id: feedbackId },
    {
      $addToSet: { related_tasks: taskId },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}
