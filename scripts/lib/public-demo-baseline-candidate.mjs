import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { verifyPassword } from "../../src/security/passwords.js";
import {
  DEMO_DATA_CONTRACT,
  DEMO_DATA_MARKER,
  DEMO_DATA_PUBLIC_URL,
  DEMO_DATA_TARGET,
  assertNoLinksInTree,
  assertProtectedFile,
  assertRealDirectory,
  assertRealFile,
  createDemoOperationId,
  seedCandidate,
  verifyDemoSeedCandidate,
  writeDemoMarker,
} from "./demo-data-operation.mjs";
import {
  PUBLIC_DEMO_ROLE_FIXTURE_MODE,
  ROLE_CREDENTIALS_FILE_ENV,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
  SANITIZED_DEMO_ROLE_FIXTURES,
  loadSanitizedDemoRoleFixtures,
} from "./sanitized-demo-role-fixtures.mjs";

const PUBLIC_DEMO_CANDIDATE_CONTRACT = "longtail-forge-public-demo-candidate-v1";
const PUBLIC_DEMO_CANDIDATE_DIRECTORY = ".longtail-public-demo-candidate";
const PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX = ".longtail-public-demo-build-";
const CANONICAL_COMPOSE_DATA_ROOT = "/var/lib/longtail-forge";
const FRESH_BASELINE_NAME = "current_fresh_start_database";
const MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z][a-z0-9_]*)\.sql$/;
const EXPECTED_CANDIDATE_ENTRIES = new Set(["files", "longtail-forge.db", DEMO_DATA_MARKER]);
const PROTECTED_TABLE_PATTERN = /(analytics|feedback|interest)/i;
const SECRET_KEY_PATTERN = /(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/;

/**
 * The verification summary returned by the staging seed command.
 * @typedef {import("./demo-data-operation.mjs").DemoSeedResult} DemoSeedResult
 */

/**
 * The verified identity of one seeded demo candidate.
 * @typedef {import("./demo-data-operation.mjs").DemoSeedVerification} DemoSeedVerification
 */

/**
 * The non-null resolved role-fixture credential set for the named demo.
 * @typedef {NonNullable<Awaited<ReturnType<typeof loadSanitizedDemoRoleFixtures>>>} SanitizedRoleFixtures
 */

/**
 * A value that may carry a filesystem error code, narrowed from an unknown thrown value.
 * @typedef {{ code?: unknown }} ErrnoCarrier
 */

/**
 * Minimal structural surface of an open better-sqlite3 statement.
 * @typedef {object} SqliteStatementLike
 * @property {(...bindings: unknown[]) => Record<string, unknown>[]} all
 * @property {(...bindings: unknown[]) => Record<string, unknown> | undefined} get
 * @property {(...bindings: unknown[]) => unknown} run
 */

/**
 * Minimal structural surface of an open better-sqlite3 database handle.
 * @typedef {object} SqliteDatabaseLike
 * @property {(sql: string) => SqliteStatementLike} prepare
 * @property {(sql: string, options?: { simple?: boolean }) => unknown} pragma
 * @property {() => void} close
 */

/**
 * One PRAGMA wal_checkpoint result row.
 * @typedef {{ busy: unknown }} WalCheckpointRow
 */

/**
 * One applied schema-migration identity row.
 * @typedef {object} AppliedMigrationRow
 * @property {string} checksum
 * @property {string} moduleId
 * @property {string} name
 * @property {string} version
 */

/**
 * One Files storage-key row.
 * @typedef {{ storage_key: string }} StorageKeyRow
 */

/**
 * One sqlite_master table-name row.
 * @typedef {{ name: string }} TableNameRow
 */

/**
 * One active-user credential row.
 * @typedef {{ username: string, password: string }} CredentialRow
 */

/**
 * Validated command-line arguments for the public-demo candidate operation.
 * @typedef {object} PublicDemoCandidateArgs
 * @property {string} action
 * @property {string} anchorDate
 * @property {string} dataRoot
 * @property {boolean} dryRun
 * @property {string} roleCredentialsFile
 * @property {string} target
 */

/**
 * Value-flag destination keys accepted on the command line.
 * @typedef {"anchorDate" | "dataRoot" | "roleCredentialsFile" | "target"} PublicDemoOptionKey
 */

/**
 * Runtime identity requirements for candidate construction.
 * @typedef {object} PublicDemoRuntimeGate
 * @property {string} dataRoot
 * @property {NodeJS.ProcessEnv} environment
 * @property {boolean} [requireCanonicalDataRoot]
 * @property {boolean} [requireRoot]
 * @property {string} target
 */

/**
 * Options accepted by preparePublicDemoCandidateContext.
 * @typedef {object} PublicDemoContextRequest
 * @property {string} action
 * @property {string} [anchorDate]
 * @property {string} dataRoot
 * @property {boolean} [dryRun]
 * @property {NodeJS.ProcessEnv} [environment]
 * @property {string} [releaseDir]
 * @property {boolean} [requireCanonicalDataRoot]
 * @property {boolean} [requireRoot]
 * @property {string} roleCredentialsFile
 * @property {string} target
 */

/**
 * Resolved candidate-related locations inside the Compose data root.
 * @typedef {object} PublicDemoCandidatePaths
 * @property {string} activeDatabaseFile
 * @property {string} activeFilesRoot
 * @property {string} candidateRoot
 * @property {string} dataRoot
 */

/**
 * Candidate-state expectations for one operation.
 * @typedef {{ allowCandidate: boolean }} CandidateStateGate
 */

/**
 * A staging seed request executed inside the current release.
 * @typedef {object} PublicDemoSeedRequest
 * @property {string} anchorDate
 * @property {string} releaseDir
 * @property {string} roleCredentialsFile
 * @property {string} seedDataRoot
 */

/**
 * The injectable side effects of the candidate operation.
 * @typedef {object} PublicDemoCandidateDependencies
 * @property {() => string} operationId
 * @property {(request: PublicDemoSeedRequest) => Promise<DemoSeedResult | void>} seedCandidate
 * @property {(candidateRoot: string) => Promise<void>} repairPermissions
 */

/**
 * Options accepted by runPublicDemoCandidateOperation.
 * @typedef {object} RunPublicDemoCandidateOptions
 * @property {string} action
 * @property {string} anchorDate
 * @property {string} appVersion
 * @property {string} [dataRoot]
 * @property {PublicDemoCandidateDependencies} [dependencies]
 * @property {boolean} [dryRun]
 * @property {readonly unknown[]} [forbiddenValues]
 * @property {PublicDemoCandidatePaths} paths
 * @property {string} releaseDir
 * @property {string} roleCredentialsFile
 * @property {SanitizedRoleFixtures} roleFixtures
 * @property {string} [target]
 */

/**
 * A verification request for one candidate (or active) baseline root.
 * @typedef {object} PublicDemoVerifyRequest
 * @property {string} anchorDate
 * @property {string} appVersion
 * @property {string} candidateRoot
 * @property {boolean} [exactEntries]
 * @property {readonly unknown[]} [forbiddenValues]
 * @property {string} releaseDir
 * @property {SanitizedRoleFixtures} roleFixtures
 */

/**
 * The verified candidate identity, including its migration identity hash.
 * @typedef {object} PublicDemoVerification
 * @property {Readonly<Record<string, number>>} counts
 * @property {string} migrationIdentitySha256
 * @property {readonly string[]} publicVisitorUserIds
 * @property {string} semanticFingerprint
 */

/**
 * The parsed candidate ownership marker (the properties this module reads).
 * @typedef {object} PublicDemoCandidateMarker
 * @property {string} action
 * @property {string} anchorDate
 * @property {string} appVersion
 * @property {string} candidateContract
 * @property {string} contract
 * @property {Readonly<Record<string, number>>} counts
 * @property {string} generatedAt
 * @property {string} migrationIdentitySha256
 * @property {readonly string[]} publicVisitorUserIds
 * @property {number} roleFixtureCount
 * @property {string} semanticFingerprint
 * @property {string} state
 * @property {string} target
 */

/**
 * The verified values one candidate marker must match exactly.
 * @typedef {object} CandidateMarkerExpectation
 * @property {string} anchorDate
 * @property {string} appVersion
 * @property {string} migrationIdentitySha256
 * @property {DemoSeedVerification} verification
 */

/** @param {string[]} args */
function parsePublicDemoCandidateArgs(args) {
  const action = args[0];
  if (!new Set(["active", "build", "validate"]).has(action)) {
    throw new Error("Choose active, build, or validate.");
  }
  const options = /** @type {PublicDemoCandidateArgs} */ ({ action, dryRun: false });
  const seenFlags = new Set();
  const valueFlags = new Map([
    ["--anchor-date", "anchorDate"],
    ["--data-root", "dataRoot"],
    ["--role-credentials", "roleCredentialsFile"],
    ["--target", "target"],
  ]);
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      if (action !== "build" || options.dryRun) throw new Error("--dry-run is accepted once with build only.");
      options.dryRun = true;
      continue;
    }
    if (!valueFlags.has(argument)) throw new Error(`Unknown public-demo candidate option: ${argument}`);
    if (seenFlags.has(argument)) throw new Error(`Public-demo candidate option may be supplied only once: ${argument}.`);
    seenFlags.add(argument);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    options[/** @type {PublicDemoOptionKey} */ (valueFlags.get(argument))] = value;
  }
  if (options.target !== DEMO_DATA_TARGET) throw new Error(`--target must be exactly ${DEMO_DATA_TARGET}.`);
  if (options.anchorDate === "today") {
    const now = new Date();
    options.anchorDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  if (!isCalendarDate(options.anchorDate)) {
    throw new Error("--anchor-date must be an actual calendar date in YYYY-MM-DD form, or the literal \"today\".");
  }
  if (!path.isAbsolute(String(options.dataRoot || ""))) throw new Error("--data-root must be absolute.");
  if (!path.isAbsolute(String(options.roleCredentialsFile || ""))) throw new Error("--role-credentials must be absolute.");
  return Object.freeze(options);
}

