import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-ui-workflow-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-ui-workflow.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Ui-Workflow-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { staticService } = await import("../src/services/static.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertManifest();
  await assertProtectedView(session);
  await assertNavigation(session);
  await assertNoteDetailHtml(session);
  await assertDisabledModuleState(session);
  await assertIntegrity();

  console.log("Notes UI workflow regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifest() {
  const notesModule = modulesService.getModule("notes");

  assert.equal(notesModule.version, "0.33.5.14.4");
  assert.ok(notesModule.navigation.some((item) => item.href === "notes.html" && item.parent === "projects.html"));
  assert.ok(notesModule.protectedViews.some((view) => view.file === "notes.html" && view.allowDisabledRead === true));
  assert.ok(notesModule.browserAssets.some((asset) => asset.path === "/js/notes.js"));
  assert.ok(notesModule.browserAssets.some((asset) => asset.path === "/js/shared/notes-editor.js"));
  assert.ok(notesModule.browserAssets.some((asset) => asset.path === "/js/shared/notes-linked-panel.js"));
  assert.ok(notesModule.taggableTypes.some((type) => type.targetType === "note"));
  assert.ok(notesModule.attachableTypes.some((type) => type.targetType === "note"));
}

async function assertProtectedView(session) {
  const result = await staticService.read("/notes.html", session);
  const html = result.contents.toString("utf8");

  assert.equal(result.statusCode, 200);
  // 0.33.5.18.4: the Notes workspace is a minimal framework host. The read shell (page header,
  // filters, index, detail) AND the editor + collection modals are framework-rendered; notes.js
  // mounts the notes-specific chrome and builds the dialog shells from the descriptor modals block.
  assert.match(html, /<main class="wide-page notes-page" data-notes-host><\/main>/);
  assert.match(html, /js\/shared\/view-renderer\.js\?v=6/);
  assert.match(html, /js\/shared\/icons\.js\?v=2/);
  assert.match(html, /js\/shared\/view-builder\.js\?v=7/);
  assert.match(html, /js\/notes\.js\?v=27/);
  assert.match(html, /js\/shared\/tags\.js\?v=1/);
  assert.match(html, /js\/shared\/file-attachments\.js\?v=1/);
  assert.match(html, /js\/shared\/notes-editor\.js\?v=3/);
  assert.match(html, /css\/longtail-forge\.css\?v=32/);
  // No static read chrome or dialog markup remains in the host page.
  assert.doesNotMatch(html, /data-note-filter-tags|data-notes-collections-panel|notes-filters-panel|notes-library-tabs/);
  assert.doesNotMatch(html, /data-note-dialog|data-note-collection-dialog|data-note-body|data-note-form/);
  assert.doesNotMatch(html, /data-note-context-target-type|data-note-tags-editor|data-note-editor-toolbar/);
  assert.doesNotMatch(html, /Client ID|Project ID|Task ID|User ID/);

  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  assert.match(notesJs, /notes-collection-actions-menu/);
  assert.match(notesJs, /safeNoteErrorMessage/);
  assert.match(notesJs, /notes-locked-state/);
  assert.match(notesJs, /notes-status-badge/);
  assert.match(notesJs, /clientVisibleOption\.disabled = secureMode/);
  assert.match(notesJs, /chipStrip\.prepend\(statusBadge\("Secure"\)\)/);
  assert.match(notesJs, /Secure notes do not allow framework file attachments yet\./);
  assert.match(notesJs, /securityInput\.disabled = Boolean\(note\)/);
  assert.match(notesJs, /collectionFilterOptions/);
  assert.match(notesJs, /hierarchicalCollectionOptions/);
  assert.match(notesJs, /notes-detail-rule/);
  assert.match(notesJs, /notes-revisions-panel/);
  assert.match(notesJs, /createNoteActionStrip/);
  assert.match(notesJs, /detailMetaItems/);
  assert.match(notesJs, /noteKindLabel/);
  assert.match(notesJs, /resetLegacyNoteKindOptions/);
  assert.match(notesJs, /Legacy client/);
  assert.match(notesJs, /data-legacy-note-kind/);
  assert.match(notesJs, /fetchLinkTargets/);
  assert.match(notesJs, /api\/notes\/link-targets/);
  assert.match(notesJs, /LINK_TARGET_TYPE_ORDER = \["workspace", "client", "project", "task", "user"\]/);
  assert.match(notesJs, /availableLinkTargetTypes\(\)/);
  assert.match(notesJs, /targetType !== "client" \|\| usesBusinessScope\(\)/);
  assert.match(notesJs, /populateLinkTargetTypeSelect\(contextTargetTypeInput\)/);
  assert.match(notesJs, /applyContextTarget/);
  assert.match(notesJs, /openEditorForLinkedTarget/);
  assert.match(notesJs, /noteHasLink/);
  assert.doesNotMatch(notesJs, /loadLibrary/);
  assert.match(notesJs, /collectionFilterIds/);
  assert.match(notesJs, /Original/);
  // 0.33.5.18.3 declarative read shell conversion markers.
  assert.match(notesJs, /buildNotesViewShell/);
  assert.match(notesJs, /view\.renderSurface/);
  assert.match(notesJs, /notesViewSurfaceDescriptor/);
  assert.match(notesJs, /decorateNotesDeclarativeSurface/);
  assert.match(notesJs, /createNotesLibraryPanel/);
  assert.match(notesJs, /createNotesLibraryChrome/);
  assert.match(notesJs, /createNotesListChrome/);
  assert.match(notesJs, /createNotesPagination/);
  assert.match(notesJs, /indexPanel\?\.before\(createNotesLibraryPanel\(\)\)/);
  assert.match(notesJs, /summaryTitle\.textContent = "Notes List"/);
  assert.match(notesJs, /summary\.classList\.add\("has-summary-actions"\)/);
  assert.match(notesJs, /dataSource: null/);
  assert.match(notesJs, /notes-library-tabs/);
  assert.match(notesJs, /notes-library-toolbar/);
  assert.match(notesJs, /icon:\s*"library-add"/);
  assert.match(notesJs, /collapseNotesNavigationPanels/);
  assert.match(notesJs, /tagChips\(note\.tags \|\| \[\], \{ limit: 2, showOverflow: true \}\)/);
  assert.match(notesJs, /overflow\.textContent = "\.\.\."/);
  assert.doesNotMatch(notesJs, /data-notes-list-title|notes-list-excerpt/);
  assert.doesNotMatch(notesJs, /text:\s*"Collections"/);
  assert.match(notesJs, /notesCollectionsPanel/);
  // 0.33.5.18.4 declarative editor + collection modal conversion markers.
  assert.match(notesJs, /createNoteDialogShell/);
  assert.match(notesJs, /createCollectionDialogShell/);
  assert.match(notesJs, /document\.body\.append\(createNoteDialogShell\(\), createCollectionDialogShell\(\)\)/);
  assert.match(notesJs, /view\.renderDescriptorModalForm/);
  assert.match(notesJs, /notesEditorModalDescriptor/);
  assert.match(notesJs, /notesCollectionModalDescriptor/);
  assert.match(notesJs, /dialog\.dataset\.noteDialog = ""/);
  assert.match(notesJs, /dialog\.dataset\.noteCollectionDialog = ""/);
  assert.match(notesJs, /createNoteContextPanel/);
  assert.match(notesJs, /createNoteEditorToolbar/);
  // Note Kind options stay module-owned and exclude the linked-target kinds.
  const noteKindOptions = notesJs.match(/field: "noteType",[^\n]*?options: (\[\[.*?\]\]) \}/)?.[1] || "";
  assert.match(noteKindOptions, /\["decision", "Decision"\]/);
  assert.match(noteKindOptions, /\["procedure", "Procedure"\]/);
  assert.match(noteKindOptions, /\["log", "Log"\]/);
  assert.doesNotMatch(noteKindOptions, /"client"|"ticket"|"user"/);
  // Linked-context target picker stays module-owned (workspace/project/task/user, no client kind).
  assert.match(notesJs, /\["workspace", "Workspace"\], \["project", "Project"\], \["task", "Task"\], \["user", "User"\]/);

  // 0.33.5.18.5.1 declarative workflow action strip.
  const notesModuleSource = await fs.readFile(path.join(process.cwd(), "src/modules/notes/module.js"), "utf8");
  assert.match(notesModuleSource, /actionStrip:\s*\{[\s\S]*?behavior:\s*"notes\.workflow\.edit"[\s\S]*?behavior:\s*"notes\.workflow\.archive"[\s\S]*?behavior:\s*"notes\.workflow\.restore"/, "Notes descriptor should declare the workflow action strip behaviors");
  assert.match(notesModuleSource, /actionStrip:\s*\{[\s\S]*?requiredPermissions:\s*\[NOTE_PERMISSIONS\.UPDATE\]/, "Edit action should require the note update permission");
  assert.match(notesJs, /NOTE_WORKFLOW_HANDLERS/, "Notes should dispatch workflow actions through a registered behavior map");
  assert.match(notesJs, /"notes\.workflow\.edit": \(note\) => openEditor\(note\)/, "Edit workflow should map to the editor");
  assert.match(notesJs, /"notes\.workflow\.archive": \(note\) => archiveNote\(note\)/, "Archive workflow should map to the archive handler");
  assert.match(notesJs, /"notes\.workflow\.restore": \(note\) => restoreNote\(note\)/, "Restore workflow should map to the restore handler");
  assert.match(notesJs, /view\.renderDescriptorActionMenu\(detailActionButtons\(note\)/, "Notes detail should render the workflow actions through the framework overflow-menu helper");
  assert.match(notesJs, /button\.dataset\.noteAction = action\.id/, "Action menu buttons should carry their declarative action id");
  assert.doesNotMatch(notesJs, /function detailActionsMenu/, "The hand-built <details> actions menu should be replaced by the framework action menu");

  // 0.33.5.18.5.2 declarative linked-records panel.
  assert.match(notesModuleSource, /linkedRecords:\s*\{[\s\S]*?recordsField:\s*"links"[\s\S]*?behavior:\s*"notes\.link\.add"[\s\S]*?behavior:\s*"notes\.link\.remove"/, "Notes descriptor should declare the linked-records panel with add/remove behaviors");
  assert.match(notesModuleSource, /linkedRecords:\s*\{[\s\S]*?requiredPermissions:\s*\[NOTE_PERMISSIONS\.MANAGE_LINKS\]/, "Linked-records actions should require the manage-links permission");
  assert.match(notesJs, /view\.renderDescriptorLinkedRecordsPanel\(descriptor/, "Notes linked-records panel should render through the framework helper");
  assert.match(notesJs, /function linkRecordNodes\(note\)/, "Notes should build linked-record rows via linkRecordNodes");
  assert.match(notesJs, /notesLinkedRecordsDescriptor\(\)/, "Notes should resolve the delivered linked-records descriptor");
  assert.match(notesJs, /api\.postJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/links`/, "Notes should keep the link-add service route");
  assert.match(notesJs, /\/links\/\$\{encodeURIComponent\(noteLinkId\)\}\/remove`/, "Notes should keep the link-remove service route");
  assert.doesNotMatch(notesJs, /const section = document\.createElement\("section"\);\s*const list = document\.createElement\("div"\);\s*const form = document\.createElement\("form"\)/, "The linked-records panel should no longer hand-build its section/form anatomy");

  // 0.33.5.18.5.3 anatomy cleanup + strict guardrails.
  assert.match(notesJs, /view\.renderDescriptorModalForm\(modal, \{/, "Note dialogs should be built through the framework modal-form helper");
  assert.doesNotMatch(notesJs, /view\.createModalForm/, "Notes should no longer call the low-level createModalForm primitive directly");
  assert.doesNotMatch(notesJs, /document\.createElement\("(dialog|table|details)"\)/, "Notes should not hand-build dialog/table/details framework anatomy");
  assert.match(notesJs, /view\.createElement\("dl"/, "The read-only linked-context list should be built via the framework element builder");
  assert.match(notesJs, /view\.createElement\("details"/, "The collections menu and revisions panel should use the framework element builder for disclosures");

  // 0.33.5.18.5.5 add/edit modal refinement: collapsible Note Details group + Tags/Files footer buttons.
  assert.match(notesJs, /className: "notes-detail-group"/, "The note Details fields should be wrapped in a collapsible group");
  assert.match(notesJs, /detailsGroup\.open = !note/, "The Details group should default open in Add and closed in Edit");
  assert.match(notesJs, /utilityActions: \[tagsToggle, filesToggle\]/, "Tags and Files should render as footer utility actions");
  assert.match(notesJs, /dataset\.noteTagsToggle/, "Tags should be a footer toggle button");
  assert.match(notesJs, /dataset\.noteFilesToggle/, "Files should be a footer toggle button");
  assert.match(notesJs, /function toggleNoteEditorPanel/, "Footer buttons should toggle hidden tag/file panels");
  assert.match(notesJs, /function mountNoteEditorFiles/, "The editor should mount file attachments behind the Files button");
  assert.match(notesJs, /filesMount\.dataset\.noteFilesEditor/, "The editor file panel should expose a files mount hook");
  const viewBuilderJs = await fs.readFile(path.join(process.cwd(), "public/js/shared/view-builder.js"), "utf8");
  assert.match(viewBuilderJs, /surface-modal-footer-utilities[\s\S]*data-modal-footer-group": "utility"/, "The framework modal footer should support a utility action group");

  const linkedPanelJs = await fs.readFile(path.join(process.cwd(), "public/js/shared/notes-linked-panel.js"), "utf8");
  assert.match(linkedPanelJs, /LongtailForge/);
  assert.match(linkedPanelJs, /notesLinkedPanel/);
  assert.match(linkedPanelJs, /mount/);
  assert.match(linkedPanelJs, /api\/notes\/for-target/);
  assert.match(linkedPanelJs, /Create Note/);
  assert.match(linkedPanelJs, /Link Note/);
  assert.match(linkedPanelJs, /Unlink/);
  assert.match(linkedPanelJs, /readonly/);
}

async function assertNavigation(session) {
  const bootstrap = await appShellService.bootstrap(session);
  const actionsMenu = bootstrap.navigation.find((item) => item.id === "actions" && Array.isArray(item.items));
  const settingsMenu = bootstrap.navigation.find((item) => item.id === "settings" && Array.isArray(item.items));
  const workspaceSettingsMenu = settingsMenu?.items?.find((item) => item.id === "workspace-settings-group");
  const topLevelNotesLink = bootstrap.navigation.find((item) => item.href === "notes.html");
  const topLevelProjectLink = bootstrap.navigation.find((item) => item.href === "projects.html");
  const notesLink = flattenNavigation(actionsMenu?.items).find((item) => item.href === "notes.html");
  const timeKeepingMenu = actionsMenu?.items?.find((item) => item.id === "time-keeping");

  assert.ok(actionsMenu, "Actions menu should appear in authenticated navigation");
  assert.equal(topLevelNotesLink, undefined, "Notes should live under Actions instead of top-level navigation");
  assert.equal(topLevelProjectLink, undefined, "Project Settings should not duplicate the framework-owned Actions menu");
  assert.deepEqual(
    actionsMenu.items.map((item) => item.label),
    ["Time Keeping", "Tasks", "Notes", "Procurement Lists", "Files", "Project Settings", "Reporting"],
    "Actions menu should keep the requested direct item order",
  );
  assert.deepEqual(
    (timeKeepingMenu?.items || []).map((item) => item.label),
    ["Time Tracker", "Time Entries"],
    "Time Keeping should contain Time Tracker and Time Entries only",
  );
  assert.equal(actionsMenu.items.some((item) => item.href === "clients.html"), false, "Clients should stay under Settings -> Workspace");
  assert.equal(actionsMenu.items.some((item) => item.href === "time-tracker.html"), false, "Time Tracker should only appear inside Time Keeping");
  assert.equal(flattenNavigation(workspaceSettingsMenu?.items).some((item) => item.href === "files.html"), false, "Files should not appear under Settings -> Workspace");
  assert.ok(notesLink, "Notes should appear in authenticated navigation while module is enabled");
  assert.equal(notesLink.label, "Notes");
}

async function assertNoteDetailHtml(session) {
  const result = await notesService.create({
    title: "UI Markdown note",
    body_markdown: "# Safe Heading\n\nA **bold** detail body.",
    library_bucket: "reference",
  }, session);
  const readResult = await notesService.read(result.note.note_id, session);

  assert.match(readResult.note.body_html, /<h1>Safe Heading<\/h1>/);
  assert.match(readResult.note.body_html, /<strong>bold<\/strong>/);
}

async function assertDisabledModuleState(session) {
  await setNotesStatus(session.workspace_id, "disabled");

  const bootstrap = await appShellService.bootstrap(session);
  const notesLink = flattenNavigation(bootstrap.navigation).find((item) => item.href === "notes.html");
  assert.equal(notesLink, undefined, "disabled Notes module should not appear in navigation");

  const historicalRead = await staticService.read("/notes.html", session);
  assert.equal(historicalRead.statusCode, 200, "Notes view should allow historical read while disabled");

  await setNotesStatus(session.workspace_id, "enabled");
}

async function setNotesStatus(workspaceId, status) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'notes';
`);
}

function flattenNavigation(items = []) {
  return items.flatMap((item) => [
    item,
    ...(item.items ? flattenNavigation(item.items) : []),
  ]);
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
