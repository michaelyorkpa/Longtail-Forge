import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/role-assignments.js");

const LIFTED = [
  "findRoleControl", "requireRoleValue", "renderTarget", "clearTarget", "renderRoleOptions",
  "renderScopeOptions", "selectedRole", "selectedAssignment", "describeAssignment",
  "updateControls", "setBusy", "createOption", "normalizeEmail", "assignmentKey",
];

const CONTROLS = [
  ["targetSection", "[data-role-target]", "section", "HTMLElement"],
  ["targetHeading", "[data-role-target-heading]", "h2", "HTMLElement"],
  ["targetAccount", "[data-role-target-account]", "p", "HTMLElement"],
  ["assignmentList", "[data-delegated-role-list]", "ul", "HTMLElement"],
  ["roleSelect", "[data-delegated-role]", "select", "HTMLSelectElement"],
  ["scopeSelect", "[data-delegated-scope]", "select", "HTMLSelectElement"],
  ["findAccountButton", "[data-find-role-account]", "button", "HTMLButtonElement"],
  ["accountEmailInput", "[data-role-account-email]", "input", "HTMLInputElement"],
  ["addAssignmentButton", "[data-add-delegated-role-button]", "button", "HTMLButtonElement"],
];

/** @param {Record<string, unknown>} [overrides] */
const roleOption = (overrides = {}) => ({
  assignable_scope_type: "client", assignment_scope_type: "client", description: "",
  role_id: "role-1", role_name: "Client Manager",
  scopes: [{ label: "Client One", scopeId: "c1" }, { label: "Client Two", scopeId: "c2" }],
  ...overrides,
});

/** @param {Record<string, unknown>} [overrides] */
const assignment = (overrides = {}) => ({ role_id: "role-1", scope_type: "client", scope_id: "c1", ...overrides });

/** @param {{ omit?: string[] }} [options] */
function targetCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    roleOptions: [roleOption()],
    target: null,
    busy: false,
    setStatus: (/** @type {string} */ message) => events.push(["status", message]),
    confirmRemoveAssignment: () => events.push("remove"),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findRoleControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  return { api, context, document, events, control };
}

/** @param {Record<string, unknown>} [overrides] */
const foundTarget = (overrides = {}) => ({
  assignmentRevision: "rev-1", assignments: [assignment()],
  displayName: "Ada Lovelace", userId: "u1", username: "ada@example.com",
  ...overrides,
});

