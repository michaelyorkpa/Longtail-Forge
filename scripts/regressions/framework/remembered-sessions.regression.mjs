export const regressionMeta = Object.freeze({
  id: "framework.remembered-sessions",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "cookies", "security", "sessions"],
  description: "Proves strict remembered-login validation, matched absolute database and cookie lifetimes, restart persistence, expiry, and logout revocation.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("remembered-sessions");
const USERNAME = "remembered-session-admin@example.test";
const PASSWORD = "Remembered-Session-Admin-123!";
const NORMAL_TTL_SECONDS = 600;
const REMEMBERED_TTL_SECONDS = 30 * 24 * 60 * 60;

process.env.SUPER_ADMIN_USERNAME = USERNAME;
process.env.SUPER_ADMIN_PASSWORD = PASSWORD;
process.env.LONGTAIL_SESSION_TTL_SECONDS = String(NORMAL_TTL_SECONDS);
process.env.TRUST_PROXY = "false";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");

let server;

try {
  await initializeDatabase();
  server = await listen(createApp());
  let api = createApi(`http://127.0.0.1:${server.address().port}`);

  const omitted = await api.post("/api/login", { username: USERNAME, password: PASSWORD });
  assert.equal(omitted.status, 200, JSON.stringify(omitted.body));
  await assertLifetime(omitted, NORMAL_TTL_SECONDS, "an omitted preference");

  const unchecked = await api.post("/api/login", {
    username: USERNAME,
    password: PASSWORD,
    rememberMe: false,
  });
  assert.equal(unchecked.status, 200, JSON.stringify(unchecked.body));
  await assertLifetime(unchecked, NORMAL_TTL_SECONDS, "an unchecked preference");

  const remembered = await api.post("/api/login", {
    username: USERNAME,
    password: PASSWORD,
    rememberMe: true,
  });
  assert.equal(remembered.status, 200, JSON.stringify(remembered.body));
  const rememberedCookie = readSessionCookie(remembered);
  await assertLifetime(remembered, REMEMBERED_TTL_SECONDS, "a checked preference");
  assert.match(readSessionSetCookie(remembered), /; HttpOnly(?:;|,)/, "the remembered bearer must stay HttpOnly");
  assert.match(readSessionSetCookie(remembered), /; SameSite=Lax(?:;|,|$)/, "the remembered bearer must preserve SameSite");
  assert.doesNotMatch(readSessionSetCookie(remembered), /; Domain=/, "the remembered bearer must stay host-only");
  const managedSessions = await api.get(`/api/users/${remembered.body.user.user_id}/sessions`, {
    cookie: rememberedCookie,
  });
  assert.equal(managedSessions.status, 200, JSON.stringify(managedSessions.body));
  const currentManagedSession = managedSessions.body.sessions.find((session) => session.isCurrent);
  const rememberedRow = await db.get("SELECT expires_at FROM sessions WHERE session_id = :sessionId;", {
    sessionId: rememberedCookie,
  });
  assert.equal(
    currentManagedSession?.expiresAt,
    rememberedRow.expires_at,
    "Active Sessions must report the remembered row's exact authoritative expiry",
  );

  const sessionCountBeforeInvalidValues = Number((await db.get("SELECT COUNT(*) AS count FROM sessions;")).count);
  for (const invalidValue of [1, "true", null, {}]) {
    const invalid = await api.post("/api/login", {
      username: USERNAME,
      password: PASSWORD,
      rememberMe: invalidValue,
    });
    assert.equal(invalid.status, 400, `rememberMe=${JSON.stringify(invalidValue)} must be rejected`);
    assert.deepEqual(invalid.body, { error: "Remember me must be a boolean." });
  }
  assert.equal(
    Number((await db.get("SELECT COUNT(*) AS count FROM sessions;")).count),
    sessionCountBeforeInvalidValues,
    "invalid preference types must not create sessions",
  );

  await closeServer(server);
  server = null;
  await closeDatabase();
  await initializeDatabase();
  server = await listen(createApp());
  api = createApi(`http://127.0.0.1:${server.address().port}`);

  assert.equal(
    (await api.get("/api/session", { cookie: rememberedCookie })).status,
    200,
    "a remembered session must remain authoritative after an app restart",
  );

  await db.run("UPDATE sessions SET expires_at = :expiresAt WHERE session_id = :sessionId;", {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    sessionId: rememberedCookie,
  });
  assert.equal((await api.get("/api/session", { cookie: rememberedCookie })).status, 401, "absolute expiry must reject the bearer");
  assert.equal(await db.get("SELECT session_id FROM sessions WHERE session_id = :sessionId;", {
    sessionId: rememberedCookie,
  }), null, "expired remembered sessions must be removed from the canonical store");

  const logoutLogin = await api.post("/api/login", {
    username: USERNAME,
    password: PASSWORD,
    rememberMe: true,
  });
  const logoutCookie = readSessionCookie(logoutLogin);
  assert.equal((await api.post("/api/logout", undefined, { cookie: logoutCookie })).status, 200);
  assert.equal((await api.get("/api/session", { cookie: logoutCookie })).status, 401, "logout must revoke a remembered bearer immediately");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Remembered sessions regression passed.");

async function assertLifetime(response, expectedSeconds, label) {
  const sessionId = readSessionCookie(response);
  assert.ok(sessionId, `${label} must set a session bearer`);
  assert.equal(readSessionMaxAge(response), expectedSeconds, `${label} must set the exact cookie Max-Age`);
  const row = await db.get("SELECT expires_at FROM sessions WHERE session_id = :sessionId;", { sessionId });
  assert.ok(row, `${label} must use the canonical sessions table`);
  const remainingMilliseconds = new Date(row.expires_at).getTime() - Date.now();
  assert.ok(
    remainingMilliseconds <= expectedSeconds * 1000
      && remainingMilliseconds >= (expectedSeconds - 10) * 1000,
    `${label} must persist the same absolute lifetime (remaining ${remainingMilliseconds} ms)`,
  );
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
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    get(url, options) {
      return request("GET", url, undefined, options);
    },
    post(url, body, options) {
      return request("POST", url, body, options);
    },
  };
}

function readSessionSetCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.match(/longtail_forge_session=[^,]*/)?.[0] || "";
}

function readSessionCookie(response) {
  return readSessionSetCookie(response).match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function readSessionMaxAge(response) {
  return Number(readSessionSetCookie(response).match(/Max-Age=(\d+)/)?.[1] || -1);
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
