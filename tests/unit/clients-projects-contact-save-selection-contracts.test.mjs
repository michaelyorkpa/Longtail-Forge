import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeNode} FakeNode */

/**
 * The Clients/Projects contact editor, client save and selection-input boundary (`0.33.33.43.55`).
 *
 * `saveClientSettings` reads its controls through the shared checked lookups, each for the element
 * type its one builder creates; its contact loop reads only inputs, keyed by a template that yields
 * the same property key; `querySelectionInputs` collects only inputs, which is all its callers
 * select; and the contact editor states its write's conversion, which `clients-projects-billing-
 * contact-conversion.spec.mjs` proves on real native inputs. Here every save and selection runs
 * beside its `70e1808c` version with the real shared `checked-dom.js` and controls of their
 * producers' types, and outcomes are compared as data. The one difference, which no producer
 * reaches, is pinned as a synthetic probe.
 */

const BASE = "70e1808c";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const checkedDomSource = reader.readText("public/js/shared/checked-dom.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const LIFTED = [
  "saveClientSettings", "querySelectionInputs", "requireCheckedDom", "normalizeBillingRate", "normalizeBillableFlag",
  "vocabularyHas", "normalizeBillingPeriod", "formatBillingPeriod", "formatOrdinal", "normalizeBillingRounding", "formatBillingRounding",
];

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

/**
 * @typedef {object} BoundaryFunctions
 * @property {(client: object, container: unknown, options?: object) => Promise<unknown>} saveClientSettings
 * @property {(selector: string) => FakeNode[]} querySelectionInputs
 */

/**
 * One version's save and selection readers in a sandbox with the real checked-DOM contract.
 * @param {string} text
 * @param {{ confirm?: boolean }} [settings]
 */
function boundaryFrom(text, settings = {}) {
  const document = new FakeDocument();
  /** @type {unknown[][]} */
  const log = [];
  const context = vm.createContext({ document, ...fakeDomConstructors(), window: {}, log, settings });
  vm.runInContext(checkedDomSource, context);
  for (const name of ["tagPickersByField", "billingPeriodEditorsByField", "billingRoundingEditorsByField"]) {
    vm.runInContext(declaration(text, `  const ${name} = `, ";"), context);
  }
  vm.runInContext(`
    let activeClientProjectsReadSurface = null;
    function setSurface(surface) { activeClientProjectsReadSurface = surface; }
    function setStatus(message) { log.push(["status", message]); }
    function requireModalDialogs() {
      return { confirm: async (options) => { log.push(["confirm", options.title]); return settings.confirm !== false; } };
    }
    async function saveClientRecord(client, action, viewState) {
      log.push(["save", JSON.stringify(client), JSON.stringify(action), JSON.stringify(viewState)]);
      return true;
    }
    function getEffectiveClientBillingPeriod(client) { return client.billing_period || { type: "calendarMonth", startDay: 1 }; }
    function getEffectiveClientBillingRounding(client) { return client.billing_rounding || { enabled: false, increment: "nearestQuarterHour" }; }
  `, context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(text, name), context);
  /** @type {BoundaryFunctions & { setSurface: (surface: unknown) => void }} */
  const page = vm.runInContext("({ saveClientSettings, querySelectionInputs, setSurface })", context);
  /** @type {{ tagPickersByField: WeakMap<object, unknown>, billingPeriodEditorsByField: WeakMap<object, unknown>, billingRoundingEditorsByField: WeakMap<object, unknown> }} */
  const maps = vm.runInContext("({ tagPickersByField, billingPeriodEditorsByField, billingRoundingEditorsByField })", context);
  return { document, log, maps, page };
}

/** @typedef {ReturnType<typeof boundaryFrom>} Boundary */

/**
 * A client editor built as the page's builders build it: name, rate, billable and contact inputs,
 * status and parent selects, the tag field and the two billing editors.
 * @param {Boundary} boundary
 * @param {{ name?: string, parent?: string, billing?: boolean }} [shape]
 */
