import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const EXCLUDED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".local",
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

/**
 * @typedef {object} VersionLiteralLineRule
 * @property {string} path
 * @property {string} pattern
 */

/**
 * @typedef {object} VersionLiteralAllowlist
 * @property {number} schemaVersion
 * @property {string[]} currentVersionLiteralFiles
 * @property {VersionLiteralLineRule[]} currentVersionLiteralLineRules
 * @property {string[]} historicalLabelDirectories
 * @property {string[]} historicalLabelFiles
 */

/**
 * @typedef {object} NormalizedVersionLiteralAllowlist
 * @property {Set<string>} currentVersionLiteralFiles
 * @property {{ path: string, pattern: RegExp }[]} currentVersionLiteralLineRules
 * @property {string[]} historicalLabelDirectories
 * @property {Set<string>} historicalLabelFiles
 */

/** @typedef {Partial<VersionLiteralAllowlist> | NormalizedVersionLiteralAllowlist} VersionLiteralAllowlistInput */

/**
 * @typedef {object} WorkspaceTextEntry
 * @property {string} path
 * @property {string} source
 */

/**
 * @typedef {object} WorkspaceTextEntryOptions
 * @property {VersionLiteralAllowlistInput} [allowlist]
 * @property {string[]} [candidateFiles]
 * @property {number} [maxTextFileBytes]
 */

/**
 * @typedef {object} VersionLiteralViolation
 * @property {number} column
 * @property {number} line
 * @property {string} path
 */

/**
 * @param {string} rootDir
 * @returns {Promise<NormalizedVersionLiteralAllowlist>}
 */
async function loadVersionLiteralAllowlist(rootDir) {
  const allowlistPath = path.join(rootDir, "scripts", "version-literal-allowlist.json");
  /** @type {VersionLiteralAllowlist} */
  const allowlist = JSON.parse(await fs.readFile(allowlistPath, "utf8"));

  if (allowlist.schemaVersion !== 1) {
    throw new Error(`Unsupported version literal allowlist schema: ${allowlist.schemaVersion}`);
  }
  for (const field of /** @type {("currentVersionLiteralFiles" | "historicalLabelFiles" | "historicalLabelDirectories")[]} */ ([
    "currentVersionLiteralFiles",
    "historicalLabelFiles",
    "historicalLabelDirectories",
  ])) {
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

/**
 * @param {string} rootDir
 * @param {string} version
 * @param {VersionLiteralAllowlistInput} allowlist
 * @param {{ candidateFiles?: string[], maxTextFileBytes?: number }} [options]
 * @returns {Promise<VersionLiteralViolation[]>}
 */
async function scanWorkspaceForCurrentVersion(rootDir, version, allowlist, options = {}) {
  const entries = await readWorkspaceTextEntries(rootDir, { ...options, allowlist });
  return scanEntriesForCurrentVersion(entries, version, allowlist);
}

/**
 * @param {WorkspaceTextEntry[]} entries
 * @param {string} version
 * @param {VersionLiteralAllowlistInput} allowlist
 * @returns {VersionLiteralViolation[]}
 */
function scanEntriesForCurrentVersion(entries, version, allowlist) {
  const currentVersion = String(version || "").trim();
  if (!currentVersion) {
    throw new Error("A current application version is required for the literal scan.");
  }

  const normalizedAllowlist = normalizeAllowlist(allowlist);
  /** @type {VersionLiteralViolation[]} */
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
      if (isExactDottedVersionToken(source, index, currentVersion.length)) {
        const location = sourceLocation(source, index);
        if (!isAllowedCurrentVersionLine(filePath, source, location.line, normalizedAllowlist)) {
          violations.push({
            column: location.column,
            line: location.line,
            path: filePath,
          });
        }
      }
      index = source.indexOf(currentVersion, index + currentVersion.length);
    }
  }

  return violations;
}

/**
 * @param {string} source
 * @param {number} index
 * @param {number} length
 * @returns {boolean}
 */
function isExactDottedVersionToken(source, index, length) {
  const precedingCharacter = source[index - 1] || "";
  const followingCharacter = source[index + length] || "";
  return !/[0-9.]/.test(precedingCharacter) && !/[0-9.]/.test(followingCharacter);
}

/**
 * @param {string} filePath
 * @param {NormalizedVersionLiteralAllowlist} allowlist
 * @returns {boolean}
 */
