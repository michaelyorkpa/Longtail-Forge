import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.12.4";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const tasksDocs = readText("docs/tasks-module.md");
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const detailBadgeHelper = functionBlock(viewBuilder, "createDetailBadgeRow");
const detailHeaderHelper = functionBlock(viewBuilder, "createDetailHeader");
const normalizeDetailBadges = functionBlock(viewBuilder, "normalizeDetailBadges");
const metadataWriter = functionBlock(taskDialogScript, "writeTaskMetadataRibbon");
const metadataBadge = functionBlock(taskDialogScript, "createMetadataBadge");
const requireView = functionBlock(taskDialogScript, "requireTaskDialogView");
const metadataRibbonField = functionBlock(taskDialogScript, "taskEditorMetadataRibbon");
const taskRow = functionBlock(tasksScript, "createTaskRow");
const fallbackSurface = functionBlock(tasksScript, "fallbackTasksViewSurfaceDescriptor");

assert.match(detailBadgeHelper, /className:\s*\["view-detail-badges",\s*"surface-chip-row",\s*options\.className\]/, "Framework should own reusable detail badge row anatomy");
assert.match(normalizeDetailBadges, /className:\s*"surface-chip"|createDetailBadge\(badge\)/, "Detail badge rows should normalize badges into shared surface chips");
assert.match(detailHeaderHelper, /createDetailBadgeRow\(\{ badges:\s*options\.badges \}\)/, "Detail headers should reuse the shared detail badge row helper");
assert.match(viewBuilder, /createDetailBadgeRow,/, "LongtailForge.view should expose createDetailBadgeRow");

assert.match(requireView, /createDetailBadgeRow/, "Task dialog should require the framework detail badge helper");
assert.match(metadataRibbonField, /className: \["task-metadata-ribbon", "view-detail-badges", "surface-chip-row"\][\s\S]*"data-task-metadata-ribbon": ""[\s\S]*"aria-label": "Task summary"/, "Task modal metadata placeholder should use shared detail badge classes");
assert.match(metadataWriter, /requireTaskDialogView\(\)\.createDetailBadgeRow\(\{[\s\S]*ariaLabel:\s*"Task summary"[\s\S]*className:\s*"task-metadata-ribbon"[\s\S]*badges:\s*badges\.map\(createMetadataBadge\)/, "Task detail metadata should render through the shared detail badge row primitive");
assert.doesNotMatch(metadataWriter, /document\.createElement\("span"\)/, "Task detail metadata should not rebuild badge DOM by hand");
assert.match(metadataBadge, /className:\s*\["task-metadata-chip",\s*badge\.className\][\s\S]*focusable:\s*true/, "Task metadata badges should preserve compact styling and keyboard focus");

for (const label of ["Status", "Priority", "Client", "Project", "Due Date", "Due Time", "TTC"]) {
  assert.match(metadataWriter, new RegExp(`label:\\s*"${label}"`), `Task metadata should still include ${label}`);
}

assert.match(metadataWriter, /selectedText\(fields\.client\) \|\| "No client"/, "Task metadata should use readable Client labels or a safe fallback");
assert.match(metadataWriter, /selectedText\(fields\.project\) \|\| "No project"/, "Task metadata should use readable Project labels or a safe fallback");
assert.doesNotMatch(`${metadataWriter}\n${metadataBadge}`, /\b(?:task|client|project|workspace|assignee)_id\b|assignee_ids/, "Task metadata badges should not surface raw ids in normal UI");

assert.match(fallbackSurface, /layout:\s*"slide-out-sidebar"[\s\S]*id:\s*"tasks-main-list"[\s\S]*ariaLabel:\s*"Task list"/, "Tasks fallback surface should keep the task list as the main detail region");
assert.match(tasksModule, /id:\s*"tasks\.workspace"[\s\S]*layout:\s*"slide-out-sidebar"[\s\S]*id:\s*"tasks-main-list"[\s\S]*ariaLabel:\s*"Task list"/, "Tasks manifest surface should keep the task list as the primary view");
assert.match(taskRow, /titleButton\.addEventListener\("click", \(\) => openTaskDialog\(task\)\)/, "Task row titles should still open the canonical modal detail/editor");
assert.doesNotMatch(tasksView, /data-task-detail-column|data-task-read-panel|task-detail-column/, "Tasks host should not add a persistent task detail column");

assert.match(tasksView, /js\/shared\/view-builder\.js\?v=16[\s\S]*js\/task-dialog\.js\?v=21[\s\S]*js\/tasks\.js\?v=20/, "Tasks host should advance cache keys for the touched view helper and task dialog assets");
assert.match(workbenchView, /js\/shared\/view-builder\.js\?v=16[\s\S]*js\/task-dialog\.js\?v=21/, "Workbench host should load the updated shared view helper before the Task dialog");
assert.match(tasksDocs, /0\.33\.5\.18\.10\.3[\s\S]*detail badge row/, "Tasks docs should document the task detail/read metadata cleanup");
assert.match(viewContract, /createDetailBadgeRow/, "View-building contract should document the detail badge row primitive");
assert.match(regressionSuite, /scripts\/tasks-detail-read-panel-regression\.mjs/, "Regression suite should include the task detail/read panel regression");

console.log("Tasks detail/read panel regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
