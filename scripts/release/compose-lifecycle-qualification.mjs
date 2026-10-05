#!/usr/bin/env node
// Native Compose lifecycle qualification for a candidate image and the host helper together
// (0.33.33.50).
//
// The executable helper contract fakes Docker. This qualification does not: on a disposable native
// Linux host, as root, it runs the actual repaired helper and real `linux/amd64` images through the
// operations a preview performs:
// - a real previous-release baseline;
// - a backup-first upgrade;
// - automatic recovery from a failed candidate;
// - an explicit restored rollback;
// - a re-upgrade.
// Every step uses real database-and-Files data, with real backups that the candidate image inspects.
//
// Images come from `ghcr.io`, because the helper accepts only that registry. Two modes:
// - **`--hermetic`** qualifies an unpublished candidate. It points `ghcr.io` at a disposable TLS
//   registry, copies the real previous release into it byte for byte (its index digest is
//   preserved), and publishes the candidate there with the real publisher, so the candidate metadata
//   carries real attestations and native proof.
// - **Without `--hermetic`**, real GHCR serves both releases, and `--candidate-metadata` names the
//   published candidate.
//
// It needs native Linux, root through passwordless sudo, Docker, jq, flock, curl, openssl, and Caddy
// (plus skopeo in hermetic mode). It changes /etc/hosts, the system trust store, Docker's per-registry
// trust, and /var/backups/longtail-forge for the duration of the run, so run it only on a disposable
// machine.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const REPOSITORY = "ghcr.io/michaelyorkpa/longtail-forge";
const REGISTRY_IMAGE = "registry:2.8.3@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373";
const BACKUP_PARENT = "/var/backups/longtail-forge";
const BACKUP_ROOT = `${BACKUP_PARENT}/compose`;
const OWNERSHIP_MARKER = `${BACKUP_PARENT}/.ltf-lifecycle-qualification`;
const PREVIEW_ORIGIN = "https://preview.qualification.test";
const REGISTRY_ADDRESS = "127.0.0.2";
const EDGE_ADDRESS = "127.0.0.3";
const HOSTS_FILE = "/etc/hosts";
const HOSTS_BEGIN = "# ltf-lifecycle-qualification begin";
const HOSTS_END = "# ltf-lifecycle-qualification end";
const TRUST_ANCHOR = "/usr/local/share/ca-certificates/ltf-lifecycle-qualification.crt";
const DOCKER_REGISTRY_TRUST = "/etc/docker/certs.d/ghcr.io";
const DEPLOY_ACCOUNT = "ltf-qual-deploy";
const NETWORK = "longtail-forge-preview";
const SUBNET = "172.30.17.0/24";
const GATEWAY = "172.30.17.1";
const DATA_VOLUME = "longtail-forge-qualification-data";
const REGISTRY_CONTAINER = "ltf-qual-registry";
const BUILDER = "ltf-qual-builder";
const DEMO_ORIGIN = "https://demo.longtailforge.com";
const DEMO_NETWORK = "longtail-forge-public-demo-internal";
const DEMO_BRIDGE = "ltf-demo0";
const DEMO_SUBNET = "172.30.31.0/24";
const DEMO_GATEWAY = "172.30.31.1";
const DEMO_VOLUME = "longtail-forge-public-demo-data";
const DEMO_TARGET = "rt-ltf-demo";
const RESET_CONFIRMATION = "RESET RT-LTF-DEMO COMPOSE DATA";
const ISOLATION_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-isolation-host.example");
const RESET_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-host.example");
const REPAIRED_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-compose-deploy-host.example");
const ORIGINAL_HELPER = path.join(repoRoot, "tests/fixtures/compose-helper/v0.33.33-longtail-forge-compose-deploy-host.example");
const ADMIN_USERNAME = "qualification-admin@example.test";

/** @typedef {{ version: string, commitSha: string, artifact: { sha256: string }, image: { repository: string, digest: string, reference: string, platformManifest: { digest: string }, nativeDependency: { betterSqlite3Version: string, sqliteVersion: string } } }} ReleaseMetadata */
/** @typedef {{ metadata: ReleaseMetadata, path: string, label: string }} Release */
/** @typedef {{ status: number, stdout: string, stderr: string, seconds: number }} HelperRun */
/** @typedef {{ status: number, headers: Record<string, string | string[] | undefined>, body: Buffer }} HttpResult */
/** @typedef {{ profile: string, hermetic: boolean, artifact: string, commit: string, previousMetadata: string, candidateMetadata: string, evidence: string, caddy: string }} Options */

const options = parseOptions(process.argv.slice(2));
/** @type {Record<string, unknown>} */
const evidence = { startedAt: new Date().toISOString(), mode: options.hermetic ? "hermetic-registry" : "ghcr", steps: [] };
/** @type {(() => void)[]} */
const cleanups = [];
const adminPassword = `Qualify-${randomBytes(12).toString("hex")}-A1!`;

await main();

