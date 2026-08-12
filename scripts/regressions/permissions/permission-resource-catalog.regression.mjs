export const regressionMeta = Object.freeze({
  id: "permissions.permission-resource-catalog",
  area: "permissions",
  tier: "focused",
  tags: ["modules", "permissions", "users"],
  description: "Proves User Admin receives enabled-module and permission-filtered resource definitions instead of a browser-owned matrix catalog.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("permission-resource-catalog");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { usersService } = await import("../../../src/services/users.service.js");

try {
  await assertStaticContracts();
  await initializeDatabase();
  const session = await readProtectedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  const initialCatalog = (await usersService.listPermissionResources(session)).resources;
  const initialKeys = new Set(initialCatalog.map((resource) => resource.key));

  assert.equal(initialKeys.has("workspace_settings"), true, "framework permission resources should remain available through the catalog");
  assert.equal(initialKeys.has("audit_logs"), true, "audit-log overrides should remain available through the catalog");
  assert.equal(initialKeys.has("reporting"), true, "reporting overrides should remain available through the catalog");
  assert.equal(initialKeys.has("lists"), true, "enabled modules should contribute resources without User Admin edits");
  assert.equal(initialKeys.has("notes"), true, "enabled module resources should include their full manifest catalog");
  assert.equal(initialKeys.has("tags"), true, "newly contributed resources should appear without a browser literal");
  assert.equal(initialKeys.has("developer_example"), false, "disabled modules must not contribute permission resources");
  assert.equal(initialKeys.has("tickets"), false, "unshipped resources must not appear without a module contribution");
  assert.equal(initialKeys.has("knowledge_base"), false, "future modules must not be anticipated by User Admin");

  const tasks = initialCatalog.find((resource) => resource.key === "tasks");
  assert.deepEqual(
    tasks.operations,
    ["read", "create", "update", "delete", "archive", "restore", "assign", "manage"],
    "the permission matrix should use the module's declared operation set",
  );
  assert.deepEqual(
    initialCatalog.map((resource) => resource.label),
    [...initialCatalog].map((resource) => resource.label).sort((left, right) => left.localeCompare(right)),
    "resource delivery should be deterministic",
  );

  await modulesService.setModuleStatus(session.workspace_id, "developer-example", true, { session });
  assert.equal(
    (await usersService.listPermissionResources(session)).resources.some((resource) => resource.key === "developer_example"),
    true,
    "enabling a module should add its resource definition without changing User Admin",
  );
  await modulesService.setModuleStatus(session.workspace_id, "developer-example", false, { session });
  assert.equal(
    (await usersService.listPermissionResources(session)).resources.some((resource) => resource.key === "developer_example"),
    false,
    "disabling a module should remove its resource definition from the matrix catalog",
  );

  const unauthorizedSession = {
    ...session,
    user_id: randomUUID(),
    username: `permission-catalog-no-role-${randomUUID()}@example.test`,
  };
  assert.deepEqual(
    await modulesService.listActiveResourceDefinitions(session.workspace_id, unauthorizedSession),
    [],
    "resource definitions should be permission-filtered before delivery",
  );
  await assert.rejects(
    usersService.listPermissionResources(unauthorizedSession),
    (error) => error?.statusCode === 403,
    "the User Admin catalog endpoint should retain the users.manage route boundary",
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");
  console.log("Permission resource catalog regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

async function assertStaticContracts() {
  const [userAdminSource, usersRouteSource, moduleServiceSource] = await Promise.all([
    readText("public/js/user-admin.js"),
    readText("src/routes/users.routes.js"),
    readText("src/core/modules/modules.service.js"),
  ]);

  assert.doesNotMatch(userAdminSource, /PERMISSION_RESOURCES/, "User Admin must not own a permission resource catalog");
  assert.match(userAdminSource, /getJson\("\/api\/users\/permission-resources"/);
  assert.match(userAdminSource, /permissionResources\.forEach\(\(resource\)/);
  assert.match(userAdminSource, /Object\.entries\(operationAccess\)/, "hidden module overrides should survive matrix saves");
  assert.doesNotMatch(userAdminSource, /knowledge_base|\btickets\b/i, "User Admin must not anticipate unshipped module resources");
  assert.match(usersRouteSource, /usersRoutes\.get\("\/users\/permission-resources"/);
  assert.match(moduleServiceSource, /listWorkspaceContributions\(workspaceId, session, "resourceDefinitions"\)/);
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user?.user_id, "protected user fixture is required");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name || user.username,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
