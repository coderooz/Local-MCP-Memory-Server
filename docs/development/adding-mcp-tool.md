# Adding an MCP Tool — `local-mcp-memory`

This guide explains how to define, implement, register, and test a new Model Context Protocol (MCP) tool in `local-mcp-memory`.

---

## 1. Overview of Tool Architecture

Adding an MCP tool requires three steps:
1. **Declaration:** Define the tool name, description, and JSON Schema input parameters in `src/interfaces/mcp-tools/tool-definitions.js` or a domain definition file.
2. **Implementation:** Implement the handler function in `tools/` or `src/domains/`.
3. **Dispatch:** Register the handler in `mcp-server.js` or `src/core/mcp/tool-executor.js`.

---

## 2. Step 1: Declare the Tool Schema

Open `src/interfaces/mcp-tools/tool-definitions.js` and add the JSON Schema definition:

```javascript
export const MY_NEW_TOOL = {
  name: 'my_new_tool',
  description: 'Clear description of what this tool does and when agents should use it.',
  inputSchema: {
    type: 'object',
    properties: {
      targetId: {
        type: 'string',
        description: 'Unique identifier for the target entity.',
      },
      flag: {
        type: 'boolean',
        description: 'Optional execution flag.',
      },
    },
    required: ['targetId'],
  },
};
```

Export your tool in the tool array so it appears in `tools/list`.

---

## 3. Step 2: Implement the Tool Handler

Create or update a module in `tools/` (e.g. `tools/myNewTools.js`):

```javascript
import { successResponse, errorResponse } from '../shared/utils/responseFormatter.js';
import { getDbInstance } from '../src/core/database/sqlite/index.js';

export async function handleMyNewTool(args) {
  const { targetId, flag = false } = args;

  if (!targetId) {
    return errorResponse('targetId is required', 400);
  }

  try {
    const db = getDbInstance();
    // Execute query using parameterized query or query builder
    const result = db.prepare('SELECT * FROM contexts WHERE id = ?').get(targetId);

    return successResponse({
      found: Boolean(result),
      data: result,
    });
  } catch (err) {
    return errorResponse(`Operation failed: ${err.message}`, 500);
  }
}
```

---

## 4. Step 3: Register in `mcp-server.js`

In `mcp-server.js`, import your handler and add a case in the `tools/call` handler:

```javascript
if (name === 'my_new_tool') {
  const result = await handleMyNewTool(args);
  return respond(request.id, toMCPResponse(result));
}
```

---

## 5. Step 4: Verification and Testing

1. Validate syntax:
   ```bash
   npm run check
   ```
2. Verify discovery:
   Run the MCP protocol test or check tool count:
   ```bash
   npm run test:conformance
   ```
3. Test tool execution directly via stdio or add a dedicated test in `tests/`.
