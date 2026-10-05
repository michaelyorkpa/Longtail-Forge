export const regressionMeta = Object.freeze({
  id: "framework.user-landing-preferences",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "baseline-bypass", "database", "navigation", "permissions", "settings", "workspaces"],
  description: "Proves per-user app preferences persist calendar defaults and resolve login and workspace-switch landings only to enabled, authorized protected pages with Dashboard fallback.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

/**
 * Optional per-request overrides this regression sends, from the shared HTTP
 * fixture contract.
 * @typedef {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} ApiRequestOptions
 */
/**
 * The union of JSON payload fields the routes exercised here return. Each
 * field is declared present because every read below is already guarded by an
 * assertion on the status that produces it; a route that omits one still
 * throws at the same read it throws at today.
 * @typedef {{
 *   initialPassword: string,
 *   landingPath: string,
 *   preferredCalendarView: string | null,
 *   preferredLoginLanding: string,
 *   preferredWorkspaceSwitchLanding: string,
 *   user: { loginLandingPath: string, preferredCalendarView: string | null, user_id: string, username: string, workspace_id: string },
 *   workspace: { workspaceId: string },
 * }} LandingPayload
 */
/** @typedef {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<LandingPayload>} ApiResponse */
/** The session-carrying JSON client this regression drives the app through. */
/** @typedef {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureWritingJsonClient<LandingPayload>} WorkspaceApi */

const fixture = await createDisposableDatabaseFixture("user-landing-preferences");
const ADMIN_USERNAME = "landing-preferences-admin@example.test";
const ADMIN_PASSWORD = "Landing-Preferences-Admin-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");

