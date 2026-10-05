export const regressionMeta = Object.freeze({
  id: "permissions.current-static-contracts", area: "permissions", tier: "focused",
  tags: ["accessibility", "contracts", "permissions", "views"],
  description: "Runs source-only permission-scoping and accessible-icon contracts through one table-driven owner.", runMode: "static",
});
import assert from "node:assert/strict";
import { runDataFilesSecurityStaticOwner } from "../../regression-contracts/data-files-security-static-owner.mjs";
const result = await runDataFilesSecurityStaticOwner({ id: regressionMeta.id, family: "permissions" });
assert.deepEqual(result, { contractCount: 2, assertionCount: 35 });
console.log("Current permissions static contracts passed.");
