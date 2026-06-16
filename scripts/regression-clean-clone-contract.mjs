import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const suitePath = "scripts/regression-clean-clone-contract.mjs";
const forbiddenLocalDocs = [
  ["DECISIONS", "md"],
  ["ROADMAP-ARCHIVE", "md"],
  ["CODEREVIEW", "md"],
  ["AGENTS", "md"],
  ["0.33.5.18", "md"],
  ["ui-upgrade", "md"],
  ["security-patches", "md"],
].map(([base, extension]) => `${base}.${extension}`);

for (const scriptPath of REGRESSION_SCRIPTS) {
  assert.ok(existsSync(scriptPath), `${scriptPath} should exist in clean clones`);

  if (scriptPath === suitePath) {
    continue;
  }

  const source = readFileSync(scriptPath, "utf8");
  for (const fileName of forbiddenLocalDocs) {
    assert.doesNotMatch(
      source,
      new RegExp(escapeRegExp(fileName)),
      `${scriptPath} should not depend on gitignored local bookkeeping file ${fileName}`,
    );
  }
}

console.log("Regression clean-clone contract passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
