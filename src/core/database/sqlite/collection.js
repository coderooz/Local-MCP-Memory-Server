/**
 * SQLite Collection Adapter
 *
 * Provides a MongoDB-compatible API over SQLite.
 * Wraps better-sqlite3 queries with find/findOne/insertOne/updateOne/deleteOne/etc.
 * Uses the query-builder for MongoDB filter translation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  convertMongoQuery,
  buildUpdateOps,
  ensureJsonArray,
  ensureJsonObject,
  toBindable,
} from './query-builder.js';

/**
 * Cached table-column lookup (PRAGMA table_info) keyed per Database instance.
 * Returns null when the table does not exist so callers fall back to the
 * natural SQLite error ("no such table") instead of filtering everything away.
 */
const tableColumnsCache = new WeakMap();

export function getTableColumns(db, table) {
  let perDb = tableColumnsCache.get(db);
  if (!perDb) {
    perDb = new Map();
    tableColumnsCache.set(db, perDb);
  }
  if (!perDb.has(table)) {
    let columns = null;
    try {
      const rows = db.prepare(`PRAGMA table_info("${table}")`).all();
      if (rows.length > 0) columns = new Set(rows.map((row) => row.name));
    } catch {
      columns = null;
    }
    perDb.set(table, columns);
  }
  return perDb.get(table);
}

/**
 * Builds the document to insert when `updateOne(..., { upsert: true })` finds
 * no matching row.
 *
 * Mongo-compatible semantics: equality fields from the filter are merged with
 * the update's `$set`/plain values, and `$inc` starts from zero. Operator-based
 * filter clauses cannot be represented as a single row, so they are skipped.
 *
 * @param {object} filter
 * @param {object} update
 * @param {Set<string>|null} tableColumns
 * @returns {object}
 */
function buildUpsertDocument(filter = {}, update = {}, tableColumns = null) {
  const document = {};

  const assign = (key, value) => {
    if (value === undefined) return;
    if (tableColumns && !tableColumns.has(key)) return;
    document[key] = value;
  };

  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$')) continue;
    const type = typeof value;
    if (value === null || type === 'string' || type === 'number' || type === 'boolean') {
      assign(key, value);
    }
  }

  if (update && typeof update === 'object') {
    for (const [key, value] of Object.entries(update)) {
      if (key === '$set' && value && typeof value === 'object') {
        for (const [field, fieldValue] of Object.entries(value)) {
          assign(field, fieldValue);
        }
      } else if (key === '$inc' && value && typeof value === 'object') {
        for (const [field, increment] of Object.entries(value)) {
          const base = typeof document[field] === 'number' ? document[field] : 0;
          assign(field, base + increment);
        }
      } else if (!key.startsWith('$')) {
        assign(key, value);
      }
    }
  }

  return document;
}

class Cursor {
  constructor(db, tableName, filter) {
    this._db = db;
    this._table = tableName;
    this._filter = filter;
    this._limitVal = 1000;
    this._skipVal = 0;
    this._sortVal = null;
    this._projection = null;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }
  skip(n) {
    this._skipVal = n;
    return this;
  }
  sort(spec) {
    this._sortVal = spec;
    return this;
  }
  projection(spec) {
    this._projection = spec;
    return this;
  }

  async toArray() {
    const { where, params } = convertMongoQuery(this._filter);
    let sql = `SELECT * FROM "${this._table}" WHERE ${where}`;

    if (this._sortVal) {
      const orderClauses = [];
      for (const [field, dir] of Object.entries(this._sortVal)) {
        let expr = `"${field}"`;
        if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(field)) {
          const dot = field.indexOf('.');
          const head = field.slice(0, dot);
          const rest = field.slice(dot + 1);
          expr = `json_extract("${head}", '$.${rest}')`;
        }
        orderClauses.push(`${expr} ${dir > 0 ? 'ASC' : 'DESC'}`);
      }
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(this._limitVal, this._skipVal);

    try {
      const rows = this._db.prepare(sql).all(...params);
      return rows.map((row) => inflateRow(row, this._table));
    } catch (err) {
      console.error(`[sqlite] Cursor.toArray error on ${this._table}:`, err.message);
      return [];
    }
  }

