import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.15";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialog = readText("public/js/task-dialog.js");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const tasksDocs = readText("docs/tasks-module.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Task child-dialog slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task child-dialog slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task child-dialog slice version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the Task child-dialog slice version");

const createElements = functionBlock(taskDialog, "createTaskDialogElements");
const tagsDialog = functionBlock(taskDialog, "createTaskTagsDialog");
const filesDialog = functionBlock(taskDialog, "createTaskFilesDialog");
const ensureDialog = functionBlock(taskDialog, "ensureDialog");
const utilityBindings = functionBlock(taskDialog, "bindTaskUtilityDialogEvents");
const openTags = functionBlock(taskDialog, "openTaskTagsDialog");
const openFiles = functionBlock(taskDialog, "openTaskFilesDialog");
const closeUtilities = functionBlock(taskDialog, "closeTaskUtilityDialogs");
const tagMount = functionBlock(taskDialog, "mountTaskTagPicker");
const fileMount = functionBlock(taskDialog, "mountTaskFileAttachments");
const fieldNodes = functionBlock(taskDialog, "taskEditorFieldNodes");

assert.match(createElements, /includeTags = options\.includeTags !== false[\s\S]*includeFiles = options\.includeFiles !== false[\s\S]*includeTags \? createTaskTagsDialog\(\)[\s\S]*includeFiles \? createTaskFilesDialog\(\)/, "Task dialog creation should include Tags and Files child dialog shells");
assert.match(ensureDialog, /tagsDialog = document\.querySelector\("\[data-task-tags-dialog\]"\)[\s\S]*filesDialog = document\.querySelector\("\[data-task-files-dialog\]"\)/, "Task dialog should query Tags and Files child dialogs");
assert.match(ensureDialog, /includeFiles: !filesDialog[\s\S]*includeTags: !tagsDialog/, "Task dialog should create missing Tags and Files child dialogs");
assert.match(ensureDialog, /fileContainer: filesDialog\?\.querySelector\("\[data-task-files\]"\)[\s\S]*tagContainer: tagsDialog\?\.querySelector\("\[data-task-tags\]"\)/, "Task helper content should mount inside child dialogs");
assert.match(ensureDialog, /fields\.tagToggle\?\.addEventListener\("click", openTaskTagsDialog\)[\s\S]*fields\.fileToggle\?\.addEventListener\("click", openTaskFilesDialog\)/, "Footer utility buttons should open child dialogs");

