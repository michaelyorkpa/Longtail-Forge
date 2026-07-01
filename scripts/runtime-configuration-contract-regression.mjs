import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.19.9";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const envExample = readText(".env.example");
const gitignore = readText(".gitignore");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const configSource = readText("src/config.js");
const sessionsSource = readText("src/security/sessions.js");
const usersService = readText("src/services/users.service.js");
const secureCrypto = readText("src/modules/notes/secure-crypto.js");
const localStorageAdapter = readText("src/core/files/local-storage-adapter.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the runtime configuration slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the runtime configuration slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the runtime configuration slice version");

for (const heading of [
  "# App",
  "# Data",
  "# Database",
  "# SQLite",
  "# Future PostgreSQL",
  "# Initial bootstrap",
  "# Sessions / cookies",
  "# Secure notes",
  "# File storage",
  "# File scanning",
  "# Jobs / workers",
  "# Logging",
]) {
  assert.match(envExample, new RegExp(`^${escapeRegExp(heading)}$`, "m"), `.env.example should include ${heading}`);
}

for (const key of [
  "LONGTAIL_ENV=development",
  "LONGTAIL_PUBLIC_URL=http://localhost:8001",
  "HOST=0.0.0.0",
  "PORT=8001",
  "LONGTAIL_DATA_DIR=./data",
  "LONGTAIL_DATABASE_PROVIDER=sqlite",
  "LONGTAIL_DATABASE_FILE=./data/longtail-forge.db",
  "SQLITE_COMMAND=sqlite3",
  "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
  "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
  "LONGTAIL_SQLITE_BUSY_TIMEOUT_MS=5000",
  "LONGTAIL_INITIAL_WORKSPACE_NAME=Longtail Forge Workspace",
  "SUPER_ADMIN_USERNAME=support@longtailforge.local",
  "SUPER_ADMIN_DISPLAY_NAME=Super Admin",
  "SUPER_ADMIN_PASSWORD=",
  "LONGTAIL_SESSION_COOKIE_SECURE=false",
  "LONGTAIL_SESSION_COOKIE_SAMESITE=Lax",
  "LONGTAIL_SESSION_TTL_SECONDS=43200",
  "# LONGTAIL_SECURE_NOTES_MASTER_KEY=",
  "# SECURE_NOTES_MASTER_KEY=",
  "LONGTAIL_SECURE_NOTES_KEY_VERSION=v1",
  "LONGTAIL_STORAGE_PROVIDER=local",
  "LONGTAIL_LOCAL_STORAGE_ROOT=./data/files",
  "LONGTAIL_FILE_SCANNER=none",
  "LONGTAIL_WORKER_MODE=inline",
  "LONGTAIL_WORKER_ID=default",
  "LONGTAIL_JOB_POLL_INTERVAL_MS=5000",
  "LONGTAIL_JOB_LOCK_TTL_SECONDS=300",
  "LONGTAIL_LOG_LEVEL=info",
]) {
  assert.match(envExample, new RegExp(`^${escapeRegExp(key)}$`, "m"), `.env.example should document ${key}`);
}

for (const futureKey of [
  "# DATABASE_URL=",
  "# LONGTAIL_DATABASE_POOL_MIN=1",
  "# LONGTAIL_DATABASE_POOL_MAX=10",
  "# LONGTAIL_DATABASE_SSL=false",
  "# LONGTAIL_CLAMD_HOST=127.0.0.1",
  "# LONGTAIL_CLAMD_PORT=3310",
  "# LONGTAIL_CLAMSCAN_PATH=",
]) {
  assert.match(envExample, new RegExp(`^${escapeRegExp(futureKey)}$`, "m"), `.env.example should reserve ${futureKey}`);
}

assert.match(gitignore, /^\.env$/m, "real .env files should remain ignored");
assert.match(runtimeDocs, /Current Active Settings/, "runtime docs should separate active settings");
assert.match(runtimeDocs, /Reserved Settings/, "runtime docs should document future-only settings");
assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
assert.match(runtimeDocs, /`LONGTAIL_SQLITE_FOREIGN_KEYS`[\s\S]*Must stay enabled/, "runtime docs should document SQLite foreign-key enforcement");
assert.match(runtimeDocs, /`LONGTAIL_SQLITE_JOURNAL_MODE`[\s\S]*WAL is the default/, "runtime docs should document SQLite WAL mode");
assert.match(runtimeDocs, /`LONGTAIL_SQLITE_BUSY_TIMEOUT_MS`[\s\S]*busy timeout/, "runtime docs should document SQLite busy timeout");
assert.match(runtimeDocs, /Reserved settings may appear in `config` for readout consistency[\s\S]*does not implement PostgreSQL/, "runtime docs should keep future settings dormant");
assert.match(runtimeDocs, /Startup fails clearly when active settings are invalid/, "runtime docs should document validation");
assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed runtime configuration foundation branch");

