import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { REGRESSION_BUCKETS, REGRESSION_COMMANDS } from "./regression-suite.mjs";

const runner = await readProjectFile("scripts/run-regressions.mjs");
const packageJson = JSON.parse(await readProjectFile("package.json"));

const staticBucket = bucketByName("static/source regressions");
const defaultDatabaseBucket = bucketByName("default database regressions");
const fileStorageBucket = bucketByName("file storage regressions");
const isolatedDatabaseBucket = bucketByName("isolated database regressions");

assert.equal(packageJson.scripts.check, "node scripts/run-regressions.mjs && eslint .");
assert.ok(staticBucket.concurrency > 1, "static source regressions should stay parallel");
assert.equal(defaultDatabaseBucket.mode, "serial", "default database regressions should remain serial");
assert.equal(fileStorageBucket.mode, "serial", "file storage regressions should remain serial");
assert.equal(isolatedDatabaseBucket.mode, "parallel", "isolated database regressions should remain a parallel bucket");
assert.ok(isolatedDatabaseBucket.concurrency > 1, "isolated database regressions should default to concurrent workers");

assert.match(runner, /for \(const bucket of REGRESSION_BUCKETS\)/, "runner should execute buckets in suite order");
assert.doesNotMatch(runner, /Promise\.allSettled\(remainingBuckets/, "runner must not overlap shared database buckets with isolated buckets");
assert.match(runner, /ISOLATED_BUCKET_NAME = "isolated database regressions"/);
assert.match(runner, /STATIC_BUCKET_NAME = "static\/source regressions"/);
assert.match(runner, /BASELINE_BYPASS_SCRIPTS = new Set/);
assert.match(runner, /scripts\/fresh-database-regression\.mjs/);
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/baseline-adoption-regression.mjs"),
  "Baseline adoption regression should guard pre-baseline local DB preservation",
);
assert.match(runner, /prepareRegressionBaselineDatabase/);
assert.match(runner, /createScriptEnv\(script, bucket, scriptIndex\)/);
assert.match(runner, /LTF_REGRESSION_TIMING_JSON/);
assert.match(runner, /LTF_ISOLATED_REGRESSION_PARALLELISM/);
assert.match(runner, /printBucketSummary\(bucket\.name, results\)/, "runner should print a per-bucket summary");
assert.match(runner, /\[\$\{bucket\.name\}\]/, "runner should keep bucket labels in output");
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/regression-runner-regression.mjs"),
  "Regression runner guardrail must remain in the full regression suite",
);

console.log("Regression runner regression passed.");

function bucketByName(name) {
  const bucket = REGRESSION_BUCKETS.find((entry) => entry.name === name);

  assert.ok(bucket, `${name} bucket should exist`);
  return bucket;
}

function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
