import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  ProjectMapModel,
  MEMORY_SCOPE,
  MEMORY_LIFECYCLE,
  normalizeMemory,
  toStringArray,
  toPlainObject,
  normalizeProjectDescriptor,
  buildProjectDescriptorContent,
} from '../../../core/mcp/models.js';

export { ProjectMapModel, MEMORY_SCOPE, MEMORY_LIFECYCLE };

const CONFIG_HIERARCHY = {
  PROJECT: 'project',
  GLOBAL: 'global',
  ENVIRONMENT: 'environment',
  NONE: 'none',
};

const PROJECT_MARKERS = [
  '.mcp-project',
  '.mcp-project.json',
  '.git',
  '.roo',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  '.venv',
];

function hasProjectMarker(directory) {
  return PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(directory, marker)));
}

function findProjectRoot(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);

  while (true) {
    if (hasProjectMarker(current)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return path.resolve(startDirectory);
    }

    current = parent;
  }
}

function slugifyProjectName(name = '') {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default-project'
  );
}

function readTextFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8').trim();
}

function readProjectOverride(projectRoot) {
  const textOverride = readTextFileIfExists(path.join(projectRoot, '.mcp-project'));

  if (textOverride) {
    return {
      project: textOverride.trim(),
      agent: null,
      source: '.mcp-project',
    };
  }

  const jsonOverride = readTextFileIfExists(path.join(projectRoot, '.mcp-project.json'));

  if (!jsonOverride) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonOverride);
    return {
      project: parsed.project || parsed.name || null,
      agent: parsed.agent || null,
      scope: parsed.scope || 'project',
      source: '.mcp-project.json',
    };
  } catch {
    return null;
  }
}

function readPackageProjectName(projectRoot) {
  const packageJson = readTextFileIfExists(path.join(projectRoot, 'package.json'));

  if (!packageJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(packageJson);
    return parsed.mcpProject || parsed.name || null;
  } catch {
    return null;
  }
}

function getGlobalConfigPath() {
  return path.join(os.homedir(), '.mcp');
}

