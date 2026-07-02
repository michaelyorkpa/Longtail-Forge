import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.4";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const workspaceSettingsView = readText("views/protected/workspace-settings.html");
const workspaceSettingsScript = readText("public/js/workspace-settings.js");
const styles = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the SQLite small-office readout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the SQLite small-office readout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the SQLite small-office readout version");

assert.match(sqliteDocs, /# SQLite Small-Office Mode/, "SQLite small-office docs should exist");
assert.match(sqliteDocs, /one Longtail Forge app process\/server/i, "SQLite docs should state one app server/process");
assert.match(sqliteDocs, /local or attached storage/i, "SQLite docs should state local or attached storage");
assert.match(sqliteDocs, /Multiple Longtail Forge app servers sharing the same SQLite file/i, "SQLite docs should reject multiple shared SQLite app servers");
assert.match(sqliteDocs, /Backups[\s\S]*database file[\s\S]*WAL/i, "SQLite docs should cover database and WAL backup expectations");
assert.match(sqliteDocs, /File Scanning[\s\S]*optional/i, "SQLite docs should cover optional scanner expectations");
assert.match(sqliteDocs, /Memory And Disk Guidance[\s\S]*SSD/i, "SQLite docs should cover memory and disk guidance");
assert.match(sqliteDocs, /Workspace Settings[\s\S]*Runtime Diagnostics/i, "SQLite docs should document the admin readout placement");
assert.match(sqliteDocs, /does not edit runtime configuration/i, "SQLite docs should keep the readout diagnostic only");

assert.match(runtimeDocs, /sqlite-small-office-mode\.md/, "runtime docs should link the SQLite small-office mode contract");
assert.match(databaseDocs, /sqlite-small-office-mode\.md/, "database docs should link the SQLite small-office mode contract");

assert.match(workspaceSettingsView, /data-runtime-diagnostics-fieldset/, "Workspace Settings should include a runtime diagnostics fieldset");
assert.match(workspaceSettingsView, /data-runtime-diagnostics-summary/, "Workspace Settings should include the diagnostics summary target");
assert.match(workspaceSettingsView, /data-runtime-diagnostics-warnings/, "Workspace Settings should include diagnostics warning copy target");
assert.match(workspaceSettingsView, /js\/workspace-settings\.js\?v=4/, "Workspace Settings should load the diagnostics readout script cache key");
assert.equal(existsSync(path.join(root, "views/protected/runtime-diagnostics.html")), false, "runtime diagnostics should not add a new dashboard page");

assert.match(workspaceSettingsScript, /loadRuntimeDiagnostics\(\)/, "Workspace Settings should load runtime diagnostics separately from editable settings");
assert.match(workspaceSettingsScript, /getJson\("\/api\/runtime-diagnostics", \{ cache: "no-store" \}\)/, "Workspace Settings should consume the protected diagnostics route");
assert.match(workspaceSettingsScript, /Database Provider/, "readout should render database provider");
assert.match(workspaceSettingsScript, /SQLite Journal/, "readout should render SQLite journal mode");
assert.match(workspaceSettingsScript, /Foreign Keys/, "readout should render foreign-key status");
assert.match(workspaceSettingsScript, /Database File/, "readout should render safe database file location");
assert.match(workspaceSettingsScript, /Data Directory/, "readout should render safe data directory location");
assert.match(workspaceSettingsScript, /Storage Provider/, "readout should render storage provider");
assert.match(workspaceSettingsScript, /Scanner Mode/, "readout should render scanner mode");
assert.match(workspaceSettingsScript, /Worker Mode/, "readout should render worker mode");
assert.match(workspaceSettingsScript, /Worker State/, "readout should render worker state");
assert.match(workspaceSettingsScript, /Confirm redacted runtime paths are on local or attached storage/, "readout should warn when paths need operator review");
assert.doesNotMatch(workspaceSettingsScript, /DATABASE_URL|process\.env|localRoot|storageKey|signedUrl|masterKey|SECURE_NOTES|CLAMD|CLAMSCAN/i, "Workspace Settings readout must not expose raw env, storage, scanner, or key internals");

assert.match(styles, /\.runtime-diagnostics-readout/, "styles should cover the runtime diagnostics fieldset");
assert.match(styles, /\.runtime-diagnostics-warning/, "styles should cover runtime diagnostics warnings");

assert.match(regressionSuite, /scripts\/sqlite-small-office-readout-regression\.mjs/, "regression suite should include SQLite small-office readout coverage");
assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed SQLite small-office readout branch");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the SQLite small-office readout slice");

console.log("SQLite small-office readout regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
