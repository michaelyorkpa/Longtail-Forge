/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/framework-contracts.js").BrowserSearchResult} BrowserSearchResult */
/** @typedef {import("../src/types/help-static-contracts.js").HelpArticle} HelpArticle */
/** @typedef {import("../src/types/help-static-contracts.js").HelpNavigationItem} HelpNavigationItem */

/**
 * One app-shell navigation entry or search target, as these owners read them.
 * @typedef {{ href?: unknown, id?: unknown, items?: unknown[], label?: unknown, recordType?: unknown, sourceLabel?: unknown }} ShellItem
 */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HelpWorkflowApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HelpWorkflowServer */

/**
 * What this owner's `fetch` fixture resolves. It carries no headers, so it is
 * declared here rather than through the shared fetch-response contract.
 * @typedef {{ body: unknown, status: number, text: string }} HelpWorkflowResponse
 */

/** @typedef {ReturnType<typeof createApi>} HelpWorkflowApi */

/**
 * The public echo of the parsed search query, as the search route publishes it.
 * @typedef {{ recordTypes: string[], source: string | null }} HelpSearchQuery
 */

/** @typedef {{ articles: HelpArticle[] }} ArticlesEnvelope */
/** @typedef {{ articles: HelpArticle[], navigation: HelpNavigationItem[] }} ArticlesNavigationEnvelope */
/** @typedef {{ query: HelpSearchQuery, results: BrowserSearchResult[] }} SearchEnvelope */

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
/** @type {HelpWorkflowServer | undefined} */
let server;
let unregisterDeveloperExampleIndexer;

