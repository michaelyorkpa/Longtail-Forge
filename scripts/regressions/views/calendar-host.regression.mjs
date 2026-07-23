export const regressionMeta = Object.freeze({
  id: "views.calendar-host",
  area: "views",
  tier: "focused",
  tags: ["anatomy", "calendar", "guardrail", "views"],
  description: "Pins the framework-owned Calendar host boundary: minimal protected shell, framework view primitives for page/header/filter/status anatomy, one shared task-calendar render path, canonical Task editor opener, read-only bounded data path, no calendar event/iCal/external-sync behavior, and the Workbench link staying a link.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const calendarHtml = await readText("views/protected/calendar.html");
const calendarJs = await readText("public/js/calendar.js");
const iconsJs = await readText("public/js/shared/icons.js");
const taskCalendarJs = await readText("public/js/shared/task-calendar.js");
const staticService = await readText("src/services/static.service.js");
const tasksModule = await readText("src/modules/tasks/module.js");
const tasksService = await readText("src/modules/tasks/tasks.service.js");
const frameworkCss = await readText("public/css/longtail-forge.css");
const workbenchJs = await readText("public/js/workbench.js");
const schema = await readText("src/db/schema/current.sql");

let checks = 0;

// The protected page stays a minimal host: one host element, no hand-built
// page anatomy, and the shared framework scripts in dependency order.
assert.match(calendarHtml, /<main class="calendar-page" data-calendar-host><\/main>/, "calendar.html must stay a minimal data-calendar-host shell");
for (const forbidden of ["<header", "<table", "<dialog", "<select", "<button", "<form", "<section"]) {
  assert.ok(!calendarHtml.includes(forbidden), `calendar.html must not hand-build page anatomy (${forbidden})`);
}
for (const requiredScript of ["js/navigation.js", "js/footer.js", "js/shared/view-builder.js", "js/shared/client-project-options.js", "js/shared/notification-subscriptions.js", "js/shared/capture-prompt.js", "js/shared/task-calendar.js", "js/task-dialog.js", "js/calendar.js"]) {
  assert.ok(calendarHtml.includes(requiredScript), `calendar.html must load ${requiredScript}`);
}
assert.ok(
  calendarHtml.indexOf("js/shared/view-builder.js") < calendarHtml.indexOf("js/shared/task-calendar.js")
    && calendarHtml.indexOf("js/shared/task-calendar.js") < calendarHtml.indexOf("js/calendar.js"),
  "calendar.html must load the view builder, then the shared task-calendar helpers, then the calendar adapter",
);
checks += 11;

// The adapter renders framework-owned chrome through view primitives only and
// delegates the calendar body to the shared task-calendar render path.
for (const requiredPrimitive of [
  "calendarView.createPageHeader(",
  "calendarView.createStatusMessage(",
  "calendarView.createFilterPanel(",
  "calendarView.createActionButton(",
  "segmented-control",
]) {
  assert.ok(calendarJs.includes(requiredPrimitive), `calendar.js must build framework-owned anatomy through ${requiredPrimitive}`);
}
for (const requiredSharedCall of [
  "taskCalendar.calendarRange(",
  "taskCalendar.fetchCalendarWindow(",
  "taskCalendar.renderCalendarBody(",
  "taskCalendar.resolveDefaultView(",
]) {
  assert.ok(calendarJs.includes(requiredSharedCall), `calendar.js must delegate the calendar body to ${requiredSharedCall}`);
}
assert.ok(taskCalendarJs.includes("view.createEmptyState("), "the shared task-calendar helpers must render the empty state through the view primitive");
assert.match(taskCalendarJs, /root\.taskCalendar = Object\.freeze\(/, "the shared task-calendar helpers must publish a frozen LongtailForge.taskCalendar namespace");
assert.match(taskCalendarJs, /const MONTH_TASK_LIMIT = 3/, "month rendering must pin the visible task limit at three");
assert.match(taskCalendarJs, /dayTasks\.slice\(0, MONTH_TASK_LIMIT\)/, "month rendering must preserve ordering while truncating visible tasks");
assert.match(taskCalendarJs, /dayTasks\.length > MONTH_TASK_LIMIT/, "dense month days must detect entries beyond the visible task limit");
assert.match(taskCalendarJs, /text: "View all tasks"/, "dense month days must label the full-list handoff");
assert.match(taskCalendarJs, /calendar\.html\?view=day&date=\$\{dayKey\}/, "dense month days must target the canonical Day/date handoff");
assert.match(taskCalendarJs, /const visibleTasks = isMonthGrid \? dayTasks\.slice\(0, MONTH_TASK_LIMIT\) : dayTasks/, "Week and Day grid rendering must remain untruncated");
assert.match(taskCalendarJs, /matchMedia\("\(max-width: 700px\)"\)/, "automatic calendar view selection must use the canonical mobile breakpoint");
assert.match(taskCalendarJs, /return isMobile \? "day" : "month"/, "automatic calendar view selection must use Day on mobile and Month on desktop");
assert.match(calendarJs, /await Promise\.resolve\(window\.LongtailForge\?\.workspaceContextReady\)/, "Calendar must wait for the app-shell preference bootstrap");
assert.match(calendarJs, /if \(!calendarViewFromQuery\)[\s\S]*readPreferredCalendarView/, "Calendar must apply the saved preference unless the URL supplied a view");
assert.match(calendarJs, /calendarViewFromQuery = true/, "Calendar query view must keep explicit navigation precedence");
assert.match(taskCalendarJs, /className: "calendar-day-view"[\s\S]*calendarDay: dayKey/, "the shared renderer must retain its read-only Day layout");
assert.match(taskCalendarJs, /className: "calendar-day-reminders"[\s\S]*\.\.\.dayReminders\.map/, "mobile Day view must render reminder rows");
assert.match(calendarJs, /multiple: true[\s\S]*calendarStatusFilter/, "Calendar must expose a task-status multi-select");
assert.match(calendarJs, /DEFAULT_CALENDAR_STATUSES = \["open", "in_progress", "blocked"\]/, "Calendar must default to active task statuses");
assert.match(calendarJs, /statuses: calendarState\.statuses/, "Calendar must send its selected statuses through the shared read helper");
assert.match(taskCalendarJs, /params\.set\("statuses",/, "shared calendar reads must carry status scope to the server");
for (const [label, source] of [["calendar.js", calendarJs], ["shared/task-calendar.js", taskCalendarJs]]) {
  for (const forbidden of [
    /document\.createElement\(/,
    /innerHTML/,
    /createElement\("dialog"/,
    /createElement\("table"/,
    /createElement\("details"/,
    /showModal/,
  ]) {
    assert.doesNotMatch(source, forbidden, `${label} must not hand-build framework-owned anatomy (${forbidden})`);
  }
}
checks += 30;

// Entries open through the canonical Task editor, never an inline editor.
assert.match(calendarJs, /tasksDialog\?\.openTaskEditor/, "calendar entries must open through the canonical Task editor opener");
checks += 1;

// The surface stays read-only against the bounded calendar-window path: the
// shared helpers own the calendar-window fetch, the adapter fetches only the
// filter options, and neither uses a mutating method.
const adapterFetchCalls = calendarJs.match(/fetch\(/g) || [];
const adapterAllowedFetches = calendarJs.match(/fetch\("\/api\/client-projects\?view=options"/g) || [];
assert.equal(adapterFetchCalls.length, adapterAllowedFetches.length, "calendar.js may only fetch the client/project filter options; the shared helpers own the calendar window fetch");
const sharedFetchCalls = taskCalendarJs.match(/fetch\(/g) || [];
const sharedAllowedFetches = taskCalendarJs.match(/fetch\(route,/g) || [];
assert.equal(sharedFetchCalls.length, sharedAllowedFetches.length, "shared/task-calendar.js may only fetch the bounded calendar window");
assert.ok(sharedAllowedFetches.length > 0, "shared/task-calendar.js must own the bounded calendar window fetch");
assert.match(taskCalendarJs, /const route = `\/api\/tasks\/calendar\?\$\{params\.toString\(\)\}`/, "the shared calendar fetch route must remain bounded by its canonical query params");
assert.doesNotMatch(calendarJs, /method:\s*"(POST|PUT|PATCH|DELETE)"/i, "calendar.js must stay read-only");
assert.doesNotMatch(taskCalendarJs, /method:\s*"(POST|PUT|PATCH|DELETE)"/i, "shared/task-calendar.js must stay read-only");
checks += 6;

// No calendar event records, iCal, or external calendar sync anywhere in the
// Calendar surface or schema: 0.36.0 owns events/iCal and 0.70.x owns
// Google/Outlook sync.
for (const [label, source] of [["calendar.html", calendarHtml], ["calendar.js", calendarJs], ["shared/task-calendar.js", taskCalendarJs], ["schema", schema]]) {
  assert.doesNotMatch(source, /\bical\b/i, `${label} must not reference iCal (0.36.0 owns events/iCal)`);
  assert.doesNotMatch(source, /calendar[-_]?event/i, `${label} must not introduce calendar event records (0.36.0 owns them)`);
}
assert.doesNotMatch(calendarJs, /google|outlook/i, "calendar.js must not reference external calendar providers (0.70.x owns sync)");
assert.doesNotMatch(taskCalendarJs, /google|outlook/i, "shared/task-calendar.js must not reference external calendar providers (0.70.x owns sync)");
checks += 10;

// Framework registration and the Tasks-contributed navigation entry stay
// permission- and module-aware.
assert.ok(staticService.includes(`["calendar.html", { id: "calendar", file: "calendar.html" }]`), "static service must register the protected Calendar view");
assert.match(tasksModule, /\{ label: "Calendar", href: "calendar\.html", parent: "tasks\.html", requiredPermissions: \["tasks\.view"\] \}/, "Tasks must contribute the permission-aware Calendar navigation entry");
checks += 2;

// The service keeps the bounded window contract.
assert.ok(tasksService.includes("TASK_CALENDAR_WINDOW_MAX_DAYS = 93"), "the calendar window bound must stay pinned at 93 days");
assert.ok(tasksService.includes("Calendar range cannot exceed"), "over-wide calendar ranges must stay rejected");
checks += 2;

// The calendar grid CSS is framework-owned.
for (const selector of [".calendar-page", ".calendar-grid", ".calendar-day", ".calendar-entry"]) {
  assert.ok(frameworkCss.includes(selector), `framework CSS must own the ${selector} calendar anatomy`);
}
checks += 4;

// Workbench keeps its lightweight entry point and never duplicates calendar
// logic. The entry point is an icon-only calendar button in the top-right of
// the focus panel heading with the accessible week-view name, gated on the
// Calendar navigation entry.
assert.ok(workbenchJs.includes("workbench-calendar-link"), "Workbench must keep the lightweight calendar link");
assert.ok(workbenchJs.includes("calendar.html?view=week"), "the Workbench link must target the calendar week view");
assert.match(
  workbenchJs,
  /className: \["button-link", "icon-button", "workbench-calendar-link"\][\s\S]*?"aria-label": "See this week on the calendar"/,
  "the Workbench calendar entry must be an icon-only button with the accessible week-view name",
);
assert.match(
  workbenchJs,
  /createIcon\("calendar"/,
  "the Workbench calendar button must use the shared calendar icon",
);
assert.match(
  workbenchJs,
  /className: \["workbench-panel-heading", "workbench-focus-heading-row"\][\s\S]*?createCalendarWeekLink\(\)/,
  "the Workbench calendar button must sit in the focus panel heading row (top-right)",
);
assert.match(
  workbenchJs,
  /calendarWeekLinkElement\.hidden = !navigationContainsHref\(navigation, "calendar\.html"\)/,
  "the Workbench calendar button must stay gated on the Calendar navigation entry",
);
assert.match(frameworkCss, /\.button-link\[hidden\]\s*\{\s*display:\s*none;\s*\}/, "hidden button-styled links must actually hide despite the inline-flex display rule");
assert.ok(iconsJs.includes("calendar: Object.freeze(["), "the shared icon set must own the calendar icon");
assert.ok(!workbenchJs.includes("/api/tasks/calendar"), "Workbench must not consume the calendar-window read directly");
assert.ok(!workbenchJs.includes("calendar-grid"), "Workbench must not rebuild calendar grid anatomy");
checks += 10;

console.log(`Calendar host guardrail passed ${checks} checks.`);

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
