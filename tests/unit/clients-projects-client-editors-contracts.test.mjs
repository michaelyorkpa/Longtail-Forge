import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, FakeElement, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeNode} FakeNode */

/**
 * The Clients/Projects client editors and the editor type tail (`0.33.33.43.52`).
 *
 * Five editors gained annotations from their callers; `createAddProjectForm` gained a declared
 * local; and `createProjectEditor` spells one filter as `label !== null` instead of `Boolean`,
 * which the compiler narrows. Only a created label or `null` reaches that array, so the two agree.
 * What these cases pin: every body except that one line is its `88823b7a` body once JSDoc is
 * removed, and every editor builds the same DOM as its `88823b7a` version - the client editors with
 * and without their save buttons, the parent-client choices, the contact fields, the submit
 * button, and the project editor's fields in both layouts, with and without a client assignment.
 *
 * The document here appends the way the platform does: anything that is not a node becomes a text
 * node, so a `null` that escaped the filter would show up as the text "null" rather than vanish.
 */

const BASE = "88823b7a";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const UNCHANGED_BODIES = [
  "createClientNameEditor", "createParentClientField", "populateParentClientSelect",
  "createBillingContactEditor", "createAddProjectSubmitButton", "createAddProjectForm",
];
const CHANGED_LINE = [
  "      // Only a created label or `null` reaches this array, so this keeps what `Boolean` kept.\n"
    + "      ...identityFields.filter((label) => label !== null),",
  "      ...identityFields.filter(Boolean),",
];

const CLIENT_EDITOR_CLOSURE = [
  "createClientNameEditor", "createParentClientField", "populateParentClientSelect",
  "createBillingContactEditor", "createAddProjectSubmitButton", "createClientStatusSelect", "createOption",
  "requirePageController", "sortClientTree", "getRealClients", "isRealClient", "isWorkspaceGrouping",
  "isActiveStatus", "treeIndent", "getClientDepth", "getClientTreeSortKey", "getClientDescendantIds",
  "clientsEnabledForWorkspace",
];

/**
 * A document whose elements append and prepend as the platform does: a node is inserted, and
 * anything else - including `null` - becomes a text node of its string.
 */
class PlatformAppendDocument extends FakeDocument {
  /** @param {string} tagName */
  createElement(tagName) {
    const element = super.createElement(tagName);
    /** @param {unknown} child @returns {FakeNode} */
    const toNode = (child) => (child instanceof FakeElement ? child : this.createTextNode(String(child)));
    const append = element.append.bind(element);
    element.append = /** @param {...unknown} children */ (...children) => append(...children.map(toNode));
    Object.defineProperty(element, "prepend", {
      value: /** @param {...unknown} children */ (...children) => {
        const nodes = children.map(toNode);
        for (const node of nodes) node.parentNode = element;
        element.children.unshift(...nodes);
      },
    });
    return element;
  }
}

/**
 * An element tree as plain data, so trees from two sandboxes compare.
 * @param {FakeNode | null | undefined} node
 * @returns {unknown}
 */
function snapshot(node) {
  if (!node) return null;
  if (node.tagName === "#TEXT") return { text: node.textContent };
  return {
    tag: node.tagName,
    className: node.className,
    type: node.type,
    value: node.value,
    checked: node.checked,
    disabled: node.disabled,
    hidden: node.hidden,
    open: node.open,
    selected: node.selected,
    text: node.children.length ? undefined : node.textContent,
    dataset: { ...node.dataset },
    children: node.children.map(snapshot),
  };
}

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

const CLIENTS = [
  { id: "c-a", name: "Acme", parent_client_id: "", status: "Active", tags: [], billing_contact: { name: "Ada", email: "ada@example.com", phone: "555" } },
  { id: "c-b", name: "Beta", parent_client_id: "c-a", status: "Active", tags: [], billing_contact: {} },
  { id: "c-c", name: "Gamma", parent_client_id: "c-b", status: "Active", tags: [], billing_contact: {} },
  { id: "c-d", name: "Delta", parent_client_id: "", status: "Inactive", tags: [], billing_contact: {} },
  { id: "c-e", name: "Echo", parent_client_id: "", status: "Active", tags: [], billing_contact: {} },
];

