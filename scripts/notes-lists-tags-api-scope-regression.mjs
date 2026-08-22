/* global fetch */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} ApiScopeSession */
/** @typedef {{ body: unknown, status: number }} ApiResponse */
/** @typedef {{ note_id?: string, id?: string, list_id?: string, body_markdown?: unknown, links?: unknown[], items?: unknown[], list?: Record<string, unknown>, note?: unknown, client?: unknown }} ApiScopeRecord */
/** @typedef {{ data: ApiScopeRecord }} ApiDataEnvelope */
/** @typedef {{ data: ApiScopeRecord[] }} ApiDataListEnvelope */
/** @typedef {{ data: ApiScopeRecord[], apiVersion: unknown }} ApiVersionedListEnvelope */
/** @typedef {{ error: { message?: unknown, code?: unknown } }} ApiErrorEnvelope */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-lists-tags-api-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-lists-tags-api.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Lists-Tags-Api-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { apiKeysService } = await import("../src/services/api-keys.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");

/** @type {import("node:http").Server | undefined} */
let server;

const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

try {
  await initializeDatabase();
  const session = await readSession();

  await assertNotesInheritClientProjectTags(session);
  await assertApiScopeVisibility(session);

  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${listenerPort(server)}`;
  await assertNotesListsPublicReads(session, baseUrl);
  await assertIntegrity();

  console.log("Notes/Lists tag inheritance and API scope regression passed.");
} finally {
  if (server) {
    const listening = server;
    await new Promise((resolve) => listening.close(resolve));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {ApiScopeSession} session */
async function assertNotesInheritClientProjectTags(session) {
  const clientTag = await tagsService.create(session, {
    color: "#2563eb",
    name: "Client Context Tag",
  });
  const projectTag = await tagsService.create(session, {
    color: "#16a34a",
    name: "Project Context Tag",
  });
  const client = (await clientsService.createClient({
    name: "Tagged API Scope Client",
    tagIds: [clientTag.tag.tag_id],
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: "Tagged API Scope Project",
    tagIds: [projectTag.tag.tag_id],
  }, session)).project;

  const clientNote = await notesService.create({
    body_markdown: "Client linked note body.",
    client_id: client.id,
    title: "Client linked note",
  }, session);
  const projectNote = await notesService.create({
    body_markdown: "Project linked note body.",
    links: [{
      module_id: "client-projects",
      target_id: project.id,
      target_type: "project",
    }],
    title: "Project linked note",
  }, session);

  await assertPropagatedTag(session, clientNote.note.note_id, clientTag.tag.tag_id, {
    ruleId: "notes.client-to-note",
    sourceTargetId: client.id,
    sourceTargetType: "client",
  });
  await assertPropagatedTag(session, projectNote.note.note_id, projectTag.tag.tag_id, {
    ruleId: "notes.project-to-note",
    sourceTargetId: project.id,
    sourceTargetType: "project",
  });

  assert.equal(clientNote.note.library_bucket_source, "derived");
  assert.equal(projectNote.note.visibility, "internal");
  assert.equal(projectNote.note.status, "active");

  const links = await notesService.listLinks(projectNote.note.note_id, session);
  await notesService.removeLink(projectNote.note.note_id, links.links[0].note_link_id, session);
  const afterRemove = await tagsService.listAssignments(session, {
    targetId: projectNote.note.note_id,
    targetType: "note",
  });

  assert.equal(
    afterRemove.propagatedTags.some((tag) => tag.tag_id === projectTag.tag.tag_id),
    false,
    "Removing project note link should remove project-propagated note tags",
  );
}

/** @param {ApiScopeSession} session @param {string} noteId @param {string} tagId @param {{ ruleId: string, sourceTargetId: string, sourceTargetType: string }} expected */
async function assertPropagatedTag(session, noteId, tagId, expected) {
  const assignments = await tagsService.listAssignments(session, {
    targetId: noteId,
    targetType: "note",
  });
  const propagated = assignments.propagatedAssignments.find((assignment) => assignment.tag_id === tagId);

  assert.ok(propagated, `note ${noteId} should inherit tag ${tagId}`);
  assert.equal(propagated.propagation_rule_id, expected.ruleId);
  assert.equal(propagated.source_target_id, expected.sourceTargetId);
  assert.equal(propagated.source_target_type, expected.sourceTargetType);
  assert.equal(assignments.directTags.some((tag) => tag.tag_id === tagId), false);
}

/** @param {ApiScopeSession} session */
async function assertApiScopeVisibility(session) {
  await setWorkspaceType(session.workspace_id, "business");
  const businessScopes = await scopeIds(session.workspace_id);

  assert.ok(businessScopes.includes("notes:read"));
  assert.ok(businessScopes.includes("lists:read"));
  assert.equal(businessScopes.includes("notes:write"), false);
  assert.equal(businessScopes.includes("lists:write"), false);

  await setWorkspaceType(session.workspace_id, "family");
  const familyScopes = await scopeIds(session.workspace_id);

  assert.ok(familyScopes.includes("notes:read"));
  assert.ok(familyScopes.includes("lists:read"));
  assert.equal(familyScopes.includes("clients:read"), false);
  assert.equal(familyScopes.includes("clients:write"), false);

  await setWorkspaceType(session.workspace_id, "business");
  await setModuleStatus(session.workspace_id, "notes", "disabled");
  assert.equal((await scopeIds(session.workspace_id)).includes("notes:read"), false);
  await setModuleStatus(session.workspace_id, "notes", "enabled");
}

/** @param {ApiScopeSession} session @param {string} baseUrl */
async function assertNotesListsPublicReads(session, baseUrl) {
  const note = (await notesService.create({
    body_markdown: "Public note read body.",
    title: "Public API Read Note",
  }, session)).note;
  const list = (await listsService.create({
    list_type: "shopping",
    title: "Public API Read List",
  }, session)).list;
  const fullKey = await apiKeysService.create({
    name: "Notes and Lists read key",
    scopes: ["notes:read", "lists:read"],
  }, session);
  const notesOnlyKey = await apiKeysService.create({
    name: "Notes only read key",
    scopes: ["notes:read"],
  }, session);

  const notesList = await apiRequest(baseUrl, "/api/v1/notes", { rawKey: fullKey.rawKey });
  /** @type {ApiVersionedListEnvelope} */
  const notesListPayload = readPayload(notesList, ["data"], "notesList");
  assert.equal(notesList.status, 200);
  assert.equal(notesListPayload.apiVersion, "v1");
  assert.ok(notesListPayload.data.some((entry) => entry.note_id === note.note_id));
  assert.equal(Object.hasOwn(notesListPayload.data[0], "body_html"), false);

  const noteRead = await apiRequest(baseUrl, `/api/v1/notes/${encodeURIComponent(note.note_id)}`, { rawKey: fullKey.rawKey });
  /** @type {ApiDataEnvelope} */
  const noteReadPayload = readPayload(noteRead, ["data"], "noteRead");
  assert.equal(noteRead.status, 200);
  assert.equal(noteReadPayload.data.note_id, note.note_id);
  assert.equal(noteReadPayload.data.body_markdown, "Public note read body.");

  const listsList = await apiRequest(baseUrl, "/api/v1/lists", { rawKey: fullKey.rawKey });
  /** @type {ApiDataListEnvelope} */
  const listsListPayload = readPayload(listsList, ["data"], "listsList");
  assert.equal(listsList.status, 200);
  assert.ok(listsListPayload.data.some((entry) => entry.list_id === list.list_id));

  const listRead = await apiRequest(baseUrl, `/api/v1/lists/${encodeURIComponent(list.list_id)}`, { rawKey: fullKey.rawKey });
  /** @type {ApiDataEnvelope} */
  const listReadPayload = readPayload(listRead, ["data"], "listRead");
  assert.equal(listRead.status, 200);
  assert.ok(listReadPayload.data.list, "the list read should answer a list record");
  assert.equal(listReadPayload.data.list.list_id, list.list_id);
  assert.ok(Array.isArray(listReadPayload.data.items));
  assert.ok(Array.isArray(listReadPayload.data.links));

  const underscopedList = await apiRequest(baseUrl, "/api/v1/lists", { rawKey: notesOnlyKey.rawKey });
  /** @type {ApiErrorEnvelope} */
  const underscopedListPayload = readPayload(underscopedList, ["error"], "underscopedList");
  assert.equal(underscopedList.status, 403);
  assert.equal(underscopedListPayload.error.code, "scope_required");
}

/** @param {string} workspaceId */
async function scopeIds(workspaceId) {
  return (await modulesService.listAvailableApiScopes(workspaceId))
    .map((scope) => scope.id)
    .sort();
}

/** @param {string} workspaceId @param {string} workspaceType */
async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

/** @param {string} workspaceId @param {string} moduleId @param {string} status */
async function setModuleStatus(workspaceId, moduleId, status) {
  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)};
`);
}

