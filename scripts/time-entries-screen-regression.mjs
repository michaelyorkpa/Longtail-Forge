import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleSource = readText("src/modules/time-tracking/module.js");
const stylesheet = readText("public/css/longtail-forge.css");
const timeEntriesView = readText("views/protected/time-entries.html");
const timeEntriesScript = readText("public/js/time-entries.js");
const timeEntryDialogScript = readText("public/js/time-entry-dialog.js");
const timeEntriesService = readText("src/modules/time-tracking/time-entries.service.js");
const timeTrackerView = readText("views/protected/time-tracker.html");
const workbenchView = readText("views/protected/workbench.html");

let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("Time Tracking contributes one unified Time Entries navigation destination", () => {
  assert.match(moduleSource, /label: "Time Entries", href: "time-entries\.html"/);
  assert.doesNotMatch(readArrayLiteral(moduleSource, "navigation"), /manual-entry\.html/);
  assert.doesNotMatch(readArrayLiteral(moduleSource, "navigation"), /edit-entries\.html/);
});

check("Time Tracking registers the unified protected Time Entries view", () => {
  assert.match(moduleSource, /id: "time-entries"/);
  assert.match(moduleSource, /path: "\/time-entries\.html"/);
  assert.match(moduleSource, /file: "time-entries\.html"/);
  assert.doesNotMatch(readArrayLiteral(moduleSource, "protectedViews"), /id: "manual-entry"/);
  assert.doesNotMatch(readArrayLiteral(moduleSource, "protectedViews"), /id: "edit-entries"/);
});

check("unified page exposes toolbar, filters, sort, and list actions", () => {
  assert.match(timeEntriesView, /<title>Time Entries \| Longtail Forge<\/title>/);
  assert.match(timeEntriesView, /data-add-time-entry/);
  assert.match(timeEntriesView, /data-time-entry-filter-status/);
  assert.match(timeEntriesView, /data-time-entry-filter-period/);
  assert.match(timeEntriesView, /data-time-entry-filter-client/);
  assert.match(timeEntriesView, /data-time-entry-filter-project/);
  assert.match(timeEntriesView, /data-time-entry-filter-users/);
  assert.match(timeEntriesView, /data-time-entry-filter-tag/);
  assert.match(timeEntriesView, /data-time-entry-sort/);
  assert.match(timeEntriesView, /data-time-entry-table/);
});

check("add and edit workflows use the Time Tracking dialog helper", () => {
  assert.match(timeEntriesView, /js\/time-entry-dialog\.js/);
  assert.match(timeEntriesView, /js\/time-entries\.js/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openAdd/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openEdit/);
  assert.match(timeEntriesScript, /openAddFromUrl/);
  assert.match(timeEntriesScript, /openEntryFromUrl/);
});

check("filter and sort behavior stays client-side on the unified list", () => {
  assert.match(timeEntriesScript, /function getFilteredEntries/);
  assert.match(timeEntriesScript, /matchesStatusFilter/);
  assert.match(timeEntriesScript, /isEntryInRange/);
  assert.match(timeEntriesScript, /selectedUsers\.length === 0/);
  assert.match(timeEntriesScript, /selectedTagId/);
  assert.match(timeEntriesScript, /function compareEntries/);
  assert.match(timeEntriesScript, /duration_desc/);
  assert.match(timeEntriesScript, /project_asc/);
});

check("dialog helper preserves tag and billable payload ownership", () => {
  assert.match(timeEntryDialogScript, /billable: fields\.billable\.value/);
  assert.match(timeEntryDialogScript, /tagIds: tagPicker\?\.readTagIds\?\.\(\) \|\| \[\]/);
  assert.match(timeEntryDialogScript, /updateBillableDefault/);
  assert.match(timeEntryDialogScript, /api\.postJson\("\/api\/time-entries", payload\)/);
  assert.match(timeEntryDialogScript, /api\.putJson\(`\/api\/time-entries\/\$\{encodeURIComponent\(selectedEntry\.entryId\)\}`, payload\)/);
});

check("time-entry audit URLs target the unified Time Entries screen", () => {
  assert.match(timeEntriesService, /recordUrl: `time-entries\.html\?entry=\$\{encodeURIComponent\(entryId\)\}`/);
  assert.match(timeEntriesService, /recordUrl: `time-entries\.html\?entry=\$\{encodeURIComponent\(decodedEntryId\)\}`/);
  assert.doesNotMatch(timeEntriesService, /edit-entries\.html\?entry/);
});

check("unified page registers a Time Entries smoke controller", () => {
  assert.match(timeEntriesScript, /pageController\.register\("time-entries"/);
  assert.match(timeEntriesScript, /pageId: "time-entries"/);
  assert.match(timeEntriesScript, /toolbar controls exist/);
});

check("Time Tracker exposes a top heading shortcut to Time Entries", () => {
  assert.match(timeTrackerView, /class="timer-heading-actions"/);
  assert.match(timeTrackerView, /class="button-link" href="time-entries\.html">Time Entries<\/a>/);
  assert.match(timeTrackerView, /data-timer-count/);
});

check("time entry dialog sizing avoids horizontal modal overflow", () => {
  assert.match(stylesheet, /\.time-entry-dialog\s*\{[^}]*width: min\(94vw, 760px\)/s);
  assert.match(stylesheet, /\.time-entry-dialog\s*\{[^}]*overflow-x: hidden/s);
  assert.match(stylesheet, /\.time-entry-dialog \.entry-form\s*\{[^}]*padding: 24px/s);
  assert.match(stylesheet, /\.time-entry-dialog \.duration-editor\s*\{[^}]*minmax\(96px, 1fr\)/s);
  assert.match(stylesheet, /@media[\s\S]*\.time-entry-dialog \.duration-editor\s*\{[^}]*grid-template-columns: 1fr/s);
  assert.match(timeEntriesView, /css\/longtail-forge\.css\?v=11/);
  assert.match(timeTrackerView, /css\/longtail-forge\.css\?v=11/);
  assert.match(workbenchView, /css\/longtail-forge\.css\?v=11/);
});

console.log(`Time Entries screen regression passed ${checks} checks.`);

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readArrayLiteral(source, propertyName) {
  const marker = `${propertyName}: [`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${propertyName} array was not found`);

  let depth = 0;
  for (let index = start + marker.length - 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${propertyName} array did not close`);
}
