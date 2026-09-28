import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeNode} FakeNode */

/**
 * The Clients/Projects field and status helpers (`0.33.33.43.51`).
 *
 * Twelve helpers the editors build from gained annotations from their callers and nothing else.
 * Two of them are forwarders to the page controller and take its declared `unknown`; the rest take
 * what their callers pass. What these cases pin is everything each one produces or hands on: every
 * helper runs beside its `5205f6fe` version, in its own fake document with a capturing page
 * controller, over the argument shapes the real callers use. Compared are the arguments the
 * forwarders pass on (and that they pass the same object), the formatters' text, the DOM each
 * builder returns, the reminder editor's state after a toggle and after editing, the inherit labels,
 * and the saved-button flash with its restore.
 */

const BASE = "5205f6fe";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const HELPERS = [
  "createTaskReminderPolicyEditor", "createNumberField", "createOption", "formatToken", "formatOrdinal",
  "createStatusSelect", "createClientStatusSelect", "createBillableCheckbox", "populateBillingPeriodStartDays",
  "getProjectBillingPeriodInheritLabel", "setStatus", "flashSavedButton",
];
const CLOSURE = [
  ...HELPERS, "requirePageController", "readPositiveInteger", "normalizeReminderOffsetList",
  "normalizeTaskReminderPolicy", "normalizeBillableFlag", "normalizeBillingPeriod", "formatBillingPeriod",
  "getEffectiveClientBillingPeriod",
];

/**
 * The platform's `append` takes text as well as nodes, and `createNumberField` hands it its label
 * text. The shared fake's takes nodes only, so this document wraps text first, for both versions.
 */
class TextAppendingDocument extends FakeDocument {
  /** @param {string} tagName */
  createElement(tagName) {
    const element = super.createElement(tagName);
    const append = element.append.bind(element);
    element.append = /** @param {...(FakeNode | string | null | undefined | false)} children */ (...children) =>
      append(...children.map((child) => (typeof child === "string" ? this.createTextNode(child) : child)));
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
    min: Reflect.get(node, "min"),
    step: Reflect.get(node, "step"),
    checked: node.checked,
    selected: node.selected,
    hidden: node.hidden,
    text: node.children.length ? undefined : node.textContent,
    dataset: { ...node.dataset },
    children: node.children.map(snapshot),
  };
}

/** One argument as the log records it, whatever its type. @param {unknown} value */
function described(value) {
  if (typeof value === "symbol") return ["symbol", String(value)];
  return [typeof value, value !== null && typeof value === "object" ? JSON.stringify(value) : String(value)];
}

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

/**
 * @typedef {object} ReminderEditor
 * @property {FakeNode} element
 * @property {() => unknown} getValue
 *
 * @typedef {object} HelperFunctions
 * @property {(options: { legend: string, inheritLabel: string, value: unknown }) => ReminderEditor} createTaskReminderPolicyEditor
 * @property {(text: string, value: number) => { label: FakeNode, input: FakeNode }} createNumberField
 * @property {(value: unknown, text: unknown) => FakeNode} createOption
 * @property {(value: string) => string} formatToken
 * @property {(day: number) => string} formatOrdinal
 * @property {(value: string) => FakeNode} createStatusSelect
 * @property {(value: string) => FakeNode} createClientStatusSelect
 * @property {(value: string) => FakeNode} createBillableCheckbox
 * @property {(select: FakeNode) => void} populateBillingPeriodStartDays
 * @property {(client: object) => string} getProjectBillingPeriodInheritLabel
 * @property {(message: unknown, options?: object) => void} setStatus
 * @property {(selector: string | undefined) => unknown} flashSavedButton
 * @property {(policy: unknown) => unknown} normalizeTaskReminderPolicy
 */

/**
 * One version's helpers, lifted into a sandbox with its own document and a capturing controller.
 * @param {string} text
 */