async function main() {
  assert.equal(process.platform, "linux", "the lifecycle qualification requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", "--preserve-env=PATH", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  assert.ok(["preview", "demo"].includes(options.profile), "--profile must be preview or demo");
  for (const command of ["bash", "jq", "flock", "curl", "openssl", "docker", options.caddy, ...(options.hermetic ? ["skopeo"] : [])]) {
    assert.equal(spawnSync("bash", ["-c", `command -v ${shellQuote(command)}`]).status, 0, `${command} is required`);
  }
  const server = docker(["version", "--format", "{{.Server.Os}}/{{.Server.Arch}} {{.Server.Version}}"]).trim();
  assert.match(server, /^linux\/amd64 /, `the Docker server must be native linux/amd64, not ${server}`);
  record("environment", {
    docker: server,
    compose: docker(["compose", "version", "--short"]).trim(),
    helperSha256: sha256File(REPAIRED_HELPER),
    originalHelperSha256: sha256File(ORIGINAL_HELPER),
  });
  if (fs.existsSync(BACKUP_PARENT) && !fs.existsSync(OWNERSHIP_MARKER)) {
    throw new Error(`${BACKUP_PARENT} already exists; refusing to run where real Longtail Forge backups may live.`);
  }

  const work = fs.mkdtempSync("/tmp/ltf-lifecycle-qualification-");
  fs.chmodSync(work, 0o755);
  cleanups.push(() => fs.rmSync(work, { recursive: true, force: true }));
  let failure = null;
  try {
    const tls = createTls(work);
    const previous = loadRelease(options.previousMetadata, "previous");
    const candidate = options.hermetic
      ? await publishHermeticCandidate(work, tls, previous)
      : (installEdgeHosts(), loadRelease(options.candidateMetadata, "candidate"));
    record("releases", { profile: options.profile, previous: identityOf(previous), candidate: identityOf(candidate) });
    if (options.profile === "demo") await runDemoLifecycle(work, tls, previous, candidate);
    else await runPreviewLifecycle(work, tls, previous, candidate);
  } catch (error) {
    failure = error;
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(`cleanup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    evidence.finishedAt = new Date().toISOString();
    evidence.outcome = failure ? "failed" : "passed";
    if (failure) evidence.failure = failure instanceof Error ? failure.stack || failure.message : String(failure);
    if (options.evidence) {
      fs.mkdirSync(options.evidence, { recursive: true });
      fs.writeFileSync(path.join(options.evidence, "lifecycle-qualification.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    }
  }
  if (failure) throw failure;
  console.log("\nNative Compose lifecycle qualification passed.");
}

// ---------------------------------------------------------------------------------------------
// Registry, trust, and candidate publication.
// ---------------------------------------------------------------------------------------------

/** @param {string} work */
function createTls(work) {
  const dir = path.join(work, "tls");
  fs.mkdirSync(dir, { mode: 0o755 });
  const ext = path.join(dir, "leaf.ext");
  fs.writeFileSync(ext, [
    "basicConstraints=CA:FALSE",
    "keyUsage=digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=DNS:ghcr.io,DNS:preview.qualification.test,DNS:demo.longtailforge.com",
    "",
  ].join("\n"));
  run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=Longtail Forge lifecycle qualification CA",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    "-keyout", path.join(dir, "ca.key"), "-out", path.join(dir, "ca.pem")]);
  run("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=ltf-lifecycle-qualification", "-keyout", path.join(dir, "leaf.key"), "-out", path.join(dir, "leaf.csr")]);
  run("openssl", ["x509", "-req", "-in", path.join(dir, "leaf.csr"), "-CA", path.join(dir, "ca.pem"), "-CAkey", path.join(dir, "ca.key"),
    "-CAcreateserial", "-days", "2", "-extfile", ext, "-out", path.join(dir, "leaf.pem")]);
  for (const name of ["leaf.key", "leaf.pem", "ca.pem"]) fs.chmodSync(path.join(dir, name), 0o644);
  fs.copyFileSync(path.join(dir, "ca.pem"), TRUST_ANCHOR);
  run("update-ca-certificates", []);
  cleanups.push(() => {
    fs.rmSync(TRUST_ANCHOR, { force: true });
    run("update-ca-certificates", ["--fresh"]);
  });
  return { dir, ca: fs.readFileSync(path.join(dir, "ca.pem")), caPath: path.join(dir, "ca.pem") };
}

/** @param {string[]} lines */
function writeHosts(lines) {
  const original = fs.readFileSync(HOSTS_FILE, "utf8");
  const cleaned = stripHosts(original);
  fs.writeFileSync(HOSTS_FILE, `${cleaned.trimEnd()}\n${HOSTS_BEGIN}\n${lines.join("\n")}\n${HOSTS_END}\n`);
  if (!cleanups.includes(restoreHosts)) cleanups.push(restoreHosts);
}

function restoreHosts() {
  fs.writeFileSync(HOSTS_FILE, `${stripHosts(fs.readFileSync(HOSTS_FILE, "utf8")).trimEnd()}\n`);
}

/** @param {string} text */
function stripHosts(text) {
  const begin = text.indexOf(HOSTS_BEGIN);
  if (begin < 0) return text;
  const end = text.indexOf(HOSTS_END, begin);
  return `${text.slice(0, begin)}${end < 0 ? "" : text.slice(end + HOSTS_END.length + 1)}`;
}

function installEdgeHosts() {
  writeHosts([`${EDGE_ADDRESS} preview.qualification.test demo.longtailforge.com`]);
}

/**
 * Point ghcr.io at a disposable TLS registry holding a byte-exact copy of the real previous release,
 * then publish the candidate there with the real publisher.
 * @param {string} work @param {{ dir: string, caPath: string }} tls @param {Release} previous
 * @returns {Promise<Release>}
 */
async function publishHermeticCandidate(work, tls, previous) {
  const ociLayout = path.join(work, "previous-oci");
  docker(["pull", REGISTRY_IMAGE]);
  run("skopeo", ["copy", "--all", "--preserve-digests", `docker://${previous.metadata.image.reference}`, `oci:${ociLayout}:previous`]);
  docker(["run", "--detach", "--name", REGISTRY_CONTAINER, "--publish", `${REGISTRY_ADDRESS}:443:5000`,
    "--volume", `${tls.dir}:/certs:ro`, "--env", "REGISTRY_HTTP_TLS_CERTIFICATE=/certs/leaf.pem", "--env", "REGISTRY_HTTP_TLS_KEY=/certs/leaf.key",
    REGISTRY_IMAGE]);
  cleanups.push(() => { spawnSync("docker", ["rm", "--force", REGISTRY_CONTAINER]); });
  fs.mkdirSync(DOCKER_REGISTRY_TRUST, { recursive: true });
  fs.copyFileSync(tls.caPath, path.join(DOCKER_REGISTRY_TRUST, "ca.crt"));
  cleanups.push(() => fs.rmSync(DOCKER_REGISTRY_TRUST, { recursive: true, force: true }));
  writeHosts([`${REGISTRY_ADDRESS} ghcr.io`, `${EDGE_ADDRESS} preview.qualification.test demo.longtailforge.com`]);
  await waitFor("the disposable registry", () => spawnSync("curl", ["--fail", "--silent", "https://ghcr.io/v2/"]).status === 0);

  run("skopeo", ["copy", "--all", "--preserve-digests", `oci:${ociLayout}:previous`, `docker://${REPOSITORY}:qualification-previous`]);
  const served = spawnSync("skopeo", ["inspect", "--raw", `docker://${previous.metadata.image.reference}`]);
  assert.equal(served.status, 0, String(served.stderr));
  assert.equal(`sha256:${createHash("sha256").update(served.stdout).digest("hex")}`, previous.metadata.image.digest,
    "the disposable registry must serve the previous release's exact index");
  record("hermetic-registry", { previousIndexServed: previous.metadata.image.digest, registryImage: REGISTRY_IMAGE });

  const buildkitd = path.join(work, "buildkitd.toml");
  fs.writeFileSync(buildkitd, `[registry."ghcr.io"]\n  ca = [${JSON.stringify(tls.caPath)}]\n`);
  spawnSync("docker", ["buildx", "rm", "--force", BUILDER]);
  const create = (/** @type {string} */ configFlag) => spawnSync("docker", ["buildx", "create", "--name", BUILDER, "--driver", "docker-container",
    "--driver-opt", "network=host", configFlag, buildkitd, "--bootstrap", "--use"], { encoding: "utf8" });
  // Newer buildx names the BuildKit daemon configuration `--buildkitd-config`; older releases call it `--config`.
  const created = create("--buildkitd-config");
  if (created.status !== 0) {
    spawnSync("docker", ["buildx", "rm", "--force", BUILDER]);
    const retried = create("--config");
    assert.equal(retried.status, 0, `buildx builder creation failed:\n${created.stderr}\n${retried.stderr}`);
  }
  cleanups.push(() => { spawnSync("docker", ["buildx", "rm", "--force", BUILDER]); });

  const base = path.join(work, "release-metadata-base.json");
  const output = path.join(work, "release-metadata-candidate.json");
  run(process.execPath, ["scripts/release/create-release-metadata.mjs", "--artifact", options.artifact, "--commit", options.commit,
    "--channel", "main", "--source-branch", "main", "--output", base], { cwd: repoRoot });
  run(process.execPath, ["scripts/release/published-container-image.mjs", "publish",
    "--artifact", options.artifact,
    "--release-metadata", base,
    "--repository", REPOSITORY,
    "--output-metadata", output,
    "--output-platform-manifest", path.join(work, "platform-manifest-candidate.json"),
    "--output-build-metadata", path.join(work, "buildx-metadata-candidate.json"),
  ], { cwd: repoRoot });
  run(process.execPath, ["scripts/release/published-container-image.mjs", "verify", "--metadata", output, "--expected-commit", options.commit], { cwd: repoRoot });
  if (options.evidence) {
    fs.mkdirSync(options.evidence, { recursive: true });
    fs.copyFileSync(output, path.join(options.evidence, "candidate-release-metadata.json"));
  }
  return loadRelease(output, "candidate");
}

/**
 * A derived image that passes every pre-curtain check (same labels, driver, and scanner reach) but
 * never becomes healthy, published to the disposable registry, with metadata for its own digest.
 * @param {string} work @param {Release} candidate
 * @returns {Release}
 */
function publishFailingCandidate(work, candidate) {
  const context = path.join(work, "failing-candidate");
  fs.mkdirSync(context);
  fs.writeFileSync(path.join(context, "Dockerfile"), `FROM ${candidate.metadata.image.reference}\nCMD ["node", "-e", "setTimeout(() => process.exit(70), 1000)"]\n`);
  const tag = `${REPOSITORY}:qualification-failing-candidate`;
  docker(["build", "--platform", "linux/amd64", "--tag", tag, context]);
  docker(["push", tag]);
  const repoDigest = docker(["image", "inspect", "--format", "{{range .RepoDigests}}{{println .}}{{end}}", tag]).split("\n").find((entry) => entry.startsWith(`${REPOSITORY}@`));
  assert.ok(repoDigest, "the failing candidate must carry a registry digest");
  const digest = repoDigest.slice(REPOSITORY.length + 1);
  const metadata = /** @type {ReleaseMetadata} */ (structuredClone(candidate.metadata));
  metadata.image.digest = digest;
  metadata.image.reference = `${REPOSITORY}@${digest}`;
  metadata.image.platformManifest.digest = digest;
  const filePath = path.join(work, "release-metadata-failing.json");
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  return { metadata, path: filePath, label: "failing-candidate" };
}

// ---------------------------------------------------------------------------------------------
// The preview lifecycle.
// ---------------------------------------------------------------------------------------------

/**
 * @param {string} work @param {{ dir: string, ca: Buffer, caPath: string }} tls
 * @param {Release} previous @param {Release} candidate
 */
async function runPreviewLifecycle(work, tls, previous, candidate) {
  const host = prepareHost(work);
  startScanner(work, GATEWAY);
  startEdge(work, tls, host.maintenanceRoot, PREVIEW_ORIGIN);

  // The known-good baseline the initial cutover records, with representative data and Files.
  bootstrapBaseline(host, previous);
  await waitHealthy(host, previous);
  const api = createApiClient(tls.ca, PREVIEW_ORIGIN);
  await api.expectIdentity(previous);
  const cookie = await api.login();
  const baseline = await api.createList(cookie, "Qualification baseline list");
  const file = await api.uploadFile(cookie, baseline.listId, "qualification-baseline.txt", `baseline file ${randomBytes(6).toString("hex")}`);
  record("baseline", { release: identityOf(previous), runtime: runtimeProbe(host), listId: baseline.listId, fileId: file.fileId });

  // Backup-first upgrade with the actual repaired helper.
  const upgrade = runHelper(host, REPAIRED_HELPER, "deploy", candidate);
  assert.equal(upgrade.status, 0, `upgrade failed:\n${upgrade.stderr}`);
  assert.match(upgrade.stdout, /"ok":true,"mode":"deploy"/);
  await api.expectIdentity(candidate);
  const upgraded = runtimeProbe(host);
  assert.equal(upgraded.image, candidate.metadata.image.reference);
  assert.equal(`${upgraded.driver}:${upgraded.sqlite}`, `${candidate.metadata.image.nativeDependency.betterSqlite3Version}:${candidate.metadata.image.nativeDependency.sqliteVersion}`);
  assert.deepEqual(upgraded.packageManagers, [], "the candidate runtime must ship no package manager");
  assert.deepEqual(upgraded.archiveTools, ["tar", "gzip"], "the candidate runtime must keep tar and gzip");
  await api.expectList(await api.login(), baseline.listId, 200);
  await api.expectFile(await api.login(), file);
  // Archives are bound to the application version that wrote them, and the helper restores each with
  // its own release, so the prior release inspects the backup it took before the upgrade.
  const preUpgradeBackup = latestBackup("pre-upgrade-");
  const inspected = inspectBackup(previous, preUpgradeBackup);
  assert.equal(inspected.status, "verified");
  assert.equal(inspected.restorable, true);
  assert.equal(inspected.manifest?.appVersion, previous.metadata.version, "the prior release must have backed itself up before the upgrade");
  assert.ok((inspected.manifest?.storage?.localObjectCount ?? 0) >= 1, "the backup must hold the Files tree");
  record("upgrade", { seconds: upgrade.seconds, helper: lastJsonLine(upgrade.stdout), runtime: upgraded, backup: summarizeBackup(preUpgradeBackup, inspected) });
  const postUpgrade = await api.createList(await api.login(), "Qualification post-upgrade list");

  // Automatic recovery from a candidate that passes every pre-curtain check but never becomes healthy.
  if (options.hermetic) {
    const failing = publishFailingCandidate(work, candidate);
    const failed = runHelper(host, REPAIRED_HELPER, "deploy", failing);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /candidate failed; prior release and data were restored and verified/);
    assert.equal(fs.existsSync(host.marker), false, "a verified recovery must clear the deployment marker");
    await api.expectIdentity(candidate);
    assert.equal(runtimeProbe(host).image, candidate.metadata.image.reference);
    const recoveredCookie = await api.login();
    await api.expectList(recoveredCookie, baseline.listId, 200);
    await api.expectList(recoveredCookie, postUpgrade.listId, 200);
    await api.expectFile(recoveredCookie, file);
    assert.equal(readState(host, "current.json").commitSha, candidate.metadata.commitSha, "a failed deployment must not record the failing digest");
    record("failed-candidate-recovery", { seconds: failed.seconds, refusal: lastLine(failed.stderr), failingDigest: failing.metadata.image.digest });
  } else {
    record("failed-candidate-recovery", { skipped: "real GHCR mode cannot publish a deliberately failing digest; the hermetic run and the executable helper contract cover it" });
  }

  // Explicit restored rollback to the previous release.
  const rollback = runHelper(host, REPAIRED_HELPER, "rollback", previous);
  assert.equal(rollback.status, 0, `rollback failed:\n${rollback.stderr}`);
  assert.match(rollback.stdout, /"ok":true,"mode":"rollback"/);
  await api.expectIdentity(previous);
  const rolledBack = runtimeProbe(host);
  assert.equal(rolledBack.image, previous.metadata.image.reference);
  const rollbackCookie = await api.login();
  await api.expectList(rollbackCookie, baseline.listId, 200);
  await api.expectList(rollbackCookie, postUpgrade.listId, 404);
  await api.expectFile(rollbackCookie, file);
  assert.equal(readState(host, "current.json").commitSha, previous.metadata.commitSha);
  assert.equal(readState(host, "previous.json").commitSha, candidate.metadata.commitSha);
  // The pre-rollback backup was written by the candidate release, so the candidate inspects it.
  const preRollbackBackup = latestBackup("pre-rollback-");
  record("explicit-rollback", { seconds: rollback.seconds, helper: lastJsonLine(rollback.stdout), runtime: rolledBack, backup: summarizeBackup(preRollbackBackup, inspectBackup(candidate, preRollbackBackup)) });

  // The published v0.33.33 helper still refuses this candidate, against real images.
  const markerBefore = fs.existsSync(host.marker);
  const original = runHelper(host, ORIGINAL_HELPER, "deploy", candidate);
  assert.notEqual(original.status, 0);
  assert.match(original.stderr, /native better-sqlite3 proof is missing/);
  assert.equal(fs.existsSync(host.marker), markerBefore);
  assert.equal(runtimeProbe(host).image, previous.metadata.image.reference);
  record("original-helper-refusal", { refusal: lastLine(original.stderr) });

  // Upgrade again after the rollback.
  const reupgrade = runHelper(host, REPAIRED_HELPER, "deploy", candidate);
  assert.equal(reupgrade.status, 0, `re-upgrade failed:\n${reupgrade.stderr}`);
  await api.expectIdentity(candidate);
  const finalCookie = await api.login();
  await api.expectList(finalCookie, baseline.listId, 200);
  await api.expectList(finalCookie, postUpgrade.listId, 404);
  await api.expectFile(finalCookie, file);
  record("re-upgrade", { seconds: reupgrade.seconds, runtime: runtimeProbe(host) });
}

/** @typedef {{ root: string, helperEnv: string, composeDir: string, composeFile: string, hostEnv: string, deployRoot: string, inbox: string, stateRoot: string, releaseRoot: string, maintenanceRoot: string, marker: string }} Host */

/** @param {string} work @returns {Host} */
function prepareHost(work) {
  fs.mkdirSync(BACKUP_PARENT, { recursive: true, mode: 0o700 });
  fs.writeFileSync(OWNERSHIP_MARKER, "created by scripts/release/compose-lifecycle-qualification.mjs\n");
  cleanups.push(() => { if (fs.existsSync(OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true }); });
  // The protected Compose backup root as the initial cutover leaves it: owner-only for UID/GID 10001.
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  fs.chownSync(BACKUP_ROOT, 10001, 10001);
  fs.chmodSync(BACKUP_ROOT, 0o700);
  if (spawnSync("id", [DEPLOY_ACCOUNT]).status !== 0) {
    run("useradd", ["--system", "--user-group", "--no-create-home", "--shell", "/usr/sbin/nologin", DEPLOY_ACCOUNT]);
    cleanups.push(() => { spawnSync("userdel", [DEPLOY_ACCOUNT]); });
  }
  docker(["network", "create", "--driver", "bridge", "--subnet", SUBNET, "--gateway", GATEWAY, NETWORK]);
  cleanups.push(() => { spawnSync("docker", ["network", "rm", NETWORK]); });

  const root = path.join(work, "host");
  const etc = path.join(root, "etc");
  const composeDir = path.join(root, "compose");
  const deployRoot = path.join(root, "deploy");
  const maintenanceRoot = path.join(root, "maintenance");
  for (const [dir, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [etc, 0o755], [composeDir, 0o755], [deployRoot, 0o711], [path.join(deployRoot, "state"), 0o700],
    [path.join(deployRoot, "releases"), 0o700], [path.join(deployRoot, "operations"), 0o700], [maintenanceRoot, 0o711],
    [path.join(maintenanceRoot, "deployment"), 0o711], [path.join(maintenanceRoot, "operator"), 0o2775], [path.join(root, "secrets"), 0o700],
  ])) {
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, mode);
  }
  const inbox = path.join(deployRoot, "inbox");
  fs.mkdirSync(inbox, { mode: 0o700 });
  run("chown", [`${DEPLOY_ACCOUNT}:${DEPLOY_ACCOUNT}`, inbox]);
  fs.copyFileSync(path.join(repoRoot, "compose.yaml"), path.join(composeDir, "compose.yaml"));
  const appEnv = path.join(etc, "longtail-forge.env");
  writePrivate(appEnv, [
    "LONGTAIL_ENV=production",
    "DEMO_MODE=false",
    `LONGTAIL_PUBLIC_URL=${PREVIEW_ORIGIN}`,
    "LONGTAIL_SESSION_COOKIE_SECURE=true",
    "LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
    "LONGTAIL_AUTH_THROTTLE_ENABLED=true",
    "LONGTAIL_LOG_LEVEL=info",
    "LONGTAIL_DATABASE_PROVIDER=sqlite",
    "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
    "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
    "LONGTAIL_STORAGE_PROVIDER=local",
    "LONGTAIL_WORKER_MODE=inline",
    `SUPER_ADMIN_USERNAME=${ADMIN_USERNAME}`,
    `SUPER_ADMIN_PASSWORD=${adminPassword}`,
    `LONGTAIL_SECURE_NOTES_MASTER_KEY=${randomBytes(32).toString("hex")}`,
    "",
  ].join("\n"));
  const hostEnv = path.join(etc, "compose-host.env");
  writePrivate(hostEnv, [
    `LONGTAIL_ENV_FILE=${appEnv}`,
    `LONGTAIL_BACKUP_DIR=${BACKUP_ROOT}`,
    `LONGTAIL_DATA_VOLUME=${DATA_VOLUME}`,
    `LONGTAIL_DOCKER_NETWORK=${NETWORK}`,
    `LONGTAIL_DOCKER_TRUST_PROXY=${GATEWAY}/32`,
    `LONGTAIL_CLAMD_HOST=${GATEWAY}`,
    "LONGTAIL_CLAMD_PORT=3310",
    "LONGTAIL_FILE_SCANNER=clamd",
    "",
  ].join("\n"));
  const keyBackup = path.join(root, "secrets", "secure-notes-key.backup");
  writePrivate(keyBackup, `${randomBytes(48).toString("base64")}\n`);
  const helperEnv = path.join(etc, "compose-deploy-helper.env");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${composeDir}`,
    `LTF_COMPOSE_HOST_ENV=${hostEnv}`,
    `LTF_DEPLOY_ACCOUNT=${DEPLOY_ACCOUNT}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    `LTF_IMAGE_REPOSITORY=${REPOSITORY}`,
    `LTF_MAINTENANCE_STATE_ROOT=${maintenanceRoot}`,
    `LTF_PUBLIC_URL=${PREVIEW_ORIGIN}`,
    `LTF_SECURE_KEY_BACKUP=${keyBackup}`,
    "",
  ].join("\n"));
  cleanups.push(() => {
    spawnSync("docker", ["compose", "--project-directory", composeDir, "--file", path.join(composeDir, "compose.yaml"), "--env-file", hostEnv, "down", "--volumes", "--remove-orphans"], { env: { ...process.env, LONGTAIL_IMAGE: "unused" } });
    spawnSync("docker", ["volume", "rm", "--force", DATA_VOLUME]);
  });
  return {
    root, helperEnv, composeDir, composeFile: path.join(composeDir, "compose.yaml"), hostEnv, deployRoot, inbox,
    stateRoot: path.join(deployRoot, "state"), releaseRoot: path.join(deployRoot, "releases"),
    maintenanceRoot, marker: path.join(maintenanceRoot, "deployment", "maintenance.on"),
  };
}

