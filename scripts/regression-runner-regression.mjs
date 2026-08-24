import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  resolveStaticRegressionParallelism,
  resolveIsolatedFilesParallelism,
  resolveIsolatedRegressionParallelism,
  runLimitedItems,
} from "./test-support/regression-runner-scheduler.mjs";
import {
  cleanupRegressionNodeCompileCache,
  prepareRegressionNodeCompileCache,
} from "./test-support/regression-runtime-resources.mjs";
import {
  ISOLATED_RETRY_LIMIT,
  runIsolatedItemsWithRetry,
} from "./test-support/isolated-regression-retry.mjs";
import { runRegressionBucketsFailFast } from "./test-support/regression-bucket-orchestrator.mjs";
import { filterRegressionBuckets } from "./lib/regression-runner-options.mjs";
import { REGRESSION_BUCKETS, REGRESSION_COMMANDS, REGRESSION_ENTRIES } from "./regression-suite.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readProjectFile } = createProjectTextReader();

const runner = await readProjectFile("scripts/run-regressions.mjs");
const bucketOrchestratorSupport = await readProjectFile("scripts/test-support/regression-bucket-orchestrator.mjs");
const runnerSchedulerSupport = await readProjectFile("scripts/test-support/regression-runner-scheduler.mjs");
const databaseFixtureSupport = await readProjectFile("scripts/test-support/database-fixture.mjs");
const sourceScanSupport = await readProjectFile("scripts/test-support/source-scan.mjs");
const parameterBindingAudit = await readProjectFile("scripts/regression-contracts/database/parameter-binding-audit.contract.mjs");
const interpolationGuardrail = await readProjectFile("scripts/regression-contracts/database/interpolation-enforcement-guardrail.contract.mjs");
const dialectGuardrail = await readProjectFile("scripts/regression-contracts/database/dialect-enforcement-guardrail.contract.mjs");
const discoverySupport = await readProjectFile("scripts/lib/regression-discovery.mjs");
const metadataSupport = await readProjectFile("scripts/lib/regression-metadata.mjs");
const runnerOptionsSupport = await readProjectFile("scripts/lib/regression-runner-options.mjs");

const staticBucket = bucketByName("static/source regressions");
const defaultDatabaseBucket = bucketByName("default database regressions");
const fileStorageBucket = bucketByName("file storage regressions");
const isolatedFileStorageBucket = bucketByName("isolated file storage regressions");
const isolatedDatabaseBucket = bucketByName("isolated database regressions");

assert.deepEqual(
  REGRESSION_BUCKETS.map(({ mode, name, runMode }) => ({ mode, name, runMode })),
  [
    { mode: "parallel", name: "static/source regressions", runMode: "static" },
    { mode: "serial", name: "default database regressions", runMode: "serial-database" },
    { mode: "serial", name: "file storage regressions", runMode: "serial-files" },
    { mode: "parallel", name: "isolated file storage regressions", runMode: "isolated-files" },
    { mode: "parallel", name: "isolated database regressions", runMode: "isolated-database" },
  ],
  "the default full suite should keep the cheap deterministic bucket before every stateful bucket",
);
assert.deepEqual(
  REGRESSION_BUCKETS.flatMap((bucket) => bucket.scripts).toSorted(),
  REGRESSION_ENTRIES.map((entry) => entry.path).toSorted(),
  "fast-fail ordering should retain every discovered script exactly once",
);

assert.ok(staticBucket.concurrency > 1, "static source regressions should stay parallel");
assert.equal(defaultDatabaseBucket.mode, "serial", "default database regressions should remain serial");
assert.equal(fileStorageBucket.mode, "serial", "file storage regressions should remain serial");
assert.equal(isolatedFileStorageBucket.mode, "parallel", "audited isolated Files regressions should run concurrently");
assert.ok(isolatedFileStorageBucket.concurrency > 1, "isolated Files regressions should default to concurrent workers");
assert.equal(isolatedDatabaseBucket.mode, "parallel", "isolated database regressions should remain a parallel bucket");
assert.ok(isolatedDatabaseBucket.concurrency > 1, "isolated database regressions should default to concurrent workers");

