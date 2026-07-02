import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const appVersion = "0.33.5.21.7.8";
const root = process.cwd();
const expectedRouteIds = Object.freeze([
  "app-shell-bootstrap",
  "tasks-list",
  "task-detail",
  "notes-list",
  "note-detail",
  "files-browse",
  "search",
  "notifications",
  "workbench-bootstrap",
]);

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const performanceScript = readText("scripts/sqlite-small-office-performance.mjs");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assertStaticContract();
assertPerformanceSmoke();

console.log("SQLite small-office performance regression passed.");

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the SQLite small-office performance version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the SQLite small-office performance version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the SQLite small-office performance version");

  assert.match(performanceScript, /DEFAULT_PROFILE = "sqlite-small-office-50"/, "performance script should default to the supported SQLite small-office profile");
  assert.match(performanceScript, /TARGET_NOTE = "Local development hardware sanity targets/, "performance script should label targets as local development sanity targets");
  assert.match(performanceScript, /runScaleSeed/, "performance script should build seeded databases before measuring routes");
  assert.match(performanceScript, /--fail-on-warn/, "performance script should offer an explicit threshold-failure mode");

  for (const routeId of expectedRouteIds) {
    assert.match(performanceScript, new RegExp(`id: "${routeId}"`), `performance script should cover ${routeId}`);
  }

  assert.match(sqliteDocs, /node scripts\/sqlite-small-office-performance\.mjs --profile sqlite-small-office-50 --provider sqlite/, "SQLite small-office docs should document the repeatable performance command");
  assert.match(sqliteDocs, /Local development hardware sanity targets/i, "SQLite small-office docs should record timing target semantics");
  assert.match(sqliteDocs, /not a hosted SaaS load test/, "SQLite small-office docs should document the expected limits honestly");
  assert.match(sqliteDocs, /Workbench bootstrap is a special canary/, "SQLite small-office docs should call out Workbench bootstrap limits");
  assert.match(databaseDocs, /As of version 0\.33\.5\.20\.6/, "Database docs should mention the performance pass");
  assert.match(roadmap, /Completed 0\.33\.5\.20 bounded queries and small-office scale data work is archived/, "Roadmap should point the completed 0.33.5.20 branch to the archive");
  assert.match(changelog, /Version 0\.33\.5\.20\.6/, "Changelog should include the SQLite small-office performance release");
  assert.match(regressionSuite, /scripts\/sqlite-small-office-performance-regression\.mjs/, "Regression suite should include SQLite small-office performance coverage");
}

function assertPerformanceSmoke() {
  const result = spawnSync(process.execPath, [
    "scripts/sqlite-small-office-performance.mjs",
    "--profile",
    "dev-demo",
    "--provider",
    "sqlite",
    "--iterations",
    "1",
    "--warmups",
    "0",
    "--json",
  ], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_ENV: "test",
      SUPER_ADMIN_PASSWORD: "Scale-Seed-Password-123!",
    }),
    timeout: 120000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout);
  assert.equal(report.profile, "dev-demo");
  assert.equal(report.provider, "sqlite");
  assert.equal(report.iterations, 1);
  assert.deepEqual(report.routes.map((route) => route.id), expectedRouteIds);

  for (const route of report.routes) {
    assert.equal(route.statusCode, 200, `${route.id} should return HTTP 200`);
    assert.equal(route.samplesMs.length, 1, `${route.id} should include one smoke sample`);
    assert.ok(Number.isFinite(route.p95Ms), `${route.id} should include a numeric p95`);
    assert.ok(route.bytes > 0, `${route.id} should return a response body`);
  }
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  return env;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
