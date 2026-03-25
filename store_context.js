
const contexts = [
    {
        content: `Architecture Overview: The system is a client-server architecture. The \`mcp-server.js\` acts as a client to the \`server.js\` Express server. \`mcp-server.js\` is a JSON-RPC server that communicates with AI agents over stdio. \`server.js\` is an Express-based HTTP API that interacts with a MongoDB persistence layer.`,
        importance: 5
    },
    {
        content: `Tech Stack: Language: JavaScript (Node.js) with ES modules (\`"type": "module"\`); Web Framework: Express; Database: MongoDB; Dependencies: \`dotenv\` for environment variables, \`express\` for the web server, \`mongodb\` for database access, and \`uuid\` for generating unique IDs.`,
        importance: 5
    },
    {
        content: `File Breakdown: \`mcp-server.js\`: The main entry point for the MCP server. It handles JSON-RPC communication with agents, defines the available tools, and makes HTTP requests to the backend API. \`server.js\`: The backend Express HTTP API server. It handles the core application logic, including creating, searching, and logging memories, and interacts with the
MongoDB database. \`mcp.model.js\`: Defines the data models for the application (\`BaseModel\`, \`ContextModel\`, \`ActionModel\`, \`SessionModel\`). It also includes a \`MemoryQueryBuilder\` for constructing database queries. \`logger.js\`: A central logging system that logs to the console and the MongoDB database. \`startMemoryServer.js\`: A utility to ensure that the Express server is started only once. \`mcp-shim.js\`: A wrapper script that automatically a wrapper script that automatically configures the MCP environment variables (\`MCP_PROJECT\`, \`MCP_SCOPE\`) for an agent, enabling zero-configuration setup for new projects. \`agent-instruction.js\`: Contains the global instructions for the AI agent. \`package.json\`: Defines the project's metadata, dependencies, and scripts. \`README.md\`: Provides a comprehensive overview of the project, its architecture, and how to use it. \`PROJECT_MEMORY_BOOTSTRAP.md\`: A file that likely contains instructions on how to bootstrap the project's memory.`,
        importance: 4
    },
    {
        content: `Module Responsibilities: \`mcp-server.js\`: Handles the agent-facing communication protocol (JSON-RPC) and tool definitions. \`server.js\`: Implements the core application logic, data persistence, and the HTTP API. \`mcp.model.js\`: Defines the data structures and database query logic. \`logger.js\`: Manages logging throughout the application. \`mcp-shim.js\`: Simplifies agent configuration by automatically setting environment variables. \`agent-instruction.js\`: Provides the base instructions for the agent's behavior.`,
        importance: 4
    },
    {
        content: `Data Flow: 1. An AI agent sends a JSON-RPC request to \`mcp-server.js\` via stdio. 2. \`mcp-server.js\` parses the request and determines which tool is being called. 3. \`mcp-server.js\` makes an HTTP request to the corresponding endpoint on the \`server.js\` Express server. 4. \`server.js\` processes the request, interacts with the MongoDB database (e.g., creating, reading, updating, or deleting data). 5. \`server.js\` sends an HTTP response back to \`mcp-server.js\`. 6. \`mcp-server.js\` formats the response as a JSON-RPC message and sends it back to the agent via stdio.`,
        importance: 4
    },
    {
        content: `Action Flow: Storing Context: An agent calls the \`store_context\` tool. \`mcp-server.js\` sends a POST request to \`/context\` on \`server.js\`. \`server.js\` creates a new \`ContextModel\` and saves it to the \`contexts\` collection in MongoDB. Searching Context: An agent calls the \`search_context\` tool. \`mcp-server.js\` sends a POST request to \`/context/search\` on \`server.js\`. \`server.js\` uses the \`MemoryQueryBuilder\` to construct a search query and executes it against the \`contexts\` collection. The results are then ranked by the \`rankSearchResults\` function and returned to the agent. Logging Actions: An agent calls the \`log_action\` tool. \`mcp-server.js\` sends a POST request to \`/action\` on \`server.js\`. \`server.js\` creates a new \`ActionModel\` and saves it to the \`actions\` collection.`,
        importance: 4
    },
    {
        content: `External Integrations: The application relies on a MongoDB database for data persistence.`,
        importance: 3
    },
    {
        content: `Constraints & Assumptions: A MongoDB instance must be running and accessible. The MongoDB connection URI must be provided in an \`.env\` file. Agents are expected to communicate using the JSON-RPC protocol over stdio. The \`mcp-shim.js\` script assumes that the project name can be derived from the current working directory.`,
        importance: 3
    }
];

contexts.forEach((context, i) => {
    const request = {
        jsonrpc: "2.0",
        id: i + 1,
        method: "tools/call",
        params: {
            name: "store_context",
            arguments: {
                content: context.content,
                importance: context.importance
            }
        }
    };
    console.log(JSON.stringify(request));
});
