import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  SessionManager,
  MCPSession,
  getSessionManager,
  resetSessionManager,
  generateSessionId,
  generateClientId,
  SESSION_STATUS,
  SESSION_EVENTS,
  ConnectionManager,
  ClientConnection,
  getConnectionManager,
  resetConnectionManager,
  CONNECTION_STATE,
  CONNECTION_EVENTS,
  SessionScope,
  SessionTracker,
  getSessionTracker,
  resetSessionTracker,
  filterBySession,
  validateSessionIsolation,
  SessionDebugger,
  ConnectionDropDetector,
  SessionIsolationValidator,
  SessionErrorLogger,
  DEBUG_LEVEL,
  PortManager,
  PORT_STRATEGY,
  getPortManager,
  resetPortManager
} from '../src/core/session/index.js';

describe('Session Management', () => {
  beforeEach(() => {
    resetSessionManager();
    resetConnectionManager();
    resetSessionTracker();
  });

  afterEach(() => {
    resetSessionManager();
    resetConnectionManager();
  });

  describe('MCPSession', () => {
    it('should create a session with unique ID', () => {
      const session = new MCPSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      assert.ok(session.sessionId);
      assert.ok(session.clientId);
      assert.strictEqual(session.agent, 'test-agent');
      assert.strictEqual(session.project, 'test-project');
      assert.strictEqual(session.status, SESSION_STATUS.ACTIVE);
      assert.ok(session.isActive);
    });

    it('should update heartbeat and track activity', () => {
      const session = new MCPSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      const originalHeartbeat = session.lastHeartbeat;
      session.updateHeartbeat();

      assert.ok(session.lastHeartbeat >= originalHeartbeat);
    });

    it('should set idle state after extended inactivity', () => {
      const session = new MCPSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      session.setIdle();
      assert.strictEqual(session.status, SESSION_STATUS.IDLE);
    });

    it('should track context and action IDs', () => {
      const session = new MCPSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      session.addContext('context-1');
      session.addAction('action-1');
      session.addTask('task-1');

      assert.ok(session.contextIds.has('context-1'));
      assert.ok(session.actionIds.has('action-1'));
      assert.ok(session.taskIds.has('task-1'));
    });

    it('should serialize to JSON correctly', () => {
      const session = new MCPSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      const json = session.toJSON();

      assert.strictEqual(json.agent, 'test-agent');
      assert.strictEqual(json.project, 'test-project');
      assert.strictEqual(json.status, SESSION_STATUS.ACTIVE);
      assert.ok(json.sessionId);
    });
  });

  describe('SessionManager', () => {
    it('should create and track sessions', () => {
      const manager = getSessionManager();

      const session = manager.createSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      assert.ok(manager.getSession(session.sessionId));
      assert.strictEqual(manager.getAllSessions().length, 1);
    });

    it('should find sessions by project', () => {
      const manager = getSessionManager();

      manager.createSession({ agent: 'agent-1', project: 'project-1' });
      manager.createSession({ agent: 'agent-2', project: 'project-1' });
      manager.createSession({ agent: 'agent-3', project: 'project-2' });

      const project1Sessions = manager.getSessionsByProject('project-1');
      assert.strictEqual(project1Sessions.length, 2);
    });

    it('should track session heartbeats', () => {
      const manager = getSessionManager();

      const session = manager.createSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      const success = manager.heartbeat(session.sessionId);
      assert.ok(success);
    });

    it('should disconnect sessions properly', () => {
      const manager = getSessionManager();

      const session = manager.createSession({
        agent: 'test-agent',
        project: 'test-project'
      });

      manager.disconnectSession(session.sessionId, 'test_disconnect');

      const retrieved = manager.getSession(session.sessionId);
      assert.strictEqual(retrieved.status, SESSION_STATUS.DISCONNECTED);
    });

    it('should provide session statistics', () => {
      const manager = getSessionManager();

      manager.createSession({ agent: 'agent-1', project: 'project-1' });
      manager.createSession({ agent: 'agent-2', project: 'project-1' });

      const stats = manager.getSessionStats();

      assert.strictEqual(stats.total, 2);
      assert.strictEqual(stats.byProject['project-1'], 2);
    });
  });

  describe('ClientConnection', () => {
    it('should create a connection with session info', () => {
      const connection = new ClientConnection({
        agent: 'test-agent',
        project: 'test-project',
        sessionId: 'test-session'
      });

      assert.ok(connection.connectionId);
      assert.strictEqual(connection.agent, 'test-agent');
      assert.strictEqual(connection.sessionId, 'test-session');
      assert.strictEqual(connection.state, CONNECTION_STATE.CONNECTING);
    });

    it('should track connection activity', () => {
      const connection = new ClientConnection({
        agent: 'test-agent',
        project: 'test-project'
      });

      connection.updateActivity();
      connection.recordHeartbeat();

      assert.ok(connection.lastActivityAt);
      assert.ok(connection.lastHeartbeatAt);
    });

    it('should transition through connection states', () => {
      const connection = new ClientConnection({
        agent: 'test-agent',
        project: 'test-project'
      });

      connection.setInitialized('2024-11-05', { name: 'test' }, { name: 'server' });
      assert.strictEqual(connection.state, CONNECTION_STATE.INITIALIZED);

      connection.setReady();
      assert.strictEqual(connection.state, CONNECTION_STATE.READY);
      assert.ok(connection.isReady);
    });

    it('should track pending requests and tool calls', () => {
      const connection = new ClientConnection({
        agent: 'test-agent',
        project: 'test-project'
      });

      connection.addPendingRequest('req-1', 'tools/call');
      connection.addToolCall('call-1', 'store_context');

      assert.strictEqual(connection.pendingRequests.size, 1);
      assert.strictEqual(connection.activeToolCalls.size, 1);

      connection.removePendingRequest('req-1');
      connection.removeToolCall('call-1');

      assert.strictEqual(connection.pendingRequests.size, 0);
      assert.strictEqual(connection.activeToolCalls.size, 0);
    });
  });

  describe('ConnectionManager', () => {
    it('should register and track connections', () => {
      const manager = getConnectionManager();

      const connection = manager.registerConnection({
        agent: 'test-agent',
        project: 'test-project'
      });

      assert.ok(manager.getConnection(connection.connectionId));
      assert.strictEqual(manager.getAllConnections().length, 1);
    });

    it('should find connections by project', () => {
      const manager = getConnectionManager();

      manager.registerConnection({ agent: 'agent-1', project: 'project-1' });
      manager.registerConnection({ agent: 'agent-2', project: 'project-1' });
      manager.registerConnection({ agent: 'agent-3', project: 'project-2' });

      const projectConnections = manager.getConnectionsByProject('project-1');
      assert.strictEqual(projectConnections.length, 2);
    });

    it('should provide connection statistics', () => {
      const manager = getConnectionManager();

      manager.registerConnection({ agent: 'agent-1', project: 'project-1' });
      manager.registerConnection({ agent: 'agent-2', project: 'project-2' });

      const stats = manager.getConnectionStats();

      assert.strictEqual(stats.total, 2);
      assert.strictEqual(stats.byProject['project-1'], 1);
      assert.strictEqual(stats.byProject['project-2'], 1);
    });
  });

  describe('SessionScope', () => {
    it('should create scope with context', () => {
      const scope = new SessionScope({
        sessionId: 'session-1',
        agent: 'agent-1',
        project: 'project-1'
      });

      assert.strictEqual(scope.sessionId, 'session-1');
      assert.strictEqual(scope.agent, 'agent-1');
      assert.strictEqual(scope.project, 'project-1');
    });

    it('should generate query filters', () => {
      const scope = new SessionScope({
        sessionId: 'session-1',
        agent: 'agent-1',
        project: 'project-1'
      });

      const query = scope.toQuery({ type: 'test' });

      assert.strictEqual(query.sessionId, 'session-1');
      assert.strictEqual(query.agent, 'agent-1');
      assert.strictEqual(query.project, 'project-1');
      assert.strictEqual(query.type, 'test');
    });

    it('should match documents to scope', () => {
      const scope = new SessionScope({
        sessionId: 'session-1',
        agent: 'agent-1',
        project: 'project-1'
      });

      assert.ok(
        scope.matches({
          sessionId: 'session-1',
          agent: 'agent-1',
          project: 'project-1'
        })
      );

      assert.ok(
        !scope.matches({
          sessionId: 'session-2',
          agent: 'agent-1',
          project: 'project-1'
        })
      );
    });
  });

  describe('SessionDebugger', () => {
    it('should log messages at different levels', () => {
      const sessionDebugger = new SessionDebugger({ level: DEBUG_LEVEL.DEBUG });
      const logs = [];

      sessionDebugger.on('log', (entry) => logs.push(entry));

      sessionDebugger.error('Error message', { sessionId: 's1' });
      sessionDebugger.warn('Warning message', { sessionId: 's1' });
      sessionDebugger.info('Info message', { sessionId: 's1' });
      sessionDebugger.debug('Debug message', { sessionId: 's1' });

      assert.strictEqual(logs.length, 4);
    });

    it('should filter logs by session', () => {
      const sessionDebugger = new SessionDebugger({ level: DEBUG_LEVEL.TRACE });
      sessionDebugger.addSessionFilter('s1', DEBUG_LEVEL.ERROR);
      const logs = [];

      sessionDebugger.on('log', (entry) => logs.push(entry));

      sessionDebugger.error('Error for s1', { sessionId: 's1' });
      sessionDebugger.info('Info for s1', { sessionId: 's1' });
      sessionDebugger.error('Error for s2', { sessionId: 's2' });

      assert.strictEqual(logs.length, 2);
    });
  });

  describe('SessionIsolationValidator', () => {
    it('should validate document access within session', () => {
      const validator = new SessionIsolationValidator();

      const result = validator.validateDocumentAccess(
        { id: 'doc-1', sessionId: 'session-1' },
        'session-1',
        'read'
      );

      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should detect cross-session access in strict mode', () => {
      const validator = new SessionIsolationValidator({ strictMode: true });

      const result = validator.validateDocumentAccess(
        { id: 'doc-1', sessionId: 'session-1' },
        'session-2',
        'update'
      );

      assert.ok(!result.valid);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].type, 'session_mismatch');
    });

    it('should allow cross-session reads in non-strict mode', () => {
      const validator = new SessionIsolationValidator({ strictMode: false });

      const result = validator.validateDocumentAccess(
        { id: 'doc-1', sessionId: 'session-1' },
        'session-2',
        'read'
      );

      assert.ok(result.valid);
    });
  });

  describe('SessionErrorLogger', () => {
    it('should log and retrieve errors', () => {
      const logger = new SessionErrorLogger();

      logger.log(new Error('Test error'), {
        sessionId: 'session-1',
        project: 'project-1'
      });

      const errors = logger.getErrors({ sessionId: 'session-1' });
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error.message, 'Test error');
    });

    it('should provide error statistics', () => {
      const logger = new SessionErrorLogger();

      logger.log(new Error('Error 1'), { sessionId: 's1' });
      logger.log(new Error('Error 2'), { sessionId: 's1' });
      logger.log(new Error('Error 3'), { sessionId: 's2' });

      const stats = logger.getErrorStats();

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.bySession['s1'], 2);
      assert.strictEqual(stats.bySession['s2'], 1);
    });
  });

  describe('PortManager', () => {
    afterEach(() => {
      resetPortManager();
    });

    it('should allocate shared port by default', () => {
      const manager = getPortManager();

      const allocation = manager.allocatePort('project-1');

      assert.strictEqual(allocation.port, 4000);
      assert.ok(allocation.shared);
    });

    it('should allocate per-project ports when configured', () => {
      const manager = new PortManager({
        strategy: PORT_STRATEGY.PER_PROJECT,
        basePort: 4000,
        portRange: 10
      });

      const alloc1 = manager.allocatePort('project-1');
      const alloc2 = manager.allocatePort('project-2');

      assert.ok(!alloc1.shared);
      assert.ok(!alloc2.shared);
      assert.notStrictEqual(alloc1.port, alloc2.port);
    });

    it('should reuse ports for same project', () => {
      const manager = new PortManager({
        strategy: PORT_STRATEGY.PER_PROJECT,
        basePort: 4000,
        portRange: 10
      });

      const alloc1 = manager.allocatePort('project-1');
      const alloc2 = manager.allocatePort('project-1');

      assert.ok(alloc2.reused);
      assert.strictEqual(alloc1.port, alloc2.port);
    });

    it('should release project ports', () => {
      const manager = new PortManager({
        strategy: PORT_STRATEGY.PER_PROJECT,
        basePort: 4000,
        portRange: 10
      });

      manager.allocatePort('project-1');
      const result = manager.releasePort('project-1');

      assert.ok(result.released);
    });

    it('should provide port statistics', () => {
      const manager = new PortManager({
        strategy: PORT_STRATEGY.PER_PROJECT,
        basePort: 4000,
        portRange: 10
      });

      manager.allocatePort('project-1');
      manager.allocatePort('project-2');

      const stats = manager.getStats();

      assert.strictEqual(stats.allocated, 2);
      assert.strictEqual(stats.available, 8);
    });
  });
});

describe('Session ID Generation', () => {
  it('should generate unique session IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    assert.ok(id1);
    assert.ok(id2);
    assert.notStrictEqual(id1, id2);
  });

  it('should generate unique client IDs', () => {
    const id1 = generateClientId();
    const id2 = generateClientId();

    assert.ok(id1);
    assert.ok(id2);
    assert.notStrictEqual(id1, id2);
  });
});
