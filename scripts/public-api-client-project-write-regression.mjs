/* global fetch */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} ApiScopeSession */
/** @typedef {{ body?: Record<string, unknown>, method?: string, rawKey?: string }} ApiRequestOptions */
/** @typedef {{ body: unknown, status: number }} ApiResponse */
/** @typedef {{ id: string, name?: string, archived?: unknown, workspace_id?: unknown, client_id?: unknown, parent_client_id?: unknown, parent_project_id?: unknown }} ApiResourceRecord */
/** @typedef {{ data: ApiResourceRecord }} ApiDataEnvelope */
/** @typedef {{ data: ApiResourceRecord, apiVersion: unknown }} ApiVersionedDataEnvelope */
/** @typedef {{ error: { message?: unknown, code?: unknown }, apiVersion: unknown }} ApiErrorEnvelope */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-client-projects-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-public-client-projects.db");
process.env.SUPER_ADMIN_PASSWORD = "Public-Client-Project-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { initializeDatabase, closeSqlite, querySql } = await import("../src/db/index.js");
const { apiKeysService } = await import("../src/services/api-keys.service.js");

/** @type {import("node:http").Server | undefined} */
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
  const baseUrl = `http://127.0.0.1:${listenerPort(server)}`;

  await assertReadOnlyKeyCannotWrite(baseUrl, readOnlyKey.rawKey);
  await assertClientWriteFlow(baseUrl, fullKey.rawKey);
  await assertProjectWriteFlow(baseUrl, fullKey.rawKey);

  console.log("Public API client/project write regression passed.");
} finally {
  if (server) {
    const listening = server;
    await new Promise((resolve) => listening.close(resolve));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {string} baseUrl @param {string} rawKey */
async function assertReadOnlyKeyCannotWrite(baseUrl, rawKey) {
  const response = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "Denied API Client" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiErrorEnvelope} */
  const responsePayload = readPayload(response, ["error"], "response");

  assert.equal(response.status, 403);
  assert.equal(responsePayload.apiVersion, "v1");
  assert.equal(responsePayload.error.code, "scope_required");
  const scopeErrorMessage = responsePayload.error.message;
  assert.ok(typeof scopeErrorMessage === "string", "the scope error should carry a message");
  assert.match(scopeErrorMessage, /clients:write/);
}

/** @param {string} baseUrl @param {string} rawKey */
async function assertClientWriteFlow(baseUrl, rawKey) {
  const created = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Client Alpha" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiVersionedDataEnvelope} */
  const createdPayload = readPayload(created, ["data"], "created");

  assert.equal(created.status, 201);
  assert.equal(createdPayload.apiVersion, "v1");
  assert.equal(createdPayload.data.name, "API Client Alpha");
  assert.ok(createdPayload.data.workspace_id);
  assertUuidVersion(createdPayload.data.id, 7, "server-generated public API clients should use UUIDv7");

  const child = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Client Alpha Child", parent_client_id: createdPayload.data.id },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const childPayload = readPayload(child, ["data"], "child");
  assert.equal(child.status, 201);
  assert.equal(childPayload.data.parent_client_id, createdPayload.data.id);
  assertUuidVersion(childPayload.data.id, 7, "nested public API clients should use server-generated UUIDv7 IDs");

  const legacyClientId = randomUUID();
  const legacy = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { id: legacyClientId, name: "API Legacy UUIDv4 Client" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const legacyPayload = readPayload(legacy, ["data"], "legacy");
  assert.equal(legacy.status, 201);
  assert.equal(legacyPayload.data.id, legacyClientId, "caller-supplied public API Client UUIDv4 should remain unchanged");
  assertUuidVersion(legacyPayload.data.id, 4, "legacy public API Client compatibility should preserve UUIDv4");

  const updatedLegacy = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(legacyClientId)}`, {
    body: { name: "API Legacy UUIDv4 Client Updated", status: "Active" },
    method: "PUT",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const updatedLegacyPayload = readPayload(updatedLegacy, ["data"], "updatedLegacy");
  assert.equal(updatedLegacy.status, 200);
  assert.equal(updatedLegacyPayload.data.id, legacyClientId, "public API updates must preserve an existing UUIDv4 Client ID");
  assert.equal(updatedLegacyPayload.data.name, "API Legacy UUIDv4 Client Updated");

  const updated = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(createdPayload.data.id)}`, {
    body: { name: "API Client Alpha Updated", status: "Active" },
    method: "PUT",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const updatedPayload = readPayload(updated, ["data"], "updated");

  assert.equal(updated.status, 200);
  assert.equal(updatedPayload.data.name, "API Client Alpha Updated");

  const archived = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(createdPayload.data.id)}`, {
    method: "DELETE",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const archivedPayload = readPayload(archived, ["data"], "archived");

  assert.equal(archived.status, 200);
  assert.equal(archivedPayload.data.archived, true);
}

/** @param {string} baseUrl @param {string} rawKey */
async function assertProjectWriteFlow(baseUrl, rawKey) {
  const client = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "API Project Client" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const clientPayload = readPayload(client, ["data"], "client");
  assert.equal(client.status, 201);
  assertUuidVersion(clientPayload.data.id, 7, "server-generated project Client scope should use UUIDv7");

  const created = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(clientPayload.data.id)}/projects`, {
    body: { name: "API Project Alpha" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const createdPayload = readPayload(created, ["data"], "created");

  assert.equal(created.status, 201);
  assert.equal(createdPayload.data.name, "API Project Alpha");
  assert.equal(createdPayload.data.client_id, clientPayload.data.id);
  assertUuidVersion(createdPayload.data.id, 7, "server-generated public API projects should use UUIDv7");

  const child = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(clientPayload.data.id)}/projects`, {
    body: { name: "API Project Alpha Child", parent_project_id: createdPayload.data.id },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const childPayload = readPayload(child, ["data"], "child");
  assert.equal(child.status, 201);
  assert.equal(childPayload.data.parent_project_id, createdPayload.data.id);
  assertUuidVersion(childPayload.data.id, 7, "nested public API projects should use server-generated UUIDv7 IDs");

  const legacyProjectId = randomUUID();
  const legacy = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(clientPayload.data.id)}/projects`, {
    body: { id: legacyProjectId, name: "API Legacy UUIDv4 Project" },
    method: "POST",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const legacyPayload = readPayload(legacy, ["data"], "legacy");
  assert.equal(legacy.status, 201);
  assert.equal(legacyPayload.data.id, legacyProjectId, "caller-supplied public API Project UUIDv4 should remain unchanged");
  assertUuidVersion(legacyPayload.data.id, 4, "legacy public API Project compatibility should preserve UUIDv4");

  const updatedLegacy = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(legacyProjectId)}`, {
    body: { name: "API Legacy UUIDv4 Project Updated", client_id: clientPayload.data.id, status: "Active" },
    method: "PUT",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const updatedLegacyPayload = readPayload(updatedLegacy, ["data"], "updatedLegacy");
  assert.equal(updatedLegacy.status, 200);
  assert.equal(updatedLegacyPayload.data.id, legacyProjectId, "public API updates must preserve an existing UUIDv4 Project ID");
  assert.equal(updatedLegacyPayload.data.client_id, clientPayload.data.id, "public API updates must retain a mixed UUIDv4 Project to UUIDv7 Client relationship");

  const updated = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(createdPayload.data.id)}`, {
    body: { name: "API Project Alpha Updated", client_id: clientPayload.data.id, status: "Active" },
    method: "PUT",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const updatedPayload = readPayload(updated, ["data"], "updated");

  assert.equal(updated.status, 200);
  assert.equal(updatedPayload.data.name, "API Project Alpha Updated");

  const archived = await apiRequest(baseUrl, `/api/v1/projects/${encodeURIComponent(createdPayload.data.id)}`, {
    method: "DELETE",
    rawKey,
  });
  /** @type {ApiDataEnvelope} */
  const archivedPayload = readPayload(archived, ["data"], "archived");

  assert.equal(archived.status, 200);
  assert.equal(archivedPayload.data.archived, true);
}

/** @param {ApiScopeSession} session @param {readonly string[]} scopes */
async function createApiKey(session, scopes) {
  return apiKeysService.create({
    name: `Regression key ${scopes.join(" ")}`,
    scopes,
  }, session);
}

/** @param {string} baseUrl @param {string} route @param {ApiRequestOptions} [options] @returns {Promise<ApiResponse>} */
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

/** @param {import("node:http").Server} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the public API fixture server should bind a TCP port");
  return address.port;
}

/** @param {import("express").Application} app @returns {Promise<import("node:http").Server>} */
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

  return workspaceSessionFixture(requireFirstRow(rows, "protected user fixture is required"));
}

/** @param {unknown} value @param {number} version @param {string} message */
function assertUuidVersion(value, version, message) {
  assert.match(
    String(value || ""),
    new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i"),
    message,
  );
}
