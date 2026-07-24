import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-baseline-adoption-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-baseline-adoption.db");
process.env.SUPER_ADMIN_PASSWORD = "Baseline-Adoption-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await simulateCurrentSchemaWithHistoricalMigrationRows();
  await initializeDatabase();
  await assertAdoptedBaseline();
  await assertExistingUserPreserved();
  await assertLegacyProjectAdministratorConverted();
  await assertIntegrity();

  console.log("Baseline adoption regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function simulateCurrentSchemaWithHistoricalMigrationRows() {
  await runSql(`
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS task_recurrence_checklist_items;
DROP TABLE IF EXISTS task_recurrence_note_links;
DROP TABLE IF EXISTS workspace_module_settings;
DROP TABLE IF EXISTS workspace_purge_tombstones;
DROP TABLE IF EXISTS workspace_deletion_lifecycle;
DROP TABLE IF EXISTS workspace_backup_exports;
DROP TABLE IF EXISTS account_export_recovery_qualifications;
DROP TABLE IF EXISTS authentication_throttle_entries;
DROP TABLE IF EXISTS startup_maintenance_runs;
DROP TABLE IF EXISTS private_feed_tokens;

ALTER TABLE tasks DROP COLUMN estimate_minutes;
ALTER TABLE task_recurrence_templates DROP COLUMN estimate_minutes;

ALTER TABLE workspace_settings ADD COLUMN fiscal_year_start_month INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspace_settings ADD COLUMN fiscal_year_start_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspace_settings ADD COLUMN default_billing_rate TEXT;
ALTER TABLE workspace_settings ADD COLUMN billing_period_type TEXT NOT NULL DEFAULT 'calendar_month';
ALTER TABLE workspace_settings ADD COLUMN billing_period_start_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspace_settings ADD COLUMN rounding_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_settings ADD COLUMN rounding_increment TEXT NOT NULL DEFAULT 'none';
ALTER TABLE workspace_settings ADD COLUMN task_timers_enabled INTEGER NOT NULL DEFAULT 1;

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

ALTER TABLE users
RENAME TO users_with_markdown_link_preference;

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  home_workspace_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  alt_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  password TEXT NOT NULL,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  user_status TEXT NOT NULL DEFAULT 'active',
  protected_user TEXT NOT NULL DEFAULT 'no',
  active_workspace_id TEXT,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id)
);

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
SELECT
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
FROM users_with_markdown_link_preference;

DROP TABLE users_with_markdown_link_preference;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;

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
SELECT
  'baseline-adoption-user',
  workspace_id,
  'baseline-adoption@example.test',
  'Baseline Adoption User',
  NULL,
  'America/New_York',
  'legacy-hash',
  'light',
  'active',
  'no',
  workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;

UPDATE roles
SET description = 'Controls projects and project assignments for one client.',
    assignable_scope_type = 'client'
WHERE role_id = 'project_admin';

INSERT INTO clients (
  id, workspace_id, parent_client_id, name, status, billable,
  billing_rate, billing_period_type, billing_period_start_day,
  billing_rounding_enabled, billing_rounding_increment,
  billing_contact_name, billing_contact_email,
  billing_contact_alternate_name, billing_contact_alternate_email,
  billing_contact_phone_number, billing_contact_alternate_phone_number,
  billing_contact_street_address_1, billing_contact_street_address_2,
  billing_contact_city, billing_contact_state, billing_contact_zip_code,
  created_at, updated_at
)
SELECT
  'baseline-legacy-client', workspace_id, NULL, 'Legacy Scope Client', 'Active', 'yes',
  NULL, NULL, NULL, NULL, NULL,
  '', '', '', '', '', '', '', '', '', '', '',
  '2026-07-16T11:00:00.000Z', '2026-07-16T11:00:00.000Z'
FROM workspaces
ORDER BY created_at
LIMIT 1;

INSERT INTO projects (
  id, workspace_id, client_id, parent_project_id, name, status, billable,
  billing_rate, billing_period_type, billing_period_start_day,
  billing_rounding_enabled, billing_rounding_increment, created_at, updated_at
)
SELECT
  project_id, workspace_id, 'baseline-legacy-client', NULL, project_name, 'Active', 'yes',
  NULL, NULL, NULL, NULL, NULL, created_at, created_at
FROM (
  SELECT 'baseline-legacy-project-a' AS project_id, 'Legacy Project A' AS project_name, '2026-07-16T11:01:00.000Z' AS created_at
  UNION ALL
  SELECT 'baseline-legacy-project-b', 'Legacy Project B', '2026-07-16T11:02:00.000Z'
) AS fixtures
CROSS JOIN (
  SELECT workspace_id
  FROM workspaces
  ORDER BY created_at
  LIMIT 1
) AS target_workspace;

INSERT INTO user_role_assignments (
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
)
SELECT
  'baseline-legacy-project-admin',
  projects.workspace_id,
  'baseline-adoption-user',
  'project_admin',
  'client',
  projects.client_id,
  projects.client_id,
  NULL,
  '{"restrictBilling":true}',
  '2026-07-16T12:00:00.000Z',
  '2026-07-16T13:00:00.000Z'
FROM projects
WHERE projects.client_id = 'baseline-legacy-client'
ORDER BY projects.created_at, projects.id
LIMIT 1;

DELETE FROM schema_migrations;
INSERT INTO schema_migrations (version, module_id, name, checksum, applied_at)
VALUES
  ('063', 'notes', 'task_note_link_context', 'historical-checksum-063', ${sqlText(new Date().toISOString())}),
  ('064', 'notes', 'repair_task_created_primary_context', 'historical-checksum-064', ${sqlText(new Date().toISOString())});
`);
}

