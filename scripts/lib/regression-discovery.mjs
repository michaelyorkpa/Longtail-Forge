import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractRegressionMeta,
  inferLegacyRegressionMeta,
} from "./regression-metadata.mjs";

/** @typedef {import("./regression-metadata.mjs").RegressionMetadata} RegressionMetadata */
/** @typedef {RegressionMetadata & { legacy: boolean, order: number, path: string }} DiscoveredRegressionEntry */
/** @typedef {{ schemaVersion: number, scripts: readonly { path: string, runMode: string }[] }} LegacyRegressionSnapshot */
/** @typedef {{ decision: string, path: string }} FilesIsolationAuditEntry */
/** @typedef {{ entries: readonly FilesIsolationAuditEntry[], schemaVersion: number }} FilesIsolationAudit */
/** @typedef {{ decision: string, path: string, rationale: string, resources: Readonly<Record<string, unknown>>, sourceRunMode: string }} StaticIsolationAuditEntry */
/** @typedef {{ entries: readonly StaticIsolationAuditEntry[], resourceDimensions: readonly string[], schemaVersion: number, targetRunMode: string }} StaticIsolationAudit */
/** @typedef {{ sourceRunMode: string, targetRunMode: string }} StaticRunModeOverride */
/** @typedef {{ concurrency: number, mode: string, name: string, runMode: string }} RunModeBucketDefinition */
/** @typedef {RunModeBucketDefinition & { entries: readonly DiscoveredRegressionEntry[], scripts: readonly string[] }} RegressionSuiteBucket */

const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LEGACY_SNAPSHOT_PATH = "scripts/regression-legacy-snapshot.json";
const FILES_ISOLATION_AUDIT_PATH = "scripts/regression-files-isolation-audit.json";
const STATIC_ISOLATION_AUDIT_PATH = "scripts/regression-static-isolation-audit.json";
const CONVENTION_PREFIX = "scripts/regressions/";
const RUN_MODE_BUCKETS = Object.freeze([
  Object.freeze({ concurrency: 6, mode: "parallel", name: "static/source regressions", runMode: "static" }),
  Object.freeze({ concurrency: 1, mode: "serial", name: "default database regressions", runMode: "serial-database" }),
  Object.freeze({ concurrency: 1, mode: "serial", name: "file storage regressions", runMode: "serial-files" }),
  Object.freeze({ concurrency: 4, mode: "parallel", name: "isolated file storage regressions", runMode: "isolated-files" }),
  Object.freeze({ concurrency: 4, mode: "parallel", name: "isolated database regressions", runMode: "isolated-database" }),
]);

/**
 * @param {{ filesIsolationAudit?: unknown, filesIsolationAuditPath?: string, legacySnapshot?: unknown, rootDir?: string, snapshotPath?: string, staticIsolationAudit?: unknown, staticIsolationAuditPath?: string }} [options]
 * @returns {Promise<readonly DiscoveredRegressionEntry[]>}
 */
