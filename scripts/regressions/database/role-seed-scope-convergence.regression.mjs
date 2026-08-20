export const regressionMeta = Object.freeze({
  id: "database.role-seed-scope-convergence",
  area: "database",
  tier: "focused",
  tags: ["migration", "permissions", "role-seed", "schema"],
  description: "Proves fresh, pre-074 upgrade, and current databases converge on the seven-role scope and permission contract without changing valid assignments.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

process.env.LONGTAIL_DATA_DIR = path.join(os.tmpdir(), "ltf-role-seed-scope-convergence");
process.env.LONGTAIL_DATABASE_FILE = path.join(process.env.LONGTAIL_DATA_DIR, "role-seed-scope-convergence.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";

const {
  listFrameworkRolePermissionDefaults,
} = await import("../../../src/core/permissions/framework-permission-catalog.js");
const {
  listModuleRolePermissionDefaults,
} = await import("../../../src/core/modules/registry.js");

const ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({ roleId: "super_admin", roleName: "Super Admin", databaseScope: "global", runtimeScope: "all", sortOrder: 10 }),
  Object.freeze({ roleId: "workspace_admin", roleName: "Workspace Administrator", databaseScope: "workspace", runtimeScope: "workspace", sortOrder: 20 }),
  Object.freeze({ roleId: "client_admin", roleName: "Client Administrator", databaseScope: "client", runtimeScope: "client", sortOrder: 30 }),
  Object.freeze({ roleId: "project_admin", roleName: "Project Administrator", databaseScope: "project", runtimeScope: "project", sortOrder: 40 }),
  Object.freeze({ roleId: "client_user", roleName: "Client User", databaseScope: "client", runtimeScope: "client", sortOrder: 50 }),
  Object.freeze({ roleId: "project_user", roleName: "Project User", databaseScope: "project", runtimeScope: "project", sortOrder: 60 }),
  Object.freeze({ roleId: "client_external_user", roleName: "Client User (External)", databaseScope: "client", runtimeScope: "client", sortOrder: 70 }),
]);
const ROLE_IDS = ROLE_DEFINITIONS.map((role) => role.roleId);
const EXPECTED_ROLE_LIMITS = Object.freeze({
  super_admin: ROLE_IDS,
  workspace_admin: ROLE_IDS.filter((roleId) => roleId !== "super_admin"),
  client_admin: ["project_admin", "client_user", "project_user", "client_external_user"],
  project_admin: ["project_user"],
});
const EXPECTED_WORKSPACE_TYPE_ROLES = Object.freeze({
  business: ROLE_IDS,
  family: ["workspace_admin", "project_user"],
  personal: ["workspace_admin"],
});
const FRAMEWORK_SEEDED_DEFAULTS = Object.freeze({
  super_admin: [
    "audit_logs.view",
    "files.delete",
    "files.download",
    "files.manage_quarantine",
    "files.manage_workspace_settings",
    "files.upload",
    "files.view",
    "notifications.manage_preferences",
    "notifications.manage_workspace_defaults",
    "notifications.view_own",
    "time_entries.edit_own",
    "workspace_settings.manage",
  ],
  workspace_admin: [
    "audit_logs.view",
    "files.delete",
    "files.download",
    "files.manage_quarantine",
    "files.manage_workspace_settings",
    "files.upload",
    "files.view",
    "notifications.manage_preferences",
    "notifications.manage_workspace_defaults",
    "notifications.view_own",
    "workspace_settings.manage",
  ],
  client_admin: [
    "files.delete",
    "files.download",
    "files.upload",
    "files.view",
    "notifications.manage_preferences",
    "notifications.view_own",
  ],
  project_admin: [
    "files.delete",
    "files.download",
    "files.upload",
    "files.view",
    "notifications.manage_preferences",
    "notifications.view_own",
  ],
  client_user: [
    "files.download",
    "files.view",
    "notifications.manage_preferences",
    "notifications.view_own",
  ],
  project_user: [
    "files.download",
    "files.view",
    "notifications.manage_preferences",
    "notifications.view_own",
  ],
  client_external_user: [
    "files.download",
    "files.view",
    "notifications.manage_preferences",
    "notifications.view_own",
  ],
});

const baselineSql = readText("src/db/schema/current.sql");
const generatedSchemaSql = readText("src/db/schema/current.generated.sql");
const migrations = fs.readdirSync("src/db/migrations")
  .filter((fileName) => /^\d{3,}_[a-z][a-z0-9_]*\.sql$/.test(fileName))
  .sort()
  .map((fileName) => ({
    fileName,
    sql: readText(`src/db/migrations/${fileName}`),
    version: Number.parseInt(fileName.slice(0, fileName.indexOf("_")), 10),
  }));
const migration074 = migrations.find((migration) => migration.version === 74);
const migration086 = migrations.find((migration) => migration.version === 86);

assert.ok(migration074, "migration 074 should remain available for pre-074 upgrades");
assert.ok(migration086, "the role seed convergence repair should be migration 086");
assert.match(
  migration086.sql,
  /UPDATE roles[\s\S]*description = 'Controls one project and its project assignments\.'[\s\S]*assignable_scope_type = 'project'[\s\S]*role_id = 'project_admin'/,
  "migration 086 should repair only Project Administrator role metadata",
);
assert.doesNotMatch(
  migration086.sql,
  /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?user_role_assignments/i,
  "the convergence repair must not rewrite role assignments",
);

const baseline = openDatabase();
try {
  baseline.exec(baselineSql);
  assertRoleContract(baseline, "consolidated fresh baseline");
  assertDefaultPermissionContract(baseline, "consolidated fresh baseline");
  assertDatabaseHealth(baseline, "consolidated fresh baseline");
} finally {
  baseline.close();
}

const fresh = openDatabase();
try {
  fresh.exec(baselineSql);
  applyMigrations(fresh, migrations);
  assertRoleContract(fresh, "fresh database after all forward migrations");
  assertDefaultPermissionContract(fresh, "fresh database after all forward migrations");
  assertDatabaseHealth(fresh, "fresh database after all forward migrations");
} finally {
  fresh.close();
}

const pre074Upgrade = openDatabase();
try {
  pre074Upgrade.exec(baselineSql);
  applyMigrations(pre074Upgrade, migrations.filter((migration) => migration.version < 74));
  seedLegacyProjectAdministrator(pre074Upgrade);
  applyMigrations(pre074Upgrade, migrations.filter((migration) => migration.version >= 74));

  assertRoleContract(pre074Upgrade, "pre-074 upgraded database");
  assertDefaultPermissionContract(pre074Upgrade, "pre-074 upgraded database");
  assert.deepEqual(
    readAssignments(pre074Upgrade),
    [
      assignmentRow({
        assignmentId: "legacy-project-admin:project:project-a",
        projectId: "project-a",
        scopeId: "project-a",
        scopeType: "project",
      }),
    ],
    "migration 074 should expand the legacy Client-scoped Project Administrator assignment and migration 086 should leave it unchanged",
  );
  assertDatabaseHealth(pre074Upgrade, "pre-074 upgraded database");
} finally {
  pre074Upgrade.close();
}

const currentUpgrade = openDatabase();
try {
  currentUpgrade.exec(baselineSql);
  applyMigrations(currentUpgrade, migrations.filter((migration) => migration.version < 86));
  seedCurrentAssignments(currentUpgrade);
  const assignmentsBefore = readAssignments(currentUpgrade);
  currentUpgrade.exec(`
UPDATE roles
SET description = 'Controls projects and project assignments for one client.',
    assignable_scope_type = 'client'
WHERE role_id = 'project_admin';
`);
  currentUpgrade.exec(migration086.sql);

  assertRoleContract(currentUpgrade, "current database repaired by migration 086");
  assertDefaultPermissionContract(currentUpgrade, "current database repaired by migration 086");
  assert.deepEqual(
    readAssignments(currentUpgrade),
    assignmentsBefore,
    "migration 086 should preserve every existing valid role assignment byte-for-byte",
  );
  assertDatabaseHealth(currentUpgrade, "current database repaired by migration 086");
} finally {
  currentUpgrade.close();
}

assert.match(generatedSchemaSql, /CREATE TABLE roles \([\s\S]*assignable_scope_type TEXT NOT NULL[\s\S]*sort_order INTEGER NOT NULL[\s\S]*\);/);
assert.match(generatedSchemaSql, /CREATE TABLE role_permissions \([\s\S]*FOREIGN KEY \(role_id\) REFERENCES roles\(role_id\)[\s\S]*\);/);
assert.match(generatedSchemaSql, /CREATE TABLE user_role_assignments \([\s\S]*FOREIGN KEY \(role_id\) REFERENCES roles\(role_id\)[\s\S]*\);/);
assertRuntimeRoleContract();

console.log("Role seed and scope convergence regression passed.");

function openDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  return database;
}

