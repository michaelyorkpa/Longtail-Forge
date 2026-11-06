#!/usr/bin/env node
// Native Compose lifecycle qualification for a candidate image and the host helper together
// (the `v0.33.33` post-release patch).
//
// The executable helper contract fakes Docker. This qualification does not: on a disposable native
// Linux host, as root, it runs the actual repaired helper and real `linux/amd64` images through the
// operations a preview performs:
// - a real previous-release baseline;
// - a pre-upgrade backup that fails for lack of space, which restarts the current release unchanged;
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
const RETENTION_CONFIRMATION = "PRUNE RT-LTF-DEMO RESET HISTORY";
const RETIRED_UNIT_PREFIX = ".longtail-public-demo-previous-";
const ISOLATION_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-isolation-host.example");
const RESET_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-host.example");
// The reset helper the October Node security release shipped, kept so that each restart-recovery
// reproducer can show the October behaviour failing before this patch's helper passes.
const OCTOBER_RESET_HELPER = path.join(repoRoot, "tests/fixtures/compose-helper/october-node-security-release-public-demo-reset-host.example");
const BOOT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-boot-host.example");
const BOOT_UNIT = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-boot.service.example");
const ALERT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-alert.example");
// The boot unit runs with PrivateTmp and ProtectHome, as it does on the hosts, so the demo host it
// manages lives under /var/lib rather than in the qualification's temporary directory.
const DEMO_HOST_ROOT = "/var/lib/ltf-qualification-demo-host";
const INSTALLED_BOOT_FILES = Object.freeze({
  boot: "/usr/local/sbin/longtail-forge-public-demo-boot",
  reset: "/usr/local/sbin/longtail-forge-public-demo-reset",
  alert: "/usr/local/sbin/longtail-forge-public-demo-reset-alert",
  unit: "/etc/systemd/system/longtail-forge-public-demo-boot.service",
  dropIn: "/etc/systemd/system/longtail-forge-public-demo-boot.service.d/qualification.conf",
});
const REPAIRED_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-compose-deploy-host.example");
const ORIGINAL_HELPER = path.join(repoRoot, "tests/fixtures/compose-helper/v0.33.33-longtail-forge-compose-deploy-host.example");
const ADMIN_USERNAME = "qualification-admin@example.test";

/** @typedef {{ version: string, commitSha: string, artifact: { sha256: string }, image: { repository: string, digest: string, reference: string, platformManifest: { digest: string }, nativeDependency: { betterSqlite3Version: string, sqliteVersion: string } } }} ReleaseMetadata */
/** @typedef {{ metadata: ReleaseMetadata, path: string, label: string }} Release */
/** @typedef {{ status: number, stdout: string, stderr: string, seconds: number }} HelperRun */
/** @typedef {ReturnType<typeof createApiClient>} ApiClient */
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

  // A pre-upgrade backup that really fails behind the curtain, on a full backup filesystem, must
  // restart the current release unchanged and lift the curtain only once that release verifies.
  const stateBefore = sha256File(path.join(host.stateRoot, "current.json"));
  const preliminary = runHelperWithFullBackupRoot(host, "deploy", candidate);
  assert.notEqual(preliminary.status, 0, "a failed pre-upgrade backup must fail the deployment");
  assert.match(preliminary.stderr, /no space left on device/i, "the full backup filesystem must be the cause");
  assert.match(preliminary.stderr, /deploy failed before any data change; the current release was restarted unchanged and verified/);
  assert.equal(fs.existsSync(host.marker), false, "a verified restart must clear the deployment marker");
  assert.equal(sha256File(path.join(host.stateRoot, "current.json")), stateBefore, "a failed deployment must not change the recorded release");
  assert.equal(fs.existsSync(path.join(host.stateRoot, "previous.json")), false, "a failed deployment must not create a rollback record");
  await api.expectIdentity(previous);
  assert.equal(runtimeProbe(host).image, previous.metadata.image.reference);
  const preliminaryCookie = await api.login();
  await api.expectList(preliminaryCookie, baseline.listId, 200);
  await api.expectFile(preliminaryCookie, file);
  record("failed-preliminary-backup", { seconds: preliminary.seconds, cause: causeLine(preliminary.stderr), outcome: lastLine(preliminary.stderr) });

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

// ---------------------------------------------------------------------------------------------
// The public-demo lifecycle, mirroring the live demo's upgrade from its current release.
// ---------------------------------------------------------------------------------------------

/**
 * @param {string} work @param {{ dir: string, ca: Buffer, caPath: string }} tls
 * @param {Release} previous @param {Release} candidate
 */