/** @param {PublicDemoRuntimeGate} gate */
function assertPublicDemoCandidateRuntime({
  dataRoot,
  environment,
  requireCanonicalDataRoot = true,
  requireRoot = true,
  target,
}) {
  if (target !== DEMO_DATA_TARGET) throw new Error("The public-demo candidate target is not the named demo installation.");
  if (String(environment.LONGTAIL_ENV || "").toLowerCase() !== "production"
    || String(environment.DEMO_MODE || "").toLowerCase() !== "true"
    || String(environment.LONGTAIL_DEPLOYMENT_MODE || "").toLowerCase() !== "compose"
    || normalizeOrigin(environment.LONGTAIL_PUBLIC_URL) !== DEMO_DATA_PUBLIC_URL) {
    throw new Error("Public-demo candidate construction requires the exact production Compose demo profile.");
  }
  if (requireCanonicalDataRoot && path.resolve(dataRoot) !== path.resolve(CANONICAL_COMPOSE_DATA_ROOT)) {
    throw new Error(`Public-demo candidate construction requires the exact Compose data root ${CANONICAL_COMPOSE_DATA_ROOT}.`);
  }
  if (requireRoot && process.platform !== "win32" && process.getuid?.() !== 0) {
    throw new Error("Public-demo candidate construction must run as root through the reviewed Compose operator command.");
  }
}

