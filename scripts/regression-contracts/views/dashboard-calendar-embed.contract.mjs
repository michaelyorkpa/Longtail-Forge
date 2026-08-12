// Consolidated under views.current-static-contracts by 0.33.33.9.
export const regressionMeta = Object.freeze({
  id: "views.dashboard-calendar-embed",
  area: "views",
  tier: "focused",
  tags: ["anatomy", "calendar", "dashboard", "guardrail", "views"],
  description: "Pins the Dashboard calendar embed: hidden-by-default status anatomy, calendar region ordered below Workspace Pulse and Needs Attention, a gated Tasks module contribution, and rendering through the shared task-calendar path instead of duplicated grid logic.",
  runMode: "static",
});

import assert from "node:assert/strict";

import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("dashboard-calendar-embed-regression");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");

const dashboardHtml = await readText("views/protected/dashboard.html");
const dashboardEntry = await readText("public/js/dashboard.entry.js");
const dashboardJs = await readText("public/js/dashboard.js");
const tasksDashboardJs = await readText("public/js/tasks-dashboard.js");
const dashboardService = await readText("src/services/dashboard.service.js");
const manifestContract = await readText("src/core/modules/manifest-contract.js");
const frameworkCss = await readText("public/css/longtail-forge.css");

let checks = 0;

