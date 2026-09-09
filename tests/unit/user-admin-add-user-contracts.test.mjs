import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's Add User flow, typed by `0.33.33.44.5`.
 *
 * **One flow, so one boundary.** Whether creation is available at all, the options and scope the
 * form offers, the account lookup that decides create-versus-add, the create request itself, and
 * the generated password it hands back. Fifteen controls serve exactly that flow; the other
 * twenty-six this page acquires belong to the edit dialog, permissions, memberships and sessions,
 * and are untouched.
 *
 * **A DOM boundary, and the measurement says so**: `dom` fell 1,232 to 1,154 while the owner
 * budget moved 1,324 to 1,304. Reporting this as owner progress would have been wrong.
 *
 * **Typed-or-null, not required-at-acquisition.** These controls are acquired at module
 * evaluation, outside the `try` in `loadUsers`. Refusing there would turn a missing control into
 * a dead page instead of the "Users could not be loaded." status it produces today, so the
 * subtype is settled at the query point and presence at the statement that already dereferenced
 * it - which is the `0.33.33.38.3` pattern this estate already uses in Notes.
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

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/**
 * The tag the server template renders for one control.
 *
 * Matched on the **complete** attribute: `data-new-user-client-scope` is a prefix of
 * `data-new-user-client-scope-field`, which sits on the wrapping `<label>`, so a prefix search
 * finds the wrong element. `0.33.33.44.2` hit the same trap with `billable-control`.
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
  ["user-admin-form", "userAdminForm", "HTMLFormElement", "form"],
  ["new-user-workspace", "newUserWorkspaceSelect", "HTMLSelectElement", "select"],
  ["new-user-username", "newUserUsernameInput", "HTMLInputElement", "input"],
  ["find-user-account", "findUserAccountButton", "HTMLButtonElement", "button"],
  ["new-user-account-status", "newUserAccountStatus", "HTMLElement", "p"],
  ["new-user-role", "newUserRoleSelect", "HTMLSelectElement", "select"],
  ["new-user-client-scope-field", "newUserClientScopeField", "HTMLElement", "label"],
  ["new-user-client-scope", "newUserClientScopeSelect", "HTMLSelectElement", "select"],
  ["new-user-project-scope-field", "newUserProjectScopeField", "HTMLElement", "label"],
  ["new-user-project-scope", "newUserProjectScopeSelect", "HTMLSelectElement", "select"],
  ["create-user", "createUserButton", "HTMLButtonElement", "button"],
  ["generated-password-panel", "generatedPasswordPanel", "HTMLElement", "section"],
  ["generated-password", "generatedPasswordInput", "HTMLInputElement", "input"],
  ["copy-generated-password", "copyGeneratedPasswordButton", "HTMLButtonElement", "button"],
  ["user-admin-status", "userAdminStatus", "HTMLElement", "p"],
];

describe("each Add User control is checked against the tag its own template renders", () => {
  it("matches the markup for every one of the fifteen", () => {
    for (const [dataset, , , tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
    }
  });

  it("acquires each through the checked lookup at that subtype", () => {
    for (const [dataset, slot, constructor] of CONTROLS) {
      assert.ok(
        page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`,
      );
    }
  });

  it("narrows by a runtime check with the constructor passed as a value", () => {
    const body = slice("  function findUserAdminControl(selector, constructor) {");
    assert.match(body, /return element instanceof constructor \? element : null;/,
      "instanceof against the passed constructor, answering null rather than throwing");
    assert.ok(!/@type \{|createElement/.test(body), "no assertion, and no fabricated stand-in");
  });

  it("never claims a subtype narrower than the markup guarantees", () => {
    // The five containers this flow only shows, hides or writes text into stay `HTMLElement`.
    for (const [, slot] of CONTROLS.filter(([, , c]) => c === "HTMLElement")) {
      const uses = [...page.matchAll(new RegExp(`${slot}, "[^"]+"\\)\\.(\\w+)`, "g"))].map((m) => m[1]);
      for (const use of uses) {
        assert.ok(["hidden", "textContent", "classList", "replaceChildren", "append"].includes(use),
          `${slot} reads only container members, not ${use}`);
      }
    }
  });

  it("leaves the clusters it does not own to their own children", () => {
    // Retargeted by `0.33.33.44.7`, which typed the edit-user dialog. The claim is that this page
    // is converted cluster by cluster - all fifteen Add User controls are checked, and controls
    // no landed child owns are still bare - not that the checked count stays at fifteen.
    for (const [, slot] of CONTROLS) {
      assert.match(page, new RegExp(`const ${slot} = findUserAdminControl\\(`), `${slot} is checked`);
    }
    const bare = [...page.matchAll(/= document\.querySelector\("\[data-/g)].length;
    assert.ok(bare > 0,
      "and the permissions, membership, session and row-action controls still await their children");
  });
});

describe("presence is settled where the page already dereferenced, not at acquisition", () => {
  it("answers null at the query point, and says why", () => {
    const doc = page.slice(page.indexOf("/**"), page.indexOf("function findUserAdminControl"));
    assert.match(doc, /outside the `try` in\s*\n?\s*\* `loadUsers`/,
      "the reason acquisition may not refuse is recorded");
    assert.match(doc, /Users could not be loaded/,
      "including the status a missing control produces today");
  });

  it("refuses with a named message at the required access", () => {
    const body = slice("  function requireUserAdminValue(value, name) {");
    assert.match(body, /if \(value === null\) \{/);
    assert.match(body, /throw new TypeError\(`User administration requires its \$\{name\}\.`\);/);
  });

  it("keeps every guard the page already had", () => {
    // Optional stays optional: these three were already guarded or optional-chained, and a
    // required access must not be introduced over them.
    assert.match(executable, /findUserAccountButton\?\.addEventListener/);
    assert.match(executable, /newUserWorkspaceSelect\?\.addEventListener/);
    assert.match(executable, /newUserUsernameInput\?\.addEventListener/);
    assert.match(slice("  function resetAccountLookup() {"), /if \(newUserAccountStatus\) \{/,
      "the status region stays guarded where the page guarded it");
    assert.match(slice("  function renderRoleOptions() {"), /if \(newUserRoleSelect\) \{/,
      "and the role select stays guarded there too");
  });

  it("requires only where the page dereferenced directly", () => {
    // The two bare bindings threw at module evaluation before this change and still do; only the
    // message moves.
    assert.match(executable, /requireUserAdminValue\(userAdminForm, "add-user form"\)\.addEventListener\("submit"/);
    assert.match(executable, /requireUserAdminValue\(copyGeneratedPasswordButton, "copy-password button"\)\.addEventListener\("click"/);
    // Checked by what each required access is applied *to*, not by naming the slots it must not
    // touch: a break that wraps a bare `document.querySelector` names no slot at all.
    // Derived from the source rather than listed, so a later child that types another cluster
    // does not have to edit this rule: a required access may only be applied to a control that
    // was acquired through the checked lookup.
    const typed = new Set([...page.matchAll(/const (\w+) = findUserAdminControl\(/g)].map((entry) => entry[1]));
    for (const [, argument] of executable.matchAll(/(?<!function )requireUserAdminValue\(([^,]+),/g)) {
      assert.ok(typed.has(argument.trim()),
        `${argument.trim()} was never acquired through the checked lookup`);
    }
  });

  it("passes the status region to a controller that accepts null, and requires only the toggle", () => {
    const body = slice("  function setUserAdminStatus(message, isError = false) {");
    assert.match(body, /setStatus\(userAdminStatus, message, \{ isError \}\)/,
      "the shared controller declares this parameter nullable, so it is handed the slot unchanged");
    assert.match(body, /requireUserAdminValue\(userAdminStatus, "status region"\)\.classList\.toggle/,
      "and only the class toggle, which the page dereferenced, is required");
    assert.ok(contracts.includes("setStatus(element: HTMLElement | null | undefined"),
      "that nullable parameter really is what the contract declares");
  });
});

describe("the flow's state is read through contracts this file already owned", () => {
  it("types the assignable roles at the published option, read by the existing reader", () => {
    assert.match(page, /@type \{BrowserRoleOption\[\]\}\s*\n\s*\*\/\s*\n\s*let addUserRoles = \[\];/);
    assert.match(executable, /addUserRoles = readRoleOptions\(options\);/,
      "through the checked reader rather than a bare Array.isArray");
    assert.ok(!/addUserRoles = Array\.isArray/.test(executable), "the unchecked copy is gone");
    // The reader was written for two consumers; this page had only ever wired up one.
    assert.equal([...page.matchAll(/readRoleOptions\(/g)].length, 3,
      "one declaration and the two consumers its own documentation names");
  });

  it("reads the workspaces through the reader for the same producer", () => {
    assert.match(executable, /const availableWorkspaces = readAssignableWorkspaces\(options\) \|\| \[\];/);
    assert.ok(!/Array\.isArray\(options\.workspaces\)/.test(executable));
    assert.match(page, /server-side `readAssignableWorkspaces` that `GET \/api\/workspaces` uses/,
      "and the code records that both endpoints share one producer");
  });

  it("keeps the account lookup local over a published match", () => {
    assert.match(page, /@typedef \{\{ match: BrowserAccountLookupMatch \| null, username: string, workspaceId: string \}\} AddUserAccountLookup/);
    assert.match(page, /\/\*\* @type \{AddUserAccountLookup \| null\} \*\/\s*\n\s*let accountLookup = null;/);
    assert.ok(contracts.includes("export interface BrowserAccountLookupMatch {"),
      "the match itself is the published contract");
    assert.ok(!/AddUserAccountLookup/.test(contracts), "and the page record stays local");
    assert.match(executable, /accountLookup = \{ match, username, workspaceId \};/,
      "built from the checked lookup the page already ran");
  });

  it("declares the add-options body unchecked, and narrows it here", () => {
    const doc = page.slice(page.lastIndexOf("/**", page.indexOf("function applyAddUserOptions")),
      page.indexOf("function applyAddUserOptions"));
    assert.match(doc, /@param \{unknown\} \[options\]/, "the body arrives unchecked");
    const body = slice("  function applyAddUserOptions(options = {}) {");
    assert.match(body, /const record = isResponseRecord\(options\) \? options : null;/,
      "narrowed by the predicate this file already published for its own readers");
    assert.match(body, /record\?\.canAddUsers === true/);
  });
});

describe("Add User behaviour this child must not have moved", () => {
  it("keeps creation availability driven by the same single flag", () => {
    const body = slice("  function applyUserCreationAvailability() {");
    assert.match(body, /const canCreateUsers = addUserCanCreate;/);
    assert.match(body, /workspaceSelect\.disabled = workspaceSelect\.options\.length < 2;/,
      "the workspace select is still disabled by option count, not by permission");
    assert.match(body, /if \(!canCreateUsers\) \{\s*\n\s*usernameInput\.value = "";\s*\n\s*\}/,
      "and the username is still cleared when creation is unavailable");
  });

  it("states the boolean sense of hidden the page already relied on", () => {
    // `hidden` is `boolean | string` in the DOM lib because of `hidden="until-found"`. This page
    // assigns it as a boolean itself, so `Boolean(...)` changes nothing and states the intent.
    const body = slice("  function applyUserCreationAvailability() {");
    assert.match(body, /!canCreateUsers \|\| Boolean\(requireUserAdminValue\(newUserClientScopeField[^)]*\)\.hidden\)/);
    assert.match(body, /!canCreateUsers \|\| Boolean\(requireUserAdminValue\(newUserProjectScopeField[^)]*\)\.hidden\)/);
    assert.match(slice("  function renderNewUserScopeOptions() {"),
      /\.hidden = scopeType !== "client";/, "and the page still writes it as a boolean");
  });

  it("keeps the scope fields following the selected role", () => {
    const body = slice("  function renderNewUserScopeOptions() {");
    assert.match(body, /const role = addUserRoles\.find\(\(item\) => item\.role_id === roleSelect\.value\);/);
    assert.match(body, /if \(scopeType === "client"\) \{/);
    assert.match(body, /if \(scopeType === "project"\) \{/);
    assert.match(body, /applyUserCreationAvailability\(\);/, "and still re-applies availability after");
  });

  it("keeps the lookup-before-create rule and the already-active refusal", () => {
    const body = slice("  async function createUser() {");
    assert.match(body, /if \(!accountLookup \|\| accountLookup\.username !== username \|\| accountLookup\.workspaceId !== workspaceId\) \{/,
      "a stale lookup is re-run before creating");
    assert.match(body, /if \(accountLookup\?\.match\?\.alreadyActive\) \{/);
    assert.match(body, /setUserAdminStatus\("That account already belongs to the selected workspace\.", true\);/);
  });

  it("keeps the generated password shown only when one was created", () => {
    assert.match(slice("  function showGeneratedPassword(password) {"),
      /\.hidden = !password;/, "an empty password hides the panel");
    assert.match(executable, /showGeneratedPassword\(created\.initialPassword\)/);
    assert.match(executable, /showGeneratedPassword\(""\)/);
  });

  it("adds no cast, suppression, published contract or namespace surface", () => {
    // Raw source: all of these live in comments, so a stripped view could not fail.
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    // Three `/** @type */ (...)` casts predate this child, in the readers that validate a
    // body element-by-element before asserting it. The claim is that this child added none.
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3, "no cast was added");
    for (const reader of ["readClientProjectScopes", "readAssignableWorkspaces", "readPermissionResourceCatalog"]) {
      assert.match(slice(`  function ${reader}(body) {`), /\.every\(is\w+\)/,
        `${reader} still checks every element before it asserts`);
    }
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
    assert.ok(!/AddUserAccountLookup|findUserAdminControl|requireUserAdminValue/.test(contracts),
      "the helpers and the page record stay local to this file");
  });
});
