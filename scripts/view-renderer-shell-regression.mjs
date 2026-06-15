import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const roadmap = readText("ROADMAP.md");
const decisions = readText("DECISIONS.md");
const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.16.10", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.16.10", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.16.10", "package-lock package entry should report the current app version");

assert.doesNotMatch(renderer, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "view renderer shell must not own data loading or browser storage");
assert.doesNotMatch(renderer, /\binnerHTML\b|\binsertAdjacentHTML\b/, "view renderer must not inject HTML strings");
assert.match(renderer, /root\.view = Object\.freeze\(\{[\s\S]*renderSurface/, "renderer should extend the frozen LongtailForge.view namespace");

for (const helperName of [
  "createPageHeader",
  "createFilterPanel",
  "createCollapsibleIndexPanel",
  "createSplitListDetail",
  "createDataTable",
  "createDetailHeader",
  "createDetailActionStrip",
  "createInfoPanel",
  "createModalForm",
  "createFieldGrid",
  "createEmptyState",
  "createElement",
]) {
  assert.match(renderer, new RegExp(`view\\.${helperName}`), `Renderer should use LongtailForge.view.${helperName}`);
}

const context = createBrowserContext();
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });
const { view } = context.window.LongtailForge;
assert.equal(typeof view.renderSurface, "function", "LongtailForge.view.renderSurface should be exposed");

const tableHost = context.document.createElement("main");
const tableSurface = view.renderSurface(createDescriptor({ layout: "table-page" }), tableHost);
assert.equal(tableHost.children.length, 1, "Renderer should mount one root surface into the host");
assert(tableSurface.classList.contains("view-renderer-layout-table-page"), "Table-page layout should add a layout class");
assert(tableSurface.querySelector(".view-page-header"), "Table-page layout should render a page header");
assert(tableSurface.querySelector(".view-filter-panel"), "Table-page layout should render filter shell anatomy");
assert(tableSurface.querySelector(".view-table-wrap"), "Table-page layout should render a table shell");
assert(tableSurface.querySelector(".view-modal-form"), "Table-page layout should render modal shells");
assert.equal(tableSurface.querySelector(".view-data-table-empty").textContent, "No sample records yet.", "Table shells should render descriptor empty states");

const splitHost = context.document.createElement("main");
const splitSurface = view.renderSurface(createDescriptor({ layout: "split-list-detail" }), splitHost);
assert(splitSurface.querySelector(".view-split-list-detail"), "Split layout should render a split workspace");
assert(splitSurface.querySelector(".view-collapsible-index"), "Split layout should render an index shell");
assert(splitSurface.querySelector(".view-detail-header"), "Split layout should render detail shell anatomy");

const singleHost = context.document.createElement("main");
const singleSurface = view.renderSurface(createDescriptor({ layout: "single-column" }), singleHost);
assert(singleSurface.classList.contains("view-renderer-layout-single-column"), "Single-column layout should add a layout class");
assert(singleSurface.querySelector(".view-collapsible-index"), "Single-column layout should render selector/index anatomy when declared");
assert(singleSurface.querySelector(".view-field-grid"), "Single-column layout should render field grid anatomy when declared");

for (const item of [
  "Add a renderer, for example `public/js/shared/view-renderer.js`, exposed as",
  "The renderer must use only the 0.33.5.15 `LongtailForge.view` primitives as its DOM engine.",
  "Render static descriptor anatomy for page headers, filter panels, selector/index shells,",
  "Keep this pass descriptor-in/static-rendering only: no app-shell delivery, no data fetching,",
  "Keep the engine boring: no client state store, no virtual DOM, no component lifecycle.",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(item)}`), `Roadmap item should be checked: ${item}`);
}

assert.match(roadmap, /`window\.LongtailForge\.view\.renderSurface\(descriptor, host\)`\./, "Roadmap should name the renderSurface browser API");
for (const item of [
  "`single-column`.",
  "`split-list-detail`.",
  "`table-page`.",
]) {
  assert.match(roadmap, new RegExp(`\\[x\\] ${escapeRegExp(item)}`), `Roadmap item should be checked: ${item}`);
}

assert.match(decisions, /## Version 0\.33\.5\.16\.4/, "Decisions should include renderer shell version");
assert.match(changelog, /## Version 0\.33\.5\.16\.4 - /, "Changelog should include renderer shell version");
assert.match(regressionSuite, /scripts\/view-renderer-shell-regression\.mjs/, "Regression suite should include renderer regression");

console.log("View renderer shell regression passed.");

function createDescriptor({ layout }) {
  return {
    id: `sample-${layout}`,
    layout,
    pageHeader: {
      title: "Sample Records",
      description: "Review sample records.",
      primaryAction: {
        id: "create-sample",
        label: "Create",
        role: "primary",
        behavior: "sample.create",
      },
    },
    filters: [
      {
        id: "status-filter",
        field: "status",
        type: "select",
        label: "Status",
      },
    ],
    indexPanel: {
      title: "Samples",
      emptyState: {
        title: "No samples",
        message: "No sample records loaded.",
      },
    },
    table: {
      columns: [
        { field: "title", label: "Title" },
        { field: "status", label: "Status", align: "right" },
      ],
      emptyState: {
        title: "No sample records yet.",
      },
    },
    detail: {
      header: {
        title: "Selected sample",
        description: "Choose a sample to inspect.",
      },
      actionStrip: {
        actions: [
          { id: "open-sample", label: "Open", role: "secondary", behavior: "sample.open" },
        ],
      },
      summaryPanels: [
        {
          title: "Summary",
          description: "Static summary shell.",
        },
      ],
      itemForm: {
        fields: [
          { field: "title", type: "text", label: "Title", required: true },
        ],
      },
      itemRows: {
        emptyState: {
          title: "No items",
          message: "No item rows loaded.",
        },
      },
    },
    modals: [
      {
        id: "edit-sample",
        title: "Edit Sample",
        fields: [
          { field: "title", type: "text", label: "Title" },
        ],
        footerActions: [
          { id: "save-sample", label: "Save", role: "primary", behavior: "sample.save" },
        ],
      },
    ],
    actions: [
      { id: "refresh-samples", label: "Refresh", role: "secondary", behavior: "sample.refresh" },
    ],
  };
}

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
          if (options.text) {
            button.textContent = options.text;
          } else {
            button.setAttribute("aria-label", options.label);
            button.title = options.title || options.label;
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
  this.parentNode = null;
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

  this.removeChild = (child) => {
    this.children = this.children.filter((existing) => existing !== child);
    child.parentNode = null;
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

  Object.defineProperty(this, "firstChild", {
    get: () => this.children[0] || null,
  });

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

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
