/* global fetch */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-search-help-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-search-help.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Search-Help-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-search-help-secure-note-test-key";

const { createApp } = await import("../src/core/app.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { hasSearchIndexer } = await import("../src/core/search/indexer-registry.js");
const { summarizeNotificationEvent } = await import("../src/core/events/event-summaries.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_STATUSES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { indexNoteRecord } = await import("../src/modules/notes/search-indexers.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { searchService } = await import("../src/services/search.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { createSession } = await import("../src/security/sessions.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

let server;

try {
  await initializeDatabase();
  await searchService.ensureSearchBackendStorage({ refresh: true });

  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);
  const browserSession = await createSession(session);
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await assertNotesManifestContributions();
  await assertNotesSearchIndexing(session, {
    baseUrl,
    sessionId: browserSession.sessionId,
  });
  await assertNotesHelpContribution();
  await assertNotesNotificationContribution(session);

  console.log("Notes search and Help regression passed.");
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertNotesManifestContributions() {
  const notesModule = modulesService.getModule("notes");
  const searchableType = notesModule.searchableTypes.find((type) => type.recordType === "note");

  assert.ok(searchableType, "Notes should declare a note searchable type");
  assert.equal(searchableType.indexer, "notes.records");
  assert.equal(searchableType.sourceLabel, "Notes");
  assert.equal(hasSearchIndexer("notes.records"), true);
  assert.equal(notesModule.version, "0.33.5.21.3");
  assert.ok(notesModule.help.articles.length >= 11, "Notes should contribute current-state Help articles");
  assert.ok(notesModule.notificationEvents.some((event) => event.id === "note.updated"));
}

async function assertNotesSearchIndexing(session, browserContext) {
  const tag = await tagsService.create(session, {
    color: "#0f766e",
    name: "Notes Search Needle",
  });
  const normal = await notesService.create({
    title: "Searchable note",
    body_markdown: "Needle body with safe Markdown.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    tagIds: [tag.tag.tag_id],
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const activeWork = await notesService.create({
    title: "Active work note",
    body_markdown: "Different Library bucket.",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const secure = await notesService.create({
    title: "Secure hidden note",
    body_markdown: "Hidden secure search body.",
    security_mode: NOTE_SECURITY_MODES.SECURE,
  }, session);
  const privateNote = await notesService.create({
    title: "Private hidden note",
    body_markdown: "Hidden private search body.",
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, session);
  await notesService.archive(activeWork.note.note_id, session);

  const normalDocument = await indexNoteRecord({
    workspaceId: session.workspace_id,
    recordId: normal.note.note_id,
  });
  assert.equal(normalDocument.library_bucket, NOTE_LIBRARY_BUCKETS.REFERENCE);
  assert.equal(normalDocument.source, "Notes");
  assert.match(normalDocument.body, /Needle body/);
  assert.match(normalDocument.tags_text, /Notes Search Needle/);

  assert.equal(await indexNoteRecord({
    workspaceId: session.workspace_id,
    recordId: secure.note.note_id,
  }), null, "secure notes should not produce search documents");
  assert.equal(await indexNoteRecord({
    workspaceId: session.workspace_id,
    recordId: privateNote.note.note_id,
  }), null, "private notes should not produce shared search documents");

  const archivedDocument = await indexNoteRecord({
    workspaceId: session.workspace_id,
    recordId: activeWork.note.note_id,
  });
  assert.equal(archivedDocument.search_status, NOTE_STATUSES.ARCHIVED);

  const request = await searchService.composePermissionSafeSearchRequest({
    session,
    filters: {
      libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
      recordTypes: ["note"],
      text: "Needle",
    },
  });
  const result = await searchService.executeSearch(request);
  assert.ok(result.results.some((row) => row.record_id === normal.note.note_id));
  assert.equal(result.results.some((row) => row.record_id === activeWork.note.note_id), false);
  assert.equal(result.results.some((row) => row.record_id === secure.note.note_id), false);
  assert.equal(result.results.some((row) => row.record_id === privateNote.note.note_id), false);

  const browserResult = await apiGet(browserContext.baseUrl, "/api/search?text=Needle&recordType=note&limit=5", {
    cookie: browserContext.sessionId,
  });
  const browserNote = browserResult.body.results.find((row) => row.recordId === normal.note.note_id);

  assert.equal(browserResult.status, 200);
  assert.ok(browserNote, "browser search should return the matching note");
  assert.equal(browserNote.target.url, `notes.html?note=${encodeURIComponent(normal.note.note_id)}`);
  assert.equal(browserNote.target.actionId, "notes.open");

  const rows = await querySql(`
SELECT library_bucket, record_status, source
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes'
  AND record_type = 'note'
  AND record_id = ${sqlText(normal.note.note_id)};
`);
  assert.deepEqual(rows[0], {
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    record_status: "active",
    source: "Notes",
  });
}

async function assertNotesHelpContribution() {
  const help = modulesService.getModule("notes").help;
  const articleBodies = await Promise.all(help.articles.map(async (article) => {
    const body = article.body || await fs.readFile(path.join("help", ...article.contentPath.split("/")), "utf8");
    return `${article.title}\n${article.summary}\n${body}`;
  }));
  const articleText = articleBodies.join("\n");
  const articlesById = new Map(help.articles.map((article) => [article.id, article]));

  for (const articleId of [
    "notes.basics",
    "notes.library",
    "notes.collections",
    "notes.active-work",
    "notes.ongoing-areas",
    "notes.reference-library",
    "notes.archive",
    "notes.markdown",
    "notes.linking",
    "notes.revisions",
    "notes.secure-notes",
  ]) {
    assert.ok(articlesById.has(articleId), `${articleId} should be declared as a current-state Notes Help page`);
  }

  for (const phrase of [
    "Active Work",
    "Ongoing Areas",
    "Reference Library",
    "Archive",
    "Markdown",
    "Revision history",
    "file attachments",
    "Collections are classification metadata",
    "Links make a note easier to find",
    "supporting context for resumable work",
    "Secure note titles are visible",
    "not zero-knowledge",
  ]) {
    assert.match(articleText, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(articleText, /knowledge base publishing|publish to knowledge base|create knowledge base/i, "Help should not describe future KB publishing as current behavior");
  assert.doesNotMatch(articleText, /\bPARA\b|\bGTD\b|Getting Things Done|second brain|Zettelkasten/i, "Notes Help should use Longtail Forge product language instead of external productivity-method branding");
}

async function assertNotesNotificationContribution(session) {
  const noteId = "notification-note";
  await ensureNotificationActorUser(session);

  const event = {
    name: "note.updated",
    workspace_id: session.workspace_id,
    module_id: "notes",
    record_type: "note",
    record_id: noteId,
    actor_user_id: "another-user",
    new_value: {
      title: "Notification Note",
    },
    metadata: {
      recipient_user_ids: [session.user_id],
      security_mode: NOTE_SECURITY_MODES.NORMAL,
    },
  };
  const summary = summarizeNotificationEvent(event);
  assert.equal(summary.title, "Notification Note");
  assert.equal(summary.url, `notes.html?note=${noteId}`);

  const result = await notificationsService.createFromEvent(event);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].recipient_user_id, session.user_id);
  assert.equal(result.notifications[0].event_type, "note.updated");
  assert.doesNotMatch(result.notifications[0].body, /Hidden secure search body|Needle body/);
}

async function ensureNotificationActorUser(session) {
  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  'another-user',
  ${sqlText(session.workspace_id)},
  'another-user@example.test',
  'Another User',
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  ${sqlText(session.workspace_id)}
)
ON CONFLICT(user_id) DO UPDATE SET
  home_workspace_id = excluded.home_workspace_id,
  username = excluded.username,
  display_name = excluded.display_name,
  active_workspace_id = excluded.active_workspace_id,
  user_status = excluded.user_status;
`);
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
  };
}

async function apiGet(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: options.cookie ? { Cookie: `longtail_forge_session=${options.cookie}` } : {},
  });
  const body = await response.json().catch(() => ({}));

  return {
    body,
    status: response.status,
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
    nextServer.on("error", reject);
  });
}
