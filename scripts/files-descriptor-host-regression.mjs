import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { modulesService } from "../src/core/modules/modules.service.js";
import { appShellService } from "../src/services/app-shell.service.js";
import { querySql, runSql, sqlText } from "../src/db/index.js";

const appVersion = "0.33.5.20.3";
const workspaceId = "files-descriptor-host-workspace";
const protectedUserId = "files-descriptor-host-protected-user";
const deniedUserId = "files-descriptor-host-denied-user";
const protectedSession = sessionFor(protectedUserId);
const deniedSession = sessionFor(deniedUserId);

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesHtml = readText("views/protected/files.html");
const filesScript = readText("public/js/files.js");
const frameworkSurfaceSource = readText("src/core/view-surfaces/framework-view-surfaces.js");
const modulesServiceSource = readText("src/core/modules/modules.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(filesHtml, /<main class="wide-page files-page" data-files-host><\/main>/, "Files protected view should be a minimal descriptor host");
assert.match(filesHtml, /js\/shared\/client-project-options\.js\?v=2[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/files\.js\?v=13/, "Files host should load client/project helpers plus the view builder and renderer before the Files adapter");
assertNoProtectedAnatomy(filesHtml, "views/protected/files.html");

assert.match(filesScript, /view\.renderSurface\(\{ \.\.\.activeFilesViewDescriptor, dataSource: null, modals: \[\] \}, host\)/, "Files adapter should render the descriptor shell without letting the renderer fetch the browse data yet");
assert.match(filesScript, /files\.browse\.filters/, "Files adapter should register the browse filter behavior");
assert.match(filesScript, /files\.browse\.results/, "Files adapter should register the browse results behavior");
assert.doesNotMatch(filesScript, /files\.browse\.legacy|createFilesBrowseChrome/, "Strict Files adapter should not preserve the legacy full-page browse fallback behavior");
assert.match(filesScript, /fallbackFilesViewSurfaceDescriptor/, "Files adapter should keep a safe fallback descriptor for early bootstrap timing");
assert.match(filesScript, /\/api\/files\/attachments/, "Files adapter should continue to use the service-owned attachments route");

assert.match(frameworkSurfaceSource, /id:\s*"files\.browse"/, "Framework descriptor registry should declare files.browse");
assert.match(frameworkSurfaceSource, /moduleId:\s*FRAMEWORK_VIEW_SURFACE_MODULE_ID/, "Files descriptor should use the framework surface module id");
assert.match(frameworkSurfaceSource, /requiredPermissions:\s*\["files\.view"\]/, "Files protected descriptor should be gated by files.view");
assert.match(frameworkSurfaceSource, /route:\s*"\/api\/files\/attachments"/, "Files descriptor should point at the service-owned attachments read route");
assert.match(frameworkSurfaceSource, /layout:\s*"slide-out-sidebar"/, "Files descriptor should use the shared slide-out sidebar layout");
assert.match(frameworkSurfaceSource, /behavior:\s*"files\.browse\.filters"/, "Files descriptor should mount the browse filter behavior");
assert.match(frameworkSurfaceSource, /behavior:\s*"files\.browse\.results"/, "Files descriptor should mount the browse results behavior");
assert.match(modulesServiceSource, /listFrameworkViewSurfaces\(\)/, "Modules service should merge framework-owned descriptors into app-shell delivery");
assert.match(modulesServiceSource, /listFrameworkProtectedViews\(\)/, "Modules service should merge framework-owned protected view gates into descriptor delivery");
assert.match(regressionSuite, /scripts\/files-descriptor-host-regression\.mjs/, "Regression suite should include the Files descriptor host regression");

await ensureRegressionUsers();
await modulesService.syncModuleRegistry(workspaceId);

const activeSurfaces = await modulesService.listActiveViewSurfaces(workspaceId, protectedSession);
assertFilesSurface(activeSurfaces.find((surface) => surface.id === "files.browse"), "modulesService.listActiveViewSurfaces");

const allowedShell = await appShellService.bootstrap(protectedSession);
assertFilesSurface(allowedShell.viewSurfaces.find((surface) => surface.id === "files.browse"), "appShellService.bootstrap top-level viewSurfaces");
assertFilesSurface(allowedShell.workspaceContext.viewSurfaces.find((surface) => surface.id === "files.browse"), "appShellService.bootstrap workspaceContext.viewSurfaces");

const deniedSurfaces = await modulesService.listActiveViewSurfaces(workspaceId, deniedSession);
assert.equal(deniedSurfaces.some((surface) => surface.id === "files.browse"), false, "Files descriptor should not be delivered when files.view is denied");

const deniedShell = await appShellService.bootstrap(deniedSession);
assert.equal(deniedShell.viewSurfaces.some((surface) => surface.id === "files.browse"), false, "Denied app shell should not receive files.browse");
assert.equal(deniedShell.workspaceContext.viewSurfaces.some((surface) => surface.id === "files.browse"), false, "Denied workspace context should not cache files.browse");

const integrityRows = await querySql("PRAGMA integrity_check;");
assert.equal(integrityRows[0]?.integrity_check, "ok", "Database integrity check should pass after Files descriptor regression setup");

console.log("Files descriptor host regression passed.");

async function ensureRegressionUsers() {
  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Files Descriptor Host Workspace', 'Active', 'business', datetime('now'), datetime('now'))
ON CONFLICT(workspace_id) DO NOTHING;
`);

  await ensureUser(protectedUserId, "files-descriptor-protected", "yes");
  await ensureUser(deniedUserId, "files-descriptor-denied", "no");
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

DELETE FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)};
`);
}

function assertFilesSurface(surface, sourceLabel) {
  assert.ok(surface, `${sourceLabel} should deliver files.browse`);
  assert.equal(surface.moduleId, "framework", `${sourceLabel} should keep files.browse framework-owned`);
  assert.equal(surface.viewId, "files", `${sourceLabel} should bind files.browse to the Files protected view`);
  assert.equal(surface.viewPath, "files.html", `${sourceLabel} should bind files.browse to files.html`);
  assert.equal(surface.layout, "slide-out-sidebar", `${sourceLabel} should use the shared Files browse sidebar layout`);
  assert.equal(surface.dataSource?.route, "/api/files/attachments", `${sourceLabel} should preserve the service-owned Files read route`);
  assert.equal(surface.sidebarPanels?.[0]?.behavior, "files.browse.filters", `${sourceLabel} should mount Files filters in the drawer`);
  assert.equal(surface.detail?.regions?.[0]?.behavior, "files.browse.results", `${sourceLabel} should mount Files results in the main region`);
}

function assertNoProtectedAnatomy(html, label) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));

  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} should not ship framework-owned protected view anatomy`);
  assert.doesNotMatch(body, /\b(data-file-filters|data-file-list|data-file-status|files-table)\b/, `${label} should not ship Files browse hooks outside the descriptor host`);
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
