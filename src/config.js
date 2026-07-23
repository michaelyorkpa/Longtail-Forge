import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { appVersion, normalizeReleaseBranch, qualifyAppVersion } from "./core/version.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const DEFAULT_ENVIRONMENT = "development";
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8001;
const DEFAULT_DATA_DIR = path.join(root, "data");
const DEFAULT_DATABASE_PROVIDER = "sqlite";
const DEFAULT_DATABASE_FILE_NAME = "longtail-forge.db";
const DEFAULT_SQLITE_FOREIGN_KEYS = true;
const DEFAULT_SQLITE_JOURNAL_MODE = "wal";
const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5000;
const DEFAULT_SQLITE_SYNCHRONOUS = "normal";
const DEFAULT_SQLITE_CACHE_SIZE_KIB = 65536;
const DEFAULT_SQLITE_TEMP_STORE = "memory";
const DEFAULT_SQLITE_MMAP_SIZE_BYTES = 0;
const DEFAULT_WORKSPACE_INSTALL_MODE = "self_hosted";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_SESSION_COOKIE_SAMESITE = "Lax";
const DEFAULT_PRODUCTION_HSTS_MAX_AGE_SECONDS = 300;
const DEFAULT_AUTH_THROTTLE_WINDOW_SECONDS = 15 * 60;
const DEFAULT_AUTH_THROTTLE_FAILURE_LIMIT = 5;
const DEFAULT_AUTH_THROTTLE_LOCKOUT_SECONDS = 15 * 60;
const DEFAULT_AUTH_VERIFICATION_CONCURRENCY_LIMIT = 4;
const DEFAULT_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT = 2;
const DEFAULT_SECURE_NOTES_KEY_VERSION = "v1";
const DEFAULT_STORAGE_PROVIDER = "local";
const DEFAULT_FILE_SCANNER = "none";
const DEFAULT_WORKER_MODE = "inline";
const DEFAULT_WORKER_ID = "default";
const DEFAULT_JOB_POLL_INTERVAL_MS = 5000;
const DEFAULT_JOB_LOCK_TTL_SECONDS = 300;
const DEFAULT_JOB_COMPLETED_RETENTION_DAYS = 30;
const DEFAULT_JOB_DEAD_RETENTION_DAYS = 90;
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_INITIAL_WORKSPACE_NAME = "Longtail Forge Workspace";
const DEFAULT_SUPER_ADMIN_USERNAME = "support@longtailforge.local";
const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = "Super Admin";
const SESSION_SAMESITE_VALUES = new Set(["Lax", "Strict", "None"]);
const ENVIRONMENTS = new Set(["development", "test", "production"]);
const DATABASE_PROVIDERS = new Set(["sqlite"]);
const SQLITE_JOURNAL_MODES = new Set(["delete", "truncate", "persist", "memory", "wal", "off"]);
const SQLITE_SYNCHRONOUS_MODES = new Set(["normal", "full", "extra"]);
const SQLITE_TEMP_STORE_MODES = new Set(["default", "file", "memory"]);
const WORKSPACE_INSTALL_MODES = new Set(["self_hosted", "saas"]);
const WORKSPACE_TYPE_LIMITS = new Set(["", "business"]);
const FILE_SCANNER_MODES = new Set(["none", "noop", "clamd", "clamscan"]);
const WORKER_MODES = new Set(["inline", "separate", "disabled"]);
const LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error"]);
const PRODUCTION_FILE_SCANNERS = new Set(["clamd", "clamscan"]);
const UNSAFE_SECRET_VALUES = new Set([
  "admin",
  "changeme",
  "change-me",
  "default",
  "example",
  "longtailforge",
  "password",
  "superadmin",
]);

