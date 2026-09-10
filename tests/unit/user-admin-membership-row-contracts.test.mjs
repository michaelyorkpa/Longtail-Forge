import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's workspace memberships and user-row actions, typed by `0.33.33.44.11` - and with
 * them, the last of this file.
 *
 * **`public/js/user-admin.js` reaches zero here**, from 285 when `0.33.33.44.5` opened it. The two
 * clusters are taken together because they interleave: `formatWorkspaceMembershipName`,
 * `createTableCell`, `setUserAdminStatus` and the `workspaces` slot are read by both, and
 * `0.33.33.44.5` explicitly left the name formatter untyped rather than settle this boundary from
 * the Add User side.
 *
 * `readSelectedWorkspaceMemberships` is **sent**, so its return is a payload claim - the same
 * distinction `0.33.33.44.9` drew for the assignment list, and it is traced the same way.
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

/** @param {string} opener */
function docFor(opener) {
  const at = page.indexOf(opener);
  assert.notEqual(at, -1, opener + " must exist");
  return page.slice(page.lastIndexOf("/**", at), at);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/** @param {string} dataset */
function renderedTag(dataset) {
  const at = markup.search(new RegExp(`data-${dataset}(?=[\\s=>])`));
  assert.notEqual(at, -1, dataset + " must appear in the rendered markup");
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open, at));
  assert.ok(tag, dataset + " must sit on an element");
  return tag[1];
}

const CONTROLS = [
  ["user-list", "userList", "HTMLElement", "tbody"],
  ["workspace-membership-list", "workspaceMembershipList", "HTMLElement", "ul"],
];

