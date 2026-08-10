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

async function scanWorkspaceForCurrentVersion(rootDir, version, allowlist, options = {}) {
  const entries = await readWorkspaceTextEntries(rootDir, { ...options, allowlist });
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

function isExactDottedVersionToken(source, index, length) {
  const precedingCharacter = source[index - 1] || "";
  const followingCharacter = source[index + length] || "";
  return !/[0-9.]/.test(precedingCharacter) && !/[0-9.]/.test(followingCharacter);
}

function isHistoricalLabelPath(filePath, allowlist) {
  if (allowlist.historicalLabelFiles.has(filePath)) {
    return true;
  }
  return allowlist.historicalLabelDirectories.some((directory) => filePath.startsWith(directory));
}

async function readWorkspaceTextEntries(rootDir, {
  allowlist,
  candidateFiles,
  maxTextFileBytes = MAX_TEXT_FILE_BYTES,
} = {}) {
  const normalizedAllowlist = normalizeAllowlist(allowlist);
  const entries = [];
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
      if (error?.code === "ENOENT") {
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

async function listWalkedFiles(rootDir) {
  const files = [];
  await walkDirectory(rootDir, "", files);
  return files;
}

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

function shouldExcludeWorkspacePath(filePath, allowlist) {
  const normalizedPath = normalizeRepoPath(filePath);
  const segments = normalizedPath.split("/");
  return segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))
    || EXCLUDED_FILES.has(segments.at(-1))
    || segments.at(-1).startsWith(".node-server")
    || allowlist.currentVersionLiteralFiles.has(normalizedPath)
    || isHistoricalLabelPath(normalizedPath, allowlist);
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
  const line = (String(source || "").split("\n")[lineNumber - 1] || "").replace(/\r$/, "");
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
  readWorkspaceTextEntries,
  scanEntriesForCurrentVersion,
  scanWorkspaceForCurrentVersion,
  shouldExcludeWorkspacePath,
};
