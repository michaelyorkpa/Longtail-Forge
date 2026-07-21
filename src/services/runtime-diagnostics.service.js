import path from "node:path";
import { config } from "../config.js";
import { getJobWorkerStatus } from "../core/jobs/index.js";
import { readDatabaseHealth } from "../db/index.js";
import { filesService } from "./files.service.js";
import { permissionsService } from "./permissions.service.js";

const REQUIRED_PERMISSION = "workspace_settings.manage";

async function read(session) {
  await permissionsService.assertCan(session, REQUIRED_PERMISSION, {
    operation: "read",
    workspace_id: session.workspace_id,
  });

  const databaseHealth = await readSafeDatabaseHealth();
  const storageHealth = await readSafeStorageHealth();
  const scannerHealth = await readSafeScannerHealth();
  const workerStatus = getJobWorkerStatus();

  return {
    app: {
      name: config.appName,
      version: config.appDisplayVersion,
      displayVersion: config.appDisplayVersion,
      canonicalVersion: config.appVersion,
      sourceBranch: config.release.sourceBranch,
    },
    runtime: {
      environment: config.environment,
      configurationWarnings: [...config.runtimeWarnings],
    },
    database: {
      provider: config.databaseProvider,
      health: {
        status: databaseHealth.status,
        fileWritable: databaseHealth.fileWritable,
      },
      sqlite: {
        busyTimeoutMs: databaseHealth.busyTimeoutMs,
        foreignKeysEnabled: databaseHealth.foreignKeysEnabled,
        journalMode: databaseHealth.journalMode,
        synchronous: databaseHealth.synchronous,
        cacheSizeKib: databaseHealth.cacheSizeKib,
        tempStore: databaseHealth.tempStore,
        mmapSizeBytes: databaseHealth.mmapSizeBytes,
      },
      fileLocation: safeDatabaseFileLocation(databaseHealth.databaseFile || config.databaseFile),
    },
    data: {
      directoryLocation: safeDataDirectoryLocation(config.dataDir),
    },
    storage: {
      provider: storageHealth.provider,
      health: {
        available: storageHealth.available,
        status: storageHealth.status,
      },
      rootLocation: storageHealth.rootDir ? safeStorageRootLocation(storageHealth.rootDir) : null,
    },
    scanner: {
      mode: scannerHealth.mode,
      health: {
        available: scannerHealth.available,
        status: scannerHealth.status,
        warning: scannerHealth.warning,
      },
    },
    worker: {
      mode: config.worker.mode,
      status: {
        claimedCount: workerStatus.claimedCount,
        completedCount: workerStatus.completedCount,
        deadCount: workerStatus.deadCount,
        failedCount: workerStatus.failedCount,
        lastClaimedCount: workerStatus.lastClaimedCount,
        lastErrorAt: workerStatus.lastErrorAt,
        lastPollAt: workerStatus.lastPollAt,
        lastRunAt: workerStatus.lastRunAt,
        lastSuccessAt: workerStatus.lastSuccessAt,
        lockTtlSeconds: workerStatus.lockTtlSeconds,
        pollIntervalMs: workerStatus.pollIntervalMs,
        registeredJobTypes: workerStatus.registeredJobTypes,
        running: workerStatus.running,
        startedAt: workerStatus.startedAt,
        state: workerStatus.state,
        stoppedAt: workerStatus.stoppedAt,
        timerActive: workerStatus.timerActive,
        workerId: workerStatus.workerId,
      },
    },
  };
}

async function readSafeStorageHealth() {
  const provider = safeText(config.storage?.provider || "local") || "local";

  try {
    const adapter = filesService.getFileStorageAdapter(provider);
    const health = await adapter.health();

    return {
      available: health?.ok !== false,
      provider: safeText(health?.provider || provider),
      rootDir: safeText(health?.rootDir || (provider === "local" ? config.storage.localRoot : "")),
      status: health?.ok === false ? "unavailable" : "ok",
    };
  } catch {
    return {
      available: false,
      provider,
      rootDir: safeText(provider === "local" ? config.storage.localRoot : ""),
      status: "unavailable",
    };
  }
}

async function readSafeScannerHealth() {
  const mode = safeText(config.scanner?.mode || "none") || "none";

  try {
    const scanner = filesService.resolveConfiguredFileScannerAdapter();
    const health = typeof scanner.adapter?.health === "function"
      ? await scanner.adapter.health()
      : null;
    const status = safeScannerStatus(health?.status, health?.available);

    return {
      available: booleanOrNull(health?.available ?? health?.ok),
      mode: safeText(scanner.scannerMode || mode) || mode,
      status,
      warning: scannerHealthWarning(scanner.scannerMode || mode, status),
    };
  } catch {
    return {
      available: false,
      mode,
      status: "unavailable",
      warning: scannerHealthWarning(mode, "unavailable"),
    };
  }
}