assert.match(runner, /resolveRunOptions\(REGRESSION_BUCKETS, process\.env, process\.argv\.slice\(2\)\)/, "runner should derive CLI options from the discovered suite");
assert.match(bucketOrchestratorSupport, /for \(const bucket of buckets\)/, "bucket orchestration should execute selected buckets sequentially in suite order");
assert.match(runner, /runRegressionBucketsFailFast\(\s*runOptions\.buckets/, "default execution should use the guarded sequential bucket orchestrator");
assert.doesNotMatch(runner, /Promise\.allSettled\(remainingBuckets/, "runner must not overlap shared database buckets with isolated buckets");
assert.match(runner, /ISOLATED_BUCKET_NAME = "isolated database regressions"/);
assert.match(runner, /ISOLATED_FILES_BUCKET_NAME = "isolated file storage regressions"/);
assert.match(runner, /STATIC_BUCKET_NAME = "static\/source regressions"/);
assert.match(runner, /MAX_REGRESSION_REPEAT_COUNT = 5/, "repeat stress mode should stay bounded");
assert.match(runner, /LTF_REGRESSION_BUCKET/, "runner should expose a bucket filter for bounded stress checks");
assert.match(runner, /LTF_REGRESSION_REPEAT/, "runner should expose a bounded repeat count for stress checks");
assert.match(runner, /filterBuckets\(metadataFilteredBuckets, bucketFilter\)/, "runner should combine metadata and bucket filters before scheduling scripts");
assert.match(runner, /entry\.tags\.includes\("baseline-bypass"\)/, "baseline bypass should be explicit metadata rather than a second runner path list");
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/baseline-adoption-regression.mjs"),
  "Baseline adoption regression should guard pre-baseline local DB preservation",
);
assert.match(runner, /prepareRegressionBaselineDatabase/);
assert.match(runner, /regressionBaselinePromise/, "runner should share one in-flight baseline preparation across parallel scripts");
assert.match(runner, /regressionBaselinePromise = prepareRegressionBaselineDatabase\(\)/, "parallel isolated startup should not prepare multiple baseline databases");
assert.match(runner, /void getRegressionBaseline\(\)\.catch/, "baseline preparation should overlap the static bucket without producing an unhandled rejection");
assert.match(runner, /createScriptLaunch\(entry, bucket, scriptIndex, runContext\)/);
assert.match(runner, /VERIFIED_BASELINE_PRELOADER/, "runner should preload the one-shot baseline handshake before the regression entrypoint");
assert.match(runner, /stdio: launch\.verifiedBaselineHandshake[\s\S]*"pipe"/, "runner should deliver the verified baseline attestation over a dedicated inherited pipe");
assert.match(databaseFixtureSupport, /createVerifiedRegressionBaselineHandshake/, "runner baseline preparation should bind the closed template to a verified handshake");
assert.match(databaseFixtureSupport, /PRAGMA integrity_check/, "runner baseline preparation should prove SQLite integrity before attestation");
assert.match(databaseFixtureSupport, /PRAGMA foreign_key_check/, "runner baseline preparation should prove foreign-key integrity before attestation");
assert.match(runner, /NODE_COMPILE_CACHE: nodeCompileCacheDirectory/, "every spawned regression should share the runner-owned compile cache");
assert.match(runner, /cleanupRegressionNodeCompileCache\(nodeCompileCacheDirectory\)/, "the runner should clean its compile cache at finalization");
assert.match(runner, /namespace: scriptEnvNamespace\(bucket, runContext\)/, "runner should namespace isolated DB fixtures by bucket and repeat pass");
assert.match(runner, /LTF_REGRESSION_TIMING_JSON/);
assert.match(databaseFixtureSupport, /path\.join\(root, "script-data", namespace/, "database fixture should include the runner namespace in script data paths");
assert.match(databaseFixtureSupport, /function sanitizePathSegment/, "database fixture should sanitize namespace and script path segments");
assert.match(runnerSchedulerSupport, /LTF_ISOLATED_REGRESSION_PARALLELISM/);
assert.match(runnerSchedulerSupport, /LTF_ISOLATED_FILES_PARALLELISM/);
assert.match(runnerSchedulerSupport, /LTF_STATIC_REGRESSION_PARALLELISM/);
assert.match(runnerSchedulerSupport, /LTF_REGRESSION_PARALLELISM/);
assert.match(runner, /resolveStaticRegressionParallelism\(\{ fallbackParallelism: bucket\.concurrency \}\)/);
assert.match(runner, /resolveIsolatedRegressionParallelism\(\{ fallbackParallelism: bucket\.concurrency \}\)/);
assert.match(runner, /resolveIsolatedFilesParallelism\(\{ fallbackParallelism: bucket\.concurrency \}\)/);
assert.match(runner, /runLimitedItems\(/);
assert.match(runner, /bucket\.name === ISOLATED_BUCKET_NAME[\s\S]*runIsolatedWithRetry[\s\S]*runLimited/, "only the isolated bucket should enter retry scheduling");
assert.doesNotMatch(runner, /bucket\.name === ISOLATED_FILES_BUCKET_NAME\s*\? await runIsolatedWithRetry/, "isolated Files regressions must never enter retry scheduling");
assert.match(runner, /flaky-recovered/, "recovered isolated flakes should be visible in console output");
assert.match(runner, /flakyRecoveries/, "timing reports should carry a recovery summary");
assert.match(runner, /retrySerial/, "per-script timing records should identify serial retry attempts");
assert.match(runner, /retry-\$\{String\(runContext\.attemptNumber\)/, "retry fixtures should use a fresh attempt namespace");
assert.match(runner, /printBucketSummary\(bucketLabel, results, \(performance\.now\(\) - bucketStarted\) \/ 1000\)/, "runner should print a timed per-bucket summary");
assert.match(runner, /\[stage:regression bucket:\$\{bucketName\}\]/, "runner should keep bucket labels in timed output");
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/regression-runner-regression.mjs"),
  "Regression runner guardrail must remain in the full regression suite",
);
assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/regressions/release/regression-discovery-runner.regression.mjs"),
  "new convention-path regressions should be auto-discovered",
);
assert.ok(
  REGRESSION_ENTRIES.find((entry) => entry.path === "scripts/fresh-database-regression.mjs")?.tags.includes("baseline-bypass"),
  "fresh database should preserve the baseline bypass through metadata",
);
assert.match(discoverySupport, /listConventionCandidates/);
assert.match(discoverySupport, /listTopLevelLegacyCandidates/);
assert.match(discoverySupport, /regression-legacy-snapshot\.json/);
assert.match(metadataSupport, /export\\s\+const\\s\+regressionMeta/);
assert.match(runnerOptionsSupport, /--area/);
assert.match(runnerOptionsSupport, /--tag/);
assert.match(runnerOptionsSupport, /--tier/);
assert.match(runner, /printRegressionList/);
assert.match(runner, /printDryRun/);
assert.match(sourceScanSupport, /function readRuntimeSourceEntries/, "source-scan support should own runtime source entry reads");
assert.match(sourceScanSupport, /function extractCallExpression/, "source-scan support should own shared call-expression parsing");
assert.match(parameterBindingAudit, /from "\.\.\/\.\.\/test-support\/source-scan\.mjs"/, "parameter-binding audit should consume shared source-scan support");
assert.match(interpolationGuardrail, /from "\.\.\/\.\.\/test-support\/source-scan\.mjs"/, "interpolation guardrail should consume shared source-scan support");
assert.match(dialectGuardrail, /from "\.\.\/\.\.\/test-support\/source-scan\.mjs"/, "dialect guardrail should consume shared source-scan support");
assert.match(runnerSchedulerSupport, /AUTO_ISOLATED_PARALLELISM_CAP = 6/, "isolated auto-tuning should keep a conservative cap");
assert.match(runnerSchedulerSupport, /AUTO_STATIC_PARALLELISM_CAP = 8/, "static auto-tuning should keep a conservative host-aware cap");

assert.deepEqual(
  resolveStaticRegressionParallelism({
    availableParallelism: 12,
    env: {},
    fallbackParallelism: 6,
  }),
  { parallelism: 8, source: "auto:12-available" },
  "static scheduling should use a conservative two-thirds host default up to eight workers",
);
assert.deepEqual(
  resolveStaticRegressionParallelism({
    availableParallelism: 12,
    env: { LTF_REGRESSION_PARALLELISM: "7", LTF_STATIC_REGRESSION_PARALLELISM: "1" },
    fallbackParallelism: 6,
  }),
  { parallelism: 1, source: "LTF_STATIC_REGRESSION_PARALLELISM" },
  "the static-specific override should retain an explicit serial diagnosis mode",
);
assert.equal(
  resolveStaticRegressionParallelism({
    availableParallelism: 12,
    env: { LTF_REGRESSION_PARALLELISM: "5" },
    fallbackParallelism: 6,
  }).parallelism,
  5,
  "the shared regression parallelism override should also control static work",
);

const autoParallelism = resolveIsolatedRegressionParallelism({
  availableParallelism: 12,
  env: {},
  fallbackParallelism: 4,
});
assert.equal(autoParallelism.parallelism, 6, "auto-tuning should use more isolated workers on larger machines");
assert.equal(autoParallelism.source, "auto:12-available", "auto-tuned concurrency should explain its source");
assert.deepEqual(
  resolveIsolatedFilesParallelism({
    availableParallelism: 12,
    env: { LTF_ISOLATED_FILES_PARALLELISM: "2", LTF_REGRESSION_PARALLELISM: "5" },
    fallbackParallelism: 4,
  }),
  { parallelism: 2, source: "LTF_ISOLATED_FILES_PARALLELISM" },
  "Files-specific stress concurrency should take precedence over the shared override",
);
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

const runtimeResourceParent = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-regression-runtime-proof-"));
try {
  const compileCache = await prepareRegressionNodeCompileCache({ parentDirectory: runtimeResourceParent });
  assert.equal(path.dirname(compileCache), runtimeResourceParent, "compile cache should live under the caller-owned OS-temp boundary");
  assert.notEqual(path.dirname(compileCache), process.cwd(), "compile cache must not live in the checkout");
  await fs.writeFile(path.join(compileCache, "proof.cache"), "runner-owned");
  await cleanupRegressionNodeCompileCache(compileCache);
  await assert.rejects(fs.stat(compileCache), { code: "ENOENT" }, "compile cache cleanup should remove the complete owned directory");
} finally {
  await fs.rm(runtimeResourceParent, { force: true, recursive: true });
}

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

/** @type {string[]} */
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

assert.equal(ISOLATED_RETRY_LIMIT, 1, "isolated flakes should receive exactly one bounded retry");
/** @type {string[]} */
const recoveryInvocations = [];
/** @type {string[]} */
const retryNotifications = [];
let activeRetries = 0;
let maxActiveRetries = 0;
const recoveredResults = await runIsolatedItemsWithRetry(
  ["fails-once", "already-running", "after-recovery"],
  2,
  async (script, scriptIndex, attempt) => {
    recoveryInvocations.push(`${script}:${attempt.retry ? "retry" : "initial"}:${scriptIndex}`);
    if (attempt.retry) {
      activeRetries += 1;
      maxActiveRetries = Math.max(maxActiveRetries, activeRetries);
      await delay(3);
      activeRetries -= 1;
    } else if (script === "already-running") {
      await delay(10);
    } else {
      await delay(2);
    }
    return {
      attemptNumber: attempt.attemptNumber,
      exitCode: script === "fails-once" && !attempt.retry ? 1 : 0,
      retry: attempt.retry,
      script,
      seconds: 0.01,
      stderr: "",
      stdout: "",
    };
  },
  {
    onRetry(script, scriptIndex, attempt) {
      retryNotifications.push(`${script}:${scriptIndex}:${attempt.attemptNumber}`);
    },
  },
);
assert.deepEqual(recoveredResults.map((result) => result.script), ["fails-once", "already-running", "after-recovery"]);
assert.equal(recoveredResults[0].exitCode, 0, "a green serial retry should recover the logical script result");
assert.equal(recoveredResults[0].flakyRecovered, true, "a recovered script must stay visibly marked");
assert.equal(recoveredResults[0].attemptCount, 2);
assert.equal(recoveredResults[0].retrySerial, true);
assert.equal(recoveredResults[0].attempts.length, 2, "timing data should retain both attempts");
assert.deepEqual(retryNotifications, ["fails-once:0:2"]);
assert.equal(maxActiveRetries, 1, "retry attempts should execute serially");
assert.ok(
  recoveryInvocations.indexOf("after-recovery:initial:2") > recoveryInvocations.indexOf("fails-once:retry:0"),
  "unscheduled isolated scripts should resume only after the failed script recovers",
);

/** @type {string[]} */
const persistentInvocations = [];
const persistentResults = await runIsolatedItemsWithRetry(
  ["always-fails", "must-not-start"],
  1,
  async (script, _scriptIndex, attempt) => {
    persistentInvocations.push(`${script}:${attempt.retry ? "retry" : "initial"}`);
    return {
      attemptNumber: attempt.attemptNumber,
      exitCode: script === "always-fails" ? 1 : 0,
      retry: attempt.retry,
      script,
      seconds: 0.01,
      stderr: "",
      stdout: "",
    };
  },
);
assert.deepEqual(persistentInvocations, ["always-fails:initial", "always-fails:retry"]);
assert.equal(persistentResults[0].exitCode, 1, "a repeatable failure should remain red after its one retry");
assert.equal(persistentResults[0].flakyRecovered, false);
assert.equal(persistentResults[0].attemptCount, 2);
assert.equal(persistentResults.length, 1, "repeatable failure should preserve fail-fast scheduling after retry");

const seededBucketOrder = [
  { name: "static/source regressions" },
  { name: "default database regressions" },
  { name: "file storage regressions" },
  { name: "isolated file storage regressions" },
  { name: "isolated database regressions" },
];
/** @type {string[]} */
const seededScheduledBuckets = [];
const seededStaticFailure = await runRegressionBucketsFailFast(seededBucketOrder, async (bucket) => {
  seededScheduledBuckets.push(bucket.name);
  if (bucket.name === "static/source regressions") {
    // runRegressionBucketsFailFast reads `results` off a thrown error; the
    // orchestrator publishes that shape as BucketRunError. Object.assign builds
    // it without a cast, so the seeded failure really is what the production
    // path consumes.
    throw Object.assign(new Error("seeded static failure"), {
      results: [{ bucketName: bucket.name, exitCode: 1, script: "seeded-static-regression.mjs" }],
    });
  }
  return [{ bucketName: bucket.name, exitCode: 0, script: `${bucket.name}.mjs` }];
});
assert.deepEqual(seededScheduledBuckets, ["static/source regressions"], "a static failure should short-circuit every stateful bucket");
assert.equal(seededStaticFailure.failure, "seeded static failure");
assert.deepEqual(seededStaticFailure.results.map((result) => result.script), ["seeded-static-regression.mjs"]);

const taskBuckets = filterRegressionBuckets(REGRESSION_BUCKETS, { area: "tasks" });
assert.deepEqual(
  taskBuckets.map((bucket) => bucket.name),
  REGRESSION_BUCKETS.filter((bucket) => bucket.entries.some((entry) => entry.area === "tasks")).map((bucket) => bucket.name),
  "narrow area filtering should preserve the same relative bucket order",
);
assert.deepEqual(
  taskBuckets.flatMap((bucket) => bucket.scripts).toSorted(),
  REGRESSION_ENTRIES.filter((entry) => entry.area === "tasks").map((entry) => entry.path).toSorted(),
  "narrow routing should retain the same selected Tasks scripts",
);

console.log("Regression runner regression passed.");

/** @param {string} name */
function bucketByName(name) {
  const bucket = REGRESSION_BUCKETS.find((entry) => entry.name === name);

  assert.ok(bucket, `${name} bucket should exist`);
  return bucket;
}

/** @param {number} milliseconds @returns {Promise<void>} */
function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
