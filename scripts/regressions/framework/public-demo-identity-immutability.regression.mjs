export const regressionMeta = Object.freeze({
  id: "framework.public-demo-identity-immutability",
  area: "framework",
  tier: "integration",
  tags: ["api-keys", "authentication", "demo", "permissions", "routes", "security", "sessions", "users"],
  description: "Proves exact marked public identities can authenticate and log out but cannot be changed, recovered, retired, session-managed, or used for API keys by self or administrators.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const ADMIN_USERNAME = "demo-identity-operator@example.test";
const ADMIN_PASSWORD = "Demo-Identity-Operator-123!";
const ADMIN_NEW_PASSWORD = "Demo-Identity-Operator-456!";
const SHARED_BASELINE_PASSWORD = "Regression-Fixture-Password-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";

const fixture = await createDisposableDatabaseFixture("public-demo-identity-immutability");
const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { createRecordId } = await import("../../../src/core/identifiers.js");
const {
  PUBLIC_DEMO_DATA_MARKER_CONTRACT,
  PUBLIC_DEMO_DATA_MARKER_FILE,
  PUBLIC_DEMO_TARGET,
  assertPublicDemoRuntimeReady,
} = await import("../../../src/core/public-demo-runtime.js");
const {
  PUBLIC_DEMO_IDENTITY_DENIAL_CODE,
  PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE,
} = await import("../../../src/core/public-demo-identities.js");
const { accountExportRecoveryService } = await import("../../../src/services/account-export-recovery.service.js");

let server;
try {
  await initializeDatabase();
  const bootstrapAdmin = await db.get("SELECT user_id, username FROM users WHERE protected_user = 'yes' ORDER BY user_id LIMIT 1;");
  assert.ok(bootstrapAdmin?.user_id);
  const initialAdminPassword = fixture.ownsFixture ? ADMIN_PASSWORD : SHARED_BASELINE_PASSWORD;
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const adminLogin = await login(api, bootstrapAdmin.username, initialAdminPassword);
  const adminCookie = readSessionCookie(adminLogin);
  const workspaceId = adminLogin.body.user.workspace_id;
  const adminUserId = adminLogin.body.user.user_id;

  const visitors = [];
  for (let index = 1; index <= 6; index += 1) {
    const created = await api.post("/api/users", {
      displayName: `Public Visitor ${index}`,
      username: `public-visitor-${index}@example.test`,
    }, { cookie: adminCookie });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    visitors.push({
      password: created.body.initialPassword,
      userId: created.body.user.user_id,
      username: created.body.user.username,
    });
  }

  await db.run(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES (
  :assignmentId, :workspaceId, :userId, 'workspace_admin', 'workspace', :workspaceId,
  NULL, NULL, NULL, :createdAt, :createdAt
);
`, {
    assignmentId: createRecordId(),
    createdAt: new Date().toISOString(),
    userId: visitors[0].userId,
    workspaceId,
  });

  const visitorAdminLogin = await login(api, visitors[0].username, visitors[0].password);
  const visitorAdminCookie = readSessionCookie(visitorAdminLogin);
  const targetLogin = await login(api, visitors[1].username, visitors[1].password);
  const targetCookie = readSessionCookie(targetLogin);

  const preexistingKey = await api.post("/api/api-keys", {
    name: "Pre-demo visitor key",
    scopes: ["tasks:read"],
  }, { cookie: visitorAdminCookie });
  assert.equal(preexistingKey.status, 201, JSON.stringify(preexistingKey.body));

  const markerPath = path.join(fixture.root, PUBLIC_DEMO_DATA_MARKER_FILE);
  await fs.writeFile(markerPath, `${JSON.stringify({
    contract: PUBLIC_DEMO_DATA_MARKER_CONTRACT,
    publicVisitorUserIds: visitors.map((visitor) => visitor.userId),
    target: PUBLIC_DEMO_TARGET,
  })}\n`, { mode: 0o600 });
  assert.deepEqual(
    await assertPublicDemoRuntimeReady({ dataDir: fixture.root, demo: { enabled: true } }),
    { enabled: true, marker: "verified" },
  );

  const repeatedLogin = await login(api, visitors[1].username, visitors[1].password);
  const repeatedCookie = readSessionCookie(repeatedLogin);
  assert.equal((await api.post("/api/logout", {}, { cookie: repeatedCookie })).status, 200, "logout must remain available");

  await assertIdentityDenial(api.put("/api/user/password", {
    currentPassword: visitors[0].password,
    newPassword: "Public-Visitor-Changed-987!",
  }, { cookie: visitorAdminCookie }), visitors);
  await assertIdentityDenial(api.put("/api/user/settings", {
    username: "taken-over-public-visitor@example.test",
  }, { cookie: visitorAdminCookie }), visitors);
  await assertIdentityDenial(api.put("/api/user/settings", {
    altEmail: "recovery-public-visitor@example.test",
  }, { cookie: visitorAdminCookie }), visitors);
  await assertIdentityDenial(api.delete("/api/user/account", { cookie: visitorAdminCookie }), visitors);
  await assertIdentityDenial(api.delete(`/api/user/workspaces/${workspaceId}`, { cookie: visitorAdminCookie }), visitors);
  await assertIdentityDenial(api.post("/api/api-keys", {
    name: "Blocked public visitor key",
    scopes: ["tasks:read"],
  }, { cookie: visitorAdminCookie }), visitors);

  const ordinaryPreference = await api.put("/api/user/settings", {
    themeMode: "dark",
  }, { cookie: visitorAdminCookie });
  assert.equal(ordinaryPreference.status, 200, JSON.stringify(ordinaryPreference.body));
  assert.equal(ordinaryPreference.body.themeMode, "dark", "non-identity preferences remain resettable demo data");

  const crossAccountRequests = [
    api.put(`/api/users/${visitors[1].userId}/reset-password`, {}, { cookie: visitorAdminCookie }),
    api.put(`/api/users/${visitors[1].userId}/update`, {
      altEmail: "cross-account-recovery@example.test",
      username: "cross-account-takeover@example.test",
    }, { cookie: visitorAdminCookie }),
    api.put(`/api/users/${visitors[1].userId}/deactivate`, {}, { cookie: visitorAdminCookie }),
    api.put(`/api/users/${visitors[1].userId}/reactivate`, {}, { cookie: visitorAdminCookie }),
    api.delete(`/api/users/${visitors[1].userId}`, { cookie: visitorAdminCookie }),
    api.get(`/api/users/${visitors[1].userId}/sessions`, { cookie: visitorAdminCookie }),
    api.delete(`/api/users/${visitors[1].userId}/sessions`, { cookie: visitorAdminCookie }),
    api.put(`/api/users/${visitors[1].userId}/reset-password`, {}, { cookie: adminCookie }),
  ];
  for (const request of crossAccountRequests) {
    await assertIdentityDenial(request, visitors);
  }

  await assertIdentityDenial(
    api.put(`/api/api-keys/${preexistingKey.body.apiKey.api_key_id}/revoke`, {}, { cookie: adminCookie }),
    visitors,
  );
  const apiKeyUse = await api.get("/api/v1/tasks", {
    headers: { authorization: `Bearer ${preexistingKey.body.rawKey}` },
  });
  assert.equal(apiKeyUse.status, 401, "a key owned by a marked visitor must not authenticate");

  await assert.rejects(
    () => accountExportRecoveryService.assertEligible(visitors[1].userId),
    (error) => error?.code === PUBLIC_DEMO_IDENTITY_DENIAL_CODE && error?.statusCode === 403,
  );

  const targetStillAuthenticated = await login(api, visitors[1].username, visitors[1].password);
  assert.ok(readSessionCookie(targetStillAuthenticated), "blocked mutations must leave the shared credential usable");
  assert.equal((await api.get("/api/session", { cookie: targetCookie })).status, 200, "blocked session management must preserve existing visitor sessions");

  const privateOperatorSettings = await api.put("/api/user/settings", {
    altEmail: "demo-operator-recovery@example.test",
  }, { cookie: adminCookie });
  assert.equal(privateOperatorSettings.status, 200, JSON.stringify(privateOperatorSettings.body));
  const privateOperatorPassword = await api.put("/api/user/password", {
    currentPassword: initialAdminPassword,
    newPassword: ADMIN_NEW_PASSWORD,
  }, { cookie: adminCookie });
  assert.equal(privateOperatorPassword.status, 200, JSON.stringify(privateOperatorPassword.body));
  assert.equal((await login(api, bootstrapAdmin.username, ADMIN_NEW_PASSWORD)).status, 200, "the unmarked private operator retains credential recovery");

  await assertPublicDemoRuntimeReady({ dataDir: fixture.root, demo: { enabled: false } });
  const standardReset = await api.put(`/api/users/${visitors[1].userId}/reset-password`, {}, { cookie: adminCookie });
  assert.equal(standardReset.status, 200, JSON.stringify(standardReset.body));
  assert.equal((await api.get("/api/session", { cookie: targetCookie })).status, 401, "standard-mode password reset still expires old sessions");
  assert.equal((await login(api, visitors[1].username, standardReset.body.initialPassword)).status, 200, "ordinary account lifecycle resumes outside demo mode");

  const adminRow = await db.get("SELECT protected_user FROM users WHERE user_id = :userId", { userId: adminUserId });
  assert.equal(adminRow.protected_user, "yes");
  assert.equal(visitors.some((visitor) => visitor.userId === adminUserId), false, "the private operator must remain outside the marker set");
} finally {
  await assertPublicDemoRuntimeReady({ dataDir: fixture.root, demo: { enabled: false } });
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Public-demo identity immutability regression passed.");

async function assertIdentityDenial(responsePromise, visitors) {
  const response = await responsePromise;
  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.deepEqual(response.body?.error && {
    code: response.body.error.code,
    message: response.body.error.message,
  }, {
    code: PUBLIC_DEMO_IDENTITY_DENIAL_CODE,
    message: PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE,
  });
  const serialized = JSON.stringify(response.body);
  for (const visitor of visitors) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(visitor.userId), "i"));
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(visitor.username), "i"));
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(visitor.password), "i"));
  }
}

async function login(api, username, password) {
  const response = await api.post("/api/login", { username, password, rememberMe: true });
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
    });
    const responseText = await response.text();
    return {
      body: responseText ? JSON.parse(responseText) : null,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    delete: (url, options) => request("DELETE", url, undefined, options),
    get: (url, options) => request("GET", url, undefined, options),
    post: (url, body, options) => request("POST", url, body, options),
    put: (url, body, options) => request("PUT", url, body, options),
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