import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appVersion } from "../src/core/version.js";
import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const envExample = readText(".env.example");
const gitignore = readText(".gitignore");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const configSource = readText("src/config.js");
const appInfoRoutesSource = readText("src/routes/app-info.routes.js");
const sessionsSource = readText("src/security/sessions.js");
const cookiesSource = readText("src/security/cookies.js");
const transportSecuritySource = readText("src/core/transport-security.js");
const authenticationThrottleSource = readText("src/security/auth-throttle.js");
const authenticationThrottleRepositorySource = readText("src/repositories/authentication-throttle.repo.js");
const usersService = readText("src/services/users.service.js");
const secureCrypto = readText("src/modules/notes/secure-crypto.js");
const localStorageAdapter = readText("src/core/files/local-storage-adapter.js");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");
const fixture = await createDisposableDatabaseFixture("runtime-configuration-contract-regression");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { closeDatabase } = await import("../src/db/provider.js");

try {
assert.equal(packageJson.version, appVersion, "package.json should report the runtime configuration slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the runtime configuration slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the runtime configuration slice version");
assert.equal(appVersion, packageJson.version, "the runtime version helper should read package.json metadata");
for (const moduleDefinition of modulesService.listModules().filter(({ id }) => [
  "client-projects",
  "lists",
  "notes",
  "tasks",
  "time-tracking",
].includes(id))) {
  assert.equal(moduleDefinition.version, appVersion, `${moduleDefinition.id} should report the canonical app version`);
}

for (const heading of [
  "# App",
  "# Data",
  "# Database",
  "# SQLite",
  "# Future PostgreSQL",
  "# Initial bootstrap",
  "# Sessions / cookies",
  "# Authentication throttling",
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
  "LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL=false",
  "LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING=false",
  "HOST=0.0.0.0",
  "PORT=8001",
  "TRUST_PROXY=false",
  "LONGTAIL_DATA_DIR=./data",
  "LONGTAIL_RELEASE_BRANCH=",
  "LONGTAIL_RELEASE_COMMIT=",
  "LONGTAIL_RELEASE_ARTIFACT_SHA256=",
  "LONGTAIL_DATABASE_PROVIDER=sqlite",
  "LONGTAIL_DATABASE_FILE=./data/longtail-forge.db",
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
  "LONGTAIL_AUTH_THROTTLE_ENABLED=true",
  "LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE=false",
  "LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS=900",
  "LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT=5",
  "LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS=900",
  "# LONGTAIL_SECURE_NOTES_MASTER_KEY=",
  "# SECURE_NOTES_MASTER_KEY=",
  "LONGTAIL_SECURE_NOTES_KEY_VERSION=v1",
  "LONGTAIL_STORAGE_PROVIDER=local",
  "LONGTAIL_LOCAL_STORAGE_ROOT=./data/files",
  "LONGTAIL_FILE_SCANNER=none",
  "LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=false",
  "LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK=false",
  "LONGTAIL_WORKER_MODE=inline",
  "LONGTAIL_WORKER_ID=default",
  "LONGTAIL_JOB_POLL_INTERVAL_MS=5000",
  "LONGTAIL_JOB_LOCK_TTL_SECONDS=300",
  "LONGTAIL_JOB_COMPLETED_RETENTION_DAYS=30",
  "LONGTAIL_JOB_DEAD_RETENTION_DAYS=90",
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
  "# LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
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
assert.doesNotMatch(envExample, /^SQLITE_COMMAND=/m, ".env.example should not present SQLITE_COMMAND as active configuration");
assert.doesNotMatch(runtimeDocs, /\|\s*`SQLITE_COMMAND`\s*\|/, "runtime docs should not list SQLITE_COMMAND as an active setting");
assert.match(runtimeDocs, /`SQLITE_COMMAND` is a legacy ignored setting[\s\S]*`better-sqlite3`/, "runtime docs should mark SQLITE_COMMAND as legacy/ignored");
assert.match(runtimeDocs, /Reserved settings may appear in `config` for readout consistency[\s\S]*does not implement PostgreSQL/, "runtime docs should keep future settings dormant");
assert.match(runtimeDocs, /Startup fails clearly when active settings are invalid/, "runtime docs should document validation");
assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "live roadmap should not carry completed-history breadcrumbs");

assert.match(configSource, /function createConfig\(env = process\.env\)/, "config should expose a testable runtime config builder");
assert.match(configSource, /import \{ appVersion, normalizeReleaseBranch, qualifyAppVersion \} from "\.\/core\/version\.js";/, "runtime config should consume canonical and branch-qualified version helpers");
assert.match(configSource, /LONGTAIL_RELEASE_BRANCH/, "runtime config should read the explicit source branch");
assert.match(appInfoRoutesSource, /version: config\.appDisplayVersion/, "app-info should report the qualified display version");
assert.match(appInfoRoutesSource, /canonicalVersion: config\.appVersion/, "app-info should retain the canonical package version");
assert.match(appInfoRoutesSource, /sourceBranch: config\.release\.sourceBranch/, "app-info should report the explicit source branch");
assert.match(configSource, /LONGTAIL_DATABASE_PROVIDER[\s\S]*DATABASE_PROVIDERS/, "config should validate the database provider");
assert.match(configSource, /LONGTAIL_SQLITE_FOREIGN_KEYS/, "config should read the SQLite foreign-key setting");
assert.match(configSource, /LONGTAIL_SQLITE_JOURNAL_MODE/, "config should read the SQLite journal mode setting");
assert.match(configSource, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS/, "config should read the SQLite busy-timeout setting");
assert.match(configSource, /LONGTAIL_WORKER_MODE[\s\S]*WORKER_MODES/, "config should validate active worker modes");
assert.match(configSource, /LONGTAIL_FILE_SCANNER[\s\S]*FILE_SCANNER_MODES/, "config should validate active file scanner modes");
assert.doesNotMatch(configSource, /DEFAULT_SQLITE_COMMAND|sqliteCommand|SQLITE_COMMAND/, "config should ignore the retired SQLITE_COMMAND setting");
assert.match(configSource, /assertProductionSecret\(bootstrapPassword, "SUPER_ADMIN_PASSWORD", 16\)/, "config should fail clearly when the production bootstrap password is missing or weak");
assert.match(configSource, /LONGTAIL_INITIAL_WORKSPACE_NAME/, "config should read the initial workspace name from runtime config");
assert.match(configSource, /SUPER_ADMIN_DISPLAY_NAME/, "config should read the initial super-admin display name from runtime config");
assert.match(sessionsSource, /config\.cookies\.maxAgeSeconds/, "session TTL should read from runtime config");
assert.match(cookiesSource, /config\.cookies\.secure/, "session cookies should read secure mode from runtime config");
assert.match(cookiesSource, /config\.cookies\.domain[\s\S]*config\.cookies\.path/, "cookies should read explicit host-only/root-path policy from config");
assert.match(transportSecuritySource, /requestContext\.isSecure[\s\S]*Strict-Transport-Security/, "HSTS should require the trusted effective HTTPS context");
assert.match(configSource, /trustedProxies[\s\S]*function readTrustedProxies[\s\S]*TRUST_PROXY/, "config should expose explicit trusted proxy entries");
assert.match(configSource, /LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL/, "config should expose the explicit unsafe HTTP override");
assert.match(configSource, /LONGTAIL_HSTS_MAX_AGE_SECONDS/, "config should expose bounded HSTS rollout configuration");
assert.match(configSource, /LONGTAIL_AUTH_THROTTLE_ENABLED/, "config should expose authentication throttle enablement");
assert.match(configSource, /LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS/, "config should expose the authentication failure window");
assert.match(configSource, /LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT/, "config should expose the authentication failure threshold");
assert.match(configSource, /LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS/, "config should expose the authentication lockout duration");
assert.match(authenticationThrottleSource, /security\.authentication_throttle\.lockout/, "the throttle should emit a stable security event");
assert.match(authenticationThrottleSource, /createKey\(scope, "ip"[\s\S]*createKey\(scope, "account"/, "the throttle should own both trusted-IP and account dimensions");
assert.match(authenticationThrottleSource, /createHash\("sha256"\)[\s\S]*v1\\0install/, "the throttle should hash normalized install-scoped bucket keys before persistence");
assert.match(authenticationThrottleRepositorySource, /database\.transaction[\s\S]*recordFailures[\s\S]*authentication_throttle_entries/, "the throttle repository should serialize durable counter updates through the database transaction boundary");
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
assert.equal(defaults.cookieDomain, "");
assert.equal(defaults.cookiePath, "/");
assert.equal(defaults.hstsEnabled, false);
assert.equal(defaults.hstsMaxAgeSeconds, 0);
assert.equal(defaults.authThrottleEnabled, true);
assert.equal(defaults.authThrottleWindowSeconds, 900);
assert.equal(defaults.authThrottleFailureLimit, 5);
assert.equal(defaults.authThrottleLockoutSeconds, 900);
assert.equal(defaults.publicUrl, "");
assert.deepEqual(defaults.trustedProxies, []);
assert.equal(defaults.initialWorkspaceName, "Longtail Forge Workspace");
assert.equal(defaults.superAdminDisplayName, "Super Admin");
assert.equal(defaults.workspaceInstallMode, "self_hosted");
assert.equal(defaults.workspaceTypeLimit, "");
assert.equal(defaults.secureNotesKeyVersion, "v1");
assert.equal(defaults.storageProvider, "local");
assert.equal(defaults.scannerMode, "none");
assert.equal(defaults.workerMode, "inline");
assert.equal(defaults.workerId, "default");
assert.equal(defaults.workerPollIntervalMs, 5000);
assert.equal(defaults.workerLockTtlSeconds, 300);
assert.equal(defaults.workerCompletedRetentionDays, 30);
assert.equal(defaults.workerDeadRetentionDays, 90);
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
  LONGTAIL_HSTS_MAX_AGE_SECONDS: "600",
  LONGTAIL_AUTH_THROTTLE_ENABLED: "false",
  LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS: "120",
  LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT: "7",
  LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS: "300",
  LONGTAIL_PUBLIC_URL: "http://localhost:8015",
  TRUST_PROXY: "127.0.0.1/32,::1/128",
  WORKSPACE_INSTALL_MODE: "saas",
  WORKSPACE_TYPE_LIMIT: "business",
  LONGTAIL_SECURE_NOTES_KEY_VERSION: "v9",
  LONGTAIL_STORAGE_PROVIDER: "local",
  LONGTAIL_LOCAL_STORAGE_ROOT: "./custom-data/files",
  LONGTAIL_FILE_SCANNER: "noop",
  LONGTAIL_WORKER_ID: "custom-worker",
  LONGTAIL_WORKER_MODE: "separate",
  LONGTAIL_JOB_POLL_INTERVAL_MS: "2500",
  LONGTAIL_JOB_LOCK_TTL_SECONDS: "600",
  LONGTAIL_JOB_COMPLETED_RETENTION_DAYS: "14",
  LONGTAIL_JOB_DEAD_RETENTION_DAYS: "180",
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
assert.equal(custom.hstsEnabled, true);
assert.equal(custom.hstsMaxAgeSeconds, 600);
assert.equal(custom.authThrottleEnabled, false);
assert.equal(custom.authThrottleWindowSeconds, 120);
assert.equal(custom.authThrottleFailureLimit, 7);
assert.equal(custom.authThrottleLockoutSeconds, 300);
assert.equal(custom.publicUrl, "http://localhost:8015");
assert.deepEqual(custom.trustedProxies, ["127.0.0.1/32", "::1/128"]);
assert.equal(custom.initialWorkspaceName, "Custom Workspace");
assert.equal(custom.superAdminDisplayName, "Custom Admin");
assert.equal(custom.workspaceInstallMode, "saas");
assert.equal(custom.workspaceTypeLimit, "business");
assert.equal(custom.secureNotesKeyVersion, "v9");
assert.equal(custom.scannerMode, "noop");
assert.equal(custom.workerMode, "separate");
assert.equal(custom.workerId, "custom-worker");
assert.equal(custom.workerPollIntervalMs, 2500);
assert.equal(custom.workerLockTtlSeconds, 600);
assert.equal(custom.workerCompletedRetentionDays, 14);
assert.equal(custom.workerDeadRetentionDays, 180);
assert.ok(custom.dataDir.endsWith(`${path.sep}custom-data`), "relative data dir should resolve from the app root");
assert.ok(custom.databaseFile.endsWith(`${path.sep}custom-data${path.sep}custom.db`), "relative database file should resolve from the app root");
assert.ok(custom.localStorageRoot.endsWith(`${path.sep}custom-data${path.sep}files`), "relative local storage root should resolve from the app root");

const safeProductionEnv = {
  LONGTAIL_ENV: "production",
  LONGTAIL_FILE_SCANNER: "clamscan",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
  TRUST_PROXY: "127.0.0.1/32",
};
const production = readConfig(safeProductionEnv);
assert.deepEqual(production.runtimeWarnings, []);
assert.equal(production.hstsEnabled, true);
assert.equal(production.hstsMaxAgeSeconds, 300);
assert.equal(production.authThrottleEnabled, true);

const productionThrottleDisabled = readConfig({
  ...safeProductionEnv,
  LONGTAIL_AUTH_THROTTLE_ENABLED: "false",
  LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE: "true",
});
assert.ok(
  productionThrottleDisabled.runtimeWarnings.includes("UNSAFE OVERRIDE ACTIVE: authentication throttling is disabled in production."),
  "production should warn unmistakably when authentication throttling is disabled",
);

const productionHttps = readConfig({
  ...safeProductionEnv,
});
assert.equal(productionHttps.publicUrl, "https://forge.example.test");
assert.deepEqual(productionHttps.runtimeWarnings, []);

const legacySqliteCommand = readConfig({
  SQLITE_COMMAND: "sqlite3-command-should-be-ignored",
});
assert.equal(legacySqliteCommand.databaseProvider, "sqlite", "legacy SQLITE_COMMAND should not affect config creation");
assert.equal(legacySqliteCommand.sqliteJournalMode, "wal", "legacy SQLITE_COMMAND should not affect SQLite runtime settings");

for (const scannerMode of ["none", "noop", "clamd", "clamscan"]) {
  assert.equal(
    readConfig({ LONGTAIL_FILE_SCANNER: scannerMode }).scannerMode,
    scannerMode,
    `${scannerMode} should be an accepted file scanner mode`,
  );
}

assertConfigFails({ PORT: "not-a-number" }, /PORT must be an integer/);
assertConfigFails({ PORT: "70000" }, /PORT must be at most 65535/);
assertConfigFails({ LONGTAIL_DATABASE_PROVIDER: "postgres" }, /LONGTAIL_DATABASE_PROVIDER must be sqlite/);
assertConfigFails({ LONGTAIL_SQLITE_FOREIGN_KEYS: "false" }, /LONGTAIL_SQLITE_FOREIGN_KEYS must be on/);
assertConfigFails({ LONGTAIL_SQLITE_JOURNAL_MODE: "invalid" }, /LONGTAIL_SQLITE_JOURNAL_MODE must be/);
assertConfigFails({ LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "invalid" }, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS must be an integer/);
assertConfigFails({ LONGTAIL_WORKER_MODE: "fleet" }, /LONGTAIL_WORKER_MODE must be inline or separate or disabled/);
assertConfigFails({ LONGTAIL_JOB_POLL_INTERVAL_MS: "999" }, /LONGTAIL_JOB_POLL_INTERVAL_MS must be at least 1000/);
assertConfigFails({ LONGTAIL_JOB_LOCK_TTL_SECONDS: "29" }, /LONGTAIL_JOB_LOCK_TTL_SECONDS must be at least 30/);
assertConfigFails({ LONGTAIL_JOB_COMPLETED_RETENTION_DAYS: "0" }, /LONGTAIL_JOB_COMPLETED_RETENTION_DAYS must be at least 1/);
assertConfigFails({ LONGTAIL_JOB_DEAD_RETENTION_DAYS: "3651" }, /LONGTAIL_JOB_DEAD_RETENTION_DAYS must be at most 3650/);
assertConfigFails({ LONGTAIL_FILE_SCANNER: "mystery" }, /LONGTAIL_FILE_SCANNER must be none or noop or clamd or clamscan/);
assertConfigFails({ LONGTAIL_ENV: "production" }, /SUPER_ADMIN_PASSWORD is required when LONGTAIL_ENV=production/);
assertConfigFails({ TRUST_PROXY: "true" }, /blanket trust is not allowed/);
assertConfigFails({ TRUST_PROXY: "proxy.internal" }, /IP addresses or CIDR ranges/);
assertConfigFails({ LONGTAIL_PUBLIC_URL: "forge.example.test" }, /absolute http or https URL/);
assertConfigFails({ LONGTAIL_PUBLIC_URL: "https://user:secret@forge.example.test" }, /must not include credentials/);
assertConfigFails({ LONGTAIL_HSTS_MAX_AGE_SECONDS: "-1" }, /must be at least 0/);
assertConfigFails({ LONGTAIL_HSTS_MAX_AGE_SECONDS: "63072001" }, /must be at most 63072000/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_ENABLED: "maybe" }, /must be true or false/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS: "0" }, /must be at least 1/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS: "86401" }, /must be at most 86400/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT: "0" }, /must be at least 1/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT: "1001" }, /must be at most 1000/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS: "0" }, /must be at least 1/);
assertConfigFails({ LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS: "604801" }, /must be at most 604800/);
assertConfigFails({
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "http://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
  LONGTAIL_FILE_SCANNER: "clamscan",
}, /must use https in production/);
assertConfigFails({
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
  LONGTAIL_FILE_SCANNER: "clamscan",
}, /TRUST_PROXY must list the TLS reverse proxy/);
assertConfigFails({
  LONGTAIL_SESSION_COOKIE_SAMESITE: "None",
  LONGTAIL_SESSION_COOKIE_SECURE: "false",
}, /LONGTAIL_SESSION_COOKIE_SECURE must be true/);
assertConfigFails({ WORKSPACE_INSTALL_MODE: "clustered" }, /WORKSPACE_INSTALL_MODE must be self_hosted or saas/);
assertConfigFails({ WORKSPACE_TYPE_LIMIT: "personal" }, /WORKSPACE_TYPE_LIMIT must be business/);