async function runDemoLifecycle(work, tls, previous, candidate) {
  const host = prepareDemoHost();
  const scanner = startScanner(work, DEMO_GATEWAY);
  startEdge(work, tls, host.maintenanceRoot, DEMO_ORIGIN);
  const api = createApiClient(tls.ca, DEMO_ORIGIN);

  // The live demo's current release: an ordinary database on the exact demo volume, then the first
  // demo unit built, validated, and activated by that release's own tools, then the guarded deploy
  // that establishes isolation before the application starts.
  initializeDemoVolume(host, previous);
  bootstrapDemoUnit(host, previous);
  const baseline = runHelper(host, REPAIRED_HELPER, "deploy", previous);
  assert.equal(baseline.status, 0, `demo baseline deployment failed:\n${baseline.stderr}`);
  await api.expectIdentity(previous);
  assertDemoIsolation(host);
  record("demo-baseline", { seconds: baseline.seconds, release: identityOf(previous), runtime: runtimeProbe(host) });

  // A pre-upgrade backup that really fails behind the curtain must restart the current release
  // unchanged, with isolation checked again, before the curtain lifts.
  const preliminary = runHelperWithFullBackupRoot(host, "deploy", candidate);
  assert.notEqual(preliminary.status, 0, "a failed pre-upgrade backup must fail the deployment");
  assert.match(preliminary.stderr, /no space left on device/i, "the full backup filesystem must be the cause");
  assert.match(preliminary.stderr, /deploy failed before any data change; the current release was restarted unchanged and verified/);
  assert.equal(fs.existsSync(host.marker), false, "a verified restart must clear the deployment marker");
  assert.equal(readState(host, "current.json").commitSha, previous.metadata.commitSha, "a failed deployment must not change the recorded release");
  await api.expectIdentity(previous);
  assertDemoIsolation(host);
  assert.equal(runtimeProbe(host).image, previous.metadata.image.reference);
  record("demo-failed-preliminary-backup", { seconds: preliminary.seconds, cause: causeLine(preliminary.stderr), outcome: lastLine(preliminary.stderr) });

  // The guarded upgrade: isolation before the curtain, a backup by the running prior release.
  const upgrade = runHelper(host, REPAIRED_HELPER, "deploy", candidate);
  assert.equal(upgrade.status, 0, `demo upgrade failed:\n${upgrade.stderr}`);
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  const upgraded = runtimeProbe(host);
  assert.equal(upgraded.image, candidate.metadata.image.reference);
  assert.deepEqual(upgraded.packageManagers, [], "the candidate runtime must ship no package manager");
  record("demo-upgrade", { seconds: upgrade.seconds, helper: lastJsonLine(upgrade.stdout), runtime: upgraded });

  // A guarded manual reset after the upgrade must build its candidate with the newly deployed image.
  const reset = await runReset(host, 1);
  assert.equal(reset.status, 0, `demo reset failed:\n${reset.stderr}`);
  const resetResult = /** @type {{ ok?: boolean, commitSha?: string, semanticFingerprint?: string, retention?: { status?: string } }} */ (JSON.parse(lastJsonLine(reset.stdout)));
  assert.equal(resetResult.ok, true);
  assert.equal(resetResult.commitSha, candidate.metadata.commitSha);
  assert.equal(resetResult.retention?.status, "pruned", "every completed reset runs its retention step with the deployed image's prune");
  assert.deepEqual(reset.images, [candidate.metadata.image.reference], "every reset container must run the newly deployed image");
  const build = /** @type {{ appVersion?: string }} */ (readOperationJson(host, reset.operationId, "candidate-build.json"));
  assert.equal(build.appVersion, candidate.metadata.version, "the reset candidate must be generated by the candidate release");
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  record("demo-manual-reset", { seconds: reset.seconds, operationId: reset.operationId, fingerprint: resetResult.semanticFingerprint, images: reset.images, candidateAppVersion: build.appVersion });

  // A visitor change made before the interrupted reset tells the prior unit apart from any fresh one:
  // the recovery must bring it back, and the completed rerun must clear it again.
  const visitor = await api.visitorAccount("Workspace Administrator");
  const visitorList = await api.createList(await api.login(visitor), `Qualification visitor change ${randomBytes(6).toString("hex")}`);

  // An interrupted reset: stopped after activation, the exit trap must restore and verify the prior unit.
  const interrupted = await runReset(host, 2, "activated");
  assert.notEqual(interrupted.status, 0);
  assert.match(interrupted.stderr, /reset failed; prior unit was restored and verified/);
  assert.equal(fs.existsSync(host.marker), false, "a verified recovery must clear the deployment marker");
  assert.equal(/** @type {{ phase?: string }} */ (readOperationJson(host, interrupted.operationId, "state.json")).phase, "recovered");
  assert.deepEqual(interrupted.images, [candidate.metadata.image.reference], "every interrupted-reset container must run the newly deployed image");
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  await api.expectList(await api.login(visitor), visitorList.listId, 200);
  record("demo-interrupted-reset", { seconds: interrupted.seconds, operationId: interrupted.operationId, refusal: lastLine(interrupted.stderr), images: interrupted.images, visitorChangeRestored: visitorList.listId });

  // A deliberate rerun after the recovery completes normally.
  const rerun = await runReset(host, 3);
  assert.equal(rerun.status, 0, `demo reset rerun failed:\n${rerun.stderr}`);
  assert.deepEqual(rerun.images, [candidate.metadata.image.reference]);
  await api.expectIdentity(candidate);
  await api.expectList(await api.login(visitor), visitorList.listId, 404);
  record("demo-reset-rerun", { seconds: rerun.seconds, operationId: rerun.operationId, fingerprint: /** @type {{ semanticFingerprint?: string }} */ (JSON.parse(lastJsonLine(rerun.stdout))).semanticFingerprint, visitorChangeCleared: visitorList.listId });

  // Restart recovery. Each reproducer runs the October helper first, which must fail as it did on
  // the hosts, then this patch's helper, which must recover and complete.
  await reproduceStaleCandidate(host, candidate, api);
  await reproduceStoppedApp(host, candidate, api);
  // Retention runs before the boot, which re-stamps the reset history to fake a missed boundary.
  await qualifyRetention(host, candidate, api);
  await qualifyBootAfterDockerRestart(work, host, candidate, api, scanner);
}

/**
 * Bounded reset retention with the real image and Docker. Synthetic history older than every real
 * reset is seeded: 170 completed resets with their evidence, backups, and retired units, an incident
 * with all three, and an orphaned backup. The plan must change nothing, and the supervised apply must
 * leave exactly the kept set. Then a visitor changes the shared account's profile, and the next reset
 * must keep none of it in its evidence while its own retention runs on the bounded history.
 * @param {DemoHost} host @param {Release} candidate @param {ApiClient} api
 */
async function qualifyRetention(host, candidate, api) {
  const volume = demoVolumeRoot();
  const evidenceRoot = path.join(host.deployRoot, "demo-reset-operations");
  const synthetic = seedSyntheticHistory(host, volume, 170);
  const before = retentionSnapshot(volume, evidenceRoot);
  const units = completedRecords(volume, RETIRED_UNIT_PREFIX, "reset-operation.json");
  const resets = completedRecords(evidenceRoot, "", "state.json");
  const hasBackup = (/** @type {string} */ id) => ["", ".sha256"].some((suffix) => fs.existsSync(path.join(BACKUP_ROOT, `pre-demo-reset-${id}.ltfbackup.tgz${suffix}`)));
  const backedUp = resets.filter(hasBackup);
  assert.ok(units.length > 2 && resets.length > 168, "the seeded history must exceed every retention bound");
  // The seeded resets carry the login record earlier helpers kept. The retained ones must lose it.
  const legacy = resets.slice(0, 168).filter((id) => synthetic.completed.includes(id));
  const login = (/** @type {string} */ id) => fs.readFileSync(path.join(evidenceRoot, id, "pre-reset-login.json"), "utf8");
  assert.ok(legacy.length > 0, "retained evidence must include legacy login records");
  // A probe that crosses the demo chains, so that a rebuild, which zeroes their counters, would show.
  assertDemoIsolation(host);
  const firewall = demoFirewallCounters();
  assert.ok(firewall.some((packets) => packets > 0), "the demo chains must have counted traffic before retention");

  const plan = runRetention(host, "plan");
  assert.equal(plan.status, 0, `retention plan failed:\n${plan.stderr}`);
  const planned = /** @type {{ status: string, units: { selected: number }, backups: { selected: number }, evidence: { selected: number, legacyLogins: { found: number, replaced: number } } }} */ (JSON.parse(lastJsonLine(plan.stdout)));
  assert.deepEqual([planned.status, planned.units.selected, planned.backups.selected, planned.evidence.selected],
    ["planned", units.length - 2, backedUp.filter((id) => resets.indexOf(id) >= 2).length, resets.length - 168]);
  assert.deepEqual(planned.evidence.legacyLogins, { found: legacy.length, replaced: 0 });
  assert.deepEqual(retentionSnapshot(volume, evidenceRoot), before, "a retention plan must change nothing");
  assert.ok(legacy.every((id) => login(id).includes(synthetic.visitorValue)), "a retention plan must change no record");

  const applied = runRetention(host, "apply");
  assert.equal(applied.status, 0, `retention apply failed:\n${applied.stderr}`);
  const afterApply = demoFirewallCounters();
  assert.ok(afterApply.length === firewall.length && afterApply.every((packets, index) => packets >= firewall[index]),
    `retention must never rebuild the firewall: counters ${JSON.stringify(firewall)} became ${JSON.stringify(afterApply)}`);
  assert.deepEqual(/** @type {{ evidence: { legacyLogins: unknown } }} */ (JSON.parse(lastJsonLine(applied.stdout))).evidence.legacyLogins,
    { found: legacy.length, replaced: legacy.length });
  for (const id of legacy) assert.deepEqual(JSON.parse(login(id)), { httpStatus: "200", legacyBodyRemoved: true });
  assert.ok(login(synthetic.incident).includes(synthetic.visitorValue), "incident evidence keeps its own login record");
  assert.deepEqual(completedRecords(volume, RETIRED_UNIT_PREFIX, "reset-operation.json"), units.slice(0, 2),
    "exactly the two newest completed resets keep their retired units");
  assert.ok(fs.existsSync(path.join(volume, `${RETIRED_UNIT_PREFIX}${synthetic.incident}`)), "an incident's retired unit stays");
  const failedEvidence = (/** @type {{ volume: string[] }} */ snapshot) => snapshot.volume.filter((name) => name.startsWith(".longtail-public-demo-failed-"));
  assert.deepEqual(failedEvidence(retentionSnapshot(volume, evidenceRoot)), failedEvidence(before), "failed evidence is never touched");
  for (const [index, id] of resets.entries()) {
    assert.equal(hasBackup(id), index < 2 && backedUp.includes(id), `${id}'s backup must ${index < 2 ? "stay" : "go"}`);
  }
  assert.deepEqual(completedRecords(evidenceRoot, "", "state.json"), resets.slice(0, 168), "the 168 newest completed resets keep their evidence");
  assert.ok(fs.existsSync(path.join(evidenceRoot, synthetic.incident)) && hasBackup(synthetic.incident), "incident evidence and its backup stay");
  assert.ok(hasBackup(synthetic.orphan), "an orphaned backup stays");
  const otherBackups = (/** @type {{ backups: string[] }} */ snapshot) => snapshot.backups.filter((name) => !name.startsWith("pre-demo-reset-"));
  assert.deepEqual(otherBackups(retentionSnapshot(volume, evidenceRoot)), otherBackups(before), "deployment backups are never touched");
  record("demo-retention", {
    planSeconds: plan.seconds, applySeconds: applied.seconds, plan: planned, applied: JSON.parse(lastJsonLine(applied.stdout)),
    retainedUnits: units.slice(0, 2), retainedBackups: resets.slice(0, 2).filter(hasBackup), retainedEvidence: 168,
  });

  const visitor = await api.visitorAccount("Workspace Administrator");
  const displayName = `Qualification visitor ${randomBytes(6).toString("hex")}`;
  await api.setDisplayName(await api.login(visitor), displayName);
  const reset = await runReset(host, 9);
  assert.equal(reset.status, 0, `the reset after retention failed:\n${reset.stderr}`);
  assert.deepEqual(reset.images, [candidate.metadata.image.reference]);
  const result = /** @type {{ retention?: { status?: string } }} */ (JSON.parse(lastJsonLine(reset.stdout)));
  assert.equal(result.retention?.status, "pruned");
  assert.deepEqual(readOperationJson(host, reset.operationId, "pre-reset-login.json"), { httpStatus: "200" });
  assert.ok(!readTreeText(path.join(evidenceRoot, reset.operationId)).includes(displayName),
    "no reset evidence may keep the shared account's profile as a visitor left it");
  const steps = fs.readFileSync(path.join(evidenceRoot, reset.operationId, "steps.jsonl"), "utf8").trim().split("\n")
    .map((line) => /** @type {{ step: string, startedAt: string }} */ (JSON.parse(line)));
  const at = (/** @type {string} */ name) => Date.parse(String(steps.find((entry) => entry.step === name)?.startedAt));
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  record("demo-retention-reset", {
    operationId: reset.operationId, seconds: reset.seconds, retention: result.retention,
    activeBaselineSeconds: (at("start") - at("active-baseline")) / 1000, curtainSeconds: (at("retention") - at("stop")) / 1000,
  });
}

