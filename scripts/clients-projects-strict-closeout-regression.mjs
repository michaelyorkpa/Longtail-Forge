import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.1";

await import("../src/core/modules/modules.service.js");
const { clientProjectsModule } = await import("../src/modules/client-projects/module.js");

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsProjectsScript = readText("public/js/clients-projects.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const viewRenderer = readText("public/js/shared/view-renderer.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const changelog = readText("CHANGELOG.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const inventoryDoc = readText("docs/clients-projects-strict-guardrail-inventory.md");

assert.equal(packageJson.version, appVersion, "package.json should report the strict Clients/Projects cleanup version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the strict Clients/Projects cleanup version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the strict Clients/Projects cleanup version");
assert.equal(clientProjectsModule.version, appVersion, "Clients/Projects module should report the strict cleanup version");

const surfaces = new Map(clientProjectsModule.viewSurfaces.map((surface) => [surface.id, surface]));
assertStrictSurface(surfaces.get("client-projects.clients"), {
  label: "Clients",
  route: "/api/clients?include_depth=true",
  editLabel: "Edit Client",
  tagRowId: "client-tags",
});
assertStrictSurface(surfaces.get("client-projects.projects"), {
  label: "Projects",
  route: "/api/projects?include_depth=true",
  editLabel: "Edit Project",
  tagRowId: "project-tags",
});

assertMinimalStrictHost(clientsHtml, "Clients");
assertMinimalStrictHost(projectsHtml, "Projects");
assert.match(clientsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Clients should load the updated shared renderer stack");
assert.match(projectsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Projects should load the updated shared renderer stack");

assert.match(manifestContract, /VIEW_FILTER_PLACEMENTS[\s\S]*slide-out-sidebar/, "Manifest contract should allow shared filter placement");
assert.match(manifestContract, /VIEW_TABLE_SECONDARY_ROW_FIELDS[\s\S]*startColumn[\s\S]*endBeforeColumn/, "Manifest contract should allow table secondary rows");
assert.match(manifestContract, /VIEW_ACTION_FIELDS[\s\S]*iconOnly/, "Manifest contract should allow icon-only descriptor actions");
assert.match(viewRenderer, /function renderTablePageSlideOutLayout[\s\S]*Open filters/, "Renderer should own table-page slide-out filters");
assert.match(viewRenderer, /function tableSecondaryRows[\s\S]*renderTableSecondaryRow/, "Renderer should own secondary table rows");
assert.match(viewRenderer, /function normalizeAction[\s\S]*iconOnly[\s\S]*normalized\.text = ""/, "Renderer should preserve icon-only action metadata");
assert.match(viewBuilder, /function createDataSecondaryRow[\s\S]*view-data-table-secondary-row/, "Data-table helper should render secondary rows");

for (const forbidden of [
  "function renderClients(",
  "function createProjectTable(",
  "function createClientTable(",
  "function openProjectBulkEditor(",
  "document.createElement(\"table\")",
  "document.createElement(\"dialog\")",
  "data-client-status-filter",
  "data-project-client-filter",
  "data-client-table-select",
  "data-project-table-select",
  "list-table-wrap",
  "project-bulk-dialog",
]) {
  assert.doesNotMatch(clientsProjectsScript, new RegExp(escapeRegExp(forbidden)), `Clients/Projects strict adapter should not keep ${forbidden}`);
}

assert.match(clientsProjectsScript, /view\.registerBehavior\("client-projects\.clients\.bulk", mountClientBulkToolbar\)/, "Client bulk behavior should remain module-registered");
assert.match(clientsProjectsScript, /view\.registerBehavior\("client-projects\.projects\.bulk", mountProjectBulkToolbar\)/, "Project bulk behavior should remain module-registered");
assert.match(clientsProjectsScript, /\/api\/client-projects/, "Dialog and bulk data refresh should keep the existing client-projects route");
assert.match(clientsProjectsScript, /\/api\/clients/, "Client saves should keep existing Client route calls");
assert.match(clientsProjectsScript, /\/api\/projects/, "Project saves should keep existing Project route calls");

assert.match(inventoryDoc, /Current as of 0\.33\.5\.18\.15[\s\S]*strict enforcement is active/, "Inventory should mark Clients/Projects strict guardrails active at branch closeout");
assert.match(changelog, /Version 0\.33\.5\.18\.14\.5[\s\S]*no database schema, route payload, permission, or workflow changes/, "Changelog should record the no-contract-change boundary");
assert.match(roadmap, /Completed 0\.33\.5\.18\.14\.5 is archived/, "Roadmap should archive the completed strict cleanup slice");
assert.match(regressionSuite, /scripts\/clients-projects-strict-closeout-regression\.mjs/, "Regression suite should include the strict cleanup closeout regression");

console.log("Clients/Projects strict closeout regression passed.");

function assertStrictSurface(surface, { label, route, editLabel, tagRowId }) {
  assert.ok(surface, `${label} descriptor should exist`);
  assert.equal(surface.layout, "table-page", `${label} should remain a table-page read surface`);
  assert.equal(surface.filterPlacement, "slide-out-sidebar", `${label} filters should use the shared slide-out surface`);
  assert.ok(surface.sidebarPanels.some((panel) => panel.type === "filters"), `${label} should declare a filters sidebar panel`);
  assert.equal(surface.dataSource.route, route, `${label} route should not change in the cleanup slice`);
  assert.equal(surface.table.columns.some((column) => column.label === "Tags" || column.id?.endsWith("-tags")), false, `${label} should not have a standalone Tags table column`);
  assert.ok(surface.table.secondaryRows.some((row) => row.id === tagRowId && row.formatter === "chip-list" && row.startColumn === "name"), `${label} should render tags as a secondary row`);
  assert.deepEqual(
    surface.table.rowActions.map((action) => ({
      icon: action.icon,
      iconOnly: action.iconOnly,
      label: action.label,
      title: action.title,
    })),
    [{ icon: "edit", iconOnly: true, label: editLabel, title: editLabel }],
    `${label} repeated table action should be an icon-only edit control`,
  );
}

function assertMinimalStrictHost(html, label) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.match(body, /data-client-projects-host/, `${label} host should expose the descriptor host`);
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} protected host should not ship page anatomy`);
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
