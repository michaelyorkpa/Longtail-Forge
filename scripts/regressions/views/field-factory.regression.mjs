export const regressionMeta = Object.freeze({
  id: "views.field-factory",
  area: "views",
  tier: "focused",
  tags: ["browser", "contracts", "fields", "reporting"],
  description: "Proves field-factory metadata, editable grids, typed collection, message channels, raw-anatomy guardrails, and renderer, Reporting, and Settings adoption.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const readText = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const builderSource = readText("public/js/shared/view-builder.js");
const rendererSource = readText("public/js/shared/view-renderer.js");
const reportingSource = readText("public/js/reporting.js");
const settingsRendererSource = readText("public/js/shared/settings-renderer.js");
const settingsHostSource = readText("public/js/shared/settings-host.js");
const manifestContractSource = readText("src/core/modules/manifest-contract.js");
const settingsViews = [
  readText("views/protected/workspace-settings.html"),
  readText("views/protected/user-settings.html"),
  readText("views/protected/tasks-settings.html"),
  readText("views/protected/time-tracking-settings.html"),
];

const context = createBrowserContext();
vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
const view = context.window.LongtailForge.view;

assert(Object.isFrozen(view), "LongtailForge.view should remain a frozen primitive catalog");
assert.equal(typeof view.createField, "function", "the field factory should be exported");
assert.equal(typeof view.collectFieldValues, "function", "the typed field collector should be exported");

const numberField = view.createField({
  field: "estimate",
  type: "number",
  label: "Estimate",
  min: 0,
  max: 59,
  step: 1,
  inputmode: "numeric",
  required: true,
}, { value: 12, disabled: true });
const numberControl = numberField.viewParts.control;
assert.equal(numberField.tagName, "LABEL");
assert.equal(numberField.viewParts.label.getAttribute("for"), numberControl.id, "scalar labels should target their control");
assert.equal(numberControl.getAttribute("type"), "number");
assert.equal(numberControl.getAttribute("min"), "0");
assert.equal(numberControl.getAttribute("max"), "59");
assert.equal(numberControl.getAttribute("step"), "1");
assert.equal(numberControl.getAttribute("inputmode"), "numeric");
assert.equal(numberControl.value, "12");
assert.equal(numberControl.disabled, true);
assert.equal(numberControl.required, true);
assert.equal(typeof numberField.viewParts.setMessage, "function", "fields should expose a caller-owned message channel");
numberField.viewParts.setMessage("Estimate is required.", { invalid: true });
assert.equal(numberField.viewParts.message.hidden, false);
assert.equal(numberField.viewParts.message.textContent, "Estimate is required.");
assert.equal(numberControl.getAttribute("aria-invalid"), "true");
assert.match(numberControl.getAttribute("aria-describedby"), /-message$/);
numberField.viewParts.setMessage("");
assert.equal(numberField.viewParts.message.hidden, true);
assert.equal(numberControl.getAttribute("aria-invalid"), "false");
assert.equal(numberControl.getAttribute("aria-describedby"), null);

for (const [type, tagName, inputType] of [
  ["text", "INPUT", "text"],
  ["number", "INPUT", "number"],
  ["select", "SELECT", ""],
  ["multi-select", "SELECT", ""],
  ["boolean", "INPUT", "checkbox"],
  ["checkbox", "INPUT", "checkbox"],
  ["toggle", "INPUT", "checkbox"],
  ["switch", "INPUT", "checkbox"],
  ["textarea", "TEXTAREA", ""],
  ["date", "INPUT", "date"],
  ["time", "INPUT", "time"],
]) {
  const field = view.createField({
    field: `field-${type}`,
    type,
    label: type,
    options: [["one", "One"], ["two", "Two"]],
  });
  assert.equal(field.viewParts.control.tagName, tagName, `${type} should use the expected control element`);
  if (inputType) {
    assert.equal(field.viewParts.control.getAttribute("type"), inputType, `${type} should use the expected input type`);
  }
}

const multiField = view.createField({
  field: "projects",
  type: "multi-select",
  label: "Projects",
  options: [["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"]],
}, { value: ["alpha", "gamma"] });
assert.equal(multiField.viewParts.control.multiple, true);
assert.deepEqual(
  Array.from(multiField.viewParts.control.selectedOptions, (option) => option.value),
  ["alpha", "gamma"],
  "multi-select fields should bind collection values",
);

const booleanField = view.createField({ field: "enabled", type: "boolean", label: "Enabled" }, { value: false });
assert.equal(booleanField.viewParts.control.checked, false, "false boolean bindings should stay unchecked");
assert(booleanField.classList.contains("inline-option"), "boolean fields should use inline checkbox anatomy");

const switchField = view.createField({ field: "alerts", type: "toggle", label: "Alerts" }, { value: true });
assert.equal(switchField.viewParts.control.checked, true);
assert.equal(switchField.viewParts.control.getAttribute("role"), "switch");
assert(switchField.classList.contains("view-renderer-field-switch"));

const radioField = view.createField({
  field: "density",
  type: "radio",
  label: "Density",
  options: [["compact", "Compact"], ["comfortable", "Comfortable"]],
}, { value: "comfortable" });
assert.equal(radioField.tagName, "FIELDSET");
assert.equal(radioField.viewParts.label.tagName, "LEGEND");
assert.equal(radioField.viewParts.controls.length, 2);
assert.equal(radioField.viewParts.controls[0].name, "density");
assert.equal(radioField.viewParts.controls[1].checked, true, "radio groups should bind one selected value");

const textareaField = view.createField({ field: "summary", type: "textarea", label: "Summary", rows: 4 }, { value: "Bound text" });
assert.equal(textareaField.viewParts.control.value, "Bound text");
assert.equal(textareaField.viewParts.control.getAttribute("rows"), "4");

const editableNumber = view.createField({ field: "limit", type: "number", label: "Limit" }, { value: 5 });
const editableBoolean = view.createField({ field: "notify", type: "boolean", label: "Notify" }, { value: true });
const editableMulti = view.createField({
  field: "scopes",
  type: "multi-select",
  label: "Scopes",
  options: [["tasks", "Tasks"], ["notes", "Notes"]],
}, { value: ["tasks"] });
const editableRadio = view.createField({
  field: "density",
  type: "radio",
  label: "Density",
  options: [["compact", "Compact"], ["comfortable", "Comfortable"]],
}, { value: "compact" });
const disabledField = view.createField({ field: "protected", type: "text", label: "Protected" }, { value: "keep", disabled: true });
const editableGrid = view.createFieldGrid({
  editable: true,
  fields: [editableNumber, editableBoolean, editableMulti, editableRadio, disabledField],
});
editableNumber.viewParts.control.value = "12";
editableBoolean.viewParts.control.checked = false;
editableMulti.viewParts.control.options[0].selected = false;
editableMulti.viewParts.control.options[1].selected = true;
editableRadio.viewParts.controls[0].checked = false;
editableRadio.viewParts.controls[1].checked = true;
assert.equal(editableGrid.getAttribute("data-view-editable"), "true");
assert.equal(typeof editableGrid.viewParts.collectValues, "function");
assert.deepEqual(JSON.parse(JSON.stringify(editableGrid.viewParts.collectValues())), {
  limit: 12,
  notify: false,
  scopes: ["notes"],
  density: "comfortable",
}, "editable grids should collect live typed values and omit disabled controls");

assert.match(rendererSource, /function renderFieldShell\(field, view, options = \{\}\)[\s\S]*return view\.createField\(field, options\)/);
assert.match(rendererSource, /const editable = itemForm\.editable === true[\s\S]*disabled: !editable/);
assert.match(rendererSource, /const values = options\.values[\s\S]*Object\.prototype\.hasOwnProperty\.call\(values, fieldKey\)[\s\S]*fieldOptions\.value = values\[fieldKey\]/);
assert.match(rendererSource, /if \(control\.multiple\)[\s\S]*control\.selectedOptions/);
assert.match(rendererSource, /if \(control\.type === "radio"\)[\s\S]*querySelectorAll/);
assert.match(reportingSource, /fieldType = filter\.type === "project-multi-select"[\s\S]*"multi-select"[\s\S]*reportingView\.createField/);
assert.match(reportingSource, /function createDateField[\s\S]*reportingView\.createField\(\{[\s\S]*type: "date"/);
assert.match(manifestContractSource, /const VIEW_FIELD_TYPES = new Set\(\[[\s\S]*"multi-select"[\s\S]*"toggle"[\s\S]*"radio"[\s\S]*"time"/);
assert.match(manifestContractSource, /const VIEW_FIELD_FIELDS = new Set\(\[[\s\S]*"max"[\s\S]*"inputmode"/);
assert.match(manifestContractSource, /function validateViewFieldType[\s\S]*!VIEW_FIELD_TYPES\.has\(field\.type\)/);
assert.match(manifestContractSource, /new Set\(\["title", "label", "fields", "actions", "emptyState", "editable"\]\)/);
assert.match(settingsRendererSource, /view\.createFieldGrid\(/);
assert.match(settingsRendererSource, /view\.createField\(/);
assert.match(settingsRendererSource, /view\.collectFieldValues\(grid\)/);
assert.match(settingsHostSource, /view\.createActionButton\(/);
assert.match(settingsHostSource, /view\.createInlineActionRow\(/);
for (const [consumer, source] of [
  ["renderer", rendererSource],
  ["Reporting", reportingSource],
  ["Settings", settingsRendererSource],
]) {
  assert.doesNotMatch(source, /document\.createElement\(["'](?:input|select|textarea|label|fieldset|legend)["']\)/, `${consumer} should not hand-build field anatomy covered by the factory`);
}
for (const settingsView of settingsViews) {
  assert.match(settingsView, /js\/shared\/view-builder\.js[\s\S]*js\/shared\/settings-renderer\.js[\s\S]*js\/shared\/settings-host\.js/, "Settings consumers should load the field primitives, renderer, and host in order");
  assert.doesNotMatch(settingsView, /settings-(?:controls|normalizers)\.js/);
  assert.match(settingsView, /<main[^>]+data-settings-host="(?:workspace|user|module)"[^>]*><\/main>/);
  assert.doesNotMatch(settingsView, /<(?:form|fieldset|label|input|select|button|dialog)\b/, "Settings protected views should remain minimal hosts");
}
assert.match(settingsHostSource, /view\.createPageHeader\(/);
assert.match(settingsHostSource, /view\.createField\(/);
assert.match(settingsHostSource, /view\.createFieldGrid\(/);
assert.match(settingsHostSource, /view\.createActionButton\(/);
assert.doesNotMatch(settingsHostSource, /document\.createElement\(/);
assert.equal(existsSync(new URL("../../../public/js/shared/settings-controls.js", import.meta.url)), false);
assert.equal(existsSync(new URL("../../../public/js/shared/settings-normalizers.js", import.meta.url)), false);

vm.runInNewContext(settingsRendererSource, context, { filename: "settings-renderer.js" });
vm.runInNewContext(settingsHostSource, context, { filename: "settings-host.js" });
const workspaceHost = context.document.createElement("main");
workspaceHost.dataset.settingsHost = "workspace";
context.window.LongtailForge.settingsHost.mount(workspaceHost);
assert.equal(workspaceHost.querySelectorAll("[data-workspace-settings-form]").length, 1);
assert.equal(workspaceHost.querySelectorAll("[data-settings-attachment]").length, 1);
assert.equal(workspaceHost.querySelectorAll("[data-runtime-diagnostics-fieldset]").length, 1);
assert.equal(workspaceHost.querySelectorAll("[data-job-observability-fieldset]").length, 1);
const userHost = context.document.createElement("main");
userHost.dataset.settingsHost = "user";
context.window.LongtailForge.settingsHost.mount(userHost);
assert.equal(userHost.querySelectorAll("[data-user-theme-form]").length, 1);
assert.equal(userHost.querySelectorAll("[data-workspace-create-form]").length, 1);
assert.equal(userHost.querySelectorAll("[data-settings-attachment]").length, 2);
const moduleHost = context.document.createElement("main");
moduleHost.dataset.settingsHost = "module";
moduleHost.dataset.settingsModuleId = "tasks";
moduleHost.dataset.settingsTitle = "Tasks Settings";
context.window.LongtailForge.settingsHost.mount(moduleHost);
assert.equal(moduleHost.querySelectorAll("[data-module-settings-form]").length, 1);
assert.equal(moduleHost.querySelectorAll("[data-settings-attachment]").length, 1);
const settingsContainer = context.document.createElement("div");
const settingsSection = context.window.LongtailForge.settingsRenderer.renderSection(settingsContainer, {
  moduleId: "tasks",
  displayName: "Tasks",
  settings: [
    { id: "enabled", type: "boolean", label: "Enabled", value: false },
    { id: "limit", type: "number", label: "Limit", value: 7 },
    { id: "modes", type: "multi-select", label: "Modes", value: ["focus"], options: [{ value: "focus", label: "Focus" }, { value: "review", label: "Review" }] },
    { id: "protected", type: "text", label: "Protected", value: "fixed", readOnly: true },
    { id: "advanced", type: "toggle", label: "Advanced", value: false },
    { id: "detail", type: "text", label: "Detail", value: "retained", visibleWhen: { settingId: "advanced", equals: true } },
    { id: "guidance", type: "info", label: "Guidance", description: "Read the guidance.", readOnly: true },
  ],
});
assert.equal(settingsSection.tagName, "FIELDSET");
assert(settingsSection.classList.contains("view-settings-section"));
assert.equal(settingsSection.children[0].tagName, "LEGEND");
assert.equal(settingsSection.children[0].textContent, "Tasks");
assert.equal(settingsSection.querySelectorAll("[data-settings-save]").length, 0, "Settings sections should defer saving to the universal page actions");
const settingFields = settingsSection.querySelectorAll("[data-setting-field]");
const advancedField = settingFields.find((field) => field.dataset.settingField === "advanced");
const detailField = settingFields.find((field) => field.dataset.settingField === "detail");
const limitField = settingFields.find((field) => field.dataset.settingField === "limit");
assert.equal(detailField.hidden, true, "visibleWhen should hide a dependent field when its condition is false");
assert.equal(detailField.viewParts.control.disabled, true, "hidden dependent fields should be omitted from collection");
assert.deepEqual(JSON.parse(JSON.stringify(
  context.window.LongtailForge.settingsRenderer.collectPayload(settingsContainer),
)), {
  tasks: {
    enabled: false,
    limit: 7,
    modes: ["focus"],
    advanced: false,
  },
}, "Settings should preserve its nested payload shape through the generic field collector");
advancedField.viewParts.control.checked = true;
advancedField.viewParts.control.dispatchEvent({ type: "change" });
assert.equal(detailField.hidden, false, "visibleWhen should reveal a dependent field after the controller changes");
assert.equal(detailField.viewParts.control.disabled, false);
assert.equal(context.window.LongtailForge.settingsRenderer.collectPayload(settingsContainer).tasks.detail, "retained");

const surfaced = context.window.LongtailForge.settingsRenderer.showValidationErrors(settingsContainer, {
  message: "Setting 'tasks.limit' must be a number.",
});
assert.equal(surfaced, 1);
assert.equal(limitField.viewParts.message.textContent, "Setting 'tasks.limit' must be a number.");
assert.equal(limitField.viewParts.control.getAttribute("aria-invalid"), "true");
context.window.LongtailForge.settingsRenderer.clearValidationErrors(settingsContainer);
assert.equal(limitField.viewParts.control.getAttribute("aria-invalid"), "false");
limitField.viewParts.control.checkValidity = () => false;
limitField.viewParts.control.validationMessage = "Choose a valid limit.";
assert.equal(context.window.LongtailForge.settingsRenderer.validate(settingsContainer), false);
assert.equal(limitField.viewParts.message.textContent, "Choose a valid limit.");

console.log("View field factory regression passed.");

function createBrowserContext() {
  const document = new FakeDocument();
  const window = { document, LongtailForge: {} };
  return { window, document, Date, Object, Set, String };
}

function FakeDocument() {
  this.createElement = (tagName) => new FakeElement(tagName);
  this.querySelector = () => null;
  this.createTextNode = (text) => {
    const node = new FakeElement("#text");
    node.textContent = String(text);
    return node;
  };
}

function FakeElement(tagName) {
  this.tagName = String(tagName).toUpperCase();
  this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
  this.children = [];
  this.attributes = new Map();
  this.dataset = {};
  this.classList = new FakeClassList(this);
  this._textContent = "";
  this.checked = false;
  this.disabled = false;
  this.hidden = false;
  this.multiple = false;
  this.required = false;
  this.value = "";
  this._listeners = new Map();

  this.append = (...children) => children.forEach((child) => this.appendChild(child));
  this.appendChild = (child) => {
    this.children.push(child);
    child.parentNode = this;
    return child;
  };
  this.replaceChildren = (...children) => {
    this.children = [];
    this._textContent = "";
    children.forEach((child) => this.appendChild(child));
  };
  this.setAttribute = (name, value) => {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === "id" || name === "name" || name === "type" || name === "value") {
      this[name] = normalized;
    }
    if (name === "disabled" || name === "hidden" || name === "multiple" || name === "required") {
      this[name] = true;
    }
  };
  this.getAttribute = (name) => this.attributes.has(name) ? this.attributes.get(name) : null;
  this.removeAttribute = (name) => {
    this.attributes.delete(name);
  };
  this.addEventListener = (type, listener) => {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  };
  this.dispatchEvent = (event) => {
    (this._listeners.get(event?.type) || []).forEach((listener) => listener.call(this, event));
    return true;
  };
  this.matches = (selector) => matchesSelector(this, selector);
  this.querySelectorAll = (selector) => {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (matchesSelector(child, selector)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  };

  Object.defineProperty(this, "className", {
    get: () => this.classList.toString(),
    set: (value) => {
      this.classList = new FakeClassList(this);
      String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
    },
  });
  Object.defineProperty(this, "textContent", {
    get: () => this._textContent || this.children.map((child) => child.textContent).join(""),
    set: (value) => {
      this._textContent = String(value ?? "");
      this.children = [];
    },
  });
  Object.defineProperty(this, "options", {
    get: () => this.children.filter((child) => child.tagName === "OPTION"),
  });
  Object.defineProperty(this, "selectedOptions", {
    get: () => this.options.filter((option) => option.selected),
  });
}

function FakeClassList(element) {
  this.values = new Set();
  this.add = (...names) => names.filter(Boolean).forEach((name) => this.values.add(String(name)));
  this.contains = (name) => this.values.has(name);
  this.toString = () => [...this.values].join(" ");
  this.element = element;
}

function matchesSelector(element, selector) {
  const dataAttribute = String(selector).match(/^\[data-([a-z0-9-]+)\]$/i);
  if (dataAttribute) {
    const datasetKey = dataAttribute[1].replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    return element.attributes.has(`data-${dataAttribute[1]}`) || Object.prototype.hasOwnProperty.call(element.dataset, datasetKey);
  }
  return false;
}