/**
 * Synthetic reset history, older than every real reset, owned as the helpers leave it: completed
 * resets with evidence, backups, and retired units; one incident with all three; and one orphaned
 * backup with no evidence. Each operation's evidence keeps its pre-reset login as earlier helpers
 * did: the response body, with a visitor's profile.
 * @param {DemoHost} host @param {string} volume @param {number} count
 */
function seedSyntheticHistory(host, volume, count) {
  const id = (/** @type {number} */ hour) => `${new Date(Date.UTC(2026, 0, 1) + hour * 3_600_000).toISOString()
    .replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-scheduled-${90000 + hour}`;
  const completed = Array.from({ length: count }, (_, hour) => id(hour));
  const incident = id(count);
  const visitorValue = `Legacy visitor ${randomBytes(6).toString("hex")}`;
  for (const operationId of [...completed, incident]) {
    const finished = operationId !== incident;
    const evidenceDir = path.join(host.deployRoot, "demo-reset-operations", operationId);
    fs.mkdirSync(evidenceDir, { mode: 0o700 });
    writePrivate(path.join(evidenceDir, "state.json"), JSON.stringify({
      contract: "longtail-forge-public-demo-reset-v1", target: DEMO_TARGET, operationId, anchorDate: "2026-01-01",
      phase: finished ? "completed" : "recovering", outcome: finished ? "baseline-healthy" : "reset-failed",
    }));
    writePrivate(path.join(evidenceDir, "pre-reset-login.json"), JSON.stringify({ user: { username: "workspace.admin", displayName: visitorValue } }));
    for (const suffix of ["", ".sha256"]) {
      const backup = path.join(BACKUP_ROOT, `pre-demo-reset-${operationId}.ltfbackup.tgz${suffix}`);
      writePrivate(backup, "synthetic backup\n");
      fs.chownSync(backup, 10001, 10001);
    }
    const unit = path.join(volume, `${RETIRED_UNIT_PREFIX}${operationId}`);
    fs.mkdirSync(path.join(unit, "files", "seed"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(unit, "longtail-forge.db"), "synthetic retired unit\n", { mode: 0o600 });
    fs.writeFileSync(path.join(unit, "files", "seed", "note.md"), "synthetic\n", { mode: 0o600 });
    fs.writeFileSync(path.join(unit, ".longtail-demo-data.json"), "{}\n", { mode: 0o600 });
    fs.writeFileSync(path.join(unit, "reset-operation.json"), JSON.stringify({
      contract: "longtail-forge-public-demo-activation-v1", generatedAt: "2026-01-01T00:00:00.000Z", operationId,
      phase: finished ? "completed" : "activated", state: "active", target: DEMO_TARGET,
      ...(finished ? { completedAt: "2026-01-01T00:05:00.000Z" } : {}),
    }), { mode: 0o600 });
    run("chown", ["-R", "10001:10001", unit]);
  }
  const orphan = id(count + 1);
  const orphanBackup = path.join(BACKUP_ROOT, `pre-demo-reset-${orphan}.ltfbackup.tgz`);
  writePrivate(orphanBackup, "synthetic orphan\n");
  fs.chownSync(orphanBackup, 10001, 10001);
  return { completed, incident, orphan, visitorValue };
}

/**
 * The packet counter of every rule in the two demo chains, in order. Only a flush resets one, so a
 * rebuild of the chains shows as a counter that went down.
 * @returns {number[]}
 */
function demoFirewallCounters() {
  return ["LTF_DEMO_INPUT", "LTF_DEMO_FORWARD"].flatMap((chain) => run("iptables", ["-w", "-L", chain, "-n", "-v", "-x", "--line-numbers"])
    .split("\n").filter((line) => /^\d+\s/.test(line)).map((line) => Number(line.trim().split(/\s+/)[1])));
}

/**
 * The identities whose own record proves they completed, newest first.
 * @param {string} root @param {string} prefix @param {string} recordName
 */
function completedRecords(root, prefix, recordName) {
  return fs.readdirSync(root).filter((name) => name.startsWith(prefix) && !name.startsWith(".pruning-")).filter((name) => {
    try {
      const recorded = /** @type {{ phase?: string, operationId?: string }} */ (JSON.parse(fs.readFileSync(path.join(root, name, recordName), "utf8")));
      return recorded.phase === "completed" && recorded.operationId === name.slice(prefix.length);
    } catch {
      return false;
    }
  }).map((name) => name.slice(prefix.length)).sort().reverse();
}

/** @param {string} volume @param {string} evidenceRoot */
function retentionSnapshot(volume, evidenceRoot) {
  return { volume: fs.readdirSync(volume).sort(), evidence: fs.readdirSync(evidenceRoot).sort(), backups: fs.readdirSync(BACKUP_ROOT).sort() };
}

/** @param {DemoHost} host @param {"plan" | "apply"} mode @returns {HelperRun} */
function runRetention(host, mode) {
  // Operation identities have one-second resolution; never let two runs share one.
  spawnSync("sleep", ["1.05"]);
  const started = Date.now();
  const result = spawnSync("bash", [host.resetHelper, "retention", mode, "--target", DEMO_TARGET,
    ...(mode === "apply" ? ["--confirm", RETENTION_CONFIRMATION] : [])], {
    encoding: "utf8",
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/root", LANG: "C.UTF-8", LTF_COMPOSE_HELPER_ENV: host.helperEnv },
    timeout: 900_000,
  });
  const outcome = { status: result.status ?? 1, stdout: String(result.stdout || ""), stderr: String(result.stderr || ""), seconds: Math.round((Date.now() - started) / 100) / 10 };
  console.log(`[retention ${mode}] exit ${outcome.status} in ${outcome.seconds}s${outcome.status === 0 ? "" : `: ${lastLine(outcome.stderr)}`}`);
  return outcome;
}

/** Every regular file's text beneath a directory, so a check sees all of the evidence. @param {string} directory @returns {string} */
function readTreeText(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readTreeText(entryPath);
    return entry.isFile() ? fs.readFileSync(entryPath, "utf8") : "";
  }).join("\n");
}

