import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
// Convention adopted from `tests/mutations/notes-link-editor.breaks.mjs` so both lanes match.
const sourcePath = "public/js/user-admin.js";
const suitePath = "tests/unit/user-admin-add-user-contracts.test.mjs";
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the checked lookup itself ---------------------------------------------------------------
  ["lookup stops checking the subtype",
    "return element instanceof constructor ? element : null;",
    "return /** @type {T} */ (element);"],
  ["lookup fabricates a stand-in control",
    "return element instanceof constructor ? element : null;",
    'return element instanceof constructor ? element : /** @type {T} */ (document.createElement("div"));'],
  ["required access stops refusing",
    "if (value === null) {\n      throw new TypeError(`User administration requires its ${name}.`);\n    }",
    "if (false) {\n      throw new TypeError(`User administration requires its ${name}.`);\n    }"],
  ["required access loses its named message",
    "throw new TypeError(`User administration requires its ${name}.`);",
    'throw new TypeError("Missing control.");'],

  // --- subtypes must match the template ---------------------------------------------------------
  ["a select is acquired as a plain element",
    'const newUserRoleSelect = findUserAdminControl("[data-new-user-role]", HTMLSelectElement);',
    'const newUserRoleSelect = findUserAdminControl("[data-new-user-role]", HTMLElement);'],
  ["the username input is acquired at the wrong subtype",
    'const newUserUsernameInput = findUserAdminControl("[data-new-user-username]", HTMLInputElement);',
    'const newUserUsernameInput = findUserAdminControl("[data-new-user-username]", HTMLTextAreaElement);'],
  ["a container is narrowed past what the template guarantees",
    'const newUserClientScopeField = findUserAdminControl("[data-new-user-client-scope-field]", HTMLElement);',
    'const newUserClientScopeField = findUserAdminControl("[data-new-user-client-scope-field]", HTMLLabelElement);'],
  ["a control reverts to an unchecked query",
    'const createUserButton = findUserAdminControl("[data-create-user]", HTMLButtonElement);',
    'const createUserButton = document.querySelector("[data-create-user]");'],

  // --- optional stays optional -------------------------------------------------------------------
  ["an optional binding is made required",
    'findUserAccountButton?.addEventListener("click", async () => {',
    'requireUserAdminValue(findUserAccountButton, "find-account button").addEventListener("click", async () => {'],
  ["a guarded status write is made required",
    "if (newUserAccountStatus) {\n      newUserAccountStatus.textContent = \"\";\n    }",
    'requireUserAdminValue(newUserAccountStatus, "account status").textContent = "";'],
  // Re-aimed twice as later children typed the controls it used to target, so it now anchors on
  // something stable: this flow's own form, with its checked acquisition replaced by a raw query.
  // That is exactly the rule under test - a required access may only target a checked control -
  // and it cannot be invalidated by another cluster being converted.
  ["a required access targets a control that was never checked",
    'requireUserAdminValue(userAdminForm, "add-user form").addEventListener("submit"',
    'requireUserAdminValue(document.querySelector("[data-user-admin-form]"), "add-user form").addEventListener("submit"'],

  // --- the readers this page already owned ---------------------------------------------------------
  ["the roles member reverts to an unchecked array",
    "addUserRoles = readRoleOptions(options);",
    "addUserRoles = Array.isArray(options.roles) ? options.roles : [];"],
  ["the workspaces member reverts to an unchecked array",
    "const availableWorkspaces = readAssignableWorkspaces(options) || [];",
    "const availableWorkspaces = Array.isArray(options.workspaces) ? options.workspaces : [];"],
  ["a malformed workspace list becomes a hard failure instead of an empty one",
    "const availableWorkspaces = readAssignableWorkspaces(options) || [];",
    "const availableWorkspaces = readAssignableWorkspaces(options);"],
  ["the envelope stops being narrowed by the page's own predicate",
    "const record = isResponseRecord(options) ? options : null;",
    "const record = options;"],
  ["an element check is dropped from a reader that asserts after it",
    "return body.workspaces.every(isAssignableWorkspace)",
    "return true"],

  // --- Add User behaviour ---------------------------------------------------------------------------
  ["the workspace select is disabled by permission instead of option count",
    "workspaceSelect.disabled = workspaceSelect.options.length < 2;",
    "workspaceSelect.disabled = !canCreateUsers;"],
  ["the username survives losing creation permission",
    'if (!canCreateUsers) {\n      usernameInput.value = "";\n    }',
    "if (false) {\n      usernameInput.value = \"\";\n    }"],
  ["the hidden sense is inverted on a scope field",
    'Boolean(requireUserAdminValue(newUserClientScopeField, "client scope field").hidden)',
    '!Boolean(requireUserAdminValue(newUserClientScopeField, "client scope field").hidden)'],
  ["the scope fields stop following the selected role",
    '.hidden = scopeType !== "client";',
    ".hidden = false;"],
  ["availability stops being re-applied after a scope change",
    "    if (scopeType === \"project\") {\n      projectScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));\n    }\n\n    applyUserCreationAvailability();",
    "    if (scopeType === \"project\") {\n      projectScopeSelect.replaceChildren(...scopes.map(createAddUserScopeOption));\n    }"],
  ["a stale account lookup is reused instead of re-run",
    "if (!accountLookup || accountLookup.username !== username || accountLookup.workspaceId !== workspaceId) {",
    "if (!accountLookup) {"],
  ["an already-active account is added again",
    "if (accountLookup?.match?.alreadyActive) {",
    "if (false) {"],
  ["the generated password panel shows with no password",
    '.hidden = !password;',
    ".hidden = false;"],
  ["the account lookup record drops the question it answered",
    "accountLookup = { match, username, workspaceId };",
    "accountLookup = { match, username: \"\", workspaceId };"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", suitePath], {
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
