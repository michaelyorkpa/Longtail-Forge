import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../regression-suite.mjs";
import { createProjectTextReader } from "../test-support/source-scan.mjs";
import { WORKFLOW_MODULE_STATIC_CONSOLIDATION as consolidation } from "../workflow-module-static-consolidation.mjs";

const { readJson } = createProjectTextReader();

async function runWorkflowModuleStaticOwner(ownerMeta) {
  const contracts = consolidation.movements.filter((entry) => entry.retainedOwner === ownerMeta.id);
  const activeIds = new Set(REGRESSION_ENTRIES.map((entry) => entry.id));
  const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));
  const packageJson = readJson("package.json");
  const policy = readJson("scripts/regression-coverage-exceptions.json");
  const retirements = new Map(policy.retiredScripts.map((entry) => [entry.script, entry]));

  assert.equal(consolidation.schemaVersion, 1);
  assert.equal(consolidation.version, "0.33.33.10");
  assert.deepEqual(consolidation.before, { discoveredScripts: 424, sourceOwners: 61, movedAssertions: 1826 });
  assert.deepEqual(consolidation.after, { discoveredScripts: 370, tableDrivenOwners: 7 });
  assert.equal(REGRESSION_ENTRIES.length, consolidation.after.discoveredScripts);
  assert.equal(new Set(consolidation.movements.map((entry) => entry.id)).size, consolidation.movements.length);
  assert.equal(consolidation.movements.reduce((total, entry) => total + entry.assertionCount, 0), 1826);
  assert.ok(contracts.length > 0, `${ownerMeta.id} must own at least one source contract`);
  assert.ok(contracts.every((entry) => entry.family === ownerMeta.area));
  assert.ok(contracts.every((entry) => entry.description.length >= 24));

  for (const area of consolidation.areaCommands) {
    assert.equal(packageJson.scripts[`test:regressions:${area}`], `node scripts/run-regressions.mjs --area ${area}`);
  }
  for (const retained of consolidation.retainedMixedOwners) {
    assert.equal(activeIds.has(retained.id), true, `${retained.id} must remain independently runnable: ${retained.reason}`);
    assert.equal(activePaths.has(retained.path), true, `${retained.path} must stay active`);
  }
  for (const id of consolidation.retainedNotificationOwners) {
    assert.equal(activeIds.has(id), true, `${id} must retain Notifications behavior`);
  }
  for (const contract of contracts) {
    assert.equal(activePaths.has(contract.sourcePath), false, `${contract.sourcePath} must leave active discovery`);
    assert.equal(existsSync(contract.modulePath), true, `${contract.modulePath} must retain the assertion body`);
    const retirement = retirements.get(contract.sourcePath);
    assert.equal(retirement?.retiredInVersion, consolidation.version);
    assert.equal(retirement?.assertionInventory?.sourceAssertionCount, contract.assertionCount);
    assert.deepEqual(retirement?.retainedCoverageOwners, [ownerMeta.id]);
    await import(new URL(`../../${contract.modulePath}`, import.meta.url));
  }
  return Object.freeze({ contractCount: contracts.length, assertionCount: contracts.reduce((total, entry) => total + entry.assertionCount, 0) });
}

export { runWorkflowModuleStaticOwner };
