import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Custom error class for MCP setup requirements.
 * Thrown when no valid configuration is found.
 */
export class MCPSetupRequiredError extends Error {
  constructor(message = 'MCP configuration not found. Setup required.') {
    super(message);
    this.name = 'MCPSetupRequiredError';
  }
}

/**
 * Configuration hierarchy for MCP identity resolution.
 * Priority: 1. Project-level > 2. Global > 3. Environment > 4. Error
 */
export const CONFIG_HIERARCHY = {
  PROJECT: 'project',
  GLOBAL: 'global',
  ENVIRONMENT: 'environment',
  NONE: 'none'
};

/**
 * Project marker files that indicate the root of a project.
 * @type {string[]}
 */
const PROJECT_MARKERS = [
  '.mcp-project',
  '.mcp-project.json',
  '.git',
  '.roo',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  '.venv'
];

/**
 * Checks if a directory contains any project marker.
 *
 * @param {string} directory - Directory path to check
 * @returns {boolean} True if any project marker exists
 *
 * @example
 * hasProjectMarker("/home/user/project"); // true if package.json exists
 */
export function hasProjectMarker(directory) {
  return PROJECT_MARKERS.some((marker) =>
    fs.existsSync(path.join(directory, marker))
  );
}

/**
 * Finds the root directory of a project by walking up the directory tree.
 *
 * @param {string} startDirectory - Directory to start searching from
 * @returns {string} Absolute path to the project root
 *
 * @example
 * const root = findProjectRoot("/home/user/project/src/utils");
 * // Returns "/home/user/project"
 */
export function findProjectRoot(startDirectory = process.cwd()) {
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

/**
 * Converts a project name to a URL-safe slug.
 *
 * @param {string} name - Project name to slugify
 * @returns {string} Slugified project name
 *
 * @example
 * slugifyProjectName("My Awesome Project!"); // "my-awesome-project"
 */
export function slugifyProjectName(name = '') {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default-project'
  );
}

/**
 * Reads a text file if it exists.
 *
 * @param {string} filePath - Path to the file
 * @returns {string|null} File contents or null if not found
 *
 * @example
 * const content = readTextFileIfExists("/path/to/file.txt");
 */
function readTextFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8').trim();
}

/**
 * Reads project override from .mcp-project or .mcp-project.json files.
 * These files have the HIGHEST priority in configuration resolution.
 *
 * @param {string} projectRoot - Root directory of the project
 * @returns {{ project: string|null, agent: string|null, source: string } | null}
 *
 * @example
 * // For .mcp-project containing "my-project"
 * readProjectOverride("/path/to/project");
 * // Returns { project: "my-project", agent: null, source: ".mcp-project" }
 *
 * @example
 * // For .mcp-project.json containing { "project": "proj", "agent": "dev" }
 * readProjectOverride("/path/to/project");
 * // Returns { project: "proj", agent: "dev", source: ".mcp-project.json" }
 */
function readProjectOverride(projectRoot) {
  // Check .mcp-project file (simple text format)
  const textOverride = readTextFileIfExists(
    path.join(projectRoot, '.mcp-project')
  );

  if (textOverride) {
    return {
      project: textOverride.trim(),
      agent: null,
      source: '.mcp-project'
    };
  }

  // Check .mcp-project.json file (structured format)
  const jsonOverride = readTextFileIfExists(
    path.join(projectRoot, '.mcp-project.json')
  );

  if (!jsonOverride) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonOverride);
    return {
      project: parsed.project || parsed.name || null,
      agent: parsed.agent || null,
      scope: parsed.scope || 'project',
      source: '.mcp-project.json'
    };
  } catch {
    return null;
  }
}

/**
 * Reads project name from package.json.
 *
 * @param {string} projectRoot - Root directory of the project
 * @returns {string|null} Project name from package.json or null
 *
 * @example
 * readPackageProjectName("/path/to/project");
 * // Returns "my-package-name" from { "name": "my-package-name" }
 */
