import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = readText("src/repositories/tags.repo.js");
const service = readText("src/services/tags.service.js");
const routes = readText("src/routes/tags.routes.js");
const sharedTags = readText("public/js/shared/tags.js");
const tagsPage = readText("public/js/tags.js");
const tasksPage = readText("public/js/tasks.js");
const reportingPage = readText("public/js/reporting.js");
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

assert.match(tasksPage, /__no_effective_tags__/, "Tasks filter should include No Tags support");
assert.match(reportingPage, /__no_effective_tags__/, "Reporting filter should include No Tags support");
assert.match(css, /\.tag-chip-inherited/, "Inherited tag chips should be styled");
assert.match(css, /\.tag-picker-suppress/, "Suppression control should be styled");

console.log("Tag usability UI regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
