import assert from "node:assert/strict";
import { appShellService } from "../src/services/app-shell.service.js";

const workspaceId = "navigation-workspace";
const userId = "navigation-user";
const session = {
  active_workspace_id: workspaceId,
  home_workspace_id: workspaceId,
  workspace_id: workspaceId,
  user_id: userId,
  username: "navigation-user",
};

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
  ["Time Keeping", "Tasks", "Files", "Project Settings", "Reporting"],
  "Actions menu should keep the expected direct item order",
);

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
