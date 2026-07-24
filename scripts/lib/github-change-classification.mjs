import { spawnSync } from "node:child_process";
import { RUNTIME_PATHS } from "../build-runtime-artifact.mjs";

const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIFF_STATUS_PATTERN = /^[ACDMRTUXB][0-9]*$/;
const ROOT_MARKDOWN_PATTERN = /^[^/]+\.md$/;
const DOCUMENTATION_TREE_CONFIGURATION_PATTERNS = Object.freeze([
  /(?:^|\/)(?:Caddyfile|Dockerfile)(?:[.-]|$)/i,
  /\.(?:conf|env|ini|service|toml|ya?ml)(?:\.|$)/i,
  /\.(?:bat|cmd|[cm]?[jt]sx?|json|php|ps1|py|rb|sh|sql)(?:\.|$)/i,
]);
const CHANGE_COMPARISONS = new Set(["merge-base", "range"]);

function normalizeGitHubChangePath(filePath) {
  return String(filePath || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function isRuntimeArtifactPath(filePath) {
  const normalized = normalizeGitHubChangePath(filePath);
  return RUNTIME_PATHS.some((runtimePath) => (
    normalized === runtimePath || normalized.startsWith(`${runtimePath}/`)
  ));
}

function isRuntimeHelpPath(filePath) {
  const normalized = normalizeGitHubChangePath(filePath);
  return normalized === "help" || normalized.startsWith("help/");
}

function isGitHubOnlyDocumentationPath(filePath) {
  const normalized = normalizeGitHubChangePath(filePath);
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.split("/").includes("..")
    || isRuntimeArtifactPath(normalized)
  ) {
    return false;
  }

  const ordinaryDocumentationTreePath = normalized.startsWith("docs/")
    && !DOCUMENTATION_TREE_CONFIGURATION_PATTERNS.some((pattern) => pattern.test(normalized));

  return ROOT_MARKDOWN_PATTERN.test(normalized)
    || ordinaryDocumentationTreePath;
}

function parseNameStatusDiff(output = "") {
  const tokens = String(output).split("\0");
  if (tokens.at(-1) === "") tokens.pop();

  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!DIFF_STATUS_PATTERN.test(status)) {
      throw new Error(`Unexpected git diff status: ${status || "<empty>"}`);
    }

    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = tokens
      .slice(index, index + pathCount)
      .map(normalizeGitHubChangePath);
    if (paths.length !== pathCount || paths.some((filePath) => !filePath)) {
      throw new Error(`Incomplete git diff entry for status ${status}.`);
    }
    index += pathCount;
    entries.push(Object.freeze({
      paths: Object.freeze(paths),
      status,
    }));
  }

  return Object.freeze(entries);
}

function classifyGitHubChanges(entries = []) {
  const normalizedEntries = entries.map((entry) => Object.freeze({
    paths: Object.freeze((entry.paths || []).map(normalizeGitHubChangePath)),
    status: String(entry.status || ""),
  }));
  const paths = [...new Set(normalizedEntries.flatMap((entry) => entry.paths))].sort();
  const githubOnlyDocs = normalizedEntries.length > 0
    && normalizedEntries.every(
      (entry) => DIFF_STATUS_PATTERN.test(entry.status)
        && entry.paths.length > 0
        && entry.paths.every(isGitHubOnlyDocumentationPath),
    );
  const runtimeHelpChanged = paths.some(isRuntimeHelpPath);

  return Object.freeze({
    githubOnlyDocs,
    runtimeHelpChanged,
    entries: Object.freeze(normalizedEntries),
    paths: Object.freeze(paths),
    summary: githubOnlyDocs
      ? `GitHub-only documentation: ${normalizedEntries.length} diff entr${normalizedEntries.length === 1 ? "y" : "ies"}.`
      : runtimeHelpChanged
        ? `Runtime Help changed: full validation, artifact, and deployment paths remain required.`
      : `Full validation required: ${normalizedEntries.length} diff entr${normalizedEntries.length === 1 ? "y" : "ies"}.`,
  });
}

function collectGitHubChangeClassification({
  baseSha = process.env.LTF_CHANGE_BASE_SHA || process.env.LTF_REGRESSION_BASE_SHA,
  comparison = process.env.LTF_CHANGE_COMPARISON || "merge-base",
  cwd = process.cwd(),
  headRef = "HEAD",
} = {}) {
  const normalizedBaseSha = String(baseSha || "").trim();
  if (!FULL_SHA_PATTERN.test(normalizedBaseSha)) {
    throw new Error("LTF_CHANGE_BASE_SHA (or LTF_REGRESSION_BASE_SHA) must be a full 40-character commit SHA.");
  }
  if (!CHANGE_COMPARISONS.has(comparison)) {
    throw new Error("LTF_CHANGE_COMPARISON must be merge-base or range.");
  }

  const separator = comparison === "range" ? ".." : "...";
  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      `${normalizedBaseSha}${separator}${headRef}`,
      "--",
    ],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Unable to inspect the complete GitHub change diff: ${String(result.stderr || result.stdout).trim()}`);
  }

  return classifyGitHubChanges(parseNameStatusDiff(result.stdout));
}

export {
  CHANGE_COMPARISONS,
  classifyGitHubChanges,
  collectGitHubChangeClassification,
  isGitHubOnlyDocumentationPath,
  isRuntimeArtifactPath,
  isRuntimeHelpPath,
  normalizeGitHubChangePath,
  parseNameStatusDiff,
};
