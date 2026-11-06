import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DEMO_ACTIVATION_CONTRACT = "longtail-forge-public-demo-activation-v1";
const PUBLIC_DEMO_ACTIVE_OPERATION = ".longtail-public-demo-reset-active.json";
const PUBLIC_DEMO_CANDIDATE_DIRECTORY = ".longtail-public-demo-candidate";
const PUBLIC_DEMO_PREVIOUS_PREFIX = ".longtail-public-demo-previous-";
const PUBLIC_DEMO_FAILED_PREFIX = ".longtail-public-demo-failed-";
const PUBLIC_DEMO_BUILD_PREFIX = ".longtail-public-demo-build-";
const PUBLIC_DEMO_STALE_SUFFIX = "-stale-candidate";
const PUBLIC_DEMO_STALE_CONTRACT = "longtail-forge-public-demo-stale-candidate-v1";
// A retired unit selected for pruning is renamed to this prefix before it is deleted, so an
// interrupted deletion leaves a name the next prune finishes rather than a partial retired unit.
const PUBLIC_DEMO_PRUNING_PREFIX = ".longtail-public-demo-pruning-";
const PUBLIC_DEMO_PRUNE_CONTRACT = "longtail-forge-public-demo-prune-v1";
// Retention for retired units: those of the newest completed resets. Nothing reads a completed
// reset's retired unit again, and each holds the visitor-entered content of the hour before it.
const PUBLIC_DEMO_RETAINED_UNITS = 2;
const RETIRED_UNIT_RECORD = "reset-operation.json";
const MAX_REMOVALS_PATTERN = /^[1-9][0-9]{0,2}$/;
// A candidate build stages under an opaque UUID: see `buildPublicDemoCandidate`.
const BUILD_DIRECTORY_PATTERN = /^\.longtail-public-demo-build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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
 * @typedef {"confirmQuiescent" | "dataRoot" | "maxRemovals" | "mode" | "operationId" | "target"} PublicDemoActivationFlagName
 */

/**
 * Options while flag parsing is still in progress.
 * @typedef {object} PublicDemoActivationOptionsDraft
 * @property {string} action
 * @property {string} [confirmQuiescent]
 * @property {string} [dataRoot]
 * @property {string} [maxRemovals]
 * @property {string} [mode]
 * @property {string} [operationId]
 * @property {string} [target]
 */

/**
 * Fully validated activation arguments (dataRoot/target proven present).
 * @typedef {object} PublicDemoActivationArgs
 * @property {string} action
 * @property {string} [confirmQuiescent]
 * @property {string} dataRoot
 * @property {string} [maxRemovals]
 * @property {string} [mode]
 * @property {string} [operationId]
 * @property {string} target
 */

