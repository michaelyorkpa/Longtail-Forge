export const regressionMeta = Object.freeze({
  id: "framework.security-static-contracts", area: "framework", tier: "release-gate",
  tags: ["authentication", "contracts", "guardrail", "security"],
  description: "Runs source-only authentication, identifier, Markdown-safety, and HTTP-error guardrails through one table-driven owner.", runMode: "static",
});
import assert from "node:assert/strict";
import { runDataFilesSecurityStaticOwner } from "../../regression-contracts/data-files-security-static-owner.mjs";
const result = await runDataFilesSecurityStaticOwner({ id: regressionMeta.id, family: "framework" });
assert.deepEqual(result, { contractCount: 4, assertionCount: 66 });
console.log("Current framework security static contracts passed.");
