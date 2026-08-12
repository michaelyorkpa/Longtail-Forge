import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { prepareRegressionBaselineDatabase } from "./test-support/database-fixture.mjs";
import {
  resolveIsolatedFilesParallelism,
  resolveIsolatedRegressionParallelism,
  resolveStaticRegressionParallelism,
  runLimitedItems,
} from "./test-support/regression-runner-scheduler.mjs";
import {
  cleanupRegressionNodeCompileCache,
  prepareRegressionNodeCompileCache,
} from "./test-support/regression-runtime-resources.mjs";
import { runIsolatedItemsWithRetry } from "./test-support/isolated-regression-retry.mjs";
import { runRegressionBucketsFailFast } from "./test-support/regression-bucket-orchestrator.mjs";
import {
  assertCanonicalWorkspaceInventoryUnchanged,
  captureCanonicalWorkspaceInventory,
} from "./test-support/canonical-workspace-inventory.mjs";
import { filterRegressionBuckets, parseRegressionCliArgs } from "./lib/regression-runner-options.mjs";
import { loadStaticRegressionExecutionPlan } from "./lib/static-regression-execution.mjs";
import { REGRESSION_BUCKETS, REGRESSION_ENTRIES, REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const ISOLATED_BUCKET_NAME = "isolated database regressions";
const ISOLATED_FILES_BUCKET_NAME = "isolated file storage regressions";
const STATIC_BUCKET_NAME = "static/source regressions";
const VERIFIED_BASELINE_PRELOADER = "./scripts/test-support/regression-child-bootstrap.mjs";
const STATIC_WORKER_BOOTSTRAP = new URL("./test-support/static-regression-worker.mjs", import.meta.url);
const DEFAULT_REPEAT_COUNT = 1;
const MAX_REGRESSION_REPEAT_COUNT = 5;

const totalStart = performance.now();
const canonicalWorkspaceInventoryBefore = captureCanonicalWorkspaceInventory();
const completedResults = [];
let regressionBaseline = null;
let regressionBaselinePromise = null;
let nodeCompileCacheDirectory = null;
let scheduledScriptRuns = REGRESSION_SCRIPTS.length;
let staticExecutionPlan = null;
let staticSequentialWorkerTail = Promise.resolve();

try {
  assertUniqueScripts();
  staticExecutionPlan = await loadStaticRegressionExecutionPlan({ entries: REGRESSION_ENTRIES });
  const runOptions = resolveRunOptions(REGRESSION_BUCKETS, process.env, process.argv.slice(2));
  scheduledScriptRuns = countScheduledScriptRuns(runOptions);

  if (runOptions.list) {
    printRegressionList(runOptions.buckets);
  }

  if (runOptions.dryRun) {
    printDryRun(runOptions);
  }

  if (!runOptions.list && !runOptions.dryRun) {
    nodeCompileCacheDirectory = await prepareRegressionNodeCompileCache();
    if (runOptions.buckets.some((bucket) => bucket.name !== STATIC_BUCKET_NAME || bucket.entries.some((entry) => entry.tags.includes("baseline-fixture")))) {
      void getRegressionBaseline().catch(() => {});
    }
    const selectedStaticExecution = summarizeSelectedStaticExecution(runOptions.buckets);
    console.log(`Running ${scheduledScriptRuns} regression script run(s).`);
    console.log(`Static execution: ${selectedStaticExecution.workerCount} audited worker(s), ${selectedStaticExecution.fallbackCount} child-process fallback(s) (${staticExecutionPlan.mode}).`);
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

      const passResult = await runRegressionBucketsFailFast(
        runOptions.buckets,
        (bucket) => runBucket(bucket, runContext),
      );
      completedResults.push(...passResult.results);
      if (passResult.failure) {
        failedBuckets.push(passResult.failure);
      }

      if (failedBuckets.length > 0) {
        break;
      }
    }

    if (failedBuckets.length > 0) {
      throw new Error(`Regression bucket failure(s): ${failedBuckets.join("; ")}`);
    }

    printSummary(completedResults);
  }
} catch (error) {
  printSummary(completedResults);
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await writeTimingReport(completedResults);
  await cleanupRegressionRuntimeResources();
  const canonicalWorkspaceInventoryAfter = captureCanonicalWorkspaceInventory();

  try {
    assertCanonicalWorkspaceInventoryUnchanged(
      canonicalWorkspaceInventoryBefore,
      canonicalWorkspaceInventoryAfter,
    );
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

async function runBucket(bucket, runContext) {
  const bucketStarted = performance.now();
  const parallelismResolution = bucket.name === STATIC_BUCKET_NAME
    ? resolveStaticRegressionParallelism({ fallbackParallelism: bucket.concurrency })
    : bucket.name === ISOLATED_BUCKET_NAME
    ? resolveIsolatedRegressionParallelism({ fallbackParallelism: bucket.concurrency })
    : bucket.name === ISOLATED_FILES_BUCKET_NAME
      ? resolveIsolatedFilesParallelism({ fallbackParallelism: bucket.concurrency })
      : { parallelism: bucket.concurrency, source: "suite" };
  const concurrency = parallelismResolution.parallelism;
  const effectiveConcurrency = bucket.mode === "serial" ? 1 : Math.max(1, concurrency || 1);
  const concurrencySource = [STATIC_BUCKET_NAME, ISOLATED_BUCKET_NAME, ISOLATED_FILES_BUCKET_NAME].includes(bucket.name)
    ? ` (${parallelismResolution.source})`
    : "";

  const bucketLabel = formatBucketLabel(bucket.name, runContext);

  console.log(`\n[${bucketLabel}] ${bucket.scripts.length} script(s), concurrency ${effectiveConcurrency}${concurrencySource}`);
  const results = bucket.name === ISOLATED_BUCKET_NAME
    ? await runIsolatedWithRetry(bucket, effectiveConcurrency, runContext, bucketLabel)
    : await runLimited(bucket, effectiveConcurrency, runContext);
  printBucketSummary(bucketLabel, results, (performance.now() - bucketStarted) / 1000);

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
    bucket.entries,
    concurrency,
    (entry, scriptIndex) => runScript(entry, bucket, scriptIndex, runContext),
  );
}

async function runIsolatedWithRetry(bucket, concurrency, runContext, bucketLabel) {
  return runIsolatedItemsWithRetry(
    bucket.entries,
    concurrency,
    (entry, scriptIndex, attemptContext) => runScript(entry, bucket, scriptIndex, {
      ...runContext,
      ...attemptContext,
    }),
    {
      onRetry(entry, _scriptIndex, { attemptNumber }) {
        console.log(`[${bucketLabel}] retrying ${entry.path} serially (attempt ${attemptNumber}/2).`);
      },
    },
  );
}

async function runScript(entry, bucket, scriptIndex, runContext) {
  const staticDecision = bucket.name === STATIC_BUCKET_NAME
    ? staticExecutionPlan.decisions.get(entry.path)
    : null;
  if (staticDecision?.decision === "worker-parallel") {
    return runScriptWorker(entry, bucket, runContext);
  }
  if (staticDecision?.decision === "worker-sequential") {
    const run = staticSequentialWorkerTail.then(() => runScriptWorker(entry, bucket, runContext));
    staticSequentialWorkerTail = run.then(() => undefined, () => undefined);
    return run;
  }

  return runScriptChild(entry, bucket, scriptIndex, runContext);
}

async function runScriptChild(entry, bucket, scriptIndex, runContext) {
  const script = entry.path;
  const started = performance.now();
  const launch = await createScriptLaunch(entry, bucket, scriptIndex, runContext);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const childArgs = launch.verifiedBaselineHandshake
      ? ["--import", VERIFIED_BASELINE_PRELOADER, script]
      : [script];
    const child = spawn(process.execPath, childArgs, {
      env: launch.env,
      stdio: launch.verifiedBaselineHandshake
        ? ["ignore", "pipe", "pipe", "pipe"]
        : ["ignore", "pipe", "pipe"],
    });

    if (launch.verifiedBaselineHandshake) {
      child.stdio[3].on("error", (error) => {
        if (error.code !== "EPIPE") stderr += `${error.stack || error.message || error}\n`;
      });
      child.stdio[3].end(`${JSON.stringify(launch.verifiedBaselineHandshake)}\n`);
    }

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
        attemptNumber: runContext.attemptNumber || 1,
        bucketName: bucket.name,
        exitCode,
        runIndex: runContext.runIndex,
        runLabel: formatRunLabel(runContext),
        retry: Boolean(runContext.retry),
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

async function runScriptWorker(entry, bucket, runContext) {
  const script = entry.path;
  const started = performance.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let worker;

    try {
      worker = new Worker(STATIC_WORKER_BOOTSTRAP, {
        env: createChildProcessEnv(),
        stderr: true,
        stdout: true,
        workerData: { script },
      });
    } catch (error) {
      stderr = `${error?.stack || error?.message || error}\n`;
      finish(1);
      return;
    }

    worker.stdout.setEncoding("utf8");
    worker.stderr.setEncoding("utf8");
    worker.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    worker.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    worker.on("error", (error) => {
      stderr += `${error?.stack || error?.message || error}\n`;
    });
    worker.on("exit", finish);

    function finish(exitCode) {
      if (settled) return;
      settled = true;
      const result = {
        attemptNumber: runContext.attemptNumber || 1,
        bucketName: bucket.name,
        executionMode: "worker",
        exitCode,
        runIndex: runContext.runIndex,
        runLabel: formatRunLabel(runContext),
        retry: Boolean(runContext.retry),
        script,
        seconds: (performance.now() - started) / 1000,
        stderr,
        stdout,
      };
      printResult(result);
      resolve(result);
    }
  });
}