function toDisplayName(packageName) {
  return String(packageName)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createConfig(env = process.env) {
  const environment = readEnum(env, "LONGTAIL_ENV", DEFAULT_ENVIRONMENT, ENVIRONMENTS);
  const publicUrl = readPublicUrl(env);
  const publicUrlProtocol = publicUrl ? new URL(publicUrl).protocol : "";
  const publicDir = path.join(root, "public");
  const viewsDir = path.join(root, "views");
  const dataDir = resolveRuntimePath(readText(env, "LONGTAIL_DATA_DIR", DEFAULT_DATA_DIR));
  const databaseFile = resolveRuntimePath(
    readText(env, "LONGTAIL_DATABASE_FILE", path.join(dataDir, DEFAULT_DATABASE_FILE_NAME)),
  );
  const localStorageRoot = resolveRuntimePath(
    readText(env, "LONGTAIL_LOCAL_STORAGE_ROOT", path.join(dataDir, "files")),
  );
  const workspaceBackupRoot = resolveRuntimePath(
    readText(env, "LONGTAIL_WORKSPACE_BACKUP_ROOT", path.join(root, "backups", "workspaces")),
  );
  const sqliteForeignKeys = readBoolean(env, "LONGTAIL_SQLITE_FOREIGN_KEYS", DEFAULT_SQLITE_FOREIGN_KEYS);
  const sessionCookieSecure = readBoolean(env, "LONGTAIL_SESSION_COOKIE_SECURE", false);
  const sessionCookieSameSite = readSessionSameSite(env);
  const trustedProxies = readTrustedProxies(env);
  const allowInsecurePublicUrl = readBoolean(env, "LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL", false);
  const allowUnscannedUploads = readBoolean(env, "LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS", false);
  const allowDisabledAuthenticationThrottle = readBoolean(
    env,
    "LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE",
    false,
  );
  const allowHstsRollback = readBoolean(env, "LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK", false);
  const allowDebugLogging = readBoolean(env, "LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING", false);
  const hstsConfigured = hasEnvText(env, "LONGTAIL_HSTS_MAX_AGE_SECONDS");
  const hstsMaxAgeSeconds = readInteger(
    env,
    "LONGTAIL_HSTS_MAX_AGE_SECONDS",
    environment === "production" ? DEFAULT_PRODUCTION_HSTS_MAX_AGE_SECONDS : 0,
    { min: 0, max: 60 * 60 * 24 * 365 * 2 },
  );
  const authenticationThrottleEnabled = readBoolean(env, "LONGTAIL_AUTH_THROTTLE_ENABLED", true);
  const authenticationThrottleWindowSeconds = readInteger(
    env,
    "LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS",
    DEFAULT_AUTH_THROTTLE_WINDOW_SECONDS,
    { min: 1, max: 60 * 60 * 24 },
  );
  const authenticationThrottleFailureLimit = readInteger(
    env,
    "LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT",
    DEFAULT_AUTH_THROTTLE_FAILURE_LIMIT,
    { min: 1, max: 1000 },
  );
  const authenticationThrottleLockoutSeconds = readInteger(
    env,
    "LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS",
    DEFAULT_AUTH_THROTTLE_LOCKOUT_SECONDS,
    { min: 1, max: 60 * 60 * 24 * 7 },
  );
  const authenticationVerificationConcurrencyLimit = readInteger(
    env,
    "LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT",
    DEFAULT_AUTH_VERIFICATION_CONCURRENCY_LIMIT,
    { min: 1, max: 64 },
  );
  const authenticationVerificationConcurrencyPerIpLimit = readInteger(
    env,
    "LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT",
    DEFAULT_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT,
    { min: 1, max: authenticationVerificationConcurrencyLimit },
  );
  const bootstrapPassword = readRuntimeSecret("SUPER_ADMIN_PASSWORD", env);
  const secureNotesMasterKey = readRuntimeSecret("LONGTAIL_SECURE_NOTES_MASTER_KEY", env)
    || readRuntimeSecret("SECURE_NOTES_MASTER_KEY", env);
  const scannerMode = readEnum(env, "LONGTAIL_FILE_SCANNER", DEFAULT_FILE_SCANNER, FILE_SCANNER_MODES);
  const logLevel = readEnum(env, "LONGTAIL_LOG_LEVEL", DEFAULT_LOG_LEVEL, LOG_LEVELS);
  const releaseCommit = readOptionalHex(env, "LONGTAIL_RELEASE_COMMIT", 40);
  const releaseArtifactSha256 = readOptionalHex(env, "LONGTAIL_RELEASE_ARTIFACT_SHA256", 64);
  const releaseSourceBranch = normalizeReleaseBranch(readText(env, "LONGTAIL_RELEASE_BRANCH", ""));
  const runtimeWarnings = [];

  if (!sqliteForeignKeys) {
    throw new Error("LONGTAIL_SQLITE_FOREIGN_KEYS must be on.");
  }

  if (sessionCookieSameSite === "None" && !sessionCookieSecure) {
    throw new Error("LONGTAIL_SESSION_COOKIE_SECURE must be true when LONGTAIL_SESSION_COOKIE_SAMESITE is None.");
  }

  assertPathIsNotPublic(dataDir, "LONGTAIL_DATA_DIR", publicDir);
  assertPathIsNotPublic(databaseFile, "LONGTAIL_DATABASE_FILE", publicDir);
  assertPathIsNotPublic(localStorageRoot, "LONGTAIL_LOCAL_STORAGE_ROOT", publicDir);
  assertPathIsNotPublic(workspaceBackupRoot, "LONGTAIL_WORKSPACE_BACKUP_ROOT", publicDir);

  if (environment === "production") {
    assertProductionSecret(bootstrapPassword, "SUPER_ADMIN_PASSWORD", 16);
    assertProductionSecret(secureNotesMasterKey, "LONGTAIL_SECURE_NOTES_MASTER_KEY", 32);

    if (!publicUrl) {
      throw new Error("LONGTAIL_PUBLIC_URL is required when LONGTAIL_ENV=production.");
    }
  }

  if (environment === "production" && publicUrlProtocol === "http:" && !allowInsecurePublicUrl) {
    throw new Error("LONGTAIL_PUBLIC_URL must use https in production. Set LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL=true only for an explicitly accepted unsafe development deployment.");
  }

  if (environment === "production" && publicUrlProtocol === "http:" && allowInsecurePublicUrl) {
    runtimeWarnings.push("UNSAFE OVERRIDE ACTIVE: production LONGTAIL_PUBLIC_URL uses HTTP and browser sessions are not protected by TLS.");
  }

  if (environment === "production" && publicUrlProtocol === "https:" && !trustedProxies.length) {
    throw new Error("TRUST_PROXY must list the TLS reverse proxy when LONGTAIL_PUBLIC_URL uses https in production.");
  }

  if (environment === "production" && publicUrlProtocol === "https:" && !sessionCookieSecure) {
    throw new Error("LONGTAIL_SESSION_COOKIE_SECURE must be true for a production HTTPS deployment.");
  }

  if (environment === "production" && hstsConfigured && hstsMaxAgeSeconds === 0 && !allowHstsRollback) {
    throw new Error("LONGTAIL_HSTS_MAX_AGE_SECONDS=0 requires LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK=true in production.");
  }

  if (environment === "production" && hstsConfigured && hstsMaxAgeSeconds === 0 && allowHstsRollback) {
    runtimeWarnings.push("UNSAFE OVERRIDE ACTIVE: HSTS rollback mode is active; secure responses send max-age=0.");
  }

  if (environment === "production" && !authenticationThrottleEnabled && !allowDisabledAuthenticationThrottle) {
    throw new Error("Disabling authentication throttling in production requires LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE=true.");
  }

  if (environment === "production" && !authenticationThrottleEnabled && allowDisabledAuthenticationThrottle) {
    runtimeWarnings.push("UNSAFE OVERRIDE ACTIVE: authentication throttling is disabled in production.");
  }

  if (environment === "production" && !PRODUCTION_FILE_SCANNERS.has(scannerMode) && !allowUnscannedUploads) {
    throw new Error("LONGTAIL_FILE_SCANNER must be clamd or clamscan in production. Set LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true only for an explicitly accepted deployment without upload scanning.");
  }

  if (environment === "production" && !PRODUCTION_FILE_SCANNERS.has(scannerMode) && allowUnscannedUploads) {
    runtimeWarnings.push(`UNSAFE OVERRIDE ACTIVE: production uploads use the '${scannerMode}' scanner mode and are not malware-scanned.`);
  }

  if (environment === "production" && ["trace", "debug"].includes(logLevel) && !allowDebugLogging) {
    throw new Error("LONGTAIL_LOG_LEVEL trace/debug requires LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING=true in production.");
  }

  if (environment === "production" && ["trace", "debug"].includes(logLevel) && allowDebugLogging) {
    runtimeWarnings.push(`UNSAFE OVERRIDE ACTIVE: production logging is set to '${logLevel}'.`);
  }

  return {
    appName: toDisplayName(packageJson.name),
    appVersion,
    appDisplayVersion: qualifyAppVersion(appVersion, releaseSourceBranch),
    release: {
      sourceBranch: releaseSourceBranch || null,
      commitSha: releaseCommit,
      artifactSha256: releaseArtifactSha256,
    },
    environment,
    publicUrl,
    host: readText(env, "HOST", DEFAULT_HOST),
    port: readInteger(env, "PORT", DEFAULT_PORT, { min: 1, max: 65535 }),
    root,
    publicDir,
    viewsDir,
    dataDir,
    logsDir: path.join(root, "logs"),
    logDir: path.join(root, "logs"),
    databaseProvider: readEnum(env, "LONGTAIL_DATABASE_PROVIDER", DEFAULT_DATABASE_PROVIDER, DATABASE_PROVIDERS),
    databaseFile,
    migrationsDir: path.join(root, "src", "db", "migrations"),
    settingsFile: path.join(dataDir, "settings.json"),
    clientProjectFile: path.join(dataDir, "client-project.json"),
    timeEntriesFile: path.join(dataDir, "time-entries.csv"),
    sqlite: {
      foreignKeys: sqliteForeignKeys,
      journalMode: readSqliteJournalMode(env),
      busyTimeoutMs: readInteger(env, "LONGTAIL_SQLITE_BUSY_TIMEOUT_MS", DEFAULT_SQLITE_BUSY_TIMEOUT_MS, {
        min: 0,
        max: 60 * 60 * 1000,
      }),
      synchronous: readSqliteSynchronousMode(env),
      cacheSizeKib: readInteger(env, "LONGTAIL_SQLITE_CACHE_SIZE_KIB", DEFAULT_SQLITE_CACHE_SIZE_KIB, {
        min: 1024,
        max: 1024 * 1024,
      }),
      tempStore: readSqliteTempStore(env),
      mmapSizeBytes: readInteger(env, "LONGTAIL_SQLITE_MMAP_SIZE_BYTES", DEFAULT_SQLITE_MMAP_SIZE_BYTES, {
        min: 0,
        max: 8 * 1024 * 1024 * 1024,
      }),
    },
    workspaceInstallMode: readEnum(
      env,
      "WORKSPACE_INSTALL_MODE",
      DEFAULT_WORKSPACE_INSTALL_MODE,
      WORKSPACE_INSTALL_MODES,
    ),
    workspaceTypeLimit: readEnum(env, "WORKSPACE_TYPE_LIMIT", "", WORKSPACE_TYPE_LIMITS),
    bootstrap: {
      initialWorkspaceName: readText(env, "LONGTAIL_INITIAL_WORKSPACE_NAME", DEFAULT_INITIAL_WORKSPACE_NAME),
      superAdminUsername: readText(env, "SUPER_ADMIN_USERNAME", DEFAULT_SUPER_ADMIN_USERNAME),
      superAdminDisplayName: readText(env, "SUPER_ADMIN_DISPLAY_NAME", DEFAULT_SUPER_ADMIN_DISPLAY_NAME),
      superAdminPassword: bootstrapPassword,
    },
    cookies: {
      csrfName: "lf_csrf",
      sessionName: "longtail_forge_session",
      themeName: "lf_theme",
      themeAutoSourceName: "lf_theme_auto_source",
      httpOnly: true,
      domain: "",
      path: "/",
      secure: sessionCookieSecure,
      sameSite: sessionCookieSameSite,
      maxAgeSeconds: readInteger(env, "LONGTAIL_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS, {
        min: 300,
        max: 60 * 60 * 24 * 30,
      }),
    },
    security: {
      allowInsecurePublicUrl,
      allowUnscannedUploads,
      allowDebugLogging,
      allowDisabledAuthenticationThrottle,
      allowHstsRollback,
      authenticationThrottle: {
        enabled: authenticationThrottleEnabled,
        failureLimit: authenticationThrottleFailureLimit,
        lockoutSeconds: authenticationThrottleLockoutSeconds,
        verificationConcurrencyLimit: authenticationVerificationConcurrencyLimit,
        verificationConcurrencyPerIpLimit: authenticationVerificationConcurrencyPerIpLimit,
        windowSeconds: authenticationThrottleWindowSeconds,
      },
      hsts: {
        enabled: environment === "production" || hstsConfigured,
        maxAgeSeconds: hstsMaxAgeSeconds,
      },
      trustedProxies,
    },
    secureNotes: {
      keyVersion: readText(env, "LONGTAIL_SECURE_NOTES_KEY_VERSION", DEFAULT_SECURE_NOTES_KEY_VERSION),
      masterKeyConfigured: Boolean(secureNotesMasterKey),
    },
    storage: {
      provider: readText(env, "LONGTAIL_STORAGE_PROVIDER", DEFAULT_STORAGE_PROVIDER),
      localRoot: localStorageRoot,
      s3: {
        accessKeyId: readRuntimeSecret("LONGTAIL_S3_ACCESS_KEY_ID", env),
        bucket: readText(env, "LONGTAIL_S3_BUCKET", ""),
        endpoint: readText(env, "LONGTAIL_S3_ENDPOINT", ""),
        region: readText(env, "LONGTAIL_S3_REGION", ""),
        secretAccessKey: readRuntimeSecret("LONGTAIL_S3_SECRET_ACCESS_KEY", env),
      },
    },
    workspaceBackups: {
      root: workspaceBackupRoot,
    },
    scanner: {
      mode: scannerMode,
      clamdHost: readText(env, "LONGTAIL_CLAMD_HOST", ""),
      clamdPort: readText(env, "LONGTAIL_CLAMD_PORT", ""),
      clamscanPath: readText(env, "LONGTAIL_CLAMSCAN_PATH", ""),
    },
    worker: {
      mode: readEnum(env, "LONGTAIL_WORKER_MODE", DEFAULT_WORKER_MODE, WORKER_MODES),
      id: readText(env, "LONGTAIL_WORKER_ID", DEFAULT_WORKER_ID),
      pollIntervalMs: readInteger(env, "LONGTAIL_JOB_POLL_INTERVAL_MS", DEFAULT_JOB_POLL_INTERVAL_MS, {
        min: 1000,
        max: 60 * 60 * 1000,
      }),
      lockTtlSeconds: readInteger(env, "LONGTAIL_JOB_LOCK_TTL_SECONDS", DEFAULT_JOB_LOCK_TTL_SECONDS, {
        min: 30,
        max: 60 * 60 * 24,
      }),
      completedRetentionDays: readInteger(
        env,
        "LONGTAIL_JOB_COMPLETED_RETENTION_DAYS",
        DEFAULT_JOB_COMPLETED_RETENTION_DAYS,
        {
          min: 1,
          max: 3650,
        },
      ),
      deadRetentionDays: readInteger(
        env,
        "LONGTAIL_JOB_DEAD_RETENTION_DAYS",
        DEFAULT_JOB_DEAD_RETENTION_DAYS,
        {
          min: 1,
          max: 3650,
        },
      ),
    },
    logLevel,
    runtimeWarnings,
    envOverrides: {
      workspaceInstallMode: hasEnvText(env, "WORKSPACE_INSTALL_MODE")
        ? readEnum(env, "WORKSPACE_INSTALL_MODE", DEFAULT_WORKSPACE_INSTALL_MODE, WORKSPACE_INSTALL_MODES)
        : "",
      workspaceTypeLimit: hasEnvText(env, "WORKSPACE_TYPE_LIMIT")
        ? readEnum(env, "WORKSPACE_TYPE_LIMIT", "", WORKSPACE_TYPE_LIMITS)
        : "",
    },
  };
}

