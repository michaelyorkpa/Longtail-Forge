import assert from "node:assert/strict";
import { initializeDatabase, querySql, runSql, sqlText } from "../src/db/index.js";
import { searchIndexRebuildService } from "../src/services/search-index-rebuild.service.js";
import { searchService } from "../src/services/search.service.js";

await initializeDatabase();

let checks = 0;
const workspaceOne = "search-lifecycle-workspace-1";
const workspaceTwo = "search-lifecycle-workspace-2";
const now = "2026-06-08T18:00:00.000Z";
const frameworkHelpArticleCount = 13;
const expectedWorkspaceIndexRows = frameworkHelpArticleCount + 4;

await seedWorkspace(workspaceOne, {
  clientId: "search-life-client-1",
  projectId: "search-life-project-1",
  taskId: "search-life-task-1",
  timeEntryId: "search-life-time-1",
  tagId: "search-life-tag-1",
  title: "Lifecycle Alpha Task",
});
await seedWorkspace(workspaceTwo, {
  clientId: "search-life-client-2",
  projectId: "search-life-project-2",
  taskId: "search-life-task-2",
  timeEntryId: "search-life-time-2",
  tagId: "search-life-tag-2",
  title: "Lifecycle Alpha Task",
});

await checkAsync("initial searchable modules populate workspace-scoped index rows", async () => {
  await clearWorkspaceSearchRows(workspaceOne);
  await clearWorkspaceSearchRows(workspaceTwo);

  const firstSummary = await searchIndexRebuildService.rebuildWorkspace({ audit: false, workspaceId: workspaceOne });
  const secondSummary = await searchIndexRebuildService.rebuildWorkspace({ audit: false, workspaceId: workspaceTwo });
  const firstRows = await readWorkspaceSearchRows(workspaceOne);
  const secondRows = await readWorkspaceSearchRows(workspaceTwo);

  assert.equal(firstSummary.counts.scanned, expectedWorkspaceIndexRows);
  assert.equal(secondSummary.counts.scanned, expectedWorkspaceIndexRows);
  assert.equal(firstRows.length, expectedWorkspaceIndexRows);
  assert.equal(secondRows.length, expectedWorkspaceIndexRows);
  assert.equal(
    firstRows.filter((row) => row.module_id === "framework" && row.record_type === "help_article").length,
    frameworkHelpArticleCount,
  );
  for (const expectedType of [
    "client-projects:client",
    "client-projects:project",
    "tasks:task",
    "time-tracking:time_entry",
  ]) {
    assert.ok(firstRows.some((row) => `${row.module_id}:${row.record_type}` === expectedType), `${expectedType} should be indexed`);
  }
});

await checkAsync("search index rebuild stays idempotent", async () => {
  await searchIndexRebuildService.rebuildWorkspace({ audit: false, workspaceId: workspaceOne });
  await searchIndexRebuildService.rebuildWorkspace({ audit: false, workspaceId: workspaceOne });
  const rows = await querySql(`
SELECT COUNT(*) AS row_count, COUNT(DISTINCT search_index_id) AS distinct_count
FROM search_index
WHERE workspace_id = ${sqlText(workspaceOne)};
`);

  assert.equal(Number(rows[0].row_count), expectedWorkspaceIndexRows);
  assert.equal(Number(rows[0].distinct_count), expectedWorkspaceIndexRows);
});

await checkAsync("search results update after record edits are re-indexed", async () => {
  await runSql(`
UPDATE tasks
SET title = 'Lifecycle Beta Task',
    updated_at = ${sqlText("2026-06-08T18:10:00.000Z")}
WHERE workspace_id = ${sqlText(workspaceOne)}
  AND task_id = 'search-life-task-1';
`);

  const reindexResult = await searchService.reindexSearchRecord({
    workspaceId: workspaceOne,
    moduleId: "tasks",
    recordType: "task",
    recordId: "search-life-task-1",
  });
  const oldResults = await executeWorkspaceSearch(workspaceOne, { text: "Lifecycle Alpha Task", moduleIds: ["tasks"] });
  const newResults = await executeWorkspaceSearch(workspaceOne, { text: "Lifecycle Beta Task", moduleIds: ["tasks"] });

  assert.equal(reindexResult.ok, true);
  assert.deepEqual(oldResults.results.map((result) => result.record_id), []);
  assert.deepEqual(newResults.results.map((result) => result.record_id), ["search-life-task-1"]);
});

await checkAsync("search indexing remains workspace-scoped", async () => {
  const results = await executeWorkspaceSearch(workspaceOne, { text: "Lifecycle Alpha Task" });
  const recordIds = results.results.map((result) => result.record_id);

  assert.ok(!recordIds.includes("search-life-task-2"));
  assert.ok(results.results.every((result) => result.workspace_id === workspaceOne));
});

