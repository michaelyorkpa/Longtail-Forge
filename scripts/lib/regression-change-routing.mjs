import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

/** @typedef {{ areas: readonly string[], fullCheck: boolean, patterns: readonly RegExp[], reason: string }} RouteRule */
/** @typedef {{ areas: readonly string[], fullCheck: boolean, path: string, reason: string }} RoutingMatch */
/** @typedef {{ paths: readonly string[], status: string }} ChangedPathEntry */
/** @typedef {{ regressions?: readonly { area: string, path: string }[] }} RegisteredRegressionManifest */

/** @type {Readonly<Record<string, string>>} */
const AREA_COMMANDS = Object.freeze({
  framework: "npm run test:regressions:framework",
  views: "npm run test:regressions:views",
  dashboard: "npm run test:regressions:dashboard",
  workbench: "npm run test:regressions:workbench",
  tasks: "npm run test:regressions:tasks",
  notes: "npm run test:regressions:notes",
  lists: "npm run test:regressions:lists",
  files: "npm run test:regressions:files",
  search: "npm run test:regressions:search",
  notifications: "npm run test:regressions:notifications",
  tags: "npm run test:regressions:tags",
  "time-tracking": "npm run test:regressions:time-tracking",
  database: "npm run test:regressions:database",
  permissions: "npm run test:regressions:permissions",
  jobs: "npm run test:regressions:jobs",
  "public-api": "npm run test:regressions:public-api",
  release: "npm run test:regressions:release",
  docs: "npm run test:regressions:docs",
  licensing: "npm run test:regressions:licensing",
});

const FULL_CHECK_ESCALATION_AREAS = Object.freeze([
  "database",
  "files",
  "framework",
  "permissions",
  "release",
  "views",
]);

const DIFF_STATUS_PATTERN = /^[ACDMRTUXB][0-9]*$/;
const REGISTERED_REGRESSION_AREAS = loadRegisteredRegressionAreas();

