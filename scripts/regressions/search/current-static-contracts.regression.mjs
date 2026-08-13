export const regressionMeta = Object.freeze({
  id: "search.current-static-contracts",
  area: "search",
  tier: "focused",
  tags: ["contracts", "results", "search"],
  description: "Runs the source-only Search results-page contract through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "search.current-static-contracts", area: "search" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 1, assertionCount: 41 });
