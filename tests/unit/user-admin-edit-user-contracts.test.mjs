import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's edit-user dialog, typed by `0.33.33.44.7`.
 *
 * **One dialog, so one boundary.** Opening it for an account, writing that account into the
 * controls, saving the edit, and closing it. Ten controls serve exactly that; role assignments,
 * the permission matrix, workspace memberships, managed sessions and the user-row actions are
 * not touched, and what remains of this file belongs to them.
 *
 * **The response half was already sound, and this child verified that rather than redoing it.**
 * `saveEditedUser` reads its body through `readUserRecords` and `readUserRecord`, both of which
 * run `isUserRecord` - text members, boolean members, nullable text, a non-empty `user_id` and
 * readable memberships. That is what makes typing the `users` slot honest instead of asserted,
 * which is the `0.33.33.44.6` lesson applied rather than repeated.
 */

const page = readFileSync(new URL("../../public/js/user-admin.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const markup = readFileSync(new URL("../../views/protected/user-admin.html", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/**
 * The JSDoc block immediately above a declaration.
 * @param {string} opener
 */
function docFor(opener) {
  const at = page.indexOf(opener);
  assert.notEqual(at, -1, opener + " must exist");
  return page.slice(page.lastIndexOf("/**", at), at);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/**
 * The tag the server template renders for one control, matched on the complete attribute.
 * @param {string} dataset
 */
function renderedTag(dataset) {
  const at = markup.search(new RegExp(`data-${dataset}(?=[\\s=>])`));
  assert.notEqual(at, -1, dataset + " must appear in the rendered markup");
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open, at));
  assert.ok(tag, dataset + " must sit on an element");
  return tag[1];
}

/** dataset suffix -> [slot, constructor, rendered tag] */
const CONTROLS = [
  ["edit-user-dialog", "editUserDialog", "HTMLDialogElement", "dialog"],
  ["edit-user-form", "editUserForm", "HTMLFormElement", "form"],
  ["edit-user-id", "editUserIdInput", "HTMLInputElement", "input"],
  ["edit-user-username", "editUserUsernameInput", "HTMLInputElement", "input"],
  ["edit-user-display-name", "editUserDisplayNameInput", "HTMLInputElement", "input"],
  ["edit-user-alt-email", "editUserAltEmailInput", "HTMLInputElement", "input"],
  ["edit-user-timezone", "editUserTimezoneSelect", "HTMLSelectElement", "select"],
  ["cancel-edit-user", "cancelEditUserButton", "HTMLButtonElement", "button"],
  ["reset-edit-user-password", "resetEditUserPasswordButton", "HTMLButtonElement", "button"],
  ["save-edit-user", "saveEditUserButton", "HTMLButtonElement", "button"],
];

describe("the ten dialog controls, checked against the tags the template renders", () => {
  it("matches the markup for every one", () => {
    for (const [dataset, , , tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
    }
  });

  it("acquires each through the helper `0.33.33.44.5` already added", () => {
    for (const [dataset, slot, constructor] of CONTROLS) {
      assert.ok(page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`);
    }
    // No second lookup helper: this child reuses the two that exist.
    assert.equal([...page.matchAll(/function findUserAdminControl\(/g)].length, 1);
    assert.equal([...page.matchAll(/function requireUserAdminValue\(/g)].length, 1);
    assert.ok(!/function (find|require)(EditUser|Dialog)\w*\(/.test(page), "and adds none of its own");
  });

  it("narrows the dialog to the subtype its behaviour needs", () => {
    // `showModal`, `open` and `close` are why this one is `HTMLDialogElement` and not `HTMLElement`.
    // Two forms, because opening requires the control inline and closing captures it first.
    assert.match(executable, /requireUserAdminValue\(editUserDialog, "edit-user dialog"\)\.showModal\(\);/);
    const closing = slice("  function closeEditUserDialog() {");
    assert.match(closing, /const dialog = requireUserAdminValue\(editUserDialog, "edit-user dialog"\);/);
    assert.match(closing, /dialog\.open/);
    assert.match(closing, /dialog\.close\(\);/);
  });
});

describe("presence is settled where the page already dereferenced", () => {
  it("requires only this dialog's own controls inside this dialog's own functions", () => {
    // The file-wide rule - a required access may only target a control acquired through the
    // checked lookup - lives in the Add User suite. This is the narrower claim this child owns.
    const slots = new Set(CONTROLS.map(([, slot]) => slot));
    for (const opener of [
      "  async function openEditUserDialog(user, options = {}) {",
      "  async function saveEditedUser() {",
      "  function closeEditUserDialog() {",
      "  function setEditUserTimezoneValue(timezone) {",
      "  function getEditingUser() {",
    ]) {
      const body = slice(opener).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      for (const [, argument] of body.matchAll(/requireUserAdminValue\(([^,]+),/g)) {
        // `refreshUserSessionsButton` is the one legitimate exception: the focus target is a
        // union that genuinely spans two clusters, and `0.33.33.44.10` typed the sessions half.
        assert.ok(slots.has(argument.trim()) || argument.trim() === "refreshUserSessionsButton",
          `${argument.trim()} in ${opener.trim()} is not one of this dialog's ten controls`);
      }
    }
  });

  it("keeps the three bare bindings bare, and names their failure", () => {
    // Each threw at module evaluation when its control was absent before this change and still
    // does; only the message moves.
    assert.match(executable, /requireUserAdminValue\(editUserForm, "edit-user form"\)\.addEventListener\("submit"/);
    assert.match(executable, /requireUserAdminValue\(cancelEditUserButton, "cancel button"\)\.addEventListener\("click"/);
    assert.match(executable, /requireUserAdminValue\(resetEditUserPasswordButton, "reset-password button"\)\.addEventListener\("click"/);
  });

  it("has both halves of the focus target typed, now that sessions landed", () => {
    // `0.33.33.44.7` left this a union it could not resolve, because the sessions half was a bare
    // query owned by a later child. `0.33.33.44.10` is that child, so this case now asserts the
    // closure rather than the deferral - and the throw-on-absent behaviour is still unchanged.
    const body = slice("  async function openEditUserDialog(user, options = {}) {");
    assert.match(body, /\(options\.focusSessions\s*\n\s*\? requireUserAdminValue\(refreshUserSessionsButton, "refresh sessions button"\)\s*\n\s*: usernameInput\)\.focus\(\);/);
    assert.ok(!/refreshUserSessionsButton\?\./.test(executable),
      "optional chaining would have turned that throw into a silent no-op");
  });
});

describe("the record this dialog edits is typed from a validated slot", () => {
  it("declares the dialog's account at the published record", () => {
    assert.match(docFor("  async function openEditUserDialog(user, options = {}) {"),
      /@param \{BrowserUserRecord\} user/);
    assert.match(docFor("  async function openEditUserDialog(user, options = {}) {"),
      /@param \{\{ focusSessions\?: boolean \}\} \[options\]/);
    assert.ok(contracts.includes("export interface BrowserUserRecord {"));
  });

  it("types the slot that feeds it, so the claim is checked rather than asserted", () => {
    // This is the `0.33.33.44.6` lesson: a declared member type means nothing unless something
    // establishes it. Here the compiler does, because `renderUsers` is declared and every caller
    // must satisfy it.
    assert.match(page, /\/\*\* @type \{BrowserUserRecord\[\]\} \*\/\s*\n\s*let users = \[\];/);
    assert.match(docFor("  function renderUsers(nextUsers) {"), /@param \{BrowserUserRecord\[\]\} nextUsers/);
    assert.match(slice("  function renderUsers(nextUsers) {"),
      /users = Array\.isArray\(nextUsers\) \? nextUsers : \[\];/,
      "and the slot is still written exactly once, from that parameter");
  });

  it("proves every path into that slot runs the record validator", () => {
    // The four call sites, each reading through a checked reader rather than a bare member.
    // The declaration matches this shape too, so it is excluded by name rather than by position.
    const callArguments = [...executable.matchAll(/(?<!function )renderUsers\(([^)]*)\)/g)]
      .map((entry) => entry[1].trim()).filter((argument) => argument !== "nextUsers");
    assert.deepEqual(callArguments.sort(),
      ["created.users", "readUserRecords(body", "readUserRecords(body", "userList.users"],
      "no call site passes an unchecked list");
    assert.match(slice("  function readUserRecords(body) {"), /\.filter\(isUserRecord\)/);
    assert.match(slice("  function readUserListResponse(body) {"), /users\.every\(isUserRecord\)/);
    assert.match(slice("  function readUserCreation(body) {"), /users: readUserRecords\(body\)/);
    const validator = slice("  function isUserRecord(value) {");
    for (const check of ["USER_TEXT_MEMBERS.every", "USER_BOOLEAN_MEMBERS.every",
      "USER_NULLABLE_TEXT_MEMBERS.every", 'value.user_id !== ""', "hasReadableWorkspaceMemberships"]) {
      assert.ok(validator.includes(check), `isUserRecord establishes ${check}`);
    }
  });

  it("reads the save response through the readers that already validated it", () => {
    const body = slice("  async function saveEditedUser() {");
    assert.match(body, /renderUsers\(readUserRecords\(body\)\);/);
    assert.match(body, /readUserRecord\(body\)\?\.username \|\| username/,
      "the confirmation name comes from a checked record, falling back to what was submitted");
    assert.ok(!/body\.users|body\.user\b/.test(body), "no member is read off the body directly");
  });
});

describe("one declaration this child had to add outside its own cluster", () => {
  it("declares the memberships renderer at the domain its callers actually use", () => {
    // Typing `users` gave the `getEditingUser()` default an inferred type, which
    // `closeEditUserDialog` immediately contradicted by passing `null`. Null is a real argument -
    // closing the dialog renders the empty state - so the domain admits it rather than the call
    // site being rewritten to suit an inference.
    const doc = docFor("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {");
    assert.match(doc, /@param \{BrowserUserWorkspaceMembership\[\]\} memberships/);
    assert.match(doc, /@param \{BrowserUserRecord \| null \| undefined\} \[user\]/);
    assert.match(doc, /Null is a real\s*\n?\s*\* argument here/);
    assert.match(executable, /renderWorkspaceMemberships\(\[\], null\);/, "the null call site is unchanged");
    assert.match(executable, /renderWorkspaceMemberships\(user\.workspaceMemberships \|\| \[\], user\);/);
    assert.match(slice("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {"),
      /user\?\.user_id/, "and the body already read it optionally, so nothing there changed");
  });

  it("does not type it as unknown, which would move the debt rather than close it", () => {
    // `0.33.33.40.2` recorded why: typing a wire member `unknown` trades a hidden boundary for a
    // visible one. A first pass here did exactly that and moved the `unknown` family off zero.
    const doc = docFor("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {");
    assert.ok(!/@param \{unknown\[\]\} memberships/.test(doc));
    assert.ok(contracts.includes("export interface BrowserUserWorkspaceMembership {"),
      "the published membership contract is what it uses instead");
  });
});

describe("edit-dialog behaviour this child must not have moved", () => {
  it("keeps the open sequence and its fallbacks", () => {
    const body = slice("  async function openEditUserDialog(user, options = {}) {");
    assert.match(body, /\.value = user\.displayName \|\| user\.username;/, "the display-name fallback stands");
    assert.match(body, /\.value = user\.altEmail \|\| "";/);
    assert.match(body, /setEditUserTimezoneValue\(user\.timezone \|\| "America\/New_York"\);/);
    assert.match(body, /pendingRoleAssignments = \[\];/);
    assert.match(body, /renderManagedUserSessions\(\[\]\);/);
  });

  it("keeps the timezone select accepting a value it does not list", () => {
    const body = slice("  function setEditUserTimezoneValue(timezone) {");
    assert.match(body, /const matchingOption = \[\.\.\.timezoneSelect\.options\]\.find\(\(option\) => option\.value === timezone\);/);
    assert.match(body, /if \(!matchingOption\) \{/, "an unlisted timezone is still appended rather than dropped");
    assert.match(body, /timezoneSelect\.value = timezone;/);
    assert.match(docFor("  function setEditUserTimezoneValue(timezone) {"), /@param \{string\} timezone/);
  });

  it("keeps the save validation order and both requests", () => {
    const body = slice("  async function saveEditedUser() {");
    const order = ["Enter a valid email address.", "Display name is required.",
      "Enter a valid alternate email address or leave it blank."];
    let previous = -1;
    for (const message of order) {
      const at = body.indexOf(message);
      assert.notEqual(at, -1, message + " must still be a refusal");
      assert.ok(at > previous, message + " must keep its position in the order");
      previous = at;
    }
    assert.ok(body.indexOf("/update") < body.indexOf("/role-assignments"),
      "the profile update still precedes the role-assignment write");
    assert.match(body, /closeEditUserDialog\(\);\s*\n\s*renderUsers\(/, "and the dialog still closes before the list repaints");
  });

  it("keeps the close sequence, including the explicit empty renders", () => {
    const body = slice("  function closeEditUserDialog() {");
    assert.match(body, /if \(dialog\.open\) \{\s*\n\s*dialog\.close\(\);\s*\n\s*\}/,
      "an already-closed dialog is still not closed twice");
    assert.match(body, /renderWorkspaceMemberships\(\[\], null\);/);
    assert.match(body, /renderManagedUserSessions\(\[\]\);/);
  });

  it("adds no cast, suppression or namespace surface", () => {
    // Raw source: all of these live in comments.
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3,
      "the three casts inside the element-checking readers predate this child, and none was added");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
  });
});