function clientEditor({ document, maps }, shape = {}) {
  const editor = document.createElement("div");
  editor.className = "client-editor";
  /** @param {string} tag @param {Record<string, string>} dataset @param {Record<string, unknown>} [props] */
  const add = (tag, dataset, props = {}) => {
    const element = document.createElement(tag);
    Object.assign(element.dataset, dataset);
    Object.assign(element, props);
    editor.appendChild(element);
    return element;
  };
  add("input", { clientNameInput: "c-1" }, { value: shape.name ?? "  Acme Co  " });
  add("select", { clientStatusInput: "c-1" }, { value: "Inactive" });
  add("select", { clientParentInput: "c-1", clientParentField: "" }, { value: shape.parent ?? "" });
  const tags = add("div", { clientTags: "" });
  maps.tagPickersByField.set(tags, { readTagIds: () => ["t-1"] });
  if (shape.billing !== false) {
    add("input", { clientBillingRateInput: "c-1" }, { value: "120" });
    add("input", { clientBillableInput: "c-1" }, { checked: true });
    const period = add("fieldset", { billingPeriodEditor: "" });
    maps.billingPeriodEditorsByField.set(period, { getValue: () => ({ type: "custom", startDay: 15 }) });
    const rounding = add("fieldset", { billingRoundingEditor: "" });
    maps.billingRoundingEditorsByField.set(rounding, { getValue: () => ({ enabled: true, increment: "nearestHour" }) });
  }
  for (const [field, value] of [["name", "  Ada  "], ["email", "ada@example.com "], ["phone", "555"]]) {
    add("input", { billingContactField: field }, { value });
  }
  return editor;
}

const CLIENT = () => ({ id: "c-1", name: "Acme", status: "Active", parent_client_id: "", billing_contact: { name: "", email: "", phone: "" },
  billable: "no", billing_rate: null, billing_period: null, billing_rounding: null });

/** @type {Record<string, [Parameters<typeof boundaryFrom>[1], (boundary: Boundary) => unknown]>} */
const SCENARIOS = {
  "a full save": [{}, async (boundary) => [await boundary.page.saveClientSettings(CLIENT(), clientEditor(boundary), { flashSelector: "[data-x]" }), boundary.log]],
  "a parent move, confirmed": [{}, async (boundary) => [await boundary.page.saveClientSettings(CLIENT(), clientEditor(boundary, { parent: "c-9" })), boundary.log]],
  "a parent move, declined": [{ confirm: false }, async (boundary) => {
    const client = CLIENT();
    return [await boundary.page.saveClientSettings(client, clientEditor(boundary, { parent: "c-9" })), client, boundary.log];
  }],
  "an empty name": [{}, async (boundary) => [await boundary.page.saveClientSettings(CLIENT(), clientEditor(boundary, { name: "   " })), boundary.log]],
  "no container": [{}, async (boundary) => [await boundary.page.saveClientSettings(CLIENT(), null), boundary.log]],
  "an editor without billing inputs": [{}, async (boundary) => [await boundary.page.saveClientSettings(CLIENT(), clientEditor(boundary, { billing: false })), boundary.log]],
  "selection inputs across the surface and the page": [{}, ({ document, page }) => {
    /** @param {FakeNode} parent @param {string} id */
    const pick = (parent, id) => {
      const input = document.createElement("input");
      input.setAttribute("data-pick", "");
      input.dataset.id = id;
      parent.appendChild(input);
      return input;
    };
    pick(document.body, "page-before");
    const surface = document.createElement("section");
    document.body.appendChild(surface);
    pick(surface, "surface-a");
    const withoutSurface = page.querySelectionInputs("[data-pick]").map((input) => input.dataset.id);
    page.setSurface(surface);
    return [withoutSurface, page.querySelectionInputs("[data-pick]").map((input) => input.dataset.id)];
  }],
};