/** @param {string} work @param {string} gateway */
function startScanner(work, gateway) {
  const script = path.join(work, `clamd-stub-${gateway}.mjs`);
  fs.writeFileSync(script, [
    "import net from 'node:net';",
    "net.createServer((socket) => {",
    "  let buffer = Buffer.alloc(0); let scanning = false;",
    "  socket.on('error', () => {});",
    "  socket.on('data', (chunk) => {",
    "    buffer = Buffer.concat([buffer, chunk]);",
    "    if (!scanning && buffer.subarray(0, 6).toString() === 'zPING\\0') { socket.end('PONG\\0'); return; }",
    "    if (!scanning && buffer.length >= 10 && buffer.subarray(0, 10).toString() === 'zINSTREAM\\0') { scanning = true; buffer = buffer.subarray(10); }",
    "    while (scanning && buffer.length >= 4) { const size = buffer.readUInt32BE(0); if (size === 0) { socket.end('stream: OK\\0'); return; } if (buffer.length < 4 + size) return; buffer = buffer.subarray(4 + size); }",
    "  });",
    `}).listen(3310, ${JSON.stringify(gateway)});`,
    "",
  ].join("\n"));
  const scanner = spawn(process.execPath, [script], { stdio: "ignore" });
  cleanups.push(() => { scanner.kill("SIGTERM"); });
}

