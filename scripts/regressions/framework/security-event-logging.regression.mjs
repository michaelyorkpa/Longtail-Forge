export const regressionMeta = Object.freeze({
  id: "framework.security-event-logging",
  area: "framework",
  tier: "focused",
  tags: ["audit", "authentication", "baseline-bypass", "permissions", "security", "workspace-isolation"],
  description: "Proves consolidated security-event persistence, safe failed-login records, admin-only workspace views, retention, and non-blocking auth logging.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("security-event-logging");
const ADMIN_USERNAME = "security-events-admin@example.test";
const ADMIN_PASSWORD = "Security-Events-Admin-123!";
const WRONG_PASSWORD = "Never-Persist-This-Password-456!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";
process.env.LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT = "5";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { internalEventBus } = await import("../../../src/core/events/event-bus.js");
const { auditService } = await import("../../../src/services/audit.service.js");
const { securityEventsService } = await import("../../../src/security/security-events.js");

let server;

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const failedLogin = await api.post("/api/login", {
    password: WRONG_PASSWORD,
    username: "missing-security-account@example.test",
  });
  assert.equal(failedLogin.status, 401);
  assert.equal(failedLogin.body.error.code, "authentication_required");
  assert.equal(failedLogin.body.error.message, "These credentials do not have access to this installation.");
  assert.match(failedLogin.body.error.requestId, /^[0-9a-f-]{36}$/i);

  const adminLogin = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminCookie = readSessionCookie(adminLogin);
  const originalWorkspaceId = adminLogin.body.user.workspace_id;
  const adminUserId = adminLogin.body.user.user_id;
  const adminSession = {
    ip_address: "127.0.0.1",
    user_id: adminUserId,
    username: ADMIN_USERNAME,
    workspace_id: originalWorkspaceId,
  };

  for (const [name, metadata] of [
    ["security.authentication_throttle.lockout", { client_ip: "127.0.0.1", dimensions: ["account"], scope: "login" }],
    ["security.public_demo.perimeter_limited", { limit: 600, request_id: "00000000-0000-4000-8000-000000000010", retry_after_seconds: 60, route_class: "api-internal", scope: "client_request", session_id: "must-not-persist", submitted_content: "must-not-persist", window_seconds: 60 }],
    ["security.session.revoked", { reason: "managed_workspace_sessions", revoked_session_count: 2 }],
    ["security.password.reset", { change_required: true, revoked_session_count: 2 }],
  ]) {
    await internalEventBus.emit(String(name), {
      actorUserId: adminUserId,
      metadata: typeof metadata === "object" && metadata !== null ? metadata : {},
      recordId: adminUserId,
      session: adminSession,
      source: "security",
      workspaceId: originalWorkspaceId,
    });
  }

  const ordinary = await api.post("/api/users", {
    username: "security-events-ordinary@example.test",
  }, { cookie: adminCookie });
  assert.equal(ordinary.status, 201, JSON.stringify(ordinary.body));
  await db.run(`
UPDATE users
SET password_change_required = 0
WHERE user_id = :userId;
`, { userId: ordinary.body.user.user_id });
  const ordinaryLogin = await login(api, ordinary.body.user.username, ordinary.body.initialPassword);
  const ordinaryCookie = readSessionCookie(ordinaryLogin);
  const deniedView = await api.get("/api/security-events", { cookie: ordinaryCookie });
  assert.equal(deniedView.status, 403, "ordinary users must not read security events");

  const securityView = await api.get("/api/security-events?limit=100", { cookie: adminCookie });
  assert.equal(securityView.status, 200, JSON.stringify(securityView.body));
  assert.ok(securityView.body.auditLogs.length >= 6, "auth and internal security events should share one queryable stream");
  assert.ok(securityView.body.auditLogs.every((row) => row.record_type === "security_event"));
  assert.ok(securityView.body.auditLogs.every((row) => row.change_type === "security"));
  assert.deepEqual(
    new Set(securityView.body.auditLogs.map((row) => row.action)).has("security.authentication.login_failed"),
    true,
  );
  for (const eventName of [
    "security.authentication_throttle.lockout",
    "security.public_demo.perimeter_limited",
    "security.session.revoked",
    "security.password.reset",
  ]) {
    assert.ok(securityView.body.auditLogs.some((row) => row.action === eventName), `${eventName} should persist`);
  }

  const normalAuditView = await api.get("/api/audit-logs?limit=500", { cookie: adminCookie });
  assert.equal(normalAuditView.status, 200);
  assert.ok(normalAuditView.body.auditLogs.every((row) => row.record_type !== "security_event"), "ordinary audit reads must not expose attempted-account data");

  const secondWorkspace = await api.post("/api/workspaces", {
    workspaceName: "ZZZ Security Event Boundary",
    workspaceType: "business",
  }, { cookie: adminCookie });
  assert.equal(secondWorkspace.status, 201, JSON.stringify(secondWorkspace.body));
  const secondWorkspaceId = secondWorkspace.body.workspace.workspaceId;
  await securityEventsService.record({
    actorUserId: adminUserId,
    actorUserName: ADMIN_USERNAME,
    eventType: "security.regression.second_workspace",
    outcome: "success",
    reasonClass: "workspace_boundary_probe",
    workspaceId: secondWorkspaceId,
  });
  const originalScope = await api.get(`/api/security-events?workspaceId=${encodeURIComponent(originalWorkspaceId)}&limit=500`, { cookie: adminCookie });
  assert.equal(originalScope.status, 200);
  assert.equal(originalScope.body.auditLogs.some((row) => row.action === "security.regression.second_workspace"), false, "workspace-scoped reads must not cross boundaries");

  await securityEventsService.record({
    actorUserId: adminUserId,
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    eventType: "security.regression.expired",
    outcome: "success",
    reasonClass: "retention_probe",
    workspaceId: originalWorkspaceId,
  });
  const afterRetention = await api.get(`/api/security-events?workspaceId=${encodeURIComponent(originalWorkspaceId)}&limit=500`, { cookie: adminCookie });
  assert.equal(afterRetention.status, 200);
  assert.equal(afterRetention.body.auditLogs.some((row) => row.action === "security.regression.expired"), false, "security events should follow configured audit retention");

  const storedSecurityRows = await db.query(`
SELECT actor_user_name, action, record_id, record_label, previous_value_json, new_value_json, metadata_json, ip_address
FROM audit_logs
WHERE record_type = 'security_event';
`);
  const serializedSecurityRows = JSON.stringify(storedSecurityRows);
  assert.equal(serializedSecurityRows.includes(WRONG_PASSWORD), false, "failed-login records must not contain submitted passwords");
  assert.ok(storedSecurityRows.every((row) => row.previous_value_json === null && row.new_value_json === null));
  const perimeterRow = storedSecurityRows.find((row) => row.action === "security.public_demo.perimeter_limited");
  assert.equal(JSON.parse(perimeterRow.metadata_json).request_id, "00000000-0000-4000-8000-000000000010");
  assert.equal(perimeterRow.metadata_json.includes("must-not-persist"), false);
  for (const row of storedSecurityRows) {
    assertSafeMetadataKeys(JSON.parse(row.metadata_json || "{}"));
  }

  const originalAuditRecord = auditService.record;
  const capturedWarnings = [];
  const originalWarn = console.warn;
  let loginWithBrokenLogging;
  try {
    auditService.record = async () => {
      throw new Error("simulated audit outage");
    };
    console.warn = (...args) => capturedWarnings.push(args.map(String).join(" "));
    loginWithBrokenLogging = await api.post("/api/login", {
      password: ADMIN_PASSWORD,
      username: ADMIN_USERNAME,
    });
  } finally {
    auditService.record = originalAuditRecord;
    console.warn = originalWarn;
  }
  assert.equal(loginWithBrokenLogging.status, 200, "logging failure must not block a valid authentication");
  assert.ok(readSessionCookie(loginWithBrokenLogging));
  assert.equal(JSON.stringify(capturedWarnings).includes(ADMIN_PASSWORD), false, "logging-failure diagnostics must not contain credentials");

  const [auditBrowserSource, auditRoutesSource, auditViewSource, securitySource] = await Promise.all([
    fs.readFile("public/js/audit-log.js", "utf8"),
    fs.readFile("src/routes/audit.routes.js", "utf8"),
    fs.readFile("views/protected/audit-log.html", "utf8"),
    fs.readFile("src/security/security-events.js", "utf8"),
  ]);
  assert.match(auditViewSource, /Security events/);
  assert.match(auditBrowserSource, /\/api\/security-events/);
  assert.match(auditRoutesSource, /workspace_settings\.manage/);
  assert.match(securitySource, /force: true/);
  assert.match(securitySource, /SECRET_FIELD_PATTERN/);

  console.log("Security event logging regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

async function login(api, username, password) {
  const response = await api.post("/api/login", { password, username });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = {};
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
    get(url, options) {
      return request("GET", url, undefined, options);
    },
    post(url, body, options) {
      return request("POST", url, body, options);
    },
  };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function assertSafeMetadataKeys(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    assert.doesNotMatch(key, /authorization|cookie|credential|hash|password|secret|session_?id|session_?reference|token/i, "security metadata keys must remain secret-free");
    assertSafeMetadataKeys(nestedValue);
  }
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
