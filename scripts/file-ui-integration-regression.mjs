import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const helper = read("public/js/shared/file-attachments.js");
const taskDialog = read("public/js/task-dialog.js");
const tasksPage = read("views/protected/tasks.html");
const workbenchPage = read("views/protected/workbench.html");
const tasksScript = read("public/js/tasks.js");
const filesPage = read("views/protected/files.html");
const filesScript = read("public/js/files.js");
const filesRoutes = read("src/routes/files.routes.js");
const filesService = read("src/services/files.service.js");
const appShell = read("src/services/app-shell.service.js");
const staticService = read("src/services/static.service.js");
const taskModule = read("src/modules/tasks/module.js");

[
  "uploadStarted",
  "uploadCompleted",
  "uploadFailed",
  "attachmentAdded",
  "attachmentRemoved",
  "statusChanged",
  "refresh",
].forEach((eventName) => {
  assert.match(helper, new RegExp(`"${eventName}"`), `file attachment helper should expose ${eventName} event flow`);
});

[
  "data-file-attachment-input",
  "/api/files",
  "/api/files/attachments",
  "/api/files/attachments/${encodeURIComponent(attachmentId)}/remove",
  "/api/files/${encodeURIComponent(fileId)}/download",
  "No files attached.",
  "Save before adding files.",
  "Pending scan",
  "Quarantined",
].forEach((snippet) => {
  assert.ok(helper.includes(snippet), `file attachment helper should contain ${snippet}`);
});

assert.ok(tasksPage.includes("data-task-files"), "Tasks page should reserve task attachment mount point.");
assert.ok(
  tasksPage.indexOf("js/shared/file-attachments.js") < tasksPage.indexOf("js/task-dialog.js"),
  "Task attachment helper must load before task dialog.",
);
assert.ok(
  workbenchPage.indexOf("js/shared/file-attachments.js") < workbenchPage.indexOf("js/task-dialog.js"),
  "Workbench task dialog host must load task attachment helper before task dialog.",
);
assert.ok(taskDialog.includes("namespace.fileAttachments.mount"), "Task dialog should mount shared file helper.");
assert.ok(taskDialog.includes('moduleId: "tasks"'), "Task dialog should pass manifest module ID.");
assert.ok(taskDialog.includes('targetType: "task"'), "Task dialog should pass manifest target type.");
assert.ok(taskDialog.includes("onAttachmentsChanged"), "Task dialog should expose module-facing attachment callbacks.");
assert.ok(taskModule.includes("attachableTypes"), "Tasks manifest should declare attachable target.");
assert.ok(taskModule.includes('targetType: "task"'), "Tasks attachable target should be task.");

assert.ok(tasksScript.includes("/api/files/attachments/counts"), "Tasks list should request framework attachment counts.");
assert.ok(tasksScript.includes('moduleId: "tasks"'), "Task count request should use tasks module ID.");
assert.ok(tasksScript.includes('targetType: "task"'), "Task count request should use task target type.");
assert.ok(tasksScript.includes("task-attachment-count"), "Task rows should render attachment count chips.");

assert.ok(filesPage.includes("data-file-filters"), "Files page should expose filter form.");
["data-file-filter-module", "data-file-filter-target-type", "data-file-filter-target-id", "data-file-filter-client", "data-file-filter-project", "data-file-filter-filename", "data-file-filter-status"].forEach((selector) => {
  assert.ok(filesPage.includes(selector), `Files page should expose ${selector}.`);
});
assert.ok(filesScript.includes("/api/files/attachments?"), "Files surface should browse framework attachments.");
assert.ok(filesScript.includes("moduleId"), "Files surface should filter by module.");
assert.ok(filesScript.includes("targetType"), "Files surface should filter by target type.");
assert.ok(filesScript.includes("clientId"), "Files surface should filter by client.");
assert.ok(filesScript.includes("projectId"), "Files surface should filter by project.");
assert.ok(filesScript.includes("filename"), "Files surface should filter by filename.");
assert.ok(filesScript.includes("status"), "Files surface should filter by status.");
assert.ok(staticService.includes('"files.html"'), "Files page should be a framework protected view.");
assert.ok(appShell.includes('href: "files.html"'), "Files page should appear in app navigation.");

assert.ok(filesRoutes.includes('"/files/attachments/counts"'), "Files routes should expose count endpoint.");
assert.ok(filesService.includes("countAttachmentsForTargets"), "Files service should own attachment count queries.");
assert.ok(filesService.includes("normalizeFileStatusFilter"), "Files service should normalize status filters.");
assert.ok(filesService.includes("filters.filename"), "Files service should filter browse results by filename.");
assert.ok(filesService.includes("filters.clientId"), "Files service should filter browse results by client.");
assert.ok(filesService.includes("filters.projectId"), "Files service should filter browse results by project.");

console.log("File UI integration regression passed.");
