import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} WorkbenchSession */
/** What this owner keeps from the records its fixtures create. */
/** @typedef {{ client: { id: string, name: string }, project: { id: string, name: string }, task: { task_id: string } }} WorkbenchFixtures */
/** The workbench bootstrap payload, taken from the service rather than guessed. */
/** @typedef {Awaited<ReturnType<typeof workbenchService.bootstrap>>} WorkbenchBootstrap */
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workbench-dehardcode-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-workbench-dehardcode.db");
process.env.SUPER_ADMIN_PASSWORD = "Workbench-Dehardcode-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { activeTimersService } = await import("../src/modules/time-tracking/active-timers.service.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { settingsService } = await import("../src/services/settings.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workCandidateService } = await import("../src/services/work-candidate.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createWorkbenchFixtures(session);

  await assertWorkbenchSourcesEnabled(session, fixtures);
  await assertWorkbenchDegradesWithoutTasks(session);
  await assertWorkbenchDegradesWithoutTimeTracking(session, fixtures);
  await assertSourceRemainsDehardcoded(session);

  console.log("Workbench service de-hardcode regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {WorkbenchSession} session @param {WorkbenchFixtures} fixtures */
async function assertWorkbenchSourcesEnabled(session, fixtures) {
  const bootstrap = await workbenchService.bootstrap(session);
  const taskPayload = await tasksService.listWorkbenchItems(session);
  const timerPayload = await activeTimersService.listAll(session);

  assert.equal(bootstrap.modules.tasks.enabled, true);
  assert.equal(bootstrap.modules["time-tracking"].enabled, true);
  assert.equal(Object.hasOwn(bootstrap.modules, "timeTracking"), false, "Workbench module state should be keyed by module ID");
  assert.ok(workbenchRenderers(bootstrap).includes("task-workbench-items"));
  assert.ok(workbenchRenderers(bootstrap).includes("active-work-timers"));
  assert.equal(Object.hasOwn(bootstrap, "taskItems"), false, "bootstrap should not expose a Tasks-owned work item payload field");
  assert.deepEqual(bootstrap.timers, [], "bootstrap should not inline Time Tracking timer payloads");

  assert.ok(
    taskPayload.items.some((item) => item.task_id === fixtures.task.task_id),
    "Tasks workbench source route should provide the task card payload",
  );
  assert.ok(
    timerPayload.timers.some((timer) => timer.timer_slot === "1" && timer.description === "Workbench de-hardcode timer"),
    "Time Tracking timer source route should provide the timer card payload",
  );
  assert.deepEqual(bootstrap.workCandidates, [], "bootstrap must not compute focus candidates");
  const candidates = await workCandidateService.listWorkCandidates(session, { limit: 50 });
  assert.ok(
    candidates.items.some((candidate) => candidate.recordType === "active_work_timer"),
    "the focus-candidates read should include normalized live-timer candidates",
  );
}

/** @param {WorkbenchSession} session */
async function assertWorkbenchDegradesWithoutTasks(session) {
  await modulesService.setModuleStatus(session.workspace_id, "tasks", false, { session });

  const bootstrap = await workbenchService.bootstrap(session);
  const taskPayload = await tasksService.listWorkbenchItems(session);

  assert.equal(bootstrap.modules.tasks.enabled, false);
  assert.equal(workbenchRenderers(bootstrap).includes("task-workbench-items"), false);
  assert.equal(workbenchRenderers(bootstrap).includes("active-work-timers"), true);
  assert.equal(taskPayload.source_enabled, false);

  await modulesService.setModuleStatus(session.workspace_id, "tasks", true, { session });
}

/** @param {WorkbenchSession} session @param {WorkbenchFixtures} fixtures */
async function assertWorkbenchDegradesWithoutTimeTracking(session, fixtures) {
  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", false, { session });

  const bootstrap = await workbenchService.bootstrap(session);
  const taskPayload = await tasksService.listWorkbenchItems(session);

  assert.equal(bootstrap.modules["time-tracking"].enabled, false);
  assert.equal(workbenchRenderers(bootstrap).includes("active-work-timers"), false);
  assert.equal(workbenchRenderers(bootstrap).includes("task-workbench-items"), true);
  assert.equal(taskPayload.source_enabled, true);
  assert.ok(taskPayload.items.some((item) => item.task_id === fixtures.task.task_id));
  const disabledTimerCandidates = await workCandidateService.listWorkCandidates(session, { limit: 50 });
  assert.equal(
    disabledTimerCandidates.items.some((candidate) => candidate.recordType === "active_work_timer"),
    false,
    "disabled Time Tracking should remove live timer candidates from the focus-candidates read",
  );

  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", true, { session });
}

/** @param {WorkbenchSession} session */
async function assertSourceRemainsDehardcoded(session) {
  const workbenchSource = readText("src/services/workbench.service.js");
  const modulesSource = readText("src/core/modules/modules.service.js");
  const settings = await settingsService.read(session);

  assert.doesNotMatch(
    workbenchSource,
    /tasksService|activeTimersService|TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID|listTaskWorkItems|["']tasks["']|["']time-tracking["']/,
    "workbench.service must not name Tasks or Time Tracking directly",
  );
  assert.doesNotMatch(
    modulesSource,
    /TASKS_MODULE_ID|TIME_TRACKING_MODULE_ID|tasksEnabled:|timeTrackingEnabled:|setting\.id === "taskTimersEnabled"/,
    "modules.service settings and decoration paths must not special-case first-party module flags",
  );
  assert.equal(Object.hasOwn(settings, "tasksEnabled"), false);
  assert.equal(Object.hasOwn(settings, "timeTrackingEnabled"), false);
  assert.equal(Object.hasOwn(settings, "taskTimersEnabled"), false);
}

/** @param {WorkbenchSession} session @returns {Promise<WorkbenchFixtures>} */
async function createWorkbenchFixtures(session) {
  const client = (await clientsService.createClient({ name: "Workbench De-hardcode Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Workbench De-hardcode Project" }, session)).project;
  const task = (await tasksService.create({
    title: "Workbench de-hardcode task",
    project_id: project.id,
    assignee_ids: [session.user_id],
  }, session)).task;

  await activeTimersService.save("1", {
    accumulated_elapsed_seconds: 12,
    billable: "yes",
    client_id: client.id,
    client_name: client.name,
    description: "Workbench de-hardcode timer",
    last_active_start_time: new Date().toISOString(),
    project_id: project.id,
    project_name: project.name,
    timer_status: "running",
  }, session);

  return {
    client,
    project,
    task,
  };
}

/** @param {WorkbenchBootstrap} bootstrap @returns {unknown[]} */
function workbenchRenderers(bootstrap) {
  return (bootstrap.registry?.workbenchCards || []).map((card) => card.renderer);
}

/** @returns {Promise<WorkbenchSession>} */
async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture({
    ...user,
    username: user.username || `workbench-dehardcode-${randomUUID()}@example.test`,
  });
}
