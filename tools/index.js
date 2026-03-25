
import { storeContext } from './store_context.js';
// Import other tool handlers here

const toolHandlers = {
    store_context: storeContext,
    // Add other tool handlers here
};

export function getTools() {
    return [
        {
            name: "store_context",
            description: "Store persistent memory such as architecture decisions, rules, or notes.",
            inputSchema: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "The memory content to store"
                    },
                    importance: {
                        type: "number",
                        description: "The importance of the memory (1-5)"
                    }
                },
                required: ["content"]
            }
        },
        // Add other tool definitions here
    ];
}

export function getToolHandler(name) {
    return toolHandlers[name];
}
