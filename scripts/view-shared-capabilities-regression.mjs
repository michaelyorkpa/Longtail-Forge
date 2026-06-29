import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

import { validateModuleManifest } from "../src/core/modules/manifest-contract.js";

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const contract = readText("src/core/modules/manifest-contract.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

// --- Source guards: the three shared capabilities live in the framework, not modules. ---
assert.match(renderer, /function appendFilterQuery/, "Renderer should build dataSource query params from filters");
assert.match(renderer, /function renderRegions/, "Renderer should render descriptor mount regions");
assert.match(renderer, /function flushMounts/, "Renderer should flush region mount behaviors");
assert.match(renderer, /mountType: "fieldOptions"/, "Renderer should mount descriptor option-source behaviors for select filters");
assert.match(renderer, /function setSelectOptions/, "Renderer should hydrate descriptor select options through a shared helper");
assert.match(renderer, /function tableColumnRenderer/, "Renderer should route table display hooks through framework-owned formatters");
assert.match(renderer, /function renderItemRow/, "Renderer should render rich item rows");
assert.match(renderer, /function evaluateVisibleWhen/, "Renderer should evaluate row-action visibility predicates");
assert.match(renderer, /function interpolateRoute/, "Renderer should interpolate row-action route tokens");
assert.match(contract, /function validateRegionsDescriptor/, "Manifest contract should validate descriptor regions");
assert.match(regressionSuite, /scripts\/view-shared-capabilities-regression\.mjs/, "Regression suite should include the shared capabilities regression");

// --- Manifest validation of the new descriptor fields. ---
const validErrors = validateModuleManifest(createModule());
assert.deepEqual(validErrors, [], `Shared-capability descriptor should pass validation: ${validErrors.join("; ")}`);

const missingBehaviorErrors = validateModuleManifest(createModule({
  viewSurfaces: [{ ...validSurface(), regions: [{ id: "side" }] }],
}));
assert.match(missingBehaviorErrors.join("\n"), /viewSurfaces\[0\]\.regions\[0\]\.behavior is required/, "Regions must declare a mount behavior");

const unknownRegionKeyErrors = validateModuleManifest(createModule({
  viewSurfaces: [{ ...validSurface(), regions: [{ id: "side", behavior: "x.mount", surprise: true }] }],
}));
assert.match(unknownRegionKeyErrors.join("\n"), /viewSurfaces\[0\]\.regions\[0\]\.surprise is not a supported field/, "Regions reject unknown keys");

const badVisibleWhenErrors = validateModuleManifest(createModule({
  viewSurfaces: [{
    ...validSurface(),
    detail: {
      itemRows: {
        itemsField: "items",
        rowActions: [{ id: "x", label: "X", behavior: "x.run", visibleWhen: { equals: "open" } }],
      },
    },
  }],
}));
assert.match(badVisibleWhenErrors.join("\n"), /visibleWhen\.field is required/, "Row-action visibleWhen must declare a field");

// --- Renderer capability execution via a fake DOM. ---
const context = createBrowserContext([
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
]);
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const view = context.window.LongtailForge.view;
let mountedWith = null;
view.registerBehavior("caps.mount", (ctx) => {
  mountedWith = ctx;
  ctx.container.appendChild(context.document.createElement("p")).textContent = "REGION_MOUNTED";
});
let optionMount = null;
view.registerBehavior("caps.statusOptions", (ctx) => {
  optionMount = ctx;
  return [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
  ];
});

const host = context.document.createElement("main");
const surface = view.renderSurface(capabilityDescriptor(), host);
await surface.refresh();
await Promise.resolve();

// Capability 1: filter -> refetch query params (default + dynamic).
assert.equal(context.window.LongtailForge.api.calls[0], "/api/caps?status=open", "Filter defaults should be applied to the dataSource query");
const statusSelect = surface.querySelector("[data-view-input=\"status\"]");
assert.equal(optionMount.control, statusSelect, "Option-source behaviors should receive the select control");
assert.equal(typeof optionMount.setOptions, "function", "Option-source behaviors should receive a shared setOptions helper");
assert.match(statusSelect.textContent, /OpenClosed/, "Option-source behaviors should hydrate select option labels");
surface.viewState.filterValues.status = "closed";
await surface.refresh();
assert.ok(context.window.LongtailForge.api.calls.includes("/api/caps?status=closed"), "Changing a filter should refetch with new query params");

// Capability 2: mount slot/region filled by a registered behavior.
assert.ok(mountedWith && typeof mountedWith.refresh === "function", "Mount behavior should receive a safe context with refresh");
assert.match(surface.textContent, /REGION_MOUNTED/, "Registered mount behavior should fill its region container");

// Capability 2b: display-only hierarchy metadata + chip-list table display hooks.
const hierarchyLabel = surface.querySelectorAll(".view-hierarchy-label")
  .find((element) => element.dataset.viewHierarchyDepth === "1");
assert.ok(hierarchyLabel, "Hierarchy display labels should render when requested by a table column formatter");
assert.equal(hierarchyLabel.dataset.viewHierarchyDepth, "1", "Hierarchy display labels should carry display-only depth metadata");
assert.match(surface.textContent, /Focus/, "Chip-list table display hooks should render safe chip labels");

// Capability 3: rich item rows + state-gated row actions.
assert.match(surface.textContent, /Item A/, "Item rows should render the item title");
assert.match(surface.textContent, /x2/, "Item rows should render chip values");
assert.match(surface.textContent, /hello/, "Item rows should render meta fields");
assert.match(surface.textContent, /Complete/, "Row actions matching visibleWhen should render");
assert.doesNotMatch(surface.textContent, /Reopen/, "Row actions failing visibleWhen should not render");

// Region-only detail surfaces should not invent an item collection placeholder.
const regionOnlyContext = createBrowserContext([]);
vm.runInNewContext(builder, regionOnlyContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, regionOnlyContext, { filename: "view-renderer.js" });
regionOnlyContext.window.LongtailForge.view.registerBehavior("caps.regionOnly", (ctx) => {
  ctx.container.appendChild(regionOnlyContext.document.createElement("p")).textContent = "REGION_ONLY_MOUNT";
});
const regionOnlyHost = regionOnlyContext.document.createElement("main");
const regionOnlySurface = regionOnlyContext.window.LongtailForge.view.renderSurface({
  id: "region-only-detail",
  layout: "single-column",
  detail: {
    regions: [{ id: "main-region", behavior: "caps.regionOnly" }],
  },
}, regionOnlyHost);
assert.match(regionOnlySurface.textContent, /REGION_ONLY_MOUNT/, "Region-only detail surfaces should mount registered regions");
assert.doesNotMatch(regionOnlySurface.textContent, /Items|No records loaded/, "Region-only detail surfaces should not render the generic item placeholder");

// Missing mount behavior fails visibly without breaking the surface.
const missingContext = createBrowserContext([{ records: [{ record_id: "r1", name: "Record One" }] }]);
vm.runInNewContext(builder, missingContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, missingContext, { filename: "view-renderer.js" });
const missingHost = missingContext.document.createElement("main");
const missingSurface = missingContext.window.LongtailForge.view.renderSurface({
  id: "missing-region",
  layout: "single-column",
  regions: [{ id: "side", behavior: "not.registered" }],
  dataSource: { route: "/api/caps", fieldBindings: { id: "record_id" } },
}, missingHost);
await missingSurface.refresh();
assert.match(missingSurface.textContent, /Missing view behavior handler: not\.registered/, "Missing mount behaviors should fail visibly");

console.log("View shared capabilities regression passed.");

function capabilityDescriptor() {
  return {
    id: "caps-sample",
    layout: "single-column",
    filters: [{ field: "status", type: "select", queryKey: "status", default: "open", optionsSource: "caps.statusOptions" }],
    indexPanel: {
      title: "Caps index",
      itemTitleField: "title",
      itemDepthField: "depth",
      itemParentField: "parentId",
      itemPathField: "path",
    },
    table: {
      hierarchy: { depthField: "depth", parentField: "parentId", pathField: "path" },
      columns: [
        { field: "title", label: "Title", formatter: "hierarchy-label", depthField: "depth" },
        { field: "tags", label: "Tags", formatter: "chip-list", chipsField: "tags", chipLabelField: "name" },
      ],
    },
    regions: [{ id: "side", behavior: "caps.mount", title: "Side" }],
    detail: {
      header: { titleField: "title" },
      itemRows: {
        itemsField: "items",
        itemTitleField: "label",
        chips: [{ field: "qty" }],
        metaFields: ["note"],
        rowActions: [
          { id: "complete", label: "Complete", behavior: "item.complete", visibleWhen: { field: "state", equals: "open" } },
          { id: "reopen", label: "Reopen", behavior: "item.reopen", visibleWhen: { field: "state", equals: "done" } },
        ],
      },
    },
    dataSource: {
      route: "/api/caps",
      fieldBindings: { id: "record_id", title: "name", depth: "depth", parentId: "parent_id", path: "path", tags: "tags", items: "children" },
    },
  };
}

function createModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Sample module used by shared-capability validation regressions.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    protectedViews: [{ id: "sample", path: "/sample.html", moduleId: "sample-module", file: "sample.html" }],
    viewSurfaces: [validSurface()],
    ...overrides,
  };
}

