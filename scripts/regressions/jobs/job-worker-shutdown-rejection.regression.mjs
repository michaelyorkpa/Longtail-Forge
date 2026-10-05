export const regressionMeta = Object.freeze({
  id: "jobs.job-worker-shutdown-rejection",
  area: "jobs",
  tier: "focused",
  tags: ["jobs", "logging", "shutdown", "typecheck"],
  description: "Proves arbitrary active-run rejections cannot break worker shutdown or leak unbounded payloads through warning logs.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-job-worker-shutdown-"));
process.env.LONGTAIL_DATA_DIR = tempDirectory;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDirectory, "job-worker-shutdown.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";

const {
  getJobWorkerStatus,
  resetJobWorkerStatusForTests,
  startJobWorker,
  stopJobWorker,
} = await import("../../../src/core/jobs/job-runner.js");
const { closeDatabase } = await import("../../../src/db/index.js");

const secretMarker = "shutdown-secret-must-not-leak";
const rejectionCases = [
  ["null", null, "Job failed."],
  ["undefined", undefined, "Job failed."],
  ["plain object", { detail: secretMarker }, "Job failed."],
  ["string", `String rejection\n${"x".repeat(1200)}`, `String rejection ${"x".repeat(983)}`],
  ["Error", new Error("Error rejection\nsummary"), "Error rejection summary"],
];

try {
  await assertPollFailureUsesSafeSummary();

  for (const [label, rejection, expectedSummary] of /** @type {Array<[string, unknown, string]>} */ (rejectionCases)) {
    resetJobWorkerStatusForTests();
    await startJobWorker({
      claimLimit: 1,
      lockTtlSeconds: 30,
      logger: {
        warn() {
          throw rejection;
        },
      },
      mode: "inline",
      pollIntervalMs: 60_000,
      workerId: `shutdown-rejection-${label.replace(/\s+/g, "-")}`,
    });

    /** @type {unknown[]} */
    const warnings = [];
    const stopPromise = stopJobWorker({
      logger: {
        warn(value) {
          warnings.push(value);
        },
      },
    });

    const stopped = await stopPromise;
    assert.equal(stopped.state, "stopped", `${label}: shutdown must reach the stopped state`);
    assert.equal(stopped.running, false, `${label}: shutdown must clear running state`);
    assert.equal(stopped.timerActive, false, `${label}: shutdown must clear the poll timer`);
    assert.deepEqual(
      warnings,
      ["[job-worker] Active run failed during shutdown.", expectedSummary],
      `${label}: shutdown logging must use the bounded safe summary`,
    );
    assert.ok(warnings.every((value) => typeof value === "string" && value.length <= 1000));
    assert.doesNotMatch(JSON.stringify(warnings), new RegExp(secretMarker));
    assert.deepEqual(
      getJobWorkerStatus(),
      stopped,
      `${label}: reported status must remain truthful after shutdown completes`,
    );
  }
} finally {
  resetJobWorkerStatusForTests();
  await closeDatabase();
  await fs.rm(tempDirectory, { force: true, recursive: true });
}

console.log("Job worker shutdown rejection regression passed.");

async function assertPollFailureUsesSafeSummary() {
  resetJobWorkerStatusForTests();
  /** @type {unknown[]} */
  const warnings = [];
  await startJobWorker({
    claimLimit: 1,
    lockTtlSeconds: 30,
    logger: {
      warn(value) {
        warnings.push(value);
      },
    },
    mode: "inline",
    pollIntervalMs: 60_000,
    workerId: "shutdown-rejection-poll-proof",
  });

  await waitFor(() => warnings.length === 2);
  assert.equal(warnings[0], "[job-worker] Poll failed.");
  assert.ok(warnings.every((value) => typeof value === "string" && value.length <= 1000));
  assert.doesNotMatch(JSON.stringify(warnings), /payload_json|shutdown-secret-must-not-leak/);
  const stopped = await stopJobWorker();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.running, false);
  assert.equal(stopped.timerActive, false);
}

/** @param {() => boolean} predicate */
async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the controlled worker poll failure.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
