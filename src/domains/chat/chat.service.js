import { v4 as uuidv4 } from 'uuid';
import {
  ChatRoomModel,
  ChatMessageModel,
  CHAT_ROOM_SCOPE,
  CHAT_MESSAGE_TYPE,
  normalizeMemory,
} from '../../../core/mcp/models.js';

export { ChatRoomModel, ChatMessageModel, CHAT_ROOM_SCOPE, CHAT_MESSAGE_TYPE };

export function createRoom(db, roomData) {
  const roomId = roomData.room_id || uuidv4();

  const room = new ChatRoomModel({
    ...roomData,
    room_id: roomId,
    project: roomData.project || 'default',
    is_active: true,
    metadata: roomData.metadata || {},
  });

  return db.collection('chat_rooms').insertOne(normalizeMemory(room));
}

export function getRoomById(db, roomId) {
  return db.collection('chat_rooms').findOne({ room_id: roomId });
}

export function listRooms(db, options = {}) {
  const filter = {};

  if (options.project) {
    filter.project = options.project;
    filter.scope = CHAT_ROOM_SCOPE.PROJECT;
  } else if (options.scope) {
    filter.scope = options.scope;
  }

  if (options.is_active !== undefined) {
    filter.is_active = Boolean(options.is_active);
  }

  if (options.participant) {
    filter.participants = options.participant;
  }

  return db
    .collection('chat_rooms')
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(options.limit || 50)
    .toArray();
}

export function updateRoom(db, roomId, updates) {
  const updateOps = { updatedAt: new Date() };
  const allowedFields = ['name', 'is_active', 'max_participants', 'metadata'];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateOps[field] = updates[field];
    }
  }

  const mongoUpdate = { $set: updateOps };

  if (updates.add_participants) {
    mongoUpdate.$addToSet = { participants: { $each: updates.add_participants } };
  }

  if (updates.remove_participants) {
    mongoUpdate.$pull = { participants: { $in: updates.remove_participants } };
  }

  return db
    .collection('chat_rooms')
    .findOneAndUpdate({ room_id: roomId }, mongoUpdate, { returnDocument: 'after' });
}

export function joinRoom(db, roomId, agentId) {
  const room = db.collection('chat_rooms').findOne({ room_id: roomId });

  if (!room) {
    throw new Error('Room not found');
  }

  if (!room.is_active) {
    throw new Error('Room is not active');
  }

  const participants = room.participants || [];
  if (!participants.includes(agentId) && participants.length < room.max_participants) {
    db.collection('chat_rooms').updateOne(
      { room_id: roomId },
      {
        $addToSet: { participants: agentId },
        $set: { updatedAt: new Date() },
      }
    );
  }

  return db.collection('chat_rooms').findOne({ room_id: roomId });
}

