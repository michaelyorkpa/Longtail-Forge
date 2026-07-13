import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-app-shell-navigation-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-app-shell-navigation.db");
process.env.SUPER_ADMIN_PASSWORD = "App-Shell-Navigation-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { appShellService } = await import("../src/services/app-shell.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  await disableFixtureModules(session.workspace_id, ["notes", "lists"]);
  const shell = await appShellService.bootstrap(session);
  const navigation = shell.navigation || [];
  const actionsMenu = navigation.find((item) => item.id === "actions");
  const topLevelLabels = navigation.map((item) => item.label);

  assert.ok(actionsMenu, "top-level Actions menu should exist");
  assert.equal(actionsMenu.label, "Actions");
  assert.ok(!navigation.some((item) => item.id === "projects" && item.label === "Projects"), "Projects should not be a top-level menu");
  assert.ok(!navigation.some((item) => item.id === "reporting"), "Reporting should not be a top-level menu");
  assert.ok(!topLevelLabels.includes("Projects"), "Projects should not appear as a top-level label");
  assert.ok(!topLevelLabels.includes("Reporting"), "Reporting should not appear as a top-level label");
  assert.ok(!(actionsMenu.items || []).some((item) => item.id === "projects"), "Actions should not contain a Projects submenu");

  const actionLabels = (actionsMenu.items || []).map((item) => item.label);
  assert.deepEqual(
    actionLabels,
    ["Time Keeping", "Tasks", "Calendar", "Files", "Project Settings", "Reporting"],
    "Actions menu should keep the expected direct item order",
  );

  const calendarItem = (actionsMenu.items || []).find((item) => item.href === "calendar.html");
  assert.ok(calendarItem, "Actions should contain the Tasks-contributed Calendar entry");
  assert.equal(calendarItem.moduleId, "tasks", "Calendar nav entry should stay module-aware through the Tasks contribution");

  const projectSettings = (actionsMenu.items || []).find((item) => item.id === "projects-settings");
  assert.ok(projectSettings, "Actions should directly contain Project Settings");
  assert.equal(projectSettings.href, "projects.html");

  const reportingMenu = (actionsMenu.items || []).find((item) => item.id === "reporting");
  assert.ok(reportingMenu, "Actions should directly contain a Reporting slide-out");
  assert.equal(reportingMenu.label, "Reporting");
  assert.equal((reportingMenu.items || []).length, 1, "Reporting slide-out should keep one entry for now");
  assert.equal(reportingMenu.items[0].href, "reporting.html");

  const settingsMenu = navigation.find((item) => item.id === "settings");
  const workspaceMenu = (settingsMenu?.items || []).find((item) => item.id === "workspace-settings-group");
  const workspaceHrefs = new Set((workspaceMenu?.items || []).map((item) => item.href));
  assert.ok(workspaceHrefs.has("clients.html"), "Clients should remain under Settings -> Workspace");
  assert.ok(!(actionsMenu.items || []).some((item) => item.href === "clients.html"), "Clients should not move into Actions");

  console.log("App shell navigation regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function disableFixtureModules(workspaceId, moduleIds) {
  const now = new Date().toISOString();
  const quotedModuleIds = moduleIds.map(sqlText).join(", ");

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    enabled_at = NULL,
    disabled_at = ${sqlText(now)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id IN (${quotedModuleIds});
`);
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
INNER JOIN workspaces
  ON workspaces.workspace_id = users.home_workspace_id
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    active_workspace_id: rows[0].workspace_id,
    display_name: rows[0].display_name,
    home_workspace_id: rows[0].workspace_id,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}
