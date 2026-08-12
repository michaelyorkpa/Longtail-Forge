import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("dashboard-workbench-regression");
const { validateModuleManifest } = await import("../src/core/modules/manifest-contract.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

const files = {
  app: readText("src/core/app.js"),
  css: readText("public/css/longtail-forge.css"),
  dashboard: readText("public/js/dashboard.js"),
  dashboardCss: readText("public/css/dashboard.css"),
  dashboardEntry: readText("public/js/dashboard.entry.js"),
  dashboardRoutes: readText("src/routes/dashboard.routes.js"),
  dashboardService: readText("src/services/dashboard.service.js"),
  timeTrackingDashboard: readText("public/js/time-tracking-dashboard.js"),
  timeTrackingReporting: readText("public/js/time-tracking-reporting.js"),
  dashboardView: readText("views/protected/dashboard.html"),
  declarativeViewSurfaces: readText("docs/declarative-view-surfaces.md"),
  moduleContract: readText("docs/module-contract.md"),
  notesModuleDoc: readText("docs/notes-module.md"),
  manifestContract: readText("src/core/modules/manifest-contract.js"),
  reporting: readText("public/js/reporting.js"),
  reportingRoutes: readText("src/routes/reporting.routes.js"),
  reportingService: readText("src/services/reporting.service.js"),
  tasksModuleDoc: readText("docs/tasks-module.md"),
  tasksDashboard: readText("public/js/tasks-dashboard.js"),
  timeTrackingModuleDoc: readText("docs/time-tracking-module.md"),
  uiSurfaceContract: readText("docs/ui-surface-contract.md"),
  viewBuildingContract: readText("docs/view-building-contract.md"),
  clientsRoutes: readText("src/modules/client-projects/clients.routes.js"),
  clientsService: readText("src/modules/client-projects/clients.service.js"),
  timeTrackingBillingService: readText("src/modules/time-tracking/time-tracking-billing.service.js"),
  timeTrackingDashboardService: readText("src/modules/time-tracking/time-tracking-dashboard.service.js"),
  timeTrackingDashboardRoutes: readText("src/modules/time-tracking/time-tracking-dashboard.routes.js"),
  timeTrackingReportingRoutes: readText("src/modules/time-tracking/reporting.routes.js"),
  tasksService: readText("src/modules/tasks/tasks.service.js"),
  tasksRoutes: readText("src/modules/tasks/tasks.routes.js"),
  workbench: readText("public/js/workbench.js"),
  workbenchView: readText("views/protected/workbench.html"),
  modulesService: readText("src/core/modules/modules.service.js"),
  workbenchService: readText("src/services/workbench.service.js"),
};

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const modules = modulesService.listModules();
const tasksModule = modules.find((moduleDefinition) => moduleDefinition.id === "tasks");
const timeTrackingModule = modules.find((moduleDefinition) => moduleDefinition.id === "time-tracking");
const clientProjectsModule = modules.find((moduleDefinition) => moduleDefinition.id === "client-projects");
const allModuleIds = new Set(modules.map((moduleDefinition) => moduleDefinition.id));

assert.ok(tasksModule, "Tasks module must be registered");
assert.ok(timeTrackingModule, "Time Tracking module must be registered");
assert.ok(clientProjectsModule, "Client Projects module must be registered");

for (const moduleDefinition of modules) {
  for (const panel of moduleDefinition.dashboard || []) {
    assert.ok(panel.id, `${moduleDefinition.id} dashboard contribution id is required`);
    assert.ok(panel.label, `${moduleDefinition.id}:${panel.id} dashboard label is required`);
    assert.ok(panel.renderer, `${moduleDefinition.id}:${panel.id} dashboard renderer is required`);
    assert.equal(panel.moduleId, moduleDefinition.id, `${moduleDefinition.id}:${panel.id} dashboard moduleId must match owner`);
    if (panel.placement) {
      assert.match(
        panel.placement,
        /^(pulse|attention|calendar|today|main|activity|secondary)$/,
        `${moduleDefinition.id}:${panel.id} dashboard placement must be known`,
      );
    }
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
    panel.id === "tasks-needs-attention" &&
    panel.renderer === "tasks.needs-attention" &&
    panel.dataRoute === "/api/tasks/dashboard-summary" &&
    panel.placement === "attention" &&
    panel.requiresEnabledModules?.includes("tasks")),
  "Tasks Needs Attention dashboard panel must be a module data route contribution placed in attention",
);
assert.ok(
  tasksModule.dashboard.some((panel) =>
    panel.id === "tasks-today-upcoming" &&
    panel.renderer === "tasks.today-upcoming" &&
    panel.dataRoute === "/api/tasks/dashboard-summary" &&
    panel.placement === "today" &&
    panel.requiresEnabledModules?.includes("tasks")),
  "Tasks Today / Upcoming dashboard panel must be a module data route contribution placed in today",
);
assert.ok(
  tasksModule.dashboard.some((panel) =>
    panel.id === "task-summary" &&
    panel.renderer === "tasks.pressure" &&
    panel.dataRoute === "/api/tasks/dashboard-summary" &&
    panel.placement === "main" &&
    panel.requiresEnabledModules?.includes("tasks")),
  "Tasks compact dashboard card must be a module data route contribution placed in main",
);
assert.equal(
  clientProjectsModule.dashboard.length,
  0,
  "Client/Project must not contribute dashboard panels: the reporting-shortcuts relic panel was removed with the Dashboard reporting region",
);
assert.ok(
  timeTrackingModule.dashboard.some((panel) =>
    panel.id === "active-timers" &&
    panel.renderer === "time-tracking.active-timers" &&
    panel.dataRoute === "/api/time-tracking/dashboard/effort-summary" &&
    panel.placement === "main" &&
    panel.requiredPermissions?.includes("time_entries.create") &&
    panel.requiredWorkspaceCapabilities?.includes("time_tracking") &&
    panel.requiresEnabledModules?.includes("time-tracking")),
  "Time Tracking active timers dashboard panel must be a gated compact effort contribution",
);
assert.ok(
  timeTrackingModule.dashboard.some((panel) =>
    panel.id === "recent-time" &&
    panel.renderer === "time-tracking.recent-time" &&
    panel.dataRoute === "/api/time-tracking/dashboard/effort-summary" &&
    panel.placement === "main" &&
    panel.requiredPermissions?.includes("reporting.view") &&
    panel.requiredWorkspaceCapabilities?.includes("time_tracking") &&
    panel.requiresEnabledModules?.includes("time-tracking")),
  "Time Tracking recent time dashboard panel must be a gated compact effort contribution",
);
assert.ok(
  timeTrackingModule.browserAssets.some((asset) =>
    asset.id === "time-tracking-dashboard-script" &&
    asset.path === "/js/time-tracking-dashboard.js" &&
    asset.views?.includes("dashboard")),
  "Time Tracking dashboard renderer script must be declared as a module-owned browser asset",
);
assert.ok(
  !timeTrackingModule.dashboard.some((panel) =>
    panel.id === "billing-summary" ||
    panel.id === "current-month-billables" ||
    panel.id === "hours-billables-chart" ||
    panel.renderer === "billing-summary" ||
    panel.renderer === "time-tracking.current-month-billables" ||
    panel.renderer === "time-tracking.hours-billables-chart"),
  "Time Tracking default Dashboard contributions must not render billing tables or billables charts",
);
assert.ok(
  tasksModule.workbench.some((card) =>
    card.id === "task-workbench-items" &&
    card.renderer === "task-workbench-items" &&
    card.listRoute === "/api/tasks/options"),
  "Tasks workbench card must declare its renderer and the cacheable options route",
);
assert.ok(
  timeTrackingModule.workbench.some((card) =>
    card.id === "active-work-timers" &&
    card.renderer === "active-work-timers" &&
    card.listRoute === "/api/active-timers/all"),
  "Time Tracking workbench card must declare its renderer and source route",
);

assert.match(
  files.dashboardRoutes,
  /dashboardRoutes\.get\("\/dashboard"[\s\S]*dashboardService\.readDashboard/,
  "dashboard API route must be owned by the framework Dashboard route module",
);
assert.match(
  files.app,
  /app\.use\("\/api", dashboardRoutes\)/,
  "app must mount framework Dashboard routes under the stable /api path",
);
assert.doesNotMatch(
  files.reportingRoutes,
  /\/dashboard|readDashboard/,
  "reporting routes must not own the stable dashboard bootstrap route",
);
assert.match(
  files.dashboardService,
  /modulesService\.listDashboardPanels/,
  "dashboard service must read permission-filtered dashboard panel contributions",
);
assert.match(
  files.dashboardService,
  /settingsRepository\.readWorkspaceSettings/,
  "dashboard service must read framework workspace summary settings",
);
assert.doesNotMatch(
  files.dashboardService,
  /\.\.\/modules\/|tasksService|clientsService|timeEntriesService|activeTimersService|reportingService|TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID/,
  "dashboard service must not import or name first-party module services/repos for generic dashboard decisions",
);
assert.doesNotMatch(
  files.reportingService,
  /async function readDashboard|readDashboard,|tasksService|modulesService\.listDashboardPanels/,
  "reporting service must not own dashboard read-model assembly",
);
assert.doesNotMatch(
  files.reportingService,
  /\.\.\/modules\/|clientsService|timeEntriesService|tasksService|WORKSPACE_SCOPE_ID|project-time-billing|time-tracking/,
  "framework Reporting must not import, name, or calculate a first-party module report",
);
assert.match(
  files.dashboardService,
  /setupWarnings: warnings/,
  "dashboard service must expose safe setup warnings on the Dashboard read model",
);
assert.match(
  files.dashboardService,
  /moduleOverview:[\s\S]*emptyState:[\s\S]*Module overview will appear here/,
  "dashboard service must expose a framework-owned sparse Module Overview empty state",
);
assert.match(
  files.dashboardService,
  /recentActivity:[\s\S]*status: "deferred"[\s\S]*Recent Activity is intentionally quiet/,
  "dashboard service must expose a quiet deferred Recent Activity state instead of fake activity rows",
);
assert.match(
  files.dashboardService,
  /config\.runtimeWarnings/,
  "dashboard service must expose only safe framework-owned setup warning summaries",
);
assert.doesNotMatch(
  files.dashboardService,
  /process\.env|storageKey|storage_path|scanner_|payload_json|audit_logs|record_events|jobs|secret|password/i,
  "dashboard service warning payloads must not expose secrets, raw runtime values, job payloads, storage internals, or scanner internals",
);
assert.doesNotMatch(
  files.clientsRoutes,
  /dashboard\/project-summary/,
  "the retired Client/Project dashboard summary route must not return",
);
assert.doesNotMatch(
  files.clientsService,
  /readDashboardProjectSummary/,
  "the retired Client/Project dashboard summary read must not return",
);
assert.match(
  files.tasksRoutes,
  /\/tasks\/dashboard-summary[\s\S]*tasksService\.summary/,
  "Tasks dashboard data must hydrate through a module-owned route",
);
assert.match(
  files.tasksService,
  /attentionRows[\s\S]*upcomingRows[\s\S]*pressureRows/,
  "Tasks dashboard summary must expose attention, upcoming, and compact pressure rows",
);
assert.match(
  files.tasksService,
  /function dashboardAttentionRank[\s\S]*isTaskOverdue[\s\S]*task\.status === "blocked"[\s\S]*timerStatus === "running"[\s\S]*isTaskDueSoon/,
  "Tasks dashboard summary must own the overdue, blocked, timer, and due-soon attention ordering",
);
assert.match(
  files.tasksService,
  /function hasDashboardTaskTimer\(timer\)[\s\S]*"running", "paused"/,
  "Tasks dashboard summary must include active and paused task-linked timer signals safely",
);
assert.match(
  files.timeTrackingDashboardRoutes,
  /\/time-tracking\/dashboard\/billing-summary[\s\S]*timeTrackingBillingService\.readDashboardBillingSummary/,
  "Time Tracking dashboard billing route must be owned by the Time Tracking module",
);
assert.match(
  files.timeTrackingDashboardRoutes,
  /\/time-tracking\/dashboard\/effort-summary[\s\S]*timeTrackingDashboardService\.readDashboardEffortSummary/,
  "Time Tracking dashboard effort route must be owned by the Time Tracking module",
);
assert.match(
  files.timeTrackingBillingService,
  /permissionsService\.assertCanInAnyScope[\s\S]*"reporting\.view"[\s\S]*timeEntriesService\.list[\s\S]*summarizeBillingScopesForRange/,
  "Time Tracking billing service must own permission-checked dashboard billing aggregation",
);
assert.match(
  files.timeTrackingBillingService,
  /parentScopeId:\s*String\(client\.parent_client_id/,
  "reporting scopes must preserve parent client IDs for nested reporting scope display",
);
assert.match(
  files.timeTrackingBillingService,
  /sortScopeTree\(attachDescendantClientProjects\(decorateScopeDepths\(clientScopes\)\)\)/,
  "business reporting scopes must be sorted by client tree instead of flat name order",
);
assert.match(
  files.timeTrackingBillingService,
  /filterRollupProjects\(selectedProjects,\s*\{\s*includeDescendants\s*\}\)/,
  "project summaries must collapse selected child project rows when parent rollups are selected",
);
assert.match(
  files.timeTrackingBillingService,
  /function summarizeBillingProjectTree[\s\S]*summarizeDirectBillingProject[\s\S]*childRows[\s\S]*summary\.amount \+ row\.amount/,
  "project summary branches must price direct time before recursively adding display-only child rows once",
);
assert.match(
  files.timeTrackingBillingService,
  /filterRollupProjects\(scope\.projects,\s*\{\s*includeDescendants:\s*true\s*\}\)/,
  "Time Tracking dashboard billing totals must avoid double counting project parent and child rollups",
);
assert.match(
  files.timeTrackingBillingService,
  /function sortProjectTree\(projects\)[\s\S]*appendBranch\(""\)[\s\S]*return sortedProjects;/,
  "Time Tracking report project ordering must use parent-before-child tree traversal",
);
assert.doesNotMatch(
  files.timeTrackingBillingService,
  /getProjectTreeSortKey/,
  "Time Tracking report project ordering must not use path-string sorting that can separate children from parents",
);
assert.match(
  files.timeTrackingReportingRoutes,
  /\/reporting\/bootstrap[\s\S]*readReportingBootstrap[\s\S]*\/reporting\/project-summary[\s\S]*readProjectSummary/,
  "retained Reporting compatibility reads must be routed through Time Tracking ownership",
);
assert.doesNotMatch(
  files.reportingRoutes,
  /\/reporting\/bootstrap|\/reporting\/project-summary/,
  "framework Reporting routes must keep only catalog and generic execution dispatch",
);
assert.match(
  files.workbenchService,
  /modulesService\.listWorkbenchCards/,
  "workbench API must read permission-filtered workbench card contributions",
);
assert.doesNotMatch(
  files.workbenchService,
  /workCandidateService/,
  "workbench bootstrap must not compute focus candidates; they load through /api/workbench/focus-candidates",
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
  files.modulesService,
  /function normalizeDashboardPanel\(panel\)[\s\S]*placement:\s*String\(panel\.placement \|\| ""\)\.trim\(\) \|\| "main"/,
  "dashboard contributions without placement must default to main",
);

assert.match(
  files.dashboard,
  /dashboardPanelRenderers[\s\S]*registerPanelRenderer: registerDashboardPanelRenderer/,
  "dashboard browser script must dispatch through renderer registry",
);
assert.match(
  files.dashboard,
  /document\.querySelector\("\[data-dashboard-host\]"\)/,
  "dashboard browser script must mount into the minimal dashboard host",
);
assert.match(
  files.dashboard,
  /createPageHeader\(\{[\s\S]*title: "Dashboard"/,
  "dashboard browser script must build the page header through LongtailForge.view",
);
assert.match(
  files.dashboard,
  /createStatusMessage\(\{[\s\S]*dashboardStatus/,
  "dashboard browser script must build dashboard status through LongtailForge.view",
);
assert.match(
  files.dashboard,
  /renderRegisteredDashboardPanels[\s\S]*dashboardPanels[\s\S]*dashboardPanelRenderers\[contribution\.renderer\]/,
  "dashboard browser script must render panels from contribution metadata",
);
assert.match(
  files.tasksDashboard,
  /dashboard\.registerPanelRenderer\("tasks\.needs-attention"[\s\S]*dashboard\.registerPanelRenderer\("tasks\.today-upcoming"[\s\S]*dashboard\.registerPanelRenderer\("tasks\.pressure"/,
  "Tasks-owned Dashboard asset must register the attention, upcoming, and compact pressure renderers",
);
assert.match(
  files.tasksDashboard,
  /createTasksNeedsAttentionContent[\s\S]*summary\.attentionRows[\s\S]*createTasksTodayUpcomingContent[\s\S]*summary\.upcomingRows[\s\S]*createTasksPressureContent[\s\S]*summary\.pressureRows/,
  "Tasks-owned Dashboard asset must render server-shaped attention, upcoming, and pressure rows",
);
assert.match(
  files.tasksDashboard,
  /createDashboardTaskActions\(context, \[summary\.actions\?\.workbench,\s*summary\.actions\?\.tasks\]\)/,
  "dashboard Tasks pressure card must drill out through Workbench and Tasks actions supplied by the module route",
);
assert.doesNotMatch(
  files.tasksDashboard,
  /createTaskSummarySection|summary\.overdue|summary\.dueSoon|tasks\.html\?task=/,
  "Tasks-owned Dashboard asset must not render the old three-list task summary or link rows into the Task edit modal",
);
assert.match(
  files.dashboard,
  /KNOWN_DASHBOARD_PLACEMENTS[\s\S]*"pulse"[\s\S]*"secondary"[\s\S]*function normalizeDashboardPlacement/,
  "dashboard browser script must know the framework-owned placement allowlist",
);
assert.match(
  files.dashboard,
  /dashboardRegionBodies\.get\(normalizeDashboardPlacement\(contribution\.placement\)\)/,
  "dashboard browser script must place panels from contribution placement metadata",
);
assert.match(
  files.dashboard,
  /dashboard-region-body--\$\{regionId\}/,
  "dashboard browser script must mark region bodies for module overview grid styling",
);
assert.match(
  files.dashboard,
  /renderModuleOverviewEmptyState[\s\S]*dashboardData\?\.moduleOverview\?\.emptyState/,
  "dashboard browser script must render a quiet Module Overview empty state for sparse workspaces",
);
assert.match(
  files.dashboard,
  /renderRecentActivityState[\s\S]*dashboardData\?\.recentActivity[\s\S]*dashboard-recent-activity-empty/,
  "dashboard browser script must render the Recent Activity region as a quiet deferred state when no safe rows exist",
);
assert.match(
  files.tasksDashboard,
  /createTasksPressureContent[\s\S]*summary\.pressureRows \|\| \[\]\)\.slice\(0, 1\)/,
  "dashboard module overview cards should show at most one suggested row",
);
assert.match(
  files.dashboard,
  /data-dashboard-placement/,
  "dashboard browser script must mark generated panels with their resolved placement",
);
assert.match(
  files.dashboard,
  /dashboardPulseRegion[\s\S]*data-dashboard-pulse-primary[\s\S]*Open Workbench/,
  "dashboard browser script must render a Workspace Pulse with a primary Workbench action",
);
assert.equal(
  [...files.dashboard.matchAll(/data-dashboard-pulse-primary/g)].length,
  1,
  "Workspace Pulse should expose exactly one primary Workbench action marker",
);
assert.match(
  files.dashboard,
  /dashboardWarningsRegion[\s\S]*dashboardWarningsRegion\.hidden = warnings\.length === 0/,
  "dashboard browser script must hide setup warnings when there are no safe warnings",
);
assert.doesNotMatch(
  files.dashboard,
  /tasks\.needs-attention|tasks\.calendar|tasks\.today-upcoming|tasks\.pressure|timeTracking|currentMonthBillables|currentMonthTotals|chartPoints|billing-summary|createBillables|formatCurrency|formatMonthLabel|formatHours|audit_logs|payload_json|storageKey|scanner_/,
  "dashboard browser host must not hard-code Time Tracking billing data, unsafe activity internals, or module renderers",
);
assert.doesNotMatch(
  files.dashboard,
  /contribution\.id\s*===\s*["']project-summary["']|panel\.id\s*===\s*["']project-summary["']|dashboardData\.(hub|tasks)|knowledge-base|creator-studio|tickets\.overview/,
  "dashboard browser placement and data loading must not special-case Project Summary or host-owned module payloads",
);
assert.match(
  files.timeTrackingDashboard,
  /registerPanelRenderer\("time-tracking\.active-timers"[\s\S]*registerPanelRenderer\("time-tracking\.recent-time"/,
  "Time Tracking dashboard asset must register the compact active timers and recent time renderers",
);
assert.match(
  files.timeTrackingDashboard,
  /dashboardBootstrap\?\.dataPromises[\s\S]*\/api\/time-tracking\/dashboard\/effort-summary[\s\S]*loadRoute\(route\)[\s\S]*createActiveTimersContent[\s\S]*createRecentTimeContent/,
  "Time Tracking dashboard asset must reuse the warm compact-effort promise from its module route and render both panels",
);
assert.doesNotMatch(
  files.timeTrackingDashboard,
  /current-month-billables|hours-billables-chart|Current Month Billables|Hours & Billables|Billable Amount|createBillablesChart|formatCurrency|billing-summary/,
  "Time Tracking dashboard asset must not render default billing tables or billables charts",
);
assert.match(
  files.timeTrackingDashboardService,
  /activeTimersService\.listAll[\s\S]*timeEntriesRepository\.readDashboardEffortSummary[\s\S]*filterReadableTimeEntries[\s\S]*activeTimers:[\s\S]*recentTime:/,
  "Time Tracking dashboard service must shape active timers and bounded recent saved time from owning module reads",
);
assert.doesNotMatch(
  files.timeTrackingDashboardService,
  /timeEntriesService\.list|tagsService/,
  "Time Tracking effort summary must not restore the full time-entry list or tag-decoration pipeline",
);
assert.doesNotMatch(
  files.timeTrackingDashboardService,
  /currentMonthBillables|chartPoints|billableSeconds|invoice|storageKey|scanner_|payload_json/i,
  "Time Tracking effort summary must not expose billing table/chart data or unsafe internals",
);
assert.match(
  files.dashboardView,
  /<main class="dashboard-page" data-dashboard-host><\/main>/,
  "dashboard protected HTML must be a minimal framework host",
);
assert.match(
  files.dashboardView,
  /css\/longtail-forge\.css[\s\S]*css\/dashboard\.css/,
  "dashboard protected HTML must load framework base and Dashboard anatomy styles",
);
assert.match(
  files.dashboardView,
  /<script type="module" src="js\/dashboard\.entry\.js"><\/script>/,
  "dashboard protected HTML must load one explicit native ES-module entry",
);
assert.doesNotMatch(
  files.dashboardView,
  /js\/shared\/view-builder\.js|js\/dashboard\.js|js\/tasks-dashboard\.js|js\/time-tracking-dashboard\.js/,
  "dashboard protected HTML must not retain ordered body-level implementation scripts",
);
assert.match(
  files.dashboardEntry,
  /await importScripts\(\[[\s\S]*"\/js\/shared\/view-builder\.js"[\s\S]*"\/js\/dashboard\.js"[\s\S]*"\/js\/footer\.js"/,
  "Dashboard ES-module entry must explicitly import framework compatibility dependencies in one place",
);
assert.doesNotMatch(
  files.dashboardView,
  /data-dashboard-renderer|data-dashboard-panel-id|data-dashboard-extension-panels|data-current-month-billables|data-billables-chart/,
  "dashboard protected HTML must not carry static dashboard panel anatomy or the old extension stub",
);
assert.match(
  files.dashboardCss,
  /\.dashboard-pulse[\s\S]*border-left:\s*5px solid var\(--color-accent\)[\s\S]*linear-gradient/,
  "Dashboard Pulse should be visually distinct without becoming a hero billboard",
);
assert.match(
  files.dashboardCss,
  /\.dashboard-region-body--main[\s\S]*repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/,
  "Dashboard Module Overview grid should wrap compact cards without desktop horizontal overflow",
);
assert.match(
  files.dashboardCss,
  /\.dashboard-region--activity[\s\S]*\.dashboard-region-body--activity \.view-empty-state/,
  "Dashboard Recent Activity should be visually secondary and support quiet empty states",
);
assert.match(
  files.dashboardCss,
  /@media \(max-width: 720px\)[\s\S]*\.dashboard-pulse[\s\S]*grid-template-columns: minmax\(0, 1fr\)[\s\S]*\.dashboard-region/,
  "Dashboard narrow layout should stack Pulse and following regions cleanly",
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
assert.doesNotMatch(
  files.workbench,
  /createWorkbenchCardSection\(\{[\s\S]*rendererId: "task-workbench-items"/,
  "workbench browser host must not render a full Tasks index card",
);
assert.match(
  files.workbench,
  /"task-workbench-items": loadTaskOptionsData[\s\S]*async function loadTaskOptionsData\(card\)/,
  "workbench browser script should retain the Tasks contribution loader only for task options",
);
assert.match(
  files.workbench,
  /enterTaskFocus\(candidate, taskId\)/,
  "Workbench recommended Task candidates must enter Task Focus instead of opening the Task edit modal",
);
assert.match(
  files.workbench,
  /function openTaskCandidate\(candidate, taskId, trigger = null, editorOptions = \{\}\)[\s\S]*moduleActions\.open\("tasks\.edit"/,
  "Workbench should retain the explicit context-open path to the canonical Task edit action",
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
assert.doesNotMatch(
  files.workbench,
  /workbench-task-list|workbench-task-toolbar|function renderTasks|taskItems/,
  "Workbench browser script must not keep all-tasks list markup, rendering, or state",
);
assert.match(
  files.timeTrackingReporting,
  /function sortProjectTree\(projects\)[\s\S]*appendBranch\(""\)[\s\S]*return sortedProjects;/,
  "Time Tracking report filter adapter must render projects with parent-before-child tree traversal",
);
assert.doesNotMatch(
  files.timeTrackingReporting,
  /getProjectTreeSortKey/,
  "Time Tracking report filter adapter must not use path-string sorting that can separate children from parents",
);
assert.match(
  files.timeTrackingReporting,
  /expandedProjectRows[\s\S]*flattenVisibleRows[\s\S]*childRows/,
  "Time Tracking report renderer must preserve expandable nested project child rows",
);

assert.match(
  files.manifestContract,
  /requireString\(item, "renderer", errors, \{ prefix: `dashboard/,
  "manifest contract must require dashboard renderers",
);
assert.match(
  files.manifestContract,
  /optionalString\(item, "dataRoute", errors, \{ prefix: `dashboard/,
  "manifest contract must validate dashboard data routes when declared",
);
assert.match(
  files.manifestContract,
  /DASHBOARD_PLACEMENTS[\s\S]*optionalString\(item, "placement"[\s\S]*placement must be one of/,
  "manifest contract must validate dashboard placements against the allowlist",
);
assert.deepEqual(
  validateModuleManifest({
    ...tasksModule,
    dashboard: [{ ...tasksModule.dashboard[0], placement: "mystery-region" }],
  }, allModuleIds).some((error) => error.includes("placement must be one of pulse, attention, calendar, today, main, activity, secondary")),
  true,
  "manifest validation must reject unknown dashboard placements",
);

assert.deepEqual(
  scanUnexpectedFrameworkCoupling(),
  [],
  "generic framework/core Dashboard and Workbench aggregation paths must not add undocumented first-party module coupling",
);
assert.match(
  files.declarativeViewSurfaces,
  /\| Dashboard \| dashboard \| dashboard\.html \| framework-built contribution host \| strict \|[\s\S]*\| Workbench \| workbench \| workbench\.html \| framework-built guided host \| strict \|/,
  "Declarative surface inventory must promote Dashboard and Workbench closeout guardrails to strict",
);
assert.match(
  files.declarativeViewSurfaces,
  /As of 0\.33\.6\.14\.1, Dashboard host guardrails are strict[\s\S]*shared descendant-aware hierarchy resolver[\s\S]*As of 0\.33\.6\.14\.1, Workbench host guardrails are strict/,
  "Declarative surface docs must record the current closeout guardrails and descendant-aware Workbench scope",
);
assert.match(
  files.moduleContract,
  /As of 0\.33\.6\.14\.1, Dashboard\/Workbench closeout locks the host boundary[\s\S]*Reporting remains assigned to `0\.33\.12`[\s\S]*Public API plus tag propagation remain assigned to `0\.39\.15`/,
  "Module contract must record the host boundary and deferred framework-coupling follow-ups",
);
assert.match(
  files.moduleContract,
  /documented closeout allowlist[\s\S]*src\/core\/modules\/registry\.js[\s\S]*src\/core\/client-project-filter-scope\.js[\s\S]*src\/services\/work-candidate\.service\.js[\s\S]*src\/services\/workbench-task-focus-related-context\.service\.js[\s\S]*New generic Dashboard\/Workbench host decisions should not add first-party module imports/,
  "Module contract must document the framework-coupling allowlist used by the closeout guardrail",
);
assert.match(
  files.uiSurfaceContract,
  /As of 0\.33\.6\.14\.1, Dashboard's visual and interaction rule is summary, pressure, direction[\s\S]*Dashboard must not add capture forms, inline editors, full report tables\/charts, full task indexes/,
  "UI surface contract must record Dashboard closeout surface rules",
);
assert.match(
  files.viewBuildingContract,
  /As of 0\.33\.6\.14\.1, the Workbench host guardrail is strict[\s\S]*As of 0\.33\.6\.14\.1, the host guardrail is strict/,
  "View-building contract must record strict Dashboard and Workbench host guardrails",
);
assert.match(
  files.tasksModuleDoc,
  /^# Tasks Module$/m,
  "Tasks docs must retain the owning module heading",
);
assert.match(
  files.tasksModuleDoc,
  /Dashboard can show capped Tasks pressure[\s\S]*Dashboard must not open task rows directly into the edit modal/,
  "Tasks docs must record the Dashboard card and Workbench execution boundary",
);
assert.match(
  files.timeTrackingModuleDoc,
  /As of 0\.33\.6\.14\.1, the closeout guardrail keeps Time Tracking Dashboard cards compact and active\/recent only[\s\S]*detailed billables[\s\S]*belong in Reporting/,
  "Time Tracking docs must record Dashboard and Reporting closeout boundaries",
);
assert.match(
  files.notesModuleDoc,
  /^# Notes Module Developer Guide$/m,
  "Notes docs must retain the owning developer-guide heading",
);
assert.match(
  files.notesModuleDoc,
  /Task Focus linked notes open the Notes-owned read modal before editing[\s\S]*Dashboard does not add a Notes overview card until Notes exposes a safe body-free summary route/,
  "Notes docs must record the Task Focus read-first and Dashboard-deferred boundaries",
);

console.log("Dashboard and Workbench regression passed.");
const { closeDatabase } = await import("../src/db/provider.js");
await closeDatabase();
await fixture.cleanup();

function scanUnexpectedFrameworkCoupling() {
  const allowedFiles = new Set([
    "src/core/app.js",
    "src/core/client-project-filter-scope.js",
    "src/core/jobs/worker-cli.js",
    "src/core/modules/bundled-module-catalog.generated.js",
    "src/core/modules/modules.service.js",
    "src/core/modules/registry.js",
    "src/core/public-demo-budget-catalog.js",
    "src/core/record-scope.js",
    "src/services/work-candidate.service.js",
    "src/services/workbench-task-focus-related-context.service.js",
  ]);
  const scannedFiles = [
    ...listProjectFiles("src/core"),
    "src/services/dashboard.service.js",
    "src/services/workbench.service.js",
    "src/services/work-candidate.service.js",
    "src/services/work-focus-modes.service.js",
    "src/services/workbench-task-focus-related-context.service.js",
  ];
  const forbiddenPattern = /(?:from\s+["'](?:\.\.\/)+modules\/(?:client-projects|files|lists|notes|tasks|time-tracking)\/)|\b(?:CLIENT_PROJECTS_MODULE_ID|TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID)\b|["'](?:client-projects|tasks|time-tracking)["']/;

  return [...new Set(scannedFiles)]
    .map((filePath) => {
      const matches = [...readText(filePath).matchAll(new RegExp(forbiddenPattern, "g"))].length;
      return matches > 0 && !allowedFiles.has(filePath) ? `${filePath} (${matches})` : "";
    })
    .filter(Boolean)
    .sort();
}

function listProjectFiles(relativeDirectory) {
  const absoluteDirectory = join(projectRoot, relativeDirectory);
  const entries = [];

  for (const entry of readdirSync(absoluteDirectory)) {
    const absolutePath = join(absoluteDirectory, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      entries.push(...listProjectFiles(relative(projectRoot, absolutePath).split(sep).join("/")));
    } else if (entry.endsWith(".js")) {
      entries.push(relative(projectRoot, absolutePath).split(sep).join("/"));
    }
  }

  return entries;
}
