import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const helper = readText("public/js/shared/view-builder.js");
const css = readText("public/css/longtail-forge.css");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const pickerContract = readText("docs/linked-context-picker-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.14.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.14.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.14.2", "package-lock package entry should report the current app version");

assert.doesNotMatch(helper, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "picker shell must not own data loading or browser storage");
assert.match(helper, /function createLinkedContextPicker/, "view builder should implement the shared Linked Context picker shell");
assert.match(helper, /function createLinkedContextList/, "view builder should implement the shared Linked Context read-list shell");
assert.match(helper, /createLinkedContextPicker,/, "view builder should expose the picker shell on LongtailForge.view");
assert.match(helper, /createLinkedContextList,/, "view builder should expose the read-list shell on LongtailForge.view");

const context = createBrowserContext();
vm.runInNewContext(helper, context, { filename: "view-builder.js" });
const view = context.window.LongtailForge.view;

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
assert(findByDatasetValue(readonlyPicker, "surfaceAction", "use-linked-context-target").disabled, "readonly picker should disable Use Target");
assert(findByDatasetValue(readonlyPicker, "surfaceAction", "remove-linked-context").disabled, "readonly picker should disable Remove");
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
assert.match(roadmap, /Completed 0\.33\.5\.18\.6\.1 through 0\.33\.5\.18\.6\.11 are archived/, "live roadmap should document that completed Notes slices are archived");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.6\.5\.2 - Framework Linked Context picker shell/, "completed picker shell slice should be archived out of the live roadmap");
assert.match(regressionSuite, /scripts\/linked-context-picker-shell-regression\.mjs/, "regression suite should include picker shell regression");

console.log("Linked Context picker shell regression passed.");

function createBrowserContext() {
  const document = new FakeDocument();
  const window = {
    document,
    LongtailForge: {
      icons: {
        createIconButton(options = {}) {
          const button = document.createElement("button");
          button.type = options.type || "button";
          button.classList.add("action-button");
          if (options.iconOnly !== false && !options.text) {
            button.classList.add("icon-button");
            button.setAttribute("aria-label", options.label);
            button.title = options.title || options.label;
          }
          if (options.text) {
            button.textContent = options.text;
          }
          button.dataset.icon = options.icon;
          return button;
        },
      },
    },
  };
  return { window, document };
}

function FakeDocument() {
  this.createElement = (tagName) => new FakeElement(tagName);
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
  this.open = false;
  this.hidden = false;
  this.disabled = false;
  this.selected = false;
  this.value = "";
  this.type = "";

  this.append = (...children) => {
    children.forEach((child) => this.appendChild(child));
  };

  this.appendChild = (child) => {
    this.children.push(child);
    child.parentNode = this;
    return child;
  };

  this.setAttribute = (name, value) => {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
    }
    if (name === "value") {
      this.value = String(value);
    }
    if (name === "type") {
      this.type = String(value);
    }
  };

  this.getAttribute = (name) => (this.attributes.has(name) ? this.attributes.get(name) : null);

  this.addEventListener = () => {};

  this.querySelector = (selector) => findElement(this, selector);

  Object.defineProperty(this, "className", {
    get: () => this.classList.toString(),
    set: (value) => {
      this.classList = new FakeClassList(this);
      String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
    },
  });

  Object.defineProperty(this, "textContent", {
    get: () => {
      if (this._textContent) {
        return this._textContent;
      }
      return this.children.map((child) => child.textContent).join("");
    },
    set: (value) => {
      this._textContent = String(value ?? "");
      this.children = [];
    },
  });
}

function FakeClassList(element) {
  this.element = element;
  this.values = new Set();

  this.add = (...names) => {
    names.filter(Boolean).forEach((name) => {
      const token = String(name);
      if (/\s/.test(token)) {
        throw new Error("The token can not contain whitespace.");
      }
      this.values.add(token);
    });
    this.element.attributes.set("class", this.toString());
  };

  this.contains = (name) => this.values.has(name);
  this.remove = (...names) => {
    names.filter(Boolean).forEach((name) => this.values.delete(String(name)));
    this.element.attributes.set("class", this.toString());
  };
  this.toString = () => [...this.values].join(" ");
}

function findByClass(root, className) {
  return findElement(root, `.${className}`);
}

function findByDatasetValue(root, name, value) {
  return findDescendants(root).find((element) => element.dataset?.[name] === value) || null;
}

function findElement(root, selector) {
  return findDescendants(root).find((element) => matchesSelector(element, selector)) || null;
}

function findDescendants(root) {
  const results = [];
  const queue = [...root.children];
  while (queue.length) {
    const element = queue.shift();
    results.push(element);
    queue.push(...element.children);
  }
  return results;
}

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
