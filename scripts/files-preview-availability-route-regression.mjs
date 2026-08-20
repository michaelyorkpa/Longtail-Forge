/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} PreviewClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every descriptor read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} PreviewResponse
 */

/** @typedef {{ get: (url: string, options?: PreviewClientOptions) => Promise<PreviewResponse> }} PreviewApiClient */

/** The preview route publishes the descriptor envelope the Files service builds. */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["readAttachmentPreviewDescriptor"]>>} PreviewDescriptorEnvelope */


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-preview-availability-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-preview-availability.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Preview-Availability-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

/** @type {string[]} */
const results = [];
let server;

try {
  await assertPreviewSourceBoundary();
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  await checkAsync("preview descriptors are attachment-scoped and readable attachments can be previewable", async () => {
    const allowed = await api.get(`/api/files/attachments/${fixtures.attachments.allowed}/preview`, {
      cookie: fixtures.scopedSessionId,
    });

    assert.equal(allowed.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const allowedPreview = readPayload(allowed, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(allowedPreview.preview.fileAttachmentId, fixtures.attachments.allowed);
    assert.equal(allowedPreview.preview.fileId, fixtures.files.shared);
    assert.equal(allowedPreview.preview.targetId, fixtures.tasks.alpha);
    assert.equal(allowedPreview.preview.state, "previewable");
    assert.equal(allowedPreview.preview.kind, "text");
    assert.equal(allowedPreview.preview.fileName, "shared-alpha.txt");
    assert.equal(allowedPreview.preview.fileType, "TXT");
    assert.equal(allowedPreview.preview.contentAvailable, true);
    assert.equal(allowedPreview.preview.contentUrl, `/api/files/attachments/${fixtures.attachments.allowed}/preview/content`);
    assertNoUnsafeStorageLeak([allowed.body]);

    const blocked = await api.get(`/api/files/attachments/${fixtures.attachments.blockedSameFile}/preview`, {
      cookie: fixtures.scopedSessionId,
    });
    assert.equal(blocked.status, 403);
    assertNoUnsafeStorageLeak([blocked.body]);

    const adminAllowed = await api.get(`/api/files/attachments/${fixtures.attachments.blockedSameFile}/preview`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(adminAllowed.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const adminAllowedPreview = readPayload(adminAllowed, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(adminAllowedPreview.preview.fileAttachmentId, fixtures.attachments.blockedSameFile);
    assert.equal(adminAllowedPreview.preview.fileId, fixtures.files.shared);
    assert.equal(adminAllowedPreview.preview.targetId, fixtures.tasks.beta);
    assert.equal(adminAllowedPreview.preview.contentAvailable, true);
    assert.equal(adminAllowedPreview.preview.contentUrl, `/api/files/attachments/${fixtures.attachments.blockedSameFile}/preview/content`);
  });

  await checkAsync("readable attachments without Files download permission return a safe unauthorized descriptor", async () => {
    const response = await api.get(`/api/files/attachments/${fixtures.attachments.allowed}/preview`, {
      cookie: fixtures.noDownloadSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const responsePreview = readPayload(response, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(responsePreview.preview.state, "unauthorized");
    assert.equal(responsePreview.preview.kind, "text");
    assert.equal(responsePreview.preview.reason, "files_download_permission_required");
    assert.equal(responsePreview.preview.contentAvailable, false);
    assertNoUnsafeStorageLeak([response.body]);
  });

  await checkAsync("unsupported available files return download-only descriptors", async () => {
    const response = await api.get(`/api/files/attachments/${fixtures.attachments.unsupported}/preview`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const responsePreview = readPayload(response, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(responsePreview.preview.state, "download_only");
    assert.equal(responsePreview.preview.kind, "unsupported");
    assert.equal(responsePreview.preview.reason, "unsupported_file_type");
    assert.equal(responsePreview.preview.fileType, "PDF");
    assert.equal(Object.hasOwn(responsePreview.preview, "contentUrl"), false);
    assertNoUnsafeStorageLeak([response.body]);
  });

  await checkAsync("deleted pending and failed-scan files are unavailable", async () => {
    /** @type {Array<[keyof typeof fixtures.attachments, RegExp]>} */
    const unavailableCases = [
      ["deleted", /file_deleted/],
      ["pending", /file_pending/],
      ["failedScan", /scan_failed/],
    ];
    for (const [key, reasonPattern] of unavailableCases) {
      const response = await api.get(`/api/files/attachments/${fixtures.attachments[key]}/preview`, {
        cookie: fixtures.adminSessionId,
      });

      assert.equal(response.status, 200, key);
      /** @type {PreviewDescriptorEnvelope} */
      const responsePreview = readPayload(response, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
      assert.equal(responsePreview.preview.state, "unavailable", key);
      assert.match(responsePreview.preview.reason, reasonPattern, key);
      assert.equal(responsePreview.preview.contentAvailable, false, key);
      assertNoUnsafeStorageLeak([response.body]);
    }
  });

  await checkAsync("in-review passed files are previewable only for file reviewers", async () => {
    const adminPreview = await api.get(`/api/files/attachments/${fixtures.attachments.quarantined}/preview`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(adminPreview.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const adminPreviewPreview = readPayload(adminPreview, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(adminPreviewPreview.preview.state, "previewable");
    assert.equal(adminPreviewPreview.preview.reason, "");
    assert.equal(adminPreviewPreview.preview.contentAvailable, true);
    assert.equal(adminPreviewPreview.preview.contentUrl, `/api/files/attachments/${fixtures.attachments.quarantined}/preview/content`);
    assertNoUnsafeStorageLeak([adminPreview.body]);

    const nonReviewerPreview = await api.get(`/api/files/attachments/${fixtures.attachments.quarantined}/preview`, {
      cookie: fixtures.scopedSessionId,
    });

    assert.equal(nonReviewerPreview.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const nonReviewerPreviewPreview = readPayload(nonReviewerPreview, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(nonReviewerPreviewPreview.preview.state, "unavailable");
    assert.match(nonReviewerPreviewPreview.preview.reason, /file_quarantined/);
    assert.equal(nonReviewerPreviewPreview.preview.contentAvailable, false);
    assertNoUnsafeStorageLeak([nonReviewerPreview.body]);
  });

  await checkAsync("oversized text and markdown files are not marked previewable", async () => {
    const response = await api.get(`/api/files/attachments/${fixtures.attachments.largeText}/preview`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const responsePreview = readPayload(response, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(responsePreview.preview.state, "too_large_for_preview");
    assert.equal(responsePreview.preview.kind, "text");
    assert.equal(responsePreview.preview.reason, "too_large_for_preview");
    assertNoUnsafeStorageLeak([response.body]);
  });

  await checkAsync("preview descriptors do not record audit or lifecycle preview events in this descriptor-only slice", async () => {
    const rows = await querySql(`
SELECT action
FROM audit_logs
WHERE action LIKE 'file.preview%';
`);

    assert.deepEqual(rows, []);
  });

  await assertIntegrity();
  console.log(`Files preview availability route regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }
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
  /** @type {{ active_workspace_id: string, display_name: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(users, "protected admin");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const now = new Date().toISOString();
  const alphaClientId = randomUUID();
  const betaClientId = randomUUID();
  const alphaProjectId = randomUUID();
  const betaProjectId = randomUUID();
  const scopedUserId = randomUUID();
  const noDownloadUserId = randomUUID();
  const tasks = {
    alpha: randomUUID(),
    beta: randomUUID(),
  };
  const files = {
    deleted: randomUUID(),
    failedScan: randomUUID(),
    largeText: randomUUID(),
    pending: randomUUID(),
    quarantined: randomUUID(),
    shared: randomUUID(),
    unsupported: randomUUID(),
  };
  const attachments = {
    allowed: randomUUID(),
    blockedSameFile: randomUUID(),
    deleted: randomUUID(),
    failedScan: randomUUID(),
    largeText: randomUUID(),
    pending: randomUUID(),
    quarantined: randomUUID(),
    unsupported: randomUUID(),
  };

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(workspaceId)};

INSERT INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES ('preview_reader', 'Preview Reader', 'Can read attachment targets but cannot download files.', 'project', 9999);

INSERT INTO role_permissions (role_id, permission_id)
VALUES
  ('preview_reader', 'tasks.view'),
  ('preview_reader', 'files.view');

${insertClientSql(workspaceId, alphaClientId, "Preview Alpha Client", now)}
${insertClientSql(workspaceId, betaClientId, "Preview Beta Client", now)}
${insertProjectSql(workspaceId, alphaProjectId, alphaClientId, "Preview Alpha Project", now)}
${insertProjectSql(workspaceId, betaProjectId, betaClientId, "Preview Beta Project", now)}
${insertTaskSql(workspaceId, tasks.alpha, alphaClientId, alphaProjectId, "Preview Alpha Task", admin.user_id, now)}
${insertTaskSql(workspaceId, tasks.beta, betaClientId, betaProjectId, "Preview Beta Task", admin.user_id, now)}
${insertUserSql(workspaceId, scopedUserId, "files-preview-project-user@example.test", "Files Preview Project User")}
${insertUserSql(workspaceId, noDownloadUserId, "files-preview-no-download@example.test", "Files Preview No Download User")}
${insertMembershipSql(workspaceId, scopedUserId, now)}
${insertMembershipSql(workspaceId, noDownloadUserId, now)}
${insertAssignmentSql(workspaceId, scopedUserId, "project_user", "project", alphaProjectId, now)}
${insertAssignmentSql(workspaceId, noDownloadUserId, "preview_reader", "project", alphaProjectId, now)}
${insertFileSql(workspaceId, files.shared, "shared-alpha.txt", ".txt", "text/plain", "available", "passed", 24, admin.user_id, now)}
${insertFileSql(workspaceId, files.unsupported, "unsupported-preview.pdf", ".pdf", "application/pdf", "available", "passed", 1200, admin.user_id, now)}
${insertFileSql(workspaceId, files.deleted, "deleted-preview.txt", ".txt", "text/plain", "deleted", "passed", 20, admin.user_id, now)}
${insertFileSql(workspaceId, files.quarantined, "quarantined-preview.txt", ".txt", "text/plain", "quarantined", "passed", 20, admin.user_id, now)}
${insertFileSql(workspaceId, files.pending, "pending-preview.txt", ".txt", "text/plain", "pending", "pending", 20, admin.user_id, now)}
${insertFileSql(workspaceId, files.failedScan, "failed-scan-preview.txt", ".txt", "text/plain", "available", "failed", 20, admin.user_id, now)}
${insertFileSql(workspaceId, files.largeText, "large-preview.txt", ".txt", "text/plain", "available", "passed", 600000, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.allowed, files.shared, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.blockedSameFile, files.shared, tasks.beta, betaClientId, betaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.unsupported, files.unsupported, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.deleted, files.deleted, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.quarantined, files.quarantined, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.pending, files.pending, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.failedScan, files.failedScan, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
${insertAttachmentSql(workspaceId, attachments.largeText, files.largeText, tasks.alpha, alphaClientId, alphaProjectId, admin.user_id, now)}
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const scopedSession = await createSession({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: scopedUserId,
    username: "files-preview-project-user@example.test",
  });
  const noDownloadSession = await createSession({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: noDownloadUserId,
    username: "files-preview-no-download@example.test",
  });

  return {
    adminSessionId: adminSession.sessionId,
    attachments,
    files,
    noDownloadSessionId: noDownloadSession.sessionId,
    scopedSessionId: scopedSession.sessionId,
    tasks,
    workspaceId,
  };
}

/** @param {string} workspaceId @param {string} clientId @param {string} name @param {string} now */
function insertClientSql(workspaceId, clientId, name, now) {
  return `
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
VALUES (
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  NULL,
  ${sqlText(name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

/** @param {string} workspaceId @param {string} projectId @param {string} clientId @param {string} name @param {string} now */
function insertProjectSql(workspaceId, projectId, clientId, name, now) {
  return `
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
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  ${sqlText(name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

/** @param {string} workspaceId @param {string} taskId @param {string | null} clientId @param {string | null} projectId @param {string} title @param {string} userId @param {string} now */
function insertTaskSql(workspaceId, taskId, clientId, projectId, title, userId, now) {
  return `
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
  ${sqlText(taskId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  ${sqlText(title)},
  '',
  'open',
  'normal',
  ${sqlText(userId)},
  ${sqlText(userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

/** @param {string} workspaceId @param {string} userId @param {string} username @param {string} displayName */
function insertUserSql(workspaceId, userId, username, displayName) {
  return `
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
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  ${sqlText(displayName)},
  'America/New_York',
  '',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
`;
}

/** @param {string} workspaceId @param {string} userId @param {string} now */
function insertMembershipSql(workspaceId, userId, now) {
  return `
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});
`;
}

/** @param {string} workspaceId @param {string} userId @param {string} roleId @param {string} scopeType @param {string} scopeId @param {string} now */
function insertAssignmentSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  const clientId = scopeType === "client" ? scopeId : null;
  const projectId = scopeType === "project" ? scopeId : null;

  return `
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
  ${sqlText(userId)},
  ${sqlText(roleId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  ${clientId ? sqlText(clientId) : "NULL"},
  ${projectId ? sqlText(projectId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

/** @param {string} workspaceId @param {string} fileId @param {string} filename @param {string} extension @param {string} mimeType @param {string} status @param {string} scanStatus @param {number} size @param {string} uploadedByUserId @param {string} now */
function insertFileSql(workspaceId, fileId, filename, extension, mimeType, status, scanStatus, size, uploadedByUserId, now) {
  return `
INSERT INTO files (
  file_id,
  workspace_id,
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  mime_type_claimed,
  mime_type_detected,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  quarantine_reason,
  uploaded_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(fileId)},
  ${sqlText(workspaceId)},
  'local',
  ${sqlText(`unsafe-storage-key/${fileId}/${filename}`)},
  ${sqlText(filename)},
  ${sqlText(filename)},
  ${sqlText(filename)},
  ${sqlText(extension)},
  ${sqlText(mimeType)},
  ${sqlText(mimeType)},
  ${size},
  ${sqlText(`unsafe-sha256-${fileId}`)},
  ${sqlText(status)},
  ${sqlText(scanStatus)},
  ${status === "quarantined" ? sqlText("unsafe quarantine detail") : "NULL"},
  ${sqlText(uploadedByUserId)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${status === "deleted" ? sqlText(now) : "NULL"},
  ${sqlText(JSON.stringify({ storagePath: `C:\\unsafe\\${filename}` }))}
);
`;
}

/** @param {string} workspaceId @param {string} attachmentId @param {string} fileId @param {string} targetId @param {string | null} clientId @param {string | null} projectId @param {string} attachedByUserId @param {string} now */
function insertAttachmentSql(workspaceId, attachmentId, fileId, targetId, clientId, projectId, attachedByUserId, now) {
  return `
INSERT INTO file_attachments (
  file_attachment_id,
  workspace_id,
  file_id,
  module_id,
  target_type,
  target_id,
  client_id,
  project_id,
  visibility,
  attachment_role,
  caption,
  sort_order,
  attached_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(attachmentId)},
  ${sqlText(workspaceId)},
  ${sqlText(fileId)},
  'tasks',
  'task',
  ${sqlText(targetId)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  'private',
  NULL,
  NULL,
  0,
  ${sqlText(attachedByUserId)},
  ${sqlText(now)},
  NULL,
  ${sqlText(JSON.stringify({ storagePath: "C:\\unsafe\\attachment" }))}
);
`;
}

/** @param {string} baseUrl @returns {PreviewApiClient} */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {PreviewClientOptions} [options]
 * @returns {Promise<PreviewResponse>}
 */
async function request(baseUrl, method, url, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
    text,
  };
}

/** @param {unknown[]} values */
function assertNoUnsafeStorageLeak(values) {
  const text = JSON.stringify(values);

  [
    "C:\\unsafe",
    "unsafe-sha256",
    "unsafe-storage-key",
    "quarantine detail",
    "sha256",
    "storageKey",
    "storageProvider",
    "storage_key",
    "storage_path",
    "storagePath",
  ].forEach((pattern) => {
    assert.equal(text.includes(pattern), false, `Preview response should not expose ${pattern}`);
  });
}

function assertPreviewSourceBoundary() {
  const serviceSource = path.join(process.cwd(), "src/services/files.service.js");
  return fs.readFile(serviceSource, "utf8").then((source) => {
    const block = functionBlock(source, "readAttachmentPreviewDescriptor");

    assert.doesNotMatch(block, /recordFileAudit|emitFileLifecycleEvent|getFileStorageAdapter|\.read\(/, "Preview descriptor route should not read storage, audit, or emit lifecycle events");
  });
}

/** @param {string} source @param {string} name */
function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `${name} should have a function body`);
  let depth = 0;

  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${name} body should close`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

/** @param {string} name @param {() => Promise<void>} assertion */
async function checkAsync(name, assertion) {
  await assertion();
  results.push(name);
}

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {HttpFixtureServer} nextServer @returns {Promise<void>} */
function closeServer(nextServer) {
  return new Promise((resolve, reject) => {
    nextServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}
