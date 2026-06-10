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

  assert.equal(notesModule.version, "0.33.1.4");
  assert.ok(notesModule.navigation.some((item) => item.href === "notes.html" && item.parent === "projects.html"));
  assert.ok(notesModule.protectedViews.some((view) => view.file === "notes.html" && view.allowDisabledRead === true));
  assert.ok(notesModule.browserAssets.some((asset) => asset.path === "/js/notes.js"));
  assert.ok(notesModule.browserAssets.some((asset) => asset.path === "/js/shared/notes-editor.js"));
  assert.ok(notesModule.taggableTypes.some((type) => type.targetType === "note"));
  assert.ok(notesModule.attachableTypes.some((type) => type.targetType === "note"));
}

async function assertProtectedView(session) {
  const result = await staticService.read("/notes.html", session);
  const html = result.contents.toString("utf8");

  assert.equal(result.statusCode, 200);
  assert.match(html, /data-notes-library-summary/);
  assert.match(html, /data-note-body/);
  assert.match(html, /data-note-filter-tags/);
  assert.match(html, /data-note-tags-editor/);
  assert.match(html, /js\/shared\/icons\.js\?v=1/);
  assert.match(html, /js\/shared\/tags\.js\?v=1/);
  assert.match(html, /js\/shared\/file-attachments\.js\?v=1/);
  assert.match(html, /js\/shared\/notes-editor\.js\?v=1/);
  assert.match(html, /js\/notes\.js\?v=2/);
}

async function assertNavigation(session) {
  const bootstrap = await appShellService.bootstrap(session);
  const projectsMenu = bootstrap.navigation.find((item) => item.id === "projects" && Array.isArray(item.items));
  const settingsMenu = bootstrap.navigation.find((item) => item.id === "settings" && Array.isArray(item.items));
  const workspaceSettingsMenu = settingsMenu?.items?.find((item) => item.id === "workspace-settings-group");
  const topLevelNotesLink = bootstrap.navigation.find((item) => item.href === "notes.html");
  const topLevelProjectLink = bootstrap.navigation.find((item) => item.href === "projects.html");
  const notesLink = flattenNavigation(projectsMenu?.items).find((item) => item.href === "notes.html");
  const timeKeepingMenu = projectsMenu?.items?.find((item) => item.id === "time-keeping");

  assert.ok(projectsMenu, "Projects menu should appear in authenticated navigation");
  assert.equal(topLevelNotesLink, undefined, "Notes should live under Projects instead of top-level navigation");
  assert.equal(topLevelProjectLink, undefined, "Projects page should not duplicate the framework-owned Projects menu");
  assert.deepEqual(
    projectsMenu.items.map((item) => item.label),
    ["Time Keeping", "Tasks", "Notes", "Files", "Project Settings"],
    "Projects menu should keep the requested direct item order",
  );
  assert.deepEqual(
    (timeKeepingMenu?.items || []).map((item) => item.label),
    ["Time Tracker", "Time Entries"],
    "Time Keeping should contain Time Tracker and Time Entries only",
  );
  assert.equal(projectsMenu.items.some((item) => item.href === "clients.html"), false, "Clients should stay under Settings -> Workspace");
  assert.equal(projectsMenu.items.some((item) => item.href === "time-tracker.html"), false, "Time Tracker should only appear inside Time Keeping");
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
