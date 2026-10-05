import { escapeRegExp } from "./test-support/source-scan.mjs";
import { appVersion } from "../src/core/version.js";
/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
import { requireRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { fixtureString } from "./test-support/session-fixtures.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */
// This owner mounts the app through http.createServer rather than app.listen,
// so the request listener is what it actually requires of it.
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {Awaited<ReturnType<typeof import("../src/services/runtime-diagnostics.service.js").runtimeDiagnosticsService.read>>} RuntimeDiagnostics */
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-runtime-diagnostics-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-runtime-diagnostics.db");
process.env.SUPER_ADMIN_PASSWORD = "Runtime-Diagnostics-Test-123!";

const runtimeDocs = readText("docs/runtime-configuration.md");
const appSource = readText("src/core/app.js");
const routeSource = readText("src/routes/runtime-diagnostics.routes.js");
const serviceSource = readText("src/services/runtime-diagnostics.service.js");

const { createApp } = await import("../src/core/app.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;

try {

  assert.match(routeSource, /runtimeDiagnosticsRoutes\.get\("\/runtime-diagnostics"/, "runtime diagnostics route should expose GET /api/runtime-diagnostics");
  assert.match(routeSource, /runtimeDiagnosticsService\.read\(request\.session\)/, "runtime diagnostics route should delegate to the service read model");
  assert.match(appSource, /runtimeDiagnosticsRoutes/, "app startup should mount the runtime diagnostics route after auth");
  assert.match(serviceSource, /workspace_settings\.manage/, "runtime diagnostics service should require workspace_settings.manage");
  assert.match(serviceSource, /readDatabaseHealth/, "runtime diagnostics service should reuse the database health contract");
  assert.match(serviceSource, /readSafeStorageHealth/, "runtime diagnostics service should expose safe storage provider health");
  assert.match(serviceSource, /\.health\(\)/, "runtime diagnostics service should call the storage adapter health hook");
  assert.match(serviceSource, /configurationWarnings/, "runtime diagnostics service should expose safe config warnings");
  assert.match(serviceSource, /listPublicDemoCapabilities/, "runtime diagnostics should use the data-only public-demo catalog");
  assert.doesNotMatch(serviceSource, /process\.env/, "runtime diagnostics service must not expose raw environment variables");
  assert.doesNotMatch(serviceSource, /clamdHost|clamdPort|clamscanPath|masterKey/i, "runtime diagnostics service must not expose scanner internals or key material");

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const address = server.address();
  assert.ok(address && typeof address === "object", "the fixture server should be listening on a TCP address");
  const api = createApi(`http://127.0.0.1:${address.port}`);

  const unauthenticated = await api.get("/api/runtime-diagnostics");
  assert.equal(unauthenticated.status, 401, "runtime diagnostics should require login");
  const unauthenticatedError = errorEnvelope(unauthenticated, "unauthenticated runtime diagnostics");
  assert.equal(unauthenticatedError.code, "authentication_required");
  assert.equal(unauthenticatedError.message, "Login required.");
  assert.equal(unauthenticatedError.requestId, unauthenticated.headers.get("x-request-id"));

  const forbidden = await api.get("/api/runtime-diagnostics", { cookie: fixtures.unprivilegedSessionId });
  assert.equal(forbidden.status, 403, "runtime diagnostics should require workspace_settings.manage");
  const forbiddenError = errorEnvelope(forbidden, "forbidden runtime diagnostics");
  assert.equal(forbiddenError.code, "forbidden");
  assert.equal(forbiddenError.message, "You do not have permission to perform that action.");

  const allowed = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(allowed.status, 200, "workspace settings managers should read runtime diagnostics");
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  /** @type {{ diagnostics: RuntimeDiagnostics }} */
  const diagnosticsPayload = readPayload(allowed, ["diagnostics"], "runtime diagnostics");
  assertRuntimeDiagnostics(diagnosticsPayload.diagnostics);

  assert.match(runtimeDocs, /`GET \/api\/runtime-diagnostics`/, "runtime docs should document the protected runtime diagnostics route");
  assert.match(runtimeDocs, /Runtime diagnostics[\s\S]*workspace_settings\.manage/i, "runtime docs should record the diagnostics permission boundary");

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

/**
 * The diagnostics tree arrives as parsed JSON over HTTP, but its shape is the
 * producing service's own return, so it is typed against that rather than a
 * restated copy: a service that stops publishing a branch fails here.
 * @param {RuntimeDiagnostics} diagnostics
 */
function assertRuntimeDiagnostics(diagnostics) {
  assert.equal(diagnostics.app.version, appVersion);
  assert.equal(diagnostics.runtime.environment, "development");
  assert.deepEqual(diagnostics.runtime.configurationWarnings, []);
  assert.equal(diagnostics.runtime.deploymentMode, "direct");
  assert.deepEqual(diagnostics.features.publicDemo, {
    capabilities: [],
    budgets: {
      accountMutationUnits: 120,
      enabled: false,
      maxArrayItems: 50,
      maxFieldBytes: 8 * 1024,
      maxPageSize: 100,
      maxQueryBytes: 2048,
      maxRichTextBytes: 32 * 1024,
      operationCount: 411,
      workspaceMutationUnits: 600,
    },
    enabled: false,
    perimeter: {
      clientRequestLimit: 600,
      enabled: false,
      globalRequestLimit: 2400,
      maxBodyBytes: 128 * 1024,
      mutationLimit: 120,
      searchLimit: 60,
      windowSeconds: 60,
    },
    profile: "standard",
  });
  assert.deepEqual(diagnostics.features.supportView, { enabled: false });
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
  assert.equal(diagnostics.storage.health.status, "ok");
  assert.equal(diagnostics.storage.health.available, true);
  assert.deepEqual(diagnostics.storage.rootLocation, {
    display: "<data-dir>/files",
    redacted: false,
    relativeTo: "data-dir",
  });
  assert.equal(diagnostics.scanner.mode, "none");
  assert.equal(diagnostics.worker.mode, "inline");
  assert.equal(diagnostics.worker.status.state, "stopped");
  assert.equal(diagnostics.worker.status.timerActive, false);
  assert.equal(diagnostics.worker.status.pollIntervalMs, 5000);
  assert.equal(diagnostics.worker.status.workerId, "default");
  assert.equal(diagnostics.worker.status.lastRunAt, null);
  assert.equal(diagnostics.worker.status.lastSuccessAt, null);
  assert.equal(diagnostics.worker.status.claimedCount, 0);
  assert.deepEqual(diagnostics.worker.status.registeredJobTypes, [
    "file.scan",
    "import.future",
    "notes.catalog-security",
    "notification.event",
    "search.index",
    "task.recurrence",
    "task.reminder",
    "workspace.purge",
  ]);

  const serialized = JSON.stringify(diagnostics);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(normalizePath(tempDir))), "diagnostics should not expose the absolute temp data path");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(normalizePath(path.join(tempDir, "files")))), "diagnostics should not expose the absolute local storage root path");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(normalizePath(process.env.LONGTAIL_DATABASE_FILE))), "diagnostics should not expose the absolute database file path");
  assert.doesNotMatch(serialized, /Runtime-Diagnostics-Test-123|SUPER_ADMIN_PASSWORD|LONGTAIL_SECURE_NOTES|SECURE_NOTES_MASTER_KEY|CLAMD|CLAMSCAN|signedUrl|storageKey/i, "diagnostics should not expose secrets, scanner internals, signed URLs, or storage keys");
}