  async count() {
    const { where, params } = convertMongoQuery(this._filter);
    const sql = `SELECT COUNT(*) as cnt FROM "${this._table}" WHERE ${where}`;
    try {
      const row = this._db.prepare(sql).get(...params);
      return row?.cnt || 0;
    } catch {
      return 0;
    }
  }

  async [Symbol.asyncIterator]() {
    const results = await this.toArray();
    return results[Symbol.asyncIterator]();
  }
}

function inflateRow(row, table) {
  if (!row) return row;
  const result = { ...row };

  const jsonArrayFields = [
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
  ];

  const jsonObjectFields = [
    'metadata',
    'outcome',
    'relationships',
    'data',
    'log_context',
    'projectDescriptor',
    'env',
    'auth_config',
    'health',
  ];

  for (const field of jsonArrayFields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = ensureJsonArray(result[field]);
    }
  }

  for (const field of jsonObjectFields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = ensureJsonObject(result[field]);
    }
  }

  if (table === 'contexts') {
    if (result.embedding !== null && result.embedding !== undefined) {
      result.embedding = result.embedding;
    } else {
      delete result.embedding;
    }
  }

  return result;
}

export class Collection {
  constructor(db, tableName) {
    this._db = db;
    this._table = tableName;
  }

  find(filter = {}) {
    return new Cursor(this._db, this._table, filter);
  }

  async findOne(filter = {}) {
    const { where, params } = convertMongoQuery(filter);
    const sql = `SELECT * FROM "${this._table}" WHERE ${where} LIMIT 1`;
    try {
      const row = this._db.prepare(sql).get(...params);
      return inflateRow(row, this._table);
    } catch (err) {
      console.error(`[sqlite] findOne error on ${this._table}:`, err.message);
      return null;
    }
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const returnBefore = options.returnDocument === 'before';
    const before = returnBefore ? await this.findOne(filter) : null;

    const { where, params: filterParams } = convertMongoQuery(filter);
    const updateOps = buildUpdateOps(update, getTableColumns(this._db, this._table));

    let setClause = '';
    if (updateOps.setColumns.length > 0) {
      setClause = updateOps.setColumns.join(', ');
    }

    if (setClause) {
      const sql = `UPDATE "${this._table}" SET ${setClause} WHERE ${where}`;
      this._db.prepare(sql).run(...updateOps.setParams, ...filterParams);
    }

    if (options.addOperations) {
      for (const op of options.addOperations) {
        await this._applyAddOperation(filter, op);
      }
    }

    if (returnBefore) {
      return before;
    }
    return await this.findOne(filter);
  }

  async _applyAddOperation(filter, operation) {
    if (operation.addToSet) {
      for (const [field, values] of Object.entries(operation.addToSet)) {
        if (!Array.isArray(values)) continue;
        const existing = await this.findOne(filter);
        if (!existing) continue;
        const currentArr = ensureJsonArray(existing[field]);
        const newValues = ensureJsonArray(values);
        const merged = [...new Set([...currentArr, ...newValues])];
        const { where, params: filterParams } = convertMongoQuery(filter);
        const sql = `UPDATE "${this._table}" SET "${field}" = ? WHERE ${where}`;
        this._db.prepare(sql).run(JSON.stringify(merged), ...filterParams);
      }
    }
    if (operation.push) {
      for (const [field, values] of Object.entries(operation.push)) {
        if (values && values.$each && Array.isArray(values.$each)) {
          const existing = await this.findOne(filter);
          if (!existing) continue;
          const currentArr = ensureJsonArray(existing[field]);
          const merged = [...currentArr, ...values.$each];
          const { where, params: filterParams } = convertMongoQuery(filter);
          const sql = `UPDATE "${this._table}" SET "${field}" = ? WHERE ${where}`;
          this._db.prepare(sql).run(JSON.stringify(merged), ...filterParams);
        }
      }
    }
  }

