export const regressionMeta = Object.freeze({
  id: "tags.current-static-contracts",
  area: "tags",
  tier: "focused",
  tags: ["contracts", "tags", "ui", "workflow"],
  description: "Runs source-only Tags picker, management, record, and usability contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "tags.current-static-contracts", area: "tags" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 4, assertionCount: 106 });
