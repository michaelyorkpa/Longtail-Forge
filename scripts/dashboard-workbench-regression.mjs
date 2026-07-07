import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { modulesService } from "../src/core/modules/modules.service.js";

const files = {
  dashboard: readText("public/js/dashboard.js"),
  dashboardView: readText("views/protected/dashboard.html"),
  manifestContract: readText("src/core/modules/manifest-contract.js"),
  reporting: readText("public/js/reporting.js"),
  reportingService: readText("src/services/reporting.service.js"),
  tasksService: readText("src/modules/tasks/tasks.service.js"),
  tasksRoutes: readText("src/modules/tasks/tasks.routes.js"),
  workbench: readText("public/js/workbench.js"),
  workbenchView: readText("views/protected/workbench.html"),
  modulesService: readText("src/core/modules/modules.service.js"),
  workbenchService: readText("src/services/workbench.service.js"),
};

const modules = modulesService.listModules();
const tasksModule = modules.find((moduleDefinition) => moduleDefinition.id === "tasks");
const timeTrackingModule = modules.find((moduleDefinition) => moduleDefinition.id === "time-tracking");
const clientProjectsModule = modules.find((moduleDefinition) => moduleDefinition.id === "client-projects");

assert.ok(tasksModule, "Tasks module must be registered");
assert.ok(timeTrackingModule, "Time Tracking module must be registered");
assert.ok(clientProjectsModule, "Client Projects module must be registered");

for (const moduleDefinition of modules) {
  for (const panel of moduleDefinition.dashboard || []) {
    assert.ok(panel.id, `${moduleDefinition.id} dashboard contribution id is required`);
    assert.ok(panel.label, `${moduleDefinition.id}:${panel.id} dashboard label is required`);
    assert.ok(panel.renderer, `${moduleDefinition.id}:${panel.id} dashboard renderer is required`);
    assert.equal(panel.moduleId, moduleDefinition.id, `${moduleDefinition.id}:${panel.id} dashboard moduleId must match owner`);
  }

  for (const card of moduleDefinition.workbench || []) {
    assert.ok(card.id, `${moduleDefinition.id} workbench contribution id is required`);
    assert.ok(card.label, `${moduleDefinition.id}:${card.id} workbench label is required`);
    assert.ok(card.renderer, `${moduleDefinition.id}:${card.id} workbench renderer is required`);
    assert.equal(card.moduleId, moduleDefinition.id, `${moduleDefinition.id}:${card.id} workbench moduleId must match owner`);
  }
}

assert.ok(
  tasksModule.dashboard.some((panel) =>
    panel.id === "task-summary" &&
    panel.renderer === "task-summary" &&
    panel.requiresEnabledModules?.includes("tasks")),
  "Tasks dashboard summary must be a registered renderer contribution",
);
assert.ok(
  timeTrackingModule.dashboard.some((panel) =>
    panel.id === "billing-summary" &&
    panel.renderer === "billing-summary" &&
    panel.requiresEnabledModules?.includes("time-tracking")),
  "Time Tracking billing dashboard must be a registered renderer contribution",
);
assert.ok(
  tasksModule.workbench.some((card) =>
    card.id === "task-workbench-items" &&
    card.renderer === "task-workbench-items" &&
    card.listRoute === "/api/tasks/workbench-items"),
  "Tasks workbench card must declare its renderer and source route",
);
assert.ok(
  timeTrackingModule.workbench.some((card) =>
    card.id === "active-work-timers" &&
    card.renderer === "active-work-timers" &&
    card.listRoute === "/api/active-timers/all"),
  "Time Tracking workbench card must declare its renderer and source route",
);

