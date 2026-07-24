import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const AREA_COMMANDS = Object.freeze({
  framework: "npm run test:regressions:framework",
  views: "npm run test:regressions:views",
  dashboard: "npm run test:regressions:dashboard",
  workbench: "npm run test:regressions:workbench",
  tasks: "npm run test:regressions:tasks",
  notes: "npm run test:regressions:notes",
  files: "npm run test:regressions:files",
  database: "npm run test:regressions:database",
  permissions: "npm run test:regressions:permissions",
  release: "npm run test:regressions:release",
  docs: "npm run test:regressions:docs",
});

const FULL_CHECK_ESCALATION_AREAS = Object.freeze([
  "database",
  "framework",
  "release",
  "views",
]);

const ROUTE_RULES = Object.freeze([
  route([/^public\/css\/tasks-dashboard\.css$/], ["tasks"], "Tasks-owned CSS path"),
  route([/^public\/css\/dashboard\.css$/], ["dashboard"], "Dashboard-owned CSS path"),
  route([/^public\/css\/time-tracking-dashboard\.css$/], ["time-tracking"], "Time Tracking-owned CSS path"),
  route([/^src\/modules\/tasks\//, /^public\/js\/tasks(?:[./-]|$)/, /^docs\/tasks(?:[./-]|$)/], ["tasks"], "Tasks-owned path"),
  route([
    /^src\/modules\/files\//,
    /^public\/js\/(?:shared\/)?files?(?:[./-]|$)/,
    /^docs\/files(?:[./-]|$)/,
  ], ["files"], "Files-owned path", { fullCheck: true }),
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
    /(?:^|[./_-])permissions?(?:[./_-]|$)/,
    /(?:^|[./_-])sessions?(?:[./_-]|$)/,
    /(?:^|[./_-])workspaces?(?:[./_-]|$)/,
    /(?:^|[./_-])memberships?(?:[./_-]|$)/,
  ], ["permissions"], "permission, session, workspace, or membership path", { fullCheck: true }),
  route([/^(?:CHANGELOG|ROADMAP|ROADMAP-ARCHIVE)\.md$/], ["release"], "release bookkeeping path", { fullCheck: false }),
  route([
    /^\.github\//,
    /^package(?:-lock)?\.json$/,
    /^(?:\.dockerignore|Dockerfile|compose\.yaml)$/,
    /^src\/core\/version\.js$/,
    /^src\/routes\/app-info\.routes\.js$/,
    /^docs\/versioning\.md$/,
    /^docs\/runtime-artifact\.md$/,
    /^docs\/(?:compose\.env\.example|longtail-forge\.service\.example|preview-deployment\.md)$/,
    /^docs\/.*release(?:[./-]|$)/,
    /^docs\/(?:backup-and-restore|self-hosting|upgrading)\.md$/,
    /^docs\/development\/github-workflow\.md$/,
    /^scripts\/release\//,
    /^scripts\/(?:bare-metal-deployment-smoke|build-container-image|build-runtime-artifact|bump-version|classify-github-changes|container-deployment-smoke|version-literal|run-(?:regressions|slice-verification)|runtime-artifact-smoke|regression-(?:suite|runner|coverage|clean-clone)|generate-regression-manifest)/,
    /^scripts\/lib\/(?:changed-regression-runner|github-change-classification|regression-change-routing|slice-verification-plan)\.mjs$/,
    /^scripts\/regressions\/release\//,
  ], ["release"], "release, version, or regression-infrastructure path"),
  route([/^src\/modules\/dashboard\//, /^public\/js\/dashboard(?:[./-]|$)/], ["dashboard"], "Dashboard-owned path"),
  route([/^src\/modules\/notes\//, /^public\/js\/notes(?:[./-]|$)/], ["notes"], "Notes-owned path"),
  route([
    /^public\/js\/shared\//,
    /^src\/core\//,
    /^src\/(?:routes|services)\/[^/]*shared/,
  ], ["framework"], "shared framework path"),
  route([
    /^docs\//,
    /^(?!(?:CHANGELOG|ROADMAP|ROADMAP-ARCHIVE)\.md$)[^/]+\.md$/,
    /^LICENSE$/,
  ], ["docs"], "documentation-owned path", { fullCheck: false }),
]);

function route(patterns, areas, reason, { fullCheck } = {}) {
  return Object.freeze({
    areas: Object.freeze(areas),
    fullCheck: fullCheck ?? areas.some((area) => FULL_CHECK_ESCALATION_AREAS.includes(area)),
    patterns: Object.freeze(patterns),
    reason,
  });
}

function normalizeChangedPath(filePath) {
  return String(filePath || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function collectChangedPaths({ cwd = process.cwd() } = {}) {
  return collectChangedChangeSet({ cwd }).paths;
}

function collectChangedChangeSet({ cwd = process.cwd() } = {}) {
  const baseSha = String(process.env.LTF_REGRESSION_BASE_SHA || "").trim();
  if (baseSha && !/^[a-f0-9]{40}$/i.test(baseSha)) {
    throw new Error("LTF_REGRESSION_BASE_SHA must be a full 40-character commit SHA.");
  }
  const tracked = baseSha
    ? runGit(["diff", "--name-only", "--diff-filter=ACMR", `${baseSha}...HEAD`, "--"], cwd)
    : runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"], cwd);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], cwd);
  const paths = Object.freeze([...new Set([...tracked, ...untracked].map(normalizeChangedPath).filter(Boolean))].sort());
  const versionBookkeepingPaths = inspectVersionBookkeepingPaths({ baseSha, cwd, paths, untracked });
  return Object.freeze({ paths, versionBookkeepingPaths });
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect changed files: ${String(result.stderr || result.stdout).trim()}`);
  }
  return String(result.stdout || "").split(/\r?\n/).filter(Boolean);
}

function suggestRegressionsForPaths(filePaths = [], { versionBookkeepingPaths = [] } = {}) {
  const paths = [...new Set(filePaths.map(normalizeChangedPath).filter(Boolean))].sort();
  const versionBookkeeping = new Set(versionBookkeepingPaths.map(normalizeChangedPath));
  const areas = new Set();
  const matches = [];

  for (const filePath of paths) {
    const conventionMatch = filePath.match(/^scripts\/regressions\/([^/]+)\//);
    if (conventionMatch && AREA_COMMANDS[conventionMatch[1]]) {
      areas.add(conventionMatch[1]);
      matches.push(Object.freeze({
        areas: Object.freeze([conventionMatch[1]]),
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
  suggestRegressionsForPaths,
};
