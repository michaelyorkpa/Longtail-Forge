import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const suitePath = "scripts/regression-clean-clone-contract.mjs";
const requiredSupportFiles = [
  "scripts/runtime-database-foundation-closeout-regression.mjs",
  "scripts/database-agnostic-contract-closeout-regression.mjs",
  "scripts/module-file-closeout-regression.mjs",
  "scripts/notes-import-closeout-regression.mjs",
  "scripts/surface-standardization-closeout-regression.mjs",
  "scripts/view-builder-closeout-regression.mjs",
  "scripts/view-conversion-branch-closeout-regression.mjs",
  "scripts/files-browse-edit-preview-closeout-regression.mjs",
  "scripts/files-conversion-closeout-regression.mjs",
  "scripts/notes-slideout-closeout-regression.mjs",
  "scripts/markdown-closeout-regression.mjs",
  "scripts/tasks-conversion-closeout-regression.mjs",
  "scripts/clients-projects-strict-closeout-regression.mjs",
  "scripts/file-storage-scanner-runtime-closeout-regression.mjs",
  "scripts/regression-coverage-manifest.json",
  "scripts/test-support/regression-coverage-ratchet.mjs",
  "scripts/test-support/regression-runner-scheduler.mjs",
  "scripts/test-support/source-scan.mjs",
];
const forbiddenLocalDocs = [
  ["DECISIONS", "md"],
  ["ROADMAP-ARCHIVE", "md"],
  ["CODEREVIEW", "md"],
  ["AGENTS", "md"],
  ["0.33.5.18", "md"],
  ["ui-upgrade", "md"],
  ["security-patches", "md"],
].map(([base, extension]) => `${base}.${extension}`);

for (const supportPath of requiredSupportFiles) {
  assert.ok(existsSync(supportPath), `${supportPath} should exist in clean clones`);
  assertNoForbiddenLocalDocs(supportPath, readFileSync(supportPath, "utf8"));
}

for (const scriptPath of REGRESSION_SCRIPTS) {
  assert.ok(existsSync(scriptPath), `${scriptPath} should exist in clean clones`);

  if (scriptPath === suitePath) {
    continue;
  }

  const source = readFileSync(scriptPath, "utf8");
  assertNoForbiddenLocalDocs(scriptPath, source);
}

console.log("Regression clean-clone contract passed.");

function assertNoForbiddenLocalDocs(filePath, source) {
  for (const fileName of forbiddenLocalDocs) {
    assert.doesNotMatch(
      source,
      new RegExp(escapeRegExp(fileName)),
      `${filePath} should not depend on gitignored local bookkeeping file ${fileName}`,
    );
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