/** @param {string} work @param {{ dir: string }} tls @param {string} maintenanceRoot @param {string} origin */
function startEdge(work, tls, maintenanceRoot, origin) {
  const caddyfile = path.join(work, "Caddyfile");
  const site = (/** @type {string} */ origin) => `${origin} {
  bind ${EDGE_ADDRESS}
  tls ${path.join(tls.dir, "leaf.pem")} ${path.join(tls.dir, "leaf.key")}
  @diagnostics path /healthz /readyz /api/app-info
  handle @diagnostics {
    reverse_proxy 127.0.0.1:8001
  }
  @curtain file {
    root ${maintenanceRoot}
    try_files /operator/maintenance.on /deployment/maintenance.on
  }
  handle @curtain {
    respond "maintenance" 503
  }
  handle {
    reverse_proxy 127.0.0.1:8001
  }
}
`;
  fs.writeFileSync(caddyfile, `{\n  admin off\n  auto_https disable_redirects\n  skip_install_trust\n}\n\n${site(origin)}`);
  run(options.caddy, ["validate", "--config", caddyfile, "--adapter", "caddyfile"]);
  const edge = spawn(options.caddy, ["run", "--config", caddyfile, "--adapter", "caddyfile"], { stdio: "ignore" });
  cleanups.push(() => { edge.kill("SIGTERM"); });
}

