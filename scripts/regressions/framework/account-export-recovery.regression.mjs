export const regressionMeta = Object.freeze({
  id: "framework.account-export-recovery",
  area: "framework",
  tier: "release-gate",
  tags: ["authentication", "baseline-bypass", "database", "permissions", "security", "sessions", "workspaces"],
  description: "Proves former sole-workspace administrators receive only a portable account export and logout, while other zero-workspace identities remain non-enumerating and former workspace data stays inaccessible.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("account-export-recovery");
const ADMIN_USERNAME = "account-recovery-admin@example.test";
const ADMIN_PASSWORD = "Account-Recovery-Admin-123!";
const FORMER_ADMIN_USERNAME = "former-workspace-admin@example.test";
const FORMER_ADMIN_PASSWORD = "Former-Workspace-Admin-123!";
const PROJECT_ADMIN_USERNAME = "former-project-admin@example.test";
const PROJECT_ADMIN_PASSWORD = "Former-Project-Admin-123!";
const CLIENT_ADMIN_USERNAME = "former-client-admin@example.test";
const CLIENT_ADMIN_PASSWORD = "Former-Client-Admin-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";

const { createApp } = await import("../../../src/core/app.js");
const { db } = await import("../../../src/core/database.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { hashPassword } = await import("../../../src/security/passwords.js");
const { usersRepository } = await import("../../../src/repositories/users.repo.js");
const { userWorkspacesRepository } = await import("../../../src/repositories/user-workspaces.repo.js");

let server;

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  const adminLogin = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminCookie = readSessionCookie(adminLogin);
  const workspaceId = adminLogin.body.user.workspace_id;
  const workspace = await db.get("SELECT name FROM workspaces WHERE workspace_id = :workspaceId;", { workspaceId });

  const formerAdminId = await createWorkspaceUser({
    password: FORMER_ADMIN_PASSWORD,
    roleId: "workspace_admin",
    scopeType: "workspace",
    username: FORMER_ADMIN_USERNAME,
    workspaceId,
  });
  const originalAdminLogin = await login(api, FORMER_ADMIN_USERNAME, FORMER_ADMIN_PASSWORD);
  const originalAdminCookie = readSessionCookie(originalAdminLogin);
  const removedAdmin = await api.delete(`/api/users/${formerAdminId}`, { cookie: adminCookie });
  assert.equal(removedAdmin.status, 200, JSON.stringify(removedAdmin.body));
  assert.equal((await api.get("/api/session", { cookie: originalAdminCookie })).status, 401, "qualification must revoke every ordinary session");

  const recoveryLogin = await login(api, FORMER_ADMIN_USERNAME, FORMER_ADMIN_PASSWORD);
  const recoveryCookie = readSessionCookie(recoveryLogin);
  assert.equal(recoveryLogin.body.user.recoveryMode, "account_export");
  assert.equal(recoveryLogin.body.user.loginLandingPath, "/account-recovery.html");
  assert.equal(Object.hasOwn(recoveryLogin.body.user, "workspace_id"), false, "recovery login must expose no workspace context");
  assert.equal((await api.get("/account-recovery.html", { cookie: recoveryCookie })).status, 200);

  const exportResponse = await api.get("/api/user/portable-account-export", { cookie: recoveryCookie });
  assert.equal(exportResponse.status, 200, JSON.stringify(exportResponse.body));
  assert.equal(exportResponse.body.format, "longtail-forge-portable-account-data");
  assert.equal(exportResponse.body.account.email, FORMER_ADMIN_USERNAME);
  const serializedExport = JSON.stringify(exportResponse.body);
  assert.doesNotMatch(serializedExport, new RegExp(escapeRegExp(workspaceId)), "portable data must not leak former workspace IDs");
  assert.doesNotMatch(serializedExport, new RegExp(escapeRegExp(workspace.name)), "portable data must not leak former workspace names");
  assert.equal(/"(?:user|workspace|project|client|file)_id"/.test(serializedExport), false, "portable data must contain no internal record IDs");

  const deniedApi = await api.get("/api/users", { cookie: recoveryCookie });
  assert.equal(deniedApi.status, 403);
  assert.equal(deniedApi.body.error.code, "account_export_recovery_only");
  assert.equal(deniedApi.body.error.message, "Only account export and logout are available in recovery mode.");
  const deniedWorkspaceSwitch = await api.post("/api/session/workspace", { workspaceId }, { cookie: recoveryCookie });
  assert.equal(deniedWorkspaceSwitch.status, 403, "auth routes mounted before the allowlist must still reject workspace switching");
  const redirectedView = await api.get("/dashboard.html", { cookie: recoveryCookie, redirect: "manual" });
  assert.equal(redirectedView.status, 302);
  assert.equal(redirectedView.headers.get("location"), "/account-recovery.html");

  const projectAdminId = await createWorkspaceUser({
    password: PROJECT_ADMIN_PASSWORD,
    roleId: "project_admin",
    scopeType: "project",
    username: PROJECT_ADMIN_USERNAME,
    workspaceId,
  });
  const removedProjectAdmin = await api.delete(`/api/users/${projectAdminId}`, { cookie: adminCookie });
  assert.equal(removedProjectAdmin.status, 200, JSON.stringify(removedProjectAdmin.body));
  const projectAdminDenied = await api.post("/api/login", {
    password: PROJECT_ADMIN_PASSWORD,
    username: PROJECT_ADMIN_USERNAME,
  });
  const unknownDenied = await api.post("/api/login", {
    password: PROJECT_ADMIN_PASSWORD,
    username: "unknown-recovery-user@example.test",
  });
  assert.equal(projectAdminDenied.status, 401);
  assert.deepEqual(
    normalizedErrorBody(projectAdminDenied.body),
    normalizedErrorBody(unknownDenied.body),
    "non-workspace administrators and unknown identities must share the generic login denial",
  );

  const clientAdminId = await createWorkspaceUser({
    password: CLIENT_ADMIN_PASSWORD,
    roleId: "client_admin",
    scopeType: "client",
    username: CLIENT_ADMIN_USERNAME,
    workspaceId,
  });
  assert.equal((await api.delete(`/api/users/${clientAdminId}`, { cookie: adminCookie })).status, 200);
  const clientAdminDenied = await api.post("/api/login", {
    password: CLIENT_ADMIN_PASSWORD,
    username: CLIENT_ADMIN_USERNAME,
  });
  assert.equal(clientAdminDenied.status, 401);
  assert.deepEqual(
    normalizedErrorBody(clientAdminDenied.body),
    normalizedErrorBody(unknownDenied.body),
    "Client Administrators must not qualify for recovery mode",
  );

  const qualificationColumns = await db.query("PRAGMA table_info(account_export_recovery_qualifications);");
  assert.deepEqual(
    qualificationColumns.map((column) => column.name).sort(),
    ["qualification_basis", "qualification_source", "qualified_at", "updated_at", "user_id"].sort(),
    "qualification history must retain no former workspace identifier or label",
  );
  assert.equal((await db.get("SELECT session_mode FROM sessions WHERE session_id = :sessionId;", { sessionId: recoveryCookie })).session_mode, "account_export_recovery");

  const logout = await api.post("/api/logout", undefined, { cookie: recoveryCookie });
  assert.equal(logout.status, 200);
  assert.equal((await api.get("/api/user/portable-account-export", { cookie: recoveryCookie })).status, 401, "logout must revoke the restricted session");

  await createWorkspaceUser({
    password: "Ownership-Candidate-123!",
    roleId: "workspace_admin",
    scopeType: "workspace",
    username: "ownership-candidate@example.test",
    workspaceId,
  });
  const selfLeave = await api.delete(`/api/user/workspaces/${workspaceId}`, { cookie: adminCookie });
  assert.equal(selfLeave.status, 200, JSON.stringify(selfLeave.body));
  assert.equal(selfLeave.body.accountExportRecovery, true, "a former administrator must be able to leave their last workspace for recovery");
  assert.equal((await api.get("/api/session", { cookie: adminCookie })).status, 401, "last-workspace leave must revoke the current ordinary session");
  const formerOwnerRecovery = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  assert.equal(formerOwnerRecovery.body.user.recoveryMode, "account_export");
} finally {
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

function normalizedErrorBody(body) {
  return {
    ...body,
    error: {
      ...body?.error,
      requestId: "<request-id>",
    },
  };
}

console.log("Account export recovery regression passed.");

async function createWorkspaceUser({ password, roleId, scopeType, username, workspaceId }) {
  await usersRepository.create(workspaceId, {
    altEmail: "",
    displayName: username.split("@")[0],
    timezone: "America/New_York",
    username,
  }, await hashPassword(password));
  const user = await usersRepository.readByUsername(username);
  await usersRepository.updatePassword(workspaceId, user.user_id, user.password, { passwordChangeRequired: false });
  await userWorkspacesRepository.upsert({ userId: user.user_id, workspaceId, status: "active" });
  const now = new Date().toISOString();
  await db.run(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES (
  :assignmentId, :workspaceId, :userId, :roleId, :scopeType, :scopeId,
  NULL, NULL, NULL, :now, :now
);
`, {
    assignmentId: randomUUID(),
    now,
    roleId,
    scopeId: scopeType === "workspace" ? workspaceId : `${scopeType}-scope-fixture`,
    scopeType,
    userId: user.user_id,
    workspaceId,
  });
  return user.user_id;
}

async function login(api, username, password) {
  const response = await api.post("/api/login", { username, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(readSessionCookie(response));
  return response;
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.cookie) headers.cookie = `longtail_forge_session=${options.cookie}`;
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: options.redirect || "follow",
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      body: text && contentType.includes("application/json") ? JSON.parse(text) : text,
      headers: response.headers,
      status: response.status,
    };
  }
  return {
    delete: (url, options) => request("DELETE", url, undefined, options),
    get: (url, options) => request("GET", url, undefined, options),
    post: (url, body, options) => request("POST", url, body, options),
  };
}

function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "").match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}