/** @param {string} text @param {Parameters<typeof boundaryFrom>[1]} settings @param {(boundary: Boundary) => unknown} scenario */
async function run(text, settings, scenario) {
  /** @type {unknown} */
  let outcome;
  try {
    outcome = await scenario(boundaryFrom(text, settings));
  } catch (error) {
    outcome = { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
  return JSON.parse(JSON.stringify({ outcome }));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

const SAVE_EDITS = [
  [
    "    const nameInput = container?.querySelector(\"[data-client-name-input]\");\n"
      + "    const statusSelect = container?.querySelector(\"[data-client-status-input]\");\n"
      + "    const parentClientSelect = container?.querySelector(\"[data-client-parent-field]\");",
    "    const nameInput = container ? requireCheckedDom().find(container, \"[data-client-name-input]\", HTMLInputElement) : null;\n"
      + "    const statusSelect = container ? requireCheckedDom().find(container, \"[data-client-status-input]\", HTMLSelectElement) : null;\n"
      + "    const parentClientSelect = container ? requireCheckedDom().find(container, \"[data-client-parent-field]\", HTMLSelectElement) : null;",
  ],
  [
    "    const billingRateInput = container?.querySelector(\"[data-client-billing-rate-input]\");\n"
      + "    const billableInput = container?.querySelector(\"[data-client-billable-input]\");",
    "    const billingRateInput = container\n      ? requireCheckedDom().find(container, \"[data-client-billing-rate-input]\", HTMLInputElement)\n      : null;\n"
      + "    const billableInput = container ? requireCheckedDom().find(container, \"[data-client-billable-input]\", HTMLInputElement) : null;",
  ],
  [
    "      client.billing_contact[input.dataset.billingContactField] = input.value.trim();",
    "      // Only the contact editor's inputs carry this attribute. The template key is the same property\n"
      + "      // key the bare read produced, for a missing field too.\n"
      + "      if (!(input instanceof HTMLInputElement)) {\n        return;\n      }\n"
      + "      client.billing_contact[`${input.dataset.billingContactField}`] = input.value.trim();",
  ],
];

describe("The boundary changed its reads by the named edits alone", () => {
  it(`keeps saveClientSettings the ${BASE} body but for its checked lookups`, () => {
    const expected = SAVE_EDITS.reduce((body, [from, to]) => body.replace(from, to), withoutJsDoc(extractFunctionBlock(baseline, "saveClientSettings")));
    expect(withoutJsDoc(extractFunctionBlock(current, "saveClientSettings"))).toBe(expected);
  });

  it("changes the contact editor by its stated conversion alone", () => {
    expect(withoutJsDoc(extractFunctionBlock(current, "createBillingContactEditor")))
      .toBe(withoutJsDoc(extractFunctionBlock(baseline, "createBillingContactEditor"))
        .replace("      input.value = client.billing_contact[fieldName];", "      input.value = `${client.billing_contact[fieldName]}`;"));
  });
});

describe("Every save and selection answers exactly what it did", () => {
  it("matches its baseline version in every case", async () => {
    for (const [name, [settings, scenario]] of Object.entries(SCENARIOS)) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, settings, scenario)));
      expect(now, name).toEqual(before);
      expect(now.outcome?.threw, `${name} runs`).toBeUndefined();
    }
  });

  it("anchors the save the comparison relies on", async () => {
    const { outcome } = await run(current, {}, SCENARIOS["a full save"][1]);
    expect(outcome[0]).toBe(true);
    const saved = JSON.parse(outcome[1].find((/** @type {unknown[]} */ entry) => entry[0] === "save")[1]);
    expect(saved).toMatchObject({
      name: "Acme Co", status: "Inactive", parent_client_id: "", tagIds: ["t-1"], billing_rate: "120", billable: "yes",
      billing_contact: { name: "Ada", email: "ada@example.com", phone: "555" },
      billing_period: { type: "custom", startDay: 15 }, billing_rounding: { enabled: true, increment: "nearestHour" },
    });
  });

  it("refuses only controls no builder draws: a non-input contact field or selection match", async () => {
    /** @param {Boundary} boundary */
    const scenario = async (boundary) => {
      const editor = clientEditor(boundary);
      const stray = boundary.document.createElement("div");
      stray.dataset.billingContactField = "fax";
      Object.assign(stray, { value: "stray" });
      editor.appendChild(stray);
      const client = CLIENT();
      await boundary.page.saveClientSettings(client, editor);
      const div = boundary.document.createElement("div");
      div.setAttribute("data-pick", "");
      boundary.document.body.appendChild(div);
      return { fax: Object.hasOwn(client.billing_contact, "fax"), picked: boundary.page.querySelectionInputs("[data-pick]").length };
    };
    const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, {}, scenario)));
    expect(before.outcome, "the bare reads took any element").toEqual({ fax: true, picked: 1 });
    expect(now.outcome, "the checked reads take only the inputs the builders draw").toEqual({ fax: false, picked: 0 });
  });
});