/** @param {InstanceType<typeof Database>} database @param {Array<{ fileName: string, sql: string }>} selectedMigrations */
function applyMigrations(database, selectedMigrations) {
  for (const migration of selectedMigrations) {
    const ownsForeignKeyWindow = /migration-foreign-keys:\s*off/i.test(migration.sql);
    try {
      if (ownsForeignKeyWindow) {
        database.pragma("foreign_keys = OFF");
      }
      database.exec(migration.sql);
      if (ownsForeignKeyWindow) {
        assert.deepEqual(database.pragma("foreign_key_check"), [], `${migration.fileName} should preserve foreign-key integrity`);
      }
    } catch (error) {
      /** @type {Error} */ (error).message = `${migration.fileName}: ${/** @type {Error} */ (error).message}`;
      throw error;
    } finally {
      if (ownsForeignKeyWindow) {
        database.pragma("foreign_keys = ON");
      }
    }
  }
}

/** @param {InstanceType<typeof Database>} database @param {string} label */
function assertRoleContract(database, label) {
  const roles = database.prepare(`
SELECT role_id, role_name, description, assignable_scope_type, sort_order
FROM roles
ORDER BY sort_order, role_id;
`).all();
  assert.deepEqual(
    roles.map((role) => ({
      databaseScope: role.assignable_scope_type,
      roleId: role.role_id,
      roleName: role.role_name,
      sortOrder: role.sort_order,
    })),
    ROLE_DEFINITIONS.map(({ databaseScope, roleId, roleName, sortOrder }) => ({
      databaseScope,
      roleId,
      roleName,
      sortOrder,
    })),
    `${label} should expose exactly the seven canonical role definitions and scope types`,
  );
  assert.equal(
    roles.find((role) => role.role_id === "project_admin")?.description,
    "Controls one project and its project assignments.",
    `${label} should publish the project-scoped Project Administrator description`,
  );
}