function isHistoricalLabelPath(filePath, allowlist) {
  if (allowlist.historicalLabelFiles.has(filePath)) {
    return true;
  }
  return allowlist.historicalLabelDirectories.some((directory) => filePath.startsWith(directory));
}

/**
 * @param {string} rootDir
 * @param {WorkspaceTextEntryOptions} [options]
 * @returns {Promise<WorkspaceTextEntry[]>}
 */
async function readWorkspaceTextEntries(rootDir, {
  allowlist,
  candidateFiles,
  maxTextFileBytes = MAX_TEXT_FILE_BYTES,
} = {}) {
  const normalizedAllowlist = normalizeAllowlist(allowlist);
  /** @type {WorkspaceTextEntry[]} */
  const entries = [];
  /** @type {{ path: string, size: number }[]} */
  const oversizedFiles = [];
  const root = path.resolve(rootDir);
  const files = candidateFiles || listGitVisibleFiles(root) || await listWalkedFiles(root);

  for (const candidate of files) {
    const relativePath = normalizeRepoPath(candidate);
    if (shouldExcludeWorkspacePath(relativePath, normalizedAllowlist)) {
      continue;
    }

    const filePath = path.join(root, relativePath);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (!stat.isFile()) {
      continue;
    }
    if (stat.size >= maxTextFileBytes) {
      oversizedFiles.push({ path: relativePath, size: stat.size });
      continue;
    }

    const source = await fs.readFile(filePath, "utf8");
    if (!source.includes("\0")) {
      entries.push({ path: relativePath, source });
    }
  }

  if (oversizedFiles.length > 0) {
    throw new Error(
      `Version literal scan found files at or beyond its ${maxTextFileBytes}-byte ceiling:\n${oversizedFiles
        .map((entry) => `- ${entry.path} (${entry.size} bytes)`)
        .join("\n")}`,
    );
  }
  return entries;
}

/**
 * @param {string} rootDir
 * @returns {string[] | null}
 */
function listGitVisibleFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.split("\0").filter(Boolean);
}

/**
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listWalkedFiles(rootDir) {
  /** @type {string[]} */
  const files = [];
  await walkDirectory(rootDir, "", files);
  return files;
}

/**
 * @param {string} rootDir
 * @param {string} relativeDir
 * @param {string[]} files
 */
async function walkDirectory(rootDir, relativeDir, files) {
  const directoryPath = path.join(rootDir, relativeDir);
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        await walkDirectory(rootDir, relativePath, files);
      }
      continue;
    }
    if (!entry.isFile() || EXCLUDED_FILES.has(entry.name) || entry.name.startsWith(".node-server")) {
      continue;
    }

    files.push(normalizeRepoPath(relativePath));
  }
}

/**
 * @param {string} filePath
 * @param {NormalizedVersionLiteralAllowlist} allowlist
 * @returns {boolean}
 */
function shouldExcludeWorkspacePath(filePath, allowlist) {
  const normalizedPath = normalizeRepoPath(filePath);
  const segments = normalizedPath.split("/");
  return segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))
    || EXCLUDED_FILES.has(/** @type {string} */ (segments.at(-1)))
    || /** @type {string} */ (segments.at(-1)).startsWith(".node-server")
    || allowlist.currentVersionLiteralFiles.has(normalizedPath)
    || isHistoricalLabelPath(normalizedPath, allowlist);
}

/**
 * @param {VersionLiteralAllowlistInput} [allowlist]
 * @returns {NormalizedVersionLiteralAllowlist}
 */
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

/**
 * @param {string} filePath
 * @param {string} source
 * @param {number} lineNumber
 * @param {NormalizedVersionLiteralAllowlist} allowlist
 * @returns {boolean}
 */
function isAllowedCurrentVersionLine(filePath, source, lineNumber, allowlist) {
  const line = (String(source || "").split("\n")[lineNumber - 1] || "").replace(/\r$/, "");
  return allowlist.currentVersionLiteralLineRules.some((rule) => (
    rule.path === filePath && rule.pattern.test(line)
  ));
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {{ column: number, line: number }}
 */
function sourceLocation(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  return {
    column: /** @type {string} */ (lines.at(-1)).length + 1,
    line: lines.length,
  };
}

export {
  isHistoricalLabelPath,
  loadVersionLiteralAllowlist,
  readWorkspaceTextEntries,
  scanEntriesForCurrentVersion,
  scanWorkspaceForCurrentVersion,
  shouldExcludeWorkspacePath,
};
