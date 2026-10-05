import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/calendar-settings.js");

const LIFTED = [
  "findCalendarControl", "requireCalendarValue", "focusCalendarElement", "readSubscriptionName",
  "readCreatePayload", "renderScopeFields", "renderClientOptions", "renderProjectOptions",
  "normalizeSubscriptions", "normalizeClients", "normalizeProjects", "normalizeWorkspaceType",
  "usesBusinessScopes", "option", "formatStatus", "formatDate", "cell", "rowAction",
];

const CONTROLS = [
  ["nameInput", "[data-calendar-subscription-name]", "input", "HTMLInputElement"],
  ["scopeSelect", "[data-calendar-subscription-scope]", "select", "HTMLSelectElement"],
  ["clientField", "[data-calendar-subscription-client-field]", "label", "HTMLElement"],
  ["clientSelect", "[data-calendar-subscription-client]", "select", "HTMLSelectElement"],
  ["projectField", "[data-calendar-subscription-project-field]", "label", "HTMLElement"],
  ["projectSelect", "[data-calendar-subscription-project]", "select", "HTMLSelectElement"],
];

/** @param {{ omit?: string[], workspaceType?: string, clients?: unknown[], workspaceProjects?: unknown[] }} [options] */
function calendarCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  /** @type {unknown[]} */
  const statuses = [];
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    state: {
      clients: options.clients || [],
      subscriptions: [],
      tasksEnabled: true,
      workspaceType: options.workspaceType || "business",
      workspaceProjects: options.workspaceProjects || [],
    },
    createStatus: null,
    setStatus: (/** @type {unknown} */ _element, /** @type {string} */ message) => statuses.push(message),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findCalendarControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  /** @param {string} selector */
  const optionValues = (selector) => control(selector).options.map((entry) => entry.value);
  /** @param {string} selector */
  const optionLabels = (selector) => control(selector).options.map((entry) => entry.textContent);
  return { api, context, document, control, optionValues, optionLabels, statuses };
}

const client = (/** @type {Record<string, unknown>} */ overrides = {}) => ({
  id: "c1", label: "Client One", projects: [{ id: "p1", label: "Project One" }], ...overrides,
});

describe("Calendar Settings control acquisition", () => {
  it("acquires every control through the checked lookup at the subtype the host renders", () => {
    const DECLARED = [
      ["createForm", "[data-calendar-subscription-create-form]", "HTMLFormElement"],
      ["nameInput", "[data-calendar-subscription-name]", "HTMLInputElement"],
      ["scopeSelect", "[data-calendar-subscription-scope]", "HTMLSelectElement"],
      ["clientField", "[data-calendar-subscription-client-field]", "HTMLElement"],
      ["projectSelect", "[data-calendar-subscription-project]", "HTMLSelectElement"],
      ["createButton", "[data-create-calendar-subscription]", "HTMLButtonElement"],
      ["secretPanel", "[data-calendar-subscription-secret-panel]", "HTMLElement"],
      ["secretInput", "[data-calendar-subscription-url]", "HTMLInputElement"],
      ["subscriptionList", "[data-calendar-subscription-list]", "HTMLElement"],
    ];

    for (const [name, selector, constructor] of DECLARED) {
      const expected = `const ${name} = findCalendarControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  /**
   * This page keeps its cohort's status helper. `0.33.33.38.3.1` retired that idiom in
   * `workspace-settings.js` **alone**, and `workspace-deletion-dialog-dom-contracts` pins that
   * scope - so the claim is that every *other* control goes through the checked lookup.
   */
  it("queries the document only for its two status nodes, and keeps that cohort's helper", () => {
    assert.equal(source.split("document.querySelector").length - 1, 3);
    assert.equal(source.includes('asStatusElement(document.querySelector("[data-calendar-subscription-create-status]"))'), true);
    assert.equal(source.includes('asStatusElement(document.querySelector("[data-calendar-subscription-secret-status]"))'), true);
    assert.equal(source.includes("const element = document.querySelector(selector);"), true);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("refuses a control the host rendered at another subtype", () => {
    const testCase = calendarCase({ omit: ["[data-calendar-subscription-scope]"] });
    const wrong = testCase.document.createElement("div");
    wrong.setAttribute("data-calendar-subscription-scope", "");
    testCase.document.body.appendChild(wrong);

    const found = testCase.api.findCalendarControl(
      "[data-calendar-subscription-scope]",
      testCase.context.HTMLSelectElement,
    );

    assert.equal(found, null);
    assert.throws(() => testCase.api.requireCalendarValue(found, "scope select"), {
      name: "TypeError",
      message: "Calendar Settings requires its scope select.",
    });
  });

  /**
   * The rotate request genuinely sends no body: `requestJson` omits both the body and the
   * Content-Type header for `undefined`, so `{}` would be a different request on the wire.
   */
  it("states the rotate request's absent body rather than filling one in", () => {
    assert.equal(source.includes("/rotate`,\n      undefined,\n    ));"), true);
    assert.equal(source.includes("/rotate`,\n      {},"), false);
  });
});

