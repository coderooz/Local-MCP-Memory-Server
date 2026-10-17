/**
 * SQLite Query Builder
 *
 * Translates MongoDB-style query operations to SQLite.
 * Handles $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex,
 * $or, $and, $addToSet, $each, $push, $set, $unset, $text, $exists.
 */

const JSON_ARRAY_FIELDS = new Set([
  'tags',
  'relatedContexts',
  'relatedActions',
  'relatedTasks',
  'relatedIssues',
  'relatedAgents',
  'conflictsWith',
  'dependencies',
  'required_capabilities',
  'contextIds',
  'actionIds',
  'participants',
  'admins',
  'voters',
  'related_contexts',
  'related_tasks',
  'related_issues',
  'key_details',
  'related_tasks',
  'related_agents',
  'exports',
  'capabilities',
]);

const JSON_OBJECT_FIELDS = new Set([
  'metadata',
  'outcome',
  'relationships',
  'data',
  'log_context',
  'projectDescriptor',
]);

const TEXT_COLUMNS = new Set([
  'id',
  'agent',
  'project',
  'sessionId',
  'scope',
  'type',
  'content',
  'summary',
  'lifecycle',
  'updateReason',
  'actionType',
  'target',
  'before',
  'after',
  'diff',
  'status',
  'assigned_to',
  'created_by',
  'result',
  'blocker',
  'scheduledFor',
  'schedulingNotes',
  'from_agent',
  'to_agent',
  'issue_id',
  'title',
  'description',
  'resolution',
  'resolvedBy',
  'resolvedAt',
  'file_path',
  'activity_id',
  'resource',
  'message',
  'related_task',
  'lock_id',
  'locked_by',
  'metric_id',
  'metric_type',
  'name',
  'recordedAt',
  'feedback_id',
  'created_by',
  'resolved_by',
  'resolution',
  'room_id',
  'room_scope',
  'message_id',
  'edited_at',
  'stack',
  'emulator_id',
  'device_id',
  'os_version',
  'screen_resolution',
  'connectionId',
  'clientId',
  'state',
  'lastActivityAt',
  'type',
  'agent_id',
  'role',
  'current_task',
  'last_seen',
  'task_id',
  'version',
  'map_id',
  'version_id',
  'context_id',
  'change_type',
  'reason',
  'changedBy',
  'changedAt',
  'context_version',
]);

/**
 * Convert a JavaScript value into a value better-sqlite3 can bind.
 *
 * SQLite only accepts numbers, strings, bigints, buffers and null.
 * Domain models produce booleans (is_active, is_edited, ...) and Date
 * objects (createdAt, updatedAt) that must be normalised:
 *   - boolean -> 1/0 (SQLite INTEGER convention used by is_* columns)
 *   - Date    -> ISO-8601 string (schema stores TEXT timestamps)
 *   - undefined -> null
 *   - RegExp  -> serialized "source flags" (consumed by the REGEXP user function)
 *   - plain objects/arrays -> JSON string (last-resort fallback)
 *
 * @param {*} value
 * @returns {*} bindable value
 */
export function toBindable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (value instanceof RegExp) return value.source + ' ' + value.flags;
  return JSON.stringify(value);
}

