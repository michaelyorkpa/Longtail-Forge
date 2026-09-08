import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Workspace Settings core form/control lookups, checked by `0.33.33.38.3.1`.
 *
 * **The estate carries no jsdom**, so this suite follows the harness `0.33.33.39.3` established:
 * a DOM double providing exactly the capabilities the shipped code uses, with the code itself
 * evaluated unmodified. Because the new lookups narrow with `instanceof`, the double supplies
 * **real constructors** for the three subtypes and instances that genuinely are instances of
 * them - the check is modelled accurately rather than relaxed to suit a fake.
 *
 * The five bindings are captured during module evaluation and that lifetime is deliberately
 * preserved: nothing re-queries, so a control replaced in the DOM after load is still not the one
 * this page writes to. That was true before this child and is asserted here so it stays a
 * decision rather than an accident.
 */

const page = readFileSync(new URL("../../public/js/workspace-settings.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/**
 * The page's own capture line for one binding, taken verbatim so the harness cannot drift.
 * @param {string} name
 */
function captureLine(name) {
  const match = new RegExp("^  const " + name + " = find\\w+\\(\"[^\"]+\"\\);$", "m").exec(page);
  assert.ok(match, name + " must be captured through a checked lookup");
  return match[0];
}

// --- the DOM double -------------------------------------------------------------------------

class FakeHTMLElement {
  constructor() {
    /** @type {string} */
    this.tag = "";
  }
}
class FakeHTMLFormElement extends FakeHTMLElement {
  constructor() {
    super();
    this.tag = "form";
    /** @type {{ type: string, handler: Function }[]} */
    this.listeners = [];
  }

  /** @param {string} type @param {Function} handler */
  addEventListener(type, handler) {
    this.listeners.push({ type, handler });
  }
}
class FakeHTMLInputElement extends FakeHTMLElement {
  constructor(type = "text") {
    super();
    this.tag = "input";
    this.type = type;
    this.value = "";
    this.checked = false;
  }
}
class FakeHTMLSelectElement extends FakeHTMLElement {
  constructor() {
    super();
    this.tag = "select";
    this.value = "";
  }
}
/** A node that is present under the right selector but is not the promised control. */
class FakeHTMLDivElement extends FakeHTMLElement {
  constructor() {
    super();
    this.tag = "div";
  }
}

/** @param {Record<string, FakeHTMLElement | undefined>} nodes */
function fakeDocument(nodes) {
  return {
    /** @param {string} selector */
    querySelector: (selector) => (selector in nodes ? nodes[selector] : null),
  };
}

const SELECTORS = {
  form: "[data-workspace-settings-form]",
  name: "[data-workspace-name-input]",
  type: "[data-workspace-type-input]",
  audit: "[data-audit-logging-enabled]",
  retention: "[data-audit-retention-days]",
};

/**
 * Every control present and of the type the settings host renders.
 * @returns {Record<string, FakeHTMLElement | undefined>}
 */
function completeMarkup() {
  return {
    [SELECTORS.form]: new FakeHTMLFormElement(),
    [SELECTORS.name]: new FakeHTMLInputElement("text"),
    [SELECTORS.type]: new FakeHTMLSelectElement(),
    [SELECTORS.audit]: new FakeHTMLInputElement("checkbox"),
    [SELECTORS.retention]: new FakeHTMLSelectElement(),
  };
}

/**
 * What the lifted module exposes: the five captured bindings, their guards, and the one writer
 * that reads the optional control.
 * @typedef {{
 *   settingsForm: unknown,
 *   workspaceNameInput: unknown,
 *   workspaceTypeSelect: unknown,
 *   auditLoggingEnabledInput: unknown,
 *   auditRetentionDaysSelect: unknown,
 *   requireWorkspaceSettingsForm: () => unknown,
 *   requireWorkspaceNameInput: () => unknown,
 *   requireAuditLoggingEnabledInput: () => unknown,
 *   requireAuditRetentionDaysSelect: () => unknown,
 *   setWorkspaceTypeValue: (workspaceType: unknown) => void,
 * }} ShippedForm
 */

/**
 * The shipped lookups, captures and guards, evaluated against a document double.
 * @param {Record<string, FakeHTMLElement | undefined>} nodes
 * @returns {ShippedForm}
 */
function shippedForm(nodes) {
  const document = fakeDocument(nodes);
  const built = new Function(
    "document", "HTMLFormElement", "HTMLInputElement", "HTMLSelectElement",
    [
      slice("  function findForm(selector) {"),
      slice("  function findInput(selector) {"),
      slice("  function findSelect(selector) {"),
      captureLine("settingsForm"),
      captureLine("workspaceNameInput"),
      captureLine("workspaceTypeSelect"),
      captureLine("auditLoggingEnabledInput"),
      captureLine("auditRetentionDaysSelect"),
      slice("  function requireWorkspaceSettingsForm() {"),
      slice("  function requireWorkspaceNameInput() {"),
      slice("  function requireAuditLoggingEnabledInput() {"),
      slice("  function requireAuditRetentionDaysSelect() {"),
      slice("  function normalizeWorkspaceType(value) {"),
      slice("  function setWorkspaceTypeValue(workspaceType) {"),
      `return {
        settingsForm, workspaceNameInput, workspaceTypeSelect,
        auditLoggingEnabledInput, auditRetentionDaysSelect,
        requireWorkspaceSettingsForm, requireWorkspaceNameInput,
        requireAuditLoggingEnabledInput, requireAuditRetentionDaysSelect,
        setWorkspaceTypeValue, document,
      };`,
    ].join("\n"),
  );
  return built(document, FakeHTMLFormElement, FakeHTMLInputElement, FakeHTMLSelectElement);
}

describe("each lookup answers the subtype the markup contract promises", () => {
  it("finds every control when the page is rendered as the settings host builds it", () => {
    const form = shippedForm(completeMarkup());
    assert.ok(form.settingsForm instanceof FakeHTMLFormElement);
    assert.ok(form.workspaceNameInput instanceof FakeHTMLInputElement);
    assert.ok(form.workspaceTypeSelect instanceof FakeHTMLSelectElement);
    assert.ok(form.auditLoggingEnabledInput instanceof FakeHTMLInputElement);
    assert.ok(form.auditRetentionDaysSelect instanceof FakeHTMLSelectElement);
  });

  it("matches the tags the settings host actually renders for these field types", () => {
    // `field({ type: "text" })` and `field({ type: "boolean" })` route to <input> - the second
    // through `inputTypeForField`, which answers "checkbox" - and `type: "select"` to <select>.
    const viewBuilder = readFileSync(new URL("../../public/js/shared/view-builder.js", import.meta.url), "utf8");
    assert.match(viewBuilder, /return type === "boolean" \? "checkbox" : type;/,
      "a boolean field is a checkbox input");
    assert.match(viewBuilder, /if \(options\.fieldType === "select" \|\| options\.fieldType === "multi-select"\) \{/);
    assert.match(viewBuilder, /const tagName = options\.fieldType === "textarea" \? "textarea" : "input";/);
    const host = readFileSync(new URL("../../public/js/shared/settings-host.js", import.meta.url), "utf8");
    assert.match(host, /dataset: \{ workspaceSettingsForm: "", settingsScope: "" \},/,
      "and the page shell is a real form element");
  });

  it("refuses a present node of the wrong subtype rather than typing it into one", () => {
    const wrong = completeMarkup();
    wrong[SELECTORS.name] = new FakeHTMLDivElement();
    wrong[SELECTORS.retention] = new FakeHTMLInputElement("text");
    wrong[SELECTORS.form] = new FakeHTMLDivElement();
    const form = shippedForm(wrong);
    assert.equal(form.workspaceNameInput, null, "a div under the name selector is not an input");
    assert.equal(form.auditRetentionDaysSelect, null, "an input under the retention selector is not a select");
    assert.equal(form.settingsForm, null, "a div under the form selector is not a form");
  });

  it("does not confuse the two input subtypes with each other", () => {
    // Both audit and name controls are inputs, so this proves the checks are per-selector rather
    // than one loose "is it an element" test wearing three names.
    const swapped = completeMarkup();
    swapped[SELECTORS.type] = new FakeHTMLInputElement("text");
    const form = shippedForm(swapped);
    assert.equal(form.workspaceTypeSelect, null, "an input is not a select");
    assert.ok(form.auditLoggingEnabledInput instanceof FakeHTMLInputElement,
      "while a genuine input is still found");
  });

  it("answers null for an absent control", () => {
    const form = shippedForm({});
    assert.equal(form.settingsForm, null, "settingsForm is absent");
    assert.equal(form.workspaceNameInput, null, "workspaceNameInput is absent");
    assert.equal(form.workspaceTypeSelect, null, "workspaceTypeSelect is absent");
    assert.equal(form.auditLoggingEnabledInput, null, "auditLoggingEnabledInput is absent");
    assert.equal(form.auditRetentionDaysSelect, null, "auditRetentionDaysSelect is absent");
  });

  it("uses a runtime check rather than an assertion, at every one of the five", () => {
    for (const opener of ["  function findForm(selector) {", "  function findInput(selector) {",
      "  function findSelect(selector) {"]) {
      const body = slice(opener);
      assert.match(body, /node instanceof HTML\w+Element \? node : null;/,
        opener + " must narrow by instanceof");
      assert.ok(!/\/\*\* @type \{/.test(body), "no JSDoc assertion stands in for the check");
      assert.ok(!/\bas\s+HTML/.test(body));
      assert.ok(!/querySelector\s*</.test(body), "and no generic type parameter is treated as validation");
    }
    for (const binding of ["settingsForm", "workspaceNameInput", "workspaceTypeSelect",
      "auditLoggingEnabledInput", "auditRetentionDaysSelect"]) {
      assert.match(captureLine(binding), /= find(Form|Input|Select)\(/,
        binding + " is captured through a checked lookup");
    }
    assert.ok(!/!\./.test(slice("  function requireWorkspaceNameInput() {")),
      "and no non-null assertion appears in the guards");
  });
});

describe("required controls fail where they already failed, with a name", () => {
  it("raises at the use point rather than during module evaluation", () => {
    // Capturing all five still succeeds with an empty document; only asking for one raises.
    const form = shippedForm({});
    assert.equal(form.workspaceNameInput, null, "capture itself does not throw");
    assert.throws(() => form.requireWorkspaceNameInput(),
      /Workspace settings requires its workspace name input\./);
    assert.throws(() => form.requireAuditLoggingEnabledInput(),
      /Workspace settings requires its audit logging control\./);
    assert.throws(() => form.requireAuditRetentionDaysSelect(),
      /Workspace settings requires its audit retention control\./);
    assert.throws(() => form.requireWorkspaceSettingsForm(),
      /Workspace settings requires its settings form\./);
  });

  it("answers the control itself when it is present", () => {
    const nodes = completeMarkup();
    const form = shippedForm(nodes);
    assert.equal(form.requireWorkspaceNameInput(), nodes[SELECTORS.name]);
    assert.equal(form.requireAuditLoggingEnabledInput(), nodes[SELECTORS.audit]);
    assert.equal(form.requireAuditRetentionDaysSelect(), nodes[SELECTORS.retention]);
    assert.equal(form.requireWorkspaceSettingsForm(), nodes[SELECTORS.form]);
  });

  it("treats a wrong subtype exactly as absence, which is a named tightening", () => {
    // Previously a `<div data-workspace-name-input>` had `value === undefined`, so the save
    // normalised it to `""` and the page said "Workspace name is required." It now raises a
    // named markup-contract error instead. Stated rather than described as unchanged.
    const wrong = completeMarkup();
    wrong[SELECTORS.name] = new FakeHTMLDivElement();
    const form = shippedForm(wrong);
    assert.throws(() => form.requireWorkspaceNameInput(),
      /Workspace settings requires its workspace name input\./);
  });

  it("keeps each required failure inside the boundary that already caught it", () => {
    const load = page.slice(page.indexOf("  async function loadSettingsForm() {"),
      page.indexOf("  async function loadRuntimeDiagnostics() {"));
    for (const use of ["requireWorkspaceNameInput().value = settings.workspaceName;",
      "requireAuditLoggingEnabledInput().checked = settings.audit.loggingEnabled;",
      "requireAuditRetentionDaysSelect().value = String(settings.audit.retentionDays);"]) {
      const at = load.indexOf(use);
      assert.notEqual(at, -1, use + " must be the load path's use point");
      assert.ok(at < load.indexOf("} catch (error) {"),
        use + " must raise inside the load path's existing catch");
    }
    assert.match(load, /handleApiError\(error, "Workspace settings could not be loaded\."\);/,
      "which is the page's existing load-error path");
  });

  it("does not hoist a throw ahead of the optional listeners that precede the form", () => {
    const before = page.slice(0, page.indexOf("requireWorkspaceSettingsForm().addEventListener(\"submit\""));
    assert.ok(before.includes("createWorkspaceBackupButton?.addEventListener"),
      "the optional bindings still attach first");
    assert.ok(!/requireWorkspaceNameInput\(\)|requireAuditLoggingEnabledInput\(\)|requireAuditRetentionDaysSelect\(\)/.test(before),
      "and no required control is demanded before them");
    assert.equal((page.match(/requireWorkspaceSettingsForm\(\)\.addEventListener/g) || []).length, 1,
      "the form is required exactly where it was already dereferenced unguarded");
  });

  it("keeps the save's required reads at the same point they already threw", () => {
    const save = page.slice(page.indexOf("  async function saveSettings() {"),
      page.indexOf("  function normalizeSettings(settings) {"));
    // `saveSettings` already opened by calling `requireWorkspaceSettingsForm()`, so this path
    // already raised outside a catch when the form was missing. The three control guards sit
    // after it and propagate identically.
    assert.ok(save.indexOf("requireWorkspaceSettingsForm()") < save.indexOf("requireWorkspaceNameInput().value"),
      "the form precondition still comes first");
    assert.match(save, /workspaceName: requireWorkspaceNameInput\(\)\.value,/);
    assert.match(save, /loggingEnabled: requireAuditLoggingEnabledInput\(\)\.checked,/);
    assert.match(save, /retentionDays: requireAuditRetentionDaysSelect\(\)\.value,/);
  });
});

describe("the optional control keeps its absence behaviour", () => {
  it("still writes through when the select is present", () => {
    const nodes = completeMarkup();
    const form = shippedForm(nodes);
    const select = nodes[SELECTORS.type];
    assert.ok(select instanceof FakeHTMLSelectElement, "the select is present before it is read");
    form.setWorkspaceTypeValue("personal");
    assert.equal(select.value, "personal");
  });

  it("still normalises an unrecognised type to business, as it did before", () => {
    const nodes = completeMarkup();
    const form = shippedForm(nodes);
    const select = nodes[SELECTORS.type];
    assert.ok(select instanceof FakeHTMLSelectElement, "the select is present before it is read");
    form.setWorkspaceTypeValue("nonprofit");
    assert.equal(select.value, "business");
  });

  it("does nothing at all when the select is absent, rather than raising", () => {
    const withoutType = completeMarkup();
    delete withoutType[SELECTORS.type];
    const form = shippedForm(withoutType);
    assert.equal(form.workspaceTypeSelect, null);
    assert.doesNotThrow(() => form.setWorkspaceTypeValue("family"),
      "an absent optional control is still skipped, not required");
  });

  it("does nothing when the node is present but the wrong subtype", () => {
    const wrong = completeMarkup();
    wrong[SELECTORS.type] = new FakeHTMLDivElement();
    const form = shippedForm(wrong);
    const planted = wrong[SELECTORS.type];
    assert.ok(planted instanceof FakeHTMLDivElement, "the wrong node is there before it is read");
    assert.doesNotThrow(() => form.setWorkspaceTypeValue("family"));
    assert.ok(!("value" in planted),
      "and it is not written to, because it is not the control");
  });

  it("keeps the save's optional read optional", () => {
    assert.match(page, /workspaceType: workspaceTypeSelect\?\.value,/,
      "the payload still reads it optionally; it was never promoted to required");
    assert.ok(!/requireWorkspaceTypeSelect/.test(page),
      "and no guard was invented for it");
  });
});

describe("the captured lifetime is preserved deliberately", () => {
  it("keeps using the node captured at evaluation after the document changes", () => {
    const nodes = completeMarkup();
    const original = nodes[SELECTORS.name];
    const form = shippedForm(nodes);
    // A later render replaces the control in the document. Nothing re-queries, so the page still
    // holds the original - the behaviour before this child, kept rather than quietly changed.
    nodes[SELECTORS.name] = new FakeHTMLInputElement("text");
    assert.equal(form.requireWorkspaceNameInput(), original,
      "the captured node is still the one written to");
    assert.notEqual(form.requireWorkspaceNameInput(), nodes[SELECTORS.name]);
  });

  it("queries each control exactly once, at module evaluation", () => {
    for (const binding of ["settingsForm", "workspaceNameInput", "workspaceTypeSelect",
      "auditLoggingEnabledInput", "auditRetentionDaysSelect"]) {
      assert.equal((page.match(new RegExp("const " + binding + " = find", "g")) || []).length, 1,
        binding + " is captured once");
      assert.ok(!new RegExp(binding + "\\s*=\\s*(document\\.)?(querySelector|find)").test(
        page.slice(page.indexOf("async function loadSettingsForm"))),
        binding + " is never re-queried later");
    }
  });

  it("caches null rather than fabricating a detached element", () => {
    const form = shippedForm({});
    assert.equal(form.workspaceNameInput, null, "absence is null, not a stand-in node");
    for (const opener of ["  function findForm(selector) {", "  function findInput(selector) {",
      "  function findSelect(selector) {"]) {
      assert.ok(!/createElement/.test(slice(opener)),
        opener + " must not manufacture an element");
    }
  });
});

describe("form behaviour this child must not have moved", () => {
  it("keeps submission, preventDefault and the save call", () => {
    const at = page.indexOf("requireWorkspaceSettingsForm().addEventListener(\"submit\"");
    assert.notEqual(at, -1);
    const listener = page.slice(at, page.indexOf("});", at));
    assert.match(listener, /event\.preventDefault\(\);/);
    assert.match(listener, /await saveSettings\(\);/);
  });

  it("runs the form through the renderer's validation before saving", () => {
    assert.match(page, /if \(!requireSettingsRenderer\(\)\.validate\(requireWorkspaceSettingsForm\(\)\)\) \{/,
      "validation still gates the save, and still receives the form");
    assert.match(page, /requireSettingsRenderer\(\)\.showValidationErrors\(requireWorkspaceSettingsForm\(\), error\);/);
    assert.match(page, /return requireSettingsRenderer\(\)\.collectPayload\(requireWorkspaceSettingsForm\(\)\);/,
      "and the payload is still collected from it");
  });

  it("keeps the required-name check and the immutable workspace-type control", () => {
    assert.match(page, /if \(!settings\.workspaceName\) \{\s*\n\s*setWorkspaceSettingsStatus\("Workspace name is required\."\);/);
    const host = readFileSync(new URL("../../public/js/shared/settings-host.js", import.meta.url), "utf8");
    assert.match(host, /\}, "workspaceTypeInput", \{ disabled: true \}\)/,
      "the workspace type control is still rendered disabled");
  });

  it("keeps load and save populating the same five fields", () => {
    for (const populate of [
      "requireWorkspaceNameInput().value = settings.workspaceName;",
      "setWorkspaceTypeValue(settings.workspaceType);",
      "requireAuditLoggingEnabledInput().checked = settings.audit.loggingEnabled;",
      "requireWorkspaceNameInput().value = savedSettings.workspaceName;",
      "setWorkspaceTypeValue(savedSettings.workspaceType);",
      "requireAuditLoggingEnabledInput().checked = savedSettings.audit.loggingEnabled;",
    ]) {
      assert.ok(page.includes(populate), populate + " must survive");
    }
  });

  it("touched no markup, no delivery and no namespace surface", () => {
    assert.ok(!/LongtailForge\.\w+\s*=/.test(page), "the lookups are file-local");
    for (const outOfScope of ["findForm", "findInput", "findSelect"]) {
      assert.equal((page.match(new RegExp("function " + outOfScope, "g")) || []).length, 1,
        outOfScope + " is declared once, in this page");
    }
  });

  it("left the cohorts this child excluded alone", () => {
    // The deletion dialog's own controls are still raw `Element` reads; they belong to a later
    // DOM child and are not borrowed into this one.
    assert.match(page, /const workspaceDeletionNameInput = document\.querySelector\(/,
      "the deletion dialog controls are untouched");
    assert.match(page, /const workspaceUsersDialog = document\.querySelector\(/,
      "and so is the users dialog");
  });
});
