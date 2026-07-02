import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeDatabase, querySql, runSql, sqlText } from "../src/db/index.js";
import { searchIndexRebuildService } from "../src/services/search-index-rebuild.service.js";

await initializeDatabase();

let checks = 0;
const workspaceId = "search-rebuild-workspace";
const now = "2026-06-08T16:00:00.000Z";
const frameworkHelpArticleCount = 13;
const moduleHelpArticleCount = 3;
const expectedWorkspaceIndexRows = frameworkHelpArticleCount + moduleHelpArticleCount + 4;

await seedWorkspace();

await checkAsync("workspace rebuild indexes initial module records without duplicating rows", async () => {
  await runSql(`DELETE FROM search_index WHERE workspace_id = ${sqlText(workspaceId)};`);

  const first = await searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    workspaceId,
  });
  const second = await searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    workspaceId,
  });
  const rows = await readIndexedRows();

  assert.equal(first.counts.scanned, expectedWorkspaceIndexRows);
  assert.equal(first.counts.indexed, expectedWorkspaceIndexRows);
  assert.equal(first.counts.failed, 0);
  assert.equal(second.counts.scanned, expectedWorkspaceIndexRows);
  assert.equal(second.counts.indexed, expectedWorkspaceIndexRows);
  assert.equal(rows.length, expectedWorkspaceIndexRows);
  assert.equal(
    rows.filter((row) => row.module_id === "framework" && row.record_type === "help_article").length,
    frameworkHelpArticleCount,
  );
  assert.equal(
    rows.filter((row) => row.module_id === "tasks" && row.record_type === "help_article").length,
    1,
  );
  assert.equal(
    rows.filter((row) => row.module_id === "time-tracking" && row.record_type === "help_article").length,
    2,
  );
  const helpCenterRow = rows.find((row) => row.module_id === "framework" && row.record_type === "help_article" && row.record_id === "framework.help-center");
  assert.ok(helpCenterRow, "framework Help Center search row should be indexed");
  assert.equal(helpCenterRow.source, "Help");
  assert.match(helpCenterRow.body, /in-app product manual/);
  assert.doesNotMatch(helpCenterRow.body, /^#\s/m);
  for (const expectedType of [
    "client-projects:client",
    "client-projects:project",
    "tasks:task",
    "time-tracking:time_entry",
  ]) {
    assert.ok(rows.some((row) => `${row.module_id}:${row.record_type}` === expectedType), `${expectedType} should be indexed`);
  }
});

await checkAsync("module rebuild stays scoped and removes stale canonical rows", async () => {
  await insertStaleSearchRow("tasks", "task", "stale-task-1");

  const result = await searchIndexRebuildService.rebuildModule({
    audit: false,
    moduleId: "tasks",
    workspaceId,
  });
  const taskRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'tasks'
  AND record_type = 'task'
ORDER BY record_id;
`);
  const allRows = await readIndexedRows();

  assert.equal(result.moduleId, "tasks");
  assert.equal(result.counts.scanned, 2);
  assert.equal(result.counts.removed, 1);
  assert.equal(result.targets.length, 2);
  assert.deepEqual(result.targets.map((target) => target.recordType).sort(), ["help_article", "task"]);
  assert.deepEqual(taskRows, [{ record_id: "search-rebuild-task-1" }]);
  assert.equal(allRows.length, expectedWorkspaceIndexRows);
});

await checkAsync("dry-run rebuild reports skipped work and leaves stale rows untouched", async () => {
  await insertStaleSearchRow("time-tracking", "time_entry", "stale-time-entry-1");

  const result = await searchIndexRebuildService.rebuildModule({
    audit: false,
    dryRun: true,
    moduleId: "time-tracking",
    workspaceId,
  });
  const staleRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'time-tracking'
  AND record_type = 'time_entry'
  AND record_id = 'stale-time-entry-1';
`);

  assert.equal(result.dryRun, true);
  assert.equal(result.counts.indexed, 0);
  assert.equal(result.counts.removed, 0);
  assert.equal(result.counts.skipped, 8);
  assert.deepEqual(staleRows, [{ record_id: "stale-time-entry-1" }]);
});

