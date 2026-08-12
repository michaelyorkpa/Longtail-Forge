import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_AUDIT_PATH = "scripts/regression-static-isolation-audit.json";
const STATIC_EXECUTION_RESOURCE_DIMENSIONS = Object.freeze([
  "environment",
  "globalState",
  "timers",
  "listeners",
  "cache",
  "process",
  "fileSystem",
]);
const STATIC_EXECUTION_MODES = Object.freeze([
  "audited-workers",
  "child-process",
]);

async function loadStaticRegressionExecutionPlan({
  auditPath = DEFAULT_AUDIT_PATH,
  entries,
  env = process.env,
  rootDir = DEFAULT_ROOT_DIR,
} = {}) {
  const audit = JSON.parse(await fs.readFile(path.join(rootDir, auditPath), "utf8"));
  return createStaticRegressionExecutionPlan({ audit, auditPath, entries, env });
}

function createStaticRegressionExecutionPlan({ audit, auditPath = DEFAULT_AUDIT_PATH, entries, env = process.env }) {
  const staticEntries = (entries || []).filter((entry) => entry.runMode === "static");
  const staticPaths = new Set(staticEntries.map((entry) => entry.path));
  const executionAudit = audit?.execution;

  if (
    executionAudit?.schemaVersion !== 1
    || executionAudit.defaultDecision !== "child-process"
    || !Array.isArray(executionAudit.resourceDimensions)
    || !Array.isArray(executionAudit.entries)
    || !executionAudit.defaultResources
  ) {
    throw new Error(`${auditPath} execution audit must define schemaVersion 1, child-process default, resources, and entries.`);
  }
  if (!sameOrderedValues(executionAudit.resourceDimensions, STATIC_EXECUTION_RESOURCE_DIMENSIONS)) {
    throw new Error(`${auditPath} execution resource dimensions must cover environment, global state, timers, listeners, cache, process, and filesystem.`);
  }
  assertCompleteResources(executionAudit.defaultResources, executionAudit.resourceDimensions, `${auditPath} execution default`);

  const audited = new Map();
  for (const entry of executionAudit.entries) {
    const scriptPath = normalizeScriptPath(entry?.path);
    if (
      !scriptPath
      || !["worker-parallel", "worker-sequential"].includes(entry?.decision)
      || entry?.fallback !== "child-process"
      || String(entry?.rationale || "").length < 80
    ) {
      throw new Error(`${auditPath} execution entries must be certified workers with an explicit child-process fallback and rationale.`);
    }
    if (!staticPaths.has(scriptPath)) {
      throw new Error(`${auditPath} execution entry ${scriptPath} must resolve to a discovered static regression.`);
    }
    if (audited.has(scriptPath)) {
      throw new Error(`${auditPath} execution entries must not contain duplicate paths.`);
    }
    assertCompleteResources(entry.resources, executionAudit.resourceDimensions, `${auditPath} execution entry ${scriptPath}`);
    assertCertifiedResources(entry, auditPath);
    audited.set(scriptPath, Object.freeze({
      decision: entry.decision,
      fallback: entry.fallback,
      resources: Object.freeze({ ...entry.resources }),
      source: "audit",
    }));
  }

  const requestedMode = String(env.LTF_STATIC_EXECUTION_MODE || "audited-workers").trim();
  if (!STATIC_EXECUTION_MODES.includes(requestedMode)) {
    throw new Error(`LTF_STATIC_EXECUTION_MODE must be one of: ${STATIC_EXECUTION_MODES.join(", ")}.`);
  }

  const decisions = new Map();
  for (const entry of staticEntries) {
    const certification = audited.get(entry.path);
    if (requestedMode === "audited-workers" && certification) {
      decisions.set(entry.path, certification);
      continue;
    }
    decisions.set(entry.path, Object.freeze({
      decision: "child-process",
      fallback: "child-process",
      resources: Object.freeze({ ...executionAudit.defaultResources }),
      source: requestedMode === "child-process" && certification ? "forced-fallback" : "default-fallback",
    }));
  }

  return Object.freeze({
    auditedCount: audited.size,
    decisions,
    fallbackCount: staticEntries.length - (requestedMode === "audited-workers" ? audited.size : 0),
    mode: requestedMode,
    workerCount: requestedMode === "audited-workers" ? audited.size : 0,
  });
}

function assertCompleteResources(resources, dimensions, label) {
  if (!resources || !sameOrderedValues(Object.keys(resources), dimensions)) {
    throw new Error(`${label} must classify every execution resource dimension in order.`);
  }
  for (const [dimension, classification] of Object.entries(resources)) {
    if (!String(classification || "").trim()) {
      throw new Error(`${label} must provide a non-empty ${dimension} classification.`);
    }
  }
}

function assertCertifiedResources(entry, auditPath) {
  const allowed = {
    environment: new Set(["none"]),
    globalState: new Set(["worker-local"]),
    timers: new Set(["none"]),
    listeners: new Set(["none"]),
    cache: new Set(["worker-local module cache"]),
    process: new Set(["read-only cwd and platform"]),
    fileSystem: new Set(["read-only repository files"]),
  };

  for (const [dimension, classifications] of Object.entries(allowed)) {
    if (!classifications.has(entry.resources[dimension])) {
      throw new Error(`${auditPath} cannot certify ${entry.path}: unsafe ${dimension} classification ${entry.resources[dimension]}.`);
    }
  }
}

function normalizeScriptPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export {
  STATIC_EXECUTION_MODES,
  STATIC_EXECUTION_RESOURCE_DIMENSIONS,
  createStaticRegressionExecutionPlan,
  loadStaticRegressionExecutionPlan,
};
