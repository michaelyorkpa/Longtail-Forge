import { escapeRegExp } from "../test-support/source-scan.mjs";
import { spawnSync } from "node:child_process";
import { requireLockEntry, requireLockPackages, requirePackageLock, requirePackageManifest } from "../test-support/package-manifest-assertions.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECKPOINT_SERIES = "0.33.33";
const CLOSEOUT_CHECKPOINT = `${CHECKPOINT_SERIES}.48`;
// The release-preparation addendum declared after the branch closeout. It may change what the
// application depends on, never what the application is: see RELEASE_PREPARATION_PATHS.
const RELEASE_PREPARATION_CHECKPOINT = `${CHECKPOINT_SERIES}.49`;
// The post-release patch declared after the release was published. It gives the application its own
// new release identity and changes nothing else the packages declare: see POST_RELEASE_PATCH_PATHS.
const POST_RELEASE_PATCH_CHECKPOINT = `${CHECKPOINT_SERIES}.50`;
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
// The deferred release paths the release-preparation addendum may change, alongside owning
// documentation. Its package changes are further limited to dependency declarations (or scripts)
// with the application version fixed in both package files; `DECISIONS.md` stays reserved.
const RELEASE_PREPARATION_PATHS = new Set([
  "CHANGELOG.md",
  "package-lock.json",
  "package.json",
]);
// The deferred release paths the post-release patch may change, alongside owning documentation. Its
// package changes move only the application version, in both files, to exactly its own identity;
// dependency declarations, the resolved graph, and `DECISIONS.md` stay fixed.
const POST_RELEASE_PATCH_PATHS = new Set([
  "CHANGELOG.md",
  "package-lock.json",
  "package.json",
]);
// The dependency security updates the post-release patch may also take, each pinned to one reviewed
// lock entry: its exact version, registry tarball, and integrity, with no install script. compression
// 1.8.2 fixes GHSA-vc2v-76pw-4v95 and adds destroy 1.2.0; proxy-addr 2.0.8 fixes GHSA-jqcg-44mw-7w3h;
// the development-only source-map-js 1.2.2 fixes GHSA-68fv-2mgg-jv7q. Every other lock entry, and
// every package.json field, stays as it was.
const POST_RELEASE_PATCH_DEPENDENCY_UPDATES = Object.freeze({
  "node_modules/compression": Object.freeze({
    from: "1.8.1",
    to: "1.8.2",
    integrity: "sha512-o8vI5RE5A6EVVOd9o41jKp41aJom+QTEO/Bx8MYNjexMo/Bv2WOjUfZr+aL0WnYSgymUy6zeguqLTsIhV0gMvQ==",
  }),
  "node_modules/destroy": Object.freeze({
    from: null,
    to: "1.2.0",
    integrity: "sha512-2sJGJTaXIIaR1w4iJSNoN0hnMY7Gpc/n8D4qSCJw8QqFWXf7cuAgnEHxBpweaVcPevC2l3KpjYCx3NypQQgaJg==",
  }),
  "node_modules/proxy-addr": Object.freeze({
    from: "2.0.7",
    to: "2.0.8",
    integrity: "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
  }),
  "node_modules/source-map-js": Object.freeze({
    from: "1.2.1",
    to: "1.2.2",
    integrity: "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
  }),
});

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
 *   lockAfterSource?: string,
 *   lockBeforeSource?: string,
 *   message?: string,
 *   packageAfterSource?: string,
 *   packageBeforeSource?: string,
 *   parentCount?: number,
 *   paths?: string[],
 *   postReleasePatchCheckpoint?: string,
 *   releasePreparationCheckpoint?: string,
 *   roadmapArchiveSource?: string,
 *   roadmapSource?: string,
 *   series?: string,
 *   closeoutCheckpoint?: string,
 * }} options
 */
