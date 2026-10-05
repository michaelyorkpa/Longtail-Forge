export const regressionMeta = Object.freeze({
  id: "notes.secure-catalog-consumer-enforcement",
  area: "notes",
  tier: "focused",
  tags: ["api", "encryption", "exports", "files", "notifications", "permissions", "search", "security", "workspace"],
  description: "Proves the declared fail-closed effective-security policy across Notes consumers and the future Support View boundary.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "../../test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} SecureSession */
/** @typedef {import("../../../src/types/framework-contracts.js").InternalEvent} InternalEvent */

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-secure-catalog-consumers-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "secure-catalog-consumers.db");
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "consumer-policy-test-v1";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "Secure-Catalog-Consumer-Regression-Key-2026!";
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Secure-Catalog-Consumers-Test-123!";

const sources = await readSources([
  "src/modules/notes/consumer-policy.js",
  "src/modules/notes/module.integrations.js",
  "src/modules/notes/notes.service.js",
  "src/modules/notes/public-api.service.js",
  "src/modules/notes/search-indexers.js",
  "src/services/files.service.js",
  "src/services/notifications.service.js",
  "src/services/work-resume-state-initial-producers.js",
  "src/services/workbench-task-focus-related-context.service.js",
]);
const externalNotesConsumers = await readExternalNotesConsumers();

const { internalEventBus } = await import("../../../src/core/events/event-bus.js");
const { validateModuleManifest } = await import("../../../src/core/modules/manifest-contract.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const {
  NOTES_PROTECTED_CONTENT_CONSUMERS,
  assertNoteConsumerAccess,
  readNoteConsumerPolicy,
} = await import("../../../src/modules/notes/consumer-policy.js");
const { notesModule } = await import("../../../src/modules/notes/module.js");
const { notesPublicApiService } = await import("../../../src/modules/notes/public-api.service.js");
const { noteToSearchDocument } = await import("../../../src/modules/notes/search-indexers.js");
const { notesRepository } = await import("../../../src/modules/notes/notes.repo.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");
const { filesService } = await import("../../../src/services/files.service.js");
const { notificationsService } = await import("../../../src/services/notifications.service.js");

