# Security, Authentication, and Secrets Management

## 1. Secrets Management & Persistent Credentials

### 1.1 Persistent Key Storage
Secrets are stored in the user's secure application data directory:
- **Windows:** `%APPDATA%\local-mcp-memory\secrets.json`
- **Linux/macOS:** `~/.config/local-mcp-memory/secrets.json`
- File system permissions: Restricted read/write access (mode `0600` on POSIX).

### 1.2 JWT Secret Generation & Preservation
- In early versions, missing `JWT_SECRET` caused ephemeral random keys to be generated in memory, invalidating dashboard sessions upon any server restart.
- In v2.6.0, `src/core/auth/` automatically generates a cryptographically secure 256-bit random key on first launch, stores it in `secrets.json`, and reloads it on subsequent boots. Tokens remain valid across server restarts.

---

## 2. Master Secret & AES-256-GCM Credential Encryption

When registering external upstream MCP servers via the MCP Registry subsystem ([`src/core/mcp-registry/crypto.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/mcp-registry/crypto.js)):
1. **Encryption Standard:** AES-256-GCM with HKDF-SHA256 key derivation.
2. **Ciphertext Format:** `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
3. **Master Key:** Derived from environment variable `MCP_MASTER_SECRET` or persisted instance secret.
4. **Fail-Closed Security:** If an upstream server requires authentication and `MCP_MASTER_SECRET` is missing, decryption throws `ENCRYPTION_UNAVAILABLE` rather than transmitting compromised tokens.
5. **Masking:** API keys and credentials retrieved via `listServers()` or HTTP routes are automatically masked (`sk-****1234`).

---

## 3. Authentication & Role-Based Access Control

### 3.1 Public Registration Role Enforcement
- **Vulnerability Addressed:** In early audits, unauthenticated registration allowed clients to submit arbitrary role fields (`role: 'admin'`).
- **Remediation:** Registration endpoints enforce strict server-side role assignment:
  - First registered user automatically becomes `admin`.
  - All subsequent registered users receive the default `user` role regardless of caller payload.
  - Privileged role escalation requires explicit admin approval or database administrator intervention.

### 3.2 Human User vs. AI Agent Identity Segregation
- **Human Identity:** Authenticated via standard JWT bearer tokens (`Authorization: Bearer <token>`) managed by `/auth/login`.
- **AI Agent Identity:** Identified through MCP session headers (`X-MCP-Agent`, `X-MCP-Project`, `X-MCP-Session-Id`) and scoped via session management middleware ([`src/core/session/index.js`](file:///C:/Code_Works/HTML_CSS_JS/workProjects/projects/local-mcp-memory/src/core/session/index.js)).
- Agents are subject to dedicated rate limiting (`agentRateLimiter`) distinct from interactive web UI rate limiters.
