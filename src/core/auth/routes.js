/**
 * Authentication Routes
 *
 * Handles login, user registration, token refresh, and API key management.
 */

import { getAuthManager, requireAuth, requireRole } from './index.js';

/**
 * Register auth routes on an Express app
 */
export function registerAuthRoutes(app) {
  const auth = getAuthManager();

  // POST /auth/login - Authenticate and get JWT token
  app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required.',
      });
    }

    if (!auth.verifyUser(username, password)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials.',
      });
    }

    const token = auth.generateToken({
      username,
      role: auth._users.get(username)?.role || 'user',
    });

    res.json({
      success: true,
      token,
      expiresIn: auth.jwtExpiry,
    });
  });

  // POST /auth/register - Create new user (admin only in production)
  app.post('/auth/register', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters.',
      });
    }

    try {
      const user = auth.createUser(username, password, role || 'user');
      res.json({
        success: true,
        user,
      });
    } catch (err) {
      res.status(409).json({
        success: false,
        error: err.message,
      });
    }
  });

  // GET /auth/me - Get current user info
  app.get('/auth/me', requireAuth, (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  });

  // POST /auth/refresh - Refresh JWT token
  app.post('/auth/refresh', requireAuth, (req, res) => {
    const token = auth.generateToken({
      username: req.user.username,
      role: req.user.role,
    });

    res.json({
      success: true,
      token,
      expiresIn: auth.jwtExpiry,
    });
  });

  // POST /auth/api-keys - Create API key
  app.post('/auth/api-keys', requireAuth, (req, res) => {
    const { name, permissions, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'API key name required.',
      });
    }

    const apiKey = auth.createApiKey(name, permissions || ['read'], expiresAt || null);

    res.json({
      success: true,
      apiKey,
    });
  });

  // GET /auth/api-keys - List API keys
  app.get('/auth/api-keys', requireAuth, (req, res) => {
    const keys = auth.listApiKeys();
    res.json({
      success: true,
      keys,
    });
  });

  // DELETE /auth/api-keys/:key - Revoke API key
  app.delete('/auth/api-keys/:key', requireAuth, (req, res) => {
    const fullKey = req.params.key;
    const revoked = auth.revokeApiKey(fullKey);

    res.json({
      success: revoked,
      message: revoked ? 'API key revoked.' : 'API key not found.',
    });
  });

  // GET /auth/health - Auth system health check
  app.get('/auth/health', (req, res) => {
    res.json({
      success: true,
      auth: {
        jwtEnabled: true,
        apiKeyEnabled: true,
        userCount: auth._users.size,
        keyCount: auth._apiKeys.size,
      },
    });
  });
}
