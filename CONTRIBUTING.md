# Contributing to Local MCP Memory Server

Thanks for contributing!

## Project Overview

A persistent, multi-agent memory system using the Model Context Protocol (MCP). Enables AI agents to maintain context across sessions with multi-project isolation, agent coordination, and conflict resolution.

## Setup

```bash
git clone https://github.com/coderooz/Local-MCP-Memory-Server
cd Local-MCP-Memory-Server
npm install
```

### Environment Variables

Create a `.env` file for MongoDB configuration:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=local_mcp_memory
```

### Running the Server

```bash
# Start MCP server
npm start

# Start REST API server
npm run start:api

# Run syntax checks
npm run check

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check code formatting
npm run format:check
```

## Contribution Areas

- **MCP Protocol**: Protocol enhancements, new tool definitions
- **Memory Engine**: Ranking algorithms, relevance scoring, storage optimization
- **Agent Coordination**: Multi-agent task distribution, conflict resolution
- **Security**: Input validation, XSS prevention, authentication
- **Observability**: Logging, metrics, debugging tools
- **Testing**: Validation suites, integration tests

## Guidelines

1. **MCP Protocol Compliance**
   - Never log to stdout (MCP protocol requirement)
   - Use proper JSON-RPC response format
   - Handle errors gracefully without exposing internals

2. **Code Standards**
   - ESM modules (`"type": "module"` in package.json)
   - Use `node --check` for syntax validation before committing
   - Modular, readable code with clear function purposes
   - JSDoc comments for public APIs

3. **Testing**
   - Add tests for new functionality
   - Ensure existing tests pass
   - Run `npm run check` for syntax validation

4. **Commits**
   - Use conventional commit format (optional but recommended)
   - Reference issues in commit messages

## Development Workflow

1. **Fork and Branch**

   ```bash
   git checkout -b feature/your-feature
   git checkout -b fix/issue-description
   ```

2. **Make Changes**
   - Implement your feature or fix
   - Add/update tests
   - Run `npm run check`

3. **Submit PR**
   - Describe changes clearly
   - Link related issues
   - Ensure CI passes (if configured)

## Project Structure

```
local-mcp-memory/
├── server.js           # REST API server
├── mcp-server.js       # MCP protocol server
├── utils/
│   ├── projectIdentity.js   # Project ID resolution
│   ├── coordinationEngine.js # Multi-agent coordination
│   ├── memoryEngine.js      # Memory ranking/storage
│   └── resetEngine.js        # System reset functionality
├── tools/              # MCP tools
└── tests/              # Test suites
```

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating duplicates
- For security concerns, see SECURITY.md

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
