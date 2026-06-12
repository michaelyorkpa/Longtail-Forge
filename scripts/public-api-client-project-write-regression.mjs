/* global fetch */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-client-projects-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-public-client-projects.db");
process.env.SUPER_ADMIN_PASSWORD = "Public-Client-Project-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { initializeDatabase, closeSqlite, querySql } = await import("../src/db/index.js");
const { apiKeysService } = await import("../src/services/api-keys.service.js");

let server;

try {
  await initializeDatabase();
  const session = await readSession();
  const fullKey = await createApiKey(session, [
    "clients:read",
    "clients:write",
    "projects:read",
    "projects:write",
  ]);
  const readOnlyKey = await createApiKey(session, ["clients:read", "projects:read"]);
  const app = createApp();
  server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await assertReadOnlyKeyCannotWrite(baseUrl, readOnlyKey.rawKey);
  await assertClientWriteFlow(baseUrl, fullKey.rawKey);
  await assertProjectWriteFlow(baseUrl, fullKey.rawKey);

  console.log("Public API client/project write regression passed.");
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertReadOnlyKeyCannotWrite(baseUrl, rawKey) {
  const response = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "Denied API Client" },
    method: "POST",
    rawKey,
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.apiVersion, "v1");
  assert.equal(response.body.error.code, "scope_required");
  assert.match(response.body.error.message, /clients:write/);
}

async function assertClientWriteFlow(baseUrl, rawKey) {
  const created = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Client Alpha" },
    method: "POST",
    rawKey,
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.apiVersion, "v1");
  assert.equal(created.body.data.name, "API Client Alpha");
  assert.ok(created.body.data.workspace_id);

  const updated = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(created.body.data.id)}`, {
    body: { name: "API Client Alpha Updated", status: "Active" },
    method: "PUT",
    rawKey,
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, "API Client Alpha Updated");

  const archived = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(created.body.data.id)}`, {
    method: "DELETE",
    rawKey,
  });

  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.archived, true);
}

async function assertProjectWriteFlow(baseUrl, rawKey) {
  const client = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Project Client" },
    method: "POST",
    rawKey,
  });
  assert.equal(client.status, 201);

  const created = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(client.body.data.id)}/projects`, {
    body: { name: "API Project Alpha" },
    method: "POST",
    rawKey,
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.name, "API Project Alpha");
  assert.equal(created.body.data.client_id, client.body.data.id);

  const updated = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(created.body.data.id)}`, {
    body: { name: "API Project Alpha Updated", client_id: client.body.data.id, status: "Active" },
    method: "PUT",
    rawKey,
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, "API Project Alpha Updated");

  const archived = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(created.body.data.id)}`, {
    method: "DELETE",
    rawKey,
  });

  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.archived, true);
}

async function createApiKey(session, scopes) {
  return apiKeysService.create({
    name: `Regression key ${scopes.join(" ")}`,
    scopes,
  }, session);
}

async function apiRequest(baseUrl, route, { body, method = "GET", rawKey } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(rawKey ? { authorization: `Bearer ${rawKey}` } : {}),
    },
    method,
  });
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
}

async function listen(app) {
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
    nextServer.on("error", reject);
  });
}

async function readSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, workspaces.workspace_id
FROM users
CROSS JOIN workspaces
WHERE users.protected_user = 'yes'
ORDER BY users.user_id, workspaces.workspace_id
LIMIT 1;
`);

  return {
    timezone: "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}
