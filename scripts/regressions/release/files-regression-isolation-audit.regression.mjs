export const regressionMeta = Object.freeze({
  id: "release.files-regression-isolation-audit",
  area: "release",
  tier: "release-gate",
  tags: ["files", "performance", "release", "scheduling"],
  description: "Proves every legacy Files regression has an explicit isolation audit and only repeat-stressed scripts run concurrently without retries.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGRESSION_BUCKETS, REGRESSION_ENTRIES } from "../../regression-suite.mjs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const audit = JSON.parse(readFileSync("scripts/regression-files-isolation-audit.json", "utf8"));
const legacySnapshot = JSON.parse(readFileSync("scripts/regression-legacy-snapshot.json", "utf8"));
const runner = readFileSync("scripts/run-regressions.mjs", "utf8");
const scheduler = readFileSync("scripts/test-support/regression-runner-scheduler.mjs", "utf8");
const roadmap = readFileSync("ROADMAP.md", "utf8");
const roadmapArchive = readFileSync("ROADMAP-ARCHIVE.md", "utf8");
const dimensions = [
  "database",
  "fileStorageRoot",
  "scanner",
  "networkPort",
  "environment",
  "workerOrChildProcess",
  "singletonRuntime",
];
const originalFiles = legacySnapshot.scripts
  .filter((entry) => entry.runMode === "serial-files")
  .map((entry) => entry.path)
  .sort();

assert.equal(audit.schemaVersion, 1);
assert.equal(audit.sourceRunMode, "serial-files");
assert.equal(audit.parallelRunMode, "isolated-files");
assert.deepEqual(audit.resourceDimensions, dimensions);
assert.deepEqual(audit.entries.map((entry) => entry.path).sort(), originalFiles, "the audit must classify every original serial Files script exactly once");
assert.equal(new Set(audit.entries.map((entry) => entry.path)).size, 29);

for (const entry of audit.entries) {
  assert.ok(["serial-files", "isolated-files"].includes(entry.decision), `${entry.path} must have an allowed scheduling decision`);
  assert.deepEqual(Object.keys(entry.resources), dimensions, `${entry.path} must classify every mutable resource dimension`);
  assert.ok(entry.rationale.length >= 40, `${entry.path} must retain a script-specific scheduling rationale`);
  assert.equal(
    REGRESSION_ENTRIES.find((candidate) => candidate.path === entry.path)?.runMode,
    entry.decision,
    `${entry.path} discovery mode must match the audited decision`,
  );
}

const moved = audit.entries.filter((entry) => entry.decision === "isolated-files");
const retained = audit.entries.filter((entry) => entry.decision === "serial-files");
assert.equal(moved.length, 9, "only the nine fully disposable scripts may move");
assert.equal(retained.length, 20, "ambiguous process, port, scanner, worker, and singleton cases must remain serial");

const serialBucket = REGRESSION_BUCKETS.find((bucket) => bucket.runMode === "serial-files");
const isolatedFilesBucket = REGRESSION_BUCKETS.find((bucket) => bucket.runMode === "isolated-files");
assert.equal(serialBucket.mode, "serial");
assert.equal(serialBucket.concurrency, 1);
assert.deepEqual(serialBucket.scripts.toSorted(), retained.map((entry) => entry.path).sort());
assert.equal(isolatedFilesBucket.mode, "parallel");
assert.equal(isolatedFilesBucket.concurrency, 4);
assert.deepEqual(isolatedFilesBucket.scripts.toSorted(), moved.map((entry) => entry.path).sort());

assert.deepEqual(audit.measurements.stress.map((entry) => entry.concurrency), [2, 4, 6]);
for (const result of audit.measurements.stress) {
  assert.equal(result.passes, 3);
  assert.equal(result.scriptRuns, 27);
  assert.equal(result.failures, 0);
  assert.equal(result.recoveredFlakes, 0);
  assert.ok(result.wallSeconds > 0);
}
assert.equal(audit.measurements.baseline.scripts, 29);
assert.equal(audit.measurements.baseline.concurrency, 1);
assert.equal(audit.measurements.baseline.failures, 0);
assert.equal(audit.measurements.postChange.serialScripts, 20);
assert.equal(audit.measurements.postChange.isolatedScripts, 9);
assert.equal(audit.measurements.postChange.failures, 0);
assert.equal(audit.measurements.postChange.recoveredFlakes, 0);
assert.ok(audit.measurements.postChange.wallSeconds < audit.measurements.baseline.wallSeconds);

assert.match(runner, /ISOLATED_FILES_BUCKET_NAME = "isolated file storage regressions"/);
assert.match(runner, /resolveIsolatedFilesParallelism/);
assert.match(scheduler, /LTF_ISOLATED_FILES_PARALLELISM/);
assert.match(runner, /bucket\.name === ISOLATED_BUCKET_NAME\s*\? await runIsolatedWithRetry/, "only isolated database regressions may use the retry scheduler");
assert.doesNotMatch(runner, /bucket\.name === ISOLATED_FILES_BUCKET_NAME\s*\? await runIsolatedWithRetry/, "Files regressions must not gain retry masking");
assertRoadmapCursorAtLeast("0.33.20", "the completed branch must advance to the Workbench/API performance branch");
assert.doesNotMatch(roadmap, /^### Version 0\.33\.19\.5\b/m, "the completed slice must leave the live roadmap");
assert.match(roadmapArchive, /^## Version 0\.33\.19\.5 - Files regression isolation and scheduling audit$/m);

console.log("Files regression isolation audit passed.");