/** @returns {string} the demo data volume's host path */
function demoVolumeRoot() {
  return docker(["volume", "inspect", "--format", "{{.Mountpoint}}", DEMO_VOLUME]).trim();
}

/** @param {DemoHost} host @param {string[]} args */
function composeCurrent(host, args) {
  const state = /** @type {{ deployment?: { releaseEnv?: string } }} */ (JSON.parse(fs.readFileSync(path.join(host.stateRoot, "current.json"), "utf8")));
  return docker(["compose", "--project-directory", host.composeDir, "--file", host.composeFile, "--env-file", host.hostEnv,
    "--env-file", String(state.deployment?.releaseEnv), ...args]);
}

/**
 * The 2026-10-06 outage: a Docker restart killed a reset after it validated its candidate and before
 * activation wrote its marker, and every later build refused the leftover candidate.
 * @param {DemoHost} host @param {Release} candidate @param {ApiClient} api
 */
async function reproduceStaleCandidate(host, candidate, api) {
  const killed = await runReset(host, 4, undefined, { killAtStep: "capture-old-session" });
  assert.notEqual(killed.status, 0, "the killed reset must not report success");
  const volume = demoVolumeRoot();
  assert.ok(fs.existsSync(path.join(volume, ".longtail-public-demo-candidate")), "the killed reset must leave its validated candidate");
  assert.equal(fs.existsSync(path.join(volume, ".longtail-public-demo-reset-active.json")), false, "the killed reset must leave no active-operation marker");
  assert.equal(fs.existsSync(host.marker), false, "the reset was killed before its curtain");

  const october = await runReset(host, 5, undefined, { helper: OCTOBER_RESET_HELPER });
  assert.notEqual(october.status, 0, "the October helper must refuse the leftover candidate");
  assert.match(october.stderr, /A verified public-demo candidate already exists; refusing candidate reuse or replacement/);

  const repaired = await runReset(host, 6);
  assert.equal(repaired.status, 0, `this patch's reset must recover from a stale candidate:\n${repaired.stderr}`);
  const moved = /** @type {{ status?: string, moved?: number }} */ (readOperationJson(host, repaired.operationId, "stale-candidate.json"));
  assert.deepEqual([moved.status, moved.moved], ["stale-candidate-quarantined", 1]);
  const evidenceRoot = path.join(volume, `.longtail-public-demo-failed-${repaired.operationId}-stale-candidate`);
  assert.ok(fs.existsSync(path.join(evidenceRoot, "candidate", "longtail-forge.db")), "the stale candidate must be kept as failed evidence");
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  record("demo-stale-candidate-reproducer", {
    killedAtStep: "capture-old-session", octoberRefusal: lastLine(october.stderr),
    repairedOperationId: repaired.operationId, repairedSeconds: repaired.seconds, evidence: path.basename(evidenceRoot),
  });
}

/**
 * The 2026-10-14 power loss: the first reset after boot reached its session capture with the app
 * down, failed before recovery was armed, and left another stale candidate.
 * @param {DemoHost} host @param {Release} candidate @param {ApiClient} api
 */
async function reproduceStoppedApp(host, candidate, api) {
  composeCurrent(host, ["stop", "longtail-forge"]);
  const october = await runReset(host, 7, undefined, { helper: OCTOBER_RESET_HELPER });
  assert.notEqual(october.status, 0, "the October helper must fail with the app stopped");
  // Its session capture reads the public account catalog first, so it fails there, before recovery
  // is armed, exactly as the first reset after the power loss did.
  assert.match(october.stderr, /Failed to connect to 127\.0\.0\.1 port 8001/);
  assert.ok(fs.existsSync(path.join(demoVolumeRoot(), ".longtail-public-demo-candidate")), "the October failure leaves a stale candidate");

  const repaired = await runReset(host, 8);
  assert.equal(repaired.status, 0, `this patch's reset must start the stopped app and complete:\n${repaired.stderr}`);
  const result = /** @type {{ ok?: boolean, appStartedByReset?: boolean }} */ (JSON.parse(lastJsonLine(repaired.stdout)));
  assert.deepEqual([result.ok, result.appStartedByReset], [true, true], "the reset must record that it started the app");
  const moved = /** @type {{ moved?: number }} */ (readOperationJson(host, repaired.operationId, "stale-candidate.json"));
  assert.equal(moved.moved, 1, "the reset must also move the October failure's stale candidate");
  const steps = fs.readFileSync(path.join(host.deployRoot, "demo-reset-operations", repaired.operationId, "steps.jsonl"), "utf8")
    .trim().split("\n").map((line) => /** @type {{ step: string }} */ (JSON.parse(line)).step);
  for (const [earlier, later] of [["quarantine-stale", "start-stopped-app"], ["start-stopped-app", "capture-old-session"], ["capture-old-session", "verify-old-session-rejected"]]) {
    assert.ok(steps.indexOf(earlier) >= 0 && steps.indexOf(earlier) < steps.indexOf(later), `step ${earlier} must precede ${later}: ${steps.join(", ")}`);
  }
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  record("demo-stopped-app-reproducer", { octoberRefusal: lastLine(october.stderr), repairedOperationId: repaired.operationId, repairedSeconds: repaired.seconds, steps });
}

/**
 * The protected boot, through the real unit: a Docker restart stops the demo, the scanner returns
 * late, and an hourly boundary was missed, so the boot must enforce isolation before starting and
 * serve a fresh baseline within the ten-minute target.
 * @param {string} work @param {DemoHost} host @param {Release} candidate @param {ApiClient} api
 * @param {import("node:child_process").ChildProcess} scanner
 */