async function seedFixtures() {
  const adminRow = await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  assert.ok(adminRow?.user_id, "fresh database should seed a protected admin");
  const admin = requireRow(adminRow, "protected admin lookup");

  const unprivilegedUser = {
    userId: `runtime-diagnostics-user-${randomUUID()}`,
    username: `runtime-diagnostics-${randomUUID()}@example.test`,
  };
  const now = new Date().toISOString();
  const workspaceId = fixtureString(admin.active_workspace_id || admin.home_workspace_id, "protected admin workspace ID");

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
      home_workspace_id: fixtureString(admin.home_workspace_id, "protected admin home workspace ID"),
      timezone: typeof admin.timezone === "string" && admin.timezone ? admin.timezone : "America/New_York",
      user_id: fixtureString(admin.user_id, "protected admin user ID"),
      username: fixtureString(admin.username, "protected admin username"),
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

/**
 * A minimal read-only JSON client over the fixture server. The response body
 * stays `unknown` so every caller narrows it deliberately.
 * @param {string} baseUrl
 */
function createApi(baseUrl) {
  return {
    /**
     * @param {string} url
     * @param {{ cookie?: string }} [options]
     * @returns {Promise<{ body: unknown, headers: Headers, status: number }>}
     */
    async get(url, options = {}) {
      /** @type {Record<string, string>} */
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

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {HttpFixtureServer} serverInstance @returns {Promise<void>} */
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

/**
 * The error envelope one refusal published, proven present before it is read.
 * @param {{ body: unknown }} response
 * @param {string} label
 * @returns {{ code: unknown, message: unknown, requestId: unknown }}
 */
function errorEnvelope(response, label) {
  const payload = readPayload(response, ["error"], label);
  const error = payload.error;
  assert.ok(error && typeof error === "object", `${label} error envelope should be an object`);
  return /** @type {{ code: unknown, message: unknown, requestId: unknown }} */ (error);
}

/** @param {unknown} value */
function normalizePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/");
}