async function discoverRegressionEntries({
  legacySnapshot,
  filesIsolationAudit,
  staticIsolationAudit,
  rootDir = DEFAULT_ROOT_DIR,
  snapshotPath = LEGACY_SNAPSHOT_PATH,
  filesIsolationAuditPath = FILES_ISOLATION_AUDIT_PATH,
  staticIsolationAuditPath = STATIC_ISOLATION_AUDIT_PATH,
} = {}) {
  const snapshot = /** @type {LegacyRegressionSnapshot} */ (legacySnapshot || JSON.parse(await fs.readFile(path.join(rootDir, snapshotPath), "utf8")));
  validateSnapshot(snapshot, snapshotPath);
  const isolationAudit = /** @type {FilesIsolationAudit | null} */ (filesIsolationAudit || await readOptionalJson(rootDir, filesIsolationAuditPath));
  const filesRunModeOverrides = validateFilesIsolationAudit(isolationAudit, filesIsolationAuditPath);
  const staticAudit = /** @type {StaticIsolationAudit | null} */ (staticIsolationAudit || await readOptionalJson(rootDir, staticIsolationAuditPath));
  const staticRunModeOverrides = validateStaticIsolationAudit(staticAudit, staticIsolationAuditPath);

  /** @type {Map<string, number>} */
  const snapshotOrder = new Map(snapshot.scripts.map((entry, index) => [normalizeScriptPath(entry.path), index]));
  /** @type {Map<string, string>} */
  const snapshotRunModes = new Map(snapshot.scripts.map((entry) => [normalizeScriptPath(entry.path), entry.runMode]));
  const candidates = new Set(snapshotOrder.keys());
  const topLevelScripts = await listTopLevelLegacyCandidates(rootDir);

  for (const scriptPath of topLevelScripts) {
    if (snapshotOrder.has(scriptPath)) {
      candidates.add(scriptPath);
      continue;
    }

    const source = await fs.readFile(path.join(rootDir, scriptPath), "utf8");
    if (/export\s+const\s+regressionMeta\s*=/.test(source)) {
      candidates.add(scriptPath);
    }
  }

  for (const scriptPath of await listConventionCandidates(rootDir)) {
    candidates.add(scriptPath);
  }

  /** @type {DiscoveredRegressionEntry[]} */
  const entries = [];

  for (const scriptPath of candidates) {
    const absolutePath = path.join(rootDir, scriptPath);
    let source;

    try {
      source = await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" && snapshotOrder.has(scriptPath)) {
        throw new Error(`${scriptPath} is required by ${snapshotPath} but is missing.`);
      }
      throw error;
    }

    const exportedMetadata = extractRegressionMeta(source, scriptPath);
    const snapshotRunMode = snapshotRunModes.get(scriptPath);
    /** @type {RegressionMetadata} */
    let metadata;

    if (snapshotRunMode) {
      metadata = exportedMetadata || inferLegacyRegressionMeta(scriptPath, snapshotRunMode);
      if (metadata.runMode !== snapshotRunMode) {
        throw new Error(`${scriptPath} regressionMeta.runMode must preserve snapshot mode ${snapshotRunMode}.`);
      }
    } else {
      if (!exportedMetadata) {
        throw new Error(`${scriptPath} is a new-style regression and must export regressionMeta.`);
      }
      metadata = exportedMetadata;
    }

    validateConventionArea(scriptPath, metadata.area);
    const auditedRunMode = filesRunModeOverrides.get(scriptPath);
    if (auditedRunMode) {
      if (metadata.runMode !== "serial-files") {
        throw new Error(`${scriptPath} must originate in serial-files before the Files isolation audit can reclassify it.`);
      }
      metadata = Object.freeze({ ...metadata, runMode: auditedRunMode });
    }
    const staticOverride = staticRunModeOverrides.get(scriptPath);
    if (staticOverride) {
      if (metadata.runMode !== staticOverride.sourceRunMode) {
        throw new Error(
          scriptPath + " must originate in " + staticOverride.sourceRunMode
          + " before the static isolation audit can reclassify it.",
        );
      }
      metadata = Object.freeze({ ...metadata, runMode: staticOverride.targetRunMode });
    }
    entries.push(Object.freeze({
      ...metadata,
      legacy: snapshotOrder.has(scriptPath),
      order: snapshotOrder.get(scriptPath) ?? Number.MAX_SAFE_INTEGER,
      path: scriptPath,
    }));
  }

  validateUniqueEntries(entries);

  return Object.freeze(entries.sort(compareEntries));
}

/**
 * @param {string} rootDir
 * @param {string} relativePath
 * @returns {Promise<unknown>}
 */
async function readOptionalJson(rootDir, relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), "utf8"));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * @param {FilesIsolationAudit | null} audit
 * @param {string} auditPath
 * @returns {Map<string, string>}
 */
function validateFilesIsolationAudit(audit, auditPath) {
  if (!audit) {
    return new Map();
  }
  if (audit.schemaVersion !== 1 || !Array.isArray(audit.entries)) {
    throw new Error(`${auditPath} must use schemaVersion 1 and contain an entries array.`);
  }

  /** @type {Map<string, string>} */
  const overrides = new Map();
  for (const entry of audit.entries) {
    const scriptPath = normalizeScriptPath(entry?.path);
    if (!scriptPath || !["serial-files", "isolated-files"].includes(entry?.decision)) {
      throw new Error(`${auditPath} entries must contain a path and a serial-files or isolated-files decision.`);
    }
    if (overrides.has(scriptPath)) {
      throw new Error(`${auditPath} must not contain duplicate paths.`);
    }
    overrides.set(scriptPath, entry.decision);
  }
  return overrides;
}

/**
 * @param {StaticIsolationAudit | null} audit
 * @param {string} auditPath
 * @returns {Map<string, Readonly<StaticRunModeOverride>>}
 */