function readGlobalConfig() {
  const globalPath = getGlobalConfigPath();
  const globalConfigFile = path.join(globalPath, 'config.json');

  if (!fs.existsSync(globalConfigFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(globalConfigFile, 'utf8');
    const parsed = JSON.parse(content);

    const config = parsed.mcpServers?.['local-mcp-memory']?.environment || parsed;

    return {
      project: config.MCP_PROJECT || config.project || null,
      agent: config.MCP_AGENT || config.agent || null,
      scope: config.MCP_SCOPE || config.scope || 'project',
      source: globalConfigFile,
    };
  } catch {
    return null;
  }
}

function readEnvironmentConfig(env = process.env) {
  const project = env.MCP_PROJECT || null;
  const agent = env.MCP_AGENT || null;
  const scope = env.MCP_SCOPE || null;

  if (project || agent) {
    return {
      project,
      agent,
      scope,
      source: 'environment',
    };
  }

  return null;
}

function generateDefaultAgent() {
  const username = os.userInfo().username || 'user';
  const hostname = os.hostname().split('.')[0] || 'localhost';
  return `agent-${username}-${hostname}`;
}

export class MCPSetupRequiredError extends Error {
  constructor(message = 'MCP configuration not found. Setup required.') {
    super(message);
    this.name = 'MCPSetupRequiredError';
  }
}

export function resolveIdentity(startDirectory = process.cwd(), env = process.env, strict = true) {
  const projectRoot = findProjectRoot(startDirectory);

  const projectOverride = readProjectOverride(projectRoot);
  if (projectOverride) {
    return {
      projectRoot,
      project: slugifyProjectName(projectOverride.project),
      agent: projectOverride.agent || env.MCP_AGENT || generateDefaultAgent(),
      scope: projectOverride.scope || env.MCP_SCOPE || 'project',
      source: projectOverride.source,
      hierarchy: CONFIG_HIERARCHY.PROJECT,
    };
  }

  const globalConfig = readGlobalConfig();
  if (globalConfig) {
    return {
      projectRoot,
      project: slugifyProjectName(globalConfig.project),
      agent: globalConfig.agent || env.MCP_AGENT || generateDefaultAgent(),
      scope: globalConfig.scope || env.MCP_SCOPE || 'project',
      source: globalConfig.source,
      hierarchy: CONFIG_HIERARCHY.GLOBAL,
    };
  }

  const envConfig = readEnvironmentConfig(env);
  if (envConfig) {
    return {
      projectRoot,
      project: slugifyProjectName(
        envConfig.project || readPackageProjectName(projectRoot) || path.basename(projectRoot)
      ),
      agent: envConfig.agent || generateDefaultAgent(),
      scope: envConfig.scope || 'project',
      source: envConfig.source,
      hierarchy: CONFIG_HIERARCHY.ENVIRONMENT,
    };
  }

  if (strict) {
    throw new MCPSetupRequiredError(
      'MCP configuration not found.\n\n' +
        'Please configure your MCP identity:\n' +
        '  1. Create .mcp-project file with your project name\n' +
        '  2. Or create .mcp-project.json with { "project": "name", "agent": "agent-name" }\n' +
        '  3. Or set MCP_PROJECT and MCP_AGENT environment variables\n' +
        '  4. Or create ~/.mcp/config.json with your defaults\n\n' +
        'Auto-generation available - see setupMCP() function.'
    );
  }

  console.warn(
    '[MCP WARNING] No configuration found. Using fallback values.\n' +
      'This behavior is deprecated. Please configure MCP properly.\n' +
      'Run setupMCP() to auto-generate configuration.'
  );

  return {
    projectRoot,
    project: slugifyProjectName(readPackageProjectName(projectRoot) || path.basename(projectRoot)),
    agent: 'unknown',
    scope: 'project',
    source: 'fallback',
    hierarchy: CONFIG_HIERARCHY.NONE,
  };
}

export function checkConfigExists(startDirectory = process.cwd()) {
  const projectRoot = findProjectRoot(startDirectory);

  if (readProjectOverride(projectRoot)) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.PROJECT,
      source: '.mcp-project',
    };
  }

  if (readGlobalConfig()) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.GLOBAL,
      source: '~/.mcp/config.json',
    };
  }

  const envConfig = readEnvironmentConfig(process.env);
  if (envConfig && (envConfig.project || envConfig.agent)) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.ENVIRONMENT,
      source: 'environment',
    };
  }

  return {
    exists: false,
    hierarchy: CONFIG_HIERARCHY.NONE,
    source: null,
  };
}

export function setupMCP(projectRoot, options = {}) {
  const {
    project: customProject = null,
    agent: customAgent = null,
    scope = 'project',
    global = false,
  } = options;

  const projectName =
    customProject || readPackageProjectName(projectRoot) || path.basename(projectRoot);
  const agentName = customAgent || generateDefaultAgent();

  if (global) {
    const globalDir = getGlobalConfigPath();
    const globalConfigPath = path.join(globalDir, 'config.json');

    if (!fs.existsSync(globalDir)) {
      fs.mkdirSync(globalDir, { recursive: true });
    }

    const content = {
      mcpServers: {
        'local-mcp-memory': {
          type: 'local',
          environment: {
            MCP_PROJECT: projectName,
            MCP_AGENT: agentName,
            MCP_SCOPE: scope,
          },
        },
      },
    };

    fs.writeFileSync(globalConfigPath, JSON.stringify(content, null, 2));

    return {
      success: true,
      filePath: globalConfigPath,
      content: JSON.stringify(content, null, 2),
      message: `Global MCP config created at: ${globalConfigPath}`,
    };
  }

  const configPath = path.join(projectRoot, '.mcp-project.json');
  const simplePath = path.join(projectRoot, '.mcp-project');

  const content = {
    project: projectName,
    agent: agentName,
    scope: scope,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(content, null, 2));
  fs.writeFileSync(simplePath, projectName);

  return {
    success: true,
    filePath: configPath,
    files: [configPath, simplePath],
    content: JSON.stringify(content, null, 2),
    message: `Project MCP config created at: ${configPath}`,
  };
}

