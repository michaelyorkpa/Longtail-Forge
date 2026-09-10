import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-admin.js";
// Both suites: the file-wide rule that a required access may only target a checked control lives
// in the Add User suite, and one break below exercises exactly that.
const suites = [
  "tests/unit/user-admin-edit-user-contracts.test.mjs",
  "tests/unit/user-admin-add-user-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the ten controls -----------------------------------------------------------------------
  ["the dialog is acquired as a plain element",
    'const editUserDialog = findUserAdminControl("[data-edit-user-dialog]", HTMLDialogElement);',
    'const editUserDialog = findUserAdminControl("[data-edit-user-dialog]", HTMLElement);'],
  ["the timezone select is acquired at the wrong subtype",
    'const editUserTimezoneSelect = findUserAdminControl("[data-edit-user-timezone]", HTMLSelectElement);',
    'const editUserTimezoneSelect = findUserAdminControl("[data-edit-user-timezone]", HTMLInputElement);'],
  ["a control reverts to an unchecked query",
    'const saveEditUserButton = findUserAdminControl("[data-save-edit-user]", HTMLButtonElement);',
    'const saveEditUserButton = document.querySelector("[data-save-edit-user]");'],
  ["a second lookup helper is introduced",
    "  function getEditingUser() {",
    "  function findEditUserControl(selector) {\n    return document.querySelector(selector);\n  }\n\n  function getEditingUser() {"],

  // --- required access, and what stays optional --------------------------------------------------
  ["a bare binding stops naming its failure",
    'requireUserAdminValue(cancelEditUserButton, "cancel button").addEventListener("click", closeEditUserDialog);',
    'cancelEditUserButton?.addEventListener("click", closeEditUserDialog);'],
  ["the focus target is optional-chained, turning a throw into a no-op",
    "(options.focusSessions ? refreshUserSessionsButton : usernameInput).focus();",
    "(options.focusSessions ? refreshUserSessionsButton : usernameInput)?.focus();"],
  ["a control from another cluster gains a required access",
    "  const userSessionList = document.querySelector(\"[data-user-session-list]\");",
    '  const userSessionList = requireUserAdminValue(document.querySelector("[data-user-session-list]"), "session list");'],

  // --- the validated slot ------------------------------------------------------------------------
  ["the users slot loses its record type",
    "  /** @type {BrowserUserRecord[]} */\n  let users = [];",
    "  let users = [];"],
  ["the renderer accepts an unchecked list",
    "  /** @param {BrowserUserRecord[]} nextUsers */\n  function renderUsers(nextUsers) {",
    "  function renderUsers(nextUsers) {"],
  ["a call site passes the body member instead of the checked reader",
    "      renderUsers(readUserRecords(body));\n      setUserAdminStatus(`Saved ${readUserRecord(body)?.username || username}.`);",
    "      renderUsers(body.users);\n      setUserAdminStatus(`Saved ${readUserRecord(body)?.username || username}.`);"],
  ["the record validator stops checking a member class",
    "      && USER_BOOLEAN_MEMBERS.every((member) => typeof value[member] === \"boolean\")\n",
    ""],
  ["the save response is read off the body directly",
    "readUserRecord(body)?.username || username",
    "body.user?.username || username"],
  ["the dialog account loses its declared record",
    "   * @param {BrowserUserRecord} user a record that reached `users` through `isUserRecord`",
    "   * @param {unknown} user"],

  // --- the declaration this child had to add outside its cluster ---------------------------------
  ["the memberships renderer stops admitting a null account",
    "   * @param {BrowserUserRecord | null | undefined} [user] the account being edited, or nothing",
    "   * @param {BrowserUserRecord} [user] the account being edited"],
  ["the memberships renderer is typed unknown instead of at its contract",
    "   * @param {BrowserUserWorkspaceMembership[]} memberships as `BrowserUserRecord` carries them",
    "   * @param {unknown[]} memberships"],
  ["the null call site is rewritten to suit the inference",
    "    renderWorkspaceMemberships([], null);",
    "    renderWorkspaceMemberships([]);"],

  // --- edit-dialog behaviour -----------------------------------------------------------------------
  ["the display-name fallback is dropped",
    "requireUserAdminValue(editUserDisplayNameInput, \"display name input\").value = user.displayName || user.username;",
    'requireUserAdminValue(editUserDisplayNameInput, "display name input").value = user.displayName;'],
  ["an unlisted timezone is dropped instead of appended",
    "    if (!matchingOption) {",
    "    if (false) {"],
  ["the save validation order is inverted",
    '    if (!user || !isValidEmail(username)) {\n      setUserAdminStatus("Enter a valid email address.", true);\n      return;\n    }\n\n    if (!displayName) {\n      setUserAdminStatus("Display name is required.", true);\n      return;\n    }',
    '    if (!displayName) {\n      setUserAdminStatus("Display name is required.", true);\n      return;\n    }\n\n    if (!user || !isValidEmail(username)) {\n      setUserAdminStatus("Enter a valid email address.", true);\n      return;\n    }'],
  // Anchored through the acquisition line: `0.33.33.44.8` gave the permission dialog the same
  // capture-then-check shape, so `if (dialog.open)` alone is no longer unique.
  ["the dialog is closed twice",
    '    const dialog = requireUserAdminValue(editUserDialog, "edit-user dialog");\n\n    if (dialog.open) {\n      dialog.close();\n    }',
    '    const dialog = requireUserAdminValue(editUserDialog, "edit-user dialog");\n\n    dialog.close();'],
  ["closing stops rendering the empty membership state",
    "    renderWorkspaceMemberships([], null);\n    renderManagedUserSessions([]);",
    "    renderManagedUserSessions([]);"],
  ["a cast replaces a control acquisition",
    'const editUserIdInput = findUserAdminControl("[data-edit-user-id]", HTMLInputElement);',
    'const editUserIdInput = /** @type {HTMLInputElement} */ (document.querySelector("[data-edit-user-id]"));'],
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