/** @param {InstanceType<typeof Database>} database @param {string} label */
function assertDefaultPermissionContract(database, label) {
  const actual = database.prepare(`
SELECT role_id, permission_id
FROM role_permissions
ORDER BY role_id, permission_id;
`).all();
  const declaredDefaults = [
    ...listFrameworkRolePermissionDefaults(),
    ...listModuleRolePermissionDefaults(),
  ];
  assert.deepEqual(
    declaredDefaults
      .filter((mapping) => mapping.permissions.includes("support_view.enter"))
      .map((mapping) => mapping.roleId),
    ["super_admin"],
    "Support View must remain a runtime-catalog default only for the installation Super Admin role",
  );
  /** @type {Map<string, Set<string>>} */
  const expected = new Map(ROLE_IDS.map((roleId) => [roleId, new Set(FRAMEWORK_SEEDED_DEFAULTS[roleId])]));

  for (const mapping of declaredDefaults) {
    const roleDefaults = expected.get(mapping.roleId);
    assert.ok(roleDefaults, `default permission contribution names unknown role ${mapping.roleId}`);
    for (const permissionId of mapping.permissions) {
      if (permissionId === "support_view.enter") continue;
      roleDefaults.add(permissionId);
    }
  }

  const expectedRows = [...expected]
    .flatMap(([roleId, permissions]) => [...permissions].map((permissionId) => ({
      permission_id: permissionId,
      role_id: roleId,
    })))
    .sort((left, right) => left.role_id.localeCompare(right.role_id) || left.permission_id.localeCompare(right.permission_id));
  assert.deepEqual(
    actual,
    expectedRows,
    `${label} should keep the reviewed module and framework default permission grants for all seven roles`,
  );
}

function assertRuntimeRoleContract() {
  const source = readText("src/services/permissions.service.js");
  const normalized = source.replace(/\s+/g, " ");
  for (const role of ROLE_DEFINITIONS) {
    assert.match(
      normalized,
      new RegExp(`${role.roleId}: "${role.runtimeScope}"`),
      `runtime scope map should require ${role.roleId} at ${role.runtimeScope} scope`,
    );
  }

  for (const [roleId, delegatedRoleIds] of Object.entries(EXPECTED_ROLE_LIMITS)) {
    const roleLimitBlock = source.match(new RegExp(`${roleId}: new Set\\(\\[([\\s\\S]*?)\\]\\)`))?.[1] ||
      source.match(new RegExp(`${roleId}: new Set\\(\\[([^\\]]*)\\]\\)`))?.[1] ||
      "";
    const actualRoleIds = [...roleLimitBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    assert.deepEqual(actualRoleIds, delegatedRoleIds, `${roleId} should retain the reviewed ROLE_LIMITS delegation ceiling`);
  }

  for (const [workspaceType, roleIds] of Object.entries(EXPECTED_WORKSPACE_TYPE_ROLES)) {
    if (workspaceType === "business") {
      assert.match(normalized, /return workspaceType === "business" \|\|/);
      continue;
    }
    const constantName = workspaceType === "family" ? "FAMILY_ROLE_LIMITS" : "PERSONAL_ROLE_LIMITS";
    const setBody = source.match(new RegExp(`const ${constantName} = new Set\\(\\[([^\\]]*)\\]\\);`))?.[1] || "";
    assert.deepEqual(
      [...setBody.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]),
      roleIds,
      `${workspaceType} workspaces should retain the reviewed role availability`,
    );
  }
}

