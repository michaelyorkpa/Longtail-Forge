import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-project-default-assignee-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-project-default-assignee.db");
process.env.SUPER_ADMIN_PASSWORD = "Project-Default-Assignee-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session.workspace_id);

  await assertCreatorDefault(session, fixtures.workspaceProjectId);
  await assertUnassignedDefault(session, fixtures.unassignedProjectId);
  await assertExplicitAssigneesWin(session, fixtures.creatorProjectId);
  await assertOldestProjectAdminDefault(session, fixtures.projectAdminProjectId, fixtures.users.projectAdminOld.userId);
  await assertClientAdminFallback(session, fixtures.clientAdminProjectId, fixtures.users.clientAdmin.userId);
  await assertWorkspaceAdminFallback(session, fixtures.workspaceFallbackProjectId, fixtures.users.workspaceAdmin.userId);

  console.log("Project default assignee regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertCreatorDefault(session, projectId) {
  const task = await createTask(session, projectId, "Creator default");
  assert.deepEqual(task.assignee_ids, [session.user_id]);
}

async function assertUnassignedDefault(session, projectId) {
  const task = await createTask(session, projectId, "Unassigned default");
  assert.deepEqual(task.assignee_ids, []);
}

async function assertExplicitAssigneesWin(session, projectId) {
  const task = await tasksService.create({
    title: "Explicit empty assignee list",
    project_id: projectId,
    assignee_ids: [],
  }, session);

  assert.deepEqual(task.task.assignee_ids, []);
}

async function assertOldestProjectAdminDefault(session, projectId, expectedUserId) {
  const task = await createTask(session, projectId, "Project admin default");
  assert.deepEqual(task.assignee_ids, [expectedUserId]);
}

async function assertClientAdminFallback(session, projectId, expectedUserId) {
  const task = await createTask(session, projectId, "Client admin fallback");
  assert.deepEqual(task.assignee_ids, [expectedUserId]);
}

async function assertWorkspaceAdminFallback(session, projectId, expectedUserId) {
  const task = await createTask(session, projectId, "Workspace admin fallback");
  assert.deepEqual(task.assignee_ids, [expectedUserId]);
}

async function createTask(session, projectId, title) {
  const result = await tasksService.create({
    title,
    project_id: projectId,
  }, session);

  return result.task;
}

async function createFixtures(workspaceId) {
  const now = "2026-06-06T16:00:00.000Z";
  const users = {
    clientAdmin: userFixture("default-client-admin"),
    projectAdminNew: userFixture("default-project-admin-new"),
    projectAdminOld: userFixture("default-project-admin-old"),
    workspaceAdmin: userFixture("default-workspace-admin"),
  };
  const clientIds = {
    projectAdmin: randomUUID(),
    clientAdmin: randomUUID(),
  };
  const projectIds = {
    clientAdminProjectId: randomUUID(),
    creatorProjectId: randomUUID(),
    projectAdminProjectId: randomUUID(),
    unassignedProjectId: randomUUID(),
    workspaceFallbackProjectId: randomUUID(),
    workspaceProjectId: randomUUID(),
  };

  await runSql(`
${Object.values(users).map((user) => userInsertSql(workspaceId, user)).join("\n")}
${Object.values(users).map((user) => membershipInsertSql(workspaceId, user, now)).join("\n")}
${clientInsertSql(workspaceId, clientIds.projectAdmin, "Project Admin Client", now)}
${clientInsertSql(workspaceId, clientIds.clientAdmin, "Client Admin Client", now)}
${projectInsertSql(workspaceId, clientIds.projectAdmin, projectIds.projectAdminProjectId, "Project Admin Project", "project_admin", now)}
${projectInsertSql(workspaceId, clientIds.clientAdmin, projectIds.clientAdminProjectId, "Client Admin Project", "project_admin", now)}
${projectInsertSql(workspaceId, "", projectIds.workspaceFallbackProjectId, "Workspace Fallback Project", "project_admin", now)}
${projectInsertSql(workspaceId, "", projectIds.workspaceProjectId, "Workspace Creator Project", "creator", now)}
${projectInsertSql(workspaceId, "", projectIds.creatorProjectId, "Creator Project", "creator", now)}
${projectInsertSql(workspaceId, "", projectIds.unassignedProjectId, "Unassigned Project", "unassigned", now)}
${assignmentInsertSql(workspaceId, users.projectAdminOld.userId, "project_admin", "client", clientIds.projectAdmin, "2026-06-06T16:01:00.000Z")}
${assignmentInsertSql(workspaceId, users.projectAdminNew.userId, "project_admin", "client", clientIds.projectAdmin, "2026-06-06T16:02:00.000Z")}
${assignmentInsertSql(workspaceId, users.clientAdmin.userId, "client_admin", "client", clientIds.clientAdmin, "2026-06-06T16:03:00.000Z")}
${assignmentInsertSql(workspaceId, users.workspaceAdmin.userId, "workspace_admin", "workspace", workspaceId, "2026-06-06T16:04:00.000Z")}
`);

  return {
    ...projectIds,
    clientIds,
    users,
  };
}

function userFixture(label) {
  return {
    userId: `${label}-${randomUUID()}`,
    username: `${label}-${randomUUID()}@example.test`,
  };
}

function userInsertSql(workspaceId, user) {
  return `
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  ${sqlText(user.username)},
  ${sqlText(user.username)},
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);`;
}

function membershipInsertSql(workspaceId, user, now) {
  return `
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
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function clientInsertSql(workspaceId, clientId, name, now) {
  return `
INSERT INTO clients (
  id,
  workspace_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  ${sqlText(name)},
  'Active',
  'yes',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function projectInsertSql(workspaceId, clientId, projectId, name, defaultAssigneeMode, now) {
  return `
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
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${clientId ? sqlText(clientId) : "NULL"},
  NULL,
  ${sqlText(name)},
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
  ${sqlText(defaultAssigneeMode)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  const scopedClientId = scopeType === "client" ? scopeId : null;
  const scopedProjectId = scopeType === "project" ? scopeId : null;

  return `
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(roleId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  ${scopedClientId ? sqlText(scopedClientId) : "NULL"},
  ${scopedProjectId ? sqlText(scopedProjectId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
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