describe("Role Assignments target and control rendering", () => {
  it("clears the target surface when there is no account", () => {
    const testCase = targetCase();
    testCase.context.target = null;

    testCase.api.renderTarget();

    assert.equal(testCase.control("[data-role-target]").hidden, true);
    assert.equal(testCase.control("[data-role-target-heading]").textContent, "");
    assert.equal(testCase.control("[data-role-target-account]").textContent, "");
  });

  it("shows the found account and prefers its display name over its username", () => {
    const testCase = targetCase();
    testCase.context.target = foundTarget();

    testCase.api.renderTarget();

    assert.equal(testCase.control("[data-role-target]").hidden, false);
    assert.equal(testCase.control("[data-role-target-heading]").textContent, "Ada Lovelace");
    assert.equal(testCase.control("[data-role-target-account]").textContent, "ada@example.com");

    testCase.context.target = foundTarget({ displayName: "" });
    testCase.api.renderTarget();
    assert.equal(testCase.control("[data-role-target-heading]").textContent, "ada@example.com");
  });

  it("draws one row per assignment, labelled from the role catalogue", () => {
    const testCase = targetCase();
    testCase.context.target = foundTarget({
      assignments: [assignment(), assignment({ scope_id: "c2" })],
    });

    testCase.api.renderTarget();

    const list = testCase.control("[data-delegated-role-list]");
    assert.equal(list.children.length, 2);
    assert.equal(list.children[0].children[0].textContent, "Client Manager — Client One");
    assert.equal(list.children[1].children[0].textContent, "Client Manager — Client Two");
    // An assignment the catalogue cannot name still renders, with its fallback labels.
    testCase.context.target = foundTarget({ assignments: [assignment({ role_id: "gone" })] });
    testCase.api.renderTarget();
    assert.equal(list.children[0].children[0].textContent, "Unavailable role — Unavailable scope");
  });

  it("rebuilds the list rather than appending to it", () => {
    const testCase = targetCase();
    testCase.context.target = foundTarget();

    testCase.api.renderTarget();
    testCase.api.renderTarget();

    assert.equal(testCase.control("[data-delegated-role-list]").children.length, 1);
  });

  it("says so, rather than showing an empty list, when nothing is delegable", () => {
    const testCase = targetCase();
    testCase.context.target = foundTarget({ assignments: [] });

    testCase.api.renderTarget();

    const list = testCase.control("[data-delegated-role-list]");
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].textContent, "No delegable assignments are currently shown.");
  });

  it("disables Remove through the gate that actually decides it", () => {
    // **`renderTarget` does not decide this.** It sets `removeButton.disabled`, then its own chain
    // reaches `updateControls`, which rewrites `disabled` on every button in the list - so the
    // effective gate is `busy || !hasRevision` there, and the earlier assignment never survives.
    // `0.33.33.44.19` aimed its mutations at the discarded line and read the inertness as a
    // fixture limit; it was not one, and a rendered run would have shown the same thing.
    /** @param {{ revision?: string, busy?: boolean }} state */
    const removeDisabled = (state) => {
      const testCase = targetCase();
      testCase.context.target = foundTarget({ assignmentRevision: state.revision ?? "rev-1" });
      testCase.context.busy = state.busy ?? false;
      testCase.api.renderTarget();
      return testCase.control("[data-delegated-role-list]").children[0].children[1].disabled;
    };

    assert.equal(removeDisabled({}), false, "a live revision on an idle page leaves Remove usable");
    assert.equal(removeDisabled({ revision: "" }), true, "a stale revision closes Remove");
    assert.equal(removeDisabled({ busy: true }), true, "a busy page closes Remove");
    assert.equal(removeDisabled({ busy: true, revision: "" }), true, "both together keep it closed");
  });

  it("closes Remove on a later control sync, not only at render time", () => {
    // The state can change without a re-render - `setBusy` runs on every request - so the gate has
    // to hold when `updateControls` is reached on its own.
    const testCase = targetCase();
    testCase.context.target = foundTarget();
    testCase.api.renderTarget();
    const removeButton = testCase.control("[data-delegated-role-list]").children[0].children[1];
    assert.equal(removeButton.disabled, false);

    testCase.api.setBusy(true);
    assert.equal(removeButton.disabled, true, "going busy closes the rendered Remove button");

    testCase.api.setBusy(false);
    assert.equal(removeButton.disabled, false, "and idling reopens it");

    testCase.context.target = foundTarget({ assignmentRevision: "" });
    testCase.api.updateControls();
    assert.equal(removeButton.disabled, true, "losing the revision closes it without a re-render");
  });

  it("offers the selected role's scopes and keeps a selection that is still offered", () => {
    const testCase = targetCase();
    const scopeSelect = testCase.control("[data-delegated-scope]");
    testCase.control("[data-delegated-role]").value = "role-1";

    testCase.api.renderScopeOptions();
    assert.deepEqual(
      scopeSelect.children.map((/** @type {{ value: string }} */ option) => option.value),
      ["", "c1", "c2"],
    );
    assert.equal(scopeSelect.value, "c1", "with nothing chosen the first scope is taken");

    scopeSelect.value = "c2";
    testCase.api.renderScopeOptions();
    assert.equal(scopeSelect.value, "c2", "a scope still on offer survives the repaint");

    // A scope the role no longer offers falls back to the first rather than persisting.
    testCase.context.roleOptions = [roleOption({ scopes: [{ label: "Client Three", scopeId: "c3" }] })];
    testCase.api.renderScopeOptions();
    assert.equal(scopeSelect.value, "c3");
  });

  it("offers no scopes at all when no role is selected", () => {
    const testCase = targetCase();
    testCase.control("[data-delegated-role]").value = "";

    testCase.api.renderScopeOptions();

    assert.deepEqual(
      testCase.control("[data-delegated-scope]").children.map((/** @type {{ value: string }} */ option) => option.value),
      [""],
    );
  });

  it("gates every control on busy, a target, and a live revision", () => {
    const testCase = targetCase();
    // Named rather than positional: which control is closed matters, and an ordering mistake in
    // the test must not read as a behavioural one.
    const disabled = () => ({
      find: testCase.control("[data-find-role-account]").disabled,
      email: testCase.control("[data-role-account-email]").disabled,
      role: testCase.control("[data-delegated-role]").disabled,
      scope: testCase.control("[data-delegated-scope]").disabled,
      add: testCase.control("[data-add-delegated-role-button]").disabled,
    });

    testCase.context.target = null;
    testCase.api.updateControls();
    // No account yet: lookup stays usable, the assignment controls do not.
    assert.deepEqual(disabled(), { find: false, email: false, role: true, scope: true, add: true });

    testCase.context.target = foundTarget();
    testCase.control("[data-delegated-role]").value = "role-1";
    testCase.control("[data-delegated-scope]").value = "c1";
    testCase.api.updateControls();
    assert.deepEqual(disabled(), { find: false, email: false, role: false, scope: false, add: false });

    // A stale revision closes the assignment controls without closing the lookup.
    testCase.context.target = foundTarget({ assignmentRevision: "" });
    testCase.api.updateControls();
    assert.deepEqual(disabled(), { find: false, email: false, role: true, scope: true, add: true });

    testCase.context.target = foundTarget();
    testCase.context.busy = true;
    testCase.api.updateControls();
    assert.deepEqual(disabled(), { find: true, email: true, role: true, scope: true, add: true });
  });

  it("closes the add control when the chosen role and scope do not make an assignment", () => {
    const testCase = targetCase();
    testCase.context.target = foundTarget();
    testCase.control("[data-delegated-role]").value = "role-1";
    testCase.control("[data-delegated-scope]").value = "";

    testCase.api.updateControls();

    assert.equal(testCase.control("[data-add-delegated-role-button]").disabled, true);
    assert.equal(testCase.api.selectedAssignment(), null);
  });

  it("refuses a control rendered at another subtype rather than accepting it", () => {
    const testCase = targetCase();
    const wrong = testCase.document.createElement("div");
    wrong.setAttribute("data-role-wrong-shape", "");
    testCase.document.body.appendChild(wrong);
    const constructors = vm.runInContext("({ HTMLSelectElement, HTMLElement })", testCase.context);

    // This is what makes the declared subtype a fact rather than a hope: a select the markup did
    // not render is absent, not a wrongly typed element.
    assert.equal(testCase.api.findRoleControl("[data-role-wrong-shape]", constructors.HTMLSelectElement), null);
    assert.equal(testCase.api.findRoleControl("[data-role-wrong-shape]", constructors.HTMLElement), wrong);
    assert.equal(testCase.api.findRoleControl("[data-role-missing]", constructors.HTMLElement), null);
  });

  it("acquires every control through the checked lookup at the markup's own subtype", () => {
    for (const [name, selector, , constructor] of CONTROLS) {
      const expected = `const ${name} = findRoleControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  it("queries the document only for its status node, and keeps that cohort's helper", () => {
    // Two queries and one cast, both inside `asStatusElement`. `0.33.33.38.3.1` retired that idiom
    // in `workspace-settings.js` **only**, and `workspace-deletion-dialog-dom-contracts` pins that
    // this cohort of five keeps its own - so the claim here is that every *other* control goes
    // through the checked lookup, not that the helper is gone.
    assert.equal(source.split("document.querySelector").length - 1, 2);
    assert.match(source, /function asStatusElement\(node\)/, "this cohort keeps its own helper");
    assert.match(source, /"hidden" in node/);
    assert.equal(
      source.split("document.querySelector").length - 1
      - source.split("asStatusElement(document.querySelector(").length + 1,
      1,
      "the only query outside the status helper is the checked lookup's own",
    );
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("fails at the access that already dereferenced a missing control, by name", () => {
    const testCase = targetCase({ omit: ["[data-role-target]"] });
    testCase.context.target = foundTarget();

    assert.throws(() => testCase.api.renderTarget(), (error) => {
      assert.ok(typeof error === "object" && error !== null && "name" in error && "message" in error);
      assert.equal(error.name, "TypeError");
      assert.match(String(error.message), /Role Assignments requires its target section\./);
      return true;
    });
  });
});