try {
  await initializeDatabase();
  unregisterDeveloperExampleIndexer = registerSearchIndexer("developer-example.records", () => ({ documents: [] }));

  const session = await readProtectedSession();
  const app = createApp();
  server = await listen(app);

  const baseUrl = `http://127.0.0.1:${listenerPort(server)}`;
  const unauthenticated = createApi(baseUrl);
  const api = createApi(baseUrl, session.sessionId);

  await check("Help route and APIs require authentication", async () => {
    const page = await unauthenticated.get("/help.html");
    const list = await unauthenticated.get("/api/help");
    const detail = await unauthenticated.get("/api/help/articles/framework.help-center");

    assert.equal(page.status, 401);
    assert.match(page.text, /data-recovery-kind="login-required"/);
    assert.match(page.text, />Sign in<\/a>/);
    assert.equal(list.status, 401);
    assert.equal(detail.status, 401);
  });

  await check("Help Center lists framework and active-module articles", async () => {
    await setModuleStatus(session.workspace_id, "developer-example", "enabled");

    const page = await api.get("/help.html");
    const list = await api.get("/api/help");
    /** @type {ArticlesEnvelope} */
    const listBody = readPayload(list, ["articles"], "list");

    assert.equal(page.status, 200);
    assert.match(page.text, /data-help-sections/);
    assert.equal(list.status, 200);
    assert.ok(listBody.articles.some((article) => article.id === "framework.help-center" && article.ownerType === "framework"));
    assert.ok(listBody.articles.some((article) => article.id === "developer-example.getting-started" && article.moduleId === "developer-example"));
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
    /** @type {ArticlesEnvelope} */
    const listBody = readPayload(list, ["articles"], "list");
    const activeRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_type = 'help_article'
ORDER BY record_id;
`);

    assert.equal(list.status, 200);
    assert.equal(listBody.articles.some((article) => article.moduleId === "developer-example"), false);
    assert.ok(activeRows.some((row) => row.record_id === "framework.help-center"));
    assert.equal(activeRows.some((row) => row.record_id === "developer-example.getting-started"), false);
  });

  await check("first-party module Help appears and disappears with module activation", async () => {
    const moduleArticles = [
      ["tasks", "tasks.reminders-calendar"],
      ["time-tracking", "time-tracking.actions"],
      ["notes", "notes.actions"],
      ["lists", "lists.actions"],
    ];

    for (const [moduleId, articleId] of moduleArticles) {
      await setModuleStatus(session.workspace_id, moduleId, "enabled");
      const visible = await api.get("/api/help");
      /** @type {ArticlesEnvelope} */
      const visibleBody = readPayload(visible, ["articles"], "visible");
      assert.ok(
        visibleBody.articles.some((article) => article.id === articleId),
        `${articleId} should appear while ${moduleId} is enabled`,
      );

      await setModuleStatus(session.workspace_id, moduleId, "disabled");
      const hidden = await api.get("/api/help");
      /** @type {ArticlesNavigationEnvelope} */
      const hiddenBody = readPayload(hidden, ["articles", "navigation"], "hidden");
      assert.equal(
        hiddenBody.articles.some((article) => article.id === articleId),
        false,
        `${articleId} should disappear while ${moduleId} is disabled`,
      );
      assert.equal(
        JSON.stringify(hiddenBody.navigation).includes(articleId),
        false,
        `${articleId} should disappear from ToC navigation while ${moduleId} is disabled`,
      );

      await setModuleStatus(session.workspace_id, moduleId, "enabled");
    }

    await searchIndexRebuildService.rebuildWorkspace({
      audit: false,
      workspaceId: session.workspace_id,
    });
    const indexedRows = await querySql(`
SELECT record_id
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_type = 'help_article'
  AND record_id IN ('tasks.reminders-calendar', 'time-tracking.actions', 'notes.actions', 'lists.actions')
ORDER BY record_id;
`);

    assert.deepEqual(
      indexedRows.map((row) => row.record_id),
      ["lists.actions", "notes.actions", "tasks.reminders-calendar", "time-tracking.actions"],
    );
  });

  await check("Help article pages are searchable separately from other record types", async () => {
    const response = await api.get("/api/search?text=in-app%20product%20manual&recordType=help_article");
    /** @type {SearchEnvelope} */
    const responseBody = readPayload(response, ["query", "results"], "response");

    assert.equal(response.status, 200);
    assert.deepEqual(responseBody.query.recordTypes, ["help_article"]);
    assert.ok(responseBody.results.length >= 1);
    assert.ok(responseBody.results.every((result) => result.recordType === "help_article"));
    assert.ok(responseBody.results.some((result) => result.recordId === "framework.help-center"));
  });

  await check("global Help source filter returns safe snippets and Help Center links", async () => {
    const response = await api.get("/api/search?source=Help&recordType=help_article");
    /** @type {SearchEnvelope} */
    const responseBody = readPayload(response, ["query", "results"], "response");

    assert.equal(response.status, 200);
    assert.equal(responseBody.query.source, "Help");
    assert.ok(responseBody.results.length >= 1);

    for (const result of responseBody.results) {
      assert.equal(result.source, "Help");
      assert.equal(result.recordType, "help_article");
      assert.match(result.target?.url || "", /^help\.html\?article=/);
      assert.equal(Object.hasOwn(result, "body"), false);
      assert.equal(Object.hasOwn(result, "tags_text"), false);
    }
  });

  await check("Settings menu placement remains stable", async () => {
    const shell = await appShellService.bootstrap(session);
    const settingsMenu = shell.navigation.map(shellItem).find((item) => item.id === "settings");

    assert.ok(settingsMenu);
    assert.ok(settingsMenu.items, "the Settings menu should carry entries");
    assert.deepEqual(
      settingsMenu.items.map(shellItem).filter((item) => item.href).map((item) => `${item.label}:${item.href}`),
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

/** @param {string} name @param {() => void | Promise<void>} assertion */
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

  const session = workspaceSessionFixture(user);
  // `createSession` seeds from an open record; the workspace session is spread
  // into one rather than passed as the named contract it is.
  const created = await createSession(session);

  return {
    ...session,
    sessionId: created.sessionId,
  };
}

/** @param {string} workspaceId @param {string} moduleId @param {string} status */
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

/**
 * Prove one app-shell entry is a record before it is walked.
 * @param {unknown} value
 * @returns {ShellItem}
 */
function shellItem(value) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "each app-shell entry should be a record");
  return /** @type {ShellItem} */ (value);
}

/**
 * @param {string} baseUrl
 * @param {string|null} [sessionId]
 * @returns {{ get: (url: string) => Promise<HelpWorkflowResponse> }}
 */
function createApi(baseUrl, sessionId = null) {
  return {
    get: (url) => request(baseUrl, "GET", url, sessionId),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {string | null} [sessionId]
 * @returns {Promise<HelpWorkflowResponse>}
 */
async function request(baseUrl, method, url, sessionId) {
  /** @type {Record<string, string>} */
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
  // The parsed body stays `unknown`; every read below crosses that boundary
  // through `readPayload`, which proves the envelope it names is present.
  /** @type {unknown} */
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

/** @param {HelpWorkflowApp} app @returns {Promise<HelpWorkflowServer>} */
function listen(app) {
  return new Promise((resolve) => {
    listenOnFetchSafePort(app, resolve);
  });
}

/** @param {HelpWorkflowServer} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the Help workflow fixture server should bind a TCP port");
  return address.port;
}

/**
 * @param {HelpWorkflowApp} app
 * @param {(server: HelpWorkflowServer) => void} resolve
 * @param {number} [attempts]
 */
function listenOnFetchSafePort(app, resolve, attempts = 0) {
  const server = http.createServer(app);

  server.listen(0, "127.0.0.1", () => {
    const port = listenerPort(server);

    if (!isFetchBlockedPort(port) || attempts >= 20) {
      resolve(server);
      return;
    }

    server.close(() => listenOnFetchSafePort(app, resolve, attempts + 1));
  });
}

/** @param {number} port @returns {boolean} */
function isFetchBlockedPort(port) {
  return new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
    179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
    587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
    6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
  ]).has(Number(port));
}

/** @param {HelpWorkflowServer} server @returns {Promise<void>} */
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