/** @param {Host} host @param {Release} release */
function bootstrapBaseline(host, release) {
  docker(["pull", "--platform", "linux/amd64", release.metadata.image.reference]);
  const key = release.metadata.image.digest.slice("sha256:".length);
  const releaseEnv = path.join(host.releaseRoot, `${key}.env`);
  writePrivate(releaseEnv, [
    `LONGTAIL_IMAGE=${release.metadata.image.reference}`,
    "LONGTAIL_RELEASE_BRANCH=main",
    `LONGTAIL_RELEASE_COMMIT=${release.metadata.commitSha}`,
    `LONGTAIL_RELEASE_ARTIFACT_SHA256=${release.metadata.artifact.sha256}`,
    "",
  ].join("\n"));
  writePrivate(path.join(host.releaseRoot, `${key}.json`), JSON.stringify(release.metadata));
  writePrivate(path.join(host.stateRoot, "current.json"), JSON.stringify({ ...release.metadata, deployment: { releaseEnv, rollbackBackup: "" } }));
  docker(["compose", "--project-directory", host.composeDir, "--file", host.composeFile, "--env-file", host.hostEnv, "--env-file", releaseEnv,
    "up", "--detach", "--no-deps", "longtail-forge"]);
}

/** @param {Host} host @param {Release} release */
async function waitHealthy(host, release) {
  await waitFor(`${release.label} health`, () => {
    const container = composeContainer(host);
    return Boolean(container) && docker(["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{end}}", container]).trim() === "healthy";
  }, 120_000);
}