export function convertMongoQuery(filter) {
  if (!filter || typeof filter !== 'object') return { where: '1=1', params: [] };

  if ('$or' in filter) {
    const parts = [];
    const params = [];
    for (const sub of filter['$or']) {
      const converted = convertMongoQuery(sub);
      parts.push(`(${converted.where})`);
      params.push(...converted.params);
    }
    return { where: `(${parts.join(' OR ')})`, params };
  }

  if ('$and' in filter) {
    const parts = [];
    const params = [];
    for (const sub of filter['$and']) {
      const converted = convertMongoQuery(sub);
      parts.push(`(${converted.where})`);
      params.push(...converted.params);
    }
    return { where: `(${parts.join(' AND ')})`, params };
  }

  if ('$text' in filter) {
    const searchTerm = filter['$text']['$search'] || filter['$text'];
    return {
      where: `contexts.id IN (SELECT id FROM contexts_fts WHERE contexts_fts MATCH ?)`,
      params: [searchTerm],
    };
  }

  const conditions = [];
  const params = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' || key === '$and' || key === '$text') continue;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const ops = Object.entries(value);
      let hasSpecialOp = false;

      for (const [op, opValue] of ops) {
        if (op === '$eq') {
          if (opValue === null || opValue === undefined) {
            conditions.push(`"${key}" IS NULL`);
          } else if (JSON_ARRAY_FIELDS.has(key)) {
            conditions.push(`"${key}" = ?`);
            params.push(JSON.stringify(opValue));
          } else {
            conditions.push(`"${key}" = ?`);
            params.push(opValue);
          }
          hasSpecialOp = true;
        } else if (op === '$ne') {
          if (opValue === null || opValue === undefined) {
            conditions.push(`"${key}" IS NOT NULL`);
          } else {
            conditions.push(`"${key}" != ?`);
            params.push(opValue);
          }
          hasSpecialOp = true;
        } else if (op === '$in') {
          if (!Array.isArray(opValue) || opValue.length === 0) {
            conditions.push('0=1');
          } else {
            const placeholders = opValue.map(() => '?').join(',');
            conditions.push(`"${key}" IN (${placeholders})`);
            params.push(...opValue);
          }
          hasSpecialOp = true;
        } else if (op === '$nin') {
          if (Array.isArray(opValue) && opValue.length > 0) {
            const placeholders = opValue.map(() => '?').join(',');
            conditions.push(`"${key}" NOT IN (${placeholders})`);
            params.push(...opValue);
          }
          hasSpecialOp = true;
        } else if (op === '$gt') {
          conditions.push(`"${key}" > ?`);
          params.push(opValue);
          hasSpecialOp = true;
        } else if (op === '$gte') {
          conditions.push(`"${key}" >= ?`);
          params.push(opValue);
          hasSpecialOp = true;
        } else if (op === '$lt') {
          conditions.push(`"${key}" < ?`);
          params.push(opValue);
          hasSpecialOp = true;
        } else if (op === '$lte') {
          conditions.push(`"${key}" <= ?`);
          params.push(opValue);
          hasSpecialOp = true;
        } else if (op === '$regex') {
          if (opValue instanceof RegExp) {
            conditions.push(`"${key}" REGEXP ?`);
            params.push(`${opValue.source} ${opValue.flags}`);
          } else {
            conditions.push(`"${key}" LIKE ?`);
            params.push(String(opValue));
          }
          hasSpecialOp = true;
        } else if (op === '$exists') {
          if (opValue) {
            conditions.push(`"${key}" IS NOT NULL`);
          } else {
            conditions.push(`"${key}" IS NULL`);
          }
          hasSpecialOp = true;
        } else if (op === '$addToSet') {
          hasSpecialOp = true;
        }
      }

      if (!hasSpecialOp) {
        conditions.push(`"${key}" = ?`);
        params.push(JSON.stringify(value));
      }
    } else if (Array.isArray(value)) {
      conditions.push(`"${key}" = ?`);
      params.push(JSON.stringify(value));
    } else if (value === null || value === undefined) {
      conditions.push(`"${key}" IS NULL`);
    } else {
      conditions.push(`"${key}" = ?`);
      params.push(value);
    }
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  return { where, params: params.map(toBindable) };
}

export function buildUpdateOps(updates, tableColumns = null) {
  const setColumns = [];
  const setParams = [];
  const jsonUpdates = [];
  const dropped = [];

  const canWrite = (key) => {
    if (!tableColumns || tableColumns.has(key)) return true;
    dropped.push(key);
    return false;
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === '$addToSet' || key === '$push') continue;
    if (key === '$inc' && value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (tableColumns && !tableColumns.has(k)) {
          const err = new Error(`Cannot $inc column "${k}": column does not exist`);
          err.code = 'SQLITE_MISSING_COLUMN';
          throw err;
        }
        setColumns.push(`"${k}" = COALESCE("${k}", 0) + ?`);
        setParams.push(toBindable(v));
      }
      continue;
    }
    if (key === '$set' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (!canWrite(k)) continue;
        if (JSON_ARRAY_FIELDS.has(k) || JSON_OBJECT_FIELDS.has(k)) {
          jsonUpdates.push({ key: k, value: v });
        } else {
          setColumns.push(`"${k}" = ?`);
          setParams.push(toBindable(v));
        }
      }
      continue;
    }
    if (key === '$unset') {
      for (const k of Object.keys(value)) {
        if (!canWrite(k)) continue;
        setColumns.push(`"${k}" = NULL`);
      }
      continue;
    }
    if (!canWrite(key)) continue;
    if (JSON_ARRAY_FIELDS.has(key) || JSON_OBJECT_FIELDS.has(key)) {
      jsonUpdates.push({ key, value });
    } else {
      setColumns.push(`"${key}" = ?`);
      setParams.push(toBindable(value));
    }
  }

  for (const { key, value } of jsonUpdates) {
    setColumns.push(`"${key}" = ?`);
    setParams.push(typeof value === 'object' ? JSON.stringify(value) : toBindable(value));
  }

  if (dropped.length > 0 && process.env.MCP_DEBUG_SQLITE) {
    console.error(`[sqlite] buildUpdateOps dropped unknown columns: ${dropped.join(', ')}`);
  }

  return { setColumns, setParams };
}

export function buildAddToSet(fieldName, newValues) {
  return {
    setColumn: `"${fieldName}" = json_group_array(DISTINCT value)`,
    subquery: `
      SELECT DISTINCT value
      FROM (
        SELECT json_each.value
        FROM ${fieldName}, json_each(${fieldName})
        WHERE json_valid(${fieldName})
        UNION
        SELECT value
        FROM json_each(?)
      )
    `,
    params: JSON.stringify(newValues),
  };
}

export function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function ensureJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function ensureJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Encrypted blobs (`enc:v1:` AES-GCM format) are opaque — pass through
    // untouched instead of JSON.parsing them into {} (which would lose data).
    if (value.startsWith('enc:v1:')) return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
