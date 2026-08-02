import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const roadmap = readText("ROADMAP.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const workspaceSettingsView = readText("views/protected/workspace-settings.html");
const settingsHostScript = readText("public/js/shared/settings-host.js");
const workspaceSettingsScript = readText("public/js/workspace-settings.js");
const styles = readText("public/css/longtail-forge.css");


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

assert.match(workspaceSettingsView, /data-settings-host="workspace"/, "Workspace Settings should expose the minimal framework host");
assert.match(settingsHostScript, /runtimeDiagnosticsFieldset/, "Workspace Settings should include a runtime diagnostics fieldset");
assert.match(settingsHostScript, /runtimeDiagnosticsSummary/, "Workspace Settings should include the diagnostics summary target");
assert.match(settingsHostScript, /runtimeDiagnosticsWarnings/, "Workspace Settings should include diagnostics warning copy target");
assert.match(settingsHostScript, /jobObservabilityFieldset/, "Workspace Settings should include a Jobs readout fieldset");
assert.match(workspaceSettingsView, /js\/workspace-settings\.js/, "Workspace Settings should load the diagnostics readout script cache key");
assert.equal(existsSync(path.join(root, "views/protected/runtime-diagnostics.html")), false, "runtime diagnostics should not add a new dashboard page");

assert.match(workspaceSettingsScript, /loadRuntimeDiagnostics\(\)/, "Workspace Settings should load runtime diagnostics separately from editable settings");
assert.match(workspaceSettingsScript, /getJson\("\/api\/runtime-diagnostics", \{ cache: "no-store" \}\)/, "Workspace Settings should consume the protected diagnostics route");
assert.match(workspaceSettingsScript, /\/api\/jobs\/status/, "Workspace Settings should consume the protected jobs readout route");
assert.match(workspaceSettingsScript, /Database Provider/, "readout should render database provider");
assert.match(workspaceSettingsScript, /SQLite Journal/, "readout should render SQLite journal mode");
assert.match(workspaceSettingsScript, /Foreign Keys/, "readout should render foreign-key status");
assert.match(workspaceSettingsScript, /Database File/, "readout should render safe database file location");
assert.match(workspaceSettingsScript, /Data Directory/, "readout should render safe data directory location");
assert.match(workspaceSettingsScript, /Storage Provider/, "readout should render storage provider");
assert.match(workspaceSettingsScript, /Storage Status/, "readout should render storage provider availability");
assert.match(workspaceSettingsScript, /Local Storage Root/, "readout should render safe local storage root location");
assert.match(workspaceSettingsScript, /Scanner Mode/, "readout should render scanner mode");
assert.match(workspaceSettingsScript, /Worker Mode/, "readout should render worker mode");
assert.match(workspaceSettingsScript, /Worker State/, "readout should render worker state");
assert.match(workspaceSettingsScript, /Pending/, "readout should render pending job count");
assert.match(workspaceSettingsScript, /Dead-letter/, "readout should render dead-letter job count");
assert.match(workspaceSettingsScript, /Confirm redacted runtime paths are on local or attached storage/, "readout should warn when paths need operator review");
assert.match(workspaceSettingsScript, /Storage provider health is unavailable/, "readout should warn when storage provider health is unavailable");
assert.doesNotMatch(workspaceSettingsScript, /DATABASE_URL|process\.env|localRoot|storageKey|signedUrl|masterKey|SECURE_NOTES|CLAMD|CLAMSCAN/i, "Workspace Settings readout must not expose raw env, storage, scanner, or key internals");

assert.match(styles, /\.runtime-diagnostics-readout/, "styles should cover the runtime diagnostics fieldset");
assert.match(styles, /\.runtime-diagnostics-warning/, "styles should cover runtime diagnostics warnings");

assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "live roadmap should not carry completed-history breadcrumbs");

console.log("SQLite small-office readout regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