/** @param {PublicDemoContextRequest} request */
async function preparePublicDemoCandidateContext({
  action,
  dataRoot,
  environment = process.env,
  releaseDir = process.cwd(),
  requireCanonicalDataRoot = true,
  requireRoot = true,
  roleCredentialsFile,
  target,
}) {
  assertPublicDemoCandidateRuntime({ dataRoot, environment, requireCanonicalDataRoot, requireRoot, target });
  const resolvedDataRoot = path.resolve(dataRoot);
  const resolvedReleaseDir = await fs.realpath(releaseDir);
  const resolvedCredentials = path.resolve(roleCredentialsFile);
  if (isInside(resolvedDataRoot, resolvedReleaseDir) || isInside(resolvedReleaseDir, resolvedDataRoot)
    || resolvedReleaseDir === resolvedDataRoot) {
    throw new Error("The release and Compose data roots must remain separate.");
  }
  if (resolvedCredentials === resolvedDataRoot || isInside(resolvedDataRoot, resolvedCredentials)
    || resolvedCredentials === resolvedReleaseDir || isInside(resolvedReleaseDir, resolvedCredentials)) {
    throw new Error("Public-demo role credentials must stay outside the release and Compose data roots.");
  }
  await assertRealDirectory(resolvedDataRoot, "Compose data root");
  await assertRealFile(path.join(resolvedDataRoot, "longtail-forge.db"), "active Compose database");
  await assertRealDirectory(path.join(resolvedDataRoot, "files"), "active Compose Files root");
  await assertProtectedFile(resolvedCredentials, {
    expectedMode: 0o600,
    label: "public-demo role credential configuration",
    requireRoot,
  });
  const packageJson = JSON.parse(await fs.readFile(path.join(resolvedReleaseDir, "package.json"), "utf8"));
  const roleFixtures = /** @type {SanitizedRoleFixtures} */ (await loadSanitizedDemoRoleFixtures({
    credentialBinding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    env: {
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
      LONGTAIL_RELEASE_BRANCH: "",
      [ROLE_CREDENTIALS_FILE_ENV]: resolvedCredentials,
    },
    mode: PUBLIC_DEMO_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }));
  const forbiddenValues = collectForbiddenValues(environment, roleFixtures);
  assertDistinctRoleCredentials(roleFixtures, environment);
  const paths = resolvePublicDemoCandidatePaths(resolvedDataRoot);
  await assertCandidateState(paths, { allowCandidate: action === "validate" });
  if (action === "validate") await assertRealDirectory(paths.candidateRoot, "public-demo candidate root");
  return Object.freeze({
    appVersion: packageJson.version,
    forbiddenValues,
    paths,
    releaseDir: resolvedReleaseDir,
    roleCredentialsFile: resolvedCredentials,
    roleFixtures,
  });
}

