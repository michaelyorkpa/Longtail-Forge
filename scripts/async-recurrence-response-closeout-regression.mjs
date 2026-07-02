import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.8";
const asyncRecurrenceVersion = "0.33.5.21.7.7";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-async-recurrence-response-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-async-recurrence-response.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Async-Recurrence-Response-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const tasksDocs = readText("docs/tasks-module.md");
const publicApiDocs = readText("docs/public-api.md");
const tasksPageSource = readText("public/js/tasks.js");
const workbenchSource = readText("public/js/workbench.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const publicApiSource = readText("src/modules/tasks/public-api.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeDatabase, db, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { tasksPublicApiService } = await import("../src/modules/tasks/public-api.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the async recurrence closeout version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the async recurrence closeout version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the async recurrence closeout version");

  assert.match(tasksServiceSource, /return \{ task, createdTask: null, recurrenceJob: recurrenceQueueResult \}/, "task completion should return a queued recurrence response instead of an inline task");
  assert.doesNotMatch(tasksServiceSource, /const recurrenceResult = await taskRecurrenceService\.createNextInstance/, "task completion should not create the next recurrence instance inline");
  assert.match(publicApiSource, /recurrenceJob: publicRecurrenceJob\(result\.recurrenceJob\)/, "public API completion should expose a safe recurrence queued hint");
  assert.doesNotMatch(functionBlock(publicApiSource, "publicRecurrenceJob"), /jobId|job_id|dedupe|payload/i, "public recurrence job response should not expose job internals");
  assert.match(tasksPageSource, /const recurrenceQueued = result\.recurrenceJob\?\.queued === true/, "Tasks page should read the queued recurrence hint");
  assert.match(tasksPageSource, /setStatus\("Next recurring task queued\."\)/, "Tasks page should surface the queued recurrence affordance");
  assert.match(tasksPageSource, /if \(!result\.createdTask && !recurrenceQueued\)/, "Tasks page should not immediately clear the queued recurrence affordance");
  assert.doesNotMatch(workbenchSource, /createdTask/, "Workbench completion should not assume a synchronous recurring task response");
  assert.match(tasksDocs, /As of 0\.33\.5\.21\.7\.7[\s\S]*createdTask` is `null`[\s\S]*recurrenceJob\.queued/, "Tasks docs should describe the async recurrence response contract");
  assert.match(publicApiDocs, /As of 0\.33\.5\.21\.7\.7[\s\S]*createdTask` is `null`[\s\S]*recurrenceJob\.queued/, "public API docs should describe the safe recurrence queued hint");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(asyncRecurrenceVersion)} - `), "changelog should include the async recurrence closeout slice");
  assert.match(roadmap, /Version 0\.33\.5\.21\.7\.7 - Async recurrence response closeout[\s\S]*\[x\] Verify all consumers of `tasks\.service\.complete\(\)`[\s\S]*\[x\] Complete the durable-jobs branch closeout/, "roadmap should mark the async recurrence response closeout complete");
  assert.match(roadmap, /Version 0\.33\.5\.21\.8 - Deliver task due reminders to the notification surface/, "roadmap should leave the next reminder-delivery slice live");
  assert.match(regressionSuite, /scripts\/async-recurrence-response-closeout-regression\.mjs/, "regression suite should include async recurrence response closeout coverage");

  await initializeDatabase();
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

  assert.equal(completed.task.status, "complete");
  assert.equal(completed.createdTask, null, "protected completion should not return a synchronously created next task");
  assert.equal(completed.recurrenceJob.queued, true, "protected completion should report queued recurrence work");
  assert.ok(completed.recurrenceJob.jobId, "internal protected completion may keep the job id for server consumers");
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-09-02"), 0, "next instance should not exist before worker processing");

  await runRecurrenceWorker();
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-09-02"), 1, "worker should create the next recurring task instance");
}

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

  const completed = await tasksPublicApiService.completeTask(session, task.task_id);

  assert.equal(completed.task.status, "complete");
  assert.equal(completed.createdTask, null, "public API completion should not return a synchronously created next task");
  assert.deepEqual(completed.recurrenceJob, { queued: true }, "public API completion should expose only the safe queued hint");
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

function functionBlock(source, functionName) {
  const pattern = new RegExp(`function ${functionName}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`);
  const match = source.match(pattern);
  return match ? match[0] : "";
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
