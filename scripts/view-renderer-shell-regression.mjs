import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const css = readText("public/css/longtail-forge.css");
const footerScript = readText("public/js/footer.js");
const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.21.7.6", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.7.6", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.7.6", "package-lock package entry should report the current app version");

assert.doesNotMatch(renderer, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "view renderer shell must not own data loading or browser storage");
assert.doesNotMatch(renderer, /\binnerHTML\b|\binsertAdjacentHTML\b/, "view renderer must not inject HTML strings");
assert.match(renderer, /root\.view = Object\.freeze\(\{[\s\S]*renderSurface/, "renderer should extend the frozen LongtailForge.view namespace");

for (const helperName of [
  "createPageHeader",
  "createFilterPanel",
  "createCollapsibleIndexPanel",
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
view.registerBehavior("sample.library", ({ container }) => {
  container.appendChild(context.document.createElement("nav"));
});
view.registerBehavior("sample.footer", ({ container }) => {
  container.appendChild(context.document.createElement("button"));
});

const tableHost = context.document.createElement("main");
const tableSurface = view.renderSurface(createDescriptor({ layout: "table-page" }), tableHost);
assert.equal(tableHost.children.length, 1, "Renderer should mount one root surface into the host");
assert(tableSurface.classList.contains("view-renderer-layout-table-page"), "Table-page layout should add a layout class");
assert(tableSurface.querySelector(".view-page-header"), "Table-page layout should render a page header");
assert(tableSurface.querySelector(".view-filter-panel"), "Table-page layout should render filter shell anatomy");
assert(tableSurface.querySelector(".view-table-wrap"), "Table-page layout should render a table shell");
assert(tableSurface.querySelector(".view-modal-form"), "Table-page layout should render modal shells");
assert.equal(tableSurface.querySelector(".view-data-table-empty").textContent, "No sample records yet.", "Table shells should render descriptor empty states");

const stackedHost = context.document.createElement("main");
const stackedSurface = view.renderSurface(createDescriptor({ layout: "stacked" }), stackedHost);
assert(stackedSurface.querySelector(".view-stacked"), "Stacked layout should render a stacked container");
assert(stackedSurface.querySelector(".view-stacked-detail"), "Stacked layout should render a full-width detail section");
assert(stackedSurface.querySelector(".view-collapsible-index"), "Stacked layout should render an index shell on top");
assert(stackedSurface.querySelector(".view-detail-header"), "Stacked layout should render detail shell anatomy");
const stackedFilter = stackedSurface.querySelector(".view-filter-panel");
assert.equal(stackedFilter.tagName, "DETAILS", "Stacked filter panel should be a collapsible details element");
assert.equal(stackedFilter.open, false, "Surface filters should render collapsed by default");
assert(stackedFilter.querySelector("summary"), "Collapsible filter panel should have a summary toggle");

const sidebarHost = context.document.createElement("main");
const sidebarSurface = view.renderSurface(createDescriptor({ layout: "sidebar-detail" }), sidebarHost);
assert(sidebarSurface.classList.contains("view-renderer-layout-sidebar-detail"), "Sidebar-detail layout should add a layout class");
const sidebarLayout = sidebarSurface.querySelector(".view-sidebar-detail");
assert(sidebarLayout, "Sidebar-detail layout should render a sidebar/detail container");
const sidebar = sidebarSurface.querySelector(".view-sidebar-detail-sidebar");
assert(sidebar, "Sidebar-detail layout should render a sidebar region");
assert.equal(sidebar.getAttribute("aria-label"), "View controls", "Sidebar region should be labelled");
assert(sidebar.querySelector(".view-filter-panel"), "Sidebar-detail layout should place filters in the sidebar");
assert(sidebar.querySelector(".view-collapsible-index"), "Sidebar-detail layout should place the index in the sidebar");
const sidebarPrimary = sidebarSurface.querySelector(".view-sidebar-detail-primary");
assert(sidebarPrimary, "Sidebar-detail layout should render a primary detail region");
assert(sidebarPrimary.classList.contains("surface-main-panel"), "Primary detail region should use the shared panel surface");
assert(sidebarPrimary.querySelector(".view-detail-header"), "Sidebar-detail primary region should render detail shell anatomy");

const orderedSidebarHost = context.document.createElement("main");
const orderedSidebarSurface = view.renderSurface(createDescriptor({
  layout: "sidebar-detail",
  sidebarPanels: [
    {
      id: "library",
      type: "navigation",
      title: "Library",
      behavior: "sample.library",
      collapsible: false,
      footer: { title: "Library actions" },
    },
    {
      id: "controls",
      type: "filters",
      title: "Controls",
      open: true,
    },
    {
      id: "records",
      type: "index",
      title: "Samples",
      open: false,
      footer: {
        title: "Sort and pagination",
        behavior: "sample.footer",
      },
    },
  ],
}), orderedSidebarHost);
const orderedSidebar = orderedSidebarSurface.querySelector(".view-sidebar-detail-sidebar");
const orderedPanels = orderedSidebar.children;
assert.equal(orderedPanels.length, 3, "Explicit sidebar panels should stack in the sidebar only");
assert.deepEqual(
  orderedPanels.map((panel) => panel.dataset.viewSidebarPanel),
  ["library", "controls", "records"],
  "Sidebar panels should render in descriptor order",
);
assert(orderedPanels.every((panel) => panel.classList.contains("view-sidebar-panel")), "Sidebar panels should share the framework panel class");
assert.equal(orderedPanels[0].tagName, "SECTION", "Non-collapsible sidebar panels should render a static section shell");
assert.equal(orderedPanels[0].querySelector(".view-sidebar-panel-title").textContent, "Library");
assert.equal(orderedPanels[1].tagName, "DETAILS", "Collapsible filter/control sidebar panels should render native details");
assert.equal(orderedPanels[1].open, true, "Sidebar panels should honor the initial open state");
assert(orderedPanels[1].querySelector("summary"), "Collapsible sidebar panels should expose a native summary");
assert.equal(orderedPanels[2].open, false, "Sidebar panels should honor the initial closed state");
assert(orderedPanels[2].querySelector(".view-collapsible-index-footer"), "Sidebar index panels should expose a stable footer slot");
assert(
  orderedPanels[2].children[1].classList.contains("view-collapsible-index-body") &&
  orderedPanels[2].children[2].classList.contains("view-collapsible-index-footer"),
  "Sidebar panel footers should render after the scrollable body",
);

const slideOutHost = context.document.createElement("main");
const slideOutSurface = view.renderSurface(createDescriptor({
  layout: "slide-out-sidebar",
  sidebarPanels: [
    {
      id: "library",
      type: "navigation",
      title: "Library",
      behavior: "sample.library",
      collapsible: false,
    },
    {
      id: "controls",
      type: "filters",
      title: "Controls",
      open: true,
    },
    {
      id: "records",
      type: "index",
      title: "Samples",
      open: false,
      footer: {
        title: "Sort and pagination",
        behavior: "sample.footer",
      },
    },
  ],
}), slideOutHost);
assert(slideOutSurface.classList.contains("view-renderer-layout-slide-out-sidebar"), "Slide-out sidebar layout should add a layout class");
assert(slideOutSurface.querySelector(".view-slideout-sidebar"), "Slide-out sidebar layout should render a drawer/main container");
assert.equal(slideOutSurface.querySelector(".view-sidebar-detail"), null, "Slide-out sidebar layout should not render the persistent split-column container");
const slideOutTrigger = slideOutSurface.querySelector(".view-slideout-sidebar-toggle");
assert(slideOutTrigger, "Slide-out sidebar layout should render a left-edge trigger");
assert.equal(slideOutTrigger.dataset.icon, "filter", "Slide-out sidebar trigger should use the funnel/filter icon");
assert.equal(slideOutTrigger.getAttribute("aria-expanded"), "false", "Slide-out sidebar trigger should start collapsed");
assert.equal(slideOutTrigger.getAttribute("aria-pressed"), "false", "Slide-out sidebar trigger should expose pressed state");
const slideOutDrawer = slideOutSurface.querySelector(".view-slideout-sidebar-drawer");
assert(slideOutDrawer, "Slide-out sidebar layout should render an off-canvas drawer");
assert.equal(slideOutDrawer.getAttribute("aria-hidden"), "true", "Slide-out drawer should start hidden to assistive tech");
assert.equal(slideOutTrigger.getAttribute("aria-controls"), slideOutDrawer.id, "Slide-out trigger should control the drawer");
const slideOutBackdrop = slideOutSurface.querySelector(".view-slideout-sidebar-backdrop");
assert(slideOutBackdrop.hidden, "Slide-out backdrop should start hidden");
const slideOutBody = slideOutSurface.querySelector(".view-slideout-sidebar-body");
const slideOutPanels = slideOutBody.children;
assert.deepEqual(
  slideOutPanels.map((panel) => panel.dataset.viewSidebarPanel),
  ["library", "controls", "records"],
  "Slide-out drawer should reuse explicit sidebar panel ordering",
);
assert(slideOutPanels.every((panel) => panel.classList.contains("view-sidebar-panel")), "Slide-out drawer panels should reuse framework sidebar panel shells");
const slideOutMain = slideOutSurface.querySelector(".view-slideout-sidebar-main");
assert(slideOutMain.classList.contains("surface-main-panel"), "Slide-out main/detail region should use the shared panel surface");
assert(slideOutMain.querySelector(".view-detail-header"), "Slide-out main/detail region should render detail shell anatomy outside the drawer");

slideOutTrigger.dispatchEvent({ type: "click" });
assert.equal(slideOutTrigger.getAttribute("aria-expanded"), "true", "Trigger click should open the slide-out drawer");
assert.equal(slideOutTrigger.getAttribute("aria-pressed"), "true", "Trigger click should update pressed state");
assert.equal(slideOutDrawer.getAttribute("aria-hidden"), "false", "Open drawer should be visible to assistive tech");
assert(slideOutDrawer.classList.contains("is-open"), "Open drawer should receive the open class");
assert.equal(slideOutBackdrop.hidden, false, "Open drawer should reveal the backdrop");
assert(context.document.body.classList.contains("view-slideout-sidebar-lock"), "Open drawer should lock page scrolling");
assert.equal(context.document.activeElement, slideOutDrawer, "Open drawer should receive focus");

slideOutTrigger.dispatchEvent({ type: "click" });
assert.equal(slideOutTrigger.getAttribute("aria-expanded"), "false", "Trigger should close an open slide-out drawer");
assert.equal(slideOutDrawer.getAttribute("aria-hidden"), "true", "Closed drawer should be hidden to assistive tech");
assert.equal(slideOutBackdrop.hidden, true, "Closed drawer should hide the backdrop");
assert.equal(context.document.body.classList.contains("view-slideout-sidebar-lock"), false, "Closed drawer should release page scrolling");
assert.equal(context.document.activeElement, slideOutTrigger, "Closing should return focus to the trigger");

slideOutTrigger.dispatchEvent({ type: "click" });
slideOutBackdrop.dispatchEvent({ type: "click" });
assert.equal(slideOutTrigger.getAttribute("aria-expanded"), "false", "Backdrop click should close the drawer");

slideOutTrigger.dispatchEvent({ type: "click" });
let escapePrevented = false;
slideOutDrawer.dispatchEvent({
  type: "keydown",
  key: "Escape",
  preventDefault() {
    escapePrevented = true;
  },
});
assert.equal(escapePrevented, true, "Escape handling should prevent the default key action");
assert.equal(slideOutTrigger.getAttribute("aria-expanded"), "false", "Escape should close the drawer");

const singleHost = context.document.createElement("main");
const singleSurface = view.renderSurface(createDescriptor({ layout: "single-column" }), singleHost);
assert(singleSurface.classList.contains("view-renderer-layout-single-column"), "Single-column layout should add a layout class");
assert(singleSurface.querySelector(".view-collapsible-index"), "Single-column layout should render selector/index anatomy when declared");
assert(singleSurface.querySelector(".view-field-grid"), "Single-column layout should render field grid anatomy when declared");

assert.match(css, /\.view-sidebar-detail\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(300px,\s*clamp\(340px,\s*28vw,\s*380px\)\)\s*minmax\(0,\s*1fr\);/, "CSS should define the sidebar/detail desktop grid");
assert.match(css, /\.view-sidebar-detail-sidebar\s*\{[\s\S]*max-height:\s*calc\(100vh - 180px\);[\s\S]*overflow-y:\s*auto;/, "CSS should keep the sidebar scroll-safe");
assert.match(css, /\.view-sidebar-panel \.view-collapsible-index-body,[\s\S]*\.view-sidebar-panel-body\s*\{[\s\S]*overflow-y:\s*auto;/, "CSS should keep sidebar panel bodies scroll-safe");
assert.match(css, /\.view-sidebar-panel-footer\s*\{[\s\S]*flex-wrap:\s*wrap;/, "CSS should keep sidebar panel footers wrapped below panel bodies");
assert.match(css, /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*\.view-sidebar-detail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*\.view-sidebar-detail-sidebar\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*visible;/, "CSS should collapse sidebar-detail to stacked flow on narrow screens");
assert.match(css, /body\.view-slideout-sidebar-lock\s*\{[\s\S]*overflow:\s*hidden;/, "CSS should lock page scroll while the slide-out drawer is open");
assert.match(css, /\.view-slideout-sidebar\s*\{[\s\S]*--view-slideout-sidebar-trigger-bottom:\s*calc\(var\(--site-footer-visible-offset,\s*0px\) \+ 20px\);[\s\S]*--view-slideout-sidebar-trigger-left:\s*max\(16px,\s*env\(safe-area-inset-left\)\);/, "CSS should derive slide-out trigger bottom from footer visibility while keeping the trigger near the screen-left gutter");
assert.match(css, /\.view-slideout-sidebar-toggle\s*\{[\s\S]*position:\s*fixed;[\s\S]*bottom:\s*var\(--view-slideout-sidebar-trigger-bottom\);[\s\S]*left:\s*var\(--view-slideout-sidebar-trigger-left\);/, "CSS should anchor the slide-out trigger near the lower-left viewport/footer edge");
assert.match(footerScript, /--site-footer-visible-offset/, "Footer script should publish the visible footer offset for fixed controls");
assert.match(footerScript, /Math\.min\(viewportHeight, footerBottom\) - Math\.max\(footerTop, 0\)/, "Footer script should count only the visible footer height");
assert.match(css, /\.site-footer\s*\{[\s\S]*margin-top:\s*auto;/, "Footer should stay at the bottom of short pages");
assert.match(css, /\.view-slideout-sidebar-backdrop\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*75;/, "CSS should render a fixed backdrop under the drawer");
assert.match(css, /\.view-slideout-sidebar-drawer\s*\{[\s\S]*position:\s*fixed;[\s\S]*transform:\s*translateX\(-105%\);/, "CSS should keep the drawer off-canvas while closed");
assert.match(css, /\.view-slideout-sidebar-drawer\.is-open\s*\{[\s\S]*transform:\s*translateX\(0\);/, "CSS should slide the drawer into view when open");
const slideOutCssBlock = css.match(/\.view-slideout-sidebar\s*\{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(slideOutCssBlock, /grid-template-columns:/, "Slide-out sidebar layout should not allocate a permanent split grid column");
assert.doesNotMatch(renderer, /descriptor\.layout === "split-list-detail"/, "Renderer should not reactivate the retired split-list-detail layout");
assert.match(changelog, /## Version 0\.33\.5\.16\.4 - /, "Changelog should include renderer shell version");
assert.match(regressionSuite, /scripts\/view-renderer-shell-regression\.mjs/, "Regression suite should include renderer regression");

console.log("View renderer shell regression passed.");

function createDescriptor({ layout, sidebarPanels }) {
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
    sidebarPanels,
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
  this.activeElement = null;
  this.body = new FakeElement("body", this);
  this.createElement = (tagName) => new FakeElement(tagName, this);
  this.createTextNode = (text) => {
    const node = new FakeElement("#text", this);
    node.textContent = String(text);
    return node;
  };
}

function FakeElement(tagName, ownerDocument) {
  this.tagName = String(tagName).toUpperCase();
  this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
  this.children = [];
  this.parentNode = null;
  this.ownerDocument = ownerDocument;
  this.attributes = new Map();
  this.dataset = {};
  this.classList = new FakeClassList(this);
  this.listeners = new Map();
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

  this.removeAttribute = (name) => {
    this.attributes.delete(name);
    if (name === "hidden") {
      this.hidden = false;
    }
  };

  this.addEventListener = (eventName, handler) => {
    const handlers = this.listeners.get(eventName) || [];
    handlers.push(handler);
    this.listeners.set(eventName, handlers);
  };

  this.dispatchEvent = (event) => {
    const eventObject = event || {};
    eventObject.type = eventObject.type || "";
    eventObject.target = eventObject.target || this;
    for (const handler of this.listeners.get(eventObject.type) || []) {
      handler.call(this, eventObject);
    }
    return true;
  };

  this.focus = () => {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  };

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

  this.remove = (...names) => {
    names.filter(Boolean).forEach((name) => {
      this.values.delete(String(name));
    });
    this.element.attributes.set("class", this.toString());
  };

  this.toggle = (name, force) => {
    const token = String(name);
    const shouldAdd = force === undefined ? !this.values.has(token) : Boolean(force);
    if (shouldAdd) {
      this.values.add(token);
    } else {
      this.values.delete(token);
    }
    this.element.attributes.set("class", this.toString());
    return shouldAdd;
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