assert.match(tagsDialog, /view\.createModal\(\{[\s\S]*title: "Task Tags"[\s\S]*className: "task-tags-dialog"[\s\S]*body: \[tagsMount\][\s\S]*actions: \[close\]/, "Tags should use a framework child modal shell");
assert.match(tagsDialog, /tagsMount = view\.createElement\("div"[\s\S]*"data-task-tags": ""[\s\S]*close\.dataset\.taskTagsDialogClose = ""[\s\S]*dialog\.dataset\.taskTagsDialog = ""/, "Tags child dialog should expose stable hooks");
assert.match(filesDialog, /view\.createModal\(\{[\s\S]*title: "Task Files"[\s\S]*className: "task-files-dialog"[\s\S]*body: \[filesMount\][\s\S]*actions: \[close\]/, "Files should use a framework child modal shell");
assert.match(filesDialog, /filesMount = view\.createElement\("div"[\s\S]*"data-task-files": ""[\s\S]*close\.dataset\.taskFilesDialogClose = ""[\s\S]*dialog\.dataset\.taskFilesDialog = ""/, "Files child dialog should expose stable hooks");

assert.match(utilityBindings, /fields\.tagDialogClose\?\.addEventListener\("click", closeTaskTagsDialog\)[\s\S]*tagsDialog\.addEventListener\("close", handleTaskTagsDialogClose\)[\s\S]*fields\.fileDialogClose\?\.addEventListener\("click", closeTaskFilesDialog\)[\s\S]*filesDialog\.addEventListener\("close", handleTaskFilesDialogClose\)/, "Child dialog close controls should reset utility state");
assert.match(openTags, /closeTaskFilesDialog\(\)[\s\S]*fields\.tagToggle\?\.setAttribute\("aria-expanded", "true"\)[\s\S]*showTaskModal\(tagsDialog, \{ parent: dialog, trigger: fields\.tagToggle \}\)[\s\S]*\[data-tag-picker-input\]/, "Tags should open as a stacked child modal and focus the picker");
assert.match(openFiles, /closeTaskTagsDialog\(\)[\s\S]*fields\.fileToggle\?\.setAttribute\("aria-expanded", "true"\)[\s\S]*showTaskModal\(filesDialog, \{ parent: dialog, trigger: fields\.fileToggle \}\)[\s\S]*\[data-file-attachment-input\]/, "Files should open as a stacked child modal and focus upload when saved");
assert.match(openFiles, /currentTaskId[\s\S]*fields\.fileDialogClose/, "Files should focus a safe control for unsaved tasks");
assert.match(closeUtilities, /fields\.tagToggle\?\.setAttribute\("aria-expanded", "false"\)[\s\S]*fields\.fileToggle\?\.setAttribute\("aria-expanded", "false"\)[\s\S]*closeTaskTagsDialog\(\)[\s\S]*closeTaskFilesDialog\(\)/, "Parent close/reset should close child utility dialogs");
assert.match(taskDialog, /dialog\.addEventListener\("close", \(\) => \{[\s\S]*closeTaskUtilityDialogs\(\)/, "Closing the Task editor should close Tags and Files child dialogs");

assert.match(tagMount, /namespace\.tags\?\.mountPicker[\s\S]*fields\.tagContainer[\s\S]*selectedTags: tags/, "Tags child dialog should still mount the Tags-owned picker");
assert.match(taskDialog, /tagIds: readTaskTagIds\(\)/, "Task save should still read staged tag picker IDs");
assert.match(fileMount, /namespace\.fileAttachments\.mount\(fields\.fileContainer, \{[\s\S]*canUpload: Boolean\(task\?\.task_id\)[\s\S]*saveFirstMessage: "Save the task before adding files\."[\s\S]*targetId: task\?\.task_id \|\| ""[\s\S]*targetType: "task"/, "Files child dialog should still mount the Files-owned helper with save-first behavior");

assert.doesNotMatch(fieldNodes, /data-task-tags-panel|data-task-files-panel|taskEditorFooterPanel/, "Task editor body should not include inline Tags or Files utility panels");
assert.doesNotMatch(taskDialog, /taskOverlayHost|toggleTaskFooterPanel|toggleTaskFooterPanelFallback|taskEditorFooterPanel|data-task-tags-panel|data-task-files-panel/, "Task Tags and Files should no longer use parent-body overlay panel plumbing");
assert.doesNotMatch(taskDialog, /className: \["task-footer-panel"|"surface-overlay-panel"/, "Task dialog should not mount Tags or Files as overlay panels");

assert.match(tasksView, /css\/longtail-forge\.css\?v=72/, "Tasks page should cache-bust the child-dialog stylesheet cleanup");
assert.match(tasksView, /js\/task-dialog\.js\?v=21/, "Tasks page should cache-bust the Task child-dialog browser wiring");
assert.match(workbenchView, /css\/longtail-forge\.css\?v=21/, "Workbench should cache-bust the child-dialog stylesheet cleanup");
assert.match(workbenchView, /js\/task-dialog\.js\?v=21/, "Workbench should cache-bust the Task child-dialog browser wiring");

assert.match(tasksDocs, new RegExp(`current Tasks module behavior as of ${escapeRegExp(appVersion)}`), "Tasks docs should report the current Task child-dialog version");
assert.match(tasksDocs, /Tags and Files footer utilities open stacked child dialogs/, "Tasks docs should document the shipped child-dialog behavior");
assert.match(tasksDocs, /Save the task before adding files\./, "Tasks docs should preserve the Files save-first state");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files upload/action/guardrail branch");
assert.match(regressionSuite, /scripts\/tasks-tags-files-child-dialog-regression\.mjs/, "Full regression suite should include the Task child-dialog regression");

console.log("Tasks Tags and Files child-dialog regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