function validateCheckpointCommit({
  lockAfterSource = "",
  lockBeforeSource = "",
  message,
  packageAfterSource = "",
  packageBeforeSource = "",
  parentCount = 1,
  paths = [],
  postReleasePatchCheckpoint = POST_RELEASE_PATCH_CHECKPOINT,
  releasePreparationCheckpoint = RELEASE_PREPARATION_CHECKPOINT,
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
  const isReleasePreparation = checkpoint === releasePreparationCheckpoint;
  const isPostReleasePatch = checkpoint === postReleasePatchCheckpoint;
  if (!isCloseout && ceremonyPaths.length > 2) {
    errors.push(`internal checkpoint ${checkpoint} changes ${ceremonyPaths.length} ceremony files; maximum is 2 (${ceremonyPaths.join(", ")})`);
  }
  if (!isCloseout) {
    for (const filePath of normalizedPaths) {
      if (filePath === "package.json" && isScriptOnlyPackageChange(packageBeforeSource, packageAfterSource)) {
        continue;
      }
      if (isReleasePreparation && RELEASE_PREPARATION_PATHS.has(filePath)) {
        continue;
      }
      if (isPostReleasePatch && POST_RELEASE_PATCH_PATHS.has(filePath)) {
        continue;
      }
      if (DEFERRED_RELEASE_PATHS.has(filePath)) {
        errors.push(`${filePath} is reserved for ${closeoutCheckpoint} branch closeout`);
      }
      if (checkpoint !== `${series}.1` && !isReleasePreparation && !isPostReleasePatch && isDocumentationPath(filePath) && !isGeneratedDocumentationPath(filePath)) {
        errors.push(`${filePath} durable documentation is reserved for ${closeoutCheckpoint} branch closeout`);
      }
    }
  }
  if (!isCloseout && isReleasePreparation) {
    validateReleasePreparationPackages({
      lockAfterSource,
      lockBeforeSource,
      packageAfterSource,
      packageBeforeSource,
      paths: normalizedPaths,
      releasePreparationCheckpoint,
    }, errors);
  }
  if (!isCloseout && isPostReleasePatch) {
    validatePostReleasePatchPackages({
      lockAfterSource,
      lockBeforeSource,
      packageAfterSource,
      packageBeforeSource,
      paths: normalizedPaths,
      postReleasePatchCheckpoint,
    }, errors);
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

/**
 * The release-preparation addendum may change what the application depends on, never what it is.
 * Its `package.json` change must be dependency-only (or script-only, like any checkpoint's), and
 * its lockfile must keep both application version fields.
 * @param {{
 *   lockAfterSource: string,
 *   lockBeforeSource: string,
 *   packageAfterSource: string,
 *   packageBeforeSource: string,
 *   paths: readonly string[],
 *   releasePreparationCheckpoint: string,
 * }} change
 * @param {string[]} errors
 */
function validateReleasePreparationPackages({
  lockAfterSource,
  lockBeforeSource,
  packageAfterSource,
  packageBeforeSource,
  paths,
  releasePreparationCheckpoint,
}, errors) {
  if (
    paths.includes("package.json")
    && !isScriptOnlyPackageChange(packageBeforeSource, packageAfterSource)
    && !isDependencyOnlyPackageChange(packageBeforeSource, packageAfterSource)
  ) {
    errors.push(`package.json under ${releasePreparationCheckpoint} may change only dependency declarations or scripts; the application version and every other field stay fixed`);
  }
  if (paths.includes("package-lock.json") && !preservesLockApplicationVersion(lockBeforeSource, lockAfterSource)) {
    errors.push(`package-lock.json under ${releasePreparationCheckpoint} must keep its application version fields unchanged`);
  }
}

/**
 * The post-release patch gives the published release's repair its own identity and nothing else. Its
 * `package.json` change must move only the application version to exactly the patch identity (or be
 * script-only, like any checkpoint's), and its lockfile must move only its two application version
 * fields to that identity, so no dependency or resolved package changes under it.
 * @param {{
 *   lockAfterSource: string,
 *   lockBeforeSource: string,
 *   packageAfterSource: string,
 *   packageBeforeSource: string,
 *   paths: readonly string[],
 *   postReleasePatchCheckpoint: string,
 * }} change
 * @param {string[]} errors
 */
function validatePostReleasePatchPackages({
  lockAfterSource,
  lockBeforeSource,
  packageAfterSource,
  packageBeforeSource,
  paths,
  postReleasePatchCheckpoint,
}, errors) {
  if (
    paths.includes("package.json")
    && !isScriptOnlyPackageChange(packageBeforeSource, packageAfterSource)
    && !isVersionOnlyPackageChange(packageBeforeSource, packageAfterSource, postReleasePatchCheckpoint)
  ) {
    errors.push(`package.json under ${postReleasePatchCheckpoint} may change only the application version, to exactly ${postReleasePatchCheckpoint}, or scripts`);
  }
  if (
    paths.includes("package-lock.json")
    && !isVersionOnlyLockChange(lockBeforeSource, lockAfterSource, postReleasePatchCheckpoint)
    && !isReviewedDependencyUpdateLockChange(lockBeforeSource, lockAfterSource)
  ) {
    errors.push(`package-lock.json under ${postReleasePatchCheckpoint} may change only its application version fields, to exactly ${postReleasePatchCheckpoint}, or take its reviewed dependency security updates`);
  }
}

/**
 * Whether a lockfile change takes only the post-release patch's reviewed dependency security
 * updates. Each changed entry must be a listed one, moving from its reviewed version (or from
 * absent) to exactly its reviewed version, registry tarball, and integrity, with no install script.
 * Every other entry and every top-level field must be unchanged.
 * @param {string} beforeSource
 * @param {string} afterSource
 * @returns {boolean}
 */
function isReviewedDependencyUpdateLockChange(beforeSource, afterSource) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforeLock = requirePackageLock(JSON.parse(beforeSource), "the previous package-lock.json");
    const afterLock = requirePackageLock(JSON.parse(afterSource), "package-lock.json in the working tree");
    const beforePackages = requireLockPackages(beforeLock, "the previous package-lock.json");
    const afterPackages = requireLockPackages(afterLock, "package-lock.json in the working tree");
    let updated = 0;
    for (const [packagePath, update] of Object.entries(POST_RELEASE_PATCH_DEPENDENCY_UPDATES)) {
      const before = beforePackages[packagePath];
      const after = afterPackages[packagePath];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const name = packagePath.slice("node_modules/".length);
      if (
        (update.from === null ? before !== undefined : before?.version !== update.from)
        || after?.version !== update.to
        || after.resolved !== `https://registry.npmjs.org/${name}/-/${name}-${update.to}.tgz`
        || after.integrity !== update.integrity
        || after.hasInstallScript
      ) {
        return false;
      }
      updated += 1;
    }
    /** @param {import("../test-support/package-manifest-assertions.mjs").PackageLockManifest} lock @param {Record<string, import("../test-support/package-manifest-assertions.mjs").PackageLockEntry>} packages */
    const unlisted = (lock, packages) => JSON.stringify({
      ...lock,
      packages: Object.fromEntries(Object.entries(packages).filter(([packagePath]) => !Object.hasOwn(POST_RELEASE_PATCH_DEPENDENCY_UPDATES, packagePath))),
    });
    return updated > 0 && unlisted(beforeLock, beforePackages) === unlisted(afterLock, afterPackages);
  } catch {
    return false;
  }
}

/** @param {string} beforeSource @param {string} afterSource @param {string} version */
function isVersionOnlyPackageChange(beforeSource, afterSource, version) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforePackage = requirePackageManifest(JSON.parse(beforeSource), "the previous package.json");
    const afterPackage = requirePackageManifest(JSON.parse(afterSource), "package.json in the working tree");
    if (afterPackage.version !== version || beforePackage.version === version) return false;
    delete beforePackage.version;
    delete afterPackage.version;
    return JSON.stringify(beforePackage) === JSON.stringify(afterPackage);
  } catch {
    return false;
  }
}

