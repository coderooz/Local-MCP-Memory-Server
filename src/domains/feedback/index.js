export const FEEDBACK_TYPE = {
  ISSUE: 'issue',
  IMPROVEMENT: 'improvement',
  FEEDBACK: 'feedback'
};

export const FEEDBACK_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved'
};

export const FEEDBACK_SEVERITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  TRIVIAL: 5
};

export * from './feedback.service.js';
