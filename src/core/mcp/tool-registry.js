class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.handlers = new Map();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getHandler(name) {
    return this.handlers.get(name);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getAllToolNames() {
    return Array.from(this.tools.keys());
  }

  hasTool(name) {
    return this.tools.has(name);
  }

  hasHandler(name) {
    return this.handlers.has(name);
  }

  unregister(name) {
    this.tools.delete(name);
    this.handlers.delete(name);
  }

  clear() {
    this.tools.clear();
    this.handlers.clear();
  }

  getToolsByCategory(category) {
    return Array.from(this.tools.values()).filter((tool) => tool.category === category);
  }
}

const registry = new ToolRegistry();

export { ToolRegistry };
export function getToolRegistry() {
  return registry;
}

export function registerTool(tool, handler) {
  registry.register(tool);
  if (handler) {
    registry.registerHandler(tool.name, handler);
  }
}

export function getTool(name) {
  return registry.getTool(name);
}

export function getAllTools() {
  return registry.getAllTools();
}

export function getHandler(name) {
  return registry.getHandler(name);
}

export function hasTool(name) {
  return registry.hasTool(name);
}