/** @param {string} beforeSource @param {string} afterSource @param {string} version */
function isVersionOnlyLockChange(beforeSource, afterSource, version) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforeLock = requirePackageLock(JSON.parse(beforeSource), "the previous package-lock.json");
    const afterLock = requirePackageLock(JSON.parse(afterSource), "package-lock.json in the working tree");
    const beforeRoot = requireLockEntry(beforeLock, "", "the previous package-lock.json");
    const afterRoot = requireLockEntry(afterLock, "", "package-lock.json in the working tree");
    if (afterLock.version !== version || afterRoot.version !== version) return false;
    afterLock.version = beforeLock.version;
    afterRoot.version = beforeRoot.version;
    return JSON.stringify(beforeLock) === JSON.stringify(afterLock);
  } catch {
    return false;
  }
}

/** @param {string} beforeSource @param {string} afterSource */
function isDependencyOnlyPackageChange(beforeSource, afterSource) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforePackage = requirePackageManifest(JSON.parse(beforeSource), "the previous package.json");
    const afterPackage = requirePackageManifest(JSON.parse(afterSource), "package.json in the working tree");
    if (typeof beforePackage.version !== "string" || beforePackage.version !== afterPackage.version) return false;
    const beforeDeclarations = JSON.stringify([beforePackage.dependencies, beforePackage.devDependencies]);
    const afterDeclarations = JSON.stringify([afterPackage.dependencies, afterPackage.devDependencies]);
    delete beforePackage.dependencies;
    delete beforePackage.devDependencies;
    delete afterPackage.dependencies;
    delete afterPackage.devDependencies;
    return JSON.stringify(beforePackage) === JSON.stringify(afterPackage) && beforeDeclarations !== afterDeclarations;
  } catch {
    return false;
  }
}

/** @param {string} beforeSource @param {string} afterSource */
function preservesLockApplicationVersion(beforeSource, afterSource) {
  if (!beforeSource || !afterSource) return false;
  try {
    const beforeLock = requirePackageLock(JSON.parse(beforeSource), "the previous package-lock.json");
    const afterLock = requirePackageLock(JSON.parse(afterSource), "package-lock.json in the working tree");
    const beforeRoot = requireLockEntry(beforeLock, "", "the previous package-lock.json");
    const afterRoot = requireLockEntry(afterLock, "", "package-lock.json in the working tree");
    return typeof beforeLock.version === "string"
      && beforeLock.version === afterLock.version
      && typeof beforeRoot.version === "string"
      && beforeRoot.version === afterRoot.version;
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
      lockAfterSource: paths.includes("package-lock.json") ? runGit(["show", `${sha}:package-lock.json`], cwd) : "",
      lockBeforeSource: paths.includes("package-lock.json") && parents[0] ? runGit(["show", `${parents[0]}:package-lock.json`], cwd) : "",
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
  POST_RELEASE_PATCH_CHECKPOINT,
  POST_RELEASE_PATCH_DEPENDENCY_UPDATES,
  RELEASE_PREPARATION_CHECKPOINT,
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
