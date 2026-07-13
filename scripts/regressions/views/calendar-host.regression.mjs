export const regressionMeta = Object.freeze({
  id: "views.calendar-host",
  area: "views",
  tier: "focused",
  tags: ["anatomy", "calendar", "guardrail", "views"],
  description: "Pins the framework-owned Calendar host boundary: minimal protected shell, framework view primitives for page/header/filter/status anatomy, canonical Task editor opener, read-only bounded data path, no calendar event/iCal/external-sync behavior, and the Workbench link staying a link.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const calendarHtml = await readText("views/protected/calendar.html");
const calendarJs = await readText("public/js/calendar.js");
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
for (const requiredScript of ["js/navigation.js", "js/footer.js", "js/shared/view-builder.js", "js/shared/client-project-options.js", "js/task-dialog.js", "js/calendar.js"]) {
  assert.ok(calendarHtml.includes(requiredScript), `calendar.html must load ${requiredScript}`);
}
assert.ok(
  calendarHtml.indexOf("js/shared/view-builder.js") < calendarHtml.indexOf("js/calendar.js"),
  "calendar.html must load the view builder before the calendar adapter",
);
checks += 10;

// The adapter renders framework-owned anatomy through view primitives only.
for (const requiredPrimitive of [
  "calendarView.createPageHeader(",
  "calendarView.createStatusMessage(",
  "calendarView.createEmptyState(",
  "calendarView.createFilterPanel(",
  "calendarView.createActionButton(",
  "segmented-control",
]) {
  assert.ok(calendarJs.includes(requiredPrimitive), `calendar.js must build framework-owned anatomy through ${requiredPrimitive}`);
}
for (const forbidden of [
  /document\.createElement\(/,
  /innerHTML/,
  /createElement\("dialog"/,
  /createElement\("table"/,
  /createElement\("details"/,
  /showModal/,
]) {
  assert.doesNotMatch(calendarJs, forbidden, `calendar.js must not hand-build framework-owned anatomy (${forbidden})`);
}
checks += 12;

// Entries open through the canonical Task editor, never an inline editor.
assert.match(calendarJs, /tasksDialog\?\.openTaskEditor/, "calendar entries must open through the canonical Task editor opener");
checks += 1;

// The surface stays read-only against the bounded calendar-window path: the
// only data fetches are the calendar window and filter options, with no
// mutating methods.
const fetchCalls = calendarJs.match(/fetch\(/g) || [];
const allowedFetches = calendarJs.match(/fetch\(`\/api\/tasks\/calendar\?|fetch\("\/api\/client-projects"/g) || [];
assert.equal(fetchCalls.length, allowedFetches.length, "calendar.js may only fetch the bounded calendar window and client/project filter options");
assert.doesNotMatch(calendarJs, /method:\s*"(POST|PUT|PATCH|DELETE)"/i, "calendar.js must stay read-only");
checks += 2;

// No calendar event records, iCal, or external calendar sync anywhere in the
// Calendar surface or schema: 0.36.0 owns events/iCal and 0.70.x owns
// Google/Outlook sync.
for (const [label, source] of [["calendar.html", calendarHtml], ["calendar.js", calendarJs], ["schema", schema]]) {
  assert.doesNotMatch(source, /\bical\b/i, `${label} must not reference iCal (0.36.0 owns events/iCal)`);
  assert.doesNotMatch(source, /calendar[-_]?event/i, `${label} must not introduce calendar event records (0.36.0 owns them)`);
}
assert.doesNotMatch(calendarJs, /google|outlook/i, "calendar.js must not reference external calendar providers (0.70.x owns sync)");
checks += 7;

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

// Workbench keeps its lightweight link and never duplicates calendar logic.
assert.ok(workbenchJs.includes("workbench-calendar-link"), "Workbench must keep the lightweight calendar link");
assert.ok(workbenchJs.includes("calendar.html?view=week"), "the Workbench link must target the calendar week view");
assert.ok(!workbenchJs.includes("/api/tasks/calendar"), "Workbench must not consume the calendar-window read directly");
assert.ok(!workbenchJs.includes("calendar-grid"), "Workbench must not rebuild calendar grid anatomy");
checks += 4;

console.log(`Calendar host guardrail passed ${checks} checks.`);

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
