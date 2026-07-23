import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "vitest";
import { createConfig } from "../../src/config.js";

const DEFAULT_EXPECTATIONS = Object.freeze({
  environment: "development",
  databaseProvider: "sqlite",
  sqliteForeignKeys: true,
  sqliteJournalMode: "wal",
  sqliteBusyTimeoutMs: 5000,
  port: 8001,
  cookieSecure: false,
  cookieSameSite: "Lax",
  cookieTtl: 43200,
  cookieDomain: "",
  cookiePath: "/",
  hstsEnabled: false,
  hstsMaxAgeSeconds: 0,
  authThrottleEnabled: true,
  authThrottleWindowSeconds: 900,
  authThrottleFailureLimit: 5,
  authThrottleLockoutSeconds: 900,
  authVerificationConcurrencyLimit: 4,
  authVerificationConcurrencyPerIpLimit: 2,
  publicUrl: "",
  trustedProxies: [],
  initialWorkspaceName: "Longtail Forge Workspace",
  superAdminDisplayName: "Super Admin",
  workspaceInstallMode: "self_hosted",
  workspaceTypeLimit: "",
  secureNotesKeyVersion: "v1",
  storageProvider: "local",
  scannerMode: "none",
  workerMode: "inline",
  workerId: "default",
  workerPollIntervalMs: 5000,
  workerLockTtlSeconds: 300,
  workerCompletedRetentionDays: 30,
  workerDeadRetentionDays: 90,
  runtimeWarnings: [],
});