/** @param {Host} host */
function composeContainer(host) {
  const result = spawnSync("docker", ["ps", "--quiet", "--filter", "label=com.docker.compose.project=longtail-forge", "--filter", "label=com.docker.compose.service=longtail-forge"], { encoding: "utf8" });
  void host;
  return String(result.stdout || "").trim().split("\n")[0] || "";
}

/**
 * @param {Host} host @param {string} helper @param {"deploy" | "rollback"} mode @param {Release} release
 * @returns {HelperRun}
 */
function runHelper(host, helper, mode, release) {
  const staged = path.join(host.inbox, "release-metadata.json");
  fs.copyFileSync(release.path, staged);
  run("chown", [`${DEPLOY_ACCOUNT}:${DEPLOY_ACCOUNT}`, staged]);
  fs.chmodSync(staged, 0o600);
  const started = Date.now();
  const metadata = release.metadata;
  const result = spawnSync("bash", [helper, mode,
    "--metadata", "release-metadata.json",
    "--expected-version", metadata.version,
    "--expected-source-branch", "main",
    "--expected-commit", metadata.commitSha,
    "--expected-artifact-sha256", metadata.artifact.sha256,
    "--expected-image-digest", metadata.image.digest,
    "--expected-platform-manifest-digest", metadata.image.platformManifest.digest,
  ], {
    encoding: "utf8",
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/root", LANG: "C.UTF-8", LTF_COMPOSE_HELPER_ENV: host.helperEnv },
    timeout: 900_000,
  });
  const outcome = { status: result.status ?? 1, stdout: String(result.stdout || ""), stderr: String(result.stderr || ""), seconds: Math.round((Date.now() - started) / 100) / 10 };
  console.log(`[helper ${mode} ${release.label}] exit ${outcome.status} in ${outcome.seconds}s${outcome.status === 0 ? "" : `: ${lastLine(outcome.stderr)}`}`);
  return outcome;
}

