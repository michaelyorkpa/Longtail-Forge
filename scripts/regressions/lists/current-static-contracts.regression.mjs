export const regressionMeta = Object.freeze({
  id: "lists.current-static-contracts",
  area: "lists",
  tier: "focused",
  tags: ["anatomy", "contracts", "lists", "workflow"],
  description: "Runs source-only Lists anatomy and workflow contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "lists.current-static-contracts", area: "lists" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 4, assertionCount: 149 });
