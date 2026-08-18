import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DEMO_ACTIVATION_CONTRACT = "longtail-forge-public-demo-activation-v1";
const PUBLIC_DEMO_ACTIVE_OPERATION = ".longtail-public-demo-reset-active.json";
const PUBLIC_DEMO_CANDIDATE_DIRECTORY = ".longtail-public-demo-candidate";
const PUBLIC_DEMO_PREVIOUS_PREFIX = ".longtail-public-demo-previous-";
const PUBLIC_DEMO_FAILED_PREFIX = ".longtail-public-demo-failed-";
const CANONICAL_COMPOSE_DATA_ROOT = "/var/lib/longtail-forge";
const DEMO_DATA_MARKER = ".longtail-demo-data.json";
const DEMO_DATA_TARGET = "rt-ltf-demo";
const DEMO_PUBLIC_ORIGIN = "https://demo.longtailforge.com";
const UNIT_ENTRIES = Object.freeze(["longtail-forge.db", "files", DEMO_DATA_MARKER]);
const SQLITE_SIDECARS = Object.freeze(["longtail-forge.db-wal", "longtail-forge.db-shm"]);
const OPERATION_ID_PATTERN = /^\d{8}T\d{6}Z-[a-z0-9][a-z0-9.-]{0,63}$/;
const OPERATION_PHASES = new Set([
  "activated", "completed", "prepared", "recovered",
  ...UNIT_ENTRIES.map((entry) => `retired-${entry}`),
  ...SQLITE_SIDECARS.map((entry) => `retired-${entry}`),
  ...UNIT_ENTRIES.map((entry) => `promoted-${entry}`),
]);

/**
 * An option name settable through a public-demo activation flag.
 * @typedef {"confirmQuiescent" | "dataRoot" | "operationId" | "target"} PublicDemoActivationFlagName
 */

/**
 * Options while flag parsing is still in progress.
 * @typedef {object} PublicDemoActivationOptionsDraft
 * @property {string} action
 * @property {string} [confirmQuiescent]
 * @property {string} [dataRoot]
 * @property {string} [operationId]
 * @property {string} [target]
 */

/**
 * Fully validated activation arguments (dataRoot/target proven present).
 * @typedef {object} PublicDemoActivationArgs
 * @property {string} action
 * @property {string} [confirmQuiescent]
 * @property {string} dataRoot
 * @property {string} [operationId]
 * @property {string} target
 */

/**
 * Resolved on-disk locations for one activation operation.
 * @typedef {object} PublicDemoActivationPaths
 * @property {string} activeOperation
 * @property {string} candidateRoot
 * @property {string} dataRoot
 * @property {string} failedRoot
 * @property {string} previousRoot
 */

/**
 * Frozen outcome reported by inspect and mutation operations.
 * @typedef {object} PublicDemoActivationOutcome
 * @property {boolean} [active]
 * @property {string} [operationId]
 * @property {string} [phase]
 * @property {string} status
 * @property {string} target
 */

/**
 * The persisted reset-operation marker document.
 * @typedef {object} PublicDemoResetOperation
 * @property {string} [completedAt]
 * @property {string} contract
 * @property {string} generatedAt
 * @property {string} operationId
 * @property {string} phase
 * @property {string} [recoveredAt]
 * @property {string} state
 * @property {string} target
 */

/**
 * Parse and strictly validate the activation command line.
 * @param {readonly string[]} args raw CLI arguments after the script path
 * @returns {Readonly<PublicDemoActivationArgs>}
 */
