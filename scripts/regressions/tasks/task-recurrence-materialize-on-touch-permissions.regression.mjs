export const regressionMeta = Object.freeze({
  id: "tasks.task-recurrence-materialize-on-touch-permissions",
  area: "tasks",
  tier: "integration",
  tags: ["calendar", "jobs", "permissions", "recurrence", "tasks"],
  description: "Proves permission-checked, exactly-once recurrence materialization, independent occurrence edits, calendar replacement, and completion/sweep continuity.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-touch-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-touch.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Touch-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../../../src/core/jobs/index.js");
const { activateModuleRuntime } = await import("../../../src/core/modules/module-runtime.js");
const { registerSearchIndexJobHandlers } = await import("../../../src/services/search-index-jobs.service.js");
const {
  queueTaskRecurrenceSweepJob,
  registerTaskJobHandlers,
} = await import("../../../src/modules/tasks/task-jobs.service.js");
const { taskRecurrenceRepository } = await import("../../../src/modules/tasks/task-recurrence.repo.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();
  const source = await createRecurringTask(session);

  await taskRecurrenceRepository.replaceTemplateChecklist(
    String(session.workspace_id || ""),
    String(source.recurrence_template_id || ""),
    [{ label: "Template step", sort_order: 1000 }],
    String(session.user_id || ""),
  );

  await assertPermissionChecked(session, source);
  const firstTouch = await assertOneOccurrenceMaterializes(session, source);
  await assertOccurrenceEditsStayIndependent(session, source, firstTouch.task);
  const concurrentTask = await assertConcurrentTouchConverges(session, source);
  await assertSweepDoesNotDisturbTouchedInstances(session, source, concurrentTask);
  await assertCompletionContinuity(session, source);
  await assertBrowserAndRouteContracts();
  await assertDatabaseHealth();

  console.log("Task recurrence materialize-on-touch regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createRecurringTask(session) {
  return (await tasksService.create({
    title: "Materialize-on-touch recurrence",
    description: "Template description",
    due_date: "2026-08-03",
    assignee_ids: [session.user_id],
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: "2026-10-31",
    },
  }, session)).task;
}

async function assertPermissionChecked(session, source) {
  const instanceDate = "2026-08-10";
  await assert.rejects(
    tasksService.materializeRecurrenceInstance({
      templateId: source.recurrence_template_id,
      instanceDate,
    }, {
      ...session,
      user_id: "user-without-task-permissions",
      username: "no-task-permissions@example.test",
    }),
    (error) => error.statusCode === 403 && /permission/.test(error.message),
    "a planned occurrence must not materialize without edit permission",
  );
  assert.equal(
    await recurrenceInstanceCount(session, source.recurrence_template_id, instanceDate),
    0,
    "permission denial must not leave a task row behind",
  );
}

async function assertOneOccurrenceMaterializes(session, source) {
  const instanceDate = "2026-08-17";
  const before = await tasksService.calendarWindow(session, { start: "2026-08-10", end: "2026-08-24" });
  assert.equal(before.tasks.find((task) => task.instanceDate === instanceDate)?.virtual, true);

  const result = await tasksService.materializeRecurrenceInstance({
    templateId: source.recurrence_template_id,
    instanceDate,
  }, session);
  assert.equal(result.wasCreated, true);
  assert.equal(result.task.recurrence_instance_date, instanceDate);
  assert.deepEqual(result.task.checklistItems.map((item) => item.label), ["Template step"]);

  const after = await tasksService.calendarWindow(session, { start: "2026-08-10", end: "2026-08-24" });
  assert.ok(after.tasks.some((task) => task.task_id === result.task.task_id), "the real row must replace the touched ghost");
  assert.ok(!after.tasks.some((task) => task.virtual && task.instanceDate === instanceDate), "the touched ghost must disappear");
  assert.equal(after.tasks.find((task) => task.instanceDate === "2026-08-10")?.virtual, true, "the previous sibling stays virtual");
  assert.equal(after.tasks.find((task) => task.instanceDate === "2026-08-24")?.virtual, true, "the next sibling stays virtual");

  const retry = await tasksService.materializeRecurrenceInstance({
    templateId: source.recurrence_template_id,
    instanceDate,
  }, session);
  assert.equal(retry.wasCreated, false);
  assert.equal(retry.task.task_id, result.task.task_id);
  assert.equal(await recurrenceInstanceCount(session, source.recurrence_template_id, instanceDate), 1);

  return result;
}

async function assertOccurrenceEditsStayIndependent(session, source, task) {
  const updated = (await tasksService.update(task.task_id, {
    assignee_ids: [session.user_id],
    description: "Only this occurrence",
    due_date: "2026-08-18",
    title: task.title,
  }, session)).task;
  await tasksService.addChecklistItem(task.task_id, { label: "Occurrence-only step" }, session);

  assert.equal(updated.description, "Only this occurrence");
  assert.equal(updated.due_date, "2026-08-18");
  assert.equal(updated.recurrence_instance_date, "2026-08-17", "rescheduling must preserve the recurrence identity");
  const refreshed = (await tasksService.read(task.task_id, session)).task;
  assert.deepEqual(
    refreshed.checklistItems.map((item) => item.label),
    ["Template step", "Occurrence-only step"],
  );

  const template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, source.recurrence_template_id);
  assert.ok(template, "recurrence template should remain readable after an occurrence-only edit");
  assert.ok(template.checklistItems, "recurrence template should retain its checklist projection");
  assert.equal(template.description, "Template description", "instance description edits must not rewrite the template");
  assert.deepEqual(template.checklistItems.map((item) => item.label), ["Template step"]);
  assert.equal(await recurrenceInstanceCount(session, source.recurrence_template_id, "2026-08-24"), 0);
}

