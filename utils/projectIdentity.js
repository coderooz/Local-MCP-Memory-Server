import fs from "fs";
import path from "path";

const PROJECT_MARKERS = [
  ".mcp-project",
  ".mcp-project.json",
  ".git",
  ".roo",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  ".venv"
];

export function hasProjectMarker(directory) {
  return PROJECT_MARKERS.some((marker) =>
    fs.existsSync(path.join(directory, marker))
  );
}

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

export function slugifyProjectName(name = "") {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default-project"
  );
}

function readTextFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8").trim();
}

function readProjectOverride(projectRoot) {
  const textOverride = readTextFileIfExists(path.join(projectRoot, ".mcp-project"));

  if (textOverride) {
    return textOverride;
  }

  const jsonOverride = readTextFileIfExists(
    path.join(projectRoot, ".mcp-project.json")
  );

  if (!jsonOverride) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonOverride);
    return parsed.project || parsed.name || null;
  } catch {
    return null;
  }
}

function readPackageProjectName(projectRoot) {
  const packageJson = readTextFileIfExists(path.join(projectRoot, "package.json"));

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

export function resolveProjectIdentity(
  startDirectory = process.cwd(),
  env = process.env
) {
  const projectRoot = findProjectRoot(startDirectory);
  const explicitProject =
    readProjectOverride(projectRoot) ||
    env.MCP_PROJECT ||
    readPackageProjectName(projectRoot) ||
    path.basename(projectRoot);
  const derivedProject = slugifyProjectName(explicitProject);
  const project = derivedProject;

  return {
    projectRoot,
    derivedProject,
    project
  };
}