/** @param {Host} host */
function runtimeProbe(host) {
  const container = composeContainer(host);
  assert.ok(container, "the application container must be running");
  const image = docker(["inspect", "--format", "{{.Config.Image}}", container]).trim();
  const native = /** @type {{ driver: string, sqlite: string }} */ (JSON.parse(docker(["exec", container, "node", "-e",
    "const Database=require('better-sqlite3');const db=new Database(':memory:');const sqlite=db.prepare('SELECT sqlite_version() AS v').get().v;db.close();process.stdout.write(JSON.stringify({driver:require('better-sqlite3/package.json').version,sqlite}))"])));
  const tools = docker(["exec", container, "sh", "-c", "for tool in npm npx corepack yarn yarnpkg tar gzip; do if command -v \"$tool\" >/dev/null 2>&1; then echo \"$tool\"; fi; done"]).split("\n").filter(Boolean);
  return {
    image,
    driver: native.driver,
    sqlite: native.sqlite,
    packageManagers: tools.filter((tool) => !["tar", "gzip"].includes(tool)),
    archiveTools: tools.filter((tool) => ["tar", "gzip"].includes(tool)),
  };
}

/** @param {string} prefix */
function latestBackup(prefix) {
  // Each archive sits beside a `.sha256` checksum sidecar; select the archive itself.
  const names = fs.readdirSync(BACKUP_ROOT).filter((name) => name.startsWith(prefix) && name.endsWith(".ltfbackup.tgz")).sort();
  const name = names.at(-1);
  assert.ok(name, `no ${prefix} backup was created`);
  return path.join(BACKUP_ROOT, name);
}

/**
 * Inspect a protected backup with a release image, read-only and without network.
 * @param {Release} release @param {string} archive
 * @returns {{ status?: string, restorable?: boolean, manifest?: { appVersion?: string, storage?: { localObjectCount?: number } } }}
 */
function inspectBackup(release, archive) {
  const output = docker(["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,size=256m,mode=1777", "--user", "10001:10001",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--volume", `${BACKUP_ROOT}:/var/backups/longtail-forge:ro`, "--entrypoint", "node", release.metadata.image.reference,
    "scripts/backup.mjs", "inspect", "--archive", `/var/backups/longtail-forge/${path.basename(archive)}`]);
  return /** @type {{ status?: string, restorable?: boolean, manifest?: { appVersion?: string, storage?: { localObjectCount?: number } } }} */ (JSON.parse(output));
}

/** @param {string} archive @param {ReturnType<typeof inspectBackup>} inspected */
function summarizeBackup(archive, inspected) {
  return {
    name: path.basename(archive),
    bytes: fs.statSync(archive).size,
    sha256: sha256File(archive),
    status: inspected.status,
    restorable: inspected.restorable,
    appVersion: inspected.manifest?.appVersion,
    localObjectCount: inspected.manifest?.storage?.localObjectCount,
  };
}

/** @param {Host} host @param {string} name @returns {{ commitSha?: string }} */
function readState(host, name) {
  return /** @type {{ commitSha?: string }} */ (JSON.parse(fs.readFileSync(path.join(host.stateRoot, name), "utf8")));
}

// ---------------------------------------------------------------------------------------------
// Public-origin API client (HTTPS through the edge, trusting only the disposable CA).
// ---------------------------------------------------------------------------------------------

