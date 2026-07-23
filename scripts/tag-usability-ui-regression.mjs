import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = readText("src/repositories/tags.repo.js");
const service = readText("src/services/tags.service.js");
const routes = readText("src/routes/tags.routes.js");
const sharedTags = readText("public/js/shared/tags.js");
const tagsPage = readText("public/js/tags.js");
const tasksPage = readText("public/js/tasks.js");
const reportingPage = readText("public/js/reporting.js");
const timeTrackingReportingPage = readText("public/js/time-tracking-reporting.js");
const searchPage = readText("public/js/search.js");
const timeEntriesPage = readText("public/js/time-entries.js");
const notesPage = readText("public/js/notes.js");
const notesService = readText("src/modules/notes/notes.service.js");
const css = readText("public/css/longtail-forge.css");

assert.match(repo, /direct_usage_count/, "Tag list query should return direct usage counts");
assert.match(repo, /propagated_usage_count/, "Tag list query should return propagated usage counts");
assert.match(repo, /system_usage_count/, "Tag list query should return system usage counts");

assert.match(service, /function shapeAssignmentReadModel/, "Tag service should shape direct, propagated, and effective read models");
assert.match(service, /directAssignments/, "Assignment API should expose direct assignments separately");
assert.match(service, /propagatedAssignments/, "Assignment API should expose propagated assignments separately");
assert.match(service, /effectiveTags/, "Record decoration should expose effective tags");
assert.match(service, /__no_effective_tags__/, "Tag filters should support no effective tags");
assert.match(service, /__no_direct_tags__/, "Tag filters should reserve no direct tags");

assert.match(routes, /\/tags\/assignments\/:assignmentId\/suppress/, "Tags API should expose propagated assignment suppression");
assert.match(sharedTags, /suppressPropagatedTag/, "Shared tag helper should expose suppression");
assert.match(sharedTags, /data-tag-picker-suppress/, "Shared tag picker should render suppress controls for propagated tags");
assert.match(sharedTags, /filter\(isDirectTag\)/, "Shared tag picker should submit only direct tags");
assert.match(sharedTags, /tag-chip-inherited/, "Shared tag picker should distinguish inherited tags");

assert.match(tagsPage, /direct_usage_count/, "Tags management UI should display direct usage counts");
assert.match(tagsPage, /propagated_usage_count/, "Tags management UI should display propagated usage counts");
assert.doesNotMatch(tagsPage, /scope/i, "Tags management UI must not add tag scope controls");

assert.match(tasksPage, /tags\?\.mountFilterPicker\?\.\(tagFilter/, "Tasks filter should use the shared picker that includes No Tags support");
assert.match(sharedTags, /function mountFilterPicker\([\s\S]*NO_TAGS_FILTER_VALUE,[\s\S]*label: "No Tags"/, "Shared tag filter picker should include No Tags support");
assert.match(tasksPage, /normalizeTagFilterValue/, "Tasks filter should normalize legacy no-tags values");
assert.match(
  timeTrackingReportingPage,
  /noTagsFilterValue\(\)[\s\S]*label: "No Tags"/,
  "Time Tracking's Reporting filter adapter should include shared No Tags support",
);
assert.match(reportingPage, /filter\.type === "tag"[\s\S]*\? "text"/, "Reporting should render tag filters as typable controls");
assert.match(reportingPage, /tags\?\.mountFilterPicker\?\.\(control/, "Reporting should mount its tag filter through the shared searchable picker");
assert.match(searchPage, /tagFilterNoTagsOption/, "Search filter should include shared No Tags support");
assert.match(timeEntriesPage, /tagFilterNoTagsOption/, "Time Entries filter should include shared No Tags support");
assert.match(timeEntriesPage, /entry\.tags \|\| \[\]\)\.length === 0/, "Time Entries No Tags filter should match records without effective tags");
assert.match(notesPage, /appendNotesQueryParam\(params, "tags", normalizeText\(tagFilter\?\.value\)\)/, "Notes tag filter should send tag text to the server-shaped list query");
assert.match(notesPage, /function mountBulkTagPicker\([\s\S]*tags\.mountPicker\(bulkTagsEditor,[\s\S]*allowCreate: false/, "Notes bulk actions should use the shared typable tag picker");
assert.doesNotMatch(notesPage, /data-note-bulk-tags[\s\S]{0,250}multiple/, "Notes bulk tags should not return to a long multi-select scroll box");
assert.match(notesService, /function isNoTagsQuery\(value\)[\s\S]*__no_tags__[\s\S]*__no_effective_tags__[\s\S]*no_tags[\s\S]*none/, "Notes service should recognize no-tags intent for server-side list filtering");
assert.match(css, /\.tag-chip-inherited/, "Inherited tag chips should be styled");
assert.match(css, /\.tag-picker-suppress/, "Suppression control should be styled");

console.log("Tag usability UI regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
