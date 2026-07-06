import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.32";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-theme-auto-mode-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-theme-auto-mode.db");
process.env.SUPER_ADMIN_PASSWORD = "Theme-Auto-Mode-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const migrationSql = readText("src/db/migrations/067_user_theme_auto_source.sql");
const normalizers = readText("src/utils/normalizers.js");
const usersRepo = readText("src/repositories/users.repo.js");
const usersServiceSource = readText("src/services/users.service.js");
const authServiceSource = readText("src/services/auth.service.js");
const appShellServiceSource = readText("src/services/app-shell.service.js");
const sessionsSource = readText("src/security/sessions.js");
const authRoutes = readText("src/routes/auth.routes.js");
const usersRoutes = readText("src/routes/users.routes.js");
const configSource = readText("src/config.js");
const staticServiceSource = readText("src/services/static.service.js");
const staticRoutesSource = readText("src/routes/static.routes.js");
const themeInitScript = readText("public/js/theme-init.js");
const navigationScript = readText("public/js/navigation.js");
const loginScript = readText("public/js/login.js");
const userSettingsView = readText("views/protected/user-settings.html");
const userSettingsScript = readText("public/js/user-settings.js");
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { staticService } = await import("../src/services/static.service.js");
const { usersService } = await import("../src/services/users.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertMigrationAndColumn();
  await assertSettingsDefaultAndSave(session);
  await assertProtectedHtmlInitialTheme(session);
  await assertIntegrity();

  console.log("User theme auto mode regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the theme auto mode version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the theme auto mode version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the theme auto mode version");

  assert.match(migrationSql, /ADD COLUMN theme_auto_source TEXT NOT NULL DEFAULT 'system' CHECK \(theme_auto_source IN \('system'\)\)/, "migration should add the persisted auto-source preference");
  assert.match(normalizers, /function normalizeThemeMode\(value\)[\s\S]*\["light", "auto", "dark"\]\.includes\(value\)/, "theme mode normalizer should allow light, auto, and dark");
  assert.match(normalizers, /function normalizeThemeAutoSource\(value\)/, "normalizers should expose the theme auto-source normalizer");
  assert.match(normalizers, /themeAutoSource:\s*normalizeThemeAutoSource\(row\.theme_auto_source\)/, "user app values should map theme auto source");
  assert.match(usersRepo, /theme_auto_source/, "users repository should select and insert theme_auto_source");
  assert.match(usersRepo, /function updateThemeAutoSource/, "users repository should expose a focused auto-source writer");
  assert.match(usersServiceSource, /themeAutoSource:\s*appUser\.themeAutoSource/, "readSettings should return themeAutoSource");
  assert.match(usersServiceSource, /Object\.hasOwn\(payload, "themeAutoSource"\)/, "saveSettings should accept themeAutoSource");
  assert.match(usersServiceSource, /metadata\.setting_names\.push\("themeAutoSource"\)/, "saveSettings audit metadata should name themeAutoSource");

  assert.match(authServiceSource, /themeAutoSource:\s*normalizeThemeAutoSource\(user\.theme_auto_source\)/, "login should return themeAutoSource");
  assert.match(authServiceSource, /themeAutoSource:\s*normalizeThemeAutoSource\(user\?\.theme_auto_source\)/, "session reads should return themeAutoSource");
  assert.match(appShellServiceSource, /themeAutoSource:\s*normalizeThemeAutoSource\(user\?\.theme_auto_source\)/, "app shell bootstrap should return themeAutoSource");
  assert.match(configSource, /themeAutoSourceName:\s*"lf_theme_auto_source"/, "config should name the theme auto-source cookie");
  assert.match(sessionsSource, /function buildThemeAutoSourceCookie/, "sessions should build a theme auto-source cookie");
  assert.match(sessionsSource, /function buildExpiredThemeAutoSourceCookie/, "logout should expire the theme auto-source cookie");
  assert.match(authRoutes, /buildThemeAutoSourceCookie\(result\.themeAutoSource\)/, "login should set the theme auto-source cookie");
  assert.match(authRoutes, /buildExpiredThemeAutoSourceCookie\(\)/, "logout should expire the theme auto-source cookie");
  assert.match(usersRoutes, /buildThemeAutoSourceCookie\(result\.themeAutoSource\)/, "user settings reads/writes should refresh the theme auto-source cookie");
  assert.match(staticServiceSource, /usersRepository\.readById\(session\.home_workspace_id \|\| session\.workspace_id, session\.user_id\)/, "protected HTML should read the user theme before first paint");
  assert.match(staticServiceSource, /data-theme-critical/, "protected HTML should inject critical theme CSS before external assets");
  assert.match(staticServiceSource, /data-theme-mode="\$\{escapeHtmlAttribute\(theme\.themeMode\)\}"/, "protected HTML should carry the stored theme mode");
  assert.match(staticServiceSource, /"Cache-Control": "no-store"/, "protected HTML should not be served from stale browser cache");
  assert.match(staticRoutesSource, /\.\.\.\(result\.headers \|\| \{\}\)/, "static routes should forward protected HTML cache headers");

  assert.match(themeInitScript, /const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source"/, "first-paint theme init should read the auto-source storage key");
  assert.match(themeInitScript, /readCookie\(THEME_AUTO_SOURCE_STORAGE_KEY\)/, "first-paint theme init should read the auto-source cookie");
  assert.match(themeInitScript, /window\.localStorage\.getItem\(THEME_AUTO_SOURCE_STORAGE_KEY\)/, "first-paint theme init should read cached auto source");
  assert.match(themeInitScript, /document\.documentElement\.dataset\.themeMode/, "first-paint theme init should preserve server-provided theme mode when cookies/storage are absent");
  assert.match(themeInitScript, /document\.documentElement\.dataset\.themeAutoSource/, "first-paint theme init should preserve server-provided auto source when cookies/storage are absent");
  assert.match(themeInitScript, /document\.documentElement\.dataset\.themeAutoSource = themeAutoSource/, "first-paint theme init should expose theme auto source");
  assert.match(themeInitScript, /window\.matchMedia\(SYSTEM_THEME_QUERY\)\.matches \? "dark" : "light"/, "first-paint auto mode should resolve from prefers-color-scheme");

  assert.match(navigationScript, /applyThemeMode\(shell\.themeMode, shell\.themeAutoSource\)/, "app shell should apply theme mode and auto source together");
  assert.match(navigationScript, /applyThemeMode\(user\.themeMode, user\.themeAutoSource\)/, "session fallback should apply theme mode and auto source together");
  assert.match(navigationScript, /query\.addEventListener\("change", listener\)/, "navigation should re-resolve auto mode when OS scheme changes");
  assert.match(navigationScript, /window\.localStorage\.removeItem\(THEME_AUTO_SOURCE_STORAGE_KEY\)/, "logout should clear cached auto source");
  assert.match(loginScript, /normalizeThemeMode\(body\.user\?\.themeMode\)/, "login should preserve auto mode in localStorage");
  assert.match(loginScript, /normalizeThemeAutoSource\(body\.user\?\.themeAutoSource\)/, "login should preserve auto source in localStorage");

  assert.match(userSettingsView, /name="themeMode" value="light" data-theme-mode-option/, "User Settings should expose Light mode");
  assert.match(userSettingsView, /name="themeMode" value="auto" data-theme-mode-option/, "User Settings should expose Auto mode");
  assert.match(userSettingsView, /name="themeMode" value="dark" data-theme-mode-option/, "User Settings should expose Dark mode");
  assert.match(userSettingsView, /data-theme-auto-source-controls/, "User Settings should expose auto-source controls");
  assert.match(userSettingsView, /name="themeAutoSource" value="system" data-theme-auto-source/, "User Settings should expose OS-match auto source");
  assert.doesNotMatch(userSettingsView, /data-theme-mode-toggle|theme-mode-switch|theme-switch-track/, "User Settings should not keep the old binary slider");
  assert.match(userSettingsView, /css\/longtail-forge\.css\?v=10/, "User Settings CSS cache key should advance with the segmented theme controls");
  assert.match(userSettingsView, /js\/user-settings\.js\?v=6/, "User Settings script cache key should advance with the scoped three-way settings hydrator");
  assert.match(userSettingsScript, /^\(function attachUserSettingsPage\(\) \{[\s\S]*\}\)\(\);\s*$/, "User Settings should be scoped so theme helper names cannot collide with navigation.js");
  assert.match(userSettingsScript, /putJson\("\/api\/user\/settings", \{ themeMode, themeAutoSource \}\)/, "User Settings should save mode and source together");
  assert.match(userSettingsScript, /themeAutoSourceControls\.hidden = normalizedThemeMode !== "auto"/, "auto-source controls should only show for auto mode");
  assert.match(userSettingsScript, /input\.disabled = normalizedThemeMode !== "auto"/, "auto-source inputs should only be active for auto mode");
  assert.match(userSettingsScript, /query\.addEventListener\("change", listener\)/, "User Settings should re-resolve auto mode when OS scheme changes");
  assert.match(css, /\.theme-mode-control,[\s\S]*\.theme-auto-source-options/, "CSS should style the segmented theme controls");
  assert.match(css, /\.settings-segmented-option input:checked \+ span/, "CSS should show the selected segmented option");
  assert.match(css, /html\[data-theme-mode="auto"\]\[data-theme-auto-source="system"\]/, "CSS should resolve auto mode before theme-init finishes");

  assert.match(moduleContract, /The only shipped auto source is `system`/, "tracked docs should record the OS-match auto source");
  assert.match(moduleContract, /Sunrise\/sunset theme automation is deferred/, "tracked docs should record the sunrise/sunset deferral");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the theme auto mode slice");
  assert.match(regressionSuite, /scripts\/user-theme-auto-mode-regression\.mjs/, "regression suite should include theme auto mode coverage");
}

async function assertMigrationAndColumn() {
  const migrationRows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '067';
`);
  assert.deepEqual(migrationRows[0], {
    version: "067",
    module_id: "core",
    name: "user_theme_auto_source",
  });

  const columns = await querySql("PRAGMA table_info(users);");
  const column = columns.find((item) => item.name === "theme_auto_source");

  assert.ok(column, "users table should include theme_auto_source");
  assert.equal(column.type, "TEXT");
  assert.equal(column.notnull, 1);
  assert.equal(column.dflt_value, "'system'");
}

async function assertSettingsDefaultAndSave(session) {
  const initial = await usersService.readSettings(session);
  assert.equal(initial.themeMode, "light", "theme mode should still default to light");
  assert.equal(initial.themeAutoSource, "system", "theme auto source should default to system");

  const auto = await usersService.saveSettings({ themeMode: "auto", themeAutoSource: "system" }, session);
  assert.equal(auto.themeMode, "auto", "saveSettings should persist auto mode");
  assert.equal(auto.themeAutoSource, "system", "saveSettings should persist the OS-match source");
  assert.deepEqual(await readStoredTheme(session.user_id), {
    theme_mode: "auto",
    theme_auto_source: "system",
  });

  const invalid = await usersService.saveSettings({ themeMode: "sunrise", themeAutoSource: "sunset" }, session);
  assert.equal(invalid.themeMode, "light", "invalid theme mode should normalize to light");
  assert.equal(invalid.themeAutoSource, "system", "unsupported auto sources should normalize to system");
  assert.deepEqual(await readStoredTheme(session.user_id), {
    theme_mode: "light",
    theme_auto_source: "system",
  });
}

async function assertProtectedHtmlInitialTheme(session) {
  await usersService.saveSettings({ themeMode: "dark", themeAutoSource: "system" }, session);
  const darkResult = await staticService.read("/user-settings.html", session);
  const darkHtml = String(darkResult.contents);

  assert.equal(darkResult.statusCode, 200);
  assert.equal(darkResult.headers["Cache-Control"], "no-store", "protected User Settings HTML should not be cached stale");
  assert.match(darkHtml, /<html lang="en" data-theme-mode="dark" data-theme-auto-source="system" data-theme="dark">/, "protected HTML should carry dark theme attributes before scripts");
  assert.match(darkHtml, /<style data-theme-critical>/, "protected HTML should include critical theme CSS");
  assert.match(darkHtml, /html\[data-theme="dark"\] \{ color-scheme: dark; background: #000000; \}/, "critical CSS should avoid white background before dark CSS loads");

  await usersService.saveSettings({ themeMode: "auto", themeAutoSource: "system" }, session);
  const autoResult = await staticService.read("/user-settings.html", session);
  const autoHtml = String(autoResult.contents);

  assert.match(autoHtml, /<html lang="en" data-theme-mode="auto" data-theme-auto-source="system" data-theme="light">/, "auto mode protected HTML should carry stored auto mode and a light default");
  assert.match(autoHtml, /@media \(prefers-color-scheme: dark\) \{ html\[data-theme-mode="auto"\]\[data-theme-auto-source="system"\] \{ color-scheme: dark; background: #000000; \} \}/, "critical CSS should avoid white background for OS-dark auto mode");
}

async function readStoredTheme(userId) {
  const rows = await querySql(`
SELECT theme_mode, theme_auto_source
FROM users
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);

  return rows[0] || {};
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
