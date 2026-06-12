import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-options-payload-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-options-payload.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Options-Payload-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  await assertBusinessOptions(session);
  await assertPermissionFiltering(session);
  await assertPersonalWorkspaceOptions(session);
  await assertBrowserUsesServiceLabels();

  console.log("Task options payload regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertBusinessOptions(session) {
  const parent = (await clientsService.createClient({ name: "Options Parent" }, session)).client;
  await clientsService.createClient({
    name: "Options Child",
    parent_client_id: parent.id,
  }, session);
  const parentProject = (await clientsService.createProject(parent.id, { name: "Options Parent Project" }, session)).project;
  const childProject = (await clientsService.createProject(parent.id, {
    name: "Options Child Project",
    parent_project_id: parentProject.id,
  }, session)).project;
  const workspaceProject = (await clientsService.createProject("", { name: "Options Workspace Project" }, session)).project;
  const activeTask = (await tasksService.create({
    title: "Options active task",
    project_id: childProject.id,
  }, session)).task;
  const completedTask = (await tasksService.complete((await tasksService.create({
    title: "Options completed task",
    project_id: parentProject.id,
  }, session)).task.task_id, session)).task;

  const options = (await tasksService.list(session, { status: "active" })).options;
  assert.deepEqual(
    options.clients.map((client) => client.optionLabel),
    ["Options Parent", "  - Options Child"],
    "client option labels should come from canonical Client/Projects depth metadata",
  );
  assert.ok(options.clients.every((client) => Number.isInteger(client.hierarchyDepth)), "client options should include hierarchy depth");
  assert.ok(options.projects.some((project) => project.id === workspaceProject.id), "workspace-level projects should remain available");
  assert.ok(options.projects.some((project) => project.id === childProject.id && project.optionLabel === "  - Options Child Project"), "child project option label should be indented by service metadata");
  assert.ok(options.tasks.some((task) => task.id === activeTask.task_id && task.optionLabel.includes("Options active task")), "active task options should include active readable tasks");
  assert.equal(options.tasks.some((task) => task.id === completedTask.task_id), false, "completed tasks should not leak into active picker defaults");

  const historyOptions = (await tasksService.listWorkItems(session, { status: "history" })).options;
  assert.equal(historyOptions.tasks.some((task) => task.id === completedTask.task_id), false, "active picker defaults should stay active even when list query reads history");
}

async function assertPermissionFiltering(session) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const options = (await tasksService.list(noRoleSession, { status: "active" })).options;

  assert.equal(options.clients.length, 0, "unreadable clients should be absent from picker options");
  assert.equal(options.projects.length, 0, "unreadable projects should be absent from picker options");
  assert.equal(options.tasks.length, 0, "unreadable tasks should be absent from picker options");
}

async function assertPersonalWorkspaceOptions(session) {
  const personalWorkspaceId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO workspaces (
  workspace_id,
  name,
  workspace_type,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(personalWorkspaceId)},
  'Options Personal Workspace',
  'personal',
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  task_timers_enabled,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(personalWorkspaceId)},
  1,
  1,
  '',
  'monthly',
  1,
  0,
  '0.25',
  1,
  30,
  ${sqlText(now)},
  1,
  ${sqlText(now)},
  ${sqlText(now)}
);
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.user_id)},
  ${sqlText(personalWorkspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
  const personalSession = {
    ...session,
    active_workspace_id: personalWorkspaceId,
    workspace_id: personalWorkspaceId,
  };
  const workspaceProject = (await clientsService.createProject("", { name: "Personal Workspace Project" }, personalSession)).project;
  const options = (await tasksService.list(personalSession, { status: "active" })).options;

  assert.equal(options.workspaceType, "personal");
  assert.equal(options.clients.length, 0, "personal workspaces should not expose client picker options");
  assert.ok(options.projects.some((project) => project.id === workspaceProject.id), "personal workspace projects should remain available");
}

async function assertBrowserUsesServiceLabels() {
  const tasksScript = await fs.readFile(new URL("../public/js/tasks.js", import.meta.url), "utf8");
  const taskDialog = await fs.readFile(new URL("../public/js/task-dialog.js", import.meta.url), "utf8");

  assert.match(tasksScript, /state\.options\.clients\.map\(\(client\) => option\(client\.id, optionLabel\(client\)\)\)/, "Tasks filters should render service-owned client option labels");
  assert.match(tasksScript, /state\.options\.projects\.map\(\(project\) => option\(project\.id, optionLabel\(project\)\)\)/, "Tasks filters should render service-owned project option labels");
  assert.doesNotMatch(tasksScript, /getClientDepth|getProjectDepth|treeIndent|sortClientOptions|sortProjectOptions/, "Tasks list should not rebuild picker hierarchy");
  assert.match(taskDialog, /options\.clients \|\| \[\]\)\.map\(\(client\) => option\(client\.id, optionLabel\(client\)\)\)/, "Task dialog should render service-owned client option labels");
  assert.match(taskDialog, /projects\.map\(\(project\) => option\(project\.id, optionLabel\(project\)\)\)/, "Task dialog should render service-owned project option labels");
  assert.doesNotMatch(taskDialog, /getClientTreeSortKey|getProjectTreeSortKey|getClientDepth|getProjectDepth|treeIndent/, "Task dialog should not rebuild picker hierarchy");
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`task-options-no-role-${userId}@example.test`)},
  'Task Options No Role',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `task-options-no-role-${userId}@example.test`,
    workspace_id: workspaceId,
  };
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
