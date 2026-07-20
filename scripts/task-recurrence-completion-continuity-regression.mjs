export const regressionMeta = Object.freeze({
  id: "tasks.recurrence-completion-continuity",
  area: "tasks",
  tier: "integration",
  tags: ["checklist", "jobs", "recurrence", "workbench"],
  description: "Proves recurrence completion continuity, checklist-template seeding, safe feedback, and durable sweep recovery across every completion surface.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-continuity-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-continuity.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Continuity-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { activateModuleRuntime } = await import("../src/core/modules/module-runtime.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const {
  queueTaskRecurrenceSweepJob,
  registerTaskJobHandlers,
} = await import("../src/modules/tasks/task-jobs.service.js");
const { taskRecurrenceRepository } = await import("../src/modules/tasks/task-recurrence.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksPublicApiService } = await import("../src/modules/tasks/public-api.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertDedicatedCompletionContinuity(session);
  await assertEstablishedTemplatePreserved(session);
  await assertCompletionSurfaceParity(session);
  await assertQueueFailureAndSweepRecovery(session);
  await assertBrowserContracts();

  console.log("Task recurrence completion continuity regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertDedicatedCompletionContinuity(session) {
  const dueDate = dateOffset(0);
  const nextDate = dateOffset(7);
  const source = await createRecurringTask(session, "Empty template completion", dueDate);
  await tasksService.addChecklistItem(source.task_id, { label: "First step" }, session);
  await tasksService.addChecklistItem(source.task_id, { label: "Second step" }, session);

  const result = await tasksService.complete(source.task_id, session);
  assert.equal(result.task.status, "complete", "dedicated completion should persist before recurrence handoff");
  assert.equal(result.recurrenceContinuity.status, "pending");
  assert.equal(result.recurrenceContinuity.nextScheduledDate, nextDate);
  assert.equal(result.recurrenceContinuity.followUpQueued, true);
  assert.equal(result.recurrenceContinuity.checklistTemplateSeeded, true);
  assert.deepEqual(result.task.recurrenceContinuity, result.recurrenceContinuity, "completed task and top-level continuity should agree");
  assert.deepEqual(Object.keys(result.recurrenceJob).sort(), ["queued"], "browser completion must not expose job internals");

  const templateItems = await taskRecurrenceRepository.readTemplateChecklist(
    session.workspace_id,
    source.recurrence_template_id,
  );
  assert.deepEqual(templateItems.map((item) => item.label), ["First step", "Second step"]);

  const pendingRead = await tasksService.readRecurrenceContinuity(source.task_id, session);
  assert.equal(pendingRead.recurrenceContinuity.status, "pending", "continuity read should survive refresh before the worker runs");

  await runJobs("dedicated-completion");
  const availableRead = await tasksService.readRecurrenceContinuity(source.task_id, session);
  assert.equal(availableRead.recurrenceContinuity.status, "available");
  assert.equal(availableRead.recurrenceContinuity.nextTask.due_date, nextDate);
  assert.match(availableRead.recurrenceContinuity.nextTask.url, /^tasks\.html\?task=/);

  const generated = (await tasksService.read(availableRead.recurrenceContinuity.nextTask.task_id, session)).task;
  assert.deepEqual(generated.checklistItems.map((item) => item.label), ["First step", "Second step"]);
  assert.deepEqual(generated.checklistItems.map((item) => item.is_checked), [false, false]);

  const ended = await createRecurringTask(session, "Ended recurrence", dateOffset(1), dateOffset(1));
  const endedResult = await tasksService.complete(ended.task_id, session);
  assert.equal(endedResult.recurrenceContinuity.status, "ended");
  assert.equal(endedResult.recurrenceContinuity.nextScheduledDate, "");
  assert.equal(endedResult.recurrenceJob.queued, false);
}

async function assertEstablishedTemplatePreserved(session) {
  const source = await createRecurringTask(session, "Established checklist template", dateOffset(2));
  await tasksService.addChecklistItem(source.task_id, { label: "Template-owned step" }, session);
  await tasksService.update(source.task_id, {
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: dateOffset(40),
      applyTo: "future",
    },
  }, session);
  await tasksService.addChecklistItem(source.task_id, { label: "Occurrence-only step" }, session);

  const completion = await tasksService.complete(source.task_id, session);
  assert.equal(completion.recurrenceContinuity.checklistTemplateSeeded, false);
  const templateItems = await taskRecurrenceRepository.readTemplateChecklist(
    session.workspace_id,
    source.recurrence_template_id,
  );
  assert.deepEqual(
    templateItems.map((item) => item.label),
    ["Template-owned step"],
    "completion must not overwrite an established recurrence checklist template",
  );

  await runJobs("established-template");
  const continuity = await tasksService.readRecurrenceContinuity(source.task_id, session);
  const generated = (await tasksService.read(continuity.recurrenceContinuity.nextTask.task_id, session)).task;
  assert.deepEqual(generated.checklistItems.map((item) => item.label), ["Template-owned step"]);
  assert.deepEqual(generated.checklistItems.map((item) => item.is_checked), [false]);
}

async function assertCompletionSurfaceParity(session) {
  const generic = await createRecurringTask(session, "Generic update completion", dateOffset(3));
  const genericResult = await tasksService.update(generic.task_id, { status: "complete" }, session);
  assert.equal(genericResult.recurrenceContinuity.status, "pending", "generic status completion should use the continuity handoff");

  const bulk = await createRecurringTask(session, "Bulk completion", dateOffset(4));
  const bulkResult = await tasksService.bulkUpdate({
    action: "status",
    status: "complete",
    task_ids: [bulk.task_id],
  }, session);
  assert.equal(bulkResult.recurrenceContinuities.length, 1, "bulk completion should return safe per-task continuity");
  assert.equal(bulkResult.recurrenceContinuities[0].task_id, bulk.task_id);
  assert.equal(bulkResult.recurrenceContinuities[0].status, "pending");

  const publicApi = await createRecurringTask(session, "Public API completion", dateOffset(5));
  const publicResult = await tasksPublicApiService.completeTask(session, publicApi.task_id);
  assert.equal(publicResult.task.status, "complete");
  assert.equal(publicResult.recurrenceContinuity.status, "pending");
  assert.deepEqual(
    Object.keys(publicResult.recurrenceJob).sort(),
    ["failed", "queued"],
    "public API completion should expose status flags without job IDs, payloads, or dedupe keys",
  );
}

async function assertQueueFailureAndSweepRecovery(session) {
  const source = await createRecurringTask(session, "Queue failure recovery", dateOffset(6));
  await tasksService.addChecklistItem(source.task_id, { label: "Recovered checklist step" }, session);
  const stored = await tasksRepository.readById(session.workspace_id, source.task_id);
  const completedAt = new Date().toISOString();
  await tasksRepository.update(session.workspace_id, {
    ...stored,
    status: "complete",
    completed_at: completedAt,
    completed_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
    assignee_ids: stored.assignee_ids || [],
  });
  const completed = (await tasksService.read(source.task_id, session)).task;
  const failedHandoff = await tasksService.completeRecurrenceHandoff(completed, session, {
    queueGeneration: async () => {
      throw new Error("seeded recurrence queue failure");
    },
  });

  assert.equal(failedHandoff.recurrenceContinuity.status, "handoff_failed");
  assert.equal(failedHandoff.recurrenceContinuity.followUpFailed, true);
  assert.equal(failedHandoff.recurrenceJob.failed, true);
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "complete");

  await queueTaskRecurrenceSweepJob({
    availableAt: new Date(),
    reason: "task.recurrence.continuity.regression",
    reschedule: false,
    workspaceId: session.workspace_id,
  });
  await runJobs("queue-failure-sweep");
  const recovered = await tasksService.readRecurrenceContinuity(source.task_id, session);
  assert.equal(recovered.recurrenceContinuity.status, "available", "periodic sweep should recover a failed recurrence handoff");
  const recoveredTask = (await tasksService.read(recovered.recurrenceContinuity.nextTask.task_id, session)).task;
  assert.deepEqual(recoveredTask.checklistItems.map((item) => item.label), ["Recovered checklist step"]);

  await tasksService.completeRecurrenceHandoff(completed, session);
  await tasksService.completeRecurrenceHandoff(completed, session);
  await runJobs("dedupe");
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM tasks
WHERE workspace_id = ?
  AND recurrence_template_id = ?
  AND recurrence_instance_date = ?;
`, [session.workspace_id, source.recurrence_template_id, dateOffset(13)]);
  assert.equal(Number(rows[0]?.count || 0), 1, "retries and recovery must converge on one recurrence instance");
}

async function assertBrowserContracts() {
  const [routes, service, taskDialog, tasksScript, workbenchScript, candidateService] = await Promise.all([
    fs.readFile(path.resolve("src/modules/tasks/tasks.routes.js"), "utf8"),
    fs.readFile(path.resolve("src/modules/tasks/tasks.service.js"), "utf8"),
    fs.readFile(path.resolve("public/js/task-dialog.js"), "utf8"),
    fs.readFile(path.resolve("public/js/tasks.js"), "utf8"),
    fs.readFile(path.resolve("public/js/workbench.js"), "utf8"),
    fs.readFile(path.resolve("src/services/work-candidate.service.js"), "utf8"),
  ]);

  assert.match(routes, /\/tasks\/:taskId\/recurrence-continuity/);
  assert.match(service, /completeRecurrenceHandoff\(taskWithDetails, session/);
  assert.match(service, /completeRecurrenceHandoff\(task, session\)/);
  assert.match(service, /recurrenceContinuities\.push/);
  assert.match(taskDialog, /completedBySave[\s\S]*taskCompletionHostDetail\(result\)/);
  assert.match(taskDialog, /pollRecurrenceContinuity[\s\S]*recurrence-continuity/);
  assert.match(taskDialog, /data-task-recurrence-continuity/);
  assert.match(tasksScript, /postTaskAction[\s\S]*trackTaskRecurrenceContinuity/);
  assert.match(tasksScript, /updateTaskLifecycleStatus[\s\S]*trackTaskRecurrenceContinuity/);
  assert.match(tasksScript, /recurrenceContinuities[\s\S]*renderBulkRecurrenceContinuity/);
  assert.match(workbenchScript, /completeFocusedTask[\s\S]*setTaskCompletionStatus/);
  assert.match(workbenchScript, /trackTaskRecurrenceContinuity[\s\S]*refreshFocusCandidates/);
  assert.match(candidateService, /excludePassiveRecurringCreated/);
  assert.match(candidateService, /Math\.abs\(dayDistance\) <= 1/, "far-future passive recurrence should remain outside normal ranking");
}

async function createRecurringTask(session, title, dueDate, endDate = dateOffset(45)) {
  return (await tasksService.create({
    title,
    due_date: dueDate,
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate,
    },
  }, session)).task;
}

async function runJobs(label) {
  for (let pass = 0; pass < 3; pass += 1) {
    const result = await runJobWorkerOnce({
      claimLimit: 100,
      mode: "inline",
      workerId: `task-recurrence-continuity-${label}-${pass}`,
    });
    if (!result?.claimedCount) {
      break;
    }
  }
}

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
