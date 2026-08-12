export const regressionMeta = Object.freeze({
  id: "release.regression-discovery-runner",
  area: "release",
  tier: "release-gate",
  tags: ["discovery", "metadata", "release"],
  description: "Proves metadata-driven regression discovery preserves the legacy suite and safe execution modes.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createRegressionSuite,
  discoverRegressionEntries,
} from "../../lib/regression-discovery.mjs";
import { extractRegressionMeta } from "../../lib/regression-metadata.mjs";
import {
  filterRegressionBuckets,
  parseRegressionCliArgs,
} from "../../lib/regression-runner-options.mjs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

const legacySnapshot = JSON.parse(await fs.readFile("scripts/regression-legacy-snapshot.json", "utf8"));
const coveragePolicy = JSON.parse(await fs.readFile("scripts/regression-coverage-exceptions.json", "utf8"));
const discoveredPaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));

assert.ok(
  legacySnapshot.scripts.length <= coveragePolicy.legacyMetadataException.maximumScripts,
  "legacy discovery must stay at or below its shrink-only ceiling",
);
for (const entry of legacySnapshot.scripts) {
  assert.ok(discoveredPaths.has(entry.path), `${entry.path} must survive metadata discovery`);
}
assert.ok(
  discoveredPaths.has("scripts/regressions/release/regression-discovery-runner.regression.mjs"),
  "new convention-path regression should be auto-discovered without central suite registration",
);
assert.ok(REGRESSION_ENTRIES.length >= legacySnapshot.scripts.length, "discovery must be a legacy-suite superset");

const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-regression-discovery-"));

try {
  await fs.mkdir(path.join(rootDir, "scripts", "regressions", "tasks"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "scripts", "legacy-sample-regression.mjs"),
    "console.log(\"legacy fixture\");\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(rootDir, "scripts", "retired-unregistered-regression.mjs"),
    "console.log(\"retired fixture\");\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(rootDir, "scripts", "regressions", "tasks", "new-style.regression.mjs"),
    fixtureSource({
      area: "tasks",
      description: "Protects fixture discovery.",
      id: "tasks.fixture-discovery",
      runMode: "static",
      tags: ["fixture"],
      tier: "focused",
    }),
    "utf8",
  );

  const snapshot = {
    schemaVersion: 1,
    scripts: [{ path: "scripts/legacy-sample-regression.mjs", runMode: "serial-files" }],
  };
  const firstDiscovery = await discoverRegressionEntries({ legacySnapshot: snapshot, rootDir });
  const secondDiscovery = await discoverRegressionEntries({ legacySnapshot: snapshot, rootDir });

  assert.deepEqual(
    firstDiscovery.map((entry) => entry.path),
    [
      "scripts/legacy-sample-regression.mjs",
      "scripts/regressions/tasks/new-style.regression.mjs",
    ],
    "discovery should keep snapshot order, append convention paths deterministically, and ignore unregistered metadata-free legacy files",
  );
  assert.deepEqual(secondDiscovery, firstDiscovery, "discovery ordering and metadata should be deterministic");

  const fixtureSuite = createRegressionSuite(firstDiscovery);
  const tasksOnly = filterRegressionBuckets(fixtureSuite, { area: "tasks" });
  const fixtureTagOnly = filterRegressionBuckets(fixtureSuite, { tag: "fixture" });
  const focusedOnly = filterRegressionBuckets(fixtureSuite, { tier: "focused" });

  assert.deepEqual(tasksOnly.flatMap((bucket) => bucket.scripts), ["scripts/regressions/tasks/new-style.regression.mjs"]);
  assert.deepEqual(fixtureTagOnly.flatMap((bucket) => bucket.scripts), ["scripts/regressions/tasks/new-style.regression.mjs"]);
  assert.deepEqual(focusedOnly.flatMap((bucket) => bucket.scripts), ["scripts/regressions/tasks/new-style.regression.mjs"]);
  assert.deepEqual(
    fixtureSuite.find((bucket) => bucket.runMode === "serial-files").scripts,
    ["scripts/legacy-sample-regression.mjs"],
    "serial-only legacy regressions must retain their snapshotted run mode",
  );

  await fs.writeFile(
    path.join(rootDir, "scripts", "regressions", "tasks", "missing.regression.mjs"),
    "console.log(\"missing metadata\");\n",
    "utf8",
  );
  await assert.rejects(
    discoverRegressionEntries({ legacySnapshot: snapshot, rootDir }),
    /missing\.regression\.mjs is a new-style regression and must export regressionMeta/,
  );
  await fs.rm(path.join(rootDir, "scripts", "regressions", "tasks", "missing.regression.mjs"));

  await fs.writeFile(
    path.join(rootDir, "scripts", "regressions", "tasks", "invalid.regression.mjs"),
    fixtureSource({
      area: "notes",
      description: "Uses the wrong directory area.",
      id: "notes.invalid-area",
      runMode: "static",
      tags: [],
      tier: "focused",
    }),
    "utf8",
  );
  await assert.rejects(
    discoverRegressionEntries({ legacySnapshot: snapshot, rootDir }),
    /regressionMeta\.area must match convention directory tasks/,
  );
} finally {
  await fs.rm(rootDir, { force: true, recursive: true });
}

assert.throws(
  () => extractRegressionMeta(
    "export const regressionMeta = { id: \"release.invalid\", area: \"release\" };",
    "scripts/regressions/release/invalid.regression.mjs",
  ),
  /missing required field\(s\)/,
  "invalid metadata should fail with its missing fields",
);

assert.deepEqual(
  parseRegressionCliArgs(["--area", "release", "--tag", "metadata", "--tier", "release-gate", "--list"]),
  { area: "release", dryRun: false, list: true, tag: "metadata", tier: "release-gate" },
);
assert.throws(() => parseRegressionCliArgs(["--area", "unknown"]), /--area must be one of/);
assert.throws(() => parseRegressionCliArgs(["--tag", "Not Valid"]), /lowercase kebab-case/);

const nestedRunnerEnv = { ...process.env };
delete nestedRunnerEnv.LTF_REGRESSION_BUCKET;
delete nestedRunnerEnv.LTF_REGRESSION_REPEAT;
delete nestedRunnerEnv.LTF_REGRESSION_TIMING_JSON;

const listResult = spawnSync(process.execPath, ["scripts/run-regressions.mjs", "--area", "release", "--list"], {
  encoding: "utf8",
  env: nestedRunnerEnv,
});
assert.equal(listResult.status, 0, listResult.stderr);
assert.match(listResult.stdout, /release\.regression-discovery-runner/);
assert.match(listResult.stdout, /regression-discovery-runner\.regression\.mjs/);
assert.doesNotMatch(listResult.stdout, /scripts\/task-checklist-regression\.mjs/);

const dryRunResult = spawnSync(process.execPath, ["scripts/run-regressions.mjs", "--tag", "metadata", "--dry-run"], {
  encoding: "utf8",
  env: nestedRunnerEnv,
});
assert.equal(dryRunResult.status, 0, dryRunResult.stderr);
assert.match(dryRunResult.stdout, /Dry run: 1 regression script run\(s\) selected/);
assert.match(dryRunResult.stdout, /No regression scripts executed/);

console.log("Regression metadata and discovery runner passed.");

function fixtureSource(metadata) {
  return `export const regressionMeta = Object.freeze(${JSON.stringify(metadata, null, 2)});\n`;
}
