import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createOpaqueId } from "../../src/core/identifiers.js";
import { parseRuntimeEnvText } from "../../src/runtime-env.js";
import {
  assertOperatorPassword,
  DEMO_PROFILE,
} from "./development-data-safety.mjs";
import {
  loadSanitizedDemoRoleFixtures,
  LOCAL_ROLE_FIXTURE_MODE,
  ROLE_CREDENTIALS_FILE_ENV,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "./sanitized-demo-role-fixtures.mjs";
import {
  createBackup,
  inspectBackup,
} from "./backup-archive.mjs";

const DEMO_DATA_TARGET = "rt-ltf-demo";
const DEMO_DATA_HOSTNAME = "rt-ltf-demo";
const DEMO_DATA_PUBLIC_URL = "https://demo.longtailforge.com";
const DEMO_DATA_CONTRACT = "longtail-forge-demo-data-v1";
const DEMO_DATA_MARKER = ".longtail-demo-data.json";
const DEVELOPMENT_DATA_MARKER = ".longtail-development-data.json";
const PREFLIGHT_CONFIRMATION = "PREFLIGHT RT-LTF-DEMO DATA";
const PROVISION_CONFIRMATION = "PROVISION RT-LTF-DEMO DATA";
const RESET_CONFIRMATION = "RESET RT-LTF-DEMO DATA";
const DEFAULT_HELPER_ENV = "/etc/longtail-forge/demo-data-helper.env";
const DEFAULT_ROLE_CREDENTIALS_FILE = "/etc/longtail-forge/demo-role-credentials.json";
const ALLOWED_HELPER_KEYS = new Set([
  "LTF_APP_ACCOUNT",
  "LTF_APP_ENV",
  "LTF_APP_GROUP",
  "LTF_APP_ROOT",
  "LTF_APP_SERVICE",
  "LTF_BACKUP_ROOT",
  "LTF_DATA_ROOT",
  "LTF_DEMO_HOSTNAME",
  "LTF_DEMO_PUBLIC_URL",
  "LTF_DEMO_TARGET",
  "LTF_EDGE_SERVICE",
  "LTF_ROLE_CREDENTIALS",
  "LTF_SECURE_KEY_BACKUP",
  "LTF_WORKER_SERVICE",
]);
const LIVE_DATA_ENTRIES = new Set([
  "longtail-forge.db",
  "longtail-forge.db-shm",
  "longtail-forge.db-wal",
  "files",
  DEMO_DATA_MARKER,
]);

function parseDemoDataArgs(args) {
  const action = args[0];
  if (!new Set(["preflight", "provision", "reset"]).has(action)) {
    throw new Error("Choose preflight, provision, or reset.");
  }
  const options = { action };
  const valueFlags = new Map([
    ["--anchor-date", "anchorDate"],
    ["--confirm", "confirm"],
    ["--target", "target"],
  ]);
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!valueFlags.has(argument)) {
      throw new Error(`Unknown demo-data option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[valueFlags.get(argument)] = value;
  }
  if (options.target !== DEMO_DATA_TARGET) {
    throw new Error(`--target must be exactly ${DEMO_DATA_TARGET}.`);
  }
  if (options.anchorDate === "today") {
    const value = new Date();
    options.anchorDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(options.anchorDate || "")) || !isCalendarDate(options.anchorDate)) {
    throw new Error("--anchor-date must be an actual calendar date in YYYY-MM-DD form, or the literal \"today\".");
  }
  const expectedConfirmation = action === "preflight"
    ? PREFLIGHT_CONFIRMATION
    : action === "provision"
      ? PROVISION_CONFIRMATION
      : RESET_CONFIRMATION;
  if (options.confirm !== expectedConfirmation) {
    throw new Error(`--confirm must be exactly "${expectedConfirmation}".`);
  }
  return Object.freeze(options);
}

function parseDemoHelperConfig(text, sourceName = "demo-data-helper.env") {
  const parsed = parseRuntimeEnvText(text, sourceName);
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_HELPER_KEYS.has(key)) {
      throw new Error(`Demo-data helper configuration contains unsupported key: ${key}.`);
    }
  }
  const config = {
    target: parsed.LTF_DEMO_TARGET,
    hostname: parsed.LTF_DEMO_HOSTNAME,
    publicUrl: parsed.LTF_DEMO_PUBLIC_URL,
    appService: parsed.LTF_APP_SERVICE || "longtail-forge",
    workerService: parsed.LTF_WORKER_SERVICE || "",
    edgeService: parsed.LTF_EDGE_SERVICE || "caddy",
    appAccount: parsed.LTF_APP_ACCOUNT || "longtail-forge",
    appGroup: parsed.LTF_APP_GROUP || parsed.LTF_APP_ACCOUNT || "longtail-forge",
    appRoot: parsed.LTF_APP_ROOT || "/opt/longtail-forge",
    dataRoot: parsed.LTF_DATA_ROOT || "/var/lib/longtail-forge",
    backupRoot: parsed.LTF_BACKUP_ROOT || "/var/backups/longtail-forge",
    appEnvFile: parsed.LTF_APP_ENV || "/etc/longtail-forge/longtail-forge.env",
    roleCredentialsFile: parsed.LTF_ROLE_CREDENTIALS || DEFAULT_ROLE_CREDENTIALS_FILE,
    secureNotesKeyBackup: parsed.LTF_SECURE_KEY_BACKUP || "",
  };
  if (config.target !== DEMO_DATA_TARGET || config.hostname !== DEMO_DATA_HOSTNAME || config.publicUrl !== DEMO_DATA_PUBLIC_URL) {
    throw new Error("Demo-data helper identity must match the named demo installation exactly.");
  }
  for (const key of ["appService", "workerService", "edgeService", "appAccount", "appGroup"]) {
    if (config[key] && !/^[A-Za-z0-9_.@-]+$/.test(config[key])) {
      throw new Error(`Demo-data helper ${key} is invalid.`);
    }
  }
  return Object.freeze(config);
}

function resolveDemoPaths(config) {
  const absoluteKeys = ["appRoot", "dataRoot", "backupRoot", "appEnvFile", "roleCredentialsFile"];
  if (config.secureNotesKeyBackup) absoluteKeys.push("secureNotesKeyBackup");
  for (const key of absoluteKeys) {
    if (!path.isAbsolute(config[key])) {
      throw new Error(`Demo-data helper ${key} must be absolute.`);
    }
  }
  const appRoot = path.resolve(config.appRoot);
  const dataRoot = path.resolve(config.dataRoot);
  const backupRoot = path.resolve(config.backupRoot);
  if (isInside(dataRoot, backupRoot) || isInside(backupRoot, dataRoot) || dataRoot === backupRoot) {
    throw new Error("Demo data and backup roots must be separate non-nested locations.");
  }
  const roleCredentialsFile = path.resolve(config.roleCredentialsFile);
  const appEnvFile = path.resolve(config.appEnvFile);
  if (
    roleCredentialsFile === appEnvFile
    || [appRoot, dataRoot, backupRoot].some((root) => (
      roleCredentialsFile === root || isInside(root, roleCredentialsFile)
    ))
  ) {
    throw new Error("Demo role credentials must be a separate protected host file outside application, data, and backup roots.");
  }
  return Object.freeze({
    appRoot,
    currentReleaseLink: path.join(appRoot, "current"),
    releasesRoot: path.join(appRoot, "releases"),
    dataRoot,
    databaseFile: path.join(dataRoot, "longtail-forge.db"),
    filesRoot: path.join(dataRoot, "files"),
    markerFile: path.join(dataRoot, DEMO_DATA_MARKER),
    backupRoot,
    appEnvFile,
    roleCredentialsFile,
    secureNotesKeyBackup: config.secureNotesKeyBackup ? path.resolve(config.secureNotesKeyBackup) : "",
  });
}

async function readProtectedEnvironmentFile(filePath, options = {}) {
  await assertProtectedFile(filePath, options);
  const text = await fs.readFile(filePath, "utf8");
  return parseRuntimeEnvText(text, options.label || "protected environment");
}

function assertDemoHostIdentity({
  config,
  hostname = os.hostname(),
  requireRoot = true,
}) {
  if (process.platform === "win32" && requireRoot) {
    throw new Error("The demo-data host operation is Linux-only.");
  }
  if (requireRoot && typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("The demo-data host operation must run as root through the reviewed helper.");
  }
  if (hostname !== DEMO_DATA_HOSTNAME || hostname !== config.hostname
    || config.target !== DEMO_DATA_TARGET || config.publicUrl !== DEMO_DATA_PUBLIC_URL) {
    throw new Error("The current host does not match the named demo installation.");
  }
}

async function prepareDemoHostContext({
  action,
  config,
  hostname = os.hostname(),
  paths,
  requireRoot = true,
  readApplicationEnvironment = (filePath) => readProtectedEnvironmentFile(filePath, {
    label: "application environment",
    requireRoot,
  }),
  readRoleCredentials = readDemoRoleFixtures,
}) {
  assertDemoHostIdentity({ config, hostname, requireRoot });
  const appEnvironment = await readApplicationEnvironment(paths.appEnvFile);
  await assertProtectedFile(paths.roleCredentialsFile, {
    expectedMode: 0o600,
    label: "demo role credential configuration",
    requireRoot,
  });
  const roleFixtures = await readRoleCredentials(paths.roleCredentialsFile);
  assertRoleCredentialsDistinctFromApplicationEnvironment(roleFixtures, appEnvironment);
  const safety = await assertDemoHostSafety({
    action,
    appEnvironment,
    config,
    hostname,
    paths,
    requireRoot,
    roleFixtures,
  });
  return Object.freeze({
    ...safety,
    appEnvironment,
    roleFixtures,
  });
}

async function readDemoRoleFixtures(credentialsFile) {
  return await loadSanitizedDemoRoleFixtures({
    credentialBinding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    env: {
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
      LONGTAIL_RELEASE_BRANCH: "",
      [ROLE_CREDENTIALS_FILE_ENV]: credentialsFile,
    },
    mode: LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: DEMO_PROFILE },
  });
}

function assertRoleCredentialsDistinctFromApplicationEnvironment(roleFixtures, appEnvironment) {
  const applicationSecrets = new Set(Object.entries(appEnvironment)
    .filter(([key, value]) => (
      /(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/.test(key)
      && String(value || "")
    ))
    .map(([, value]) => String(value)));
  for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
    const password = roleFixtures?.credentials?.get(fixture.roleId)?.password;
    if (!password || applicationSecrets.has(password)) {
      throw new Error("Demo role credentials must be complete and distinct from application or copied installation secrets.");
    }
  }
}

async function assertDemoHostSafety({
  action,
  appEnvironment,
  config,
  paths,
  hostname = os.hostname(),
  requireRoot = true,
  roleFixtures,
}) {
  assertDemoHostIdentity({ config, hostname, requireRoot });
  if (
    roleFixtures?.fixtures?.length !== SANITIZED_DEMO_ROLE_FIXTURES.length
    || roleFixtures?.credentialBinding?.target !== DEMO_DATA_TARGET
    || roleFixtures?.credentialBinding?.publicUrl !== DEMO_DATA_PUBLIC_URL
  ) {
    throw new Error("The exact rt-ltf-demo role credential contract must be validated before host mutation.");
  }
  if (String(appEnvironment.LONGTAIL_ENV || "").toLowerCase() !== "production") {
    throw new Error("The demo application environment must declare LONGTAIL_ENV=production.");
  }
  if (normalizeOrigin(appEnvironment.LONGTAIL_PUBLIC_URL) !== DEMO_DATA_PUBLIC_URL) {
    throw new Error("The demo application public URL does not match the named demo installation.");
  }
  assertOperatorPassword(appEnvironment, { context: "demo-host" });
  await assertRealDirectory(paths.appRoot, "application root");
  await assertRealDirectory(paths.releasesRoot, "release root");
  const releaseDir = await fs.realpath(paths.currentReleaseLink);
  if (!isInside(paths.releasesRoot, releaseDir)) {
    throw new Error("The current release link must resolve inside the release root.");
  }
  await assertRealDirectory(releaseDir, "current release");
  await assertRealDirectory(paths.dataRoot, "runtime data root");
  await assertRealFile(paths.databaseFile, "runtime database");
  await assertRealDirectory(paths.filesRoot, "runtime Files root");
  await assertRealDirectory(paths.backupRoot, "backup root");
  if (paths.secureNotesKeyBackup) await assertProtectedFile(paths.secureNotesKeyBackup, { label: "Secure Notes key backup" });
  if (await pathExists(paths.markerFile)) await assertRealFile(paths.markerFile, "demo-data ownership marker");
  const marker = await readDemoMarker(paths.markerFile, { optional: true });
  if (requireRoot && process.platform !== "win32") {
    const account = readNumericIdentity(config.appAccount, "user");
    const group = readNumericIdentity(config.appGroup, "group");
    await assertOwnedMode(paths.dataRoot, account, group, 0o700, "runtime data root");
    await assertOwnedMode(paths.filesRoot, account, group, 0o700, "runtime Files root");
    await assertOwnedMode(paths.databaseFile, account, group, 0o600, "runtime database");
    await assertOwnedMode(paths.backupRoot, 0, 0, 0o700, "backup root");
    if (marker) await assertOwnedMode(paths.markerFile, account, group, 0o600, "demo-data ownership marker");
  }
  await assertNoUnexpectedDataEntries(paths.dataRoot);
  await assertNoPartialDemoState(paths);
  assertDemoMarkerForAction(action, marker);
  return Object.freeze({ releaseDir, marker });
}

function assertDemoMarkerForAction(action, marker) {
  if (action === "preflight") {
    if (marker && (marker.contract !== DEMO_DATA_CONTRACT || marker.target !== DEMO_DATA_TARGET)) {
      throw new Error("Preflight found an invalid demo-data ownership marker.");
    }
    return;
  }
  if (action === "provision" && marker) {
    throw new Error("The demo installation is already provisioned; use reset.");
  }
  if (action === "reset" && (!marker || marker.contract !== DEMO_DATA_CONTRACT || marker.target !== DEMO_DATA_TARGET)) {
    throw new Error("Reset requires a matching demo-data ownership marker.");
  }
}

async function runDemoDataOperation(options) {
  const {
    action,
    anchorDate,
    appEnvironment,
    appVersion,
    config,
    paths,
    releaseDir,
    roleCredentialsFile = paths.roleCredentialsFile,
    marker = null,
    dependencies = createHostDependencies(),
  } = options;
  if (action === "preflight") {
    return Object.freeze({
      status: "preflight-ready",
      target: DEMO_DATA_TARGET,
      anchorDate,
      nextAction: marker ? "reset" : "provision",
      roleFixtureCount: SANITIZED_DEMO_ROLE_FIXTURES.length,
      appVersion,
    });
  }
  const operationId = createDemoOperationId(dependencies);
  const timestamp = dependencies.timestamp ? dependencies.timestamp() : compactTimestamp();
  const generatedName = `longtail-demo-${timestamp}-${operationId.slice(0, 8)}`;
  const stageRoot = path.join(path.dirname(paths.dataRoot), `.${generatedName}-stage`);
  const seedDataRoot = path.join(stageRoot, DEMO_PROFILE);
  const previousDataRoot = `${paths.dataRoot}.demo-previous-${timestamp}`;
  const failedDataRoot = `${paths.dataRoot}.demo-failed-${timestamp}`;
  const backupPath = path.join(paths.backupRoot, `pre-demo-data-${timestamp}.ltfbackup.tgz`);
  for (const generatedPath of [stageRoot, previousDataRoot, failedDataRoot]) {
    assertGeneratedSiblingPath(paths.dataRoot, generatedPath);
    if (await pathExists(generatedPath)) throw new Error("A generated demo-data operation path already exists; refusing partial-state reuse.");
  }

  let servicesStopped = false;
  let promoted = false;
  let previousRetained = false;
  let serviceState;
  let backup;
  let verification;
  try {
    serviceState = await dependencies.captureServiceState(config);
    if (!serviceState.app || !serviceState.edge) {
      throw new Error("The application and edge services must be active before the demo-data operation.");
    }
    await dependencies.stopServices(config, serviceState);
    servicesStopped = true;
    await dependencies.assertServicesStopped(config, serviceState);

    backup = await dependencies.createBackup({
      appEnvironment,
      appVersion,
      backupPath,
      paths,
    });
    const inspected = await dependencies.inspectBackup({
      appVersion,
      archivePath: backup.outputPath,
      secureNotesKeyBackupPath: paths.secureNotesKeyBackup,
    });
    if (!inspected.restorable || inspected.archiveSha256 !== backup.archiveSha256) {
      throw new Error("The pre-reset whole-instance backup did not pass inspection.");
    }

    await fs.mkdir(stageRoot, { recursive: false, mode: 0o700 });
    const seedResult = await dependencies.seedCandidate({
      anchorDate,
      appEnvironment,
      releaseDir,
      roleCredentialsFile,
      seedDataRoot,
    });
    verification = await verifyDemoSeedCandidate({
      databaseFile: path.join(seedDataRoot, "longtail-forge.db"),
      filesRoot: path.join(seedDataRoot, "files"),
      expectedAnchorDate: anchorDate,
      expectedFingerprint: seedResult.semanticFingerprint,
    });
    await fs.rm(path.join(seedDataRoot, DEVELOPMENT_DATA_MARKER), { force: false });
    await writeDemoMarker(path.join(seedDataRoot, DEMO_DATA_MARKER), {
      action,
      anchorDate,
      appVersion,
      backupFile: path.basename(backup.outputPath),
      backupSha256: backup.archiveSha256,
      previousDataState: path.basename(previousDataRoot),
      semanticFingerprint: verification.semanticFingerprint,
      publicVisitorUserIds: verification.publicVisitorUserIds,
      roleFixtureCount: SANITIZED_DEMO_ROLE_FIXTURES.length,
      target: DEMO_DATA_TARGET,
    });
    await assertNoLinksInTree(seedDataRoot);
    await dependencies.repairDataPermissions(config, {
      dataRoot: seedDataRoot,
      databaseFile: path.join(seedDataRoot, "longtail-forge.db"),
      filesRoot: path.join(seedDataRoot, "files"),
      markerFile: path.join(seedDataRoot, DEMO_DATA_MARKER),
    });

    await fs.rename(paths.dataRoot, previousDataRoot);
    previousRetained = true;
    try {
      await fs.rename(seedDataRoot, paths.dataRoot);
    } catch (error) {
      await fs.rename(previousDataRoot, paths.dataRoot);
      previousRetained = false;
      throw error;
    }
    promoted = true;
    await dependencies.startServices(config, serviceState);
    servicesStopped = false;
    const runtimeIdentity = await dependencies.verifyRunning({ appVersion, config });
    await fs.rm(stageRoot, { recursive: true, force: false });
    return Object.freeze({
      status: action === "provision" ? "provisioned" : "reset",
      target: DEMO_DATA_TARGET,
      anchorDate,
      semanticFingerprint: verification.semanticFingerprint,
      counts: verification.counts,
      backup: Object.freeze({
        file: path.basename(backup.outputPath),
        sha256: backup.archiveSha256,
        backupId: backup.backupId,
      }),
      retainedPreviousState: path.basename(previousDataRoot),
      runtimeIdentity,
    });
  } catch (error) {
    if (promoted) {
      await dependencies.stopServices(config, serviceState, { bestEffort: true });
      try {
        await dependencies.assertServicesStopped(config, serviceState);
      } catch {
        throw new Error("Demo-data candidate verification failed but services could not be quiesced for prior-state recovery; keep traffic closed and recover from the retained backup.", { cause: error });
      }
      servicesStopped = true;
      if (await pathExists(paths.dataRoot)) await fs.rename(paths.dataRoot, failedDataRoot);
      if (previousRetained && await pathExists(previousDataRoot)) {
        await fs.rename(previousDataRoot, paths.dataRoot);
        previousRetained = false;
        await dependencies.repairDataPermissions(config, paths);
      }
    }
    if (servicesStopped) {
      try {
        await dependencies.startServices(config, serviceState, { recovery: true });
        servicesStopped = false;
      } catch {
        throw new Error("Demo-data operation failed and prior-service recovery also failed; keep traffic closed and recover from the retained backup.", { cause: error });
      }
    }
    if (await pathExists(failedDataRoot)) {
      try {
        await fs.rm(failedDataRoot, { recursive: true, force: false });
      } catch {
        // The prior installation is already active. Leave the exact failed-state
        // sibling for deliberate inspection; the next preflight refuses it.
      }
    }
    throw error;
  } finally {
    if (await pathExists(stageRoot)) {
      await fs.rm(stageRoot, { recursive: true, force: false });
    }
  }
}

function createHostDependencies() {
  return Object.freeze({
    captureServiceState,
    stopServices,
    assertServicesStopped,
    startServices,
    verifyRunning,
    repairDataPermissions,
    seedCandidate,
    async createBackup({ appEnvironment, appVersion, backupPath, paths }) {
      return await createBackup({
        appVersion,
        auditLogPath: path.join(paths.backupRoot, "backup-operations.jsonl"),
        confirmStopped: true,
        databaseFile: paths.databaseFile,
        filesRoot: paths.filesRoot,
        outputPath: backupPath,
        runtime: runtimeInventory(appEnvironment),
        secureNotesKeyBackupPath: paths.secureNotesKeyBackup,
      });
    },
    async inspectBackup({ appVersion, archivePath, secureNotesKeyBackupPath }) {
      return await inspectBackup({
        archivePath,
        expectedAppVersion: appVersion,
        secureNotesKeyBackupPath,
      });
    },
  });
}

function createDemoOperationId(dependencies = {}) {
  return dependencies.operationId ? dependencies.operationId() : createOpaqueId();
}

async function seedCandidate({
  anchorDate,
  releaseDir,
  roleCredentialsFile,
  seedDataRoot,
}) {
  const environment = minimalSeedEnvironment(roleCredentialsFile);
  const result = spawnSync(process.execPath, [
    "scripts/development-data.mjs",
    "seed",
    "--profile", DEMO_PROFILE,
    "--environment", "development",
    "--data-dir", seedDataRoot,
    "--anchor-date", anchorDate,
    "--role-fixtures", LOCAL_ROLE_FIXTURE_MODE,
    "--role-fixture-binding", RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target,
  ], {
    cwd: releaseDir,
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error("Fictional demo-data staging failed before activation.");
  }
  const jsonStart = String(result.stdout || "").indexOf("{");
  if (jsonStart < 0) throw new Error("Fictional demo-data staging returned no verification summary.");
  const parsed = JSON.parse(result.stdout.slice(jsonStart));
  if (!parsed.ok || parsed.profile !== DEMO_PROFILE || parsed.anchorDate !== anchorDate
    || parsed.workbench?.roleFixtureLoginCount !== SANITIZED_DEMO_ROLE_FIXTURES.length) {
    throw new Error("Fictional demo-data staging returned an unexpected contract.");
  }
  return parsed;
}

async function verifyDemoSeedCandidate({ databaseFile, filesRoot, expectedAnchorDate, expectedFingerprint }) {
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new Error("Candidate demo database failed SQLite integrity verification.");
    }
    if (database.pragma("foreign_key_check").length !== 0) {
      throw new Error("Candidate demo database failed foreign-key verification.");
    }
    const seedRun = database.prepare("SELECT contract_version, profile, anchor_date, semantic_fingerprint FROM development_data_seed_runs LIMIT 1").get();
    if (!seedRun || seedRun.contract_version !== "development-data-v2" || seedRun.profile !== DEMO_PROFILE
      || seedRun.anchor_date !== expectedAnchorDate || seedRun.semantic_fingerprint !== expectedFingerprint) {
      throw new Error("Candidate demo database seed identity does not match the requested operation.");
    }
    const counts = {};
    for (const table of ["workspaces", "users", "tasks", "notes", "lists", "files", "search_index", "sessions"]) {
      counts[table] = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    }
    if (counts.workspaces !== 5 || counts.users !== 24 || counts.tasks !== 400 || counts.notes !== 200
      || counts.lists !== 24 || counts.files !== 2 || counts.search_index < 600 || counts.sessions !== 0) {
      throw new Error("Candidate demo database does not match the rich fictional scenario counts.");
    }
    const searchBackendCount = Number(database.prepare("SELECT COUNT(*) AS count FROM search_index_fts").get().count);
    if (searchBackendCount !== counts.search_index) {
      throw new Error("Candidate demo Search backend does not match the canonical search index.");
    }
    const publicVisitorUserIds = verifyDemoRoleFixtureRows(database);
    const secureNotes = Number(database.prepare(`SELECT COUNT(*) AS count FROM notes
      WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL`).get().count);
    if (secureNotes !== 0) {
      throw new Error("Candidate demo database violates the Secure Notes exclusion.");
    }
    const fileRows = database.prepare("SELECT storage_key, extension, file_size_bytes, sha256_hash FROM files ORDER BY storage_key").all();
    for (const row of fileRows) {
      const objectPath = path.resolve(filesRoot, row.storage_key);
      if (!isInside(filesRoot, objectPath)) throw new Error("Candidate demo Files object escaped the Files root.");
      if (row.extension !== path.extname(row.storage_key).toLowerCase()) {
        throw new Error("Candidate demo Files extension metadata does not match its storage object.");
      }
      const bytes = await fs.readFile(objectPath);
      const hash = await sha256(bytes);
      if (bytes.length !== Number(row.file_size_bytes) || hash !== row.sha256_hash) {
        throw new Error("Candidate demo Files object failed size or checksum verification.");
      }
    }
    return Object.freeze({
      semanticFingerprint: seedRun.semantic_fingerprint,
      counts: Object.freeze(counts),
      publicVisitorUserIds,
    });
  } finally {
    database.close();
  }
}

async function writeDemoMarker(markerFile, metadata) {
  const payload = {
    contract: DEMO_DATA_CONTRACT,
    target: DEMO_DATA_TARGET,
    generatedAt: new Date().toISOString(),
    ...metadata,
  };
  await fs.writeFile(markerFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function readDemoMarker(markerFile, options = {}) {
  try {
    const marker = JSON.parse(await fs.readFile(markerFile, "utf8"));
    return marker;
  } catch (error) {
    if (options.optional && error?.code === "ENOENT") return null;
    if (error?.code === "ENOENT") throw new Error("Demo-data ownership marker is missing.");
    throw new Error("Demo-data ownership marker is unreadable or invalid.");
  }
}

async function assertNoUnexpectedDataEntries(dataRoot) {
  const entries = await fs.readdir(dataRoot);
  const unexpected = entries.filter((entry) => !LIVE_DATA_ENTRIES.has(entry));
  if (unexpected.length) {
    throw new Error("Runtime data root contains unrecognized state; refusing a partial or lossy replacement.");
  }
}

async function assertNoPartialDemoState(paths) {
  const parent = path.dirname(paths.dataRoot);
  const basename = path.basename(paths.dataRoot);
  const entries = await fs.readdir(parent);
  if (entries.some((entry) => entry.startsWith(".longtail-demo-") || entry.startsWith(`${basename}.demo-failed-`))) {
    throw new Error("A partial demo-data staging/failure directory exists; recover or remove it deliberately before retrying.");
  }
}

async function assertProtectedFile(filePath, options = {}) {
  const label = options.label || "protected file";
  const file = await fs.lstat(filePath);
  const parent = await fs.lstat(path.dirname(filePath));
  if (!file.isFile() || file.isSymbolicLink() || !parent.isDirectory() || parent.isSymbolicLink()) {
    throw new Error(`${label} and its parent must be real, non-symbolic-link paths.`);
  }
  if (options.requireRoot !== false && process.platform !== "win32") {
    const actualMode = file.mode & 0o777;
    if (
      file.uid !== 0
      || parent.uid !== 0
      || (file.mode & 0o022) !== 0
      || (parent.mode & 0o022) !== 0
      || (options.expectedMode !== undefined && actualMode !== options.expectedMode)
    ) {
      throw new Error(`${label} and its parent must be root-owned and not group- or other-writable.`);
    }
  }
}

function verifyDemoRoleFixtureRows(database) {
  const publicVisitorUserIds = [];
  const manifestRow = database.prepare(
    "SELECT scenario_manifest_json FROM development_data_seed_runs LIMIT 1",
  ).get();
  let manifest;
  try {
    manifest = JSON.parse(manifestRow?.scenario_manifest_json || "{}");
  } catch {
    throw new Error("Candidate demo role fixture manifest is invalid.");
  }
  if (
    manifest.personaLoginEnabled !== true
    || manifest.roleFixtureLoginCount !== SANITIZED_DEMO_ROLE_FIXTURES.length
  ) {
    throw new Error("Candidate demo role fixture manifest is incomplete.");
  }

  const activeUsers = database.prepare(`
SELECT user_id, username, password, password_change_required, protected_user
FROM users
WHERE user_status = 'active'
ORDER BY username;
`).all();
  const expectedUsernames = new Set(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => fixture.username));
  if (
    activeUsers.length !== SANITIZED_DEMO_ROLE_FIXTURES.length
    || activeUsers.some((user) => !expectedUsernames.has(user.username))
  ) {
    throw new Error("Candidate demo database must contain exactly the seven expected active role identities.");
  }

  for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
    const user = activeUsers.find((candidate) => candidate.username === fixture.username);
    if (
      !user
      || !String(user.password || "").startsWith("$argon2id$")
      || Number(user.password_change_required) !== 0
      || (user.protected_user === "yes") !== !fixture.publicVisitor
    ) {
      throw new Error("Candidate demo role identity or password-hash contract is invalid.");
    }
    if (fixture.publicVisitor) publicVisitorUserIds.push(user.user_id);
    const assignments = database.prepare(`
SELECT
  assignment.role_id,
  assignment.scope_type,
  assignment.scope_id,
  assignment.permission_overrides_json,
  workspace.name AS workspace_name,
  client.name AS client_name,
  project.name AS project_name
FROM user_role_assignments AS assignment
JOIN workspaces AS workspace ON workspace.workspace_id = assignment.workspace_id
LEFT JOIN clients AS client
  ON client.workspace_id = assignment.workspace_id
 AND client.id = assignment.scope_id
LEFT JOIN projects AS project
  ON project.workspace_id = assignment.workspace_id
 AND project.id = assignment.scope_id
WHERE assignment.user_id = ?
ORDER BY assignment.assignment_id;
`).all(user.user_id);
    if (
      assignments.length !== 1
      || assignments[0].role_id !== fixture.roleId
      || assignments[0].scope_type !== fixture.scopeType
      || assignments[0].permission_overrides_json !== null
      || !demoFixtureScopeMatches(fixture, assignments[0])
    ) {
      throw new Error("Candidate demo role assignment contains a wrong role, scope, duplicate, or override.");
    }
    if (fixture.roleId !== "super_admin") {
      const memberships = database.prepare(`
SELECT workspaces.name, user_workspaces.status
FROM user_workspaces
JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = ?;
`).all(user.user_id);
      if (
        memberships.length !== 1
        || memberships[0].name !== "Northwind Studio"
        || memberships[0].status !== "active"
      ) {
        throw new Error("Candidate demo role identity has an unexpected workspace membership.");
      }
    }
  }

  const inactivePersonas = database.prepare(`
SELECT username, password, user_status
FROM users
WHERE user_status != 'active';
`).all();
  if (
    inactivePersonas.length !== 17
    || inactivePersonas.some((user) => (
      user.user_status !== "inactive"
      || user.password !== "!development-persona-login-disabled!"
      || expectedUsernames.has(user.username)
    ))
  ) {
    throw new Error("Candidate demo database enabled or altered an ordinary fictional persona.");
  }

  const identities = database.prepare("SELECT username, alt_email FROM users").all();
  for (const identity of identities) {
    for (const value of [identity.username, identity.alt_email].filter(Boolean)) {
      const domain = String(value).split("@")[1]?.toLowerCase();
      if (!["example.com", "example.test", "longtailforge.local"].includes(domain)) {
        throw new Error("Candidate demo database contains a non-reserved identity domain.");
      }
    }
  }
  if (publicVisitorUserIds.length !== 6) {
    throw new Error("Candidate demo database must mark exactly six public visitor identities.");
  }
  return Object.freeze([...publicVisitorUserIds].sort());
}

function demoFixtureScopeMatches(fixture, assignment) {
  if (fixture.scopeKey === "all") {
    return assignment.scope_id === "all";
  }
  if (fixture.scopeKey === "northwind") {
    return assignment.workspace_name === "Northwind Studio";
  }
  if (fixture.scopeKey === "cedar") {
    return assignment.client_name === "Cedar & Bloom";
  }
  if (fixture.scopeKey === "website") {
    return assignment.project_name === "Website Refresh";
  }
  return false;
}

async function assertRealDirectory(targetPath, label) {
  const stats = await fs.lstat(targetPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
}

async function assertRealFile(targetPath, label) {
  const stats = await fs.lstat(targetPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a real file.`);
}

async function assertOwnedMode(targetPath, expectedUid, expectedGid, expectedMode, label) {
  const stats = await fs.stat(targetPath);
  const actualMode = stats.mode & 0o777;
  if (stats.uid !== expectedUid || stats.gid !== expectedGid || actualMode !== expectedMode) {
    throw new Error(`${label} ownership or mode does not match the reviewed installation contract.`);
  }
}

async function assertNoLinksInTree(root) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink()) throw new Error("Candidate demo data contains a symbolic link.");
    if (!stats.isDirectory()) continue;
    const entries = await fs.readdir(current);
    pending.push(...entries.map((entry) => path.join(current, entry)));
  }
}

