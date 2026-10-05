export const regressionMeta = Object.freeze({
  id: "tasks.current-static-contracts",
  area: "tasks",
  tier: "focused",
  tags: ["contracts", "tasks", "ui", "workflow"],
  description: "Runs source-only Tasks list, editor, modal, relationship, and Workbench-handoff contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "tasks.current-static-contracts", area: "tasks" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 25, assertionCount: 783 });
