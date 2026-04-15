# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.4.x   | :white_check_mark: |
| 2.3.x   | :x:                |
| < 2.3   | :x:                |

## Security Model

This server handles **agent memory and coordination data** for AI systems. Key security considerations:

### Data Protection
- All memory data is stored locally in the filesystem
- MongoDB authentication should be configured for production deployments
- No encryption at rest by default - use filesystem-level encryption for sensitive data

### Input Sanitization
- All user inputs are sanitized to prevent XSS attacks
- Agent identifiers are validated and normalized
- Project identifiers follow strict format validation

### Access Control
- Server runs locally by default (not exposed publicly)
- API endpoints have no built-in authentication (add reverse proxy for remote access)
- Use environment variables for sensitive configuration

## Reporting a Vulnerability

**Do NOT report security issues via public GitHub issues.**

For security concerns, contact: **contact@coderooz.in**

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested fixes (optional)

### Response Timeline
- **Initial response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix timeline**: Depends on severity (critical: ASAP, moderate: next release)

### Scope
- MCP protocol handling
- Agent registry and coordination
- Memory storage and retrieval
- Configuration management

### Out of Scope
- Client-side vulnerabilities
- Social engineering attacks
- Denial of service from resource exhaustion (configure appropriate limits)
