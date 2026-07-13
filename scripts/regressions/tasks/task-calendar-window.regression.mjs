export const regressionMeta = Object.freeze({
  id: "tasks.task-calendar-window",
  area: "tasks",
  tier: "focused",
  tags: ["bounded-query", "calendar", "permissions", "reminders", "tasks"],
  description: "Proves the task calendar-window contract: bounded-range enforcement, workspace and permission scoping without cross-workspace or unreadable-task leaks, reminder-marker correctness including the lookahead and completed/archived exclusions, client/project filter scoping, and disabled-module read behavior.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-calendar-window-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-calendar-window.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Calendar-Window-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql } = await import("../../../src/db/index.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");

const WINDOW_START = "2026-08-01";
const WINDOW_END = "2026-08-31";

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertBoundedRangeEnforcement(session);
  const result = await tasksService.calendarWindow(session, { start: WINDOW_START, end: WINDOW_END });
  assertWorkspaceScoping(result, fixtures);
  assertCalendarRowContract(result, fixtures);
  assertReminderMarkers(result, fixtures);
  await assertScopedPermissionFiltering(fixtures);
  await assertClientProjectFilters(session, fixtures);
  await assertDisabledModuleRead(session, fixtures);
  await assertIntegrity();

  console.log("Task calendar window regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createFixtures(session) {
  const now = new Date().toISOString();
  const workspaceId = session.workspace_id;
  const clients = {
    alpha: { id: `client-alpha-${randomUUID()}`, name: "Calendar Alpha Client" },
    beta: { id: `client-beta-${randomUUID()}`, name: "Calendar Beta Client" },
  };
  const projects = {
    alpha: { id: `project-alpha-${randomUUID()}`, clientId: clients.alpha.id, name: "Calendar Alpha Project" },
    beta: { id: `project-beta-${randomUUID()}`, clientId: clients.beta.id, name: "Calendar Beta Project" },
  };
  const scopedUser = {
    userId: `calendar-scoped-user-${randomUUID()}`,
    username: `calendar-scoped-${randomUUID()}@example.test`,
  };
  const otherWorkspaceId = `workspace-calendar-other-${randomUUID()}`;

  await runSql(`
${clientInsertSql(workspaceId, clients.alpha, now)}
${clientInsertSql(workspaceId, clients.beta, now)}
${projectInsertSql(workspaceId, projects.alpha, now)}
${projectInsertSql(workspaceId, projects.beta, now)}
${userInsertSql(workspaceId, scopedUser)}
${membershipInsertSql(workspaceId, scopedUser, now)}
${assignmentInsertSql(workspaceId, scopedUser.userId, "project_user", "project", projects.alpha.id, now)}
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES ('${otherWorkspaceId}', 'Calendar Other Workspace', 'Active', 'business', '${session.user_id}', '${now}', '${now}');
`);

  const alphaTask = (await tasksService.create({
    title: "Calendar alpha project task",
    client_id: clients.alpha.id,
    project_id: projects.alpha.id,
    due_date: "2026-08-12",
    priority: "urgent",
  }, session)).task;
  const betaTask = (await tasksService.create({
    title: "Calendar beta project task",
    client_id: clients.beta.id,
    project_id: projects.beta.id,
    due_date: "2026-08-12",
  }, session)).task;
  const timedTask = (await tasksService.create({
    title: "Calendar timed task",
    due_date: "2026-08-13",
    due_time: "14:00",
    priority: "high",
    assignee_ids: [session.user_id],
  }, session)).task;
  const completedTask = (await tasksService.create({
    title: "Calendar completed task",
    due_date: "2026-08-12",
  }, session)).task;
  await tasksService.update(completedTask.task_id, { title: completedTask.title, status: "complete" }, session);
  const archivedTask = (await tasksService.create({
    title: "Calendar archived task",
    due_date: "2026-08-12",
  }, session)).task;
  await tasksService.archive(archivedTask.task_id, session);
  const lookaheadTask = (await tasksService.create({
    title: "Calendar lookahead task",
    due_date: "2026-09-02",
  }, session)).task;
  const crossWorkspaceTask = await tasksRepository.create(otherWorkspaceId, {
    task_id: `task-cross-workspace-${randomUUID()}`,
    title: "Calendar cross-workspace task",
    status: "open",
    priority: "normal",
    billable: "no",
    due_date: "2026-08-12",
    due_timezone: "America/New_York",
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  return {
    alphaTask,
    archivedTask,
    betaTask,
    clients,
    completedTask,
    crossWorkspaceTask,
    lookaheadTask,
    otherWorkspaceId,
    projects,
    scopedUser,
    timedTask,
    workspaceId,
    session,
  };
}

async function assertBoundedRangeEnforcement(session) {
  await assert.rejects(
    tasksService.calendarWindow(session, { start: "2026-08-10", end: "2026-08-01" }),
    (error) => error.statusCode === 400 && /on or after the start date/.test(error.message),
    "end before start must be rejected with 400",
  );
  await assert.rejects(
    tasksService.calendarWindow(session, { start: "2026-08-01", end: "2026-11-02" }),
    (error) => error.statusCode === 400 && /cannot exceed 93 days/.test(error.message),
    "windows wider than 93 days must be rejected with 400",
  );

  const maxWindow = await tasksService.calendarWindow(session, { start: "2026-08-01", end: "2026-11-01" });
  assert.deepEqual(maxWindow.range, { startDate: "2026-08-01", endDate: "2026-11-01" }, "a 93-day window must be accepted");
}

function assertWorkspaceScoping(result, fixtures) {
  const rowIds = result.tasks.map((row) => row.task_id);
  const markerIds = result.reminders.map((marker) => marker.task_id);

  assert.ok(!rowIds.includes(fixtures.crossWorkspaceTask.task_id), "cross-workspace tasks must not leak into calendar rows");
  assert.ok(!markerIds.includes(fixtures.crossWorkspaceTask.task_id), "cross-workspace tasks must not leak into reminder markers");
  assert.ok(!rowIds.includes(fixtures.archivedTask.task_id), "archived tasks must not appear as calendar rows");
  assert.ok(!rowIds.includes(fixtures.lookaheadTask.task_id), "tasks due after the window must not appear as calendar rows");
  assert.ok(rowIds.includes(fixtures.completedTask.task_id), "completed tasks stay visible as history rows");
}

function assertCalendarRowContract(result, fixtures) {
  const row = result.tasks.find((candidate) => candidate.task_id === fixtures.timedTask.task_id);

  assert.ok(row, "the timed task should be a calendar row");
  for (const field of ["id", "title", "status", "priority", "due_date", "due_time", "due_at_utc", "client_id", "client_name", "project_id", "project_name", "assignee_ids", "assignees", "allDay", "startDate", "endDate", "startDateTimeUtc", "url", "source"]) {
    assert.ok(field in row, `calendar rows must carry ${field}`);
  }
  assert.equal(row.allDay, false, "timed tasks are not all-day entries");
  assert.equal(row.source.type, "task");
  assert.ok(row.url.includes(fixtures.timedTask.task_id), "rows must link back to their task");
  assert.equal(row.assignees.length, 1, "rows must carry the assignee summary");
  assert.ok(row.assignees[0].displayName, "assignee summaries must carry display names");

  const alphaRow = result.tasks.find((candidate) => candidate.task_id === fixtures.alphaTask.task_id);
  assert.equal(alphaRow.allDay, true, "date-only tasks are all-day entries");
  assert.equal(alphaRow.client_name, fixtures.clients.alpha.name, "rows must carry readable client context");
  assert.equal(alphaRow.project_name, fixtures.projects.alpha.name, "rows must carry readable project context");
}

function assertReminderMarkers(result, fixtures) {
  const markersByTask = new Map();
  for (const marker of result.reminders) {
    markersByTask.set(marker.task_id, [...(markersByTask.get(marker.task_id) || []), marker]);
  }

  // Default date-only policy fires 3 days and 1 day before the due date in
  // the session timezone (America/New_York fixture default).
  const alphaMarkers = markersByTask.get(fixtures.alphaTask.task_id) || [];
  assert.deepEqual(alphaMarkers.map((marker) => marker.date), ["2026-08-09", "2026-08-11"], "date-only reminders fire 3d and 1d before the due date");
  assert.ok(alphaMarkers.every((marker) => marker.due_kind === "date_only"));

  // Default date-time policy fires 24 hours and 2 hours before the due time.
  const timedMarkers = markersByTask.get(fixtures.timedTask.task_id) || [];
  assert.deepEqual(timedMarkers.map((marker) => marker.date), ["2026-08-12", "2026-08-13"], "date-time reminders fire 24h and 2h before the due time");
  assert.ok(timedMarkers.every((marker) => marker.due_kind === "date_time"));

  // Completed and archived tasks never fire.
  assert.ok(!markersByTask.has(fixtures.completedTask.task_id), "completed tasks must not produce reminder markers");
  assert.ok(!markersByTask.has(fixtures.archivedTask.task_id), "archived tasks must not produce reminder markers");

  // The lookahead surfaces only the in-window firing (3d before 2026-09-02);
  // the 1d firing lands after the window and the task itself is not a row.
  const lookaheadMarkers = markersByTask.get(fixtures.lookaheadTask.task_id) || [];
  assert.deepEqual(lookaheadMarkers.map((marker) => marker.date), ["2026-08-30"], "lookahead reminders surface only in-window firings");

  for (const marker of result.reminders) {
    for (const field of ["task_id", "title", "date", "reminder_at_utc", "due_at_utc", "due_kind", "offset_minutes", "source", "url"]) {
      assert.ok(field in marker, `reminder markers must carry ${field}`);
    }
  }

  const sorted = [...result.reminders].sort((first, second) => first.reminder_at_utc.localeCompare(second.reminder_at_utc)
    || first.task_id.localeCompare(second.task_id));
  assert.deepEqual(result.reminders, sorted, "reminder markers must be sorted by fire time");
}

async function assertScopedPermissionFiltering(fixtures) {
  const scopedSession = {
    active_workspace_id: fixtures.workspaceId,
    home_workspace_id: fixtures.workspaceId,
    timezone: "America/New_York",
    user_id: fixtures.scopedUser.userId,
    username: fixtures.scopedUser.username,
    workspace_id: fixtures.workspaceId,
  };
  const scoped = await tasksService.calendarWindow(scopedSession, { start: WINDOW_START, end: WINDOW_END });
  const rowIds = scoped.tasks.map((row) => row.task_id);
  const markerIds = scoped.reminders.map((marker) => marker.task_id);

  assert.ok(rowIds.includes(fixtures.alphaTask.task_id), "a project-scoped user reads tasks inside the granted project scope");
  assert.ok(!rowIds.includes(fixtures.betaTask.task_id), "unreadable tasks must not leak into calendar rows");
  assert.ok(!markerIds.includes(fixtures.betaTask.task_id), "unreadable tasks must not leak into reminder markers");
}

async function assertClientProjectFilters(session, fixtures) {
  const projectScoped = await tasksService.calendarWindow(session, {
    start: WINDOW_START,
    end: WINDOW_END,
    projectId: fixtures.projects.alpha.id,
  });
  const projectRowIds = projectScoped.tasks.map((row) => row.task_id);
  assert.ok(projectRowIds.includes(fixtures.alphaTask.task_id), "the project filter keeps in-scope tasks");
  assert.ok(!projectRowIds.includes(fixtures.betaTask.task_id), "the project filter drops other projects");
  assert.ok(!projectRowIds.includes(fixtures.timedTask.task_id), "the project filter drops project-less tasks");
  assert.ok(
    projectScoped.reminders.every((marker) => marker.task_id !== fixtures.betaTask.task_id),
    "reminder markers must follow the project filter",
  );

  const clientScoped = await tasksService.calendarWindow(session, {
    start: WINDOW_START,
    end: WINDOW_END,
    clientId: fixtures.clients.beta.id,
  });
  const clientRowIds = clientScoped.tasks.map((row) => row.task_id);
  assert.ok(clientRowIds.includes(fixtures.betaTask.task_id), "the client filter keeps in-scope tasks");
  assert.ok(!clientRowIds.includes(fixtures.alphaTask.task_id), "the client filter drops other clients");
}

async function assertDisabledModuleRead(session, fixtures) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    enabled_at = NULL,
    disabled_at = '${now}',
    updated_at = '${now}'
WHERE workspace_id = '${fixtures.workspaceId}'
  AND module_id = 'tasks';
`);

  const disabled = await tasksService.calendarWindow(session, { start: WINDOW_START, end: WINDOW_END });
  assert.equal(disabled.source_enabled, false, "a disabled Tasks module must report source_enabled false");
  assert.ok(
    disabled.tasks.some((row) => row.task_id === fixtures.alphaTask.task_id),
    "calendar reads stay available when the module is disabled, matching other Tasks reads",
  );

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    enabled_at = '${now}',
    disabled_at = NULL,
    updated_at = '${now}'
WHERE workspace_id = '${fixtures.workspaceId}'
  AND module_id = 'tasks';
`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function userInsertSql(workspaceId, user) {
  return `
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, alt_email, timezone,
  password, theme_mode, user_status, protected_user, active_workspace_id
)
VALUES (
  ${sqlText(user.userId)}, ${sqlText(workspaceId)}, ${sqlText(user.username)}, ${sqlText(user.username)}, NULL,
  'America/New_York', 'fixture-password', 'light', 'active', 'no', ${sqlText(workspaceId)}
);`;
}

function membershipInsertSql(workspaceId, user, now) {
  return `
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(user.userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  const scopedClientId = scopeType === "client" ? sqlText(scopeId) : "NULL";
  const scopedProjectId = scopeType === "project" ? sqlText(scopeId) : "NULL";

  return `
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(userId)}, ${sqlText(roleId)}, ${sqlText(scopeType)}, ${sqlText(scopeId)},
  ${scopedClientId}, ${scopedProjectId}, NULL, ${sqlText(now)}, ${sqlText(now)}
);`;
}

function clientInsertSql(workspaceId, client, now) {
  return `
INSERT INTO clients (
  id, workspace_id, name, status, billable, billing_rate, billing_period_type,
  billing_period_start_day, billing_rounding_enabled, billing_rounding_increment,
  billing_contact_name, billing_contact_email, billing_contact_alternate_name,
  billing_contact_alternate_email, billing_contact_phone_number,
  billing_contact_alternate_phone_number, billing_contact_street_address_1,
  billing_contact_street_address_2, billing_contact_city, billing_contact_state,
  billing_contact_zip_code, created_at, updated_at
)
VALUES (
  ${sqlText(client.id)}, ${sqlText(workspaceId)}, ${sqlText(client.name)}, 'Active', 'yes', NULL, NULL,
  NULL, NULL, NULL,
  '', '', '',
  '', '',
  '', '',
  '', '', '',
  '', ${sqlText(now)}, ${sqlText(now)}
);`;
}

function projectInsertSql(workspaceId, project, now) {
  return `
INSERT INTO projects (
  id, workspace_id, client_id, name, status, billable, billing_rate,
  billing_period_type, billing_period_start_day, billing_rounding_enabled,
  billing_rounding_increment, created_at, updated_at
)
VALUES (
  ${sqlText(project.id)}, ${sqlText(workspaceId)}, ${project.clientId ? sqlText(project.clientId) : "NULL"}, ${sqlText(project.name)}, 'Active', 'yes', NULL,
  NULL, NULL, NULL,
  NULL, ${sqlText(now)}, ${sqlText(now)}
);`;
}
