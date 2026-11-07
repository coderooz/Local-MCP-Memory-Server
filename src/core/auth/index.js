/**
 * Authentication Module
 *
 * Provides JWT token authentication and API key management.
 * Supports both token-based auth (for dashboard) and API key auth (for programmatic access).
 *
 * Storage:
 *  - Users and API keys live in the per-user CONFIG directory, separate from
 *    the database (see `src/core/paths/index.js`).
 *  - API keys are stored as SHA-256 hashes; the plaintext key is returned once
 *    at creation time and never persisted.
 *  - The JWT signing secret is generated once and persisted in `secrets.json`
 *    (mode 0600) so tokens survive server restarts and multiple processes.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../paths/index.js';

const DEFAULT_JWT_EXPIRY = '7d';
const API_KEY_LENGTH = 48;
const API_KEY_PREFIX = 'mcp_';
const API_KEY_ID_PREFIX = 'key_';
const STORE_VERSION = 2;

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function writePrivateFile(filePath, contents) {
  writeFileSync(filePath, contents, { encoding: 'utf8', mode: 0o600 });
}

class AuthManager {
  constructor(options = {}) {
    this.configDir = options.dataDir || options.configDir || getConfigDir();
    // Kept for backwards compatibility with callers that read `dataDir`.
    this.dataDir = this.configDir;
    this.keysFile = join(this.configDir, 'api-keys.json');
    this.usersFile = join(this.configDir, 'users.json');
    this.secretsFile = join(this.configDir, 'secrets.json');
    this.jwtExpiry = options.jwtExpiry || process.env.JWT_EXPIRY || DEFAULT_JWT_EXPIRY;
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || this._loadOrCreateJwtSecret();
    this._apiKeys = new Map();
    this._users = new Map();
    this._loadKeys();
    this._loadUsers();
  }

  _generateSecret() {
    return crypto.randomBytes(48).toString('base64');
  }

  _ensureConfigDir() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Read the persisted JWT secret, generating and storing one on first run.
   * Falls back to an ephemeral secret (with a warning) if the config directory
   * is not writable, so the server still starts in read-only environments.
   */
  _loadOrCreateJwtSecret() {
    try {
      if (existsSync(this.secretsFile)) {
        const data = JSON.parse(readFileSync(this.secretsFile, 'utf8'));
        if (data && typeof data.jwtSecret === 'string' && data.jwtSecret.length >= 32) {
          return data.jwtSecret;
        }
      }
    } catch {
      // Corrupt secrets file: regenerate below rather than failing to start.
    }

    const secret = this._generateSecret();
    try {
      this._ensureConfigDir();
      let existing = {};
      if (existsSync(this.secretsFile)) {
        try {
          existing = JSON.parse(readFileSync(this.secretsFile, 'utf8')) || {};
        } catch {
          existing = {};
        }
      }
      writePrivateFile(
        this.secretsFile,
        `${JSON.stringify({ ...existing, jwtSecret: secret }, null, 2)}\n`
      );
    } catch (error) {
      process.stderr.write(
        `[auth] WARN: could not persist JWT secret (${error.message}). ` +
          'Tokens will not survive a restart.\n'
      );
    }
    return secret;
  }

  _readJson(filePath, fallback) {
    try {
      if (!existsSync(filePath)) return fallback;
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  _loadKeys() {
    const data = this._readJson(this.keysFile, null);
    if (!data) return;

    if (data.version === STORE_VERSION && Array.isArray(data.keys)) {
      for (const entry of data.keys) {
        if (entry && typeof entry.hash === 'string') {
          this._apiKeys.set(entry.hash, entry);
        }
      }
      return;
    }

    // Legacy store: a map keyed by the plaintext API key. Migrate to hashes
    // in place so existing keys keep working without re-issuing them.
    let migrated = false;
    for (const [rawKey, meta] of Object.entries(data || {})) {
      if (!rawKey.startsWith(API_KEY_PREFIX) || !meta || typeof meta !== 'object') continue;
      const entry = this._toStoredKey(rawKey, meta);
      this._apiKeys.set(entry.hash, entry);
      migrated = true;
    }
    if (migrated) {
      this._saveKeys();
    }
  }

  _toStoredKey(rawKey, meta = {}) {
    return {
      keyId: meta.keyId || `${API_KEY_ID_PREFIX}${crypto.randomBytes(8).toString('hex')}`,
      hash: hashApiKey(rawKey),
      // Masked display form only. Never the plaintext key.
      preview: `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`,
      name: meta.name || 'api-key',
      permissions: Array.isArray(meta.permissions) ? meta.permissions : ['read'],
      project: meta.project || null,
      createdAt: meta.createdAt || new Date().toISOString(),
      expiresAt: meta.expiresAt || null,
      lastUsed: meta.lastUsed || null,
      usageCount: Number.isInteger(meta.usageCount) ? meta.usageCount : 0,
    };
  }

  _saveKeys() {
    this._ensureConfigDir();
    const payload = {
      version: STORE_VERSION,
      keys: Array.from(this._apiKeys.values()),
    };
    writePrivateFile(this.keysFile, `${JSON.stringify(payload, null, 2)}\n`);
  }

  _loadUsers() {
    const data = this._readJson(this.usersFile, null);
    if (!data) return;
    for (const [username, userData] of Object.entries(data)) {
      this._users.set(username, userData);
    }
  }

  _saveUsers() {
    this._ensureConfigDir();
    const data = Object.fromEntries(this._users);
    writePrivateFile(this.usersFile, `${JSON.stringify(data, null, 2)}\n`);
  }

  /**
   * Create a new user
   */
  createUser(username, password, role = 'user') {
    if (this._users.has(username)) {
      throw new Error('User already exists');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');

    const user = {
      username,
      salt,
      hash,
      role,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };

    this._users.set(username, user);
    this._saveUsers();
    return { username, role, createdAt: user.createdAt };
  }

  /**
   * True when no user account exists yet (used to bootstrap the first admin).
   */
  hasUsers() {
    return this._users.size > 0;
  }

  /**
   * Verify user credentials
   */
  verifyUser(username, password) {
    const user = this._users.get(username);
    if (!user) {
      return false;
    }

    const hash = crypto.pbkdf2Sync(password, user.salt, 100000, 64, 'sha512').toString('hex');
    if (!safeEqual(hash, user.hash)) {
      return false;
    }

    user.lastLogin = new Date().toISOString();
    this._saveUsers();
    return true;
  }

  getRole(username) {
    return this._users.get(username)?.role || null;
  }

  /**
   * Generate JWT token
   */
  generateToken(payload) {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiry });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch {
      return null;
    }
  }

  /**
   * Create API key
   *
   * The plaintext key is returned exactly once. Only its SHA-256 hash is stored.
   *
   * @param {string} name - human label for the key
   * @param {string[]} permissions - capability list (e.g. ['read','write','admin'])
   * @param {string|null} expiresAt - ISO expiry or null
   * @param {string|null} project - optional project scope; keys with a project
   *   are denied access to other projects' resources (403)
   */
  createApiKey(name, permissions = ['read'], expiresAt = null, project = null) {
    const key = API_KEY_PREFIX + crypto.randomBytes(API_KEY_LENGTH).toString('hex');
    const entry = this._toStoredKey(key, {
      name,
      permissions,
      project,
      createdAt: new Date().toISOString(),
      expiresAt,
      lastUsed: null,
      usageCount: 0,
    });

    this._apiKeys.set(entry.hash, entry);
    this._saveKeys();

    const { hash: _hash, ...meta } = entry;
    return { key, ...meta };
  }

  /**
   * Validate API key
   */
  validateApiKey(key) {
    if (!key || typeof key !== 'string' || !key.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const entry = this._apiKeys.get(hashApiKey(key));
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      return null;
    }

    entry.lastUsed = new Date().toISOString();
    entry.usageCount++;
    this._saveKeys();

    const { hash: _hash, ...meta } = entry;
    return meta;
  }

  /**
   * Revoke API key by plaintext key or by `keyId` (as returned by listApiKeys).
   */
  revokeApiKey(identifier) {
    if (!identifier || typeof identifier !== 'string') {
      return false;
    }

    let hash = null;
    if (identifier.startsWith(API_KEY_PREFIX)) {
      hash = hashApiKey(identifier);
    } else {
      for (const [candidateHash, entry] of this._apiKeys) {
        if (entry.keyId === identifier) {
          hash = candidateHash;
          break;
        }
      }
    }

    if (!hash || !this._apiKeys.has(hash)) {
      return false;
    }

    this._apiKeys.delete(hash);
    this._saveKeys();
    return true;
  }

  /**
   * List all API keys (redacted, never includes hashes or plaintext).
   */
  listApiKeys() {
    return Array.from(this._apiKeys.values()).map((entry) => ({
      keyId: entry.keyId,
      key: entry.preview,
      name: entry.name,
      permissions: entry.permissions,
      project: entry.project,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      lastUsed: entry.lastUsed,
      usageCount: entry.usageCount,
    }));
  }

  /**
   * Aggregate counts for health endpoints.
   */
  getStats() {
    return {
      userCount: this._users.size,
      keyCount: this._apiKeys.size,
    };
  }
}

