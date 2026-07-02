import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.21.5", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.5", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.5", "package-lock package entry should report the current app version");

assert.match(renderer, /api\.getJson\(route, \{ cache: "no-store" \}\)/, "Renderer should fetch dataSource routes through shared api-client");
assert.match(renderer, /appendFilterQuery\(descriptor\.dataSource\.route/, "Renderer should derive the fetch route from the descriptor dataSource route");
assert.doesNotMatch(renderer, /\bfetch\(/, "Renderer should not bypass shared api-client with direct fetch");
assert.match(renderer, /bindRecord\(record, descriptor\.dataSource\.fieldBindings/, "Renderer should map records through descriptor fieldBindings");
assert.match(renderer, /Object\.defineProperty\(surface, "refresh"/, "Rendered surfaces should expose a descriptor-driven refresh path");
assert.match(regressionSuite, /scripts\/view-renderer-data-binding-regression\.mjs/, "Regression suite should include renderer data binding regression");

const context = createBrowserContext([
  {
    records: [
      {
        record_id: "sample-1",
        name: "Alpha",
        state: "Active",
        owner: "Sam",
        stats: { count: 2 },
        children: [
          { title: "First item", description: "Ready" },
        ],
      },
    ],
  },
  { records: [] },
]);
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const host = context.document.createElement("main");
const surface = context.window.LongtailForge.view.renderSurface(descriptor(), host);
assert.equal(typeof surface.refresh, "function", "Rendered surfaces should expose refresh()");
assert.match(surface.textContent, /Loading records/, "Initial data-bound render should show a loading status");

await surface.refresh();
assert.equal(context.window.LongtailForge.api.calls[0], "/api/sample-records", "Renderer should request the descriptor dataSource route");
assert.equal(surface.viewState.records[0].id, "sample-1", "Field bindings should map source IDs onto descriptor IDs");
assert.equal(surface.viewState.records[0].title, "Alpha", "Field bindings should map source names onto descriptor titles");
assert.match(surface.textContent, /Alpha/, "Bound table/detail/index text should render mapped title values");
assert.match(surface.textContent, /Active/, "Bound table/detail/badge text should render mapped status values");
assert.match(surface.textContent, /Sam/, "Bound detail metadata should render mapped owner values");
assert.match(surface.textContent, /2/, "Bound summary panels should render nested mapped values");
assert.match(surface.textContent, /First item/, "Bound item collections should render nested item rows");

await surface.refresh();
assert.match(surface.textContent, /No sample records/, "Empty responses should render descriptor empty states");

const errorContext = createBrowserContext([new Error("Data unavailable")]);
vm.runInNewContext(builder, errorContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, errorContext, { filename: "view-renderer.js" });
const errorHost = errorContext.document.createElement("main");
const errorSurface = errorContext.window.LongtailForge.view.renderSurface(descriptor(), errorHost);
await errorSurface.refresh();
assert.match(errorSurface.textContent, /Data unavailable/, "Renderer should render framework-owned error states");

const noSelectionContext = createBrowserContext([
  {
    records: [
      {
        record_id: "sample-2",
        name: "Beta",
        state: "Active",
      },
    ],
  },
]);
vm.runInNewContext(builder, noSelectionContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, noSelectionContext, { filename: "view-renderer.js" });
const noSelectionHost = noSelectionContext.document.createElement("main");
const noSelectionSurface = noSelectionContext.window.LongtailForge.view.renderSurface(noInitialSelectionDescriptor(), noSelectionHost);
await noSelectionSurface.refresh();
assert.equal(noSelectionSurface.viewState.selectedRecord, null, "Descriptors should be able to start with a blank detail selection");
assert.match(noSelectionSurface.textContent, /Choose a sample/, "Blank detail surfaces should keep descriptor guidance visible");

assert.match(changelog, /## Version 0\.33\.5\.16\.6 - /, "Changelog should include renderer data-binding version");

console.log("View renderer data binding regression passed.");

function descriptor() {
  return {
    id: "sample-data-bound",
    layout: "table-page",
    pageHeader: {
      title: "Samples",
      description: "Data-bound samples.",
    },
    indexPanel: {
      title: "Sample index",
      itemTitleField: "title",
      itemSubtitleField: "status",
      itemMetaFields: ["meta"],
      emptyState: {
        title: "No sample records",
      },
    },
    table: {
      columns: [
        { field: "title", label: "Title" },
        { field: "status", label: "Status" },
      ],
      emptyState: {
        title: "No sample records",
      },
    },
    detail: {
      header: {
        titleField: "title",
        metaField: "meta",
        badges: [{ field: "status" }],
      },
      summaryPanels: [
        {
          title: "Summary",
          items: [{ label: "Items", field: "itemCount" }],
        },
      ],
      itemForm: {
        fields: [
          { field: "title", type: "text", label: "Title" },
          { field: "status", type: "text", label: "Status" },
        ],
      },
      itemRows: {
        itemsField: "items",
        itemTitleField: "title",
        itemSubtitleField: "description",
        emptyState: {
          title: "No items",
        },
      },
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: {
        id: "record_id",
        title: "name",
        status: "state",
        meta: "owner",
        itemCount: "stats.count",
        items: "children",
      },
    },
  };
}

function noInitialSelectionDescriptor() {
  const next = descriptor();
  next.indexPanel = {
    ...next.indexPanel,
    initialSelection: "none",
    collapseOnSelect: true,
  };
  next.detail = {
    header: {
      title: "Choose a sample",
      description: "Select a sample to inspect it.",
    },
    emptyState: {
      title: "Choose a sample",
      message: "Select a sample to inspect it.",
    },
  };
  return next;
}

function createBrowserContext(responses) {
  const document = new FakeDocument();
  const queue = [...responses];
  const calls = [];
  const window = {
    document,
    LongtailForge: {
      api: {
        calls,
        async getJson(url) {
          calls.push(url);
          const next = queue.length > 0 ? queue.shift() : responses[responses.length - 1];
          if (next instanceof Error) {
            throw next;
          }
          return next;
        },
      },
      icons: {
        createIconButton(options = {}) {
          const button = document.createElement("button");
          button.type = options.type || "button";
          button.classList.add("action-button");
          button.textContent = options.text || options.label || "";
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
    if (name === "class") {
      this.className = String(value);
    }
  };

  this.getAttribute = (name) => (this.attributes.has(name) ? this.attributes.get(name) : null);

  this.addEventListener = () => {};

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

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
