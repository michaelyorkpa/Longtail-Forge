import path from "node:path";
import { config } from "../config.js";
import { getJobWorkerStatus } from "../core/jobs/index.js";
import { readDatabaseHealth } from "../db/index.js";
import { filesService } from "./files.service.js";
import { permissionsService } from "./permissions.service.js";
import { listPublicDemoCapabilities } from "../core/public-demo-capabilities.js";
import { PUBLIC_DEMO_BUDGET_LIMITS, listPublicDemoBudgetOperations } from "../core/public-demo-budget-catalog.js";

const REQUIRED_PERMISSION = "workspace_settings.manage";

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 */
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
      deploymentMode: config.deployment.mode,
      configurationWarnings: [...config.runtimeWarnings],
    },
    features: {
      publicDemo: {
        enabled: config.demo.enabled,
        profile: config.demo.profile,
        capabilities: config.demo.enabled ? listPublicDemoCapabilities() : [],
        budgets: {
          enabled: config.demo.enabled,
          accountMutationUnits: PUBLIC_DEMO_BUDGET_LIMITS.accountMutationUnits,
          workspaceMutationUnits: PUBLIC_DEMO_BUDGET_LIMITS.workspaceMutationUnits,
          maxArrayItems: PUBLIC_DEMO_BUDGET_LIMITS.maxArrayItems,
          maxFieldBytes: PUBLIC_DEMO_BUDGET_LIMITS.maxFieldBytes,
          maxRichTextBytes: PUBLIC_DEMO_BUDGET_LIMITS.maxRichTextBytes,
          maxPageSize: PUBLIC_DEMO_BUDGET_LIMITS.maxPageSize,
          maxQueryBytes: PUBLIC_DEMO_BUDGET_LIMITS.maxQueryBytes,
          operationCount: listPublicDemoBudgetOperations().length,
        },
        perimeter: {
          enabled: config.demo.enabled,
          clientRequestLimit: config.demo.perimeter.clientRequestLimit,
          globalRequestLimit: config.demo.perimeter.globalRequestLimit,
          maxBodyBytes: config.demo.perimeter.maxBodyBytes,
          mutationLimit: config.demo.perimeter.mutationLimit,
          searchLimit: config.demo.perimeter.searchLimit,
          windowSeconds: config.demo.perimeter.windowSeconds,
        },
      },
      supportView: {
        enabled: config.supportView.enabled,
      },
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
      available: booleanOrNull(health?.available),
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

/**
 * @param {string} rootDir
 */
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

/**
 * @param {unknown} databaseFile
 */
function safeDatabaseFileLocation(databaseFile) {
  const resolved = path.resolve(String(databaseFile || config.databaseFile));

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

/**
 * @param {string} dataDir
 */
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

/**
 * @param {string} resolvedPath
 */
function redactedPathLocation(resolvedPath) {
  return {
    display: joinSafePath("<redacted>", path.basename(resolvedPath)),
    redacted: true,
    relativeTo: "outside-app-root",
  };
}

/**
 * @param {string} basePath
 * @param {string} targetPath
 */
function relativeSafePath(basePath, targetPath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return normalizePathSeparators(relativePath || ".");
}

/**
 * @param {string} prefix
 * @param {string} suffix
 */
function joinSafePath(prefix, suffix) {
  const cleanSuffix = String(suffix || "").replace(/^[/\\]+/, "");
  return cleanSuffix && cleanSuffix !== "." ? `${prefix}/${normalizePathSeparators(cleanSuffix)}` : prefix;
}

/**
 * @param {string} targetPath
 * @param {string} basePath
 */
function isInside(targetPath, basePath) {
  const relativePath = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/**
 * @param {string} value
 */
function normalizePathSeparators(value) {
  return String(value || "").replaceAll(path.sep, "/");
}

/**
 * @param {unknown} value
 */
function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/** @param {unknown} value */
function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

/**
 * @param {string | undefined} status
 * @param {boolean | undefined} available
 */
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

/**
 * @param {string} mode
 * @param {string} status
 */
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

/**
 * @param {unknown} value
 */
function safeText(value) {
  return String(value || "").trim();
}

const runtimeDiagnosticsServiceInternal = {
  read,
};

export const runtimeDiagnosticsService = /** @type {import("../types/framework-contracts.js").ValidatedService<typeof runtimeDiagnosticsServiceInternal>} */ (runtimeDiagnosticsServiceInternal);
