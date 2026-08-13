export const regressionMeta = Object.freeze({
  id: "time-tracking.current-static-contracts",
  area: "time-tracking",
  tier: "focused",
  tags: ["contracts", "time-tracking", "timer", "ui"],
  description: "Runs source-only Time Tracking entry-screen and timer-modal contracts through one table-driven owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { runWorkflowModuleStaticOwner } from "../../regression-contracts/workflow-module-static-owner.mjs";

const owner = Object.freeze({ id: "time-tracking.current-static-contracts", area: "time-tracking" });
const result = await runWorkflowModuleStaticOwner(owner);

assert.deepEqual(result, { contractCount: 2, assertionCount: 114 });
