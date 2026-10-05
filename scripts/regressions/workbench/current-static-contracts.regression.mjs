export const regressionMeta = Object.freeze({
  id: "workbench.current-static-contracts",
  area: "workbench",
  tier: "focused",
  tags: ["contracts", "focus", "recovery", "workbench"],
  description: "Runs source-only Workbench focus, recovery, layout, and task-context contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "workbench.current-static-contracts", area: "workbench" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 17, assertionCount: 407 });
