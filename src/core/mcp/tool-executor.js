import { getHandler, hasHandler } from './tool-registry.js';

export class ToolExecutor {
  constructor(registry) {
    this.registry = registry;
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(name, args, context = {}) {
    if (!hasHandler(name)) {
      throw new Error(`Tool handler not found: ${name}`);
    }

    const handler = getHandler(name);

    let fn = handler;

    for (const middleware of this.middlewares) {
      fn = middleware(fn, name);
    }

    return fn(args, context);
  }

  async listTools() {
    return this.registry.getAllTools();
  }

  async getToolSchema(name) {
    const tool = this.registry.getTool(name);
    return tool ? tool.inputSchema : null;
  }
}

export function createExecutor(registry) {
  return new ToolExecutor(registry);
}

export async function executeTool(name, args, context = {}, registry) {
  const executor = createExecutor(registry);
  return executor.execute(name, args, context);
}
