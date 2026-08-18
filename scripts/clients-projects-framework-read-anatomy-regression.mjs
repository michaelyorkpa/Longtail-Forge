import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import vm from "node:vm";

import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";
import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const responseRecords = readText("public/js/shared/view-response-records.js");
const surfaceDescriptor = readText("public/js/shared/view-surface-descriptor.js");
const css = readText("public/css/longtail-forge.css");
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");

const fixture = await createDisposableDatabaseFixture("clients-projects-framework-read-anatomy-regression");
await import("../src/core/modules/modules.service.js");
const { clientProjectsModule } = await import("../src/modules/client-projects/module.js");

assert.equal(clientProjectsModule.version, appVersion, "Clients/Projects module should report the read anatomy version");

assertMinimalHost(clientsHtml, "Clients");
assertMinimalHost(projectsHtml, "Projects");
assert.doesNotMatch(clientsProjectsScript, /function ensureClientProjectsPageHost\(\)/, "Read anatomy should not be recreated inside the Clients/Projects adapter");
assert.match(
  clientsProjectsScript,
  /async function initializeClientProjectsPage\(\)[\s\S]*await window\.LongtailForge\?\.workspaceContextReady[\s\S]*await loadPageData\(\{ applyQueryActions: false \}\)[\s\S]*activeClientProjectsReadSurface = renderClientProjectsReadSurface\(\)[\s\S]*applyClientProjectQueryActions\(\)/,
  "Adapter should wait for app-shell viewSurfaces and server-shaped capabilities before rendering descriptor read pages",
);
assert.match(clientsProjectsScript, /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/, "Adapter should render the descriptor surface into the minimal host");
assert.match(clientsProjectsScript, /function openAddClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.add"/, "Add Client query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openEditClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.edit", \{ clientId: client\.id \}/, "Client detail query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openAddProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.add"/, "Add Project query opener should dispatch the registered module action");
assert.match(clientsProjectsScript, /function openEditProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.edit", \{ projectId: match\.project\.id \}/, "Project detail query opener should dispatch the registered module action");

assert.match(renderer, /function tableColumns[\s\S]*table\.rowActions[\s\S]*__view_row_actions/, "Renderer should add a framework-owned table action column from descriptor rowActions");
assert.match(builder, /Object\.hasOwn\(column, "label"\)[\s\S]*\? column\.label/, "The table builder should preserve an explicitly blank descriptor header instead of falling back to an internal column key");
assert.match(renderer, /Object\.hasOwn\(selection, "headerLabel"\)[\s\S]*selection\.headerLabel/, "Selection columns should support a blank visible heading without changing checkbox accessible names");
assert.match(renderer, /Object\.hasOwn\(table, "rowActionsHeaderLabel"\)[\s\S]*table\.rowActionsHeaderLabel/, "Row-action columns should support a blank visible heading without changing action accessible names");
assert.match(css, /\.client-projects-filter-panel \.view-filter-panel-fields\s*\{[\s\S]*padding: 6px/, "Clients/Projects filter fields should leave focus-ring clearance inside the scrolling drawer");
assert.match(css, /tr:has\(\+ \.client-projects-tag-row\)[\s\S]*border-bottom: 0/, "Client/Project tag rows should visually join the record-name row without an extra divider");
assert.match(css, /\.client-projects-tag-row \.surface-chip\s*\{[\s\S]*max-width: 100%[\s\S]*overflow-wrap: anywhere/, "Client/Project tag chips should contain long labels within their borders");

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
assert.equal(clientsDescriptor.table.selection.headerLabel, "", "Clients should keep the selection column while suppressing its redundant visible heading");
assert.equal(projectsDescriptor.table.selection.headerLabel, "", "Projects should keep the selection column while suppressing its redundant visible heading");
assert.equal(clientsDescriptor.table.rowActionsHeaderLabel, "", "Clients should keep row actions while suppressing the redundant Actions heading");
assert.equal(projectsDescriptor.table.rowActionsHeaderLabel, "", "Projects should keep row actions while suppressing the redundant Actions heading");
assert.equal(clientsDescriptor.table.columns[0].field, "displayLabel", "Clients table should consume the service-shaped hierarchy label with its child hyphen");
assert.equal(projectsDescriptor.table.columns[0].field, "displayLabel", "Projects table should consume the service-shaped hierarchy label with its child hyphen");
assert.equal(clientsDescriptor.table.secondaryRows[0].label, undefined, "Clients tag chips should not repeat a Tags label");
assert.equal(projectsDescriptor.table.secondaryRows[0].label, undefined, "Projects tag chips should not repeat a Tags label");
assert.deepEqual(
  clientsDescriptor.table.rowActions.map((action) => ({
    icon: action.icon,
    iconOnly: action.iconOnly,
    label: action.label,
    title: action.title,
  })),
  [
    { icon: "add", iconOnly: true, label: "Add Child Client", title: "Add Child Client" },
    { icon: "edit", iconOnly: true, label: "Edit Client", title: "Edit Client" },
  ],
  "Clients repeated row actions should remain exact icon-only controls",
);
assert.ok(projectsDescriptor.table.rowActions.every((action) => action.icon === "edit" && action.iconOnly === true), "Projects repeated row actions should be icon-only");

const clientsContext = createFakeBrowserContext({
  responses: [{
    clients: [
      clientRecord({ id: "client-parent", name: "Acme Parent", depth: 0 }),
      clientRecord({ id: "client-child", name: "Acme Child", parent_client_id: "client-parent", depth: 1 }),
    ],
  }],
  workspaceContext: {
    permissionIds: ["clients.manage"],
    workspaceId: "clients-projects-read-anatomy",
    workspaceType: "business",
  },
  iconButton: { iconClass: false },
});
vm.runInNewContext(surfaceDescriptor, clientsContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, clientsContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, clientsContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, clientsContext, { filename: "view-renderer.js" });

/** @typedef {import("./test-support/fake-dom.mjs").FakeNode} FakeNode */
/**
 * A rendered read surface: fake-DOM anatomy plus the renderer-owned refresh
 * path this regression awaits.
 * @typedef {FakeNode & { refresh: () => Promise<unknown> }} ReadSurface
 */
/**
 * The published `LongtailForge.view` read-anatomy entry points under test.
 * @typedef {{ registerBehavior: (id: string, handler: Function) => void, renderSurface: (descriptor: object, host: FakeNode) => ReadSurface }} ReadViewSurface
 */
const clientActionCalls = [];
const clientsView = /** @type {ReadViewSurface} */ (clientsContext.window.LongtailForge.view);
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
assert.ok(clientHierarchyLabels.some((label) => label.dataset.viewHierarchyDepth === "1" && /^- Acme Child$/.test(label.textContent)), "Client hierarchy labels should carry child indentation metadata and the service-shaped child hyphen");
assert.match(clientsSurface.textContent, /Focus/, "Client tag chips should render readable tag names through chip-list display");
assert.deepEqual(clientsSurface.querySelectorAll("th").map((header) => header.textContent), ["", "Client", "Status", "Billing", ""], "Clients should retain selection/action columns without redundant visible headings");
assert.equal(clientsSurface.querySelector(".client-projects-tag-row").textContent, "Focus", "Clients tag row should place chips directly below the name without a redundant Tags label");

await findButtonByText(clientsSurface, "Add Client").click();
assert.equal(findButtonByLabel(clientsSurface, "Edit Client").textContent, "", "Client edit row action should not render repeated text");
await findButtonByLabel(clientsSurface, "Edit Client").click();
assert.deepEqual(clientActionCalls, [
  { behavior: "client-projects.clients.create", recordId: "" },
  { behavior: "client-projects.clients.edit", recordId: "client-parent" },
], "Clients page and row actions should dispatch module-owned behavior handlers with safe record context");

const projectsContext = createFakeBrowserContext({
  responses: [{
    projects: [
      projectRecord({ id: "project-parent", name: "Buildout", depth: 0 }),
      projectRecord({ id: "project-child", name: "Launch", parent_project_id: "project-parent", depth: 1 }),
    ],
  }],
  workspaceContext: {
    permissionIds: ["projects.manage"],
    workspaceId: "clients-projects-read-anatomy",
    workspaceType: "business",
  },
  iconButton: { iconClass: false },
});
vm.runInNewContext(surfaceDescriptor, projectsContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, projectsContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, projectsContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, projectsContext, { filename: "view-renderer.js" });

const projectActionCalls = [];
const projectsView = /** @type {ReadViewSurface} */ (projectsContext.window.LongtailForge.view);
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
assert.ok(projectsSurface.querySelectorAll(".view-hierarchy-label").some((label) => label.dataset.viewHierarchyDepth === "1" && /^- Launch$/.test(label.textContent)), "Project hierarchy labels should carry child indentation metadata and the service-shaped child hyphen");
assert.match(projectsSurface.textContent, /Acme Parent/, "Project Client labels should render from module-shaped readable labels");
assert.match(projectsSurface.textContent, /Focus/, "Project tag chips should render readable tag names through chip-list display");
assert.deepEqual(projectsSurface.querySelectorAll("th").map((header) => header.textContent), ["", "Project", "Client", "Status", "Billing", ""], "Projects should retain selection/action columns without redundant visible headings");
assert.equal(projectsSurface.querySelector(".client-projects-tag-row").textContent, "Focus", "Projects tag row should place chips directly below the name without a redundant Tags label");

await findButtonByText(projectsSurface, "Add Project").click();
assert.equal(findButtonByLabel(projectsSurface, "Edit Project").textContent, "", "Project edit row action should not render repeated text");
await findButtonByLabel(projectsSurface, "Edit Project").click();
assert.deepEqual(projectActionCalls, [
  { behavior: "client-projects.projects.create", recordId: "" },
  { behavior: "client-projects.projects.edit", recordId: "project-parent" },
], "Projects page and row actions should dispatch module-owned behavior handlers with safe record context");

console.log("Clients/Projects framework-rendered read anatomy regression passed.");
const { closeDatabase } = await import("../src/db/provider.js");
await closeDatabase();
await fixture.cleanup();

function clientRecord(overrides = {}) {
  const name = overrides.name || "Client";
  const depth = overrides.depth || 0;
  return {
    id: overrides.id || "client",
    name,
    display_label: depth > 0 ? `- ${name}` : name,
    status: "Active",
    parent_client_id: overrides.parent_client_id || "",
    depth,
    display_path: overrides.parent_client_id ? "Acme Parent / Acme Child" : "Acme Parent",
    billable: "yes",
    billing_rate: "125",
    billing_period: "calendarMonth",
    billing_rounding: null,
    billing_display: "Billable at $125/hr",
    can_manage: true,
    tag_summary: "Focus",
    tags: [{ tag_id: "tag-focus", name: "Focus" }],
  };
}

function projectRecord(overrides = {}) {
  const name = overrides.name || "Project";
  const depth = overrides.depth || 0;
  return {
    id: overrides.id || "project",
    name,
    display_label: depth > 0 ? `- ${name}` : name,
    status: "Active",
    client_id: "client-parent",
    client_name: "Acme Parent",
    parent_project_id: overrides.parent_project_id || "",
    parent_project_name: overrides.parent_project_id ? "Buildout" : "",
    depth,
    display_path: overrides.parent_project_id ? "Buildout / Launch" : "Buildout",
    billable: "yes",
    billing_rate: "100",
    billing_period: "calendarMonth",
    billing_rounding: null,
    billing_display: "Billable at $100/hr",
    can_manage: true,
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
