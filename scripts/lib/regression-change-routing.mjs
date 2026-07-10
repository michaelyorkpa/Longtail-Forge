import { spawnSync } from "node:child_process";

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
});

const ROUTE_RULES = Object.freeze([
  route([/^src\/modules\/tasks\//, /^public\/js\/tasks(?:[./-]|$)/, /^docs\/tasks(?:[./-]|$)/], ["tasks"]),
  route([
    /^src\/modules\/files\//,
    /^public\/js\/(?:shared\/)?files?(?:[./-]|$)/,
    /^docs\/files(?:[./-]|$)/,
  ], ["files"]),
  route([
    /^public\/js\/workbench\.js$/,
    /^src\/(?:routes|services)\/workbench(?:[./-]|$)/,
    /^docs\/workbench(?:[./-]|$)/,
  ], ["workbench"]),
  route([
    /^public\/js\/shared\/view-(?:builder|renderer|index|descriptor)(?:[./-]|$)/,
    /^src\/(?:core|views?)\/.*view(?:[./-]|$)/,
    /^docs\/.*view-(?:builder|renderer)/,
  ], ["framework", "views"]),
  route([
    /^src\/db\//,
    /^src\/repositories\//,
    /(?:^|\/)migrations?(?:\/|\.|-)/,
  ], ["database"]),
  route([
    /(?:^|[./_-])permissions?(?:[./_-]|$)/,
    /(?:^|[./_-])sessions?(?:[./_-]|$)/,
    /(?:^|[./_-])workspaces?(?:[./_-]|$)/,
    /(?:^|[./_-])memberships?(?:[./_-]|$)/,
  ], ["permissions"]),
  route([
    /^package(?:-lock)?\.json$/,
    /^(?:CHANGELOG|ROADMAP|ROADMAP-ARCHIVE)\.md$/,
    /^src\/core\/version\.js$/,
    /^src\/routes\/app-info\.routes\.js$/,
    /^docs\/versioning\.md$/,
    /^docs\/.*release(?:[./-]|$)/,
    /^scripts\/(?:bump-version|version-literal|run-regressions|regression-(?:suite|runner|coverage|clean-clone)|generate-regression-manifest)/,
    /^scripts\/regressions\/release\//,
  ], ["release"]),
  route([/^src\/modules\/dashboard\//, /^public\/js\/dashboard(?:[./-]|$)/], ["dashboard"]),
  route([/^src\/modules\/notes\//, /^public\/js\/notes(?:[./-]|$)/], ["notes"]),
  route([
    /^public\/js\/shared\//,
    /^src\/core\//,
    /^src\/(?:routes|services)\/[^/]*shared/,
  ], ["framework"]),
]);

function route(patterns, areas) {
  return Object.freeze({ areas: Object.freeze(areas), patterns: Object.freeze(patterns) });
}

function normalizeChangedPath(filePath) {
  return String(filePath || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function collectChangedPaths({ cwd = process.cwd() } = {}) {
  const tracked = runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"], cwd);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], cwd);
  return Object.freeze([...new Set([...tracked, ...untracked].map(normalizeChangedPath).filter(Boolean))].sort());
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect changed files: ${String(result.stderr || result.stdout).trim()}`);
  }
  return String(result.stdout || "").split(/\r?\n/).filter(Boolean);
}

function suggestRegressionsForPaths(filePaths = []) {
  const paths = [...new Set(filePaths.map(normalizeChangedPath).filter(Boolean))].sort();
  const areas = new Set();

  for (const filePath of paths) {
    const conventionMatch = filePath.match(/^scripts\/regressions\/([^/]+)\//);
    if (conventionMatch && AREA_COMMANDS[conventionMatch[1]]) {
      areas.add(conventionMatch[1]);
    }
    for (const rule of ROUTE_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(filePath))) {
        rule.areas.forEach((area) => areas.add(area));
      }
    }
  }

  const commands = Object.keys(AREA_COMMANDS)
    .filter((area) => areas.has(area))
    .map((area) => AREA_COMMANDS[area]);

  return Object.freeze({
    areas: Object.freeze([...areas].sort()),
    commands: Object.freeze(commands.length > 0 ? commands : ["npm run test:regressions"]),
    paths: Object.freeze(paths),
    releaseGate: "npm run check",
  });
}

export {
  AREA_COMMANDS,
  ROUTE_RULES,
  collectChangedPaths,
  normalizeChangedPath,
  suggestRegressionsForPaths,
};
