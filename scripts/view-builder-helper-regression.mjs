import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const helper = readText("public/js/shared/view-builder.js");
const css = readText("public/css/longtail-forge.css");
const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.5.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.5.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.5.2", "package-lock package entry should report the current app version");

assert.doesNotMatch(helper, /\binnerHTML\b|\binsertAdjacentHTML\b/, "view builder must not inject HTML strings");
assert.doesNotMatch(helper, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "view builder must not own data loading or browser storage");
assert.match(helper, /global\.LongtailForge = root/, "view builder should expose the shared namespace");
assert.match(helper, /root\.view = Object\.freeze/, "view builder namespace should be frozen");

const context = createBrowserContext();
vm.runInNewContext(helper, context, { filename: "view-builder.js" });
const view = context.window.LongtailForge.view;

for (const helperName of [
  "createPageHeader",
  "createStatusMessage",
  "createFilterPanel",
  "createCollapsibleIndexPanel",
  "createSplitListDetail",
  "createDataTable",
  "createDetailActionStrip",
  "createInfoPanel",
  "createModal",
  "createModalForm",
  "createFieldGrid",
  "createActionButton",
  "createEmptyState",
  "createDetailHeader",
  "createInlineActionRow",
]) {
  assert.equal(typeof view[helperName], "function", `LongtailForge.view.${helperName} should be exposed`);
}

const header = view.createPageHeader({
  title: "Lists",
  subtitle: "Operational execution",
  actions: [{ label: "Add List", icon: "add", action: "add", role: "primary" }],
});
assert.equal(header.tagName, "HEADER");
assert(header.classList.contains("view-page-header"), "page header should use view class");
assert.equal(header.querySelector("h1").textContent, "Lists");
assert.equal(header.querySelector("button").type, "button", "action buttons should default to type button");
assert.equal(header.querySelector("button").dataset.surfaceActionRole, "primary", "action role should be declared");

const status = view.createStatusMessage({ message: "Saved." });
assert(status.classList.contains("surface-main-panel"), "status messages should use a surface class");
assert.equal(status.getAttribute("role"), "status");
assert.equal(status.getAttribute("aria-live"), "polite");

const alert = view.createStatusMessage({ tone: "danger", message: "Failed." });
assert.equal(alert.getAttribute("role"), "alert");
assert.equal(alert.getAttribute("aria-live"), "assertive");

const empty = view.createEmptyState({ title: "No records", message: "Nothing to show." });
assert(empty.classList.contains("surface-card"), "empty states should use card surface styling");
assert.equal(empty.getAttribute("role"), "status");

const filter = view.createFilterPanel({
  title: "Filters",
  fields: [context.document.createElement("label")],
});
assert(filter.classList.contains("surface-main-panel"), "filter panels should use main panel surface styling");
assert(filter.querySelector(".view-field-grid"), "filter panel should contain a field grid");
assert.equal(filter.tagName, "DETAILS", "filter panels should be collapsible details");
assert.equal(filter.open, false, "filter panels should default to collapsed");
assert(view.createFilterPanel({ title: "Filters", fields: [], open: true }).open, "filter panels should honor the open option");

const index = view.createCollapsibleIndexPanel({ title: "Lists", body: ["Body"], open: false });
assert.equal(index.tagName, "DETAILS");
assert.equal(index.open, false);
assert.equal(index.querySelector("summary").textContent, "Lists");
assert(index.querySelector(".view-collapsible-index-title"), "collapsible index summaries should expose a title span");
const indexWithSummaryAction = view.createCollapsibleIndexPanel({
  title: "Notes",
  summaryActions: view.createElement("span", { text: "Page 1" }),
});
assert.equal(indexWithSummaryAction.querySelector(".view-collapsible-index-title").textContent, "Notes");
assert.equal(indexWithSummaryAction.querySelector(".view-collapsible-index-summary-actions").textContent, "Page 1");

const split = view.createSplitListDetail({ list: ["Index"], detail: ["Detail"] });
assert(split.querySelector(".view-split-list-detail-index"), "split helper should create index panel");
assert(split.querySelector(".view-split-list-detail-main"), "split helper should create detail panel");

const tableWrap = view.createDataTable({
  caption: "Records",
  columns: [{ key: "name", label: "Name", header: true }, { key: "status", label: "Status", align: "right" }],
  rows: [{ name: "Alpha", status: "Open" }],
  tableClassName: "list-table lists-table",
});
assert(tableWrap.classList.contains("view-table-wrap"), "data table should be wrapped");
assert(tableWrap.querySelector("table").classList.contains("list-table"), "data table should split compatibility table classes");
assert(tableWrap.querySelector("table").classList.contains("lists-table"), "data table should split whitespace-separated table classes");
assert.equal(tableWrap.querySelector("caption").textContent, "Records");
assert.equal(tableWrap.querySelector("th").getAttribute("scope"), "col");
assert.equal(tableWrap.querySelector("tbody th").getAttribute("scope"), "row");
assert.equal(tableWrap.querySelector("tbody td").dataset.align, "right");