async function createScriptLaunch(entry, bucket, scriptIndex, runContext) {
  if (bucket.name === STATIC_BUCKET_NAME && !entry.tags.includes("baseline-fixture")) {
    return { env: createChildProcessEnv(), verifiedBaselineHandshake: null };
  }

  const baseline = await getRegressionBaseline();
  const launch = await baseline.createScriptLaunch(entry.path, scriptIndex, {
    namespace: scriptEnvNamespace(bucket, runContext),
    useBaseline: !entry.tags.includes("baseline-bypass"),
  });
  return {
    ...launch,
    env: createChildProcessEnv(launch.env),
  };
}

function createChildProcessEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    NODE_COMPILE_CACHE: nodeCompileCacheDirectory,
  };
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

async function cleanupRegressionRuntimeResources() {
  const cleanups = await Promise.allSettled([
    cleanupRegressionBaseline(),
    cleanupRegressionNodeCompileCache(nodeCompileCacheDirectory),
  ]);
  nodeCompileCacheDirectory = null;

  for (const cleanup of cleanups) {
    if (cleanup.status === "rejected") {
      console.error(cleanup.reason?.message || cleanup.reason);
      process.exitCode = 1;
    }
  }
}

function printResult(result) {
  const status = result.retry
    ? result.exitCode === 0 ? "flaky-recovered" : `retry failed ${result.exitCode}`
    : result.exitCode === 0 ? "ok" : `failed ${result.exitCode}`;
  console.log(`${status.padEnd(16)} ${formatSeconds(result.seconds).padStart(7)} ${result.script}`);

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
  printFlakyRecoveries(results);
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
    flakyRecoveries: results
      .filter((result) => result.flakyRecovered)
      .map((result) => ({ attemptCount: result.attemptCount, script: result.script })),
    scripts: results.map(({ attemptCount, attempts, bucketName, executionMode, exitCode, flakyRecovered, retrySerial, runLabel, script, seconds }) => ({
      attemptCount: attemptCount || 1,
      attempts: attempts || [],
      bucketName,
      executionMode: executionMode || "child-process",
      exitCode,
      flakyRecovered: Boolean(flakyRecovered),
      retrySerial: Boolean(retrySerial),
      runLabel,
      script,
      seconds,
    })),
    total: scheduledScriptRuns,
    totalSeconds,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function printBucketSummary(bucketName, results, wallSeconds) {
  if (results.length === 0) {
    return;
  }

  const failed = results.filter((result) => result.exitCode !== 0).length;
  const recovered = results.filter((result) => result.flakyRecovered).length;
  const totalSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
  const longestScriptSeconds = Math.max(...results.map((result) => result.seconds));
  const status = failed > 0 ? `${failed} failed` : "passed";

  const recoveryStatus = recovered > 0 ? `; ${recovered} flaky-recovered` : "";

  console.log(`[stage:regression bucket:${bucketName}] ${status}; ${results.length} completed${recoveryStatus}; ${formatSeconds(wallSeconds)} wall time; ${formatSeconds(totalSeconds)} script time; ${formatSeconds(longestScriptSeconds)} longest script.`);
}

function printFlakyRecoveries(results) {
  const recoveries = results.filter((result) => result.flakyRecovered);
  if (recoveries.length === 0) {
    return;
  }
  console.log("Flaky recoveries (isolated database, serial retry):");
  for (const result of recoveries) {
    console.log(`- ${result.script} recovered on attempt ${result.attemptCount}/2`);
  }
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
  const attemptSuffix = runContext.retry ? `-retry-${String(runContext.attemptNumber).padStart(3, "0")}` : "";
  return `${formatRunLabel(runContext)}-${bucket.name}${attemptSuffix}`;
}

function printRegressionList(buckets) {
  const entries = buckets.flatMap((bucket) => bucket.entries);
  console.log(`Discovered ${entries.length} regression script(s).`);
  console.log("id\tarea\ttier\trunMode\ttags\tpath");
  for (const entry of entries) {
    console.log(`${entry.id}\t${entry.area}\t${entry.tier}\t${entry.runMode}\t${entry.tags.join(",")}\t${entry.path}`);
  }
}

function printDryRun(runOptions) {
  console.log(`Dry run: ${countScheduledScriptRuns(runOptions)} regression script run(s) selected.`);
  for (const bucket of runOptions.buckets) {
    console.log(`[${bucket.name}] ${bucket.scripts.length} script(s)`);
    for (const script of bucket.scripts) {
      console.log(`- ${script}`);
    }
  }
  console.log("No regression scripts executed.");
}

function resolveRunOptions(buckets, env, args = []) {
  const bucketFilter = String(env.LTF_REGRESSION_BUCKET || "").trim();
  const repeatCount = parseRepeatCount(env.LTF_REGRESSION_REPEAT);
  const cli = parseRegressionCliArgs(args);
  const metadataFilteredBuckets = filterRegressionBuckets(buckets, cli);
  const selectedBuckets = bucketFilter
    ? filterBuckets(metadataFilteredBuckets, bucketFilter)
    : metadataFilteredBuckets;

  if (selectedBuckets.length === 0) {
    const filters = [cli.area && `area=${cli.area}`, cli.tag && `tag=${cli.tag}`, cli.tier && `tier=${cli.tier}`]
      .filter(Boolean)
      .join(", ");
    throw new Error(`No regression scripts matched${filters ? ` ${filters}` : " the requested filters"}.`);
  }

  return {
    ...cli,
    bucketFilter,
    buckets: selectedBuckets,
    repeatCount,
  };
}

function countScheduledScriptRuns(runOptions) {
  const scriptsPerPass = runOptions.buckets.reduce((sum, bucket) => sum + bucket.scripts.length, 0);
  return scriptsPerPass * runOptions.repeatCount;
}

function summarizeSelectedStaticExecution(buckets) {
  const staticEntries = buckets.find((bucket) => bucket.name === STATIC_BUCKET_NAME)?.entries || [];
  let workerCount = 0;
  for (const entry of staticEntries) {
    if (staticExecutionPlan.decisions.get(entry.path)?.decision.startsWith("worker-")) {
      workerCount += 1;
    }
  }
  return {
    fallbackCount: staticEntries.length - workerCount,
    workerCount,
  };
}

function filterBuckets(buckets, bucketFilter) {
  const normalizedFilter = normalizeBucketFilter(bucketFilter);
  const aliases = new Map([
    ["default", "default database regressions"],
    ["default-database", "default database regressions"],
    ["files", ["file storage regressions", ISOLATED_FILES_BUCKET_NAME]],
    ["file-storage", ["file storage regressions", ISOLATED_FILES_BUCKET_NAME]],
    ["isolated-files", [ISOLATED_FILES_BUCKET_NAME]],
    ["file-storage-isolated", [ISOLATED_FILES_BUCKET_NAME]],
    ["isolated", [ISOLATED_BUCKET_NAME]],
    ["isolated-database", [ISOLATED_BUCKET_NAME]],
    ["static", [STATIC_BUCKET_NAME]],
    ["source", [STATIC_BUCKET_NAME]],
  ]);
  const expectedNames = aliases.get(normalizedFilter) || [bucketFilter];
  const selectedBuckets = buckets.filter((bucket) => (
    expectedNames.includes(bucket.name) ||
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
