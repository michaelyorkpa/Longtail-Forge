export const regressionMeta = Object.freeze({
  id: "database.current-static-contracts", area: "database", tier: "release-gate",
  tags: ["contracts", "database", "guardrail", "repositories"],
  description: "Runs source-only database, binding, repository, and data guardrails through one table-driven owner.", runMode: "static",
});
import assert from "node:assert/strict";
import { runDataFilesSecurityStaticOwner } from "../../regression-contracts/data-files-security-static-owner.mjs";
const result = await runDataFilesSecurityStaticOwner({ id: regressionMeta.id, family: "database" });
assert.deepEqual(result, { contractCount: 7, assertionCount: 222 });
console.log("Current database static contracts passed.");