function validSurface() {
  return {
    id: "sample-surface",
    moduleId: "sample-module",
    viewId: "sample",
    layout: "single-column",
    filters: [{ field: "status", type: "select", queryKey: "status", default: "active", optionsSource: "sample.statusOptions" }],
    indexPanel: {
      title: "Samples",
      itemTitleField: "title",
      itemDepthField: "depth",
      itemParentField: "parentId",
      itemPathField: "path",
    },
    regions: [{ id: "side", behavior: "sample.mount", title: "Side panel" }],
    table: {
      hierarchy: { depthField: "depth", parentField: "parentId", pathField: "path" },
      columns: [
        { field: "title", label: "Title", formatter: "hierarchy-label", depthField: "depth" },
        { field: "tags", label: "Tags", formatter: "chip-list", chipsField: "tags", chipLabelField: "name" },
      ],
    },
    detail: {
      header: { titleField: "title" },
      itemRows: {
        itemsField: "items",
        itemTitleField: "label",
        itemSubtitleField: "description",
        chips: [{ field: "qty", label: "Qty" }],
        metaFields: ["note"],
        actionsLabel: "Item actions",
        rowActions: [
          {
            id: "complete-item",
            label: "Complete",
            role: "primary",
            route: "/api/items/{id}/complete",
            method: "POST",
            visibleWhen: { field: "state", equals: "open" },
          },
        ],
      },
      regions: [{ id: "detail-side", behavior: "sample.detailMount" }],
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: { id: "record_id", title: "title", depth: "depth", parentId: "parent_id", path: "path", tags: "tags", items: "children" },
    },
  };
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
  this.checked = false;
  this.colSpan = 1;
  this.type = "";
  this.value = "";

  this.append = (...children) => {
    children.forEach((child) => this.appendChild(child));
  };

  this.appendChild = (child) => {
    this.children.push(child);
    child.parentNode = this;
    return child;
  };

  this.replaceChildren = (...children) => {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
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
  this.removeAttribute = (name) => this.attributes.delete(name);
  this.addEventListener = () => {};
  this.showModal = () => {};

  this.querySelector = (selector) => collectMatches(this, selector)[0] || null;
  this.querySelectorAll = (selector) => collectMatches(this, selector);

  Object.defineProperty(this, "firstChild", { get: () => this.children[0] || null });

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

function collectMatches(root, selector) {
  const matches = [];
  const queue = [...root.children];
  while (queue.length > 0) {
    const element = queue.shift();
    if (matchesSelector(element, selector)) {
      matches.push(element);
    }
    queue.push(...element.children);
  }
  return matches;
}

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  const attrMatch = selector.match(/^\[([\w-]+)="([^"]*)"\]$/);
  if (attrMatch) {
    return element.getAttribute(attrMatch[1]) === attrMatch[2];
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
