import { v4 as uuidv4 } from 'uuid';
import { getSessionManager, generateSessionId } from './session-manager.js';
import { getConnectionManager } from './client-connection.js';

export const SESSION_HEADER = 'x-mcp-session-id';
export const CLIENT_HEADER = 'x-mcp-client-id';
export const AGENT_HEADER = 'x-mcp-agent';
export const PROJECT_HEADER = 'x-mcp-project';

export function extractSessionContext(headers = {}, query = {}) {
  return {
    sessionId: headers[SESSION_HEADER] || query.sessionId || null,
    clientId: headers[CLIENT_HEADER] || query.clientId || uuidv4(),
    agent: headers[AGENT_HEADER] || query.agent || 'unknown',
    project: headers[PROJECT_HEADER] || query.project || 'default-project',
    scope: query.scope || 'project'
  };
}

export function createSessionContext(options = {}) {
  const context = {
    sessionId: options.sessionId || generateSessionId(),
    clientId: options.clientId || uuidv4(),
    agent: options.agent || 'unknown',
    project: options.project || 'default-project',
    scope: options.scope || 'project',
    ...options.metadata
  };

  return context;
}

export function withSessionContext(req, res, next) {
  req.sessionContext = extractSessionContext(req.headers, req.query);
  next();
}

export function sessionAwareMiddleware(options = {}) {
  const { requireSession = false, autoCreate = true } = options;

  return (req, res, next) => {
    const headers = req.headers || {};
    const query = req.query || {};

    let context = extractSessionContext(headers, query);

    if (requireSession && !context.sessionId && autoCreate) {
      const sessionManager = getSessionManager();
      const session = sessionManager.createSession({
        agent: context.agent,
        project: context.project,
        scope: context.scope,
        metadata: {
          clientId: context.clientId,
          userAgent: headers['user-agent'],
          remoteAddr: req.ip || req.connection?.remoteAddress
        }
      });
      context.sessionId = session.sessionId;
      context.session = session;
    }

    req.sessionContext = context;
    req.sessionId = context.sessionId;
    req.clientId = context.clientId;
    req.agent = context.agent;
    req.project = context.project;

    next();
  };
}

export class SessionScope {
  constructor(context = {}) {
    this.sessionId = context.sessionId;
    this.clientId = context.clientId;
    this.agent = context.agent;
    this.project = context.project;
    this.scope = context.scope;
    this._extra = { ...context };

    delete this._extra.sessionId;
    delete this._extra.clientId;
    delete this._extra.agent;
    delete this._extra.project;
    delete this._extra.scope;
  }

  toQuery(filter = {}) {
    const query = { ...filter };

    if (this.sessionId) {
      query.sessionId = this.sessionId;
    }

    if (this.agent) {
      query.agent = this.agent;
    }

    if (this.project) {
      query.project = this.project;
    }

    return query;
  }

  toFilter() {
    return this.toQuery({});
  }

  matches(item) {
    if (this.sessionId && item.sessionId && item.sessionId !== this.sessionId) {
      return false;
    }
    if (this.agent && item.agent && item.agent !== this.agent) {
      return false;
    }
    if (this.project && item.project && item.project !== this.project) {
      return false;
    }
    return true;
  }

  canModify(item) {
    if (this.sessionId && item.sessionId && item.sessionId !== this.sessionId) {
      return false;
    }
    if (this.agent && item.agent && item.agent !== this.agent) {
      const canModifyOtherAgent = this._extra.canModifyOtherAgent === true;
      if (!canModifyOtherAgent) {
        return false;
      }
    }
    return true;
  }

  getScopeFilter(collection = 'contexts') {
    const baseFilter = {};

    if (this.sessionId) {
      baseFilter.sessionId = this.sessionId;
    }

    switch (collection) {
      case 'contexts':
      case 'actions':
      case 'tasks':
      case 'issues':
      case 'activity':
      case 'project_map':
      case 'metrics':
        return this.toQuery(baseFilter);

      case 'sessions':
        if (this.sessionId) {
          return { sessionId: this.sessionId };
        }
        return baseFilter;

      case 'agents':
        return { project: this.project };

      case 'logs':
        return this.toQuery(baseFilter);

      default:
        return this.toQuery(baseFilter);
    }
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      clientId: this.clientId,
      agent: this.agent,
      project: this.project,
      scope: this.scope
    };
  }
}

export function createSessionScope(context = {}) {
  return new SessionScope(context);
}

export function filterBySession(query = {}, sessionId = null, agent = null, project = null) {
  const filter = { ...query };

  if (sessionId) {
    filter.sessionId = sessionId;
  }

  if (agent) {
    filter.agent = agent;
  }

  if (project) {
    filter.project = project;
  }

  return filter;
}

export function validateSessionIsolation(document, sessionScope) {
  const errors = [];

  if (
    document.sessionId &&
    sessionScope.sessionId &&
    document.sessionId !== sessionScope.sessionId
  ) {
    errors.push({
      type: 'session_mismatch',
      message: `Document session ${document.sessionId} does not match request session ${sessionScope.sessionId}`,
      documentId: document.id || document._id
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createSessionAwareQuery(collection, baseQuery = {}, sessionScope) {
  const scopeFilter = sessionScope.getScopeFilter(collection);
  return {
    ...baseQuery,
    ...scopeFilter
  };
}

export function injectSessionId(data = {}, sessionId = null) {
  if (!sessionId) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => ({ ...item, sessionId }));
  }

  return { ...data, sessionId };
}

export class SessionTracker {
  constructor(sessionManager = null, connectionManager = null) {
    this._sessionManager = sessionManager || getSessionManager();
    this._connectionManager = connectionManager || getConnectionManager();
  }

  trackSession(session) {
    const connection = this._connectionManager.getConnectionBySession(session.sessionId);
    if (connection) {
      connection.sessionId = session.sessionId;
      this._connectionManager._connectionBySession.set(session.sessionId, connection);
    }
    return session;
  }

  trackContext(context, sessionId) {
    if (sessionId) {
      const session = this._sessionManager.getSession(sessionId);
      if (session) {
        session.addContext(context.id || context._id);
        context.sessionId = sessionId;
      }
    }
    return context;
  }

  trackAction(action, sessionId) {
    if (sessionId) {
      const session = this._sessionManager.getSession(sessionId);
      if (session) {
        session.addAction(action.id || action._id);
        action.sessionId = sessionId;
      }
    }
    return action;
  }

  trackTask(task, sessionId) {
    if (sessionId) {
      const session = this._sessionManager.getSession(sessionId);
      if (session) {
        session.addTask(task.task_id || task._id);
        task.sessionId = sessionId;
      }
    }
    return task;
  }

  getStats() {
    return {
      sessions: this._sessionManager.getSessionStats(),
      connections: this._connectionManager.getConnectionStats()
    };
  }
}

let globalSessionTracker = null;

export function getSessionTracker() {
  if (!globalSessionTracker) {
    globalSessionTracker = new SessionTracker();
  }
  return globalSessionTracker;
}

export function resetSessionTracker() {
  globalSessionTracker = null;
}
