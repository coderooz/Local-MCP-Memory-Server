export function getMemoryTools() {
  return [
    {
      name: 'store_context',
      description: 'Store persistent memory such as architecture decisions, rules, or notes.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to store' },
          type: { type: 'string', description: 'Optional memory type' },
          summary: { type: 'string', description: 'Short summary' },
          importance: { type: 'number', description: 'Importance score 1-5' },
          tags: { type: 'array', items: { type: 'string' } },
          metadata: { type: 'object' },
          relatedContexts: { type: 'array', items: { type: 'string' } },
          relatedTasks: { type: 'array', items: { type: 'string' } },
          relatedIssues: { type: 'array', items: { type: 'string' } }
        },
        required: ['content']
      }
    },
    {
      name: 'search_context',
      description: 'Search stored memory using a query string.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
          lifecycle: { type: 'string' }
        },
        required: ['query']
      }
    },
    {
      name: 'update_context',
      description: 'Update a memory entry with version tracking.',
      inputSchema: {
        type: 'object',
        properties: {
          context_id: { type: 'string' },
          reason: { type: 'string' },
          updates: { type: 'object' }
        },
        required: ['context_id', 'updates']
      }
    },
    {
      name: 'get_full_context',
      description: 'Retrieve a context with all related actions.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    },
    {
      name: 'get_connected_context',
      description: 'Retrieve context with memory, tasks, issues, actions, versions.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  ];
}

export function getAgentTools() {
  return [
    {
      name: 'list_agents',
      description: 'List all registered agents',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'register_agent',
      description: 'Register a new agent in the system',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
          agent_id: { type: 'string' }
        },
        required: ['name']
      }
    },
    {
      name: 'heartbeat_agent',
      description: 'Send an agent heartbeat',
      inputSchema: {
        type: 'object',
        properties: {
          current_task: { type: 'string' },
          status: { type: 'string' }
        }
      }
    }
  ];
}

export function getTaskTools() {
  return [
    {
      name: 'create_task',
      description: 'Create a task for agent coordination',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assigned_to: { type: 'string' },
          priority: { type: 'number' },
          dependencies: { type: 'array', items: { type: 'string' } },
          status: { type: 'string' },
          required_capabilities: { type: 'array', items: { type: 'string' } }
        },
        required: ['title']
      }
    },
    {
      name: 'assign_task',
      description: 'Assign or claim a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          agent_id: { type: 'string' }
        },
        required: ['task_id']
      }
    },
    {
      name: 'update_task',
      description: 'Update task status, ownership, or completion',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'number' },
          result: { type: 'string' },
          blocker: { type: 'string' }
        },
        required: ['task_id']
      }
    },
    {
      name: 'fetch_tasks',
      description: 'Fetch project-scoped tasks',
      inputSchema: {
        type: 'object',
        properties: {
          assigned_only: { type: 'boolean' },
          assigned_to: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  ];
}

export function getIssueTools() {
  return [
    {
      name: 'create_issue',
      description: 'Create a project issue or note',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string' }
        },
        required: ['title', 'type']
      }
    },
    {
      name: 'resolve_issue',
      description: 'Mark an issue as resolved',
      inputSchema: {
        type: 'object',
        properties: {
          issue_id: { type: 'string' },
          resolution: { type: 'string' }
        },
        required: ['issue_id']
      }
    },
    {
      name: 'fetch_issues',
      description: 'Fetch issues for the project',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  ];
}

export function getActivityTools() {
  return [
    {
      name: 'record_activity',
      description: 'Append a live activity entry',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          message: { type: 'string' },
          related_task: { type: 'string' },
          resource: { type: 'string' },
          metadata: { type: 'object' }
        },
        required: ['message']
      }
    },
    {
      name: 'fetch_activity',
      description: 'Fetch the live project activity stream',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'acquire_resource_lock',
      description: 'Acquire a soft lock for a resource',
      inputSchema: {
        type: 'object',
        properties: {
          resource: { type: 'string' },
          expiresInMs: { type: 'number' }
        },
        required: ['resource']
      }
    },
    {
      name: 'release_resource_lock',
      description: 'Release a soft lock',
      inputSchema: {
        type: 'object',
        properties: { resource: { type: 'string' } },
        required: ['resource']
      }
    },
    {
      name: 'fetch_resource_locks',
      description: 'Fetch active soft locks',
      inputSchema: {
        type: 'object',
        properties: { resource: { type: 'string' } }
      }
    }
  ];
}

export function getProjectTools() {
  return [
    {
      name: 'set_project_descriptor',
      description: 'Store or update project descriptor',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          tech_stack: { type: 'array', items: { type: 'string' } },
          goals: { type: 'array', items: { type: 'string' } },
          constraints: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'category', 'description']
      }
    },
    {
      name: 'get_project_descriptor',
      description: 'Fetch current project descriptor',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'create_project_map',
      description: 'Store project-map entry',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          type: { type: 'string' },
          summary: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } }
        },
        required: ['file_path', 'type', 'summary']
      }
    },
    {
      name: 'fetch_project_map',
      description: 'Fetch project-map entries',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  ];
}

