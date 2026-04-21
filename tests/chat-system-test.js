import {
  CHAT_ROOM_SCOPE,
  CHAT_MESSAGE_TYPE,
  ChatRoomModel,
  ChatMessageModel
} from '../core/mcp/models.js';

function runTests() {
  console.log('=== Chat Room System Tests ===\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      failed++;
    }
  }

  test('ChatRoomModel should be instantiated with defaults', () => {
    const room = new ChatRoomModel({});
    if (!room.room_id) {
      throw new Error('room_id not generated');
    }
    if (room.scope !== CHAT_ROOM_SCOPE.PROJECT) {
      throw new Error('Default scope incorrect');
    }
    if (room.is_active !== true) {
      throw new Error('Default active status incorrect');
    }
  });

  test('ChatRoomModel should accept scope options', () => {
    const projectRoom = new ChatRoomModel({ scope: CHAT_ROOM_SCOPE.PROJECT });
    if (projectRoom.scope !== CHAT_ROOM_SCOPE.PROJECT) {
      throw new Error('Project scope not set');
    }

    const globalRoom = new ChatRoomModel({ scope: CHAT_ROOM_SCOPE.GLOBAL });
    if (globalRoom.scope !== CHAT_ROOM_SCOPE.GLOBAL) {
      throw new Error('Global scope not set');
    }
  });

  test('ChatRoomModel should add creator as participant and admin', () => {
    const room = new ChatRoomModel({
      name: 'Test Room',
      created_by: 'agent1'
    });
    if (!room.participants.includes('agent1')) {
      throw new Error('Creator not added as participant');
    }
    if (!room.admins.includes('agent1')) {
      throw new Error('Creator not added as admin');
    }
  });

  test('ChatRoomModel should limit max participants', () => {
    const room = new ChatRoomModel({ max_participants: 200 });
    if (room.max_participants !== 100) {
      throw new Error('Max participants should clamp to 100');
    }

    const smallRoom = new ChatRoomModel({ max_participants: 1 });
    if (smallRoom.max_participants !== 2) {
      throw new Error('Max participants should clamp to minimum 2');
    }
  });

  test('ChatMessageModel should be instantiated with defaults', () => {
    const message = new ChatMessageModel({});
    if (!message.message_id) {
      throw new Error('message_id not generated');
    }
    if (message.type !== CHAT_MESSAGE_TYPE.INFO) {
      throw new Error('Default message type incorrect');
    }
  });

  test('ChatMessageModel should accept all message types', () => {
    const taskMsg = new ChatMessageModel({ type: CHAT_MESSAGE_TYPE.TASK });
    if (taskMsg.type !== CHAT_MESSAGE_TYPE.TASK) {
      throw new Error('Task type not set');
    }

    const alertMsg = new ChatMessageModel({ type: CHAT_MESSAGE_TYPE.ALERT });
    if (alertMsg.type !== CHAT_MESSAGE_TYPE.ALERT) {
      throw new Error('Alert type not set');
    }

    const handoffMsg = new ChatMessageModel({ type: CHAT_MESSAGE_TYPE.HANDOFF });
    if (handoffMsg.type !== CHAT_MESSAGE_TYPE.HANDOFF) {
      throw new Error('Handoff type not set');
    }

    const broadcastMsg = new ChatMessageModel({ type: CHAT_MESSAGE_TYPE.BROADCAST });
    if (broadcastMsg.type !== CHAT_MESSAGE_TYPE.BROADCAST) {
      throw new Error('Broadcast type not set');
    }
  });

  test('ChatMessageModel should track editing', () => {
    const message = new ChatMessageModel({
      is_edited: true,
      edited_at: new Date()
    });
    if (message.is_edited !== true) {
      throw new Error('Edited flag not set');
    }
    if (!message.edited_at) {
      throw new Error('Edited at not set');
    }
  });

  test('ChatMessageModel should support pinning', () => {
    const message = new ChatMessageModel({ is_pinned: true });
    if (message.is_pinned !== true) {
      throw new Error('Pinned flag not set');
    }
  });

  test('ChatMessageModel should link to tasks and contexts', () => {
    const message = new ChatMessageModel({
      related_task: 'task123',
      related_context: 'ctx456'
    });
    if (message.related_task !== 'task123') {
      throw new Error('Related task not set');
    }
    if (message.related_context !== 'ctx456') {
      throw new Error('Related context not set');
    }
  });

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  return { passed, failed };
}

export { runTests as testChatSystem };

runTests();
