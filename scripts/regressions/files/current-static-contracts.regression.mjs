export const regressionMeta = Object.freeze({
  id: "files.current-static-contracts", area: "files", tier: "focused",
  tags: ["contracts", "files", "guardrail", "ui"],
  description: "Runs source-only Files anatomy, modal, attachment, and scanner-documentation contracts through one table-driven owner.", runMode: "static",
});
import assert from "node:assert/strict";
import { runDataFilesSecurityStaticOwner } from "../../regression-contracts/data-files-security-static-owner.mjs";
const result = await runDataFilesSecurityStaticOwner({ id: regressionMeta.id, family: "files" });
assert.deepEqual(result, { contractCount: 13, assertionCount: 621 });
console.log("Current Files static contracts passed.");
