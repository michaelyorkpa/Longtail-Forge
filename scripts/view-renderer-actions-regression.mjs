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

assert.match(renderer, /function registerBehavior\(id, handler\)/, "Renderer should expose behavior registration");
assert.match(renderer, /runRouteAction\(action, state, record\)/, "Renderer should route declarative route actions");
assert.match(renderer, /requiredPermissions/, "Renderer should read action permission metadata");
assert.match(renderer, /Missing view behavior handler/, "Missing behavior handlers should fail visibly");
assert.match(renderer, /openDescriptorModal\(state, modalId, record\)/, "Renderer should own descriptor modal opening");
assert.match(regressionSuite, /scripts\/view-renderer-actions-regression\.mjs/, "Regression suite should include renderer action regression");

const context = createBrowserContext();
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const { view } = context.window.LongtailForge;
assert.equal(typeof view.registerBehavior, "function", "LongtailForge.view.registerBehavior should be exposed");

const behaviorCalls = [];
view.registerBehavior("sample.open", async (actionContext) => {
  behaviorCalls.push(actionContext);
  actionContext.openModal("edit-sample", actionContext.record);
});

const host = context.document.createElement("main");
const surface = view.renderSurface(descriptor(), host);
await surface.refresh();

const openButton = findButtonByText(surface, "Open selected");
assert.equal(openButton.disabled, false, "Behavior actions should be enabled after rendering");
await openButton.click();
assert.equal(behaviorCalls.length, 1, "Registered behavior should run once");
assert.equal(behaviorCalls[0].record.title, "Alpha", "Behavior context should include the selected record");
assert.equal(typeof behaviorCalls[0].refresh, "function", "Behavior context should include refresh");
assert.equal(typeof behaviorCalls[0].openModal, "function", "Behavior context should include openModal");
assert.equal(behaviorCalls[0].workspaceContext.workspaceId, "actions-workspace", "Behavior context should include workspace context");
assert(context.document.body.querySelector("dialog"), "Behavior openModal should append a descriptor modal");

const routeButton = findButtonByText(surface, "Delete selected");
await routeButton.click();
assert.deepEqual(context.window.confirmMessages, ["Delete this record?"], "Route actions should honor confirm metadata");
assert.deepEqual(context.window.LongtailForge.api.deleteCalls, ["/api/sample/alpha"], "Route actions should call the shared API client");
assert.equal(context.window.LongtailForge.api.getCalls.length, 2, "Route actions should refresh after mutation");

const missingButton = findButtonByText(surface, "Missing behavior");
await missingButton.click();
assert.match(surface.textContent, /Missing view behavior handler: sample\.missing/, "Missing behavior handlers should render a recoverable status");

const deniedButton = findButtonByText(surface, "Denied route");
await deniedButton.click();
assert.match(surface.textContent, /You do not have permission to run this action/, "Client-visible permission metadata should fail recoverably when explicit permissions are unavailable");

assert.match(changelog, /## Version 0\.33\.5\.16\.8 - /, "Changelog should include renderer action version");

console.log("View renderer actions regression passed.");

function descriptor() {
  return {
    id: "sample-actions",
    layout: "table-page",
    pageHeader: {
      title: "Action Samples",
      primaryAction: {
        id: "open-selected",
        label: "Open selected",
        role: "primary",
        behavior: "sample.open",
      },
    },
    table: {
      columns: [{ field: "title", label: "Title" }],
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: {
        id: "id",
        title: "title",
      },
    },
    actions: [
      {
        id: "delete-selected",
        label: "Delete selected",
        role: "destructive",
        route: "/api/sample/alpha",
        method: "DELETE",
        confirm: "Delete this record?",
      },
      {
        id: "missing",
        label: "Missing behavior",
        role: "secondary",
        behavior: "sample.missing",
      },
      {
        id: "denied",
        label: "Denied route",
        role: "secondary",
        route: "/api/sample/denied",
        method: "POST",
        requiredPermissions: ["sample.manage"],
      },
    ],
    modals: [
      {
        id: "edit-sample",
        title: "Edit Sample",
        fields: [
          { field: "title", label: "Title", type: "text" },
        ],
      },
    ],
  };
}

function createBrowserContext() {
  const document = new FakeDocument();
  const window = {
    confirmMessages: [],
    confirm(message) {
      this.confirmMessages.push(message);
      return true;
    },
    document,
    LongtailForge: {
      workspaceContext: {
        permissionIds: ["sample.view"],
        workspaceId: "actions-workspace",
      },
      api: {
        deleteCalls: [],
        getCalls: [],
        postCalls: [],
        async getJson(url) {
          this.getCalls.push(url);
          return { records: [{ id: "alpha", title: "Alpha" }] };
        },
        async deleteJson(url) {
          this.deleteCalls.push(url);
          return { ok: true };
        },
        async postJson(url, body) {
          this.postCalls.push({ url, body });
          return { ok: true };
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
  document.body = document.createElement("body");
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
  this.listeners = {};
  this._textContent = "";
  this.disabled = false;
  this.open = false;
  this.type = "";
  this.colSpan = 1;

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

  this.addEventListener = (eventName, handler) => {
    this.listeners[eventName] = handler;
  };

  this.click = async () => {
    if (!this.disabled && this.listeners.click) {
      await this.listeners.click({ currentTarget: this, preventDefault() {} });
    }
  };

  this.showModal = () => {
    this.open = true;
  };

  this.querySelector = (selector) => findElement(this, selector);
  this.querySelectorAll = (selector) => findElements(this, selector);

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
    get: () => this._textContent || this.children.map((child) => child.textContent).join(""),
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

function findButtonByText(root, text) {
  const button = root.querySelectorAll("button").find((candidate) => candidate.textContent === text);
  assert.ok(button, `Expected button '${text}'`);
  return button;
}

function findElement(root, selector) {
  return findElements(root, selector)[0] || null;
}

function findElements(root, selector) {
  const queue = [...root.children];
  const matches = [];
  while (queue.length) {
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
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