// The dashboard status box must be genuinely hidden when it carries no
// message: the shared status primitive stamps surface-main-panel (display:
// grid), so the framework CSS must restore the hidden attribute for every
// status message instead of page-specific one-off rules.
assert.match(
  frameworkCss,
  /\.view-status-message\[hidden\]\s*\{\s*display:\s*none;\s*\}/,
  "framework CSS must hide [hidden] view status messages despite the surface display rule",
);
assert.doesNotMatch(
  frameworkCss,
  /\.calendar-status\[hidden\]|\.dashboard-status\[hidden\]/,
  "page-specific [hidden] status fixes must not reappear now that the shared rule exists",
);
assert.match(
  dashboardJs,
  /createStatusMessage\(\{[\s\S]*?dashboardStatus[\s\S]*?hidden: true/,
  "dashboard must build its status box hidden by default",
);
assert.match(
  dashboardJs,
  /dashboardStatus\.hidden = !message/,
  "dashboard must keep the status box hidden whenever there is no message",
);
checks += 4;

// The calendar region renders below Workspace Pulse and Needs Attention and
// above the remaining regions.
assert.match(
  dashboardService,
  /\{ id: "pulse", label: "Workspace Pulse" \},\s*\{ id: "attention", label: "Needs Attention" \},\s*\{ id: "calendar", label: "Calendar" \},\s*\{ id: "today", label: "Today \/ Upcoming" \},/,
  "the framework dashboard layout must order the calendar region below Workspace Pulse and Needs Attention",
);
assert.match(
  dashboardJs,
  /"attention",\s*"calendar",\s*"today",/,
  "the browser placement allowlist must include the calendar region in layout order",
);
assert.match(
  manifestContract,
  /DASHBOARD_PLACEMENTS = new Set\(\["pulse", "attention", "calendar", "today", "main", "activity", "secondary"\]\)/,
  "the manifest contract must accept the calendar dashboard placement (and must not resurrect the retired reporting placement)",
);
checks += 3;

// The retired Dashboard reporting region stays retired.
for (const [label, source] of [["dashboard.service.js", dashboardService], ["dashboard.js", dashboardJs]]) {
  assert.ok(!source.includes('"reporting"'), `${label} must not resurrect the retired Dashboard reporting region`);
}
assert.doesNotMatch(
  dashboardJs,
  /project-summary|dashboard-report-client|data-open-client-report/,
  "the retired Dashboard reporting-shortcuts panel must not return to the dashboard host",
);
checks += 3;

// The embedded calendar offers the month/week/day switch through the shared
// segmented-control anatomy with an accessible pressed state.
assert.match(
  tasksDashboardJs,
  /segmented-control dashboard-calendar-view-switch/,
  "the dashboard calendar must render its view switch through the shared segmented-control anatomy",
);
assert.match(
  tasksDashboardJs,
  /\["month", "week", "day"\]\.map\(\(viewId\) => createViewButton\(viewId\)\)/,
  "the dashboard calendar must offer month, week, and day views",
);
assert.match(
  tasksDashboardJs,
  /aria-pressed/,
  "the dashboard calendar view switch must expose an accessible pressed state",
);
checks += 3;

// The embed is a gated Tasks module contribution, not a hard-coded framework
// panel: module-enabled and tasks.view filtering happen server-side through
// the normal contribution pipeline.
const tasksModule = modulesService.listModules().find((moduleDefinition) => moduleDefinition.id === "tasks");
const calendarPanel = (tasksModule?.dashboard || []).find((panel) => panel.id === "tasks-calendar");
assert.ok(calendarPanel, "the Tasks module must contribute the tasks-calendar dashboard panel");
assert.equal(calendarPanel.renderer, "tasks.calendar", "the calendar contribution must use the tasks.calendar renderer");
assert.equal(calendarPanel.placement, "calendar", "the calendar contribution must target the calendar region");
assert.deepEqual(calendarPanel.requiredPermissions, ["tasks.view"], "the calendar contribution must require tasks.view");
assert.deepEqual(calendarPanel.requiresEnabledModules, ["tasks"], "the calendar contribution must require the Tasks module to be enabled");
assert.equal(calendarPanel.dataRoute, "/api/tasks/calendar", "the calendar contribution must document the bounded calendar-window source");
checks += 6;

// The dashboard renders through the shared task-calendar path: no duplicated
// grid logic, no direct calendar-window fetch, and entries open through the
// canonical Task editor with a link out to the full Calendar page.
assert.match(
  tasksDashboardJs,
  /dashboard\.registerPanelRenderer\("tasks\.calendar", renderTasksCalendarContribution\)/,
  "the Tasks-owned Dashboard asset must register the tasks.calendar renderer",
);
for (const requiredSharedCall of [
  "taskCalendar.calendarRange(",
  "taskCalendar.fetchCalendarWindow(",
  "taskCalendar.renderCalendarBody(",
]) {
  assert.ok(tasksDashboardJs.includes(requiredSharedCall), `Tasks Dashboard must delegate calendar rendering to ${requiredSharedCall}`);
}
assert.match(
  tasksDashboardJs,
  /statuses: \["open", "in_progress", "blocked"\]/,
  "Dashboard calendar requests must remain explicitly active-only",
);
assert.doesNotMatch(
  tasksDashboardJs,
  /fetch\([^)]*\/api\/tasks\/calendar/,
  "dashboard must reach the calendar window only through the shared task-calendar helpers",
);
assert.doesNotMatch(
  tasksDashboardJs,
  /calendar-grid|calendar-weekday|calendar-day-header/,
  "dashboard must not rebuild calendar grid anatomy",
);
assert.match(
  tasksDashboardJs,
  /tasksDialog\?\.openTaskEditor/,
  "dashboard calendar entries must open through the canonical Task editor opener",
);
assert.match(
  tasksDashboardJs,
  /label: "Open full calendar", href: "calendar\.html"/,
  "the dashboard calendar panel must link out to the full Calendar page",
);
checks += 9;

// The protected host has one ES-module entry. The entry owns framework
// compatibility imports, and the Tasks-owned asset imports its calendar and
// dialog dependencies through the versioned bridge.
assert.match(dashboardHtml, /<script type="module" src="js\/dashboard\.entry\.js"><\/script>/);
assert.doesNotMatch(dashboardHtml, /js\/shared\/task-calendar\.js|js\/task-dialog\.js|js\/dashboard\.js/);
assert.match(dashboardEntry, /"\/js\/shared\/view-builder\.js"[\s\S]*"\/js\/dashboard\.js"/);
assert.match(tasksDashboardJs, /await bridge\.importScripts\(\[[\s\S]*"\/js\/shared\/task-calendar\.js"[\s\S]*"\/js\/task-dialog\.js"/);
assert.match(dashboardService, /listActiveModuleBrowserAssets\(session\.workspace_id, session, "dashboard"\)/);
checks += 5;

console.log(`Dashboard calendar embed guardrail passed ${checks} checks.`);
const { closeDatabase } = await import("../../../src/db/provider.js");
await closeDatabase();
await fixture.cleanup();