let _instance = null;

function getAuthManager(options) {
  if (!_instance) {
    _instance = new AuthManager(options);
  }
  return _instance;
}

/**
 * Reset the singleton. Intended for tests only.
 */
function resetAuthManager() {
  _instance = null;
}

/**
 * Middleware: JWT or API key authentication
 *
 * Accepts:
 *   - `Authorization: Bearer <JWT>`
 *   - `Authorization: Bearer mcp_...` (API key passed as bearer)
 *   - `X-API-Key: mcp_...` header or `?api_key=mcp_...` query parameter
 */
function requireAuth(req, res, next) {
  const authManager = getAuthManager();

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    const payload = authManager.verifyToken(token);
    if (payload) {
      req.user = payload;
      return next();
    }

    // API keys are accepted in the bearer slot for client convenience.
    const bearerKeyMeta = authManager.validateApiKey(token);
    if (bearerKeyMeta) {
      req.apiKey = bearerKeyMeta;
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey) {
    const meta = authManager.validateApiKey(apiKey);
    if (meta) {
      req.apiKey = meta;
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired API key.',
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required. Provide a valid JWT token or API key.',
  });
}

/**
 * Middleware: API key authentication
 */
function requireApiKey(req, res, next) {
  const authManager = getAuthManager();

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required. Provide via X-API-Key header or api_key query parameter.',
    });
  }

  const meta = authManager.validateApiKey(apiKey);
  if (!meta) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired API key.',
    });
  }

  req.apiKey = meta;
  next();
}

/**
 * Middleware: Optional auth (JWT or API key, or unauthenticated)
 */
function optionalAuth(req, res, next) {
  const authManager = getAuthManager();

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = authManager.verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey) {
    const meta = authManager.validateApiKey(apiKey);
    if (meta) {
      req.apiKey = meta;
    }
  }

  next();
}

/**
 * Middleware: Role-based access control
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${roles.join(' or ')}`,
      });
    }

    next();
  };
}

export {
  AuthManager,
  getAuthManager,
  resetAuthManager,
  requireAuth,
  requireApiKey,
  optionalAuth,
  requireRole,
  hashApiKey,
  API_KEY_PREFIX,
};
