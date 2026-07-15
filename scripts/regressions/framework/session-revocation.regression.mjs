export const regressionMeta = Object.freeze({
  id: "framework.session-revocation",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "permissions", "security", "sessions"],
  description: "Proves immediate single/bulk revocation, password and deactivation forced logout, safe admin references, workspace boundaries, and security events.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("session-revocation");
const ADMIN_USERNAME = "session-admin@example.test";
const ADMIN_PASSWORD = "Session-Admin-Test-123!";
const ADMIN_NEW_PASSWORD = "Session-Admin-Changed-456!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { internalEventBus } = await import("../../../src/core/events/event-bus.js");

let server;
let unsubscribe;

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  const events = [];
  unsubscribe = internalEventBus.on("security.session.revoked", (event) => events.push(event), {
    id: "regression:session-revocation",
  });

  const adminLoginA = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminLoginB = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminCookieA = readSessionCookie(adminLoginA);
  const adminCookieB = readSessionCookie(adminLoginB);
  const originalWorkspaceId = adminLoginA.body.user.workspace_id;
  const adminUserId = adminLoginA.body.user.user_id;

  const createdTarget = await api.post("/api/users", {
    username: "session-target@example.test",
  }, { cookie: adminCookieA });
  assert.equal(createdTarget.status, 201, JSON.stringify(createdTarget.body));
  const targetUserId = createdTarget.body.user.user_id;
  const targetPassword = createdTarget.body.initialPassword;

  const targetLoginA = await login(api, createdTarget.body.user.username, targetPassword);
  const targetLoginB = await login(api, createdTarget.body.user.username, targetPassword);
  const targetCookieA = readSessionCookie(targetLoginA);
  const targetCookieB = readSessionCookie(targetLoginB);

  const listed = await api.get(`/api/users/${targetUserId}/sessions`, { cookie: adminCookieA });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.sessions.length, 2, "User Admin should list the target's current-workspace sessions");
  assert.ok(listed.body.sessions.every((session) => /^[A-Za-z0-9_-]{32}$/.test(session.sessionReference)));
  assert.ok(listed.body.sessions.every((session) => session.isCurrent === false));
  assert.doesNotMatch(JSON.stringify(listed.body), new RegExp(escapeRegExp(targetCookieA)), "session bearer credentials must not reach User Admin");
  assert.doesNotMatch(JSON.stringify(listed.body), new RegExp(escapeRegExp(targetCookieB)), "session bearer credentials must not reach User Admin");

  const singleRevocation = await api.delete(
    `/api/users/${targetUserId}/sessions/${listed.body.sessions[0].sessionReference}`,
    { cookie: adminCookieA },
  );
  assert.equal(singleRevocation.status, 200, JSON.stringify(singleRevocation.body));
  assert.equal(singleRevocation.body.revokedCount, 1);
  const singleStates = await Promise.all([
    api.get("/api/session", { cookie: targetCookieA }),
    api.get("/api/session", { cookie: targetCookieB }),
  ]);
  assert.deepEqual(singleStates.map((response) => response.status).sort(), [200, 401], "one revoked bearer should fail on its next request");
  const survivingTargetCookie = singleStates[0].status === 200 ? targetCookieA : targetCookieB;

  const deniedList = await api.get(`/api/users/${adminUserId}/sessions`, { cookie: survivingTargetCookie });
  assert.equal(deniedList.status, 403, "ordinary users must not inspect managed session state");

  const bulkRevocation = await api.delete(`/api/users/${targetUserId}/sessions`, { cookie: adminCookieA });
  assert.equal(bulkRevocation.status, 200, JSON.stringify(bulkRevocation.body));
  assert.equal(bulkRevocation.body.revokedCount, 1);
  assert.equal((await api.get("/api/session", { cookie: survivingTargetCookie })).status, 401, "workspace bulk revocation should reject the next request");

  const resetLoginA = await login(api, createdTarget.body.user.username, targetPassword);
  const resetLoginB = await login(api, createdTarget.body.user.username, targetPassword);
  const resetCookieA = readSessionCookie(resetLoginA);
  const resetCookieB = readSessionCookie(resetLoginB);
  const reset = await api.put(`/api/users/${targetUserId}/reset-password`, {}, { cookie: adminCookieA });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await api.get("/api/session", { cookie: resetCookieA })).status, 401, "password reset should revoke the first target session");
  assert.equal((await api.get("/api/session", { cookie: resetCookieB })).status, 401, "password reset should revoke every target session");

  const deactivationLoginA = await login(api, createdTarget.body.user.username, reset.body.initialPassword);
  const deactivationLoginB = await login(api, createdTarget.body.user.username, reset.body.initialPassword);
  const deactivationCookieA = readSessionCookie(deactivationLoginA);
  const deactivationCookieB = readSessionCookie(deactivationLoginB);
  const deactivated = await api.put(`/api/users/${targetUserId}/deactivate`, {}, { cookie: adminCookieA });
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
  assert.equal((await api.get("/api/session", { cookie: deactivationCookieA })).status, 401, "deactivation should revoke the first live session");
  assert.equal((await api.get("/api/session", { cookie: deactivationCookieB })).status, 401, "deactivation should revoke all live sessions");

  const secondWorkspace = await api.post("/api/workspaces", {
    workspaceName: "Session Boundary Workspace",
    workspaceType: "business",
  }, { cookie: adminCookieA });
  assert.equal(secondWorkspace.status, 201, JSON.stringify(secondWorkspace.body));
  const outsider = await api.post("/api/users", {
    username: "session-outsider@example.test",
  }, { cookie: adminCookieA });
  assert.equal(outsider.status, 201, JSON.stringify(outsider.body));
  assert.equal((await api.post("/api/session/workspace", {
    workspaceId: originalWorkspaceId,
  }, { cookie: adminCookieA })).status, 200);
  const crossWorkspaceList = await api.get(`/api/users/${outsider.body.user.user_id}/sessions`, { cookie: adminCookieA });
  assert.equal(crossWorkspaceList.status, 404, "session management must not reveal an unrelated-workspace target");

  const passwordChanged = await api.put("/api/user/password", {
    currentPassword: ADMIN_PASSWORD,
    newPassword: ADMIN_NEW_PASSWORD,
  }, { cookie: adminCookieA });
  assert.equal(passwordChanged.status, 200, JSON.stringify(passwordChanged.body));
  assert.equal(passwordChanged.body.revokedSessions, 1, "self password change should revoke every other session");
  assert.equal((await api.get("/api/session", { cookie: adminCookieA })).status, 200, "self password change should preserve the current session");
  assert.equal((await api.get("/api/session", { cookie: adminCookieB })).status, 401, "self password change should reject another session immediately");

  assert.equal(events.length, 7, "one safe security event should emit for every revoked session row");
  assert.deepEqual(
    [...new Set(events.map((event) => event.metadata.reason))].sort(),
    ["managed_single_session", "managed_workspace_sessions", "password_changed", "password_reset", "user_deactivated"],
  );
  const serializedEvents = JSON.stringify(events);
  for (const sessionCookie of [adminCookieA, adminCookieB, targetCookieA, targetCookieB, resetCookieA, resetCookieB]) {
    assert.doesNotMatch(serializedEvents, new RegExp(escapeRegExp(sessionCookie)), "security events must never contain bearer session IDs");
  }

  const revocationAuditRows = await db.query(`
SELECT action, metadata_json
FROM audit_logs
WHERE action = 'security_session_revoked'
ORDER BY created_at;
`);
  assert.equal(revocationAuditRows.length, 5, "each revocation operation should leave one safe audit record");
  const serializedAudit = JSON.stringify(revocationAuditRows);
  for (const sessionCookie of [adminCookieA, adminCookieB, targetCookieA, targetCookieB]) {
    assert.doesNotMatch(serializedAudit, new RegExp(escapeRegExp(sessionCookie)), "audit metadata must never contain bearer session IDs");
  }

  const [navigationSource, sessionServiceSource, userAdminSource, userAdminView] = await Promise.all([
    fs.readFile("public/js/navigation.js", "utf8"),
    fs.readFile("src/services/sessions.service.js", "utf8"),
    fs.readFile("public/js/user-admin.js", "utf8"),
    fs.readFile("views/protected/user-admin.html", "utf8"),
  ]);
  assert.match(navigationSource, /response\?\.status === 401 && isAppApiRequest/, "revoked-session 401s should retain the framework recovery modal");
  assert.match(sessionServiceSource, /createHmac\("sha256", SESSION_REFERENCE_SECRET\)/, "browser references should be one-way and process scoped");
  assert.doesNotMatch(sessionServiceSource, /sessionId:\s*row\.session_id/, "managed payloads must not expose bearer session IDs");
  assert.match(userAdminSource, /Manage Sessions/);
  assert.match(userAdminSource, /modal\.confirm/);
  assert.match(userAdminSource, /\/sessions\/\$\{encodeURIComponent\(session\.sessionReference\)\}/);
  assert.match(userAdminView, /data-user-session-list/);
  assert.match(userAdminView, /Session credentials are never displayed/);
} finally {
  unsubscribe?.();
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Session revocation regression passed.");

async function login(api, username, password) {
  const response = await api.post("/api/login", { username, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(readSessionCookie(response));
  return response;
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.cookie) {
      headers.cookie = `longtail_forge_session=${options.cookie}`;
    }
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await response.text();
    return {
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    delete(url, options) {
      return request("DELETE", url, undefined, options);
    },
    get(url, options) {
      return request("GET", url, undefined, options);
    },
    post(url, body, options) {
      return request("POST", url, body, options);
    },
    put(url, body, options) {
      return request("PUT", url, body, options);
    },
  };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
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
