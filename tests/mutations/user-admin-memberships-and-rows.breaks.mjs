import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-admin.js";
const suites = [
  "tests/unit/user-admin-membership-row-contracts.test.mjs",
  "tests/unit/create-user-response-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the file-completion claims ------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const userList = findUserAdminControl("[data-user-list]", HTMLElement);',
    'const userList = document.querySelector("[data-user-list]");'],
  ["the membership list is narrowed past what the markup guarantees",
    'const workspaceMembershipList = findUserAdminControl("[data-workspace-membership-list]", HTMLElement);',
    'const workspaceMembershipList = findUserAdminControl("[data-workspace-membership-list]", HTMLUListElement);'],
  ["a cast is introduced to reach zero",
    'const userList = findUserAdminControl("[data-user-list]", HTMLElement);',
    'const userList = /** @type {HTMLElement} */ (document.querySelector("[data-user-list]"));'],
  ["a suppression is introduced to reach zero",
    "  function renderUserRows(users) {",
    "  // @ts-expect-error deliberately added\n  function renderUserRows(users) {"],
  ["a second lookup helper appears",
    "  function createTableCell(value) {",
    "  function findMembershipControl(selector) {\n    return document.querySelector(selector);\n  }\n\n  function createTableCell(value) {"],

  // --- the workspaces slot and its payload ------------------------------------------------------------
  ["the workspace slot loses its contract",
    "   * @type {BrowserAssignableWorkspace[]}\n   */\n  let workspaces = [];",
    "  let workspaces = [];"],
  ["the bootstrap stops refusing an unreadable workspace list",
    "      if (!clientScopes || !assignableWorkspaces",
    "      if (!clientScopes"],
  ["the workspace reader stops validating its elements",
    "    return body.workspaces.every(isAssignableWorkspace)",
    "    return true"],
  ["the sent memberships stop being declared as text",
    "   * @returns {string[]}\n   */\n  function readSelectedWorkspaceMemberships() {",
    "  function readSelectedWorkspaceMemberships() {"],
  ["a checkbox is read without narrowing",
    "      .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)",
    "      .filter((checkbox) => checkbox.checked)"],
  ["the sent identity stops coming from the vouched member",
    "      checkbox.dataset.workspaceMembership = workspace.workspaceId;",
    "      checkbox.dataset.workspaceMembership = workspace.workspaceName;"],
  ["the payload doc stops saying it is sent",
    "   * **This is sent**, as `workspaceMemberships` on the user update", "   * Read from the page"],

  // --- the owner-only flag -------------------------------------------------------------------------------
  ["the owner-only flag loses its boolean sense",
    'const isPersonalOwnerOnly = Boolean(workspace.workspaceType === "personal" &&',
    'const isPersonalOwnerOnly = (workspace.workspaceType === "personal" &&'],
  ["the owner-only comparison drops the current user",
    "        workspace.ownerUserId !== user?.user_id);",
    "        workspace.ownerUserId !== null);"],
  ["an owner-only workspace becomes selectable",
    "      checkbox.disabled = isPersonalOwnerOnly;",
    "      checkbox.disabled = false;"],
  ["an inactive membership counts as active",
    '      .filter((membership) => membership.status !== "inactive")',
    "      .filter(() => true)"],

  // --- the shared name formatter ---------------------------------------------------------------------------
  ["the shared name formatter loses its contract",
    "   * @param {BrowserAssignableWorkspace} workspace",
    "   * @param {unknown} workspace"],
  ["the record of why it could not be typed earlier is dropped",
    "   * Shared with the Add User flow", "   * Used here"],

  // --- the row actions ---------------------------------------------------------------------------------------
  ["the action envelope loses its callback type",
    "   * @param {{ url: string, method: string, successMessage: string, onSuccess?: (body: unknown) => void }} action\n   */\n",
    ""],
  ["the reset password borrows the create reader",
    '        const initialPassword = isResponseRecord(body) ? body.initialPassword : "";\n\n        showGeneratedPassword(typeof initialPassword === "string" ? initialPassword : "");',
    "        showGeneratedPassword(readUserCreation(body).initialPassword);"],
  ["the reset password reads the body unchecked again",
    '        const initialPassword = isResponseRecord(body) ? body.initialPassword : "";\n\n        showGeneratedPassword(typeof initialPassword === "string" ? initialPassword : "");',
    '        showGeneratedPassword(body.initialPassword || "");'],
  ["a row action loses the record it operates on",
    "  /** @param {BrowserUserRecord} user */\n  async function deleteUser(user) {",
    "  async function deleteUser(user) {"],
  ["delete stops asking for confirmation",
    "    if (!shouldDelete) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  // Anchored through the label above it: three confirmations in this file use `danger: true`.
  ["delete loses its danger styling",
    '      confirmLabel: "Delete",\n      cancelLabel: "Cancel",\n      danger: true,',
    '      confirmLabel: "Delete",\n      cancelLabel: "Cancel",\n      danger: false,'],
  ["the status toggle stops reading the record",
    '    if (user.userStatus === "inactive") {', "    if (false) {"],
  // Anchored through the line that follows it: four functions guard on a 401 the same way.
  ["the unauthenticated redirect is dropped from row actions",
    '      if (requireErrors().caughtStatus(error) === 401) {\n        window.location.replace("/login.html");\n        return;\n      }\n\n      setUserAdminStatus(requireErrors().caughtMessage(error, "User change was not saved."), true);',
    '      setUserAdminStatus(requireErrors().caughtMessage(error, "User change was not saved."), true);'],
  ["the callback stops running before the list repaints",
    "      onSuccess(body);\n      renderUsers(readUserRecords(body));",
    "      renderUsers(readUserRecords(body));\n      onSuccess(body);"],
  ["the empty user row loses its span",
    "      cell.colSpan = 4;", "      cell.colSpan = 1;"],
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
