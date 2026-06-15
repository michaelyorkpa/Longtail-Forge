import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { REGRESSION_BUCKETS, REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const ISOLATED_BUCKET_NAME = "isolated database regressions";
const DEFAULT_ISOLATED_PARALLELISM = 4;
const envIsolatedParallelism = Number.parseInt(
  process.env.LTF_ISOLATED_REGRESSION_PARALLELISM || process.env.LTF_REGRESSION_PARALLELISM || "",
  10,
);
const isolatedParallelism = Number.isInteger(envIsolatedParallelism) && envIsolatedParallelism > 0
  ? envIsolatedParallelism
  : DEFAULT_ISOLATED_PARALLELISM;

const totalStart = performance.now();
const completedResults = [];

try {
  assertUniqueScripts();

  console.log(`Running ${REGRESSION_SCRIPTS.length} regression scripts.`);

  const failedBuckets = [];

  for (const bucket of REGRESSION_BUCKETS) {
    try {
      completedResults.push(...await runBucket(bucket));
    } catch (error) {
      const failureResults = error?.results || [];
      completedResults.push(...failureResults);
      failedBuckets.push(error?.message || error);
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
}

async function runBucket(bucket) {
  const concurrency = bucket.name === ISOLATED_BUCKET_NAME
    ? isolatedParallelism
    : bucket.concurrency;
  const effectiveConcurrency = bucket.mode === "serial" ? 1 : Math.max(1, concurrency || 1);

  console.log(`\n[${bucket.name}] ${bucket.scripts.length} script(s), concurrency ${effectiveConcurrency}`);
  const results = await runLimited(bucket.scripts, effectiveConcurrency);
  printBucketSummary(bucket.name, results);

  const failures = results.filter((result) => result.exitCode !== 0);

  if (failures.length > 0) {
    const failure = new Error(`${bucket.name} failed at ${failures.map((result) => result.script).join(", ")}`);
    failure.results = results;
    throw failure;
  }

  return results;
}

async function runLimited(scripts, concurrency) {
  const results = [];
  const running = new Set();
  let nextIndex = 0;
  let failed = false;

  async function scheduleNext() {
    if (failed || nextIndex >= scripts.length) {
      return;
    }

    const script = scripts[nextIndex];
    nextIndex += 1;
    const promise = runScript(script)
      .then((result) => {
        results.push(result);
        if (result.exitCode !== 0) {
          failed = true;
        }
      })
      .finally(() => {
        running.delete(promise);
      });
    running.add(promise);
  }

  while (running.size < concurrency && nextIndex < scripts.length) {
    await scheduleNext();
  }

  while (running.size > 0) {
    await Promise.race(running);
    while (!failed && running.size < concurrency && nextIndex < scripts.length) {
      await scheduleNext();
    }
  }

  return results.sort((left, right) => scripts.indexOf(left.script) - scripts.indexOf(right.script));
}

function runScript(script) {
  const started = performance.now();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: process.env,
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
        exitCode,
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
  console.log(`Completed ${results.length}/${REGRESSION_SCRIPTS.length} script(s) in ${formatSeconds(totalSeconds)}.`);
  console.log("Slowest completed scripts:");
  for (const result of slowest) {
    console.log(`- ${formatSeconds(result.seconds).padStart(7)} ${result.script}`);
  }
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