/** @param {Buffer} ca @param {string} origin */
function createApiClient(ca, origin) {
  const hostname = new URL(origin).hostname;
  /**
   * @param {string} pathname @param {{ method?: string, body?: Buffer | string, cookie?: string, headers?: Record<string, string> }} [request]
   * @returns {Promise<HttpResult>}
   */
  const send = (pathname, request = {}) => new Promise((resolve, reject) => {
    const outgoing = https.request({
      host: EDGE_ADDRESS, port: 443, servername: hostname, path: pathname, method: request.method || "GET", ca,
      headers: {
        Host: hostname,
        Origin: origin,
        Accept: "application/json",
        ...(request.cookie ? { Cookie: request.cookie } : {}),
        ...(request.body ? { "Content-Length": String(Buffer.byteLength(request.body)) } : {}),
        ...request.headers,
      },
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      response.once("error", reject);
    });
    outgoing.once("error", reject);
    if (request.body) outgoing.write(request.body);
    outgoing.end();
  });
  /** @param {HttpResult} result @returns {unknown} */
  const json = (result) => JSON.parse(result.body.toString("utf8") || "null");
  return {
    /** @param {Release} release */
    async expectIdentity(release) {
      for (const route of ["/healthz", "/readyz"]) {
        assert.equal((await send(route)).status, 200, `${route} must be ready`);
      }
      const info = /** @type {{ canonicalVersion?: string, commitSha?: string, artifactSha256?: string, sourceBranch?: string }} */ (json(await send("/api/app-info")));
      assert.equal(info.canonicalVersion, release.metadata.version);
      assert.equal(info.commitSha, release.metadata.commitSha);
      assert.equal(info.artifactSha256, release.metadata.artifact.sha256);
      assert.equal(info.sourceBranch, "main");
    },
    async login() {
      const body = JSON.stringify({ username: ADMIN_USERNAME, password: adminPassword });
      const result = await send("/api/login", { method: "POST", body, headers: { "Content-Type": "application/json" } });
      assert.equal(result.status, 200, result.body.toString("utf8"));
      const cookies = [result.headers["set-cookie"] ?? []].flat();
      const session = cookies.map((value) => String(value).split(";", 1)[0]).find((value) => value.startsWith("longtail_forge_session="));
      assert.ok(session, "login must set the session cookie");
      return session;
    },
    /** @param {string} cookie @param {string} title */
    async createList(cookie, title) {
      const result = await send("/api/lists", { method: "POST", cookie, body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } });
      assert.equal(result.status, 201, result.body.toString("utf8"));
      const created = /** @type {{ list: { list_id: string } }} */ (json(result));
      return { listId: String(created.list.list_id), title };
    },
    /** @param {string} cookie @param {string} listId @param {number} expected */
    async expectList(cookie, listId, expected) {
      assert.equal((await send(`/api/lists/${listId}`, { cookie })).status, expected, `list ${listId} must answer ${expected}`);
    },
    /** @param {string} cookie @param {string} listId @param {string} name @param {string} text */
    async uploadFile(cookie, listId, name, text) {
      const boundary = `----ltf-qualification-${randomBytes(8).toString("hex")}`;
      const parts = [["moduleId", "lists"], ["targetType", "list"], ["targetId", listId], ["visibility", "private"], ["displayName", name]]
        .map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join("");
      const body = Buffer.concat([
        Buffer.from(`${parts}--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\n`),
        Buffer.from(text),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const result = await send("/api/files/upload", { method: "POST", cookie, body, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } });
      assert.equal(result.status, 201, result.body.toString("utf8"));
      const uploaded = /** @type {{ file: { fileId: string } }} */ (json(result));
      const fileId = String(uploaded.file.fileId);
      await waitFor("the uploaded file to pass scanning", async () => {
        const status = /** @type {{ file?: { status?: string } } | null} */ (json(await send(`/api/files/${fileId}`, { cookie })));
        return status?.file?.status === "available";
      });
      return { fileId, text };
    },
    /** @param {string} cookie @param {{ fileId: string, text: string }} file */
    async expectFile(cookie, file) {
      const download = await send(`/api/files/${file.fileId}/download`, { cookie, headers: { Accept: "*/*" } });
      assert.equal(download.status, 200, `file ${file.fileId} must download`);
      assert.equal(download.body.toString("utf8"), file.text);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Utilities.
// ---------------------------------------------------------------------------------------------

/** @param {string} filePath @param {string} label @returns {Release} */
function loadRelease(filePath, label) {
  const metadata = /** @type {ReleaseMetadata} */ (JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8")));
  return { metadata, path: path.resolve(repoRoot, filePath), label };
}

/** @param {Release} release */
function identityOf(release) {
  const { metadata } = release;
  return {
    version: metadata.version,
    commitSha: metadata.commitSha,
    artifactSha256: metadata.artifact.sha256,
    imageIndex: metadata.image.digest,
    platformManifest: metadata.image.platformManifest.digest,
    nativeProfile: `${metadata.image.nativeDependency.betterSqlite3Version}:${metadata.image.nativeDependency.sqliteVersion}`,
  };
}

/** @param {string} step @param {Record<string, unknown>} details */
function record(step, details) {
  /** @type {Record<string, unknown>[]} */ (evidence.steps).push({ step, at: new Date().toISOString(), ...details });
  console.log(`[qualification] ${step}: ${JSON.stringify(details)}`);
}

/** @param {string[]} args @returns {string} */
function docker(args) {
  return run("docker", args);
}

/** @param {string} command @param {string[]} args @param {{ cwd?: string }} [settings] @returns {string} */
function run(command, args, settings = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: settings.cwd, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${String(result.stderr || result.stdout || result.error || "").trim()}`);
  }
  return String(result.stdout || "");
}

/** @param {string} label @param {() => boolean | Promise<boolean>} predicate @param {number} [timeout] */
async function waitFor(label, predicate, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** @param {string} filePath @param {string} content */
function writePrivate(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o600);
}

/** @param {string} filePath */
function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** @param {string} text */
function lastLine(text) {
  return text.trim().split("\n").at(-1) ?? "";
}

/** @param {string} text */
function lastJsonLine(text) {
  return text.trim().split("\n").reverse().find((line) => line.trim().startsWith("{")) ?? "";
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** @param {string[]} args @returns {Options} */
function parseOptions(args) {
  /** @type {Options} */
  const parsed = { profile: "preview", hermetic: false, artifact: "", commit: "", previousMetadata: "", candidateMetadata: "", evidence: "", caddy: "caddy" };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--hermetic") {
      parsed.hermetic = true;
      continue;
    }
    const value = String(args[index + 1] ?? "");
    const key = /** @type {Record<string, "profile" | "artifact" | "commit" | "previousMetadata" | "candidateMetadata" | "evidence" | "caddy" | undefined>} */ ({
      "--profile": "profile", "--artifact": "artifact", "--commit": "commit", "--previous-metadata": "previousMetadata",
      "--candidate-metadata": "candidateMetadata", "--evidence": "evidence", "--caddy": "caddy",
    })[String(flag)];
    if (!key || !value || value.startsWith("--")) {
      throw new Error("Usage: node scripts/release/compose-lifecycle-qualification.mjs --previous-metadata <path> (--hermetic --artifact <tgz> --commit <sha> | --candidate-metadata <path>) [--evidence <dir>] [--caddy <path>]");
    }
    parsed[key] = value;
    index += 1;
  }
  assert.ok(parsed.previousMetadata, "--previous-metadata is required");
  if (parsed.hermetic) assert.ok(parsed.artifact && /^[a-f0-9]{40}$/.test(parsed.commit), "--hermetic needs --artifact and a full --commit");
  else assert.ok(parsed.candidateMetadata, "--candidate-metadata is required without --hermetic");
  return parsed;
}
