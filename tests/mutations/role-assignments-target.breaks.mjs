import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/role-assignments.js";
const suites = ["tests/unit/role-assignments-target-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const roleSelect = findRoleControl("[data-delegated-role]", HTMLSelectElement);',
    'const roleSelect = document.querySelector("[data-delegated-role]");'],
  ["a control is narrowed past what the markup renders",
    'const assignmentList = findRoleControl("[data-delegated-role-list]", HTMLElement);',
    'const assignmentList = findRoleControl("[data-delegated-role-list]", HTMLInputElement);'],
  ["a cast replaces the checked lookup",
    'const targetSection = findRoleControl("[data-role-target]", HTMLElement);',
    'const targetSection = /** @type {HTMLElement} */ (document.querySelector("[data-role-target]"));'],
  // This cohort of five keeps its own status helper: `0.33.33.38.3.1` retired the idiom in
  // `workspace-settings.js` alone, and `workspace-deletion-dialog-dom-contracts` refuses a sweep.
  ["this cohort's status helper is swept away",
    '    return node && "hidden" in node ? /** @type {HTMLElement} */ (node) : null;',
    "    return node instanceof HTMLElement ? node : null;"],
  ["a second lookup helper appears",
    "  function renderTarget() {",
    "  function findRoleNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function renderTarget() {"],
  ["a suppression is introduced",
    "  function renderTarget() {",
    "  // @ts-expect-error deliberately added\n  function renderTarget() {"],
  ["the lookup stops checking the subtype",
    "    return element instanceof constructor ? element : null;",
    "    return element;"],
  ["the required narrowing stops refusing an absent control",
    "    if (value === null) {\n      throw new TypeError(`Role Assignments requires its ${name}.`);\n    }",
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],

  // --- the target surface ----------------------------------------------------------------------------
  ["the target surface stays hidden for a found account",
    "    section.hidden = false;",
    "    section.hidden = true;"],
  ["the heading stops preferring the display name",
    "    heading.textContent = target.displayName || target.username;",
    "    heading.textContent = target.username;"],
  ["the heading falls back to nothing instead of the username",
    "    heading.textContent = target.displayName || target.username;",
    '    heading.textContent = target.displayName || "";'],
  ["the account line shows the display name instead of the account",
    "    account.textContent = target.username;",
    "    account.textContent = target.displayName;"],
  ["the list is appended to rather than rebuilt",
    "    list.replaceChildren();",
    "    list.hidden = false;"],
  ["the empty state loses its message",
    '      message.textContent = "No delegable assignments are currently shown.";',
    '      message.textContent = "";'],
  ["an unnameable assignment stops falling back",
    '      roleLabel: role?.role_name || "Unavailable role",',
    "      roleLabel: role?.role_name || \"\","],
  ["the scope label stops falling back",
    '      scopeLabel: scope?.label || "Unavailable scope",',
    '      scopeLabel: scope?.label || "",'],
  ["the assignment label loses its scope",
    "        label.textContent = `${descriptor.roleLabel} — ${descriptor.scopeLabel}`;",
    "        label.textContent = `${descriptor.roleLabel}`;"],
  // **Aimed at the gate that decides the final state.** `0.33.33.44.19` mutated
  // `removeButton.disabled` inside `renderTarget` and found every aiming inert, then recorded that
  // as a fixture limit. It was not: `renderTarget` reaches `updateControls`, which rewrites
  // `disabled` on every button in the list, so the earlier assignment is always discarded. These
  // mutate the surviving expression instead.
  ["the Remove gate stops closing on a stale revision",
    "      button.disabled = busy || !hasRevision;",
    "      button.disabled = busy;"],
  ["the Remove gate stops closing while the page is busy",
    "      button.disabled = busy || !hasRevision;",
    "      button.disabled = !hasRevision;"],
  ["the Remove gate is inverted",
    "      button.disabled = busy || !hasRevision;",
    "      button.disabled = !busy && hasRevision;"],
  ["the rendered rows stop being re-gated on a later sync",
    '    requireRoleValue(assignmentList, "assignment list").querySelectorAll("button").forEach((button) => {\n      button.disabled = busy || !hasRevision;\n    });',
    "    void hasRevision;"],

  // --- the scope options --------------------------------------------------------------------------------
  ["the scope list stops following the selected role",
    "    (role?.scopes || []).forEach((scope) => {",
    "    [].forEach((scope) => {"],
  ["a still-offered scope selection is dropped on repaint",
    "    select.value = (role?.scopes || []).some((scope) => scope.scopeId === previousScopeId)",
    "    select.value = false"],
  ["a scope the role no longer offers is kept",
    "      ? previousScopeId\n      : role?.scopes?.[0]?.scopeId || \"\";",
    '      ? previousScopeId\n      : previousScopeId;'],
  ["the scope placeholder is dropped",
    '    select.replaceChildren(createOption("", "Choose a scope"));',
    "    select.replaceChildren();"],

  // --- the control gate -----------------------------------------------------------------------------------
  ["the lookup controls close with the assignment controls",
    '    requireRoleValue(findAccountButton, "find account button").disabled = busy;',
    '    requireRoleValue(findAccountButton, "find account button").disabled = busy || !hasTarget;'],
  ["the role control opens without an account",
    "    requireRoleValue(roleSelect, \"role select\").disabled = busy || !hasTarget || !hasRevision || roleOptions.length === 0;",
    '    requireRoleValue(roleSelect, "role select").disabled = busy;'],
  ["the scope control opens without a live revision",
    "    requireRoleValue(scopeSelect, \"scope select\").disabled = busy || !hasTarget || !hasRevision || !selectedRole();",
    '    requireRoleValue(scopeSelect, "scope select").disabled = busy || !hasTarget || !selectedRole();'],
  ["the add control opens without a complete assignment",
    "    requireRoleValue(addAssignmentButton, \"add assignment button\").disabled = busy || !hasTarget || !hasRevision || !selectedAssignment();",
    '    requireRoleValue(addAssignmentButton, "add assignment button").disabled = busy || !hasTarget || !hasRevision;'],
  ["a selection without a scope still makes an assignment",
    '    if (!role || !scopeId) return null;',
    "    if (!role) return null;"],
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
