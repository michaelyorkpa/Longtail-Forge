export const regressionMeta = Object.freeze({
  id: "views.current-static-contracts",
  area: "views",
  tier: "release-gate",
  tags: ["accessibility", "anatomy", "contracts", "guardrail", "settings", "views"],
  description: "Runs source-only view anatomy, accessibility, icon, renderer, and dashboard contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { FRAMEWORK_VIEW_STATIC_CONSOLIDATION as consolidation } from "../../framework-view-static-consolidation.mjs";

const ownerId = regressionMeta.id;
const contracts = consolidation.movements.filter((entry) => entry.retainedOwner === ownerId);
const activeIds = new Set(REGRESSION_ENTRIES.map((entry) => entry.id));
const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));

assert.equal(consolidation.schemaVersion, 1);
assert.equal(consolidation.version, "0.33.33.9");
assert.deepEqual(consolidation.before, { discoveredScripts: 456, sourceOwners: 34, movedAssertions: 1257 });
assert.deepEqual(consolidation.after, { discoveredScripts: 424, tableDrivenOwners: 2 });
assert.equal(contracts.length, 29);
assert.equal(contracts.reduce((total, entry) => total + entry.assertionCount, 0), 1008);
assert.equal(consolidation.movements.reduce((total, entry) => total + entry.assertionCount, 0), 1257);
assert.equal(new Set(contracts.map((entry) => entry.id)).size, contracts.length);
assert.equal(new Set(contracts.map((entry) => entry.exception.id)).size, contracts.length);
assert.ok(contracts.every((entry) => entry.exception.reason.length >= 24));

const fixture = await createDisposableDatabaseFixture("views-current-static-contracts");
try {
  for (const contract of contracts) {
    assert.equal(activePaths.has(contract.sourcePath), false, `${contract.sourcePath} must leave active discovery`);
    assert.equal(existsSync(contract.modulePath), true, `${contract.modulePath} must retain the assertion body`);
    // Node resolves a URL specifier by its href, so passing the serialized form
    // keeps the same module resolution while typing the dynamic import.
    await import(new URL("../../../" + contract.modulePath, import.meta.url).href);
  }
} finally {
  await fixture.cleanup();
}
for (const owner of consolidation.retainedBehavioralOwners) {
  assert.equal(activeIds.has(owner.id), true, `${owner.id} must stay independently runnable`);
}
for (const ownerPath of consolidation.retainedPlaywrightOwners) {
  assert.equal(existsSync(ownerPath), true, `${ownerPath} must stay separate`);
}

console.log("Current view static contracts passed.");