async function readSafeDatabaseHealth() {
  try {
    const health = await readDatabaseHealth();

    return {
      busyTimeoutMs: numberOrNull(health?.busyTimeoutMs),
      cacheSizeKib: numberOrNull(health?.cacheSizeKib),
      databaseFile: health?.databaseFile || "",
      fileWritable: Boolean(health?.databaseFileWritable),
      foreignKeysEnabled: Boolean(health?.foreignKeysEnabled),
      journalMode: safeText(health?.journalMode),
      mmapSizeBytes: numberOrNull(health?.mmapSizeBytes),
      synchronous: safeText(health?.synchronous),
      tempStore: safeText(health?.tempStore),
      status: "ok",
    };
  } catch {
    return {
      busyTimeoutMs: null,
      cacheSizeKib: null,
      databaseFile: "",
      fileWritable: false,
      foreignKeysEnabled: false,
      journalMode: "",
      mmapSizeBytes: null,
      synchronous: "",
      tempStore: "",
      status: "unavailable",
    };
  }
}

function safeStorageRootLocation(rootDir) {
  const resolved = path.resolve(rootDir || config.storage.localRoot);

  if (isInside(resolved, config.dataDir)) {
    return {
      display: joinSafePath("<data-dir>", relativeSafePath(config.dataDir, resolved)),
      redacted: false,
      relativeTo: "data-dir",
    };
  }

  if (isInside(resolved, config.root)) {
    return {
      display: `./${relativeSafePath(config.root, resolved)}`,
      redacted: false,
      relativeTo: "app-root",
    };
  }

  return redactedPathLocation(resolved);
}

function safeDatabaseFileLocation(databaseFile) {
  const resolved = path.resolve(databaseFile || config.databaseFile);

  if (isInside(resolved, config.dataDir)) {
    return {
      display: joinSafePath("<data-dir>", relativeSafePath(config.dataDir, resolved)),
      redacted: false,
      relativeTo: "data-dir",
    };
  }

  if (isInside(resolved, config.root)) {
    return {
      display: `./${relativeSafePath(config.root, resolved)}`,
      redacted: false,
      relativeTo: "app-root",
    };
  }

  return redactedPathLocation(resolved);
}

function safeDataDirectoryLocation(dataDir) {
  const resolved = path.resolve(dataDir || config.dataDir);

  if (isInside(resolved, config.root)) {
    return {
      display: `./${relativeSafePath(config.root, resolved)}`,
      redacted: false,
      relativeTo: "app-root",
    };
  }

  return redactedPathLocation(resolved);
}

function redactedPathLocation(resolvedPath) {
  return {
    display: joinSafePath("<redacted>", path.basename(resolvedPath)),
    redacted: true,
    relativeTo: "outside-app-root",
  };
}

function relativeSafePath(basePath, targetPath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return normalizePathSeparators(relativePath || ".");
}

function joinSafePath(prefix, suffix) {
  const cleanSuffix = String(suffix || "").replace(/^[/\\]+/, "");
  return cleanSuffix && cleanSuffix !== "." ? `${prefix}/${normalizePathSeparators(cleanSuffix)}` : prefix;
}

function isInside(targetPath, basePath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizePathSeparators(value) {
  return String(value || "").replaceAll(path.sep, "/");
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function safeScannerStatus(status, available) {
  const normalized = safeText(status).toLowerCase();
  const allowedStatuses = new Set(["disabled", "ok", "pass_through", "unavailable", "unknown"]);

  if (allowedStatuses.has(normalized)) {
    return normalized;
  }

  if (available === true) {
    return "ok";
  }

  if (available === false) {
    return "unavailable";
  }

  return "unknown";
}

function scannerHealthWarning(mode, status) {
  const scannerMode = safeText(mode);

  if (scannerMode === "none") {
    return "File scanning is disabled; uploads are marked not required.";
  }

  if (scannerMode === "noop") {
    return "File scanner is in pass-through mode; files are trusted without an external scan.";
  }

  if (status === "unavailable") {
    return "Scanner health is unavailable for the configured mode.";
  }

  if (status === "unknown") {
    return "Scanner health is not reported for the configured mode.";
  }

  return "";
}

function safeText(value) {
  return String(value || "").trim();
}

export const runtimeDiagnosticsService = {
  read,
};
