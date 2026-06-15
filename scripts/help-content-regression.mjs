import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-content-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-content-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Content-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");
const { helpService, HELP_SEARCH_SOURCE } = await import("../src/services/help.service.js");

const expectedFrameworkArticles = [
  "framework.help-center",
  "framework.getting-started",
  "framework.workspaces",
  "framework.users-permissions",
  "framework.clients-projects",
  "framework.time-tracking",
  "framework.tasks",
  "framework.notifications",
  "framework.tags",
  "framework.search",
  "framework.files-attachments",
  "framework.settings",
  "framework.modules",
];
const expectedTitles = [
  "Help Center",
  "Getting Started",
  "Workspaces and Workspace Switching",
  "Users, Roles, and Permissions",
  "Clients and Projects",
  "Time Tracking Basics",
  "Tasks Basics",
  "Notifications",
  "Tags",
  "Search",
  "Files and Attachments",
  "Settings and User Preferences",
  "Modules and Optional Features",
];

let checks = 0;

try {
  await initializeDatabase();
  const session = await readProtectedSession();

  await check("Help Center API returns the baseline framework article set", async () => {
    const help = await helpService.list(session);
    const frameworkArticles = help.articles.filter((article) => article.ownerType === "framework");

    assert.deepEqual(frameworkArticles.map((article) => article.id), expectedFrameworkArticles);
    assert.deepEqual(frameworkArticles.map((article) => article.title), expectedTitles);
    assert.ok(frameworkArticles.every((article) => article.sourceLabel === "Framework"));
    assert.ok(frameworkArticles.every((article) => article.moduleId === ""));
    assert.ok(frameworkArticles.every((article) => article.sectionId === "framework.help-center"));
    assert.ok(frameworkArticles.every((article) => article.slug && /^[a-z0-9-]+$/.test(article.slug)));
  });

  await check("framework article details are basic current-state Help content", async () => {
    for (const articleId of expectedFrameworkArticles) {
      const { article } = await helpService.readArticle(session, articleId);

      assert.equal(article.ownerType, "framework", `${articleId} should be framework-owned`);
      assert.equal(article.sourceLabel, "Framework", `${articleId} should expose framework source label`);
      assert.equal(article.bodyFormat, "markdown", `${articleId} should declare Markdown body format`);
      assert.equal(article.bodyMarkdown, article.body, `${articleId} should preserve Markdown body payload`);
      assert.equal(article.bodyHtmlFormat, "html", `${articleId} should declare rendered HTML body format`);
      assert.match(article.bodyHtml, /<(?:h1|h2|p|ul|ol|table|blockquote|pre)\b/, `${articleId} should expose safe rendered HTML`);
      assert.doesNotMatch(article.bodyHtml, /<script|href="javascript:|src="data:/i, `${articleId} should not expose unsafe rendered HTML`);
      assert.ok(article.summary.length >= 20, `${articleId} should have a useful summary`);
      assert.ok(article.body.length >= 120, `${articleId} should have a basic body`);
      assert.ok(article.body.split(/\n{2,}/).length >= 2, `${articleId} should render at least two paragraphs`);
      assert.doesNotMatch(article.body, /\bfuture roadmap\b/i, `${articleId} should avoid future-roadmap promises`);
      assert.doesNotMatch(article.body, /\bwill be\b/i, `${articleId} should stay current-state oriented`);
    }
  });

  await check("framework article bodies are loaded from Markdown source files", async () => {
    const articlePaths = new Map([
      ["framework.help-center", "help/framework/help-center.md"],
      ["framework.getting-started", "help/framework/getting-started.md"],
      ["framework.workspaces", "help/framework/workspaces-and-switching.md"],
      ["framework.users-permissions", "help/framework/users-roles-and-permissions.md"],
      ["framework.clients-projects", "help/framework/clients-and-projects.md"],
      ["framework.time-tracking", "help/framework/time-tracking-basics.md"],
      ["framework.tasks", "help/framework/tasks-basics.md"],
      ["framework.notifications", "help/framework/notifications.md"],
      ["framework.tags", "help/framework/tags.md"],
      ["framework.search", "help/framework/search.md"],
      ["framework.files-attachments", "help/framework/files-and-attachments.md"],
      ["framework.settings", "help/framework/settings-and-user-preferences.md"],
      ["framework.modules", "help/framework/modules-and-optional-features.md"],
    ]);

    for (const [articleId, sourcePath] of articlePaths.entries()) {
      const [{ article }, markdown] = await Promise.all([
        helpService.readArticle(session, articleId),
        fs.readFile(sourcePath, "utf8"),
      ]);

      assert.equal(article.body, markdown, `${articleId} body should come from ${sourcePath}`);
    }
  });

  await check("framework related article links resolve to known framework articles", async () => {
    const help = await helpService.list(session);
    const articleIds = new Set(help.articles.map((article) => article.id));

    for (const articleId of expectedFrameworkArticles) {
      const { article } = await helpService.readArticle(session, articleId);

      for (const relatedArticleId of article.relatedArticleIds) {
        assert.ok(articleIds.has(relatedArticleId), `${articleId} links to missing article ${relatedArticleId}`);
      }
    }
  });

  await check("closeout Help articles explain module ownership and context-preserving work", async () => {
    const helpCenter = (await helpService.readArticle(session, "framework.help-center")).article;
    const gettingStarted = (await helpService.readArticle(session, "framework.getting-started")).article;
    const modules = (await helpService.readArticle(session, "framework.modules")).article;

    assert.match(helpCenter.body, /Framework articles explain app-wide behavior/);
    assert.match(helpCenter.body, /First-party module articles explain workflow areas/);
    assert.match(helpCenter.body, /Third-party modules are external or separately maintained modules/);
    assert.match(gettingStarted.body, /found, started, paused, and resumed/);
    assert.match(gettingStarted.body, /The app links clients, projects, tasks, time entries, notes, lists, files, tags, notifications, search, and Help/);
    assert.match(gettingStarted.body, /Search is the recovery surface/);
    assert.match(modules.body, /Framework features are shared app services/);
    assert.match(modules.body, /Third-party modules use the same ownership model/);
  });

  await check("framework Help articles index as Help search rows", async () => {
    const summary = await searchIndexRebuildService.rebuildWorkspace({
      audit: false,
      workspaceId: session.workspace_id,
    });
    const rows = await querySql(`
SELECT module_id, record_type, record_id, title, source, body
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'framework'
  AND record_type = 'help_article'
ORDER BY record_id;
`);

    assert.equal(summary.counts.failed, 0);
    assert.deepEqual(rows.map((row) => row.record_id).sort(), [...expectedFrameworkArticles].sort());
    assert.ok(rows.every((row) => row.source === HELP_SEARCH_SOURCE));
    assert.ok(rows.every((row) => row.body.length >= 120));
    assert.ok(rows.some((row) => /Search results are permission-shaped/.test(row.body)));
    assert.ok(rows.some((row) => /Protected internal files are the default/.test(row.body)));
  });

  console.log(`Help content regression passed ${checks} checks.`);
} finally {
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

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function check(name, assertion) {
  await assertion();
  checks += 1;
}