assert.match(configSource, /function createConfig\(env = process\.env\)/, "config should expose a testable runtime config builder");
assert.match(configSource, /LONGTAIL_DATABASE_PROVIDER[\s\S]*DATABASE_PROVIDERS/, "config should validate the database provider");
assert.match(configSource, /LONGTAIL_SQLITE_FOREIGN_KEYS/, "config should read the SQLite foreign-key setting");
assert.match(configSource, /LONGTAIL_SQLITE_JOURNAL_MODE/, "config should read the SQLite journal mode setting");
assert.match(configSource, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS/, "config should read the SQLite busy-timeout setting");
assert.match(configSource, /SUPER_ADMIN_PASSWORD is required when LONGTAIL_ENV=production/, "config should fail clearly when production bootstrap password is missing");
assert.match(configSource, /LONGTAIL_INITIAL_WORKSPACE_NAME/, "config should read the initial workspace name from runtime config");
assert.match(configSource, /SUPER_ADMIN_DISPLAY_NAME/, "config should read the initial super-admin display name from runtime config");
assert.match(sessionsSource, /config\.cookies\.maxAgeSeconds/, "session TTL should read from runtime config");
assert.match(sessionsSource, /config\.cookies\.secure/, "session cookies should read secure mode from runtime config");
assert.match(usersService, /config\.envOverrides\.workspaceInstallMode/, "workspace creation should preserve env override precedence through config");
assert.match(usersService, /config\.envOverrides\.workspaceTypeLimit/, "workspace type limit should preserve env override precedence through config");
assert.match(secureCrypto, /readRuntimeSecret\("LONGTAIL_SECURE_NOTES_MASTER_KEY"\)/, "secure notes should read the preferred runtime secret name through config helpers");
assert.match(secureCrypto, /readRuntimeSecret\("SECURE_NOTES_MASTER_KEY"\)/, "secure notes should preserve the legacy runtime secret name");
assert.match(localStorageAdapter, /const LOCAL_FILE_STORAGE_ROOT = config\.storage\.localRoot/, "local file storage root should come from runtime config");

const defaults = readConfig();
assert.equal(defaults.environment, "development");
assert.equal(defaults.databaseProvider, "sqlite");
assert.equal(defaults.sqliteForeignKeys, true);
assert.equal(defaults.sqliteJournalMode, "wal");
assert.equal(defaults.sqliteBusyTimeoutMs, 5000);
assert.equal(defaults.port, 8001);
assert.equal(defaults.cookieSecure, false);
assert.equal(defaults.cookieSameSite, "Lax");
assert.equal(defaults.cookieTtl, 43200);
assert.equal(defaults.initialWorkspaceName, "Longtail Forge Workspace");
assert.equal(defaults.superAdminDisplayName, "Super Admin");
assert.equal(defaults.workspaceInstallMode, "self_hosted");
assert.equal(defaults.workspaceTypeLimit, "");
assert.equal(defaults.secureNotesKeyVersion, "v1");
assert.equal(defaults.storageProvider, "local");
assert.equal(defaults.scannerMode, "none");
assert.equal(defaults.workerMode, "inline");
assert.deepEqual(defaults.runtimeWarnings, []);

const custom = readConfig({
  HOST: "127.0.0.1",
  PORT: "8015",
  LONGTAIL_DATA_DIR: "./custom-data",
  LONGTAIL_DATABASE_FILE: "./custom-data/custom.db",
  LONGTAIL_DATABASE_PROVIDER: "sqlite",
  LONGTAIL_SQLITE_JOURNAL_MODE: "delete",
  LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "2500",
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  LONGTAIL_SESSION_COOKIE_SAMESITE: "None",
  LONGTAIL_SESSION_TTL_SECONDS: "600",
  WORKSPACE_INSTALL_MODE: "saas",
  WORKSPACE_TYPE_LIMIT: "business",
  LONGTAIL_SECURE_NOTES_KEY_VERSION: "v9",
  LONGTAIL_STORAGE_PROVIDER: "local",
  LONGTAIL_LOCAL_STORAGE_ROOT: "./custom-data/files",
  LONGTAIL_FILE_SCANNER: "none",
  LONGTAIL_WORKER_MODE: "inline",
  LONGTAIL_INITIAL_WORKSPACE_NAME: "Custom Workspace",
  SUPER_ADMIN_DISPLAY_NAME: "Custom Admin",
});
assert.equal(custom.host, "127.0.0.1");
assert.equal(custom.port, 8015);
assert.equal(custom.sqliteForeignKeys, true);
assert.equal(custom.sqliteJournalMode, "delete");
assert.equal(custom.sqliteBusyTimeoutMs, 2500);
assert.equal(custom.cookieSecure, true);
assert.equal(custom.cookieSameSite, "None");
assert.equal(custom.cookieTtl, 600);
assert.equal(custom.initialWorkspaceName, "Custom Workspace");
assert.equal(custom.superAdminDisplayName, "Custom Admin");
assert.equal(custom.workspaceInstallMode, "saas");
assert.equal(custom.workspaceTypeLimit, "business");
assert.equal(custom.secureNotesKeyVersion, "v9");
assert.ok(custom.dataDir.endsWith(`${path.sep}custom-data`), "relative data dir should resolve from the app root");
assert.ok(custom.databaseFile.endsWith(`${path.sep}custom-data${path.sep}custom.db`), "relative database file should resolve from the app root");
assert.ok(custom.localStorageRoot.endsWith(`${path.sep}custom-data${path.sep}files`), "relative local storage root should resolve from the app root");