assert.match(regressionSuite, /scripts\/runtime-configuration-contract-regression\.mjs/, "regression suite should include the runtime configuration contract regression");

console.log("Runtime configuration contract regression passed.");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

function readConfig(overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(JSON.stringify({
      dataDir: config.dataDir,
      databaseFile: config.databaseFile,
      databaseProvider: config.databaseProvider,
      environment: config.environment,
      publicUrl: config.publicUrl,
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
      cookieDomain: config.cookies.domain,
      cookiePath: config.cookies.path,
      cookieSecure: config.cookies.secure,
      cookieTtl: config.cookies.maxAgeSeconds,
      hstsEnabled: config.security.hsts.enabled,
      hstsMaxAgeSeconds: config.security.hsts.maxAgeSeconds,
      authThrottleEnabled: config.security.authenticationThrottle.enabled,
      authThrottleWindowSeconds: config.security.authenticationThrottle.windowSeconds,
      authThrottleFailureLimit: config.security.authenticationThrottle.failureLimit,
      authThrottleLockoutSeconds: config.security.authenticationThrottle.lockoutSeconds,
      trustedProxies: config.security.trustedProxies,
      workerMode: config.worker.mode,
      workerId: config.worker.id,
      workerCompletedRetentionDays: config.worker.completedRetentionDays,
      workerDeadRetentionDays: config.worker.deadRetentionDays,
      workerLockTtlSeconds: config.worker.lockTtlSeconds,
      workerPollIntervalMs: config.worker.pollIntervalMs,
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
