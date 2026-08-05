export const regressionMeta = Object.freeze({
  id: "framework.support-view-request-enforcement",
  area: "framework",
  tier: "release-gate",
  tags: ["api", "authentication", "baseline-bypass", "database", "notes", "permissions", "security", "sessions", "workspace-isolation"],
  description: "Proves central Support View read declarations, target-scoped authorization, mutation denial, sensitive-read exclusions, secure Notes omission, and attributable action attempts.",
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
    reasonReference: "Support View request enforcement regression",
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
