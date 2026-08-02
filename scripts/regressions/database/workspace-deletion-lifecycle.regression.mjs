export const regressionMeta = Object.freeze({
  id: "database.workspace-deletion-lifecycle",
  area: "database",
  tier: "release-gate",
  tags: ["audit", "backup", "baseline-bypass", "database", "permissions", "sessions", "workspaces"],
  description: "Proves authorized workspace-deletion requests are backup-aware, restart-durable, operational during the 30-day grace period, cancelable before the boundary, and non-destructive.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("workspace-deletion-lifecycle");
const ADMIN_USERNAME = "workspace-deletion-admin@example.test";
const ADMIN_PASSWORD = "Workspace-Deletion-Admin-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { workspaceDeletionService } = await import("../../../src/services/workspace-deletion.service.js");

let server;

try {
  await initializeDatabase();
  server = await listen(createApp());
  let api = createApi(`http://127.0.0.1:${server.address().port}`);

  const loginResponse = await api.post("/api/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  assert.equal(loginResponse.status, 200, JSON.stringify(loginResponse.body));
  const cookie = readSessionCookie(loginResponse);
  const workspaceId = loginResponse.body.user.workspace_id;
  const workspaceName = loginResponse.body.user.workspaceContext.workspaceName;
  const adminSession = {
    display_name: ADMIN_USERNAME,
    user_id: loginResponse.body.user.user_id,
    username: ADMIN_USERNAME,
    workspace_id: workspaceId,
  };

  const initialState = await api.get("/api/settings/workspace-deletion", { cookie });
  assert.equal(initialState.status, 200, JSON.stringify(initialState.body));
  assert.equal(initialState.body.deletion.backup.current, false);
  assert.equal(initialState.body.deletion.acknowledgementPhrase, "DELETE WITHOUT CURRENT BACKUP");

  const before = await snapshotWorkspaceOwnedRows(workspaceId);
  const requested = await api.post("/api/settings/workspace-deletion/request", {
    acknowledgement: "DELETE WITHOUT CURRENT BACKUP",
    workspaceName,
  }, { cookie });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  assert.equal(requested.body.deletion.pending, true);
  assert.equal(requested.body.deletion.lifecycle.noCurrentBackupAcknowledged, true);
  assert.equal(
    new Date(requested.body.deletion.lifecycle.purgeAfter).getTime()
      - new Date(requested.body.deletion.lifecycle.requestedAt).getTime(),
    30 * 24 * 60 * 60 * 1000,
  );

  for (const [label, response] of await Promise.all([
    api.get("/api/app-shell/bootstrap", { cookie }).then((response) => ["navigation/modules", response]),
    api.get("/api/files/attachments", { cookie }).then((response) => ["Files", response]),
    api.get("/api/search?text=grace", { cookie }).then((response) => ["Search", response]),
    api.get("/api/notifications", { cookie }).then((response) => ["notifications", response]),
  ])) {
    assert.equal(response.status, 200, `${label} should remain operational: ${JSON.stringify(response.body)}`);
  }

  await closeServer(server);
  server = null;
  await closeDatabase();
  await initializeDatabase();
  server = await listen(createApp());
  api = createApi(`http://127.0.0.1:${server.address().port}`);

  const afterRestart = await api.get("/api/settings/workspace-deletion", { cookie });
  assert.equal(afterRestart.status, 200, JSON.stringify(afterRestart.body));
  assert.equal(afterRestart.body.deletion.lifecycle.requestedAt, requested.body.deletion.lifecycle.requestedAt);
  assert.equal(afterRestart.body.deletion.lifecycle.purgeAfter, requested.body.deletion.lifecycle.purgeAfter);

  const canceled = await api.post("/api/settings/workspace-deletion/cancel", {}, { cookie });
  assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
  assert.equal(canceled.body.deletion.pending, false);
  assert.deepEqual(await snapshotWorkspaceOwnedRows(workspaceId), before);

  const secondRequest = await api.post("/api/settings/workspace-deletion/request", {
    acknowledgement: "DELETE WITHOUT CURRENT BACKUP",
    workspaceName,
  }, { cookie });
  assert.equal(secondRequest.status, 201, JSON.stringify(secondRequest.body));
  await assert.rejects(
    workspaceDeletionService.cancel(adminSession, {
      now: new Date(secondRequest.body.deletion.lifecycle.purgeAfter),
    }),
    (error) => error?.statusCode === 409 && /cancellation period has ended/i.test(error.message),
  );

  const integrity = await db.query("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
  console.log("Workspace deletion lifecycle regression passed.");
} finally {
  if (server) await closeServer(server);
  await closeDatabase();
  await fixture.cleanup();
}

async function snapshotWorkspaceOwnedRows(workspaceId) {
  const tables = await db.query(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`);
  const snapshot = {};
  for (const { name } of tables) {
    if (["audit_logs", "search_index_fts", "workspace_deletion_lifecycle"].includes(name)) continue;
    const columns = await db.query(`PRAGMA table_info("${name.replaceAll('"', '""')}");`);
    if (!columns.some((column) => column.name === "workspace_id")) continue;
    const row = await db.get(`
SELECT COUNT(1) AS count
FROM "${name.replaceAll('"', '""')}"
WHERE workspace_id = :workspaceId;
`, { workspaceId });
    snapshot[name] = Number(row?.count) || 0;
  }
  return snapshot;
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.cookie) headers.cookie = `longtail_forge_session=${options.cookie}`;
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await response.text();
    return {
      body: text && (response.headers.get("content-type") || "").includes("application/json")
        ? JSON.parse(text)
        : text || null,
      headers: response.headers,
      status: response.status,
    };
  }
  return {
    get: (url, options) => request("GET", url, undefined, options),
    post: (url, body, options) => request("POST", url, body, options),
  };
}

function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "")
    .match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}