async function assertAdoptedBaseline() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
ORDER BY version;
`);

  assert.deepEqual(rows, [
    {
      version: "0.33.5.18.6.5.4",
      module_id: "core",
      name: "current_fresh_start_database",
    },
    {
      version: "065",
      module_id: "core",
      name: "job_outbox_schema",
    },
    {
      version: "066",
      module_id: "core",
      name: "user_markdown_link_preference",
    },
    {
      version: "067",
      module_id: "core",
      name: "user_theme_auto_source",
    },
    {
      version: "068",
      module_id: "core",
      name: "task_recurrence_checklist_items",
    },
    {
      version: "069",
      module_id: "core",
      name: "task_recurrence_note_links",
    },
    {
      version: "070",
      module_id: "core",
      name: "generic_workspace_module_settings",
    },
    {
      version: "071",
      module_id: "core",
      name: "migrate_module_settings_ownership",
    },
    {
      version: "072",
      module_id: "core",
      name: "require_password_change",
    },
    {
      version: "073",
      module_id: "core",
      name: "user_landing_preferences",
    },
    {
      version: "074",
      module_id: "core",
      name: "project_admin_project_scope",
    },
    {
      version: "075",
      module_id: "core",
      name: "workspace_backup_exports",
    },
    {
      version: "076",
      module_id: "core",
      name: "workspace_deletion_lifecycle",
    },
    {
      version: "077",
      module_id: "core",
      name: "workspace_purge_boundary",
    },
    {
      version: "078",
      module_id: "core",
      name: "account_export_recovery",
    },
    {
      version: "079",
      module_id: "core",
      name: "authentication_throttle_entries",
    },
    {
      version: "080",
      module_id: "core",
      name: "startup_maintenance_runs",
    },
    {
      version: "081",
      module_id: "core",
      name: "task_estimate_minutes",
    },
    {
      version: "082",
      module_id: "core",
      name: "user_preferred_calendar_view",
    },
    {
      version: "083",
      module_id: "core",
      name: "task_recurrence_instance_uniqueness",
    },
    {
      version: "084",
      module_id: "core",
      name: "private_feed_tokens",
    },
  ]);
}

async function assertExistingUserPreserved() {
  const rows = await querySql(`
SELECT username, display_name, user_status, password_change_required,
  preferred_login_landing, preferred_workspace_switch_landing
FROM users
WHERE user_id = 'baseline-adoption-user';
`);

  assert.deepEqual(rows[0], {
    username: "baseline-adoption@example.test",
    display_name: "Baseline Adoption User",
    password_change_required: 0,
    preferred_login_landing: "dashboard",
    preferred_workspace_switch_landing: "dashboard",
    user_status: "active",
  });
}

async function assertLegacyProjectAdministratorConverted() {
  const roleRows = await querySql(`
SELECT assignable_scope_type
FROM roles
WHERE role_id = 'project_admin';
`);
  const assignments = await querySql(`
SELECT
  assignments.scope_type,
  assignments.scope_id,
  assignments.client_id,
  assignments.project_id,
  assignments.permission_overrides_json,
  assignments.created_at,
  assignments.updated_at,
  projects.id AS matched_project_id
FROM user_role_assignments AS assignments
LEFT JOIN projects
  ON projects.workspace_id = assignments.workspace_id
  AND projects.id = assignments.scope_id
WHERE assignments.user_id = 'baseline-adoption-user'
  AND assignments.role_id = 'project_admin'
ORDER BY assignments.scope_id;
`);

  assert.equal(roleRows[0]?.assignable_scope_type, "project");
  assert.ok(assignments.length > 0, "legacy Project Administrator scope should expand to existing projects");
  for (const assignment of assignments) {
    assert.equal(assignment.scope_type, "project");
    assert.equal(assignment.scope_id, assignment.project_id);
    assert.equal(assignment.client_id, null);
    assert.equal(assignment.matched_project_id, assignment.scope_id);
    assert.equal(assignment.permission_overrides_json, '{"restrictBilling":true}');
    assert.equal(assignment.created_at, "2026-07-16T12:00:00.000Z");
    assert.equal(assignment.updated_at, "2026-07-16T13:00:00.000Z");
  }
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0].integrity_check, "ok");
  assert.deepEqual(await querySql("PRAGMA foreign_key_check;"), []);
  assert.deepEqual(await querySql("PRAGMA foreign_keys;"), [{ foreign_keys: 1 }], "parent-table rebuild migrations must restore SQLite foreign-key enforcement");
}
