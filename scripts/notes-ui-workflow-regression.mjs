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

  assert.equal(notesModule.version, "0.33.5.10.2");
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
  assert.match(html, /data-note-body/);
  assert.match(html, /data-note-filter-tags/);
  assert.match(html, /data-note-filter-collection/);
  assert.match(html, /data-notes-collections-panel/);
  assert.match(html, /data-note-collection-library-filter/);
  assert.match(html, /data-note-collection-actions/);
  assert.match(html, /data-note-collection-dialog/);
  assert.match(html, /data-note-collection/);
  assert.match(html, /data-note-tags-editor/);
  assert.match(html, /<details class="notes-filters-panel">/);
  assert.doesNotMatch(html, /<details class="notes-filters-panel"[^>]* open/);
  assert.match(html, /<div class="notes-library-tabs" role="tablist" aria-label="Library buckets">/);
  assert.doesNotMatch(html, /data-notes-library-summary/);
  assert.match(html, /js\/shared\/icons\.js\?v=1/);
  assert.match(html, /js\/shared\/tags\.js\?v=1/);
  assert.match(html, /js\/shared\/file-attachments\.js\?v=1/);
  assert.match(html, /js\/shared\/notes-editor\.js\?v=1/);
  assert.match(html, /css\/longtail-forge\.css\?v=21/);
  assert.match(html, /Note Kind/);
  assert.match(html, /<option value="decision">Decision<\/option>/);
  assert.match(html, /<option value="procedure">Procedure<\/option>/);
  assert.match(html, /<option value="reference">Reference<\/option>/);
  assert.match(html, /<option value="idea">Idea<\/option>/);
  assert.match(html, /<option value="log">Log<\/option>/);
  const noteKindSelect = html.match(/<select data-note-type>[\s\S]*?<\/select>/)?.[0] || "";
  assert.doesNotMatch(noteKindSelect, /<option value="client">Client<\/option>/);
  assert.doesNotMatch(noteKindSelect, /<option value="project">Project<\/option>/);
  assert.doesNotMatch(noteKindSelect, /<option value="task">Task<\/option>/);
  assert.doesNotMatch(noteKindSelect, /<option value="ticket">Ticket<\/option>/);
  assert.doesNotMatch(noteKindSelect, /<option value="user">User<\/option>/);
  assert.match(html, /js\/notes\.js\?v=12/);
  assert.match(html, /data-note-context-target-type/);
  assert.match(html, /data-note-context-search/);
  assert.match(html, /data-note-context-results/);
  assert.match(html, /data-note-context-apply/);
  const linkedContextTargetSelect = html.match(/<select data-note-context-target-type>[\s\S]*?<\/select>/)?.[0] || "";
  assert.match(linkedContextTargetSelect, /<option value="workspace">Workspace<\/option>/);
  assert.doesNotMatch(linkedContextTargetSelect, /<option value="client">Client<\/option>/);
  assert.match(linkedContextTargetSelect, /<option value="project">Project<\/option>/);
  assert.doesNotMatch(html, /Client ID/);
  assert.doesNotMatch(html, /Project ID/);
  assert.doesNotMatch(html, /Task ID/);
  assert.doesNotMatch(html, /User ID/);

  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  assert.match(notesJs, /notes-collection-actions-menu/);
  assert.match(notesJs, /safeNoteErrorMessage/);
  assert.match(notesJs, /notes-locked-state/);
  assert.match(notesJs, /notes-status-badge/);
  assert.match(notesJs, /clientVisibleOption\.disabled = secureMode/);
  assert.match(notesJs, /Secure note body hidden from previews\./);
  assert.match(notesJs, /Secure notes do not allow framework file attachments yet\./);
  assert.match(notesJs, /securityInput\.disabled = Boolean\(note\)/);
  assert.match(notesJs, /collectionFilterOptions/);
  assert.match(notesJs, /hierarchicalCollectionOptions/);
  assert.match(notesJs, /notes-detail-rule/);
  assert.match(notesJs, /notes-revisions-panel/);
  assert.match(notesJs, /notes-detail-actions-menu/);
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
