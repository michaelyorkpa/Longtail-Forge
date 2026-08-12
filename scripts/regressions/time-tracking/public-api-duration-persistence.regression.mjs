export const regressionMeta = Object.freeze({
  id: "time-tracking.public-api-duration-persistence",
  area: "time-tracking",
  tier: "integration",
  tags: ["database", "public-api", "time-tracking"],
  description: "Proves public API durations persist one billing-authoritative seconds value with a numerically matching hours projection.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("public-api-duration-persistence");
const { closeSqlite, db, initializeDatabase } = await import("../../../src/db/index.js");
const { createApp } = await import("../../../src/core/app.js");
const { apiKeysService } = await import("../../../src/services/api-keys.service.js");

let server;

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  const apiKey = await apiKeysService.create({
    name: "Duration persistence regression",
    scopes: ["clients:write", "projects:write", "time_entries:read", "time_entries:write"],
  }, session);
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const client = await apiRequest(baseUrl, "/api/v1/clients", {
    body: { name: "Duration Client" },
    method: "POST",
    rawKey: apiKey.rawKey,
  });
  assert.equal(client.status, 201);
  const project = await apiRequest(baseUrl, `/api/v1/clients/${encodeURIComponent(client.body.data.id)}/projects`, {
    body: { name: "Duration Project" },
    method: "POST",
    rawKey: apiKey.rawKey,
  });
  assert.equal(project.status, 201);

  const hoursOnly = await createEntry(baseUrl, apiKey.rawKey, project.body.data.id, {
    description: "Hours only",
    duration_hours: "1.25",
  });
  assert.equal(hoursOnly.duration_seconds, "4500", "hours-only public API writes must derive billing-authoritative seconds");
  assert.equal(hoursOnly.duration_hours, "1.2500", "hours-only public API writes must store the matching hours projection");

  const secondsOnly = await createEntry(baseUrl, apiKey.rawKey, project.body.data.id, {
    description: "Seconds only",
    duration_seconds: 900,
  });
  assert.equal(secondsOnly.duration_seconds, "900", "seconds-only public API writes must preserve explicit seconds");
  assert.equal(Number(secondsOnly.duration_hours), 0.25, "seconds-only public API writes must derive a matching hours projection");

  const explicitSeconds = await createEntry(baseUrl, apiKey.rawKey, project.body.data.id, {
    description: "Explicit seconds",
    duration_hours: "5",
    duration_seconds: 120,
  });
  assert.equal(explicitSeconds.duration_seconds, "120", "explicit seconds must remain authoritative");
  assert.equal(explicitSeconds.duration_hours, "0.0333", "conflicting hours must be replaced by the seconds projection");

  const listed = await apiRequest(baseUrl, "/api/v1/time-entries?limit=100", { rawKey: apiKey.rawKey });
  assert.equal(listed.status, 200);
  for (const expected of [hoursOnly, secondsOnly, explicitSeconds]) {
    const entry = listed.body.data.find((item) => item.entry_id === expected.entry_id);
    assert.ok(entry, `public API reads must include ${expected.description}`);
    assert.equal(entry.duration_seconds, expected.duration_seconds);
    assert.equal(entry.duration_hours, expected.duration_hours);
    assert.equal(Number(entry.duration_seconds), Math.round(Number(entry.duration_hours) * 3600));
  }

  const stored = await db.query(`
SELECT entry_id, duration_seconds, duration_hours, typeof(duration_seconds) AS duration_seconds_type
FROM time_entries
WHERE workspace_id = :workspaceId
  AND entry_id IN (:hoursOnlyId, :secondsOnlyId, :explicitSecondsId)
ORDER BY entry_id;
`, {
    explicitSecondsId: explicitSeconds.entry_id,
    hoursOnlyId: hoursOnly.entry_id,
    secondsOnlyId: secondsOnly.entry_id,
    workspaceId: session.workspace_id,
  });
  assert.equal(stored.length, 3);
  for (const row of stored) {
    assert.equal(row.duration_seconds_type, "integer", "duration seconds must keep integer persistence affinity");
    assert.equal(Number(row.duration_seconds), Math.round(Number(row.duration_hours) * 3600));
  }

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity?.integrity_check, "ok");

  console.log("Public API duration persistence regression passed.");
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeSqlite();
  await fixture.cleanup();
}

async function createEntry(baseUrl, rawKey, projectId, duration) {
  const created = await apiRequest(baseUrl, "/api/v1/time-entries", {
    body: {
      ...duration,
      end_time: "2026-08-10T14:15:00.000Z",
      project_id: projectId,
      start_time: "2026-08-10T13:00:00.000Z",
    },
    method: "POST",
    rawKey,
  });
  assert.equal(created.status, 201);
  return created.body.data;
}

async function apiRequest(baseUrl, route, { body, method = "GET", rawKey } = {}) {
  const response = await globalThis.fetch(`${baseUrl}${route}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${rawKey}`,
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

async function readProtectedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
ORDER BY users.user_id
LIMIT 1;
`);
  assert.ok(user?.user_id, "protected user fixture is required");
  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    api_key_id: "duration-regression-key",
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
