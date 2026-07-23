export const regressionMeta = Object.freeze({
  id: "tasks.dashboard-summary-budgets",
  area: "tasks",
  tier: "focused",
  tags: ["dashboard", "payload", "performance", "permissions", "query-count", "tasks"],
  description: "Pins Tasks dashboard-summary to permission-shaped SQL count groups, bounded ranked row candidates, one precompiled permission evaluator, exact output, and constant statement/enrichment cost as terminal Task volume grows.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("tasks-dashboard-summary-budgets");
const repositorySource = readFileSync("src/modules/tasks/tasks.repo.js", "utf8");
const serviceSource = readFileSync("src/modules/tasks/tasks.service.js", "utf8");
const activeTimersSource = readFileSync("src/modules/time-tracking/active-timers.service.js", "utf8");

const { db } = await import("../../../src/core/database.js");
const { permissionsService } = await import("../../../src/core/permissions.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

const TIMEZONE = "America/New_York";
const TERMINAL_GROWTH_COUNT = 500;

let originalCan = null;
let originalCreatePermissionEvaluator = null;
let originalReadDashboardCandidates = null;
let canCalls = 0;
let evaluatorCalls = 0;
let loadedCandidateCount = 0;

try {
  assertStaticContracts();
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await tasksService.summary(freshSession(session));
  instrumentSummaryPath();

  const small = await measureSummary(session);
  assert.deepEqual(summaryFacts(small.body), expectedSummaryFacts(fixtures), "bounded Dashboard output must match the established count, ordering, and row contracts");
  assert.equal(evaluatorCalls, 1, "dashboard-summary must compile tasks.view exactly once per request");
  assert.equal(canCalls, 0, "dashboard-summary must not fall back to per-row asynchronous permission checks");
  assert.equal(loadedCandidateCount, fixtures.activeTaskIds.length, "only Tasks eligible for one of the five rendered lists should reach enrichment");
  assert.ok(small.statements <= 15, `dashboard-summary issued ${small.statements} statements; budget is 15`);

  await insertTerminalTasks(session, TERMINAL_GROWTH_COUNT);
  const grown = await measureSummary(session);
  const grownFacts = summaryFacts(grown.body);

  assert.deepEqual(
    {
      ...grownFacts,
      counts: {
        ...grownFacts.counts,
        archived: fixtures.expectedCounts.archived,
        completed: fixtures.expectedCounts.completed,
      },
    },
    expectedSummaryFacts(fixtures),
    "terminal volume growth must not change bounded rows, active metrics, or ordering",
  );
  assert.equal(grownFacts.counts.completed, fixtures.expectedCounts.completed + TERMINAL_GROWTH_COUNT / 2);
  assert.equal(grownFacts.counts.archived, fixtures.expectedCounts.archived + TERMINAL_GROWTH_COUNT / 2);
  assert.equal(grown.statements, small.statements, "statement count must remain constant as total workspace Task volume grows");
  assert.equal(evaluatorCalls, 1, "grown dashboard-summary must still compile tasks.view once");
  assert.equal(canCalls, 0, "grown dashboard-summary must not add per-row permission calls");
  assert.equal(loadedCandidateCount, fixtures.activeTaskIds.length, "terminal Task growth must not increase the enriched candidate set");

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("Tasks dashboard-summary budgets regression passed.");
} finally {
  restoreSummaryPath();
  await closeSqlite();
  await fixture.cleanup();
}

function assertStaticContracts() {
  const summarySource = sliceFunction(serviceSource, "async function summary", "async function listWorkItems");
  const listFilterSource = sliceFunction(
    serviceSource,
    "async function filterAndShapeTaskListCandidates",
    "async function queryTasksResult",
  );
  const countSource = sliceFunction(
    repositorySource,
    "async function readDashboardCountGroups",
    "async function readDashboardCandidates",
  );
  const candidateSource = sliceFunction(
    repositorySource,
    "async function readDashboardCandidates",
    "async function readReminderSchedulingCandidates",
  );

  assert.doesNotMatch(summarySource, /queryTasks\(/, "dashboard-summary must not load the whole canonical Task list");
  assert.match(summarySource, /readDashboardCountGroups/, "dashboard-summary must use SQL count groups");
  assert.match(summarySource, /readDashboardCandidates/, "dashboard-summary must load bounded ranked candidates");
  assert.match(listFilterSource, /createPermissionEvaluator\(session, "tasks\.view"\)/, "Task list candidate filtering must precompile tasks.view");
  assert.doesNotMatch(listFilterSource, /await canReadTask/, "Task list candidate filtering must not call permissions once per row");
  assert.match(countSource, /COUNT\(CASE[\s\S]*GROUP BY tasks\.workspace_id, tasks\.client_id, tasks\.project_id/, "Dashboard counts must be SQL aggregates grouped by permission resource");
  assert.match(candidateSource, /ROW_NUMBER\(\) OVER[\s\S]*candidate_rank <= :candidateLimit/, "Dashboard candidate enrichment must be bounded per permission resource");
  assert.match(activeTimersSource, /readWorkspaceSettings\(session\.workspace_id, session\)/, "active-timer shaping must reuse the request settings memo");
}

async function createFixtures(session) {
  const today = localDateKey(new Date(), TIMEZONE);
  const yesterday = addDaysKey(today, -1);
  const inThreeDays = addDaysKey(today, 3);
  const afterHorizon = addDaysKey(today, 10);
  const createTask = async (payload) => (await tasksService.create({
    assignee_ids: [],
    ...payload,
  }, session)).task;

  const overdue = await createTask({
    assignee_ids: [session.user_id],
    due_date: yesterday,
    priority: "urgent",
    title: "Dashboard budget overdue",
  });
  const blocked = await createTask({
    blocked_reason: "Waiting on the review.",
    status: "blocked",
    title: "Dashboard budget blocked",
  });
  const dueToday = await createTask({
    due_date: today,
    priority: "high",
    title: "Dashboard budget due today",
  });
  const dueWeek = await createTask({
    assignee_ids: [session.user_id],
    due_date: inThreeDays,
    title: "Dashboard budget due this week",
  });
  const assigned = await createTask({
    assignee_ids: [session.user_id],
    title: "Dashboard budget assigned",
  });
  const timer = await createTask({
    due_date: afterHorizon,
    title: "Dashboard budget running timer",
  });
  await insertTaskTimer(session, timer);
  await insertTerminalTasks(session, 2, "initial-terminal");

  return {
    activeTaskIds: [overdue, blocked, dueToday, dueWeek, assigned, timer].map((task) => task.task_id),
    assignedIds: [overdue.task_id, dueWeek.task_id, assigned.task_id],
    attentionIds: [overdue.task_id, blocked.task_id, timer.task_id, dueToday.task_id, dueWeek.task_id],
    dueSoonIds: [dueToday.task_id, dueWeek.task_id],
    expectedCounts: {
      active: 6,
      assignedToMe: 3,
      activeTimers: 1,
      blocked: 1,
      overdue: 1,
      dueSoon: 2,
      completed: 1,
      archived: 1,
    },
    overdueIds: [overdue.task_id],
    pressureIds: [overdue.task_id, blocked.task_id, timer.task_id, dueToday.task_id, dueWeek.task_id],
    upcomingIds: [dueToday.task_id, dueWeek.task_id],
  };
}

function instrumentSummaryPath() {
  originalCan = permissionsService.can;
  originalCreatePermissionEvaluator = permissionsService.createPermissionEvaluator;
  originalReadDashboardCandidates = tasksRepository.readDashboardCandidates;

  permissionsService.can = async (...args) => {
    canCalls += 1;
    return originalCan(...args);
  };
  permissionsService.createPermissionEvaluator = async (...args) => {
    evaluatorCalls += 1;
    return originalCreatePermissionEvaluator(...args);
  };
  tasksRepository.readDashboardCandidates = async (...args) => {
    const rows = await originalReadDashboardCandidates(...args);
    loadedCandidateCount = rows.length;
    return rows;
  };
}

function restoreSummaryPath() {
  if (originalCan) {
    permissionsService.can = originalCan;
  }
  if (originalCreatePermissionEvaluator) {
    permissionsService.createPermissionEvaluator = originalCreatePermissionEvaluator;
  }
  if (originalReadDashboardCandidates) {
    tasksRepository.readDashboardCandidates = originalReadDashboardCandidates;
  }
}

async function measureSummary(session) {
  canCalls = 0;
  evaluatorCalls = 0;
  loadedCandidateCount = 0;
  const before = readSqliteStatementCount();
  const body = await tasksService.summary(freshSession(session));

  return {
    body,
    statements: readSqliteStatementCount() - before,
  };
}

function expectedSummaryFacts(fixtures) {
  return {
    counts: fixtures.expectedCounts,
    metricValues: {
      assignedToMe: fixtures.expectedCounts.assignedToMe,
      blocked: fixtures.expectedCounts.blocked,
      dueSoon: fixtures.expectedCounts.dueSoon,
      overdue: fixtures.expectedCounts.overdue,
    },
    attentionIds: fixtures.attentionIds,
    upcomingIds: fixtures.upcomingIds,
    pressureIds: fixtures.pressureIds,
    overdueIds: fixtures.overdueIds,
    dueSoonIds: fixtures.dueSoonIds,
    assignedIds: fixtures.assignedIds,
  };
}

function summaryFacts(summary) {
  return {
    counts: summary.counts,
    metricValues: Object.fromEntries(Object.entries(summary.metrics).map(([key, metric]) => [key, metric.value])),
    attentionIds: summary.attentionRows.map((row) => row.task_id),
    upcomingIds: summary.upcomingRows.map((row) => row.task_id),
    pressureIds: summary.pressureRows.map((row) => row.task_id),
    overdueIds: summary.overdue.map((row) => row.task_id),
    dueSoonIds: summary.dueSoon.map((row) => row.task_id),
    assignedIds: summary.assignedToMe.map((row) => row.task_id),
  };
}

async function insertTaskTimer(session, task) {
  const now = new Date().toISOString();
  await db.run(`
INSERT INTO active_work_timers (
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  source_module_id,
  source_type,
  source_id,
  source_label,
  source_url,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at,
  source_metadata_json
)
VALUES (
  :timerId,
  :workspaceId,
  :userId,
  :timerSlot,
  'tasks',
  'task',
  :taskId,
  :title,
  :sourceUrl,
  NULL,
  '',
  '',
  '',
  :title,
  'yes',
  0,
  :now,
  'running',
  :now,
  :now,
  '{}'
);
`, {
    now,
    sourceUrl: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
    taskId: task.task_id,
    timerId: `dashboard-budget-timer-${randomUUID()}`,
    timerSlot: `source:tasks:task:${task.task_id}`,
    title: task.title,
    userId: session.user_id,
    workspaceId: session.workspace_id,
  });
}

async function insertTerminalTasks(session, count, prefix = "historical-terminal") {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    for (let index = 0; index < count; index += 1) {
      const status = index % 2 === 0 ? "complete" : "archived";
      await transaction.run(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  title,
  description,
  status,
  priority,
  source_type,
  archived_at,
  completed_at,
  created_by_user_id,
  updated_by_user_id,
  archived_by_user_id,
  completed_by_user_id,
  billable,
  created_at,
  updated_at
)
VALUES (
  :taskId,
  :workspaceId,
  :title,
  '',
  :status,
  'normal',
  'manual',
  :archivedAt,
  :completedAt,
  :userId,
  :userId,
  :archivedBy,
  :completedBy,
  'yes',
  :now,
  :now
);
`, {
        archivedAt: status === "archived" ? now : null,
        archivedBy: status === "archived" ? session.user_id : null,
        completedAt: status === "complete" ? now : null,
        completedBy: status === "complete" ? session.user_id : null,
        now,
        status,
        taskId: `${prefix}-${String(index).padStart(4, "0")}-${randomUUID()}`,
        title: `${prefix} ${index}`,
        userId: session.user_id,
        workspaceId: session.workspace_id,
      });
    }
  });
}

async function readSeedSession() {
  const user = (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))[0];
  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: TIMEZONE,
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function freshSession(session) {
  return { ...session };
}

function localDateKey(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sliceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `expected source markers ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}
