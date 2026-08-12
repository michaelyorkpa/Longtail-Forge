export const regressionMeta = Object.freeze({
  id: "framework.support-view-session-contract",
  area: "framework",
  tier: "release-gate",
  tags: ["authentication", "baseline-bypass", "database", "permissions", "security", "sessions", "throttling", "workspace-isolation"],
  description: "Proves the gated durable Support View session contract, actor/effective identity separation, rotation, expiry, reauthentication throttling, revocation, and safe event persistence.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("support-view-session-contract");
const ADMIN_USERNAME = "support-view-admin@example.test";
const ADMIN_PASSWORD = "Support-View-Admin-123!";
const TARGET_USERNAME = "support-view-target@example.test";
const TARGET_PASSWORD = "Support-View-Target-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.LONGTAIL_SUPPORT_VIEW_ENABLED = "true";
process.env.LONGTAIL_SUPPORT_VIEW_TTL_SECONDS = "300";
process.env.LONGTAIL_AUTH_THROTTLE_ENABLED = "true";
process.env.LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT = "2";
process.env.LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS = "60";
process.env.LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS = "120";
process.env.TRUST_PROXY = "false";

const { createConfig } = await import("../../../src/config.js");
const { createApp } = await import("../../../src/core/app.js");
const { createRecordId, createOpaqueId } = await import("../../../src/core/identifiers.js");
const { db } = await import("../../../src/core/database.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { authService } = await import("../../../src/services/auth.service.js");
const { runtimeDiagnosticsService } = await import("../../../src/services/runtime-diagnostics.service.js");
const { supportViewService } = await import("../../../src/services/support-view.service.js");
const { sessionsRepository } = await import("../../../src/repositories/sessions.repo.js");
const { supportSessionsRepository } = await import("../../../src/repositories/support-sessions.repo.js");
const { userWorkspacesRepository } = await import("../../../src/repositories/user-workspaces.repo.js");
const { usersRepository } = await import("../../../src/repositories/users.repo.js");
const { authenticationThrottle } = await import("../../../src/security/auth-throttle.js");
const { buildSessionCookie } = await import("../../../src/security/cookies.js");
const { hashPassword } = await import("../../../src/security/passwords.js");
const { getRequestSession } = await import("../../../src/security/sessions.js");

let server;

try {
  assert.equal(createConfig({}).supportView.enabled, false, "Support View must default off");
  assert.equal(createConfig({ LONGTAIL_SUPPORT_VIEW_ENABLED: "true" }).supportView.enabled, true);
  assert.throws(
    () => createConfig({ LONGTAIL_SUPPORT_VIEW_TTL_SECONDS: "3601" }),
    /must be at most 3600/,
    "the runtime contract must cap support sessions at one hour",
  );

  await initializeDatabase();
  const firstLogin = await loginAdmin();
  const actorSession = await readRequestSession(firstLogin.sessionId);
  const workspaceId = actorSession.workspace_id;
  const target = await createTargetUser(workspaceId);

  server = await listen(createApp());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const csrfResponse = await globalThis.fetch(`${origin}/api/csrf-token`);
  const csrfPayload = await csrfResponse.json();
  const csrfCookie = (csrfResponse.headers.get("set-cookie") || "").split(";", 1)[0];
  for (const body of ["null", "[]", '"not an object"', "1"]) {
    const response = await globalThis.fetch(`${origin}/api/support-view/start`, {
      body,
      headers: {
        Cookie: `longtail_forge_session=${firstLogin.sessionId}; ${csrfCookie}`,
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 Support View Body Regression",
        "X-CSRF-Token": csrfPayload.csrfToken,
      },
      method: "POST",
    });
    assert.equal(response.status, 400, `Support View must reject the non-object JSON body ${body} with a deliberate client error`);
    const responsePayload = await response.json();
    assert.equal(responsePayload.error.code, "bad_request");
    assert.equal(responsePayload.error.message, "Confirm the read-only Support View warning before continuing.");
  }
  const supportPermissionRows = await db.query(`
SELECT role_id
FROM role_permissions
WHERE permission_id = 'support_view.enter'
ORDER BY role_id;
`);
  assert.deepEqual(supportPermissionRows.map((row) => row.role_id), ["super_admin"]);

  await authenticationThrottle.clear();
  await assertRejectsStatus(() => startSupport(actorSession, firstLogin.sessionId, target.user_id, workspaceId, {
    currentPassword: "Wrong-Support-Password-1!",
  }), 400);
  await assertRejectsStatus(() => startSupport(actorSession, firstLogin.sessionId, target.user_id, workspaceId, {
    currentPassword: "Wrong-Support-Password-2!",
  }), 429);
  assert.equal(Number((await db.get("SELECT COUNT(1) AS count FROM support_sessions;")).count), 0);
  assert.ok(await sessionsRepository.readById(firstLogin.sessionId), "failed reauthentication must not rotate the session");
  await authenticationThrottle.clear();

  const validRouteLogin = await loginAdmin();
  const validRouteResponse = await globalThis.fetch(`${origin}/api/support-view/start`, {
    body: JSON.stringify({
      confirmedReadOnly: true,
      currentPassword: ADMIN_PASSWORD,
      effectiveUserId: target.user_id,
      reasonReference: "Valid route regression",
      workspaceId,
    }),
    headers: {
      Cookie: `longtail_forge_session=${validRouteLogin.sessionId}; ${csrfCookie}`,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 Support View Body Regression",
      "X-CSRF-Token": csrfPayload.csrfToken,
    },
    method: "POST",
  });
  const validRouteText = await validRouteResponse.text();
  assert.equal(validRouteResponse.status, 200, validRouteText);
  const validRoutePayload = JSON.parse(validRouteText);
  assert.equal(validRoutePayload.supportView.effectiveUserId, target.user_id);
  const validRouteSessionId = readSessionCookie(validRouteResponse);
  const validRouteSession = await readRequestSession(validRouteSessionId);
  const validRouteExit = await supportViewService.exit(validRouteSession, validRouteSessionId, requestContext());
  await sessionsRepository.remove(validRouteExit.session.sessionId);
  await closeServer(server);
  server = null;

  await assertRejectsStatus(() => supportViewService.start(actorSession, firstLogin.sessionId, {
    currentPassword: ADMIN_PASSWORD,
    effectiveUserId: actorSession.user_id,
    reasonReference: "Self target",
    workspaceId,
  }, requestContext()), 400);
  await assertRejectsStatus(() => supportViewService.start({
    ...actorSession,
    session_mode: "account_export_recovery",
  }, firstLogin.sessionId, {
    currentPassword: ADMIN_PASSWORD,
    effectiveUserId: target.user_id,
    reasonReference: "Unsupported mode",
    workspaceId,
  }, requestContext()), 409);

  const firstStart = await startSupport(actorSession, firstLogin.sessionId, target.user_id, workspaceId, {
    secretBodyValue: "must-never-persist",
  });
  assert.notEqual(firstStart.session.sessionId, firstLogin.sessionId, "entry must rotate the session ID");
  assert.equal(await sessionsRepository.readById(firstLogin.sessionId), null);
  const firstSupportSession = await readRequestSession(firstStart.session.sessionId);
  assert.equal(firstSupportSession.user_id, target.user_id, "request authorization must use the effective target");
  assert.equal(firstSupportSession.actor_user_id, actorSession.user_id);
  assert.equal(firstSupportSession.effective_user_id, target.user_id);
  assert.equal(firstSupportSession.workspace_id, workspaceId);
  assert.equal(firstSupportSession.effective_workspace_id, workspaceId);
  assert.equal(firstSupportSession.support_view.actorUsername, ADMIN_USERNAME);
  assert.equal(firstSupportSession.support_view.effectiveUsername, TARGET_USERNAME);
  await assertRejectsStatus(
    () => authService.switchWorkspace(firstStart.session.sessionId, firstSupportSession, { workspaceId: "another-workspace" }),
    409,
  );
  await assertRejectsStatus(() => supportViewService.start(
    firstSupportSession,
    firstStart.session.sessionId,
    {
      currentPassword: ADMIN_PASSWORD,
      effectiveUserId: target.user_id,
      reasonReference: "Nested",
      workspaceId,
    },
    requestContext(),
  ), 409);

  const secureCookie = buildSessionCookie(firstStart.session.sessionId, firstStart.session.maxAgeSeconds, {
    requestContext: { isSecure: true },
  });
  assert.match(secureCookie, /HttpOnly/);
  assert.match(secureCookie, /SameSite=Lax/);
  assert.match(secureCookie, /Secure/);

  const persistedSupport = await db.get("SELECT * FROM support_sessions WHERE support_session_id = :id;", {
    id: firstStart.supportView.supportSessionId,
  });
  const persistedStartEvents = await supportSessionsRepository.listEvents(firstStart.supportView.supportSessionId);
  assert.equal(persistedSupport.reason_reference, "Regression support reference");
  assert.equal(persistedStartEvents.length, 1);
  assert.equal(persistedStartEvents[0].event_type, "entered");
  assert.deepEqual(JSON.parse(persistedStartEvents[0].metadata_json), { expiry_seconds: 300 });
  const persistedJson = JSON.stringify([persistedSupport, persistedStartEvents]);
  assert.doesNotMatch(persistedJson, new RegExp(escapeRegExp(firstLogin.sessionId)));
  assert.doesNotMatch(persistedJson, new RegExp(escapeRegExp(firstStart.session.sessionId)));
  assert.doesNotMatch(persistedJson, new RegExp(escapeRegExp(ADMIN_PASSWORD)));
  assert.doesNotMatch(persistedJson, /must-never-persist/);

  const secondLogin = await loginAdmin();
  const secondActorSession = await readRequestSession(secondLogin.sessionId);
  const secondStart = await startSupport(secondActorSession, secondLogin.sessionId, target.user_id, workspaceId);
  assert.equal(Number((await db.get("SELECT COUNT(1) AS count FROM support_sessions WHERE ended_at IS NULL;")).count), 2, "concurrent browser sessions may hold independent support sessions");

  await addRoleAssignment(target.user_id, workspaceId, "workspace_admin", "workspace", workspaceId);
  await db.run("DELETE FROM user_role_assignments WHERE user_id = :userId AND role_id = 'workspace_admin';", {
    userId: target.user_id,
  });
  const firstStored = await sessionsRepository.readById(firstStart.session.sessionId);
  const roleChangeResolution = await supportViewService.resolveForRequest(firstStored, requestContext());
  assert.equal(roleChangeResolution.supportSession.effective_user_id, target.user_id, "target role changes must be read live without replacing effective identity");
  assert.equal(roleChangeResolution.storedSession.session_id, firstStart.session.sessionId);

  const exited = await supportViewService.exit(
    firstSupportSession,
    firstStart.session.sessionId,
    requestContext(),
  );
  assert.notEqual(exited.session.sessionId, firstStart.session.sessionId, "exit must rotate the session ID");
  assert.equal((await readRequestSession(exited.session.sessionId)).workspace_id, workspaceId);
  const exitedRow = await supportSessionsRepository.readById(firstStart.supportView.supportSessionId);
  assert.equal(exitedRow.outcome, "exited");
  assert.deepEqual((await supportSessionsRepository.listEvents(firstStart.supportView.supportSessionId)).map((row) => row.event_type), ["entered", "exited"]);
  const diagnostics = await runtimeDiagnosticsService.read(await readRequestSession(exited.session.sessionId));
  assert.deepEqual(diagnostics.features.supportView, { enabled: true });
  assert.deepEqual(diagnostics.features.publicDemo.perimeter, {
    enabled: false,
    clientRequestLimit: 600,
    globalRequestLimit: 2400,
    maxBodyBytes: 128 * 1024,
    mutationLimit: 120,
    searchLimit: 60,
    windowSeconds: 60,
  });
  assert.equal(JSON.stringify(diagnostics).includes("supportSession"), false, "diagnostics must reveal no support-session details");
  assert.equal(JSON.stringify(diagnostics).includes(TARGET_USERNAME), false);

  const secondStored = await sessionsRepository.readById(secondStart.session.sessionId);
  const exactExpiry = new Date(secondStart.supportView.expiresAt);
  const expiryResolution = await supportViewService.resolveForRequest(secondStored, requestContext({ now: exactExpiry }));
  assert.ok(expiryResolution.session, "expiry should restore an active actor through a rotated normal session");
  assert.equal((await supportSessionsRepository.readById(secondStart.supportView.supportSessionId)).outcome, "expired");
  assert.equal((await supportSessionsRepository.listEvents(secondStart.supportView.supportSessionId))[1].event_type, "expired");

  const browserExpiryLogin = await loginAdmin();
  const browserExpiryActor = await readRequestSession(browserExpiryLogin.sessionId);
  const browserExpiryStart = await startSupport(browserExpiryActor, browserExpiryLogin.sessionId, target.user_id, workspaceId);
  const pastExpiry = new Date(Date.now() - 1000);
  await db.run(`
UPDATE sessions
SET expires_at = :expiresAt
WHERE session_id = :sessionId;
`, {
    expiresAt: pastExpiry.toISOString(),
    sessionId: browserExpiryStart.session.sessionId,
  });
  await db.run(`
UPDATE support_sessions
SET expires_at = :expiresAt
WHERE support_session_id = :supportSessionId;
`, {
    expiresAt: pastExpiry.toISOString(),
    supportSessionId: browserExpiryStart.supportView.supportSessionId,
  });
  await sessionsRepository.removeExpired();
  const expiredBrowserSession = await sessionsRepository.readById(browserExpiryStart.session.sessionId);
  assert.ok(expiredBrowserSession, "generic cleanup must retain linked sessions until their terminal event is recorded");
  const browserExpiryResolution = await supportViewService.resolveForRequest(
    expiredBrowserSession,
    requestContext(),
  );
  assert.equal(browserExpiryResolution.session, null, "an expired browser session must not rotate into another expired session");
  assert.equal(await sessionsRepository.readById(browserExpiryStart.session.sessionId), null);
  assert.equal((await supportSessionsRepository.readById(browserExpiryStart.supportView.supportSessionId)).outcome, "expired");
  assert.equal((await supportSessionsRepository.listEvents(browserExpiryStart.supportView.supportSessionId))[1].event_type, "expired");

  const revokedTargetLogin = await loginAdmin();
  const revokedTargetActor = await readRequestSession(revokedTargetLogin.sessionId);
  const revokedTargetStart = await startSupport(revokedTargetActor, revokedTargetLogin.sessionId, target.user_id, workspaceId);
  await userWorkspacesRepository.updateStatus(target.user_id, workspaceId, "inactive");
  const revokedTargetResolution = await supportViewService.resolveForRequest(
    await sessionsRepository.readById(revokedTargetStart.session.sessionId),
    requestContext(),
  );
  assert.ok(revokedTargetResolution.session, "target revocation should fail closed and restore the still-authorized actor");
  assert.equal((await supportSessionsRepository.readById(revokedTargetStart.supportView.supportSessionId)).outcome, "revoked");
  await userWorkspacesRepository.updateStatus(target.user_id, workspaceId, "active");

  const deactivatedTargetLogin = await loginAdmin();
  const deactivatedTargetActor = await readRequestSession(deactivatedTargetLogin.sessionId);
  const deactivatedTargetStart = await startSupport(deactivatedTargetActor, deactivatedTargetLogin.sessionId, target.user_id, workspaceId);
  await db.run("UPDATE users SET user_status = 'inactive' WHERE user_id = :userId;", { userId: target.user_id });
  const deactivatedTargetResolution = await supportViewService.resolveForRequest(
    await sessionsRepository.readById(deactivatedTargetStart.session.sessionId),
    requestContext(),
  );
  assert.ok(deactivatedTargetResolution.session);
  assert.equal((await supportSessionsRepository.readById(deactivatedTargetStart.supportView.supportSessionId)).outcome, "revoked");
  await db.run("UPDATE users SET user_status = 'active' WHERE user_id = :userId;", { userId: target.user_id });

  const routeExpiryLogin = await loginAdmin();
  const routeExpiryActor = await readRequestSession(routeExpiryLogin.sessionId);
  const routeExpiryStart = await startSupport(routeExpiryActor, routeExpiryLogin.sessionId, target.user_id, workspaceId);
  await db.run(`
UPDATE support_sessions
SET expires_at = :expiresAt
WHERE support_session_id = :supportSessionId;
`, {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    supportSessionId: routeExpiryStart.supportView.supportSessionId,
  });
  server = await listen(createApp());
  const routeExpiryResponse = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api/session`, {
    headers: { Cookie: `longtail_forge_session=${routeExpiryStart.session.sessionId}` },
  });
  assert.equal(routeExpiryResponse.status, 200, await routeExpiryResponse.text());
  const routeRotatedCookie = readSessionCookie(routeExpiryResponse);
  assert.ok(routeRotatedCookie, "pre-auth session reads must deliver the automatic expiry rotation cookie");
  assert.notEqual(routeRotatedCookie, routeExpiryStart.session.sessionId);
  assert.equal((await readRequestSession(routeRotatedCookie)).support_view, undefined);
  assert.equal(await sessionsRepository.readById(routeExpiryStart.session.sessionId), null);
  await closeServer(server);
  server = null;

  const revokedActorLogin = await loginAdmin();
  const revokedActor = await readRequestSession(revokedActorLogin.sessionId);
  const revokedActorStart = await startSupport(revokedActor, revokedActorLogin.sessionId, target.user_id, workspaceId);
  await db.run("UPDATE users SET protected_user = 'no' WHERE user_id = :userId;", { userId: revokedActor.user_id });
  await db.run("DELETE FROM user_role_assignments WHERE user_id = :userId AND role_id = 'super_admin';", { userId: revokedActor.user_id });
  const revokedActorResolution = await supportViewService.resolveForRequest(
    await sessionsRepository.readById(revokedActorStart.session.sessionId),
    requestContext(),
  );
  assert.ok(revokedActorResolution.session, "role revocation should end Support View and restore only the actor's ordinary membership context");
  assert.equal((await supportSessionsRepository.readById(revokedActorStart.supportView.supportSessionId)).outcome, "revoked");

  const supportColumns = await db.query("PRAGMA table_info(support_sessions);");
  const eventColumns = await db.query("PRAGMA table_info(support_view_events);");
  const allColumnNames = [...supportColumns, ...eventColumns].map((column) => column.name).join(" ");
  assert.doesNotMatch(allColumnNames, /password|token|cookie|request_body|response_body|secure_content/);
  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity.integrity_check, "ok");
  console.log("Support View session contract regression passed.");
} finally {
  await authenticationThrottle.clear();
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

async function loginAdmin() {
  const result = await authService.login({
    password: ADMIN_PASSWORD,
    username: ADMIN_USERNAME,
  }, { ipAddress: "127.0.0.1" });
  return result.session;
}

async function createTargetUser(workspaceId) {
  const created = await usersRepository.create(workspaceId, {
    altEmail: "",
    displayName: "Support Target",
    timezone: "America/New_York",
    username: TARGET_USERNAME,
  }, await hashPassword(TARGET_PASSWORD));
  await userWorkspacesRepository.upsert({ userId: created.user_id, workspaceId, status: "active" });
  return usersRepository.readFirstByUserId(created.user_id);
}

async function addRoleAssignment(userId, workspaceId, roleId, scopeType, scopeId) {
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
    assignmentId: createRecordId(),
    now,
    roleId,
    scopeId,
    scopeType,
    userId,
    workspaceId,
  });
}

async function startSupport(actorSession, currentSessionId, effectiveUserId, workspaceId, overrides = {}) {
  return supportViewService.start(actorSession, currentSessionId, {
    currentPassword: overrides.currentPassword || ADMIN_PASSWORD,
    effectiveUserId,
    reasonReference: "Regression support reference",
    workspaceId,
    ...overrides,
  }, requestContext());
}

async function readRequestSession(sessionId) {
  return getRequestSession({
    cookies: { longtail_forge_session: sessionId },
    headers: {},
    hostname: "localhost",
    protocol: "http",
    socket: { remoteAddress: "127.0.0.1" },
  });
}

function requestContext(overrides = {}) {
  return {
    ipAddress: "127.0.0.1",
    requestId: createOpaqueId(),
    ...overrides,
  };
}

async function assertRejectsStatus(operation, statusCode) {
  await assert.rejects(operation, (error) => error?.statusCode === statusCode);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "").match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
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