async function qualifyBootAfterDockerRestart(work, host, candidate, api, scanner) {
  installBootUnit(host);
  const visitor = await api.visitorAccount("Workspace Administrator");
  const visitorList = await api.createList(await api.login(visitor), `Qualification boot change ${randomBytes(6).toString("hex")}`);

  // A missed boundary: every completed reset is re-stamped three hours earlier.
  const resets = path.join(host.deployRoot, "demo-reset-operations");
  for (const name of fs.readdirSync(resets)) {
    const match = /^(\d{8}T\d{6}Z)(-.+)$/.exec(name);
    if (!match) continue;
    const earlier = new Date(Date.parse(match[1].replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")) - 3 * 3_600_000);
    fs.renameSync(path.join(resets, name), path.join(resets, `${earlier.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}${match[2]}`));
  }

  scanner.kill("SIGTERM");
  const bootsBefore = new Set(fs.existsSync(path.join(host.deployRoot, "demo-boot-operations")) ? fs.readdirSync(path.join(host.deployRoot, "demo-boot-operations")) : []);
  const restartedAt = Date.now();
  run("systemctl", ["restart", "docker"]);
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  startScanner(work, DEMO_GATEWAY);

  const bootRoot = path.join(host.deployRoot, "demo-boot-operations");
  const deadline = restartedAt + 900_000;
  /** @type {string} */
  let operation = "";
  for (;;) {
    const fresh = fs.existsSync(bootRoot) ? fs.readdirSync(bootRoot).filter((name) => !bootsBefore.has(name)) : [];
    operation = fresh.sort().at(-1) || "";
    const unit = spawnSync("systemctl", ["show", "--property=ActiveState", "--value", "longtail-forge-public-demo-boot.service"], { encoding: "utf8" }).stdout.trim();
    if (operation && unit !== "activating" && (fs.existsSync(path.join(bootRoot, operation, "result.json")) || unit === "failed" || unit === "inactive")) break;
    assert.ok(Date.now() < deadline, "the boot unit did not finish within fifteen minutes of the Docker restart");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  const journal = spawnSync("journalctl", ["--unit", "longtail-forge-public-demo-boot.service", "--no-pager", "--output", "cat", "--since", `@${Math.floor(restartedAt / 1000)}`], { encoding: "utf8" }).stdout;
  assert.ok(fs.existsSync(path.join(bootRoot, operation, "result.json")), `the boot did not complete:\n${journal}`);
  const result = /** @type {{ ok?: boolean, baseline?: string, elapsedSeconds?: number }} */ (JSON.parse(fs.readFileSync(path.join(bootRoot, operation, "result.json"), "utf8")));
  assert.deepEqual([result.ok, result.baseline], [true, "fresh-baseline"], "a missed boundary must produce a fresh baseline");
  const servedSeconds = Math.round((Date.now() - restartedAt) / 1000);
  assert.ok(servedSeconds <= 600, `the demo must serve within ten minutes of the Docker restart, not ${servedSeconds}s`);

  const phases = fs.readFileSync(path.join(bootRoot, operation, "steps.jsonl"), "utf8").trim().split("\n")
    .map((line) => /** @type {{ phase: string }} */ (JSON.parse(line)).phase);
  const order = ["checking-preconditions", "waiting-for-docker", "resolving-profile", "validating-storage", "validating-profile", "waiting-for-bridge", "waiting-for-scanner", "enforcing-isolation", "curtained", "starting", "started", "resetting", "serving", "completed"];
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(phases.indexOf(order[index - 1]) < phases.indexOf(order[index]), `boot phase ${order[index - 1]} must precede ${order[index]}: ${phases.join(", ")}`);
  }
  const dependencies = fs.readFileSync(path.join(bootRoot, operation, "dependencies.jsonl"), "utf8").trim().split("\n")
    .map((line) => /** @type {{ dependency: string, attempts: number, outcome: string }} */ (JSON.parse(line)));
  const scannerWait = dependencies.find((entry) => entry.dependency === "scanner");
  assert.ok(scannerWait && scannerWait.outcome === "available" && scannerWait.attempts > 1, `the boot must have waited for the delayed scanner: ${JSON.stringify(dependencies)}`);

  assert.equal(fs.existsSync(host.marker), false, "the boot must lift its curtain once the fresh baseline passes");
  await api.expectIdentity(candidate);
  assertDemoIsolation(host);
  await api.expectList(await api.login(visitor), visitorList.listId, 404);
  record("demo-boot-after-docker-restart", { operation, servedSeconds, bootElapsedSeconds: result.elapsedSeconds, phases, dependencies, visitorChangeCleared: visitorList.listId });
}

/**
 * Install the boot helper, the reset and alert helpers it calls, and the boot unit at their host
 * paths, then enable the unit so Docker pulls it in. The only addition is a drop-in naming the
 * qualification's helper environment; the shipped unit is used unchanged.
 * @param {DemoHost} host
 */
function installBootUnit(host) {
  for (const target of Object.values(INSTALLED_BOOT_FILES)) {
    assert.equal(fs.existsSync(target), false, `${target} already exists; refusing to replace it`);
  }
  cleanups.push(() => {
    spawnSync("systemctl", ["disable", "longtail-forge-public-demo-boot.service"]);
    for (const target of Object.values(INSTALLED_BOOT_FILES)) fs.rmSync(target, { force: true });
    fs.rmSync(path.dirname(INSTALLED_BOOT_FILES.dropIn), { recursive: true, force: true });
    spawnSync("systemctl", ["daemon-reload"]);
  });
  for (const [source, target, mode] of /** @type {[string, string, number][]} */ ([
    [BOOT_HELPER, INSTALLED_BOOT_FILES.boot, 0o755],
    [RESET_HELPER, INSTALLED_BOOT_FILES.reset, 0o755],
    [ALERT_HELPER, INSTALLED_BOOT_FILES.alert, 0o755],
    [BOOT_UNIT, INSTALLED_BOOT_FILES.unit, 0o644],
  ])) {
    fs.writeFileSync(target, fs.readFileSync(source));
    fs.chownSync(target, 0, 0);
    fs.chmodSync(target, mode);
  }
  fs.mkdirSync(path.dirname(INSTALLED_BOOT_FILES.dropIn), { recursive: true });
  fs.writeFileSync(INSTALLED_BOOT_FILES.dropIn, `[Service]\nEnvironment=LTF_COMPOSE_HELPER_ENV=${host.helperEnv}\n`);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["enable", "longtail-forge-public-demo-boot.service"]);
  assert.ok(fs.existsSync("/etc/systemd/system/docker.service.wants/longtail-forge-public-demo-boot.service"), "enabling the unit must make Docker want it");
  record("demo-boot-unit-installed", { unit: sha256File(BOOT_UNIT), helper: sha256File(BOOT_HELPER) });
}

/** @typedef {Host & { resetHelper: string, isolationHelper: string, roleCredentials: string }} DemoHost */

/** @returns {DemoHost} */
function prepareDemoHost() {
  fs.mkdirSync(BACKUP_PARENT, { recursive: true, mode: 0o700 });
  fs.writeFileSync(OWNERSHIP_MARKER, "created by scripts/release/compose-lifecycle-qualification.mjs\n");
  cleanups.push(() => { if (fs.existsSync(OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true }); });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  fs.chownSync(BACKUP_ROOT, 10001, 10001);
  fs.chmodSync(BACKUP_ROOT, 0o700);
  if (spawnSync("id", [DEPLOY_ACCOUNT]).status !== 0) {
    run("useradd", ["--system", "--user-group", "--no-create-home", "--shell", "/usr/sbin/nologin", DEPLOY_ACCOUNT]);
    cleanups.push(() => { spawnSync("userdel", [DEPLOY_ACCOUNT]); });
  }
  // The exact egress-filtered bridge the isolation helper accepts.
  docker(["network", "create", "--driver", "bridge", "--subnet", DEMO_SUBNET, "--gateway", DEMO_GATEWAY,
    "--opt", `com.docker.network.bridge.name=${DEMO_BRIDGE}`, "--opt", "com.docker.network.bridge.enable_ip_masquerade=false", DEMO_NETWORK]);
  cleanups.push(() => {
    spawnSync("docker", ["network", "rm", DEMO_NETWORK]);
    removeDemoIsolationRules();
  });

  assert.equal(fs.existsSync(DEMO_HOST_ROOT), false, `${DEMO_HOST_ROOT} already exists; refusing to reuse it`);
  const root = DEMO_HOST_ROOT;
  cleanups.push(() => { fs.rmSync(DEMO_HOST_ROOT, { recursive: true, force: true }); });
  const etc = path.join(root, "etc");
  const sbin = path.join(root, "sbin");
  const secrets = path.join(root, "secrets");
  const composeDir = path.join(root, "compose");
  const deployRoot = path.join(root, "deploy");
  const maintenanceRoot = path.join(root, "maintenance");
  for (const [dir, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [etc, 0o755], [sbin, 0o755], [secrets, 0o700], [composeDir, 0o755], [deployRoot, 0o711],
    [path.join(deployRoot, "state"), 0o700], [path.join(deployRoot, "releases"), 0o700], [path.join(deployRoot, "operations"), 0o700],
    [maintenanceRoot, 0o711], [path.join(maintenanceRoot, "deployment"), 0o711], [path.join(maintenanceRoot, "operator"), 0o2775],
  ])) {
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, mode);
  }
  const inbox = path.join(deployRoot, "inbox");
  fs.mkdirSync(inbox, { mode: 0o700 });
  run("chown", [`${DEPLOY_ACCOUNT}:${DEPLOY_ACCOUNT}`, inbox]);
  fs.copyFileSync(path.join(repoRoot, "compose.yaml"), path.join(composeDir, "compose.yaml"));
  const isolationHelper = path.join(sbin, "longtail-forge-public-demo-isolation");
  const resetHelper = path.join(sbin, "longtail-forge-public-demo-reset");
  for (const [source, target] of [[ISOLATION_HELPER, isolationHelper], [RESET_HELPER, resetHelper]]) {
    fs.writeFileSync(String(target), fs.readFileSync(String(source)));
    fs.chownSync(String(target), 0, 0);
    fs.chmodSync(String(target), 0o755);
    const installed = fs.lstatSync(String(target));
    const access = spawnSync("bash", ["-c", 'test -f "$1" && test ! -L "$1" && test -x "$1" && stat -c "%u %a %F" "$1"', "installed-helper", String(target)], { encoding: "utf8" });
    record("demo-helper-installed", { path: target, uid: installed.uid, mode: (installed.mode & 0o7777).toString(8), access: access.status, stat: String(access.stdout).trim(), stderr: String(access.stderr).trim() });
    assert.equal(access.status, 0, `the installed helper ${target} must be a root-owned executable regular file`);
  }

  const roleCredentials = path.join(secrets, "demo-role-credentials.json");
  writePrivate(roleCredentials, `${JSON.stringify({ version: 2, binding: { publicUrl: DEMO_ORIGIN, target: DEMO_TARGET }, passwords: { super_admin: strongSecret() } })}\n`);
  const appEnv = path.join(etc, "public-demo.env");
  writePrivate(appEnv, [
    "LONGTAIL_ENV=production",
    "LONGTAIL_DEPLOYMENT_MODE=compose",
    "DEMO_MODE=true",
    "WORKSPACE_INSTALL_MODE=self_hosted",
    `LONGTAIL_PUBLIC_URL=${DEMO_ORIGIN}`,
    "LONGTAIL_SESSION_COOKIE_SECURE=true",
    "LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
    "LONGTAIL_AUTH_THROTTLE_ENABLED=true",
    "LONGTAIL_LOG_LEVEL=info",
    "LONGTAIL_DATABASE_PROVIDER=sqlite",
    "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
    "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
    "LONGTAIL_STORAGE_PROVIDER=local",
    "LONGTAIL_WORKER_MODE=inline",
    "LONGTAIL_SUPPORT_VIEW_ENABLED=false",
    "LONGTAIL_FILE_SCANNER=clamd",
    `LONGTAIL_CLAMD_HOST=${DEMO_GATEWAY}`,
    "LONGTAIL_CLAMD_PORT=3310",
    "LONGTAIL_PUBLIC_DEMO_PERIMETER_WINDOW_SECONDS=60",
    "LONGTAIL_PUBLIC_DEMO_GLOBAL_REQUEST_LIMIT=2400",
    "LONGTAIL_PUBLIC_DEMO_CLIENT_REQUEST_LIMIT=600",
    "LONGTAIL_PUBLIC_DEMO_MUTATION_LIMIT=120",
    "LONGTAIL_PUBLIC_DEMO_SEARCH_LIMIT=60",
    "LONGTAIL_PUBLIC_DEMO_MAX_BODY_BYTES=131072",
    "SUPER_ADMIN_USERNAME=role-super-admin@example.test",
    "SUPER_ADMIN_DISPLAY_NAME=Role Fixture Super Administrator",
    `SUPER_ADMIN_PASSWORD=${strongSecret()}`,
    `LONGTAIL_SECURE_NOTES_MASTER_KEY=${randomBytes(32).toString("hex")}`,
    "",
  ].join("\n"));
  const hostEnv = path.join(etc, "compose-host.env");
  writePrivate(hostEnv, [
    `LONGTAIL_ENV_FILE=${appEnv}`,
    "LONGTAIL_HOST_PORT=8001",
    "LONGTAIL_RESTART_POLICY=no",
    "LONGTAIL_DNS_SERVER=127.0.0.1",
    `LONGTAIL_BACKUP_DIR=${BACKUP_ROOT}`,
    `LONGTAIL_DATA_VOLUME=${DEMO_VOLUME}`,
    `LONGTAIL_DOCKER_NETWORK=${DEMO_NETWORK}`,
    `LONGTAIL_DOCKER_TRUST_PROXY=${DEMO_GATEWAY}/32`,
    `LONGTAIL_CLAMD_HOST=${DEMO_GATEWAY}`,
    "LONGTAIL_CLAMD_PORT=3310",
    "LONGTAIL_FILE_SCANNER=clamd",
    "",
  ].join("\n"));
  const helperEnv = path.join(etc, "compose-deploy-helper.env");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${composeDir}`,
    `LTF_COMPOSE_HOST_ENV=${hostEnv}`,
    `LTF_DEMO_ROLE_CREDENTIALS=${roleCredentials}`,
    `LTF_DEPLOY_ACCOUNT=${DEPLOY_ACCOUNT}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    `LTF_IMAGE_REPOSITORY=${REPOSITORY}`,
    `LTF_MAINTENANCE_STATE_ROOT=${maintenanceRoot}`,
    `LTF_PUBLIC_DEMO_ISOLATION_HELPER=${isolationHelper}`,
    `LTF_PUBLIC_URL=${DEMO_ORIGIN}`,
    "",
  ].join("\n"));
  cleanups.push(() => {
    spawnSync("docker", ["compose", "--project-directory", composeDir, "--file", path.join(composeDir, "compose.yaml"), "--env-file", hostEnv, "down", "--volumes", "--remove-orphans"]);
    spawnSync("docker", ["volume", "rm", "--force", DEMO_VOLUME]);
  });
  return {
    root, helperEnv, composeDir, composeFile: path.join(composeDir, "compose.yaml"), hostEnv, deployRoot, inbox,
    stateRoot: path.join(deployRoot, "state"), releaseRoot: path.join(deployRoot, "releases"),
    maintenanceRoot, marker: path.join(maintenanceRoot, "deployment", "maintenance.on"),
    resetHelper, isolationHelper, roleCredentials,
  };
}

