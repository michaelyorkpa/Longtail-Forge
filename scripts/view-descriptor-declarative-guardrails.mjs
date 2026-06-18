import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { listModules } from "../src/core/modules/registry.js";

const appVersion = "0.33.5.18.6.4.3";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const listsHtml = readText("views/protected/lists.html");
const notesJs = readText("public/js/notes.js");
const notesHtml = readText("views/protected/notes.html");

const modules = listModules();
const protectedViews = modules.flatMap((moduleDefinition) => (
  moduleDefinition.protectedViews || []
).map((view) => ({
  ...view,
  moduleId: view.moduleId || moduleDefinition.id,
  moduleEnabledByDefault: moduleDefinition.enabledByDefault,
})));
const protectedViewsByFile = new Map(protectedViews.map((view) => [view.file, view]));
const protectedHtmlFiles = readdirSync(new URL("../views/protected/", import.meta.url))
  .filter((fileName) => fileName.endsWith(".html"))
  .sort();
const surfaces = modules.flatMap((moduleDefinition) => (
  moduleDefinition.viewSurfaces || []
).map((surface) => ({
  ...surface,
  moduleId: surface.moduleId || moduleDefinition.id,
})));
const surfacesByView = new Map();
for (const surface of surfaces) {
  const key = `${surface.moduleId}:${surface.viewId}`;
  surfacesByView.set(key, [...(surfacesByView.get(key) || []), surface]);
}
const strictDeclarativeSurfaceIds = new Set(["lists.workspace", "notes.workspace"]);
const inventory = protectedHtmlFiles.map((fileName) => {
  const view = protectedViewsByFile.get(fileName) || {
    id: fileName.replace(/\.html$/, ""),
    file: fileName,
    moduleId: inferModuleId(fileName),
  };
  const viewSurfaces = surfacesByView.get(`${view.moduleId}:${view.id}`) || [];
  return {
    moduleId: view.moduleId,
    viewId: view.id,
    file: view.file,
    surfaceIds: viewSurfaces.map((surface) => surface.id),
    strict: viewSurfaces.some((surface) => strictDeclarativeSurfaceIds.has(surface.id)),
  };
});

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(listsModule, /version:\s*"0\.33\.5\.16\.12"/, "Lists module should report the current declarative closeout version");

assert.ok(inventory.length >= 20, "Protected view inventory should cover all protected HTML views");
assert.deepEqual(
  inventory.filter((entry) => entry.strict).map((entry) => entry.surfaceIds[0]),
  ["lists.workspace", "notes.workspace"],
  "The converted Lists and Notes descriptors should be under strict declarative enforcement",
);
assert.ok(inventory.some((entry) => entry.moduleId === "tags" && entry.surfaceIds.includes("tags.management") && !entry.strict), "Tags descriptor should be inventoried but not strict yet");
assert.ok(inventory.some((entry) => entry.moduleId === "developer-example" && entry.surfaceIds.includes("developer-example.surface") && !entry.strict), "Disabled example descriptor should be inventoried but not strict");
assert.ok(inventory.some((entry) => entry.moduleId === "tasks" && entry.surfaceIds.length === 0 && !entry.strict), "Non-declarative protected views should remain reported-only");

