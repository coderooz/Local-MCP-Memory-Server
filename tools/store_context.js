import { callMemoryApi } from '../mcp-server.js';
import { successResponse, errorResponse } from '../shared/utils/responseFormatter.js';

export async function storeContext(args, config) {
  try {
    const data = await callMemoryApi('/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: config.agent,
        project: config.project,
        scope: config.scope,
        content: args.content,
        importance: args.importance
      })
    });

    return successResponse({
      message: "Memory stored successfully",
      data: { contextId: data.context.id },
      tool: "store_context"
    });
  } catch (error) {
    return errorResponse({
      message: error.message || "Failed to store memory",
      errorCode: "STORE_CONTEXT_ERROR",
      details: error,
      tool: "store_context"
    });
  }
}