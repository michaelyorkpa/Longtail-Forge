import { escapeRegExp } from "../test-support/source-scan.mjs";
import { spawnSync } from "node:child_process";
import { requirePackageManifest } from "../test-support/package-manifest-assertions.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECKPOINT_SERIES = "0.33.33";
const CLOSEOUT_CHECKPOINT = `${CHECKPOINT_SERIES}.48`;
const CHECKPOINT_USAGE = "Usage: node scripts/release/checkpoint-commits.mjs [--base-ref <ref>]";
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;
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

/** @typedef {{ ceremonyPaths: readonly string[], checkpoint?: string, docsDisposition?: string, errors: readonly string[], kind: string, paths: readonly string[], summary?: string }} CheckpointValidation */
/** @typedef {{ sha: string, validation: CheckpointValidation }} CheckpointRangeEntry */

/** @param {string | undefined} message */
function parseCheckpointTrailers(message) {
  const paragraphs = String(message || "").trimEnd().split(/\r?\n\s*\r?\n/);
  const block = paragraphs.at(-1) || "";
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {Set<string>} */
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

/**
 * @param {{
 *   message?: string,
 *   packageAfterSource?: string,
 *   packageBeforeSource?: string,
 *   parentCount?: number,
 *   paths?: string[],
 *   roadmapArchiveSource?: string,
 *   roadmapSource?: string,
 *   series?: string,
 *   closeoutCheckpoint?: string,
 * }} options
 */
function validateCheckpointCommit({
  message,
  packageAfterSource = "",
  packageBeforeSource = "",
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

  // Every required trailer is present here: the loop above returns "invalid"
  // when any name is missing, so these lookups cannot be undefined.
  const checkpoint = /** @type {string} */ (trailers.values.get(TRAILER_NAMES.checkpoint));
  const summary = /** @type {string} */ (trailers.values.get(TRAILER_NAMES.summary));
  const docsDisposition = /** @type {string} */ (trailers.values.get(TRAILER_NAMES.docs));
  const checkpointPattern = new RegExp(`^${escapeRegExp(series)}(?:\\.[1-9][0-9]*)+$`);
  if (!checkpointPattern.test(checkpoint)) {
    errors.push(`${TRAILER_NAMES.checkpoint} must be a numeric ${series}.#[.#...] slice`);
  }
  if (summary.length < 10 || summary.length > 200 || /[\r\n]/.test(summary)) {
    errors.push(`${TRAILER_NAMES.summary} must be a single-line 10-200 character outcome`);
  }
  // The roadmap declares ordinary implementation checkpoints as `### <id>`, and
  // a planning rollup declares its resliced implementation children and any
  // corrective child as `#### <id>` beneath its own `###` heading. Both levels
  // are live declarations, so both satisfy checkpoint identity; recognising only
  // `###` reported a valid implementation commit for a live `####` child as
  // referring to an undeclared checkpoint until its archive entry existed. The
  // identifier itself still has to match exactly, and no other heading depth
  // qualifies.
  const liveHeading = new RegExp(`^#{3,4} ${escapeRegExp(checkpoint)}(?: -|$)`, "m");
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
      if (filePath === "package.json" && isScriptOnlyPackageChange(packageBeforeSource, packageAfterSource)) {
        continue;
      }
      if (DEFERRED_RELEASE_PATHS.has(filePath)) {
        errors.push(`${filePath} is reserved for ${closeoutCheckpoint} branch closeout`);
      }
      if (checkpoint !== `${series}.1` && isDocumentationPath(filePath) && !isGeneratedDocumentationPath(filePath)) {
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

/** @param {string} beforeSource @param {string} afterSource */
function isScriptOnlyPackageChange(beforeSource, afterSource) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforePackage = requirePackageManifest(JSON.parse(beforeSource), "the previous package.json");
    const afterPackage = requirePackageManifest(JSON.parse(afterSource), "package.json in the working tree");
    if (beforePackage.version !== afterPackage.version) return false;
    const beforeScripts = beforePackage.scripts;
    const afterScripts = afterPackage.scripts;
    delete beforePackage.scripts;
    delete afterPackage.scripts;
    return JSON.stringify(beforePackage) === JSON.stringify(afterPackage)
      && JSON.stringify(beforeScripts) !== JSON.stringify(afterScripts);
  } catch {
    return false;
  }
}

/** @param {string} disposition @param {readonly string[]} documentationPaths @param {string[]} errors */
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

/** @param {string} filePath */
function isDocumentationPath(filePath) {
  return filePath === "AGENTS.md"
    || filePath === "README.md"
    || filePath === "SECURITY.md"
    || filePath.startsWith("docs/")
    || filePath.startsWith("help/");
}

/** @param {string} filePath */
function isGeneratedDocumentationPath(filePath) {
  return filePath === "docs/regression-suite.md";
}

/** @param {string} filePath */
function isCeremonyPath(filePath) {
  return DEFERRED_RELEASE_PATHS.has(filePath)
    || filePath === "ROADMAP.md"
    || filePath === "ROADMAP-ARCHIVE.md"
    || isDocumentationPath(filePath);
}

/** @param {unknown} filePath */
function normalizePath(filePath) {
  return String(filePath || "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

/** @param {string} kind @param {string[]} errors @param {string[]} paths */
function result(kind, errors, paths) {
  return Object.freeze({
    ceremonyPaths: Object.freeze(paths.filter(isCeremonyPath)),
    errors: Object.freeze(errors),
    kind,
    paths: Object.freeze(paths),
  });
}

/** @param {readonly string[]} args @param {string} [cwd] */
function runGit(args, cwd = process.cwd()) {
  const completed = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (completed.status !== 0) throw new Error(String(completed.stderr || completed.stdout).trim());
  return String(completed.stdout || "");
}

/**
 * @param {{
 *   args?: string[],
 *   cwd?: string,
 *   environment?: Record<string, string | undefined>,
 *   head?: string,
 *   runGitCommand?: (args: string[], cwd?: string) => string,
 * }} options
 */
function resolveCheckpointBaseSha({
  args = [],
  cwd = process.cwd(),
  environment = process.env,
  head = "HEAD",
  runGitCommand = runGit,
} = {}) {
  const normalizedArgs = args.map((argument) => String(argument || "").trim());
  if (normalizedArgs.length === 0) {
    const baseSha = String(environment.LTF_CHECKPOINT_BASE_SHA || "").trim();
    if (!FULL_SHA_PATTERN.test(baseSha)) {
      throw new Error("LTF_CHECKPOINT_BASE_SHA must be a full 40-character commit SHA.");
    }
    return baseSha;
  }
  if (normalizedArgs.length === 2 && normalizedArgs[0] === "--base-ref" && normalizedArgs[1] && !normalizedArgs[1].startsWith("-")) {
    const baseSha = runGitCommand(["merge-base", normalizedArgs[1], head], cwd).trim();
    if (!FULL_SHA_PATTERN.test(baseSha)) {
      throw new Error(`git merge-base ${normalizedArgs[1]} ${head} did not return a full 40-character commit SHA.`);
    }
    return baseSha;
  }
  throw new Error(CHECKPOINT_USAGE);
}

/**
 * @param {{ baseSha?: string, cwd?: string, head?: string, roadmapArchiveSource?: string, roadmapSource?: string }} [options]
 * @returns {readonly CheckpointRangeEntry[]}
 */
function inspectCheckpointRange({ baseSha, cwd = process.cwd(), head = "HEAD", roadmapArchiveSource, roadmapSource } = {}) {
  if (!FULL_SHA_PATTERN.test(String(baseSha || ""))) {
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
      packageAfterSource: paths.includes("package.json") ? runGit(["show", `${sha}:package.json`], cwd) : "",
      packageBeforeSource: paths.includes("package.json") && parents[0] ? runGit(["show", `${parents[0]}:package.json`], cwd) : "",
      parentCount: parents.length,
      paths,
      roadmapArchiveSource: roadmapArchive,
      roadmapSource: roadmap,
    }) });
  }));
}

/** @param {readonly CheckpointRangeEntry[]} results */
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
  const baseSha = resolveCheckpointBaseSha({ args: process.argv.slice(2) });
  const results = inspectCheckpointRange({ baseSha });
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
  isGeneratedDocumentationPath,
  parseCheckpointTrailers,
  resolveCheckpointBaseSha,
  validateCheckpointCommit,
};
