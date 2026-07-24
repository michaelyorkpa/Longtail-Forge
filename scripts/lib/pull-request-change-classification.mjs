import { spawnSync } from "node:child_process";

const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIFF_STATUS_PATTERN = /^[ACDMRTUXB][0-9]*$/;
const ROOT_MARKDOWN_PATTERN = /^[^/]+\.md$/;
const DOCUMENTATION_TREE_CONFIGURATION_PATTERNS = Object.freeze([
  /(?:^|\/)(?:Caddyfile|Dockerfile)(?:[.-]|$)/i,
  /\.(?:conf|env|ini|service|toml|ya?ml)(?:\.|$)/i,
  /\.(?:bat|cmd|[cm]?[jt]sx?|json|php|ps1|py|rb|sh|sql)(?:\.|$)/i,
]);
const EXPLICIT_NON_RUNTIME_DOCUMENTATION_PATHS = Object.freeze([
  "LICENSE",
  "docs/docs-ownership.json",
]);

function normalizePullRequestPath(filePath) {
  return String(filePath || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function isDocumentationOnlyPath(filePath) {
  const normalized = normalizePullRequestPath(filePath);
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.split("/").includes("..")
  ) {
    return false;
  }

  const ordinaryDocumentationTreePath = normalized.startsWith("docs/")
    && !DOCUMENTATION_TREE_CONFIGURATION_PATTERNS.some((pattern) => pattern.test(normalized));

  return ROOT_MARKDOWN_PATTERN.test(normalized)
    || ordinaryDocumentationTreePath
    || EXPLICIT_NON_RUNTIME_DOCUMENTATION_PATHS.includes(normalized);
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
      .map(normalizePullRequestPath);
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

function classifyPullRequestChanges(entries = []) {
  const normalizedEntries = entries.map((entry) => Object.freeze({
    paths: Object.freeze((entry.paths || []).map(normalizePullRequestPath)),
    status: String(entry.status || ""),
  }));
  const paths = [...new Set(normalizedEntries.flatMap((entry) => entry.paths))].sort();
  const docsOnly = normalizedEntries.length > 0
    && normalizedEntries.every(
      (entry) => DIFF_STATUS_PATTERN.test(entry.status)
        && entry.paths.length > 0
        && entry.paths.every(isDocumentationOnlyPath),
    );

  return Object.freeze({
    docsOnly,
    entries: Object.freeze(normalizedEntries),
    paths: Object.freeze(paths),
    summary: docsOnly
      ? `Docs-only pull request: ${normalizedEntries.length} diff entr${normalizedEntries.length === 1 ? "y" : "ies"}.`
      : `Full validation required: ${normalizedEntries.length} diff entr${normalizedEntries.length === 1 ? "y" : "ies"}.`,
  });
}

function collectPullRequestChangeClassification({
  baseSha = process.env.LTF_REGRESSION_BASE_SHA,
  cwd = process.cwd(),
} = {}) {
  const normalizedBaseSha = String(baseSha || "").trim();
  if (!FULL_SHA_PATTERN.test(normalizedBaseSha)) {
    throw new Error("LTF_REGRESSION_BASE_SHA must be a full 40-character commit SHA.");
  }

  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      `${normalizedBaseSha}...HEAD`,
      "--",
    ],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Unable to inspect the complete pull-request diff: ${String(result.stderr || result.stdout).trim()}`);
  }

  return classifyPullRequestChanges(parseNameStatusDiff(result.stdout));
}

export {
  EXPLICIT_NON_RUNTIME_DOCUMENTATION_PATHS,
  classifyPullRequestChanges,
  collectPullRequestChangeClassification,
  isDocumentationOnlyPath,
  normalizePullRequestPath,
  parseNameStatusDiff,
};
