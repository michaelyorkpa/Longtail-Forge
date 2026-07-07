import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { prepareRegressionBaselineDatabase } from "./test-support/database-fixture.mjs";
import {
  resolveIsolatedRegressionParallelism,
  runLimitedItems,
} from "./test-support/regression-runner-scheduler.mjs";
import { REGRESSION_BUCKETS, REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const ISOLATED_BUCKET_NAME = "isolated database regressions";
const STATIC_BUCKET_NAME = "static/source regressions";
const DEFAULT_REPEAT_COUNT = 1;
const MAX_REGRESSION_REPEAT_COUNT = 5;
const BASELINE_BYPASS_SCRIPTS = new Set([
  "scripts/fresh-database-regression.mjs",
]);

const totalStart = performance.now();
const completedResults = [];
let regressionBaseline = null;
let regressionBaselinePromise = null;
let scheduledScriptRuns = REGRESSION_SCRIPTS.length;

try {
  assertUniqueScripts();
  const runOptions = resolveRunOptions(REGRESSION_BUCKETS, process.env);
  scheduledScriptRuns = countScheduledScriptRuns(runOptions);

  console.log(`Running ${scheduledScriptRuns} regression script run(s).`);
  if (runOptions.bucketFilter) {
    console.log(`Bucket filter: ${runOptions.bucketFilter}`);
  }
  if (runOptions.repeatCount > 1) {
    console.log(`Repeat count: ${runOptions.repeatCount}`);
  }

  const failedBuckets = [];

  for (let runIndex = 0; runIndex < runOptions.repeatCount; runIndex += 1) {
    const runContext = {
      repeatCount: runOptions.repeatCount,
      runIndex,
    };

    if (runOptions.repeatCount > 1) {
      console.log(`\nRegression pass ${runIndex + 1}/${runOptions.repeatCount}`);
    }

    for (const bucket of runOptions.buckets) {
      try {
        completedResults.push(...await runBucket(bucket, runContext));
      } catch (error) {
        const failureResults = error?.results || [];
        completedResults.push(...failureResults);
        failedBuckets.push(error?.message || error);
        break;
      }
    }

    if (failedBuckets.length > 0) {
      break;
    }
  }

  if (failedBuckets.length > 0) {
    throw new Error(`Regression bucket failure(s): ${failedBuckets.join("; ")}`);
  }

  printSummary(completedResults);
} catch (error) {
  printSummary(completedResults);
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await writeTimingReport(completedResults);
  await cleanupRegressionBaseline();
}

async function runBucket(bucket, runContext) {
  const parallelismResolution = bucket.name === ISOLATED_BUCKET_NAME
    ? resolveIsolatedRegressionParallelism({ fallbackParallelism: bucket.concurrency })
    : { parallelism: bucket.concurrency, source: "suite" };
  const concurrency = parallelismResolution.parallelism;
  const effectiveConcurrency = bucket.mode === "serial" ? 1 : Math.max(1, concurrency || 1);
  const concurrencySource = bucket.name === ISOLATED_BUCKET_NAME
    ? ` (${parallelismResolution.source})`
    : "";

  const bucketLabel = formatBucketLabel(bucket.name, runContext);

  console.log(`\n[${bucketLabel}] ${bucket.scripts.length} script(s), concurrency ${effectiveConcurrency}${concurrencySource}`);
  const results = await runLimited(bucket, effectiveConcurrency, runContext);
  printBucketSummary(bucketLabel, results);

  const failures = results.filter((result) => result.exitCode !== 0);

  if (failures.length > 0) {
    const failure = new Error(`${bucketLabel} failed at ${failures.map((result) => result.script).join(", ")}`);
    failure.results = results;
    throw failure;
  }

  return results;
}

async function runLimited(bucket, concurrency, runContext) {
  return runLimitedItems(
    bucket.scripts,
    concurrency,
    (script, scriptIndex) => runScript(script, bucket, scriptIndex, runContext),
  );
}

async function runScript(script, bucket, scriptIndex, runContext) {
  const started = performance.now();
  const env = await createScriptEnv(script, bucket, scriptIndex, runContext);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += `${error.stack || error.message || error}\n`;
    });
    child.on("close", (exitCode) => {
      const seconds = (performance.now() - started) / 1000;
      const result = {
        bucketName: bucket.name,
        exitCode,
        runIndex: runContext.runIndex,
        runLabel: formatRunLabel(runContext),
        script,
        seconds,
        stderr,
        stdout,
      };
      printResult(result);
      resolve(result);
    });
  });
}

async function createScriptEnv(script, bucket, scriptIndex, runContext) {
  if (bucket.name === STATIC_BUCKET_NAME) {
    return process.env;
  }

  const baseline = await getRegressionBaseline();
  return baseline.createScriptEnv(script, scriptIndex, {
    namespace: scriptEnvNamespace(bucket, runContext),
    useBaseline: !BASELINE_BYPASS_SCRIPTS.has(script),
  });
}

async function getRegressionBaseline() {
  if (regressionBaseline) {
    return regressionBaseline;
  }

  if (!regressionBaselinePromise) {
    regressionBaselinePromise = prepareRegressionBaselineDatabase()
      .then((baseline) => {
        regressionBaseline = baseline;
        return baseline;
      })
      .catch((error) => {
        regressionBaselinePromise = null;
        throw error;
      });
  }

  return regressionBaselinePromise;
}

