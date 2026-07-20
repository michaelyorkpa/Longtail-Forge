import fs from "node:fs/promises";
import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  "coverage",
  "data",
  "dist",
  "logs",
  "node_modules",
]);
const EXCLUDED_FILES = new Set([
  ".eslintcache",
]);
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

async function loadVersionLiteralAllowlist(rootDir) {
  const allowlistPath = path.join(rootDir, "scripts", "version-literal-allowlist.json");
  const allowlist = JSON.parse(await fs.readFile(allowlistPath, "utf8"));

  if (allowlist.schemaVersion !== 1) {
    throw new Error(`Unsupported version literal allowlist schema: ${allowlist.schemaVersion}`);
  }
  for (const field of [
    "currentVersionLiteralFiles",
    "historicalLabelFiles",
    "historicalLabelDirectories",
  ]) {
    if (!Array.isArray(allowlist[field]) || allowlist[field].some((value) => typeof value !== "string")) {
      throw new Error(`Version literal allowlist field ${field} must be an array of paths.`);
    }
  }
  if (!Array.isArray(allowlist.currentVersionLiteralLineRules) || allowlist.currentVersionLiteralLineRules.some((rule) => (
    !rule || typeof rule !== "object" || typeof rule.path !== "string" || typeof rule.pattern !== "string"
  ))) {
    throw new Error("Version literal allowlist field currentVersionLiteralLineRules must contain path/pattern objects.");
  }

  return normalizeAllowlist(allowlist);
}

async function scanWorkspaceForCurrentVersion(rootDir, version, allowlist) {
  const entries = await readWorkspaceTextEntries(rootDir);
  return scanEntriesForCurrentVersion(entries, version, allowlist);
}

function scanEntriesForCurrentVersion(entries, version, allowlist) {
  const currentVersion = String(version || "").trim();
  if (!currentVersion) {
    throw new Error("A current application version is required for the literal scan.");
  }

  const normalizedAllowlist = normalizeAllowlist(allowlist);
  const violations = [];

  for (const entry of entries) {
    const filePath = normalizeRepoPath(entry.path);
    if (isHistoricalLabelPath(filePath, normalizedAllowlist)) {
      continue;
    }
    if (normalizedAllowlist.currentVersionLiteralFiles.has(filePath)) {
      continue;
    }

    const source = String(entry.source || "");
    let index = source.indexOf(currentVersion);
    while (index !== -1) {
      const location = sourceLocation(source, index);
      if (!isAllowedCurrentVersionLine(filePath, source, location.line, normalizedAllowlist)) {
        violations.push({
          column: location.column,
          line: location.line,
          path: filePath,
        });
      }
      index = source.indexOf(currentVersion, index + currentVersion.length);
    }
  }

  return violations;
}

function isHistoricalLabelPath(filePath, allowlist) {
  if (allowlist.historicalLabelFiles.has(filePath)) {
    return true;
  }
  return allowlist.historicalLabelDirectories.some((directory) => filePath.startsWith(directory));
}

async function readWorkspaceTextEntries(rootDir) {
  const entries = [];
  await walkDirectory(path.resolve(rootDir), "", entries);
  return entries;
}

async function walkDirectory(rootDir, relativeDir, entries) {
  const directoryPath = path.join(rootDir, relativeDir);
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        await walkDirectory(rootDir, relativePath, entries);
      }
      continue;
    }
    if (!entry.isFile() || EXCLUDED_FILES.has(entry.name) || entry.name.startsWith(".node-server")) {
      continue;
    }

    const filePath = path.join(rootDir, relativePath);
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      continue;
    }
    const source = await fs.readFile(filePath, "utf8");
    if (!source.includes("\0")) {
      entries.push({ path: normalizeRepoPath(relativePath), source });
    }
  }
}

function normalizeAllowlist(allowlist = {}) {
  return {
    currentVersionLiteralFiles: new Set(
      [...(allowlist.currentVersionLiteralFiles || [])].map(normalizeRepoPath),
    ),
    currentVersionLiteralLineRules: [...(allowlist.currentVersionLiteralLineRules || [])].map((rule) => ({
      path: normalizeRepoPath(rule.path),
      pattern: new RegExp(rule.pattern),
    })),
    historicalLabelDirectories: [...(allowlist.historicalLabelDirectories || [])]
      .map(normalizeRepoPath)
      .map((directory) => directory.endsWith("/") ? directory : `${directory}/`),
    historicalLabelFiles: new Set(
      [...(allowlist.historicalLabelFiles || [])].map(normalizeRepoPath),
    ),
  };
}

function isAllowedCurrentVersionLine(filePath, source, lineNumber, allowlist) {
  const line = String(source || "").split("\n")[lineNumber - 1] || "";
  return allowlist.currentVersionLiteralLineRules.some((rule) => (
    rule.path === filePath && rule.pattern.test(line)
  ));
}

function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function sourceLocation(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  return {
    column: lines.at(-1).length + 1,
    line: lines.length,
  };
}

export {
  isHistoricalLabelPath,
  loadVersionLiteralAllowlist,
  scanEntriesForCurrentVersion,
  scanWorkspaceForCurrentVersion,
};
