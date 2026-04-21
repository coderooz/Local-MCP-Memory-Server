import { getRedisConfig, isFeatureEnabled } from '../../config/project-config-loader.js';

class InMemoryCache {
  constructor() {
    this._store = new Map();
  }

  async get(key) {
    const item = this._store.get(key);
    if (!item) return null;
    
    if (item.expiry && Date.now() > item.expiry) {
      this._store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key, value, ttl = 3600) {
    const expiry = ttl ? Date.now() + (ttl * 1000) : null;
    this._store.set(key, { value, expiry });
  }

  async del(key) {
    this._store.delete(key);
  }

  async exists(key) {
    const item = this._store.get(key);
    if (!item) return 0;
    if (item.expiry && Date.now() > item.expiry) {
      this._store.delete(key);
      return 0;
    }
    return 1;
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this._store.keys()).filter(k => regex.test(k));
  }

  async flush() {
    this._store.clear();
  }

  async ping() {
    return true;
  }

  isHealthy() {
    return true;
  }
}

class RedisAdapter {
  constructor() {
    this._client = null;
    this._connected = false;
    this._useMemory = false;
    this._memoryFallback = new InMemoryCache();
    this._config = null;
  }

  async initialize() {
    this._config = getRedisConfig();
    
    if (!this._config.enabled && !isFeatureEnabled('redis')) {
      console.log('[Redis] Disabled in config, using in-memory fallback');
      this._useMemory = true;
      return;
    }

    if (!this._config.url) {
      console.log('[Redis] No URL configured, using in-memory fallback');
      this._useMemory = true;
      return;
    }

    try {
      const { default: Redis } = await import('redis');
      
      this._client = Redis.createClient({
        url: this._config.url,
        socket: {
          connectTimeout: this._config.connection?.connectTimeout || 5000,
          reconnectStrategy: (retries) => {
            if (retries > (this._config.connection?.maxRetries || 3)) {
              return new Error('Max retries reached');
            }
            return Math.min(retries * (this._config.connection?.retryDelay || 1000), 5000);
          }
        }
      });

      this._client.on('error', (err) => {
        console.error('[Redis] Client error:', err.message);
      });

      this._client.on('connect', () => {
        this._connected = true;
        console.log('[Redis] Connected to', this._config.url);
      });

      this._client.on('disconnect', () => {
        this._connected = false;
        console.log('[Redis] Disconnected');
      });

      await this._client.connect();
      await this._client.ping();
      this._useMemory = false;
      
    } catch (error) {
      console.warn('[Redis] Connection failed:', error.message);
      
      if (this._config.fallbackToMemory) {
        console.log('[Redis] Using in-memory fallback');
        this._useMemory = true;
      } else {
        throw error;
      }
    }
  }

  async get(key) {
    const prefixedKey = this._prefixKey(key);
    
    if (this._useMemory) {
      return this._memoryFallback.get(prefixedKey);
    }
    
    try {
      const value = await this._client.get(this._prefixKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[Redis] Get error:', error.message);
      if (this._config.fallbackToMemory) {
        return this._memoryFallback.get(key);
      }
      throw error;
    }
  }

  async set(key, value, ttl) {
    const prefixedKey = this._prefixKey(key);
    const stringValue = JSON.stringify(value);
    
    if (this._useMemory) {
      return this._memoryFallback.set(prefixedKey, value, ttl);
    }
    
    try {
      if (ttl) {
        await this._client.setEx(prefixedKey, ttl, stringValue);
      } else {
        await this._client.set(prefixedKey, stringValue);
      }
    } catch (error) {
      console.error('[Redis] Set error:', error.message);
      if (this._config.fallbackToMemory) {
        return this._memoryFallback.set(prefixedKey, value, ttl);
      }
      throw error;
    }
  }

  async del(key) {
    const prefixedKey = this._prefixKey(key);
    
    if (this._useMemory) {
      return this._memoryFallback.del(prefixedKey);
    }
    
    try {
      await this._client.del(prefixedKey);
    } catch (error) {
      console.error('[Redis] Del error:', error.message);
      if (this._config.fallbackToMemory) {
        return this._memoryFallback.del(prefixedKey);
      }
      throw error;
    }
  }

  async exists(key) {
    const prefixedKey = this._prefixKey(key);
    
    if (this._useMemory) {
      return this._memoryFallback.exists(prefixedKey);
    }
    
    try {
      return await this._client.exists(prefixedKey);
    } catch (error) {
      console.error('[Redis] Exists error:', error.message);
      if (this._config.fallbackToMemory) {
        return this._memoryFallback.exists(prefixedKey);
      }
      throw error;
    }
  }

  async keys(pattern) {
    const prefixedPattern = this._prefixKey(pattern);
    
    if (this._useMemory) {
      return this._memoryFallback.keys(prefixedPattern);
    }
    
    try {
      const keys = await this._client.keys(prefixedPattern);
      return keys.map(k => k.replace(this._config.keyPrefix || 'mcp:', ''));
    } catch (error) {
      console.error('[Redis] Keys error:', error.message);
      if (this._config.fallbackToMemory) {
        return this._memoryFallback.keys(prefixedPattern);
      }
      throw error;
    }
  }

  async flush() {
    if (this._useMemory) {
      return this._memoryFallback.flush();
    }
    
    try {
      await this._client.flushDb();
    } catch (error) {
      console.error('[Redis] Flush error:', error.message);
      throw error;
    }
  }

  async ping() {
    if (this._useMemory) {
      return this._memoryFallback.ping();
    }
    
    try {
      await this._client.ping();
      return true;
    } catch {
      return false;
    }
  }

  isHealthy() {
    return this._useMemory || this._connected;
  }

  isUsingMemoryFallback() {
    return this._useMemory;
  }

  _prefixKey(key) {
    const prefix = this._config?.keyPrefix || 'mcp:';
    return `${prefix}${key}`;
  }

  async shutdown() {
    if (this._client && this._connected) {
      await this._client.quit();
      this._connected = false;
    }
  }
}

let redisInstance = null;

export async function getRedisAdapter() {
  if (!redisInstance) {
    redisInstance = new RedisAdapter();
    await redisInstance.initialize();
  }
  return redisInstance;
}

export async function resetRedisAdapter() {
  if (redisInstance) {
    await redisInstance.shutdown();
    redisInstance = null;
  }
}

export { RedisAdapter, InMemoryCache };
export default { getRedisAdapter, resetRedisAdapter, RedisAdapter, InMemoryCache };