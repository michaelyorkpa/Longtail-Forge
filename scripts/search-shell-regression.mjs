import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-shell-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-shell-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Search-Shell-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { appShellService } = await import("../src/services/app-shell.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  const shell = await appShellService.bootstrap(session);
  const navigation = await readProjectFile("public/js/navigation.js");
  const searchPage = await readProjectFile("views/protected/search.html");
  const searchScript = await readProjectFile("public/js/search.js");
  const styles = await readProjectFile("public/css/longtail-forge.css");
  const appCore = await readProjectFile("src/core/app.js");

  assert.ok(Array.isArray(shell.searchTargets), "app shell bootstrap should return searchTargets");
  assert.ok(shell.searchTargets.some((target) => target.moduleId === "tasks" && target.recordType === "task"));
  assert.ok(shell.searchTargets.some((target) => target.moduleId === "client-projects" && target.recordType === "client"));
  assert.ok(shell.searchTargets.every((target) => (
    target.id === `${target.moduleId}:${target.recordType}` ||
    target.id === `source:${target.sourceLabel}:${target.recordType}`
  )));

  assert.match(navigation, /dataset\.globalSearchForm/);
  assert.match(navigation, /dataset\.globalSearchShell/);
  assert.match(navigation, /dataset\.globalSearchToggle/);
  assert.match(navigation, /dataset\.globalSearchInput/);
  assert.match(navigation, /dataset\.globalSearchTarget/);
  assert.match(navigation, /searchButton\.setAttribute\("aria-label",\s*"Search"\)/);
  assert.match(navigation, /notificationButton\.setAttribute\("aria-label",\s*"Notifications"\)/);
  assert.match(navigation, /role",\s*"search"/);
  assert.match(navigation, /setGlobalSearchOpen\(!isOpen\)/);
  assert.match(navigation, /links\.append\(searchShell\)[\s\S]*NAV_ITEMS\.forEach[\s\S]*links\.append\(notificationWrap\)/);
  assert.match(navigation, /navLinks\.replaceChildren\([\s\S]*globalSearchShell[\s\S]*items\.map[\s\S]*notificationBell\?\.parentElement/);
  assert.match(navigation, /params\.set\("text",\s*text\)/);
  assert.match(navigation, /params\.set\("module",\s*selectedOption\.dataset\.moduleId\)/);
  assert.match(navigation, /params\.set\("source",\s*selectedOption\.dataset\.sourceLabel\)/);
  assert.match(navigation, /params\.set\("recordType",\s*selectedOption\.dataset\.recordType\)/);
  assert.match(navigation, /window\.location\.href = query \? `search\.html\?\$\{query\}` : "search\.html"/);
  assert.doesNotMatch(readFunctionBody(navigation, "submitGlobalSearch"), /fetch\("/);

  assert.match(styles, /\.global-search-form/);
  assert.match(styles, /\.global-search-shell/);
  assert.match(styles, /\.global-search-toggle/);
  assert.match(styles, /\.global-search-toggle-icon/);
  assert.match(styles, /\.notification-bell-icon/);
  assert.match(styles, /\.global-search-input/);
  assert.match(styles, /\.global-search-target/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.global-search-form/);

  assert.match(searchPage, /data-search-index-maintenance/);
  assert.match(searchPage, /data-search-rebuild-index/);
  assert.match(searchScript, /workspaceContext\?\.permissionHints\?\.workspaceSettingsManage/);
  assert.match(searchScript, /fetch\("\/api\/search-index\/rebuild"/);
  assert.match(searchScript, /Index rebuild queued/);
  assert.match(styles, /\.search-index-maintenance/);
  assert.match(appCore, /queueStartupSearchIndexRebuildIfEmpty/);
  assert.match(appCore, /queueSearchIndexRebuildIfEmpty\(\{[\s\S]*source:\s*"startup-empty-index"/);
  assert.doesNotMatch(appCore, /searchIndexRebuildService\.rebuildApp|scheduleStartupSearchIndexRebuild/);

  console.log("Search shell regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
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

function readFunctionBody(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);

  assert.notEqual(start, -1, `${functionName} function was not found`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${functionName} function body did not close`);
}
