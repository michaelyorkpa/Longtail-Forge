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

  assert.equal(notesModule.version, "0.33.5.19.5");
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
  assert.match(html, /js\/shared\/view-renderer\.js\?v=12/);
  assert.match(html, /js\/shared\/icons\.js\?v=4/);
  assert.match(html, /js\/shared\/view-builder\.js\?v=11/);
  assert.match(html, /js\/notes\.js\?v=68/);
  assert.match(html, /js\/shared\/tags\.js\?v=1/);
  assert.match(html, /js\/shared\/file-attachments\.js\?v=5/);
  assert.match(html, /js\/shared\/notes-editor\.js\?v=4/);
  assert.match(html, /css\/longtail-forge\.css\?v=56/);
  // No static read chrome or dialog markup remains in the host page.
  assert.doesNotMatch(html, /data-note-filter-tags|data-notes-collections-panel|notes-filters-panel|notes-library-tabs/);
  assert.doesNotMatch(html, /data-note-dialog|data-note-collection-dialog|data-note-body|data-note-form/);
  assert.doesNotMatch(html, /data-note-context-target-type|data-note-tags-editor|data-note-editor-toolbar/);
  assert.doesNotMatch(html, /Client ID|Project ID|Task ID|User ID/);

  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const notesModuleSource = await fs.readFile(path.join(process.cwd(), "src/modules/notes/module.js"), "utf8");
  assert.match(notesJs, /createCollectionActionsDialogShell/);
  assert.match(notesJs, /notes-collection-actions-modal-body/);
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
  assert.match(notesJs, /async function openEditor\(note = null\) \{\s*note = await hydrateEditorNote\(note\);/, "Edit Note should hydrate saved notes before filling modal fields");
  assert.match(notesJs, /async function hydrateEditorNote\(note = null\)[\s\S]*api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}`[\s\S]*cache: "no-store"[\s\S]*renderDetail\(result\.note\)[\s\S]*return result\.note/, "Editor hydration should refresh the selected detail note before rendering editor state");
  assert.match(notesJs, /const selectedProjectId = note\?\.project_id \|\| "";[\s\S]*projectInput\.value = selectedProjectId;[\s\S]*projectId: selectedProjectId/, "Edit Note should not read direct project context back from a select before its option exists");
  assert.match(notesJs, /function primaryContextSummaryForSelection\(targetType, selectedId = ""\)[\s\S]*summaryIds\.includes\(selectedId\)/, "Primary Context controls should preserve the current saved value even when it is not in the first provider page");
  assert.match(notesJs, /function primaryProjectFallbackOption\(selectedProjectId = ""\)[\s\S]*primaryProjectOptionLabel/, "Saved project Primary Context should keep a readable current option fallback on first Edit open");
  assert.match(notesJs, /fetchLinkTargets/);
  assert.match(notesJs, /api\/notes\/link-targets/);
  assert.match(notesJs, /LINK_TARGET_TYPE_ORDER = \["project", "task", "note", "list", "client", "user"\]/);
  assert.match(notesJs, /availableLinkTargetTypes\(\)/);
  assert.match(notesJs, /targetType !== "client" \|\| usesBusinessScope\(\)/);
  assert.match(notesJs, /populateLinkTargetTypeSelect\(contextTargetTypeInput\)/);
  assert.doesNotMatch(notesJs, /function applyContextTarget/, "Linked Context should not mutate Primary Context controls");
  assert.match(notesJs, /openEditorForLinkedTarget/);
  assert.match(notesJs, /noteHasLink/);
  assert.doesNotMatch(notesJs, /loadLibrary/);
  assert.match(notesJs, /collectionFilterIds/);
  assert.match(notesJs, /Original/);
  // 0.33.5.18.3 declarative read shell conversion markers.
  assert.match(notesJs, /buildNotesViewShell/);
  assert.ok(
    notesJs.indexOf("let state = {") < notesJs.indexOf("buildNotesViewShell();"),
    "Notes state should initialize before the shell builds provider-backed dialog controls",
  );
  assert.match(notesJs, /view\.renderSurface/);
  assert.match(notesJs, /notesViewSurfaceDescriptor/);
  assert.match(notesModuleSource, /layout:\s*"slide-out-sidebar"/);
  assert.doesNotMatch(notesModuleSource, /layout:\s*"sidebar-detail"/);
  assert.match(notesJs, /layout:\s*"slide-out-sidebar"/);
  assert.match(notesJs, /decorateNotesDeclarativeSurface/);
  assert.match(notesJs, /view\.registerBehavior\("notes\.sidebar\.library"[\s\S]*container\.replaceChildren\(createNotesLibraryChrome\(\)\)/);
  assert.match(notesJs, /createNotesLibraryChrome/);
  assert.match(notesJs, /createNotesListChrome/);
  assert.match(notesJs, /createNotesPagination/);
  assert.match(notesJs, /surface\.querySelector\('\[data-view-sidebar-panel="notes-list"\]'\)/);
  assert.match(notesJs, /surface\.querySelector\("\.view-slideout-sidebar-main"\)/);
  assert.match(notesJs, /summaryTitle\.textContent = "Notes List"/);
  assert.match(notesJs, /indexFooter\.classList\.add\("notes-list-panel-footer"\)/);
  assert.match(notesJs, /dataSource: null/);
  assert.doesNotMatch(notesJs, /notes-library-tabs|dataset\.notesBucket/);
  assert.match(notesJs, /notes-collection-picker-row/);
  assert.match(notesJs, /\["archive", "Archive"\]/);
  assert.match(notesJs, /icon:\s*"more"/);
  assert.match(notesJs, /collectionDialogAction\("New collection"[\s\S]*role: "primary"/);
  assert.match(notesJs, /disabled: !canManageCollection/);
  assert.match(notesJs, /afterCollectionActionsDialogClosed\(\(\) => openCollectionDialog\("create", parentOptions\)\)/);
  assert.match(notesJs, /afterCollectionActionsDialogClosed\(\(\) => openCollectionDialog\("edit", \{ collection \}\)\)/);
  assert.match(notesJs, /view\.showModal\(collectionDialog, \{ parent: null \}\)/);
  assert.doesNotMatch(notesJs, /dataset\.noteCollectionCreate|notes-collection-actions-menu/);
  assert.match(notesModuleSource, /id:\s*"notes-filters"[\s\S]*open:\s*false[\s\S]*id:\s*"notes-library"[\s\S]*open:\s*true/, "Notes drawer should start with Filters collapsed and Library open");
  assert.match(notesJs, /closeNotesSlideOutDrawer/);
  assert.match(notesJs, /trigger\?\.getAttribute\("aria-expanded"\) === "true"[\s\S]*trigger\.click\(\)/, "Selecting a note should close the slide-out drawer through the framework trigger");
  assert.match(notesJs, /tagChips\(note\.tags \|\| \[\], \{ limit: 1, showOverflow: true \}\)/);
  assert.match(notesJs, /overflow\.textContent = "\.\.\."/);
  assert.doesNotMatch(notesJs, /data-notes-list-title|notes-list-excerpt/);
  assert.doesNotMatch(notesJs, /text:\s*"Collections"/);
  assert.match(notesJs, /notesCollectionsPanel/);
  // 0.33.5.18.4 declarative editor + collection modal conversion markers.
  assert.match(notesJs, /createNoteDialogShell/);
  assert.match(notesJs, /createCollectionDialogShell/);
  assert.match(
    notesJs,
    /document\.body\.append\([\s\S]*createNoteDialogShell\(\),[\s\S]*createNoteTagsDialogShell\(\),[\s\S]*createNoteFilesDialogShell\(\),[\s\S]*createCollectionDialogShell\(\),[\s\S]*createCollectionActionsDialogShell\(\),[\s\S]*\)/,
  );
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
  // Linked-context picker target options are provider-backed and hide Workspace from normal Add/Edit use.
  assert.match(notesJs, /const DEFAULT_LINK_TARGET_TYPE = "project"/);
  assert.match(notesJs, /function linkTargetProviderOptions\(\)[\s\S]*client: "client-projects"[\s\S]*list: "lists"[\s\S]*note: "notes"[\s\S]*project: "client-projects"[\s\S]*task: "tasks"[\s\S]*user: "users"/);
  assert.doesNotMatch(notesJs, /LINK_TARGET_TYPE_ORDER = \[[^\]]*"workspace"/, "Workspace should remain backend-compatible but hidden from the normal Add/Edit picker target menu");

  // 0.33.5.18.5.1 declarative workflow action strip.
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
  assert.match(notesModuleSource, /linkedRecords:\s*\{[\s\S]*title:\s*"Linked Context"[\s\S]*No linked context\./, "Notes linked-records descriptor should use Linked Context in visible copy");
  assert.doesNotMatch(notesModuleSource, /title:\s*"Linked Records"|No linked records\./, "Notes descriptor should not expose Linked Records copy");
  assert.match(notesJs, /api\.postJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/links`/, "Notes should keep the link-add service route");
  assert.match(notesJs, /\/links\/\$\{encodeURIComponent\(noteLinkId\)\}\/remove`/, "Notes should keep the link-remove service route");
  assert.doesNotMatch(notesJs, /const section = document\.createElement\("section"\);\s*const list = document\.createElement\("div"\);\s*const form = document\.createElement\("form"\)/, "The linked-records panel should no longer hand-build its section/form anatomy");

  // 0.33.5.18.5.3 anatomy cleanup + strict guardrails.
  assert.match(notesJs, /view\.renderDescriptorModalForm\(modal, \{/, "Note dialogs should be built through the framework modal-form helper");
  assert.doesNotMatch(notesJs, /view\.createModalForm/, "Notes should no longer call the low-level createModalForm primitive directly");
  assert.doesNotMatch(notesJs, /document\.createElement\("(dialog|table|details)"\)/, "Notes should not hand-build dialog/table/details framework anatomy");
  assert.match(notesJs, /view\.createElement\("details"/, "The collections menu and revisions panel should use the framework element builder for disclosures");

  // 0.33.5.18.5.5 add/edit modal refinement, updated by 0.33.5.18.6.7.3 stacked utility modals.
  assert.match(notesJs, /className: "notes-detail-group surface-modal-group"/, "The note Details fields should be wrapped in a shared modal group");
  assert.match(notesJs, /className: "surface-modal-heading"/, "The note dialog title row should use the shared modal heading class");
  assert.match(notesJs, /className: "surface-modal-section-heading", text: "Note Details"/, "The note Details heading should use the shared modal section heading class");
  assert.match(notesJs, /className: "surface-modal-section-heading", text: "Linked Context"/, "The Linked Context heading should use the shared modal section heading class");
  assert.doesNotMatch(notesJs, /notes-dialog-heading/, "Notes should not keep a note-only modal heading row class");
  assert.match(notesJs, /detailsGroup\.open = !note/, "The Details group should default open in Add and closed in Edit");
  assert.match(notesJs, /utilityActions: \[tagsToggle, filesToggle, copyLink\]/, "Tags, Files, and Copy Link should render as footer utility actions");
  assert.match(notesJs, /dataset\.noteTagsToggle/, "Tags should be a footer toggle button");
  assert.match(notesJs, /dataset\.noteFilesToggle/, "Files should be a footer toggle button");
  assert.match(notesJs, /dataset\.copyNoteLink/, "Copy Link should be a footer utility button");
  assert.match(notesJs, /function createNoteTagsDialogShell/, "Tags should open in a stacked dialog");
  assert.match(notesJs, /function openTagsDialog\(\)[\s\S]*view\.showModal\(tagsDialog, \{ parent: dialog, trigger: tagsToggle \}\)/, "Tags should open through the shared modal stack helper above the editor");
  assert.doesNotMatch(notesJs, /tagPanel|noteTagsPanel|toggleNoteEditorPanel\("tags"\)/, "Tags should no longer render as a hidden inline editor panel");
  assert.match(notesJs, /function createNoteFilesDialogShell/, "Files should open in a stacked dialog");
  assert.match(notesJs, /function openFilesDialog\(\)[\s\S]*view\.showModal\(filesDialog, \{ parent: dialog, trigger: filesToggle \}\)/, "Files should open through the shared modal stack helper above the editor");
  assert.doesNotMatch(notesJs, /noteFilesPanel|toggleNoteEditorPanel\("files"\)|function toggleNoteEditorPanel/, "Files should no longer render as a hidden inline editor panel");
  assert.match(notesJs, /function mountNoteEditorFiles/, "The editor should mount file attachments behind the Files button");
  assert.match(notesJs, /filesMount\.dataset\.noteFilesEditor/, "The editor files dialog should expose a files mount hook");
  const viewBuilderJs = await fs.readFile(path.join(process.cwd(), "public/js/shared/view-builder.js"), "utf8");
  assert.match(viewBuilderJs, /surface-modal-footer-utilities[\s\S]*data-modal-footer-group": "utility"/, "The framework modal footer should support a utility action group");

  // 0.33.5.18.5.7 detail metadata + collapsible panels.
  assert.match(notesJs, /\["Owner", note\.owner_display_name \|\| "Unavailable owner"\]/, "Owner should render the display name or a safe fallback in the meta row");
  assert.match(notesJs, /\["Created", formatDate\(note\.created_at\)\]/, "Created should move into the detail meta row");
  assert.match(notesJs, /\["Updated", formatDate\(note\.updated_at\)\]/, "Updated should move into the detail meta row");
  assert.doesNotMatch(notesJs, /view\.createElement\("dl"|notes-context-list/, "The duplicated linked-context dl should be removed from the detail");
  assert.match(notesJs, /collapsible: true,\s*open: false/, "Linked Context should render collapsed by default");
  assert.match(notesJs, /icon: "add",\s*iconOnly: true,\s*label: addAction\.label/, "Add Link should be an icon button");
  assert.match(notesJs, /icon: "delete", iconOnly: true, label: "Remove"/, "Remove link should be an icon button");
  assert.match(notesJs, /className: "notes-detail-section notes-files-panel", children: \[summary, mount\]/, "The Files panel should be a collapsible box matching Linked Records/Revisions (notes-detail-section)");
  const notesCss = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");
  assert.match(notesCss, /\.notes-files-panel \.file-attachments\s*\{[\s\S]*border:\s*0;/, "The embedded file-attachments component should drop its own box inside the Files panel (single outer box)");
  assert.match(notesCss, /\.notes-files-panel \.file-attachments-header h3\s*\{[\s\S]*display:\s*none;/, "The embedded file-attachments heading should be hidden (the panel summary already labels it)");
  assert.match(notesCss, /\[data-note-links-panel\] \+ \.notes-files-panel,\s*\.notes-files-panel \+ \.notes-revisions-panel\s*\{[\s\S]*margin-top:\s*0;/, "Adjacent note detail utility panels should not add extra vertical spacing");
  const notesServiceJs = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8");
  assert.match(notesServiceJs, /owner_display_name: await resolveNoteOwnerLabel\(session, note\)/, "The note read payload should resolve the owner display name");

  // 0.33.5.18.6.4.1 Add/Edit Linked Context visual model with non-removable Primary Context row.
  assert.match(notesJs, /picker\.viewParts\.rows\.dataset\.noteContextList = ""/, "The Add/Edit Linked Context panel should expose a rendered context-list mount");
  assert.match(notesJs, /function renderEditorContextPanel\(\)/, "The Add/Edit Linked Context panel should have an editor render pass");
  assert.match(notesJs, /function editorPrimaryContextItem\(\)[\s\S]*displayLabel: "Primary Context"[\s\S]*hintLabel: "Edit in Note Details"/, "The editor panel should render a labeled Primary Context row with the Note Details hint");
  assert.match(notesJs, /No primary context selected\./, "The Primary Context row should have the required empty-state copy");
  assert.match(notesJs, /function linkRecordNodes\(note\)[\s\S]*notePrimaryContextItem\(note\)[\s\S]*linkItem\(note, link\)/, "The View Note Linked Context panel should render Primary Context before flexible Linked Context rows");
  assert.match(notesJs, /function notePrimaryContextItem\(note = \{\}\)[\s\S]*text: "Primary Context"[\s\S]*className: "notes-link-item notes-primary-context-row"/, "The View Note Primary Context card should be labeled and non-removable");
  assert.match(notesJs, /function editorLinkedContextRows\(\)[\s\S]*note\.links[\s\S]*state\.editorStagedTargets/, "The editor panel should render saved links and staged draft targets");
  assert.match(notesJs, /view\.createLinkedContextPicker\(\{[\s\S]*onRemove: handleEditorLinkedContextRemove/, "Add/Edit Linked Context rows should use the shared picker shell");
  assert.match(notesJs, /function handleEditorLinkedContextRemove\(item = \{\}\)[\s\S]*removeEditorNoteLink[\s\S]*removeEditorStagedTarget/, "Linked Context editor rows should remove saved and staged links through the shared picker callback");
  const primaryContextItemSource = notesJs.slice(
    notesJs.indexOf("function editorPrimaryContextItem()"),
    notesJs.indexOf("function editorPrimaryContextSummary()"),
  );
  assert.doesNotMatch(primaryContextItemSource, /noteLinkRemove|removable:\s*true|Remove/, "The Primary Context editor row must not expose a remove action");
  assert.match(notesCss, /\.view-linked-context-picker-list\s*\{[\s\S]*gap:\s*8px;/, "The shared picker row list should keep selected Linked Context rows separated from picker controls");
  assert.match(notesCss, /\.notes-primary-context-row\s*\{[\s\S]*background:\s*var\(--color-surface-muted\);/, "The Primary Context row should be visually distinct from removable Linked Context rows");

  // 0.33.5.18.6.4.2 saved-note Linked Context add/remove refresh.
  assert.match(notesJs, /async function applyEditorLinkTarget\(\)[\s\S]*if \(state\.editingNoteId\) \{\s*await addEditorNoteLink\(target\);\s*return;\s*\}/, "Saved-note Use Target should add Linked Context immediately instead of waiting for Save");
  assert.doesNotMatch(notesJs, /state\.editingNoteId && state\.editorSelectedTarget && !noteHasLink/, "Saved-note link creation should no longer be deferred until Save Note");
  assert.match(notesJs, /async function addEditorNoteLink\(target = \{\}\)[\s\S]*api\.postJson\(`\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}\/links`, linkPayloadFromTarget\(target\)\)[\s\S]*await refreshEditorNote\(noteId\)/, "Saved-note add should persist through the link API and refresh the editor note");
  assert.match(notesJs, /async function removeEditorNoteLink\(note, link\)[\s\S]*\/links\/\$\{encodeURIComponent\(noteLinkId\)\}\/remove`[\s\S]*await refreshEditorNote\(noteId\)/, "Saved-note remove should persist through the link API and refresh the editor note");
  assert.match(notesJs, /async function refreshEditorNote\(noteId\)[\s\S]*api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}`[\s\S]*state\.editorNote = result\.note[\s\S]*renderDetail\(result\.note\)[\s\S]*renderEditorContextSelection\(\)/, "Editor link mutations should refresh the Add/Edit rows, underlying detail, and readable labels");

  // 0.33.5.18.6.4.3 unsaved-note staged Linked Context.
  assert.match(notesJs, /editorStagedTargets: \[\]/, "The note editor should track unsaved Linked Context in draft state");
  assert.match(notesJs, /state\.editorStagedTargets = \[\]/, "Opening\/closing the editor should reset staged draft links");
  assert.match(notesJs, /links: !state\.editingNoteId \? stagedLinkPayloads\(\) : \[\]/, "New notes should save staged Linked Context through the create payload");
  assert.doesNotMatch(notesJs, /readEditorPrimaryContextPayload|inferPrimaryContextFromEditorTargets|primaryContextFromTarget|taskLinkPrimaryContext/, "Linked Context should remain read-only for Primary Context");
  assert.match(notesJs, /function stagedLinkPayloads\(\)[\s\S]*state\.editorStagedTargets[\s\S]*linkPayloadFromTarget\(target\)/, "Staged targets should be converted to link payloads on save");
  assert.match(notesJs, /async function applyEditorLinkTarget\(\)[\s\S]*if \(state\.editingNoteId\)[\s\S]*stageEditorLinkTarget\(target\);/, "Unsaved Use Target should stage Linked Context without writing Primary Context");
  assert.match(notesJs, /function stageEditorLinkTarget\(target = \{\}\)[\s\S]*state\.editorStagedTargets = \[\.\.\.\(state\.editorStagedTargets \|\| \[\]\), target\]/, "Use Target should add unsaved Linked Context to local draft state");
  assert.match(notesJs, /function editorLinkedContextRows\(\)[\s\S]*for \(const target of state\.editorStagedTargets \|\| \[\]\)[\s\S]*editorStagedTargetItem\(target\)/, "Staged draft links should render as Linked Context rows");
  assert.match(notesJs, /function editorStagedTargetItem\(target = \{\}\)[\s\S]*\.\.\.pickerRecordFromTarget\(target\)[\s\S]*target,/, "Staged draft rows should use provider labels and remain removable before save through the shared picker item callback");
  const removeStagedSource = notesJs.slice(
    notesJs.indexOf("function removeEditorStagedTarget(target = {})"),
    notesJs.indexOf("function renderEditorContextSelection(target = null)"),
  );
  assert.match(removeStagedSource, /state\.editorStagedTargets = \(state\.editorStagedTargets \|\| \[\]\)[\s\S]*\.filter\(\(stagedTarget\) => !editorLinkTargetMatches\(stagedTarget, target\)\)/, "Removing a staged link should remove it from draft state");
  assert.doesNotMatch(removeStagedSource, /(clientInput|projectInput|taskInput|userInput)\.value\s*=/, "Removing a staged link must not clear Primary Context controls");

  // 0.33.5.18.6.4.4 Notes List footer sorting.
  assert.match(notesJs, /const DEFAULT_NOTE_SORT = "updated_desc"/, "Notes List default sort should be updated newest first");
  assert.match(notesJs, /const NOTES_LIST_SORT_OPTIONS = \[[\s\S]*\["title_asc", "Alphabetical \(A-Z\)"\][\s\S]*\["title_desc", "Alphabetical \(Z-A\)"\][\s\S]*\["created_desc", "Date Created \(Newest First\)"\][\s\S]*\["created_asc", "Date Created \(Oldest First\)"\][\s\S]*\["updated_desc", "Date Updated \(Newest First\)", true\][\s\S]*\["updated_asc", "Date Updated \(Oldest First\)"\][\s\S]*\["library_collection_updated_desc", "Library \/ Collection, then Date Updated"\][\s\S]*\["note_kind_updated_desc", "Note Kind, then Date Updated"\][\s\S]*\["primary_context_updated_desc", "Primary Context, then Date Updated"\]/, "Notes List sort options should match the required labels and default");
  assert.match(notesJs, /view\.registerBehavior\("notes\.sidebar\.notes-list-footer"[\s\S]*container\.replaceChildren\(createNotesListSortControl\(\), createNotesPagination\(\)\)/, "Notes List sort should live in the footer before pagination");
  assert.match(notesJs, /function createNotesListSortControl\(\)[\s\S]*className: "notes-list-sort"[\s\S]*select\.dataset\.noteSort = ""[\s\S]*select\.value = DEFAULT_NOTE_SORT/, "Notes List footer should render the sort dropdown");
  assert.match(notesJs, /sortSelect\?\.addEventListener\("change", \(\) => \{\s*state\.page = 1;\s*renderNotes\(\);\s*\}\)/, "Changing Notes List sort should reset to page 1 and rerender");
  assert.doesNotMatch(notesJs, /notesDescriptorSelect\("sort"/, "Sort should no longer be a Filters field in the browser fallback descriptor");
  assert.doesNotMatch(notesModuleSource, /field:\s*"sort"/, "Sort should no longer be a Filters field in the Notes module descriptor");
  const sortedNotesSource = notesJs.slice(
    notesJs.indexOf("function sortedNotes(notes)"),
    notesJs.indexOf("function noteListItem(note)"),
  );
  assert.match(sortedNotesSource, /const sortValue = sortSelect\?\.value \|\| DEFAULT_NOTE_SORT/, "Notes List sort should use the footer default when no control is available");
  assert.match(sortedNotesSource, /sortValue === "title_asc"[\s\S]*compareText\(left\.title, right\.title\) \|\| compareNoteId\(left, right\)/, "Alphabetical A-Z should sort visible notes by title with a stable tie-break");
  assert.match(sortedNotesSource, /sortValue === "title_desc"[\s\S]*compareText\(right\.title, left\.title\) \|\| compareNoteId\(left, right\)/, "Alphabetical Z-A should sort visible notes by title with a stable tie-break");
  assert.match(sortedNotesSource, /sortValue === "created_desc"[\s\S]*compareText\(right\.created_at, left\.created_at\) \|\| compareNoteTitleThenId\(left, right\)/, "Created newest first should sort visible notes by created_at with stable tie-breaks");
  assert.match(sortedNotesSource, /sortValue === "created_asc"[\s\S]*compareText\(left\.created_at, right\.created_at\) \|\| compareNoteTitleThenId\(left, right\)/, "Created oldest first should sort visible notes by created_at with stable tie-breaks");
  assert.match(sortedNotesSource, /sortValue === "updated_asc"[\s\S]*compareText\(left\.updated_at, right\.updated_at\) \|\| compareNoteTitleThenId\(left, right\)/, "Updated oldest first should sort visible notes by updated_at with stable tie-breaks");
  assert.match(sortedNotesSource, /sortValue === "library_collection_updated_desc"[\s\S]*bucketSortValue\(left\.library_bucket\)[\s\S]*collectionLabel\(left\.note_collection_id\)[\s\S]*compareNoteUpdatedDesc\(left, right\)/, "Library\/Collection should sort visible notes by bucket, collection, then updated newest first");
  assert.match(sortedNotesSource, /sortValue === "note_kind_updated_desc"[\s\S]*noteKindLabel\(left\.note_type\)[\s\S]*compareNoteUpdatedDesc\(left, right\)/, "Note Kind should sort visible notes by kind, then updated newest first");
  assert.match(sortedNotesSource, /sortValue === "primary_context_updated_desc"[\s\S]*primaryContextSortKey\(left\)[\s\S]*compareNoteUpdatedDesc\(left, right\)/, "Primary Context should sort visible notes by context, then updated newest first");
  assert.match(sortedNotesSource, /return compareNoteUpdatedDesc\(left, right\)/, "Updated newest first should remain the default visible-note order");
  assert.match(notesJs, /function compareNoteUpdatedDesc\(left = \{\}, right = \{\}\)[\s\S]*compareText\(right\.updated_at, left\.updated_at\) \|\| compareNoteTitleThenId\(left, right\)/, "Updated newest-first helper should use stable tie-breaks");
  assert.match(notesJs, /function primaryContextSortKey\(note = \{\}\)[\s\S]*context\.client\?\.label[\s\S]*context\.project\?\.label[\s\S]*\|\| "zz"/, "Primary Context sort should prefer readable linked-context labels with an empty-context fallback");
  assert.match(notesJs, /function renderNotes\(\)[\s\S]*const notes = sortedNotes\(filteredNotes\(\)\)/, "Sorting should apply only after Library\/Collection\/filter\/search scoping");
  assert.match(notesCss, /\.notes-list-panel-footer\s*\{[\s\S]*justify-content:\s*space-between;/, "Notes List footer should keep sort left and pagination right");
  assert.match(notesCss, /\.notes-list-panel-footer \.view-sidebar-panel-footer-region\s*\{[\s\S]*justify-content:\s*space-between;/, "Notes List footer mount region should keep sort left and pagination right");
  assert.match(notesCss, /\.notes-list-sort select\s*\{[\s\S]*min-width:\s*220px;/, "Notes List sort dropdown should have a stable footer width");

  // 0.33.5.18.6.6.4 Notes adoption of provider-owned Linked Context labels.
  assert.match(notesJs, /picker\.dataset\.noteContextPicker = ""/, "The Add/Edit Note dialog should mount the shared Linked Context picker shell");
  assert.match(notesJs, /picker\.viewParts\.targetSelect\.dataset\.noteContextTargetType = ""/, "The shared picker target select should keep the existing Notes behavior hook");
  assert.match(notesJs, /picker\.viewParts\.searchInput\.dataset\.noteContextSearch = ""/, "The shared picker search input should keep the existing Notes behavior hook");
  assert.match(notesJs, /picker\.viewParts\.recordSelect\.dataset\.noteContextResults = ""/, "The shared picker record select should keep the existing Notes behavior hook");
  assert.match(notesJs, /picker\.viewParts\.useTargetButton\.dataset\.noteContextApply = ""/, "The shared picker Use Target action should keep the existing Notes behavior hook");
  assert.match(notesJs, /function replaceLinkTargetOptions\(records = \[\], select = contextResultsInput\)[\s\S]*select === contextResultsInput[\s\S]*parts\.setRecords\(records\)/, "Notes should update Add/Edit record options through the shared picker update hook");
  assert.match(notesJs, /function populateLinkTargetSelect\(select, targets = \[\]\)[\s\S]*replaceLinkTargetOptions\(records, select\)/, "Detail-page and Add/Edit Linked Context pickers should populate the select they were given");
  assert.match(notesJs, /function replaceLinkTargetOptions\(records = \[\], select = contextResultsInput\)[\s\S]*select\?\.replaceChildren\(\.\.\.options\)/, "Plain descriptor-linked select controls should not be routed through the Add/Edit shared picker mount");
  assert.match(notesJs, /function pickerRecordFromTarget\(target = \{\}\)[\s\S]*displayLabel: targetPickerDisplayLabel\(target\)[\s\S]*secondaryLabel: targetPickerSecondaryLabel\(target\)/, "Notes should normalize provider targets into shared picker records");
  assert.match(notesJs, /function targetPickerDisplayLabel\(target = \{\}\)[\s\S]*const providerLabel = providerDisplayLabel\(target\.displayLabel, target\.display_label\)[\s\S]*return providerLabel;/, "Business project target labels should render provider-owned labels directly");
  assert.doesNotMatch(notesJs, /return contextName \? `\$\{label\} \(\$\{contextName\}\)` : label;/, "Business project target labels should no longer be reconstructed with browser-owned parentheses");
  assert.match(notesJs, /function targetPickerSecondaryLabel\(target = \{\}\)[\s\S]*if \(!usesBusinessScope\(\)\) \{\s*return "";/, "Personal and Family workspaces should not show client labels in project/task picker strings");
  assert.match(notesJs, /async function applyTaskCreatedPrimaryContext\(target = \{\}, matchedTarget = \{\}\)[\s\S]*targetType !== "task"[\s\S]*loadPrimaryContextOptions\(\{ clientId, projectId \}\)[\s\S]*renderEditorContextPanel\(\)/, "Task-created notes should explicitly prefill Primary Context without making the shared Linked Context picker a writer");
  assert.match(notesJs, /function setTaskCreatedPrimaryContextSummaries\(target = \{\}\)[\s\S]*clientName[\s\S]*projectName[\s\S]*workspaceName/, "Task-created Primary Context fallback labels should come from task target metadata");
  assert.doesNotMatch(notesJs, /notes-picker-grid/, "The Add/Edit Note dialog should no longer render the old Notes-owned picker grid");
  assert.match(notesCss, /\.view-linked-context-picker-row-hint\s*\{[\s\S]*color:\s*var\(--color-muted\);/, "The shared picker should style Primary Context hint copy through shared row anatomy");
  assert.match(notesServiceJs, /const LINK_TARGET_TYPES = new Set\(\["workspace", "client", "project", "task", "note", "list", "user"\]\)/, "Notes service should keep backend support for Workspace while adding Note/List link targets");
  assert.match(notesServiceJs, /if \(targetType === "note"\)[\s\S]*notesRepository\.list[\s\S]*noteSourceUrl\(note\.note_id\)/, "Notes should provide permission-safe Note link targets");
  assert.match(notesServiceJs, /if \(targetType === "list"\)[\s\S]*listsRepository\.list[\s\S]*canAccessListTarget[\s\S]*lists\.html\?list/, "Notes should provide permission-safe List link targets");
  assert.match(notesServiceJs, /if \(normalizedTarget\.target_type === "note"\)[\s\S]*canAccessNoteTarget/, "Notes should validate linked Note target access");
  assert.match(notesServiceJs, /if \(normalizedTarget\.target_type === "list"\)[\s\S]*canAccessListTarget/, "Notes should validate linked List target access");

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