describe("Calendar Settings scope fields", () => {
  it("hides both scope pickers for a workspace subscription", () => {
    const testCase = calendarCase();
    testCase.control("[data-calendar-subscription-scope]").value = "workspace";

    testCase.api.renderScopeFields();

    assert.equal(testCase.control("[data-calendar-subscription-client-field]").hidden, true);
    assert.equal(testCase.control("[data-calendar-subscription-project-field]").hidden, true);
    assert.equal(testCase.control("[data-calendar-subscription-client]").required, false);
    assert.equal(testCase.control("[data-calendar-subscription-project]").required, false);
  });

  it("shows and requires the client picker for a client subscription", () => {
    const testCase = calendarCase({ clients: [client()] });
    testCase.control("[data-calendar-subscription-scope]").value = "client";

    testCase.api.renderScopeFields();

    assert.equal(testCase.control("[data-calendar-subscription-client-field]").hidden, false);
    assert.equal(testCase.control("[data-calendar-subscription-client]").required, true);
    assert.equal(testCase.control("[data-calendar-subscription-project-field]").hidden, true);
  });

  it("shows both pickers for a project subscription but requires only the project", () => {
    const testCase = calendarCase({ clients: [client()] });
    testCase.control("[data-calendar-subscription-scope]").value = "project";

    testCase.api.renderScopeFields();

    assert.equal(testCase.control("[data-calendar-subscription-client-field]").hidden, false);
    assert.equal(testCase.control("[data-calendar-subscription-project-field]").hidden, false);
    assert.equal(testCase.control("[data-calendar-subscription-client]").required, false);
    assert.equal(testCase.control("[data-calendar-subscription-project]").required, true);
  });

  it("keeps the client picker away from a workspace that has no clients", () => {
    const testCase = calendarCase({ workspaceType: "personal", clients: [client()] });
    testCase.control("[data-calendar-subscription-scope]").value = "client";

    testCase.api.renderScopeFields();

    assert.equal(testCase.control("[data-calendar-subscription-client-field]").hidden, true);
  });

  it("keeps a standing client choice while the scope still uses one", () => {
    for (const scopeType of ["client", "project"]) {
      const testCase = calendarCase({ clients: [client()] });
      testCase.control("[data-calendar-subscription-client]").value = "c1";
      testCase.control("[data-calendar-subscription-scope]").value = scopeType;

      testCase.api.renderScopeFields();

      assert.equal(testCase.control("[data-calendar-subscription-client]").value, "c1", scopeType);
    }
  });

  it("clears a standing client choice when the scope returns to the workspace", () => {
    const testCase = calendarCase({ clients: [client()] });
    testCase.control("[data-calendar-subscription-client]").value = "c1";
    testCase.control("[data-calendar-subscription-scope]").value = "workspace";

    testCase.api.renderScopeFields();

    assert.equal(testCase.control("[data-calendar-subscription-client]").value, "");
  });
});

