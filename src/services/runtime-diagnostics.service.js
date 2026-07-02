import path from "node:path";
import { config } from "../config.js";
import { getJobWorkerStatus } from "../core/jobs/index.js";
import { readDatabaseHealth } from "../db/index.js";
import { permissionsService } from "./permissions.service.js";

const REQUIRED_PERMISSION = "workspace_settings.manage";

async function read(session) {
  await permissionsService.assertCan(session, REQUIRED_PERMISSION, {
    operation: "read",
    workspace_id: session.workspace_id,
  });

  const databaseHealth = await readSafeDatabaseHealth();
  const workerStatus = getJobWorkerStatus();

  return {
    app: {
      name: config.appName,
      version: config.appVersion,
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
      },
      fileLocation: safeDatabaseFileLocation(databaseHealth.databaseFile || config.databaseFile),
    },
    data: {
      directoryLocation: safeDataDirectoryLocation(config.dataDir),
    },
    storage: {
      provider: config.storage.provider,
    },
    scanner: {
      mode: config.scanner.mode,
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

async function readSafeDatabaseHealth() {
  try {
    const health = await readDatabaseHealth();

    return {
      busyTimeoutMs: numberOrNull(health?.busyTimeoutMs),
      databaseFile: health?.databaseFile || "",
      fileWritable: Boolean(health?.databaseFileWritable),
      foreignKeysEnabled: Boolean(health?.foreignKeysEnabled),
      journalMode: safeText(health?.journalMode),
      status: "ok",
    };
  } catch {
    return {
      busyTimeoutMs: null,
      databaseFile: "",
      fileWritable: false,
      foreignKeysEnabled: false,
      journalMode: "",
      status: "unavailable",
    };
  }
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

function safeText(value) {
  return String(value || "").trim();
}

export const runtimeDiagnosticsService = {
  read,
};
