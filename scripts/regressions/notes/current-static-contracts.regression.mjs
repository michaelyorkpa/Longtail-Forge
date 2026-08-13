export const regressionMeta = Object.freeze({
  id: "notes.current-static-contracts",
  area: "notes",
  tier: "focused",
  tags: ["anatomy", "contracts", "notes", "workflow"],
  description: "Runs source-only Notes anatomy, context, files, and modal contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "notes.current-static-contracts", area: "notes" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 8, assertionCount: 226 });
