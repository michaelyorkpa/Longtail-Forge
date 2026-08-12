import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECKPOINT_SERIES = "0.33.33";
const CLOSEOUT_CHECKPOINT = `${CHECKPOINT_SERIES}.48`;
const TRAILER_NAMES = Object.freeze({
  checkpoint: "LTF-Checkpoint",
  docs: "LTF-Docs",
  summary: "LTF-Summary",
});
const DEFERRED_RELEASE_PATHS = new Set([
  "CHANGELOG.md",
  "DECISIONS.md",
  "package-lock.json",
  "package.json",
]);

function parseCheckpointTrailers(message) {
  const paragraphs = String(message || "").trimEnd().split(/\r?\n\s*\r?\n/);
  const block = paragraphs.at(-1) || "";
  const values = new Map();
  const duplicates = new Set();
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9-]+):[ \t]+(.+?)\s*$/);
    if (!match) continue;
    const [, name, value] = match;
    if (values.has(name)) duplicates.add(name);
    values.set(name, value);
  }
  return Object.freeze({ duplicates, values });
}

function validateCheckpointCommit({
  message,
  parentCount = 1,
  paths = [],
  roadmapArchiveSource = "",
  roadmapSource = "",
  series = CHECKPOINT_SERIES,
  closeoutCheckpoint = CLOSEOUT_CHECKPOINT,
} = {}) {
  const normalizedPaths = [...new Set(paths.map(normalizePath).filter(Boolean))].sort();
  if (parentCount > 1) return result("merge", [], normalizedPaths);

  const trailers = parseCheckpointTrailers(message);
  const requiredNames = Object.values(TRAILER_NAMES);
  const presentNames = requiredNames.filter((name) => trailers.values.has(name));
  if (presentNames.length === 0 && normalizedPaths.length > 0 && normalizedPaths.every((filePath) => filePath === "ROADMAP.md")) {
    return result("planning", [], normalizedPaths);
  }

  const errors = [];
  for (const name of requiredNames) {
    if (!trailers.values.has(name)) errors.push(`missing required ${name} trailer`);
    if (trailers.duplicates.has(name)) errors.push(`${name} trailer must appear exactly once`);
  }
  if (errors.length > 0) return result("invalid", errors, normalizedPaths);

  const checkpoint = trailers.values.get(TRAILER_NAMES.checkpoint);
  const summary = trailers.values.get(TRAILER_NAMES.summary);
  const docsDisposition = trailers.values.get(TRAILER_NAMES.docs);
  const checkpointPattern = new RegExp(`^${escapeRegExp(series)}\\.[1-9][0-9]*$`);
  if (!checkpointPattern.test(checkpoint)) {
    errors.push(`${TRAILER_NAMES.checkpoint} must be a numeric ${series}.# slice`);
  }
  if (summary.length < 10 || summary.length > 200 || /[\r\n]/.test(summary)) {
    errors.push(`${TRAILER_NAMES.summary} must be a single-line 10-200 character outcome`);
  }
  const liveHeading = new RegExp(`^### ${escapeRegExp(checkpoint)}(?: -|$)`, "m");
  const archivedHeading = new RegExp(`^## Version ${escapeRegExp(checkpoint)}(?: -|$)`, "m");
  if (checkpointPattern.test(checkpoint) && !liveHeading.test(roadmapSource) && !archivedHeading.test(roadmapArchiveSource)) {
    errors.push(`${checkpoint} is not a declared numbered checkpoint in ROADMAP.md or ROADMAP-ARCHIVE.md`);
  }

  const documentationPaths = normalizedPaths.filter(isDocumentationPath);
  validateDocsDisposition(docsDisposition, documentationPaths, errors);

  const ceremonyPaths = normalizedPaths.filter(isCeremonyPath);
  const isCloseout = checkpoint === closeoutCheckpoint;
  if (!isCloseout && ceremonyPaths.length > 2) {
    errors.push(`internal checkpoint ${checkpoint} changes ${ceremonyPaths.length} ceremony files; maximum is 2 (${ceremonyPaths.join(", ")})`);
  }
  if (!isCloseout) {
    for (const filePath of normalizedPaths) {
      if (DEFERRED_RELEASE_PATHS.has(filePath)) {
        errors.push(`${filePath} is reserved for ${closeoutCheckpoint} branch closeout`);
      }
      if (checkpoint !== `${series}.1` && isDocumentationPath(filePath)) {
        errors.push(`${filePath} durable documentation is reserved for ${closeoutCheckpoint} branch closeout`);
      }
    }
  }

  return Object.freeze({
    ceremonyPaths: Object.freeze(ceremonyPaths),
    checkpoint,
    docsDisposition,
    errors: Object.freeze(errors),
    kind: errors.length === 0 ? "checkpoint" : "invalid",
    paths: Object.freeze(normalizedPaths),
    summary,
  });
}

