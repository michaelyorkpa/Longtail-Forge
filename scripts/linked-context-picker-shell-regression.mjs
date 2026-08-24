import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const helper = readText("public/js/shared/view-builder.js");
const css = readText("public/css/longtail-forge.css");
const pickerContract = readText("docs/linked-context-picker-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");

assert.doesNotMatch(helper, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "picker shell must not own data loading or browser storage");
assert.match(helper, /function createLinkedContextPicker/, "view builder should implement the shared Linked Context picker shell");
assert.match(helper, /function createLinkedContextList/, "view builder should implement the shared Linked Context read-list shell");
assert.match(helper, /createLinkedContextPicker,/, "view builder should expose the picker shell on LongtailForge.view");
assert.match(helper, /createLinkedContextList,/, "view builder should expose the read-list shell on LongtailForge.view");

/** @typedef {import("./test-support/fake-dom.mjs").FakeNode} FakeNode */
/**
 * Framework-owned update hooks the picker shell exposes through `viewParts`.
 * @typedef {{ setLinkedItems: (items: object[]) => void, setRecords: (records: object[]) => void, setTargets: (targets: object[]) => void, setReadonly: (readonly: boolean) => void }} PickerParts
 */
/** @typedef {FakeNode & { viewParts: PickerParts }} PickerNode */
/**
 * The published `LongtailForge.view` picker helper catalog under test.
 * @typedef {Record<string, (...args: unknown[]) => PickerNode>} PickerViewSurface
 */

const context = createFakeBrowserContext();
vm.runInNewContext(helper, context, { filename: "view-builder.js" });
const view = /** @type {PickerViewSurface} */ (context.window.LongtailForge.view);

assert.equal(typeof view.createLinkedContextPicker, "function", "LongtailForge.view.createLinkedContextPicker should be exposed");
assert.equal(typeof view.createLinkedContextList, "function", "LongtailForge.view.createLinkedContextList should be exposed");

const picker = view.createLinkedContextPicker({
  providers: [
    { moduleId: "clients-projects", targetType: "project", label: "Project" },
    { moduleId: "tasks", targetType: "task", label: "Task" },
  ],
  records: [
    {
      moduleId: "clients-projects",
      targetType: "project",
      targetId: "project-1",
      displayLabel: "Factory Power Converter",
      secondaryLabel: "Camper",
      sourceUrl: "/projects.html?id=project-1",
      isAvailable: true,
    },
  ],
  linkedItems: [
    {
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-1",
      displayLabel: "Examine trailer wiring",
      secondaryLabel: "Camper",
      sourceUrl: "/tasks.html?id=task-1",
      isAvailable: true,
    },
  ],
});

assert.equal(picker.tagName, "SECTION", "picker should render as a reusable section");
assert(picker.classList.contains("view-linked-context-picker"), "picker should use the framework picker class");
assert.equal(picker.getAttribute("aria-label"), "Linked Context picker");

const targetSelect = findByClass(picker, "view-linked-context-picker-target");
const searchInput = findByClass(picker, "view-linked-context-picker-search");
const recordSelect = findByClass(picker, "view-linked-context-picker-record");
const useTargetButton = findByDatasetValue(picker, "surfaceAction", "use-linked-context-target");
const row = findByClass(picker, "view-linked-context-picker-row");
const removeButton = findByDatasetValue(picker, "surfaceAction", "remove-linked-context");