/** @param {InstanceType<typeof Database>} database */
function seedLegacyProjectAdministrator(database) {
  seedWorkspaceAndResources(database);
  database.exec(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, password, active_workspace_id)
VALUES ('user-project-admin', 'workspace-a', 'project-admin@example.test', 'Project Admin', 'unused', 'workspace-a');

INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id,
  permission_overrides_json, created_at, updated_at
)
VALUES (
  'legacy-project-admin', 'workspace-a', 'user-project-admin', 'project_admin',
  'client', 'client-a', 'client-a', NULL, '{"restrictBilling":true}',
  '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'
);
`);
}

/** @param {InstanceType<typeof Database>} database */
function seedCurrentAssignments(database) {
  seedWorkspaceAndResources(database);
  const scopes = {
    super_admin: ["all", "all"],
    workspace_admin: ["workspace", "workspace-a"],
    client_admin: ["client", "client-a"],
    project_admin: ["project", "project-a"],
    client_user: ["client", "client-a"],
    project_user: ["project", "project-a"],
    client_external_user: ["client", "client-a"],
  };

  for (const roleId of ROLE_IDS) {
    const userId = `user-${roleId}`;
    const [scopeType, scopeId] = scopes[roleId];
    database.prepare(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, password, active_workspace_id)
VALUES (?, 'workspace-a', ?, ?, 'unused', 'workspace-a');
`).run(userId, `${roleId}@example.test`, roleId);
    database.prepare(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id,
  permission_overrides_json, created_at, updated_at
)
VALUES (?, 'workspace-a', ?, ?, ?, ?, ?, ?, ?, '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z');
`).run(
      `assignment-${roleId}`,
      userId,
      roleId,
      scopeType,
      scopeId,
      scopeType === "client" ? scopeId : null,
      scopeType === "project" ? scopeId : null,
      `{"role":"${roleId}"}`,
    );
  }
}

/** @param {InstanceType<typeof Database>} database */
function seedWorkspaceAndResources(database) {
  database.exec(`
INSERT OR IGNORE INTO workspaces (
  workspace_id, name, status, workspace_type, created_at, updated_at
)
VALUES (
  'workspace-a', 'Role Contract Workspace', 'Active', 'business',
  '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO clients (
  id, workspace_id, name, status,
  billing_contact_name, billing_contact_email, billing_contact_alternate_name,
  billing_contact_alternate_email, billing_contact_phone_number,
  billing_contact_alternate_phone_number, billing_contact_street_address_1,
  billing_contact_street_address_2, billing_contact_city, billing_contact_state,
  billing_contact_zip_code, created_at, updated_at
)
VALUES (
  'client-a', 'workspace-a', 'Client A', 'Active',
  '', '', '', '', '', '', '', '', '', '', '',
  '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO projects (
  id, workspace_id, client_id, name, status, created_at, updated_at
)
VALUES (
  'project-a', 'workspace-a', 'client-a', 'Project A', 'Active',
  '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
);
`);
}

/** @param {InstanceType<typeof Database>} database */
function readAssignments(database) {
  return database.prepare(`
SELECT
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments
ORDER BY assignment_id;
`).all();
}

/** @param {{ assignmentId: string, clientId?: string | null, projectId?: string | null, scopeId: string, scopeType: string }} row */
function assignmentRow({
  assignmentId,
  clientId = null,
  projectId = null,
  scopeId,
  scopeType,
}) {
  return {
    assignment_id: assignmentId,
    workspace_id: "workspace-a",
    user_id: "user-project-admin",
    role_id: "project_admin",
    scope_type: scopeType,
    scope_id: scopeId,
    client_id: clientId,
    project_id: projectId,
    permission_overrides_json: '{"restrictBilling":true}',
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };
}

/** @param {InstanceType<typeof Database>} database @param {string} label */
function assertDatabaseHealth(database, label) {
  assert.equal(database.pragma("integrity_check", { simple: true }), "ok", `${label} should pass SQLite integrity_check`);
  assert.deepEqual(database.pragma("foreign_key_check"), [], `${label} should have zero foreign-key violations`);
}