export function resolveProjectIdentity(startDirectory = process.cwd(), env = process.env) {
  try {
    const identity = resolveIdentity(startDirectory, env, false);

    return {
      projectRoot: identity.projectRoot,
      derivedProject: identity.project,
      project: identity.project,
      agent: identity.agent,
      scope: identity.scope,
      source: identity.source,
      hierarchy: identity.hierarchy,
    };
  } catch (error) {
    if (error instanceof MCPSetupRequiredError) {
      console.error(`[MCP] ${error.message}`);
      console.error('[MCP] Server starting with fallback identity.');

      const projectRoot = findProjectRoot(startDirectory);

      return {
        projectRoot,
        derivedProject: slugifyProjectName(
          readPackageProjectName(projectRoot) || path.basename(projectRoot)
        ),
        project: slugifyProjectName(
          readPackageProjectName(projectRoot) || path.basename(projectRoot)
        ),
        agent: 'unconfigured',
        scope: 'project',
        source: 'none',
        hierarchy: CONFIG_HIERARCHY.NONE,
      };
    }
    throw error;
  }
}

export class ProjectService {
  constructor(db) {
    this.db = db;
  }

  async createProjectMap(options = {}) {
    const {
      project,
      agent = 'system',
      file_path = '',
      type = 'unknown',
      summary = '',
      dependencies = [],
      exports = [],
      key_details = [],
      related_tasks = [],
      related_agents = [],
      relationships = {},
      scope = MEMORY_SCOPE.PROJECT,
    } = options;

    const projectMap = new ProjectMapModel({
      project,
      agent,
      scope,
      file_path,
      type,
      summary,
      dependencies: toStringArray(dependencies),
      exports: toStringArray(exports),
      key_details: toStringArray(key_details),
      related_tasks: toStringArray(related_tasks),
      related_agents: toStringArray(related_agents),
      relationships: normalizeRelationships(relationships),
      last_verified_at: new Date(),
    });

    await this.db.collection('project_map').insertOne(normalizeMemory(projectMap));
    return projectMap;
  }

  async fetchProjectMap(options = {}) {
    const { project, file_path, type, query, limit = 20 } = options;

    const filters = {};

    if (project) {
      filters.project = project;
    }

    if (file_path) {
      filters.file_path = file_path;
    }

    if (type) {
      filters.type = type;
    }

    if (query?.trim()) {
      filters.$text = { $search: query.trim() };
    }

    return this.db
      .collection('project_map')
      .find(filters)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async updateProjectMap(mapId, updates = {}) {
    const updateOps = {
      ...updates,
      updatedAt: new Date(),
      last_verified_at: new Date(),
    };

    return this.db
      .collection('project_map')
      .findOneAndUpdate({ id: mapId }, { $set: updateOps }, { returnDocument: 'after' });
  }

  async deleteProjectMap(mapId) {
    return this.db.collection('project_map').deleteOne({ id: mapId });
  }

  async getProjectFileCount(project) {
    return this.db.collection('project_map').countDocuments({ project });
  }

  async getProjectFilesByType(project, type) {
    return this.db
      .collection('project_map')
      .find({ project, type })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async searchProjectFiles(project, searchQuery, limit = 20) {
    return this.db
      .collection('project_map')
      .find({
        project,
        $text: { $search: searchQuery },
      })
      .limit(limit)
      .toArray();
  }
}

export async function createProjectMap(db, options = {}) {
  const service = new ProjectService(db);
  return service.createProjectMap(options);
}

export async function fetchProjectMap(db, options = {}) {
  const service = new ProjectService(db);
  return service.fetchProjectMap(options);
}

export async function updateProjectMap(db, mapId, updates = {}) {
  const service = new ProjectService(db);
  return service.updateProjectMap(mapId, updates);
}

export async function deleteProjectMap(db, mapId) {
  const service = new ProjectService(db);
  return service.deleteProjectMap(mapId);
}

function normalizeRelationships(value = {}) {
  return {
    parent: typeof value.parent === 'string' && value.parent.trim() ? value.parent : null,
    children: toStringArray(value.children),
  };
}
