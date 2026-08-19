export const regressionMeta = Object.freeze({
  id: "framework.current-static-contracts",
  area: "framework",
  tier: "release-gate",
  tags: ["anatomy", "contracts", "guardrail", "reporting", "settings", "views"],
  description: "Runs source-only Settings and Reporting anatomy contracts through one table-driven framework owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";
import { FRAMEWORK_VIEW_STATIC_CONSOLIDATION as consolidation } from "../../framework-view-static-consolidation.mjs";

const ownerId = regressionMeta.id;
const contracts = consolidation.movements.filter((entry) => entry.retainedOwner === ownerId);
const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));

assert.equal(contracts.length, 5);
assert.equal(contracts.reduce((total, entry) => total + entry.assertionCount, 0), 249);
assert.equal(new Set(contracts.map((entry) => entry.id)).size, contracts.length);
assert.equal(new Set(contracts.map((entry) => entry.exception.id)).size, contracts.length);
assert.ok(contracts.every((entry) => entry.exception.reason.length >= 24));

for (const contract of contracts) {
  assert.equal(activePaths.has(contract.sourcePath), false, `${contract.sourcePath} must leave active discovery`);
  assert.equal(existsSync(contract.modulePath), true, `${contract.modulePath} must retain the assertion body`);
  // Node resolves a URL specifier by its href, so passing the serialized form
  // keeps the same module resolution while typing the dynamic import.
  await import(new URL("../../../" + contract.modulePath, import.meta.url).href);
}

console.log("Current framework static contracts passed.");
