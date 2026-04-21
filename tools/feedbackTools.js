export function createFeedback(args, config) {
  return {
    name: 'create_feedback',
    description:
      'Create feedback such as issues, improvements, or general feedback for the project.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['issue', 'improvement', 'feedback'],
          description: 'Type of feedback'
        },
        title: {
          type: 'string',
          description: 'Title of the feedback'
        },
        description: {
          type: 'string',
          description: 'Detailed description of the feedback'
        },
        severity: {
          type: 'number',
          description: 'Severity level (1-5, where 1 is most severe)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to categorize the feedback'
        },
        relatedContexts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Related context IDs'
        },
        relatedTasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Related task IDs'
        },
        metadata: {
          type: 'object',
          description: 'Additional structured metadata'
        }
      },
      required: ['title', 'type']
    }
  };
}

export function listFeedback(args, config) {
  return {
    name: 'list_feedback',
    description: 'List feedback entries with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['issue', 'improvement', 'feedback'],
          description: 'Filter by feedback type'
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'resolved'],
          description: 'Filter by status'
        },
        severity: {
          type: 'number',
          description: 'Filter by maximum severity (1-5)'
        },
        created_by: {
          type: 'string',
          description: 'Filter by creator'
        },
        related_task: {
          type: 'string',
          description: 'Filter by related task'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results'
        }
      }
    }
  };
}

export function promoteFeedback(args, config) {
  return {
    name: 'promote_feedback',
    description: 'Vote for or promote a feedback entry to increase its visibility.',
    inputSchema: {
      type: 'object',
      properties: {
        feedback_id: {
          type: 'string',
          description: 'ID of the feedback to promote'
        }
      },
      required: ['feedback_id']
    }
  };
}

export function resolveFeedback(args, config) {
  return {
    name: 'resolve_feedback',
    description: 'Mark a feedback entry as resolved.',
    inputSchema: {
      type: 'object',
      properties: {
        feedback_id: {
          type: 'string',
          description: 'ID of the feedback to resolve'
        },
        resolution: {
          type: 'string',
          description: 'Resolution description'
        }
      },
      required: ['feedback_id']
    }
  };
}

export function updateFeedbackSeverity(args, config) {
  return {
    name: 'update_feedback_severity',
    description: 'Update the severity level of a feedback entry.',
    inputSchema: {
      type: 'object',
      properties: {
        feedback_id: {
          type: 'string',
          description: 'ID of the feedback'
        },
        severity: {
          type: 'number',
          description: 'New severity level (1-5, where 1 is most severe)'
        }
      },
      required: ['feedback_id', 'severity']
    }
  };
}

export function getFeedbackTools() {
  return [
    createFeedback(),
    listFeedback(),
    promoteFeedback(),
    resolveFeedback(),
    updateFeedbackSeverity()
  ];
}