export function leaveRoom(db, roomId, agentId) {
  return db.collection('chat_rooms').findOneAndUpdate(
    { room_id: roomId },
    {
      $pull: { participants: agentId, admins: agentId },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}

export async function sendMessage(db, messageData) {
  const messageId = messageData.message_id || uuidv4();
  const roomId = messageData.room_id;
  const idempotencyKey = messageData.idempotencyKey;

  if (idempotencyKey) {
    const existing = await db.collection('chat_messages').findOne({ idempotencyKey });
    if (existing) {
      return { message: existing, idempotent: true };
    }
  }

  const result = await db.collection('chat_rooms').findOneAndUpdate(
    { room_id: roomId },
    {
      $inc: { sequence: 1 },
      $set: { updatedAt: new Date() }
    },
    { returnDocument: 'before' }
  );

  const sequence = result?.sequence || 0;

  const message = new ChatMessageModel({
    ...messageData,
    message_id: messageId,
    from_agent: messageData.from_agent || 'system',
    metadata: {
      ...(messageData.metadata || {}),
      sequence,
      idempotencyKey
    },
  });

  try {
    const inserted = await db.collection('chat_messages').insertOne(normalizeMemory(message));
    return { message: inserted, sequence };
  } catch (error) {
    if (error.code === 11000 && idempotencyKey) {
      const existing = await db.collection('chat_messages').findOne({ idempotencyKey });
      if (existing) {
        return { message: existing, idempotent: true };
      }
    }
    throw error;
  }
}

export function getMessages(db, options = {}) {
  const filter = {};

  if (options.room_id) {
    filter.room_id = options.room_id;
  }

  if (options.from_agent) {
    filter.from_agent = options.from_agent;
  }

  if (options.type) {
    filter.type = options.type;
  }

  if (options.related_task) {
    filter.related_task = options.related_task;
  }

  if (options.since) {
    filter.createdAt = { $gte: new Date(options.since) };
  }

  return db
    .collection('chat_messages')
    .find(filter)
    .sort({
      createdAt: options.order === 'asc' ? 1 : -1,
      'metadata.sequence': options.order === 'asc' ? 1 : -1
    })
    .limit(options.limit || 100)
    .toArray();
}

export function getRecentMessages(db, roomId, limit = 50) {
  return db
    .collection('chat_messages')
    .find({ room_id: roomId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export function broadcastToRoom(
  db,
  roomId,
  broadcasterAgent,
  content,
  messageType = CHAT_MESSAGE_TYPE.BROADCAST
) {
  return sendMessage(db, {
    room_id: roomId,
    from_agent: broadcasterAgent,
    content,
    type: messageType,
    metadata: { broadcast: true },
  });
}

export function announceTaskTakeover(db, roomId, agentId, taskId) {
  return sendMessage(db, {
    room_id: roomId,
    from_agent: agentId,
    content: `Taking over task: ${taskId}`,
    type: CHAT_MESSAGE_TYPE.TASK,
    related_task: taskId,
    metadata: { action: 'task_takeover' },
  });
}

export function requestHelpInRoom(db, roomId, agentId, helpRequest) {
  return sendMessage(db, {
    room_id: roomId,
    from_agent: agentId,
    content: `Requesting help: ${helpRequest}`,
    type: CHAT_MESSAGE_TYPE.ALERT,
    metadata: { action: 'help_request' },
  });
}

export function shareFindingInRoom(db, roomId, agentId, finding) {
  return sendMessage(db, {
    room_id: roomId,
    from_agent: agentId,
    content: `Finding: ${finding}`,
    type: CHAT_MESSAGE_TYPE.INFO,
    metadata: { action: 'finding_shared' },
  });
}

export function getOrCreateDefaultRoom(db, project) {
  const existingRoom = db.collection('chat_rooms').findOne({
    project,
    scope: CHAT_ROOM_SCOPE.PROJECT,
    name: { $regex: /default|main|general/i },
  });

  if (existingRoom) {
    return existingRoom;
  }

  const result = createRoom(db, {
    name: `${project}-default`,
    scope: CHAT_ROOM_SCOPE.PROJECT,
    project,
    created_by: 'system',
  });

  return getRoomById(db, result.insertedId);
}

export function deleteRoom(db, roomId) {
  return db.collection('chat_rooms').deleteOne({ room_id: roomId });
}

export function editMessage(db, messageId, newContent, editorAgent) {
  return db.collection('chat_messages').findOneAndUpdate(
    { message_id: messageId },
    {
      $set: { content: newContent, is_edited: true, edited_at: new Date() },
    },
    { returnDocument: 'after' }
  );
}

export function deleteMessage(db, messageId) {
  return db.collection('chat_messages').deleteOne({ message_id: messageId });
}

export function pinMessage(db, messageId, pinned = true) {
  return db
    .collection('chat_messages')
    .findOneAndUpdate(
      { message_id: messageId },
      { $set: { is_pinned: pinned } },
      { returnDocument: 'after' }
    );
}

export function getPinnedMessages(db, roomId) {
  return db.collection('chat_messages').find({ room_id: roomId, is_pinned: true }).toArray();
}

export function getRoomParticipants(db, roomId) {
  const room = db.collection('chat_rooms').findOne({ room_id: roomId });
  return room ? room.participants : [];
}

export function getConversation(db, roomId, options = {}) {
  const { before, after, limit = 50 } = options;
  const filter = { room_id: roomId };

  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }
  if (after) {
    filter.createdAt = { $gt: new Date(after) };
  }

  return db.collection('chat_messages').find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}