const emptyTable = view.createDataTable({ columns: ["Name", "Status"], rows: [], emptyMessage: "No rows." });
assert.equal(emptyTable.querySelector(".view-data-table-empty").textContent, "No rows.");
assert.equal(emptyTable.querySelector(".view-data-table-empty").colSpan, 2);

const detailHeader = view.createDetailHeader({ title: "Project", meta: "Active", badges: [view.createElement("span", { text: "Open", className: "surface-chip" })] });
assert(detailHeader.querySelector(".view-detail-title"), "detail header should include a title");
assert(detailHeader.querySelector(".surface-chip-row"), "detail header should include badge row");

const info = view.createInfoPanel({ title: "Summary", items: [{ label: "Items", value: "3" }] });
assert(info.classList.contains("surface-main-panel"), "info panels should use main panel surface styling");
assert.equal(info.querySelector("dt").textContent, "Items");

const modal = view.createModal({ title: "Create Record", body: ["Body"], actions: [{ label: "Save", role: "primary" }] });
assert.equal(modal.tagName, "DIALOG");
assert.equal(modal.getAttribute("role"), "dialog");
assert.equal(modal.getAttribute("aria-modal"), "true");
assert(modal.getAttribute("aria-labelledby"), "modal should be labelled by generated title");
assert(modal.viewParts.body, "modal should expose viewParts body");
assert(modal.viewParts.footer.classList.contains("surface-modal-footer"), "modal footer should use surface footer class");

const modalForm = view.createModalForm({ title: "Edit Record", fields: [context.document.createElement("label")], actions: [{ label: "Cancel" }] });
assert.equal(modalForm.querySelector("form").getAttribute("method"), "dialog");
assert(modalForm.querySelector(".view-field-grid"), "modal forms should use field grids");

const row = view.createInlineActionRow({ actions: [{ label: "Edit", icon: "edit" }] });
assert(row.classList.contains("surface-dense-actions"), "inline action rows should use dense actions");

assert.throws(() => view.createActionButton({}), /visible text or an accessible label/, "action buttons should require an accessible name");
assert.throws(() => view.createPageHeader({}), /Page headers require a title/, "page headers should require titles");

assert.match(css, /\.view-page-header,[\s\S]*\.view-detail-header\s*\{[\s\S]*display:\s*flex/, "CSS should define page header layout");
assert.match(css, /\.view-table-wrap\s*\{[\s\S]*overflow-x:\s*auto/, "CSS should define table overflow wrapper");
assert.match(css, /\.view-filter-panel-fields,[\s\S]*\.view-field-grid\s*\{[\s\S]*flex-wrap:\s*wrap/, "CSS should define a wrapping field grid layout");
assert.match(css, /\.view-field-grid > \[data-view-field-width="narrow"\]/, "CSS should support narrow field width hints");
assert.match(css, /\.view-page-header\s*\{[\s\S]*margin-bottom:\s*8px;/, "CSS should define framework page-header separation");
assert.match(css, /\.view-stacked\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;/, "CSS should define the stacked layout container without panel gaps");
assert.match(css, /\.view-stacked \.view-collapsible-index-body\s*\{[\s\S]*overflow-y:\s*auto/, "CSS should cap the stacked index to a scroll region");
assert.match(css, /\.view-collapsible-index-summary-actions\s*\{[\s\S]*justify-content:\s*flex-end/, "CSS should support right-aligned collapsible summary actions");
assert.match(viewContract, /As of 0\.33\.5\.15\.6/, "view contract should report helper implementation version");
assert.match(viewContract, /`LongtailForge\.view` is implemented in `public\/js\/shared\/view-builder\.js`/, "view contract should document implemented helper location");
assert.match(changelog, /## Version 0\.33\.5\.15\.2 - /, "Changelog should include helper implementation version");
assert.match(regressionSuite, /scripts\/view-builder-helper-regression\.mjs/, "Regression suite should include helper regression");

console.log("View builder helper regression passed.");

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
  this.colSpan = 1;
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
  this.toString = () => [...this.values].join(" ");
}

function findElement(root, selector) {
  const parts = String(selector).trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return findDescendantMatch(root, parts, 0);
  }

  const queue = [...root.children];
  while (queue.length) {
    const element = queue.shift();
    if (matchesSelector(element, selector)) {
      return element;
    }
    queue.push(...element.children);
  }
  return null;
}

function findDescendantMatch(root, parts, index) {
  const queue = [...root.children];
  while (queue.length) {
    const element = queue.shift();
    if (matchesSelector(element, parts[index])) {
      if (index === parts.length - 1) {
        return element;
      }
      const nested = findDescendantMatch(element, parts, index + 1);
      if (nested) {
        return nested;
      }
    }
    queue.push(...element.children);
  }
  return null;
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