describe("Calendar Settings option lists", () => {
  it("names the empty client choice for the scope being chosen", () => {
    const forClient = calendarCase({ clients: [client()] });
    forClient.control("[data-calendar-subscription-scope]").value = "client";
    forClient.api.renderClientOptions();
    assert.equal(forClient.optionLabels("[data-calendar-subscription-client]")[0], "Choose a client");

    const forProject = calendarCase({ clients: [client()] });
    forProject.control("[data-calendar-subscription-scope]").value = "project";
    forProject.api.renderClientOptions();
    assert.equal(forProject.optionLabels("[data-calendar-subscription-client]")[0], "All readable projects");
  });

  it("offers every client behind that placeholder, and rebuilds on a repaint", () => {
    const testCase = calendarCase({ clients: [client(), client({ id: "c2", label: "Client Two" })] });

    testCase.api.renderClientOptions();
    testCase.api.renderClientOptions();

    assert.deepEqual(testCase.optionValues("[data-calendar-subscription-client]"), ["", "c1", "c2"]);
  });

  it("keeps a still-offered client across a repaint and drops one that is gone", () => {
    const kept = calendarCase({ clients: [client()] });
    kept.control("[data-calendar-subscription-client]").value = "c1";
    kept.api.renderClientOptions();
    assert.equal(kept.control("[data-calendar-subscription-client]").value, "c1");

    const dropped = calendarCase({ clients: [client()] });
    dropped.control("[data-calendar-subscription-client]").value = "gone";
    dropped.api.renderClientOptions();
    assert.equal(dropped.control("[data-calendar-subscription-client]").value, "");
  });

  it("groups the combined project list by its source and leaves a client's own list ungrouped", () => {
    const testCase = calendarCase({
      clients: [client()],
      workspaceProjects: [{ id: "w1", label: "Workspace Project" }],
    });

    testCase.api.renderProjectOptions();

    assert.deepEqual(testCase.optionLabels("[data-calendar-subscription-project]"), [
      "Choose a project", "Workspace / Workspace Project", "Client One / Project One",
    ]);

    testCase.control("[data-calendar-subscription-client]").value = "c1";
    testCase.api.renderProjectOptions();

    assert.deepEqual(testCase.optionLabels("[data-calendar-subscription-project]"), [
      "Choose a project", "Project One",
    ]);
  });

  it("says so when no project can be read", () => {
    const testCase = calendarCase();

    testCase.api.renderProjectOptions();

    assert.deepEqual(testCase.optionLabels("[data-calendar-subscription-project]"), ["No readable projects"]);
  });
});

