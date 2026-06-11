import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-ui-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-ui.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Ui-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { staticService } = await import("../src/services/static.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertManifest();
  await assertProtectedView(session);
  await assertNavigation(session);
  await assertWorkspaceAwareLabels(session);
  await assertDisabledModuleState(session);
  await assertIntegrity();

  console.log("Lists UI workflow regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifest() {
  const listsModule = modulesService.getModule("lists");

  assert.equal(listsModule.version, "0.33.4.4");
  assert.ok(listsModule.navigation.some((item) => item.href === "lists.html" && item.parent === "projects.html"));
  assert.ok(listsModule.protectedViews.some((view) => view.file === "lists.html" && view.allowDisabledRead === true));
  assert.ok(listsModule.browserAssets.some((asset) => asset.path === "/js/lists.js"));
}

async function assertProtectedView(session) {
  const result = await staticService.read("/lists.html", session);
  const html = result.contents.toString("utf8");
  const listsJs = await fs.readFile(path.join(process.cwd(), "public/js/lists.js"), "utf8");
  const styles = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");

  assert.equal(result.statusCode, 200);
  assert.match(html, /data-lists-title/);
  assert.match(html, /data-list-create/);
  assert.match(html, /data-list-filter-status/);
  assert.match(html, /data-list-filter-reusable/);
  assert.match(html, /data-list-filter-assignee/);
  assert.match(html, /data-list-filter-needed/);
  assert.match(html, /data-list-filter-archive/);
  assert.match(html, /data-list-detail/);
  assert.match(html, /data-list-dialog/);
  assert.match(html, /data-list-business-control/);
  assert.match(html, /js\/shared\/icons\.js\?v=1/);
  assert.match(html, /js\/shared\/client-project-options\.js\?v=1/);
  assert.match(html, /js\/lists\.js\?v=1/);
  assert.match(html, /css\/longtail-forge\.css\?v=19/);

  assert.match(listsJs, /\/api\/lists\?includeDeleted=true/);
  assert.match(listsJs, /\/api\/client-projects/);
  assert.match(listsJs, /\/api\/users/);
  assert.match(listsJs, /complete-list/);
  assert.match(listsJs, /reopen-list/);
  assert.match(listsJs, /archive-list/);
  assert.match(listsJs, /restore-list/);
  assert.match(listsJs, /delete-list/);
  assert.match(listsJs, /check-item/);
  assert.match(listsJs, /uncheck-item/);
  assert.match(listsJs, /complete-item/);
  assert.match(listsJs, /move-item-up/);
  assert.match(listsJs, /move-item-down/);
  assert.match(listsJs, /setBusinessControlsVisible\(usesBusinessScope\(\)\)/);

  assert.match(styles, /\.lists-workspace/);
  assert.match(styles, /\.lists-item-form/);
  assert.match(styles, /\.lists-status-badge\.is-active/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.lists-workspace/);
}

async function assertNavigation(session) {
  const bootstrap = await appShellService.bootstrap(session);
  const projectsMenu = bootstrap.navigation.find((item) => item.id === "projects" && Array.isArray(item.items));
  const listsLink = flattenNavigation(projectsMenu?.items).find((item) => item.href === "lists.html");

  assert.ok(listsLink, "Lists should appear in authenticated navigation while enabled");
  assert.equal(listsLink.label, "Procurement Lists");
  assert.deepEqual(
    projectsMenu.items.map((item) => item.label),
    ["Time Keeping", "Tasks", "Notes", "Procurement Lists", "Files", "Project Settings"],
  );
}

async function assertWorkspaceAwareLabels(session) {
  await runSql(`
UPDATE workspaces
SET workspace_type = 'family'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);

  const bootstrap = await appShellService.bootstrap(session);
  const listsLink = flattenNavigation(bootstrap.navigation).find((item) => item.href === "lists.html");
  assert.equal(listsLink?.label, "Shopping Lists");

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);
}

async function assertDisabledModuleState(session) {
  await setListsStatus(session.workspace_id, "disabled");

  const bootstrap = await appShellService.bootstrap(session);
  const listsLink = flattenNavigation(bootstrap.navigation).find((item) => item.href === "lists.html");
  assert.equal(listsLink, undefined, "disabled Lists module should not appear in navigation");

  const historicalRead = await staticService.read("/lists.html", session);
  assert.equal(historicalRead.statusCode, 200, "Lists view should allow historical read while disabled");

  await setListsStatus(session.workspace_id, "enabled");
}

async function setListsStatus(workspaceId, status) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'lists';
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