  async insertOne(doc) {
    const id = doc.id || doc._id || uuidv4();
    const now = new Date().toISOString();
    const record = { ...doc, id, createdAt: doc.createdAt || now, updatedAt: doc.updatedAt || now };

    let columns = Object.keys(record);
    const tableColumns = getTableColumns(this._db, this._table);
    if (tableColumns) {
      const dropped = columns.filter((col) => !tableColumns.has(col));
      if (dropped.length > 0) {
        if (process.env.MCP_DEBUG_SQLITE) {
          console.error(
            `[sqlite] insertOne ${this._table} dropped unknown columns: ${dropped.join(', ')}`
          );
        }
        columns = columns.filter((col) => tableColumns.has(col));
      }
    }

    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((col) => {
      const val = record[col];
      if (JSON_ARRAY_FIELDS.includes(col) || JSON_OBJECT_FIELDS.includes(col)) {
        return toBindable(typeof val === 'string' ? val : JSON.stringify(val));
      }
      return toBindable(val);
    });

    const sql = `INSERT INTO "${this._table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    try {
      this._db.prepare(sql).run(...values);
      return { insertedId: id, acknowledged: true };
    } catch (err) {
      if (
        err &&
        typeof err.code === 'string' &&
        err.code.startsWith('SQLITE_CONSTRAINT') &&
        /UNIQUE|PRIMARY/i.test(err.code)
      ) {
        // Mongo-compatible duplicate-key code so existing 11000 handlers fire.
        err.code = 11000;
      }
      console.error(`[sqlite] insertOne error on ${this._table}:`, err.message);
      throw err;
    }
  }

  async insertMany(docs) {
    const results = [];
    for (const doc of docs) {
      const result = await this.insertOne(doc);
      results.push(result);
    }
    return { insertedCount: results.length, acknowledged: true };
  }

  async updateOne(filter, update, options = {}) {
    const { where, params: filterParams } = convertMongoQuery(filter);
    const updateOps = buildUpdateOps(update, getTableColumns(this._db, this._table));

    let setClause = '';
    if (updateOps.setColumns.length > 0) {
      setClause = updateOps.setColumns.join(', ');
    }

    if (setClause) {
      const sql = `UPDATE "${this._table}" SET ${setClause} WHERE ${where}`;
      let result = this._db.prepare(sql).run(...updateOps.setParams, ...filterParams);

      if (result.changes === 0 && options.upsert === true) {
        const insertDocument = buildUpsertDocument(
          filter,
          update,
          getTableColumns(this._db, this._table)
        );

        try {
          const inserted = await this.insertOne(insertDocument);
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 1,
            upsertedId: inserted.insertedId,
          };
        } catch (error) {
          // A concurrent upsert may have inserted the row between UPDATE and INSERT.
          if (!error || error.code !== 11000) {
            throw error;
          }
          result = this._db.prepare(sql).run(...updateOps.setParams, ...filterParams);
        }
      }

      if (options.addOperations) {
        for (const op of options.addOperations) {
          await this._applyAddOperation(filter, op);
        }
      }
      return {
        modifiedCount: result.changes,
        matchedCount: result.changes,
        acknowledged: true,
      };
    }

    if (options.addOperations) {
      for (const op of options.addOperations) {
        await this._applyAddOperation(filter, op);
      }
    }

    if (options.upsert === true) {
      const existing = await this.findOne(filter);
      if (!existing) {
        const insertDocument = buildUpsertDocument(
          filter,
          update,
          getTableColumns(this._db, this._table)
        );

        try {
          const inserted = await this.insertOne(insertDocument);
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 1,
            upsertedId: inserted.insertedId,
          };
        } catch (error) {
          if (!error || error.code !== 11000) {
            throw error;
          }
        }
      }
    }

    return { modifiedCount: 0, matchedCount: 0, acknowledged: true };
  }

  async updateMany(filter, update, options = {}) {
    const { where, params: filterParams } = convertMongoQuery(filter);
    const updateOps = buildUpdateOps(update, getTableColumns(this._db, this._table));

    let setClause = '';
    if (updateOps.setColumns.length > 0) {
      setClause = updateOps.setColumns.join(', ');
    }

    if (setClause) {
      const sql = `UPDATE "${this._table}" SET ${setClause} WHERE ${where}`;
      const result = this._db.prepare(sql).run(...updateOps.setParams, ...filterParams);
      return { modifiedCount: result.changes, acknowledged: true };
    }

    return { modifiedCount: 0, acknowledged: true };
  }

  async deleteOne(filter = {}) {
    const { where, params } = convertMongoQuery(filter);
    const sql = `DELETE FROM "${this._table}" WHERE ${where}`;
    const result = this._db.prepare(sql).run(...params);
    return { deletedCount: result.changes, acknowledged: true };
  }

  async deleteMany(filter = {}) {
    const { where, params } = convertMongoQuery(filter);
    const sql = `DELETE FROM "${this._table}" WHERE ${where}`;
    const result = this._db.prepare(sql).run(...params);
    return { deletedCount: result.changes, acknowledged: true };
  }

  async countDocuments(filter = {}, options = {}) {
    const { where, params } = convertMongoQuery(filter);
    const sql = `SELECT COUNT(*) as cnt FROM "${this._table}" WHERE ${where}`;
    try {
      const row = this._db.prepare(sql).get(...params);
      return row?.cnt || 0;
    } catch {
      return 0;
    }
  }

  async aggregate(pipeline) {
    const results = [];
    let currentData = this._db.prepare(`SELECT * FROM "${this._table}"`).all();

    for (const stage of pipeline) {
      if (stage.$match) {
        const { where, params } = convertMongoQuery(stage.$match);
        const sql = `SELECT * FROM "${this._table}" WHERE ${where}`;
        currentData = this._db.prepare(sql).all(...params);
      } else if (stage.$group) {
        const grouped = {};
        for (const row of currentData) {
          let key;
          if (stage.$group._id === null) {
            key = '__null__';
          } else if (typeof stage.$group._id === 'string') {
            key = row[stage.$group._id.replace('$', '')] || '__null__';
          } else {
            key = '__all__';
          }
          if (!grouped[key]) grouped[key] = { _id: key, items: [] };
          grouped[key].items.push(row);
        }
        currentData = Object.values(grouped).map((g) => {
          const result = { _id: g._id };
          for (const [field, op] of Object.entries(stage.$group)) {
            if (field === '_id') continue;
            if (op.$sum) {
              result[field] =
                op.$sum === 1
                  ? g.items.length
                  : g.items.reduce(
                      (sum, item) => sum + (Number(item[op.$sum.replace('$', '')]) || 0),
                      0
                    );
            } else if (op.$avg) {
              const vals = g.items.map((item) => Number(item[op.$avg.replace('$', '')]) || 0);
              result[field] = vals.reduce((a, b) => a + b, 0) / vals.length;
            } else if (op.$max) {
              result[field] = Math.max(
                ...g.items.map((item) => Number(item[op.$max.replace('$', '')]) || 0)
              );
            } else if (op.$min) {
              result[field] = Math.min(
                ...g.items.map((item) => Number(item[op.$min.replace('$', '')]) || 0)
              );
            }
          }
          return result;
        });
      } else if (stage.$project) {
        currentData = currentData.map((row) => {
          const result = {};
          for (const [field, include] of Object.entries(stage.$project)) {
            if (include === 1 || include === true) {
              result[field] = row[field];
            }
          }
          return result;
        });
      } else if (stage.$sort) {
        const sortEntries = Object.entries(stage.$sort);
        currentData.sort((a, b) => {
          for (const [field, dir] of sortEntries) {
            const aVal = a[field];
            const bVal = b[field];
            if (aVal < bVal) return dir > 0 ? -1 : 1;
            if (aVal > bVal) return dir > 0 ? 1 : -1;
          }
          return 0;
        });
      } else if (stage.$limit) {
        currentData = currentData.slice(0, stage.$limit);
      } else if (stage.$skip) {
        currentData = currentData.slice(stage.$skip);
      } else if (stage.$unwind) {
        const field = stage.$unwind.replace('$', '');
        const unwound = [];
        for (const row of currentData) {
          const arr = Array.isArray(row[field]) ? row[field] : [row[field]];
          for (const item of arr) {
            unwound.push({ ...row, [field]: item });
          }
        }
        currentData = unwound;
      }
    }

    return currentData;
  }

  async findOneAndDelete(filter) {
    const existing = await this.findOne(filter);
    if (existing) {
      await this.deleteOne(filter);
    }
    return existing;
  }
}

const JSON_ARRAY_FIELDS = [
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
];

const JSON_OBJECT_FIELDS = [
  'metadata',
  'outcome',
  'relationships',
  'data',
  'log_context',
  'projectDescriptor',
];
