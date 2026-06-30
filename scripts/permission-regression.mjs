/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-permission-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-permission-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Permission-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl);

  await runAccessGuardTests(api);
  await runApiKeyTests(api, fixtures);
  await runClientMutationTests(api, fixtures);
  await runProjectMutationTests(api, fixtures);
  await runTaskMutationTests(api, fixtures);
  await runTimeEntryMutationTests(api, fixtures);
  await runActiveTimerMutationTests(api, fixtures);
  await runUserMutationTests(api, fixtures);
  await runRoleAssignmentTests(api, fixtures);
  await runSettingsTests(api, fixtures);
  await runOwnershipScopeTests(api, fixtures);
  await runClientProjectDomainTests(api, fixtures);
  await runDisabledModuleTests(api, fixtures);
  await runReportingPermissionTests(api, fixtures);
  await runWorkspaceCreationModuleSettingTests(api, fixtures);
  await runWorkspaceOwnerLifecycleTests(api, fixtures);

  console.log(`Permission regression harness passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const workspaceId = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0].workspace_id;
  const superAdmin = (await querySql(`
SELECT user_id, username
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0];
  const now = new Date().toISOString();
  const users = {
    superAdmin,
    workspaceAdmin: userFixture("workspace-admin"),
    clientAdmin: userFixture("client-admin"),
    projectAdmin: userFixture("project-admin"),
    clientUser: userFixture("client-user"),
    projectUser: userFixture("project-user"),
    externalClientUser: userFixture("external-client-user"),
    unscopedUser: userFixture("unscoped-user"),
  };
  const clients = {
    alpha: { id: `client-alpha-${randomUUID()}`, name: "Alpha Client" },
    beta: { id: `client-beta-${randomUUID()}`, name: "Beta Client" },
  };
  const projects = {
    alpha: { id: `project-alpha-${randomUUID()}`, clientId: clients.alpha.id, name: "Alpha Project" },
    beta: { id: `project-beta-${randomUUID()}`, clientId: clients.beta.id, name: "Beta Project" },
    workspace: { id: `project-workspace-${randomUUID()}`, clientId: "", name: "Workspace Project" },
  };
  const otherWorkspace = {
    id: `workspace-other-${randomUUID()}`,
    clientId: `client-other-${randomUUID()}`,
  };
  const personalWorkspace = {
    id: `workspace-personal-${randomUUID()}`,
    projectId: `project-personal-${randomUUID()}`,
  };

  await runSql(`
${Object.values(users).filter((user) => user.userId).map((user) => userInsertSql(workspaceId, user)).join("\n")}
${Object.values(users).filter((user) => user.userId).map((user) => membershipInsertSql(workspaceId, user, now)).join("\n")}
${clientInsertSql(workspaceId, clients.alpha, now)}
${clientInsertSql(workspaceId, clients.beta, now)}
${projectInsertSql(workspaceId, projects.alpha, now)}
${projectInsertSql(workspaceId, projects.beta, now)}
${projectInsertSql(workspaceId, projects.workspace, now)}
${assignmentInsertSql(workspaceId, users.workspaceAdmin.userId, "workspace_admin", "workspace", workspaceId, now)}
${assignmentInsertSql(workspaceId, users.clientAdmin.userId, "client_admin", "client", clients.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.projectAdmin.userId, "project_admin", "client", clients.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.clientUser.userId, "client_user", "client", clients.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.projectUser.userId, "project_user", "project", projects.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.externalClientUser.userId, "client_external_user", "client", clients.alpha.id, now)}
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(otherWorkspace.id)}, 'Other Workspace', 'Active', 'business', ${sqlText(superAdmin.user_id)}, ${sqlText(now)}, ${sqlText(now)});
${workspaceModuleInsertSql(otherWorkspace.id, "tasks", now)}
${workspaceModuleInsertSql(otherWorkspace.id, "time-tracking", now)}
${clientInsertSql(otherWorkspace.id, { id: otherWorkspace.clientId, name: "Other Workspace Client" }, now)}
${workspaceInsertSql(personalWorkspace.id, "Personal Harness Workspace", "personal", users.workspaceAdmin.userId, now)}
${workspaceSettingsInsertSql(personalWorkspace.id, now)}
${workspaceModuleInsertSql(personalWorkspace.id, "tasks", now)}
${workspaceModuleInsertSql(personalWorkspace.id, "time-tracking", now)}
${Object.values(users).filter((user) => user.userId).map((user) => membershipInsertSql(personalWorkspace.id, user, now)).join("\n")}
${projectInsertSql(personalWorkspace.id, { id: personalWorkspace.projectId, clientId: "", name: "Personal Workspace Project" }, now)}
${assignmentInsertSql(personalWorkspace.id, users.workspaceAdmin.userId, "workspace_admin", "workspace", personalWorkspace.id, now)}
`);

  const sessions = {};
  for (const [key, user] of Object.entries(users)) {
    const userId = user.userId || user.user_id;
    const username = user.username;
    sessions[key] = await createSession(workspaceId, userId, username);
  }

  sessions.personalWorkspaceAdmin = await createSession(
    personalWorkspace.id,
    users.workspaceAdmin.userId,
    users.workspaceAdmin.username,
  );

  return { workspaceId, users, sessions, clients, projects, otherWorkspace, personalWorkspace };
}

async function runAccessGuardTests(api) {
  await expectStatus("unauthenticated browser API requests return 401", api.get("/api/clients"), 401);
  const response = await api.get("/dashboard.html");
  check("protected HTML redirects unauthenticated users to login", () => {
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login.html");
  });
}