const production = readConfig({
  LONGTAIL_ENV: "production",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
});
assert.deepEqual(production.runtimeWarnings, ["LONGTAIL_PUBLIC_URL should be set when LONGTAIL_ENV=production."]);

assertConfigFails({ PORT: "not-a-number" }, /PORT must be an integer/);
assertConfigFails({ PORT: "70000" }, /PORT must be at most 65535/);
assertConfigFails({ LONGTAIL_DATABASE_PROVIDER: "postgres" }, /LONGTAIL_DATABASE_PROVIDER must be sqlite/);
assertConfigFails({ LONGTAIL_SQLITE_FOREIGN_KEYS: "false" }, /LONGTAIL_SQLITE_FOREIGN_KEYS must be on/);
assertConfigFails({ LONGTAIL_SQLITE_JOURNAL_MODE: "invalid" }, /LONGTAIL_SQLITE_JOURNAL_MODE must be/);
assertConfigFails({ LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "invalid" }, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS must be an integer/);
assertConfigFails({ LONGTAIL_ENV: "production" }, /SUPER_ADMIN_PASSWORD is required when LONGTAIL_ENV=production/);
assertConfigFails({
  LONGTAIL_SESSION_COOKIE_SAMESITE: "None",
  LONGTAIL_SESSION_COOKIE_SECURE: "false",
}, /LONGTAIL_SESSION_COOKIE_SECURE must be true/);
assertConfigFails({ WORKSPACE_INSTALL_MODE: "clustered" }, /WORKSPACE_INSTALL_MODE must be self_hosted or saas/);
assertConfigFails({ WORKSPACE_TYPE_LIMIT: "personal" }, /WORKSPACE_TYPE_LIMIT must be business/);

assert.match(regressionSuite, /scripts\/runtime-configuration-contract-regression\.mjs/, "regression suite should include the runtime configuration contract regression");

console.log("Runtime configuration contract regression passed.");

function readConfig(overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(JSON.stringify({
      dataDir: config.dataDir,
      databaseFile: config.databaseFile,
      databaseProvider: config.databaseProvider,
      environment: config.environment,
      host: config.host,
      localStorageRoot: config.storage.localRoot,
      initialWorkspaceName: config.bootstrap.initialWorkspaceName,
      port: config.port,
      runtimeWarnings: config.runtimeWarnings,
      scannerMode: config.scanner.mode,
      secureNotesKeyVersion: config.secureNotes.keyVersion,
      sqliteBusyTimeoutMs: config.sqlite.busyTimeoutMs,
      sqliteForeignKeys: config.sqlite.foreignKeys,
      sqliteJournalMode: config.sqlite.journalMode,
      storageProvider: config.storage.provider,
      superAdminDisplayName: config.bootstrap.superAdminDisplayName,
      cookieSameSite: config.cookies.sameSite,
      cookieSecure: config.cookies.secure,
      cookieTtl: config.cookies.maxAgeSeconds,
      workerMode: config.worker.mode,
      workspaceInstallMode: config.workspaceInstallMode,
      workspaceTypeLimit: config.workspaceTypeLimit
    }));
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim());
}

function assertConfigFails(overrides, pattern) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import "./src/config.js";
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.notEqual(child.status, 0, "config import should fail");
  assert.match(child.stderr || child.stdout, pattern);
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SQLITE_COMMAND" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "SUPER_ADMIN_USERNAME" ||
      key === "TRUST_PROXY" ||
      key === "WORKSPACE_INSTALL_MODE" ||
      key === "WORKSPACE_TYPE_LIMIT"
    ) {
      delete env[key];
    }
  }

  return { ...env, ...overrides };
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
