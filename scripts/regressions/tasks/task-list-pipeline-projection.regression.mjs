export const regressionMeta = Object.freeze({
  id: "tasks.task-list-pipeline-projection",
  area: "tasks",
  tier: "focused",
  tags: ["options", "pagination", "performance", "permissions", "workbench"],
  description: "Proves the task list pipeline keeps options opt-in with a dedicated options endpoint, bounds workbench items in SQL, drops per-row reminder details and duplicated work-item serialization, pushes due windows into the repository, and preserves permission filtering through the precomputed evaluator.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-list-pipeline-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "task-list-pipeline.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-List-Pipeline-Test-123!";

const tasksServiceSource = readFileSync(path.join(root, "src/modules/tasks/tasks.service.js"), "utf8");
const tasksModuleSource = readFileSync(path.join(root, "src/modules/tasks/module.js"), "utf8");
const resumeProducersSource = readFileSync(path.join(root, "src/services/work-resume-state-initial-producers.js"), "utf8");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");
const { permissionsService } = await import("../../../src/services/permissions.service.js");
const { workCandidateService } = await import("../../../src/services/work-candidate.service.js");

try {
  // Source guards: list paths skip options, the projection carries no per-row
  // reminder details, and the workbench card consumes the options endpoint.
  assert.match(tasksServiceSource, /includeOptions: false,\s*\n\s*paginate: true/, "listWorkItems should skip options and paginate in SQL");
  assert.doesNotMatch(
    tasksServiceSource.slice(
      tasksServiceSource.indexOf("async function attachTaskListProjectionDetails"),
      tasksServiceSource.indexOf("async function attachTaskDetails"),
    ),
    /readTaskReminderDetails/,
    "list projections must not read reminder details per row",
  );
  assert.match(tasksModuleSource, /listRoute: "\/api\/tasks\/options"/, "the Tasks workbench card should consume the cacheable options route");
  assert.match(resumeProducersSource, /tasksService\.readCore\(recordId, session\)/, "the resume-state read check should use the lightweight core read");

  await initializeDatabase();
  const session = await readSeedSession();

  const clientAlphaId = randomUUID();
  const clientBetaId = randomUUID();
  await runSql(`
INSERT INTO clients (
  id, workspace_id, parent_client_id, name, status, billable,
  billing_contact_name, billing_contact_email,
  billing_contact_alternate_name, billing_contact_alternate_email,
  billing_contact_phone_number, billing_contact_alternate_phone_number,
  billing_contact_street_address_1, billing_contact_street_address_2,
  billing_contact_city, billing_contact_state, billing_contact_zip_code,
  created_at, updated_at
)
VALUES
  (${sqlText(clientAlphaId)}, ${sqlText(session.workspace_id)}, NULL, 'Pipeline Client Alpha', 'Active', 'yes',
   '', '', '', '', '', '', '', '', '', '', '',
   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  (${sqlText(clientBetaId)}, ${sqlText(session.workspace_id)}, NULL, 'Pipeline Client Beta', 'Active', 'yes',
   '', '', '', '', '', '', '', '', '', '', '',
   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
`);

  const alphaTask = (await tasksService.create({
    title: "Alpha scoped task",
    client_id: clientAlphaId,
    description: "A long alpha description that should only reach work items as an excerpt. ".repeat(6),
    due_date: "2026-07-22",
  }, session)).task;
  const betaTask = (await tasksService.create({
    title: "Beta scoped task",
    client_id: clientBetaId,
    due_date: "2026-07-23",
  }, session)).task;
  const farFutureTask = (await tasksService.create({
    title: "Far future task",
    due_date: "2026-12-24",
  }, session)).task;
  const undatedTask = (await tasksService.create({
    title: "Undated task",
  }, session)).task;

  // The dedicated options endpoint serves the picker payload, while the tasks
  // list keeps options and workbench items drop them.
  const optionsResult = await tasksService.listOptions(session);
  assert.ok(Array.isArray(optionsResult.options?.users), "options endpoint should include users");
  assert.ok(Array.isArray(optionsResult.options?.tasks), "options endpoint should include the task picker");
  assert.equal(typeof optionsResult.options?.taskTimersEnabled, "boolean", "options endpoint should include timer surface flags");

  const listResult = await tasksService.list(session);
  assert.ok(listResult.options, "the tasks list keeps options for its pickers");

  const workbench = await tasksService.listWorkbenchItems(session, { task_view: "all" });
  assert.equal(Object.hasOwn(workbench, "options"), false, "workbench items must not compute the options payload");
  assert.equal(workbench.source_enabled, true);

  // Work-item serialization: one casing, excerpt only, resume_context once.
  const workItem = workbench.items.find((item) => item.task_id === alphaTask.task_id);
  assert.ok(workItem, "seeded task should appear in workbench items");
  assert.equal(Object.hasOwn(workItem, "description"), false, "work items must not carry the full description");
  assert.ok(workItem.description_excerpt.length > 0 && workItem.description_excerpt.length <= 162, "work items keep the bounded excerpt");
  for (const duplicatedField of ["checklistProgress", "relationshipSummary", "completionMetrics", "directTags", "propagatedTagCount", "resumeContext"]) {
    assert.equal(Object.hasOwn(workItem, duplicatedField), false, `work items must not duplicate ${duplicatedField}`);
  }
  assert.ok(workItem.checklist_progress, "work items keep snake_case checklist progress");
  assert.ok(workItem.resume_context, "work items emit resume_context once");
  assert.equal(workItem.resume_context.active_candidate, workItem.active_candidate);

  // SQL-side bound: the repository receives a LIMIT, so an oversized backlog
  // cannot stream unbounded rows into serialization.
  for (let index = 0; index < 210; index += 1) {
    await tasksRepository.create(session.workspace_id, {
      title: `Bulk pipeline task ${index}`,
      status: "open",
      priority: "normal",
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
    });
  }
  const boundedWorkbench = await tasksService.listWorkbenchItems(session, { task_view: "all" });
  assert.equal(boundedWorkbench.items.length, 200, "workbench items are bounded by the SQL page size");

  // Due-window pushdown: the repository excludes rows outside the widened
  // window (and undated rows), while candidate matching keeps exact semantics.
  const windowed = await tasksRepository.queryList(session.workspace_id, {
    dueWindowEnd: "2026-07-24",
    limit: 500,
    offset: 0,
  });
  const windowedIds = new Set(windowed.tasks.map((task) => task.task_id));
  assert.ok(windowedIds.has(alphaTask.task_id) && windowedIds.has(betaTask.task_id));
  assert.equal(windowedIds.has(farFutureTask.task_id), false, "due-window pushdown should exclude far-future rows in SQL");
  assert.equal(windowedIds.has(undatedTask.task_id), false, "due-window pushdown should exclude undated rows in SQL");

  const dueCandidates = await workCandidateService.listWorkCandidates(session, {
    dueTo: "2026-07-23",
    includeTaskCandidates: true,
    limit: 50,
  });
  const candidateRecordIds = new Set(dueCandidates.items.map((item) => item.recordId));
  assert.ok(candidateRecordIds.has(alphaTask.task_id) && candidateRecordIds.has(betaTask.task_id));
  assert.equal(candidateRecordIds.has(farFutureTask.task_id), false, "candidate due filtering keeps exact semantics");

  // Permission filtering through the precomputed evaluator matches can() and
  // scopes list, workbench, and calendar reads identically.
  const limitedSession = await createClientScopedSession(session.workspace_id, clientAlphaId);
  const limitedCanRead = await permissionsService.createPermissionEvaluator(limitedSession, "tasks.view");
  for (const task of [alphaTask, betaTask, farFutureTask]) {
    const resource = {
      workspace_id: task.workspace_id,
      client_id: task.client_id || "",
      project_id: task.project_id || "",
    };
    assert.equal(
      limitedCanRead(resource),
      await permissionsService.can(limitedSession, "tasks.view", resource),
      "the evaluator must agree with can() for every task",
    );
  }

  const limitedList = await tasksService.list(limitedSession);
  assert.ok(limitedList.tasks.some((task) => task.task_id === alphaTask.task_id), "scoped user keeps readable tasks");
  assert.equal(limitedList.tasks.some((task) => task.task_id === betaTask.task_id), false, "scoped user must not see other clients' tasks");

  const limitedWorkbench = await tasksService.listWorkbenchItems(limitedSession, { task_view: "all" });
  assert.equal(limitedWorkbench.items.some((item) => item.task_id === betaTask.task_id), false, "workbench items respect scoped permissions");

  // Lightweight core read: permission-checked, no enrichment, usable by
  // resume-state read checks.
  const coreRead = await tasksService.readCore(alphaTask.task_id, session);
  assert.equal(coreRead.task.task_id, alphaTask.task_id);
  assert.equal(Object.hasOwn(coreRead, "options"), false, "core reads must not compute options");
  assert.equal(Object.hasOwn(coreRead.task, "checklistItems"), false, "core reads must not attach detail enrichment");
  await assert.rejects(tasksService.readCore(betaTask.task_id, limitedSession), /permission|not found/i);

  // The detail read keeps its full contract for the dialog.
  const detail = await tasksService.read(alphaTask.task_id, session);
  assert.ok(detail.options, "detail reads keep options for the editor");
  assert.ok(detail.task.reminderDetails, "detail reads keep reminder details");
  assert.equal(detail.task.description.includes("long alpha description"), true, "detail reads keep the full description");

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("task list pipeline projection regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
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

  return workspaceSessionFixture(user);
}

/** @returns {Promise<import("../../../src/types/http-contracts.js").WorkspaceRequestSession>} */
async function createClientScopedSession(workspaceId, clientId) {
  const userId = randomUUID();
  const now = "2026-01-01T00:00:00.000Z";

  await runSql(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, timezone, password, theme_mode, user_status, protected_user, active_workspace_id)
VALUES (${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(`pipeline-limited-${userId}@example.test`)}, 'Pipeline Limited User', 'America/New_York', '', 'light', 'active', 'no', ${sqlText(workspaceId)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO user_role_assignments (assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id, permission_overrides_json, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(userId)}, 'client_user', 'client', ${sqlText(clientId)}, ${sqlText(clientId)}, NULL, NULL, ${sqlText(now)}, ${sqlText(now)});
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: "America/New_York",
    user_id: userId,
    username: `pipeline-limited-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}