/**
 * What a prune selected and did. Plan mode names the operations it would remove.
 * @typedef {object} PublicDemoPruneOutcome
 * @property {string} contract
 * @property {string} mode
 * @property {number} removed
 * @property {readonly string[]} retainedOperations
 * @property {number} selected
 * @property {readonly string[]} [selectedOperations]
 * @property {number} skipped
 * @property {string} status
 * @property {string} target
 * @property {number} tombstones
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
 * Frozen outcome reported by inspect and mutation operations. The members after `phase` are a
 * prune's; see `PublicDemoPruneOutcome`.
 * @typedef {object} PublicDemoActivationOutcome
 * @property {boolean} [active]
 * @property {number} [moved]
 * @property {string} [operationId]
 * @property {string} [phase]
 * @property {string} [contract]
 * @property {string} [mode]
 * @property {number} [removed]
 * @property {readonly string[]} [retainedOperations]
 * @property {number} [selected]
 * @property {readonly string[]} [selectedOperations]
 * @property {number} [skipped]
 * @property {number} [tombstones]
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
  if (!new Set(["activate", "finalize", "inspect", "prune", "quarantine-stale", "recover"]).has(action)) {
    throw new Error("Choose activate, finalize, inspect, prune, quarantine-stale, or recover.");
  }
  /** @type {PublicDemoActivationOptionsDraft} */
  const options = { action };
  /** @type {Set<string>} */
  const seen = new Set();
  const flags = new Map([
    ["--confirm-quiescent", "confirmQuiescent"],
    ["--data-root", "dataRoot"],
    ["--max-removals", "maxRemovals"],
    ["--mode", "mode"],
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
  if ((action === "activate" || action === "quarantine-stale") && !options.operationId) {
    throw new Error(`${action} requires --operation-id.`);
  }
  if (new Set(["activate", "recover"]).has(action)
    && options.confirmQuiescent !== "COMPOSE SQLITE USERS STOPPED") {
    throw new Error("Activation or recovery requires the exact stopped-service confirmation.");
  }
  if (!new Set(["activate", "recover"]).has(action) && options.confirmQuiescent) {
    throw new Error("--confirm-quiescent is accepted only for activate or recover.");
  }
  if (action === "prune") {
    if (options.mode !== "plan" && options.mode !== "apply") throw new Error("prune requires --mode plan or --mode apply.");
    if (options.operationId) throw new Error("--operation-id is not accepted for prune.");
    if (options.maxRemovals !== undefined && !MAX_REMOVALS_PATTERN.test(options.maxRemovals)) {
      throw new Error("--max-removals must be an integer from 1 through 999.");
    }
  } else if (options.mode !== undefined || options.maxRemovals !== undefined) {
    throw new Error("--mode and --max-removals are accepted only for prune.");
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
 * Run one activate/finalize/inspect/prune/quarantine-stale/recover operation end to end.
 * @param {{ action: string, dataRoot: string, environment?: NodeJS.ProcessEnv, maxRemovals?: string, mode?: string, operationId?: string, requireCanonicalDataRoot?: boolean, requireRoot?: boolean, target: string }} input
 * @returns {Promise<Readonly<PublicDemoActivationOutcome>>}
 */
async function runPublicDemoActivationOperation({
  action,
  dataRoot,
  environment = process.env,
  maxRemovals,
  mode,
  operationId,
  requireCanonicalDataRoot = true,
  requireRoot = true,
  target,
}) {
  assertPublicDemoActivationRuntime({ dataRoot, environment, requireCanonicalDataRoot, requireRoot, target });
  const basePaths = resolvePublicDemoActivationPaths(dataRoot, operationId);
  await assertRealDirectory(basePaths.dataRoot, "Compose data root");
  if (action === "inspect") return inspectActiveOperation(basePaths.activeOperation);
  if (action === "prune") {
    if (mode !== "plan" && mode !== "apply") throw new Error("prune requires --mode plan or --mode apply.");
    if (maxRemovals !== undefined && !MAX_REMOVALS_PATTERN.test(maxRemovals)) {
      throw new Error("--max-removals must be an integer from 1 through 999.");
    }
    return pruneRetiredUnits(basePaths, { maxRemovals: maxRemovals === undefined ? null : Number(maxRemovals), mode });
  }
  if (action === "quarantine-stale") {
    if (!operationId || !OPERATION_ID_PATTERN.test(operationId)) throw new Error("quarantine-stale requires a valid --operation-id.");
    return quarantineStaleCandidate(basePaths, operationId);
  }

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
 * Move a verified candidate or partial build that an earlier operation left behind into failed
 * evidence, so the next reset can build again.
 *
 * A Docker restart can kill a reset after it built its candidate but before activation wrote the
 * active-operation marker. Recovery runs only for a marker, so nothing removed that candidate, and
 * every later build refused it. This runs only when no reset operation is active, because an active
 * operation's recovery owns those paths. Every path is checked before anything moves: only the exact
 * names and shapes a build creates are accepted, a link anywhere refuses the whole move, and nothing
 * is deleted.
 * @param {PublicDemoActivationPaths} paths
 * @param {string} operationId
 * @returns {Promise<Readonly<PublicDemoActivationOutcome>>}
 */
async function quarantineStaleCandidate(paths, operationId) {
  if (await pathExists(paths.activeOperation)) {
    throw new Error("A public-demo reset operation is active; recover it before moving a stale candidate.");
  }
  const entries = await fs.readdir(paths.dataRoot);
  const builds = entries.filter((entry) => entry.startsWith(PUBLIC_DEMO_BUILD_PREFIX)).sort();
  const candidateExists = entries.includes(PUBLIC_DEMO_CANDIDATE_DIRECTORY);
  if (!candidateExists && builds.length === 0) {
    return Object.freeze({ moved: 0, operationId, status: "no-stale-candidate", target: DEMO_DATA_TARGET });
  }

  if (candidateExists) {
    await assertRealDirectory(paths.candidateRoot, "stale public-demo candidate");
    const allowed = [...UNIT_ENTRIES, ...SQLITE_SIDECARS];
    if ((await fs.readdir(paths.candidateRoot)).some((entry) => !allowed.includes(entry))) {
      throw new Error("The stale public-demo candidate contains unexpected state.");
    }
    await assertNoLinks(paths.candidateRoot);
  }
  for (const build of builds) {
    if (!BUILD_DIRECTORY_PATTERN.test(build)) throw new Error("A stale public-demo build has an unexpected name.");
    await assertRealDirectory(path.join(paths.dataRoot, build), "stale public-demo build");
    await assertNoLinks(path.join(paths.dataRoot, build));
  }
  const evidenceRoot = path.join(paths.dataRoot, `${PUBLIC_DEMO_FAILED_PREFIX}${operationId}${PUBLIC_DEMO_STALE_SUFFIX}`);
  await assertAbsent(evidenceRoot, "stale-candidate evidence");
  await fs.mkdir(evidenceRoot, { mode: 0o700 });

  /** @type {string[]} */
  const moved = [];
  if (candidateExists) {
    await fs.rename(paths.candidateRoot, path.join(evidenceRoot, "candidate"));
    moved.push("candidate");
  }
  for (const build of builds) {
    await fs.rename(path.join(paths.dataRoot, build), path.join(evidenceRoot, build));
    moved.push(build);
  }
  const record = { contract: PUBLIC_DEMO_STALE_CONTRACT, generatedAt: new Date().toISOString(), moved, operationId, target: DEMO_DATA_TARGET };
  await fs.writeFile(path.join(evidenceRoot, "stale-candidate.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ moved: moved.length, operationId, status: "stale-candidate-quarantined", target: DEMO_DATA_TARGET });
}

/**
 * Delete the retired units of older completed resets, keeping those of the newest
 * `PUBLIC_DEMO_RETAINED_UNITS` completed resets.
 *
 * Only a real `.longtail-public-demo-previous-<operation>` directory whose `reset-operation.json`
 * records that operation as completed is considered. Anything else under that prefix, such as the
 * remains of an interrupted recovery, is incident evidence and is never touched, and neither is
 * failed evidence, the active unit, or a candidate. Every selected unit's exact shape is checked,
 * with no link anywhere beneath it, before anything changes: one failed check removes nothing. Each
 * removal is renamed to a tombstone first, so an interrupted deletion leaves only a tombstone, which
 * the next apply finishes after checking it too. Plan mode reports the same selection and changes
 * nothing. A cap bounds every directory the apply would delete, tombstones included: more than that
 * removes nothing and reports why. `removed` counts the same directories.
 * @param {PublicDemoActivationPaths} paths
 * @param {{ maxRemovals: number | null, mode: "apply" | "plan" }} options
 * @returns {Promise<Readonly<PublicDemoPruneOutcome>>}
 */
async function pruneRetiredUnits(paths, { maxRemovals, mode }) {
  if (await pathExists(paths.activeOperation)) {
    throw new Error("A public-demo reset operation is active; recover it before pruning retired units.");
  }
  const entries = (await fs.readdir(paths.dataRoot)).sort();
  const tombstones = entries.filter((entry) => entry.startsWith(PUBLIC_DEMO_PRUNING_PREFIX));
  for (const tombstone of tombstones) {
    if (!OPERATION_ID_PATTERN.test(tombstone.slice(PUBLIC_DEMO_PRUNING_PREFIX.length))) {
      throw new Error("A public-demo pruning tombstone has an unexpected name; nothing was removed.");
    }
    await assertRealDirectory(path.join(paths.dataRoot, tombstone), "public-demo pruning tombstone");
    await assertNoLinks(path.join(paths.dataRoot, tombstone));
  }

  /** @type {string[]} */
  const completed = [];
  let skipped = 0;
  for (const entry of entries.filter((name) => name.startsWith(PUBLIC_DEMO_PREVIOUS_PREFIX))) {
    const operationId = entry.slice(PUBLIC_DEMO_PREVIOUS_PREFIX.length);
    if (await isCompletedRetiredUnit(path.join(paths.dataRoot, entry), operationId)) completed.push(operationId);
    else skipped += 1;
  }
  completed.sort(newestOperationFirst);
  const retained = completed.slice(0, PUBLIC_DEMO_RETAINED_UNITS);
  const selected = completed.slice(PUBLIC_DEMO_RETAINED_UNITS);
  for (const operationId of selected) {
    await assertRetiredUnitShape(path.join(paths.dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`));
    await assertAbsent(path.join(paths.dataRoot, `${PUBLIC_DEMO_PRUNING_PREFIX}${operationId}`), "public-demo pruning tombstone");
  }

  const outcome = (/** @type {string} */ status, /** @type {number} */ removed) => Object.freeze({
    contract: PUBLIC_DEMO_PRUNE_CONTRACT,
    mode,
    removed,
    retainedOperations: Object.freeze([...retained]),
    selected: selected.length,
    ...(mode === "plan" ? { selectedOperations: Object.freeze([...selected]) } : {}),
    skipped,
    status,
    target: DEMO_DATA_TARGET,
    tombstones: tombstones.length,
  });
  // A tombstone is a deletion too, so it counts against the cap and in what was removed.
  const deletions = tombstones.length + selected.length;
  if (mode === "plan") return outcome("prune-planned", 0);
  if (maxRemovals !== null && deletions > maxRemovals) return outcome("prune-cap-exceeded", 0);

  for (const tombstone of tombstones) {
    await fs.rm(path.join(paths.dataRoot, tombstone), { recursive: true, force: false });
  }
  for (const operationId of selected) {
    const tombstone = path.join(paths.dataRoot, `${PUBLIC_DEMO_PRUNING_PREFIX}${operationId}`);
    await fs.rename(path.join(paths.dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`), tombstone);
    await fs.rm(tombstone, { recursive: true, force: false });
  }
  return outcome("pruned", deletions);
}

/**
 * Whether a retired-unit entry is a real directory whose own record proves that this operation
 * completed. Any other entry is left alone.
 * @param {string} unitRoot
 * @param {string} operationId
 * @returns {Promise<boolean>}
 */
async function isCompletedRetiredUnit(unitRoot, operationId) {
  if (!OPERATION_ID_PATTERN.test(operationId)) return false;
  const unit = await fs.lstat(unitRoot);
  if (!unit.isDirectory() || unit.isSymbolicLink()) return false;
  const recordPath = path.join(unitRoot, RETIRED_UNIT_RECORD);
  const record = await fs.lstat(recordPath).catch(() => null);
  if (!record?.isFile() || record.isSymbolicLink()) return false;
  try {
    const operation = /** @type {PublicDemoResetOperation} */ (JSON.parse(await fs.readFile(recordPath, "utf8")));
    assertOperation(operation, operationId);
    return operation.phase === "completed";
  } catch {
    return false;
  }
}

/**
 * Require the exact shape a completed reset leaves: the unit's entries, optional SQLite sidecars,
 * and its operation record, with no link anywhere beneath it.
 * @param {string} unitRoot
 */
async function assertRetiredUnitShape(unitRoot) {
  const allowed = [...UNIT_ENTRIES, ...SQLITE_SIDECARS, RETIRED_UNIT_RECORD];
  const entries = await fs.readdir(unitRoot);
  if (entries.some((entry) => !allowed.includes(entry))
    || [...UNIT_ENTRIES, RETIRED_UNIT_RECORD].some((entry) => !entries.includes(entry))) {
    throw new Error("A retired public-demo unit selected for pruning has an unexpected shape; nothing was removed.");
  }
  for (const entry of entries) {
    const target = path.join(unitRoot, entry);
    if (entry === "files") await assertRealDirectory(target, "retired public-demo unit Files");
    else await assertRealFile(target, `retired public-demo unit ${entry}`);
  }
  await assertNoLinks(unitRoot);
}

/**
 * Orders operation identities newest first, by the UTC timestamp each begins with.
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function newestOperationFirst(left, right) {
  const order = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);
  return order(right.slice(0, 16), left.slice(0, 16)) || order(right, left);
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
  PUBLIC_DEMO_PRUNING_PREFIX,
  PUBLIC_DEMO_RETAINED_UNITS,
  SQLITE_SIDECARS,
  UNIT_ENTRIES,
  assertPublicDemoActivationRuntime,
  parsePublicDemoActivationArgs,
  resolvePublicDemoActivationPaths,
  runPublicDemoActivationOperation,
};