/**
 * @param {string} dataRoot
 * @returns {Readonly<PublicDemoCandidatePaths>}
 */
function resolvePublicDemoCandidatePaths(dataRoot) {
  const resolvedDataRoot = path.resolve(dataRoot);
  return Object.freeze({
    activeDatabaseFile: path.join(resolvedDataRoot, "longtail-forge.db"),
    activeFilesRoot: path.join(resolvedDataRoot, "files"),
    candidateRoot: path.join(resolvedDataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY),
    dataRoot: resolvedDataRoot,
  });
}

/** @param {RunPublicDemoCandidateOptions} options */
async function runPublicDemoCandidateOperation(options) {
  const {
    action,
    anchorDate,
    appVersion,
    dryRun = false,
    forbiddenValues = [],
    paths,
    releaseDir,
    roleCredentialsFile,
    roleFixtures,
    dependencies = Object.freeze({
      operationId: createDemoOperationId,
      seedCandidate,
      repairPermissions: repairCandidatePermissions,
    }),
  } = options;
  await assertCandidateState(paths, { allowCandidate: action === "validate" });
  if (action === "validate" || action === "active") {
    const verification = await verifyPublicDemoCandidate({
      anchorDate,
      appVersion,
      candidateRoot: action === "active" ? paths.dataRoot : paths.candidateRoot,
      exactEntries: action !== "active",
      forbiddenValues,
      releaseDir,
      roleFixtures,
    });
    return candidateResult(action === "active" ? "active-baseline-valid" : "candidate-valid", anchorDate, appVersion, verification);
  }
  if (dryRun) {
    return Object.freeze({
      status: "candidate-dry-run-ready",
      target: DEMO_DATA_TARGET,
      anchorDate,
      appVersion,
      roleFixtureCount: SANITIZED_DEMO_ROLE_FIXTURES.length,
    });
  }

  const operationId = dependencies.operationId();
  const stageRoot = path.join(paths.dataRoot, `${PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX}${operationId}`);
  assertExactCandidateChild(paths.dataRoot, stageRoot, PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX);
  if (await pathExists(stageRoot)) throw new Error("A public-demo candidate build path already exists; refusing partial-state reuse.");
  let candidatePublished = false;
  try {
    await fs.mkdir(stageRoot, { recursive: false, mode: 0o700 });
    const seedDataRoot = path.join(stageRoot, "sanitized-demo");
    const seedResult = await dependencies.seedCandidate({
      anchorDate,
      releaseDir,
      roleCredentialsFile,
      seedDataRoot,
    });
    await finalizeCandidateDatabase(path.join(seedDataRoot, "longtail-forge.db"));
    const preliminary = await verifyDemoSeedCandidate({
      databaseFile: path.join(seedDataRoot, "longtail-forge.db"),
      expectedAnchorDate: anchorDate,
      expectedFingerprint: /** @type {DemoSeedResult} */ (seedResult).semanticFingerprint,
      filesRoot: path.join(seedDataRoot, "files"),
    });
    await fs.rm(path.join(seedDataRoot, ".longtail-development-data.json"), { force: false });
    const migrationIdentitySha256 = await verifyMigrationIdentity(
      path.join(seedDataRoot, "longtail-forge.db"),
      releaseDir,
    );
    await writeDemoMarker(path.join(seedDataRoot, DEMO_DATA_MARKER), {
      action: "candidate",
      anchorDate,
      appVersion,
      candidateContract: PUBLIC_DEMO_CANDIDATE_CONTRACT,
      counts: preliminary.counts,
      migrationIdentitySha256,
      publicVisitorUserIds: preliminary.publicVisitorUserIds,
      roleFixtureCount: SANITIZED_DEMO_ROLE_FIXTURES.length,
      semanticFingerprint: preliminary.semanticFingerprint,
      state: "verified-candidate",
      target: DEMO_DATA_TARGET,
    });
    await assertNoLinksInTree(seedDataRoot);
    await dependencies.repairPermissions(seedDataRoot);
    const verification = await verifyPublicDemoCandidate({
      anchorDate,
      appVersion,
      candidateRoot: seedDataRoot,
      forbiddenValues,
      releaseDir,
      roleFixtures,
    });
    await fs.rename(seedDataRoot, paths.candidateRoot);
    candidatePublished = true;
    await fs.rmdir(stageRoot);
    return candidateResult("candidate-built", anchorDate, appVersion, verification);
  } catch (error) {
    if (candidatePublished && await pathExists(paths.candidateRoot)) {
      await fs.rm(paths.candidateRoot, { recursive: true, force: false });
    }
    throw error;
  } finally {
    if (await pathExists(stageRoot)) await fs.rm(stageRoot, { recursive: true, force: false });
  }
}

