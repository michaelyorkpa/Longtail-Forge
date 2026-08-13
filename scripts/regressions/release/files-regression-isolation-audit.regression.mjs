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
import { createStaticRegressionExecutionPlan } from "../../lib/static-regression-execution.mjs";
import { DATA_FILES_SECURITY_STATIC_CONSOLIDATION } from "../../data-files-security-static-consolidation.mjs";

const audit = JSON.parse(readFileSync("scripts/regression-files-isolation-audit.json", "utf8"));
const staticAudit = JSON.parse(readFileSync("scripts/regression-static-isolation-audit.json", "utf8"));
const legacySnapshot = JSON.parse(readFileSync("scripts/regression-legacy-snapshot.json", "utf8"));
const runner = readFileSync("scripts/run-regressions.mjs", "utf8");
const staticExecution = readFileSync("scripts/lib/static-regression-execution.mjs", "utf8");
const scheduler = readFileSync("scripts/test-support/regression-runner-scheduler.mjs", "utf8");
const dimensions = [
  "database",
  "fileStorageRoot",
  "scanner",
  "networkPort",
  "environment",
  "workerOrChildProcess",
  "singletonRuntime",
];
const legacyPaths = new Set(legacySnapshot.scripts.map((entry) => entry.path));
const staticAuditPaths = new Set(staticAudit.entries.map((entry) => entry.path));
const consolidatedSourcePaths = new Map(DATA_FILES_SECURITY_STATIC_CONSOLIDATION.movements.map((entry) => [entry.sourcePath, entry]));
const activeEntryFor = (sourcePath) => {
  const movement = consolidatedSourcePaths.get(sourcePath);
  const activePath = movement
    ? REGRESSION_ENTRIES.find((entry) => entry.id === movement.retainedOwner)?.path
    : sourcePath;
  return REGRESSION_ENTRIES.find((entry) => entry.path === activePath);
};

assert.equal(audit.schemaVersion, 1);
assert.equal(audit.sourceRunMode, "serial-files");
assert.equal(audit.parallelRunMode, "isolated-files");
assert.deepEqual(audit.resourceDimensions, dimensions);
assert.equal(new Set(audit.entries.map((entry) => entry.path)).size, 29);
assert.equal(audit.entries.filter((entry) => !legacyPaths.has(entry.path)).length, 1, "only the consolidated scanner documentation owner may leave the historical Files audit snapshot");
assert.equal(consolidatedSourcePaths.has("scripts/file-scanner-setup-docs-regression.mjs"), true);

for (const entry of audit.entries) {
  assert.ok(["serial-files", "isolated-files"].includes(entry.decision), `${entry.path} must have an allowed scheduling decision`);
  assert.deepEqual(Object.keys(entry.resources), dimensions, `${entry.path} must classify every mutable resource dimension`);
  assert.ok(entry.rationale.length >= 40, `${entry.path} must retain a script-specific scheduling rationale`);
  const consolidated = consolidatedSourcePaths.has(entry.path);
  assert.equal(
    activeEntryFor(entry.path)?.runMode,
    consolidated || staticAuditPaths.has(entry.path) ? "static" : entry.decision,
    `${entry.path} discovery mode must match the latest audited decision`,
  );
}

const moved = audit.entries.filter((entry) => entry.decision === "isolated-files");
const retained = audit.entries.filter((entry) => entry.decision === "serial-files");
const currentlySerial = retained.filter((entry) => activeEntryFor(entry.path)?.runMode === "serial-files");
assert.equal(moved.length, 28, "every stateful Files entry has complete per-process resource isolation and may run with isolated scheduling");
assert.equal(retained.length, 1, "the original serial inventory should retain the separately reclassified scanner documentation owner");
assert.equal(currentlySerial.length, 0, "no stateful Files entry should remain serial after source audit and bounded stress");

const serialBucket = REGRESSION_BUCKETS.find((bucket) => bucket.runMode === "serial-files");
const isolatedFilesBucket = REGRESSION_BUCKETS.find((bucket) => bucket.runMode === "isolated-files");
assert.equal(serialBucket.mode, "serial");
assert.equal(serialBucket.concurrency, 1);
assert.deepEqual(serialBucket.scripts.toSorted(), currentlySerial.map((entry) => entry.path).sort());
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
assert.equal(audit.measurements.quickWins20260731.scripts, 28);
assert.equal(audit.measurements.quickWins20260731.serialScripts, 0);
assert.equal(audit.measurements.quickWins20260731.isolatedScripts, 28);
assert.equal(audit.measurements.quickWins20260731.isolatedConcurrency, 6);
assert.equal(audit.measurements.quickWins20260731.stressPasses, 3);
assert.equal(audit.measurements.quickWins20260731.stressScriptRuns, 84);
assert.equal(audit.measurements.quickWins20260731.failures, 0);
assert.equal(audit.measurements.quickWins20260731.recoveredFlakes, 0);
assert.ok(audit.measurements.quickWins20260731.stressWallSeconds > 0);
assert.ok(audit.measurements.quickWins20260731.familyWallSeconds < audit.measurements.postChange.wallSeconds);

