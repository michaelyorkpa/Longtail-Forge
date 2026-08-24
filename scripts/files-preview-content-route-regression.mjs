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
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} PreviewResponse
 */

/** @typedef {{ buffer: Buffer, headers: Headers, status: number, text: string }} PreviewRawResponse */

/**
 * @typedef {{
 *   get: (url: string, options?: PreviewClientOptions) => Promise<PreviewResponse>,
 *   getRaw: (url: string, options?: PreviewClientOptions) => Promise<PreviewRawResponse>,
 *   post: (url: string, body?: unknown, options?: PreviewClientOptions) => Promise<PreviewResponse>,
 * }} PreviewApiClient
 */

/** The preview routes publish the descriptor and content shapes the Files service builds. */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["readAttachmentPreviewDescriptor"]>>} PreviewDescriptorEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["uploadAndAttach"]>>} FileUploadEnvelope */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload produces
 * none, so every read through it here is a claim the route accepted the work.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}

/** The JSON content route answers only the non-streaming branches of the union. */
/** @typedef {import("../src/types/files-preview-contracts.js").FilePreviewTextResponse} PreviewTextEnvelope */
/** @typedef {import("../src/types/files-preview-contracts.js").FilePreviewMarkdownResponse} PreviewMarkdownEnvelope */


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-preview-content-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-preview-content.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Preview-Content-Test-123!";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const TEXT_PREVIEW = "Plain text preview\nwith a second line.";
const MARKDOWN_PREVIEW = [
  "# Preview Heading",
  "",
  "A [safe link](https://example.test) and [bad link](javascript:alert(1)).",
  "",
  "![unsafe image](javascript:alert(1))",
  "![blocked remote image](https://example.test/image.png)",
  "",
  "++Underlined++",
  "",
  "- [x] Done",
  "",
  "<script>alert(1)</script>",
].join("\n");