assert(targetSelect, "picker should render a target select");
assert(searchInput, "picker should render a search input");
assert(recordSelect, "picker should render a record select");
assert(useTargetButton, "picker should render the Use Target action");
assert(row, "picker should render existing linked context rows");
assert(removeButton, "picker should render row remove actions");
assert.equal(targetSelect.children[0].textContent, "Project", "target labels should come from provider descriptors");
assert.equal(recordSelect.children[0].textContent, "Factory Power Converter", "record option labels should use provider displayLabel only");
assert.equal(findByClass(row, "view-linked-context-picker-row-label").textContent, "Examine trailer wiring");
assert.equal(findByClass(row, "view-linked-context-picker-row-secondary").textContent, "Camper");
assert.equal(findByClass(row, "view-linked-context-picker-row-label").tagName, "A", "row labels with source URLs should render as links");
assert.equal(row.dataset.targetType, "task", "row metadata should retain target type for module save handlers");
assert.equal(row.dataset.targetId, "task-1", "row metadata should retain target id for module save handlers");
assert.doesNotMatch(picker.textContent, /Project:|Client:|Task:/, "picker shell must not prefix provider labels with target-type strings");
assert.doesNotMatch(picker.textContent, /\bActive\b/, "picker shell must not append provider status strings");
assert.equal(typeof picker.viewParts.setLinkedItems, "function", "picker should expose a selected-row update hook");
assert.equal(typeof picker.viewParts.setRecords, "function", "picker should expose a record-option update hook");
assert.equal(typeof picker.viewParts.setTargets, "function", "picker should expose a provider-option update hook");
assert.equal(typeof picker.viewParts.setReadonly, "function", "picker should expose a readonly update hook");

picker.viewParts.setTargets([{ moduleId: "notes", targetType: "note", label: "Note" }]);
assert.equal(targetSelect.children[0].textContent, "Note", "target update hook should replace provider options");
picker.viewParts.setRecords([{ moduleId: "notes", targetType: "note", targetId: "note-1", displayLabel: "Reference Note" }]);
assert.equal(recordSelect.children[0].textContent, "Reference Note", "record update hook should replace record options");
picker.viewParts.setLinkedItems([{
  moduleId: "notes",
  targetType: "note",
  targetId: "note-1",
  displayLabel: "Reference Note",
  hintLabel: "Edit in Note Details",
  className: "notes-primary-context-row",
  removable: false,
}]);
const updatedRow = findByClass(picker, "notes-primary-context-row");
assert.equal(findByClass(updatedRow, "view-linked-context-picker-row-hint").textContent, "Edit in Note Details", "row hint text should render through shared row anatomy");
assert.equal(findByDatasetValue(updatedRow, "surfaceAction", "remove-linked-context"), null, "non-removable rows should not expose remove actions");
picker.viewParts.setReadonly(true);
assert(picker.classList.contains("is-readonly"), "readonly update hook should add readonly class");
assert.equal(recordSelect.disabled, true, "readonly update hook should disable controls");
picker.viewParts.setReadonly(false);
assert.equal(recordSelect.disabled, false, "readonly update hook should re-enable controls");

const emptyPicker = view.createLinkedContextPicker({
  providers: [{ moduleId: "tasks", targetType: "task", label: "Task" }],
  records: [],
  linkedItems: [],
});
assert.equal(findByClass(emptyPicker, "view-linked-context-picker-empty").textContent, "No linked context selected.");

const readonlyPicker = view.createLinkedContextPicker({
  readonly: true,
  permissionMessage: "You can view linked context but cannot change it.",
  providers: [{ moduleId: "tasks", targetType: "task", label: "Task" }],
  records: [{ moduleId: "tasks", targetType: "task", targetId: "task-1", displayLabel: "Task one" }],
  linkedItems: [{ moduleId: "tasks", targetType: "task", targetId: "task-1", displayLabel: "Task one" }],
});
assert(readonlyPicker.classList.contains("is-readonly"), "readonly picker should expose a readonly class");
assert.equal(readonlyPicker.getAttribute("data-view-readonly"), "true", "readonly picker should expose readonly state metadata");
assert(findByClass(readonlyPicker, "view-linked-context-picker-target").disabled, "readonly picker should disable target select");
assert(findByClass(readonlyPicker, "view-linked-context-picker-search").disabled, "readonly picker should disable search input");
assert(findByClass(readonlyPicker, "view-linked-context-picker-record").disabled, "readonly picker should disable record select");
assert(requireByDatasetValue(readonlyPicker, "surfaceAction", "use-linked-context-target").disabled, "readonly picker should disable Use Target");
assert(requireByDatasetValue(readonlyPicker, "surfaceAction", "remove-linked-context").disabled, "readonly picker should disable Remove");
assert.equal(findByClass(readonlyPicker, "view-linked-context-picker-state").textContent, "You can view linked context but cannot change it.");