const expectedStaticMoves = [
  "scripts/help-markdown-source-layout-regression.mjs",
  "scripts/regressions/database/private-calendar-subscriptions-migration.regression.mjs",
];
const staticDimensions = [
  "database",
  "fileSystem",
  "networkPort",
  "process",
  "scanner",
  "environment",
  "singletonRuntime",
];
const staticExecutionDimensions = [
  "environment",
  "globalState",
  "timers",
  "listeners",
  "cache",
  "process",
  "fileSystem",
];
assert.equal(staticAudit.schemaVersion, 1);
assert.equal(staticAudit.targetRunMode, "static");
assert.deepEqual(staticAudit.resourceDimensions, staticDimensions);
assert.equal(staticAudit.measurements.concurrency, 8);
assert.equal(staticAudit.measurements.passes, 3);
assert.equal(staticAudit.measurements.scriptRuns, 651);
assert.equal(staticAudit.measurements.failures, 0);
assert.equal(staticAudit.measurements.recoveredFlakes, 0);
assert.ok(staticAudit.measurements.wallSeconds > 0);
assert.equal(staticAudit.fullSuiteMeasurements.baseline.scripts, 424);
assert.equal(staticAudit.fullSuiteMeasurements.baseline.failures, 0);
assert.equal(staticAudit.fullSuiteMeasurements.postChange.length, 2);
for (const measurement of staticAudit.fullSuiteMeasurements.postChange) {
  assert.equal(measurement.scripts, staticAudit.fullSuiteMeasurements.baseline.scripts);
  assert.equal(measurement.failures, 0);
  assert.equal(measurement.recoveredFlakes, 0);
  assert.ok(measurement.wallSeconds < staticAudit.fullSuiteMeasurements.baseline.wallSeconds);
}
assert.deepEqual(staticAudit.entries.map((entry) => entry.path).sort(), expectedStaticMoves);
for (const entry of staticAudit.entries) {
  assert.equal(entry.decision, "static");
  assert.ok(["isolated-database", "serial-files"].includes(entry.sourceRunMode));
  assert.deepEqual(Object.keys(entry.resources), staticDimensions);
  assert.ok(entry.rationale.length >= 80);
  assert.equal(REGRESSION_ENTRIES.find((candidate) => candidate.path === entry.path)?.runMode, "static");
}
assert.equal(staticAudit.execution.schemaVersion, 1);
assert.equal(staticAudit.execution.defaultDecision, "child-process");
assert.deepEqual(staticAudit.execution.resourceDimensions, staticExecutionDimensions);
assert.deepEqual(Object.keys(staticAudit.execution.defaultResources), staticExecutionDimensions);
assert.equal(staticAudit.execution.entries.length, 6);
for (const entry of staticAudit.execution.entries) {
  assert.ok(["worker-parallel", "worker-sequential"].includes(entry.decision));
  assert.equal(entry.fallback, "child-process");
  assert.deepEqual(Object.keys(entry.resources), staticExecutionDimensions);
  assert.ok(entry.rationale.length >= 80);
  assert.equal(REGRESSION_ENTRIES.find((candidate) => candidate.path === entry.path)?.runMode, "static");
}
assert.equal(staticAudit.execution.entries.filter((entry) => entry.decision === "worker-sequential").length, 1);
assert.equal(staticAudit.execution.measurements.certifiedWorkers, staticAudit.execution.entries.length);
assert.equal(staticAudit.execution.measurements.fullRuns.length, 3);
for (const measurement of staticAudit.execution.measurements.fullRuns) {
  assert.equal(measurement.failures, 0);
  assert.equal(measurement.recoveredFlakes, 0);
  assert.ok(measurement.wallSeconds > 0);
}
const staticExecutionPlan = createStaticRegressionExecutionPlan({ audit: staticAudit, entries: REGRESSION_ENTRIES, env: {} });
const discoveredStaticEntries = REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static");
assert.equal(staticExecutionPlan.decisions.size, discoveredStaticEntries.length, "every static owner must receive an audited worker or explicit child-process fallback decision");
assert.equal(staticExecutionPlan.workerCount, staticAudit.execution.entries.length);
assert.equal(staticExecutionPlan.fallbackCount, discoveredStaticEntries.length - staticAudit.execution.entries.length);
for (const entry of discoveredStaticEntries) {
  const decision = staticExecutionPlan.decisions.get(entry.path);
  assert.ok(decision, `${entry.path} must have an execution decision`);
  assert.equal(decision.fallback, "child-process");
  assert.deepEqual(Object.keys(decision.resources), staticExecutionDimensions);
}

assert.match(runner, /ISOLATED_FILES_BUCKET_NAME = "isolated file storage regressions"/);
assert.match(runner, /resolveIsolatedFilesParallelism/);
assert.match(staticExecution, /LTF_STATIC_EXECUTION_MODE/);
assert.match(runner, /staticDecision\?\.decision === "worker-parallel"/);
assert.match(runner, /staticDecision\?\.decision === "worker-sequential"/);
assert.match(runner, /executionMode: "worker"/);
assert.match(scheduler, /LTF_ISOLATED_FILES_PARALLELISM/);
assert.match(runner, /bucket\.name === ISOLATED_BUCKET_NAME\s*\? await runIsolatedWithRetry/, "only isolated database regressions may use the retry scheduler");
assert.doesNotMatch(runner, /bucket\.name === ISOLATED_FILES_BUCKET_NAME\s*\? await runIsolatedWithRetry/, "Files regressions must not gain retry masking");
assertRoadmapCursorAtLeast("0.33.20", "the completed branch must advance to the Workbench/API performance branch");

console.log("Files regression isolation audit passed.");
