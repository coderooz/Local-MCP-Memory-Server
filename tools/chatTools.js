export function createRoom(args, config) {
  return {
    name: 'create_room',
    description: 'Create a new chat room for agent collaboration.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the chat room'
        },
        scope: {
          type: 'string',
          enum: ['project', 'global'],
          description: 'Scope of the room (project or global)'
        },
        max_participants: {
          type: 'number',
          description: 'Maximum number of participants'
        },
        participants: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial participants'
        },
        metadata: {
          type: 'object',
          description: 'Additional room metadata'
        }
      },
      required: ['name']
    }
  };
}

export function joinRoom(args, config) {
  return {
    name: 'join_room',
    description: 'Join an existing chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room to join'
        },
        agent_id: {
          type: 'string',
          description: 'Agent ID joining the room'
        }
      },
      required: ['room_id']
    }
  };
}

export function sendRoomMessage(args, config) {
  return {
    name: 'send_room_message',
    description: 'Send a message to a chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room'
        },
        content: {
          type: 'string',
          description: 'Message content'
        },
        type: {
          type: 'string',
          enum: ['info', 'task', 'alert', 'handoff', 'broadcast'],
          description: 'Message type'
        },
        related_task: {
          type: 'string',
          description: 'Related task ID'
        }
      },
      required: ['room_id', 'content']
    }
  };
}

export function getRoomMessages(args, config) {
  return {
    name: 'get_room_messages',
    description: 'Get messages from a chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room'
        },
        from_agent: {
          type: 'string',
          description: 'Filter by sender'
        },
        type: {
          type: 'string',
          enum: ['info', 'task', 'alert', 'handoff', 'broadcast'],
          description: 'Filter by message type'
        },
        since: {
          type: 'string',
          description: 'Get messages since ISO timestamp'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages'
        }
      },
      required: ['room_id']
    }
  };
}

export function announceTaskTakeover(args, config) {
  return {
    name: 'announce_task_takeover',
    description: 'Announce taking over a task in a chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room'
        },
        task_id: {
          type: 'string',
          description: 'ID of the task being taken'
        }
      },
      required: ['room_id', 'task_id']
    }
  };
}

export function requestHelp(args, config) {
  return {
    name: 'request_help_in_room',
    description: 'Request help from other agents in a chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room'
        },
        help_request: {
          type: 'string',
          description: 'Description of help needed'
        }
      },
      required: ['room_id', 'help_request']
    }
  };
}

export function shareFinding(args, config) {
  return {
    name: 'share_finding',
    description: 'Share a finding with other agents in a chat room.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'ID of the room'
        },
        finding: {
          type: 'string',
          description: 'Finding to share'
        }
      },
      required: ['room_id', 'finding']
    }
  };
}

export function listRooms(args, config) {
  return {
    name: 'list_rooms',
    description: 'List available chat rooms.',
    inputSchema: {
      type: 'object',
      properties: {
        is_active: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        participant: {
          type: 'string',
          description: 'Filter by participant'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rooms'
        }
      }
    }
  };
}

export function getChatTools() {
  return [
    createRoom(),
    joinRoom(),
    sendRoomMessage(),
    getRoomMessages(),
    announceTaskTakeover(),
    requestHelp(),
    shareFinding(),
    listRooms()
  ];
}
