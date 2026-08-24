import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { createProjectTextReader, extractFunctionBlock } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-async-recurrence-response-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-async-recurrence-response.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Async-Recurrence-Response-Test-123!";

const tasksDocs = readText("docs/tasks-module.md");
const publicApiDocs = readText("docs/public-api.md");
const tasksPageSource = readText("public/js/tasks.js");
const workbenchSource = readText("public/js/workbench.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const publicApiSource = readText("src/modules/tasks/public-api.service.js");

const { closeDatabase, db, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { activateModuleRuntime } = await import("../src/core/modules/module-runtime.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { tasksPublicApiService } = await import("../src/modules/tasks/public-api.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {

  assert.match(tasksServiceSource, /const recurrenceHandoff = await completeRecurrenceHandoff\(task, session\)/, "task completion should use the shared asynchronous recurrence handoff");
  assert.match(tasksServiceSource, /createdTask: null,[\s\S]*recurrenceContinuity: recurrenceHandoff\.recurrenceContinuity,[\s\S]*recurrenceJob: recurrenceHandoff\.recurrenceJob/, "task completion should return safe continuity and queued metadata instead of an inline task");
  assert.doesNotMatch(tasksServiceSource, /const recurrenceResult = await taskRecurrenceService\.createNextInstance/, "task completion should not create the next recurrence instance inline");
  assert.match(publicApiSource, /recurrenceJob: publicRecurrenceJob\(result\.recurrenceJob\)/, "public API completion should expose a safe recurrence queued hint");
  assert.doesNotMatch(extractFunctionBlock(publicApiSource, "publicRecurrenceJob"), /jobId|job_id|dedupe|payload/i, "public recurrence job response should not expose job internals");
  assert.match(tasksPageSource, /renderTaskRecurrenceContinuity\(result\.recurrenceContinuity\)/, "Tasks page should render safe recurrence continuity");
  assert.match(tasksPageSource, /trackTaskRecurrenceContinuity\([^\n]+result\.recurrenceContinuity\)/, "Tasks page should track pending recurrence continuity without creating inline");
  assert.match(workbenchSource, /detail\.taskLifecycleAction === "complete"[\s\S]*setTaskCompletionStatus\(detail\)/, "Workbench modal completion should use safe lifecycle detail");
  assert.match(extractFunctionBlock(workbenchSource, "setTaskCompletionStatus"), /detail\.recurrenceContinuity[\s\S]*trackTaskRecurrenceContinuity/, "Workbench completion should render and track safe recurrence continuity");
  assert.doesNotMatch(extractFunctionBlock(workbenchSource, "setTaskCompletionStatus"), /jobId|job_id|dedupe|payload/i, "Workbench completion should not expose recurrence job internals");
  assert.match(tasksDocs, /As of 0\.33\.9\.6[\s\S]*does not create the next instance inline[\s\S]*recurrenceContinuity[\s\S]*queue\/failure booleans/, "Tasks docs should describe the async recurrence continuity contract");
  assert.match(publicApiDocs, /As of 0\.33\.9\.6[\s\S]*createdTask` remains `null`[\s\S]*recurrenceContinuity[\s\S]*queue\/failure booleans/, "public API docs should describe the safe recurrence continuity contract");
  await initializeDatabase();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertProtectedCompletionResponse(session);
  await assertPublicCompletionResponse(session);
  await assertIntegrity();

  console.log("Async recurrence response closeout regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session */
async function assertProtectedCompletionResponse(session) {
  const task = (await tasksService.create({
    due_date: "2026-09-01",
    recurrence: {
      enabled: true,
      endDate: "2026-09-05",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Protected async recurrence task",
  }, session)).task;

  const completed = await tasksService.complete(task.task_id, session);
  assert.ok(completed.recurrenceContinuity, "recurring completion should expose continuity");

  assert.equal(completed.task.status, "complete");
  assert.equal(completed.createdTask, null, "protected completion should not return a synchronously created next task");
  assert.deepEqual(completed.recurrenceJob, { queued: true }, "protected completion should report only safe queued recurrence metadata");
  assert.equal(completed.recurrenceContinuity.status, "pending", "protected completion should report pending recurrence continuity");
  assert.equal(completed.recurrenceContinuity.nextScheduledDate, "2026-09-02");
  assert.equal(completed.recurrenceContinuity.followUpQueued, true);
  assert.equal(completed.recurrenceContinuity.nextTask, null);
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-09-02"), 0, "next instance should not exist before worker processing");

  await runRecurrenceWorker();
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-09-02"), 1, "worker should create the next recurring task instance");
}

/** @param {TasksSession} session */
async function assertPublicCompletionResponse(session) {
  const task = (await tasksService.create({
    due_date: "2026-10-06",
    recurrence: {
      enabled: true,
      endDate: "2026-10-10",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Public async recurrence task",
  }, session)).task;

  const completed = await tasksPublicApiService.completeTask(publicApiSession(session), task.task_id);
  assert.ok(completed.recurrenceContinuity, "public recurring completion should expose continuity");

  assert.equal(completed.task.status, "complete");
  assert.equal(completed.createdTask, null, "public API completion should not return a synchronously created next task");
  assert.deepEqual(completed.recurrenceJob, { failed: false, queued: true }, "public API completion should expose only safe queue and failure hints");
  assert.equal(completed.recurrenceContinuity.status, "pending", "public API completion should report pending recurrence continuity");
  assert.equal(completed.recurrenceContinuity.nextScheduledDate, "2026-10-07");
  assert.equal(completed.recurrenceContinuity.followUpQueued, true);
  assert.equal(completed.recurrenceContinuity.nextTask, null);
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-10-07"), 0, "public API completion should leave next instance creation to the worker");

  await runRecurrenceWorker();
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-10-07"), 1, "worker should create the public API task's next recurrence instance");
}

async function runRecurrenceWorker() {
  const summary = await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "async-recurrence-response-closeout",
  });

  assert.ok(summary.completed >= 1, "worker should process queued recurrence work");
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  return workspaceSessionFixture(requireFirstRow(rows, "fresh database should seed a protected super admin"));
}

/** @param {string} workspaceId @param {string} templateId @param {string} instanceDate @returns {Promise<number>} */
async function recurrenceInstanceCount(workspaceId, templateId, instanceDate) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND recurrence_instance_date = ${sqlText(instanceDate)};
`);

  return Number(rows[0]?.count || 0);
}

async function assertIntegrity() {
  const rows = await db.query("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

/**
 * Present the session shape the Tasks public API service publishes. The
 * surface authenticates with an API key, so its contract requires an
 * api_key_id; the workspace fixture session does not carry one.
 * @param {import("../src/types/http-contracts.js").WorkspaceRequestSession} session
 * @returns {import("../src/types/http-contracts.js").ApiSession}
 */
function publicApiSession(session) {
  return {
    ...session,
    api_key_id: "async-recurrence-response-regression-key",
  };
}
