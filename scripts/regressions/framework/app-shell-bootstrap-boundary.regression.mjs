export const regressionMeta = Object.freeze({
  id: "framework.app-shell-bootstrap-boundary",
  area: "framework",
  tier: "release-gate",
  tags: ["app-shell", "bootstrap", "browser", "contracts", "navigation", "typecheck"],
  description: "Proves the checked app-shell producer and unknown-input browser adapter preserve safe defaults, nested fallbacks, and pre-navigation load order.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const [
  adapterSource,
  navigationSource,
  serviceSource,
  staticServiceSource,
] = await Promise.all([
  fs.readFile("public/js/shared/app-shell-bootstrap.js", "utf8"),
  fs.readFile("public/js/navigation.js", "utf8"),
  fs.readFile("src/services/app-shell.service.js", "utf8"),
  fs.readFile("src/services/static.service.js", "utf8"),
]);

assert.deepEqual(strictCleanOwnerState("src/services/app-shell.service.js"), { owned: true, diagnostics: 0 }, "the producing service must stay strict-clean in its checked program");
assert.match(
  serviceSource,
  /@returns \{Promise<AppShellBootstrap>\}[\s\S]*async function bootstrap/,
  "the producing service must stay typed against the shared envelope",
);
assert.doesNotMatch(
  navigationSource,
  /^\/\/ @ts-check\r?\n/,
  "the large navigation runtime must remain outside whole-file checking",
);
assert.match(
  navigationSource,
  /const bootstrapAdapter = window\.LongtailForge\.appShellBootstrap;[\s\S]*bootstrapAdapter\.normalize\(await response\.json\(\)\)/,
  "navigation must normalize the unknown response before reading app-shell fields",
);
assert.match(
  staticServiceSource,
  /error-contract\.js[\s\S]*browser-recovery\.js[\s\S]*app-shell-bootstrap\.js/,
  "the checked adapter must join the injected framework preamble after recovery and before declared page assets",
);

const context = vm.createContext({
  window: { LongtailForge: {} },
});
vm.runInContext(adapterSource, context, { filename: "app-shell-bootstrap.js" });
const normalize = context.window.LongtailForge.appShellBootstrap.normalize;

const empty = plain(normalize(null));
assert.deepEqual(empty, {
  activeWorkspaceId: "",
  app: {},
  enabledModules: [],
  moduleNavigation: [],
  moduleSettingsNavigation: [],
  navigation: [],
  notificationSummary: {},
  permissionHints: {},
  quickActions: [],
  searchTargets: [],
  supportView: null,
  themeAutoSource: "",
  themeMode: "",
  timezone: "",
  user: {
    preferredCalendarView: "",
    themeAutoSource: "",
    themeMode: "",
    timezone: "",
    user_id: "",
    username: "",
  },
  viewSurfaces: [],
  workspaceContext: {
    enabledModules: [],
    quickActions: [],
    viewSurfaces: [],
  },
  workspaces: [],
});

const normalized = plain(normalize({
  activeWorkspaceId: "workspace-1",
  app: { displayVersion: "test-version" },
  enabledModules: ["tasks", 7, "notes"],
  moduleNavigation: [{ id: "tasks" }, null],
  moduleSettingsNavigation: "invalid",
  navigation: [{ id: "actions", items: [] }, "invalid"],
  notificationSummary: { unreadCount: 2 },
  permissionHints: { tasksCreate: true },
  quickActions: [],
  searchTargets: [{ recordType: "task" }, false],
  supportView: [],
  themeAutoSource: "system",
  themeMode: "dark",
  timezone: "America/New_York",
  user: {
    preferredCalendarView: "week",
    themeAutoSource: "system",
    themeMode: "dark",
    timezone: "America/New_York",
    user_id: "user-1",
    username: "user@example.test",
  },
  viewSurfaces: [],
  workspaceContext: {
    enabledModules: ["workspace-fallback"],
    quickActions: [{ id: "task" }],
    viewSurfaces: [{ id: "tasks.index" }],
    workspaceName: "Workspace One",
  },
  workspaces: [{ workspace_id: "workspace-1" }, 9],
}));

assert.deepEqual(normalized.enabledModules, ["tasks", "notes"]);
assert.deepEqual(normalized.quickActions, [{ id: "task" }]);
assert.deepEqual(normalized.viewSurfaces, [{ id: "tasks.index" }]);
assert.deepEqual(normalized.navigation, [{ id: "actions", items: [] }]);
assert.deepEqual(normalized.moduleNavigation, [{ id: "tasks" }]);
assert.deepEqual(normalized.moduleSettingsNavigation, []);
assert.deepEqual(normalized.searchTargets, [{ recordType: "task" }]);
assert.equal(normalized.supportView, null);
assert.equal(normalized.workspaceContext.workspaceName, "Workspace One");
assert.deepEqual(normalized.workspaceContext.enabledModules, ["tasks", "notes"]);
assert.deepEqual(normalized.workspaces, [{ workspace_id: "workspace-1" }]);
assert.equal(normalized.user.preferredCalendarView, "week");

console.log("App-shell bootstrap boundary regression passed.");

/**
 * The normalized bootstrap payload fields this boundary asserts on. `plain`
 * round-trips the value through JSON, so the projection is declared once here
 * rather than re-derived at each read.
 * @typedef {{
 *   enabledModules: string[],
 *   moduleNavigation: unknown[],
 *   moduleSettingsNavigation: unknown[],
 *   navigation: unknown[],
 *   quickActions: unknown[],
 *   searchTargets: unknown[],
 *   supportView: unknown,
 *   user: { preferredCalendarView: string | null },
 *   viewSurfaces: unknown[],
 *   workspaceContext: { enabledModules: string[], workspaceName: string },
 *   workspaces: unknown[],
 * }} NormalizedBootstrap
 */
/** @param {unknown} value @returns {NormalizedBootstrap} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