function parsePublicDemoActivationArgs(args) {
  const action = args[0];
  if (!new Set(["activate", "finalize", "inspect", "recover"]).has(action)) {
    throw new Error("Choose activate, finalize, inspect, or recover.");
  }
  /** @type {PublicDemoActivationOptionsDraft} */
  const options = { action };
  /** @type {Set<string>} */
  const seen = new Set();
  const flags = new Map([
    ["--confirm-quiescent", "confirmQuiescent"],
    ["--data-root", "dataRoot"],
    ["--operation-id", "operationId"],
    ["--target", "target"],
  ]);
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (!flags.has(flag)) throw new Error(`Unknown public-demo activation option: ${flag}`);
    if (seen.has(flag)) throw new Error(`Public-demo activation option may be supplied only once: ${flag}.`);
    seen.add(flag);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    options[/** @type {PublicDemoActivationFlagName} */ (flags.get(flag))] = value;
  }
  if (options.target !== DEMO_DATA_TARGET) throw new Error(`--target must be exactly ${DEMO_DATA_TARGET}.`);
  if (!path.isAbsolute(String(options.dataRoot || ""))) throw new Error("--data-root must be absolute.");
  if (options.operationId && !OPERATION_ID_PATTERN.test(options.operationId)) {
    throw new Error("--operation-id is invalid.");
  }
  if (action === "activate" && !options.operationId) throw new Error("activate requires --operation-id.");
  if (new Set(["activate", "recover"]).has(action)
    && options.confirmQuiescent !== "COMPOSE SQLITE USERS STOPPED") {
    throw new Error("Activation or recovery requires the exact stopped-service confirmation.");
  }
  if (!new Set(["activate", "recover"]).has(action) && options.confirmQuiescent) {
    throw new Error("--confirm-quiescent is accepted only for activate or recover.");
  }
  return Object.freeze(/** @type {PublicDemoActivationArgs} */ (options));
}

/**
 * Refuse activation outside the exact production Compose demo runtime.
 * @param {{ dataRoot: string, environment?: NodeJS.ProcessEnv, requireCanonicalDataRoot?: boolean, requireRoot?: boolean, target: string }} input
 */
function assertPublicDemoActivationRuntime({
  dataRoot,
  environment = process.env,
  requireCanonicalDataRoot = true,
  requireRoot = true,
  target,
}) {
  if (target !== DEMO_DATA_TARGET) throw new Error("The activation target is not the named demo installation.");
  if (String(environment.LONGTAIL_ENV || "").toLowerCase() !== "production"
    || String(environment.DEMO_MODE || "").toLowerCase() !== "true"
    || String(environment.LONGTAIL_DEPLOYMENT_MODE || "").toLowerCase() !== "compose"
    || normalizeOrigin(environment.LONGTAIL_PUBLIC_URL) !== DEMO_PUBLIC_ORIGIN) {
    throw new Error("Public-demo activation requires the exact production Compose demo profile.");
  }
  if (requireCanonicalDataRoot && path.resolve(dataRoot) !== path.resolve(CANONICAL_COMPOSE_DATA_ROOT)) {
    throw new Error(`Public-demo activation requires the exact Compose data root ${CANONICAL_COMPOSE_DATA_ROOT}.`);
  }
  if (requireRoot && process.platform !== "win32" && process.getuid?.() !== 0) {
    throw new Error("Public-demo activation must run as root through the reviewed Compose reset helper.");
  }
}

/**
 * Resolve the frozen activation path set for one operation.
 * @param {string} dataRoot
 * @param {string} [operationId]
 * @returns {Readonly<PublicDemoActivationPaths>}
 */
