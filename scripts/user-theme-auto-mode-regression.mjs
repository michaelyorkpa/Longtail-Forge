import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { fixtureString, workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-theme-auto-mode-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-theme-auto-mode.db");
process.env.SUPER_ADMIN_PASSWORD = "Theme-Auto-Mode-Test-123!";

const migrationSql = readText("src/db/migrations/067_user_theme_auto_source.sql");
const normalizers = readText("src/utils/normalizers.js");
const usersRepo = readText("src/repositories/users.repo.js");
const usersServiceSource = readText("src/services/users.service.js");
const authServiceSource = readText("src/services/auth.service.js");
const appShellServiceSource = readText("src/services/app-shell.service.js");
const cookiesSource = readText("src/security/cookies.js");
const authRoutes = readText("src/routes/auth.routes.js");
const usersRoutes = readText("src/routes/users.routes.js");
const configSource = readText("src/config.js");
const staticServiceSource = readText("src/services/static.service.js");
const staticRoutesSource = readText("src/routes/static.routes.js");
const themeInitScript = readText("public/js/theme-init.js");
const navigationScript = readText("public/js/navigation.js");
const loginScript = readText("public/js/login.js");
const userSettingsView = readText("views/protected/user-settings.html");
const settingsHostScript = readText("public/js/shared/settings-host.js");
const userSettingsScript = readText("public/js/user-settings.js");
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { staticService } = await import("../src/services/static.service.js");
const { usersService } = await import("../src/services/users.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const workspaceId = await readWorkspaceId();
  const session = await readProtectedSession(workspaceId);

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
  assert.match(cookiesSource, /function buildThemeAutoSourceCookie/, "cookie security should build a theme auto-source cookie");
  assert.match(cookiesSource, /function buildExpiredThemeAutoSourceCookie/, "cookie security should expire the theme auto-source cookie");
  assert.match(authRoutes, /buildThemeAutoSourceCookie\(result\.themeAutoSource, request\)/, "login should set the theme auto-source cookie");
  assert.match(authRoutes, /buildExpiredThemeAutoSourceCookie\(request\)/, "logout should expire the theme auto-source cookie");
  assert.match(usersRoutes, /buildThemeAutoSourceCookie\(result\.themeAutoSource, request\)/, "user settings reads/writes should refresh the theme auto-source cookie");
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

  assert.match(userSettingsView, /data-settings-host="user"/, "User Settings should expose the minimal framework host");
  assert.match(settingsHostScript, /value: "light", label: "Light"/, "User Settings should expose Light mode");
  assert.match(settingsHostScript, /value: "auto", label: "Auto"/, "User Settings should expose Auto mode");
  assert.match(settingsHostScript, /value: "dark", label: "Dark"/, "User Settings should expose Dark mode");
  assert.match(settingsHostScript, /themeAutoSourceControls/, "User Settings should expose auto-source controls");
  assert.match(settingsHostScript, /value: "system", label: "Match operating system"/, "User Settings should expose OS-match auto source");
  assert.match(settingsHostScript, /shellClassName: "theme-mode-field",[\s\S]*controlsClassName: "theme-mode-control"/, "Theme mode should keep its field shell separate from the bounded segmented control");
  assert.match(settingsHostScript, /shellClassName: "theme-auto-source",[\s\S]*controlsClassName: "theme-auto-source-options"/, "Auto source should keep its field shell separate from its subordinate segmented control");
  assert.match(settingsHostScript, /if \(options\.controlsClassName\)[\s\S]*fieldElement\.querySelectorAll\("label"\)[\s\S]*fieldElement\.replaceChildren\([\s\S]*fieldElement\.viewParts\.label,[\s\S]*controls,[\s\S]*fieldElement\.viewParts\.message/, "Settings host fields should move radio labels into an explicitly requested controls wrapper");
  assert.doesNotMatch(settingsHostScript, /data-theme-mode-toggle|theme-mode-switch|theme-switch-track/, "User Settings should not keep the old binary slider");
  assert.match(userSettingsView, /css\/longtail-forge\.css/, "User Settings CSS cache key should advance with the segmented theme controls");
  assert.match(userSettingsView, /js\/user-settings\.js/, "User Settings script cache key should advance with the scoped three-way settings hydrator");
  assert.match(userSettingsScript, /^\(function attachUserSettingsPage\(\) \{[\s\S]*\}\)\(\);\s*$/, "User Settings should be scoped so theme helper names cannot collide with navigation.js");
  assert.match(userSettingsScript, /putJson\("\/api\/user\/settings", \{[\s\S]*themeAutoSource: getSelectedThemeAutoSource\(\)[\s\S]*themeMode: getSelectedThemeMode\(\)/, "Universal User Settings Save should include mode and source together");
  assert.match(userSettingsScript, /themeAutoSourceControls\.hidden = normalizedThemeMode !== "auto"/, "auto-source controls should only show for auto mode");
  assert.match(userSettingsScript, /input\.disabled = normalizedThemeMode !== "auto"/, "auto-source inputs should only be active for auto mode");
  assert.match(userSettingsScript, /query\.addEventListener\("change", listener\)/, "User Settings should re-resolve auto mode when OS scheme changes");
  assert.match(css, /\.theme-mode-control,[\s\S]*\.theme-auto-source-options/, "CSS should style the segmented theme controls");
  assert.match(css, /\.view-field-grid > \.theme-mode-field,[\s\S]*\.view-field-grid > \.theme-auto-source[\s\S]*flex: 0 1 auto/, "Theme fields should opt out of the shared full-width flex growth");
  assert.match(css, /\.theme-mode-control,[\s\S]*border: 1px solid var\(--color-border-strong\)/, "Theme segmented controls should retain a visible bounded border");
  assert.match(css, /\.settings-segmented-option input:checked \+ span/, "CSS should show the selected segmented option");
  assert.match(css, /html\[data-theme-mode="auto"\]\[data-theme-auto-source="system"\]/, "CSS should resolve auto mode before theme-init finishes");

  assert.match(moduleContract, /The only shipped auto source is `system`/, "tracked docs should record the OS-match auto source");
  assert.match(moduleContract, /Sunrise\/sunset theme automation is deferred/, "tracked docs should record the sunrise/sunset deferral");
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

/**
 * @param {import("../src/types/http-contracts.js").WorkspaceRequestSession} session
 */
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

/**
 * @param {import("../src/types/http-contracts.js").WorkspaceRequestSession} session
 */
async function assertProtectedHtmlInitialTheme(session) {
  await usersService.saveSettings({ themeMode: "dark", themeAutoSource: "system" }, session);
  const darkResult = await staticService.read("/user-settings.html", session);
  const darkHtml = String(darkResult.contents);

  assert.equal(darkResult.statusCode, 200);
  // staticService.read answers a union: its 401, 403, and 404 branches carry no
  // headers at all, so a served view is asserted to have them.
  const darkHeaders = darkResult.headers;
  assert.ok(darkHeaders, "a served protected view should carry response headers");
  assert.equal(darkHeaders["Cache-Control"], "no-store", "protected User Settings HTML should not be cached stale");
  assert.match(darkHtml, /<html lang="en" data-theme-mode="dark" data-theme-auto-source="system" data-theme="dark">/, "protected HTML should carry dark theme attributes before scripts");
  assert.match(darkHtml, /<style data-theme-critical>/, "protected HTML should include critical theme CSS");
  assert.match(darkHtml, /html\[data-theme="dark"\] \{ color-scheme: dark; background: #000000; \}/, "critical CSS should avoid white background before dark CSS loads");

  await usersService.saveSettings({ themeMode: "auto", themeAutoSource: "system" }, session);
  const autoResult = await staticService.read("/user-settings.html", session);
  const autoHtml = String(autoResult.contents);

  assert.match(autoHtml, /<html lang="en" data-theme-mode="auto" data-theme-auto-source="system" data-theme="light">/, "auto mode protected HTML should carry stored auto mode and a light default");
  assert.match(autoHtml, /@media \(prefers-color-scheme: dark\) \{ html\[data-theme-mode="auto"\]\[data-theme-auto-source="system"\] \{ color-scheme: dark; background: #000000; \} \}/, "critical CSS should avoid white background for OS-dark auto mode");
}

/** @param {string} userId */
async function readStoredTheme(userId) {
  const rows = await querySql(`
SELECT theme_mode, theme_auto_source
FROM users
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);

  return rows[0] || {};
}

/** @returns {Promise<string>} */
async function readWorkspaceId() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return fixtureString(requireFirstRow(rows, "workspace lookup").workspace_id, "workspace ID");
}

/** @param {string} workspaceId */
async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  // The hand-built session omitted ip_address, password_change_required,
  // session_mode, and home_workspace_id, none of which the published contract
  // treats as optional. The shared fixture supplies them and validates the row
  // at the read boundary, so usersService receives the same session shape a
  // route would hand it.
  return workspaceSessionFixture({
    ...requireFirstRow(rows, "protected user lookup"),
    active_workspace_id: workspaceId,
    workspace_id: workspaceId,
  });
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