let server;

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  const firstLogin = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  const adminCookie = readSessionCookie(firstLogin);
  const originalWorkspaceId = firstLogin.body.user.workspace_id;
  assert.equal(firstLogin.body.user.loginLandingPath, "/dashboard.html");

  const defaultSettings = await api.get("/api/user/settings", { cookie: adminCookie });
  assert.equal(defaultSettings.status, 200, JSON.stringify(defaultSettings.body));
  assert.equal(defaultSettings.body.preferredLoginLanding, "dashboard");
  assert.equal(defaultSettings.body.preferredWorkspaceSwitchLanding, "dashboard");
  assert.equal(defaultSettings.body.preferredCalendarView, null);

  const saved = await api.put("/api/user/settings", {
    preferredLoginLanding: "tasks",
    preferredWorkspaceSwitchLanding: "notes",
    preferredCalendarView: "week",
  }, { cookie: adminCookie });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.preferredLoginLanding, "tasks");
  assert.equal(saved.body.preferredWorkspaceSwitchLanding, "notes");
  assert.equal(saved.body.preferredCalendarView, "week");
  assert.equal((await api.get("/api/user/settings", { cookie: adminCookie })).body.preferredCalendarView, "week");
  const shellBootstrap = await api.get("/api/app-shell/bootstrap", { cookie: adminCookie });
  assert.equal(shellBootstrap.status, 200, JSON.stringify(shellBootstrap.body));
  assert.equal(shellBootstrap.body.user.preferredCalendarView, "week");

  const configuredLogin = await login(api, ADMIN_USERNAME, ADMIN_PASSWORD);
  assert.equal(configuredLogin.body.user.loginLandingPath, "/tasks.html");

  const createdWorkspace = await api.post("/api/workspaces", {
    workspaceName: "Landing Preference Target",
    workspaceType: "business",
  }, { cookie: adminCookie });
  assert.equal(createdWorkspace.status, 201, JSON.stringify(createdWorkspace.body));
  const secondWorkspaceId = createdWorkspace.body.workspace.workspaceId;

  const switchedToOriginal = await api.post("/api/session/workspace", {
    workspaceId: originalWorkspaceId,
  }, { cookie: adminCookie });
  assert.equal(switchedToOriginal.status, 200, JSON.stringify(switchedToOriginal.body));
  assert.equal(switchedToOriginal.body.landingPath, "/notes.html");

  await db.run(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = :workspaceId
  AND module_id = 'notes';
`, { workspaceId: originalWorkspaceId });
  assert.equal((await switchWorkspace(api, adminCookie, secondWorkspaceId)).landingPath, "/notes.html");
  assert.equal(
    (await switchWorkspace(api, adminCookie, originalWorkspaceId)).landingPath,
    "/dashboard.html",
    "A disabled preferred module must fall back even when its protected route permits historical reads",
  );
  await db.run(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = :workspaceId
  AND module_id = 'notes';
`, { workspaceId: originalWorkspaceId });

  const createdUser = await api.post("/api/users", {
    username: "landing-preferences-no-access@example.test",
  }, { cookie: adminCookie });
  assert.equal(createdUser.status, 201, JSON.stringify(createdUser.body));
  const ordinaryLogin = await login(api, createdUser.body.user.username, createdUser.body.initialPassword);
  const ordinaryCookie = readSessionCookie(ordinaryLogin);
  const ordinarySaved = await api.put("/api/user/settings", {
    preferredLoginLanding: "tasks",
  }, { cookie: ordinaryCookie });
  assert.equal(ordinarySaved.status, 200, JSON.stringify(ordinarySaved.body));
  await db.run("DELETE FROM user_role_assignments WHERE user_id = :userId;", {
    userId: createdUser.body.user.user_id,
  });
  assert.equal(
    (await login(api, createdUser.body.user.username, createdUser.body.initialPassword)).body.user.loginLandingPath,
    "/dashboard.html",
    "A preferred module page without its required permission must fall back",
  );

  const invalidSaved = await api.put("/api/user/settings", {
    preferredLoginLanding: "not-a-page",
    preferredWorkspaceSwitchLanding: "/external",
    preferredCalendarView: "agenda",
  }, { cookie: adminCookie });
  assert.equal(invalidSaved.status, 200, JSON.stringify(invalidSaved.body));
  assert.equal(invalidSaved.body.preferredLoginLanding, "dashboard");
  assert.equal(invalidSaved.body.preferredWorkspaceSwitchLanding, "dashboard");
  assert.equal(invalidSaved.body.preferredCalendarView, null);
  await assert.rejects(
    db.run("UPDATE users SET preferred_login_landing = 'invalid';"),
    /CHECK constraint failed/,
  );
  await assert.rejects(
    db.run("UPDATE users SET preferred_calendar_view = 'agenda';"),
    /CHECK constraint failed/,
  );

  const integrity = await db.query("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);

  const [hostSource, userSettingsSource, loginSource, navigationSource, authSource, calendarSource] = await Promise.all([
    fs.readFile("public/js/shared/settings-host.js", "utf8"),
    fs.readFile("public/js/user-settings.js", "utf8"),
    fs.readFile("public/js/login.js", "utf8"),
    fs.readFile("public/js/navigation.js", "utf8"),
    fs.readFile("src/services/auth.service.js", "utf8"),
    fs.readFile("public/js/shared/task-calendar.js", "utf8"),
  ]);
  assert.match(hostSource, /"User App Preferences"/);
  for (const label of ["Dashboard", "Workbench", "Actions: Tasks", "Actions: Notes", "Actions: Lists"]) {
    assert.match(hostSource, new RegExp(label));
  }
  assert.match(userSettingsSource, /preferredLoginLanding/);
  assert.match(userSettingsSource, /preferredWorkspaceSwitchLanding/);
  assert.match(hostSource, /"Default calendar view"/);
  assert.match(hostSource, /Automatic \(Day on mobile, Month on desktop\)/);
  assert.match(userSettingsSource, /preferredCalendarView/);
  assert.match(navigationSource, /preferredCalendarView: shell\.user\?\.preferredCalendarView \|\| null/);
  assert.match(calendarSource, /resolveDefaultView/);
  assert.match(loginSource, /body\.user\?\.loginLandingPath/);
  assert.match(navigationSource, /body\.landingPath/);
  assert.doesNotMatch(navigationSource, /window\.location\.reload\(\)/);
  assert.match(authSource, /userLandingService\.resolvePreferredLanding/);

  console.log("User landing preferences regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

/** @param {WorkspaceApi} api @param {string} username @param {string} password @returns {Promise<ApiResponse>} */
async function login(api, username, password) {
  const response = await api.post("/api/login", { username, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(readSessionCookie(response));
  return response;
}

/** @param {WorkspaceApi} api @param {string} cookie @param {string} workspaceId @returns {Promise<LandingPayload>} */
async function switchWorkspace(api, cookie, workspaceId) {
  const response = await api.post("/api/session/workspace", { workspaceId }, { cookie });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

/** @param {string} baseUrl @returns {WorkspaceApi} */
function createApi(baseUrl) {
  /** @param {string} method @param {string} url @param {unknown} body @param {ApiRequestOptions} [options] @returns {Promise<ApiResponse>} */
  async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.cookie) headers.cookie = `longtail_forge_session=${options.cookie}`;
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      body: text && contentType.includes("application/json") ? JSON.parse(text) : text || null,
      headers: response.headers,
      status: response.status,
    };
  }
  return {
    get: (url, options) => request("GET", url, undefined, options),
    post: (url, body, options) => request("POST", url, body, options),
    put: (url, body, options) => request("PUT", url, body, options),
  };
}

/** @param {ApiResponse} response @returns {string} */
function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "")
    .match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

/**
 * The Express application is callable as a request listener at runtime; the
 * cast bridges its narrower typed request/response parameters.
 * @param {ReturnType<typeof createApp>} app @returns {Promise<http.Server>}
 */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {http.Server} serverInstance @returns {Promise<void>} */
function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}