export function getFeedbackTools() {
  return [
    {
      name: 'create_feedback',
      description: 'Create issue, improvement, or feedback',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['issue', 'improvement', 'feedback'] },
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'type']
      }
    },
    {
      name: 'list_feedback',
      description: 'List feedback entries',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'promote_feedback',
      description: 'Vote for feedback',
      inputSchema: {
        type: 'object',
        properties: { feedback_id: { type: 'string' } },
        required: ['feedback_id']
      }
    },
    {
      name: 'resolve_feedback',
      description: 'Mark feedback as resolved',
      inputSchema: {
        type: 'object',
        properties: {
          feedback_id: { type: 'string' },
          resolution: { type: 'string' }
        },
        required: ['feedback_id']
      }
    }
  ];
}

export function getChatTools() {
  return [
    {
      name: 'create_room',
      description: 'Create a chat room',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          scope: { type: 'string', enum: ['project', 'global'] }
        },
        required: ['name']
      }
    },
    {
      name: 'join_room',
      description: 'Join a chat room',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' } },
        required: ['room_id']
      }
    },
    {
      name: 'send_room_message',
      description: 'Send message to chat room',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string' }
        },
        required: ['room_id', 'content']
      }
    },
    {
      name: 'get_room_messages',
      description: 'Get messages from chat room',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['room_id']
      }
    },
    {
      name: 'list_rooms',
      description: 'List available chat rooms',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' } }
      }
    },
    {
      name: 'announce_task_takeover',
      description: 'Announce task takeover',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          task_id: { type: 'string' }
        },
        required: ['room_id', 'task_id']
      }
    },
    {
      name: 'request_help_in_room',
      description: 'Request help from agents',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          help_request: { type: 'string' }
        },
        required: ['room_id', 'help_request']
      }
    },
    {
      name: 'share_finding',
      description: 'Share finding with agents',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          finding: { type: 'string' }
        },
        required: ['room_id', 'finding']
      }
    }
  ];
}

export function getEmulatorTools() {
  return [
    {
      name: 'emulator_scan',
      description: 'Scan for available emulators',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'emulator_select',
      description: 'Select an emulator',
      inputSchema: {
        type: 'object',
        properties: {
          emulator_id: { type: 'string' },
          requirements: { type: 'object' }
        }
      }
    },
    {
      name: 'emulator_install',
      description: 'Install app on emulator',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          apk_path: { type: 'string' },
          package_name: { type: 'string' }
        },
        required: ['session_id', 'apk_path']
      }
    },
    {
      name: 'emulator_run_test',
      description: 'Run tests on emulator',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          test_package: { type: 'string' },
          test_class: { type: 'string' }
        },
        required: ['session_id', 'test_package', 'test_class']
      }
    },
    {
      name: 'emulator_capture_logs',
      description: 'Capture emulator logs',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          filter: { type: 'string' }
        },
        required: ['session_id']
      }
    },
    {
      name: 'emulator_screenshot',
      description: 'Take emulator screenshot',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          path: { type: 'string' }
        },
        required: ['session_id']
      }
    },
    {
      name: 'emulator_input',
      description: 'Simulate input on emulator',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          action: { type: 'string' },
          params: { type: 'object' }
        },
        required: ['session_id', 'action']
      }
    }
  ];
}

export function getSystemTools() {
  return [
    {
      name: 'send_message',
      description: 'Send message between agents',
      inputSchema: {
        type: 'object',
        properties: {
          to_agent: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string' }
        },
        required: ['content']
      }
    },
    {
      name: 'request_messages',
      description: 'Fetch messages for current agent',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' } }
      }
    },
    {
      name: 'log_action',
      description: 'Log an action for traceability',
      inputSchema: {
        type: 'object',
        properties: {
          actionType: { type: 'string' },
          target: { type: 'string' },
          summary: { type: 'string' }
        },
        required: ['actionType', 'target', 'summary']
      }
    },
    {
      name: 'get_logs',
      description: 'Retrieve system logs',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'fetch_metrics',
      description: 'Fetch metrics',
      inputSchema: {
        type: 'object',
        properties: {
          metric_type: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'get_agent_instructions',
      description: 'Retrieve agent instructions',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'start_session',
      description: 'Start a working session',
      inputSchema: {
        type: 'object',
        properties: { status: { type: 'string' } },
        required: ['status']
      }
    },
    {
      name: 'optimize_memory',
      description: 'Run memory optimization',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' } }
      }
    }
  ];
}

export function getAllTools() {
  return [
    ...getMemoryTools(),
    ...getAgentTools(),
    ...getTaskTools(),
    ...getIssueTools(),
    ...getActivityTools(),
    ...getProjectTools(),
    ...getFeedbackTools(),
    ...getChatTools(),
    ...getEmulatorTools(),
    ...getSystemTools()
  ];
}