describe("Calendar Settings create payload", () => {
  it("sends a workspace subscription with no scope member at all", () => {
    const testCase = calendarCase();
    testCase.control("[data-calendar-subscription-name]").value = "  Team calendar  ";
    testCase.control("[data-calendar-subscription-scope]").value = "workspace";

    const payload = testCase.api.readCreatePayload();

    assert.equal(payload.name, "Team calendar");
    assert.equal(payload.scopeType, "workspace");
    assert.equal(Object.hasOwn(payload, "clientId"), false);
    assert.equal(Object.hasOwn(payload, "projectId"), false);
  });

  it("describes a workspace subscription when the scope control offers nothing", () => {
    const testCase = calendarCase();
    testCase.control("[data-calendar-subscription-name]").value = "Team calendar";

    assert.equal(testCase.api.readCreatePayload().scopeType, "workspace");
  });

  it("refuses an unnamed subscription and says why", () => {
    const testCase = calendarCase();
    testCase.control("[data-calendar-subscription-scope]").value = "workspace";

    assert.equal(testCase.api.readCreatePayload(), null);
    assert.deepEqual(testCase.statuses, ["Enter a calendar subscription name."]);
  });

  it("carries the chosen client, and refuses a client scope without one", () => {
    const chosen = calendarCase({ clients: [client()] });
    chosen.control("[data-calendar-subscription-name]").value = "Client calendar";
    chosen.control("[data-calendar-subscription-scope]").value = "client";
    chosen.control("[data-calendar-subscription-client]").value = "c1";
    assert.equal(chosen.api.readCreatePayload().clientId, "c1");

    const missing = calendarCase({ clients: [client()] });
    missing.control("[data-calendar-subscription-name]").value = "Client calendar";
    missing.control("[data-calendar-subscription-scope]").value = "client";
    assert.equal(missing.api.readCreatePayload(), null);
    assert.deepEqual(missing.statuses, ["Choose a client."]);
  });

  it("carries the chosen project, and refuses a project scope without one", () => {
    const chosen = calendarCase();
    chosen.control("[data-calendar-subscription-name]").value = "Project calendar";
    chosen.control("[data-calendar-subscription-scope]").value = "project";
    chosen.control("[data-calendar-subscription-project]").value = "p1";
    assert.equal(chosen.api.readCreatePayload().projectId, "p1");

    const missing = calendarCase();
    missing.control("[data-calendar-subscription-name]").value = "Project calendar";
    missing.control("[data-calendar-subscription-scope]").value = "project";
    assert.equal(missing.api.readCreatePayload(), null);
    assert.deepEqual(missing.statuses, ["Choose a project."]);
  });
});

describe("Calendar Settings normalizers", () => {
  it("keeps only identified subscriptions and names every member it renders", () => {
    const testCase = calendarCase();

    const rows = testCase.api.normalizeSubscriptions([
      { subscriptionId: "s1" },
      { name: "No identifier" },
      { subscriptionId: "s2", name: "Named", status: "active", timezone: "UTC", ownedByCurrentUser: true, owner: { displayName: "Ada" }, scope: { label: "Workspace" } },
    ]);

    assert.deepEqual(rows.map((/** @type {{ subscriptionId: string }} */ row) => row.subscriptionId), ["s1", "s2"]);
    assert.equal(rows[0].name, "Unnamed subscription");
    assert.equal(rows[0].ownerLabel, "Unavailable user");
    assert.equal(rows[0].scopeLabel, "Unavailable scope");
    assert.equal(rows[0].status, "revoked", "a subscription whose status cannot be read is not treated as active");
    assert.equal(rows[0].timezone, "Unavailable");
    assert.equal(rows[0].ownedByCurrentUser, false);
    assert.equal(rows[1].ownerLabel, "Ada");
  });

  it("prefers a display name and falls back to the username", () => {
    const testCase = calendarCase();

    const [byUsername] = testCase.api.normalizeSubscriptions([
      { subscriptionId: "s1", owner: { username: "ada@example.com" } },
    ]);

    assert.equal(byUsername.ownerLabel, "ada@example.com");

    // Both present: the display name is the one a reader recognises.
    const [both] = testCase.api.normalizeSubscriptions([
      { subscriptionId: "s1", owner: { displayName: "Ada Lovelace", username: "ada@example.com" } },
    ]);
    assert.equal(both.ownerLabel, "Ada Lovelace");
  });

  /** Ownership gates the rotate and revoke actions, so it is the word `true`, not anything truthy. */
  it("treats a merely truthy ownership flag as not owned", () => {
    const testCase = calendarCase();

    const [loose] = testCase.api.normalizeSubscriptions([
      { subscriptionId: "s1", ownedByCurrentUser: "yes" },
    ]);

    assert.equal(loose.ownedByCurrentUser, false);
  });

  it("refuses a list that is not one, and drops entries with no identifier", () => {
    const testCase = calendarCase();

    assert.deepEqual(testCase.api.normalizeSubscriptions("s1,s2").length, 0);
    assert.deepEqual(testCase.api.normalizeClients(null).length, 0);
    assert.deepEqual(testCase.api.normalizeProjects({ id: "p1" }).length, 0);
    assert.deepEqual(testCase.api.normalizeClients([{ name: "No id" }]).length, 0);
    assert.deepEqual(testCase.api.normalizeProjects([{ name: "No id" }]).length, 0);
  });

  it("names an untitled client and project", () => {
    const testCase = calendarCase();

    assert.equal(testCase.api.normalizeClients([{ id: "c1" }])[0].label, "Untitled Client");
    assert.equal(testCase.api.normalizeProjects([{ id: "p1" }])[0].label, "Untitled Project");
  });

  it("admits only the three workspace words and falls back to business", () => {
    const testCase = calendarCase();

    assert.equal(testCase.api.normalizeWorkspaceType("  PERSONAL "), "personal");
    assert.equal(testCase.api.normalizeWorkspaceType("family"), "family");
    assert.equal(testCase.api.normalizeWorkspaceType("unheard-of"), "business");
    assert.equal(testCase.api.normalizeWorkspaceType(null), "business");
  });
});

