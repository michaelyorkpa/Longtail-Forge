export const regressionMeta = Object.freeze({
  id: "framework.public-demo-cross-role-content-safety",
  area: "framework",
  tier: "release-gate",
  tags: ["browser", "database", "demo", "markdown", "permissions", "security"],
  description: "Proves public-demo editable content stays inert across scoped roles and freezes the reviewed browser HTML-sink inventory.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import express from "express";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("public-demo-cross-role-content-safety");
process.env.LONGTAIL_WORKER_MODE = "disabled";

const { initializeDatabase, closeDatabase, db } = await import("../../../src/db/index.js");
const { activateModuleRuntime } = await import("../../../src/core/modules/module-runtime.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { attachRequestContext } = await import("../../../src/core/request-context.js");
const { apiRouteBoundary } = await import("../../../src/core/http-error-contract.js");
const { createPublicDemoBudgetMiddleware } = await import("../../../src/core/public-demo-budgets.js");
const { PUBLIC_DEMO_BUDGET_LIMITS } = await import("../../../src/core/public-demo-budget-catalog.js");
const { permissionsService } = await import("../../../src/core/permissions.js");
const { isSafeMarkdownUrl } = await import("../../../src/core/markdown/markdown.service.js");
const { createErrorHandler } = await import("../../../src/middleware/error-handler.js");
const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");
const { listsService } = await import("../../../src/modules/lists/lists.service.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { readJsonBody } = await import("../../../src/utils/http.js");

let server;

try {
  await initializeDatabase();
  activateModuleRuntime("app");

  const adminSession = await readAdminSession();
  await modulesService.syncModuleRegistry(adminSession.workspace_id);
  const client = (await clientsService.createClient({ name: "Content Safety Client" }, adminSession)).client;
  const project = (await clientsService.createProject(client.id, { name: "Content Safety Project" }, adminSession)).project;
  const writerSession = await createScopedSession(adminSession.workspace_id, {
    label: "writer",
    roleId: "workspace_admin",
    scopeId: adminSession.workspace_id,
    scopeType: "workspace",
  });
  const readerSession = await createScopedSession(adminSession.workspace_id, {
    clientId: client.id,
    label: "reader",
    projectId: project.id,
    roleId: "project_admin",
    scopeId: project.id,
    scopeType: "project",
  });

  assert.equal(await permissionsService.can(writerSession, "notes.create", {
    client_id: client.id,
    operation: "read",
    project_id: project.id,
    workspace_id: adminSession.workspace_id,
  }), true, "the workspace-admin writer must receive Notes create access in the project context");
  assert.equal(await permissionsService.can(readerSession, "notes.view", {
    client_id: client.id,
    operation: "read",
    project_id: project.id,
    workspace_id: adminSession.workspace_id,
  }), true, "the project-admin reader must receive Notes read access in the project context");
  await proveCrossRoleStoredContent({ projectId: project.id, readerSession, writerSession });
  await proveBrowserSinkInventory();
  server = await listen(createPreviewProbe(writerSession));
  await proveReflectedAndBudgetBoundaries(server);

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.ok(integrity, "the integrity probe should return a row");
  assert.equal(integrity.integrity_check, "ok");
  console.log("Public-demo cross-role editable-content safety regression passed.");
} finally {
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

/**
 * The session this fixture builds for each seeded role. It carries the fields
 * the permission service resolves; the full authorization session carries
 * more, and completing it would change what the permission checks see.
 * @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} ProbeAuthorizationSession
 */

/** @typedef {import("../../../src/types/route-contracts.js").AsyncRouteHandler} ProbeRouteHandler */

/** @param {{ projectId: string, readerSession: ProbeAuthorizationSession, writerSession: ProbeAuthorizationSession }} context */
async function proveCrossRoleStoredContent({ projectId, readerSession, writerSession }) {
  const plainTextPayload = '<svg onload="stored-plain-secret">Plain text</svg>';
  const noteTitle = '<img src=x onerror="stored-title-secret">';
  const noteMarkdown = [
    "# Cross-role safety",
    "",
    "[Approved external link](https://example.com/reference)",
    "",
    "[Protocol-relative link](//attacker.example/escape)",
    "",
    "<b><em>malformed but inert",
  ].join("\n");

  const task = (await tasksService.create({
    description: plainTextPayload,
    project_id: projectId,
    title: plainTextPayload,
  }, writerSession)).task;
  const list = (await listsService.create({
    description: plainTextPayload,
    project_id: projectId,
    title: plainTextPayload,
  }, writerSession)).list;
  const item = (await listsService.createItem(list.list_id, {
    item_name: plainTextPayload,
  }, writerSession)).item;
  const note = (await notesService.create({
    body_markdown: noteMarkdown,
    libraryBucket: "active_work",
    project_id: projectId,
    title: noteTitle,
    visibility: "internal",
  }, writerSession)).note;

  const readerTask = (await tasksService.read(task.task_id, readerSession)).task;
  const readerList = await listsService.read(list.list_id, readerSession);
  const readerNote = (await notesService.read(note.note_id, readerSession)).note;

  assert.equal(readerTask.title, plainTextPayload);
  assert.equal(readerTask.description, plainTextPayload);
  assert.equal(readerList.list.title, plainTextPayload);
  assert.equal(readerList.list.description, plainTextPayload);
  assert.equal(readerList.items.find((entry) => entry.list_item_id === item.list_item_id)?.item_name, plainTextPayload);
  assert.equal(readerNote.title, noteTitle);
  assert.equal(readerNote.body_markdown, noteMarkdown);
  assert.match(readerNote.body_html, /href="https:\/\/example\.com\/reference"/);
  assert.doesNotMatch(readerNote.body_html, /attacker\.example|href="\/\//i);
  assert.match(readerNote.body_html, /&lt;b&gt;&lt;em&gt;malformed but inert/);
  assert.doesNotMatch(readerNote.body_html, /<script|<svg|<img|\son[a-z]+\s*=|javascript:|vbscript:|data:/i);
  assert.equal(isSafeMarkdownUrl("//attacker.example/escape"), false);
  assert.equal(isSafeMarkdownUrl("/\\attacker.example/escape"), false);
}

async function proveBrowserSinkInventory() {
  const expected = [
    'public/js/notes.js:body.innerHTML = note.body_html || "";',
    'public/js/notes.js:body.innerHTML = note.body_html || "";',
    'public/js/notes.js:preview.innerHTML = result.bodyHtml || "";',
    'public/js/shared/file-preview.js:content.innerHTML = html || "";',
    'public/js/stop-watch.js:this.clientSelect.innerHTML = "";',
    'public/js/stop-watch.js:this.clientSelect.innerHTML = "";',
    'public/js/stop-watch.js:this.projectSelect.innerHTML = "";',
    'public/js/time-entries.js:timeEntryTable.innerHTML = "";',
    'public/js/time-entry-dialog.js:wrapper.innerHTML = dialogMarkup();',
    'public/js/time-tracking-timer-dialog.js:wrapper.innerHTML = dialogMarkup();',
  ].sort();
  const actual = [];

  for (const file of await listJavaScriptFiles("public/js")) {
    const source = await fs.readFile(file, "utf8");
    for (const line of source.split(/\r?\n/)) {
      if (/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(line)) {
        actual.push(`${file.replaceAll("\\", "/")}:${line.trim()}`);
      }
    }
  }

  assert.deepEqual(actual.sort(), expected, "new browser HTML sinks require explicit safe-content review and inventory updates");

  const notesBrowser = await fs.readFile("public/js/notes.js", "utf8");
  const filesPreview = await fs.readFile("public/js/shared/file-preview.js", "utf8");
  const transportSecurity = await fs.readFile("src/core/transport-security.js", "utf8");
  assert.match(notesBrowser, /body\.innerHTML = note\.body_html \|\| ""/);
  assert.match(notesBrowser, /preview\.innerHTML = result\.bodyHtml \|\| ""/);
  assert.match(filesPreview, /content\.innerHTML = html \|\| ""/);
  assert.match(transportSecurity, /"script-src 'self'"/);
  assert.match(transportSecurity, /"script-src-attr 'none'"/);
  assert.match(transportSecurity, /"object-src 'none'"/);
  assert.match(transportSecurity, /"frame-src 'none'"/);
}

/** @param {ProbeAuthorizationSession} writerSession @returns {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureApp} */
function createPreviewProbe(writerSession) {
  const app = express();
  app.use(attachRequestContext);
  app.use(/** @type {ProbeRouteHandler} */ ((request, _response, next) => {
    request.session = /** @type {import("../../../src/types/http-contracts.js").RequestSession} */ (/** @type {unknown} */ (writerSession));
    next();
  }));
  app.use(createPublicDemoBudgetMiddleware({
    database: db,
    enabled: true,
    isVisitor: (userId) => userId === writerSession.user_id,
  }));
  app.post("/api/notes/preview", asyncHandler(async (request, response) => {
    const payload = /** @type {Record<string, unknown>} */ (await readJsonBody(request));
    response.status(200).json(await notesService.previewMarkdown(payload, /** @type {ProbeAuthorizationSession} */ (request.session)));
  }));
  app.use("/api", apiRouteBoundary);
  app.use(createErrorHandler({ logger: { error() {} } }));
  return app;
}

/** @param {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer} listener @returns {Promise<void>} */
async function proveReflectedAndBudgetBoundaries(listener) {
  const exact = "a".repeat(PUBLIC_DEMO_BUDGET_LIMITS.maxRichTextBytes);
  const acceptedSnakeCase = await request(listener, { body_markdown: exact });
  assert.equal(acceptedSnakeCase.status, 200, JSON.stringify(acceptedSnakeCase.body));
  assert.equal(acceptedSnakeCase.body.bodyMarkdown, exact);
  const acceptedCamelCase = await request(listener, { bodyMarkdown: exact });
  assert.equal(acceptedCamelCase.status, 200, JSON.stringify(acceptedCamelCase.body));
  assert.equal(acceptedCamelCase.body.bodyMarkdown, exact);

  const oversizedSecret = `oversized-secret-${"x".repeat(PUBLIC_DEMO_BUDGET_LIMITS.maxRichTextBytes)}`;
  const oversized = await request(listener, { body_markdown: oversizedSecret });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.body.error.code, "public_demo_input_limit");
  assert.doesNotMatch(JSON.stringify(oversized.body), /oversized-secret/);

  const reflectedSecret = '<img src=x onerror="reflected-secret">[x](javascript:alert(1))';
  const reflected = await request(listener, { body_markdown: reflectedSecret });
  assert.equal(reflected.status, 400, JSON.stringify(reflected.body));
  assert.doesNotMatch(JSON.stringify(reflected.body), /reflected-secret|javascript:|onerror/i);
  assert.match(reflected.body.error.message, /unsafe HTML, event handlers, or scriptable links/i);
}

async function readAdminSession() {
  const user = await db.get(`
    SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
    FROM users
    WHERE protected_user = 'yes'
    LIMIT 1
  `);
  assert.ok(user?.user_id && (user.active_workspace_id || user.home_workspace_id));
  return toSession(
    /** @type {{ timezone?: string, user_id: string, username: string }} */ (user),
    /** @type {string} */ (user.active_workspace_id || user.home_workspace_id),
  );
}

/** @param {string} workspaceId @param {{ clientId?: string | null, label: string, projectId?: string | null, roleId: string, scopeId: string, scopeType: string }} scope */
async function createScopedSession(workspaceId, {
  clientId = null,
  label,
  projectId = null,
  roleId,
  scopeId,
  scopeType,
}) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `content-safety-${label}-${userId}@example.test`;
  await db.transaction(async (transaction) => {
    await transaction.run(`
      INSERT INTO users (
        user_id, home_workspace_id, username, display_name, timezone, password,
        user_status, protected_user, active_workspace_id
      ) VALUES (
        :userId, :workspaceId, :username, :displayName, 'America/New_York',
        'unused', 'active', 'no', :workspaceId
      )
    `, { displayName: `Content Safety ${label}`, userId, username, workspaceId });
    await transaction.run(`
      INSERT INTO user_workspaces (
        user_workspace_id, user_id, workspace_id, status, created_at, updated_at
      ) VALUES (
        :membershipId, :userId, :workspaceId, 'active', :now, :now
      )
    `, { membershipId: randomUUID(), now, userId, workspaceId });
    await transaction.run(`
      INSERT INTO user_role_assignments (
        assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
        client_id, project_id, permission_overrides_json, created_at, updated_at
      ) VALUES (
        :assignmentId, :workspaceId, :userId, :roleId, :scopeType, :scopeId,
        :clientId, :projectId, NULL, :now, :now
      )
    `, { assignmentId: randomUUID(), clientId, now, projectId, roleId, scopeId, scopeType, userId, workspaceId });
  });
  return toSession({ user_id: userId, username, timezone: "America/New_York" }, workspaceId);
}

/**
 * @param {{ timezone?: string, user_id: string, username: string }} user
 * @param {string} workspaceId
 * @returns {ProbeAuthorizationSession}
 */
function toSession(user, workspaceId) {
  return /** @type {ProbeAuthorizationSession} */ (/** @type {unknown} */ ({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  }));
}

/** The preview payload this probe posts and the response it reads back. */
/** @typedef {{ body: { bodyMarkdown: string, error: { code: string, message: string } }, status: number | undefined }} PreviewResponse */

/** @param {string} root @returns {Promise<string[]>} */
async function listJavaScriptFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(candidate));
    else if (entry.name.endsWith(".js")) files.push(candidate);
  }
  return files;
}

/** @param {ProbeRouteHandler} handler @returns {ProbeRouteHandler} */
function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

/**
 * @param {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureApp} app
 * @returns {Promise<import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer>}
 */
function listen(app) {
  return new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
}

/**
 * @param {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer} listener
 * @returns {Promise<void>}
 */
function closeServer(listener) {
  return new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

/**
 * @param {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer} listener
 * @param {Record<string, unknown>} payload
 * @returns {Promise<PreviewResponse>}
 */
function request(listener, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const nextRequest = http.request({
      headers: {
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/json",
      },
      host: "127.0.0.1",
      method: "POST",
      path: "/api/notes/preview",
      port: /** @type {import("node:net").AddressInfo} */ (listener.address()).port,
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ body: text ? JSON.parse(text) : null, status: response.statusCode });
      });
    });
    nextRequest.on("error", reject);
    nextRequest.end(body);
  });
}