function validateStaticIsolationAudit(audit, auditPath) {
  if (!audit) {
    return new Map();
  }
  if (
    audit.schemaVersion !== 1
    || audit.targetRunMode !== "static"
    || !Array.isArray(audit.resourceDimensions)
    || !Array.isArray(audit.entries)
  ) {
    throw new Error(auditPath + " must use schemaVersion 1, target static, resource dimensions, and entries.");
  }

  /** @type {Map<string, Readonly<StaticRunModeOverride>>} */
  const overrides = new Map();
  for (const entry of audit.entries) {
    const scriptPath = normalizeScriptPath(entry?.path);
    if (
      !scriptPath
      || entry?.decision !== audit.targetRunMode
      || !["isolated-database", "serial-files"].includes(entry?.sourceRunMode)
      || !entry.resources
      || Object.keys(entry.resources).join("|") !== audit.resourceDimensions.join("|")
      || String(entry.rationale || "").length < 80
    ) {
      throw new Error(auditPath + " entries must carry an eligible source, static decision, complete resources, and rationale.");
    }
    if (overrides.has(scriptPath)) {
      throw new Error(auditPath + " must not contain duplicate paths.");
    }
    overrides.set(scriptPath, Object.freeze({
      sourceRunMode: entry.sourceRunMode,
      targetRunMode: audit.targetRunMode,
    }));
  }
  return overrides;
}

/**
 * @param {readonly DiscoveredRegressionEntry[]} entries
 * @returns {readonly Readonly<RegressionSuiteBucket>[]}
 */
function createRegressionSuite(entries) {
  return Object.freeze(RUN_MODE_BUCKETS.map((definition) => {
    const bucketEntries = Object.freeze(entries.filter((entry) => entry.runMode === definition.runMode));
    return Object.freeze({
      ...definition,
      entries: bucketEntries,
      scripts: Object.freeze(bucketEntries.map((entry) => entry.path)),
    });
  }));
}

/**
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listTopLevelLegacyCandidates(rootDir) {
  const scriptsDir = path.join(rootDir, "scripts");
  const entries = await fs.readdir(scriptsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /-regression\.mjs$/.test(entry.name))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
}

/**
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listConventionCandidates(rootDir) {
  const conventionRoot = path.join(rootDir, "scripts", "regressions");
  /** @type {string[]} */
  const files = [];

  try {
    await walk(conventionRoot, files);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }

  return files
    .filter((filePath) => filePath.endsWith(".regression.mjs"))
    .map((filePath) => normalizeScriptPath(path.relative(rootDir, filePath)))
    .sort();
}

/**
 * @param {string} directory
 * @param {string[]} files
 * @returns {Promise<void>}
 */
async function walk(directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

/**
 * @param {LegacyRegressionSnapshot} snapshot
 * @param {string} snapshotPath
 * @returns {void}
 */
function validateSnapshot(snapshot, snapshotPath) {
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot?.scripts)) {
    throw new Error(`${snapshotPath} must use schemaVersion 1 and contain a scripts array.`);
  }

  const paths = snapshot.scripts.map((entry) => normalizeScriptPath(entry?.path));
  if (paths.some((scriptPath) => !scriptPath)) {
    throw new Error(`${snapshotPath} entries must contain paths.`);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${snapshotPath} must not contain duplicate paths.`);
  }
}

/**
 * @param {string} scriptPath
 * @param {string} area
 * @returns {void}
 */
function validateConventionArea(scriptPath, area) {
  if (!scriptPath.startsWith(CONVENTION_PREFIX)) {
    return;
  }

  const relativePath = scriptPath.slice(CONVENTION_PREFIX.length);
  const directoryArea = relativePath.split("/")[0];
  if (directoryArea !== area) {
    throw new Error(`${scriptPath} regressionMeta.area must match convention directory ${directoryArea}.`);
  }
}

/**
 * @param {readonly DiscoveredRegressionEntry[]} entries
 * @returns {void}
 */
function validateUniqueEntries(entries) {
  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {Set<string>} */
  const paths = new Set();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate regression metadata id: ${entry.id}.`);
    }
    if (paths.has(entry.path)) {
      throw new Error(`Duplicate regression script path: ${entry.path}.`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  }
}

/**
 * @param {DiscoveredRegressionEntry} left
 * @param {DiscoveredRegressionEntry} right
 * @returns {number}
 */
function compareEntries(left, right) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.path.localeCompare(right.path);
}

/**
 * @param {unknown} scriptPath
 * @returns {string}
 */
function normalizeScriptPath(scriptPath) {
  return String(scriptPath || "").replace(/\\/g, "/");
}

export {
  FILES_ISOLATION_AUDIT_PATH,
  LEGACY_SNAPSHOT_PATH,
  RUN_MODE_BUCKETS,
  STATIC_ISOLATION_AUDIT_PATH,
  createRegressionSuite,
  discoverRegressionEntries,
};
