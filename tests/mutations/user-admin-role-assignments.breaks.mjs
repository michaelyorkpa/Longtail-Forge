import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-admin.js";
const suites = [
  "tests/unit/user-admin-role-assignment-contracts.test.mjs",
  "tests/unit/user-admin-add-user-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the model is the outgoing payload, not the published record --------------------------------
  ["the slot claims the published assignment",
    "  /** @type {PendingRoleAssignment[]} */\n  let pendingRoleAssignments = [];",
    "  /** @type {BrowserRoleAssignment[]} */\n  let pendingRoleAssignments = [];"],
  ["a saved-only member is made required",
    "   *   assignment_id?: string,",
    "   *   assignment_id: string,"],
  ["a member every row carries is made optional",
    "   *   scope_type: string,",
    "   *   scope_type?: string,"],
  ["the overrides member claims a shape the server never promised",
    "   *   permission_overrides: unknown,",
    "   *   permission_overrides: PermissionOverrides,"],
  ["the locally built row starts carrying an assignment id",
    "    pendingRoleAssignments.push({\n      role_id: role.role_id,",
    '    pendingRoleAssignments.push({\n      assignment_id: "",\n      role_id: role.role_id,'],
  ["the locally built row drops a member the receiver reads",
    "      permission_overrides: clonePermissionOverrides(draftPermissionOverrides),\n    });",
    "    });"],
  ["the label reads the overrides without normalising them",
    "const overrides = normalizePermissionOverrides(assignment.permission_overrides);",
    "const overrides = assignment.permission_overrides || {};"],

  // --- the catalogues -----------------------------------------------------------------------------
  ["the roles slot loses its contract",
    "   * @type {BrowserRoleOption[]}\n   */\n  let roles = [];",
    "  let roles = [];"],
  ["the client scopes slot loses its contract",
    "   * @type {BrowserUserAdminClientScope[]}\n   */\n  let clients = [];",
    "  let clients = [];"],
  ["the role validator stops checking its scopes",
    "      && Array.isArray(value.scopes)\n      && value.scopes.every(isRoleScope)\n",
    "      && Array.isArray(value.scopes)\n"],
  ["the saved assignments bypass their reader",
    "pendingRoleAssignments = readRoleAssignments(body);",
    "pendingRoleAssignments = body.assignments;"],

  // --- the scope label ------------------------------------------------------------------------------
  ["the label demands the whole row",
    "   * @param {{ scope_type: string, scope_id: string | null }} assignment the two members this",
    "   * @param {PendingRoleAssignment} assignment the two members this"],
  ["the label stops treating an all scope id as global",
    'if (assignment.scope_type === "all" || assignment.scope_id === "all") {',
    'if (assignment.scope_type === "all") {'],
  ["an unresolvable client throws instead of labelling",
    'return clients.find((client) => client.id === assignment.scope_id)?.name || "Client";',
    "return clients.find((client) => client.id === assignment.scope_id).name;"],
  ["a project stops labelling through its client",
    "        return `${client.name} / ${project.name}`;",
    "        return project.name;"],

  // --- the four controls ------------------------------------------------------------------------------
  ["a select is acquired as a plain element",
    'const roleAssignmentScopeSelect = findUserAdminControl("[data-role-assignment-scope]", HTMLSelectElement);',
    'const roleAssignmentScopeSelect = findUserAdminControl("[data-role-assignment-scope]", HTMLElement);'],
  ["the assignment list reverts to an unchecked query",
    'const roleAssignmentList = findUserAdminControl("[data-role-assignment-list]", HTMLElement);',
    'const roleAssignmentList = document.querySelector("[data-role-assignment-list]");'],
  ["a bare binding stops naming its failure",
    'requireUserAdminValue(addRoleAssignmentButton, "add assignment button").addEventListener("click", addPendingRoleAssignment);',
    'addRoleAssignmentButton?.addEventListener("click", addPendingRoleAssignment);'],
  ["a required access targets a control that was never checked",
    'requireUserAdminValue(roleAssignmentRoleSelect, "role select").addEventListener("change", renderScopeOptions);',
    'requireUserAdminValue(document.querySelector("[data-role-assignment-role]"), "role select").addEventListener("change", renderScopeOptions);'],

  // --- behaviour ---------------------------------------------------------------------------------------
  ["the role refusal is dropped",
    "    if (!role) {\n      setUserAdminStatus(\"Choose a role before adding an assignment.\", true);\n      return;\n    }",
    "    if (false) {\n      setUserAdminStatus(\"Choose a role before adding an assignment.\", true);\n      return;\n    }"],
  ["the scope refusal stops exempting workspace scopes",
    'if (scopeType !== "workspace" && !scopeId) {',
    "if (!scopeId) {"],
  ["a duplicate assignment is allowed",
    "    if (alreadyAssigned) {",
    "    if (false) {"],
  ["the draft overrides are inherited by the next row",
    "    draftPermissionOverrides = createDefaultPermissionOverrides();\n    renderPendingRoleAssignments();\n    setUserAdminStatus(\"\");",
    '    renderPendingRoleAssignments();\n    setUserAdminStatus("");'],
  ["the scope select stops following the role",
    'scopeSelect.disabled = scopeType === "workspace" || scopeType === "global";',
    "scopeSelect.disabled = false;"],
  ["a per-row permission edit replaces the whole row",
    "            pendingRoleAssignments[index] = {\n              ...pendingRoleAssignments[index],\n              permission_overrides: overrides,\n            };",
    "            pendingRoleAssignments[index] = { permission_overrides: overrides };"],
  ["the empty state stops rendering",
    '      emptyItem.textContent = "No roles assigned.";\n', ""],
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
