/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-search-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-search-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Search-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { markdownToPlainText } = await import("../src/core/markdown/markdown.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { registerSearchIndexer } = await import("../src/core/search/indexer-registry.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");
const { searchService } = await import("../src/services/search.service.js");

const checks = [];
let server;
let unregisterDeveloperExampleIndexer;

try {
  await initializeDatabase();
  unregisterDeveloperExampleIndexer = registerSearchIndexer("developer-example.records", () => ({ documents: [] }));
  const session = await readProtectedSession();
  await enableDeveloperExample(session.workspace_id);

  await check("active search targets keep Help owner metadata but expose one visible Help target", async () => {
    const activeTypes = await searchService.listActiveSearchableTypes(session.workspace_id);
    const helpTypes = activeTypes.filter((type) => type.recordType === "help_article");

    assert.ok(helpTypes.some((type) => type.moduleId === "framework"));
    assert.ok(helpTypes.some((type) => type.moduleId === "developer-example"));
    assert.ok(helpTypes.every((type) => type.sourceLabel === "Help"));

    const shell = await appShellService.bootstrap(session);
    const visibleHelpTargets = shell.searchTargets.filter((target) => (
      target.sourceLabel === "Help" &&
      target.recordType === "help_article"
    ));

    assert.equal(visibleHelpTargets.length, 1);
    assert.deepEqual(visibleHelpTargets[0], {
      aggregate: true,
      id: "source:Help:help_article",
      label: "Help",
      moduleId: "",
      recordType: "help_article",
      sourceLabel: "Help",
    });
  });

  await check("search rebuild indexes framework and active module Help articles", async () => {
    const summary = await searchIndexRebuildService.rebuildWorkspace({
      workspaceId: session.workspace_id,
      source: "help-search-regression",
    });

    assert.equal(summary.counts.failed, 0);

    const rows = await readHelpIndexRows(session.workspace_id);
    const helpCenterRow = rows.find((row) => row.module_id === "framework" && row.record_id === "framework.help-center");
    const helpCenterMarkdown = await fs.readFile(new URL("../help/framework/help-center.md", import.meta.url), "utf8");
    const helpCenterText = markdownToPlainText(helpCenterMarkdown);

    assert.ok(rows.some((row) => row.module_id === "framework" && row.record_id === "framework.help-center"));
    assert.ok(rows.some((row) => row.module_id === "developer-example" && row.record_id === "developer-example.getting-started"));
    assert.ok(rows.every((row) => row.record_type === "help_article"));
    assert.ok(rows.every((row) => row.source === "Help"));
    assert.ok(helpCenterRow, "framework Help Center article should be indexed");
    assert.match(helpCenterRow.body, /in-app product manual/);
    assert.match(helpCenterRow.body, new RegExp(escapeRegExp(helpCenterText.slice(0, 80))));
    assert.doesNotMatch(helpCenterRow.body, /^#\s/m);
    assert.doesNotMatch(helpCenterRow.body, /\[[^\]]+]\([^)]+\)/);
    assert.doesNotMatch(helpCenterRow.body, /\|?\s*:?-{3,}:?\s*\|/, "Help search text should not expose table separator Markdown");
    assert.ok(rows.every((row) => !/Knowledge Base/i.test(`${row.title} ${row.summary} ${row.body}`)));
  });

  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl, session.sessionId);

  await check("GET /api/search returns Help articles without raw body text", async () => {
    const response = await api.get("/api/search?text=in-app%20product%20manual&recordType=help_article");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.query.recordTypes, ["help_article"]);
    assert.ok(response.body.results.length >= 1);

    const helpResult = response.body.results.find((result) => result.recordId === "framework.help-center");

    assert.ok(helpResult);
    assert.equal(helpResult.recordType, "help_article");
    assert.equal(helpResult.sourceLabel, "Help");
    assert.equal(helpResult.source, "Help");
    assert.deepEqual(helpResult.target, {
      url: "help.html?article=framework.help-center",
      actionId: "help.open",
      params: { articleId: "framework.help-center" },
    });
    assert.equal(Object.hasOwn(helpResult, "body"), false);
    assert.equal(Object.hasOwn(helpResult, "tags_text"), false);
  });

  await check("GET /api/search source filter returns only Help articles", async () => {
    const response = await api.get("/api/search?source=Help&recordType=help_article");

    assert.equal(response.status, 200);
    assert.equal(response.body.query.source, "Help");
    assert.ok(response.body.results.length >= 1);
    assert.ok(response.body.results.every((result) => (
      result.source === "Help" &&
      result.recordType === "help_article"
    )));
  });

  await check("disabling a module removes stale module Help search rows on rebuild", async () => {
    await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = ${sqlText(new Date().toISOString())},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'developer-example';
`);

    const summary = await searchIndexRebuildService.rebuildWorkspace({
      workspaceId: session.workspace_id,
      source: "help-search-regression",
    });
    const rows = await readHelpIndexRows(session.workspace_id);

    assert.equal(summary.counts.failed, 0);
    assert.ok(rows.some((row) => row.module_id === "framework"));
    assert.equal(rows.some((row) => row.module_id === "developer-example"), false);
  });

  await check("search page submits source and Help article filters", async () => {
    const script = await fs.readFile(new URL("../public/js/search.js", import.meta.url), "utf8");

    assert.match(script, /appendParam\(params, "source", state\.filters\.source\)/);
    assert.match(script, /target\.sourceLabel === source/);
    assert.match(script, /`\$\{result\.sourceLabel \|\| result\.source \|\| result\.moduleId\}:\$\{result\.recordType\}`/);
    assert.doesNotMatch(script, /state\.filters\.module/);
  });

  console.log(`Help search regression passed ${checks.length} checks.`);
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

async function enableDeveloperExample(workspaceId) {
  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    enabled_at = COALESCE(enabled_at, ${sqlText(new Date().toISOString())}),
    disabled_at = NULL,
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example';
`);
}

async function readHelpIndexRows(workspaceId) {
  return querySql(`
SELECT module_id, record_type, record_id, title, summary, body, tags_text, source
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND record_type = 'help_article'
ORDER BY module_id, record_id;
`);
}

async function check(name, assertion) {
  await assertion();
  checks.push(name);
}

function createApi(baseUrl, sessionId) {
  return {
    get: (url) => request(baseUrl, "GET", url, sessionId),
  };
}

async function request(baseUrl, method, url, sessionId) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      Cookie: `longtail_forge_session=${sessionId}`,
    },
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
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
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

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
