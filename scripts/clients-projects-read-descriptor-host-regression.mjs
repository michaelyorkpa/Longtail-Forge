import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { modulesService } from "../src/core/modules/modules.service.js";
import { appShellService } from "../src/services/app-shell.service.js";
import { querySql, runSql, sqlText } from "../src/db/index.js";
import { clientsService } from "../src/modules/client-projects/clients.service.js";
import { clientsRepository } from "../src/modules/client-projects/clients.repo.js";
import { projectsRepository } from "../src/modules/client-projects/projects.repo.js";
import { clientProjectsModule } from "../src/modules/client-projects/module.js";

const appVersion = "0.33.5.21.7.7";
const businessWorkspaceId = "clients-projects-descriptor-business";
const personalWorkspaceId = "clients-projects-descriptor-personal";
const familyWorkspaceId = "clients-projects-descriptor-family";
const businessUserId = "clients-projects-descriptor-business-user";
const personalUserId = "clients-projects-descriptor-personal-user";
const familyUserId = "clients-projects-descriptor-family-user";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const clientsServiceSource = readText("src/modules/client-projects/clients.service.js");
const clientsRoutes = readText("src/modules/client-projects/clients.routes.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects read descriptor version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects read descriptor version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects read descriptor version");
assert.equal(clientProjectsModule.version, appVersion, "Clients/Projects module should report the descriptor host version");