/** @param {string} databaseFile */
async function finalizeCandidateDatabase(databaseFile) {
  const database = /** @type {SqliteDatabaseLike} */ (/** @type {unknown} */ (new Database(databaseFile, { fileMustExist: true })));
  try {
    const result = /** @type {WalCheckpointRow[]} */ (database.pragma("wal_checkpoint(TRUNCATE)"));
    if (result.some((row) => Number(row.busy) !== 0)) {
      throw new Error("Public-demo candidate database could not be checkpointed.");
    }
    if (String(database.pragma("journal_mode = DELETE", { simple: true })).toLowerCase() !== "delete") {
      throw new Error("Public-demo candidate database could not leave WAL mode safely.");
    }
  } finally {
    database.close();
  }
  await fs.rm(`${databaseFile}-wal`, { force: true });
  await fs.rm(`${databaseFile}-shm`, { force: true });
}

/**
 * @param {PublicDemoVerifyRequest} request
 * @returns {Promise<Readonly<PublicDemoVerification>>}
 */
async function verifyPublicDemoCandidate({
  anchorDate,
  appVersion,
  candidateRoot,
  exactEntries = true,
  forbiddenValues = [],
  releaseDir,
  roleFixtures,
}) {
  const resolvedRoot = path.resolve(candidateRoot);
  await assertRealDirectory(resolvedRoot, "public-demo candidate root");
  await assertNoLinksInTree(resolvedRoot);
  const entries = await fs.readdir(resolvedRoot);
  if (exactEntries && (entries.length !== EXPECTED_CANDIDATE_ENTRIES.size
    || entries.some((entry) => !EXPECTED_CANDIDATE_ENTRIES.has(entry)))) {
    throw new Error("Public-demo candidate contains unexpected or partial state.");
  }
  const databaseFile = path.join(resolvedRoot, "longtail-forge.db");
  const filesRoot = path.join(resolvedRoot, "files");
  const markerFile = path.join(resolvedRoot, DEMO_DATA_MARKER);
  await assertRealFile(databaseFile, "public-demo candidate database");
  await assertRealDirectory(filesRoot, "public-demo candidate Files root");
  await assertRealFile(markerFile, "public-demo candidate ownership marker");
  const marker = await readCandidateMarker(markerFile);
  const verification = await verifyDemoSeedCandidate({
    databaseFile,
    expectedAnchorDate: anchorDate,
    expectedFingerprint: marker.semanticFingerprint,
    filesRoot,
  });
  const migrationIdentitySha256 = await verifyMigrationIdentity(databaseFile, releaseDir);
  await verifyExactFilesInventory(databaseFile, filesRoot);
  await verifyNoProtectedPersistence(databaseFile);
  await verifyCredentialHashes(databaseFile, roleFixtures);
  await verifyForbiddenValuesAbsent(resolvedRoot, forbiddenValues);
  assertCandidateMarker(marker, {
    anchorDate,
    appVersion,
    migrationIdentitySha256,
    verification,
  });
  return Object.freeze({ ...verification, migrationIdentitySha256 });
}

