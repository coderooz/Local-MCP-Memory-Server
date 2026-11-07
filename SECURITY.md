# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.6.x   | :white_check_mark: |
| 2.5.x   | :warning: (Legacy) |
| < 2.5   | :x:                |

---

## Security Architecture

`local-mcp-memory` manages multi-agent context, coordination metadata, task state, and external MCP server connections for AI development agents. The security architecture is designed with local-first, defense-in-depth principles:

### 1. Authentication & Authorization

- **JWT Authentication:** Implemented via `jsonwebtoken`. Generates HMAC-SHA256 tokens for authenticated dashboard access and administrative API routes. Token expiry defaults to `7d` (configurable via `JWT_EXPIRY`).
- **Signing Key Security:** The JWT signing secret is generated on first startup (48 bytes cryptographically secure random) and persisted in `secrets.json` with restricted `0600` file permissions in the user's configuration directory. It can be overridden via the `JWT_SECRET` environment variable.
- **API Key Management:** Supports programmatic API keys with the `mcp_` prefix. API keys are hashed with SHA-256 before storage in `api-keys.json`. Plaintext keys are shown once upon creation and are never stored. Timing-safe equality comparisons (`crypto.timingSafeEqual`) are used to prevent timing attacks.
- **Protected Endpoints:** Administrative endpoints (`/auth/me`, `/auth/refresh`, `/auth/api-keys`, `/auth/api-keys/:key`) strictly require valid JWT or API key authentication.
- **Public & Optional Endpoints:** Status and health endpoints (`/health`, `/health/detailed`, `/auth/health`) and dashboard landing pages are public. Memory and task data routes accept optional authentication to record caller identity.

### 2. Encryption at Rest

- **External MCP Server Credentials:** Authentication configurations (Bearer tokens, API keys) stored in the `mcp_servers` table (`auth_config` column) are encrypted using **AES-256-GCM** with HKDF-SHA256 key derivation when `MCP_MASTER_SECRET` is set. Nonces (12 bytes) and authentication tags (16 bytes) are verified on read.
- **Fail-Closed Policy:** Ciphertext reads fail closed with `ENCRYPTION_UNAVAILABLE` if `MCP_MASTER_SECRET` is missing, and throw `AUTH_TAG_VERIFICATION_FAILED` if ciphertext or tags are tampered with.
- **Database Files:** General SQLite memory data (`mcp-memory.db`) is stored in standard SQLite format without full-database encryption. Use OS-level filesystem encryption (BitLocker, FileVault, LUKS) for environments requiring full encryption at rest.

### 3. Local Isolation & Transport Security

- **Loopback Binding:** By default, HTTP servers and MCP stdio streams bind strictly to loopback (`127.0.0.1` / `localhost`). They are not exposed to external networks unless explicitly configured.
- **Remote Access:** When exposing endpoints over remote networks, place the server behind a TLS-terminating reverse proxy (e.g., Nginx, Caddy, Cloudflare Tunnel) with enforced authentication.
- **Process Sandboxing:** Local execution tools are fail-closed by default (`executionSandbox: false`). Process isolation requires explicit administrative configuration.

### 4. Input Sanitization & Integrity

- **Strict Validation:** Agent names, project identifiers, and tool arguments are strictly validated against regex constraints to prevent injection and path traversal.
- **SQL Injection Prevention:** SQLite operations utilize parameterized queries and bound parameters via `better-sqlite3`. No user input is directly concatenated into SQL strings.

---

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in `local-mcp-memory`, report it responsibly:

- **Security Contact:** `contact@coderooz.in`
- **Subject:** `[SECURITY] local-mcp-memory Vulnerability Report`

Please include:
1. A clear description of the vulnerability and attack vector.
2. Step-by-step reproduction instructions or a minimal proof of concept.
3. Potential impact assessment on confidentiality, integrity, or availability.
4. Suggested remediation or patch (if available).

### Response Expectations

- **Initial Acknowledgment:** Within 48 hours.
- **Triage & Assessment:** Within 7 business days.
- **Fix Delivery:** Coordinated patch release following severity triage.
