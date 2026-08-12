import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appVersion } from "../src/core/version.js";
import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";

const root = process.cwd();
const envExample = readText(".env.example");
const gitignore = readText(".gitignore");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const configSource = readText("src/config.js");
const appInfoRoutesSource = readText("src/routes/app-info.routes.js");
const sessionRecordsSource = readText("src/security/session-records.js");
const cookiesSource = readText("src/security/cookies.js");
const transportSecuritySource = readText("src/core/transport-security.js");
const authenticationThrottleSource = readText("src/security/auth-throttle.js");
const authenticationThrottleRepositorySource = readText("src/repositories/authentication-throttle.repo.js");
const usersService = readText("src/services/users.service.js");
const secureCrypto = readText("src/modules/notes/secure-crypto.js");
const localStorageAdapter = readText("src/core/files/local-storage-adapter.js");
const coveragePolicy = JSON.parse(readText("scripts/regression-coverage-exceptions.json"));
const fixture = await createDisposableDatabaseFixture("runtime-configuration-contract-regression");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { closeDatabase } = await import("../src/db/provider.js");

try {
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
  "# Support View",
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
  "LONGTAIL_DEPLOYMENT_MODE=direct",
  "DEMO_MODE=false",
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
  "LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT=4",
  "LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT=2",
  "LONGTAIL_SUPPORT_VIEW_ENABLED=false",
  "LONGTAIL_SUPPORT_VIEW_TTL_SECONDS=900",
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
assert.match(configSource, /DEMO_MODE/, "runtime config should read the explicit default-off public-demo switch");
assert.match(configSource, /LONGTAIL_DEPLOYMENT_MODE/, "runtime config should read the explicit deployment identity");
assert.match(appInfoRoutesSource, /version: config\.appDisplayVersion/, "app-info should report the qualified display version");
assert.match(appInfoRoutesSource, /canonicalVersion: config\.appVersion/, "app-info should retain the canonical package version");
assert.match(appInfoRoutesSource, /sourceBranch: config\.release\.sourceBranch/, "app-info should report the explicit source branch");
assert.match(appInfoRoutesSource, /deploymentMode: config\.deployment\.mode/, "app-info should report the safe deployment classification");
assert.match(appInfoRoutesSource, /demoMode: config\.demo\.enabled/, "app-info should report only the safe public-demo enabled classification");
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
assert.match(sessionRecordsSource, /config\.cookies\.maxAgeSeconds/, "session TTL should read from runtime config");
assert.match(configSource, /LONGTAIL_SUPPORT_VIEW_ENABLED/, "config should expose the default-off Support View gate");
assert.match(configSource, /LONGTAIL_SUPPORT_VIEW_TTL_SECONDS/, "config should bound Support View expiry");
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
assert.match(configSource, /LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT/, "config should expose the global expensive-verification admission bound");
assert.match(configSource, /LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT/, "config should expose the per-IP expensive-verification admission bound");
assert.match(authenticationThrottleSource, /security\.authentication_throttle\.lockout/, "the throttle should emit a stable security event");
assert.match(authenticationThrottleSource, /createKey\(scope, "ip"[\s\S]*createKey\(scope, "account"/, "the throttle should own both trusted-IP and account dimensions");
assert.match(authenticationThrottleSource, /createHash\("sha256"\)[\s\S]*v1\\0install/, "the throttle should hash normalized install-scoped bucket keys before persistence");
assert.match(authenticationThrottleRepositorySource, /database\.transaction[\s\S]*recordFailures[\s\S]*authentication_throttle_entries/, "the throttle repository should serialize durable counter updates through the database transaction boundary");
assert.match(usersService, /config\.envOverrides\.workspaceInstallMode/, "workspace creation should preserve env override precedence through config");
assert.match(usersService, /config\.envOverrides\.workspaceTypeLimit/, "workspace type limit should preserve env override precedence through config");
assert.match(secureCrypto, /readRuntimeSecret\("LONGTAIL_SECURE_NOTES_MASTER_KEY"\)/, "secure notes should read the preferred runtime secret name through config helpers");
assert.match(secureCrypto, /readRuntimeSecret\("SECURE_NOTES_MASTER_KEY"\)/, "secure notes should preserve the legacy runtime secret name");
assert.match(localStorageAdapter, /const LOCAL_FILE_STORAGE_ROOT = config\.storage\.localRoot/, "local file storage root should come from runtime config");

const assertionMovement = coveragePolicy.assertionMovements.find((entry) => (
  entry.sourceRegression === "scripts/runtime-configuration-contract-regression.mjs"
));
assert.ok(assertionMovement, "coverage policy should record the runtime-configuration assertion movement");
assert.equal(assertionMovement.movedTo, "tests/unit/runtime-configuration.test.mjs");
assert.equal(assertionMovement.retainedIntegrationOwner, "scripts/runtime-configuration-contract-regression.mjs");
assert.equal(assertionMovement.assertionCount, 142);

// Keep a deliberately small child-process seam here. Vitest owns the complete
// deterministic matrix; this regression owns process.env materialization and
// startup/import failure propagation.
const defaults = readConfig();
assert.equal(defaults.environment, "development");
assert.equal(defaults.port, 8001);

const custom = readConfig({
  PORT: "8015",
  LONGTAIL_DATA_DIR: "./custom-data",
  LONGTAIL_INITIAL_WORKSPACE_NAME: "Custom Workspace",
});
assert.equal(custom.port, 8015);
assert.equal(custom.initialWorkspaceName, "Custom Workspace");
assert.ok(custom.dataDir.endsWith(`${path.sep}custom-data`), "relative data dir should materialize from the child-process environment");

assertConfigFails({ PORT: "not-a-number" }, /PORT must be an integer/);


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
      environment: config.environment,
      initialWorkspaceName: config.bootstrap.initialWorkspaceName,
      port: config.port,
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
