/**
 * Authentication Module
 *
 * Provides JWT token authentication and API key management.
 * Supports both token-based auth (for dashboard) and API key auth (for programmatic access).
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_JWT_EXPIRY = '7d';
const API_KEY_LENGTH = 48;
const API_KEY_PREFIX = 'mcp_';

class AuthManager {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || this._generateSecret();
    this.jwtExpiry = options.jwtExpiry || process.env.JWT_EXPIRY || DEFAULT_JWT_EXPIRY;
    this.dataDir = options.dataDir || join(__dirname, '..', '..', '..', 'data');
    this.keysFile = join(this.dataDir, 'api-keys.json');
    this.usersFile = join(this.dataDir, 'users.json');
    this._apiKeys = new Map();
    this._users = new Map();
    this._loadKeys();
    this._loadUsers();
  }

  _generateSecret() {
    return crypto.randomBytes(48).toString('base64');
  }

  _ensureDataDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadKeys() {
    try {
      if (existsSync(this.keysFile)) {
        const data = JSON.parse(readFileSync(this.keysFile, 'utf-8'));
        for (const [key, meta] of Object.entries(data)) {
          this._apiKeys.set(key, meta);
        }
      }
    } catch {
      this._apiKeys = new Map();
    }
  }

  _saveKeys() {
    this._ensureDataDir();
    const data = Object.fromEntries(this._apiKeys);
    writeFileSync(this.keysFile, JSON.stringify(data, null, 2));
  }

  _loadUsers() {
    try {
      if (existsSync(this.usersFile)) {
        const data = JSON.parse(readFileSync(this.usersFile, 'utf-8'));
        for (const [username, userData] of Object.entries(data)) {
          this._users.set(username, userData);
        }
      }
    } catch {
      this._users = new Map();
    }
  }

  _saveUsers() {
    this._ensureDataDir();
    const data = Object.fromEntries(this._users);
    writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
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
   * Verify user credentials
   */
  verifyUser(username, password) {
    const user = this._users.get(username);
    if (!user) {
      return false;
    }

    const hash = crypto.pbkdf2Sync(password, user.salt, 100000, 64, 'sha512').toString('hex');
    return hash === user.hash;
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
   * @param {string} name - human label for the key
   * @param {string[]} permissions - capability list (e.g. ['read','write','admin'])
   * @param {string|null} expiresAt - ISO expiry or null
   * @param {string|null} project - optional project scope; keys with a project
   *   are denied access to other projects' resources (403)
   */
  createApiKey(name, permissions = ['read'], expiresAt = null, project = null) {
    const key = API_KEY_PREFIX + crypto.randomBytes(API_KEY_LENGTH).toString('hex');
    const meta = {
      name,
      permissions,
      project,
      createdAt: new Date().toISOString(),
      expiresAt,
      lastUsed: null,
      usageCount: 0,
    };

    this._apiKeys.set(key, meta);
    this._saveKeys();
    return { key, ...meta };
  }

  /**
   * Validate API key
   */
  validateApiKey(key) {
    if (!key || !key.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const meta = this._apiKeys.get(key);
    if (!meta) {
      return null;
    }

    if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
      return null;
    }

    meta.lastUsed = new Date().toISOString();
    meta.usageCount++;
    this._saveKeys();

    return meta;
  }

  /**
   * Revoke API key
   */
  revokeApiKey(key) {
    const deleted = this._apiKeys.delete(key);
    if (deleted) {
      this._saveKeys();
    }
    return deleted;
  }

  /**
   * List all API keys (redacted)
   */
  listApiKeys() {
    return Array.from(this._apiKeys.entries()).map(([key, meta]) => ({
      key: key.substring(0, 8) + '...' + key.substring(key.length - 4),
      ...meta,
    }));
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
  requireAuth,
  requireApiKey,
  optionalAuth,
  requireRole,
  API_KEY_PREFIX,
};