describe("Calendar Settings row presentation", () => {
  it("names a revoked subscription apart from an active one", () => {
    const testCase = calendarCase();

    assert.equal(testCase.api.formatStatus("active"), "Active");
    assert.equal(testCase.api.formatStatus("revoked"), "Revoked");
    assert.equal(testCase.api.formatStatus("anything else"), "Revoked", "only the active word reads as active");
  });

  it("dashes a cell and a date the producer never sent", () => {
    const testCase = calendarCase();

    assert.equal(testCase.api.cell("").textContent, "—");
    assert.equal(testCase.api.cell("Team calendar").textContent, "Team calendar");
    assert.equal(testCase.api.formatDate(null), "—");
  });

  it("carries the action and subscription a row button acts on", () => {
    const testCase = calendarCase();

    const plain = testCase.api.rowAction("Rotate", "rotate", "s1");
    assert.equal(plain.type, "button");
    assert.equal(plain.textContent, "Rotate");
    assert.equal(plain.dataset.calendarSubscriptionAction, "rotate");
    assert.equal(plain.dataset.subscriptionId, "s1");
    assert.equal(plain.disabled, false);
    assert.equal(plain.className, "");

    const gated = testCase.api.rowAction("Rotate", "rotate", "s1", { disabled: true, danger: true });
    assert.equal(gated.disabled, true);
    assert.equal(gated.className, "danger-button");
  });

  it("names an acknowledgment that carries no subscription name", () => {
    const testCase = calendarCase();

    assert.equal(testCase.api.readSubscriptionName({ name: "Team calendar" }), "Team calendar");
    assert.equal(testCase.api.readSubscriptionName({}), "This subscription");
    assert.equal(testCase.api.readSubscriptionName(null), "This subscription");
    assert.equal(testCase.api.readSubscriptionName("Team calendar"), "This subscription");
    assert.equal(testCase.api.readSubscriptionName({}.constructor), "This subscription");
    // Own members only: a name reached through the prototype chain is not this record's content.
    assert.equal(testCase.api.readSubscriptionName(Object.create({ name: "Inherited" })), "This subscription");
  });

  it("restores focus only to an element that can take it", () => {
    const testCase = calendarCase();
    const button = testCase.document.createElement("button");
    testCase.document.body.appendChild(button);

    testCase.api.focusCalendarElement(button);
    assert.equal(testCase.document.activeElement, button);

    testCase.api.focusCalendarElement(null);
    assert.equal(testCase.document.activeElement, button, "an absent element leaves focus where it was");

    // A text node is not an element and cannot be focused, so focus stays where it was.
    testCase.api.focusCalendarElement(testCase.document.createTextNode("not an element"));
    assert.equal(testCase.document.activeElement, button);
  });
});