/** @param {string} baseUrl @param {string} route @param {{ rawKey?: string }} [options] @returns {Promise<ApiResponse>} */
async function apiRequest(baseUrl, route, { rawKey } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: rawKey ? { authorization: `Bearer ${rawKey}` } : {},
  });
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
}

/** @param {import("express").Application} app @returns {Promise<import("node:http").Server>} */
async function listen(app) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const nextServer = await listenOnEphemeralPort(app);
    const port = listenerPort(nextServer);

    if (!FETCH_BLOCKED_PORTS.has(port)) {
      return nextServer;
    }

    await new Promise((resolve) => nextServer.close(resolve));
  }

  throw new Error("Unable to find an ephemeral port accepted by fetch.");
}

/** @param {import("node:http").Server} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the API scope fixture server should bind a TCP port");
  return address.port;
}

/** @param {import("express").Application} app @returns {Promise<import("node:http").Server>} */
async function listenOnEphemeralPort(app) {
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
    nextServer.on("error", reject);
  });
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}

async function readSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
CROSS JOIN workspaces
WHERE users.protected_user = 'yes'
ORDER BY users.user_id, workspaces.workspace_id
LIMIT 1;
`);

  const row = requireFirstRow(rows, "protected user fixture is required");
  return workspaceSessionFixture({ ...row, display_name: row.display_name || row.username });
}
