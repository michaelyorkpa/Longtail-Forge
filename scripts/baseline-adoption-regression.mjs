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

  assert.deepEqual(rows, [{
    version: "0.33.5.18.6.5.4",
    module_id: "core",
    name: "current_fresh_start_database",
  }]);
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