function removeDemoIsolationRules() {
  for (const [parent, chain] of [["INPUT", "LTF_DEMO_INPUT"], ["DOCKER-USER", "LTF_DEMO_FORWARD"]]) {
    while (spawnSync("iptables", ["-w", "-D", String(parent), "-i", DEMO_BRIDGE, "-j", String(chain)]).status === 0) {
      // Remove every jump the isolation helper inserted.
    }
    spawnSync("iptables", ["-w", "-F", String(chain)]);
    spawnSync("iptables", ["-w", "-X", String(chain)]);
  }
}

/**
 * Give the exact demo volume an ordinary initialized database, as a fresh installation would have
 * before its first demo unit exists. The application refuses demo mode until that unit's marker does.
 * @param {DemoHost} host @param {Release} release
 */
function initializeDemoVolume(host, release) {
  docker(["pull", "--platform", "linux/amd64", release.metadata.image.reference]);
  docker(["volume", "create", DEMO_VOLUME]);
  const initEnv = path.join(host.root, "etc", "initialization.env");
  writePrivate(initEnv, [
    "LONGTAIL_ENV=production",
    "DEMO_MODE=false",
    "LONGTAIL_PUBLIC_URL=https://demo-initialization.qualification.test",
    "LONGTAIL_SESSION_COOKIE_SECURE=true",
    "LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
    "LONGTAIL_DATABASE_PROVIDER=sqlite",
    "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
    "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
    "LONGTAIL_STORAGE_PROVIDER=local",
    "LONGTAIL_WORKER_MODE=inline",
    "LONGTAIL_FILE_SCANNER=clamd",
    `LONGTAIL_CLAMD_HOST=${DEMO_GATEWAY}`,
    "LONGTAIL_CLAMD_PORT=3310",
    `TRUST_PROXY=${DEMO_GATEWAY}/32`,
    "SUPER_ADMIN_USERNAME=initialization-admin@example.test",
    `SUPER_ADMIN_PASSWORD=${strongSecret()}`,
    `LONGTAIL_SECURE_NOTES_MASTER_KEY=${randomBytes(32).toString("hex")}`,
    "",
  ].join("\n"));
  const name = "ltf-qual-demo-initialization";
  docker(["run", "--detach", "--name", name, "--network", DEMO_NETWORK, "--read-only", "--user", "10001:10001",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001",
    "--volume", `${DEMO_VOLUME}:/var/lib/longtail-forge`, "--env-file", initEnv, release.metadata.image.reference]);
  try {
    const deadline = Date.now() + 120_000;
    while (docker(["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{end}}", name]).trim() !== "healthy") {
      assert.ok(Date.now() < deadline, `the initialization container never became healthy:\n${spawnSync("docker", ["logs", name], { encoding: "utf8" }).stderr}`);
      spawnSync("sleep", ["2"]);
    }
  } finally {
    spawnSync("docker", ["rm", "--force", name]);
  }
  // A live demo's first unit came from the historical provision and the Compose cutover. Activation
  // retires the active unit untouched once its three members exist, so a placeholder marker stands in
  // for that history here; the first real demo unit is still built, validated, activated, and
  // finalized by the release's own tools, and this placeholder leaves with the retired unit.
  docker(["run", "--rm", "--network", "none", "--read-only", "--user", "10001:10001", "--volume", `${DEMO_VOLUME}:/var/lib/longtail-forge`,
    "--entrypoint", "node", release.metadata.image.reference, "-e",
    "require('node:fs').writeFileSync('/var/lib/longtail-forge/.longtail-demo-data.json', JSON.stringify({ placeholder: 'disposable qualification bootstrap' }), { mode: 0o600 })"]);
}

