export const regressionMeta = Object.freeze({
  id: "release.regression-baseline-bypass-audit",
  area: "release",
  tier: "focused",
  tags: ["contract", "database", "migration", "regression", "static"],
  description: "Keeps every full-chain baseline bypass and nested runner-baseline opt-out explicit while rejecting accidental new environment deletion sites.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

/**
 * One recorded runner-baseline environment opt-out from
 * scripts/regression-baseline-bypass-audit.json.
 * @typedef {{ path: string, rationale: string }} RetainedEnvironmentOptOut
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const audit = JSON.parse(await fs.readFile(path.join(rootDir, "scripts/regression-baseline-bypass-audit.json"), "utf8"));
const foundOptOuts = [];

for (const scriptPath of await listMjsFiles(path.join(rootDir, "scripts"))) {
  const relativePath = path.relative(rootDir, scriptPath).replace(/\\/g, "/");
  if (relativePath === "scripts/test-support/database-fixture.mjs") continue;
  const source = await fs.readFile(scriptPath, "utf8");
  if (/delete\s+[\w.]+\.LTF_REGRESSION_BASELINE_DB\s*;/.test(source)) {
    foundOptOuts.push(relativePath);
  }
}

const auditedOptOuts = audit.retainedEnvironmentOptOuts.map((/** @type {RetainedEnvironmentOptOut} */ entry) => entry.path).sort();
assert.deepEqual(foundOptOuts.sort(), auditedOptOuts, "Runner-baseline environment opt-outs must match the checked-in rationale audit.");
for (const entry of audit.retainedEnvironmentOptOuts) {
  assert.ok(entry.rationale.length >= 40, `${entry.path} needs a substantive retained-opt-out rationale.`);
}

const entriesByPath = new Map(REGRESSION_ENTRIES.map((entry) => [entry.path, entry]));
for (const ownerPath of audit.fullChainOwners) {
  assert.ok(entriesByPath.get(ownerPath)?.tags.includes("baseline-bypass"), `${ownerPath} must retain baseline-bypass metadata.`);
}
for (const ownerPath of audit.customBootstrapOwners) {
  assert.ok(entriesByPath.get(ownerPath)?.tags.includes("baseline-bypass"), `${ownerPath} must retain custom-bootstrap baseline-bypass metadata.`);
}
const auditedBypassOwners = [...audit.fullChainOwners, ...audit.customBootstrapOwners].sort();
const discoveredBypassOwners = REGRESSION_ENTRIES
  .filter((entry) => entry.tags.includes("baseline-bypass"))
  .map((entry) => entry.path)
  .sort();
assert.deepEqual(discoveredBypassOwners, auditedBypassOwners, "Every baseline-bypass owner must be classified in the checked-in audit.");

console.log("Regression baseline bypass audit passed.");

/**
 * @param {string} directoryPath
 * @returns {Promise<string[]>}
 */
async function listMjsFiles(directoryPath) {
  const results = [];
  for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) results.push(...await listMjsFiles(entryPath));
    if (entry.isFile() && entry.name.endsWith(".mjs")) results.push(entryPath);
  }
  return results;
}