async function cleanupRegressionBaseline() {
  const baseline = regressionBaseline || await regressionBaselinePromise?.catch(() => null);
  regressionBaseline = null;
  regressionBaselinePromise = null;

  if (!baseline) {
    return;
  }

  await baseline.cleanup();
}

function printResult(result) {
  const status = result.exitCode === 0 ? "ok" : `failed ${result.exitCode}`;
  console.log(`${status.padEnd(8)} ${formatSeconds(result.seconds).padStart(7)} ${result.script}`);

  if (result.exitCode !== 0) {
    if (result.stdout.trim()) {
      console.log(result.stdout.trimEnd());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trimEnd());
    }
  }
}

function printSummary(results) {
  if (results.length === 0) {
    return;
  }

  const totalSeconds = (performance.now() - totalStart) / 1000;
  const slowest = [...results]
    .sort((left, right) => right.seconds - left.seconds)
    .slice(0, 8);

  console.log("\nRegression timing summary");
  console.log(`Completed ${results.length}/${scheduledScriptRuns} script run(s) in ${formatSeconds(totalSeconds)}.`);
  console.log("Slowest completed scripts:");
  for (const result of slowest) {
    console.log(`- ${formatSeconds(result.seconds).padStart(7)} ${result.script}`);
  }
}

async function writeTimingReport(results) {
  const outputPath = process.env.LTF_REGRESSION_TIMING_JSON;

  if (!outputPath) {
    return;
  }

  const totalSeconds = (performance.now() - totalStart) / 1000;
  const payload = {
    completed: results.length,
    generatedAt: new Date().toISOString(),
    scripts: results.map(({ bucketName, exitCode, runLabel, script, seconds }) => ({
      bucketName,
      exitCode,
      runLabel,
      script,
      seconds,
    })),
    total: scheduledScriptRuns,
    totalSeconds,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function printBucketSummary(bucketName, results) {
  if (results.length === 0) {
    return;
  }

  const failed = results.filter((result) => result.exitCode !== 0).length;
  const totalSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
  const wallSeconds = Math.max(...results.map((result) => result.seconds));
  const status = failed > 0 ? `${failed} failed` : "passed";

  console.log(`[${bucketName}] ${status}; ${results.length} completed; ${formatSeconds(totalSeconds)} script time; ${formatSeconds(wallSeconds)} longest script.`);
}

function formatSeconds(seconds) {
  return `${seconds.toFixed(2)}s`;
}

function formatBucketLabel(bucketName, runContext) {
  if (runContext.repeatCount <= 1) {
    return bucketName;
  }

  return `${bucketName} ${formatRunLabel(runContext)}`;
}

function formatRunLabel(runContext) {
  return `pass-${String(runContext.runIndex + 1).padStart(3, "0")}`;
}

function scriptEnvNamespace(bucket, runContext) {
  return `${formatRunLabel(runContext)}-${bucket.name}`;
}

function resolveRunOptions(buckets, env) {
  const bucketFilter = String(env.LTF_REGRESSION_BUCKET || "").trim();
  const repeatCount = parseRepeatCount(env.LTF_REGRESSION_REPEAT);

  return {
    bucketFilter,
    buckets: bucketFilter ? filterBuckets(buckets, bucketFilter) : buckets,
    repeatCount,
  };
}

function countScheduledScriptRuns(runOptions) {
  const scriptsPerPass = runOptions.buckets.reduce((sum, bucket) => sum + bucket.scripts.length, 0);
  return scriptsPerPass * runOptions.repeatCount;
}

function filterBuckets(buckets, bucketFilter) {
  const normalizedFilter = normalizeBucketFilter(bucketFilter);
  const aliases = new Map([
    ["default", "default database regressions"],
    ["default-database", "default database regressions"],
    ["files", "file storage regressions"],
    ["file-storage", "file storage regressions"],
    ["isolated", ISOLATED_BUCKET_NAME],
    ["isolated-database", ISOLATED_BUCKET_NAME],
    ["static", STATIC_BUCKET_NAME],
    ["source", STATIC_BUCKET_NAME],
  ]);
  const expectedName = aliases.get(normalizedFilter) || bucketFilter;
  const selectedBuckets = buckets.filter((bucket) => (
    bucket.name === expectedName ||
    normalizeBucketFilter(bucket.name) === normalizedFilter
  ));

  if (selectedBuckets.length === 0) {
    throw new Error(`No regression bucket matched LTF_REGRESSION_BUCKET=${bucketFilter}.`);
  }

  return selectedBuckets;
}

function normalizeBucketFilter(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseRepeatCount(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return DEFAULT_REPEAT_COUNT;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error("LTF_REGRESSION_REPEAT must be a positive integer.");
  }

  const parsed = Number.parseInt(raw, 10);

  if (parsed < 1) {
    throw new Error("LTF_REGRESSION_REPEAT must be at least 1.");
  }

  if (parsed > MAX_REGRESSION_REPEAT_COUNT) {
    throw new Error(`LTF_REGRESSION_REPEAT must be ${MAX_REGRESSION_REPEAT_COUNT} or lower.`);
  }

  return parsed;
}

function assertUniqueScripts() {
  const seen = new Set();
  const duplicates = new Set();

  for (const script of REGRESSION_SCRIPTS) {
    if (seen.has(script)) {
      duplicates.add(script);
    }
    seen.add(script);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate regression scripts: ${[...duplicates].join(", ")}`);
  }
}