let unsubscribe = null;
try {
  assertSourceAndManifestGuardrail();
  await initializeDatabase();
  const session = await readProtectedSession();
  /** @type {InternalEvent[]} */
  const events = [];
  unsubscribe = internalEventBus.on("note.created", (event) => events.push(event), {
    id: "regression:secure-catalog-consumer-event",
    moduleId: "regression",
  });
  await assertConsumerEnforcement(session, events);
  const integrity = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
  console.log("Secure catalog consumer-enforcement regression passed.");
} finally {
  unsubscribe?.();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertSourceAndManifestGuardrail() {
  assert.deepEqual(
    NOTES_PROTECTED_CONTENT_CONSUMERS.map(({ id, behavior }) => [id, behavior]),
    [
      ["notes.workspace", "authorize"],
      ["notes.revisions", "authorize"],
      ["notes.relationships", "authorize"],
      ["notes.attachments", "exclude"],
      ["notes.activity", "exclude"],
      ["notes.notifications", "exclude"],
      ["notes.search", "exclude"],
      ["notes.resume", "exclude"],
      ["notes.workbench", "exclude"],
      ["notes.public-api", "exclude"],
      ["notes.exports", "exclude"],
      ["notes.provider-catalogs", "exclude"],
      ["notes.support-view", "exclude"],
    ],
  );
  assert.deepEqual(validateModuleManifest(notesModule), []);
  const invalid = validateModuleManifest({
    ...notesModule,
    protectedContentConsumers: [{
      ...NOTES_PROTECTED_CONTENT_CONSUMERS[0],
      behavior: "sometimes",
    }],
  });
  assert.match(invalid.join("\n"), /behavior must be 'authorize' or 'exclude'/);
  assert.throws(() => readNoteConsumerPolicy("notes.undeclared-consumer"), /is not declared/);

  assert.match(sources["src/modules/notes/module.integrations.js"], /protectedContentConsumers: NOTES_PROTECTED_CONTENT_CONSUMERS/);
  assert.match(sources["src/modules/notes/public-api.service.js"], /notes\.public-api/);
  assert.match(sources["src/modules/notes/search-indexers.js"], /notes\.search/);
  assert.match(sources["src/modules/notes/notes.service.js"], /notes\.attachments[\s\S]*notes\.resume[\s\S]*suppress_activity/);
  assert.match(sources["src/services/notifications.service.js"], /notes\.notifications/);
  assert.match(sources["src/services/notifications.service.js"], /Protected or unavailable note/);
  assert.match(sources["src/services/workbench-task-focus-related-context.service.js"], /notes\.workbench/);
  assert.doesNotMatch(sources["src/services/files.service.js"], /security_mode\s*===\s*NOTE_SECURITY_MODES\.SECURE/);

  assert.deepEqual([...externalNotesConsumers.keys()].sort(), [
    "src/modules/lists/lists.service.js",
    "src/modules/tasks/task-recurrence.service.js",
    "src/modules/tasks/tasks.service.js",
    "src/services/files.service.js",
    "src/services/notifications.service.js",
    "src/services/work-resume-state-initial-producers.js",
    "src/services/workbench-task-focus-related-context.service.js",
  ]);
  for (const [relativePath, source] of externalNotesConsumers) {
    assert.doesNotMatch(source, /notesRepository/, `${relativePath} must not bypass the Notes service`);
  }
  assert.match(consumerSource(externalNotesConsumers, "src/modules/lists/lists.service.js"), /notes\.provider-catalogs/);
  assert.match(consumerSource(externalNotesConsumers, "src/services/files.service.js"), /readForAttachmentAccess/);
  assert.match(consumerSource(externalNotesConsumers, "src/services/notifications.service.js"), /notes\.notifications/);
  assert.match(consumerSource(externalNotesConsumers, "src/services/work-resume-state-initial-producers.js"), /notes\.resume/);
  assert.match(consumerSource(externalNotesConsumers, "src/services/workbench-task-focus-related-context.service.js"), /notes\.workbench/);
}

/** @param {SecureSession} session @param {readonly InternalEvent[]} events */
async function assertConsumerEnforcement(session, events) {
  const catalog = (await notesService.createCollection({
    libraryBucket: "active_work",
    title: "Protected Consumer Catalog",
  }, session)).collection;
  await querySql(`
UPDATE note_library_collections
SET security_policy = 'secure'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_library_collection_id = ${sqlText(catalog.note_library_collection_id)};
`);

  const secretTitle = "Inherited consumer secret title";
  const secretBody = "Inherited consumer secret body";
  const created = (await notesService.create({
    body_markdown: secretBody,
    library_bucket: "active_work",
    note_collection_id: catalog.note_library_collection_id,
    security_mode: "normal",
    title: secretTitle,
  }, session)).note;
  await notesService.update(created.note_id, {
    ...created,
    body_markdown: `${secretBody} updated`,
  }, session);
  const stored = await notesRepository.readById(session.workspace_id, created.note_id);
  assert.ok(stored, "created secure-catalog note should remain readable through the repository");
  assert.equal(stored.security_mode, "normal");
  assert.equal(stored.effective_security_mode, "secure");
  assert.equal(stored.body_markdown, "");
  assert.ok(stored.secure_payload);

  assert.equal((await notesService.read(created.note_id, session)).note.title, secretTitle);
  assert.equal((await notesService.listRevisions(created.note_id, session)).revisions.length, 2);
  assert.equal(await noteToSearchDocument(stored), null);
  /** @type {import("../../../src/types/http-contracts.js").ApiSession} */
  const apiSession = { ...session, api_key_id: "secure-catalog-consumer-enforcement-key" };
  assert.deepEqual((await notesPublicApiService.listNotes(apiSession)).data, []);
  await assert.rejects(
    notesPublicApiService.readNote(apiSession, created.note_id),
    (error) => rejectionStatus(error) === 404 && rejectionCode(error) === "protected_note_excluded",
  );
  await assert.rejects(
    filesService.listAttachments(session, {
      moduleId: "notes",
      targetId: created.note_id,
      targetType: "note",
    }),
    (error) => rejectionStatus(error) === 403 && /Secure notes do not allow framework file attachments/.test(rejectionMessage(error)),
  );
  assert.equal((await notesService.listResumeContext(session)).count, 0);
  assert.deepEqual(await notesService.listConsumerSummaries(session, {
    consumerId: "notes.provider-catalogs",
    noteIds: [created.note_id],
  }), []);
  assert.throws(
    () => assertNoteConsumerAccess(stored, "notes.support-view"),
    (error) => rejectionStatus(error) === 404 && rejectionCode(error) === "protected_note_excluded" && rejectionMessage(error) === "Note not found.",
  );
  await assert.rejects(
    notesService.readConsumerSummary(created.note_id, {
      ...session,
      workspace_id: `other-${session.workspace_id}`,
    }, "notes.workspace"),
    (error) => rejectionStatus(error) === 404,
  );

  const secureEvent = events.find((event) => event.record_id === created.note_id);
  assert.ok(secureEvent);
  assert.ok(secureEvent.metadata, "a secure note event should carry suppression metadata");
  assert.equal(secureEvent.metadata.suppress_activity, true);
  assert.equal(secureEvent.metadata.suppress_notifications, true);
  assert.equal(Object.hasOwn(secureEvent.metadata, "title"), false);
  assert.equal(Object.hasOwn(secureEvent.new_value || {}, "title"), false);
  assert.doesNotMatch(JSON.stringify(secureEvent), new RegExp(`${secretTitle}|${secretBody}`));

  const staleNotification = await notificationsService.create({
    body: secretBody,
    eventType: "note.updated",
    moduleId: "notes",
    recipientUserId: session.user_id,
    recordId: created.note_id,
    recordType: "note",
    title: secretTitle,
    url: `notes.html?note=${encodeURIComponent(created.note_id)}`,
    workspaceId: session.workspace_id,
  }, session);
  assert.equal(staleNotification.notification.displayTitle, "Protected or unavailable note");
  assert.equal(staleNotification.notification.title, "Protected or unavailable note");
  assert.equal(staleNotification.notification.body, "");
  assert.deepEqual(staleNotification.notification.metadata, {});
  assert.equal(staleNotification.notification.url, "");

  const auditRows = await querySql(`
SELECT action, record_label, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(created.note_id)}
ORDER BY created_at ASC;
`);
  assert.ok(auditRows.length > 0);
  assert.equal(auditRows[0].record_label, "Secure note");
  assert.doesNotMatch(JSON.stringify(auditRows), new RegExp(`${secretTitle}|${secretBody}|secure_payload|encrypted_data_key`));
}

/** @returns {Promise<SecureSession>} */
async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
JOIN workspaces ON workspaces.owner_user_id = users.user_id
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);
  const user = requireFirstRow(rows, "a protected super admin owning a workspace should exist");
  return workspaceSessionFixture({ ...user, active_workspace_id: user.workspace_id });
}

