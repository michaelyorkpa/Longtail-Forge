import assert from "node:assert/strict";
import fs from "node:fs/promises";

import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-view-descriptor-bootstrap-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-view-descriptor-bootstrap.db");
process.env.SUPER_ADMIN_PASSWORD = "View-Descriptor-Bootstrap-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { appShellService } = await import("../src/services/app-shell.service.js");

const workspaceId = "view-descriptor-bootstrap-workspace";
const protectedUserId = "view-descriptor-bootstrap-protected-user";
const deniedUserId = "view-descriptor-bootstrap-denied-user";
const protectedSession = sessionFor(protectedUserId);
const deniedSession = sessionFor(deniedUserId);
const navigationScript = readText("public/js/navigation.js");
const appShellServiceSource = readText("src/services/app-shell.service.js");
const modulesServiceSource = readText("src/core/modules/modules.service.js");

assert.match(appShellServiceSource, /modulesService\.listActiveViewSurfaces\(session\.workspace_id, session\)/, "App shell should deliver view descriptors through the existing bootstrap path");
assert.doesNotMatch(appShellServiceSource, /view-surfaces|viewSurfaces\/bootstrap|descriptor\/bootstrap/, "Descriptors should not get a separate bootstrap transport");
assert.match(navigationScript, /viewSurfaces: shell\.viewSurfaces \|\| shell\.workspaceContext\?\.viewSurfaces \|\| \[\]/, "Navigation bootstrap should copy descriptors into workspace context");
// Retargeted by `0.33.33.38.4.15`, which moved the container check into a shared reader.
// The pin named the expression; what it defends is that the stored context still carries the
// descriptors the bootstrap copied into it, from the candidate and then from the cache.
assert.match(navigationScript, /viewSurfaces: readContextList\(settings\.viewSurfaces, previous\.viewSurfaces\),/, "Stored workspace context should preserve descriptors");
assert.match(navigationScript, /function readContextList\([\s\S]{0,220}Array\.isArray\(candidate\)/, "and that reader still admits only a real list");
assert.match(modulesServiceSource, /requiredPermissionsAllowed\(protectedView, session\)/, "Descriptor delivery should honor protected view permissions");
assert.match(modulesServiceSource, /!enabledModuleIds\.has\(surface\.moduleId\)/, "Descriptor delivery should skip disabled modules");

try {
  await initializeDatabase();
  await ensureRegressionUsers();
  await modulesService.syncModuleRegistry(workspaceId);

  const discoverableSurfaces = await modulesService.listActiveViewSurfaces(workspaceId, null);
  assert.ok(discoverableSurfaces.some((surface) => surface.id === "tags.management"), "Enabled descriptor should be discoverable before permission filtering");
  assert.equal(discoverableSurfaces.some((surface) => surface.id === "developer-example.surface"), false, "Disabled module descriptors should not be discoverable");

  // The app-shell bootstrap publishes its delivered view surfaces as an open
  // list, which 0.33.33.32.13 confirmed is deliberate, so each entry is proven
  // to be a record where this owner reads its id and layout.
  const allowedShell = await appShellService.bootstrap(protectedSession);
  assert.ok(Array.isArray(allowedShell.viewSurfaces), "App shell should include a top-level viewSurfaces array");
  assert.ok(Array.isArray(allowedShell.workspaceContext.viewSurfaces), "Workspace context should include the delivered viewSurfaces array");
  assert.deepEqual(allowedShell.workspaceContext.viewSurfaces, allowedShell.viewSurfaces, "Workspace context should use the same descriptor payload");
  const allowedSurfaces = allowedShell.viewSurfaces.map(deliveredSurface);
  assert.ok(allowedSurfaces.some((surface) => surface.id === "tags.management"), "Allowed protected views should deliver descriptors");
  assert.ok(allowedSurfaces.some((surface) => surface.id === "notes.workspace" && surface.layout === "slide-out-sidebar"), "Allowed protected views should deliver the Notes slide-out sidebar descriptor");
  assert.equal(allowedSurfaces.some((surface) => surface.id === "developer-example.surface"), false, "Disabled module descriptors should not leak through app shell");

  const deniedShell = await appShellService.bootstrap(deniedSession);
  assert.ok(Array.isArray(deniedShell.workspaceContext.viewSurfaces), "Workspace context should include the delivered viewSurfaces array");
  assert.equal(deniedShell.viewSurfaces.map(deliveredSurface).some((surface) => surface.id === "tags.management"), false, "Permission-denied protected views should not deliver descriptors");
  assert.equal(deniedShell.workspaceContext.viewSurfaces.map(deliveredSurface).some((surface) => surface.id === "tags.management"), false, "Permission-denied descriptors should not be cached in workspace context");

  console.log("View descriptor bootstrap regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function ensureRegressionUsers() {
  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Descriptor Bootstrap Workspace', 'Active', 'business', datetime('now'), datetime('now'))
ON CONFLICT(workspace_id) DO NOTHING;
`);

  await ensureUser(protectedUserId, "descriptor-protected", "yes");
  await ensureUser(deniedUserId, "descriptor-denied", "no");
}

/**
 * Prove one delivered view surface is a record before its id is read.
 * @param {unknown} surface
 * @returns {{ id?: unknown, layout?: unknown }}
 */
function deliveredSurface(surface) {
  assert.ok(surface && typeof surface === "object" && !Array.isArray(surface), "each delivered view surface should be a record");
  return /** @type {{ id?: unknown, layout?: unknown }} */ (surface);
}

/** @param {string} userId @param {string} username @param {string} protectedUser */
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

/** @param {string} userId @returns {import("../src/types/http-contracts.js").WorkspaceRequestSession} */
function sessionFor(userId) {
  return workspaceSessionFixture({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    workspace_id: workspaceId,
    user_id: userId,
    username: userId,
  });
}
