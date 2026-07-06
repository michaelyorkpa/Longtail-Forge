/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.29";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-storage-diagnostics-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-storage-diagnostics.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Storage-Diagnostics-Test-123!";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;

try {
  assertStaticContracts();

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const diagnosticsResponse = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(diagnosticsResponse.status, 200, "workspace settings managers should read runtime diagnostics");
  assertStorageDiagnostics(diagnosticsResponse.body.diagnostics);

  const uploadResponse = await api.post("/api/files", uploadPayload(fixtures.taskId), {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(uploadResponse.status, 201, "file upload route should still accept local file writes");
  assert.equal(uploadResponse.body.file.storageProvider, "local", "file route should expose the safe provider id");
  assertSafeSerializedPayload(uploadResponse.body, "file upload route");

  const fileResponse = await api.get(`/api/files/${uploadResponse.body.file.fileId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(fileResponse.status, 200, "file read route should return the safe read model");
  assertSafeSerializedPayload(fileResponse.body, "file read route");

  console.log("File storage diagnostics regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
  const runtimeDiagnosticsSource = readText("src/services/runtime-diagnostics.service.js");
  const workspaceSettingsScript = readText("public/js/workspace-settings.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the storage diagnostics version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the storage diagnostics version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the storage diagnostics version");

  assert.match(runtimeDiagnosticsSource, /readSafeStorageHealth/, "runtime diagnostics should own a safe storage health read");
  assert.match(runtimeDiagnosticsSource, /getFileStorageAdapter/, "runtime diagnostics should resolve the configured Files storage adapter");
  assert.match(runtimeDiagnosticsSource, /\.health\(\)/, "runtime diagnostics should call the storage adapter health hook");
  assert.match(runtimeDiagnosticsSource, /safeStorageRootLocation/, "runtime diagnostics should normalize the local storage root into a safe location label");
  assert.doesNotMatch(runtimeDiagnosticsSource, /process\.env|signedUrl|storageKey|protectedPath/i, "runtime diagnostics source must not expose raw env, signed URLs, storage keys, or protected paths");

  assert.match(workspaceSettingsScript, /createRuntimeDiagnosticItem\("Storage Provider", formatStorageProvider\(storage\)\)/, "Workspace Settings should render the provider id with status");
  assert.match(workspaceSettingsScript, /Storage Status/, "Workspace Settings should render storage availability status");
  assert.match(workspaceSettingsScript, /Local Storage Root/, "Workspace Settings should render the safe local storage root label");
  assert.match(workspaceSettingsScript, /Storage provider health is unavailable/, "Workspace Settings should warn when provider health is unavailable");
  assert.doesNotMatch(workspaceSettingsScript, /process\.env|localRoot|storageKey|signedUrl|protectedPath|DATABASE_URL|CLAMD|CLAMSCAN|masterKey/i, "Workspace Settings storage diagnostics must not expose raw runtime or storage internals");
  assert.equal(existsSync(path.join(root, "views/protected/runtime-diagnostics.html")), false, "storage diagnostics should not add a new admin diagnostics surface");

  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*storage provider diagnostics are active/, "runtime docs should mark storage diagnostics active");
  assert.match(sqliteDocs, /safe local storage root label/i, "SQLite small-office docs should mention the safe storage root label");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the storage diagnostics slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-storage-diagnostics-regression\.mjs/, "regression suite should include storage diagnostics coverage");
}

function assertStorageDiagnostics(diagnostics) {
  assert.equal(diagnostics.storage.provider, "local");
  assert.equal(diagnostics.storage.health.status, "ok");
  assert.equal(diagnostics.storage.health.available, true);
  assert.deepEqual(diagnostics.storage.rootLocation, {
    display: "<data-dir>/files",
    redacted: false,
    relativeTo: "data-dir",
  });

  assertSafeSerializedPayload(diagnostics, "runtime diagnostics route");
}

function assertSafeSerializedPayload(payload, label) {
  const serialized = JSON.stringify(payload);

  for (const rawPath of [tempDir, config.storage.localRoot, process.env.LONGTAIL_DATABASE_FILE]) {
    assert.doesNotMatch(
      normalizePath(serialized),
      new RegExp(escapeRegExp(normalizePath(rawPath))),
      `${label} should not expose raw local filesystem paths`,
    );
  }

  assert.doesNotMatch(serialized, /storageKey|signedUrl|protectedPath|LONGTAIL_LOCAL_STORAGE_ROOT|File-Storage-Diagnostics-Test|SUPER_ADMIN_PASSWORD/i, `${label} should not expose storage internals or secrets`);
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskId = await createTask({
    userId: admin.user_id,
    workspaceId,
  });

  return {
    adminSessionId: (await createSession({
      active_workspace_id: workspaceId,
      home_workspace_id: admin.home_workspace_id,
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
    })).sessionId,
    taskId,
  };
}

async function readSeedAdmin() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "fresh database should seed a protected admin");
  return rows[0];
}

async function createTask(options) {
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
  ${sqlText(options.workspaceId)},
  NULL,
  NULL,
  'Storage diagnostics file route task',
  '',
  'open',
  'normal',
  ${sqlText(options.userId)},
  ${sqlText(options.userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return taskId;
}

function uploadPayload(taskId) {
  return {
    contentBase64: Buffer.from("storage diagnostics route body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "storage-diagnostics.txt",
    targetId: taskId,
    targetType: "task",
  };
}

function createApi(baseUrl) {
  return {
    async get(url, options = {}) {
      return requestJson(baseUrl, "GET", url, undefined, options);
    },
    async post(url, body, options = {}) {
      return requestJson(baseUrl, "POST", url, body, options);
    },
  };
}

async function requestJson(baseUrl, method, url, body, options = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
    status: response.status,
    text,
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function normalizePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
