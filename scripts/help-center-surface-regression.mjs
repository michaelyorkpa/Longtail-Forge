import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-center-surface-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-center-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Center-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { helpService } = await import("../src/services/help.service.js");
const { staticService } = await import("../src/services/static.service.js");

let checks = 0;

async function check(name, assertion) {
  await assertion();
  checks += 1;
}

try {
  await initializeDatabase();

  const session = await readProtectedSession();

  await check("help page is protected and framework-served", async () => {
    const unauthenticated = await staticService.read("/help.html", null);
    assert.equal(unauthenticated.statusCode, 401);

    const authenticated = await staticService.read("/help.html", session);
    assert.equal(authenticated.statusCode, 200);
    assert.equal(authenticated.contentType, "text/html; charset=utf-8");
    assert.match(String(authenticated.contents), /data-help-sections/);
    assert.match(String(authenticated.contents), /\/js\/shared\/icons\.js\?v=1/);
    assert.match(String(authenticated.contents), /\/css\/longtail-forge\.css\?v=15/);
    assert.match(String(authenticated.contents), /\/js\/help\.js\?v=4/);
  });

  await check("app shell places Help in Settings between User and Log Out", async () => {
    const shell = await appShellService.bootstrap(session);
    const settingsMenu = shell.navigation.find((item) => item.id === "settings");

    assert.ok(settingsMenu, "Settings menu should be present");
    assert.deepEqual(
      settingsMenu.items.filter((item) => item.href).map((item) => `${item.label}:${item.href}`),
      ["User:user-settings.html", "Help:help.html"],
    );
  });

  await check("framework help is visible while disabled module help is hidden", async () => {
    const result = await helpService.list(session);

    assert.ok(result.sections.some((section) => section.id === "framework.help-center"));
    assert.ok(result.articles.some((article) => article.id === "framework.help-center" && article.ownerType === "framework"));
    assert.deepEqual(result.articles.filter((article) => article.moduleId === "developer-example"), []);
    assert.equal(result.defaultArticleId, "framework.help-center");
    assert.equal(result.defaultArticleSlug, "help-center");
    assert.ok(result.navigation.some((item) => item.title === "Longtail Forge"));
    assert.ok(findNavigationGroup(result.navigation, "Library Buckets"));
    assert.ok(findNavigationArticle(result.navigation, "framework.help-center"));
    assert.equal(findNavigationArticle(result.navigation, "developer-example.getting-started"), null);
  });

  await check("module help appears after its module is active", async () => {
    await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'developer-example';
`);

    const result = await helpService.list(session);

    assert.ok(result.sections.some((section) => section.id === "developer-example.overview"));
    assert.ok(result.articles.some((article) => article.id === "developer-example.getting-started"));
    const fallback = result.navigation.find((item) => item.title === "Other");
    assert.ok(fallback, "active Help articles missing from toc.md should appear in fallback navigation");
    assert.ok(findNavigationArticle([fallback], "developer-example.getting-started"));
  });

  await check("help article detail loads by id or slug", async () => {
    const byId = await helpService.readArticle(session, "framework.help-center");
    const bySlug = await helpService.readArticle(session, "help-center");

    assert.equal(byId.article.id, "framework.help-center");
    assert.equal(bySlug.article.id, "framework.help-center");
    assert.equal(byId.article.bodyFormat, "markdown");
    assert.equal(byId.article.bodyMarkdown, byId.article.body);
    assert.match(byId.article.body, /in-app product manual/);
    assert.equal(byId.article.section.id, "framework.help-center");
    assert.equal(bySlug.article.slug, "help-center");
  });

  await check("help page script and styles expose expected UI hooks", async () => {
    const view = await readProjectFile("views/protected/help.html");
    const script = await readProjectFile("public/js/help.js");
    const styles = await readProjectFile("public/css/longtail-forge.css");
    const navigation = await readProjectFile("public/js/navigation.js");
    const app = await readProjectFile("src/core/app.js");

    assert.match(view, /data-help-status/);
    assert.match(view, /data-help-sections/);
    assert.match(view, /data-help-article/);
    assert.match(view, /\/css\/longtail-forge\.css\?v=15/);
    assert.match(view, /\/js\/shared\/icons\.js\?v=1/);
    assert.match(view, /\/js\/help\.js\?v=4/);
    assert.match(script, /fetch\("\/api\/help"/);
    assert.match(script, /fetch\(`\/api\/help\/articles\/\$\{encodeURIComponent/);
    assert.match(script, /normalizeNavigation/);
    assert.match(script, /aria-expanded/);
    assert.match(script, /renderMarkdownNodes/);
    assert.match(script, /inlineMarkdownNodes/);
    assert.match(script, /safeHelpHref/);
    assert.doesNotMatch(script, /\.innerHTML\s*=/);
    assert.doesNotMatch(script, /\/api\/search/);
    assert.match(styles, /\.help-workspace/);
    assert.match(styles, /\.help-section-toggle/);
    assert.match(styles, /\.help-article-body pre/);
    assert.match(styles, /\.help-article-body table/);
    assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.help-workspace/);
    assert.match(navigation, /\{ label: "Help", href: "help\.html" \}/);
    assert.match(app, /app\.use\(requireAuth\)[\s\S]*app\.use\("\/api", helpRoutes\)/);
  });

  await check("registered active help contribution helpers expose enabled module content", async () => {
    const active = await modulesService.listActiveHelpContributions(session.workspace_id, session);

    assert.ok(active.sections.some((section) => section.id === "developer-example.overview"));
    assert.ok(active.articles.some((article) => article.id === "developer-example.getting-started"));
  });

  console.log(`Help Center surface regression passed ${checks} checks.`);
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function findNavigationArticle(items, articleId) {
  for (const item of items || []) {
    if (item.type === "article" && item.id === articleId) {
      return item;
    }
    const child = findNavigationArticle(item.children || [], articleId);
    if (child) {
      return child;
    }
  }
  return null;
}

function findNavigationGroup(items, title) {
  for (const item of items || []) {
    if (item.type === "group" && item.title === title) {
      return item;
    }
    const child = findNavigationGroup(item.children || [], title);
    if (child) {
      return child;
    }
  }
  return null;
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const user = rows[0];

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

function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