assert.match(
  files.reportingService,
  /modulesService\.listDashboardPanels/,
  "dashboard API must read permission-filtered dashboard panel contributions",
);
assert.match(
  files.reportingService,
  /parentScopeId:\s*String\(client\.parent_client_id/,
  "reporting scopes must preserve parent client IDs for nested reporting scope display",
);
assert.match(
  files.reportingService,
  /sortScopeTree\(attachDescendantClientProjects\(decorateScopeDepths\(clientScopes\)\)\)/,
  "business reporting scopes must be sorted by client tree instead of flat name order",
);
assert.match(
  files.reportingService,
  /filterRollupProjects\(projects,\s*\{\s*includeDescendants\s*\}\)/,
  "project summaries must collapse selected child project rows when parent rollups are selected",
);
assert.match(
  files.reportingService,
  /childRows:\s*includeDescendants[\s\S]*buildProjectChildRows/,
  "project summary parent rows must carry nested child display rows without adding them to footer totals",
);
assert.match(
  files.reportingService,
  /filterRollupProjects\(scope\.projects,\s*\{\s*includeDescendants:\s*true\s*\}\)/,
  "dashboard reporting totals must avoid double counting project parent and child rollups",
);
assert.match(
  files.reportingService,
  /function sortProjectTree\(projects\)[\s\S]*appendBranch\(""\)[\s\S]*return sortedProjects;/,
  "reporting service project ordering must use parent-before-child tree traversal",
);
assert.doesNotMatch(
  files.reportingService,
  /getProjectTreeSortKey/,
  "reporting service project ordering must not use path-string sorting that can separate children from parents",
);
assert.match(
  files.workbenchService,
  /modulesService\.listWorkbenchCards/,
  "workbench API must read permission-filtered workbench card contributions",
);
assert.match(
  files.workbenchService,
  /workCandidateService\.listWorkCandidates/,
  "workbench API must include framework-normalized work candidates",
);
assert.doesNotMatch(
  files.workbenchService,
  /tasksService|activeTimersService|TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID|listTaskWorkItems|["']tasks["']|["']time-tracking["']/,
  "workbench API must not import or name first-party module services or IDs directly",
);
assert.doesNotMatch(
  files.modulesService,
  /TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID|tasksEnabled:|timeTrackingEnabled:|setting\.id === "taskTimersEnabled"/,
  "module registry settings paths must not special-case Tasks or Time Tracking",
);

assert.match(
  files.dashboard,
  /dashboardPanelRenderers/,
  "dashboard browser script must dispatch through renderer registry",
);
assert.doesNotMatch(
  files.dashboard,
  /panel\.moduleId === "tasks" && panel\.id === "task-summary"/,
  "dashboard browser script must not hard-code Tasks panel matching",
);
assert.match(
  files.dashboardView,
  /data-dashboard-renderer="billing-summary"/,
  "dashboard billing sections must declare their registered renderer",
);

assert.match(
  files.workbench,
  /workbenchCardRenderers/,
  "workbench browser script must dispatch through renderer registry",
);
assert.match(
  files.workbench,
  /workbenchCardDataLoaders[\s\S]*loadWorkbenchSourceData[\s\S]*card\.listRoute/,
  "workbench browser script must load card data from contributed list routes",
);
assert.match(
  files.workbenchView,
  /<main class="workbench-page" data-workbench-host><\/main>/,
  "workbench protected HTML must be a minimal framework host",
);
assert.doesNotMatch(
  files.workbenchView,
  /data-workbench-renderer|data-workbench-card|workbench-manual-timer-form/,
  "workbench protected HTML must not carry static registered card anatomy",
);
assert.match(
  files.workbench,
  /createWorkbenchCardSection\(\{[\s\S]*rendererId: "active-work-timers"/,
  "workbench timer card should be built by the guided browser host with its registered renderer",
);
assert.match(
  files.workbench,
  /createWorkbenchCardSection\(\{[\s\S]*rendererId: "task-workbench-items"/,
  "workbench task card should be built by the guided browser host with its registered renderer",
);
assert.match(
  files.workbench,
  /moduleActions\.open\("tasks\.edit"/,
  "Workbench Open Task must dispatch the Tasks edit modal action",
);
assert.match(
  files.workbench,
  /function appendTaskTagChips/,
  "Workbench must render compact task tag chips from the task work item payload",
);
assert.match(
  files.workbench,
  /directTags[\s\S]*direct_tags/,
  "Workbench task tag chips must consume direct/manual tags rather than effective propagated tags",
);
assert.match(
  files.workbench,
  /directTags\.slice\(0, 2\)/,
  "Workbench task tag chips must show at most two direct tags inline",
);
assert.match(
  files.workbench,
  /overflow\.textContent = `\+\$\{hiddenCount\}`/,
  "Workbench task tag chips must collapse extra direct tags into a count",
);
assert.match(
  files.workbench,
  /titleBlock\.append\(title\)[\s\S]*appendTaskTagChips\(titleBlock, task\)[\s\S]*header\.append\(titleBlock, meta\)/,
  "Workbench task tag chips must sit between the title and metadata badges",
);
assert.match(
  files.tasksRoutes,
  /tasksService\.listWorkbenchItems/,
  "Tasks workbench item route must be owned by the Tasks module",
);
assert.match(
  files.tasksService,
  /direct_tags: safeTaskTags\(task\.directTags\)/,
  "Tasks work item summaries must expose direct/manual task tags for Workbench",
);
assert.match(
  files.tasksService,
  /propagated_tag_count:/,
  "Tasks work item summaries may expose propagated tag counts without inline propagated tag labels",
);
assert.doesNotMatch(
  files.workbench,
  /tasks\.html\?task=/,
  "Workbench Open Task must not redirect to the Tasks page edit URL",
);
assert.match(
  files.workbench,
  /workbench-task-tag-list/,
  "Workbench task chip markup must have compact styling hooks",
);
assert.match(
  files.reporting,
  /function sortProjectTree\(projects\)[\s\S]*appendBranch\(""\)[\s\S]*return sortedProjects;/,
  "reporting project filter must render projects with parent-before-child tree traversal",
);
assert.doesNotMatch(
  files.reporting,
  /getProjectTreeSortKey/,
  "reporting project filter must not use path-string sorting that can separate children from parents",
);
assert.match(
  files.reporting,
  /expandedProjectRows[\s\S]*appendReportRow[\s\S]*childRows/,
  "reporting table must render expandable nested project child rows",
);

assert.match(
  files.manifestContract,
  /requireString\(item, "renderer", errors, \{ prefix: `dashboard/,
  "manifest contract must require dashboard renderers",
);

console.log("Dashboard and Workbench regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