function resolvePublicDemoActivationPaths(dataRoot, operationId = "") {
  const root = path.resolve(dataRoot);
  return Object.freeze({
    activeOperation: path.join(root, PUBLIC_DEMO_ACTIVE_OPERATION),
    candidateRoot: path.join(root, PUBLIC_DEMO_CANDIDATE_DIRECTORY),
    dataRoot: root,
    failedRoot: operationId ? path.join(root, `${PUBLIC_DEMO_FAILED_PREFIX}${operationId}`) : "",
    previousRoot: operationId ? path.join(root, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`) : "",
  });
}

/**
 * Run one activate/finalize/inspect/recover operation end to end.
 * @param {{ action: string, dataRoot: string, environment?: NodeJS.ProcessEnv, operationId?: string, requireCanonicalDataRoot?: boolean, requireRoot?: boolean, target: string }} input
 */
async function runPublicDemoActivationOperation({
  action,
  dataRoot,
  environment = process.env,
  operationId,
  requireCanonicalDataRoot = true,
  requireRoot = true,
  target,
}) {
  assertPublicDemoActivationRuntime({ dataRoot, environment, requireCanonicalDataRoot, requireRoot, target });
  const basePaths = resolvePublicDemoActivationPaths(dataRoot, operationId);
  await assertRealDirectory(basePaths.dataRoot, "Compose data root");
  if (action === "inspect") return inspectActiveOperation(basePaths.activeOperation);

  const existing = await readOperation(basePaths.activeOperation);
  const resolvedOperationId = operationId || existing?.operationId;
  if (!resolvedOperationId || !OPERATION_ID_PATTERN.test(resolvedOperationId)) {
    throw new Error("The active public-demo reset operation identity is missing or invalid.");
  }
  if (operationId && existing && existing.operationId !== operationId) {
    throw new Error("The requested public-demo reset does not match the active operation.");
  }
  const paths = resolvePublicDemoActivationPaths(dataRoot, resolvedOperationId);

  if (action === "activate") return activateCandidate(paths, resolvedOperationId);
  if (!existing) throw new Error("No interrupted or activated public-demo reset operation exists.");
  assertOperation(existing, resolvedOperationId);
  if (action === "recover") return recoverPrevious(paths, existing);
  return finalizeActivation(paths, existing);
}

/**
 * Retire the active unit and promote the verified candidate.
 * @param {PublicDemoActivationPaths} paths
 * @param {string} operationId
 */
async function activateCandidate(paths, operationId) {
  if (await pathExists(paths.activeOperation)) throw new Error("Another public-demo reset operation is active.");
  await assertAbsent(paths.previousRoot, "retained previous unit");
  await assertAbsent(paths.failedRoot, "failed candidate evidence");
  await assertUnit(paths.dataRoot, { exact: false, label: "active public-demo unit" });
  await assertUnit(paths.candidateRoot, { exact: true, label: "verified public-demo candidate" });

  /** @type {PublicDemoResetOperation} */
  const operation = {
    contract: PUBLIC_DEMO_ACTIVATION_CONTRACT,
    generatedAt: new Date().toISOString(),
    operationId,
    phase: "prepared",
    state: "active",
    target: DEMO_DATA_TARGET,
  };
  await writeOperation(paths.activeOperation, operation);
  await fs.mkdir(paths.previousRoot, { mode: 0o700 });

  for (const entry of UNIT_ENTRIES) {
    await fs.rename(path.join(paths.dataRoot, entry), path.join(paths.previousRoot, entry));
    operation.phase = `retired-${entry}`;
    await writeOperation(paths.activeOperation, operation);
  }
  for (const sidecar of SQLITE_SIDECARS) {
    const activeSidecar = path.join(paths.dataRoot, sidecar);
    if (await pathExists(activeSidecar)) {
      await assertRealFile(activeSidecar, `active public-demo ${sidecar}`);
      await fs.rename(activeSidecar, path.join(paths.previousRoot, sidecar));
      operation.phase = `retired-${sidecar}`;
      await writeOperation(paths.activeOperation, operation);
    }
  }
  for (const entry of UNIT_ENTRIES) {
    await fs.rename(path.join(paths.candidateRoot, entry), path.join(paths.dataRoot, entry));
    operation.phase = `promoted-${entry}`;
    await writeOperation(paths.activeOperation, operation);
  }
  await fs.rmdir(paths.candidateRoot);
  await assertUnit(paths.dataRoot, { exact: false, label: "activated public-demo unit" });
  await assertUnit(paths.previousRoot, { allowSidecars: true, exact: true, label: "retained previous public-demo unit" });
  operation.phase = "activated";
  await writeOperation(paths.activeOperation, operation);
  return operationResult("baseline-activated", operationId);
}

/**
 * Reconstruct the prior unit from an interrupted or finished operation.
 * @param {PublicDemoActivationPaths} paths
 * @param {PublicDemoResetOperation} operation
 */
async function recoverPrevious(paths, operation) {
  if (operation.phase === "completed") {
    await assertUnit(paths.dataRoot, { exact: false, label: "completed public-demo unit" });
    await assertUnit(paths.previousRoot, { allowSidecars: true, exact: true, label: "retained previous public-demo unit" });
    await assertAbsent(paths.candidateRoot, "public-demo candidate");
    await fs.rename(paths.activeOperation, path.join(paths.previousRoot, "reset-operation.json"));
    return operationResult("completed-activation-reconciled", operation.operationId);
  }
  if (operation.phase === "recovered") {
    await assertUnit(paths.dataRoot, { exact: false, label: "recovered prior public-demo unit" });
    await assertRealDirectory(paths.failedRoot, "failed candidate evidence");
    await assertAbsent(path.join(paths.failedRoot, "reset-operation.json"), "recovered operation evidence");
    await fs.rename(paths.activeOperation, path.join(paths.failedRoot, "reset-operation.json"));
    return operationResult("recovered-activation-reconciled", operation.operationId);
  }
  await assertRealDirectory(paths.dataRoot, "Compose data root");
  const previousExists = await pathExists(paths.previousRoot);
  if (previousExists) await assertRealDirectory(paths.previousRoot, "retained previous public-demo unit");
  await assertAbsent(paths.failedRoot, "failed candidate evidence");
  await fs.mkdir(paths.failedRoot, { mode: 0o700 });

  for (const entry of UNIT_ENTRIES) {
    const activePath = path.join(paths.dataRoot, entry);
    const previousPath = path.join(paths.previousRoot, entry);
    if (previousExists && await pathExists(previousPath)) {
      if (await pathExists(activePath)) {
        await fs.rename(activePath, path.join(paths.failedRoot, entry));
      }
      await fs.rename(previousPath, activePath);
    } else if (!await pathExists(activePath)) {
      throw new Error("The prior public-demo unit cannot be reconstructed from interrupted state.");
    }
  }

  for (const sidecar of SQLITE_SIDECARS) {
    const activeSidecar = path.join(paths.dataRoot, sidecar);
    const previousSidecar = path.join(paths.previousRoot, sidecar);
    const previousSidecarExists = previousExists && await pathExists(previousSidecar);
    if (await pathExists(activeSidecar) && (previousSidecarExists || sidecarWasRetired(sidecar, operation.phase))) {
      await assertRealFile(activeSidecar, `failed candidate ${sidecar}`);
      await fs.rename(activeSidecar, path.join(paths.failedRoot, sidecar));
    }
    if (previousSidecarExists) {
      await assertRealFile(previousSidecar, `retained previous ${sidecar}`);
      await fs.rename(previousSidecar, activeSidecar);
    }
  }

  if (await pathExists(paths.candidateRoot)) {
    await assertRealDirectory(paths.candidateRoot, "remaining public-demo candidate");
    for (const entry of UNIT_ENTRIES) {
      const remaining = path.join(paths.candidateRoot, entry);
      if (await pathExists(remaining)) {
        const destination = path.join(paths.failedRoot, `candidate-${entry}`);
        await fs.rename(remaining, destination);
      }
    }
    const extra = await fs.readdir(paths.candidateRoot);
    if (extra.length) throw new Error("The interrupted candidate contains unexpected state.");
    await fs.rmdir(paths.candidateRoot);
  }


  await assertUnit(paths.dataRoot, { exact: false, label: "recovered prior public-demo unit" });
  operation.phase = "recovered";
  operation.recoveredAt = new Date().toISOString();
  await writeOperation(paths.activeOperation, operation);
  await fs.rename(paths.activeOperation, path.join(paths.failedRoot, "reset-operation.json"));
  if (previousExists && (await fs.readdir(paths.previousRoot)).length === 0) await fs.rmdir(paths.previousRoot);
  return operationResult("prior-unit-recovered", operation.operationId);
}

/**
 * Complete an activated operation and retain its evidence.
 * @param {PublicDemoActivationPaths} paths
 * @param {PublicDemoResetOperation} operation
 */
async function finalizeActivation(paths, operation) {
  if (operation.phase !== "activated") throw new Error("The public-demo reset is not ready for finalization.");
  await assertUnit(paths.dataRoot, { exact: false, label: "activated public-demo unit" });
  await assertUnit(paths.previousRoot, { allowSidecars: true, exact: true, label: "retained previous public-demo unit" });
  await assertAbsent(paths.candidateRoot, "public-demo candidate");
  operation.phase = "completed";
  operation.completedAt = new Date().toISOString();
  await writeOperation(paths.activeOperation, operation);
  await fs.rename(paths.activeOperation, path.join(paths.previousRoot, "reset-operation.json"));
  return operationResult("activation-finalized", operation.operationId);
}

/**
 * Report the current activation state without mutating anything.
 * @param {string} markerPath
 * @returns {Promise<Readonly<PublicDemoActivationOutcome>>}
 */
async function inspectActiveOperation(markerPath) {
  const operation = await readOperation(markerPath);
  if (!operation) return Object.freeze({ active: false, status: "no-active-reset", target: DEMO_DATA_TARGET });
  assertOperation(operation, operation.operationId);
  return Object.freeze({
    active: true,
    operationId: operation.operationId,
    phase: operation.phase,
    status: "active-reset-found",
    target: DEMO_DATA_TARGET,
  });
}

/**
 * Validate the reset-operation marker document exactly.
 * @param {PublicDemoResetOperation | null} operation
 * @param {string} operationId
 */
function assertOperation(operation, operationId) {
  const allowed = new Set(["completedAt", "contract", "generatedAt", "operationId", "phase", "recoveredAt", "state", "target"]);
  if (!operation || Object.keys(operation).some((key) => !allowed.has(key))
    || operation.contract !== PUBLIC_DEMO_ACTIVATION_CONTRACT
    || operation.target !== DEMO_DATA_TARGET
    || operation.state !== "active"
    || operation.operationId !== operationId
    || !OPERATION_ID_PATTERN.test(operation.operationId)
    || !isIsoTimestamp(operation.generatedAt)
    || !OPERATION_PHASES.has(operation.phase)
    || (operation.phase === "completed") !== isIsoTimestamp(operation.completedAt)
    || (operation.phase === "recovered") !== isIsoTimestamp(operation.recoveredAt)) {
    throw new Error("The public-demo reset operation marker is invalid.");
  }
}

/**
 * Verify a directory holds exactly (or at least) one real demo unit.
 * @param {string} root
 * @param {{ allowSidecars?: boolean, exact: boolean, label: string }} expectations
 */
async function assertUnit(root, { allowSidecars = false, exact, label }) {
  await assertRealDirectory(root, `${label} root`);
  const entries = await fs.readdir(root);
  const allowedEntries = allowSidecars ? [...UNIT_ENTRIES, ...SQLITE_SIDECARS] : UNIT_ENTRIES;
  if (exact && (entries.some((entry) => !allowedEntries.includes(entry))
    || UNIT_ENTRIES.some((entry) => !entries.includes(entry)))) {
    throw new Error(`${label} contains unexpected or partial state.`);
  }
  for (const entry of UNIT_ENTRIES) {
    const target = path.join(root, entry);
    if (entry === "files") await assertRealDirectory(target, `${label} Files`);
    else await assertRealFile(target, `${label} ${entry}`);
  }
  await assertNoLinks(path.join(root, "files"));
}

/**
 * Reject any symbolic link anywhere beneath the given root.
 * @param {string} root
 */
async function assertNoLinks(root) {
  const pending = [root];
  while (pending.length) {
    const current = /** @type {string} */ (pending.pop());
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink()) throw new Error("Public-demo activation state contains a symbolic link.");
    if (!stats.isDirectory()) continue;
    for (const entry of await fs.readdir(current)) pending.push(path.join(current, entry));
  }
}

/**
 * Require a real (non-link) directory.
 * @param {string} target
 * @param {string} label
 */
async function assertRealDirectory(target, label) {
  const stats = await fs.lstat(target).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
}

/**
 * Require a real (non-link) file.
 * @param {string} target
 * @param {string} label
 */
async function assertRealFile(target, label) {
  const stats = await fs.lstat(target).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a real file.`);
}

/**
 * Refuse to overwrite a path that already exists.
 * @param {string} target
 * @param {string} label
 */
async function assertAbsent(target, label) {
  if (await pathExists(target)) throw new Error(`The ${label} already exists; refusing replacement.`);
}

/**
 * Read the reset-operation marker if present.
 * @param {string} markerPath
 * @returns {Promise<PublicDemoResetOperation | null>}
 */
async function readOperation(markerPath) {
  if (!await pathExists(markerPath)) return null;
  await assertRealFile(markerPath, "public-demo reset operation marker");
  try {
    return JSON.parse(await fs.readFile(markerPath, "utf8"));
  } catch {
    throw new Error("The public-demo reset operation marker is unreadable or invalid.");
  }
}

/**
 * Atomically persist a validated reset-operation marker.
 * @param {string} markerPath
 * @param {PublicDemoResetOperation} operation
 */
async function writeOperation(markerPath, operation) {
  assertOperation(operation, operation.operationId);
  const temporary = `${markerPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(operation, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, markerPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/**
 * Whether the recorded phase proves this sidecar was already retired.
 * @param {string} sidecar
 * @param {string} phase
 * @returns {boolean}
 */
function sidecarWasRetired(sidecar, phase) {
  const sidecarIndex = SQLITE_SIDECARS.indexOf(sidecar);
  const recordedSidecarIndex = SQLITE_SIDECARS.findIndex((entry) => phase === `retired-${entry}`);
  if (recordedSidecarIndex >= 0) return sidecarIndex <= recordedSidecarIndex;
  return phase.startsWith("promoted-") || new Set(["activated", "completed", "recovered"]).has(phase);
}

/**
 * Frozen operation outcome for the CLI.
 * @param {string} status
 * @param {string} operationId
 * @returns {Readonly<PublicDemoActivationOutcome>}
 */
function operationResult(status, operationId) {
  return Object.freeze({ operationId, status, target: DEMO_DATA_TARGET });
}

/**
 * Lowercased origin of a bare-origin URL; empty for anything else.
 * @param {string | undefined} value
 * @returns {string}
 */
function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    return parsed.origin.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Whether the value is a millisecond-precision ISO-8601 UTC timestamp.
 * @param {unknown} value
 * @returns {boolean}
 */
function isIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Whether a path exists (without following a trailing symlink).
 * @param {string} target
 * @returns {Promise<boolean>}
 */
async function pathExists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === "ENOENT") return false;
    throw error;
  }
}

export {
  CANONICAL_COMPOSE_DATA_ROOT,
  PUBLIC_DEMO_ACTIVATION_CONTRACT,
  PUBLIC_DEMO_ACTIVE_OPERATION,
  PUBLIC_DEMO_CANDIDATE_DIRECTORY,
  PUBLIC_DEMO_FAILED_PREFIX,
  PUBLIC_DEMO_PREVIOUS_PREFIX,
  SQLITE_SIDECARS,
  UNIT_ENTRIES,
  assertPublicDemoActivationRuntime,
  parsePublicDemoActivationArgs,
  resolvePublicDemoActivationPaths,
  runPublicDemoActivationOperation,
};
