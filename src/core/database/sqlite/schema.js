/**
 * SQLite Schema for Local MCP Memory Server
 *
 * Defines all tables, indexes, and FTS5 virtual tables.
 * Handles all relationships between contexts, tasks, issues, agents,
 * messages, activity, resource locks, project map, memory versions,
 * metrics, feedback, chat rooms, and chat messages.
 */

export function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      type TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL DEFAULT '',
      summary TEXT,
      embedding BLOB,
      importance INTEGER NOT NULL DEFAULT 3,
      accessCount INTEGER NOT NULL DEFAULT 0,
      lastAccessedAt TEXT,
      lifecycle TEXT NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      relatedContexts TEXT NOT NULL DEFAULT '[]',
      relatedActions TEXT NOT NULL DEFAULT '[]',
      relatedTasks TEXT NOT NULL DEFAULT '[]',
      relatedIssues TEXT NOT NULL DEFAULT '[]',
      relatedAgents TEXT NOT NULL DEFAULT '[]',
      conflictsWith TEXT NOT NULL DEFAULT '[]',
      projectDescriptor TEXT,
      updateReason TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_versions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      version_id TEXT NOT NULL,
      context_id TEXT NOT NULL,
      context_version INTEGER NOT NULL DEFAULT 1,
      change_type TEXT NOT NULL DEFAULT 'update',
      reason TEXT NOT NULL DEFAULT 'No reason provided',
      snapshot TEXT NOT NULL DEFAULT '{}',
      changedBy TEXT NOT NULL DEFAULT 'system',
      changedAt TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      actionType TEXT NOT NULL DEFAULT 'unknown',
      target TEXT,
      before TEXT,
      after TEXT,
      diff TEXT,
      summary TEXT,
      contextRefs TEXT NOT NULL DEFAULT '[]',
      outcome TEXT NOT NULL DEFAULT '{"success":true,"error":null}',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      contextIds TEXT NOT NULL DEFAULT '[]',
      actionIds TEXT NOT NULL DEFAULT '[]',
      scope TEXT NOT NULL DEFAULT 'private',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Unnamed Agent',
      role TEXT NOT NULL DEFAULT 'worker',
      capabilities TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'idle',
      current_task TEXT,
      last_seen TEXT NOT NULL,
      heartbeat_interval_ms INTEGER NOT NULL DEFAULT 30000,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      task_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      assigned_to TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 3,
      priorityScore REAL NOT NULL DEFAULT 3,
      dependencies TEXT NOT NULL DEFAULT '[]',
      required_capabilities TEXT NOT NULL DEFAULT '[]',
      result TEXT,
      blocker TEXT,
      scheduledFor TEXT,
      schedulingNotes TEXT,
      relatedContexts TEXT NOT NULL DEFAULT '[]',
      relatedIssues TEXT NOT NULL DEFAULT '[]',
      relatedAgents TEXT NOT NULL DEFAULT '[]',
      conflictsWith TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      idempotencyKey TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      message_id TEXT NOT NULL,
      from_agent TEXT NOT NULL DEFAULT 'system',
      to_agent TEXT,
      type TEXT NOT NULL DEFAULT 'info',
      content TEXT NOT NULL DEFAULT '',
      related_task TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      issue_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'note',
      status TEXT NOT NULL DEFAULT 'open',
      relatedContexts TEXT NOT NULL DEFAULT '[]',
      relatedTasks TEXT NOT NULL DEFAULT '[]',
      relatedIssues TEXT NOT NULL DEFAULT '[]',
      relatedAgents TEXT NOT NULL DEFAULT '[]',
      resolution TEXT,
      resolvedBy TEXT,
      resolvedAt TEXT,
      conflictsWith TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_map (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      map_id TEXT NOT NULL,
      file_path TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'unknown',
      summary TEXT NOT NULL DEFAULT '',
      dependencies TEXT NOT NULL DEFAULT '[]',
      exports TEXT NOT NULL DEFAULT '[]',
      key_details TEXT NOT NULL DEFAULT '[]',
      related_tasks TEXT NOT NULL DEFAULT '[]',
      related_agents TEXT NOT NULL DEFAULT '[]',
      conflictsWith TEXT NOT NULL DEFAULT '[]',
      relationships TEXT NOT NULL DEFAULT '{"parent":null,"children":[]}',
      last_verified_at TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      activity_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'action',
      message TEXT NOT NULL DEFAULT '',
      related_task TEXT,
      resource TEXT,
      timestamp TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_locks (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      lock_id TEXT NOT NULL,
      resource TEXT NOT NULL DEFAULT '',
      locked_by TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      metric_id TEXT NOT NULL,
      metric_type TEXT NOT NULL DEFAULT 'custom',
      name TEXT NOT NULL DEFAULT 'unnamed_metric',
      value REAL NOT NULL DEFAULT 0,
      data TEXT NOT NULL DEFAULT '{}',
      recordedAt TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      feedback_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'feedback',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'system',
      severity INTEGER NOT NULL DEFAULT 3,
      votes INTEGER NOT NULL DEFAULT 0,
      voters TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      resolved_by TEXT,
      resolved_at TEXT,
      resolution TEXT,
      related_contexts TEXT NOT NULL DEFAULT '[]',
      related_tasks TEXT NOT NULL DEFAULT '[]',
      related_issues TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      room_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Unnamed Room',
      room_scope TEXT NOT NULL DEFAULT 'project',
      participants TEXT NOT NULL DEFAULT '[]',
      admins TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      max_participants INTEGER NOT NULL DEFAULT 50,
      sequence INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      message_id TEXT NOT NULL,
      room_id TEXT,
      from_agent TEXT NOT NULL DEFAULT 'system',
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'info',
      related_task TEXT,
      related_context TEXT,
      is_edited INTEGER NOT NULL DEFAULT 0,
      edited_at TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      idempotencyKey TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      type TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL DEFAULT '',
      stack TEXT,
      log_context TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emulators (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      emulator_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Unnamed Emulator',
      type TEXT NOT NULL DEFAULT 'android',
      status TEXT NOT NULL DEFAULT 'stopped',
      device_id TEXT,
      os_version TEXT,
      screen_resolution TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]',
      score REAL NOT NULL DEFAULT 0,
      last_checked TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      connectionId TEXT NOT NULL,
      sessionId TEXT,
      clientId TEXT,
      agent TEXT,
      project TEXT,
      state TEXT NOT NULL DEFAULT 'active',
      lastActivityAt TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'unknown',
      project TEXT NOT NULL DEFAULT 'default',
      sessionId TEXT,
      scope TEXT NOT NULL DEFAULT 'private',
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'http',
      command TEXT,
      url TEXT,
      env TEXT NOT NULL DEFAULT '{}',
      auth_type TEXT NOT NULL DEFAULT 'none',
      auth_config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'registered',
      health TEXT NOT NULL DEFAULT '{}',
      capabilities TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  applyColumnMigrations(db);
  createIndexes(db);
  createFTS(db);
}

/**
 * Idempotent additive column migrations for databases created before a
 * column existed. CREATE TABLE IF NOT EXISTS never alters an existing
 * table, so upgrades run through PRAGMA table_info checks instead.
 * Additive only - no destructive changes.
 */
function applyColumnMigrations(db) {
  const migrations = [
    {
      table: 'chat_rooms',
      column: 'sequence',
      ddl: 'ALTER TABLE chat_rooms ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0',
    },
    {
      table: 'chat_messages',
      column: 'idempotencyKey',
      ddl: 'ALTER TABLE chat_messages ADD COLUMN idempotencyKey TEXT',
    },
    {
      table: 'tasks',
      column: 'idempotencyKey',
      ddl: 'ALTER TABLE tasks ADD COLUMN idempotencyKey TEXT',
    },
  ];

  for (const migration of migrations) {
    const rows = db.prepare(`PRAGMA table_info("${migration.table}")`).all();
    const exists = rows.some((row) => row.name === migration.column);
    if (!exists) {
      db.exec(migration.ddl);
    }
  }
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contexts_project ON contexts(project);
    CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts(type);
    CREATE INDEX IF NOT EXISTS idx_contexts_lifecycle ON contexts(lifecycle);
    CREATE INDEX IF NOT EXISTS idx_contexts_agent ON contexts(agent);
    CREATE INDEX IF NOT EXISTS idx_contexts_session ON contexts(sessionId);
    CREATE INDEX IF NOT EXISTS idx_contexts_project_type_lifecycle ON contexts(project, type, lifecycle, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_contexts_importance ON contexts(importance);
    CREATE INDEX IF NOT EXISTS idx_contexts_updated ON contexts(updatedAt);

    CREATE INDEX IF NOT EXISTS idx_memory_versions_context ON memory_versions(context_id);
    CREATE INDEX IF NOT EXISTS idx_memory_versions_project ON memory_versions(project);
    CREATE INDEX IF NOT EXISTS idx_memory_versions_changed ON memory_versions(changedAt);

    CREATE INDEX IF NOT EXISTS idx_actions_context_refs ON actions(contextRefs);
    CREATE INDEX IF NOT EXISTS idx_actions_session ON actions(sessionId);
    CREATE INDEX IF NOT EXISTS idx_actions_agent ON actions(agent, project);

    CREATE INDEX IF NOT EXISTS idx_sessions_session ON sessions(sessionId);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent, project);

    CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project, status);
    CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(sessionId);

    CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project, status, priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(project, assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(sessionId);
    CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent, project);

    CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
    CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project, to_agent);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(sessionId);

    CREATE INDEX IF NOT EXISTS idx_issues_issue_id ON issues(issue_id);
    CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project, status, type);
    CREATE INDEX IF NOT EXISTS idx_issues_related_tasks ON issues(relatedTasks);
    CREATE INDEX IF NOT EXISTS idx_issues_related_contexts ON issues(relatedContexts);
    CREATE INDEX IF NOT EXISTS idx_issues_session ON issues(sessionId);

    CREATE INDEX IF NOT EXISTS idx_project_map_project ON project_map(project, type);
    CREATE INDEX IF NOT EXISTS idx_project_map_file ON project_map(file_path);
    CREATE INDEX IF NOT EXISTS idx_project_map_session ON project_map(sessionId);

    CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project, timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_task ON activity(project, related_task, timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_session ON activity(sessionId);
    CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity(agent, timestamp);

    CREATE INDEX IF NOT EXISTS idx_resource_locks_project ON resource_locks(project, resource);
    CREATE INDEX IF NOT EXISTS idx_resource_locks_agent ON resource_locks(locked_by);
    CREATE INDEX IF NOT EXISTS idx_resource_locks_expires ON resource_locks(expiresAt);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_locks_unique ON resource_locks(project, resource, locked_by);

    CREATE INDEX IF NOT EXISTS idx_metrics_project ON metrics(project, metric_type, name);
    CREATE INDEX IF NOT EXISTS idx_metrics_session ON metrics(sessionId);
    CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON metrics(recordedAt);

    CREATE INDEX IF NOT EXISTS idx_feedbacks_project ON feedbacks(project, status, type);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_feedback_id ON feedbacks(feedback_id);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_related_contexts ON feedbacks(related_contexts);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_related_tasks ON feedbacks(related_tasks);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_voters ON feedbacks(voters);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_session ON feedbacks(sessionId);

    CREATE INDEX IF NOT EXISTS idx_chat_rooms_project ON chat_rooms(project, room_scope);
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_participants ON chat_rooms(participants);
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_room_id ON chat_rooms(room_id);
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_session ON chat_rooms(sessionId);

    CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_from ON chat_messages(from_agent);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(sessionId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_idempotency ON chat_messages(idempotencyKey) WHERE idempotencyKey IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks(idempotencyKey) WHERE idempotencyKey IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(createdAt);
    CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(sessionId);
    CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type, createdAt);

    CREATE INDEX IF NOT EXISTS idx_emulators_emulator_id ON emulators(emulator_id);
    CREATE INDEX IF NOT EXISTS idx_emulators_project ON emulators(project, status);

    CREATE INDEX IF NOT EXISTS idx_connections_connection ON connections(connectionId);
    CREATE INDEX IF NOT EXISTS idx_connections_session ON connections(sessionId);
    CREATE INDEX IF NOT EXISTS idx_connections_client ON connections(clientId);
    CREATE INDEX IF NOT EXISTS idx_connections_state ON connections(state, lastActivityAt);

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_project ON mcp_servers(project, status);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_server_id ON mcp_servers(server_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers(type);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_session ON mcp_servers(sessionId);
  `);
}

function createFTS(db) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
      id,
      content,
      summary,
      tags,
      content='contexts',
      content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS project_map_fts USING fts5(
      id,
      file_path,
      summary,
      key_details,
      dependencies,
      exports,
      tags,
      content='project_map',
      content_rowid='rowid'
    );
  `);

  // The trigger definitions must carry an explicit rowid: contexts and
  // project_map are ROWID tables whose ids get reused after deletes, while
  // fts5's implicit rowid counter does not - drift makes MATCH queries fail
  // with "missing row N from content table". DROP + CREATE guarantees every
  // existing database receives the corrected definitions (additive: only
  // derived-index logic changes, no data is touched).
  const legacyTriggers = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type='trigger'
       AND name IN ('contexts_ai','contexts_ad','contexts_au',
                    'project_map_ai','project_map_ad','project_map_au')`
    )
    .all()
    .some((row) => row.sql && !row.sql.includes('rowid'));

  db.exec(`
    DROP TRIGGER IF EXISTS contexts_ai;
    DROP TRIGGER IF EXISTS contexts_ad;
    DROP TRIGGER IF EXISTS contexts_au;
    DROP TRIGGER IF EXISTS project_map_ai;
    DROP TRIGGER IF EXISTS project_map_ad;
    DROP TRIGGER IF EXISTS project_map_au;

    CREATE TRIGGER contexts_ai AFTER INSERT ON contexts BEGIN
      INSERT INTO contexts_fts(rowid, id, content, summary, tags)
      VALUES (new.rowid, new.id, new.content, new.summary, new.tags);
    END;

    CREATE TRIGGER contexts_ad AFTER DELETE ON contexts BEGIN
      INSERT INTO contexts_fts(contexts_fts, rowid, id, content, summary, tags)
      VALUES ('delete', old.rowid, old.id, old.content, old.summary, old.tags);
    END;

    CREATE TRIGGER contexts_au AFTER UPDATE ON contexts BEGIN
      INSERT INTO contexts_fts(contexts_fts, rowid, id, content, summary, tags)
      VALUES ('delete', old.rowid, old.id, old.content, old.summary, old.tags);
      INSERT INTO contexts_fts(rowid, id, content, summary, tags)
      VALUES (new.rowid, new.id, new.content, new.summary, new.tags);
    END;

    CREATE TRIGGER project_map_ai AFTER INSERT ON project_map BEGIN
      INSERT INTO project_map_fts(rowid, id, file_path, summary, key_details, dependencies, exports, tags)
      VALUES (new.rowid, new.id, new.file_path, new.summary, new.key_details, new.dependencies, new.exports, new.tags);
    END;

    CREATE TRIGGER project_map_ad AFTER DELETE ON project_map BEGIN
      INSERT INTO project_map_fts(project_map_fts, rowid, id, file_path, summary, key_details, dependencies, exports, tags)
      VALUES ('delete', old.rowid, old.id, old.file_path, old.summary, old.key_details, old.dependencies, old.exports, old.tags);
    END;

    CREATE TRIGGER project_map_au AFTER UPDATE ON project_map BEGIN
      INSERT INTO project_map_fts(project_map_fts, rowid, id, file_path, summary, key_details, dependencies, exports, tags)
      VALUES ('delete', old.rowid, old.id, old.file_path, old.summary, old.key_details, old.dependencies, old.exports, old.tags);
      INSERT INTO project_map_fts(rowid, id, file_path, summary, key_details, dependencies, exports, tags)
      VALUES (new.rowid, new.id, new.file_path, new.summary, new.key_details, new.dependencies, new.exports, new.tags);
    END;
  `);

  // One-time repair: pre-existing databases may hold a drifted index built
  // by the legacy rowid-less triggers.
  if (legacyTriggers) {
    rebuildFTS(db);
  }
}

export function rebuildFTS(db) {
  db.exec(`
    INSERT INTO contexts_fts(contexts_fts) VALUES('rebuild');
    INSERT INTO project_map_fts(project_map_fts) VALUES('rebuild');
  `);
}
