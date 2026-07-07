import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  resolveIsolatedRegressionParallelism,
  runLimitedItems,
} from "./test-support/regression-runner-scheduler.mjs";
import { REGRESSION_BUCKETS, REGRESSION_COMMANDS } from "./regression-suite.mjs";

const runner = await readProjectFile("scripts/run-regressions.mjs");
const runnerSchedulerSupport = await readProjectFile("scripts/test-support/regression-runner-scheduler.mjs");
const sourceScanSupport = await readProjectFile("scripts/test-support/source-scan.mjs");
const parameterBindingAudit = await readProjectFile("scripts/parameter-binding-audit-regression.mjs");
const interpolationGuardrail = await readProjectFile("scripts/interpolation-enforcement-guardrail-regression.mjs");
const dialectGuardrail = await readProjectFile("scripts/dialect-enforcement-guardrail-regression.mjs");
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
assert.match(runnerSchedulerSupport, /LTF_ISOLATED_REGRESSION_PARALLELISM/);
assert.match(runnerSchedulerSupport, /LTF_REGRESSION_PARALLELISM/);
assert.match(runner, /resolveIsolatedRegressionParallelism\(\{ fallbackParallelism: bucket\.concurrency \}\)/);
assert.match(runner, /runLimitedItems\(/);
assert.match(runner, /printBucketSummary\(bucket\.name, results\)/, "runner should print a per-bucket summary");
assert.match(runner, /\[\$\{bucket\.name\}\]/, "runner should keep bucket labels in output");
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/regression-runner-regression.mjs"),
  "Regression runner guardrail must remain in the full regression suite",
);
assert.match(sourceScanSupport, /function readRuntimeSourceEntries/, "source-scan support should own runtime source entry reads");
assert.match(sourceScanSupport, /function extractCallExpression/, "source-scan support should own shared call-expression parsing");
assert.match(parameterBindingAudit, /from "\.\/test-support\/source-scan\.mjs"/, "parameter-binding audit should consume shared source-scan support");
assert.match(interpolationGuardrail, /from "\.\/test-support\/source-scan\.mjs"/, "interpolation guardrail should consume shared source-scan support");
assert.match(dialectGuardrail, /from "\.\/test-support\/source-scan\.mjs"/, "dialect guardrail should consume shared source-scan support");
assert.match(runnerSchedulerSupport, /AUTO_ISOLATED_PARALLELISM_CAP = 6/, "isolated auto-tuning should keep a conservative cap");

const autoParallelism = resolveIsolatedRegressionParallelism({
  availableParallelism: 12,
  env: {},
  fallbackParallelism: 4,
});
assert.equal(autoParallelism.parallelism, 6, "auto-tuning should use more isolated workers on larger machines");
assert.equal(autoParallelism.source, "auto:12-available", "auto-tuned concurrency should explain its source");
assert.equal(
  resolveIsolatedRegressionParallelism({
    availableParallelism: 12,
    env: { LTF_REGRESSION_PARALLELISM: "5" },
    fallbackParallelism: 4,
  }).parallelism,
  5,
  "shared regression parallelism override should still be honored",
);
assert.equal(
  resolveIsolatedRegressionParallelism({
    availableParallelism: 12,
    env: { LTF_ISOLATED_REGRESSION_PARALLELISM: "3", LTF_REGRESSION_PARALLELISM: "5" },
    fallbackParallelism: 4,
  }).parallelism,
  3,
  "isolated-specific parallelism override should take precedence",
);
assert.equal(
  resolveIsolatedRegressionParallelism({
    availableParallelism: 2,
    env: {},
    fallbackParallelism: 4,
  }).parallelism,
  2,
  "auto-tuning should not exceed available workers on small machines",
);

const observedIndexes = await runLimitedItems(["first", "second", "third"], 2, async (script, scriptIndex) => ({
  exitCode: 0,
  observedIndex: scriptIndex,
  script,
}));
assert.deepEqual(
  observedIndexes.map((result) => `${result.script}:${result.observedIndex}:${result.itemIndex}`),
  ["first:0:0", "second:1:1", "third:2:2"],
  "parallel scheduling should preserve stable script indexes for isolated fixture envs",
);

const scheduledAfterFailure = [];
const failureResults = await runLimitedItems(["fail", "already-running", "must-not-start"], 2, async (script) => {
  scheduledAfterFailure.push(script);
  if (script === "fail") {
    await delay(5);
    return { exitCode: 1, script };
  }
  await delay(20);
  return { exitCode: 0, script };
});
assert.deepEqual(
  scheduledAfterFailure,
  ["fail", "already-running"],
  "single-script failure should stop scheduling later scripts while allowing already-running work to finish",
);
assert.deepEqual(
  failureResults.map((result) => result.script),
  ["fail", "already-running"],
  "failure results should include only the failed and already-running scripts",
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

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
