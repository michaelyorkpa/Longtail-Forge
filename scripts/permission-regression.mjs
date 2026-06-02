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

const { createApp } = await import("../src/app.js");
const { initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://${server.address().address}:${server.address().port}`;
  const api = createApi(baseUrl);

  await runAccessGuardTests(api);
  await runApiKeyTests(api, fixtures);
  await runClientMutationTests(api, fixtures);
  await runProjectMutationTests(api, fixtures);
  await runTimeEntryMutationTests(api, fixtures);
  await runActiveTimerMutationTests(api, fixtures);
  await runUserMutationTests(api, fixtures);
  await runRoleAssignmentTests(api, fixtures);
  await runSettingsTests(api, fixtures);
  await runOwnershipScopeTests(api, fixtures);
  await runClientProjectDomainTests(api, fixtures);
  await runDisabledModuleTests(api, fixtures);
  await runWorkspaceOwnerLifecycleTests(api, fixtures);

  console.log(`Permission regression harness passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const organizationId = (await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;"))[0].id;
  const superAdmin = (await querySql(`
SELECT user_id, username
FROM users
WHERE organization_id = ${sqlText(organizationId)}
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

  await runSql(`
${Object.values(users).filter((user) => user.userId).map((user) => userInsertSql(organizationId, user)).join("\n")}
${Object.values(users).filter((user) => user.userId).map((user) => membershipInsertSql(organizationId, user, now)).join("\n")}
${clientInsertSql(organizationId, clients.alpha, now)}
${clientInsertSql(organizationId, clients.beta, now)}
${projectInsertSql(organizationId, projects.alpha, now)}
${projectInsertSql(organizationId, projects.beta, now)}
${projectInsertSql(organizationId, projects.workspace, now)}
${assignmentInsertSql(organizationId, users.workspaceAdmin.userId, "organization_admin", "organization", organizationId, now)}
${assignmentInsertSql(organizationId, users.clientAdmin.userId, "client_admin", "client", clients.alpha.id, now)}
${assignmentInsertSql(organizationId, users.projectAdmin.userId, "project_admin", "client", clients.alpha.id, now)}
${assignmentInsertSql(organizationId, users.clientUser.userId, "client_user", "client", clients.alpha.id, now)}
${assignmentInsertSql(organizationId, users.projectUser.userId, "project_user", "project", projects.alpha.id, now)}
${assignmentInsertSql(organizationId, users.externalClientUser.userId, "client_external_user", "client", clients.alpha.id, now)}
INSERT INTO organizations (id, name, status, owner_user_id, workspace_type, created_at, updated_at)
VALUES (${sqlText(otherWorkspace.id)}, 'Other Workspace', 'Active', ${sqlText(superAdmin.user_id)}, 'business', ${sqlText(now)}, ${sqlText(now)});
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(otherWorkspace.id)}, 'Other Workspace', 'Active', 'business', ${sqlText(superAdmin.user_id)}, ${sqlText(now)}, ${sqlText(now)});
${clientInsertSql(otherWorkspace.id, { id: otherWorkspace.clientId, name: "Other Workspace Client" }, now)}
`);

  const sessions = {};
  for (const [key, user] of Object.entries(users)) {
    const userId = user.userId || user.user_id;
    const username = user.username;
    sessions[key] = await createSession(organizationId, userId, username);
  }

  return { organizationId, users, sessions, clients, projects, otherWorkspace };
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
}

async function runClientMutationTests(api, fixtures) {
  const client = await createClient(api, fixtures.sessions.workspaceAdmin, "Mutation Client");
  await expectStatus(
    "workspace admin can update clients",
    api.put(`/api/clients/${encodeURIComponent(client.id)}`, { name: "Mutation Client Updated" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
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
}

async function runProjectMutationTests(api, fixtures) {
  const project = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Mutation Project");
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

async function runTimeEntryMutationTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
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
    api.put("/api/settings", { ...settings.body, organizationName: "Permission Regression Workspace", workspaceName: "Permission Regression Workspace" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot update workspace settings",
    api.put("/api/settings", { ...settings.body, organizationName: "Denied Workspace" }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
}

async function runOwnershipScopeTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
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
${assignmentInsertSql(ownedWorkspace.body.workspace.workspaceId, transferAdmin.userId, "organization_admin", "organization", ownedWorkspace.body.workspace.workspaceId, transferNow)}
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
FROM organizations
WHERE id = ${sqlText(ownedWorkspace.body.workspace.workspaceId)}
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
SELECT organizations.workspace_type, user_workspaces.workspace_id, user_workspaces.status, users.active_workspace_id
FROM user_workspaces
INNER JOIN organizations ON organizations.id = user_workspaces.workspace_id
INNER JOIN users ON users.user_id = user_workspaces.user_id
WHERE user_workspaces.user_id = ${sqlText(unassigned.body.user.user_id)}
  AND user_workspaces.status = 'active'
ORDER BY organizations.created_at DESC;
`);
  check("personal fallback workspace is active for unassigned user", () => {
    assert.equal(fallbackMemberships[0]?.workspace_type, "personal");
    assert.equal(fallbackMemberships[0]?.status, "active");
    assert.equal(fallbackMemberships[0]?.active_workspace_id, fallbackMemberships[0]?.workspace_id);
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
  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:read", "time_entries:write"]);
  const disabledSettings = await api.put("/api/settings", {
    ...settings.body,
    timeTrackingEnabled: false,
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
  await expectStatus("workspace admin can re-enable Time Tracking", api.put("/api/settings", {
    ...settings.body,
    timeTrackingEnabled: true,
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
}

async function createApiKey(api, cookie, scopes) {
  const response = await api.post("/api/api-keys", { name: `Harness key ${randomUUID()}`, scopes }, { cookie });
  await expectStatus(`created API key with scopes ${scopes.join(",")}`, response, 201);
  return response.body;
}

async function createClient(api, cookie, name) {
  const response = await api.post("/api/clients", { name }, { cookie });
  await expectStatus(`created client ${name}`, response, 201);
  return response.body.client;
}

async function createProject(api, cookie, clientId, name) {
  const response = await api.post(`/api/clients/${encodeURIComponent(clientId)}/projects`, { name }, { cookie });
  await expectStatus(`created project ${name}`, response, 201);
  return response.body.project;
}

async function createTimeEntry(api, cookie, projectId) {
  const response = await api.post("/api/time-entries", timeEntryPayload(projectId), { cookie });
  await expectStatus(`created time entry for ${projectId}`, response, 201);
  return response.body;
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

function timerPayload(projectId) {
  return {
    project_id: projectId,
    description: "Permission regression active timer",
    accumulated_elapsed_seconds: 120,
    timer_status: "paused",
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

function userInsertSql(organizationId, user) {
  return `
INSERT INTO users (
  user_id,
  organization_id,
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
  ${sqlText(organizationId)},
  ${sqlText(user.username)},
  ${sqlText(user.username)},
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  ${sqlText(organizationId)}
);`;
}

function membershipInsertSql(organizationId, user, now) {
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
  ${sqlText(organizationId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function assignmentInsertSql(organizationId, userId, roleId, scopeType, scopeId, now) {
  const scopedClientId = scopeType === "client" ? scopeId : null;
  const scopedProjectId = scopeType === "project" ? scopeId : null;

  return `
INSERT INTO user_role_assignments (
  assignment_id,
  organization_id,
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
  ${sqlText(organizationId)},
  ${sqlText(organizationId)},
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

function clientInsertSql(organizationId, client, now) {
  return `
INSERT INTO clients (
  id,
  organization_id,
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
  ${sqlText(organizationId)},
  ${sqlText(organizationId)},
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

function projectInsertSql(organizationId, project, now) {
  return `
INSERT INTO projects (
  id,
  organization_id,
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
  ${sqlText(organizationId)},
  ${sqlText(organizationId)},
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

async function createSession(organizationId, userId, username) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  organization_id,
  user_id,
  username,
  timezone,
  active_workspace_id,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(sessionId)},
  ${sqlText(organizationId)},
  ${sqlText(userId)},
  ${sqlText(username)},
  'America/New_York',
  ${sqlText(organizationId)},
  ${sqlText(expiresAt)},
  ${sqlText(now)},
  ${sqlText(now)}
);`);

  return sessionId;
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
