
import { callMemoryApi } from '../mcp-server.js';

export async function storeContext(args, config) {
    const data = await callMemoryApi("/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            agent: config.agent,
            project: config.project,
            scope: config.scope,
            content: args.content,
            importance: args.importance
        })
    });

    return {
        content: [
            {
                type: "text",
                text: `Stored memory
ID: ${data.context.id}`
            }
        ]
    };
}