assertMinimalHost(clientsHtml, {
  label: "Clients",
  hostClass: "clients-page",
  forbiddenHooks: /\b(data-add-client|data-client-list|data-client-status-filter|data-client-project-status|client-filters|page-heading)\b/,
});
assertMinimalHost(projectsHtml, {
  label: "Projects",
  hostClass: "projects-page",
  forbiddenHooks: /\b(data-add-project-top|data-client-list|data-client-status-filter|data-project-client-filter|data-client-project-status|project-page-toolbar|page-heading)\b/,
});
assert.match(clientsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Clients host should load builder, renderer, then adapter");
assert.match(projectsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Projects host should load builder, renderer, then adapter");

assert.doesNotMatch(clientsProjectsScript, /function ensureClientProjectsPageHost\(\)/, "Adapter should no longer recreate page/filter/status/list anatomy inside minimal hosts");
assert.match(clientsProjectsScript, /async function initializeClientProjectsPage\(\)[\s\S]*await window\.LongtailForge\?\.workspaceContextReady[\s\S]*activeClientProjectsReadSurface = renderClientProjectsReadSurface\(\)/, "Adapter should wait for app-shell viewSurfaces before rendering descriptor pages");
assert.match(clientsProjectsScript, /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/, "Adapter should render Clients/Projects pages through the descriptor renderer");
assert.match(clientsProjectsScript, /loadPageData\(\{ renderPage: false \}\)/, "Descriptor pages should hydrate dialog/query data without invoking the legacy page renderer");
assert.match(clientsProjectsScript, /registerClientProjectsModuleActionBehavior\("client-projects\.clients\.create", "clients\.add"\)/, "Clients Add action should dispatch through the canonical module action");
assert.match(clientsProjectsScript, /registerClientProjectsModuleActionBehavior\("client-projects\.clients\.edit", "clients\.edit"\)/, "Clients Edit action should dispatch through the canonical module action");
assert.match(clientsProjectsScript, /registerClientProjectsModuleActionBehavior\("client-projects\.projects\.create", "projects\.add"\)/, "Projects Add action should dispatch through the canonical module action");
assert.match(clientsProjectsScript, /registerClientProjectsModuleActionBehavior\("client-projects\.projects\.edit", "projects\.edit"\)/, "Projects Edit action should dispatch through the canonical module action");
assert.match(clientsProjectsScript, /function hydrateProjectClientFilterOptions[\s\S]*!clientsEnabledForWorkspace\(\)[\s\S]*hideDescriptorField/, "Projects Client filter should be hidden/unavailable outside Business workspaces");
assert.match(clientsProjectsScript, /function withInitialProjectClientFilter[\s\S]*contextWorkspaceType !== "business"/, "URL Client filter seeding should not submit Client IDs in Personal or Family workspaces");
assert.match(clientsProjectsScript, /function openClientProjectModuleAction[\s\S]*moduleActions\.open\(actionId, params/, "Descriptor actions should use the shared module action registry");
assert.match(clientsProjectsScript, /function openAddClientDialog/, "Add Client dialog opener should remain module-owned");
assert.match(clientsProjectsScript, /function openAddProjectDialog/, "Add Project dialog opener should remain module-owned");
assert.doesNotMatch(clientsProjectsScript, /function openAddClientModal\(\)/, "Adapter should not keep the duplicate Add Client modal opener");
assert.doesNotMatch(clientsProjectsScript, /window\.LongtailForge\.moduleActions\?\.register/, "Adapter should not duplicate first-party module action registration");
assert.match(clientsProjectsScript, /\/api\/client-projects/, "Dialog and option workflows should keep the shared /api/client-projects source");

const surfaces = new Map(clientProjectsModule.viewSurfaces.map((surface) => [surface.id, surface]));
const clientsSurface = surfaces.get("client-projects.clients");
const projectsSurface = surfaces.get("client-projects.projects");
assert.ok(clientsSurface, "Clients descriptor should be declared separately");
assert.ok(projectsSurface, "Projects descriptor should be declared separately");
assert.notEqual(clientsSurface, projectsSurface, "Clients and Projects descriptors should not share one combined surface");

assertDescriptor(clientsSurface, {
  viewId: "clients",
  route: "/api/clients?include_depth=true",
  filters: ["status", "tagIds"],
  requiredBindings: [
    "id",
    "name",
    "displayLabel",
    "status",
    "parentClientId",
    "depth",
    "displayPath",
    "billable",
    "billingRate",
    "billingPeriod",
    "billingDisplay",
    "tags",
    "tagSummary",
  ],
});
assertDescriptor(projectsSurface, {
  viewId: "projects",
  route: "/api/projects?include_depth=true",
  filters: ["clientId", "status", "tagIds"],
  requiredBindings: [
    "id",
    "name",
    "displayLabel",
    "status",
    "clientId",
    "clientName",
    "parentProjectId",
    "parentProjectName",
    "depth",
    "displayPath",
    "billable",
    "billingRate",
    "billingPeriod",
    "billingDisplay",
    "taskDefaults",
    "tags",
    "tagSummary",
  ],
});
assert.doesNotMatch(clientsSurface.dataSource.route, /\/api\/client-projects/, "Clients page descriptor should not use the combined option route");
assert.doesNotMatch(projectsSurface.dataSource.route, /\/api\/client-projects/, "Projects page descriptor should not use the combined option route");

assert.match(clientsRoutes, /clientsRoutes\.get\("\/client-projects"/, "Combined option route should remain available");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/clients"/, "Clients canonical read route should remain available");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/projects"/, "Projects canonical read route should remain available");
assert.match(clientsServiceSource, /async function listClients[\s\S]*assertBusinessWorkspace\(session\)[\s\S]*filterReadableClients[\s\S]*filterRecordsByTags[\s\S]*buildClientShape\(decoratedClients, shapeOptions\)/, "Clients canonical read path should keep Business gating, permission pruning, tag filtering, and hierarchy shaping server-owned");
assert.match(clientsServiceSource, /async function listProjects[\s\S]*filterReadableProjects[\s\S]*normalizeProjectClientFilter[\s\S]*filterRecordsByTags[\s\S]*buildProjectReadShape\(decoratedProjects, orderingClients, shapeOptions\)/, "Projects canonical read path should keep permission pruning, client/status/tag filtering, and hierarchy shaping server-owned");
assert.match(clientsServiceSource, /function buildClientShape[\s\S]*sortHierarchy[\s\S]*decorateClientShape/, "Clients read shape should preserve hierarchy ordering");
assert.match(clientsServiceSource, /function buildProjectShape[\s\S]*sortProjectHierarchy[\s\S]*decorateProjectShape/, "Project option/dialog reads should preserve hierarchy ordering");
assert.match(clientsServiceSource, /function buildProjectReadShape[\s\S]*projectReadGroups[\s\S]*sortProjectHierarchy[\s\S]*decorateProjectShape/, "Projects page reads should preserve service-owned workspace and Client group hierarchy ordering");
assert.match(clientsServiceSource, /billing_display: formatBillingDisplay/, "Descriptor reads should expose a server-shaped billing display field");
assert.match(clientsServiceSource, /tag_summary: formatTagSummary/, "Descriptor reads should expose a server-shaped tag summary field");

await ensureWorkspace(businessWorkspaceId, "business", businessUserId);
await ensureWorkspace(personalWorkspaceId, "personal", personalUserId);
await ensureWorkspace(familyWorkspaceId, "family", familyUserId);
await seedBusinessReadRecords();
await Promise.all([
  modulesService.syncModuleRegistry(businessWorkspaceId),
  modulesService.syncModuleRegistry(personalWorkspaceId),
  modulesService.syncModuleRegistry(familyWorkspaceId),
]);

const businessShell = await appShellService.bootstrap(sessionFor(businessWorkspaceId, businessUserId));
const personalShell = await appShellService.bootstrap(sessionFor(personalWorkspaceId, personalUserId));
const familyShell = await appShellService.bootstrap(sessionFor(familyWorkspaceId, familyUserId));

assertSurfaceDelivery(businessShell, { clients: true, projects: true, label: "Business" });
assertSurfaceDelivery(personalShell, { clients: false, projects: true, label: "Personal" });
assertSurfaceDelivery(familyShell, { clients: false, projects: true, label: "Family" });

const businessRead = await clientsService.listClients(sessionFor(businessWorkspaceId, businessUserId), {
  include_depth: "true",
  status: "All",
});
assert.ok(businessRead.clients.some((client) => client.id === "cpd-child-client" && client.depth === 1), "Clients read should expose hierarchy depth for descriptor binding");
assert.ok(businessRead.clients.some((client) => client.id === "cpd-parent-client" && client.billing_display), "Clients read should expose billing display metadata");

const projectRead = await clientsService.listProjects(sessionFor(personalWorkspaceId, personalUserId), {
  include_depth: "true",
  status: "All",
});
assert.ok(Array.isArray(projectRead.projects), "Projects read should be available in Personal project-only workspaces");

await assert.rejects(
  () => clientsService.listClients(sessionFor(personalWorkspaceId, personalUserId), { include_depth: "true" }),
  (error) => error?.statusCode === 403 && /Clients are only available in Business workspaces/.test(error.message),
  "Clients read should remain Business-only in Personal workspaces",
);
await assert.rejects(
  () => clientsService.listClients(sessionFor(familyWorkspaceId, familyUserId), { include_depth: "true" }),
  (error) => error?.statusCode === 403 && /Clients are only available in Business workspaces/.test(error.message),
  "Clients read should remain Business-only in Family workspaces",
);

assert.match(regressionSuite, /scripts\/clients-projects-read-descriptor-host-regression\.mjs/, "Regression suite should include the 13.2 Clients/Projects descriptor host regression");

console.log("Clients/Projects read descriptor and minimal host regression passed.");

function assertMinimalHost(html, { label, hostClass, forbiddenHooks }) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.match(body, new RegExp(`<main class="wide-page client-projects-page ${hostClass}" data-client-projects-host><\\/main>`), `${label} host should be minimal`);
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} host should not ship protected page anatomy`);
  assert.doesNotMatch(body, forbiddenHooks, `${label} host should not ship legacy page hooks outside the adapter bridge`);
}

function assertDescriptor(surface, { viewId, route, filters, requiredBindings }) {
  assert.equal(surface.moduleId, "client-projects", `${surface.id} should belong to the Clients/Projects module`);
  assert.equal(surface.viewId, viewId, `${surface.id} should bind to the ${viewId} protected view`);
  assert.equal(surface.layout, "table-page", `${surface.id} should use table-page read anatomy`);
  assert.equal(surface.dataSource.route, route, `${surface.id} should use its canonical list route`);
  assert.equal(surface.dataSource.method, "GET", `${surface.id} should read with GET`);
  assert.ok(surface.pageHeader.primaryAction?.behavior, `${surface.id} should expose a descriptor page action behavior`);
  assert.deepEqual((surface.filters || []).map((filter) => filter.field), filters, `${surface.id} should expose the expected server-owned filters`);
  assert.equal(surface.indexPanel.itemDepthField, "depth", `${surface.id} should bind index hierarchy depth`);
  assert.equal(surface.table.hierarchy.depthField, "depth", `${surface.id} should bind table hierarchy depth`);
  assert.ok(surface.table.columns.some((column) => column.formatter === "hierarchy-label"), `${surface.id} should use the hierarchy-label display hook`);
  assert.ok(surface.table.secondaryRows?.some((row) => row.formatter === "chip-list"), `${surface.id} should use the chip-list display hook in secondary table rows`);
  assert.ok(surface.table.rowActions?.some((action) => action.behavior), `${surface.id} should expose descriptor row action behavior`);

  for (const binding of requiredBindings) {
    assert.ok(Object.hasOwn(surface.dataSource.fieldBindings, binding), `${surface.id} should bind ${binding}`);
  }
}

function assertSurfaceDelivery(shell, { clients, projects, label }) {
  const surfaceIds = new Set((shell.viewSurfaces || []).map((surface) => surface.id));

  assert.equal(surfaceIds.has("client-projects.clients"), clients, `${label} bootstrap should ${clients ? "" : "not "}deliver the Clients descriptor`);
  assert.equal(surfaceIds.has("client-projects.projects"), projects, `${label} bootstrap should ${projects ? "" : "not "}deliver the Projects descriptor`);
  assert.deepEqual(shell.workspaceContext.viewSurfaces, shell.viewSurfaces, `${label} workspace context should receive the same descriptor payload`);
}

async function seedBusinessReadRecords() {
  await runSql(`
DELETE FROM projects
WHERE workspace_id = ${sqlText(businessWorkspaceId)}
  AND id LIKE 'cpd-%';
DELETE FROM clients
WHERE workspace_id = ${sqlText(businessWorkspaceId)}
  AND id LIKE 'cpd-%';
`);

  const parentClient = {
    id: "cpd-parent-client",
    parent_client_id: "",
    name: "Acme Parent",
    status: "Active",
    billable: "yes",
    billing_rate: "125",
    billing_period: null,
    billing_rounding: null,
    billing_contact: {},
  };
  const childClient = {
    ...parentClient,
    id: "cpd-child-client",
    parent_client_id: parentClient.id,
    name: "Acme Child",
    billing_rate: "95",
  };
  const parentProject = {
    id: "cpd-parent-project",
    parent_project_id: "",
    name: "Parent Project",
    status: "Active",
    billable: "yes",
    billing_rate: "100",
    billing_period: null,
    billing_rounding: null,
    taskDefaults: {},
  };
  const childProject = {
    ...parentProject,
    id: "cpd-child-project",
    parent_project_id: parentProject.id,
    name: "Child Project",
  };

  await clientsRepository.create(businessWorkspaceId, parentClient);
  await clientsRepository.create(businessWorkspaceId, childClient);
  await projectsRepository.create(businessWorkspaceId, parentClient.id, parentProject);
  await projectsRepository.create(businessWorkspaceId, parentClient.id, childProject);
}

async function ensureWorkspace(workspaceId, workspaceType, userId) {
  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, ${sqlText(`Clients Projects ${workspaceType}`)}, 'Active', ${sqlText(workspaceType)}, datetime('now'), datetime('now'))
ON CONFLICT(workspace_id) DO UPDATE SET
  workspace_type = excluded.workspace_type,
  status = 'Active',
  updated_at = datetime('now');

INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  task_timers_enabled,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  1,
  1,
  NULL,
  'calendarMonth',
  1,
  0,
  'nearestQuarterHour',
  1,
  30,
  datetime('now'),
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(workspace_id) DO UPDATE SET
  updated_at = datetime('now');
`);
  await ensureUser(workspaceId, userId);
}

async function ensureUser(workspaceId, userId) {
  const username = `${userId}@example.test`;
  const rows = await querySql(`
SELECT user_id
FROM users
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);

  if (rows.length === 0) {
    await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  ${sqlText(username)},
  'fixture-password',
  'yes',
  ${sqlText(workspaceId)}
);
`);
  } else {
    await runSql(`
UPDATE users
SET home_workspace_id = ${sqlText(workspaceId)},
    username = ${sqlText(username)},
    active_workspace_id = ${sqlText(workspaceId)},
    protected_user = 'yes'
WHERE user_id = ${sqlText(userId)};
`);
  }

  await runSql(`
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(`${userId}-membership`)}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', datetime('now'), datetime('now'))
ON CONFLICT(user_workspace_id) DO UPDATE SET
  status = 'active',
  updated_at = datetime('now');

DELETE FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)};

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  'workspace_admin',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
);
`);
}

function sessionFor(workspaceId, userId) {
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    workspace_id: workspaceId,
    user_id: userId,
    username: userId,
  };
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
