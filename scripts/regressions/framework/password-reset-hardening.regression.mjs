export const regressionMeta = Object.freeze({
  id: "framework.password-reset-hardening",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "passwords", "permissions", "security"],
  description: "Proves admin reset forces a restricted next-login password change, remains scoped and throttled, emits safe events, and never logs generated credentials.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("password-reset-hardening");
const ADMIN_USERNAME = "password-reset-admin@example.test";
const ADMIN_PASSWORD = "Password-Reset-Admin-123!";
const FINAL_PASSWORD = "Password-Reset-Final-456!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";
process.env.LONGTAIL_AUTH_THROTTLE_ENABLED = "true";
process.env.LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT = "3";
process.env.LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS = "60";
process.env.LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS = "120";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { internalEventBus } = await import("../../../src/core/events/event-bus.js");
const { authenticationThrottle } = await import("../../../src/security/auth-throttle.js");

let server;
const unsubscribers = [];

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  const passwordEvents = [];
  for (const eventName of ["security.password.reset", "security.password.changed"]) {
    unsubscribers.push(internalEventBus.on(eventName, (event) => passwordEvents.push(event), {
      id: `regression:password-reset-hardening:${eventName}`,
    }));
  }

  const adminLogin = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminCookie = readSessionCookie(adminLogin);
  const originalWorkspaceId = adminLogin.body.user.workspace_id;

  const target = await api.post("/api/users", {
    username: "password-reset-target@example.test",
  }, { cookie: adminCookie });
  assert.equal(target.status, 201, JSON.stringify(target.body));
  const targetUserId = target.body.user.user_id;
  const originalTargetPassword = target.body.initialPassword;
  const createdUser = await db.get("SELECT password FROM users WHERE user_id = :userId;", { userId: targetUserId });
  assert.match(createdUser.password, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/, "new user credentials should use the current hardened policy");

  const unauthorized = await api.post("/api/users", {
    username: "password-reset-ordinary@example.test",
  }, { cookie: adminCookie });
  assert.equal(unauthorized.status, 201, JSON.stringify(unauthorized.body));
  const unauthorizedLogin = await login(api, unauthorized.body.user.username, unauthorized.body.initialPassword);
  assert.equal((await api.put(`/api/users/${targetUserId}/reset-password`, {}, {
    cookie: readSessionCookie(unauthorizedLogin),
  })).status, 403, "ordinary users must not reset another user's password");

  const secondWorkspace = await api.post("/api/workspaces", {
    workspaceName: "Password Reset Boundary Workspace",
    workspaceType: "business",
  }, { cookie: adminCookie });
  assert.equal(secondWorkspace.status, 201, JSON.stringify(secondWorkspace.body));
  const outsider = await api.post("/api/users", {
    username: "password-reset-outsider@example.test",
  }, { cookie: adminCookie });
  assert.equal(outsider.status, 201, JSON.stringify(outsider.body));
  assert.equal((await api.post("/api/session/workspace", {
    workspaceId: originalWorkspaceId,
  }, { cookie: adminCookie })).status, 200);
  assert.equal((await api.put(`/api/users/${outsider.body.user.user_id}/reset-password`, {}, {
    cookie: adminCookie,
  })).status, 404, "reset must not disclose or target an unrelated-workspace user");

  const oldLoginA = await login(api, target.body.user.username, originalTargetPassword);
  const oldLoginB = await login(api, target.body.user.username, originalTargetPassword);
  const oldCookieA = readSessionCookie(oldLoginA);
  const oldCookieB = readSessionCookie(oldLoginB);

  const capturedConsole = [];
  const originalConsole = {
    error: console.error,
    log: console.log,
    warn: console.warn,
  };
  let reset;
  try {
    for (const method of Object.keys(originalConsole)) {
      console[method] = (...args) => capturedConsole.push(args.map(String).join(" "));
    }
    reset = await api.put(`/api/users/${targetUserId}/reset-password`, {}, { cookie: adminCookie });
  } finally {
    Object.assign(console, originalConsole);
  }

  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  const temporaryPassword = reset.body.initialPassword;
  assert.ok(temporaryPassword, "admin reset should surface the generated credential once in its response");
  assert.equal(reset.body.user.passwordChangeRequired, true);
  assert.equal((await api.get("/api/session", { cookie: oldCookieA })).status, 401);
  assert.equal((await api.get("/api/session", { cookie: oldCookieB })).status, 401);

  const resetUser = await db.get(`
SELECT password, password_change_required
FROM users
WHERE user_id = :userId;
`, { userId: targetUserId });
  assert.equal(resetUser.password_change_required, 1, "reset should persist the required-change state");
  assert.notEqual(resetUser.password, temporaryPassword, "generated credentials must be stored only as a hash");
  assert.match(resetUser.password, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/, "reset credentials should use the current hardened policy");

  const forcedLoginA = await login(api, target.body.user.username, temporaryPassword, { rememberMe: true });
  const forcedLoginB = await login(api, target.body.user.username, temporaryPassword);
  const forcedCookieA = readSessionCookie(forcedLoginA);
  const forcedCookieB = readSessionCookie(forcedLoginB);
  assert.match(
    forcedLoginA.headers.get("set-cookie") || "",
    /longtail_forge_session=[^,]*Max-Age=2592000/,
    "a remembered preference should be retained by the restricted forced-change session",
  );
  const forcedExpiryBeforeChange = (await db.get(
    "SELECT expires_at FROM sessions WHERE session_id = :sessionId;",
    { sessionId: forcedCookieA },
  )).expires_at;
  assert.equal(forcedLoginA.body.user.passwordChangeRequired, true);
  assert.equal((await api.get("/api/session", { cookie: forcedCookieA })).body.user.passwordChangeRequired, true);

  const blockedApi = await api.get("/api/users", { cookie: forcedCookieA });
  assert.equal(blockedApi.status, 403, "required-change sessions must not reach protected APIs");
  assert.equal(blockedApi.body.error.code, "password_change_required");
  assert.equal(blockedApi.body.error.message, "Change your password before continuing.");
  assert.match(blockedApi.body.error.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal((await api.post("/api/session/workspace", {
    workspaceId: originalWorkspaceId,
  }, { cookie: forcedCookieA })).status, 403, "required-change sessions must not switch workspace through the public auth router");
  const blockedPage = await api.get("/dashboard.html", { cookie: forcedCookieA, redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/login.html?passwordChangeRequired=1");

  const wrongChangeStatuses = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    wrongChangeStatuses.push((await api.put("/api/user/password", {
      currentPassword: `Wrong-Temporary-${attempt}!`,
      newPassword: FINAL_PASSWORD,
    }, { cookie: forcedCookieA })).status);
  }
  assert.deepEqual(wrongChangeStatuses, [400, 400, 429], "forced password change must retain the shared current-password throttle");

  await authenticationThrottle.clear();
  const changed = await api.put("/api/user/password", {
    currentPassword: temporaryPassword,
    newPassword: FINAL_PASSWORD,
  }, { cookie: forcedCookieA });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.passwordChangeRequired, false);
  assert.equal((await api.get("/api/session", { cookie: forcedCookieB })).status, 401, "password change should revoke the other forced-change session");
  const activeSession = await api.get("/api/session", { cookie: forcedCookieA });
  assert.equal(activeSession.status, 200);
  assert.equal(activeSession.body.user.passwordChangeRequired, false, "the current session should become unrestricted immediately");
  assert.equal(
    (await db.get("SELECT expires_at FROM sessions WHERE session_id = :sessionId;", {
      sessionId: forcedCookieA,
    })).expires_at,
    forcedExpiryBeforeChange,
    "successful forced password completion should preserve the requested absolute remembered lifetime",
  );
  assert.equal((await api.get("/dashboard.html", { cookie: forcedCookieA })).status, 200);
  const changedUser = await db.get("SELECT password FROM users WHERE user_id = :userId;", { userId: targetUserId });
  assert.match(changedUser.password, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/, "changed credentials should use the current hardened policy");

  assert.deepEqual(passwordEvents.map((event) => event.name), [
    "security.password.reset",
    "security.password.changed",
  ]);
  assert.equal(passwordEvents[0].metadata.change_required, true);
  assert.equal(passwordEvents[0].metadata.revoked_session_count, 2);
  assert.equal(passwordEvents[1].metadata.change_requirement_cleared, true);
  assert.equal(passwordEvents[1].metadata.revoked_other_session_count, 1);

  const auditRows = await db.query(`
SELECT action, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE record_id = :userId
ORDER BY created_at;
`, { userId: targetUserId });
  const serializedSafeSurfaces = JSON.stringify({
    auditRows,
    capturedConsole,
    passwordEvents,
  });
  for (const secret of [temporaryPassword, FINAL_PASSWORD, originalTargetPassword]) {
    assert.doesNotMatch(serializedSafeSurfaces, new RegExp(escapeRegExp(secret)), "passwords must never enter logs, audits, or security events");
  }

  const [authRoutesSource, loginSource, loginView, middlewareSource, usersServiceSource] = await Promise.all([
    fs.readFile("src/routes/auth.routes.js", "utf8"),
    fs.readFile("public/js/login.js", "utf8"),
    fs.readFile("views/public/login.html", "utf8"),
    fs.readFile("src/middleware/require-auth.js", "utf8"),
    fs.readFile("src/services/users.service.js", "utf8"),
  ]);
  assert.match(middlewareSource, /password_change_required/);
  assert.match(middlewareSource, /request\.method === "PUT" && pathname === "\/api\/user\/password"/);
  assert.match(loginSource, /body\.user\?\.passwordChangeRequired/);
  assert.match(loginSource, /showRequiredPasswordChange/);
  assert.match(loginView, /data-required-password-form/);
  assert.match(usersServiceSource, /passwordChangeRequired: true/);
  assert.doesNotMatch(authRoutesSource, /forgot-password|recovery-token|reset-token/i, "token recovery remains deferred until a delivery channel exists");
} finally {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  await authenticationThrottle.clear();
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Password reset hardening regression passed.");

async function login(api, username, password, options = {}) {
  const response = await api.post("/api/login", { username, password, ...options });
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
      redirect: options.redirect || "follow",
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
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
