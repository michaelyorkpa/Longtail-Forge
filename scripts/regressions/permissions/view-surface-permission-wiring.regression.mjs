export const regressionMeta = Object.freeze({
  id: "permissions.view-surface-permission-wiring",
  area: "permissions",
  tier: "release-gate",
  tags: ["browser", "permissions", "scope", "views"],
  description: "Proves any-scope workspace permission hints drive declarative action visibility without replacing record capabilities or server authorization.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const permissionsRepository = read("src/repositories/permissions.repo.js");
const permissionsService = read("src/services/permissions.service.js");
const settingsService = read("src/services/settings.service.js");
const renderer = read("public/js/shared/view-renderer.js");
const clientProjectsModule = read("src/modules/client-projects/module.js");
const clientProjectsBrowser = read("public/js/clients-projects.js");
const permissionHarness = read("scripts/permission-regression.mjs");
const rendererRegression = read("scripts/view-renderer-actions-regression.mjs");

assert.match(
  permissionsRepository,
  /async function readPermissionIds\(\)[\s\S]*SELECT permission_id[\s\S]*FROM permissions[\s\S]*ORDER BY permission_id/,
  "The permission set should come from the canonical permission catalog",
);
assert.match(
  permissionsService,
  /async function listGrantedPermissionIdsInAnyScope\(session\)[\s\S]*readPermissionIds\(\)[\s\S]*readAssignmentsForSession\(session\)[\s\S]*readPermissionsByRole\(\)[\s\S]*assignmentAllowsAction/,
  "The browser permission set should preserve any-scope grants and assignment overrides",
);
assert.match(
  settingsService,
  /readWorkspaceBootstrap\(session\)[\s\S]*permissionsService\.listGrantedPermissionIdsInAnyScope\(session\)[\s\S]*permissionIds,/,
  "Every login, session, and app-shell workspace bootstrap should carry the effective permission set",
);

for (const pattern of [
  /pageHeader\.primaryAction && actionPermissionsAllowed\(pageHeader\.primaryAction\)/,
  /const permittedActions = actions\.filter\(actionPermissionsAllowed\)/,
  /itemRows\.rowActions[\s\S]*\.filter\(actionPermissionsAllowed\)/,
  /modal\.footerActions[\s\S]*\.filter\(actionPermissionsAllowed\)/,
  /requiredPermissions\.every\(\(permissionId\) => granted\.has\(permissionId\)\)/,
  /if \(!actionPermissionsAllowed\(action\)\)[\s\S]*You do not have permission to run this action/,
]) {
  assert.match(renderer, pattern, "The shared renderer should filter every declarative action placement and retain dispatch-time defense");
}

assert.match(
  clientProjectsModule,
  /id: "add-client"[\s\S]*requiredPermissions: \["clients\.manage"\]/,
  "The workspace-level Add Client action should declare its coarse permission requirement",
);
assert.match(
  clientProjectsModule,
  /id: "add-child-client"[\s\S]*requiredPermissions: \["clients\.manage"\][\s\S]*visibleWhen: \{ field: "canCreateChild", equals: true \}/,
  "The record-level child action should require both the coarse grant and server-shaped parent capability",
);
assert.match(
  clientProjectsBrowser,
  /withoutUnavailableTopLevelActions[\s\S]*canCreateTopLevelClient\(\)[\s\S]*primaryAction: null/,
  "A Client Administrator's any-scope grant must not restore the workspace-level Add Client action",
);

for (const pattern of [
  /workspaceContext\?\.permissionIds\?\.includes\("clients\.manage"\)/,
  /workspaceContext\?\.permissionIds\?\.includes\("projects\.manage"\)/,
  /session bootstrap carries the same any-scope browser permission set/,
  /client administrator cannot create top-level clients[\s\S]*\/api\/clients[\s\S]*403/,
]) {
  assert.match(permissionHarness, pattern, "Permission coverage should prove scoped grants and unchanged server denial");
}
assert.match(rendererRegression, /Actions with absent declared permissions should not render/);
assert.match(rendererRegression, /A rendered action should still recheck live permission hints before dispatch/);

console.log("View-surface permission wiring regression passed.");

function read(path) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}
