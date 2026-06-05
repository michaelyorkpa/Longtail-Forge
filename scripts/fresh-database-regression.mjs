import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-fresh-database-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-fresh-database-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Fresh-Database-Test-Password-123!";

const { initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertFreshBaselineMarker();
  await assertCurrentTableSet();
  await assertCurrentIndexes();
  await assertSeedRows();
  await assertIntegrity();
  console.log("Fresh database regression passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertFreshBaselineMarker() {
  const migrations = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
ORDER BY version;
`);
  const historicalRows = migrations.filter((migration) => {
    const version = Number.parseInt(migration.version, 10);
    return /^\d+$/.test(migration.version) && Number.isInteger(version) && version <= 31;
  });

  assert.equal(migrations.length, 2, "fresh database should record the baseline plus current future migrations");
  assert.deepEqual(migrations[0], {
    version: "0.31.22",
    module_id: "core",
    name: "fresh_start_database",
  });
  assert.deepEqual(migrations[1], {
    version: "032",
    module_id: "core",
    name: "project_defaults_and_workspace_reporting",
  });
  assert.deepEqual(historicalRows, [], "fresh database should not record old incremental migrations");
}

async function assertCurrentTableSet() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`);
  const tableNames = rows.map((row) => row.name);
  const expectedTables = [
    "active_work_timers",
    "api_key_scopes",
    "api_keys",
    "app_settings",
    "audit_logs",
    "clients",
    "modules",
    "permissions",
    "projects",
    "role_permissions",
    "roles",
    "schema_migrations",
    "sessions",
    "task_assignees",
    "task_recurrence_assignees",
    "task_recurrence_templates",
    "task_reminder_offsets",
    "tasks",
    "time_entries",
    "user_role_assignments",
    "user_workspace_creation_permissions",
    "user_workspaces",
    "users",
    "workspace_modules",
    "workspace_settings",
    "workspaces",
  ];

  assert.deepEqual(tableNames, expectedTables);
}

async function assertCurrentIndexes() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_active_work_timers_user_slot',
    'idx_active_work_timers_source',
    'idx_api_keys_hash',
    'idx_tasks_workspace_due_date',
    'idx_time_entries_workspace_task',
    'idx_user_workspaces_workspace_status',
    'idx_workspace_modules_workspace_status'
  )
ORDER BY name;
`);

  assert.deepEqual(rows.map((row) => row.name), [
    "idx_active_work_timers_source",
    "idx_active_work_timers_user_slot",
    "idx_api_keys_hash",
    "idx_tasks_workspace_due_date",
    "idx_time_entries_workspace_task",
    "idx_user_workspaces_workspace_status",
    "idx_workspace_modules_workspace_status",
  ]);
}

async function assertSeedRows() {
  const [workspaces, users, modules, roles, permissions, workspaceModules, appSettings] = await Promise.all([
    querySql("SELECT COUNT(*) AS count FROM workspaces;"),
    querySql("SELECT COUNT(*) AS count FROM users WHERE protected_user = 'yes';"),
    querySql("SELECT COUNT(*) AS count FROM modules;"),
    querySql("SELECT COUNT(*) AS count FROM roles WHERE role_id IN ('super_admin', 'workspace_admin');"),
    querySql("SELECT COUNT(*) AS count FROM permissions WHERE permission_id IN ('workspace_settings.manage', 'tasks.view', 'time_entries.create');"),
    querySql("SELECT COUNT(*) AS count FROM workspace_modules;"),
    querySql("SELECT COUNT(*) AS count FROM app_settings;"),
  ]);

  assert.equal(Number(workspaces[0].count), 1, "fresh startup should create a default workspace");
  assert.equal(Number(users[0].count), 1, "fresh startup should create one protected super admin");
  assert.ok(Number(modules[0].count) >= 4, "fresh startup should sync registered modules");
  assert.equal(Number(roles[0].count), 2, "fresh baseline should seed current core roles");
  assert.equal(Number(permissions[0].count), 3, "fresh startup should seed core and module permissions");
  assert.ok(Number(workspaceModules[0].count) >= 4, "fresh startup should create workspace module status rows");
  assert.ok(Number(appSettings[0].count) >= 3, "fresh startup should seed app settings");
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");

  assert.equal(rows[0]?.integrity_check, "ok");
}