async function captureServiceState(config) {
  return Object.freeze({
    app: serviceIsActive(config.appService),
    worker: config.workerService ? serviceIsActive(config.workerService) : false,
    edge: serviceIsActive(config.edgeService),
  });
}

async function stopServices(config, state, options = {}) {
  const stop = options.bestEffort ? runCommandBestEffort : runCommand;
  if (state.edge) stop("systemctl", ["stop", config.edgeService], "Unable to stop the demo edge service.");
  if (state.worker) stop("systemctl", ["stop", config.workerService], "Unable to stop the demo worker service.");
  if (state.app) stop("systemctl", ["stop", config.appService], "Unable to stop the demo application service.");
}

async function assertServicesStopped(config, state) {
  if ((state.edge && serviceIsActive(config.edgeService)) || (state.worker && serviceIsActive(config.workerService))
    || (state.app && serviceIsActive(config.appService))) {
    throw new Error("Demo application, worker, and edge services must be stopped before data replacement.");
  }
}

async function startServices(config, state) {
  if (state.app) runCommand("systemctl", ["start", config.appService], "Unable to start the demo application service.");
  if (state.worker) runCommand("systemctl", ["start", config.workerService], "Unable to start the demo worker service.");
  const readiness = await waitForJson("http://127.0.0.1:8001/readyz", 30);
  if (readiness.status !== "ready") throw new Error("The demo application direct readiness response was not ready.");
  if (state.edge) runCommand("systemctl", ["start", config.edgeService], "Unable to start the demo edge service.");
}

