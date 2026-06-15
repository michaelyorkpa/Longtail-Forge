/* global fetch */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

let server;

try {
  await initializeDatabase();
  const session = await readSession();

  await assertNotesInheritClientProjectTags(session);
  await assertApiScopeVisibility(session);

  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await assertNotesListsPublicReads(session, baseUrl);
  await assertIntegrity();

  console.log("Notes/Lists tag inheritance and API scope regression passed.");
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

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
  assert.equal(notesList.status, 200);
  assert.equal(notesList.body.apiVersion, "v1");
  assert.ok(notesList.body.data.some((entry) => entry.note_id === note.note_id));
  assert.equal(Object.hasOwn(notesList.body.data[0], "body_html"), false);

  const noteRead = await apiRequest(baseUrl, `/api/v1/notes/${encodeURIComponent(note.note_id)}`, { rawKey: fullKey.rawKey });
  assert.equal(noteRead.status, 200);
  assert.equal(noteRead.body.data.note_id, note.note_id);
  assert.equal(noteRead.body.data.body_markdown, "Public note read body.");

  const listsList = await apiRequest(baseUrl, "/api/v1/lists", { rawKey: fullKey.rawKey });
  assert.equal(listsList.status, 200);
  assert.ok(listsList.body.data.some((entry) => entry.list_id === list.list_id));

  const listRead = await apiRequest(baseUrl, `/api/v1/lists/${encodeURIComponent(list.list_id)}`, { rawKey: fullKey.rawKey });
  assert.equal(listRead.status, 200);
  assert.equal(listRead.body.data.list.list_id, list.list_id);
  assert.ok(Array.isArray(listRead.body.data.items));
  assert.ok(Array.isArray(listRead.body.data.links));

  const underscopedList = await apiRequest(baseUrl, "/api/v1/lists", { rawKey: notesOnlyKey.rawKey });
  assert.equal(underscopedList.status, 403);
  assert.equal(underscopedList.body.error.code, "scope_required");
}

async function scopeIds(workspaceId) {
  return (await modulesService.listAvailableApiScopes(workspaceId))
    .map((scope) => scope.id)
    .sort();
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function setModuleStatus(workspaceId, moduleId, status) {
  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)};
`);
}

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

async function listen(app) {
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

  assert.ok(rows[0]?.user_id, "protected user fixture is required");
  return {
    display_name: rows[0].display_name || rows[0].username,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}