await checkAsync("workspace rebuild excludes disabled modules from active rebuild targets", async () => {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled', disabled_at = ${sqlText(now)}, updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'time-tracking';
`);

  const result = await searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    dryRun: true,
    workspaceId,
  });

  assert.ok(result.targets.every((target) => target.moduleId !== "time-tracking"));

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled', disabled_at = NULL, updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'time-tracking';
`);
});

check("protected rebuild route is permission-gated and active-workspace scoped", () => {
  const routeText = readFileSync("src/routes/search-index.routes.js", "utf8");

  assert.match(routeText, /workspace_settings\.manage/);
  assert.match(routeText, /queueSearchIndexRebuild/);
  assert.match(routeText, /workspaceId:\s*request\.session\.workspace_id/);
  assert.match(routeText, /response\.status\(202\)/);
  assert.doesNotMatch(routeText, /all-workspaces|rebuildApp|rebuildWorkspace|rebuildModule|payload\.workspaceId/);
});

console.log(`Search rebuild regression passed ${checks} checks.`);

async function seedWorkspace() {
  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Rebuild Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES
  (${sqlText(workspaceId)}, 'client-projects', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspaceId)}, 'tasks', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspaceId)}, 'time-tracking', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)})
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;

INSERT OR REPLACE INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  'search-rebuild-client-1',
  ${sqlText(workspaceId)},
  NULL,
  'Rebuild Client',
  'Active',
  'yes',
  '150',
  'monthly',
  1,
  1,
  '0.25',
  'Rhea Rebuild',
  'rhea@example.test',
  '',
  '',
  '555-0199',
  '',
  '1 Rebuild Way',
  '',
  'Forge City',
  'PA',
  '17000',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  task_default_priority,
  task_default_status,
  task_default_sort_order_json,
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  'search-rebuild-project-1',
  ${sqlText(workspaceId)},
  'search-rebuild-client-1',
  NULL,
  'Rebuild Project',
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority"]',
  'creator',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO users (
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
  'search-rebuild-user-1',
  ${sqlText(workspaceId)},
  'search-rebuild-user@example.test',
  'Search Rebuild User',
  NULL,
  'America/New_York',
  'hash',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT OR REPLACE INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  billable,
  due_date,
  due_time,
  due_timezone,
  due_at_utc,
  source_type,
  source_id,
  archived_at,
  reminder_override_enabled,
  recurrence_template_id,
  recurrence_instance_date,
  completed_at,
  created_by_user_id,
  updated_by_user_id,
  completed_by_user_id,
  archived_by_user_id,
  created_at,
  updated_at
)
VALUES (
  'search-rebuild-task-1',
  ${sqlText(workspaceId)},
  'search-rebuild-client-1',
  'search-rebuild-project-1',
  'Rebuild task',
  'Task indexed by rebuild regression.',
  'open',
  'normal',
  'yes',
  '2026-06-09',
  '',
  'America/New_York',
  NULL,
  'manual',
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  'search-rebuild-user-1',
  'search-rebuild-user-1',
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  'search-rebuild-time-entry-1',
  ${sqlText(workspaceId)},
  'search-rebuild-user-1',
  'search-rebuild-client-1',
  'Rebuild Client',
  'search-rebuild-project-1',
  'Rebuild Project',
  'search-rebuild-task-1',
  'Rebuild implementation time',
  '2026-06-08T15:00:00.000Z',
  '2026-06-08T16:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertStaleSearchRow(moduleId, recordType, recordId) {
  await runSql(`
INSERT OR REPLACE INTO search_index (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  client_id,
  project_id,
  visibility,
  record_status,
  source,
  record_created_at,
  record_updated_at,
  indexed_at
)
VALUES (
  ${sqlText(`${workspaceId}:${moduleId}:${recordType}:${recordId}`)},
  ${sqlText(workspaceId)},
  ${sqlText(moduleId)},
  ${sqlText(recordType)},
  ${sqlText(recordId)},
  'Stale record',
  '',
  '',
  '',
  NULL,
  NULL,
  'normal',
  'active',
  'Regression',
  NULL,
  NULL,
  ${sqlText(now)}
);
`);
}

async function readIndexedRows() {
  return querySql(`
SELECT module_id, record_type, record_id, body, source
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY module_id, record_type, record_id;
`);
}

function check(name, assertion) {
  assert.equal(typeof name, "string");
  assertion();
  checks += 1;
}

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  checks += 1;
}