await checkAsync("disabled-module records are hidden through active search targets", async () => {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled', disabled_at = ${sqlText(now)}, updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceOne)}
  AND module_id = 'tasks';
`);

  const disabledResults = await executeWorkspaceSearch(workspaceOne, {
    text: "Lifecycle Beta Task",
    moduleIds: ["tasks"],
  });
  const canonicalRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceOne)}
  AND module_id = 'tasks'
  AND record_type = 'task';
`);

  assert.deepEqual(disabledResults.results, []);
  assert.deepEqual(canonicalRows, [{ record_id: "search-life-task-1" }]);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled', disabled_at = NULL, updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceOne)}
  AND module_id = 'tasks';
`);
});

await checkAsync("permission-sensitive search target and exact filters apply before results are returned", async () => {
  const request = await composeWorkspaceSearch(workspaceOne, {
    moduleIds: ["tasks"],
    projectId: "search-life-project-1",
    tagIds: ["search-life-tag-1"],
    text: "Lifecycle Beta Task",
  });
  const matchingResults = await searchService.executeSearch(request);
  const wrongTagResults = await executeWorkspaceSearch(workspaceOne, {
    moduleIds: ["tasks"],
    projectId: "search-life-project-1",
    tagIds: ["missing-tag"],
    text: "Lifecycle Beta Task",
  });

  assert.ok(request.targets.every((target) => target.requiredReadPermission));
  assert.ok(request.targets.every((target) => target.permissionFilterRequired === true));
  assert.deepEqual(matchingResults.results.map((result) => result.record_id), ["search-life-task-1"]);
  assert.deepEqual(wrongTagResults.results, []);
});

console.log(`Search lifecycle regression passed ${checks} checks.`);

async function composeWorkspaceSearch(workspaceId, filters) {
  return searchService.composePermissionSafeSearchRequest({
    session: {
      workspace_id: workspaceId,
      user_id: `${workspaceId}-user`,
    },
    filters,
  });
}

async function executeWorkspaceSearch(workspaceId, filters) {
  return searchService.executeSearch(await composeWorkspaceSearch(workspaceId, filters));
}

async function clearWorkspaceSearchRows(workspaceId) {
  await runSql(`
DELETE FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function readWorkspaceSearchRows(workspaceId) {
  return querySql(`
SELECT module_id, record_type, record_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY module_id, record_type, record_id;
`);
}

async function seedWorkspace(workspaceId, fixture) {
  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, ${sqlText(`Search Lifecycle ${workspaceId}`)}, 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

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
  ${sqlText(`${workspaceId}-user`)},
  ${sqlText(workspaceId)},
  ${sqlText(`${workspaceId}@example.test`)},
  'Search Lifecycle User',
  NULL,
  'America/New_York',
  'hash',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

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
  ${sqlText(fixture.clientId)},
  ${sqlText(workspaceId)},
  NULL,
  ${sqlText(`Lifecycle Client ${fixture.clientId}`)},
  'Active',
  'yes',
  '150',
  'monthly',
  1,
  1,
  '0.25',
  'Lifecycle Contact',
  'lifecycle@example.test',
  '',
  '',
  '555-0188',
  '',
  '1 Lifecycle Way',
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
  ${sqlText(fixture.projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(fixture.clientId)},
  NULL,
  ${sqlText(`Lifecycle Project ${fixture.projectId}`)},
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
  ${sqlText(fixture.taskId)},
  ${sqlText(workspaceId)},
  ${sqlText(fixture.clientId)},
  ${sqlText(fixture.projectId)},
  ${sqlText(fixture.title)},
  'Lifecycle regression task body.',
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
  ${sqlText(`${workspaceId}-user`)},
  ${sqlText(`${workspaceId}-user`)},
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
  ${sqlText(fixture.timeEntryId)},
  ${sqlText(workspaceId)},
  ${sqlText(`${workspaceId}-user`)},
  ${sqlText(fixture.clientId)},
  ${sqlText(`Lifecycle Client ${fixture.clientId}`)},
  ${sqlText(fixture.projectId)},
  ${sqlText(`Lifecycle Project ${fixture.projectId}`)},
  ${sqlText(fixture.taskId)},
  ${sqlText(`Lifecycle time entry ${fixture.timeEntryId}`)},
  '2026-06-08T17:00:00.000Z',
  '2026-06-08T18:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO tags (tag_id, workspace_id, name, slug, description, color, status, created_at, updated_at)
VALUES (
  ${sqlText(fixture.tagId)},
  ${sqlText(workspaceId)},
  ${sqlText(`Lifecycle Tag ${fixture.tagId}`)},
  ${sqlText(`${fixture.tagId}-slug`)},
  '',
  NULL,
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source,
  created_at
)
VALUES (
  ${sqlText(`${fixture.tagId}-task-assignment`)},
  ${sqlText(workspaceId)},
  ${sqlText(fixture.tagId)},
  'task',
  ${sqlText(fixture.taskId)},
  'manual',
  ${sqlText(now)}
);
`);
}

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  checks += 1;
}