describe("this child closes the file", () => {
  it("leaves no control acquired without a check", () => {
    for (const [dataset, slot, constructor, tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
      assert.ok(page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`);
    }
    const bare = [...page.matchAll(/= document\.querySelector\("\[data-/g)].length;
    assert.equal(bare, 0, "every control on this page now goes through the checked lookup");
    const checked = [...page.matchAll(/findUserAdminControl\("\[data-/g)].length;
    assert.ok(checked >= 40, `and there are ${checked} of them`);
  });

  it("reached zero without a cast, a suppression or an any", () => {
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression anywhere in the file");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3,
      "the three casts predate 0.33.33.44.5 and sit inside readers that check every element first");
    for (const reader of ["readClientProjectScopes", "readAssignableWorkspaces", "readPermissionResourceCatalog"]) {
      assert.match(slice(`  function ${reader}(body) {`), /\.every\(is\w+\)/,
        `${reader} still checks every element before it asserts`);
    }
  });

  it("still uses exactly the two helpers 0.33.33.44.5 added, and no others", () => {
    assert.equal([...page.matchAll(/function findUserAdminControl\(/g)].length, 1);
    assert.equal([...page.matchAll(/function requireUserAdminValue\(/g)].length, 1);
    // The sharpest form of the claim: this page performs exactly **one** document query in total,
    // and it is the one inside the checked lookup. A rival helper would add a second, and no
    // name-based rule is needed to see it.
    const documentQueries = [...page.matchAll(/document\.querySelector/g)].length;
    assert.equal(documentQueries, 1, "the page makes exactly one document query");
    assert.match(slice("  function findUserAdminControl(selector, constructor) {"),
      /const element = document\.querySelector\(selector\);/, "and it is inside the checked lookup");
  });
});

describe("the memberships list, and the payload it offers back", () => {
  it("types the workspace slot from the reader that vouched for it", () => {
    assert.match(page, /@type \{BrowserAssignableWorkspace\[\]\}\s*\n\s*\*\/\s*\n\s*let workspaces = \[\];/);
    assert.match(executable, /workspaces = assignableWorkspaces;/);
    assert.match(slice("  function readAssignableWorkspaces(body) {"),
      /body\.workspaces\.every\(isAssignableWorkspace\)/);
    assert.match(executable, /if \(!clientScopes \|\| !assignableWorkspaces/,
      "and a body it cannot read still refuses the whole bootstrap");
    assert.ok(contracts.includes("export interface BrowserAssignableWorkspace {"));
  });

  it("declares what it sends, traced to where the identities come from", () => {
    // The same distinction `0.33.33.44.9` drew: this return is a payload, not a page reading.
    const doc = docFor("  function readSelectedWorkspaceMemberships() {");
    assert.match(doc, /@returns \{string\[\]\}/);
    assert.match(doc, /\*\*This is sent\*\*/);
    assert.match(doc, /`workspace\.workspaceId`/, "and names where each identity originates");
    assert.match(executable, /workspaceMemberships: readSelectedWorkspaceMemberships\(\),/,
      "which is how it reaches the update");
    assert.match(slice("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {"),
      /checkbox\.dataset\.workspaceMembership = workspace\.workspaceId;/,
      "the identity written onto the checkbox is the vouched-for member");
  });

  it("narrows each checkbox at the read rather than trusting the selector", () => {
    const body = slice("  function readSelectedWorkspaceMemberships() {");
    assert.match(body, /checkbox instanceof HTMLInputElement && checkbox\.checked/);
    assert.match(body, /checkbox instanceof HTMLElement \? checkbox\.dataset\.workspaceMembership : ""/);
    assert.match(body, /The selector is the attribute/, "and the code records why the fallback is safe");
  });

  it("states the boolean sense the owner-only flag already relied on", () => {
    // `ownerUserId` is `string | null`, so the `&&` chain answered `string | boolean | null` while
    // three reads used it as a flag - the same hole `0.33.33.44.5` found on `hidden`.
    const body = slice("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {");
    assert.match(body, /const isPersonalOwnerOnly = Boolean\(workspace\.workspaceType === "personal" &&/);
    assert.match(body, /workspace\.ownerUserId !== user\?\.user_id\);/);
    assert.match(contracts, /ownerUserId: string \| null;/, "the contract is why the chain was not a boolean");
  });

  it("types the shared name formatter that 0.33.33.44.5 deliberately left", () => {
    assert.match(docFor("  function formatWorkspaceMembershipName(workspace) {"),
      /@param \{BrowserAssignableWorkspace\} workspace/);
    assert.match(docFor("  function formatWorkspaceMembershipName(workspace) {"),
      /Shared with the Add User flow/, "and records why it could not be typed from there");
    // Both callers pass the same contract, which is what makes one declaration correct for both.
    // The declaration matches this shape too, so it is excluded by lookbehind.
    assert.equal([...executable.matchAll(/(?<!function )formatWorkspaceMembershipName\(workspace\)/g)].length, 2,
      "one caller in the Add User options, one in the membership list");
  });
});

describe("the row actions", () => {
  it("declares the action envelope, including the callback that broke it", () => {
    // `onSuccess = () => {}` inferred a zero-argument callback, so `onSuccess(body)` was a TS2554
    // and the one caller that reads the body a TS2322.
    assert.match(docFor("  async function runUserAction({ url, method, successMessage, onSuccess = () => {} }) {"),
      /@param \{\{ url: string, method: string, successMessage: string, onSuccess\?: \(body: unknown\) => void \}\} action/);
    assert.match(slice("  async function runUserAction({ url, method, successMessage, onSuccess = () => {} }) {"),
      /onSuccess\(body\);\s*\n\s*renderUsers\(readUserRecords\(body\)\);/,
      "and the callback still runs before the list repaints");
  });

  it("narrows the generated password in place, without borrowing the create reader", () => {
    // `create-user-response-contracts` recorded that reset-password is a **different producer**
    // from the create response, and assigned this callback typing to `0.33.33.44`. A first pass
    // here routed it through `readUserCreation`, which is exactly the conflation that comment
    // warned against; it is narrowed locally instead.
    const body = slice("  async function resetUserPassword(user) {");
    assert.match(body, /const initialPassword = isResponseRecord\(body\) \? body\.initialPassword : "";/);
    assert.match(body, /showGeneratedPassword\(typeof initialPassword === "string" \? initialPassword : ""\);/);
    // The call, not the name: the comment above it explains why the reader is *not* used.
    const code = body.replace(/(^|\s)\/\/[^\n]*/g, "$1");
    assert.ok(!code.includes("readUserCreation("), "the create reader is not borrowed for this envelope");
    assert.match(body, /different\n\s*\/\/ producer/, "and the code records why");
    assert.match(body, /closeEditUserDialog\(\);/, "the dialog still closes after the reveal");
  });

  it("types every row action at the record the rows hold", () => {
    // Matched as one adjacent block, not by searching backwards: `docFor` walks to the nearest
    // preceding `/**`, so deleting a function's own JSDoc silently hands back its neighbour's.
    for (const name of ["resetUserPassword", "deactivateUser", "reactivateUser", "toggleUserStatus", "deleteUser"]) {
      assert.match(page,
        new RegExp(`/\\*\\* @param \\{BrowserUserRecord\\} user \\*/\\n  async function ${name}\\(user\\) \\{`),
        `${name} carries its own user-record declaration`);
    }
    assert.match(page, /\/\*\* @param \{BrowserUserRecord\[\]\} users \*\/\n  function renderUserRows\(users\) \{/);
  });
});

describe("behaviour this child must not have moved", () => {
  it("keeps the empty states of both lists", () => {
    assert.match(slice("  function renderUserRows(users) {"),
      /cell\.colSpan = 4;\s*\n\s*cell\.textContent = "No users yet\.";/);
    assert.match(slice("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {"),
      /item\.textContent = "No assignable workspaces\.";/);
  });

  it("keeps a membership active unless it says inactive", () => {
    const body = slice("  function renderWorkspaceMemberships(memberships, user = getEditingUser()) {");
    assert.match(body, /\.filter\(\(membership\) => membership\.status !== "inactive"\)/,
      "only an explicit inactive withdraws membership");
    assert.match(body, /checkbox\.checked = !isPersonalOwnerOnly && activeWorkspaceIds\.has\(workspace\.workspaceId\);/);
    assert.match(body, /checkbox\.disabled = isPersonalOwnerOnly;/);
    assert.match(body, /\? "Owner only"/);
  });

  it("keeps delete behind its confirmation", () => {
    const body = slice("  async function deleteUser(user) {");
    assert.match(body, /requireModalDialogs\(\)\.confirm\(\{/);
    assert.match(body, /danger: true,/);
    assert.match(body, /if \(!shouldDelete\) \{\s*\n\s*return;\s*\n\s*\}/,
      "a declined confirmation still cancels the request");
    assert.match(body, /method: "DELETE",/);
  });

  it("keeps the status toggle reading the record it was given", () => {
    assert.match(slice("  async function toggleUserStatus(user) {"),
      /if \(user\.userStatus === "inactive"\) \{\s*\n\s*await reactivateUser\(user\);/);
  });

  it("keeps the unauthenticated redirect on a failed action", () => {
    assert.match(slice("  async function runUserAction({ url, method, successMessage, onSuccess = () => {} }) {"),
      /if \(requireErrors\(\)\.caughtStatus\(error\) === 401\) \{\s*\n\s*window\.location\.replace\("\/login\.html"\);/);
  });

  it("publishes nothing", () => {
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable));
  });
});