/**
 * Build, validate, activate, and finalize the first demo unit with the release's own tools, then
 * record that release as the known-good baseline.
 * @param {DemoHost} host @param {Release} release
 */
function bootstrapDemoUnit(host, release) {
  const releaseEnv = seedReleaseState(host, release);
  const anchorDate = new Date().toISOString().slice(0, 10);
  const operationId = `${utcStamp()}-qualification-bootstrap`;
  const candidate = (/** @type {string} */ action) => composeRun(host, releaseEnv, [
    "--user", "0:0", "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE",
    "--volume", `${host.roleCredentials}:/run/secrets/demo-role-credentials.json:ro`,
  ], ["node", "scripts/public-demo-baseline-candidate.mjs", action, "--target", DEMO_TARGET, "--anchor-date", anchorDate,
    "--data-root", "/var/lib/longtail-forge", "--role-credentials", "/run/secrets/demo-role-credentials.json"]);
  const activation = (/** @type {string[]} */ args) => composeRun(host, releaseEnv, ["--user", "0:0", "--cap-add", "DAC_OVERRIDE"],
    ["node", "scripts/public-demo-baseline-activation.mjs", ...args]);
  candidate("build");
  candidate("validate");
  activation(["activate", "--target", DEMO_TARGET, "--data-root", "/var/lib/longtail-forge", "--operation-id", operationId, "--confirm-quiescent", "COMPOSE SQLITE USERS STOPPED"]);
  const active = /** @type {{ semanticFingerprint?: string }} */ (JSON.parse(candidate("active")));
  activation(["finalize", "--target", DEMO_TARGET, "--data-root", "/var/lib/longtail-forge", "--operation-id", operationId]);
  record("demo-bootstrap", { release: release.label, anchorDate, operationId, fingerprint: active.semanticFingerprint });
}

/** @param {Host} host @param {Release} release @returns {string} the recorded release environment */
function seedReleaseState(host, release) {
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
  return releaseEnv;
}

/** @param {Host} host @param {string} releaseEnv @param {string[]} runOptions @param {string[]} command @returns {string} */
function composeRun(host, releaseEnv, runOptions, command) {
  return docker(["compose", "--project-directory", host.composeDir, "--file", host.composeFile, "--env-file", host.hostEnv, "--env-file", releaseEnv,
    "run", "--rm", "--no-deps", ...runOptions, "longtail-forge", ...command]);
}

/** @param {DemoHost} host */
function assertDemoIsolation(host) {
  const container = composeContainer(host);
  const result = spawnSync("bash", [host.isolationHelper, "check", "--network", DEMO_NETWORK, "--scanner-host", DEMO_GATEWAY, "--scanner-port", "3310",
    "--data-volume", DEMO_VOLUME, "--backup-root", BACKUP_ROOT, "--container", container], { encoding: "utf8" });
  assert.equal(result.status, 0, `public-demo isolation check failed:\n${result.stderr}`);
}

/**
 * Run the actual reset helper, optionally signalling it once its operation records a phase, and
 * report every container image created while it ran.
 * @param {DemoHost} host @param {number} ordinal @param {string} [interruptAtPhase]
 * @param {{ helper?: string, killAtStep?: string }} [variant] another helper's bytes, or a SIGKILL
 *   of the reset's whole process group once the operation records that step. That leaves no exit
 *   trap to run, as a Docker restart did. Each step runs in a forked subshell that shares the lock's
 *   descriptor, so killing only the parent would leave that subshell holding the lock.
 * @returns {Promise<HelperRun & { operationId: string, images: string[] }>}
 */
