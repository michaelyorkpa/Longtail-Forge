/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.0.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-runtime-diagnostics-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-runtime-diagnostics.db");
process.env.SUPER_ADMIN_PASSWORD = "Runtime-Diagnostics-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const appSource = readText("src/core/app.js");
const routeSource = readText("src/routes/runtime-diagnostics.routes.js");
const serviceSource = readText("src/services/runtime-diagnostics.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { createApp } = await import("../src/core/app.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the runtime diagnostics version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the runtime diagnostics version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the runtime diagnostics version");

  assert.match(routeSource, /runtimeDiagnosticsRoutes\.get\("\/runtime-diagnostics"/, "runtime diagnostics route should expose GET /api/runtime-diagnostics");
  assert.match(routeSource, /runtimeDiagnosticsService\.read\(request\.session\)/, "runtime diagnostics route should delegate to the service read model");
  assert.match(appSource, /runtimeDiagnosticsRoutes/, "app startup should mount the runtime diagnostics route after auth");
  assert.match(serviceSource, /workspace_settings\.manage/, "runtime diagnostics service should require workspace_settings.manage");
  assert.match(serviceSource, /readDatabaseHealth/, "runtime diagnostics service should reuse the database health contract");
  assert.match(serviceSource, /configurationWarnings/, "runtime diagnostics service should expose safe config warnings");
  assert.doesNotMatch(serviceSource, /process\.env/, "runtime diagnostics service must not expose raw environment variables");
  assert.doesNotMatch(serviceSource, /localRoot|clamdHost|clamdPort|clamscanPath|masterKey/i, "runtime diagnostics service must not expose storage roots, scanner internals, or key material");
  assert.match(regressionSuite, /scripts\/runtime-diagnostics-route-regression\.mjs/, "regression suite should include runtime diagnostics route coverage");

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const unauthenticated = await api.get("/api/runtime-diagnostics");
  assert.equal(unauthenticated.status, 401, "runtime diagnostics should require login");
  assert.equal(unauthenticated.body.error, "Login required.");

  const forbidden = await api.get("/api/runtime-diagnostics", { cookie: fixtures.unprivilegedSessionId });
  assert.equal(forbidden.status, 403, "runtime diagnostics should require workspace_settings.manage");
  assert.equal(forbidden.body.error, "You do not have permission to perform that action.");

  const allowed = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(allowed.status, 200, "workspace settings managers should read runtime diagnostics");
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  assertRuntimeDiagnostics(allowed.body.diagnostics);

  assert.match(runtimeDocs, /`GET \/api\/runtime-diagnostics`/, "runtime docs should document the protected runtime diagnostics route");
  assert.match(runtimeDocs, /Runtime diagnostics[\s\S]*workspace_settings\.manage/i, "runtime docs should record the diagnostics permission boundary");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed runtime diagnostics branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the runtime diagnostics slice");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "runtime diagnostics regression database should pass integrity check");

  console.log("Runtime diagnostics route regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertRuntimeDiagnostics(diagnostics) {
  assert.equal(diagnostics.app.version, appVersion);
  assert.equal(diagnostics.runtime.environment, "development");
  assert.deepEqual(diagnostics.runtime.configurationWarnings, []);
  assert.equal(diagnostics.database.provider, "sqlite");
  assert.equal(diagnostics.database.health.status, "ok");
  assert.equal(diagnostics.database.health.fileWritable, true);
  assert.equal(diagnostics.database.sqlite.journalMode, "wal");
  assert.equal(diagnostics.database.sqlite.foreignKeysEnabled, true);
  assert.equal(diagnostics.database.sqlite.busyTimeoutMs, 5000);
  assert.deepEqual(diagnostics.database.fileLocation, {
    display: "<data-dir>/longtail-forge-runtime-diagnostics.db",
    redacted: false,
    relativeTo: "data-dir",
  });
  assert.equal(diagnostics.data.directoryLocation.redacted, true, "outside-root data directories should be redacted");
  assert.equal(diagnostics.data.directoryLocation.relativeTo, "outside-app-root");
  assert.match(diagnostics.data.directoryLocation.display, /^<redacted>\//);
  assert.equal(diagnostics.storage.provider, "local");
  assert.equal(diagnostics.scanner.mode, "none");
  assert.equal(diagnostics.worker.mode, "inline");

  const serialized = JSON.stringify(diagnostics);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(normalizePath(tempDir))), "diagnostics should not expose the absolute temp data path");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(normalizePath(process.env.LONGTAIL_DATABASE_FILE))), "diagnostics should not expose the absolute database file path");
  assert.doesNotMatch(serialized, /Runtime-Diagnostics-Test-123|SUPER_ADMIN_PASSWORD|LONGTAIL_SECURE_NOTES|SECURE_NOTES_MASTER_KEY|CLAMD|CLAMSCAN|signedUrl|storageKey/i, "diagnostics should not expose secrets, scanner internals, signed URLs, or storage keys");
}

async function seedFixtures() {
  const admin = await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  assert.ok(admin?.user_id, "fresh database should seed a protected admin");

  const unprivilegedUser = {
    userId: `runtime-diagnostics-user-${randomUUID()}`,
    username: `runtime-diagnostics-${randomUUID()}@example.test`,
  };
  const now = new Date().toISOString();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;

  await db.run(`
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
  :userId,
  :workspaceId,
  :username,
  :displayName,
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  :workspaceId
);
`, {
    displayName: unprivilegedUser.username,
    userId: unprivilegedUser.userId,
    username: unprivilegedUser.username,
    workspaceId,
  });

  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  :membershipId,
  :userId,
  :workspaceId,
  'active',
  :now,
  :now
);
`, {
    membershipId: randomUUID(),
    now,
    userId: unprivilegedUser.userId,
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
    unprivilegedSessionId: (await createSession({
      active_workspace_id: workspaceId,
      home_workspace_id: workspaceId,
      timezone: "America/New_York",
      user_id: unprivilegedUser.userId,
      username: unprivilegedUser.username,
    })).sessionId,
  };
}

function createApi(baseUrl) {
  return {
    async get(url, options = {}) {
      const headers = {};
      if (options.cookie) {
        headers.Cookie = `longtail_forge_session=${options.cookie}`;
      }

      const response = await fetch(`${baseUrl}${url}`, { headers });
      const text = await response.text();
      return {
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
        status: response.status,
      };
    },
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
  return String(value || "").replaceAll(path.sep, "/");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
