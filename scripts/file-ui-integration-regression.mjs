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

assert.ok(taskDialog.includes("data-task-files"), "Task dialog should reserve task attachment mount point.");
assert.ok(
  tasksPage.indexOf("js/shared/file-attachments.js") < tasksPage.indexOf("js/task-dialog.js"),
  "Task attachment helper must load before task dialog.",
);
assert.ok(
  tasksPage.indexOf("js/shared/notes-linked-panel.js") < tasksPage.indexOf("js/task-dialog.js"),
  "Task notes helper must load before task dialog.",
);
assert.ok(
  workbenchPage.indexOf("js/shared/file-attachments.js") < workbenchPage.indexOf("js/task-dialog.js"),
  "Workbench task dialog host must load task attachment helper before task dialog.",
);
assert.ok(
  workbenchPage.indexOf("js/shared/notes-linked-panel.js") < workbenchPage.indexOf("js/task-dialog.js"),
  "Workbench task dialog host must load task notes helper before task dialog.",
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

assert.ok(filesPage.includes('<main class="wide-page files-page" data-files-host></main>'), "Files page should expose the minimal descriptor host.");
assert.ok(filesPage.includes("js/shared/modal.js"), "Files page should load the shared modal helper for in-app warnings.");
assert.ok(
  filesPage.indexOf("js/shared/client-project-options.js?v=2") < filesPage.indexOf("js/shared/view-builder.js?v=16") &&
    filesPage.indexOf("js/shared/view-builder.js?v=16") < filesPage.indexOf("js/shared/view-renderer.js?v=12") &&
    filesPage.indexOf("js/shared/view-renderer.js?v=12") < filesPage.indexOf("js/files.js?v=10"),
  "Files page should load client/project helpers plus the shared view builder/renderer before the Files adapter.",
);
assert.ok(filesPage.includes("js/files.js?v=10"), "Files page should cache-bust the protected Files script.");
assert.doesNotMatch(filesPage, /\b(data-file-filters|data-file-business-control|data-file-list)\b/, "Files page should not ship browse hooks outside the descriptor host.");
assert.ok(filesScript.includes("data-file-filters") || filesScript.includes("dataset.fileFilters"), "Files adapter should mount the filter form.");
assert.ok(filesScript.includes("data-file-business-control") || filesScript.includes("dataset.fileBusinessControl"), "Files adapter should mark business-only client controls.");
["data-file-filter-module", "data-file-filter-target-type", "data-file-filter-target-id", "data-file-filter-client", "data-file-filter-project", "data-file-filter-filename", "data-file-filter-status"].forEach((selector) => {
  const datasetName = selector.replace(/^data-/, "").replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  assert.ok(filesScript.includes(selector) || filesScript.includes(`dataset.${datasetName}`), `Files adapter should expose ${selector}.`);
});
assert.ok(filesScript.includes("/api/files/attachments?"), "Files surface should browse framework attachments.");
assert.ok(filesScript.includes("moduleId"), "Files surface should filter by module.");
assert.ok(filesScript.includes("targetType"), "Files surface should filter by target type.");
assert.ok(filesScript.includes("clientId"), "Files surface should filter by client.");
assert.ok(filesScript.includes("projectId"), "Files surface should filter by project.");
assert.ok(filesScript.includes("filename"), "Files surface should filter by filename.");
assert.ok(filesScript.includes("status"), "Files surface should filter by status.");
assert.ok(filesScript.includes("targetLabel"), "Files surface should render human-readable target labels.");
assert.ok(filesScript.includes("clientLabel"), "Files surface should render human-readable client labels.");
assert.ok(filesScript.includes("projectLabel"), "Files surface should render human-readable project labels.");
assert.ok(filesScript.includes("LongtailForge.filesDialog"), "Files surface should expose the canonical file context dialog namespace.");
assert.ok(filesScript.includes("openFileEditor"), "Files surface should expose the file context editor opener.");
assert.ok(filesScript.includes("usesBusinessScope() ? clientFilter?.value : \"\""), "Files surface should not send client filters outside Business workspaces.");
assert.ok(filesScript.includes('title: "Delete file?"'), "Files surface should warn before deleting files.");
assert.ok(helper.includes('title: "Delete file?"'), "Attachment helper should warn before deleting files.");
assert.ok(staticService.includes('"files.html"'), "Files page should be a framework protected view.");
assert.ok(appShell.includes('href: "files.html"'), "Files page should appear in app navigation.");

assert.ok(filesRoutes.includes('"/files/attachments/counts"'), "Files routes should expose count endpoint.");
assert.ok(filesRoutes.includes('"/files/attachable-targets"'), "Files routes should expose attachable target option endpoint.");
assert.ok(filesRoutes.includes('"/files/attachments/:fileAttachmentId/preview"'), "Files routes should expose the attachment-scoped preview descriptor endpoint.");
assert.ok(filesRoutes.includes('"/files/attachments/:fileAttachmentId/preview/content"'), "Files routes should expose the attachment-scoped preview content endpoint.");
assert.ok(
  filesRoutes.indexOf('"/files/attachments/:fileAttachmentId/preview/content"') < filesRoutes.indexOf('"/files/attachments/:fileAttachmentId/preview"') &&
    filesRoutes.indexOf('"/files/attachments/:fileAttachmentId/preview"') < filesRoutes.indexOf('"/files/:fileId"'),
  "Files preview descriptor and content endpoints should be registered before the generic file route.",
);
assert.ok(filesService.includes("countAttachmentsForTargets"), "Files service should own attachment count queries.");
assert.ok(filesService.includes("listAttachableTargetOptions"), "Files service should own attachable target option queries.");
assert.ok(filesService.includes("readAttachmentPreviewDescriptor"), "Files service should own attachment preview descriptors.");
assert.ok(filesService.includes("readAttachmentPreviewContent"), "Files service should own attachment preview content.");
assert.ok(filesService.includes("normalizeFileStatusFilter"), "Files service should normalize status filters.");
assert.ok(filesService.includes("filters.filename"), "Files service should filter browse results by filename.");
assert.ok(filesService.includes("filters.clientId"), "Files service should filter browse results by client.");
assert.ok(filesService.includes("filters.projectId"), "Files service should filter browse results by project.");

console.log("File UI integration regression passed.");
