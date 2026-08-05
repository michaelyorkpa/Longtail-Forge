export const regressionMeta = Object.freeze({
  id: "framework.support-view-request-enforcement",
  area: "framework",
  tier: "release-gate",
  tags: ["accessibility", "api", "authentication", "baseline-bypass", "browser", "database", "notes", "permissions", "security", "sessions", "workspace-isolation"],
  description: "Proves central Support View read declarations, target-scoped authorization, mutation denial, sensitive-read exclusions, secure Notes omission, attributed end/logout lifecycle, and bounded retention/export.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("support-view-request-enforcement");
const ADMIN_USERNAME = "support-view-gate-admin@example.test";
const ADMIN_PASSWORD = "Support-View-Gate-Admin-123!";
const TARGET_USERNAME = "support-view-gate-target@example.test";
const REASON_REFERENCE = "=Support View request enforcement regression";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.LONGTAIL_SUPPORT_VIEW_ENABLED = "true";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "support-view-gate-v1";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "Support-View-Gate-Secure-Notes-Key-2026!";
process.env.LONGTAIL_WORKER_MODE = "disabled";

const { createApp } = await import("../../../src/core/app.js");
const { createOpaqueId, createRecordId } = await import("../../../src/core/identifiers.js");
const { db } = await import("../../../src/core/database.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const {
  SUPPORT_VIEW_READ_ROUTES,
  SUPPORT_VIEW_SENSITIVE_READ_ROUTES,
} = await import("../../../src/middleware/support-view-request-gate.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");
const { authService } = await import("../../../src/services/auth.service.js");
const { supportViewService } = await import("../../../src/services/support-view.service.js");
const { supportSessionsRepository } = await import("../../../src/repositories/support-sessions.repo.js");
const { userWorkspacesRepository } = await import("../../../src/repositories/user-workspaces.repo.js");
const { usersRepository } = await import("../../../src/repositories/users.repo.js");
const { hashPassword } = await import("../../../src/security/passwords.js");
const { getRequestSession } = await import("../../../src/security/sessions.js");

let server;

try {
  await assertReadRouteDeclarations();
  await initializeDatabase();
  const actorLogin = await authService.login({
    password: ADMIN_PASSWORD,
    username: ADMIN_USERNAME,
  }, { ipAddress: "127.0.0.1" });
  const actorSession = await readRequestSession(actorLogin.session.sessionId);
  const target = await createTargetUser(actorSession.workspace_id);
  await addRoleAssignment(
    target.user_id,
    actorSession.workspace_id,
    "workspace_admin",
    "workspace",
    actorSession.workspace_id,
  );
  const secureNote = await createSecureNote(actorSession);
  const started = await supportViewService.start(actorSession, actorLogin.session.sessionId, {
    currentPassword: ADMIN_PASSWORD,
    effectiveUserId: target.user_id,
    reasonReference: REASON_REFERENCE,
    workspaceId: actorSession.workspace_id,
  }, requestContext());
  const supportSession = await readRequestSession(started.session.sessionId);

  assert.equal(supportSession.user_id, target.user_id, "authorization must run as the effective target");
  assert.equal(supportSession.username, TARGET_USERNAME);
  assert.equal(supportSession.actor_user_id, actorSession.user_id, "the immutable actor must remain separately attributable");
  assert.equal(supportSession.workspace_id, actorSession.workspace_id);

  server = await listen(createApp());
  const origin = "http://127.0.0.1:" + server.address().port;
  const sessionCookie = "longtail_forge_session=" + started.session.sessionId;

  const sessionResponse = await globalThis.fetch(origin + "/api/session", {
    headers: { Cookie: sessionCookie },
  });
  await assertResponseStatus(sessionResponse, 200);
  const sessionPayload = await sessionResponse.json();
  assert.equal(sessionPayload.user.supportView.effectiveUserId, target.user_id);
  assert.equal(sessionPayload.user.supportView.actorUserId, actorSession.user_id);

  const tasksResponse = await globalThis.fetch(origin + "/api/tasks", {
    headers: { Cookie: sessionCookie },
  });
  await assertResponseStatus(tasksResponse, 200);
  assert.equal((await tasksResponse.json()).currentUserId, target.user_id, "rendered read data must use the target identity");

  const notesResponse = await globalThis.fetch(origin + "/api/notes", {
    headers: { Cookie: sessionCookie },
  });
  await assertResponseStatus(notesResponse, 200);
  assert.equal(
    JSON.stringify(await notesResponse.json()).includes(secureNote.title),
    false,
    "secure Note titles must be omitted from Support View lists",
  );

  const collectionsResponse = await globalThis.fetch(origin + "/api/notes/collections", {
    headers: { Cookie: sessionCookie },
  });
  await assertResponseStatus(collectionsResponse, 200);
  assert.equal(
    JSON.stringify(await collectionsResponse.json()).includes(secureNote.catalogTitle),
    false,
    "secure Notes catalog hierarchy must be omitted",
  );

  const secureNoteResponse = await globalThis.fetch(origin + "/api/notes/" + secureNote.noteId, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(secureNoteResponse.status, 404);
  assert.equal((await secureNoteResponse.json()).error.code, "not_found");

  const sensitiveResponse = await globalThis.fetch(origin + "/api/api-keys", {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(sensitiveResponse.status, 404);
  assert.equal((await sensitiveResponse.json()).error.code, "not_found");

  const supportAuditFromTarget = await globalThis.fetch(origin + "/api/support-view/audit", {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(supportAuditFromTarget.status, 404, "Support View must not open its administrator audit surface");
  assert.equal((await supportAuditFromTarget.json()).error.code, "not_found");

  const unknownReadResponse = await globalThis.fetch(origin + "/api/future-undeclared-read", {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(unknownReadResponse.status, 404);

  const csrfResponse = await globalThis.fetch(origin + "/api/csrf-token");
  const csrfPayload = await csrfResponse.json();
  const csrfCookie = (csrfResponse.headers.get("set-cookie") || "").split(";", 1)[0];
  const tasksBefore = Number((await db.get("SELECT COUNT(1) AS count FROM tasks;")).count);
  const mutationResponse = await globalThis.fetch(origin + "/api/tasks", {
    method: "POST",
    headers: {
      Cookie: sessionCookie + "; " + csrfCookie,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 Support View Regression",
      "X-CSRF-Token": csrfPayload.csrfToken,
    },
    body: JSON.stringify({ title: "Must never be created" }),
  });
  await assertResponseStatus(mutationResponse, 403);
  assert.equal((await mutationResponse.json()).error.code, "support_view_read_only");
  assert.equal(Number((await db.get("SELECT COUNT(1) AS count FROM tasks;")).count), tasksBefore);

  const events = await supportSessionsRepository.listEvents(started.supportView.supportSessionId);
  const attempts = events.filter((event) => event.event_type === "action_attempt");
  assert.ok(attempts.length >= 8);
  assert.ok(attempts.some((event) => event.outcome === "allowed" && event.route_id === "framework.session"));
  assert.ok(attempts.some((event) => event.outcome === "denied" && event.reason_class === "mutation_denied"));
  assert.ok(attempts.some((event) => event.outcome === "denied" && event.reason_class === "sensitive_read_excluded"));
  assert.ok(attempts.some((event) => event.outcome === "denied" && event.reason_class === "undeclared_read_denied"));
  for (const event of attempts) {
    assert.equal(event.actor_user_id, actorSession.user_id);
    assert.equal(event.effective_user_id, target.user_id);
    assert.equal(event.workspace_id, actorSession.workspace_id);
    assert.ok(event.request_id);
    assert.ok(event.route_id);
    assert.ok(event.action_id);
    assert.deepEqual(JSON.parse(event.metadata_json), {});
  }
  const persistedAttempts = JSON.stringify(attempts);
  assert.doesNotMatch(persistedAttempts, /Must never be created/);
  assert.doesNotMatch(persistedAttempts, new RegExp(escapeRegExp(secureNote.title)));
  assert.doesNotMatch(persistedAttempts, new RegExp(escapeRegExp(started.session.sessionId)));

  const reviewerLogin = await authService.login({
    password: ADMIN_PASSWORD,
    username: ADMIN_USERNAME,
  }, { ipAddress: "127.0.0.1" });
  const reviewerSession = await readRequestSession(reviewerLogin.session.sessionId);
  const targets = await supportViewService.listTargets(reviewerSession);
  const targetOption = targets.targets.find((item) => item.userId === target.user_id);
  assert.equal(targetOption.label, `Support View Gate Target (${TARGET_USERNAME})`);
  assert.ok(targetOption.workspaces[0].label);
  assert.notEqual(targetOption.workspaces[0].label, actorSession.workspace_id, "workspace choices must use readable labels");

  const audit = await supportViewService.listAudit(reviewerSession, {});
  assert.equal(audit.retentionDays, 365);
  assert.equal(audit.exportLimit, 1000);
  const attributedAuditEvent = audit.events.find((event) => event.reasonReference === REASON_REFERENCE);
  assert.ok(attributedAuditEvent);
  assert.ok(attributedAuditEvent.actorLabel);
  assert.notEqual(attributedAuditEvent.actorLabel, actorSession.user_id, "actor attribution must use a readable label");
  assert.equal(attributedAuditEvent.effectiveUserLabel, "Support View Gate Target");
  const deniedAudit = await supportViewService.listAudit(reviewerSession, { outcome: "denied" });
  assert.ok(deniedAudit.events.length > 0);
  assert.ok(deniedAudit.events.every((event) => event.outcome === "denied"));
  const auditCsv = await supportViewService.exportAuditCsv(reviewerSession, { outcome: "denied" });
  assert.match(auditCsv, /reason_reference/);
  assert.ok(auditCsv.includes("'=Support View request enforcement regression"), "formula-leading audit text must be neutralized for spreadsheets");
  assert.doesNotMatch(auditCsv, new RegExp(escapeRegExp(started.session.sessionId)));

  const targetListResponse = await globalThis.fetch(origin + "/api/support-view/targets", {
    headers: { Cookie: "longtail_forge_session=" + reviewerLogin.session.sessionId },
  });
  await assertResponseStatus(targetListResponse, 200);
  assert.ok((await targetListResponse.json()).targets.some((item) => item.userId === target.user_id));

  const exitResponse = await globalThis.fetch(origin + "/api/support-view/exit", {
    method: "POST",
    headers: {
      Cookie: sessionCookie + "; " + csrfCookie,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 Support View Regression",
      "X-CSRF-Token": csrfPayload.csrfToken,
    },
    body: "{}",
  });
  await assertResponseStatus(exitResponse, 200);
  const restoredSessionId = (exitResponse.headers.get("set-cookie") || "").match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
  assert.ok(restoredSessionId && restoredSessionId !== started.session.sessionId, "exit must rotate to a new actor session");
  const restoredSession = await readRequestSession(restoredSessionId);
  assert.equal(restoredSession.user_id, actorSession.user_id);
  assert.equal(restoredSession.support_view, undefined);

  const logoutStarted = await supportViewService.start(restoredSession, restoredSessionId, {
    currentPassword: ADMIN_PASSWORD,
    effectiveUserId: target.user_id,
    reasonReference: REASON_REFERENCE + " logout",
    workspaceId: actorSession.workspace_id,
  }, requestContext());
  const logoutSessionCookie = "longtail_forge_session=" + logoutStarted.session.sessionId;
  const logoutResponse = await globalThis.fetch(origin + "/api/logout", {
    method: "POST",
    headers: {
      Cookie: logoutSessionCookie + "; " + csrfCookie,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 Support View Regression",
      "X-CSRF-Token": csrfPayload.csrfToken,
    },
    body: "{}",
  });
  await assertResponseStatus(logoutResponse, 200);
  assert.match(logoutResponse.headers.get("set-cookie") || "", /longtail_forge_session=;/);
  assert.equal(await readRequestSession(logoutStarted.session.sessionId), null, "logout must remove the Support View browser session");
  const loggedOutSupportSession = await supportSessionsRepository.readById(logoutStarted.supportView.supportSessionId);
  assert.equal(loggedOutSupportSession.outcome, "exited");
  const logoutEvents = await supportSessionsRepository.listEvents(logoutStarted.supportView.supportSessionId);
  assert.ok(logoutEvents.some((event) => (
    event.event_type === "exited"
    && event.outcome === "success"
    && JSON.parse(event.metadata_json).reason_class === "administrator_logout"
  )), "logout must record an attributed Support View end event");
  const remainingActorSessions = await db.query(`
SELECT session_id
FROM sessions
WHERE user_id = :actorUserId
ORDER BY session_id;
`, { actorUserId: actorSession.user_id });
  assert.deepEqual(
    remainingActorSessions.map((row) => row.session_id),
    [reviewerLogin.session.sessionId],
    "Support View logout must not restore a new normal administrator session",
  );

  const oldTimestamp = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
  await db.run(`
UPDATE support_view_events
SET occurred_at = :oldTimestamp
WHERE support_session_id = :supportSessionId;
`, { oldTimestamp, supportSessionId: started.supportView.supportSessionId });
  await db.run(`
UPDATE support_sessions
SET started_at = :oldTimestamp,
    expires_at = :oldTimestamp,
    ended_at = :oldTimestamp,
    updated_at = :oldTimestamp
WHERE support_session_id = :supportSessionId;
`, { oldTimestamp, supportSessionId: started.supportView.supportSessionId });
  await supportViewService.listAudit(reviewerSession, {});
  assert.equal(
    await supportSessionsRepository.readById(started.supportView.supportSessionId),
    null,
    "completed Support View records beyond the fixed retention window must be pruned",
  );

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity.integrity_check, "ok");
  console.log("Support View request enforcement regression passed.");
} finally {
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

async function assertReadRouteDeclarations() {
  const root = process.cwd();
  const routeFiles = [
    ...(await fs.readdir(path.join(root, "src", "routes")))
      .filter((name) => name.endsWith(".routes.js"))
      .filter((name) => ![
        "app-info.routes.js",
        "auth.routes.js",
        "operational-health.routes.js",
        "public-api.routes.js",
      ].includes(name))
      .map((name) => path.join(root, "src", "routes", name)),
    ...(await listFiles(path.join(root, "src", "modules")))
      .filter((filePath) => filePath.endsWith(".routes.js") || path.basename(filePath) === "routes.js")
      .filter((filePath) => !filePath.endsWith("public-api.routes.js")),
  ];
  const declared = new Set([
    ...SUPPORT_VIEW_READ_ROUTES,
    ...SUPPORT_VIEW_SENSITIVE_READ_ROUTES,
  ].map((entry) => entry.path));
  const discovered = new Set(["/api/session"]);

  for (const filePath of routeFiles) {
    const source = await fs.readFile(filePath, "utf8");
    for (const match of source.matchAll(/\.get\(\s*"([^"]+)"/g)) {
      if (match[1] === "/{*staticPath}") {
        discovered.add(match[1]);
      } else {
        discovered.add("/api" + match[1]);
      }
    }
  }

  assert.deepEqual(
    [...declared].sort(),
    [...discovered].sort(),
    "every protected browser GET route must declare read-safe or sensitive Support View behavior",
  );
  assert.equal(
    new Set([...SUPPORT_VIEW_READ_ROUTES, ...SUPPORT_VIEW_SENSITIVE_READ_ROUTES].map((entry) => entry.id)).size,
    SUPPORT_VIEW_READ_ROUTES.length + SUPPORT_VIEW_SENSITIVE_READ_ROUTES.length,
    "Support View route IDs must be unique",
  );

  const [navigationSource, entryScriptSource, entryHtml, auditHtml, staticSource, authRoutesSource, supportRoutesSource, appShellSource, appSource, browserJourneySource] = await Promise.all([
    fs.readFile(path.join(root, "public", "js", "navigation.js"), "utf8"),
    fs.readFile(path.join(root, "public", "js", "support-view.js"), "utf8"),
    fs.readFile(path.join(root, "views", "protected", "support-view.html"), "utf8"),
    fs.readFile(path.join(root, "views", "protected", "support-view-audit.html"), "utf8"),
    fs.readFile(path.join(root, "src", "services", "static.service.js"), "utf8"),
    fs.readFile(path.join(root, "src", "routes", "auth.routes.js"), "utf8"),
    fs.readFile(path.join(root, "src", "routes", "support-view.routes.js"), "utf8"),
    fs.readFile(path.join(root, "src", "services", "app-shell.service.js"), "utf8"),
    fs.readFile(path.join(root, "src", "core", "app.js"), "utf8"),
    fs.readFile(path.join(root, "tests", "e2e", "support-view.spec.mjs"), "utf8"),
  ]);
  assert.match(navigationSource, /dataset\.supportViewBanner/);
  assert.match(navigationSource, /effectiveUserLabel/);
  assert.match(navigationSource, /effectiveWorkspaceName/);
  assert.match(navigationSource, /actorLabel/);
  assert.match(navigationSource, /MutationObserver/);
  assert.match(navigationSource, /support-view-read-only-explanation/);
  assert.match(navigationSource, /End Support View/);
  assert.doesNotMatch(navigationSource, /dismissSupportView|support-view-dismiss/i, "the Support View banner must not be dismissible");
  assert.match(entryHtml, /autocomplete="current-password"/);
  assert.match(entryHtml, /maxlength="500"/);
  assert.match(entryHtml, /fully attributed, read-only view/);
  assert.match(entryScriptSource, /confirmedReadOnly: confirmationInput\.checked/);
  assert.match(supportRoutesSource, /payload\.confirmedReadOnly !== true/);
  assert.match(auditHtml, /data-support-view-audit-actor/);
  assert.match(auditHtml, /data-support-view-audit-target/);
  assert.match(auditHtml, /data-support-view-audit-workspace/);
  assert.match(staticSource, /supportViewOperatorOnly/);
  assert.match(staticSource, /permissionsService\.isSuperAdmin\(session\)/);
  assert.match(appShellSource, /permissionsService\.isSuperAdmin\(session\)/);
  assert.match(authRoutesSource, /authRoutes\.post\("\/support-view\/exit"/);
  assert.match(authRoutesSource, /authRoutes\.post\("\/logout"[\s\S]*supportViewService\.endForLogout/);
  assert.ok(
    appSource.indexOf("app.use(supportViewRequestGate)") < appSource.indexOf('app.use("/api", supportViewRoutes)'),
    "Support View targets/start/audit routes must remain behind the central request gate",
  );
  assert.match(browserJourneySource, /support_view_read_only/);
  assert.match(browserJourneySource, /End Support View/);
  assert.match(browserJourneySource, /Log Out/);
  assert.match(browserJourneySource, /data-framework-permission-denied/);
  assert.match(browserJourneySource, /toBeFocused/);
}

async function createSecureNote(session) {
  const catalogTitle = "Support View secret catalog";
  const catalog = (await notesService.createCollection({
    libraryBucket: "active_work",
    title: catalogTitle,
  }, session)).collection;
  await db.run(`
UPDATE note_library_collections
SET security_policy = 'secure'
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId;
`, {
    collectionId: catalog.note_library_collection_id,
    workspaceId: session.workspace_id,
  });
  const title = "Support View secret note title";
  const note = (await notesService.create({
    body_markdown: "Support View secret note body",
    library_bucket: "active_work",
    note_collection_id: catalog.note_library_collection_id,
    security_mode: "normal",
    title,
  }, session)).note;
  return { catalogTitle, noteId: note.note_id, title };
}

async function createTargetUser(workspaceId) {
  const created = await usersRepository.create(workspaceId, {
    altEmail: "",
    displayName: "Support View Gate Target",
    timezone: "America/Chicago",
    username: TARGET_USERNAME,
  }, await hashPassword("Support-View-Gate-Target-123!"));
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

async function readRequestSession(sessionId) {
  return getRequestSession({
    cookies: { longtail_forge_session: sessionId },
    headers: {},
    hostname: "localhost",
    protocol: "http",
    socket: { remoteAddress: "127.0.0.1" },
  });
}

function requestContext() {
  return {
    ipAddress: "127.0.0.1",
    requestId: createOpaqueId(),
  };
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
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

async function assertResponseStatus(response, statusCode) {
  if (response.status === statusCode) {
    return;
  }
  assert.equal(response.status, statusCode, await response.text());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}
