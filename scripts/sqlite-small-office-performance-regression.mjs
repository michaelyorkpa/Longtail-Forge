import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createProjectTextReader } from "./test-support/source-scan.mjs";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
const { readText } = createProjectTextReader();

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

const performanceScript = readText("scripts/sqlite-small-office-performance.mjs");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const databaseDocs = readText("docs/database.md");

assertStaticContract();
assertPerformanceSmoke();

console.log("SQLite small-office performance regression passed.");

function assertStaticContract() {

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

  /** @type {{ iterations?: unknown, profile?: unknown, provider?: unknown, routes?: unknown }} */
  const report = requireJsonRecord(JSON.parse(result.stdout), "small-office performance report");
  assert.equal(report.profile, "dev-demo");
  assert.equal(report.provider, "sqlite");
  assert.equal(report.iterations, 1);
  // requireJsonRecord proves only that the report itself is an object. The
  // route list and each route's sample list are proven to be arrays before
  // they are iterated or measured, so a one-character string can no longer
  // satisfy the one-sample claim.
  const routes = report.routes;
  assert.ok(Array.isArray(routes), `small-office performance report should publish routes as an array: ${JSON.stringify(routes)}`);
  assert.deepEqual(routes.map((route) => requireJsonRecord(route, "small-office performance route").id), expectedRouteIds);

  for (const entry of routes) {
    /** @type {{ bytes: unknown, id: unknown, p95Ms: unknown, samplesMs: unknown, statusCode: unknown }} */
    const route = requireJsonRecord(entry, "small-office performance route");
    assert.equal(route.statusCode, 200, `${String(route.id)} should return HTTP 200`);
    const samplesMs = route.samplesMs;
    assert.ok(Array.isArray(samplesMs), `${String(route.id)} should publish samplesMs as an array: ${JSON.stringify(samplesMs)}`);
    assert.equal(samplesMs.length, 1, `${String(route.id)} should include one smoke sample`);
    assert.ok(Number.isFinite(route.p95Ms), `${String(route.id)} should include a numeric p95`);
    assert.ok(typeof route.bytes === "number" && route.bytes > 0, `${String(route.id)} should return a response body`);
  }
}

function cleanEnv(/** @type {Record<string, string | undefined>} */ overrides = {}) {
  /** @type {Record<string, string | undefined>} */
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  return env;
}
