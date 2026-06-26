/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-attachment-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-attachment-context.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Attachment-Context-Test-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

const results = [];
const capturedFileEvents = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  internalEventBus.reset();
  registerFileEventCapture();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl);

  await checkAsync("Business context update derives Client and Project from the selected target", async () => {
    const upload = await api.post("/api/files", uploadPayload(fixtures.businessTaskId), {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(upload.status, 201);
    assert.equal(upload.body.attachment.clientId, fixtures.clientId);
    assert.equal(upload.body.attachment.projectId, fixtures.projectId);

    const originalFile = await readFileStorageFields(upload.body.file.fileId);
    const update = await api.patch(`/api/files/attachments/${upload.body.attachment.fileAttachmentId}/context`, {
      clientId: fixtures.nextClientId,
      moduleId: "tasks",
      projectId: fixtures.nextProjectId,
      targetId: fixtures.nextBusinessTaskId,
      targetType: "task",
    }, { cookie: fixtures.adminSessionId });
    assert.equal(update.status, 200);
    assert.equal(update.body.attachment.targetId, fixtures.nextBusinessTaskId);
    assert.equal(update.body.attachment.clientId, fixtures.nextClientId);
    assert.equal(update.body.attachment.projectId, fixtures.nextProjectId);

    const updatedFile = await readFileStorageFields(upload.body.file.fileId);
    assert.deepEqual(updatedFile, originalFile);

    const attachmentRows = await querySql(`
SELECT module_id, target_type, target_id, client_id, project_id
FROM file_attachments
WHERE file_attachment_id = ${sqlText(upload.body.attachment.fileAttachmentId)};
`);
    assert.deepEqual(attachmentRows[0], {
      client_id: fixtures.nextClientId,
      module_id: "tasks",
      project_id: fixtures.nextProjectId,
      target_id: fixtures.nextBusinessTaskId,
      target_type: "task",
    });

    const contextEvents = capturedFileEvents.filter((event) => (
      event.name === "file.attachment.context_updated" &&
      event.metadata?.attachment_id === upload.body.attachment.fileAttachmentId
    ));
    assert.equal(contextEvents.length, 2);
    assert.deepEqual(contextEvents.map((event) => event.metadata.context_scope).sort(), ["next", "previous"]);
    assert.ok(contextEvents.every((event) => event.metadata.context_update === true));
    assert.ok(contextEvents.every((event) => event.metadata.previous_target_id === fixtures.businessTaskId));
    assert.ok(contextEvents.every((event) => event.metadata.next_target_id === fixtures.nextBusinessTaskId));
    assertNoUnsafeStorageLeak(contextEvents.map((event) => event.metadata));

    const auditRows = await querySql(`
SELECT action, metadata_json
FROM audit_logs
WHERE action = 'file.attachment_context_updated'
  AND record_id = ${sqlText(upload.body.attachment.fileAttachmentId)}
ORDER BY created_at DESC
LIMIT 1;
`);
    assert.equal(auditRows.length, 1);
    const auditMetadata = JSON.parse(auditRows[0].metadata_json || "{}");
    assert.equal(auditMetadata.previous_context.target_id, fixtures.businessTaskId);
    assert.equal(auditMetadata.next_context.target_id, fixtures.nextBusinessTaskId);
    assertNoUnsafeStorageLeak([auditMetadata, auditMetadata.previous_context, auditMetadata.next_context]);

    fixtures.updatedBusinessAttachmentId = upload.body.attachment.fileAttachmentId;
    fixtures.updatedBusinessFileId = upload.body.file.fileId;
  });

  await checkAsync("Personal and Family-style updates keep Client data empty", async () => {
    await runSql(`
UPDATE workspaces
SET workspace_type = 'family'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)};
`);

    const upload = await api.post("/api/files", uploadPayload(fixtures.familyTaskId, {
      originalFilename: "family-context.txt",
      text: "family context update",
    }), { cookie: fixtures.adminSessionId });
    assert.equal(upload.status, 201);
    assert.equal(upload.body.attachment.clientId, "");
    assert.equal(upload.body.attachment.projectId, "");

    const update = await api.patch(`/api/files/attachments/${upload.body.attachment.fileAttachmentId}/context`, {
      moduleId: "tasks",
      targetId: fixtures.nextFamilyTaskId,
      targetType: "task",
    }, { cookie: fixtures.adminSessionId });
    assert.equal(update.status, 200);
    assert.equal(update.body.attachment.targetId, fixtures.nextFamilyTaskId);
    assert.equal(update.body.attachment.clientId, "");
    assert.equal(update.body.attachment.projectId, "");

    await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)};
`);
  });

  await checkAsync("old-context remove permission is required before updating an attachment", async () => {
    const upload = await api.post("/api/files", uploadPayload(fixtures.permissionTaskId, {
      originalFilename: "permission-context.txt",
      text: "permission context update",
    }), { cookie: fixtures.adminSessionId });
    assert.equal(upload.status, 201);

    const denied = await api.patch(`/api/files/attachments/${upload.body.attachment.fileAttachmentId}/context`, {
      moduleId: "tasks",
      targetId: fixtures.permissionNextTaskId,
      targetType: "task",
    }, { cookie: fixtures.clientUserSessionId });
    assert.equal(denied.status, 403);
  });

  await checkAsync("new targets must be visible and belong to the current workspace", async () => {
    const update = await api.patch(`/api/files/attachments/${fixtures.updatedBusinessAttachmentId}/context`, {
      moduleId: "tasks",
      targetId: fixtures.otherWorkspaceTaskId,
      targetType: "task",
    }, { cookie: fixtures.adminSessionId });

    assert.equal(update.status, 404);
  });

  await checkAsync("Client and Project selectors cannot override target-derived context", async () => {
    const update = await api.patch(`/api/files/attachments/${fixtures.updatedBusinessAttachmentId}/context`, {
      clientId: fixtures.clientId,
      moduleId: "tasks",
      projectId: fixtures.projectId,
      targetId: fixtures.nextBusinessTaskId,
      targetType: "task",
    }, { cookie: fixtures.adminSessionId });

    assert.equal(update.status, 400);
    assert.match(JSON.stringify(update.body), /Selected Client|Selected Project/);
  });

  await checkAsync("unsupported and secure-note targets are rejected without storage leakage", async () => {
    const unsupported = await api.patch(`/api/files/attachments/${fixtures.updatedBusinessAttachmentId}/context`, {
      moduleId: "unknown-module",
      targetId: fixtures.nextBusinessTaskId,
      targetType: "mystery",
    }, { cookie: fixtures.adminSessionId });
    assert.equal(unsupported.status, 400);

    const secureNote = await api.patch(`/api/files/attachments/${fixtures.updatedBusinessAttachmentId}/context`, {
      moduleId: "notes",
      targetId: fixtures.secureNoteId,
      targetType: "note",
    }, { cookie: fixtures.adminSessionId });
    assert.ok([403, 423].includes(secureNote.status), "secure-note targets should be rejected");
    assertNoUnsafeStorageLeak([unsupported.body, secureNote.body]);
  });

  await checkAsync("duplicate active attachment contexts are rejected", async () => {
    const first = await api.post("/api/files", uploadPayload(fixtures.duplicateTaskId, {
      originalFilename: "duplicate-context.txt",
      text: "duplicate context update",
    }), { cookie: fixtures.adminSessionId });
    assert.equal(first.status, 201);

    const second = await api.post("/api/files/attachments", {
      fileId: first.body.file.fileId,
      moduleId: "tasks",
      targetId: fixtures.duplicateNextTaskId,
      targetType: "task",
      visibility: "private",
    }, { cookie: fixtures.adminSessionId });
    assert.equal(second.status, 201);
    assert.equal(second.body.file.fileId, first.body.file.fileId);

    const duplicate = await api.patch(`/api/files/attachments/${second.body.attachment.fileAttachmentId}/context`, {
      moduleId: "tasks",
      targetId: fixtures.duplicateTaskId,
      targetType: "task",
    }, { cookie: fixtures.adminSessionId });
    assert.equal(duplicate.status, 409);
  });

  await assertIntegrity();
  console.log(`Files attachment context route regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const users = await querySql(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const admin = users[0];
  assert.ok(admin, "protected admin should exist");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const nextClientId = randomUUID();
  const projectId = randomUUID();
  const nextProjectId = randomUUID();
  const businessTaskId = randomUUID();
  const nextBusinessTaskId = randomUUID();
  const familyTaskId = randomUUID();
  const nextFamilyTaskId = randomUUID();
  const permissionTaskId = randomUUID();
  const permissionNextTaskId = randomUUID();
  const duplicateTaskId = randomUUID();
  const duplicateNextTaskId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const otherWorkspaceTaskId = randomUUID();
  const clientUserId = randomUUID();
  const secureNoteId = randomUUID();

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(workspaceId)};

INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES
  (${sqlText(clientId)}, ${sqlText(workspaceId)}, NULL, 'Original Context Client', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(nextClientId)}, ${sqlText(workspaceId)}, NULL, 'Next Context Client', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
VALUES
  (${sqlText(projectId)}, ${sqlText(workspaceId)}, ${sqlText(clientId)}, NULL, 'Original Context Project', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(nextProjectId)}, ${sqlText(workspaceId)}, ${sqlText(nextClientId)}, NULL, 'Next Context Project', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)});

INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES
  (${sqlText(businessTaskId)}, ${sqlText(workspaceId)}, ${sqlText(clientId)}, ${sqlText(projectId)}, 'Original Business File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(nextBusinessTaskId)}, ${sqlText(workspaceId)}, ${sqlText(nextClientId)}, ${sqlText(nextProjectId)}, 'Next Business File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(familyTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Family File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(nextFamilyTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Next Family File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(permissionTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Permission File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(permissionNextTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Permission Next File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(duplicateTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Duplicate File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(duplicateNextTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'Duplicate Next File Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)});

INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  metadata_json
)
VALUES (
  ${sqlText(secureNoteId)},
  ${sqlText(workspaceId)},
  'Secure File Attachment Target',
  NULL,
  '',
  '',
  '',
  'general',
  'reference',
  'manual',
  'active',
  'private',
  'secure',
  ${sqlText(admin.user_id)},
  ${sqlText(admin.user_id)},
  ${sqlText(admin.user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  '{}'
);

INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(clientUserId)},
  ${sqlText(workspaceId)},
  'files-context-client-user@example.test',
  'Files Context Client User',
  'America/New_York',
  '',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(clientUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(clientUserId)},
  'client_user',
  'all',
  'all',
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(otherWorkspaceId)}, 'Other Attachment Context Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(otherWorkspaceTaskId)},
  ${sqlText(otherWorkspaceId)},
  NULL,
  NULL,
  'Other Workspace File Task',
  '',
  'open',
  'normal',
  ${sqlText(admin.user_id)},
  ${sqlText(admin.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const clientUserSession = await createSession({
    active_workspace_id: workspaceId,
    display_name: "Files Context Client User",
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: clientUserId,
    username: "files-context-client-user@example.test",
  });

  return {
    adminSessionId: adminSession.sessionId,
    businessTaskId,
    clientId,
    clientUserSessionId: clientUserSession.sessionId,
    duplicateNextTaskId,
    duplicateTaskId,
    familyTaskId,
    nextBusinessTaskId,
    nextClientId,
    nextFamilyTaskId,
    nextProjectId,
    otherWorkspaceTaskId,
    permissionNextTaskId,
    permissionTaskId,
    projectId,
    secureNoteId,
    workspaceId,
  };
}

function uploadPayload(taskId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "attachment context update").toString("base64"),
    displayName: options.displayName || options.originalFilename || "Attachment Context Evidence",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "attachment-context.txt",
    targetId: taskId,
    targetType: "task",
    visibility: "private",
  };
}

function registerFileEventCapture() {
  internalEventBus.on("file.attachment.context_updated", async (event) => {
    capturedFileEvents.push(event);
  }, {
    id: "files-attachment-context:context-updated",
    moduleId: "test",
  });
}

async function readFileStorageFields(fileId) {
  const rows = await querySql(`
SELECT
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  uploaded_by_user_id
FROM files
WHERE file_id = ${sqlText(fileId)}
LIMIT 1;
`);
  assert.equal(rows.length, 1);
  return rows[0];
}

function assertNoUnsafeStorageLeak(values) {
  const text = JSON.stringify(values);
  assert.doesNotMatch(text, /storage_key/i);
  assert.doesNotMatch(text, /storageKey/i);
  assert.doesNotMatch(text, /storage_path/i);
  assert.doesNotMatch(text, /storagePath/i);
  assert.doesNotMatch(text, /sha256/i);
  assert.doesNotMatch(text, /scanner/i);
  assert.doesNotMatch(text, /protected[\\/]/i);
}

function createApi(baseUrl) {
  return {
    patch: (url, body, options = {}) => request(baseUrl, "PATCH", url, body, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
  };
}

async function request(baseUrl, method, url, body, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = null;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
    text,
  };
}

async function listen(app) {
  const serverInstance = http.createServer(app);
  await new Promise((resolve) => {
    serverInstance.listen(0, "127.0.0.1", resolve);
  });
  return serverInstance;
}

async function closeServer(serverInstance) {
  await new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function checkAsync(name, fn) {
  await fn();
  results.push(name);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0].integrity_check, "ok");
}