function assertProductionSecret(secret, key, minimumLength) {
  if (!secret) {
    throw new Error(`${key} is required when LONGTAIL_ENV=production.`);
  }

  if (secret.length < minimumLength || UNSAFE_SECRET_VALUES.has(secret.toLowerCase())) {
    throw new Error(`${key} must be a non-default secret of at least ${minimumLength} characters in production.`);
  }
}

function readOptionalHex(env, key, length) {
  const value = readText(env, key, "").toLowerCase();
  if (value && !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new Error(`${key} must be empty or exactly ${length} hexadecimal characters.`);
  }
  return value;
}

function assertPathIsNotPublic(runtimePath, key, publicDir) {
  const relative = path.relative(publicDir, runtimePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`${key} must not resolve inside the public static directory.`);
  }
}

function readText(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === null) {
    return fallback;
  }

  const text = String(raw).trim();
  return text || fallback;
}

function hasEnvText(env, key) {
  return Boolean(String(env[key] ?? "").trim());
}

function readEnum(env, key, fallback, allowedValues) {
  const value = readText(env, key, fallback);

  if (!allowedValues.has(value)) {
    throw new Error(`${key} must be ${[...allowedValues].filter(Boolean).join(" or ") || "empty"}.`);
  }

  return value;
}

function readInteger(env, key, fallback, options = {}) {
  const raw = env[key];
  const value = raw === undefined || raw === null || String(raw).trim() === ""
    ? fallback
    : Number.parseInt(String(raw), 10);

  if (!Number.isInteger(value) || String(raw ?? "").trim().match(/^-?\d+$/) === null && raw !== undefined && raw !== null && String(raw).trim() !== "") {
    throw new Error(`${key} must be an integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new Error(`${key} must be at least ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new Error(`${key} must be at most ${options.max}.`);
  }

  return value;
}

function readBoolean(env, key, fallback) {
  const raw = env[key];

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }

  const value = String(raw).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${key} must be true or false.`);
}

function readSessionSameSite(env) {
  const raw = readText(env, "LONGTAIL_SESSION_COOKIE_SAMESITE", DEFAULT_SESSION_COOKIE_SAMESITE);
  const normalized = raw.toLowerCase() === "none"
    ? "None"
    : raw.toLowerCase() === "strict"
      ? "Strict"
      : raw.toLowerCase() === "lax"
        ? "Lax"
        : raw;

  if (!SESSION_SAMESITE_VALUES.has(normalized)) {
    throw new Error("LONGTAIL_SESSION_COOKIE_SAMESITE must be Lax, Strict, or None.");
  }

  return normalized;
}

function readTrustedProxies(env) {
  const raw = String(env.TRUST_PROXY ?? "").trim();

  if (!raw || ["0", "false", "no", "off"].includes(raw.toLowerCase())) {
    return [];
  }

  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) {
    throw new Error("TRUST_PROXY must list explicit proxy IP addresses or CIDR ranges; blanket trust is not allowed.");
  }

  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);

  if (!entries.length || entries.some((entry) => !isIpOrCidr(entry))) {
    throw new Error("TRUST_PROXY must be false or a comma-separated list of proxy IP addresses or CIDR ranges.");
  }

  return entries;
}

function readPublicUrl(env) {
  const value = readText(env, "LONGTAIL_PUBLIC_URL", "");

  if (!value) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("LONGTAIL_PUBLIC_URL must be an absolute http or https URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("LONGTAIL_PUBLIC_URL must be an absolute http or https URL.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("LONGTAIL_PUBLIC_URL must not include credentials.");
  }

  return value;
}

function isIpOrCidr(value) {
  const [address, prefix, ...extra] = String(value).split("/");
  const family = net.isIP(address);

  if (!family || extra.length) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  if (!/^\d+$/.test(prefix)) {
    return false;
  }

  const bits = Number(prefix);
  return bits >= 0 && bits <= (family === 4 ? 32 : 128);
}

function readSqliteJournalMode(env) {
  const value = readText(env, "LONGTAIL_SQLITE_JOURNAL_MODE", DEFAULT_SQLITE_JOURNAL_MODE).toLowerCase();

  if (!SQLITE_JOURNAL_MODES.has(value)) {
    throw new Error(`LONGTAIL_SQLITE_JOURNAL_MODE must be ${[...SQLITE_JOURNAL_MODES].join(", ")}.`);
  }

  return value;
}

function readSqliteSynchronousMode(env) {
  const value = readText(env, "LONGTAIL_SQLITE_SYNCHRONOUS", DEFAULT_SQLITE_SYNCHRONOUS).toLowerCase();

  if (!SQLITE_SYNCHRONOUS_MODES.has(value)) {
    throw new Error(`LONGTAIL_SQLITE_SYNCHRONOUS must be ${[...SQLITE_SYNCHRONOUS_MODES].join(", ")}.`);
  }

  return value;
}

function readSqliteTempStore(env) {
  const value = readText(env, "LONGTAIL_SQLITE_TEMP_STORE", DEFAULT_SQLITE_TEMP_STORE).toLowerCase();

  if (!SQLITE_TEMP_STORE_MODES.has(value)) {
    throw new Error(`LONGTAIL_SQLITE_TEMP_STORE must be ${[...SQLITE_TEMP_STORE_MODES].join(", ")}.`);
  }

  return value;
}

function resolveRuntimePath(value) {
  const text = String(value || "").trim();
  return path.isAbsolute(text) ? path.normalize(text) : path.resolve(root, text);
}

function readRuntimeSecret(key, env = process.env) {
  return String(env[key] || "").trim();
}

function logRuntimeConfigWarnings(logger = console.warn) {
  for (const warning of config.runtimeWarnings) {
    logger(`[runtime-config] ${warning}`);
  }
}

const config = createConfig();

export { config, createConfig, logRuntimeConfigWarnings, readRuntimeSecret };
