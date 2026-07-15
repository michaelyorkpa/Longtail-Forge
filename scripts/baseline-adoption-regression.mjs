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
  ]);
}

async function assertExistingUserPreserved() {
  const rows = await querySql(`
SELECT username, display_name, user_status
FROM users
WHERE user_id = 'baseline-adoption-user';
`);

  assert.deepEqual(rows[0], {
    username: "baseline-adoption@example.test",
    display_name: "Baseline Adoption User",
    user_status: "active",
  });
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0].integrity_check, "ok");
}