assert.match(listsHtml, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Strict declarative Lists HTML should stay a minimal host");
assert.match(listsHtml, /js\/shared\/view-builder\.js\?v=3[\s\S]*js\/shared\/view-renderer\.js\?v=3[\s\S]*js\/lists\.js\?v=13/, "Strict declarative Lists HTML should load the renderer before the module adapter");
assertNoProtectedAnatomy(listsHtml, "views/protected/lists.html");

for (const forbidden of [
  "view.createPageHeader",
  "view.createFilterPanel",
  "view.createCollapsibleIndexPanel",
  "view.createSplitListDetail",
  "view.createDataTable",
  "view.createModalForm",
  "view.createDetailActionStrip",
  "view.createFieldGrid",
  "view.createInlineActionRow",
  "document.createElement(\"dialog\")",
  "document.createElement(\"table\")",
  "document.createElement(\"details\")",
]) {
  assert.doesNotMatch(listsJs, new RegExp(escapeRegExp(forbidden)), `Strict declarative Lists source should not use ${forbidden}`);
}
for (const helper of [
  "renderDescriptorActionMenu",
  "renderDescriptorDataTable",
  "renderDescriptorFieldGrid",
  "renderDescriptorInlineActions",
  "renderDescriptorLinkedRecordsPanel",
  "renderDescriptorModalForm",
]) {
  assert.match(listsJs, new RegExp(`view\\.${helper}`), `Strict declarative Lists source should consume ${helper}`);
}
assert.doesNotMatch(listsJs, /className:\s*["'`][^"'`]*(modal-actions|form-actions|list-table-wrap|lists-workspace)[^"'`]*/, "Strict declarative Lists source should not create one-off layout/footer class shells");
assert.doesNotMatch(listsJs, /classList\.add\([^)]*(modal-actions|form-actions|list-table-wrap)[^)]*\)/, "Strict declarative Lists source should not add one-off layout/footer classes");

// Notes strict declarative enforcement. Notes mounts a secondary Library navigation panel through the
// framework `createCollapsibleIndexPanel` primitive, which is an allowed exception (the descriptor's
// single indexPanel cannot yet express a second nav panel); everything else must match Lists' bar.
assert.match(notesHtml, /<main class="wide-page notes-page" data-notes-host><\/main>/, "Strict declarative Notes HTML should stay a minimal host");
assertNoProtectedAnatomy(notesHtml, "views/protected/notes.html", /\b(data-note-dialog|data-notes-list|data-note-detail|data-note-collection-dialog)\b/, "Notes");
for (const forbidden of [
  "view.createPageHeader",
  "view.createFilterPanel",
  "view.createDataTable",
  "view.createModalForm",
  "view.createDetailActionStrip",
  "view.createFieldGrid",
  "view.createInlineActionRow",
  "view.createSplitListDetail",
  "document.createElement(\"dialog\")",
  "document.createElement(\"table\")",
  "document.createElement(\"details\")",
]) {
  assert.doesNotMatch(notesJs, new RegExp(escapeRegExp(forbidden)), `Strict declarative Notes source should not use ${forbidden}`);
}
for (const helper of [
  "renderDescriptorActionMenu",
  "renderDescriptorLinkedRecordsPanel",
  "renderDescriptorModalForm",
]) {
  assert.match(notesJs, new RegExp(`view\\.${helper}`), `Strict declarative Notes source should consume ${helper}`);
}
assert.doesNotMatch(notesJs, /className:\s*["'`][^"'`]*(modal-actions|form-actions|list-table-wrap|notes-workspace)[^"'`]*/, "Strict declarative Notes source should not create one-off layout/footer class shells");

assert.match(declarativeGuide, /# Declarative View Surfaces/, "Developer guide should document declarative view surfaces");
assert.match(declarativeGuide, /Strict guardrails currently enforce `lists\.workspace` and `notes\.workspace`/, "Developer guide should identify current strict enforcement scope");
assert.match(declarativeGuide, /Protected View Inventory/, "Developer guide should include protected view inventory");
for (const expectedInventoryRow of [
  "| Lists | lists | lists.html | lists.workspace | strict |",
  "| Notes | notes | notes.html | notes.workspace | strict |",
  "| Tags | tags | tags.html | tags.management | reported |",
  "| Developer Example | developer-example | developer-example.html | developer-example.surface | reported |",
  "| Tasks | tasks | tasks.html | - | reported |",
]) {
  assert.match(declarativeGuide, new RegExp(escapeRegExp(expectedInventoryRow)), `Developer guide should include inventory row: ${expectedInventoryRow}`);
}
assert.match(moduleDevelopment, /docs\/declarative-view-surfaces\.md/, "Module development guide should point authors to the declarative guide");
assert.match(moduleContract, /As of 0\.33\.5\.16\.12/, "Module contract should document the closeout version");
assert.match(surfaceContract, /As of 0\.33\.5\.16\.12/, "Surface contract should document the closeout version");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.16\.12/, "View-building contract should document declarative guardrail closeout");

assert.match(changelog, /## Version 0\.33\.5\.16\.12 - /, "Changelog should include the declarative guardrail closeout version");
assert.match(regressionSuite, /scripts\/view-descriptor-declarative-guardrails\.mjs/, "Regression suite should include declarative guardrails");

nodeReport(inventory);
console.log("View descriptor declarative guardrails passed.");

function readText(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertNoProtectedAnatomy(html, label, hooksRegex = /\b(data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog)\b/, surfaceName = "Lists") {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} should not ship framework-owned protected view anatomy`);
  assert.doesNotMatch(body, hooksRegex, `${label} should not ship ${surfaceName} workspace hooks outside the descriptor host`);
}

function nodeReport(entries) {
  const lines = entries
    .map((entry) => `${entry.strict ? "strict" : "reported"} ${entry.moduleId}:${entry.viewId} ${entry.file} ${entry.surfaceIds.join(",") || "-"}`)
    .sort();
  console.log(`Protected view inventory (${entries.length} views):\n${lines.join("\n")}`);
}

function inferModuleId(fileName) {
  if (["clients.html", "projects.html"].includes(fileName)) {
    return "client-projects";
  }
  if (["time-tracker.html", "time-entries.html", "time-tracking-settings.html"].includes(fileName)) {
    return "time-tracking";
  }
  if (["user-admin.html", "user-settings.html", "api-keys.html", "audit-log.html", "notifications.html", "workspace-settings.html"].includes(fileName)) {
    return "users";
  }
  if (fileName === "files-settings.html") {
    return "files";
  }
  if (fileName === "tasks-settings.html") {
    return "tasks";
  }
  return fileName.replace(/\.html$/, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