function readPackageProjectName(projectRoot) {
  const packageJson = readTextFileIfExists(
    path.join(projectRoot, 'package.json')
  );

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

/**
 * Finds the global MCP configuration directory.
 * Returns ~/.mcp/ directory path.
 *
 * @returns {string} Path to global MCP config directory
 *
 * @example
 * getGlobalConfigPath(); // "/home/user/.mcp"
 */
function getGlobalConfigPath() {
  return path.join(os.homedir(), '.mcp');
}

/**
 * Reads global MCP configuration.
 * Priority: 2. Global config (after project-level)
 *
 * @returns {{ project: string|null, agent: string|null, source: string } | null}
 *
 * @example
 * // For ~/.mcp/config.json containing { "project": "global-proj", "agent": "global-agent" }
 * readGlobalConfig();
 * // Returns { project: "global-proj", agent: "global-agent", source: "~/.mcp/config.json" }
 */
function readGlobalConfig() {
  const globalPath = getGlobalConfigPath();
  const globalConfigFile = path.join(globalPath, 'config.json');

  if (!fs.existsSync(globalConfigFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(globalConfigFile, 'utf8');
    const parsed = JSON.parse(content);

    // Support both flat structure and nested structure
    const config = parsed.mcpServers?.['local-mcp-memory']?.environment || parsed;

    return {
      project: config.MCP_PROJECT || config.project || null,
      agent: config.MCP_AGENT || config.agent || null,
      scope: config.MCP_SCOPE || config.scope || 'project',
      source: globalConfigFile
    };
  } catch {
    return null;
  }
}

/**
 * Reads environment-based configuration.
 * Priority: 3. Environment variables
 *
 * @param {object} env - Environment variables object
 * @returns {{ project: string|null, agent: string|null, source: string } | null}
 *
 * @example
 * readEnvironmentConfig(process.env);
 * // Returns { project: "env-project", agent: "env-agent", source: "environment" }
 */
function readEnvironmentConfig(env = process.env) {
  const project = env.MCP_PROJECT || null;
  const agent = env.MCP_AGENT || null;
  const scope = env.MCP_SCOPE || null;

  if (project || agent) {
    return {
      project,
      agent,
      scope,
      source: 'environment'
    };
  }

  return null;
}

/**
 * Resolves MCP identity based on strict configuration hierarchy.
 *
 * Priority Order:
 * 1. Project-level config (.mcp-project, .mcp-project.json)
 * 2. Global config (~/.mcp/config.json)
 * 3. Environment variables (MCP_PROJECT, MCP_AGENT)
 * 4. THROWS MCPSetupRequiredError if none found
 *
 * @param {string} startDirectory - Directory to start resolution from
 * @param {object} env - Environment variables object
 * @param {boolean} strict - If true, throws error on missing config; if false, allows fallback
 * @returns {{ projectRoot: string, project: string, agent: string, scope: string, source: string }}
 * @throws {MCPSetupRequiredError} When no configuration found in strict mode
 *
 * @example
 * // With valid project config
 * const identity = resolveIdentity();
 * // { projectRoot: "/path/to/project", project: "my-project", agent: "dev", scope: "project", source: ".mcp-project" }
 *
 * @example
 * // Without any config (strict mode)
 * resolveIdentity("/empty/dir", {}, true);
 * // throws new MCPSetupRequiredError()
 */
export function resolveIdentity(
  startDirectory = process.cwd(),
  env = process.env,
  strict = true
) {
  const projectRoot = findProjectRoot(startDirectory);

  // Priority 1: Project-level config (HIGHEST)
  const projectOverride = readProjectOverride(projectRoot);
  if (projectOverride) {
    return {
      projectRoot,
      project: slugifyProjectName(projectOverride.project),
      agent: projectOverride.agent || env.MCP_AGENT || generateDefaultAgent(),
      scope: projectOverride.scope || env.MCP_SCOPE || 'project',
      source: projectOverride.source,
      hierarchy: CONFIG_HIERARCHY.PROJECT
    };
  }

  // Priority 2: Global config
  const globalConfig = readGlobalConfig();
  if (globalConfig) {
    return {
      projectRoot,
      project: slugifyProjectName(globalConfig.project),
      agent: globalConfig.agent || env.MCP_AGENT || generateDefaultAgent(),
      scope: globalConfig.scope || env.MCP_SCOPE || 'project',
      source: globalConfig.source,
      hierarchy: CONFIG_HIERARCHY.GLOBAL
    };
  }

  // Priority 3: Environment variables
  const envConfig = readEnvironmentConfig(env);
  if (envConfig) {
    return {
      projectRoot,
      project: slugifyProjectName(envConfig.project || readPackageProjectName(projectRoot) || path.basename(projectRoot)),
      agent: envConfig.agent || generateDefaultAgent(),
      scope: envConfig.scope || 'project',
      source: envConfig.source,
      hierarchy: CONFIG_HIERARCHY.ENVIRONMENT
    };
  }

  // Priority 4: No config found
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

  // Fallback (only in non-strict mode) - DEPRECATED BEHAVIOR
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
    hierarchy: CONFIG_HIERARCHY.NONE
  };
}

/**
 * Generates a default agent name based on system information.
 *
 * @returns {string} Default agent identifier
 *
 * @example
 * generateDefaultAgent(); // "agent-{username}-{hostname}"
 */
function generateDefaultAgent() {
  const username = os.userInfo().username || 'user';
  const hostname = os.hostname().split('.')[0] || 'localhost';
  return `agent-${username}-${hostname}`;
}

/**
 * Checks if MCP configuration exists at any level.
 *
 * @param {string} startDirectory - Directory to start checking from
 * @returns {{ exists: boolean, hierarchy: string, source: string | null }}
 *
 * @example
 * const check = checkConfigExists("/path/to/project");
 * if (!check.exists) {
 *   console.log(`No config found at level: ${check.hierarchy}`);
 * }
 */
export function checkConfigExists(startDirectory = process.cwd()) {
  const projectRoot = findProjectRoot(startDirectory);

  if (readProjectOverride(projectRoot)) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.PROJECT,
      source: '.mcp-project'
    };
  }

  if (readGlobalConfig()) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.GLOBAL,
      source: '~/.mcp/config.json'
    };
  }

  const envConfig = readEnvironmentConfig(process.env);
  if (envConfig && (envConfig.project || envConfig.agent)) {
    return {
      exists: true,
      hierarchy: CONFIG_HIERARCHY.ENVIRONMENT,
      source: 'environment'
    };
  }

  return {
    exists: false,
    hierarchy: CONFIG_HIERARCHY.NONE,
    source: null
  };
}

