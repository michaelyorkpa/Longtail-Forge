import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../regression-suite.mjs";
import { createProjectTextReader } from "../test-support/source-scan.mjs";
import { DATA_FILES_SECURITY_STATIC_CONSOLIDATION as consolidation } from "../data-files-security-static-consolidation.mjs";
import { measureRegressionEntries } from "../lib/regression-source-measure.mjs";

const { readJson, readText } = createProjectTextReader();
const historyReaderPattern = /(?:readText|readFile|readFileSync|readMarkdown)[\s\S]*?(?:ROADMAP-ARCHIVE|CHANGELOG)\.md/;

/** @typedef {import("../lib/regression-manifest.mjs").RetiredScript} RetiredScript */

/**
 * The retained table-driven owner invoking this module: its regression id and
 * the consolidation family whose source contracts it owns.
 * @typedef {{ family: string, id: string }} DataFilesSecurityOwnerMeta
 */

/** @param {DataFilesSecurityOwnerMeta} ownerMeta */
async function runDataFilesSecurityStaticOwner(ownerMeta) {
  const contracts = consolidation.movements.filter((entry) => entry.retainedOwner === ownerMeta.id);
  const activeIds = new Set(REGRESSION_ENTRIES.map((entry) => entry.id));
  const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));
  const packageJson = readJson("package.json");
  const policy = readJson("scripts/regression-coverage-exceptions.json");
  const staticAudit = readJson("scripts/regression-static-isolation-audit.json");
  const retirements = new Map(policy.retiredScripts.map((/** @type {RetiredScript} */ entry) => [entry.script, entry]));
  const activeStaticHistoryReaders = REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static" && historyReaderPattern.test(readText(entry.path))).length;

  assert.equal(consolidation.schemaVersion, 1);
  assert.equal(consolidation.version, "0.33.33.11");
  assert.deepEqual(consolidation.baseline, {
    discoveredScripts: 370, staticOwners: 143, effectiveAssertions: 18658,
    activeStaticHistoryReaders: 23, estimatedNodeProcesses: 364, activeOwnerLines: 104568,
    regressionWallSeconds: 110.6, regressionWallSource: "Nightly integration run 31664934753 at a577f4a1d91e",
  });
  assert.deepEqual(consolidation.selected, { sourceOwners: 26, assertions: 944, sourceLines: 2994 });
  assert.ok(REGRESSION_ENTRIES.length <= consolidation.expectedAfter.discoveredScripts, "later checkpoints may only reduce the 0.33.33.11 discovered estate");
  assert.ok(REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static").length <= consolidation.expectedAfter.staticOwners, "later checkpoints may only reduce static owners");
  assert.ok(policy.minimumAssertionCount >= consolidation.expectedAfter.effectiveAssertions, "the effective assertion floor may not fall below 0.33.33.11");
  assert.ok(activeStaticHistoryReaders <= consolidation.expectedAfter.activeStaticHistoryReaders, "later checkpoints may only reduce active history readers");
  assert.ok(REGRESSION_ENTRIES.length - staticAudit.execution.entries.length <= consolidation.expectedAfter.estimatedNodeProcesses, "later checkpoints may only reduce process estimates");
  // The physical active-owner line ceiling was retired at 0.33.33.30.8.
  //
  // It measured newline-delimited lines across discovered entrypoints, which
  // conflates estate growth — what consolidation reduces — with annotation
  // density, which full-strict conversion necessarily increases. It had
  // reached eight per-checkpoint allowances totalling 1,706 lines, it counted
  // the governance pin that keeps typed owners clean, and it had begun to
  // steer test placement rather than measure it. The 0.33.33.11 figures
  // remain above as historical consolidation evidence.
  //
  // Both measurements are now evidence rather than a gate. The structural
  // figure is what stays meaningful while annotations grow, and the ceiling
  // that replaced measurement with policy is gone rather than re-tuned.
  const measurement = measureRegressionEntries(REGRESSION_ENTRIES, readText);
  const evidence = consolidation.lineMeasurementEvidence;
  assert.equal(evidence.recordedAtCheckpoint, "0.33.33.30.8");
  assert.equal(evidence.physicalLines > 0 && evidence.structuralLines > 0, true, "recorded line evidence should carry both measurements");
  assert.ok(
    evidence.structuralLines < evidence.physicalLines,
    "structural lines must exclude comment-only and blank lines, so they cannot equal or exceed physical lines",
  );
  assert.ok(
    measurement.structuralLines < measurement.physicalLines,
    "the live estate must measure fewer structural than physical lines",
  );
  assert.equal(consolidation.movements.length, consolidation.selected.sourceOwners);
  assert.equal(consolidation.movements.reduce((total, entry) => total + /** @type {number} */ (entry.assertionCount), 0), consolidation.selected.assertions);
  assert.equal(new Set(consolidation.movements.map((entry) => entry.id)).size, consolidation.movements.length);
  assert.ok(contracts.length > 0, `${ownerMeta.id} must retain source contracts`);
  assert.ok(contracts.every((entry) => entry.family === ownerMeta.family));

  for (const area of consolidation.areaCommands) {
    assert.equal(packageJson.scripts[`test:regressions:${area}`], `node scripts/run-regressions.mjs --area ${area}`);
  }
  for (const id of [...consolidation.retainedBehavioralOwners, ...consolidation.retainedStaticOwners]) {
    assert.equal(activeIds.has(id), true, `${id} must remain independently runnable`);
  }
  for (const contract of contracts) {
    assert.equal(activePaths.has(/** @type {string} */ (contract.sourcePath)), false, `${contract.sourcePath} must leave active discovery`);
    assert.equal(existsSync(/** @type {string} */ (contract.modulePath)), true, `${contract.modulePath} must retain its assertion body`);
    const retirement = retirements.get(contract.sourcePath);
    assert.equal(retirement?.retiredInVersion, consolidation.version);
    assert.equal(retirement?.assertionInventory?.sourceAssertionCount, contract.assertionCount);
    if (contract.id === "database.repository-checked-passes") {
      assert.deepEqual(retirement?.retainedCoverageOwners, ["framework.full-strict-governance"]);
      assert.equal(retirement?.assertionInventory?.creditedAssertionReduction, 13);
    } else {
      assert.deepEqual(retirement?.retainedCoverageOwners, [ownerMeta.id]);
    }
    await import(/** @type {string} */ (/** @type {unknown} */ (new URL(`../../${contract.modulePath}`, import.meta.url))));
  }
  return Object.freeze({
    contractCount: contracts.length,
    assertionCount: contracts.reduce((total, entry) => total + /** @type {number} */ (entry.assertionCount), 0),
  });
}

export { runDataFilesSecurityStaticOwner };
