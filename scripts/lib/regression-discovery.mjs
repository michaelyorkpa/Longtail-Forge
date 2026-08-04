import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractRegressionMeta,
  inferLegacyRegressionMeta,
} from "./regression-metadata.mjs";

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

async function discoverRegressionEntries({
  legacySnapshot,
  filesIsolationAudit,
  staticIsolationAudit,
  rootDir = DEFAULT_ROOT_DIR,
  snapshotPath = LEGACY_SNAPSHOT_PATH,
  filesIsolationAuditPath = FILES_ISOLATION_AUDIT_PATH,
  staticIsolationAuditPath = STATIC_ISOLATION_AUDIT_PATH,
} = {}) {
  const snapshot = legacySnapshot || JSON.parse(await fs.readFile(path.join(rootDir, snapshotPath), "utf8"));
  validateSnapshot(snapshot, snapshotPath);
  const isolationAudit = filesIsolationAudit || await readOptionalJson(rootDir, filesIsolationAuditPath);
  const filesRunModeOverrides = validateFilesIsolationAudit(isolationAudit, filesIsolationAuditPath);
  const staticAudit = staticIsolationAudit || await readOptionalJson(rootDir, staticIsolationAuditPath);
  const staticRunModeOverrides = validateStaticIsolationAudit(staticAudit, staticIsolationAuditPath);

  const snapshotOrder = new Map(snapshot.scripts.map((entry, index) => [normalizeScriptPath(entry.path), index]));
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

  const entries = [];

  for (const scriptPath of candidates) {
    const absolutePath = path.join(rootDir, scriptPath);
    let source;

    try {
      source = await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT" && snapshotOrder.has(scriptPath)) {
        throw new Error(`${scriptPath} is required by ${snapshotPath} but is missing.`);
      }
      throw error;
    }

    const exportedMetadata = extractRegressionMeta(source, scriptPath);
    const snapshotRunMode = snapshotRunModes.get(scriptPath);
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

async function readOptionalJson(rootDir, relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function validateFilesIsolationAudit(audit, auditPath) {
  if (!audit) {
    return new Map();
  }
  if (audit.schemaVersion !== 1 || !Array.isArray(audit.entries)) {
    throw new Error(`${auditPath} must use schemaVersion 1 and contain an entries array.`);
  }

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

async function listTopLevelLegacyCandidates(rootDir) {
  const scriptsDir = path.join(rootDir, "scripts");
  const entries = await fs.readdir(scriptsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /-regression\.mjs$/.test(entry.name))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
}

async function listConventionCandidates(rootDir) {
  const conventionRoot = path.join(rootDir, "scripts", "regressions");
  const files = [];

  try {
    await walk(conventionRoot, files);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return files
    .filter((filePath) => filePath.endsWith(".regression.mjs"))
    .map((filePath) => normalizeScriptPath(path.relative(rootDir, filePath)))
    .sort();
}

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

function validateUniqueEntries(entries) {
  const ids = new Set();
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

function compareEntries(left, right) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.path.localeCompare(right.path);
}

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