const { createApp } = await import("../src/core/app.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
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

  const textUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from(TEXT_PREVIEW, "utf8"),
    filename: "preview-text.txt",
    mimeType: "text/plain",
  });
  const markdownUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from(MARKDOWN_PREVIEW, "utf8"),
    filename: "preview-markdown.md",
    mimeType: "text/markdown",
  });
  const imageUpload = await uploadPreviewFile(api, fixtures, {
    bytes: PNG_BYTES,
    filename: "preview-image.png",
    mimeType: "image/png",
  });
  const pdfUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from("%PDF unsupported preview", "utf8"),
    filename: "download-only.pdf",
    mimeType: "application/pdf",
  });
  const largeTextUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from("x".repeat(600000), "utf8"),
    filename: "large-preview.txt",
    mimeType: "text/plain",
  });
  const failedScanUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from("failed scan preview", "utf8"),
    filename: "failed-scan-preview.txt",
    mimeType: "text/plain",
  });
  const reviewUpload = await uploadPreviewFile(api, fixtures, {
    bytes: Buffer.from("in review preview", "utf8"),
    filename: "in-review-preview.txt",
    mimeType: "text/plain",
  });
  await processQueuedJobs();
  await runSql(`
UPDATE files
SET scan_status = 'failed'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND file_id = ${sqlText(requireFile(failedScanUpload, "failed-scan upload").fileId)};
`);
  const quarantineReviewUpload = await api.post(`/api/files/${requireFile(reviewUpload, "quarantine review upload").fileId}/quarantine`, { reason: "manual_quarantine" }, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(quarantineReviewUpload.status, 200);

  await checkAsync("preview descriptors expose content URLs only for previewable files", async () => {
    /** @type {Array<[FileUploadEnvelope, string]>} */
    const previewableUploads = [
      [textUpload, "text"],
      [markdownUpload, "markdown"],
      [imageUpload, "image"],
    ];
    for (const [upload, kind] of previewableUploads) {
      const response = await api.get(`/api/files/attachments/${upload.attachment.fileAttachmentId}/preview`, {
        cookie: fixtures.adminSessionId,
      });

      assert.equal(response.status, 200);
      /** @type {PreviewDescriptorEnvelope} */
      const descriptor = readPayload(response, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
      assert.equal(descriptor.preview.state, "previewable");
      assert.equal(descriptor.preview.kind, kind);
      assert.equal(descriptor.preview.contentAvailable, true);
      assert.equal(descriptor.preview.contentUrl, `/api/files/attachments/${upload.attachment.fileAttachmentId}/preview/content`);
      assertNoUnsafeStorageLeak([response.body]);
    }

    const unsupported = await api.get(`/api/files/attachments/${pdfUpload.attachment.fileAttachmentId}/preview`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(unsupported.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const unsupportedDescriptor = readPayload(unsupported, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(unsupportedDescriptor.preview.state, "download_only");
    assert.equal(unsupportedDescriptor.preview.contentAvailable, false);
    assert.equal(Object.hasOwn(unsupportedDescriptor.preview, "contentUrl"), false);
    assertNoUnsafeStorageLeak([unsupported.body]);
  });

  await checkAsync("image previews stream through authenticated Files routes", async () => {
    const response = await api.getRaw(`/api/files/attachments/${imageUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200, response.text);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    // The streamed preview is rendered in place, so the route must keep
    // forwarding the preview headers rather than the download ones: inline
    // disposition under the sanitized preview filename, and a sandboxed
    // content security policy around whatever the bytes turn out to be.
    assert.equal(response.headers.get("content-disposition"), 'inline; filename="preview-image.png"');
    assert.equal(response.headers.get("content-security-policy"), "sandbox");
    assert.deepEqual(response.buffer, PNG_BYTES);
    assertNoUnsafeStorageLeak([Object.fromEntries(response.headers.entries())]);
  });

  await checkAsync("text previews return capped UTF-8 JSON content", async () => {
    const response = await api.get(`/api/files/attachments/${textUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {PreviewTextEnvelope} */
    const textContent = readPayload(response, ["content", "preview"], "GET /api/files/attachments/:fileAttachmentId/preview/content");
    assert.equal(textContent.preview.kind, "text");
    assert.equal(textContent.preview.state, "previewable");
    assert.equal(textContent.content.kind, "text");
    assert.equal(textContent.content.encoding, "utf-8");
    assert.equal(textContent.content.text, TEXT_PREVIEW);
    assertNoUnsafeStorageLeak([response.body]);
  });

  await checkAsync("markdown previews render through the shared safe Markdown service", async () => {
    const response = await api.get(`/api/files/attachments/${markdownUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {PreviewMarkdownEnvelope} */
    const markdownContent = readPayload(response, ["content", "preview"], "GET /api/files/attachments/:fileAttachmentId/preview/content");
    assert.equal(markdownContent.preview.kind, "markdown");
    assert.equal(markdownContent.content.kind, "markdown");
    assert.equal(markdownContent.content.bodyFormat, "markdown");
    assert.equal(markdownContent.content.bodyHtmlFormat, "html");
    assert.equal(markdownContent.content.bodyMarkdown, MARKDOWN_PREVIEW);
    assert.match(markdownContent.content.bodyHtml, /<h1>Preview Heading<\/h1>/);
    assert.match(markdownContent.content.bodyHtml, /<u>Underlined<\/u>/);
    assert.match(markdownContent.content.bodyHtml, /markdown-task-list-checkbox/);
    assert.doesNotMatch(markdownContent.content.bodyHtml, /<script|javascript:|<img|onerror|data:/i);
    assertNoUnsafeStorageLeak([response.body]);
  });

  await checkAsync("file reviewers can preview in-review files before marking them reviewed", async () => {
    const descriptor = await api.get(`/api/files/attachments/${reviewUpload.attachment.fileAttachmentId}/preview`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(descriptor.status, 200);
    /** @type {PreviewDescriptorEnvelope} */
    const reviewDescriptor = readPayload(descriptor, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
    assert.equal(reviewDescriptor.preview.state, "previewable");
    assert.equal(reviewDescriptor.preview.contentAvailable, true);
    assert.equal(reviewDescriptor.preview.contentUrl, `/api/files/attachments/${reviewUpload.attachment.fileAttachmentId}/preview/content`);

    const content = await api.get(`/api/files/attachments/${reviewUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(content.status, 200);
    /** @type {PreviewTextEnvelope} */
    const reviewContent = readPayload(content, ["content", "preview"], "GET /api/files/attachments/:fileAttachmentId/preview/content");
    assert.equal(reviewContent.preview.state, "previewable");
    assert.equal(reviewContent.content.kind, "text");
    assert.equal(reviewContent.content.text, "in review preview");
    assertNoUnsafeStorageLeak([descriptor.body, content.body]);
  });

  await checkAsync("unsupported too-large unavailable and unauthorized files do not return preview content", async () => {
    const unsupported = await api.get(`/api/files/attachments/${pdfUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(unsupported.status, 409);

    const tooLarge = await api.get(`/api/files/attachments/${largeTextUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(tooLarge.status, 409);

    const unavailable = await api.get(`/api/files/attachments/${failedScanUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(unavailable.status, 409);

    const unauthorized = await api.get(`/api/files/attachments/${textUpload.attachment.fileAttachmentId}/preview/content`, {
      cookie: fixtures.noDownloadSessionId,
    });
    assert.equal(unauthorized.status, 403);

    assertNoUnsafeStorageLeak([unsupported.body, tooLarge.body, unavailable.body, unauthorized.body]);
  });

  await checkAsync("preview content routes do not record audit preview events before the user-facing modal slice", async () => {
    const rows = await querySql(`
SELECT action
FROM audit_logs
WHERE action LIKE 'file.preview%';
`);

    assert.deepEqual(rows, []);
  });

  await assertIntegrity();
  console.log(`Files preview content route regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }
  await stopJobWorker().catch(() => {});
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
  const taskId = randomUUID();
  const noDownloadUserId = randomUUID();

  await runSql(`
INSERT INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES ('preview_reader', 'Preview Reader', 'Can read attachment targets but cannot preview file content.', 'workspace', 9999);

INSERT INTO role_permissions (role_id, permission_id)
VALUES
  ('preview_reader', 'tasks.view'),
  ('preview_reader', 'files.view');

${insertTaskSql(workspaceId, taskId, "Preview Content Task", admin.user_id, now)}
${insertUserSql(workspaceId, noDownloadUserId, "files-preview-content-reader@example.test", "Files Preview Content Reader")}
${insertMembershipSql(workspaceId, noDownloadUserId, now)}
${insertAssignmentSql(workspaceId, noDownloadUserId, "preview_reader", "workspace", workspaceId, now)}
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const noDownloadSession = await createSession({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: noDownloadUserId,
    username: "files-preview-content-reader@example.test",
  });

  return {
    adminSessionId: adminSession.sessionId,
    noDownloadSessionId: noDownloadSession.sessionId,
    taskId,
    workspaceId,
  };
}

/**
 * @param {PreviewApiClient} api
 * @param {{ adminSessionId: string, taskId: string }} fixtures
 * @param {{ bytes: Buffer, filename: string, mimeType: string }} options
 * @returns {Promise<FileUploadEnvelope>}
 */
async function uploadPreviewFile(api, fixtures, options) {
  const response = await api.post("/api/files", {
    contentBase64: options.bytes.toString("base64"),
    displayName: options.filename,
    mimeType: options.mimeType,
    moduleId: "tasks",
    originalFilename: options.filename,
    targetId: fixtures.taskId,
    targetType: "task",
    visibility: "private",
  }, {
    cookie: fixtures.adminSessionId,
  });

  assert.equal(response.status, 201, response.text);
  /** @type {FileUploadEnvelope} */
  const uploaded = readPayload(response, ["attachment", "file"], "POST /api/files");
  assert.ok(uploaded.file?.fileId, "upload should return a file id");
  assert.ok(uploaded.attachment.fileAttachmentId, "upload should return an attachment id");
  return uploaded;
}

async function processQueuedJobs() {
  await runJobWorkerOnce({
    claimLimit: 20,
    mode: "inline",
    workerId: "files-preview-content-route-regression",
  });
}

/** @param {string} workspaceId @param {string} taskId @param {string} title @param {string} userId @param {string} now */
function insertTaskSql(workspaceId, taskId, title, userId, now) {
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
  NULL,
  NULL,
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
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

/** @param {string} baseUrl @returns {PreviewApiClient} */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => requestJson(baseUrl, "GET", url, null, options),
    getRaw: (url, options = {}) => requestRaw(baseUrl, "GET", url, options),
    post: (url, body, options = {}) => requestJson(baseUrl, "POST", url, body, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @param {PreviewClientOptions} [options]
 * @returns {Promise<PreviewResponse>}
 */
async function requestJson(baseUrl, method, url, body = null, options = {}) {
  const response = await requestResponse(baseUrl, method, url, body, options);
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

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {PreviewClientOptions} [options]
 * @returns {Promise<PreviewRawResponse>}
 */
async function requestRaw(baseUrl, method, url, options = {}) {
  const response = await requestResponse(baseUrl, method, url, null, options);
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    headers: response.headers,
    status: response.status,
    text: buffer.toString("utf8"),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @param {PreviewClientOptions} [options]
 * @returns {Promise<Response>}
 */
async function requestResponse(baseUrl, method, url, body = null, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${baseUrl}${url}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
}

/** @param {unknown[]} values */
function assertNoUnsafeStorageLeak(values) {
  const text = JSON.stringify(values);

  [
    "unsafe-sha256",
    "unsafe-storage-key",
    "sha256",
    "storageKey",
    "storageProvider",
    "storage_key",
    "storage_path",
    "storagePath",
    tempDir.replaceAll("\\", "\\\\"),
  ].forEach((pattern) => {
    assert.equal(text.includes(pattern), false, `Preview content response should not expose ${pattern}`);
  });
}

async function assertPreviewSourceBoundary() {
  const serviceSource = await fs.readFile(path.join(process.cwd(), "src/services/files.service.js"), "utf8");
  const previewServiceSource = await fs.readFile(path.join(process.cwd(), "src/services/files-preview.service.js"), "utf8");
  const descriptorBlock = functionBlock(serviceSource, "readAttachmentPreviewDescriptor");
  const contentBlock = functionBlock(serviceSource, "readAttachmentPreviewContent");
  const previewContentBlock = functionBlock(previewServiceSource, "readAttachmentPreviewContent");

  assert.doesNotMatch(descriptorBlock, /recordFileAudit|emitFileLifecycleEvent|getFileStorageAdapter|\.read\(/, "Preview descriptors should not read content, audit, or emit lifecycle events");
  assert.match(contentBlock, /assertStoredFileObjectExists\([\s\S]*\.read\(/, "Preview content should precheck storage metadata before reading through the Files storage adapter");
  assert.match(contentBlock, /filesPreviewService\.assertContentAvailable\([\s\S]*assertStoredFileObjectExists\([\s\S]*filesPreviewService\.readContent\(/, "Files facade should reject unavailable content before provider reads and delegate safe shaping to the preview seam");
  assert.match(previewContentBlock, /renderMarkdownToHtml/, "Markdown preview content should use the shared Markdown service");
  assert.doesNotMatch(`${contentBlock}\n${previewContentBlock}`, /MarkdownIt|marked|showdown|recordFileAudit|emitFileLifecycleEvent/, "Preview content should not add another Markdown parser or preview audit/lifecycle event in this slice");
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
    const nextServer = http.createServer(app);
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