const ROUTE_RULES = Object.freeze([
  route([/^public\/css\/tasks-dashboard\.css$/], ["tasks"], "Tasks-owned CSS path"),
  route([/^public\/css\/dashboard\.css$/], ["dashboard"], "Dashboard-owned CSS path"),
  route([/^public\/css\/time-tracking-dashboard\.css$/], ["time-tracking"], "Time Tracking-owned CSS path"),
  route([/^src\/modules\/tasks\//, /^public\/js\/tasks(?:[./-]|$)/, /^docs\/tasks(?:[./-]|$)/], ["tasks"], "Tasks-owned path"),
  route([/^src\/modules\/time-tracking\//, /^public\/js\/(?:time-tracking|time-entries|timer)(?:[./-]|$)/, /^docs\/time-tracking(?:[./-]|$)/], ["time-tracking"], "Time Tracking-owned path"),
  route([/^src\/modules\/lists\//, /^public\/js\/lists(?:[./-]|$)/, /^docs\/lists(?:[./-]|$)/], ["lists"], "Lists-owned path"),
  route([
    /^src\/modules\/files\//,
    /^public\/js\/(?:shared\/)?files?(?:[./-]|$)/,
    /^docs\/files(?:[./-]|$)/,
  ], ["files"], "Files-owned path", { fullCheck: true }),
  route([
    /^src\/core\/search\//,
    /^src\/(?:routes|services)\/search(?:-index|-index-sync|-index-rebuild|-index-jobs)?(?:[./-]|$)/,
    /^src\/modules\/[^/]+\/search-indexers\.js$/,
    /^public\/js\/search(?:[./-]|$)/,
    /^scripts\/search-index-rebuild\.mjs$/,
    /^docs\/search(?:[./-]|$)/,
  ], ["search"], "Search-owned path"),
  route([
    /^src\/(?:routes|services)\/notifications?(?:[./-]|$)/,
    /^src\/repositories\/notifications?\.repo\.js$/,
    /^public\/js\/notifications?(?:[./-]|$)/,
    /^docs\/notifications?(?:[./-]|$)/,
  ], ["notifications"], "Notifications-owned path"),
  route([
    /^src\/modules\/tags\//,
    /^src\/(?:routes|services)\/tags?(?:[./-]|$)/,
    /^src\/repositories\/tags?\.repo\.js$/,
    /^public\/js\/(?:shared\/)?tags?(?:[./-]|$)/,
    /^docs\/tags?(?:[./-]|$)/,
  ], ["tags"], "Tags-owned path"),
  route([
    /^src\/core\/jobs\//,
    /^src\/(?:routes|services)\/jobs?(?:[./-]|$)/,
    /^(?:worker\.js|src\/worker\.js)$/,
    /^docs\/jobs?(?:[./-]|$)/,
  ], ["framework", "jobs"], "shared jobs and worker path"),
  route([
    /^src\/(?:routes|services)\/(?:public-api|api-keys?)(?:[./-]|$)/,
    /^src\/repositories\/api-keys?\.repo\.js$/,
    /^src\/core\/api-key-auth\.js$/,
    /^src\/modules\/[^/]+\/public-api\.(?:routes|service)\.js$/,
    /^public\/js\/api-keys?(?:[./-]|$)/,
  ], ["permissions", "public-api"], "public API or API-key authority path", { fullCheck: true }),
  route([/^docs\/public-api\.md$/], ["docs", "public-api"], "public API documentation path", { fullCheck: false }),
  route([
    /^public\/js\/workbench\.js$/,
    /^src\/(?:routes|services)\/workbench(?:[./-]|$)/,
    /^docs\/workbench(?:[./-]|$)/,
  ], ["workbench"], "Workbench-owned path"),
  route([
    /^public\/js\/shared\/view-(?:builder|renderer|index|descriptor)(?:[./-]|$)/,
    /^src\/(?:core|views?)\/.*view(?:[./-]|$)/,
    /^docs\/.*view-(?:builder|renderer)/,
  ], ["framework", "views"], "shared view/framework path"),
  route([
    /^src\/db\//,
    /^src\/repositories\//,
    /(?:^|\/)migrations?(?:\/|\.|-)/,
  ], ["database"], "database, repository, or migration path"),
  route([
    /^docs\/backup-restore\.md$/,
    /^scripts\/(?:backup|backup-restore-drill)\.mjs$/,
    /^scripts\/lib\/backup-archive\.mjs$/,
    /^scripts\/regressions\/database\/backup-restore-foundation\.regression\.mjs$/,
  ], ["database", "release"], "whole-instance backup and release-recovery path"),
  route([
    /^docs\/workspace-backup\.md$/,
    /^scripts\/workspace-backup(?:-drill)?\.mjs$/,
    /^src\/services\/workspace-backup(?:s|-package)?(?:[./-]|$)/,
    /^scripts\/regressions\/database\/workspace-backup-package\.regression\.mjs$/,
  ], ["database", "release"], "workspace backup and release-recovery path"),
  route([
    /^src\/core\/permissions(?:\.js|\/)/,
    /^src\/security\/sessions\.js$/,
    /^src\/(?:routes|services)\/(?:permissions|sessions)(?:[./-]|$)/,
    /^src\/repositories\/(?:permissions|sessions|user-workspaces|workspaces)\.repo\.js$/,
    /^src\/utils\/workspaces\.js$/,
    /^src\/modules\/[^/]+\/module\.permissions\.js$/,
    /^src\/(?:services|repositories)\/workspace-(?:backup|backups|deletion|purge)(?:[./-]|$)/,
    /^public\/js\/workspace-settings\.js$/,
    /^scripts\/(?:permission-regression|sanitized-demo-role-journey|workspace-(?:backup|backup-drill|purge))\.mjs$/,
    /^docs\/(?:longtail_forge_permissions_matrix|workspace-backup|workspace-deletion)\.md$/,
  ], ["permissions"], "permission, session, or workspace authority path", { fullCheck: true }),
  route([/^(?:CHANGELOG|ROADMAP|ROADMAP-ARCHIVE)\.md$/], ["release"], "release bookkeeping path", { fullCheck: false }),
  route([
    /^\.github\//,
    /^package(?:-lock)?\.json$/,
    /^(?:\.dockerignore|Dockerfile|compose\.yaml)$/,
    /^src\/core\/version\.js$/,
    /^src\/routes\/app-info\.routes\.js$/,
    /^docs\/versioning\.md$/,
    /^docs\/runtime-artifact\.md$/,
    /^docs\/(?:compose\.env\.example|preview-deployment\.md)$/,
    /^docs\/.*release(?:[./-]|$)/,
    /^docs\/(?:backup-and-restore|self-hosting|upgrading)\.md$/,
    /^docs\/development\/github-workflow\.md$/,
    /^scripts\/release\//,
    /^scripts\/(?:agent-brief|build-container-image|build-runtime-artifact|bump-version|classify-github-changes|container-deployment-smoke|generate-regression-manifest|run-changed-regressions|run-closeout|run-regressions|run-slice-verification|runtime-artifact-smoke|suggest-regressions-for-changes|version-literal-guardrail-regression)\.mjs$/,
    /^scripts\/(?:regression-(?:baseline-bypass-audit|coverage-exceptions|coverage-manifest|files-isolation-audit|legacy-snapshot|static-isolation-audit)\.json)$/,
    /^scripts\/lib\/(?:changed-regression-runner|closeout-gates|github-change-classification|package-script-runner|regression-change-routing|regression-discovery|regression-metadata|slice-verification-plan)\.mjs$/,
    /^scripts\/regressions\/release\//,
    /^docs\/docs-ownership\.json$/,
    /^src\/core\/modules\/bundled-module-catalog\.generated\.js$/,
  ], ["release"], "release, version, or regression-infrastructure path"),
  route([/^src\/modules\/dashboard\//, /^public\/js\/dashboard(?:[./-]|$)/], ["dashboard"], "Dashboard-owned path"),
  route([/^src\/modules\/notes\//, /^public\/js\/notes(?:[./-]|$)/], ["notes"], "Notes-owned path"),
  route([
    /^public\/js\/shared\//,
    /^src\/core\/(?!search(?:\/|$)|jobs(?:\/|$))/,
    /^src\/(?:routes|services)\/[^/]*shared/,
  ], ["framework"], "shared framework path"),
  route([
    /^docs\/licensing(?:\.md|\/)/,
    /^(?:LICENSE|THIRD_PARTY_NOTICES\.md)$/,
  ], ["docs", "licensing"], "licensing documentation path", { fullCheck: false }),
  route([
    /^scripts\/(?:check-licensing-gates|check-third-party-notices)\.mjs$/,
    /^scripts\/lib\/licensing-gates\.mjs$/,
  ], ["licensing", "release"], "executable licensing gate path", { fullCheck: true }),
  route([
    /^docs\//,
    /^(?!(?:CHANGELOG|ROADMAP|ROADMAP-ARCHIVE)\.md$)[^/]+\.md$/,
    /^LICENSE$/,
  ], ["docs"], "documentation-owned path", { fullCheck: false }),
]);

/**
 * @param {readonly RegExp[]} patterns
 * @param {readonly string[]} areas
 * @param {string} reason
 * @param {{ fullCheck?: boolean }} [options]
 * @returns {Readonly<RouteRule>}
 */
function route(patterns, areas, reason, { fullCheck } = {}) {
  return Object.freeze({
    areas: Object.freeze(areas),
    fullCheck: fullCheck ?? areas.some((area) => FULL_CHECK_ESCALATION_AREAS.includes(area)),
    patterns: Object.freeze(patterns),
    reason,
  });
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function normalizeChangedPath(filePath) {
  return String(filePath || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

/**
 * @param {{ cwd?: string }} [options]
 * @returns {readonly string[]}
 */
function collectChangedPaths({ cwd = process.cwd() } = {}) {
  return collectChangedChangeSet({ cwd }).paths;
}

/**
 * @param {{ cwd?: string }} [options]
 */
function collectChangedChangeSet({ cwd = process.cwd() } = {}) {
  const baseSha = String(process.env.LTF_REGRESSION_BASE_SHA || "").trim();
  if (baseSha && !/^[a-f0-9]{40}$/i.test(baseSha)) {
    throw new Error("LTF_REGRESSION_BASE_SHA must be a full 40-character commit SHA.");
  }
  const trackedEntries = parseNameStatusDiff(baseSha
    ? runGitText(["diff", "--name-status", "-z", "--find-renames", "--diff-filter=ACMRD", `${baseSha}...HEAD`, "--"], cwd)
    : runGitText(["diff", "--name-status", "-z", "--find-renames", "--diff-filter=ACMRD", "HEAD", "--"], cwd));
  const tracked = trackedEntries.flatMap(({ paths }) => paths);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], cwd);
  const paths = Object.freeze([...new Set([...tracked, ...untracked].map(normalizeChangedPath).filter(Boolean))].sort());
  const versionBookkeepingPaths = inspectVersionBookkeepingPaths({ baseSha, cwd, paths, untracked });
  return Object.freeze({ entries: trackedEntries, paths, versionBookkeepingPaths });
}

/**
 * @returns {Map<string, string>}
 */
function loadRegisteredRegressionAreas() {
  const manifest = /** @type {RegisteredRegressionManifest} */ (JSON.parse(readFileSync(new URL("../regression-coverage-manifest.json", import.meta.url), "utf8")));
  return new Map((manifest.regressions || []).map(({ area, path }) => [normalizeChangedPath(path), area]));
}

/**
 * @param {string} [output]
 * @returns {readonly Readonly<ChangedPathEntry>[]}
 */
function parseNameStatusDiff(output = "") {
  const tokens = String(output).split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  /** @type {Readonly<ChangedPathEntry>[]} */
  const entries = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!DIFF_STATUS_PATTERN.test(status)) {
      throw new Error(`Unexpected git diff status: ${status || "<empty>"}`);
    }
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = tokens.slice(index, index + pathCount).map(normalizeChangedPath);
    if (paths.length !== pathCount || paths.some((filePath) => !filePath)) {
      throw new Error(`Incomplete git diff entry for status ${status}.`);
    }
    index += pathCount;
    entries.push(Object.freeze({ paths: Object.freeze(paths), status }));
  }

  return Object.freeze(entries);
}

/**
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {string[]}
 */
function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect changed files: ${String(result.stderr || result.stdout).trim()}`);
  }
  return String(result.stdout || "").split(/\r?\n/).filter(Boolean);
}

/**
 * @param {readonly unknown[]} [filePaths]
 * @param {{ versionBookkeepingPaths?: readonly string[] }} [options]
 */
function suggestRegressionsForPaths(filePaths = [], { versionBookkeepingPaths = [] } = {}) {
  const paths = [...new Set(filePaths.map(normalizeChangedPath).filter(Boolean))].sort();
  const versionBookkeeping = new Set(versionBookkeepingPaths.map(normalizeChangedPath));
  /** @type {Set<string>} */
  const areas = new Set();
  /** @type {Readonly<RoutingMatch>[]} */
  const matches = [];

  for (const filePath of paths) {
    const registeredArea = REGISTERED_REGRESSION_AREAS.get(filePath);
    if (registeredArea && AREA_COMMANDS[registeredArea]) {
      areas.add(registeredArea);
      matches.push(Object.freeze({
        areas: Object.freeze([registeredArea]),
        fullCheck: FULL_CHECK_ESCALATION_AREAS.includes(registeredArea),
        path: filePath,
        reason: "registered regression owner",
      }));
    }
    const conventionMatch = filePath.match(/^scripts\/regressions\/([^/]+)\//);
    if (!registeredArea && conventionMatch && AREA_COMMANDS[conventionMatch[1]]) {
      areas.add(conventionMatch[1]);
      matches.push(Object.freeze({
        areas: Object.freeze([conventionMatch[1]]),
        fullCheck: FULL_CHECK_ESCALATION_AREAS.includes(conventionMatch[1]),
        path: filePath,
        reason: "convention-path regression owner",
      }));
    }
    for (const rule of ROUTE_RULES) {
      if (versionBookkeeping.has(filePath) && /^package(?:-lock)?\.json$/.test(filePath) && rule.reason === "release, version, or regression-infrastructure path") {
        continue;
      }
      if (rule.patterns.some((pattern) => pattern.test(filePath))) {
        rule.areas.forEach((area) => areas.add(area));
        matches.push(Object.freeze({
          areas: rule.areas,
          path: filePath,
          reason: rule.reason,
          fullCheck: rule.fullCheck,
        }));
      }
    }
    if (versionBookkeeping.has(filePath)) {
      areas.add("release");
      matches.push(Object.freeze({
        areas: Object.freeze(["release"]),
        fullCheck: false,
        path: filePath,
        reason: "application-version bookkeeping only",
      }));
    }
  }

  const selectedAreas = [...areas].sort();
  const commands = Object.keys(AREA_COMMANDS)
    .filter((area) => areas.has(area))
    .map((area) => AREA_COMMANDS[area]);
  const fallback = paths.length > 0 && commands.length === 0;
  const fullCheckRecommended = fallback || matches.some((match) => match.fullCheck);

  return Object.freeze({
    areas: Object.freeze(selectedAreas),
    commands: Object.freeze(fallback ? ["npm run test:regressions"] : commands),
    fallback,
    fullCheckRecommended,
    matches: Object.freeze(matches),
    paths: Object.freeze(paths),
    releaseGate: "npm run check",
  });
}

/**
 * @param {{ baseSha: string, cwd: string, paths: readonly string[], untracked: readonly string[] }} options
 * @returns {readonly string[]}
 */
function inspectVersionBookkeepingPaths({ baseSha, cwd, paths, untracked }) {
  const packagePaths = ["package.json", "package-lock.json"];
  if (!packagePaths.every((filePath) => paths.includes(filePath)) || packagePaths.some((filePath) => untracked.includes(filePath))) {
    return Object.freeze([]);
  }
  const reference = baseSha || "HEAD";
  try {
    const comparisons = packagePaths.map((filePath) => {
      const before = JSON.parse(runGitText(["show", `${reference}:${filePath}`], cwd));
      const after = JSON.parse(readFileSync(`${cwd}/${filePath}`, "utf8"));
      return isApplicationVersionOnlyChange(before, after, filePath);
    });
    return Object.freeze(comparisons.every(Boolean) ? packagePaths : []);
  } catch {
    return Object.freeze([]);
  }
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {string} filePath
 * @returns {boolean}
 */
function isApplicationVersionOnlyChange(before, after, filePath) {
  const normalizedBefore = JSON.parse(JSON.stringify(before));
  const normalizedAfter = JSON.parse(JSON.stringify(after));
  const beforeVersion = normalizedBefore.version;
  const afterVersion = normalizedAfter.version;
  if (!beforeVersion || !afterVersion || beforeVersion === afterVersion) return false;
  normalizedBefore.version = "<application-version>";
  normalizedAfter.version = "<application-version>";
  if (filePath === "package-lock.json") {
    if (!normalizedBefore.packages?.[""] || !normalizedAfter.packages?.[""]) return false;
    if (normalizedBefore.packages[""].version !== beforeVersion || normalizedAfter.packages[""].version !== afterVersion) return false;
    normalizedBefore.packages[""].version = "<application-version>";
    normalizedAfter.packages[""].version = "<application-version>";
  }
  return isDeepStrictEqual(normalizedBefore, normalizedAfter);
}

/**
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function runGitText(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout).trim());
  return String(result.stdout || "");
}

export {
  AREA_COMMANDS,
  FULL_CHECK_ESCALATION_AREAS,
  ROUTE_RULES,
  collectChangedChangeSet,
  collectChangedPaths,
  isApplicationVersionOnlyChange,
  normalizeChangedPath,
  parseNameStatusDiff,
  suggestRegressionsForPaths,
};