/**
 * Auto-generates MCP configuration files.
 *
 * @param {string} projectRoot - Root directory of the project
 * @param {object} options - Configuration options
 * @param {string} options.project - Project name (optional, auto-detected)
 * @param {string} options.agent - Agent name (optional, auto-generated)
 * @param {string} options.scope - Scope: "private", "project", or "global" (default: "project")
 * @param {boolean} options.global - If true, creates global config instead of project config
 * @returns {{ success: boolean, filePath: string, content: string, message: string }}
 *
 * @example
 * // Auto-generate project config from package.json
 * const result = setupMCP("/path/to/project", { global: false });
 * // Creates .mcp-project or .mcp-project.json
 *
 * @example
 * // Generate global config
 * const result = setupMCP("/path/to/project", { global: true });
 * // Creates ~/.mcp/config.json
 */
export function setupMCP(projectRoot, options = {}) {
  const {
    project: customProject = null,
    agent: customAgent = null,
    scope = 'project',
    global = false
  } = options;

  // Determine project name
  const projectName =
    customProject ||
    readPackageProjectName(projectRoot) ||
    path.basename(projectRoot);

  // Determine agent name
  const agentName = customAgent || generateDefaultAgent();

  if (global) {
    // Create global config
    const globalDir = getGlobalConfigPath();
    const globalConfigPath = path.join(globalDir, 'config.json');

    // Ensure directory exists
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
            MCP_SCOPE: scope
          }
        }
      }
    };

    fs.writeFileSync(globalConfigPath, JSON.stringify(content, null, 2));

    return {
      success: true,
      filePath: globalConfigPath,
      content: JSON.stringify(content, null, 2),
      message: `Global MCP config created at: ${globalConfigPath}`
    };
  }

  // Create project-level config (.mcp-project.json preferred for structured data)
  const configPath = path.join(projectRoot, '.mcp-project.json');
  const simplePath = path.join(projectRoot, '.mcp-project');

  const content = {
    project: projectName,
    agent: agentName,
    scope: scope,
    version: '1.0.0',
    createdAt: new Date().toISOString()
  };

  // Use JSON format for structured data
  fs.writeFileSync(configPath, JSON.stringify(content, null, 2));

  // Also create simple text file as fallback
  fs.writeFileSync(simplePath, projectName);

  return {
    success: true,
    filePath: configPath,
    files: [configPath, simplePath],
    content: JSON.stringify(content, null, 2),
    message: `Project MCP config created at: ${configPath}`
  };
}

/**
 * Interactive setup prompt for user configuration.
 * Returns a structured object with setup choices.
 *
 * @returns {{ choice: string, project?: string, agent?: string, scope?: string }}
 *
 * @example
 * const setup = getSetupPrompt();
 * // Returns user's choice and any custom values they provided
 */
export function getSetupPrompt() {
  return {
    intro: `
MCP Configuration Setup
=======================

No MCP configuration detected. Please choose an option:

1. Auto-generate from package.json (recommended)
2. Create global config (~/.mcp/config.json)
3. Manual input
4. Use environment variables (MCP_PROJECT, MCP_AGENT)

Enter choice (1-4): `,

    options: {
      '1': 'auto-generate',
      '2': 'global-config',
      '3': 'manual',
      '4': 'environment'
    }
  };
}

/**
 * Project identity resolution wrapper for MCP server.
 * Wraps resolveIdentity() with backward compatibility.
 *
 * @param {string} startDirectory - Directory to start resolution from
 * @param {object} env - Environment variables
 * @returns {{ projectRoot: string, derivedProject: string, project: string, agent: string, scope: string, source: string }}
 *
 * @example
 * const identity = resolveProjectIdentity();
 * console.log(identity.project); // "my-project"
 * console.log(identity.agent); // "dev-agent"
 */
export function resolveProjectIdentity(
  startDirectory = process.cwd(),
  env = process.env
) {
  try {
    const identity = resolveIdentity(startDirectory, env, false);

    return {
      projectRoot: identity.projectRoot,
      derivedProject: identity.project,
      project: identity.project,
      agent: identity.agent,
      scope: identity.scope,
      source: identity.source,
      hierarchy: identity.hierarchy
    };
  } catch (error) {
    if (error instanceof MCPSetupRequiredError) {
      // Log for debugging but don't crash the server
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
        hierarchy: CONFIG_HIERARCHY.NONE
      };
    }
    throw error;
  }
}