async function runApiKeyTests(api, fixtures) {
  await expectStatus("API key route rejects missing key", api.get("/api/v1/clients"), 401);
  await expectStatus("API key route rejects invalid key", api.get("/api/v1/clients", { bearer: "ltf_live_invalid" }), 401);

  const underscoped = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["projects:read"]);
  await expectStatus("API key route rejects underscoped key", api.get("/api/v1/clients", { bearer: underscoped.rawKey }), 403);

  const revoked = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["clients:read"]);
  await expectStatus(
    "workspace admin can revoke API keys",
    api.put(`/api/api-keys/${revoked.apiKey.api_key_id}/revoke`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus("API key route rejects revoked key", api.get("/api/v1/clients", { bearer: revoked.rawKey }), 401);
  await expectStatus(
    "project user cannot create API keys",
    api.post("/api/api-keys", { name: "Denied key", scopes: ["clients:read"] }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const personalClientKey = await createApiKey(api, fixtures.sessions.personalWorkspaceAdmin, ["clients:read", "projects:read"]);
  await expectStatus(
    "public API client reads are business-only",
    api.get("/api/v1/clients", { bearer: personalClientKey.rawKey }),
    403,
  );
  await expectStatus(
    "public API project reads remain available in personal workspaces",
    api.get("/api/v1/projects", { bearer: personalClientKey.rawKey }),
    200,
  );

  const taskReadKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read"]);
  const taskWriteKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:write"]);
  const taskFullKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read", "tasks:write"]);
  await expectStatus(
    "public API task reads require tasks read scope",
    api.get("/api/v1/tasks", { bearer: taskReadKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API task writes reject read-only keys",
    api.post("/api/v1/tasks", { title: "Denied public API task" }, { bearer: taskReadKey.rawKey }),
    403,
  );
  await expectStatus(
    "public API task reads reject write-only keys",
    api.get("/api/v1/tasks", { bearer: taskWriteKey.rawKey }),
    403,
  );
  const publicTask = await expectStatus(
    "public API can create project tasks",
    api.post("/api/v1/tasks", {
      title: "Public API project task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
      due_date: "2026-06-12",
    }, { bearer: taskFullKey.rawKey }),
    201,
  );
  fixtures.publicApiTaskId = publicTask.body.data.task_id;
  check("public API task create inherits project client context", () => {
    assert.equal(publicTask.body.data.project_id, fixtures.projects.alpha.id);
    assert.equal(publicTask.body.data.client_id, fixtures.clients.alpha.id);
    assert.equal(publicTask.body.workspace_id, fixtures.workspaceId);
  });
  await expectStatus(
    "public API can read task by id",
    api.get(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}`, { bearer: taskReadKey.rawKey }),
    200,
  ).then((response) => {
    check("public API task read returns requested task", () => {
      assert.equal(response.body.data.task_id, fixtures.publicApiTaskId);
    });
  });
  await expectStatus(
    "public API can update tasks",
    api.put(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}`, {
      title: "Public API project task updated",
      priority: "urgent",
      status: "in_progress",
    }, { bearer: taskFullKey.rawKey }),
    200,
  ).then((response) => {
    check("public API task update persists lifecycle fields", () => {
      assert.equal(response.body.data.priority, "urgent");
      assert.equal(response.body.data.status, "in_progress");
    });
  });
  await expectStatus(
    "public API can complete tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}/complete`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can reopen tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}/reopen`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can archive tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}/archive`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can restore tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(fixtures.publicApiTaskId)}/restore`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
}

async function runClientMutationTests(api, fixtures) {
  const client = await createClient(api, fixtures.sessions.workspaceAdmin, "Mutation Client");
  const childClient = await createClient(api, fixtures.sessions.workspaceAdmin, "Nested Child Client", {
    parent_client_id: fixtures.clients.alpha.id,
  });
  await expectStatus(
    "workspace admin can update clients",
    api.put(`/api/clients/${encodeURIComponent(client.id)}`, { name: "Mutation Client Updated" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "client cannot become its own parent",
    api.put(`/api/clients/${encodeURIComponent(client.id)}`, { name: client.name, parent_client_id: client.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "client cannot be nested below one of its descendants",
    api.put(`/api/clients/${encodeURIComponent(fixtures.clients.alpha.id)}`, { name: fixtures.clients.alpha.name, parent_client_id: childClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive clients",
    api.delete(`/api/clients/${encodeURIComponent(client.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot create clients",
    api.post("/api/clients", { name: "Denied Client" }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "personal workspace admin cannot list clients",
    api.get("/api/clients", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
  await expectStatus(
    "personal workspace admin cannot create clients",
    api.post("/api/clients", { name: "Denied Personal Client" }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
  await expectStatus(
    "personal workspace hides clients in combined project payload",
    api.get("/api/client-projects", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    200,
  ).then((response) => {
    check("personal workspace combined payload has only workspace projects", () => {
      assert.equal(response.body.clients.length, 0);
      assert.ok(response.body.workspaceProjects.some((project) => project.id === fixtures.personalWorkspace.projectId));
    });
  });
}

async function runProjectMutationTests(api, fixtures) {
  const project = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Mutation Project");
  const childProject = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Nested Child Project", {
    parent_project_id: fixtures.projects.alpha.id,
  });
  await expectStatus(
    "workspace admin can update projects",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { name: "Mutation Project Updated" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can move projects across clients",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: fixtures.clients.beta.id, name: "Mutation Project Moved" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can move projects to workspace scope",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: "", name: "Mutation Project Workspace" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "personal workspace admin can create workspace projects without clients",
    api.post("/api/projects", { name: `Personal Project ${randomUUID()}` }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    201,
  );
  await expectStatus(
    "project cannot become its own parent",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: "", name: project.name, parent_project_id: project.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "project cannot be nested below one of its descendants",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: childProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "project parent must stay in the same client scope",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: fixtures.projects.beta.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive projects",
    api.delete(`/api/projects/${encodeURIComponent(project.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project admin cannot move a project without current scope permission",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.beta.id)}`, { client_id: fixtures.clients.alpha.id, name: "Denied Move" }, { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
  await expectStatus(
    "project admin cannot move a project to an unauthorized target client",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.beta.id, name: "Denied Target Move" }, { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
}

async function runTaskMutationTests(api, fixtures) {
  const workspaceTask = await expectStatus(
    "workspace admin can create workspace-only tasks",
    api.post("/api/tasks", {
      title: "Workspace task",
      priority: "high",
      due_date: "2026-06-05",
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("workspace-only task has no client or project scope", () => {
    assert.equal(workspaceTask.body.task.client_id, "");
    assert.equal(workspaceTask.body.task.project_id, "");
  });

  const scopedTask = await expectStatus(
    "project user can create assigned project tasks",
    api.post("/api/tasks", {
      title: "Project scoped task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  check("project task inherits client context from project", () => {
    assert.equal(scopedTask.body.task.project_id, fixtures.projects.alpha.id);
    assert.equal(scopedTask.body.task.client_id, fixtures.clients.alpha.id);
    assert.deepEqual(scopedTask.body.task.assignee_ids, [fixtures.users.projectUser.userId]);
  });
  const timedOverdue = localPastMinuteDue();
  const timedOverdueTask = await expectStatus(
    "workspace admin can create a same-day timed overdue task",
    api.post("/api/tasks", {
      title: "Same-day timed overdue task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
      due_date: timedOverdue.date,
      due_time: timedOverdue.time,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  await expectStatus(
    "dashboard task summary respects due time for overdue tasks",
    api.get("/api/dashboard", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("same-day timed overdue task is overdue, not due soon", () => {
      const overdueIds = response.body.tasks.summary.overdue.map((task) => task.task_id);
      const dueSoonIds = response.body.tasks.summary.dueSoon.map((task) => task.task_id);
      assert.ok(overdueIds.includes(timedOverdueTask.body.task.task_id));
      assert.equal(dueSoonIds.includes(timedOverdueTask.body.task.task_id), false);
    });
  });

  await expectStatus(
    "project user cannot create tasks outside assigned project",
    api.post("/api/tasks", {
      title: "Denied project task",
      project_id: fixtures.projects.beta.id,
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "project user can complete own assigned tasks",
    api.post(`/api/tasks/${encodeURIComponent(scopedTask.body.task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot archive tasks",
    api.post(`/api/tasks/${encodeURIComponent(scopedTask.body.task.task_id)}/archive`, {}, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "workspace admin can archive tasks",
    api.post(`/api/tasks/${encodeURIComponent(scopedTask.body.task.task_id)}/archive`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can restore tasks",
    api.post(`/api/tasks/${encodeURIComponent(scopedTask.body.task.task_id)}/restore`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can bulk update task priority",
    api.post("/api/tasks/bulk", {
      action: "priority",
      priority: "urgent",
      task_ids: [scopedTask.body.task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("bulk priority update returns updated task", () => {
      assert.equal(response.body.tasks[0].priority, "urgent");
      assert.equal(response.body.errors.length, 0);
    });
  });
  await expectStatus(
    "workspace admin can bulk replace task assignees",
    api.post("/api/tasks/bulk", {
      action: "assignee_replace",
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      task_ids: [scopedTask.body.task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("bulk assignee replace returns exact assignee list", () => {
      assert.deepEqual(response.body.tasks[0].assignee_ids, [fixtures.users.workspaceAdmin.userId]);
      assert.equal(response.body.errors.length, 0);
    });
  });
  await expectStatus(
    "workspace admin can bulk restore task assignee",
    api.post("/api/tasks/bulk", {
      action: "assignee_replace",
      assignee_ids: [fixtures.users.projectUser.userId],
      task_ids: [scopedTask.body.task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user bulk archive reuses task archive permission",
    api.post("/api/tasks/bulk", {
      action: "archive",
      task_ids: [scopedTask.body.task.task_id],
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("bulk archive reports denied selected task", () => {
      assert.equal(response.body.tasks.length, 0);
      assert.equal(response.body.errors[0].status, 403);
    });
  });
  await expectStatus(
    "workspace admin can save workspace task reminder defaults",
    api.put("/api/settings", {
      workspaceName: "Harness Business Workspace",
      workspaceType: "business",
      taskReminderDefaults: {
        dateTime: [60, 180],
        dateOnly: [1440, 2880],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("workspace task reminder defaults are returned from settings save", () => {
      assert.deepEqual(response.body.data.taskReminderDefaults.dateTime, [60, 180]);
      assert.deepEqual(response.body.data.taskReminderDefaults.dateOnly, [1440, 2880]);
    });
  });
  await expectStatus(
    "workspace admin can save client task reminder defaults",
    api.put(`/api/clients/${fixtures.clients.alpha.id}`, {
      name: "Alpha Client",
      status: "Active",
      billable: "yes",
      taskReminderPolicy: {
        inherited: false,
        dateTime: [90, 240],
        dateOnly: [2880, 4320],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can save project task reminder defaults",
    api.put(`/api/projects/${fixtures.projects.alpha.id}`, {
      name: "Alpha Project",
      status: "Active",
      client_id: fixtures.clients.alpha.id,
      billable: "yes",
      confirm_downstream_update: true,
      taskReminderPolicy: {
        inherited: false,
        dateTime: [120, 360],
        dateOnly: [1440, 4320],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can save task reminder overrides",
    api.put(`/api/tasks/${encodeURIComponent(scopedTask.body.task.task_id)}`, {
      title: "Project scoped task",
      project_id: fixtures.projects.alpha.id,
      reminderOverrideEnabled: true,
      reminderPolicy: {
        dateTime: [30, 60],
        dateOnly: [1440, 2880],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("task reminder override is returned with effective policy", () => {
      assert.equal(response.body.task.reminderDetails.overrideEnabled, true);
      assert.deepEqual(response.body.task.reminderDetails.effectivePolicy.offsets.dateTime, [30, 60]);
    });
  });
  const recurringTask = await expectStatus(
    "workspace admin can create recurring project tasks",
    api.post("/api/tasks", {
      title: "Recurring project task",
      project_id: fixtures.projects.alpha.id,
      due_date: localDateOffset(0),
      assignee_ids: [fixtures.users.projectUser.userId],
      recurrence: {
        enabled: true,
        frequency: "DAILY",
        interval: 1,
        endDate: localDateOffset(2),
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("recurring task returns recurrence details", () => {
    assert.ok(recurringTask.body.task.recurrence_template_id);
    assert.equal(recurringTask.body.task.recurrence_instance_date, localDateOffset(0));
    assert.equal(recurringTask.body.task.recurrenceDetails.frequency, "DAILY");
  });
  const completedRecurringTask = await expectStatus(
    "project user can complete own recurring task and create next instance",
    api.post(`/api/tasks/${encodeURIComponent(recurringTask.body.task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  check("recurring completion creates next dated task", () => {
    assert.equal(completedRecurringTask.body.task.status, "complete");
    assert.equal(completedRecurringTask.body.createdTask.due_date, localDateOffset(1));
    assert.equal(completedRecurringTask.body.createdTask.recurrence_template_id, recurringTask.body.task.recurrence_template_id);
  });
  await expectStatus(
    "recurring completion retry reuses existing next instance",
    api.post(`/api/tasks/${encodeURIComponent(recurringTask.body.task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("recurring retry does not duplicate next instance", () => {
      assert.equal(response.body.createdTask.task_id, completedRecurringTask.body.createdTask.task_id);
      assert.equal(response.body.createdTask.recurrence_instance_date, localDateOffset(1));
    });
  });
  const calendarRangeStart = localDateOffset(0);
  const calendarRangeEnd = localDateOffset(2);
  await expectStatus(
    "task calendar API returns scoped due-date tasks",
    api.get(`/api/tasks/calendar?start=${calendarRangeStart}&end=${calendarRangeEnd}`, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task calendar payload is calendar-ready and scope filtered", () => {
      const taskIds = response.body.tasks.map((task) => task.task_id);
      assert.ok(taskIds.includes(recurringTask.body.task.task_id));
      assert.ok(taskIds.includes(completedRecurringTask.body.createdTask.task_id));
      assert.ok(!taskIds.includes(workspaceTask.body.task.task_id));
      assert.equal(response.body.tasks.find((task) => task.task_id === recurringTask.body.task.task_id).source.type, "task");
      assert.equal(response.body.tasks.find((task) => task.task_id === recurringTask.body.task.task_id).url.startsWith("tasks.html?task="), true);
    });
  });
  await expectStatus(
    "dashboard task panels include scoped task links",
    api.get("/api/dashboard", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("dashboard task summary respects task scope and exposes task URLs", () => {
      const dueSoonIds = response.body.tasks.summary.dueSoon.map((task) => task.task_id);
      assert.ok(dueSoonIds.includes(completedRecurringTask.body.createdTask.task_id));
      assert.ok(!dueSoonIds.includes(workspaceTask.body.task.task_id));
      assert.equal(response.body.tasks.summary.dueSoon[0].url.startsWith("tasks.html?task="), true);
      assert.ok(response.body.extensionPoints.dashboardPanels.some((panel) => panel.id === "task-summary" && panel.renderer === "task-summary"));
    });
  });
  const timerTask = await expectStatus(
    "project user can create task timer eligible project task",
    api.post("/api/tasks", {
      title: "Task timer project task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  fixtures.taskTimerTaskId = timerTask.body.task.task_id;
  const timerGateTask = await expectStatus(
    "project user can create task timer gate test task",
    api.post("/api/tasks", {
      title: "Task timer gate task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  fixtures.taskTimerGateTaskId = timerGateTask.body.task.task_id;
  await expectStatus(
    "project user can start task timer",
    api.put(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 5,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task timer returns active timer state", () => {
      assert.equal(response.body.timer.task_id, timerTask.body.task.task_id);
      assert.equal(response.body.timer.timer_status, "running");
    });
  });
  await assertUnifiedTimerState({
    label: "task timer is stored in unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_module_id: "tasks",
      source_type: "task",
      source_id: timerTask.body.task.task_id,
      timer_status: "running",
    },
  });
  await expectStatus(
    "tasks cannot complete while task timer is active",
    api.post(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    400,
  );
  await expectStatus(
    "starting normal timer pauses running task timer",
    api.put("/api/active-timers/task-mutual", timerPayload(fixtures.projects.alpha.id, {
      timer_status: "running",
      accumulated_elapsed_seconds: 3,
      last_active_start_time: new Date().toISOString(),
    }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await assertUnifiedTimerState({
    label: "manual timer is stored in unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_type: "manual",
      timer_slot: "task-mutual",
      timer_status: "running",
    },
  });
  await expectStatus(
    "project user can list task timers",
    api.get("/api/tasks/timers", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("normal timer start paused task timer", () => {
      const timer = response.body.timers.find((item) => item.task_id === timerTask.body.task.task_id);
      assert.equal(timer.timer_status, "paused");
    });
  });
  await assertUnifiedTimerState({
    label: "normal timer start pauses sourced task timer in unified table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_module_id: "tasks",
      source_type: "task",
      source_id: timerTask.body.task.task_id,
      timer_status: "paused",
    },
  });
  await expectStatus(
    "starting task timer pauses normal active timer",
    api.put(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 8,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can list active timers after task timer starts",
    api.get("/api/active-timers", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task timer start paused normal timer", () => {
      const timer = response.body.timers.find((item) => item.timer_slot === "task-mutual");
      assert.equal(timer.timer_status, "paused");
    });
  });
  await expectStatus(
    "project user can load Workbench bootstrap",
    api.get("/api/workbench/bootstrap", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench bootstrap returns normalized timers and task items", () => {
      assert.equal(response.body.modules.tasks.enabled, true);
      assert.equal(response.body.modules.timeTracking.enabled, true);
      assert.ok(response.body.timers.some((timer) => timer.source_type === "manual" && timer.timer_slot === "task-mutual"));
      assert.ok(response.body.timers.some((timer) => timer.source_module_id === "tasks" && timer.source_id === timerTask.body.task.task_id));
      assert.ok(response.body.taskItems.some((task) => task.source_type === "task" && task.source_id === timerTask.body.task.task_id));
    });
  });
  await expectStatus(
    "Workbench can pause a sourced task timer without losing source metadata",
    api.put(`/api/workbench/timers/${encodeURIComponent(`source:tasks:task:${timerTask.body.task.task_id}`)}/status`, {
      timer_status: "paused",
      accumulated_elapsed_seconds: 12,
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench status action preserves task timer source", () => {
      assert.equal(response.body.timer.source_module_id, "tasks");
      assert.equal(response.body.timer.source_type, "task");
      assert.equal(response.body.timer.source_id, timerTask.body.task.task_id);
      assert.equal(response.body.timer.timer_status, "paused");
    });
  });
  await expectStatus(
    "project user can restart task timer after Workbench pause",
    api.put(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 60,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await assertUnifiedTimerState({
    label: "task timer start pauses manual timer in unified table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_type: "manual",
      timer_slot: "task-mutual",
      timer_status: "paused",
    },
  });
  await expectStatus(
    "project user can finalize task timer into time entry",
    api.post(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/timer/finalize`, {
      duration_seconds: 60,
      end_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  ).then((response) => {
    check("task timer finalize returns time entry id", () => {
      assert.ok(response.body.entry_id);
      assert.equal(response.body.task_id, timerTask.body.task.task_id);
    });
  });
  await expectStatus(
    "task timer time entry stores task id",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("time entries include finalized task timer link", () => {
      assert.ok(response.body.entries.some((entry) => entry.task_id === timerTask.body.task.task_id));
    });
  });
  await assertNoUnifiedTimerState({
    label: "finalized task timer is removed from unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    sourceId: timerTask.body.task.task_id,
  });
  await expectStatus(
    "project user can complete task after task timer is finalized",
    api.post(`/api/tasks/${encodeURIComponent(timerTask.body.task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "client admin can list scoped tasks",
    api.get("/api/tasks", { cookie: fixtures.sessions.clientAdmin }),
    200,
  ).then((response) => {
    check("client admin scoped task list includes assigned client task", () => {
      assert.ok(response.body.tasks.some((task) => task.task_id === scopedTask.body.task.task_id));
      assert.ok(!response.body.tasks.some((task) => task.task_id === workspaceTask.body.task.task_id));
    });
  });
  await expectStatus(
    "personal workspace admin can create project tasks without clients",
    api.post("/api/tasks", {
      title: "Personal project task",
      project_id: fixtures.personalWorkspace.projectId,
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    201,
  );
  await expectStatus(
    "personal workspace rejects direct client task scope",
    api.post("/api/tasks", {
      title: "Denied personal client task",
      client_id: fixtures.clients.alpha.id,
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
}

async function runTimeEntryMutationTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
  const correctionTag = await createTag(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "Admin Correction");
  await expectStatus(
    "project user can update own time entries",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Updated own entry" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "client user cannot update another user's time entry",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Denied edit all" }), { cookie: fixtures.sessions.clientUser }),
    403,
  );
  const adminCorrection = await expectStatus(
    "workspace admin can correct another user's workspace time entry with tags",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, {
      billable: "no",
      description: "Workspace admin corrected entry",
      duration_hours: "1.50",
      duration_seconds: 5400,
      end_time: "2026-06-02T14:30:00.000Z",
      tagIds: [correctionTag.tagId],
    }), { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("workspace admin correction preserves original time entry owner", () => {
    assert.equal(adminCorrection.body.entry.user_id, fixtures.users.projectUser.userId);
  });
  check("workspace admin correction returns updated manual tag", () => {
    assert.ok((adminCorrection.body.entry.tags || []).some((tag) => tag.tag_id === correctionTag.tagId));
  });
  const correctedList = await expectStatus(
    "workspace admin corrected time entry appears in time-entry list",
    api.get("/api/time-entries", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("time-entry list reflects workspace admin correction fields", () => {
    const corrected = correctedList.body.entries.find((item) => item.entry_id === entry.entry_id);
    assert.equal(corrected?.description, "Workspace admin corrected entry");
    assert.equal(Number(corrected?.duration_seconds), 5400);
    assert.ok((corrected?.tags || []).some((tag) => tag.tag_id === correctionTag.tagId));
  });
  const reporting = await expectStatus(
    "reporting reflects workspace admin time entry correction",
    api.get(`/api/reporting/project-summary?scopeId=${encodeURIComponent(fixtures.clients.alpha.id)}&projectIds=${encodeURIComponent(fixtures.projects.alpha.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("reporting summary includes corrected raw duration", () => {
    const row = reporting.body.rows.find((item) => item.project.id === fixtures.projects.alpha.id);
    assert.ok(row?.rawSeconds >= 5400);
  });
  const auditRows = await querySql(`
SELECT metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND record_type = 'time_entry'
  AND record_id = ${sqlText(entry.entry_id)}
  AND action = 'time_entry_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  check("workspace admin correction audit records admin metadata", () => {
    assert.ok(auditRows.length > 0);
    const metadata = JSON.parse(auditRows[0].metadata_json || "{}");
    assert.equal(metadata.admin_correction, true);
    assert.equal(metadata.corrected_user_id, fixtures.users.projectUser.userId);
    assert.ok((metadata.sensitive_fields_changed || []).includes("billable"));
  });
  const searchRows = await querySql(`
SELECT title, body, tags_text
FROM search_index
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'time-tracking'
  AND record_type = 'time_entry'
  AND record_id = ${sqlText(entry.entry_id)}
LIMIT 1;
`);
  check("search index reflects workspace admin correction and tag", () => {
    assert.equal(searchRows[0]?.title, "Workspace admin corrected entry");
    assert.ok(String(searchRows[0]?.tags_text || "").includes("Admin Correction"));
  });
  await expectStatus(
    "project user can delete own time entries",
    api.delete(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot create time entries outside assigned project",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.beta.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const crossWorkspaceEntryId = `cross-workspace-entry-${randomUUID()}`;
  await insertTimeEntry(fixtures.otherWorkspace.id, {
    entryId: crossWorkspaceEntryId,
    projectId: "other-project",
    userId: fixtures.users.projectUser.userId,
  });
  await expectStatus(
    "workspace admin cannot correct cross-workspace time entries",
    api.put(`/api/time-entries/${encodeURIComponent(crossWorkspaceEntryId)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Denied cross workspace correction" }), { cookie: fixtures.sessions.workspaceAdmin }),
    404,
  );
}

async function runActiveTimerMutationTests(api, fixtures) {
  await expectStatus(
    "project user can save active timers",
    api.put("/api/active-timers/1", timerPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can finalize active timers",
    api.post("/api/active-timers/1/finalize", timeEntryPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    201,
  );
  await expectStatus(
    "project user can remove active timers",
    api.delete("/api/active-timers/2", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot save active timers outside assigned project",
    api.put("/api/active-timers/3", timerPayload(fixtures.projects.beta.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "project user can save active timer slot before compaction",
    api.put("/api/active-timers/1", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 1" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can save middle active timer slot before compaction",
    api.put("/api/active-timers/3", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 3" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can save later active timer slot before compaction",
    api.put("/api/active-timers/4", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 4" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "removing a middle active timer compacts later manual timer slots",
    api.delete("/api/active-timers/3", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("manual active timer slots are compact after middle removal", () => {
      const slots = response.body.timers
        .map((timer) => timer.timer_slot)
        .filter((timerSlot) => /^[1-9]\d*$/.test(timerSlot));
      assert.deepEqual(slots, ["1", "2"]);
    });
  });
  await expectStatus(
    "project user can remove first compacted active timer",
    api.delete("/api/active-timers/1", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can remove remaining compacted active timer",
    api.delete("/api/active-timers/1", { cookie: fixtures.sessions.projectUser }),
    200,
  );
}

async function runUserMutationTests(api, fixtures) {
  const created = await api.post("/api/users", {
    username: uniqueEmail("mutation-user"),
    displayName: "Mutation User",
    timezone: "America/New_York",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can create users", created, 201);
  const userId = created.body.user.user_id;

  await expectStatus(
    "workspace admin can update users",
    api.put(`/api/users/${userId}/update`, { displayName: "Mutation User Updated", timezone: "America/New_York" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus("workspace admin can deactivate users", api.put(`/api/users/${userId}/deactivate`, {}, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("workspace admin can reactivate users", api.put(`/api/users/${userId}/reactivate`, {}, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("workspace admin can remove users", api.delete(`/api/users/${userId}`, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus(
    "project user cannot create users",
    api.post("/api/users", { username: uniqueEmail("denied-user") }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
}

async function runRoleAssignmentTests(api, fixtures) {
  await expectStatus(
    "client admin can read role options for scoped assignments",
    api.get("/api/roles", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "client admin can assign project users in assigned client",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.alpha.id,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "client admin cannot assign project users outside assigned client",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.beta.id,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await expectStatus(
    "project admin can assign project users in assigned client",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.alpha.id,
      }],
    }, { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can update role assignments",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.clients.alpha.id,
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "role assignment scope IDs must belong to the active workspace",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.otherWorkspace.clientId,
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
}

async function runSettingsTests(api, fixtures) {
  const settings = await api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can read workspace settings", settings, 200);
  await expectStatus(
    "workspace admin can update workspace settings",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(settings.body),
      workspaceName: "Permission Regression Workspace",
      moduleSettings: moduleSettingsPayload(settings.body),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot update workspace settings",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(settings.body),
      workspaceName: "Denied Workspace",
      moduleSettings: moduleSettingsPayload(settings.body),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
}

async function runOwnershipScopeTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
  const adminEntry = await createTimeEntry(api, fixtures.sessions.workspaceAdmin, fixtures.projects.alpha.id);
  const clientAdminList = await expectStatus(
    "client admin can list scoped time entries from other users",
    api.get("/api/time-entries", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("client admin scoped time list includes team entries in assigned client", () => {
    assert.ok(clientAdminList.body.entries.some((item) => item.entry_id === adminEntry.entry_id));
  });
  const projectAdminList = await expectStatus(
    "project admin can list scoped project time entries from other users",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project admin scoped time list includes team entries in assigned client", () => {
    assert.ok(projectAdminList.body.entries.some((item) => item.entry_id === adminEntry.entry_id));
  });
  const update = await api.put(
    `/api/time-entries/${encodeURIComponent(entry.entry_id)}`,
    timeEntryPayload(fixtures.projects.alpha.id, { user_id: fixtures.users.clientUser.userId, description: "Attempted owner spoof" }),
    { cookie: fixtures.sessions.projectUser },
  );
  await expectStatus("time-entry update accepts valid owner-spoof regression request", update, 200);
  check("time-entry update cannot change user_id", () => {
    assert.equal(update.body.entry.user_id, fixtures.users.projectUser.userId);
  });

  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:write"]);
  const create = await api.post("/api/v1/time-entries", timeEntryPayload(fixtures.projects.alpha.id, {
    user_id: fixtures.users.projectUser.userId,
    description: "Public API attempted owner spoof",
  }), { bearer: apiKey.rawKey });
  await expectStatus("public API time-entry create accepts valid owner-spoof regression request", create, 201);
  check("public API time-entry create cannot spoof user_id", () => {
    assert.equal(create.body.data.user_id, fixtures.users.workspaceAdmin.userId);
  });
}

async function runClientProjectDomainTests(api, fixtures) {
  const archivedClient = await createClient(api, fixtures.sessions.workspaceAdmin, "Archived Scope Client");
  const archivedProject = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Archived Scope Project");
  await expectStatus(
    "archived clients remain readable before downstream checks",
    api.get(`/api/clients/${encodeURIComponent(archivedClient.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can archive clients for downstream checks",
    api.delete(`/api/clients/${encodeURIComponent(archivedClient.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived clients cannot receive new projects",
    api.post(`/api/clients/${encodeURIComponent(archivedClient.id)}/projects`, { name: "Denied Archived Client Project" }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived clients cannot be assigned as parent clients",
    api.post("/api/clients", { name: "Denied Archived Parent Client", parent_client_id: archivedClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "existing clients cannot be moved under archived parent clients",
    api.put(`/api/clients/${encodeURIComponent(fixtures.clients.beta.id)}`, { name: fixtures.clients.beta.name, parent_client_id: archivedClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "projects cannot move into archived clients",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: archivedClient.id, name: "Denied Archived Client Move" }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive projects for downstream checks",
    api.delete(`/api/projects/${encodeURIComponent(archivedProject.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived projects remain readable",
    api.get(`/api/projects/${encodeURIComponent(archivedProject.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived projects cannot be assigned as parent projects",
    api.post(`/api/clients/${encodeURIComponent(fixtures.clients.alpha.id)}/projects`, { name: "Denied Archived Parent Project", parent_project_id: archivedProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "existing projects cannot be moved under archived parent projects",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: archivedProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived projects cannot receive time entries",
    api.post("/api/time-entries", timeEntryPayload(archivedProject.id), { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived projects cannot receive active timers",
    api.put("/api/active-timers/archived-project", timerPayload(archivedProject.id), { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:write"]);
  await expectStatus(
    "archived projects cannot receive public API time entries",
    api.post("/api/v1/time-entries", timeEntryPayload(archivedProject.id), { bearer: apiKey.rawKey }),
    400,
  );
}

async function runWorkspaceOwnerLifecycleTests(api, fixtures) {
  const ownedWorkspace = await expectStatus(
    "workspace admin can create an owned workspace for lifecycle checks",
    api.post("/api/workspaces", {
      workspaceName: `Owner Lifecycle ${randomUUID()}`,
      workspaceType: "business",
      timeTrackingEnabled: true,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const transferAdmin = userFixture("owner-transfer-admin");
  const transferNow = "2026-01-01T00:00:00.000Z";

  await runSql(`
${userInsertSql(ownedWorkspace.body.workspace.workspaceId, transferAdmin)}
${membershipInsertSql(ownedWorkspace.body.workspace.workspaceId, transferAdmin, transferNow)}
${assignmentInsertSql(ownedWorkspace.body.workspace.workspaceId, transferAdmin.userId, "workspace_admin", "workspace", ownedWorkspace.body.workspace.workspaceId, transferNow)}
`);
  const transferAdminSession = await createSession(
    ownedWorkspace.body.workspace.workspaceId,
    transferAdmin.userId,
    transferAdmin.username,
  );
  await expectStatus(
    "workspace owner removal transfers ownership to senior workspace admin",
    api.delete(`/api/users/${fixtures.users.workspaceAdmin.userId}`, { cookie: transferAdminSession }),
    200,
  );
  const transferredOwner = await querySql(`
SELECT owner_user_id
FROM workspaces
WHERE workspace_id = ${sqlText(ownedWorkspace.body.workspace.workspaceId)}
LIMIT 1;
`);
  check("workspace owner transfer selects the active workspace administrator", () => {
    assert.equal(transferredOwner[0]?.owner_user_id, transferAdmin.userId);
  });

  const blockedWorkspace = await expectStatus(
    "workspace admin can create a candidate-free owned workspace",
    api.post("/api/workspaces", {
      workspaceName: `Owner Block ${randomUUID()}`,
      workspaceType: "business",
      timeTrackingEnabled: true,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const blockedOwnerSession = await createSession(
    blockedWorkspace.body.workspace.workspaceId,
    fixtures.users.workspaceAdmin.userId,
    fixtures.users.workspaceAdmin.username,
  );
  await expectStatus(
    "workspace owner removal blocks when no other workspace admin exists",
    api.delete(`/api/users/${fixtures.users.workspaceAdmin.userId}`, { cookie: blockedOwnerSession }),
    400,
  );

  const unassigned = await api.post("/api/users", {
    username: uniqueEmail("unassigned-fallback"),
    displayName: "Unassigned Fallback",
    timezone: "America/New_York",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can create a user for no-workspace fallback", unassigned, 201);
  await expectStatus(
    "removing all workspace memberships creates a personal fallback workspace",
    api.put(`/api/users/${unassigned.body.user.user_id}/update`, {
      workspaceMemberships: [],
      timezone: "America/New_York",
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const fallbackMemberships = await querySql(`
SELECT workspaces.workspace_type, user_workspaces.workspace_id, user_workspaces.status, users.active_workspace_id
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
INNER JOIN users ON users.user_id = user_workspaces.user_id
WHERE user_workspaces.user_id = ${sqlText(unassigned.body.user.user_id)}
  AND user_workspaces.status = 'active'
ORDER BY workspaces.created_at DESC;
`);
  check("personal fallback workspace is active for unassigned user", () => {
    assert.equal(fallbackMemberships[0]?.workspace_type, "personal");
    assert.equal(fallbackMemberships[0]?.status, "active");
    assert.equal(fallbackMemberships[0]?.active_workspace_id, fallbackMemberships[0]?.workspace_id);
  });
}

async function runWorkspaceCreationModuleSettingTests(api, fixtures) {
  const userSettings = await expectStatus(
    "workspace admin can read workspace creation module controls",
    api.get("/api/user/settings", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const businessType = userSettings.body.workspaceCreation.availableTypes.find((type) => type.workspaceType === "business");

  check("Create Workspace exposes module settings for Business workspaces", () => {
    assert.ok(businessType);
    assert.ok(businessType.moduleSettings.some((moduleDefinition) => moduleDefinition.moduleId === "tasks"));
    assert.ok(businessType.moduleSettings.some((moduleDefinition) => moduleDefinition.moduleId === "time-tracking"));
  });
  check("required modules appear locked in Create Workspace module controls", () => {
    const requiredModule = businessType.moduleSettings.find((moduleDefinition) => moduleDefinition.moduleId === "client-projects");
    assert.ok(requiredModule);
    assert.ok(requiredModule.settings.some((setting) => setting.moduleStatus === true && setting.readOnly === true));
  });

  const tasksOffWorkspace = await expectStatus(
    "workspace admin can create Business workspace with Tasks off and Time Tracking on",
    api.post("/api/workspaces", {
      workspaceName: `Tasks Off ${randomUUID()}`,
      workspaceType: "business",
      moduleSettings: createWorkspaceModuleSettingsPayload(businessType, {
        tasks: { tasksEnabled: false },
        "time-tracking": { timeTrackingEnabled: true },
      }),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const tasksOffStatuses = await readWorkspaceModuleStatuses(tasksOffWorkspace.body.workspace.workspaceId);
  check("created workspace stores Tasks off and Time Tracking on", () => {
    assert.equal(tasksOffStatuses.get("tasks"), "disabled");
    assert.equal(tasksOffStatuses.get("time-tracking"), "enabled");
  });
  const tasksOffShell = await expectStatus(
    "app shell loads after creating workspace with Tasks disabled",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("disabled Tasks do not appear in nav after creation", () => {
    assert.equal(flattenNavigationHrefs(tasksOffShell.body.navigation).includes("tasks.html"), false);
  });

  const tasksOffSettings = await expectStatus(
    "Workspace Settings exposes the same Business module availability rules",
    api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("Workspace Settings keeps required module controls locked", () => {
    const requiredModule = tasksOffSettings.body.moduleSettings.find((moduleDefinition) => moduleDefinition.moduleId === "client-projects");
    assert.ok(requiredModule);
    assert.ok(requiredModule.settings.some((setting) => setting.moduleStatus === true && setting.readOnly === true));
  });
  check("Workspace Settings and Create Workspace expose matching Business module setting IDs", () => {
    assert.deepEqual(
      moduleStatusSettingKeys(tasksOffSettings.body.moduleSettings),
      moduleStatusSettingKeys(businessType.moduleSettings),
    );
  });

  const timeTrackingOffWorkspace = await expectStatus(
    "workspace admin can create Business workspace with Time Tracking off and Tasks on",
    api.post("/api/workspaces", {
      workspaceName: `Time Tracking Off ${randomUUID()}`,
      workspaceType: "business",
      moduleSettings: createWorkspaceModuleSettingsPayload(businessType, {
        tasks: { tasksEnabled: true },
        "time-tracking": { timeTrackingEnabled: false },
      }),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const timeTrackingOffStatuses = await readWorkspaceModuleStatuses(timeTrackingOffWorkspace.body.workspace.workspaceId);
  check("created workspace stores Time Tracking off and Tasks on", () => {
    assert.equal(timeTrackingOffStatuses.get("tasks"), "enabled");
    assert.equal(timeTrackingOffStatuses.get("time-tracking"), "disabled");
  });
  const timeTrackingOffShell = await expectStatus(
    "app shell loads after creating workspace with Time Tracking disabled",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("disabled Time Tracking does not appear in nav after creation", () => {
    const hrefs = flattenNavigationHrefs(timeTrackingOffShell.body.navigation);
    assert.equal(hrefs.includes("time-tracker.html"), false);
    assert.equal(hrefs.includes("manual-entry.html"), false);
    assert.equal(hrefs.includes("edit-entries.html"), false);
  });
}

async function runDisabledModuleTests(api, fixtures) {
  const settings = await api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can read settings before disabled-module smoke", settings, 200);
  check("settings expose Time Tracking module metadata", () => {
    const timeTrackingModule = settings.body.modules.find((moduleDefinition) => moduleDefinition.id === "time-tracking");
    assert.ok(timeTrackingModule);
    assert.ok(timeTrackingModule.navigation.some((item) => item.href === "time-tracker.html"));
    assert.ok(timeTrackingModule.dashboard.some((item) => item.id === "billing-summary"));
    assert.ok(timeTrackingModule.publicApiEndpoints.some((item) => item.path === "/api/v1/time-entries"));
    assert.ok(timeTrackingModule.settings.some((item) => item.id === "timeTrackingEnabled"));
  });
  check("settings expose Tasks module metadata", () => {
    const tasksModule = settings.body.modules.find((moduleDefinition) => moduleDefinition.id === "tasks");
    assert.ok(tasksModule);
    assert.ok(tasksModule.navigation.some((item) => item.href === "tasks.html"));
    assert.ok(tasksModule.publicApiEndpoints.some((item) => item.path === "/api/v1/tasks"));
    assert.ok(tasksModule.settings.some((item) => item.id === "tasksEnabled"));
    assert.ok(tasksModule.settings.some((item) => item.id === "taskTimersEnabled"));
    assert.ok(settings.body.tasksEnabled);
  });
  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:read", "time_entries:write"]);
  const tasksApiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read", "tasks:write"]);
  const disabledSettings = await api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      "time-tracking": { timeTrackingEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can disable Time Tracking", disabledSettings, 200);
  check("disabled Time Tracking is removed from enabled module list", () => {
    assert.equal(disabledSettings.body.data.timeTrackingEnabled, false);
    assert.equal(disabledSettings.body.data.enabledModules.includes("time-tracking"), false);
  });

  await expectStatus(
    "disabled Time Tracking keeps historical time-entry reads available",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "disabled Time Tracking keeps public API time-entry reads available",
    api.get("/api/v1/time-entries", { bearer: apiKey.rawKey }),
    200,
  );
  await expectStatus(
    "disabled Time Tracking blocks time-entry writes",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks public API time-entry writes",
    api.post("/api/v1/time-entries", timeEntryPayload(fixtures.projects.alpha.id), { bearer: apiKey.rawKey }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks active-timer writes",
    api.put("/api/active-timers/disabled-smoke", timerPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks task timer writes",
    api.put(`/api/tasks/${encodeURIComponent(fixtures.taskTimerGateTaskId)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 1,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus("workspace admin can re-enable Time Tracking", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      "time-tracking": { timeTrackingEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("workspace admin can disable Task Timers sub-option", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      tasks: { taskTimersEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus(
    "disabled Task Timers sub-option blocks task timer writes",
    api.put(`/api/tasks/${encodeURIComponent(fixtures.taskTimerGateTaskId)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 1,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus("workspace admin can re-enable Task Timers sub-option", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      tasks: { taskTimersEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  const disabledTasksSettings = await api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      tasks: { tasksEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can disable Tasks", disabledTasksSettings, 200);
  check("disabled Tasks are removed from enabled module list", () => {
    assert.equal(disabledTasksSettings.body.data.tasksEnabled, false);
    assert.equal(disabledTasksSettings.body.data.enabledModules.includes("tasks"), false);
  });
  await expectStatus(
    "disabled Tasks keep historical task reads available",
    api.get("/api/tasks", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "disabled Tasks keep public API task reads available",
    api.get("/api/v1/tasks", { bearer: tasksApiKey.rawKey }),
    200,
  );
  await expectStatus(
    "disabled Tasks block task writes",
    api.post("/api/tasks", { title: "Denied disabled task", project_id: fixtures.projects.alpha.id }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Tasks block public API task writes",
    api.post("/api/v1/tasks", { title: "Denied disabled public task", project_id: fixtures.projects.alpha.id }, { bearer: tasksApiKey.rawKey }),
    403,
  );
  await expectStatus("workspace admin can re-enable Tasks", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    moduleSettings: moduleSettingsPayload(settings.body, {
      tasks: { tasksEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("top-level legacy module settings are rejected", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(settings.body),
    timeTrackingEnabled: false,
  }, { cookie: fixtures.sessions.workspaceAdmin }), 400);
}

function workspaceSettingsSavePayload(settings) {
  return {
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    fiscalYear: settings.fiscalYear,
    defaultBillingRate: settings.defaultBillingRate,
    billingPeriod: settings.billingPeriod,
    billingRounding: settings.billingRounding,
    audit: settings.audit,
    taskReminderDefaults: settings.taskReminderDefaults,
  };
}

function moduleSettingsPayload(settings, overrides = {}) {
  const payload = {};

  for (const moduleDefinition of settings.moduleSettings || []) {
    const moduleId = moduleDefinition.moduleId;

    if (!moduleId) {
      continue;
    }

    payload[moduleId] = {};
    for (const setting of moduleDefinition.settings || []) {
      if (setting.readOnly === true) {
        continue;
      }
      payload[moduleId][setting.id] = setting.value;
    }
  }

  for (const [moduleId, settingsById] of Object.entries(overrides)) {
    payload[moduleId] = {
      ...(payload[moduleId] || {}),
      ...settingsById,
    };
  }

  return payload;
}

function createWorkspaceModuleSettingsPayload(workspaceType, overrides = {}) {
  const payload = moduleSettingsPayload({
    moduleSettings: workspaceType.moduleSettings || [],
  }, overrides);

  for (const [moduleId, settingsById] of Object.entries(payload)) {
    if (Object.keys(settingsById).length === 0) {
      delete payload[moduleId];
    }
  }

  return payload;
}

async function readWorkspaceModuleStatuses(workspaceId) {
  const rows = await querySql(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)};
`);

  return new Map(rows.map((row) => [row.module_id, row.status]));
}

function moduleStatusSettingKeys(moduleSettings) {
  return (moduleSettings || []).flatMap((moduleDefinition) => (
    (moduleDefinition.settings || [])
      .filter((setting) => setting.moduleStatus === true)
      .map((setting) => `${moduleDefinition.moduleId}.${setting.id}`)
  )).sort();
}

function flattenNavigationHrefs(navigation) {
  return (navigation || []).flatMap((item) => [
    item.href,
    ...flattenNavigationHrefs(item.children || []),
  ]).filter(Boolean);
}

async function runReportingPermissionTests(api, fixtures) {
  await expectStatus(
    "client user can read scoped reporting bootstrap",
    api.get("/api/reporting/bootstrap", { cookie: fixtures.sessions.clientUser }),
    200,
  );
  await expectStatus(
    "workspace admin can filter reporting summaries by task timer link",
    api.get(`/api/reporting/project-summary?scopeId=${encodeURIComponent(fixtures.clients.alpha.id)}&taskId=${encodeURIComponent(fixtures.taskTimerTaskId)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("task-linked reporting filter isolates finalized task timer time", () => {
      assert.deepEqual(response.body.taskFilter, [fixtures.taskTimerTaskId]);
      assert.equal(response.body.rows.length, 1);
      assert.equal(response.body.rows[0].project.id, fixtures.projects.alpha.id);
      assert.equal(response.body.rows[0].rawSeconds, 60);
      assert.equal(response.body.totals.seconds, 60);
    });
  });
  await expectStatus(
    "external client user cannot read reporting bootstrap",
    api.get("/api/reporting/bootstrap", { cookie: fixtures.sessions.externalClientUser }),
    403,
  );
}

async function createApiKey(api, cookie, scopes) {
  const response = await api.post("/api/api-keys", { name: `Harness key ${randomUUID()}`, scopes }, { cookie });
  await expectStatus(`created API key with scopes ${scopes.join(",")}`, response, 201);
  return response.body;
}

async function createClient(api, cookie, name, extra = {}) {
  const response = await api.post("/api/clients", { name, ...extra }, { cookie });
  await expectStatus(`created client ${name}`, response, 201);
  return response.body.client;
}

async function createProject(api, cookie, clientId, name, extra = {}) {
  const response = await api.post(`/api/clients/${encodeURIComponent(clientId)}/projects`, { name, ...extra }, { cookie });
  await expectStatus(`created project ${name}`, response, 201);
  return response.body.project;
}

async function createTimeEntry(api, cookie, projectId) {
  const response = await api.post("/api/time-entries", timeEntryPayload(projectId), { cookie });
  await expectStatus(`created time entry for ${projectId}`, response, 201);
  return response.body;
}

async function createTag(workspaceId, userId, name) {
  const tagId = `tag-${randomUUID()}`;
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO tags (
  tag_id,
  workspace_id,
  name,
  slug,
  description,
  color,
  status,
  created_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(tagId)},
  ${sqlText(workspaceId)},
  ${sqlText(name)},
  ${sqlText(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))},
  '',
  '#2563eb',
  'active',
  ${sqlText(userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return { name, tagId };
}

async function insertTimeEntry(workspaceId, options = {}) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(options.entryId || `entry-${randomUUID()}`)},
  ${sqlText(workspaceId)},
  ${sqlText(options.userId || "")},
  '',
  '',
  ${sqlText(options.projectId || "")},
  'Other Workspace Project',
  NULL,
  'Cross-workspace time entry',
  '2026-06-02T13:00:00.000Z',
  '2026-06-02T14:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function assertUnifiedTimerState({ label, workspaceId, userId, expected }) {
  const filters = [
    `workspace_id = ${sqlText(workspaceId)}`,
    `user_id = ${sqlText(userId)}`,
  ];

  if (expected.source_module_id !== undefined) {
    filters.push(`source_module_id = ${sqlText(expected.source_module_id)}`);
  }

  if (expected.source_type !== undefined) {
    filters.push(`source_type = ${sqlText(expected.source_type)}`);
  }

  if (expected.source_id !== undefined) {
    filters.push(`source_id = ${sqlText(expected.source_id)}`);
  }

  if (expected.timer_slot !== undefined) {
    filters.push(`timer_slot = ${sqlText(expected.timer_slot)}`);
  }

  const rows = await querySql(`
SELECT source_module_id, source_type, source_id, timer_slot, timer_status
FROM active_work_timers
WHERE ${filters.join(" AND ")}
LIMIT 1;
`);

  check(label, () => {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].timer_status, expected.timer_status);
  });
}

async function assertNoUnifiedTimerState({ label, workspaceId, userId, sourceId }) {
  const rows = await querySql(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = ${sqlText(sourceId)}
LIMIT 1;
`);

  check(label, () => {
    assert.equal(rows.length, 0);
  });
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
    delete: (url, options = {}) => request(baseUrl, "DELETE", url, null, options),
  };
}

async function request(baseUrl, method, url, body = null, options = {}) {
  const headers = {};

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  if (options.bearer) {
    headers.Authorization = `Bearer ${options.bearer}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
  };
}

function check(name, assertion) {
  assertion();
  results.push(name);
}

async function expectStatus(name, responsePromise, expectedStatus) {
  const response = await responsePromise;
  check(name, () => {
    assert.equal(response.status, expectedStatus, `${name}: ${JSON.stringify(response.body)}`);
  });
  return response;
}

function timeEntryPayload(projectId, overrides = {}) {
  return {
    project_id: projectId,
    description: "Permission regression time entry",
    start_time: "2026-06-02T13:00:00.000Z",
    end_time: "2026-06-02T14:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.00",
    billable: "yes",
    invoice_status: "unbilled",
    ...overrides,
  };
}

function timerPayload(projectId, overrides = {}) {
  return {
    project_id: projectId,
    description: "Permission regression active timer",
    accumulated_elapsed_seconds: 120,
    timer_status: "paused",
    ...overrides,
  };
}

function userFixture(label) {
  return {
    userId: `${label}-${randomUUID()}`,
    username: uniqueEmail(label),
  };
}

function uniqueEmail(label) {
  return `${label}-${randomUUID()}@example.test`;
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

function workspaceInsertSql(workspaceId, name, workspaceType, ownerUserId, now) {
  return `
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, ${sqlText(name)}, 'Active', ${sqlText(workspaceType)}, ${sqlText(ownerUserId)}, ${sqlText(now)}, ${sqlText(now)});`;
}

function workspaceSettingsInsertSql(workspaceId, now) {
  return `
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
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  1,
  1,
  '100',
  'monthly',
  1,
  0,
  'nearestQuarterHour',
  1,
  30,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function workspaceModuleInsertSql(workspaceId, moduleId, now) {
  return `
INSERT OR IGNORE INTO workspace_modules (
  workspace_id,
  module_id,
  status,
  enabled_at,
  disabled_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(moduleId)},
  'enabled',
  ${sqlText(now)},
  NULL,
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

function clientInsertSql(workspaceId, client, now) {
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
  ${sqlText(client.id)},
  ${sqlText(workspaceId)},
  ${sqlText(client.name)},
  'Active',
  'yes',
  NULL,
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

function projectInsertSql(workspaceId, project, now) {
  return `
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(workspaceId)},
  ${project.clientId ? sqlText(project.clientId) : "NULL"},
  ${sqlText(project.name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

async function createSession(workspaceId, userId, username) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(sessionId)},
  ${sqlText(workspaceId)},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(username)},
  'America/New_York',
  ${sqlText(expiresAt)},
  ${sqlText(now)},
  ${sqlText(now)}
);`);

  return sessionId;
}

function localPastMinuteDue(timeZone = "America/New_York") {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const minute = Math.max(0, Number(parts.minute || 0) - 1);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${String(minute).padStart(2, "0")}`,
  };
}

function localDateOffset(days = 0, timeZone = "America/New_York") {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(nextServer) {
  return new Promise((resolve, reject) => {
    nextServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
