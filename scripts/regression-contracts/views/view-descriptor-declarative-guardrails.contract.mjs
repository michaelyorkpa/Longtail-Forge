import { escapeRegExp, extractFunctionBlock } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import vm from "node:vm";
import { listModules } from "../../../src/core/modules/registry.js";
import { listFrameworkProtectedViews, listFrameworkViewSurfaces } from "../../../src/core/view-surfaces/framework-view-surfaces.js";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under views.current-static-contracts by 0.33.33.9.
const { readText } = createProjectTextReader();

/**
 * The canonical bundled descriptor contract, reused from the framework
 * declaration rather than redeclared here so this guardrail and the server
 * registry describe one schema.
 * @typedef {import("../../../src/types/framework-contracts.js").ViewSurfaceDescriptor} ViewSurfaceDescriptor
 */
/**
 * One protected-view inventory row: the view's identity plus the declarative
 * surfaces registered against it and whether any of them is strict.
 * @typedef {{ moduleId: string, viewId: string, file: string, surfaceIds: string[], strict: boolean }} ProtectedViewInventoryRow
 */

const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const listsHtml = readText("views/protected/lists.html");
const notesJs = readText("public/js/notes.js");
const notesHtml = readText("views/protected/notes.html");
const tasksJs = readText("public/js/tasks.js");
const taskDialogJs = readText("public/js/task-dialog.js");
const tasksHtml = readText("views/protected/tasks.html");
const filesJs = readText("public/js/files.js");
const filePreviewJs = readText("public/js/shared/file-preview.js");
const fileAttachmentsJs = readText("public/js/shared/file-attachments.js");
const filesHtml = readText("views/protected/files.html");
const filesStrictInventoryDoc = readText("docs/files-strict-guardrail-inventory.md");
const clientsProjectsJs = readText("public/js/clients-projects.js");
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsInventoryDoc = readText("docs/clients-projects-strict-guardrail-inventory.md");
const responseRecordsAdapter = readText("public/js/shared/view-response-records.js");
const surfaceDescriptorAdapter = readText("public/js/shared/view-surface-descriptor.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const viewRenderer = readText("public/js/shared/view-renderer.js");
const staticService = readText("src/services/static.service.js");

const modules = listModules();
const protectedViews = [
  ...modules.flatMap((moduleDefinition) => (
    moduleDefinition.protectedViews || []
  ).map((view) => ({
    ...view,
    moduleId: view.moduleId || moduleDefinition.id,
    moduleEnabledByDefault: moduleDefinition.enabledByDefault,
  }))),
  ...listFrameworkProtectedViews().map((view) => ({
    ...view,
    moduleEnabledByDefault: true,
  })),
];
const protectedViewsByFile = new Map(protectedViews.map((view) => [view.file, view]));
const protectedHtmlFiles = readdirSync(new URL("../../../views/protected/", import.meta.url))
  .filter((fileName) => fileName.endsWith(".html"))
  .sort();
const surfaces = [
  ...modules.flatMap((moduleDefinition) => (
    moduleDefinition.viewSurfaces || []
  ).map((surface) => ({
    ...surface,
    moduleId: surface.moduleId || moduleDefinition.id,
  }))),
  ...listFrameworkViewSurfaces(),
];
const descriptorContext = vm.createContext({ window: { LongtailForge: {} } });
vm.runInContext(surfaceDescriptorAdapter, descriptorContext, { filename: "view-surface-descriptor.js" });
const normalizeSurfaceDescriptor = descriptorContext.window.LongtailForge.viewSurfaceDescriptor.normalize;
for (const surface of surfaces) {
  assert.doesNotThrow(
    () => normalizeSurfaceDescriptor(surface),
    `Bundled declarative surface ${surface.id} should pass the checked browser projection`,
  );
}
for (const fieldName of [
  "layout",
  "filterPlacement",
  "pageHeader",
  "sidebarLabel",
  "sidebarPanels",
  "filters",
  "indexPanel",
  "table",
  "detail",
  "modals",
  "dataSource",
  "actions",
  "regions",
]) {
  assert.ok(surfaces.some((surface) => objectTreeHasKey(surface, fieldName)), `Bundled descriptor inventory should exercise ${fieldName}`);
}
assert.throws(
  () => normalizeSurfaceDescriptor({ ...surfaces[0], pageHeading: surfaces[0].pageHeader, pageHeader: undefined }),
  /viewSurface\.pageHeading is not a supported descriptor field/,
  "A renamed supported field should fail at the checked browser boundary",
);
assert.throws(
  () => normalizeSurfaceDescriptor({ ...surfaces[0], layout: "split-list-detail" }),
  /viewSurface\.layout must be one of/,
  "A malformed supported field should fail at the checked browser boundary",
);
assert.match(viewBuilder, /function normalizeSurfaceDescriptor\(descriptor\)[\s\S]*viewSurfaceDescriptor[\s\S]*adapter\.normalize\(descriptor\)/, "The view builder should expose the checked descriptor projection to renderer consumers");
assert.match(viewRenderer, /const descriptor = view\.normalizeSurfaceDescriptor\(deliveredDescriptor\)/, "The renderer should project unknown delivered descriptors before reading supported fields");
assert.match(staticService, /app-shell-bootstrap\.js[\s\S]*view-surface-descriptor\.js[\s\S]*view-response-records\.js/, "The descriptor adapter should load in the framework preamble before view page assets");
/** @type {Map<string, ViewSurfaceDescriptor[]>} */
const surfacesByView = new Map();
for (const surface of surfaces) {
  const key = `${surface.moduleId}:${surface.viewId}`;
  surfacesByView.set(key, [...(surfacesByView.get(key) || []), surface]);
}

assert.deepEqual(
  surfaces
    .filter((surface) => surface.dataSource?.route)
    .map((surface) => {
      if (!surface.dataSource) throw new Error(`${surface.id} should retain its filtered data source.`);
      return /** @type {[string, string]} */ ([surface.id, surface.dataSource.recordsKey || ""]);
    })
    .sort(([left], [right]) => left.localeCompare(right)),
  [
    ["client-projects.clients", "clients"],
    ["client-projects.projects", "projects"],
    ["developer-example.surface", "records"],
    ["files.browse", "attachments"],
    ["lists.workspace", "lists"],
    ["notes.workspace", "notes"],
    ["tags.management", "tags"],
    ["tasks.workspace", "tasks"],
  ],
  "Every bundled declarative list should declare its real response envelope key",
);
assert.match(responseRecordsAdapter, /const COMPATIBILITY_RECORD_KEYS = Object\.freeze/, "Legacy response-key guessing should stay explicit in the checked compatibility adapter");
for (const [source, owner] of [
  [surfaceDescriptorAdapter, "checked descriptor adapter"],
  [viewBuilder, "view builder"],
  [viewRenderer, "descriptor renderer"],
  [clientsProjectsJs, "delivered Clients/Projects descriptor mutation"],
]) {
  assert.doesNotMatch(source, /COMPATIBILITY_RECORD_KEYS|extractRecords|Object\.values\(body\)/, `${owner} should not own response-key guessing`);
}
const strictDeclarativeSurfaceIds = new Set([
  "client-projects.clients",
  "client-projects.projects",
  "files.browse",
  "lists.workspace",
  "notes.workspace",
  "tasks.workspace",
]);
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

assert.match(listsModule, /version:\s*appVersion/, "Lists module should track the current app version");

assert.ok(inventory.length >= 20, "Protected view inventory should cover all protected HTML views");
assert.deepEqual(
  inventory.filter((entry) => entry.strict).map((entry) => entry.surfaceIds[0]).sort(),
  [
    "client-projects.clients",
    "client-projects.projects",
    "files.browse",
    "lists.workspace",
    "notes.workspace",
    "tasks.workspace",
  ],
  "The converted Clients, Projects, Files, Lists, Notes, and Tasks descriptors should be under strict declarative enforcement",
);
assert.ok(inventory.some((entry) => entry.moduleId === "tags" && entry.surfaceIds.includes("tags.management") && !entry.strict), "Tags descriptor should be inventoried but not strict yet");
assert.ok(inventory.some((entry) => entry.moduleId === "developer-example" && entry.surfaceIds.includes("developer-example.surface") && !entry.strict), "Disabled example descriptor should be inventoried but not strict");
assert.ok(inventory.some((entry) => entry.moduleId === "framework" && entry.surfaceIds.includes("files.browse") && entry.strict), "Files descriptor should be strict-converted");
assert.ok(inventory.some((entry) => entry.moduleId === "tasks" && entry.surfaceIds.includes("tasks.workspace") && entry.strict), "Tasks descriptor should be strict-converted");
assert.ok(inventory.some((entry) => entry.moduleId === "client-projects" && entry.surfaceIds.includes("client-projects.clients") && entry.strict), "Clients descriptor should be strict-converted");
assert.ok(inventory.some((entry) => entry.moduleId === "client-projects" && entry.surfaceIds.includes("client-projects.projects") && entry.strict), "Projects descriptor should be strict-converted");

assert.match(listsHtml, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Strict declarative Lists HTML should stay a minimal host");
assert.match(listsHtml, /js\/shared\/view-builder\.js[\s\S]*js\/shared\/view-renderer\.js[\s\S]*js\/lists\.js/, "Strict declarative Lists HTML should load the renderer before the module adapter");
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
  "renderDescriptorModalForm",
]) {
  assert.match(listsJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Lists source should consume ${helper}`);
}
assert.doesNotMatch(listsJs, /className:\s*["'`][^"'`]*(modal-actions|form-actions|list-table-wrap|lists-workspace)[^"'`]*/, "Strict declarative Lists source should not create one-off layout/footer class shells");
assert.doesNotMatch(listsJs, /classList\.add\([^)]*(modal-actions|form-actions|list-table-wrap)[^)]*\)/, "Strict declarative Lists source should not add one-off layout/footer classes");
assert.doesNotMatch(listsJs, /listsLinkedRecordsSurfaceDescriptor|renderDescriptorLinkedRecordsPanel|field:\s*"task_search"|field:\s*"task_picker"|loadTaskLinkTargets|taskLinkTargets/, "Strict declarative Lists source should not keep the retired detail-side linked-record editor or its task-target bootstrap");

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
  assert.match(notesJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Notes source should consume ${helper}`);
}
assert.doesNotMatch(notesJs, /className:\s*["'`][^"'`]*(modal-actions|form-actions|list-table-wrap|notes-workspace)[^"'`]*/, "Strict declarative Notes source should not create one-off layout/footer class shells");

// Tasks strict declarative enforcement. Task rows, recurrence internals, checklist rows, timer state,
// bulk semantics, payloads, and validation remain Tasks-owned escape hatches, but framework-owned
// shells must come from the descriptor renderer or shared view helpers, not raw template strings.
assert.match(tasksHtml, /<main class="wide-page tasks-page" data-tasks-host><\/main>/, "Strict declarative Tasks HTML should stay a minimal host");
assertNoProtectedAnatomy(tasksHtml, "views/protected/tasks.html", /\b(data-task-dialog|data-task-list|data-task-filter-details|data-task-view-selector|data-task-bulk-toolbar)\b/, "Tasks");
for (const forbidden of [
  "taskTemplateElement",
  "taskTemplateElements",
  "taskEditorFieldMarkup",
  "document.createElement(\"template\")",
  "innerHTML",
  "document.createElement(\"dialog\")",
  "document.createElement(\"details\")",
]) {
  assert.doesNotMatch(`${tasksJs}\n${taskDialogJs}`, new RegExp(escapeRegExp(forbidden)), `Strict declarative Tasks source should not use ${forbidden}`);
}
for (const helper of [
  "renderSurface",
  "createListShell",
  "createBulkActionToolbar",
  "createDetailActionStrip",
  "createDetailActionMenu",
]) {
  assert.match(tasksJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Tasks source should consume ${helper}`);
}
for (const helper of [
  "renderDescriptorModalForm",
  "createElement",
]) {
  assert.match(taskDialogJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Task dialog source should consume ${helper}`);
}
assert.match(taskDialogJs, /createDetailBadgeRow/, "Strict declarative Task dialog source should consume createDetailBadgeRow");
assert.match(tasksJs, /function createTaskRow\(task\)[\s\S]*document\.createElement\("tr"\)[\s\S]*appendTaskMetadata\(metaBand, task\)[\s\S]*appendTaskContext\(metaBand, task\)/, "Task row-specific content should remain the documented strict escape hatch");
assert.match(taskDialogJs, /function taskRecurrenceFieldNodes\(\)[\s\S]*taskRecurrenceFrequency[\s\S]*taskRecurrenceInterval[\s\S]*taskRecurrenceEndDate/, "Recurrence editor internals should remain the documented strict escape hatch");
assert.match(taskDialogJs, /function checklistItemRow\(item, index, totalItems\)[\s\S]*document\.createElement\("div"\)[\s\S]*taskChecklistToggle[\s\S]*taskChecklistLabel/, "Checklist behavior fragments should remain the documented strict escape hatch");
assert.match(taskDialogJs, /function writeTaskTimerFields\(task\)[\s\S]*taskTimersEnabled[\s\S]*timeTrackingEnabled[\s\S]*timer_status/, "Timer state behavior should remain the documented strict escape hatch");

// Files strict declarative enforcement. Files stays a compact browse/recovery surface: framework
// helpers own the page, filter, table, attachment-panel, upload, action, and modal shell anatomy,
// while Files owns route calls, file reading, context payloads, availability, and recovery meaning.
assert.match(filesHtml, /<main class="wide-page files-page" data-files-host><\/main>/, "Strict declarative Files HTML should stay a minimal host");
assertNoProtectedAnatomy(filesHtml, "views/protected/files.html", /\b(data-file-filters|data-file-list|data-file-table-mount|data-file-status|data-file-editor-row)\b/, "Files");
assert.doesNotMatch(filesJs, /files\.browse\.legacy|createFilesBrowseChrome/, "Strict Files source should not keep the legacy full-page browse fallback");
assert.doesNotMatch(filesJs, /document\.createElement\(/, "Strict Files source should create elements through shared view helpers");
assert.equal(countMatches(filesJs, /innerHTML/g), 0, "Strict Files source should not keep direct innerHTML writes after preview extraction");
assert.equal(countMatches(filePreviewJs, /innerHTML/g), 1, "Shared preview source should only use innerHTML for route-sanitized Markdown preview content");
// Retargeted under `0.33.33.38.4.9.5`: still the module's single innerHTML write, still the
// documented escape hatch, but no longer defaulted - the value is the `bodyHtml` of a content
// record the contract reader vouched for, and an unreadable body refuses instead of injecting "".
assert.match(extractFunctionBlock(filePreviewJs, "renderFilePreviewMarkdown"), /content\.innerHTML = html;/, "Markdown preview should keep the documented route-sanitized innerHTML escape hatch");
assert.match(extractFunctionBlock(filesJs, "createFilesElement"), /requireFilesViewHelper\("createElement"\)[\s\S]*view\.createElement\(tagName, options\)/, "Files helper-backed fragments should use the shared createElement primitive");
for (const helper of [
  "renderSurface",
  "createListShell",
  "createDataTable",
  "createDetailActionStrip",
  "createActionButton",
  "renderDescriptorModalForm",
  "createFieldGrid",
]) {
  assert.match(filesJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Files source should consume ${helper}`);
}
for (const helper of [
  "createActionButton",
  "createModal",
  "showModal",
]) {
  assert.match(filePreviewJs, new RegExp(`\\.${helper}`), `Shared Files preview source should consume ${helper}`);
}
for (const behaviorId of [
  "files.browse.filters",
  "files.browse.results",
]) {
  assert.match(filesJs, new RegExp(`\\.registerBehavior\\("${escapeRegExp(behaviorId)}"`), `Strict declarative Files source should mount ${behaviorId} through descriptor behavior registration`);
}
assert.match(extractFunctionBlock(filesJs, "createFilesFilterChrome"), /return createFilesElement\("form"[\s\S]*createFilesElement\("button"[\s\S]*text: "Apply"/, "Files filters should be helper-backed behavior content");
assert.match(extractFunctionBlock(filesJs, "createAdvancedTargetFilters"), /createFilesElement\("details"[\s\S]*createFilesElement\("summary", \{ text: "Advanced target filters" \}\)/, "Raw target filters should remain behind a helper-backed advanced disclosure");
assert.match(extractFunctionBlock(filesJs, "createFilesResultsChrome"), /const tableMount = createFilesElement\("div"[\s\S]*dataset:\s*\{\s*fileTableMount:\s*""\s*\}[\s\S]*view\.createListShell/, "Files results should mount through the shared list shell");
assert.match(extractFunctionBlock(filesJs, "createFilesTable"), /view\.createDataTable[\s\S]*emptyMessage:\s*"No file attachments match the current filters\."/,
  "Files browse table should use the shared data table helper");
assert.match(extractFunctionBlock(filesJs, "createFileActions"), /view\.createDetailActionStrip\(\{[\s\S]*className: "files-row-actions"[\s\S]*actions: rowActions/,
  "Files row actions should use the shared dense action strip");
assert.match(extractFunctionBlock(filesJs, "buildFileEditorDialog"), /renderDescriptorModalForm\(fileEditorModalDescriptor\(\)[\s\S]*createFileEditorMetadataSection[\s\S]*createFileEditorControlsSection/,
  "File Context should use the shared modal form while keeping Files-owned body behavior");
assert.match(extractFunctionBlock(filePreviewJs, "buildFilePreviewDialog"), /files-preview-body[\s\S]*view\.createModal[\s\S]*files-preview-dialog/,
  "Preview should use the shared modal shell");
for (const routeCheck of /** @type {Array<[string, RegExp, string]>} */ ([
  [extractFunctionBlock(filesJs, "loadFiles"), /params\.set\("limit", String\(FILES_PAGE_SIZE\)\)[\s\S]*\/api\/files\/attachments\?\$\{params\.toString\(\)\}/, "Files browse reads should stay behind the attachment route"],
  [extractFunctionBlock(filesJs, "createDownloadAction"), /\/api\/files\/\$\{encodeURIComponent\(row\.fileId\)\}\/download/, "Files browse downloads should stay behind the Files download route"],
  [extractFunctionBlock(filePreviewJs, "loadFilePreview"), /\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview[\s\S]*api\.getJson\(preview\.contentUrl/, "Files Preview should stay descriptor/content route-backed"],
  [extractFunctionBlock(filesJs, "loadFileEditorTargetOptions"), /\/api\/files\/attachable-targets\?\$\{params\.toString\(\)\}/, "File Context target choices should stay provider-backed"],
  [extractFunctionBlock(filesJs, "saveFileEditorContext"), /\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/context/, "File Context saves should stay attachment-context route-backed"],
  [extractFunctionBlock(filesJs, "reportFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report[\s\S]*FILE_REPORT_REASON/, "Files Report should use the existing Files route"],
  [extractFunctionBlock(filesJs, "quarantineFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine[\s\S]*FILE_QUARANTINE_REASON/, "Files Review should use the existing quarantine route"],
  [extractFunctionBlock(filesJs, "deleteFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/delete/, "Files Delete should use the existing Files route"],
  [extractFunctionBlock(filesJs, "restoreFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/restore/, "Files Restore should use the existing Files route"],
])) {
  assert.match(routeCheck[0], routeCheck[1], routeCheck[2]);
}
assert.match(extractFunctionBlock(filePreviewJs, "previewAvailabilityForRow"), /reviewPreviewAllowed[\s\S]*status !== "available"[\s\S]*kind === "unsupported"[\s\S]*too_large_for_preview[\s\S]*state:\s*"previewable"/,
  "Files should keep preview/download availability decisions as a documented escape hatch");
assert.match(extractFunctionBlock(filesJs, "workspaceHasPermission"), /files\.manage_quarantine/,
  "Files browse permission-shaped visibility should stay Files-owned");
assert.match(extractFunctionBlock(filesJs, "hydrateFileEditorContextControls"), /business[\s\S]*clientSelect[\s\S]*hydrateFileEditorProjectControl/i,
  "File Context should keep Business-only Client and Project selector behavior Files-owned");
assert.doesNotMatch(filesJs, /createFilesSummaryPanel|createFilesDetailPanel|createFilesPreviewPanel|createFilesMetadataPanel|selectedFile|data-file-selected-row|Inspector/,
  "Files browse should not reintroduce inline summary, detail, preview, metadata, selected-row, or Inspector behavior");
assert.doesNotMatch(filesJs, /storageKey|storagePath|signedUrl|fileHash|scannerInternal|filesystemPath/,
  "Files browser UI should not expose storage keys, protected paths, signed URLs, hashes, scanner internals, or filesystem paths");

const clientsSurface = surfaces.find((surface) => surface.id === "client-projects.clients");
const projectsSurface = surfaces.find((surface) => surface.id === "client-projects.projects");
if (!clientsSurface || !projectsSurface) throw new Error("Clients and Projects surfaces should be registered.");
assertClientProjectsStrictDescriptor(clientsSurface, "Clients", ["Add Child Client", "Edit Client"]);
assertClientProjectsStrictDescriptor(projectsSurface, "Projects", ["Edit Project"]);
const unavailableActionDelivery = loadUnavailableTopLevelActionDelivery(false);
const availableActionDelivery = loadUnavailableTopLevelActionDelivery(true);
for (const [surface, label] of /** @type {Array<[ViewSurfaceDescriptor, string]>} */ ([
  [clientsSurface, "Clients"],
  [projectsSurface, "Projects"],
])) {
  if (!surface.dataSource) throw new Error(`${label} surface should retain its data source.`);
  const delivered = unavailableActionDelivery(surface);
  assert.notStrictEqual(delivered, surface, `${label} should project a new delivered descriptor when its primary action is unavailable`);
  // Delivery only strips the unavailable primary action, so both reads below stay
  // on the same descriptor fields the raw surface was just proven to carry.
  assert.equal(Object.hasOwn(/** @type {object} */ (delivered.pageHeader), "primaryAction"), false, `${label} should omit its unavailable delivered primary action`);
  assert.equal(/** @type {import("../../../src/types/framework-contracts.js").ViewSurfaceDataSource} */ (delivered.dataSource).recordsKey, surface.dataSource.recordsKey, `${label} delivery should preserve its declared response envelope key`);
  assert.doesNotThrow(
    () => normalizeSurfaceDescriptor(delivered),
    `${label} delivered descriptor without an unavailable primary action should pass the checked browser projection`,
  );
  assert.strictEqual(availableActionDelivery(surface), surface, `${label} should preserve the raw descriptor when its primary action is available`);
  assert.doesNotThrow(
    () => normalizeSurfaceDescriptor(availableActionDelivery(surface)),
    `${label} available-action descriptor should keep passing the checked browser projection`,
  );
}
assert.match(clientsHtml, /<main class="wide-page client-projects-page clients-page" data-client-projects-host><\/main>/, "Strict declarative Clients HTML should stay a minimal host");
assert.match(projectsHtml, /<main class="wide-page client-projects-page projects-page" data-client-projects-host><\/main>/, "Strict declarative Projects HTML should stay a minimal host");
assertNoProtectedAnatomy(clientsHtml, "views/protected/clients.html", /\b(data-client-list|data-client-status-filter|data-client-dialog|data-client-table-select|data-client-project-status)\b/, "Clients");
assertNoProtectedAnatomy(projectsHtml, "views/protected/projects.html", /\b(data-project-client-filter|data-open-project-bulk|data-project-table-select|data-project-bulk-select|data-client-project-status)\b/, "Projects");
for (const forbidden of [
  "function renderClients(",
  "function renderProjectsPage(",
  "function renderClientsPage(",
  "function createProjectTable(",
  "function createClientTable(",
  "function openProjectBulkEditor(",
  "document.createElement(\"dialog\")",
  "document.createElement(\"table\")",
  "view.createFilterPanel",
  "view.createPageHeader",
  "data-client-list",
  "data-client-status-filter",
  "data-project-client-filter",
  "data-open-project-bulk",
  "data-client-table-select",
  "data-project-table-select",
  "list-table-wrap",
  "project-bulk-dialog",
  "thead.innerHTML",
]) {
  assert.doesNotMatch(clientsProjectsJs, new RegExp(escapeRegExp(forbidden)), `Strict declarative Clients/Projects source should not use ${forbidden}`);
}
for (const helper of [
  "renderSurface",
  "createBulkActionToolbar",
  "createListShell",
  "createDataTable",
  "createDetailActionStrip",
  "createModal",
]) {
  assert.match(clientsProjectsJs, new RegExp(`\\.${helper}\\(`), `Strict declarative Clients/Projects source should consume ${helper}`);
}
assert.match(clientsProjectsJs, /registerClientProjectsModuleActionBehavior\("client-projects\.clients\.create", "clients\.add"\)[\s\S]*registerClientProjectsModuleActionBehavior\("client-projects\.projects\.edit", "projects\.edit"\)/,
  "Clients/Projects page actions should stay registered behavior handlers");
assert.match(clientsProjectsJs, /registerBehavior\("client-projects\.clients\.tags", hydrateTagFilterOptions\)[\s\S]*registerBehavior\("client-projects\.projects\.clients", hydrateProjectClientFilterOptions\)/,
  "Clients/Projects filter options should stay registered module-owned hydration handlers");
assert.match(clientsProjectsJs, /hydrateTagFilterOptions\(\{ mountSearchOptions, setOptions \}[\s\S]*submitMode:\s*"option-or-input"/,
  "Clients/Projects tag filters should hydrate Notes-style searchable suggestions while preserving canonical tag id submission for selected suggestions");
assert.match(clientsProjectsJs, /function createProjectBulkControls\(\)[\s\S]*createBulkClientSelect[\s\S]*applyProjectTableBulkUpdate/,
  "Project bulk meaning should remain a documented module-owned escape hatch");
assert.match(clientsProjectsJs, /function createClientBulkControls\(\)[\s\S]*createClientBulkBillableSelect[\s\S]*applyBulkClientUpdate/,
  "Client bulk meaning should remain a documented module-owned escape hatch");
assert.doesNotMatch(clientsProjectsJs, /label:\s*"Tags"[\s\S]{0,180}formatter:\s*"chip-list"[\s\S]{0,180}columns/s,
  "Clients/Projects source should not reintroduce standalone Tags table columns");
assert.match(clientsProjectsInventoryDoc, /Current as of 0\.33\.32\.24[\s\S]*strict enforcement is active/,
  "Clients/Projects strict inventory should document the current active strict enforcement boundary");

assert.equal(countMatches(fileAttachmentsJs, /document\.createElement/g), 1, "Attachment helper should only use direct DOM in its centralized fallback");
assert.match(extractFunctionBlock(fileAttachmentsJs, "createAttachmentElement"), /document\.createElement\(tagName\)/, "Attachment helper fallback should centralize native element creation");
for (const helper of [
  "createListShell",
  "createEmptyState",
  "createDetailActionStrip",
  "createActionButton",
]) {
  assert.match(fileAttachmentsJs, new RegExp(`view\\?\\.${helper}|view\\.${helper}`), `Strict declarative attachment helper source should consume ${helper}`);
}
assert.match(extractFunctionBlock(fileAttachmentsJs, "createAttachmentPanelShell"), /view\?\.createListShell[\s\S]*file-attachments-panel-shell[\s\S]*return createAttachmentElement\(view, "section"/,
  "Attachment panel shell should use shared list-shell anatomy with a centralized fallback");
assert.match(extractFunctionBlock(fileAttachmentsJs, "createUploadShell"), /view\?\.createListShell[\s\S]*file-attachment-upload-shell[\s\S]*return createAttachmentElement\(view, "div"/,
  "Upload shell should use shared list-shell anatomy with a centralized fallback");
assert.match(extractFunctionBlock(fileAttachmentsJs, "createAttachmentActions"), /files\.removeAttachment[\s\S]*files\.report[\s\S]*files\.quarantine[\s\S]*files\.delete[\s\S]*files\.restore[\s\S]*view\?\.createDetailActionStrip[\s\S]*className: "file-attachment-actions"/,
  "Attachment actions should stay in a shared dense action shell with Files action IDs");
assert.match(extractFunctionBlock(fileAttachmentsJs, "uploadFiles"), /postMultipartJson\("\/api\/files\/upload\/batch", buildUploadForm\(options, files\)\)/,
  "Attachment upload behavior should keep Files-owned streamed route calls");
assert.match(extractFunctionBlock(fileAttachmentsJs, "buildUploadForm"), /appendFormField\(form, "visibility", options\.visibility\)[\s\S]*form\.append\("files", file, file\.name\)/,
  "Attachment upload behavior should keep Files-owned metadata and file payload construction");
assert.doesNotMatch(fileAttachmentsJs, /FileReader|function readFileBase64/,
  "Attachment helper should not use FileReader for the normal browser upload path");
assert.match(extractFunctionBlock(fileAttachmentsJs, "acceptedExtensions"), /archive[\s\S]*document[\s\S]*image[\s\S]*pdf[\s\S]*presentation[\s\S]*text/,
  "Accepted file categories should remain Files-owned");
for (const routeCheck of /** @type {Array<[string, RegExp, string]>} */ ([
  [extractFunctionBlock(fileAttachmentsJs, "refresh"), /\/api\/files\/attachments\?/, "Attachment refresh should use the Files attachment route"],
  [extractFunctionBlock(fileAttachmentsJs, "createAttachmentDownloadAction"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/download/, "Attachment downloads should use the Files download route"],
  [extractFunctionBlock(fileAttachmentsJs, "uploadFiles"), /\/api\/files\/upload\/batch/, "Attachment uploads should use the streamed Files batch route"],
  [extractFunctionBlock(fileAttachmentsJs, "removeAttachment"), /\/api\/files\/attachments\/\$\{encodeURIComponent\(attachmentId\)\}\/remove/, "Attachment removal should use the Files attachment route"],
  [extractFunctionBlock(fileAttachmentsJs, "reportFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report/, "Attachment Report should use the Files route"],
  [extractFunctionBlock(fileAttachmentsJs, "quarantineFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine/, "Attachment Review should use the quarantine route"],
  [extractFunctionBlock(fileAttachmentsJs, "deleteFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/delete/, "Attachment Delete should use the Files route"],
  [extractFunctionBlock(fileAttachmentsJs, "restoreFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/restore/, "Attachment Restore should use the Files route"],
])) {
  assert.match(routeCheck[0], routeCheck[1], routeCheck[2]);
}
assert.match(extractFunctionBlock(fileAttachmentsJs, "emit"), /CustomEvent\(`longtailforge:file-attachments:/,
  "Attachment helper should keep host callbacks/events as a documented escape hatch");
assert.match(extractFunctionBlock(fileAttachmentsJs, "attachmentRecoveryMessage"), /recovery window[\s\S]*in review[\s\S]*review completes/,
  "Attachment recovery states should stay Files-owned");
assert.doesNotMatch(fileAttachmentsJs, /openFileEditor|createFilesMetadataPanel|Inspector|data-file-selected-row/,
  "Attachment helper should not become inline File Context, Metadata, or Inspector UI");
assert.match(fileAttachmentsJs, /namespace\.filePreview\.openFilePreview\(row, \{ trigger: event\?\.currentTarget \|\| null \}\)/,
  "Attachment helper may open only the shared route-backed Preview modal");
assert.match(filesStrictInventoryDoc, /Current as of 0\.33\.31\.9[\s\S]*strict enforcement is active/, "Files strict inventory should document the current active enforcement boundary");
assert.match(filesStrictInventoryDoc, /Strict Enforcement Coverage In 0\.33\.5\.18\.12\.6/, "Files strict inventory should preserve the enforcement coverage section");

assert.match(declarativeGuide, /# Declarative View Surfaces/, "Developer guide should document declarative view surfaces");
assert.match(declarativeGuide, /Strict fail-on-violation guardrails cover `lists\.workspace`, `notes\.workspace`, `tasks\.workspace`, `files\.browse`, `client-projects\.clients`, and `client-projects\.projects`/, "Developer guide should identify current strict enforcement scope");
assert.match(declarativeGuide, /Protected View Inventory/, "Developer guide should include protected view inventory");
for (const expectedInventoryRow of [
  "| Files | files | files.html | files.browse | strict |",
  "| Lists | lists | lists.html | lists.workspace | strict |",
  "| Notes | notes | notes.html | notes.workspace | strict |",
  "| Tasks | tasks | tasks.html | tasks.workspace | strict |",
  "| Client Projects | clients | clients.html | client-projects.clients | strict |",
  "| Client Projects | projects | projects.html | client-projects.projects | strict |",
  "| Tags | tags | tags.html | tags.management | reported |",
  "| Developer Example | developer-example | developer-example.html | developer-example.surface | reported |",
]) {
  assert.match(declarativeGuide, new RegExp(escapeRegExp(expectedInventoryRow)), `Developer guide should include inventory row: ${expectedInventoryRow}`);
}
assert.match(moduleDevelopment, /docs\/declarative-view-surfaces\.md/, "Module development guide should point authors to the declarative guide");
assert.match(moduleContract, /As of 0\.33\.5\.16\.12/, "Module contract should document the closeout version");
assert.match(surfaceContract, /As of 0\.33\.5\.16\.12/, "Surface contract should document the closeout version");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.16\.12/, "View-building contract should document declarative guardrail closeout");

nodeReport(inventory);
console.log("View descriptor declarative guardrails passed.");

/** @param {string} source @param {RegExp} pattern @returns {number} */
function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

/** @param {unknown} value @param {string} fieldName @returns {boolean} */
function objectTreeHasKey(value, fieldName) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Object.hasOwn(value, fieldName)) {
    return true;
  }
  return Object.values(value).some((entry) => objectTreeHasKey(entry, fieldName));
}

/** @param {boolean} actionAvailable @returns {(surface: ViewSurfaceDescriptor) => ViewSurfaceDescriptor} */
function loadUnavailableTopLevelActionDelivery(actionAvailable) {
  const source = extractFunctionBlock(clientsProjectsJs, "withoutUnavailableTopLevelActions");
  const context = vm.createContext({
    canCreateAnyProject: () => actionAvailable,
    canCreateTopLevelClient: () => actionAvailable,
  });
  vm.runInContext(`${source}\nthis.deliver = withoutUnavailableTopLevelActions;`, context, {
    filename: "clients-projects-delivered-descriptor.js",
  });
  return context.deliver;
}

/** @param {string} html @param {string} label @param {RegExp} [hooksRegex] @param {string} [surfaceName] */
function assertNoProtectedAnatomy(html, label, hooksRegex = /\b(data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog)\b/, surfaceName = "Lists") {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} should not ship framework-owned protected view anatomy`);
  assert.doesNotMatch(body, hooksRegex, `${label} should not ship ${surfaceName} workspace hooks outside the descriptor host`);
}

/** @param {ViewSurfaceDescriptor} surface @param {string} label @param {string[]} actionLabels */
function assertClientProjectsStrictDescriptor(surface, label, actionLabels) {
  assert.ok(surface, `${label} descriptor should exist`);
  // Both strict Clients/Projects surfaces are table descriptors; reading through
  // this alias keeps the first missing-table failure at the same statement it
  // reached before, rather than moving it into an earlier guard.
  const table = /** @type {Required<Pick<import("../../../src/types/framework-contracts.js").ViewTableDescriptor, "columns" | "secondaryRows" | "rowActions">>} */ (surface.table);
  assert.equal(surface.filterPlacement, "slide-out-sidebar", `${label} filters should render through the slide-out filter surface`);
  assert.ok(
    Array.isArray(surface.sidebarPanels) && surface.sidebarPanels.some((panel) => panel.type === "filters"),
    `${label} descriptor should declare a filters sidebar panel`,
  );
  assert.equal(
    table.columns.some((column) => column.label === "Tags" || column.id?.endsWith("-tags")),
    false,
    `${label} descriptor should not expose Tags as a standalone table column`,
  );
  assert.ok(
    table.secondaryRows.some((row) => (
      row.id?.endsWith("-tags")
        && row.formatter === "chip-list"
        && row.startColumn === "displayLabel"
        && !Object.hasOwn(row, "label")
    )),
    `${label} descriptor should render unlabeled tags below the service-shaped record name`,
  );
  assert.ok(
    table.rowActions.every((action) => (
      typeof action.icon === "string" &&
      action.icon.length > 0 &&
      action.iconOnly === true &&
      action.title === action.label
    )) &&
      JSON.stringify(table.rowActions.map((action) => action.label)) === JSON.stringify(actionLabels),
    `${label} row actions should be icon-only descriptor actions with accessible labels`,
  );
}

/** @param {ProtectedViewInventoryRow[]} entries */
function nodeReport(entries) {
  const lines = entries
    .map((entry) => `${entry.strict ? "strict" : "reported"} ${entry.moduleId}:${entry.viewId} ${entry.file} ${entry.surfaceIds.join(",") || "-"}`)
    .sort();
  console.log(`Protected view inventory (${entries.length} views):\n${lines.join("\n")}`);
}

/** @param {string} fileName @returns {string} */
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
