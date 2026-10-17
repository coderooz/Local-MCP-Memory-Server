/**
 * MCP Registry — Credential Encryption at Rest
 *
 * AES-256-GCM encryption for the mcp_servers.auth_config column.
 * Value format: `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`
 *
 * Key derivation: HKDF-SHA256 from MCP_MASTER_SECRET (falls back to config
 * master secret via environment). If no secret is configured:
 *   - writes degrade to plaintext JSON (dev ergonomics) + one-time warning
 *   - reads of ciphertext fail closed with ENCRYPTION_UNAVAILABLE
 *
 * Uses only node:crypto — no new dependencies.
 */

import crypto from 'node:crypto';

const ENC_PREFIX = 'enc:v1:';
const HKDF_SALT = 'local-mcp-memory-auth-v1';
const HKDF_INFO = 'mcp-registry-auth-config-v1';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce size

let warnedNoSecret = false;

function getSecret() {
  return process.env.MCP_MASTER_SECRET || null;
}

/**
 * Whether encryption-at-rest is currently active.
 */
export function isEncryptionEnabled() {
  return Boolean(getSecret());
}

/**
 * Status string for health output: 'enabled' | 'disabled'.
 */
export function getEncryptionStatus() {
  return isEncryptionEnabled() ? 'enabled' : 'disabled';
}

/**
 * One-time startup/ops warning when encryption is unavailable.
 * Safe to call from multiple places — logs at most once.
 */
export function warnIfEncryptionDisabled() {
  if (!isEncryptionEnabled() && !warnedNoSecret) {
    warnedNoSecret = true;
    console.error(
      '[mcp-registry] WARNING: MCP_MASTER_SECRET is not set — auth_config credentials are stored in PLAINTEXT. Set MCP_MASTER_SECRET to enable AES-256-GCM encryption at rest.'
    );
  }
}

function deriveKey(secret) {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), HKDF_SALT, HKDF_INFO, KEY_BYTES)
  );
}

/**
 * Encrypt an auth_config object.
 *
 * @param {object} authConfig - plaintext credential object
 * @returns {string} `enc:v1:...` ciphertext, or plaintext JSON when no
 *                   secret is configured (with one-time warning), or
 *                   JSON.stringify of the input when there is nothing to encrypt
 */
export function encryptAuthConfig(authConfig) {
  if (authConfig === null || authConfig === undefined) return JSON.stringify({});
  if (typeof authConfig === 'string') return authConfig; // already encoded — pass through
  if (typeof authConfig !== 'object' || Array.isArray(authConfig)) return JSON.stringify({});

  const keys = Object.keys(authConfig);
  if (keys.length === 0) return JSON.stringify({});

  const secret = getSecret();
  if (!secret) {
    warnIfEncryptionDisabled();
    return JSON.stringify(authConfig);
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(authConfig), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt an auth_config column value.
 *
 * Accepts: `enc:v1:` ciphertext (requires MCP_MASTER_SECRET), legacy plaintext
 * JSON strings, and already-inflated objects (returned as-is).
 *
 * @returns {object} plaintext auth_config object
 * @throws {Error} code ENCRYPTION_UNAVAILABLE when ciphertext exists but no
 *                 secret is configured (fail closed — never guess credentials)
 * @throws {Error} code AUTH_DECRYPT_FAILED on tamper/corruption
 */
export function decryptAuthConfig(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};

  if (!value.startsWith(ENC_PREFIX)) {
    // Legacy plaintext row (pre-encryption) — parse as JSON.
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  const secret = getSecret();
  if (!secret) {
    const err = new Error(
      'Cannot decrypt auth_config: MCP_MASTER_SECRET is not configured on this instance'
    );
    err.code = 'ENCRYPTION_UNAVAILABLE';
    throw err;
  }

  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    const err = new Error('auth_config ciphertext is malformed');
    err.code = 'AUTH_DECRYPT_FAILED';
    throw err;
  }

  const [ivB64, tagB64, ctB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret),
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (cause) {
    if (cause?.code === 'ENCRYPTION_UNAVAILABLE') throw cause;
    const err = new Error('auth_config decryption failed (wrong secret or corrupted data)');
    err.code = 'AUTH_DECRYPT_FAILED';
    err.cause = cause;
    throw err;
  }
}

/**
 * Whether a column value is ciphertext.
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}
