import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.2";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const scannerDocs = readText("docs/file-scanner-setup.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const envExample = readText(".env.example");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the scanner setup docs version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the scanner setup docs version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the scanner setup docs version");

assert.match(scannerDocs, /^# File Scanner Setup/m, "scanner setup docs should exist");
assert.match(scannerDocs, /## Linux Service Setup[\s\S]*LONGTAIL_FILE_SCANNER=clamd[\s\S]*LONGTAIL_CLAMD_HOST=127\.0\.0\.1[\s\S]*LONGTAIL_CLAMD_PORT=3310/, "scanner docs should cover Linux clamd service setup");
assert.match(scannerDocs, /## Windows Executable Path Setup[\s\S]*LONGTAIL_FILE_SCANNER=clamscan[\s\S]*LONGTAIL_CLAMSCAN_PATH=C:\\Program Files\\ClamAV\\clamscan\.exe/, "scanner docs should cover Windows clamscan path setup");
assert.match(scannerDocs, /## macOS\/Homebrew Setup[\s\S]*\/opt\/homebrew\/bin\/clamscan[\s\S]*\/usr\/local\/bin\/clamscan/, "scanner docs should cover macOS Homebrew paths");
assert.match(scannerDocs, /## When The Scanner Is Unavailable[\s\S]*quarantined[\s\S]*scan_status = error/i, "scanner docs should explain unavailable scanner quarantine disposition");
assert.match(scannerDocs, /Unavailable scanners do not silently pass files and do not delete stored bytes/i, "scanner docs should explain that unavailable scanners do not auto-delete stored bytes");
assert.match(scannerDocs, /`none`[\s\S]*not_required[\s\S]*`noop`[\s\S]*pass-through/, "scanner docs should distinguish none from noop");
assert.match(scannerDocs, /no active `LONGTAIL_CLAMD_SOCKET` setting/, "scanner docs should explicitly defer socket scanning");
assert.match(scannerDocs, /without exposing executable paths, hostnames, ports, sockets, raw scanner output, storage keys, protected paths, signed URLs, or raw environment values/, "scanner docs should document scanner/storage redaction boundaries");

assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*file-scanner-setup\.md/, "runtime docs should link ClamAV setup guidance");
assert.match(runtimeDocs, /Live settings:[\s\S]*`LONGTAIL_FILE_SCANNER`[\s\S]*`LONGTAIL_CLAMSCAN_PATH`[\s\S]*`LONGTAIL_CLAMD_HOST`[\s\S]*`LONGTAIL_CLAMD_PORT`/, "runtime docs should mark scanner settings live");
assert.match(runtimeDocs, /Deferred setting:[\s\S]*no `LONGTAIL_CLAMD_SOCKET` key is active/, "runtime docs should mark socket scanning deferred");
assert.match(sqliteDocs, /file-scanner-setup\.md[\s\S]*Unavailable ClamAV scanners quarantine files for review/, "SQLite docs should point to scanner setup and unavailable behavior");
assert.match(envExample, /docs\/file-scanner-setup\.md[\s\S]*Optional live settings when LONGTAIL_FILE_SCANNER=clamd[\s\S]*Optional live setting when LONGTAIL_FILE_SCANNER=clamscan/, ".env.example should point operators to scanner docs and mark scanner keys live");

assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.22\.15 - Scanner setup docs and ClamAV closeout/, "live roadmap should not keep the completed scanner setup closeout slice open");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the scanner setup docs slice");

for (const scriptName of [
  "file-scanner-mode-resolver-regression.mjs",
  "file-scanner-health-diagnostics-regression.mjs",
  "file-clamscan-adapter-regression.mjs",
  "file-clamd-adapter-regression.mjs",
  "file-scanner-setup-docs-regression.mjs",
]) {
  assert.match(
    regressionSuite,
    new RegExp(`scripts/${escapeRegExp(scriptName)}`),
    `${scriptName} should be wired into the regression suite`,
  );
}

console.log("File scanner setup docs regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