async function runReset(host, ordinal, interruptAtPhase, { helper = host.resetHelper, killAtStep } = {}) {
  const operationId = `${utcStamp()}-manual-${ordinal}`;
  const since = Math.floor(Date.now() / 1000) - 1;
  const started = Date.now();
  const child = spawn("bash", [helper, "reset", "--target", DEMO_TARGET, "--anchor-date", "today", "--operation-id", operationId, "--confirm", RESET_CONFIRMATION], {
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/root", LANG: "C.UTF-8", LTF_COMPOSE_HELPER_ENV: host.helperEnv },
    // Its own process group, so a kill reaches every process the reset started.
    detached: Boolean(killAtStep),
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  let finished = false;
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => { finished = true; resolve(code ?? (signal ? 128 : 1)); }));
  if (interruptAtPhase) {
    // A phase lasts one Compose run, so poll closely and refuse a missed window rather than
    // signalling a later phase whose recovery would prove something else.
    const statePath = path.join(host.deployRoot, "demo-reset-operations", operationId, "state.json");
    const phases = ["preflight", "curtained", "quiescent", "backed-up", "activated", "started", "verified", "completed"];
    const deadline = Date.now() + 600_000;
    for (;;) {
      let phase = "";
      try {
        phase = String(/** @type {{ phase?: string }} */ (JSON.parse(fs.readFileSync(statePath, "utf8"))).phase || "");
      } catch {
        // Not written yet, or between the helper's write and install.
      }
      if (phase === interruptAtPhase) break;
      assert.ok(phases.indexOf(phase) < phases.indexOf(interruptAtPhase), `the reset passed ${interruptAtPhase} (now ${phase}) before it could be interrupted`);
      assert.ok(!finished, `the reset exited before reaching ${interruptAtPhase}:\n${stderr}`);
      assert.ok(Date.now() < deadline, `timed out waiting for reset phase ${interruptAtPhase}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    child.kill("SIGTERM");
  }
  if (killAtStep) {
    const stepPath = path.join(host.deployRoot, "demo-reset-operations", operationId, "step.json");
    const deadline = Date.now() + 600_000;
    for (;;) {
      let step = "";
      try {
        step = String(/** @type {{ step?: string }} */ (JSON.parse(fs.readFileSync(stepPath, "utf8"))).step || "");
      } catch {
        // Not written yet, or between the helper's write and install.
      }
      if (step === killAtStep) break;
      assert.ok(!finished, `the reset exited before reaching step ${killAtStep}:\n${stderr}`);
      assert.ok(Date.now() < deadline, `timed out waiting for reset step ${killAtStep}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(typeof child.pid, "number", "the reset must have a process to kill");
    process.kill(-(/** @type {number} */ (child.pid)), "SIGKILL");
  }
  const status = /** @type {number} */ (await exited);
  if (killAtStep) await expectKilledResetGone(host, /** @type {number} */ (child.pid));
  const until = Math.floor(Date.now() / 1000) + 1;
  const images = [...new Set(docker(["events", "--since", String(since), "--until", String(until), "--filter", "type=container",
    "--filter", "event=create", "--format", "{{.Actor.Attributes.image}}"]).split("\n").filter(Boolean))].sort();
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.log(`[reset ${operationId}] exit ${status} in ${seconds}s${status === 0 ? "" : `: ${lastLine(stderr)}`}`);
  return { status, stdout, stderr, seconds, operationId, images };
}

/**
 * A killed reset leaves no process behind, as a power loss or Docker restart does, so the next
 * reset meets only what it left on disk, never a survivor still holding the host lock.
 * @param {Host} host @param {number} processGroup
 */
async function expectKilledResetGone(host, processGroup) {
  await waitFor("every process of the killed reset to exit", () => {
    try {
      process.kill(-processGroup, 0);
      return false;
    } catch (error) {
      return /** @type {NodeJS.ErrnoException} */ (error).code === "ESRCH";
    }
  }, 10_000);
  const lock = path.join(host.deployRoot, "compose-operation.lock");
  assert.equal(spawnSync("flock", ["-n", lock, "true"]).status, 0, "the killed reset must leave the host lock free");
}

/** @param {Host} host @param {string} operationId @param {string} name @returns {unknown} */
function readOperationJson(host, operationId, name) {
  return JSON.parse(fs.readFileSync(path.join(host.deployRoot, "demo-reset-operations", operationId, name), "utf8"));
}

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function strongSecret() {
  return `Qx${randomBytes(18).toString("base64url")}9!a`;
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
  return scanner;
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
  // The full ID, as `compose ps -q` gives the deploy helper: the isolation check matches the
  // network's peer table, which is keyed by full container ID.
  const result = spawnSync("docker", ["ps", "--quiet", "--no-trunc", "--filter", "label=com.docker.compose.project=longtail-forge", "--filter", "label=com.docker.compose.service=longtail-forge"], { encoding: "utf8" });
  void host;
  return String(result.stdout || "").trim().split("\n")[0] || "";
}

/**
 * @param {Host} host @param {string} helper @param {"deploy" | "rollback"} mode @param {Release} release
 * @returns {HelperRun}
 */
function runHelper(host, helper, mode, release) {
  // Operation identities have one-second resolution; never let two runs share one.
  spawnSync("sleep", ["1.05"]);
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

/**
 * Run the repaired helper while a tiny tmpfs, owned as the helper requires, covers the protected
 * backup root, so the backup it takes behind the curtain really fails for lack of space. The helper's
 * own ownership and mode handoff leaves the mount usable but full. Unmounting brings back the real
 * root and the backups beneath it; a container created meanwhile keeps its view until it is next
 * recreated, and nothing in the application reads that root to become ready.
 * @param {Host} host @param {"deploy" | "rollback"} mode @param {Release} release
 * @returns {HelperRun}
 */
function runHelperWithFullBackupRoot(host, mode, release) {
  run("mount", ["-t", "tmpfs", "-o", "size=16k,uid=10001,gid=10001,mode=0700", "ltf-qualification-full-backups", BACKUP_ROOT]);
  try {
    return runHelper(host, REPAIRED_HELPER, mode, release);
  } finally {
    run("umount", ["--lazy", BACKUP_ROOT]);
  }
}

/** @param {string} text */
function causeLine(text) {
  return text.split("\n").find((line) => /no space left on device/i.test(line))?.trim() ?? "";
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
    /** @param {{ username: string, password: string }} [credentials] */
    async login(credentials = { username: ADMIN_USERNAME, password: adminPassword }) {
      const body = JSON.stringify({ username: credentials.username, password: credentials.password });
      const result = await send("/api/login", { method: "POST", body, headers: { "Content-Type": "application/json" } });
      assert.equal(result.status, 200, result.body.toString("utf8"));
      const cookies = [result.headers["set-cookie"] ?? []].flat();
      const session = cookies.map((value) => String(value).split(";", 1)[0]).find((value) => value.startsWith("longtail_forge_session="));
      assert.ok(session, "login must set the session cookie");
      return session;
    },
    /**
     * A visitor account exactly as the public demo publishes it.
     * @param {string} roleName @returns {Promise<{ username: string, password: string }>}
     */
    async visitorAccount(roleName) {
      const result = await send("/api/public-demo/accounts");
      assert.equal(result.status, 200, result.body.toString("utf8"));
      const catalog = /** @type {{ accounts?: { roleName?: string, username?: string, password?: string }[] }} */ (json(result));
      const account = catalog.accounts?.find((entry) => entry.roleName === roleName);
      assert.ok(account?.username && account.password, `the public demo must publish the ${roleName} account`);
      return { username: account.username, password: account.password };
    },
    /** @param {string} cookie @param {string} title */
    async createList(cookie, title) {
      const result = await send("/api/lists", { method: "POST", cookie, body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } });
      assert.equal(result.status, 201, result.body.toString("utf8"));
      const created = /** @type {{ list: { list_id: string } }} */ (json(result));
      return { listId: String(created.list.list_id), title };
    },
    /** The visitor's own display name, which the shared account's login then answers with. @param {string} cookie @param {string} displayName */
    async setDisplayName(cookie, displayName) {
      const result = await send("/api/user/settings", { method: "PUT", cookie, body: JSON.stringify({ displayName }), headers: { "Content-Type": "application/json" } });
      assert.equal(result.status, 200, result.body.toString("utf8"));
      assert.ok(result.body.toString("utf8").includes(displayName), "the visitor's display name must take effect");
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
