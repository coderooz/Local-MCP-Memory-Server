import { getKnowledgeBaseConfig, isFeatureEnabled, getConfigValue } from '../../config/project-config-loader.js';
import { getRedisAdapter } from '../redis/redis-adapter.js';
import { getDbInstance } from '../../../server.js';

const DEFAULT_INDEX_FIELDS = ['title', 'content', 'tags', 'type'];

class KnowledgeStore {
  constructor() {
    this._config = null;
    this._redis = null;
    this._db = null;
    this._initialized = false;
  }

  async initialize() {
    this._config = getKnowledgeBaseConfig();
    
    if (!this._config.enabled && !isFeatureEnabled('knowledgeBase')) {
      console.log('[KnowledgeBase] Disabled in config');
      this._initialized = true;
      return;
    }

    try {
      this._db = getDbInstance();
    } catch (error) {
      console.warn('[KnowledgeBase] Database not ready, using in-memory fallback');
      this._db = null;
    }

    if (this._config.redisBacked && isFeatureEnabled('redis')) {
      try {
        this._redis = await getRedisAdapter();
        console.log('[KnowledgeBase] Redis-backed indexing enabled');
      } catch (error) {
        console.warn('[KnowledgeBase] Redis unavailable, using MongoDB only');
      }
    }

    await this._ensureIndexes();
    this._initialized = true;
    console.log('[KnowledgeBase] Initialized');
  }

  async _ensureIndexes() {
    if (!this._db) return;
    
    try {
      const collection = this._db.collection('knowledge');
      
      await collection.createIndex({ project: 1, type: 1 });
      await collection.createIndex({ project: 1, tags: 1 });
      await collection.createIndex({ project: 1, title: 'text', content: 'text' });
      await collection.createIndex({ createdAt: -1 });
      
    } catch (error) {
      console.error('[KnowledgeBase] Index creation error:', error.message);
    }
  }

  async store(data, metadata = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const doc = {
      _id: metadata.id || this._generateId(),
      project: metadata.project || getConfigValue('project.name'),
      type: metadata.type || 'document',
      title: data.title || 'Untitled',
      content: data.content || '',
      tags: data.tags || [],
      metadata: metadata.extra || {},
      createdBy: metadata.agent || 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    if (this._db) {
      await this._db.collection('knowledge').insertOne(doc);
    }

    if (this._redis && this._config.redisBacked) {
      const indexKey = `knowledge:index:${doc.project}:${doc.type}`;
      const existing = await this._redis.get(indexKey) || [];
      existing.push({ id: doc._id, title: doc.title, tags: doc.tags });
      await this._redis.set(indexKey, existing, this._config.indexing?.ttl || 3600);
    }

    return { id: doc._id, success: true };
  }

  async query(criteria = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const project = criteria.project || getConfigValue('project.name');
    const limit = criteria.limit || this._config.search?.limit || 10;
    const offset = criteria.offset || 0;

    const filter = { project };

    if (criteria.type) {
      filter.type = criteria.type;
    }

    if (criteria.tags && criteria.tags.length > 0) {
      filter.tags = { $in: criteria.tags };
    }

    if (criteria.query) {
      const searchConfig = this._config.search || {};
      
      if (searchConfig.fuzzyMatch) {
        filter.$or = [
          { title: { $regex: criteria.query, $options: 'i' } },
          { content: { $regex: criteria.query, $options: 'i' } }
        ];
      } else {
        filter.$text = { $search: criteria.query };
      }
    }

    if (this._db) {
      const results = await this._db.collection('knowledge')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      return results;
    }

    return [];
  }

  async get(id, project = null) {
    if (!this._initialized) {
      await this.initialize();
    }

    const proj = project || getConfigValue('project.name');

    if (this._db) {
      return await this._db.collection('knowledge').findOne({ _id: id, project: proj });
    }

    return null;
  }

  async update(id, data, metadata = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const project = metadata.project || getConfigValue('project.name');
    const update = {
      $set: {
        updatedAt: new Date(),
        version: metadata.version ? metadata.version + 1 : 1
      }
    };

    if (data.title) update.$set.title = data.title;
    if (data.content) update.$set.content = data.content;
    if (data.tags) update.$set.tags = data.tags;
    if (metadata.extra) update.$set.metadata = metadata.extra;

    if (this._db) {
      await this._db.collection('knowledge').updateOne(
        { _id: id, project },
        update
      );
    }

    return { id, success: true };
  }

  async delete(id, project = null) {
    if (!this._initialized) {
      await this.initialize();
    }

    const proj = project || getConfigValue('project.name');

    if (this._db) {
      await this._db.collection('knowledge').deleteOne({ _id: id, project: proj });
    }

    if (this._redis && this._config.redisBacked) {
      const indexKey = `knowledge:index:${proj}`;
      const existing = await this._redis.get(indexKey) || [];
      const filtered = existing.filter(item => item.id !== id);
      await this._redis.set(indexKey, filtered, this._config.indexing?.ttl || 3600);
    }

    return { id, success: true };
  }

  async count(criteria = {}) {
    if (!this._db) return 0;

    const project = criteria.project || getConfigValue('project.name');
    const filter = { project };

    if (criteria.type) {
      filter.type = criteria.type;
    }

    return await this._db.collection('knowledge').countDocuments(filter);
  }

  _generateId() {
    return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  isHealthy() {
    return this._initialized;
  }
}

let knowledgeInstance = null;

export async function getKnowledgeStore() {
  if (!knowledgeInstance) {
    knowledgeInstance = new KnowledgeStore();
    await knowledgeInstance.initialize();
  }
  return knowledgeInstance;
}

export async function resetKnowledgeStore() {
  knowledgeInstance = null;
}

export { KnowledgeStore };
export default { getKnowledgeStore, resetKnowledgeStore, KnowledgeStore };