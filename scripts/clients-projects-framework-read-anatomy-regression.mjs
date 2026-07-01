import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.0.1";

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const regressionSuite = readText("scripts/regression-suite.mjs");

await import("../src/core/modules/modules.service.js");
const { clientProjectsModule } = await import("../src/modules/client-projects/module.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects read anatomy version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects read anatomy version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects read anatomy version");
assert.equal(clientProjectsModule.version, appVersion, "Clients/Projects module should report the read anatomy version");

assertMinimalHost(clientsHtml, "Clients");
assertMinimalHost(projectsHtml, "Projects");
assert.doesNotMatch(clientsProjectsScript, /function ensureClientProjectsPageHost\(\)/, "Read anatomy should not be recreated inside the Clients/Projects adapter");
assert.match(clientsProjectsScript, /async function initializeClientProjectsPage\(\)[\s\S]*await window\.LongtailForge\?\.workspaceContextReady[\s\S]*activeClientProjectsReadSurface = renderClientProjectsReadSurface\(\)[\s\S]*loadPageData\(\{ renderPage: false \}\)/, "Adapter should wait for app-shell viewSurfaces before rendering descriptor read pages");
assert.match(clientsProjectsScript, /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/, "Adapter should render the descriptor surface into the minimal host");
assert.match(clientsProjectsScript, /function openAddClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.add"/, "Add Client query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openEditClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.edit", \{ clientId: client\.id \}/, "Client detail query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openAddProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.add"/, "Add Project query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openEditProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.edit", \{ projectId: match\.project\.id \}/, "Project detail query opener should dispatch the registered module action");

assert.match(renderer, /function tableColumns[\s\S]*table\.rowActions[\s\S]*__view_row_actions/, "Renderer should add a framework-owned table action column from descriptor rowActions");
assert.match(regressionSuite, /scripts\/clients-projects-framework-read-anatomy-regression\.mjs/, "Regression suite should include the Clients/Projects read anatomy regression");

const surfaces = new Map(clientProjectsModule.viewSurfaces.map((surface) => [surface.id, surface]));
const clientsDescriptor = surfaces.get("client-projects.clients");
const projectsDescriptor = surfaces.get("client-projects.projects");
assert.ok(clientsDescriptor, "Clients descriptor should be available");
assert.ok(projectsDescriptor, "Projects descriptor should be available");
assert.equal(clientsDescriptor.filterPlacement, "slide-out-sidebar", "Clients filters should render through the shared slide-out filter surface");
assert.equal(projectsDescriptor.filterPlacement, "slide-out-sidebar", "Projects filters should render through the shared slide-out filter surface");
assert.equal(clientsDescriptor.table.columns.some((column) => column.label === "Tags"), false, "Clients should not expose Tags as a standalone table column");
assert.equal(projectsDescriptor.table.columns.some((column) => column.label === "Tags"), false, "Projects should not expose Tags as a standalone table column");
assert.equal(clientsDescriptor.filters.find((filter) => filter.field === "tagIds")?.type, "search", "Clients tag filter should use searchable suggestions instead of a long select");
assert.equal(projectsDescriptor.filters.find((filter) => filter.field === "tagIds")?.type, "search", "Projects tag filter should use searchable suggestions instead of a long select");
assert.ok(clientsDescriptor.table.secondaryRows.some((row) => row.id === "client-tags" && row.formatter === "chip-list"), "Clients should render tags as a secondary table row");
assert.ok(projectsDescriptor.table.secondaryRows.some((row) => row.id === "project-tags" && row.formatter === "chip-list"), "Projects should render tags as a secondary table row");
assert.ok(clientsDescriptor.table.rowActions.every((action) => action.icon === "edit" && action.iconOnly === true), "Clients repeated row actions should be icon-only");
assert.ok(projectsDescriptor.table.rowActions.every((action) => action.icon === "edit" && action.iconOnly === true), "Projects repeated row actions should be icon-only");

const clientsContext = createBrowserContext({
  responses: [{
    clients: [
      clientRecord({ id: "client-parent", name: "Acme Parent", depth: 0 }),
      clientRecord({ id: "client-child", name: "Acme Child", parent_client_id: "client-parent", depth: 1 }),
    ],
  }],
  permissions: ["clients.manage"],
});
vm.runInNewContext(builder, clientsContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, clientsContext, { filename: "view-renderer.js" });

const clientActionCalls = [];
const clientsView = clientsContext.window.LongtailForge.view;
clientsView.registerBehavior("client-projects.clients.tags", (ctx) => ctx.mountSearchOptions([{ value: "tag-focus", label: "Focus" }], { submitMode: "option-or-input" }));
clientsView.registerBehavior("client-projects.clients.create", (context) => clientActionCalls.push({ behavior: context.action.behavior, recordId: context.record?.id || "" }));
clientsView.registerBehavior("client-projects.clients.edit", (context) => clientActionCalls.push({ behavior: context.action.behavior, recordId: context.record?.id || "" }));

const clientsHost = clientsContext.document.createElement("main");
const clientsSurface = clientsView.renderSurface(clientsDescriptor, clientsHost);
await clientsSurface.refresh();
await Promise.resolve();

assert.equal(clientsContext.window.LongtailForge.api.calls[0], "/api/clients?include_depth=true&status=Active", "Clients descriptor filters should build the canonical status query");
assert.equal(findFieldControl(clientsSurface, "tagIds")?.tagName, "INPUT", "Clients tag filter should render as a search input");
assertTextOrder(clientsSurface.textContent, ["Acme Parent", "Acme Child"]);
const clientHierarchyLabels = clientsSurface.querySelectorAll(".view-hierarchy-label");
assert.ok(clientHierarchyLabels.some((label) => label.dataset.viewHierarchyDepth === "1" && /Acme Child/.test(label.textContent)), "Client hierarchy labels should carry child indentation metadata");
assert.match(clientsSurface.textContent, /Focus/, "Client tag chips should render readable tag names through chip-list display");

await findButtonByText(clientsSurface, "Add Client").click();
assert.equal(findButtonByLabel(clientsSurface, "Edit Client").textContent, "", "Client edit row action should not render repeated text");
await findButtonByLabel(clientsSurface, "Edit Client").click();
assert.deepEqual(clientActionCalls, [
  { behavior: "client-projects.clients.create", recordId: "" },
  { behavior: "client-projects.clients.edit", recordId: "client-parent" },
], "Clients page and row actions should dispatch module-owned behavior handlers with safe record context");

const projectsContext = createBrowserContext({
  responses: [{
    projects: [
      projectRecord({ id: "project-parent", name: "Buildout", depth: 0 }),
      projectRecord({ id: "project-child", name: "Launch", parent_project_id: "project-parent", depth: 1 }),
    ],
  }],
  permissions: ["projects.manage"],
});
vm.runInNewContext(builder, projectsContext, { filename: "view-builder.js" });
vm.runInNewContext(renderer, projectsContext, { filename: "view-renderer.js" });

const projectActionCalls = [];
const projectsView = projectsContext.window.LongtailForge.view;
projectsView.registerBehavior("client-projects.projects.tags", (ctx) => ctx.mountSearchOptions([{ value: "tag-focus", label: "Focus" }], { submitMode: "option-or-input" }));
projectsView.registerBehavior("client-projects.projects.clients", () => [{ value: "client-parent", label: "Acme Parent" }]);
projectsView.registerBehavior("client-projects.projects.create", (context) => projectActionCalls.push({ behavior: context.action.behavior, recordId: context.record?.id || "" }));
projectsView.registerBehavior("client-projects.projects.edit", (context) => projectActionCalls.push({ behavior: context.action.behavior, recordId: context.record?.id || "" }));

const projectsHost = projectsContext.document.createElement("main");
const seededProjectsDescriptor = {
  ...projectsDescriptor,
  filters: projectsDescriptor.filters.map((filter) => {
    if (filter.field === "clientId") {
      return { ...filter, default: "client-parent" };
    }
    if (filter.field === "tagIds") {
      return { ...filter, default: "tag-focus" };
    }
    return filter;
  }),
};
const projectsSurface = projectsView.renderSurface(seededProjectsDescriptor, projectsHost);
await projectsSurface.refresh();
await Promise.resolve();

assert.equal(
  projectsContext.window.LongtailForge.api.calls[0],
  "/api/projects?include_depth=true&clientId=client-parent&status=Active&tagIds=tag-focus",
  "Projects descriptor filters should build canonical Client/status/tag queries",
);
assert.equal(findFieldControl(projectsSurface, "tagIds")?.tagName, "INPUT", "Projects tag filter should render as a search input");
assertTextOrder(projectsSurface.textContent, ["Buildout", "Launch"]);
assert.ok(projectsSurface.querySelectorAll(".view-hierarchy-label").some((label) => label.dataset.viewHierarchyDepth === "1" && /Launch/.test(label.textContent)), "Project hierarchy labels should carry child indentation metadata");
assert.match(projectsSurface.textContent, /Acme Parent/, "Project Client labels should render from module-shaped readable labels");
assert.match(projectsSurface.textContent, /Focus/, "Project tag chips should render readable tag names through chip-list display");

await findButtonByText(projectsSurface, "Add Project").click();
assert.equal(findButtonByLabel(projectsSurface, "Edit Project").textContent, "", "Project edit row action should not render repeated text");
await findButtonByLabel(projectsSurface, "Edit Project").click();
assert.deepEqual(projectActionCalls, [
  { behavior: "client-projects.projects.create", recordId: "" },
  { behavior: "client-projects.projects.edit", recordId: "project-parent" },
], "Projects page and row actions should dispatch module-owned behavior handlers with safe record context");

console.log("Clients/Projects framework-rendered read anatomy regression passed.");

function clientRecord(overrides = {}) {
  return {
    id: overrides.id || "client",
    name: overrides.name || "Client",
    display_label: overrides.name || "Client",
    status: "Active",
    parent_client_id: overrides.parent_client_id || "",
    depth: overrides.depth || 0,
    display_path: overrides.parent_client_id ? "Acme Parent / Acme Child" : "Acme Parent",
    billable: "yes",
    billing_rate: "125",
    billing_period: "calendarMonth",
    billing_rounding: null,
    billing_display: "Billable at $125/hr",
    tag_summary: "Focus",
    tags: [{ tag_id: "tag-focus", name: "Focus" }],
  };
}

function projectRecord(overrides = {}) {
  return {
    id: overrides.id || "project",
    name: overrides.name || "Project",
    display_label: overrides.name || "Project",
    status: "Active",
    client_id: "client-parent",
    client_name: "Acme Parent",
    parent_project_id: overrides.parent_project_id || "",
    parent_project_name: overrides.parent_project_id ? "Buildout" : "",
    depth: overrides.depth || 0,
    display_path: overrides.parent_project_id ? "Buildout / Launch" : "Buildout",
    billable: "yes",
    billing_rate: "100",
    billing_period: "calendarMonth",
    billing_rounding: null,
    billing_display: "Billable at $100/hr",
    taskDefaults: {},
    tag_summary: "Focus",
    tags: [{ tag_id: "tag-focus", name: "Focus" }],
  };
}

function assertMinimalHost(html, label) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} protected host should not ship page anatomy`);
  assert.match(body, /data-client-projects-host/, `${label} protected host should expose the descriptor host`);
}

function assertTextOrder(text, orderedLabels) {
  let lastIndex = -1;
  for (const label of orderedLabels) {
    const nextIndex = text.indexOf(label);
    assert.ok(nextIndex > lastIndex, `${label} should appear after the previous hierarchy label`);
    lastIndex = nextIndex;
  }
}

function findButtonByText(root, text) {
  const button = root.querySelectorAll("button").find((candidate) => candidate.textContent === text);
  assert.ok(button, `Expected button '${text}'`);
  return button;
}

function findButtonByLabel(root, label) {
  const button = root.querySelectorAll("button").find((candidate) => candidate.getAttribute("aria-label") === label || candidate.title === label);
  assert.ok(button, `Expected button labeled '${label}'`);
  return button;
}

function findFieldControl(root, fieldName) {
  return root.querySelectorAll("input")
    .concat(root.querySelectorAll("select"))
    .find((candidate) => candidate.getAttribute("data-view-input") === fieldName);
}

function createBrowserContext({ responses, permissions }) {
  const document = new FakeDocument();
  const queue = [...responses];
  const calls = [];
  const window = {
    document,
    LongtailForge: {
      workspaceContext: {
        permissionIds: permissions,
        workspaceId: "clients-projects-read-anatomy",
        workspaceType: "business",
      },
      api: {
        calls,
        async getJson(url) {
          calls.push(url);
          return queue.length ? queue.shift() : responses[responses.length - 1];
        },
      },
      icons: {
        createIconButton(options = {}) {
          const button = document.createElement("button");
          button.type = options.type || "button";
          button.classList.add("action-button");
          button.textContent = options.iconOnly ? "" : options.text || options.label || "";
          if (options.label) {
            button.setAttribute("aria-label", options.label);
          }
          if (options.title) {
            button.title = options.title;
          }
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
  this.hidden = false;
  this.open = false;
  this.type = "";
  this.value = "";
  this.colSpan = 1;

  this.append = (...children) => {
    children.forEach((child) => this.appendChild(child));
  };

  this.appendChild = (child) => {
    if (child === null || child === undefined || child === false) {
      return child;
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  };

  this.removeChild = (child) => {
    this.children = this.children.filter((existing) => existing !== child);
    child.parentNode = null;
    return child;
  };

  this.replaceChildren = (...children) => {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...children);
  };

  this.setAttribute = (name, value) => {
    this.attributes.set(name, String(value));
    if (name === "class") {
      this.className = String(value);
    }
    if (name === "value") {
      this.value = String(value);
    }
    if (name === "disabled") {
      this.disabled = true;
    }
    if (name === "hidden") {
      this.hidden = true;
    }
  };

  this.removeAttribute = (name) => {
    this.attributes.delete(name);
    if (name === "hidden") {
      this.hidden = false;
    }
    if (name === "disabled") {
      this.disabled = false;
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

  this.focus = () => {};

  this.querySelector = (selector) => findElement(this, selector);
  this.querySelectorAll = (selector) => findElements(this, selector);

  Object.defineProperty(this, "firstChild", {
    get: () => this.children[0] || null,
  });

  Object.defineProperty(this, "options", {
    get: () => this.children.filter((child) => child.tagName === "OPTION"),
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