async function assertConcurrentTouchConverges(session, source) {
  const instanceDate = "2026-08-24";
  const results = await Promise.all(Array.from({ length: 8 }, () => (
    tasksService.materializeRecurrenceInstance({
      templateId: source.recurrence_template_id,
      instanceDate,
    }, session)
  )));
  const ids = new Set(results.map((result) => result.task.task_id));

  assert.equal(ids.size, 1, "concurrent touches must all resolve to the same task");
  assert.equal(results.filter((result) => result.wasCreated).length, 1, "exactly one caller must win creation");
  assert.equal(await recurrenceInstanceCount(session, source.recurrence_template_id, instanceDate), 1);
  const task = (await tasksService.read([...ids][0], session)).task;
  assert.deepEqual(task.checklistItems.map((item) => item.label), ["Template step"]);

  const auditRows = await querySql(`
SELECT COUNT(*) AS count
FROM audit_logs
WHERE workspace_id = ?
  AND action = 'task_recurrence_instance_materialized'
  AND record_id = ?;
`, [session.workspace_id, task.task_id]);
  assert.equal(Number(auditRows[0]?.count || 0), 1, "concurrent touches must emit one creation audit");

  await assert.rejects(
    tasksRepository.create(session.workspace_id, {
      task_id: "forced-duplicate-recurrence-instance",
      title: "Forced duplicate",
      status: "open",
      priority: "normal",
      billable: "no",
      due_date: instanceDate,
      due_timezone: session.timezone,
      recurrence_template_id: source.recurrence_template_id,
      recurrence_instance_date: instanceDate,
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
    }),
    /UNIQUE constraint failed/,
    "the database must enforce the recurrence identity under every writer",
  );

  return task;
}

async function assertSweepDoesNotDisturbTouchedInstances(session, source, touchedTask) {
  await queueTaskRecurrenceSweepJob({
    availableAt: new Date(),
    reason: "task.recurrence.materialize-on-touch.regression",
    reschedule: false,
    workspaceId: session.workspace_id,
  });
  await runJobs("sweep");
  assert.equal(await recurrenceInstanceCount(session, source.recurrence_template_id, "2026-08-24"), 1);
  assert.equal((await tasksRepository.readById(session.workspace_id, touchedTask.task_id))?.status, "open");
}

async function assertCompletionContinuity(session, source) {
  const touched = await tasksService.materializeRecurrenceInstance({
    templateId: source.recurrence_template_id,
    instanceDate: "2026-09-07",
  }, session);
  const completed = await tasksService.complete(touched.task.task_id, session);
  assert.ok(completed.recurrenceContinuity, "completed touched instance should expose recurrence continuity");
  assert.equal(completed.task.status, "complete");
  assert.equal(completed.recurrenceContinuity.nextScheduledDate, "2026-09-14");
  assert.equal(completed.recurrenceContinuity.followUpQueued, true);

  await runJobs("completion");
  const nextTask = await tasksRepository.readByRecurrenceInstance(
    session.workspace_id,
    source.recurrence_template_id,
    "2026-09-14",
  );
  assert.ok(nextTask, "completing a touched occurrence must preserve normal next-instance generation");
  assert.equal(await recurrenceInstanceCount(session, source.recurrence_template_id, "2026-09-14"), 1);
}

async function assertBrowserAndRouteContracts() {
  const [routes, dialog, calendar, dashboard, renderer] = await Promise.all([
    fs.readFile("src/modules/tasks/tasks.routes.js", "utf8"),
    fs.readFile("public/js/task-dialog.js", "utf8"),
    fs.readFile("public/js/calendar.js", "utf8"),
    fs.readFile("public/js/tasks-dashboard.js", "utf8"),
    fs.readFile("public/js/shared/task-calendar.js", "utf8"),
  ]);
  assert.match(routes, /\/tasks\/recurrence-instances\/materialize/);
  assert.match(dialog, /templateId[\s\S]*instanceDate[\s\S]*\/api\/tasks\/recurrence-instances\/materialize/);
  assert.match(calendar, /openCalendarTask\(taskId, trigger, occurrence/);
  assert.match(dashboard, /openTask\(taskId, trigger, occurrence/);
  assert.match(renderer, /"aria-label": `Open task: \$\{task\.title\}`/);
  assert.doesNotMatch(renderer, /Planned occurrence|Open planned occurrence:/);
  assert.doesNotMatch(renderer, /disabled: isVirtual/);
}

async function runJobs(label) {
  for (let pass = 0; pass < 5; pass += 1) {
    const result = await runJobWorkerOnce({
      claimLimit: 100,
      mode: "inline",
      workerId: `task-recurrence-touch-${label}-${pass}`,
    });
    if (!result?.claimedCount) {
      break;
    }
  }
}

async function recurrenceInstanceCount(session, templateId, instanceDate) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM tasks
WHERE workspace_id = ?
  AND recurrence_template_id = ?
  AND recurrence_instance_date = ?;
`, [session.workspace_id, templateId, instanceDate]);
  return Number(rows[0]?.count || 0);
}

async function assertDatabaseHealth() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrityRows.map((row) => Object.values(row)[0]), ["ok"]);
  const foreignKeyRows = await querySql("PRAGMA foreign_key_check;");
  assert.deepEqual(foreignKeyRows, []);
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
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
