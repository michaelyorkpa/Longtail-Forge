import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-admin.js";
const suites = [
  "tests/unit/user-admin-permission-matrix-contracts.test.mjs",
  "tests/unit/user-admin-add-user-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the normaliser must establish, not assume ------------------------------------------------
  ["the envelope is trusted instead of narrowed",
    "const source = isResponseRecord(overrides) ? overrides : {};",
    "const source = overrides;"],
  ["the operation map is trusted instead of narrowed",
    "const operationAccess = isResponseRecord(source.operationAccess) ? source.operationAccess : {};",
    "const operationAccess = source.operationAccess || {};"],
  ["a nested operation record is trusted",
    "Object.entries(isResponseRecord(operations) ? operations : {})",
    "Object.entries(operations || {})"],
  ["an operation value is copied rather than coerced",
    "normalized.operationAccess[resourceKey][operation] = allowed !== false;",
    "normalized.operationAccess[resourceKey][operation] = allowed;"],
  ["a flag is copied rather than coerced",
    "normalized.restrictBilling = Boolean(source.restrictBilling);",
    "normalized.restrictBilling = source.restrictBilling;"],
  ["an allowance stops requiring an explicit false",
    "normalized.allowManualTime = source.allowManualTime !== false;",
    "normalized.allowManualTime = Boolean(source.allowManualTime);"],
  ["the second pass reads the record without capturing it",
    "      const resourceAccess = operationAccess[resource.key];\n\n      if (!isResponseRecord(resourceAccess)) {\n        return;\n      }",
    "      const resourceAccess = operationAccess[resource.key] || {};"],
  // Re-aimed: guarding the assignment with `||` is runtime-inert, because the map is empty at
  // that point and every key is written exactly once. Skipping a resource is the real difference.
  ["the defaults stop covering the catalogue",
    "    const operationAccess = {};\n\n    permissionResources.forEach((resource) => {",
    "    const operationAccess = {};\n\n    permissionResources.slice(1).forEach((resource) => {"],
  ["a default operation starts denied",
    "        operations[operation] = true;",
    "        operations[operation] = false;"],

  // --- the model and the wire member ---------------------------------------------------------------
  ["the normaliser claims its input is already the model",
    "   * @param {unknown} [overrides] as the wire member carries it: unvalidated, and typed `unknown`",
    "   * @param {PermissionOverrides} [overrides] the wire member"],
  ["the model stops declaring a member",
    "   *   restrictBilling: boolean,\n", ""],
  ["the catalogue slot loses its contract",
    "   * @type {BrowserPermissionResource[]}\n   */\n  let permissionResources = [];",
    "  let permissionResources = [];"],
  ["a cast replaces the declared accumulator",
    "    /** @type {Record<string, Record<string, boolean>>} */\n    const operationAccess = {};",
    "    const operationAccess = /** @type {Record<string, Record<string, boolean>>} */ ({});"],

  // --- the six controls ------------------------------------------------------------------------------
  ["the permission dialog is acquired as a plain element",
    'const rolePermissionsDialog = findUserAdminControl("[data-role-permissions-dialog]", HTMLDialogElement);',
    'const rolePermissionsDialog = findUserAdminControl("[data-role-permissions-dialog]", HTMLElement);'],
  ["the matrix reverts to an unchecked query",
    'const permissionMatrix = findUserAdminControl("[data-permission-matrix]", HTMLElement);',
    'const permissionMatrix = document.querySelector("[data-permission-matrix]");'],
  ["a checkbox is read without narrowing",
    "      if (!(checkbox instanceof HTMLInputElement)) {\n        return;\n      }\n\n",
    ""],
  ["the standalone flag is read without narrowing",
    "overrides.restrictBilling = Boolean(billingFlag instanceof HTMLInputElement && billingFlag.checked);",
    "overrides.restrictBilling = Boolean(billingFlag?.checked);"],
  // Anchored on this cluster's own control rather than an unconverted one, so a later child
  // typing the session list cannot invalidate it.
  ["a required access targets a control that was never checked",
    'requireUserAdminValue(rolePermissionsForm, "permission form")',
    'requireUserAdminValue(document.querySelector("[data-role-permissions-form]"), "permission form")'],

  // --- behaviour ---------------------------------------------------------------------------------------
  ["the time allowances stop being mirrored into the matrix",
    "      normalized.operationAccess.time_entries.create = normalized.allowManualTime;",
    "      normalized.operationAccess.time_entries.create = true;"],
  ["the delete mirror is dropped",
    "      normalized.operationAccess.time_entries.delete = normalized.allowEditTime;\n", ""],
  ["the dialog target is not cleared on close",
    "    editingPermissionTarget = null;\n  }\n\n  function savePermissionDialog() {",
    "  }\n\n  function savePermissionDialog() {"],
  ["the callback receives the stale target instead of the matrix",
    "editingPermissionTarget.onSave(readPermissionMatrix());",
    "editingPermissionTarget.onSave(editingPermissionTarget.overrides);"],
  ["the incoming overrides reach the dialog unnormalised",
    "      overrides: normalizePermissionOverrides(overrides),",
    "      overrides,"],
  ["a rendered checkbox loses its resource dataset",
    "        checkbox.dataset.permissionResource = resource.key;\n", ""],
  ["the matrix stops deriving the edit allowance",
    'overrides.allowEditTime = getOperationAllowed(overrides, "time_entries", "update");',
    "overrides.allowEditTime = true;"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