function validateDocsDisposition(disposition, documentationPaths, errors) {
  const noDocsMatch = disposition.match(/^No docs change needed: (.{5,})\.$/);
  const updatedMatch = disposition.match(/^Docs updated: (.+)\.$/);
  if (documentationPaths.length === 0) {
    if (!noDocsMatch) errors.push(`${TRAILER_NAMES.docs} must use "No docs change needed: <reason>." when no documentation changed`);
    return;
  }
  if (!updatedMatch) {
    errors.push(`${TRAILER_NAMES.docs} must use "Docs updated: <comma-separated paths>." when documentation changed`);
    return;
  }
  const declaredPaths = [...new Set(updatedMatch[1].split(",").map(normalizePath).filter(Boolean))].sort();
  if (JSON.stringify(declaredPaths) !== JSON.stringify(documentationPaths)) {
    errors.push(`${TRAILER_NAMES.docs} paths must exactly match changed documentation (${documentationPaths.join(", ")})`);
  }
}

function isDocumentationPath(filePath) {
  return filePath === "AGENTS.md"
    || filePath === "README.md"
    || filePath === "SECURITY.md"
    || filePath.startsWith("docs/")
    || filePath.startsWith("help/");
}

function isCeremonyPath(filePath) {
  return DEFERRED_RELEASE_PATHS.has(filePath)
    || filePath === "ROADMAP.md"
    || filePath === "ROADMAP-ARCHIVE.md"
    || isDocumentationPath(filePath);
}

function normalizePath(filePath) {
  return String(filePath || "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function result(kind, errors, paths) {
  return Object.freeze({
    ceremonyPaths: Object.freeze(paths.filter(isCeremonyPath)),
    errors: Object.freeze(errors),
    kind,
    paths: Object.freeze(paths),
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runGit(args, cwd = process.cwd()) {
  const completed = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (completed.status !== 0) throw new Error(String(completed.stderr || completed.stdout).trim());
  return String(completed.stdout || "");
}

function inspectCheckpointRange({ baseSha, cwd = process.cwd(), head = "HEAD", roadmapArchiveSource, roadmapSource } = {}) {
  if (!/^[a-f0-9]{40}$/i.test(String(baseSha || ""))) {
    throw new Error("LTF_CHECKPOINT_BASE_SHA must be a full 40-character commit SHA.");
  }
  const roadmap = roadmapSource ?? readFileSync(path.join(cwd, "ROADMAP.md"), "utf8");
  const roadmapArchive = roadmapArchiveSource ?? readFileSync(path.join(cwd, "ROADMAP-ARCHIVE.md"), "utf8");
  const commits = runGit(["rev-list", "--reverse", `${baseSha}..${head}`], cwd).split(/\r?\n/).filter(Boolean);
  return Object.freeze(commits.map((sha) => {
    const parents = runGit(["show", "-s", "--format=%P", sha], cwd).trim().split(/\s+/).filter(Boolean);
    const message = runGit(["show", "-s", "--format=%B", sha], cwd);
    const paths = runGit(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "--find-renames", sha], cwd).split(/\r?\n/).filter(Boolean);
    return Object.freeze({ sha, validation: validateCheckpointCommit({
      message,
      parentCount: parents.length,
      paths,
      roadmapArchiveSource: roadmapArchive,
      roadmapSource: roadmap,
    }) });
  }));
}

function formatCheckpointRange(results) {
  const lines = ["Checkpoint commit validation"];
  for (const { sha, validation } of results) {
    const label = validation.checkpoint ? `${validation.kind} ${validation.checkpoint}` : validation.kind;
    lines.push(`- ${sha.slice(0, 12)}: ${label}`);
    for (const error of validation.errors) lines.push(`  - ${error}`);
  }
  const failures = results.filter(({ validation }) => validation.errors.length > 0).length;
  lines.push(`Status: ${failures === 0 ? "passed" : `failed (${failures} commit${failures === 1 ? "" : "s"})`}`);
  return lines.join("\n");
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/release/checkpoint-commits.mjs");
  const results = inspectCheckpointRange({ baseSha: process.env.LTF_CHECKPOINT_BASE_SHA });
  console.log(formatCheckpointRange(results));
  if (results.some(({ validation }) => validation.errors.length > 0)) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export {
  CHECKPOINT_SERIES,
  CLOSEOUT_CHECKPOINT,
  TRAILER_NAMES,
  formatCheckpointRange,
  inspectCheckpointRange,
  isCeremonyPath,
  isDocumentationPath,
  parseCheckpointTrailers,
  validateCheckpointCommit,
};
