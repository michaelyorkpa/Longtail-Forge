import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/**
 * One app-shell navigation entry, as this owner walks it.
 *
 * The bootstrap contract publishes `navigation` as an open list, which
 * `0.33.33.32.13` confirmed is deliberate: the shell carries whatever the
 * enabled modules contribute. The shape is therefore described here, where the
 * walk happens, and every payload this owner reads is proven to be a list of
 * records at the point it enters.
 * @typedef {{ href?: unknown, id?: unknown, items?: ShellNavItem[], label?: unknown, moduleId?: unknown }} ShellNavItem
 */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-app-shell-navigation-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-app-shell-navigation.db");
process.env.SUPER_ADMIN_PASSWORD = "App-Shell-Navigation-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);
  await disableFixtureModules(session.workspace_id, ["notes", "lists"]);
  const shell = await appShellService.bootstrap(session);
  const navigation = navigationItems(shell.navigation);
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
    ["Time Keeping", "Tasks", "Calendar", "Files", "Reporting"],
    "Actions menu should keep the expected direct item order",
  );

  const calendarItem = (actionsMenu.items || []).find((item) => item.href === "calendar.html");
  assert.ok(calendarItem, "Actions should contain the Tasks-contributed Calendar entry");
  assert.equal(calendarItem.moduleId, "tasks", "Calendar nav entry should stay module-aware through the Tasks contribution");

  assert.equal(
    (actionsMenu.items || []).some((item) => item.href === "projects.html"),
    false,
    "Actions should no longer contain Project Settings",
  );

  const reportingMenu = (actionsMenu.items || []).find((item) => item.id === "reporting");
  assert.ok(reportingMenu, "Actions should directly contain a Reporting slide-out");
  assert.equal(reportingMenu.label, "Reporting");
  assert.equal((submenu(reportingMenu, "Reporting") || []).length, 1, "Reporting should list only catalog-eligible report entries");
  assert.equal(submenu(reportingMenu, "Reporting")[0].label, "Project Time & Billing");
  assert.equal(submenu(reportingMenu, "Reporting")[0].href, "reporting.html?report=time-tracking%3Aproject-time-billing");
  assert.equal(submenu(reportingMenu, "Reporting")[0].moduleId, "time-tracking");

  await disableFixtureModules(session.workspace_id, ["time-tracking"]);
  const disabledShell = await appShellService.bootstrap(session);
  const disabledNavigation = navigationItems(disabledShell.navigation);
  const disabledActions = disabledNavigation.find((item) => item.id === "actions");
  const disabledSettings = disabledNavigation.find((item) => item.id === "settings");
  const disabledAdmin = (disabledSettings?.items || []).find((item) => item.id === "admin-settings-group");
  const disabledModules = submenu(disabledAdmin, "disabled Admin").find((item) => item.id === "module-settings-group");
  assert.equal(
    (disabledActions?.items || []).some((item) => item.label === "Time Keeping"),
    false,
    "Time Tracking navigation should disappear when the module is disabled",
  );
  assert.equal(
    (disabledModules?.items || []).some((item) => item.label === "Time Tracking"),
    false,
    "Admin Modules should refresh without the disabled module settings entry",
  );
  assert.equal(
    (disabledAdmin?.items || []).some((item) => item.href === "workspace-settings.html"),
    true,
    "Workspace Settings must remain available as the module recovery path",
  );
  assert.equal(
    navigationItems(disabledShell.quickActions || []).some((item) => item.id === "timer"),
    false,
    "Capture must not offer Timer when Time Tracking is disabled",
  );
  assert.equal(
    (disabledActions?.items || []).some((item) => item.id === "reporting"),
    false,
    "Reporting navigation should hide when no catalog-eligible reports remain",
  );
  assert.equal(
    navigationItems(disabledShell.quickActions || []).some((item) => item.id === "reporting"),
    false,
    "Reporting quick action should hide when no catalog-eligible reports remain",
  );

  const settingsMenu = navigation.find((item) => item.id === "settings");
  const adminMenu = (settingsMenu?.items || []).find((item) => item.id === "admin-settings-group");
  assert.ok(adminMenu, "Settings should expose the Admin drawer");
  assert.equal(adminMenu.label, "Admin");
  assert.deepEqual(
    (submenu(adminMenu, "Admin") || []).map((item) => item.label),
    ["Modules", "Projects", "Clients", "User Admin", "Role Assignments", "Workspace", "API Keys", "Audit Log"],
    "Settings -> Admin should keep the specified administrative order",
  );
  const modulesMenu = submenu(adminMenu, "Admin").find((item) => item.id === "module-settings-group");
  assert.deepEqual(
    (modulesMenu?.items || []).map((item) => item.label),
    ["Calendar", "Files", "Tags", "Tasks", "Time Tracking", "Workbench"],
    "Admin Modules should keep the specified order while Developer Example is disabled",
  );
  assert.equal(
    submenu(modulesMenu, "Modules").find((item) => item.label === "Calendar")?.href,
    "calendar-settings.html",
    "Calendar subscription administration should use its dedicated Admin Modules destination",
  );
  assert.equal(submenu(adminMenu, "Admin").find((item) => item.label === "Projects")?.href, "projects.html");
  assert.equal(submenu(adminMenu, "Admin").find((item) => item.label === "Workspace")?.href, "workspace-settings.html");
  const adminHrefs = new Set((adminMenu?.items || []).map((item) => item.href));
  assert.ok(adminHrefs.has("clients.html"), "Clients should remain under Settings -> Admin");
  assert.ok(!(actionsMenu.items || []).some((item) => item.href === "clients.html"), "Clients should not move into Actions");

  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", true, { session });
  await modulesService.setModuleStatus(session.workspace_id, "developer-example", true, { session });
  const developerShell = await appShellService.bootstrap(session);
  const developerAdmin = submenu(
    navigationItems(developerShell.navigation).find((item) => item.id === "settings"),
    "Settings",
  ).find((item) => item.id === "admin-settings-group");
  const developerModules = submenu(developerAdmin, "Developer Admin").find((item) => item.id === "module-settings-group");
  assert.deepEqual(
    submenu(developerModules, "Developer Modules").map((item) => item.label),
    ["Calendar", "Files", "Tags", "Tasks", "Time Tracking", "Workbench", "Developer Example"],
    "Developer Example should appear last only after it is explicitly enabled",
  );

  console.log("App shell navigation regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {string} workspaceId @param {string[]} moduleIds */
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

/**
 * Prove one shell navigation payload is a list of records before it is walked.
 * @param {unknown} value
 * @returns {ShellNavItem[]}
 */
function navigationItems(value) {
  assert.ok(Array.isArray(value), "the app shell should publish a navigation list");
  for (const entry of value) {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry), "each app-shell navigation entry should be a record");
  }
  return /** @type {ShellNavItem[]} */ (value);
}

/**
 * Read one menu's contributed children.
 * @param {ShellNavItem | undefined} menu
 * @param {string} label
 * @returns {ShellNavItem[]}
 */
function submenu(menu, label) {
  assert.ok(menu, `${label} menu should exist`);
  assert.ok(menu.items, `${label} menu should contribute child entries`);
  return menu.items;
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
  return workspaceSessionFixture(rows[0]);
}
