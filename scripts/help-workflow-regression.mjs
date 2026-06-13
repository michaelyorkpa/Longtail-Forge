/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-workflow-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-workflow-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Workflow-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { registerSearchIndexer } = await import("../src/core/search/indexer-registry.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");

let checks = 0;
let server;
let unregisterDeveloperExampleIndexer;

try {
  await initializeDatabase();
  unregisterDeveloperExampleIndexer = registerSearchIndexer("developer-example.records", () => ({ documents: [] }));

  const session = await readProtectedSession();
  const app = createApp();
  server = await listen(app);

  const baseUrl = `http://${server.address().address}:${server.address().port}`;
  const unauthenticated = createApi(baseUrl);
  const api = createApi(baseUrl, session.sessionId);

  await check("Help route and APIs require authentication", async () => {
    const page = await unauthenticated.get("/help.html");
    const list = await unauthenticated.get("/api/help");
    const detail = await unauthenticated.get("/api/help/articles/framework.help-center");

    assert.equal(page.status, 302);
    assert.equal(list.status, 401);
    assert.equal(detail.status, 401);
  });

  await check("Help Center lists framework and active-module articles", async () => {
    await setModuleStatus(session.workspace_id, "developer-example", "enabled");

    const page = await api.get("/help.html");
    const list = await api.get("/api/help");

    assert.equal(page.status, 200);
    assert.match(page.text, /data-help-sections/);
    assert.equal(list.status, 200);
    assert.ok(list.body.articles.some((article) => article.id === "framework.help-center" && article.ownerType === "framework"));
    assert.ok(list.body.articles.some((article) => article.id === "developer-example.getting-started" && article.moduleId === "developer-example"));
  });

  await check("disabled-module Help stays hidden from Help Center and active Help search", async () => {
    await searchIndexRebuildService.rebuildWorkspace({
      audit: false,
      workspaceId: session.workspace_id,
    });
    await setModuleStatus(session.workspace_id, "developer-example", "disabled");
    await searchIndexRebuildService.rebuildWorkspace({
      audit: false,
      workspaceId: session.workspace_id,
    });

    const list = await api.get("/api/help");
    const activeRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_type = 'help_article'
ORDER BY record_id;
`);

    assert.equal(list.status, 200);
    assert.equal(list.body.articles.some((article) => article.moduleId === "developer-example"), false);
    assert.ok(activeRows.some((row) => row.record_id === "framework.help-center"));
    assert.equal(activeRows.some((row) => row.record_id === "developer-example.getting-started"), false);
  });

  await check("Help article pages are searchable separately from other record types", async () => {
    const response = await api.get("/api/search?text=in-app%20product%20manual&recordType=help_article");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.query.recordTypes, ["help_article"]);
    assert.ok(response.body.results.length >= 1);
    assert.ok(response.body.results.every((result) => result.recordType === "help_article"));
    assert.ok(response.body.results.some((result) => result.recordId === "framework.help-center"));
  });

  await check("global Help source filter returns safe snippets and Help Center links", async () => {
    const response = await api.get("/api/search?source=Help&recordType=help_article");

    assert.equal(response.status, 200);
    assert.equal(response.body.query.source, "Help");
    assert.ok(response.body.results.length >= 1);

    for (const result of response.body.results) {
      assert.equal(result.source, "Help");
      assert.equal(result.recordType, "help_article");
      assert.match(result.target?.url || "", /^help\.html\?article=/);
      assert.equal(Object.hasOwn(result, "body"), false);
      assert.equal(Object.hasOwn(result, "tags_text"), false);
    }
  });

  await check("Settings menu placement remains stable", async () => {
    const shell = await appShellService.bootstrap(session);
    const settingsMenu = shell.navigation.find((item) => item.id === "settings");

    assert.ok(settingsMenu);
    assert.deepEqual(
      settingsMenu.items.filter((item) => item.href).map((item) => `${item.label}:${item.href}`),
      ["User:user-settings.html", "Help:help.html"],
    );
  });

  console.log(`Help workflow regression passed ${checks} checks.`);
} finally {
  if (typeof unregisterDeveloperExampleIndexer === "function") {
    unregisterDeveloperExampleIndexer();
  }

  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function check(name, assertion) {
  await assertion();
  checks += 1;
}

async function readProtectedSession() {
  const user = (await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`))[0];

  assert.ok(user, "protected user fixture is required");

  const session = {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
  const created = await createSession(session);

  return {
    ...session,
    sessionId: created.sessionId,
  };
}

async function setModuleStatus(workspaceId, moduleId, status) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    enabled_at = ${status === "enabled" ? `COALESCE(enabled_at, ${sqlText(now)})` : "enabled_at"},
    disabled_at = ${status === "disabled" ? sqlText(now) : "NULL"},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)};
`);
}

function createApi(baseUrl, sessionId = null) {
  return {
    get: (url) => request(baseUrl, "GET", url, sessionId),
  };
}

async function request(baseUrl, method, url, sessionId) {
  const headers = {};

  if (sessionId) {
    headers.Cookie = `longtail_forge_session=${sessionId}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    status: response.status,
    text,
  };
}

function listen(app) {
  return new Promise((resolve) => {
    listenOnFetchSafePort(app, resolve);
  });
}

function listenOnFetchSafePort(app, resolve, attempts = 0) {
  const server = http.createServer(app);

  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;

    if (!isFetchBlockedPort(port) || attempts >= 20) {
      resolve(server);
      return;
    }

    server.close(() => listenOnFetchSafePort(app, resolve, attempts + 1));
  });
}

function isFetchBlockedPort(port) {
  return new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
    179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
    587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
    6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
  ]).has(Number(port));
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