const linkedContextList = view.createLinkedContextList({
  items: [{
    moduleId: "notes",
    targetType: "note",
    targetId: "note-1",
    displayLabel: "Installation note",
    secondaryLabel: "Internal | Normal",
    hintLabel: "Panel note excerpt",
    sourceUrl: "/notes.html?note=note-1",
  }],
});
assert(linkedContextList.classList.contains("view-linked-context-picker-list"), "linked context list should reuse picker list class");
assert.equal(findByClass(linkedContextList, "view-linked-context-picker-row-label").textContent, "Installation note");
assert.equal(findByClass(linkedContextList, "view-linked-context-picker-row-secondary").textContent, "Internal | Normal");
assert.equal(findByClass(linkedContextList, "view-linked-context-picker-row-hint").textContent, "Panel note excerpt");
assert.equal(findByClass(linkedContextList, "view-linked-context-picker-row-label").tagName, "A", "linked context list labels with source URLs should render as links");
assert.equal(typeof linkedContextList.viewParts.setLinkedItems, "function", "linked context list should expose a row update hook");
linkedContextList.viewParts.setLinkedItems([]);
assert.equal(findByClass(linkedContextList, "view-linked-context-picker-empty").textContent, "No linked context selected.");

assert.match(css, /\.view-linked-context-picker\s*\{[\s\S]*display:\s*grid/, "CSS should define picker shell layout");
assert.match(css, /\.view-linked-context-picker-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/, "CSS should define stable row/action layout");
assert.match(css, /\.view-linked-context-picker-row-hint\s*\{[\s\S]*color:\s*var\(--color-muted\)/, "CSS should style row hint text separately from record labels");
assert.match(css, /\.view-linked-context-picker-field input,[\s\S]*\.view-linked-context-picker-field select\s*\{[\s\S]*width:\s*100%/, "CSS should size picker controls to their fields");

assert.match(pickerContract, /as of 0\.33\.5\.18\.6\.5\.3/i, "picker contract should document the shell version");
assert.match(pickerContract, /`LongtailForge\.view\.createLinkedContextPicker\(options\)`/, "picker contract should name the shared shell helper");
assert.match(viewContract, /createLinkedContextPicker/, "view-building contract should list the shared picker primitive");
assert.match(viewContract, /createLinkedContextList/, "view-building contract should list the shared read-list primitive");
assert.match(moduleContract, /shared Linked Context picker shell/, "module contract should document framework picker anatomy ownership");

console.log("Linked Context picker shell regression passed.");

/**
 * Read one rendered picker element by class.
 *
 * Every caller asserts on the element it names, so a shell that stopped
 * rendering that part now fails naming the class rather than reading a member
 * off `null` further down.
 * @param {FakeNode} root @param {string} className @returns {FakeNode}
 */
function findByClass(root, className) {
  const element = root.querySelector(`.${className}`);
  assert.ok(element, `picker shell should render .${className}`);
  return element;
}

/**
 * Read one rendered picker action that must be rendered.
 *
 * These callers assert that readonly mode disables the action, which only means
 * something if the action is there to disable.
 * @param {FakeNode} root @param {string} name @param {string} value @returns {FakeNode}
 */
function requireByDatasetValue(root, name, value) {
  const element = findByDatasetValue(root, name, value);
  assert.ok(element, `picker shell should render the ${value} action`);
  return element;
}

/**
 * Read one rendered picker element by dataset value, or null when absent.
 *
 * Unlike `findByClass` this legitimately answers null: the assertions using it
 * prove that non-removable rows expose no remove action.
 * @param {FakeNode} root @param {string} name @param {string} value @returns {FakeNode | null}
 */
function findByDatasetValue(root, name, value) {
  return findDescendants(root).find((element) => element.dataset?.[name] === value) || null;
}

/** @param {FakeNode} root @returns {FakeNode[]} */
function findDescendants(root) {
  /** @type {FakeNode[]} */
  const results = [];
  /** @type {FakeNode[]} */
  const queue = [...root.children];
  while (queue.length) {
    const element = queue.shift();
    if (!element) {
      break;
    }
    results.push(element);
    queue.push(...element.children);
  }
  return results;
}
