import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const appVersion = "0.33.5.28.2";
const modeArgIndex = process.argv.indexOf("--mode");
const scannerSecretHost = "scanner-secret-host.internal";
const scannerSecretExecutable = "scanner-secret-clamscan.exe";

if (modeArgIndex !== -1) {
  await runDiagnosticsScenario(process.argv[modeArgIndex + 1] || "none");
  process.exit(0);
}

assertStaticContracts();

const noneDiagnostics = runDiagnosticsChild("none");
assert.equal(noneDiagnostics.scanner.mode, "none", "none mode should be visible in runtime diagnostics");
assert.equal(noneDiagnostics.scanner.health.status, "disabled", "none mode should report disabled scanner health");
assert.equal(noneDiagnostics.scanner.health.available, false, "none mode should not report real scanner availability");
assert.match(noneDiagnostics.scanner.health.warning, /disabled[\s\S]*not required/i, "none mode should warn admins that scanning is disabled");
assertSafeScannerDiagnostics(noneDiagnostics);

const noopDiagnostics = runDiagnosticsChild("noop");
assert.equal(noopDiagnostics.scanner.mode, "noop", "noop mode should be visible in runtime diagnostics");
assert.equal(noopDiagnostics.scanner.health.status, "pass_through", "noop mode should report pass-through scanner health");
assert.equal(noopDiagnostics.scanner.health.available, false, "noop mode should not report real scanner availability");
assert.match(noopDiagnostics.scanner.health.warning, /pass-through[\s\S]*external scan/i, "noop mode should warn admins that files are trusted without an external scan");
assertSafeScannerDiagnostics(noopDiagnostics);

const clamdDiagnostics = runDiagnosticsChild("clamd");
assert.equal(clamdDiagnostics.scanner.mode, "clamd", "clamd mode should remain visible by safe mode name");
assert.equal(clamdDiagnostics.scanner.health.status, "unavailable", "unreachable clamd services should report unavailable health");
assert.equal(clamdDiagnostics.scanner.health.available, false, "unreachable clamd services should not report availability");
assert.match(clamdDiagnostics.scanner.health.warning, /unavailable[\s\S]*configured mode/i, "clamd diagnostics should fail clearly without leaking host or port config");
assertSafeScannerDiagnostics(clamdDiagnostics);

const clamscanDiagnostics = runDiagnosticsChild("clamscan");
assert.equal(clamscanDiagnostics.scanner.mode, "clamscan", "clamscan mode should remain visible by safe mode name");
assert.equal(clamscanDiagnostics.scanner.health.status, "unavailable", "missing clamscan executables should report unavailable health");
assert.equal(clamscanDiagnostics.scanner.health.available, false, "missing clamscan executables should not report availability");
assert.match(clamscanDiagnostics.scanner.health.warning, /unavailable[\s\S]*configured mode/i, "clamscan diagnostics should fail clearly without leaking executable paths");
assertSafeScannerDiagnostics(clamscanDiagnostics);

console.log("File scanner health diagnostics regression passed.");

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const scannerAdapterSource = readText("src/core/files/scanner-adapter.js");
  const runtimeDiagnosticsSource = readText("src/services/runtime-diagnostics.service.js");
  const workspaceSettingsScript = readText("public/js/workspace-settings.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the scanner health diagnostics version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the scanner health diagnostics version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the scanner health diagnostics version");

  assert.match(scannerAdapterSource, /async health\(\)[\s\S]*status: "disabled"/, "none scanner should expose safe disabled health");
  assert.match(scannerAdapterSource, /async health\(\)[\s\S]*status: "pass_through"/, "noop scanner should expose safe pass-through health");
  assert.match(runtimeDiagnosticsSource, /readSafeScannerHealth/, "runtime diagnostics should own safe scanner health reads");
  assert.match(runtimeDiagnosticsSource, /resolveConfiguredFileScannerAdapter/, "runtime diagnostics should resolve scanner health through Files service");
  assert.match(runtimeDiagnosticsSource, /\.health\(\)/, "runtime diagnostics should call scanner adapter health when available");
  assert.match(runtimeDiagnosticsSource, /scannerHealthWarning/, "runtime diagnostics should derive safe scanner warning copy");
  assert.doesNotMatch(runtimeDiagnosticsSource, /process\.env|clamdHost|clamdPort|clamscanPath|signedUrl|storageKey|protectedPath|masterKey/i, "runtime diagnostics source must not expose scanner internals, raw env, signed URLs, storage keys, or secret material");
  assert.match(workspaceSettingsScript, /Scanner Status/, "Workspace Settings should render scanner availability status");
  assert.match(workspaceSettingsScript, /formatScannerStatus/, "Workspace Settings should format scanner health safely");
  assert.match(workspaceSettingsScript, /scanner\.health\?\.warning/, "Workspace Settings warnings should consume the server-provided scanner warning");
  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*scanner mode[\s\S]*scanner health[\s\S]*disabled/, "runtime docs should document scanner health diagnostics");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the scanner health diagnostics slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-scanner-health-diagnostics-regression\.mjs/, "regression suite should include scanner health diagnostics coverage");
}

async function runDiagnosticsScenario(mode) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `ltf-file-scanner-health-${mode}-`));

  process.env.LONGTAIL_DATA_DIR = tempDir;
  process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, `longtail-forge-file-scanner-health-${mode}.db`);
  process.env.LONGTAIL_FILE_SCANNER = mode;
  process.env.LONGTAIL_CLAMD_HOST = scannerSecretHost;
  process.env.LONGTAIL_CLAMD_PORT = "3310";
  process.env.LONGTAIL_CLAMSCAN_PATH = path.join(tempDir, scannerSecretExecutable);
  process.env.SUPER_ADMIN_PASSWORD = `File-Scanner-Health-Test-${randomUUID()}`;

  const { initializeDatabase, closeDatabase, db } = await import("../src/db/index.js");
  const { runtimeDiagnosticsService } = await import("../src/services/runtime-diagnostics.service.js");

  try {
    await initializeDatabase();
    const session = await readSeedSession(db);
    const diagnostics = await runtimeDiagnosticsService.read(session);

    console.log(JSON.stringify(diagnostics));
  } finally {
    await closeDatabase();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function readSeedSession(db) {
  const admin = await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  assert.ok(admin?.user_id, "fresh database should seed a protected admin");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: admin.home_workspace_id,
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };
}

function runDiagnosticsChild(mode) {
  const child = spawnSync(process.execPath, [scriptPath, "--mode", mode], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
}

function assertSafeScannerDiagnostics(diagnostics) {
  const serialized = JSON.stringify(diagnostics);

  assert.doesNotMatch(serialized, /LONGTAIL_CLAMD|LONGTAIL_CLAMSCAN|CLAMD_HOST|CLAMSCAN_PATH/i, "diagnostics should not expose scanner env variable names");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(scannerSecretHost), "i"), "diagnostics should not expose scanner hostnames");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(scannerSecretExecutable), "i"), "diagnostics should not expose scanner executable paths");
  assert.doesNotMatch(serialized, /signedUrl|storageKey|protectedPath|masterKey/i, "diagnostics should not expose file storage or secret internals");
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "SUPER_ADMIN_PASSWORD"
    ) {
      delete env[key];
    }
  }

  return env;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
