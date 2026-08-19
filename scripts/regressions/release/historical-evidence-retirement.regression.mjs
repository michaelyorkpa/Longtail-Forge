export const regressionMeta = Object.freeze({
  id: "release.historical-evidence-retirement",
  area: "release",
  tier: "release-gate",
  tags: ["coverage", "history", "release"],
  description: "Proves historical closeout retirements have credited dispositions while live cursor, manifest, version, and command owners remain active.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** @typedef {import("../../lib/regression-manifest.mjs").RetiredScript} RetiredScript */

/**
 * Generated and recorded evidence rows this owner reads: one coverage-manifest
 * regression row and one historical closeout retirement.
 * @typedef {{ contractModules?: readonly { path: string }[], id: string, path: string, tags: readonly string[] }} ManifestRegression
 * @typedef {{ id: string }} HistoricalRetirement
 */

const evidence = readJson("scripts/historical-closeout-evidence.json");
const manifest = readJson("scripts/regression-coverage-manifest.json");
const policy = readJson("scripts/regression-coverage-exceptions.json");
const activeById = new Map(manifest.regressions.map((/** @type {ManifestRegression} */ entry) => [entry.id, entry]));
const creditedById = new Map(policy.retiredScripts.filter((/** @type {RetiredScript} */ entry) => entry.floorCredit === true).map((/** @type {RetiredScript} */ entry) => [entry.id, entry]));

assert.equal(evidence.version, "0.33.33.2");
assert.deepEqual(
  evidence.retirements.map((/** @type {HistoricalRetirement} */ { id }) => id).sort(),
  ["docs.short-term-cleanup-closeout", "legacy.static.contract.closeout", "release.maintainability-closeout", "release.typescript-seam-branch-closeout"],
);

for (const retirement of evidence.retirements) {
  assert.ok(!activeById.has(retirement.id), `${retirement.id} must no longer be discovered`);
  const credit = creditedById.get(retirement.id);
  assert.ok(credit, `${retirement.id} must have a credited retirement`);
  assert.equal(credit.script, retirement.path);
  assert.deepEqual(credit.retainedCoverageOwners, retirement.retainedOwners);
  assert.ok(retirement.liveFragments.length > 0, `${retirement.id} must record live-fragment disposition`);
  for (const owner of retirement.retainedOwners) {
    assert.ok(activeById.has(owner), `${retirement.id} retained owner ${owner} must remain active`);
  }
}

for (const id of evidence.retainedCloseoutOwners) {
  const entry = activeById.get(id);
  assert.ok(entry, `${id} must remain active`);
  const source = readFileSync(entry.path, "utf8");
  assert.doesNotMatch(source, /ROADMAP-ARCHIVE\.md|CHANGELOG\.md/, `${id} must not use archived roadmap or changelog history as product evidence`);
}

const activeCloseoutOwners = manifest.regressions
  .filter((/** @type {ManifestRegression} */ entry) => entry.tags.includes("closeout") || /closeout/i.test(entry.id) || /closeout/i.test(entry.path))
  .map((/** @type {ManifestRegression} */ entry) => entry.id)
  .sort();
assert.deepEqual(activeCloseoutOwners, [...evidence.retainedCloseoutOwners].sort(), "the evidence index must inventory every active closeout owner");

const pinBaseline = readJson("scripts/planning-document-pin-baseline.json");
assert.equal(pinBaseline.schemaVersion, 1);
assert.ok(pinBaseline.definition.maintenance.startsWith("Shrink-only."), "the pin baseline must document its shrink-only contract");
const historicalPinPattern = /ROADMAP-ARCHIVE\.md|CHANGELOG\.md/;
const planningReadPattern = /ROADMAP(?:-ARCHIVE)?\.md|CHANGELOG\.md/;
/** @type {string[]} */
const liveHistoricalPinners = [];
/** @type {string[]} */
const livePlanningReaders = [];
for (const entry of manifest.regressions) {
  if (entry.id === "release.historical-evidence-retirement") {
    continue;
  }
  const combinedSource = [entry.path, ...(entry.contractModules ?? []).map((/** @type {{ path: string }} */ moduleEntry) => moduleEntry.path)]
    .map((/** @type {string} */ sourcePath) => readFileSync(sourcePath, "utf8"))
    .join("\n");
  if (historicalPinPattern.test(combinedSource)) {
    liveHistoricalPinners.push(entry.id);
  }
  if (planningReadPattern.test(combinedSource)) {
    livePlanningReaders.push(entry.id);
  }
}
assert.deepEqual(
  liveHistoricalPinners.sort(),
  [...pinBaseline.historicalContentPinners].sort(),
  "historical ROADMAP-ARCHIVE/CHANGELOG pinners may only shrink: a new pinner must be stripped, and a stripped pinner must be removed from scripts/planning-document-pin-baseline.json in the same change",
);
assert.deepEqual(
  livePlanningReaders.sort(),
  [...pinBaseline.planningDocumentReaders].sort(),
  "planning-document readers may only shrink: a new reader must be removed, and a stripped reader must leave scripts/planning-document-pin-baseline.json in the same change",
);

const cursorOwner = readFileSync(activeById.get("release.roadmap-cursor-floor").path, "utf8");
assert.match(cursorOwner, /assertRoadmapCursorAtLeast/);
assert.match(cursorOwner, /No closeout regression may reintroduce exact cursor or next-section pins/);
assert.ok(activeById.has("release.regression-manifest-generation"));
assert.ok(activeById.has("release.closeout-conductor"));
assert.ok(activeById.has("release.validation-single-ownership"));
assert.equal(evidence.singleOwnership.packageScripts, "scripts/package-script-contracts.json via release.validation-single-ownership");

const archivedModules = new Set(evidence.archivedStaticModules);
assert.equal(archivedModules.size, 14);
for (const filePath of archivedModules) {
  assert.ok(policy.retiredScripts.some((/** @type {RetiredScript} */ entry) => entry.script === filePath), `${filePath} must remain registered as retired evidence`);
}

console.log("Historical closeout evidence retirement regression passed.");

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
