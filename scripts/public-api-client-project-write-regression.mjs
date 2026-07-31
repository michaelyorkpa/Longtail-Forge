/* global fetch */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  assertUuidVersion(created.body.data.id, 7, "server-generated public API clients should use UUIDv7");

  const child = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Client Alpha Child", parent_client_id: created.body.data.id },
    method: "POST",
    rawKey,
  });
  assert.equal(child.status, 201);
  assert.equal(child.body.data.parent_client_id, created.body.data.id);
  assertUuidVersion(child.body.data.id, 7, "nested public API clients should use server-generated UUIDv7 IDs");

  const legacyClientId = randomUUID();
  const legacy = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { id: legacyClientId, name: "API Legacy UUIDv4 Client" },
    method: "POST",
    rawKey,
  });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.body.data.id, legacyClientId, "caller-supplied public API Client UUIDv4 should remain unchanged");
  assertUuidVersion(legacy.body.data.id, 4, "legacy public API Client compatibility should preserve UUIDv4");

  const updatedLegacy = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(legacyClientId)}`, {
    body: { name: "API Legacy UUIDv4 Client Updated", status: "Active" },
    method: "PUT",
    rawKey,
  });
  assert.equal(updatedLegacy.status, 200);
  assert.equal(updatedLegacy.body.data.id, legacyClientId, "public API updates must preserve an existing UUIDv4 Client ID");
  assert.equal(updatedLegacy.body.data.name, "API Legacy UUIDv4 Client Updated");

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
  assertUuidVersion(client.body.data.id, 7, "server-generated project Client scope should use UUIDv7");

  const created = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(client.body.data.id)}/projects`, {
    body: { name: "API Project Alpha" },
    method: "POST",
    rawKey,
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.name, "API Project Alpha");
  assert.equal(created.body.data.client_id, client.body.data.id);
  assertUuidVersion(created.body.data.id, 7, "server-generated public API projects should use UUIDv7");

  const child = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(client.body.data.id)}/projects`, {
    body: { name: "API Project Alpha Child", parent_project_id: created.body.data.id },
    method: "POST",
    rawKey,
  });
  assert.equal(child.status, 201);
  assert.equal(child.body.data.parent_project_id, created.body.data.id);
  assertUuidVersion(child.body.data.id, 7, "nested public API projects should use server-generated UUIDv7 IDs");

  const legacyProjectId = randomUUID();
  const legacy = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(client.body.data.id)}/projects`, {
    body: { id: legacyProjectId, name: "API Legacy UUIDv4 Project" },
    method: "POST",
    rawKey,
  });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.body.data.id, legacyProjectId, "caller-supplied public API Project UUIDv4 should remain unchanged");
  assertUuidVersion(legacy.body.data.id, 4, "legacy public API Project compatibility should preserve UUIDv4");

  const updatedLegacy = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(legacyProjectId)}`, {
    body: { name: "API Legacy UUIDv4 Project Updated", client_id: client.body.data.id, status: "Active" },
    method: "PUT",
    rawKey,
  });
  assert.equal(updatedLegacy.status, 200);
  assert.equal(updatedLegacy.body.data.id, legacyProjectId, "public API updates must preserve an existing UUIDv4 Project ID");
  assert.equal(updatedLegacy.body.data.client_id, client.body.data.id, "public API updates must retain a mixed UUIDv4 Project to UUIDv7 Client relationship");

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

function assertUuidVersion(value, version, message) {
  assert.match(
    String(value || ""),
    new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i"),
    message,
  );
}
