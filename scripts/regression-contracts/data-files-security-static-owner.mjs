import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../regression-suite.mjs";
import { createProjectTextReader } from "../test-support/source-scan.mjs";
import { DATA_FILES_SECURITY_STATIC_CONSOLIDATION as consolidation } from "../data-files-security-static-consolidation.mjs";

const { readJson, readText } = createProjectTextReader();
const historyReaderPattern = /(?:readText|readFile|readFileSync|readMarkdown)[\s\S]*?(?:ROADMAP-ARCHIVE|CHANGELOG)\.md/;

async function runDataFilesSecurityStaticOwner(ownerMeta) {
  const contracts = consolidation.movements.filter((entry) => entry.retainedOwner === ownerMeta.id);
  const activeIds = new Set(REGRESSION_ENTRIES.map((entry) => entry.id));
  const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));
  const packageJson = readJson("package.json");
  const policy = readJson("scripts/regression-coverage-exceptions.json");
  const staticAudit = readJson("scripts/regression-static-isolation-audit.json");
  const retirements = new Map(policy.retiredScripts.map((entry) => [entry.script, entry]));
  const activeOwnerLines = REGRESSION_ENTRIES.reduce((total, entry) => total + readText(entry.path).split(/\r?\n/).length - 1, 0);
  const activeStaticHistoryReaders = REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static" && historyReaderPattern.test(readText(entry.path))).length;

  assert.equal(consolidation.schemaVersion, 1);
  assert.equal(consolidation.version, "0.33.33.11");
  assert.deepEqual(consolidation.baseline, {
    discoveredScripts: 370, staticOwners: 143, effectiveAssertions: 18658,
    activeStaticHistoryReaders: 23, estimatedNodeProcesses: 364, activeOwnerLines: 104568,
    regressionWallSeconds: 110.6, regressionWallSource: "Nightly integration run 31664934753 at a577f4a1d91e",
  });
  assert.deepEqual(consolidation.selected, { sourceOwners: 26, assertions: 944, sourceLines: 2994 });
  assert.equal(REGRESSION_ENTRIES.length, consolidation.expectedAfter.discoveredScripts);
  assert.equal(REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static").length, consolidation.expectedAfter.staticOwners);
  assert.equal(policy.minimumAssertionCount, consolidation.expectedAfter.effectiveAssertions);
  assert.equal(activeStaticHistoryReaders, consolidation.expectedAfter.activeStaticHistoryReaders);
  assert.equal(REGRESSION_ENTRIES.length - staticAudit.execution.entries.length, consolidation.expectedAfter.estimatedNodeProcesses);
  assert.equal(activeOwnerLines, consolidation.expectedAfter.activeOwnerLines);
  assert.equal(consolidation.movements.length, consolidation.selected.sourceOwners);
  assert.equal(consolidation.movements.reduce((total, entry) => total + entry.assertionCount, 0), consolidation.selected.assertions);
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
    assert.equal(activePaths.has(contract.sourcePath), false, `${contract.sourcePath} must leave active discovery`);
    assert.equal(existsSync(contract.modulePath), true, `${contract.modulePath} must retain its assertion body`);
    const retirement = retirements.get(contract.sourcePath);
    assert.equal(retirement?.retiredInVersion, consolidation.version);
    assert.equal(retirement?.assertionInventory?.sourceAssertionCount, contract.assertionCount);
    assert.deepEqual(retirement?.retainedCoverageOwners, [ownerMeta.id]);
    await import(new URL(`../../${contract.modulePath}`, import.meta.url));
  }
  return Object.freeze({
    contractCount: contracts.length,
    assertionCount: contracts.reduce((total, entry) => total + entry.assertionCount, 0),
  });
}

export { runDataFilesSecurityStaticOwner };
