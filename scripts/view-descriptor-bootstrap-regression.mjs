import assert from "node:assert/strict";

import { modulesService } from "../src/core/modules/modules.service.js";
import { appShellService } from "../src/services/app-shell.service.js";
import { querySql, runSql, sqlText } from "../src/db/sqlite.js";
import { readFileSync } from "node:fs";

const workspaceId = "view-descriptor-bootstrap-workspace";
const protectedUserId = "view-descriptor-bootstrap-protected-user";
const deniedUserId = "view-descriptor-bootstrap-denied-user";
const protectedSession = sessionFor(protectedUserId);
const deniedSession = sessionFor(deniedUserId);
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const navigationScript = readText("public/js/navigation.js");
const appShellServiceSource = readText("src/services/app-shell.service.js");
const modulesServiceSource = readText("src/core/modules/modules.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.19.1.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.19.1.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.19.1.2", "package-lock package entry should report the current app version");

assert.match(appShellServiceSource, /modulesService\.listActiveViewSurfaces\(session\.workspace_id, session\)/, "App shell should deliver view descriptors through the existing bootstrap path");
assert.doesNotMatch(appShellServiceSource, /view-surfaces|viewSurfaces\/bootstrap|descriptor\/bootstrap/, "Descriptors should not get a separate bootstrap transport");
assert.match(navigationScript, /viewSurfaces: shell\.viewSurfaces \|\| shell\.workspaceContext\?\.viewSurfaces \|\| \[\]/, "Navigation bootstrap should copy descriptors into workspace context");
assert.match(navigationScript, /viewSurfaces: Array\.isArray\(settings\.viewSurfaces\)/, "Stored workspace context should preserve descriptors");
assert.match(modulesServiceSource, /requiredPermissionsAllowed\(protectedView, session\)/, "Descriptor delivery should honor protected view permissions");
assert.match(modulesServiceSource, /!enabledModuleIds\.has\(surface\.moduleId\)/, "Descriptor delivery should skip disabled modules");
assert.match(regressionSuite, /scripts\/view-descriptor-bootstrap-regression\.mjs/, "Regression suite should include descriptor bootstrap regression");

await ensureRegressionUsers();
await modulesService.syncModuleRegistry(workspaceId);

const discoverableSurfaces = await modulesService.listActiveViewSurfaces(workspaceId, null);
assert.ok(discoverableSurfaces.some((surface) => surface.id === "tags.management"), "Enabled descriptor should be discoverable before permission filtering");
assert.equal(discoverableSurfaces.some((surface) => surface.id === "developer-example.surface"), false, "Disabled module descriptors should not be discoverable");

const allowedShell = await appShellService.bootstrap(protectedSession);
assert.ok(Array.isArray(allowedShell.viewSurfaces), "App shell should include a top-level viewSurfaces array");
assert.ok(Array.isArray(allowedShell.workspaceContext.viewSurfaces), "Workspace context should include the delivered viewSurfaces array");
assert.deepEqual(allowedShell.workspaceContext.viewSurfaces, allowedShell.viewSurfaces, "Workspace context should use the same descriptor payload");
assert.ok(allowedShell.viewSurfaces.some((surface) => surface.id === "tags.management"), "Allowed protected views should deliver descriptors");
assert.ok(allowedShell.viewSurfaces.some((surface) => surface.id === "notes.workspace" && surface.layout === "slide-out-sidebar"), "Allowed protected views should deliver the Notes slide-out sidebar descriptor");
assert.equal(allowedShell.viewSurfaces.some((surface) => surface.id === "developer-example.surface"), false, "Disabled module descriptors should not leak through app shell");

const deniedShell = await appShellService.bootstrap(deniedSession);
assert.equal(deniedShell.viewSurfaces.some((surface) => surface.id === "tags.management"), false, "Permission-denied protected views should not deliver descriptors");
assert.equal(deniedShell.workspaceContext.viewSurfaces.some((surface) => surface.id === "tags.management"), false, "Permission-denied descriptors should not be cached in workspace context");

console.log("View descriptor bootstrap regression passed.");

async function ensureRegressionUsers() {
  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Descriptor Bootstrap Workspace', 'Active', 'business', datetime('now'), datetime('now'))
ON CONFLICT(workspace_id) DO NOTHING;
`);

  await ensureUser(protectedUserId, "descriptor-protected", "yes");
  await ensureUser(deniedUserId, "descriptor-denied", "no");
}

async function ensureUser(userId, username, protectedUser) {
  const existing = await querySql(`
SELECT user_id
FROM users
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);

  if (existing.length === 0) {
    await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  ${sqlText(username)},
  NULL,
  '',
  'regression-only',
  'light',
  'active',
  ${sqlText(protectedUser)},
  ${sqlText(workspaceId)}
);
`);
  } else {
    await runSql(`
UPDATE users
SET home_workspace_id = ${sqlText(workspaceId)},
    username = ${sqlText(username)},
    protected_user = ${sqlText(protectedUser)},
    active_workspace_id = ${sqlText(workspaceId)}
WHERE user_id = ${sqlText(userId)};
`);
  }

  await runSql(`
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(`${userId}-membership`)}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', datetime('now'), datetime('now'))
ON CONFLICT(user_workspace_id) DO UPDATE SET
  status = 'active',
  updated_at = datetime('now');
`);
}

function sessionFor(userId) {
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    workspace_id: workspaceId,
    user_id: userId,
    username: userId,
  };
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
