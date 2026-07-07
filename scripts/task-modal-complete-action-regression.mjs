import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const appVersion = "0.33.6.6d";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-modal-complete-action-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-modal-complete-action.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Modal-Complete-Action-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const docs = readText("docs/tasks-module.md");
const tasksModuleSource = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const tasksRoutesSource = readText("src/modules/tasks/tasks.routes.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const workbenchScript = readText("public/js/workbench.js");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  const projectId = await createProject(session.workspace_id);

  await assertSaveThenCompleteServiceSequence(session);
  await assertActiveTimerCompletionGuard(session, projectId);

  console.log("Task modal complete action regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the task modal complete action version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the task modal complete action version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the task modal complete action version");
  assert.match(tasksModuleSource, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module metadata should track the current app version");

  assert.match(taskDialogScript, /\{ id: "complete", label: "Complete", icon: "complete", role: "primary" \}/, "Task editor footer should declare the Complete action");
  assert.match(taskDialogScript, /complete:\s*dialog\.querySelector\("\[data-complete-task\]"\)/, "Task dialog should keep a Complete button hook");
  assert.match(taskDialogScript, /fields\.complete\?\.addEventListener\("click", saveAndCompleteTask\)/, "Complete action should dispatch to the save-and-complete handler");
  assert.match(taskDialogScript, /TASK_COMPLETE_VISIBLE_STATUSES = new Set\(\["open", "in_progress", "blocked"\]\)/, "Complete action should be visible only for active task statuses");
  assert.match(taskDialogScript, /currentTaskId[\s\S]*TASK_COMPLETE_VISIBLE_STATUSES\.has\(status\)[\s\S]*hasTaskCompletePermission\(\)/, "Complete action should require a saved active task and completion permission");
  assert.match(taskDialogScript, /permissions\.has\("tasks\.complete"\)/, "Complete action should check tasks.complete before showing");
  assert.match(taskDialogScript, /button\.dataset\.completeTask = ""[\s\S]*button\.hidden = true/, "Complete footer button should start hidden until state gating passes");
  assert.match(taskDialogScript, /saveTaskForm\(\{[\s\S]*closeOnSuccess: false,[\s\S]*statusMessage: "Saving task before completion\.\.\."/,
    "Save-and-complete should persist pending edits before completion without closing the modal");
  assert.match(taskDialogScript, /api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/complete`, \{\}\)/,
    "Save-and-complete should call the dedicated protected complete route");
  assert.match(taskDialogScript, /taskCompletionHostDetail\(result\)[\s\S]*taskLifecycleAction: "complete"/,
    "Complete action should pass safe lifecycle detail to host surfaces");
  assert.match(taskDialogScript, /taskCompletionHostDetail\(result\)[\s\S]*recurrenceQueued: result\.recurrenceJob\?\.queued === true/,
    "Complete action should pass safe recurrence detail to host surfaces");
  assert.match(workbenchScript, /detail\.taskLifecycleAction === "complete"[\s\S]*setTaskCompletionStatus\(detail\)/,
    "Workbench should preserve completion-specific status messages from the modal");
  assert.match(tasksRoutesSource, /tasksRoutes\.post\("\/tasks\/:taskId\/complete"[\s\S]*tasksService\.complete\(request\.params\.taskId, request\.session\)/,
    "Protected completion should remain route-backed through tasksService.complete");
  assert.match(tasksServiceSource, /taskTimersService\.hasActiveTaskTimers[\s\S]*Tasks cannot be completed while they have active task timers/,
    "Complete route should preserve the active-timer guard");

  assert.match(tasksView, /js\/task-dialog\.js\?v=23/, "Tasks view should load the updated Task dialog cache key");
  assert.match(workbenchView, /js\/task-dialog\.js\?v=23[\s\S]*js\/workbench\.js\?v=20/, "Workbench should load the updated Task dialog and Workbench cache keys");
  assert.match(regressionSuite, /scripts\/task-modal-complete-action-regression\.mjs/, "Regression suite should include modal complete action coverage");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/,
    "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "Changelog should include the task modal complete action slice");
  assert.match(docs, /As of 0\.33\.5\.21\.9\.2[\s\S]*Complete button[\s\S]*dedicated `POST \/api\/tasks\/:taskId\/complete` route/,
    "Tasks docs should document the modal Complete action contract");
}

async function assertSaveThenCompleteServiceSequence(session) {
  const task = (await tasksService.create({
    due_date: "2026-11-02",
    recurrence: {
      enabled: true,
      endDate: "2026-11-05",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Modal complete pending edit",
  }, session)).task;

  const saved = (await tasksService.update(task.task_id, {
    next_action: "Verify the modal completion route.",
    title: "Modal complete pending edit saved first",
  }, session)).task;
  assert.equal(saved.next_action, "Verify the modal completion route.", "pending edits should be saved before completion");

  const completed = await tasksService.complete(task.task_id, session);
  assert.equal(completed.task.status, "complete", "complete route should complete the saved task");
  assert.equal(completed.task.title, "Modal complete pending edit saved first", "completion should preserve the saved edit");
  assert.equal(completed.task.next_action, "Verify the modal completion route.", "completion should preserve saved pending fields");
  assert.equal(completed.createdTask, null, "recurring completion should remain asynchronous");
  assert.equal(completed.recurrenceJob?.queued, true, "recurring completion should queue recurrence generation");
}

async function assertActiveTimerCompletionGuard(session, projectId) {
  const task = (await tasksService.create({
    assignee_ids: [session.user_id],
    project_id: projectId,
    title: "Modal complete active timer guard",
  }, session)).task;

  await taskTimersService.save(task.task_id, {
    accumulated_elapsed_seconds: 1,
    last_active_start_time: "2026-07-02T18:15:00.000Z",
    timer_status: "running",
  }, session);

  await assert.rejects(
    () => tasksService.complete(task.task_id, session),
    /Tasks cannot be completed while they have active task timers/,
    "Complete action should retain the dedicated route's active-timer guard",
  );
}

async function createProject(workspaceId) {
  const now = new Date().toISOString();
  const projectId = randomUUID();

  await runSql(`
INSERT INTO projects (
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
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  'Task Modal Complete Project',
  'Active',
  'yes',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority","status"]',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return projectId;
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

function readText(pathname) {
  return readFileSync(new URL(`../${pathname}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