async function verifyRunning({ appVersion, config }) {
  const health = await fetchJson(`${config.publicUrl}/healthz`);
  const readiness = await fetchJson(`${config.publicUrl}/readyz`);
  const identity = await fetchJson(`${config.publicUrl}/api/app-info`);
  if (health.status !== "ok" || readiness.status !== "ready" || identity.canonicalVersion !== appVersion
    || identity.sourceBranch !== "nightly") {
    throw new Error("The activated demo installation failed health, readiness, or Nightly identity verification.");
  }
  return Object.freeze({
    canonicalVersion: identity.canonicalVersion,
    sourceBranch: identity.sourceBranch,
    commitSha: identity.commitSha,
    artifactSha256: identity.artifactSha256,
  });
}

async function repairDataPermissions(config, candidatePaths) {
  runCommand("chown", ["-R", "-h", `${config.appAccount}:${config.appGroup}`, candidatePaths.dataRoot], "Unable to apply demo data ownership.");
  await fs.chmod(candidatePaths.dataRoot, 0o700);
  await fs.chmod(candidatePaths.filesRoot, 0o700);
  await fs.chmod(candidatePaths.databaseFile, 0o600);
  if (candidatePaths.markerFile && await pathExists(candidatePaths.markerFile)) await fs.chmod(candidatePaths.markerFile, 0o600);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${candidatePaths.databaseFile}${suffix}`;
    if (await pathExists(sidecar)) await fs.chmod(sidecar, 0o600);
  }
}

function serviceIsActive(service) {
  const result = spawnSync("systemctl", ["is-active", "--quiet", service], { stdio: "ignore" });
  return result.status === 0;
}

function runCommand(command, args, errorMessage) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(errorMessage);
}

function runCommandBestEffort(command, args) {
  spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readNumericIdentity(name, kind) {
  const result = kind === "user"
    ? spawnSync("id", ["-u", name], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    : spawnSync("getent", ["group", name], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const output = String(result.stdout || "").trim();
  const value = Number.parseInt(kind === "user" ? output : output.split(":")[2], 10);
  if (result.status !== 0 || !Number.isInteger(value) || value < 0) {
    throw new Error("The configured demo service account or group could not be resolved.");
  }
  return value;
}

async function waitForJson(url, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("The demo application did not become ready in time.", { cause: lastError });
}

async function fetchJson(url) {
  const response = await globalThis.fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function minimalSeedEnvironment(roleCredentialsFile) {
  const environment = {
    LONGTAIL_ENV: "development",
    LONGTAIL_DATABASE_PROVIDER: "sqlite",
    LONGTAIL_FILE_SCANNER: "none",
    LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
    LONGTAIL_RELEASE_BRANCH: "",
    [ROLE_CREDENTIALS_FILE_ENV]: roleCredentialsFile,
    LONGTAIL_WORKER_MODE: "disabled",
    NODE_ENV: "development",
  };
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP"]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function runtimeInventory(environment) {
  return {
    environment: environment.LONGTAIL_ENV,
    scannerMode: environment.LONGTAIL_FILE_SCANNER,
    sqliteForeignKeys: String(environment.LONGTAIL_SQLITE_FOREIGN_KEYS || "true").toLowerCase() !== "false",
    sqliteJournalMode: environment.LONGTAIL_SQLITE_JOURNAL_MODE || "wal",
    workerMode: environment.LONGTAIL_WORKER_MODE || "inline",
  };
}

function redactDemoError(error, values = []) {
  let message = String(error?.message || error || "Demo-data operation failed.");
  for (const value of values.filter(Boolean).sort((a, b) => String(b).length - String(a).length)) {
    message = message.replaceAll(String(value), "[protected]");
  }
  return message;
}

function assertGeneratedSiblingPath(dataRoot, candidate) {
  const parent = path.dirname(path.resolve(dataRoot));
  const resolved = path.resolve(candidate);
  if (path.dirname(resolved) !== parent || resolved === path.resolve(dataRoot)) {
    throw new Error("Generated demo-data paths must be exact siblings of the runtime data root.");
  }
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function compactTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(bytes) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

export {
  DEFAULT_HELPER_ENV,
  DEFAULT_ROLE_CREDENTIALS_FILE,
  DEMO_DATA_CONTRACT,
  DEMO_DATA_HOSTNAME,
  DEMO_DATA_MARKER,
  DEMO_DATA_PUBLIC_URL,
  DEMO_DATA_TARGET,
  PROVISION_CONFIRMATION,
  PREFLIGHT_CONFIRMATION,
  RESET_CONFIRMATION,
  assertDemoHostSafety,
  assertDemoHostIdentity,
  assertDemoMarkerForAction,
  assertNoPartialDemoState,
  assertProtectedFile,
  createHostDependencies,
  createDemoOperationId,
  minimalSeedEnvironment,
  parseDemoDataArgs,
  parseDemoHelperConfig,
  prepareDemoHostContext,
  readDemoMarker,
  readProtectedEnvironmentFile,
  redactDemoError,
  resolveDemoPaths,
  runDemoDataOperation,
  verifyDemoSeedCandidate,
};