function helpersFrom(text) {
  const document = new TextAppendingDocument();
  /** @type {unknown[][]} */
  const log = [];
  /** @type {unknown[][]} */
  const received = [];
  /** @type {Array<() => void>} */
  const timers = [];
  const querySelector = document.querySelector.bind(document);
  document.querySelector = (selector) => {
    log.push(["querySelector", selector]);
    return querySelector(selector);
  };
  const pageController = {
    /** @param {unknown} value @param {unknown} label */
    createOption(value, label) {
      received.push([value, label]);
      log.push(["createOption", described(value), described(label)]);
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label == null ? "" : String(label);
      return option;
    },
    /** @param {unknown} element @param {unknown} message @param {unknown} options */
    setStatus(element, message, options) {
      received.push([element, message, options]);
      log.push(["setStatus", described(element), described(message), described(options)]);
    },
  };
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: {
      LongtailForge: { pageController },
      /** @param {() => void} callback @param {unknown} delay */
      setTimeout(callback, delay) {
        timers.push(callback);
        log.push(["setTimeout", delay]);
        return timers.length;
      },
    },
  });
  vm.runInContext(declaration(text, "  const clientStatuses = [", "];"), context);
  vm.runInContext(declaration(text, "  const projectStatuses = [", "];"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  for (const name of CLOSURE) vm.runInContext(extractFunctionBlock(text, name), context);
  /** @type {HelperFunctions} */
  const page = vm.runInContext(`({ ${[...HELPERS, "normalizeTaskReminderPolicy"].join(", ")} })`, context);
  return { context, document, log, page, received, timers };
}

/** @typedef {ReturnType<typeof helpersFrom>} Helpers */

/** @type {Record<string, (helpers: Helpers) => unknown>} */
const SCENARIOS = {
  "createOption hands every argument shape on": ({ page }) => [
    ["", "No status change"], ["c-1", "Acme"], [42, "Numeric id"], ["", undefined], [null, null],
    ["__workspace__", "Workspace project"],
  ].map(([value, text]) => snapshot(page.createOption(value, text))),
  "setStatus hands the message and options on": ({ page }) => {
    page.setStatus("Loading clients and projects...");
    page.setStatus("");
    page.setStatus("Client name is required.", { isError: true });
    page.setStatus(404, { isError: true });
    page.setStatus({ code: "E" });
    page.setStatus(undefined);
    return null;
  },
  "formatToken formats task vocabulary": ({ page }) => ["open", "in_progress", "pending_review", "", "a__b", "high"]
    .map((value) => page.formatToken(value)),
  "formatOrdinal names every start day and the teens": ({ page }) => [...Array.from({ length: 31 }, (_, index) => index + 1),
    101, 111, 112, 113, 121, 122, 123].map((day) => page.formatOrdinal(day)),
  "createNumberField builds the reminder fields": ({ page }) => [
    ["Timed Reminder 1 (hours before)", 2], ["Timed Reminder 2 (hours before)", 24],
    ["Date-Only Reminder 1 (days before)", 3], ["Date-Only Reminder 2 (days before)", 48],
  ].map(([label, value]) => {
    const field = page.createNumberField(String(label), Number(value));
    return { label: snapshot(field.label), inputIsInLabel: field.label.children.includes(field.input) };
  }),
  "createTaskReminderPolicyEditor builds, toggles and reads back": ({ page }) => [
    null,
    { inherited: false, dateTime: [60, 2880], dateOnly: [1440] },
    { inherited: false },
    { inherited: true, offsets: { dateTime: [180] } },
  ].map((policy) => {
    const editor = page.createTaskReminderPolicyEditor({
      legend: "Task Reminder Defaults",
      inheritLabel: "Use workspace task reminder defaults",
      value: page.normalizeTaskReminderPolicy(policy),
    });
    const built = snapshot(editor.element);
    const readBack = editor.getValue();
    const inherit = editor.element.children[1].children[0];
    inherit.checked = !inherit.checked;
    inherit.dispatchEvent({ type: "change" });
    const toggled = { hidden: editor.element.children[2].hidden, value: editor.getValue() };
    const grid = editor.element.children[2];
    ["5", "abc", "0", "7"].forEach((value, index) => { grid.children[index].children[1].value = value; });
    return { built, readBack, toggled, edited: editor.getValue() };
  }),
  "the status selects select the record's status": ({ page }) => ({
    project: ["Active", "Inactive", "Completed"].map((status) => snapshot(page.createStatusSelect(status))),
    client: ["Active", "Inactive"].map((status) => snapshot(page.createClientStatusSelect(status))),
  }),
  "createBillableCheckbox checks the normalised flag": ({ page }) => ["yes", "no"]
    .map((value) => snapshot(page.createBillableCheckbox(value))),
  "populateBillingPeriodStartDays lists the start days": ({ document, page }) => {
    const select = document.createElement("select");
    page.populateBillingPeriodStartDays(select);
    return snapshot(select);
  },
  "getProjectBillingPeriodInheritLabel names where the period comes from": ({ context, page }) => {
    const clients = [
      { isWorkspaceScope: true, billing_period: null },
      { id: "c-1", billing_period: { type: "custom", startDay: 15 } },
      { id: "c-2", billing_period: null },
    ];
    const labels = clients.map((client) => page.getProjectBillingPeriodInheritLabel(client));
    vm.runInContext(`workspaceSettings = { ...workspaceSettings, billingPeriod: { type: "custom", startDay: 22 } };`, context);
    return [...labels, ...clients.map((client) => page.getProjectBillingPeriodInheritLabel(client))];
  },
  "flashSavedButton flashes the button that started the write": ({ document, page, timers }) => {
    const button = document.createElement("button");
    button.setAttribute("data-save-client-button", "c-1");
    button.textContent = "Save";
    document.body.append(button);
    const returned = [undefined, "", '[data-save-client-button="c-1"]', '[data-save-client-button="missing"]']
      .map((selector) => page.flashSavedButton(selector) === undefined);
    const flashed = { text: button.textContent, className: button.className };
    timers.splice(0).forEach((callback) => callback());
    return { returned, flashed, restored: { text: button.textContent, className: button.className } };
  },
};

/** @param {Helpers} helpers @param {(helpers: Helpers) => unknown} scenario */
function run(helpers, scenario) {
  helpers.log.length = 0;
  helpers.received.length = 0;
  helpers.timers.length = 0;
  /** @type {unknown} */
  let outcome;
  try {
    outcome = scenario(helpers);
  } catch (error) {
    outcome = { threw: error instanceof Error ? error.message : String(error) };
  }
  return JSON.parse(JSON.stringify({ outcome, log: helpers.log }));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("The helpers changed only their annotations", () => {
  it(`keeps every helper's body the ${BASE} body once JSDoc is removed`, () => {
    for (const name of HELPERS) {
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(withoutJsDoc(extractFunctionBlock(baseline, name)));
    }
  });
});

describe("Every helper produces and hands on exactly what it did", () => {
  it("matches its baseline version for every caller shape", () => {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const [now, before] = VERSIONS.map(([, text]) => run(helpersFrom(text), scenario));
      expect(now.outcome?.threw, `${name} runs`).toBeUndefined();
      expect(now, name).toEqual(before);
    }
  });

  it("forwards the caller's own values to the page controller", () => {
    const helpers = helpersFrom(current);
    const id = { wire: "c-9" };
    helpers.page.createOption(id, id);
    expect(helpers.received[0][0]).toBe(id);
    expect(helpers.received[0][1]).toBe(id);
    const options = { isError: true };
    helpers.page.setStatus(id, options);
    expect(helpers.received[1]).toEqual([null, id, options]);
    expect(helpers.received[1][1]).toBe(id);
    expect(helpers.received[1][2]).toBe(options);
    helpers.page.setStatus("Saved.");
    expect(helpers.received[2][2], "an omitted options argument arrives as an empty object").toEqual({});
  });

  it("anchors the outputs the comparison relies on", () => {
    const { document, page } = helpersFrom(current);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((day) => page.formatOrdinal(day)))
      .toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]);
    expect(page.formatToken("pending_review")).toBe("Pending Review");
    const select = document.createElement("select");
    page.populateBillingPeriodStartDays(select);
    expect(select.options.map((option) => option.value)).toEqual(Array.from({ length: 28 }, (_, index) => String(index + 1)));
    expect(page.createStatusSelect("Completed").selectedOptions.map((option) => option.value)).toEqual(["Completed"]);
    expect(page.createClientStatusSelect("Inactive").options.map((option) => option.value)).toEqual(["Active", "Inactive"]);
    expect(page.createBillableCheckbox("no").children[0].checked).toBe(false);
    expect(page.getProjectBillingPeriodInheritLabel({ isWorkspaceScope: true, billing_period: null }))
      .toBe("Use workspace billing period (Calendar month)");
    const editor = page.createTaskReminderPolicyEditor({
      legend: "Task Reminder Defaults",
      inheritLabel: "Use workspace task reminder defaults",
      value: page.normalizeTaskReminderPolicy({ inherited: false, dateTime: [60, 2880], dateOnly: [1440] }),
    });
    expect(JSON.parse(JSON.stringify(editor.getValue()))).toEqual({ inherited: false, dateTime: [60, 2880], dateOnly: [1440, 1440] });
    expect(editor.element.children[2].hidden).toBe(false);
    const flash = run(helpersFrom(current), SCENARIOS["flashSavedButton flashes the button that started the write"]);
    expect(flash.outcome).toEqual({
      returned: [true, true, true, true],
      flashed: { text: "Saved.", className: "is-saved" },
      restored: { text: "Save", className: "" },
    });
    expect(flash.log.filter((/** @type {unknown[]} */ entry) => entry[0] === "setTimeout")).toEqual([["setTimeout", 1600]]);
  });
});
