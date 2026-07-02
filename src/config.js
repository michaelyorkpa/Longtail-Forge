import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
const DEFAULT_WORKSPACE_INSTALL_MODE = "self_hosted";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_SESSION_COOKIE_SAMESITE = "Lax";
const DEFAULT_SECURE_NOTES_KEY_VERSION = "v1";
const DEFAULT_STORAGE_PROVIDER = "local";
const DEFAULT_FILE_SCANNER = "none";
const DEFAULT_WORKER_MODE = "inline";
const DEFAULT_WORKER_ID = "default";
const DEFAULT_JOB_POLL_INTERVAL_MS = 5000;
const DEFAULT_JOB_LOCK_TTL_SECONDS = 300;
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_INITIAL_WORKSPACE_NAME = "Longtail Forge Workspace";
const DEFAULT_SUPER_ADMIN_USERNAME = "support@longtailforge.local";
const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = "Super Admin";
const SESSION_SAMESITE_VALUES = new Set(["Lax", "Strict", "None"]);
const ENVIRONMENTS = new Set(["development", "test", "production"]);
const DATABASE_PROVIDERS = new Set(["sqlite"]);
const SQLITE_JOURNAL_MODES = new Set(["delete", "truncate", "persist", "memory", "wal", "off"]);
const WORKSPACE_INSTALL_MODES = new Set(["self_hosted", "saas"]);
const WORKSPACE_TYPE_LIMITS = new Set(["", "business"]);
const WORKER_MODES = new Set(["inline", "separate", "disabled"]);

function toDisplayName(packageName) {
  return String(packageName)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createConfig(env = process.env) {
  const environment = readEnum(env, "LONGTAIL_ENV", DEFAULT_ENVIRONMENT, ENVIRONMENTS);
  const dataDir = resolveRuntimePath(readText(env, "LONGTAIL_DATA_DIR", DEFAULT_DATA_DIR));
  const databaseFile = resolveRuntimePath(
    readText(env, "LONGTAIL_DATABASE_FILE", path.join(dataDir, DEFAULT_DATABASE_FILE_NAME)),
  );
  const sqliteForeignKeys = readBoolean(env, "LONGTAIL_SQLITE_FOREIGN_KEYS", DEFAULT_SQLITE_FOREIGN_KEYS);
  const sessionCookieSecure = readBoolean(env, "LONGTAIL_SESSION_COOKIE_SECURE", false);
  const sessionCookieSameSite = readSessionSameSite(env);
  const runtimeWarnings = [];

  if (!sqliteForeignKeys) {
    throw new Error("LONGTAIL_SQLITE_FOREIGN_KEYS must be on.");
  }

  if (sessionCookieSameSite === "None" && !sessionCookieSecure) {
    throw new Error("LONGTAIL_SESSION_COOKIE_SECURE must be true when LONGTAIL_SESSION_COOKIE_SAMESITE is None.");
  }

  if (environment === "production" && !readText(env, "SUPER_ADMIN_PASSWORD", "")) {
    throw new Error("SUPER_ADMIN_PASSWORD is required when LONGTAIL_ENV=production.");
  }

  if (environment === "production" && !readText(env, "LONGTAIL_PUBLIC_URL", "")) {
    runtimeWarnings.push("LONGTAIL_PUBLIC_URL should be set when LONGTAIL_ENV=production.");
  }

  return {
    appName: toDisplayName(packageJson.name),
    appVersion: packageJson.version,
    environment,
    publicUrl: readText(env, "LONGTAIL_PUBLIC_URL", ""),
    host: readText(env, "HOST", DEFAULT_HOST),
    port: readInteger(env, "PORT", DEFAULT_PORT, { min: 1, max: 65535 }),
    root,
    publicDir: path.join(root, "public"),
    viewsDir: path.join(root, "views"),
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
      superAdminPassword: readText(env, "SUPER_ADMIN_PASSWORD", ""),
    },
    cookies: {
      sessionName: "longtail_forge_session",
      themeName: "lf_theme",
      httpOnly: true,
      secure: sessionCookieSecure,
      sameSite: sessionCookieSameSite,
      maxAgeSeconds: readInteger(env, "LONGTAIL_SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS, {
        min: 300,
        max: 60 * 60 * 24 * 30,
      }),
    },
    secureNotes: {
      keyVersion: readText(env, "LONGTAIL_SECURE_NOTES_KEY_VERSION", DEFAULT_SECURE_NOTES_KEY_VERSION),
      masterKeyConfigured: Boolean(readRuntimeSecret("LONGTAIL_SECURE_NOTES_MASTER_KEY", env) || readRuntimeSecret("SECURE_NOTES_MASTER_KEY", env)),
    },
    storage: {
      provider: readText(env, "LONGTAIL_STORAGE_PROVIDER", DEFAULT_STORAGE_PROVIDER),
      localRoot: resolveRuntimePath(readText(env, "LONGTAIL_LOCAL_STORAGE_ROOT", path.join(dataDir, "files"))),
    },
    scanner: {
      mode: readText(env, "LONGTAIL_FILE_SCANNER", DEFAULT_FILE_SCANNER),
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
    },
    logLevel: readText(env, "LONGTAIL_LOG_LEVEL", DEFAULT_LOG_LEVEL),
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

function readSqliteJournalMode(env) {
  const value = readText(env, "LONGTAIL_SQLITE_JOURNAL_MODE", DEFAULT_SQLITE_JOURNAL_MODE).toLowerCase();

  if (!SQLITE_JOURNAL_MODES.has(value)) {
    throw new Error(`LONGTAIL_SQLITE_JOURNAL_MODE must be ${[...SQLITE_JOURNAL_MODES].join(", ")}.`);
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