const CUSTOM_ENV = Object.freeze({
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
  LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT: "6",
  LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT: "3",
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

const CUSTOM_EXPECTATIONS = Object.freeze({
  host: "127.0.0.1",
  port: 8015,
  sqliteForeignKeys: true,
  sqliteJournalMode: "delete",
  sqliteBusyTimeoutMs: 2500,
  cookieSecure: true,
  cookieSameSite: "None",
  cookieTtl: 600,
  hstsEnabled: true,
  hstsMaxAgeSeconds: 600,
  authThrottleEnabled: false,
  authThrottleWindowSeconds: 120,
  authThrottleFailureLimit: 7,
  authThrottleLockoutSeconds: 300,
  authVerificationConcurrencyLimit: 6,
  authVerificationConcurrencyPerIpLimit: 3,
  publicUrl: "http://localhost:8015",
  trustedProxies: ["127.0.0.1/32", "::1/128"],
  initialWorkspaceName: "Custom Workspace",
  superAdminDisplayName: "Custom Admin",
  workspaceInstallMode: "saas",
  workspaceTypeLimit: "business",
  secureNotesKeyVersion: "v9",
  scannerMode: "noop",
  workerMode: "separate",
  workerId: "custom-worker",
  workerPollIntervalMs: 2500,
  workerLockTtlSeconds: 600,
  workerCompletedRetentionDays: 14,
  workerDeadRetentionDays: 180,
});

const SAFE_PRODUCTION_ENV = Object.freeze({
  LONGTAIL_ENV: "production",
  LONGTAIL_FILE_SCANNER: "clamscan",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
  TRUST_PROXY: "127.0.0.1/32",
});

const INVALID_CASES = Object.freeze([
  [{ PORT: "not-a-number" }, /PORT must be an integer/],
  [{ PORT: "70000" }, /PORT must be at most 65535/],
  [{ LONGTAIL_DATABASE_PROVIDER: "postgres" }, /LONGTAIL_DATABASE_PROVIDER must be sqlite/],
  [{ LONGTAIL_SQLITE_FOREIGN_KEYS: "false" }, /LONGTAIL_SQLITE_FOREIGN_KEYS must be on/],
  [{ LONGTAIL_SQLITE_JOURNAL_MODE: "invalid" }, /LONGTAIL_SQLITE_JOURNAL_MODE must be/],
  [{ LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "invalid" }, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS must be an integer/],
  [{ LONGTAIL_WORKER_MODE: "fleet" }, /LONGTAIL_WORKER_MODE must be inline or separate or disabled/],
  [{ LONGTAIL_JOB_POLL_INTERVAL_MS: "999" }, /LONGTAIL_JOB_POLL_INTERVAL_MS must be at least 1000/],
  [{ LONGTAIL_JOB_LOCK_TTL_SECONDS: "29" }, /LONGTAIL_JOB_LOCK_TTL_SECONDS must be at least 30/],
  [{ LONGTAIL_JOB_COMPLETED_RETENTION_DAYS: "0" }, /LONGTAIL_JOB_COMPLETED_RETENTION_DAYS must be at least 1/],
  [{ LONGTAIL_JOB_DEAD_RETENTION_DAYS: "3651" }, /LONGTAIL_JOB_DEAD_RETENTION_DAYS must be at most 3650/],
  [{ LONGTAIL_FILE_SCANNER: "mystery" }, /LONGTAIL_FILE_SCANNER must be none or noop or clamd or clamscan/],
  [{ LONGTAIL_ENV: "production" }, /SUPER_ADMIN_PASSWORD is required when LONGTAIL_ENV=production/],
  [{ TRUST_PROXY: "true" }, /blanket trust is not allowed/],
  [{ TRUST_PROXY: "proxy.internal" }, /IP addresses or CIDR ranges/],
  [{ LONGTAIL_PUBLIC_URL: "forge.example.test" }, /absolute http or https URL/],
  [{ LONGTAIL_PUBLIC_URL: "https://user:secret@forge.example.test" }, /must not include credentials/],
  [{ LONGTAIL_HSTS_MAX_AGE_SECONDS: "-1" }, /must be at least 0/],
  [{ LONGTAIL_HSTS_MAX_AGE_SECONDS: "63072001" }, /must be at most 63072000/],
  [{ LONGTAIL_AUTH_THROTTLE_ENABLED: "maybe" }, /must be true or false/],
  [{ LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS: "0" }, /must be at least 1/],
  [{ LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS: "86401" }, /must be at most 86400/],
  [{ LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT: "0" }, /must be at least 1/],
  [{ LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT: "1001" }, /must be at most 1000/],
  [{ LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS: "0" }, /must be at least 1/],
  [{ LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS: "604801" }, /must be at most 604800/],
  [{ LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT: "0" }, /must be at least 1/],
  [{ LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT: "65" }, /must be at most 64/],
  [{ LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT: "0" }, /must be at least 1/],
  [{
    LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT: "4",
    LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT: "5",
  }, /must be at most 4/],
  [{
    LONGTAIL_ENV: "production",
    LONGTAIL_PUBLIC_URL: "http://forge.example.test",
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
    SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
    LONGTAIL_FILE_SCANNER: "clamscan",
  }, /must use https in production/],
  [{
    LONGTAIL_ENV: "production",
    LONGTAIL_PUBLIC_URL: "https://forge.example.test",
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
    LONGTAIL_FILE_SCANNER: "clamscan",
  }, /TRUST_PROXY must list the TLS reverse proxy/],
  [{
    LONGTAIL_SESSION_COOKIE_SAMESITE: "None",
    LONGTAIL_SESSION_COOKIE_SECURE: "false",
  }, /LONGTAIL_SESSION_COOKIE_SECURE must be true/],
  [{ WORKSPACE_INSTALL_MODE: "clustered" }, /WORKSPACE_INSTALL_MODE must be self_hosted or saas/],
  [{ WORKSPACE_TYPE_LIMIT: "personal" }, /WORKSPACE_TYPE_LIMIT must be business/],
]);

const SCANNER_MODES = Object.freeze(["none", "noop", "clamd", "clamscan"]);
const PURE_ASSERTION_INVENTORY = Object.keys(DEFAULT_EXPECTATIONS).length
  + Object.keys(CUSTOM_EXPECTATIONS).length
  + 3
  + 4
  + 1
  + 2
  + 2
  + SCANNER_MODES.length
  + INVALID_CASES.length;

describe("runtime configuration pure contract", () => {
  it("preserves the 116-case assertion inventory moved from the integration regression", () => {
    assert.equal(PURE_ASSERTION_INVENTORY, 116);
  });

  it("applies deterministic defaults", () => {
    assert.deepEqual(pick(readPureConfig(), DEFAULT_EXPECTATIONS), DEFAULT_EXPECTATIONS);
  });

  it("normalizes explicit runtime values and relative paths", () => {
    const custom = readPureConfig(CUSTOM_ENV);
    assert.deepEqual(pick(custom, CUSTOM_EXPECTATIONS), CUSTOM_EXPECTATIONS);
    assert.ok(custom.dataDir.endsWith(`${path.sep}custom-data`), "relative data dir should resolve from the app root");
    assert.ok(custom.databaseFile.endsWith(`${path.sep}custom-data${path.sep}custom.db`), "relative database file should resolve from the app root");
    assert.ok(custom.localStorageRoot.endsWith(`${path.sep}custom-data${path.sep}files`), "relative local storage root should resolve from the app root");
  });

  it("applies safe production defaults and explicit warnings", () => {
    const production = readPureConfig(SAFE_PRODUCTION_ENV);
    assert.deepEqual(pick(production, {
      runtimeWarnings: [],
      hstsEnabled: true,
      hstsMaxAgeSeconds: 300,
      authThrottleEnabled: true,
    }), {
      runtimeWarnings: [],
      hstsEnabled: true,
      hstsMaxAgeSeconds: 300,
      authThrottleEnabled: true,
    });

    const throttleDisabled = readPureConfig({
      ...SAFE_PRODUCTION_ENV,
      LONGTAIL_AUTH_THROTTLE_ENABLED: "false",
      LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE: "true",
    });
    assert.ok(
      throttleDisabled.runtimeWarnings.includes("UNSAFE OVERRIDE ACTIVE: authentication throttling is disabled in production."),
      "production should warn unmistakably when authentication throttling is disabled",
    );

    const productionHttps = readPureConfig(SAFE_PRODUCTION_ENV);
    assert.equal(productionHttps.publicUrl, "https://forge.example.test");
    assert.deepEqual(productionHttps.runtimeWarnings, []);
  });

  it("ignores the retired SQLite command and accepts every scanner mode", () => {
    const legacySqliteCommand = readPureConfig({ SQLITE_COMMAND: "sqlite3-command-should-be-ignored" });
    assert.equal(legacySqliteCommand.databaseProvider, "sqlite", "legacy SQLITE_COMMAND should not affect config creation");
    assert.equal(legacySqliteCommand.sqliteJournalMode, "wal", "legacy SQLITE_COMMAND should not affect SQLite runtime settings");

    for (const scannerMode of SCANNER_MODES) {
      assert.equal(
        readPureConfig({ LONGTAIL_FILE_SCANNER: scannerMode }).scannerMode,
        scannerMode,
        `${scannerMode} should be an accepted file scanner mode`,
      );
    }
  });

  it.each(INVALID_CASES)("rejects invalid configuration %#", (overrides, pattern) => {
    assert.throws(() => createConfig(overrides), pattern);
  });
});

function readPureConfig(env = {}) {
  const config = createConfig(env);
  return {
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
    authVerificationConcurrencyLimit: config.security.authenticationThrottle.verificationConcurrencyLimit,
    authVerificationConcurrencyPerIpLimit: config.security.authenticationThrottle.verificationConcurrencyPerIpLimit,
    trustedProxies: config.security.trustedProxies,
    workerMode: config.worker.mode,
    workerId: config.worker.id,
    workerCompletedRetentionDays: config.worker.completedRetentionDays,
    workerDeadRetentionDays: config.worker.deadRetentionDays,
    workerLockTtlSeconds: config.worker.lockTtlSeconds,
    workerPollIntervalMs: config.worker.pollIntervalMs,
    workspaceInstallMode: config.workspaceInstallMode,
    workspaceTypeLimit: config.workspaceTypeLimit,
  };
}

function pick(value, expectations) {
  return Object.fromEntries(Object.keys(expectations).map((key) => [key, value[key]]));
}
