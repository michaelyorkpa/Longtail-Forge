import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-settings-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-settings.db");
process.env.SUPER_ADMIN_PASSWORD = "File-Settings-Test-123!";

const { filesService } = await import("../src/services/files.service.js");
const { settingsCatalogService } = await import("../src/services/settings-catalog.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createLimitedSession(workspace.workspace_id);
  const taskId = await createTask(adminSession, "File settings task");

  await assertSchemaAndAssets();
  await assertDefaultPolicy(adminSession, limitedSession, taskId);
  await assertSavedPolicy(adminSession, taskId);
  await assertIntegrity();

  console.log("File settings regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

import { requireFirstRow } from "./test-support/database-row-assertions.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}

async function assertSchemaAndAssets() {
  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'file_workspace_settings';
`);
  assert.equal(tables.length, 1, "file_workspace_settings table should exist");

  const view = await fs.readFile("views/protected/files-settings.html", "utf8");
  const script = await fs.readFile("public/js/files-settings.js", "utf8");
  assert.match(view, /data-settings-host="module"[^>]+data-settings-module-id="files"/);
  assert.match(view, /view-builder\.js[\s\S]*settings-renderer\.js[\s\S]*settings-host\.js[\s\S]*files-settings\.js/);
  assert.doesNotMatch(view, /<(?:form|fieldset|input|select|textarea|button)\b/i, "Files Settings HTML should be a minimal host");
  assert.match(script, /\/api\/settings\/catalog/);
  assert.match(script, /\/api\/files\/settings/);
}

/** @param {FilesSession} adminSession @param {FilesSession} limitedSession @param {string} taskId */
async function assertDefaultPolicy(adminSession, limitedSession, taskId) {
  const response = await filesService.readWorkspaceFileSettings(adminSession);
  assert.equal(response.settings.fileTypePolicyMode, "safe_default");
  assert.ok(response.settings.allowedExtensions.includes(".pdf"));
  assert.ok(response.settings.blockedExtensions.includes(".zip"));
  const catalog = await settingsCatalogService.read(adminSession);
  assert.equal(catalog.attachments.module.files?.[0]?.settings.length, 5, "Files should contribute five retained-table settings");
  const limitedCatalog = await settingsCatalogService.read(limitedSession);
  assert.equal(limitedCatalog.attachments.module.files, undefined, "Files settings should be permission-filtered from the catalog");

  await assert.rejects(
    () => filesService.readWorkspaceFileSettings(limitedSession),
    /permission/i,
  );
  await assert.rejects(
    () => filesService.uploadAndAttach(adminSession, uploadPayload(taskId, {
      contentBase64: Buffer.from("PK test zip").toString("base64"),
      originalFilename: "blocked.zip",
    })),
    /blocked by workspace Files settings/i,
  );
}

/** @param {FilesSession} session @param {string} taskId */
async function assertSavedPolicy(session, taskId) {
  await filesService.saveWorkspaceFileSettings(session, {
    allowedExtensions: [".pdf"],
    blockedExtensions: [".zip", ".txt"],
    fileTypePolicyMode: "allowlist",
    internalStorageLimitBytes: 1000000,
    perUserStorageLimitBytes: 500000,
  });
  let settings = await filesService.readWorkspaceFileSettings(session);
  assert.equal(settings.settings.fileTypePolicyMode, "allowlist");
  assert.equal(settings.settings.internalStorageLimitBytes, 1000000);
  assert.equal(settings.settings.perUserStorageLimitBytes, 500000);

  await assert.rejects(
    () => filesService.uploadAndAttach(session, uploadPayload(taskId, {
      originalFilename: "blocked.txt",
      text: "blocked text",
    })),
    /blocked by workspace Files settings|not allowed by workspace Files settings/i,
  );

  await filesService.saveWorkspaceFileSettings(session, {
    allowedExtensions: [".txt"],
    blockedExtensions: [".zip"],
    fileTypePolicyMode: "allowlist",
  });
  settings = await filesService.readWorkspaceFileSettings(session);
  assert.deepEqual(settings.settings.allowedExtensions, [".txt"]);

  const upload = await filesService.uploadAndAttach(session, uploadPayload(taskId, {
    originalFilename: "allowed.txt",
    text: "allowed text",
  }));
  const uploadedFile = requireFile(upload, "allowed policy upload");
  assert.equal(uploadedFile.status, "pending");
  assert.equal(uploadedFile.scanStatus, "pending");
}

/** @param {FilesSession} session @param {string} title */
async function createTask(session, title) {
  const taskId = randomUUID();
  const now = new Date().toISOString();
  await runSql(`
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
  ${sqlText(session.workspace_id)},
  NULL,
  NULL,
  ${sqlText(title)},
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
  return taskId;
}

/** @param {string} targetId @param {{ contentBase64?: string, displayName?: string, originalFilename?: string, text?: string }} [options] */
function uploadPayload(targetId, options = {}) {
  return {
    contentBase64: options.contentBase64 || Buffer.from(options.text || "hello file settings").toString("base64"),
    displayName: options.displayName || options.originalFilename || "Evidence",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "evidence.txt",
    targetId,
    targetType: "task",
    visibility: "private",
  };
}

/** @returns {Promise<{ workspace_id: string }>} */
async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  /** @type {{ workspace_id: string }} */
  const workspace = requireFirstRow(rows, "workspace");
  assert.ok(workspace.workspace_id, "workspace should exist");
  return workspace;
}

/** @param {string} workspaceId @returns {Promise<FilesSession>} */
async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  /** @type {{ display_name: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(rows, "protected user");
  assert.ok(admin.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };
}

/** @param {string} workspaceId @returns {Promise<FilesSession>} */
async function createLimitedSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

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
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`file-settings-limited-${userId}@example.test`)},
  'File Settings Limited User',
  NULL,
  'America/New_York',
  'unused',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: "America/New_York",
    user_id: userId,
    username: `file-settings-limited-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