/**
 * @typedef {object} EditorFunctions
 * @property {(client: object, options?: object) => FakeNode} createClientNameEditor
 * @property {(client: object) => FakeNode} createParentClientField
 * @property {(select: FakeNode, excludedClientId?: string) => void} populateParentClientSelect
 * @property {(client: object, options?: object) => FakeNode} createBillingContactEditor
 * @property {(clientId: string) => FakeNode} createAddProjectSubmitButton
 * @property {(client: object, project: object, options?: object) => FakeNode} createProjectEditor
 */

/**
 * One version's editors in a sandbox. The client editors run with the page's own hierarchy
 * helpers; the project editor runs with its sub-editors stubbed identically for both versions.
 * @param {string} text
 * @param {{ workspaceType?: string, withClient?: boolean, simplified?: boolean }} [settings]
 */
function editorsFrom(text, settings = {}) {
  const document = new PlatformAppendDocument();
  /** @type {unknown[][]} */
  const log = [];
  /** @param {string} tag @param {string} mark */
  const marked = (tag, mark) => {
    const element = document.createElement(tag);
    element.dataset.stub = mark;
    return element;
  };
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: {
      LongtailForge: {
        pageController: {
          /** @param {unknown} value @param {unknown} label */
          createOption(value, label) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = label == null ? "" : String(label);
            return option;
          },
        },
      },
    },
    log,
    stubs: {
      marked,
      withClient: settings.withClient !== false,
      simplified: Boolean(settings.simplified),
    },
  });
  vm.runInContext(declaration(text, "  const clientStatuses = [", "];"), context);
  vm.runInContext(declaration(text, "  const billingContactFields = [", "];"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  vm.runInContext(`workspaceSettings.workspaceType = ${JSON.stringify(settings.workspaceType || "business")};`, context);
  vm.runInContext(`
    let openBillingClientId = "c-a";
    const clientProjectData = { clients: ${JSON.stringify(CLIENTS)}, capabilities: {} };
    function createTagPickerField(label, tags, kind) {
      return { element: stubs.marked("div", "tags:" + label + ":" + kind), readTagIds: () => [] };
    }
    async function saveClientSettings(client, container, options) { log.push(["saveClientSettings", client.id, container ? container.className : null, JSON.stringify(options)]); return true; }
    async function saveClientRecord(client, action, viewState) { log.push(["saveClientRecord", JSON.stringify(client), JSON.stringify(action), JSON.stringify(viewState)]); return true; }
    function withoutTagPayload(client) { const { tagIds, tag_ids, ...rest } = client; return rest; }
    function usesProjectRoundingOnly() { return stubs.simplified; }
    function createStatusSelect(value) { return stubs.marked("select", "status:" + value); }
    function createBillableCheckbox(value) { const label = stubs.marked("label", "billable:" + value); label.append(document.createElement("input")); return label; }
    function requireBillableInput(label) { return label.children[0]; }
    function createProjectClientAssignment(project) {
      if (!stubs.withClient) return null;
      const label = stubs.marked("label", "client-assignment");
      label.className = "project-client-field";
      label.append(document.createElement("select"));
      return label;
    }
    function createProjectParentAssignment(project, client) {
      const label = stubs.marked("label", "parent-project");
      label.className = "project-parent-field";
      label.append(document.createElement("select"));
      return label;
    }
    function requireParentProjectSelect(label) { return label.children[0]; }
    function createProjectClientShortcutActions() { return stubs.marked("div", "client-actions"); }
    function populateParentProjectSelect() {}
    function editorStub(mark) { return { element: stubs.marked("fieldset", mark), getValue: () => null, setDisabled() {}, setBillableMode() {} }; }
    function createBillingPeriodEditor() { return editorStub("billing-period"); }
    function createBillingRoundingEditor() { return editorStub("billing-rounding"); }
    function createTaskReminderPolicyEditor() { return editorStub("reminders"); }
    function createProjectTaskDefaultsEditor() { return editorStub("task-defaults"); }
    function getProjectBillingPeriodInheritLabel() { return "inherit period"; }
    function getEffectiveClientBillingPeriod() { return null; }
    function getProjectRoundingInheritLabel() { return "inherit rounding"; }
    function getEffectiveClientBillingRounding() { return null; }
    function createClientProjectActionButton(label) { const button = stubs.marked("button", "action:" + label); return button; }
  `, context);
  for (const name of [...CLIENT_EDITOR_CLOSURE, "createProjectEditor"]) {
    vm.runInContext(extractFunctionBlock(text, name), context);
  }
  /** @type {EditorFunctions} */
  const page = vm.runInContext(`({ ${[...CLIENT_EDITOR_CLOSURE.slice(0, 5), "createProjectEditor"].join(", ")} })`, context);
  // Every contact field present, as `normalizeBillingContact` always leaves it.
  /** @type {Array<Record<string, unknown>>} */
  const clients = vm.runInContext(`
    clientProjectData.clients.forEach((client) => {
      client.billing_contact = Object.fromEntries(billingContactFields.map(([field]) => [field, client.billing_contact[field] || ""]));
    });
    clientProjectData.clients;
  `, context);
  return { clients, document, log, page };
}

/** @typedef {ReturnType<typeof editorsFrom>} Editors */

const PROJECT = {
  id: "p-1", name: "Launch", client_id: "c-a", parent_project_id: "", status: "Active", billable: "yes",
  billing_rate: "90", billing_period: null, billing_rounding: null, taskReminderPolicy: null, taskDefaults: {}, tags: [],
};

/** @type {Record<string, [Parameters<typeof editorsFrom>[1], (editors: Editors) => unknown]>} */
const SCENARIOS = {
  "client name editor, as its caller builds it": [{}, ({ clients, page }) => snapshot(page.createClientNameEditor(clients[1], { showSaveButton: false }))],
  "client name editor with its save button": [{}, ({ clients, page }) => snapshot(page.createClientNameEditor(clients[0]))],
  "client name editor outside a business workspace": [{ workspaceType: "personal" }, ({ clients, page }) => snapshot(page.createClientNameEditor(clients[0], { showSaveButton: false }))],
  "parent choices exclude a client and its descendants": [{}, ({ clients, document, page }) => {
    const field = snapshot(page.createParentClientField(clients[0]));
    const unfiltered = document.createElement("select");
    page.populateParentClientSelect(unfiltered);
    const kept = document.createElement("select");
    page.populateParentClientSelect(kept);
    kept.value = "c-e";
    page.populateParentClientSelect(kept, "c-b");
    return { field, unfiltered: snapshot(unfiltered), kept: snapshot(kept), keptValue: kept.value };
  }],
  "contact editor, as its caller builds it, and its submit": [{}, async ({ clients, log, page }) => {
    const editor = page.createBillingContactEditor(clients[0], { showSaveButton: false });
    const built = snapshot(editor);
    const form = editor.children[1];
    await form.dispatchEvent({ type: "submit" });
    await Promise.resolve();
    return { built, log: [...log] };
  }],
  "contact editor with its save button, and its submit": [{}, async ({ clients, log, page }) => {
    const client = clients[0];
    const editor = page.createBillingContactEditor(client);
    const built = snapshot(editor);
    const form = editor.children[1];
    form.children[0].children[0].value = "  Ada Lovelace  ";
    await form.dispatchEvent({ type: "submit" });
    await Promise.resolve();
    return { built, log: [...log], contact: client.billing_contact };
  }],
  "contact editor, closed for another client": [{}, ({ clients, page }) => snapshot(page.createBillingContactEditor(clients[4], { showSaveButton: false }))],
  "add-project submit button": [{}, ({ page }) => ["c-a", "__workspace_projects__"].map((id) => snapshot(page.createAddProjectSubmitButton(id)))],
  "project editor, inline, with a client assignment": [{}, ({ clients, page }) => snapshot(page.createProjectEditor(clients[0], { ...PROJECT }))],
  "project editor, inline, without a client assignment": [{ withClient: false }, ({ clients, page }) => snapshot(page.createProjectEditor(clients[0], { ...PROJECT }))],
  "project editor, modal, with a client assignment": [{}, ({ clients, page }) => snapshot(page.createProjectEditor(clients[0], { ...PROJECT }, { modalLayout: true }))],
  "project editor, modal, without a client assignment": [{ withClient: false }, ({ clients, page }) => snapshot(page.createProjectEditor(clients[0], { ...PROJECT }, { modalLayout: true }))],
  "project editor, simplified billing, action target": [{ simplified: true }, ({ clients, document, page }) => {
    const actionTarget = document.createElement("footer");
    const editor = snapshot(page.createProjectEditor(clients[0], { ...PROJECT }, { modalLayout: true, actionTarget }));
    return { editor, actionTarget: snapshot(actionTarget) };
  }],
};

/** @param {Parameters<typeof editorsFrom>[1]} settings @param {(editors: Editors) => unknown} scenario @param {string} text */
async function run(text, settings, scenario) {
  const editors = editorsFrom(text, settings);
  /** @type {unknown} */
  let outcome;
  try {
    outcome = await scenario(editors);
  } catch (error) {
    outcome = { threw: error instanceof Error ? error.message : String(error) };
  }
  return JSON.parse(JSON.stringify({ outcome }));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

/**
 * One node of a snapshot, as `snapshot` writes it.
 * @typedef {{ tag?: string, className?: string, text?: string, dataset?: Record<string, string>, children?: Snapshot[] }} Snapshot
 */

/**
 * The fields the project editor's wrapper holds, by what each one is.
 * @param {unknown} outcome
 */
function wrapperFields(outcome) {
  /** @type {Snapshot} */
  const root = JSON.parse(JSON.stringify(outcome));
  const wrapper = root.tag === "DETAILS" ? root.children?.[1] : root;
  return (wrapper?.children || []).map((child) => child.tag ? (child.dataset?.stub || child.className || child.tag) : `text:${child.text}`);
}

describe("The editors changed only their annotations, and one filter spelling", () => {
  it(`keeps every other body the ${BASE} body once JSDoc is removed`, () => {
    for (const name of UNCHANGED_BODIES) {
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(withoutJsDoc(extractFunctionBlock(baseline, name)));
    }
  });

  it("changes exactly one line of the project editor", () => {
    const now = withoutJsDoc(extractFunctionBlock(current, "createProjectEditor"));
    expect(now.split(CHANGED_LINE[0]).length, "the new spelling appears once").toBe(2);
    expect(now.replace(CHANGED_LINE[0], CHANGED_LINE[1])).toBe(withoutJsDoc(extractFunctionBlock(baseline, "createProjectEditor")));
  });
});

describe("Every editor builds exactly what it did", () => {
  it("matches its baseline version in every layout and state", async () => {
    for (const [name, [settings, scenario]] of Object.entries(SCENARIOS)) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, settings, scenario)));
      expect(now.outcome?.threw, `${name} runs`).toBeUndefined();
      expect(now, name).toEqual(before);
    }
  });

  it("drops the absent client field and keeps both field orders", async () => {
    const fields = async (/** @type {Parameters<typeof editorsFrom>[1]} */ settings, /** @type {object} */ options) =>
      wrapperFields((await run(current, settings, ({ clients, page }) => snapshot(page.createProjectEditor(clients[0], { ...PROJECT }, options)))).outcome);
    expect(await fields({}, {})).toEqual([
      "project-name-field", "client-assignment", "parent-project", "project-status-field",
      "client-actions", "task-defaults", "tags:Project Tags:project", "project-billing-details", "project-actions",
    ]);
    expect(await fields({ withClient: false }, { modalLayout: true })).toEqual([
      "project-name-field", "project-status-field", "parent-project",
      "client-actions", "task-defaults", "tags:Project Tags:project", "project-billing-details", "project-actions",
    ]);
  });

  it("anchors the client editors the comparison relies on", async () => {
    const parent = await run(current, {}, ({ document, page }) => {
      const select = document.createElement("select");
      page.populateParentClientSelect(select, "c-a");
      return select.options.map((option) => option.value);
    });
    expect(parent.outcome, "Acme and its descendants are left out, and so is the inactive client").toEqual(["", "c-e"]);
    const saved = await run(current, {}, ({ clients, page }) => {
      const editor = page.createClientNameEditor(clients[0]);
      return editor.children.at(-1)?.dataset;
    });
    expect(saved.outcome).toEqual({ saveClientButton: "c-a" });
    const button = await run(current, {}, ({ page }) => page.createAddProjectSubmitButton("c-a").dataset);
    expect(button.outcome).toEqual({ addProjectButton: "c-a" });
  });
});
