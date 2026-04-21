# Support

## Getting Help

If you need help with Local MCP Memory Server, here are the best ways to get support:

### Documentation

- [Official Documentation](https://coderooz.github.io/Local-MCP-Memory-Server/)
- [API Reference](https://coderooz.github.io/Local-MCP-Memory-Server/#api)
- [MCP Tool Reference](https://coderooz.github.io/Local-MCP-Memory-Server/#tools)

### Community

- [GitHub Discussions](https://github.com/coderooz/Local-MCP-Memory-Server/discussions) - Ask questions and share ideas
- [Discord Community](https://discord.gg/coderooz) - Real-time discussions with the team

### Reporting Issues

- [Bug Reports](https://github.com/coderooz/Local-MCP-Memory-Server/issues/new?template=bug_report.md)
- [Feature Requests](https://github.com/coderooz/Local-MCP-Memory-Server/issues/new?template=feature_request.md)
- [General Questions](https://github.com/coderooz/Local-MCP-Memory-Server/issues/new?template=general.md)

### Security Issues

For security vulnerabilities, please email **contact@coderooz.in** directly instead of creating a public issue.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and development setup.

## Quick Troubleshooting

### Server won't start

1. Check MongoDB is running: `mongod --version`
2. Verify `.env` file exists with `MONGO_URI`
3. Check port 4000 is available

### MCP tools not working

1. Verify server is running: `npm run start:api`
2. Check MCP server connection: `npm start`
3. Review logs in MongoDB `logs` collection

### Connection issues

```bash
# Test MongoDB connection
mongosh --eval "db.adminCommand('ping')"

# Check server health
curl http://localhost:4000/health
```

## Support Channels

| Channel            | Response Time | Use For                   |
| ------------------ | ------------- | ------------------------- |
| GitHub Issues      | 24-48 hours   | Bugs, features            |
| GitHub Discussions | 48-72 hours   | Questions, ideas          |
| Discord            | Real-time     | Community support         |
| Email              | 48-72 hours   | Security, private matters |

## Additional Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Node.js Documentation](https://nodejs.org/en/docs/)