/** @param {string} releaseDir */
async function listCandidateMigrationFiles(releaseDir) {
  const sources = [{ moduleId: "core", relativeDir: "src/db/migrations" }];
  const modulesRoot = path.join(releaseDir, "src", "modules");
  for (const entry of await fs.readdir(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relativeDir = path.posix.join("src/modules", entry.name, "migrations");
    const absoluteDir = path.join(releaseDir, ...relativeDir.split("/"));
    if (await isRealDirectory(absoluteDir)) sources.push({ moduleId: entry.name, relativeDir });
  }
  const migrations = [];
  const versions = new Set();
  for (const source of sources) {
    const absoluteDir = path.join(releaseDir, ...source.relativeDir.split("/"));
    for (const entry of await fs.readdir(absoluteDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      if (!match) throw new Error("Public-demo candidate release contains an invalid migration filename.");
      if (versions.has(match[1])) throw new Error("Public-demo candidate release contains a duplicate migration version.");
      versions.add(match[1]);
      migrations.push(Object.freeze({
        absolutePath: path.join(absoluteDir, entry.name),
        moduleId: source.moduleId,
        name: match[2],
        version: match[1],
      }));
    }
  }
  return migrations.sort((left, right) => left.version.localeCompare(right.version)
    || left.moduleId.localeCompare(right.moduleId));
}

/** @param {string} target */
async function isRealDirectory(target) {
  try {
    const stats = await fs.lstat(target);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch (error) {
    if (/** @type {ErrnoCarrier} */ (error)?.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * @param {string} databaseFile
 * @param {string} releaseDir
 */
async function verifyMigrationIdentity(databaseFile, releaseDir) {
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  let applied;
  try {
    applied = /** @type {AppliedMigrationRow[]} */ (database.prepare(`
SELECT version, module_id AS moduleId, name, checksum
FROM schema_migrations
ORDER BY version, module_id;
`).all());
  } finally {
    database.close();
  }
  const baselineRows = applied.filter((row) => row.name === FRESH_BASELINE_NAME);
  if (baselineRows.length !== 1 || baselineRows[0].moduleId !== "core") {
    throw new Error("Public-demo candidate migration baseline identity is missing or ambiguous.");
  }
  const baselineSql = await fs.readFile(path.join(releaseDir, "src/db/schema/current.sql"), "utf8");
  if (baselineRows[0].checksum !== hashText(normalizeSql(baselineSql))) {
    throw new Error("Public-demo candidate migration baseline checksum does not match the release.");
  }
  const migrationFiles = await listCandidateMigrationFiles(releaseDir);
  const expected = await Promise.all(migrationFiles.map(async (migration) => ({
    checksum: hashText(normalizeSql(await fs.readFile(migration.absolutePath, "utf8"))),
    moduleId: migration.moduleId,
    name: migration.name,
    version: migration.version,
  })));
  const nonBaseline = applied.filter((row) => row.name !== FRESH_BASELINE_NAME);
  if (nonBaseline.length !== expected.length
    || expected.some((row, index) => (
      row.version !== nonBaseline[index]?.version
      || row.moduleId !== nonBaseline[index]?.moduleId
      || row.name !== nonBaseline[index]?.name
      || row.checksum !== nonBaseline[index]?.checksum
    ))) {
    throw new Error("Public-demo candidate applied migration identity does not match the release.");
  }
  return hashText(JSON.stringify(applied));
}

/**
 * @param {string} databaseFile
 * @param {string} filesRoot
 */
async function verifyExactFilesInventory(databaseFile, filesRoot) {
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  let expected;
  try {
    expected = /** @type {StorageKeyRow[]} */ (database.prepare("SELECT storage_key FROM files ORDER BY storage_key").all())
      .map((row) => normalizeStorageKey(row.storage_key));
  } finally {
    database.close();
  }
  const actual = (await listRegularFiles(filesRoot))
    .map((file) => normalizeStorageKey(path.relative(filesRoot, file)))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Public-demo candidate database and Files inventories do not match exactly.");
  }
}

/** @param {string} databaseFile */
async function verifyNoProtectedPersistence(databaseFile) {
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    const protectedTables = /** @type {TableNameRow[]} */ (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all())
      .map((row) => row.name)
      .filter((name) => PROTECTED_TABLE_PATTERN.test(name));
    if (protectedTables.length) {
      throw new Error("Public-demo candidate contains analytics, feedback, or interest-capture persistence.");
    }
  } finally {
    database.close();
  }
}

/**
 * @param {string} databaseFile
 * @param {SanitizedRoleFixtures} roleFixtures
 */
async function verifyCredentialHashes(databaseFile, roleFixtures) {
  if (roleFixtures?.fixtures?.length !== SANITIZED_DEMO_ROLE_FIXTURES.length) {
    throw new Error("Public-demo candidate credential fixture contract is incomplete.");
  }
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  let rows;
  try {
    rows = /** @type {CredentialRow[]} */ (database.prepare("SELECT username, password FROM users WHERE user_status = 'active' ORDER BY username").all());
  } finally {
    database.close();
  }
  for (const fixture of roleFixtures.fixtures) {
    const row = rows.find((candidate) => candidate.username === fixture.username);
    const credential = roleFixtures.credentials.get(fixture.roleId);
    const result = row && credential ? await verifyPassword(credential.password, row.password) : null;
    if (!result?.matches || result.needsRehash) {
      throw new Error("Public-demo candidate fixed credential hashes do not match the reviewed role fixtures.");
    }
  }
}

/**
 * @param {string} root
 * @param {readonly unknown[]} values
 */
async function verifyForbiddenValuesAbsent(root, values) {
  const protectedValues = [...new Set(values.map(String).filter((value) => value.length >= 8))];
  if (!protectedValues.length) return;
  const files = await listRegularFiles(root);
  for (const file of files) {
    const bytes = await fs.readFile(file);
    for (const value of protectedValues) {
      if (bytes.includes(Buffer.from(value))) {
        throw new Error("Public-demo candidate contains protected credential material.");
      }
    }
  }
}

/**
 * @param {PublicDemoCandidateMarker} marker
 * @param {CandidateMarkerExpectation} expectation
 */
function assertCandidateMarker(marker, { anchorDate, appVersion, migrationIdentitySha256, verification }) {
  const allowedKeys = new Set([
    "action", "anchorDate", "appVersion", "candidateContract", "contract", "counts", "generatedAt",
    "migrationIdentitySha256", "publicVisitorUserIds", "roleFixtureCount", "semanticFingerprint", "state", "target",
  ]);
  if (!marker || Object.keys(marker).some((key) => !allowedKeys.has(key))
    || marker.contract !== DEMO_DATA_CONTRACT
    || marker.candidateContract !== PUBLIC_DEMO_CANDIDATE_CONTRACT
    || marker.target !== DEMO_DATA_TARGET
    || marker.state !== "verified-candidate"
    || marker.action !== "candidate"
    || !isIsoTimestamp(marker.generatedAt)
    || marker.anchorDate !== anchorDate
    || marker.appVersion !== appVersion
    || marker.semanticFingerprint !== verification.semanticFingerprint
    || marker.migrationIdentitySha256 !== migrationIdentitySha256
    || marker.roleFixtureCount !== SANITIZED_DEMO_ROLE_FIXTURES.length
    || JSON.stringify(marker.counts) !== JSON.stringify(verification.counts)
    || JSON.stringify([...marker.publicVisitorUserIds].sort()) !== JSON.stringify(verification.publicVisitorUserIds)) {
    throw new Error("Public-demo candidate ownership marker does not match the verified baseline.");
  }
}

/**
 * @param {string} markerFile
 * @returns {Promise<PublicDemoCandidateMarker>}
 */
async function readCandidateMarker(markerFile) {
  try {
    return JSON.parse(await fs.readFile(markerFile, "utf8"));
  } catch {
    throw new Error("Public-demo candidate ownership marker is unreadable or invalid.");
  }
}

/**
 * @param {PublicDemoCandidatePaths} paths
 * @param {CandidateStateGate} gate
 */
async function assertCandidateState(paths, { allowCandidate }) {
  assertExactCandidateChild(paths.dataRoot, paths.candidateRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY);
  const entries = await fs.readdir(paths.dataRoot);
  if (entries.some((entry) => entry.startsWith(PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX))) {
    throw new Error("A partial public-demo candidate build exists; inspect or remove it deliberately before retrying.");
  }
  const candidateExists = await pathExists(paths.candidateRoot);
  if (!allowCandidate && candidateExists) {
    throw new Error("A verified public-demo candidate already exists; refusing candidate reuse or replacement.");
  }
  if (allowCandidate && !candidateExists) throw new Error("The verified public-demo candidate is missing.");
}

/**
 * @param {string} dataRoot
 * @param {string} candidate
 * @param {string} expectedNameOrPrefix
 */
function assertExactCandidateChild(dataRoot, candidate, expectedNameOrPrefix) {
  const resolvedDataRoot = path.resolve(dataRoot);
  const resolvedCandidate = path.resolve(candidate);
  const basename = path.basename(resolvedCandidate);
  if (path.dirname(resolvedCandidate) !== resolvedDataRoot
    || !(basename === expectedNameOrPrefix || basename.startsWith(expectedNameOrPrefix))) {
    throw new Error("Public-demo candidate paths must remain exact children of the Compose data root.");
  }
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {SanitizedRoleFixtures} roleFixtures
 */
function collectForbiddenValues(environment, roleFixtures) {
  return [
    ...Object.entries(environment)
      .filter(([key, value]) => SECRET_KEY_PATTERN.test(key) && String(value || ""))
      .map(([, value]) => String(value)),
    ...[...roleFixtures.credentials.values()].map((fixture) => fixture.password),
  ];
}

/**
 * @param {SanitizedRoleFixtures} roleFixtures
 * @param {NodeJS.ProcessEnv} environment
 */
function assertDistinctRoleCredentials(roleFixtures, environment) {
  const applicationSecrets = new Set(Object.entries(environment)
    .filter(([key, value]) => SECRET_KEY_PATTERN.test(key) && String(value || ""))
    .map(([, value]) => String(value)));
  if (roleFixtures.fixtures.length !== SANITIZED_DEMO_ROLE_FIXTURES.length
    || [...roleFixtures.credentials.values()].some((fixture) => applicationSecrets.has(fixture.password))) {
    throw new Error("Public-demo role credentials must be complete and distinct from application secrets.");
  }
}

/** @param {string} candidateRoot */
async function repairCandidatePermissions(candidateRoot) {
  const files = await listTree(candidateRoot);
  for (const entry of files) {
    const stats = await fs.lstat(entry);
    await fs.chmod(entry, stats.isDirectory() ? 0o700 : 0o600);
  }
  if (process.platform !== "win32" && process.getuid?.() === 0) {
    for (const entry of files) await fs.chown(entry, 10001, 10001);
  }
}

/** @param {string} root */
async function listTree(root) {
  const result = [root];
  const pending = [root];
  while (pending.length) {
    const current = /** @type {string} */ (pending.pop());
    const stats = await fs.lstat(current);
    if (!stats.isDirectory()) continue;
    const children = (await fs.readdir(current)).map((entry) => path.join(current, entry));
    result.push(...children);
    pending.push(...children);
  }
  return result;
}

/** @param {string} root */
async function listRegularFiles(root) {
  const files = [];
  for (const entry of await listTree(root)) {
    const stats = await fs.lstat(entry);
    if (stats.isSymbolicLink()) throw new Error("Public-demo candidate contains a symbolic link.");
    if (stats.isFile()) files.push(entry);
  }
  return files;
}

/**
 * @param {string} status
 * @param {string} anchorDate
 * @param {string} appVersion
 * @param {PublicDemoVerification} verification
 */
function candidateResult(status, anchorDate, appVersion, verification) {
  return Object.freeze({
    status,
    target: DEMO_DATA_TARGET,
    anchorDate,
    appVersion,
    semanticFingerprint: verification.semanticFingerprint,
    migrationIdentitySha256: verification.migrationIdentitySha256,
    counts: verification.counts,
    roleFixtureCount: SANITIZED_DEMO_ROLE_FIXTURES.length,
  });
}

/** @param {unknown} value */
function normalizeStorageKey(value) {
  return String(value).replaceAll("\\", "/");
}

/** @param {string} value */
function normalizeSql(value) {
  return value.replace(/\r\n?/g, "\n");
}

/** @param {string} value */
function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {unknown} value */
function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

/** @param {unknown} value */
function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

/** @param {unknown} value */
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * @param {string} parent
 * @param {string} child
 */
function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** @param {string} targetPath */
async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if (/** @type {ErrnoCarrier} */ (error)?.code === "ENOENT") return false;
    throw error;
  }
}

export {
  CANONICAL_COMPOSE_DATA_ROOT,
  PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX,
  PUBLIC_DEMO_CANDIDATE_CONTRACT,
  PUBLIC_DEMO_CANDIDATE_DIRECTORY,
  assertPublicDemoCandidateRuntime,
  parsePublicDemoCandidateArgs,
  preparePublicDemoCandidateContext,
  resolvePublicDemoCandidatePaths,
  runPublicDemoCandidateOperation,
  verifyMigrationIdentity,
  verifyPublicDemoCandidate,
};
