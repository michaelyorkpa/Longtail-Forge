import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.6";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-external-links-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-external-links.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-External-Links-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const migrationSql = readText("src/db/migrations/066_user_markdown_link_preference.sql");
const usersRepo = readText("src/repositories/users.repo.js");
const normalizers = readText("src/utils/normalizers.js");
const usersServiceSource = readText("src/services/users.service.js");
const userSettingsView = readText("views/protected/user-settings.html");
const userSettingsScript = readText("public/js/user-settings.js");
const notesScript = readText("public/js/notes.js");
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { usersService } = await import("../src/services/users.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertMigrationAndColumn();
  await assertSettingsDefaultAndSave(session);
  await assertServerRenderedHtmlIsUserAgnostic(session);
  await assertIntegrity();

  console.log("Notes external Markdown links preference regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the external Markdown links preference version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the external Markdown links preference version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the external Markdown links preference version");

  assert.match(migrationSql, /ADD COLUMN open_external_links_new_tab INTEGER NOT NULL DEFAULT 0 CHECK \(open_external_links_new_tab IN \(0, 1\)\)/, "migration should add the default-off user preference column");
  assert.match(usersRepo, /open_external_links_new_tab/, "users repository should select the Markdown link preference column");
  assert.match(usersRepo, /function updateOpenExternalLinksNewTab/, "users repository should expose a focused preference writer");
  assert.match(normalizers, /function normalizeBooleanPreference/, "normalizers should expose a boolean preference normalizer");
  assert.match(normalizers, /openExternalLinksNewTab:\s*normalizeBooleanPreference\(row\.open_external_links_new_tab\)/, "user app values should map the preference to a boolean");
  assert.match(usersServiceSource, /openExternalLinksNewTab:\s*appUser\.openExternalLinksNewTab/, "readSettings should return the Markdown preference");
  assert.match(usersServiceSource, /Object\.hasOwn\(payload, "openExternalLinksNewTab"\)/, "saveSettings should handle the Markdown preference");
  assert.match(usersServiceSource, /metadata\.setting_names\.push\("openExternalLinksNewTab"\)/, "saveSettings audit metadata should name the Markdown preference");

  assert.match(userSettingsView, /<legend>Markdown Rendering<\/legend>/, "User Settings should expose the Markdown Rendering fieldset");
  assert.match(userSettingsView, /data-open-external-links-new-tab/, "User Settings should expose the preference toggle");
  assert.match(userSettingsView, /js\/user-settings\.js\?v=6/, "User Settings script cache key should advance");
  assert.match(userSettingsScript, /OPEN_EXTERNAL_LINKS_STORAGE_KEY/, "User Settings should cache the Markdown preference for Notes fallback reads");
  assert.match(userSettingsScript, /putJson\("\/api\/user\/settings", \{ openExternalLinksNewTab \}\)/, "User Settings should save the preference through the user settings route");
  assert.match(css, /\.settings-checkbox-line\s*\{[\s\S]*display:\s*inline-flex;/, "settings checkbox rows should have stable compact styling");

  assert.match(notesScript, /OPEN_EXTERNAL_LINKS_STORAGE_KEY/, "Notes should read the cached Markdown link preference");
  assert.match(notesScript, /await Promise\.all\(\[loadMarkdownRenderingPreference\(\), loadTags\(\), loadCollections\(\), loadNotes\(\)\]\)/, "Notes should load the preference before rendering detail HTML");
  assert.match(notesScript, /body\.innerHTML = note\.body_html \|\| "";[\s\S]*applyExternalMarkdownLinkPreference\(body\);/, "saved Note detail should post-process rendered Markdown after injection");
  assert.match(notesScript, /preview\.innerHTML = result\.bodyHtml \|\| "";[\s\S]*applyExternalMarkdownLinkPreference\(preview\);/, "live preview should post-process rendered Markdown after injection");
  assert.match(notesScript, /container\.querySelectorAll\("a\[href\]"\)/, "Notes post-processing should inspect anchors only");
  assert.match(notesScript, /const parsed = new window\.URL\(value\);[\s\S]*parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/, "Notes should only classify absolute http(s) URLs as external links");
  assert.doesNotMatch(notesScript, /new URL\(value,\s*window\.location\.href\)/, "relative app links must not be treated as external links");
  assert.match(notesScript, /anchor\.setAttribute\("target", "_blank"\)/, "enabled preference should open external links in a new tab");
  assert.match(notesScript, /anchor\.setAttribute\("rel", "noopener noreferrer"\)/, "enabled preference should protect new-tab external links");
  assert.match(notesScript, /anchor\.removeAttribute\("target"\)/, "disabled preference should leave external links as same-tab anchors");

  assert.match(regressionSuite, /scripts\/notes-external-markdown-links-preference-regression\.mjs/, "regression suite should include this preference coverage");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the external Markdown links preference slice");
}

async function assertMigrationAndColumn() {
  const migrationRows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '066';
`);
  assert.deepEqual(migrationRows[0], {
    version: "066",
    module_id: "core",
    name: "user_markdown_link_preference",
  });

  const columns = await querySql("PRAGMA table_info(users);");
  const column = columns.find((item) => item.name === "open_external_links_new_tab");

  assert.ok(column, "users table should include the Markdown link preference column");
  assert.equal(column.type, "INTEGER");
  assert.equal(column.notnull, 1);
  assert.equal(column.dflt_value, "0");
}

async function assertSettingsDefaultAndSave(session) {
  const initial = await usersService.readSettings(session);
  assert.equal(initial.openExternalLinksNewTab, false, "preference should default off");

  const enabled = await usersService.saveSettings({ openExternalLinksNewTab: true }, session);
  assert.equal(enabled.openExternalLinksNewTab, true, "saveSettings should return the enabled preference");
  assert.equal((await usersService.readSettings(session)).openExternalLinksNewTab, true, "readSettings should return the saved enabled preference");
  await assertStoredPreference(session.user_id, 1);

  const disabled = await usersService.saveSettings({ openExternalLinksNewTab: false }, session);
  assert.equal(disabled.openExternalLinksNewTab, false, "saveSettings should return the disabled preference");
  assert.equal((await usersService.readSettings(session)).openExternalLinksNewTab, false, "readSettings should return the saved disabled preference");
  await assertStoredPreference(session.user_id, 0);
}

async function assertServerRenderedHtmlIsUserAgnostic(session) {
  const markdown = [
    "[External](https://example.com/docs)",
    "",
    "[Mail](mailto:user@example.com)",
    "",
    "[Internal](/tasks.html)",
    "",
    "[[Recovery Plan]]",
  ].join("\n");
  const created = await notesService.create({
    body_markdown: markdown,
    title: "External link preference",
  }, session);
  const cachedHtml = created.note.body_html;

  assert.match(cachedHtml, /<a href="https:\/\/example\.com\/docs">External<\/a>/, "server-rendered external links should remain plain anchors");
  assert.match(cachedHtml, /<a href="mailto:user@example\.com">Mail<\/a>/, "mailto links should remain plain anchors");
  assert.match(cachedHtml, /<a href="\/tasks\.html">Internal<\/a>/, "relative app links should remain plain anchors");
  assert.match(cachedHtml, /<span class="note-wiki-link" data-note-title="Recovery Plan">Recovery Plan<\/span>/, "wiki links should remain span-based");
  assert.doesNotMatch(cachedHtml, /target="_blank"|rel="noopener noreferrer"/, "server-rendered HTML should not include per-user tab preference attributes");

  await usersService.saveSettings({ openExternalLinksNewTab: true }, session);
  const enabledRead = await notesService.read(created.note.note_id, session);
  assert.equal(enabledRead.note.body_html, cachedHtml, "enabling the preference must not change cached Note body HTML");

  await usersService.saveSettings({ openExternalLinksNewTab: false }, session);
  const disabledRead = await notesService.read(created.note.note_id, session);
  assert.equal(disabledRead.note.body_html, cachedHtml, "disabling the preference must not change cached Note body HTML");
}

async function assertStoredPreference(userId, expected) {
  const rows = await querySql(`
SELECT open_external_links_new_tab
FROM users
WHERE user_id = ${sqlText(userId)}
LIMIT 1;
`);
  assert.equal(rows[0]?.open_external_links_new_tab, expected);
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