/** @param {readonly string[]} paths @returns {Promise<Record<string, string>>} */
async function readSources(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async (relativePath) => [
    relativePath,
    await fs.readFile(path.join(root, relativePath), "utf8"),
  ])));
}

/** @returns {Promise<Map<string, string>>} */
async function readExternalNotesConsumers() {
  const files = await listJavaScriptFiles(path.join(root, "src"));
  /** @type {[string, string][]} */
  const entries = [];
  for (const absolutePath of files) {
    const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
    if (relativePath.startsWith("src/modules/notes/")) continue;
    const source = await fs.readFile(absolutePath, "utf8");
    if (/\bnotes(?:Service|Repository)\b/.test(source)) {
      entries.push([relativePath, source]);
    }
  }
  return new Map(entries);
}

/** @param {string} directory @returns {Promise<string[]>} */
async function listJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(entryPath);
  }
  return files;
}

/**
 * Read one external consumer's source, proving the consumer this owner
 * names still exists. A renamed or moved consumer fails here instead of
 * matching a pattern against nothing.
 * @param {Map<string, string>} consumers
 * @param {string} relativePath
 * @returns {string}
 */
function consumerSource(consumers, relativePath) {
  const source = consumers.get(relativePath);
  assert.ok(source, `${relativePath} should still consume the Notes service`);
  return source;
}

/** @param {unknown} value @returns {string} */
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Read a rejected service call's status without assuming the rejection
 * really is an error object first. A refusal without a numeric status
 * resolves to -1 so the predicate fails rather than passing vacuously.
 * @param {unknown} error
 * @returns {number}
 */
function rejectionStatus(error) {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return -1;
  const status = /** @type {{ statusCode: unknown }} */ (error).statusCode;
  return typeof status === "number" ? status : -1;
}

/**
 * Read a rejected service call's error code without assuming a shape.
 * @param {unknown} error
 * @returns {string}
 */
function rejectionCode(error) {
  if (error === null || typeof error !== "object" || !("code" in error)) return "";
  const code = /** @type {{ code: unknown }} */ (error).code;
  return typeof code === "string" ? code : "";
}

/**
 * Read a rejected service call's message as text without assuming a shape.
 * @param {unknown} error
 * @returns {string}
 */
function rejectionMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
