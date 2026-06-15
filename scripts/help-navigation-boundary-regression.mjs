import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-nav-boundary-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-nav-boundary-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Nav-Boundary-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { helpService } = await import("../src/services/help.service.js");

let checks = 0;

try {
  await initializeDatabase();
  const session = await readProtectedSession();

  await check("Help navigation keeps articles under the correct parent headings", async () => {
    const result = await helpService.list(session);
    const longtailForge = findNavigationGroup(result.navigation, "Longtail Forge");
    const modules = findNavigationGroup(result.navigation, "Modules");
    const framework = findNavigationGroup(result.navigation, "Framework");
    const lists = findNavigationGroup(result.navigation, "Lists");

    assert.ok(longtailForge, "Longtail Forge top-level group should be present");
    assert.ok(modules, "Modules top-level group should be present");
    assert.ok(framework, "Framework group should be present");
    assert.ok(lists, "Lists group should be present");
    assert.ok(
      findNavigationGroup(longtailForge.children, "Framework"),
      "Framework should remain nested under Longtail Forge",
    );
    assert.ok(
      findNavigationArticle(longtailForge.children, "framework.help-center"),
      "Help Center article should remain under Longtail Forge",
    );
    assert.equal(
      findNavigationArticle(modules.children, "framework.help-center"),
      null,
      "Framework articles should not drift under Modules",
    );
    assert.ok(
      findNavigationGroup(modules.children, "Lists"),
      "Lists should remain nested under Modules",
    );
    assert.ok(
      findNavigationArticle(lists.children, "lists.basics"),
      "Lists articles should remain under the Lists group",
    );
    assert.equal(result.defaultArticleId, "framework.help-center");
    assert.equal(result.defaultArticleSlug, "help-center");
  });

  await check("Help page starts only Longtail Forge top-level navigation expanded by default", async () => {
    const script = await readProjectFile("public/js/help.js");
    const view = await readProjectFile("views/protected/help.html");

    assert.match(script, /function shouldStartGroupExpanded/);
    assert.match(script, /depth !== 1/);
    assert.match(script, /normalizeNavigationTitle\(item\.title\) === "longtail forge"/);
    assert.match(script, /navigationItemContainsArticle\(item, state\.selectedArticleId\)/);
    assert.match(script, /list\.hidden = !expanded/);
    assert.match(script, /heading\.setAttribute\("aria-expanded", String\(expanded\)\)/);
    assert.match(view, /\/css\/longtail-forge\.css\?v=15/);
    assert.match(view, /\/js\/help\.js\?v=4/);
  });

  await check("Help article surfaces contain long Markdown content", async () => {
    const styles = await readProjectFile("public/css/longtail-forge.css");

    assert.match(styles, /\.help-navigation,[\s\S]*\.help-article-shell \{[\s\S]*min-width: 0;/);
    assert.match(styles, /\.help-article-list\[hidden\] \{[\s\S]*display: none;/);
    assert.match(styles, /\.help-article-shell \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;[\s\S]*overflow: hidden;/);
    assert.match(styles, /\.help-article-body h2,[\s\S]*\.help-article-body h6 \{[\s\S]*overflow-wrap: anywhere;/);
    assert.match(styles, /\.help-article-body p,[\s\S]*\.help-article-body li \{[\s\S]*overflow-wrap: anywhere;/);
    assert.match(styles, /\.help-article-body pre \{[\s\S]*max-width: 100%;[\s\S]*overflow-x: auto;/);
    assert.match(styles, /\.help-article-body code \{[\s\S]*overflow-wrap: anywhere;/);
    assert.match(styles, /\.help-article-body table \{[\s\S]*display: block;[\s\S]*max-width: 100%;[\s\S]*overflow-x: auto;/);
  });

  console.log(`Help navigation boundary regression passed ${checks} checks.`);
} finally {
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

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
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

function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
