/* global Blob, FormData, fetch */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { get as httpGet, request as httpRequest } from "node:http";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  buildContainerImage,
  runDocker,
  supportedPlatform,
} from "./build-container-image.mjs";

const token = `${process.pid}-${Date.now()}`;
const projectName = `ltf-smoke-${token}`;
const dataVolume = `ltf-smoke-data-${token}`;
const backupVolume = `ltf-smoke-backup-${token}`;
const recoveryVolume = `ltf-smoke-recovery-${token}`;
const networkName = `ltf-smoke-network-${token}`;
const scannerContainer = `ltf-smoke-clamd-${token}`;
const previousImage = `longtail-forge:smoke-previous-${token}`;
const candidateImage = `longtail-forge:smoke-candidate-${token}`;
const smokeUsername = "container-smoke-admin@example.test";
const smokePassword = "Container-Smoke-Password-123!";
const smokeSecureNotesKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const publicOrigin = "https://container-smoke.example.test";
const fileBody = `Compose lifecycle evidence ${token}`;
const backupArchive = "/var/backups/longtail-forge/pre-upgrade.ltfbackup.tgz";
const preRestoreArchive = "/var/backups/longtail-forge/pre-restore-clean.ltfbackup.tgz";
const args = parseArgs(process.argv.slice(2));
const directHostPort = await reserveHostPort();
const caddyHostPort = await reserveHostPort();
const fixture = createFixture();
const caddyOutput = [];
let caddyProcess;

assertDockerAvailable();
assertNativePlatform();

try {
  const previous = await buildContainerImage({
    artifactPath: args.previousArtifact || args.artifact,
    noCache: true,
    pull: args.pull,
    tag: previousImage,
  });
  const candidate = await buildContainerImage({
    artifactPath: args.artifact,
    noCache: true,
    pull: args.pull,
    releaseMetadataPath: args.releaseMetadata,
    tag: candidateImage,
  });

  assert.equal(inspectImageUser(previous.image), "10001:10001");
  assert.equal(inspectImageUser(candidate.image), "10001:10001");
  createSmokeNetwork();
  writeComposeEnvironment(previous.image, dataVolume, scannerContainer);
  assertComposeConfiguration(previous.image, previous.imageDigest, dataVolume);
  compose(["create", "longtail-forge"]);
  startScannerFixture(candidate.image);
  assertScannerFixture(candidate.image);
  compose(["start", "longtail-forge"]);

  let appContainer = composeContainer();
  let directPort = resolveContainerPort(appContainer, "8001/tcp");
  await verifyContainer(appContainer, directPort, previous.version, previous.imageDigest, dataVolume, backupVolume);
  startCaddyFixture();
  const publicPort = caddyHostPort;
  await verifyPublicBoundary(publicPort, previous.version);

  const baseline = await exerciseWorkflow(publicPort);
  await verifyWorkflow(publicPort, baseline);
  compose(["stop", "longtail-forge"]);
  compose(["start", "longtail-forge"]);
  appContainer = composeContainer();
  directPort = resolveContainerPort(appContainer, "8001/tcp");
  await verifyContainer(appContainer, directPort, previous.version, previous.imageDigest, dataVolume, backupVolume);
  await verifyWorkflow(publicPort, baseline);

  enableMaintenance();
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: true });
  compose(["stop", "longtail-forge"]);
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: false });

  const createdBackup = createBackup(previous.image, dataVolume);
  const inspectedBackup = inspectBackup(previous.image, dataVolume);
  assert.equal(createdBackup.status, "created");
  assert.equal(inspectedBackup.status, "verified");
  assert.equal(inspectedBackup.restorable, true);
  assert.equal(inspectedBackup.manifest.appVersion, previous.version);
  assert.ok(inspectedBackup.manifest.storage.localObjectCount >= 1, "the backup should include representative local Files data");

  writeComposeEnvironment(candidate.image, dataVolume, `missing-${scannerContainer}`);
  compose(["up", "-d", "--no-deps", "--force-recreate", "longtail-forge"]);
  appContainer = composeContainer({ allowStopped: true });
  await waitForFailedCandidate(appContainer);
  assert.match(
    runDocker(["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}", appContainer]),
    new RegExp(`LONGTAIL_CLAMD_HOST=missing-${escapeRegExp(scannerContainer)}`),
    "the failed candidate should carry the deliberately unavailable scanner endpoint",
  );
  compose(["stop", "longtail-forge"]);
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: false });

  writeComposeEnvironment(candidate.image, dataVolume, scannerContainer);
  compose(["up", "-d", "--no-deps", "--force-recreate", "longtail-forge"]);
  appContainer = composeContainer();
  directPort = resolveContainerPort(appContainer, "8001/tcp");
  await verifyContainer(appContainer, directPort, candidate.version, candidate.imageDigest, dataVolume, backupVolume);
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: true, version: candidate.version });
  disableMaintenance();
  await verifyPublicBoundary(publicPort, candidate.version);
  await verifyWorkflow(publicPort, baseline);
  const postUpgrade = await createRepresentativeList(publicPort, `Post-upgrade mutation ${token}`);

  enableMaintenance();
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: true, version: candidate.version });
  compose(["stop", "longtail-forge"]);

  writeComposeEnvironment(previous.image, recoveryVolume, scannerContainer);
  compose(["up", "-d", "--no-deps", "--force-recreate", "longtail-forge"]);
  appContainer = composeContainer();
  directPort = resolveContainerPort(appContainer, "8001/tcp");
  await verifyContainer(appContainer, directPort, previous.version, previous.imageDigest, recoveryVolume, backupVolume);
  compose(["stop", "longtail-forge"]);

  const restored = restoreBackup(previous.image, recoveryVolume);
  assert.equal(restored.status, "restored");
  assert.equal(restored.restoredAppVersion, previous.version);
  inspectBackup(previous.image, recoveryVolume, preRestoreArchive);
  normalizeRestoredVolumePermissions(previous.image, recoveryVolume);

  compose(["up", "-d", "--no-deps", "--force-recreate", "longtail-forge"]);
  appContainer = composeContainer();
  directPort = resolveContainerPort(appContainer, "8001/tcp");
  await verifyContainer(appContainer, directPort, previous.version, previous.imageDigest, recoveryVolume, backupVolume);
  await verifyDatabaseIntegrity(appContainer);
  await verifyMaintenanceCurtain(publicPort, { diagnosticsAvailable: true, version: previous.version });
  disableMaintenance();
  await verifyPublicBoundary(publicPort, previous.version);
  await verifyWorkflow(publicPort, baseline);
  await assertListMissing(publicPort, postUpgrade.listId);

  console.log(`Container deployment smoke passed natively on ${candidate.platform}: ${previous.version} -> failed ${candidate.version} -> ${candidate.version} -> restored ${previous.version}.`);
  console.log(`Candidate image digest: ${candidate.imageDigest}`);
  console.log(`Candidate provenance: ${candidate.provenancePath}`);
  console.log(`Verified backup: ${createdBackup.archiveSha256}`);
} finally {
  stopCaddyFixture();
  cleanupDockerObjects();
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function assertDockerAvailable() {
  runDocker(["version", "--format", "{{.Server.Version}}"]);
  runDocker(["compose", "version"]);
}

function assertNativePlatform() {
  const serverPlatform = runDocker(["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"]);
  assert.equal(
    serverPlatform,
    supportedPlatform,
    `Container release proof must run natively on ${supportedPlatform}; manifest-only or emulated builds are not accepted.`,
  );
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-compose-lifecycle-"));
  const assetRoot = path.join(root, "asset");
  const maintenanceRoot = path.join(root, "maintenance");
  const operatorRoot = path.join(maintenanceRoot, "operator");
  const deploymentRoot = path.join(maintenanceRoot, "deployment");
  const backupRoot = path.join(root, "backups");
  fs.mkdirSync(assetRoot, { recursive: true });
  fs.mkdirSync(operatorRoot, { recursive: true });
  fs.mkdirSync(deploymentRoot, { recursive: true });
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.copyFileSync(
    path.resolve("scripts/release/longtail-forge-maintenance.html"),
    path.join(assetRoot, "maintenance.html"),
  );

  const appEnvironmentPath = path.join(root, "app.env");
  const composeEnvironmentPath = path.join(root, "compose.env");
  const composeOverridePath = path.join(root, "compose.smoke.yaml");
  const caddyfilePath = path.join(root, "Caddyfile");
  fs.writeFileSync(appEnvironmentPath, applicationEnvironment(), "utf8");
  fs.writeFileSync(composeOverridePath, composeOverride(), "utf8");
  fs.writeFileSync(caddyfilePath, caddyConfiguration({ assetRoot, maintenanceRoot }), "utf8");
  return {
    appEnvironmentPath,
    assetRoot,
    backupRoot,
    caddyfilePath,
    composeEnvironmentPath,
    composeOverridePath,
    deploymentRoot,
    maintenanceRoot,
    operatorMarker: path.join(operatorRoot, "maintenance.on"),
    root,
  };
}

function applicationEnvironment() {
  return [
    "LONGTAIL_ENV=production",
    `LONGTAIL_PUBLIC_URL=${publicOrigin}`,
    "LONGTAIL_SESSION_COOKIE_SECURE=true",
    "LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
    "LONGTAIL_AUTH_THROTTLE_ENABLED=true",
    "LONGTAIL_LOG_LEVEL=info",
    "LONGTAIL_DATABASE_PROVIDER=sqlite",
    "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
    "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
    "LONGTAIL_STORAGE_PROVIDER=local",
    "LONGTAIL_WORKER_MODE=inline",
    `SUPER_ADMIN_USERNAME=${smokeUsername}`,
    `SUPER_ADMIN_PASSWORD=${smokePassword}`,
    `LONGTAIL_SECURE_NOTES_MASTER_KEY=${smokeSecureNotesKey}`,
    "",
  ].join("\n");
}

function composeOverride() {
  return `services:
  longtail-forge:
    volumes:
      - longtail-data:/var/lib/longtail-forge
      - longtail-backup:/var/backups/longtail-forge

volumes:
  longtail-backup:
    name: \${LONGTAIL_BACKUP_VOLUME}
`;
}

function caddyConfiguration({ assetRoot, maintenanceRoot }) {
  return `{
  admin off
  auto_https off
}

(longtail_maintenance_curtain) {
  header {
    Cache-Control "no-store"
    Content-Security-Policy "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'"
    Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
    Referrer-Policy "no-referrer"
    Retry-After "60"
    Strict-Transport-Security "max-age=300"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
  }
  rewrite * /maintenance.html
  file_server {
    root ${quoteCaddyPath(assetRoot)}
    status 503
  }
}

(longtail_unavailable_diagnostic) {
  header {
    Cache-Control "no-store"
    Content-Type "application/json"
    Retry-After "60"
    Strict-Transport-Security "max-age=300"
    X-Content-Type-Options "nosniff"
  }
  respond \`{"status":"unavailable"}\` 503
}

:${caddyHostPort} {
  bind 127.0.0.1
  @longtail_diagnostic path /healthz /readyz /api/app-info
  handle @longtail_diagnostic {
    reverse_proxy 127.0.0.1:${directHostPort} {
      header_up X-Forwarded-Host container-smoke.example.test
      header_up X-Forwarded-Proto https
    }
  }

  @longtail_maintenance_active file {
    root ${quoteCaddyPath(maintenanceRoot)}
    try_files /operator/maintenance.on /deployment/maintenance.on
  }
  handle @longtail_maintenance_active {
    import longtail_maintenance_curtain
  }

  handle {
    reverse_proxy 127.0.0.1:${directHostPort} {
      header_up X-Forwarded-Host container-smoke.example.test
      header_up X-Forwarded-Proto https
    }
  }

  handle_errors {
    @longtail_diagnostic_failure path /healthz /readyz /api/app-info
    handle @longtail_diagnostic_failure {
      import longtail_unavailable_diagnostic
    }
    handle {
      import longtail_maintenance_curtain
    }
  }
}
`;
}

function writeComposeEnvironment(image, volume, scannerHost) {
  const subnetOctet = 32 + (process.pid % 180);
  fs.writeFileSync(fixture.composeEnvironmentPath, [
    `LONGTAIL_IMAGE=${image}`,
    `LONGTAIL_ENV_FILE=${dockerPath(fixture.appEnvironmentPath)}`,
    `LONGTAIL_BACKUP_DIR=${dockerPath(fixture.backupRoot)}`,
    `LONGTAIL_BACKUP_VOLUME=${backupVolume}`,
    `LONGTAIL_DATA_VOLUME=${volume}`,
    `LONGTAIL_DOCKER_NETWORK=${networkName}`,
    `LONGTAIL_DOCKER_SUBNET=172.29.${subnetOctet}.0/24`,
    `LONGTAIL_DOCKER_GATEWAY=172.29.${subnetOctet}.1`,
    `LONGTAIL_DOCKER_TRUST_PROXY=172.29.${subnetOctet}.1/32`,
    `LONGTAIL_HOST_PORT=${directHostPort}`,
    "LONGTAIL_ENV=production",
    "LONGTAIL_FILE_SCANNER=clamd",
    `LONGTAIL_CLAMD_HOST=${scannerHost}`,
    "LONGTAIL_CLAMD_PORT=3310",
    "",
  ].join("\n"), "utf8");
}

function createSmokeNetwork() {
  const subnetOctet = 32 + (process.pid % 180);
  runDocker([
    "network", "create",
    "--driver", "bridge",
    "--subnet", `172.29.${subnetOctet}.0/24`,
    "--gateway", `172.29.${subnetOctet}.1`,
    networkName,
  ]);
}

function compose(composeArgs, options = {}) {
  return runDocker([
    "compose",
    "--project-name", projectName,
    "--file", path.resolve("compose.yaml"),
    "--file", fixture.composeOverridePath,
    "--env-file", fixture.composeEnvironmentPath,
    ...composeArgs,
  ], options);
}

function assertComposeConfiguration(image, imageDigest, volume) {
  assert.equal(inspectImageDigest(image), imageDigest, "the generated local tag must resolve to the reviewed image ID");
  compose(["config", "--quiet"]);
  const rendered = compose(["config"]);
  for (const requirement of [
    `image: ${image}`,
    "host_ip: 127.0.0.1",
    "read_only: true",
    "no-new-privileges:true",
    "target: /var/lib/longtail-forge",
    "target: /var/backups/longtail-forge",
  ]) {
    assert.match(rendered, new RegExp(escapeRegExp(requirement)));
  }
  assert.match(rendered, new RegExp(`longtail-data:\\s+name: ${escapeRegExp(volume)}`));
  assert.match(rendered, new RegExp(`longtail-backup:\\s+name: ${escapeRegExp(backupVolume)}`));
  assert.doesNotMatch(rendered, /published:\s*8001/, "Compose must not publish Node on every host interface");
}

function startScannerFixture(image) {
  const scannerScript = `const net=require('node:net');net.createServer((socket)=>{let buffer=Buffer.alloc(0);let scanning=false;socket.on('data',(chunk)=>{buffer=Buffer.concat([buffer,chunk]);if(!scanning&&buffer.subarray(0,6).toString()==='zPING\\0'){socket.end('PONG\\0');return;}if(!scanning&&buffer.length>=10&&buffer.subarray(0,10).toString()==='zINSTREAM\\0'){scanning=true;buffer=buffer.subarray(10);}if(scanning){while(buffer.length>=4){const size=buffer.readUInt32BE(0);if(size===0){socket.end('stream: OK\\0');return;}if(buffer.length<4+size)return;buffer=buffer.subarray(4+size);}}});}).listen(3310,'0.0.0.0');`;
  runDocker([
    "run", "--detach",
    "--name", scannerContainer,
    "--network", networkName,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "10001:10001",
    "--entrypoint", "node",
    image,
    "-e", scannerScript,
  ]);
}

function assertScannerFixture(image) {
  const probe = `const net=require('node:net');const socket=net.connect({host:${JSON.stringify(scannerContainer)},port:3310},()=>socket.end('zPING\\0'));let output='';socket.on('data',(chunk)=>output+=chunk);socket.on('end',()=>{if(!output.includes('PONG'))process.exitCode=1;else process.stdout.write(output)});socket.setTimeout(5000,()=>{socket.destroy();process.exitCode=1});`;
  assert.match(runDocker([
    "run", "--rm",
    "--network", networkName,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "10001:10001",
    "--entrypoint", "node",
    image,
    "-e", probe,
  ]), /PONG/);
}

function startCaddyFixture() {
  const version = spawnSync("caddy", ["version"], { encoding: "utf8", windowsHide: true });
  assert.equal(version.status, 0, String(version.stderr || version.error));
  assert.match(version.stdout, /^v2\.11\.4\b/);
  const validation = spawnSync("caddy", ["validate", "--config", fixture.caddyfilePath], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(validation.status, 0, String(validation.stderr || validation.stdout || validation.error));
  caddyProcess = spawn("caddy", ["run", "--config", fixture.caddyfilePath], {
    cwd: fixture.root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  caddyProcess.stdout.on("data", (chunk) => caddyOutput.push(chunk));
  caddyProcess.stderr.on("data", (chunk) => caddyOutput.push(chunk));
}

function stopCaddyFixture() {
  if (caddyProcess && caddyProcess.exitCode === null) {
    caddyProcess.kill();
  }
}

function composeContainer(options = {}) {
  const container = compose(["ps", "-q", ...(options.allowStopped ? ["--all"] : []), "longtail-forge"]);
  assert.ok(container, "Compose should report the longtail-forge service container");
  return container;
}

function resolveContainerPort(name, containerPort) {
  const portOutput = runDocker(["port", name, containerPort]);
  const match = portOutput.match(/127\.0\.0\.1:(\d+)/);
  if (!match) {
    throw new Error(`Unable to resolve the published smoke port from: ${portOutput}`);
  }
  return Number(match[1]);
}

async function verifyContainer(name, port, version, expectedImageDigest, expectedDataVolume, expectedBackupVolume) {
  await waitForHealthy(name);
  assert.deepEqual(await waitForJson(port, "/healthz"), { status: "ok" });
  assert.deepEqual(await waitForJson(port, "/readyz"), { status: "ready" });
  assert.equal((await waitForJson(port, "/api/app-info")).version, version);
  assert.equal(runDocker(["inspect", "--format", "{{.Config.User}}", name]), "10001:10001");
  assert.equal(runDocker(["inspect", "--format", "{{.Image}}", name]), expectedImageDigest);
  assert.equal(runDocker(["inspect", "--format", "{{.HostConfig.ReadonlyRootfs}}", name]), "true");
  assert.equal(runDocker(["inspect", "--format", "{{json .HostConfig.CapDrop}}", name]), '["ALL"]');
  assert.match(runDocker(["inspect", "--format", "{{json .HostConfig.SecurityOpt}}", name]), /no-new-privileges/);

  const mounts = JSON.parse(runDocker(["inspect", "--format", "{{json .Mounts}}", name]));
  const dataMount = mounts.find((mount) => mount.Destination === "/var/lib/longtail-forge");
  const backupMount = mounts.find((mount) => mount.Destination === "/var/backups/longtail-forge");
  assert.equal(dataMount?.Name, expectedDataVolume);
  assert.equal(backupMount?.Name, expectedBackupVolume);
  assert.notEqual(dataMount?.Name, backupMount?.Name, "backup state must remain separate from live state");

  const runtimeProof = JSON.parse(runDocker([
    "exec", name, "node", "-e",
    `const fs=require("node:fs");const Database=require("better-sqlite3");const database=new Database(":memory:");database.close();const nativeBinding=Object.keys(require.cache).find((key)=>key.endsWith(".node"));process.stdout.write(JSON.stringify({driver:require("better-sqlite3/package.json").version,nativeBinding:nativeBinding?.replaceAll("\\\\","/"),database:fs.existsSync("/var/lib/longtail-forge/longtail-forge.db"),wal:fs.existsSync("/var/lib/longtail-forge/longtail-forge.db-wal"),shm:fs.existsSync("/var/lib/longtail-forge/longtail-forge.db-shm"),python:fs.existsSync("/usr/bin/python3"),make:fs.existsSync("/usr/bin/make"),compiler:fs.existsSync("/usr/bin/g++"),vitest:fs.existsSync("node_modules/vitest"),typescript:fs.existsSync("node_modules/typescript"),eslint:fs.existsSync("node_modules/eslint")}));`,
  ]));
  assert.equal(runtimeProof.database, true);
  assert.equal(runtimeProof.wal, true, "the live SQLite WAL should stay inside the durable data volume");
  assert.equal(runtimeProof.shm, true, "the live SQLite SHM should stay inside the durable data volume");
  assert.match(runtimeProof.driver, /^(?:12\.11\.1|13\.0\.1)$/);
  assert.match(runtimeProof.nativeBinding, /\/(?:prebuilds\/linux-x64|build\/Release\/better_sqlite3)\.node$/);
  assert.deepEqual(
    {
      compiler: runtimeProof.compiler,
      eslint: runtimeProof.eslint,
      make: runtimeProof.make,
      python: runtimeProof.python,
      typescript: runtimeProof.typescript,
      vitest: runtimeProof.vitest,
    },
    { compiler: false, eslint: false, make: false, python: false, typescript: false, vitest: false },
    "the final runtime image should contain neither the native build toolchain nor repository development dependencies",
  );
}

async function verifyPublicBoundary(port, version) {
  const health = await waitForHttp(port, "/healthz");
  const ready = await waitForHttp(port, "/readyz");
  const appInfo = await waitForHttp(port, "/api/app-info");
  assert.equal(health.status, 200);
  assert.deepEqual(health.json, { status: "ok" });
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.json, { status: "ready" });
  assert.equal(appInfo.status, 200);
  assert.equal(appInfo.json.version, version);
}

async function verifyMaintenanceCurtain(port, options = {}) {
  const page = await requestHttp(port, "/login");
  assert.equal(page.status, 503);
  assert.match(page.text, /temporarily unavailable/i);
  assert.equal(page.headers["cache-control"], "no-store");
  assert.equal(page.headers["retry-after"], "60");

  for (const pathname of ["/healthz", "/readyz", "/api/app-info"]) {
    const response = await requestHttp(port, pathname);
    if (options.diagnosticsAvailable) {
      assert.equal(response.status, 200, `${pathname} should retain real Node status through maintenance`);
      if (pathname === "/api/app-info" && options.version) {
        assert.equal(response.json.version, options.version);
      }
    } else {
      assert.equal(response.status, 503, `${pathname} should report unavailable while Node is stopped`);
      assert.deepEqual(response.json, { status: "unavailable" });
      assert.equal(response.headers["cache-control"], "no-store");
    }
  }
}

function enableMaintenance() {
  fs.writeFileSync(fixture.operatorMarker, "", "utf8");
}

function disableMaintenance() {
  fs.rmSync(fixture.operatorMarker, { force: true });
}

async function exerciseWorkflow(port) {
  const cookie = await login(port);
  const session = await requestApi(port, "/api/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.body.user.username, smokeUsername);
  assert.ok(session.body.user.workspace_id, "authenticated Compose session should expose its active workspace");

  const list = await createRepresentativeList(port, `Compose lifecycle ${token}`, cookie);
  const upload = await uploadRepresentativeFile(port, cookie, list.listId);
  await waitForFileAvailable(port, cookie, upload.fileId);

  return {
    attachmentId: upload.attachmentId,
    cookie,
    fileId: upload.fileId,
    fileText: fileBody,
    listId: list.listId,
    title: list.title,
  };
}

async function createRepresentativeList(port, title, existingCookie = "") {
  const cookie = existingCookie || await login(port);
  const created = await requestApi(port, "/api/lists", {
    body: { title },
    cookie,
    method: "POST",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { cookie, listId: created.body.list.list_id, title };
}

async function uploadRepresentativeFile(port, cookie, listId) {
  const form = new FormData();
  form.append("moduleId", "lists");
  form.append("targetType", "list");
  form.append("targetId", listId);
  form.append("visibility", "private");
  form.append("displayName", "Compose lifecycle evidence");
  form.append("file", new Blob([fileBody], { type: "text/plain" }), "compose-lifecycle.txt");
  const response = await fetch(`http://127.0.0.1:${port}/api/files/upload`, {
    body: form,
    headers: requestHeaders(cookie),
    method: "POST",
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return {
    attachmentId: body.attachment.fileAttachmentId,
    fileId: body.file.fileId,
  };
}

async function waitForFileAvailable(port, cookie, fileId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const response = await requestApi(port, `/api/files/${fileId}`, { cookie });
    if (response.status === 200
        && response.body.file.status === "available"
        && ["not_required", "passed"].includes(response.body.file.scanStatus)) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for uploaded file ${fileId} to pass its scanner lifecycle.`);
}

async function verifyWorkflow(port, workflow) {
  const cookie = await login(port);
  const read = await requestApi(port, `/api/lists/${workflow.listId}`, { cookie });
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body.list.title, workflow.title);

  const preview = await requestApi(port, `/api/files/attachments/${workflow.attachmentId}/preview`, { cookie });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const download = await requestBuffer(port, `/api/files/${workflow.fileId}/download`, { cookie });
  assert.equal(download.status, 200);
  assert.equal(download.body.toString("utf8"), workflow.fileText);
}

async function assertListMissing(port, listId) {
  const cookie = await login(port);
  const response = await requestApi(port, `/api/lists/${listId}`, { cookie });
  assert.equal(response.status, 404, "restored rollback must not retain post-upgrade database state");
}

async function login(port) {
  const response = await requestApi(port, "/api/login", {
    body: { password: smokePassword, username: smokeUsername },
    method: "POST",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const sessionCookie = (response.headers["set-cookie"] || [])
    .map((value) => String(value).split(";", 1)[0])
    .find((value) => value.startsWith("longtail_forge_session="));
  assert.ok(sessionCookie, "Compose login should set the session cookie");
  return sessionCookie;
}

function createBackup(image, volume) {
  return runBackupCommand(image, volume, [
    "create",
    "--confirm-stopped",
    "--database", "/var/lib/longtail-forge/longtail-forge.db",
    "--files-root", "/var/lib/longtail-forge/files",
    "--output", backupArchive,
    "--audit-log", "/var/backups/longtail-forge/backup-operations.jsonl",
  ]);
}

function inspectBackup(image, volume, archive = backupArchive) {
  return runBackupCommand(image, volume, [
    "inspect",
    "--archive", archive,
  ]);
}

function restoreBackup(image, volume) {
  return runBackupCommand(image, volume, [
    "restore",
    "--confirm-stopped",
    "--confirm-destructive", "RESTORE LONGTAIL FORGE BACKUP",
    "--archive", backupArchive,
    "--database", "/var/lib/longtail-forge/longtail-forge.db",
    "--files-root", "/var/lib/longtail-forge/files",
    "--pre-restore-backup", preRestoreArchive,
    "--audit-log", "/var/backups/longtail-forge/backup-operations.jsonl",
  ]);
}

function runBackupCommand(image, volume, commandArgs) {
  const output = runDocker([
    "run", "--rm",
    "--network", networkName,
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "10001:10001",
    "--env", "LONGTAIL_ENV=production",
    "--env", `LONGTAIL_PUBLIC_URL=${publicOrigin}`,
    "--env", "LONGTAIL_SESSION_COOKIE_SECURE=true",
    "--env", "LONGTAIL_HSTS_MAX_AGE_SECONDS=300",
    "--env", "LONGTAIL_AUTH_THROTTLE_ENABLED=true",
    "--env", "LONGTAIL_LOG_LEVEL=info",
    "--env", `LONGTAIL_SECURE_NOTES_MASTER_KEY=${smokeSecureNotesKey}`,
    "--env", `SUPER_ADMIN_USERNAME=${smokeUsername}`,
    "--env", `SUPER_ADMIN_PASSWORD=${smokePassword}`,
    "--env", "TRUST_PROXY=172.29.0.1/32",
    "--env", "LONGTAIL_DATABASE_PROVIDER=sqlite",
    "--env", "LONGTAIL_SQLITE_FOREIGN_KEYS=on",
    "--env", "LONGTAIL_SQLITE_JOURNAL_MODE=wal",
    "--env", "LONGTAIL_STORAGE_PROVIDER=local",
    "--env", "LONGTAIL_WORKER_MODE=inline",
    "--env", "LONGTAIL_FILE_SCANNER=clamd",
    "--env", `LONGTAIL_CLAMD_HOST=${scannerContainer}`,
    "--env", "LONGTAIL_CLAMD_PORT=3310",
    "--volume", `${volume}:/var/lib/longtail-forge`,
    "--volume", `${backupVolume}:/var/backups/longtail-forge`,
    image,
    "node", "scripts/backup.mjs",
    ...commandArgs,
  ]);
  return JSON.parse(output);
}

function normalizeRestoredVolumePermissions(image, volume) {
  const output = runDocker([
    "run", "--rm",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "10001:10001",
    "--volume", `${volume}:/var/lib/longtail-forge`,
    "--entrypoint", "node",
    image,
    "-e",
    `const fs=require("node:fs");const root="/var/lib/longtail-forge/files";fs.chmodSync(root,0o700);const stats=fs.statSync(root);process.stdout.write(JSON.stringify({gid:stats.gid,mode:stats.mode&0o777,uid:stats.uid}));`,
  ]);
  assert.deepEqual(JSON.parse(output), { gid: 10001, mode: 0o700, uid: 10001 });
}

async function verifyDatabaseIntegrity(container) {
  const result = JSON.parse(runDocker([
    "exec", container, "node", "-e",
    `const Database=require("better-sqlite3");const db=new Database("/var/lib/longtail-forge/longtail-forge.db",{readonly:true});const integrity=db.pragma("integrity_check").map((row)=>Object.values(row)[0]);const foreignKeys=db.pragma("foreign_key_check");const migrations=db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all();db.close();process.stdout.write(JSON.stringify({integrity,foreignKeys,migrations}));`,
  ]));
  assert.deepEqual(result.integrity, ["ok"]);
  assert.deepEqual(result.foreignKeys, []);
  assert.ok(result.migrations.length > 0);
  assert.ok(result.migrations.every((migration) => migration.version && migration.checksum));
}

async function waitForHealthy(name) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const status = runDocker(["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}", name]);
    if (status === "healthy") return;
    if (status === "missing") throw new Error(`Container ${name} has no health check.`);
    const running = runDocker(["inspect", "--format", "{{.State.Running}}", name]);
    if (running !== "true") {
      throw new Error(`Container ${name} stopped before becoming healthy: ${runDocker(["logs", name])}`);
    }
    await delay(500);
  }
  const state = runDocker(["inspect", "--format", "{{json .State}}", name]);
  throw new Error(`Timed out waiting for ${name} to become healthy. State: ${state}. Logs: ${runDocker(["logs", name])}`);
}

async function waitForFailedCandidate(name) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = JSON.parse(runDocker(["inspect", "--format", "{{json .State}}", name]));
    if (state.Restarting === true && state.ExitCode !== 0) return;
    await delay(250);
  }
  const state = runDocker(["inspect", "--format", "{{json .State}}", name]);
  throw new Error(`Timed out waiting for failed candidate ${name} to enter its restart loop. State: ${state}. Logs: ${runDocker(["logs", name])}`);
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpGet(`http://127.0.0.1:${port}${pathname}`, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`${pathname} returned ${response.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once("error", reject);
  });
}

async function waitForJson(port, pathname) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await requestJson(port, pathname);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for ${pathname} on port ${port}: ${lastError?.message || "unknown error"}`);
}

async function waitForHttp(port, pathname) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await requestHttp(port, pathname);
      if (response.status) return response;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${pathname} on port ${port}: ${lastError?.message || "unknown error"}`);
}

function requestHttp(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpGet({
      headers: { Host: "container-smoke.example.test" },
      host: "127.0.0.1",
      path: pathname,
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ body: Buffer.from(text), headers: response.headers, json, status: response.statusCode, text });
      });
    });
    request.once("error", reject);
  });
}

function requestApi(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    const headers = {
      ...requestHeaders(options.cookie),
      accept: "application/json",
      ...(body ? { "content-length": Buffer.byteLength(body), "content-type": "application/json" } : {}),
    };
    const request = httpRequest({
      headers,
      host: "127.0.0.1",
      method: options.method || "GET",
      path: pathname,
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (error) {
          reject(new Error(`${pathname} returned invalid JSON: ${error.message}`));
          return;
        }
        resolve({ body: parsed, headers: response.headers, status: response.statusCode });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestBuffer(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      headers: requestHeaders(options.cookie),
      host: "127.0.0.1",
      method: "GET",
      path: pathname,
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({ body: Buffer.concat(chunks), headers: response.headers, status: response.statusCode }));
    });
    request.once("error", reject);
    request.end();
  });
}

function requestHeaders(cookie = "") {
  return {
    Host: "container-smoke.example.test",
    Origin: publicOrigin,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function inspectImageUser(image) {
  return runDocker(["image", "inspect", "--format", "{{.Config.User}}", image]);
}

function inspectImageDigest(image) {
  return runDocker(["image", "inspect", "--format", "{{.Id}}", image]);
}

function cleanupDockerObjects() {
  for (const container of [scannerContainer]) {
    tryRunDocker(["rm", "--force", container]);
  }
  try {
    compose(["down", "--remove-orphans"]);
  } catch {
    // Explicit cleanup below owns every generated object even if Compose cannot load the fixture.
  }
  for (const volume of [dataVolume, backupVolume, recoveryVolume]) {
    tryRunDocker(["volume", "rm", "--force", volume]);
  }
  tryRunDocker(["network", "rm", networkName]);
  for (const image of [previousImage, candidateImage]) {
    tryRunDocker(["image", "rm", "--force", image]);
  }
}

function tryRunDocker(dockerArgs) {
  try {
    runDocker(dockerArgs);
  } catch {
    // Best-effort cleanup must not hide the original smoke failure.
  }
}

function quoteCaddyPath(filePath) {
  return JSON.stringify(path.resolve(filePath).replaceAll("\\", "/"));
}

function dockerPath(value) {
  return path.resolve(value).replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reserveHostPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function parseArgs(cliArgs) {
  const parsed = { artifact: undefined, previousArtifact: undefined, pull: false, releaseMetadata: undefined };
  for (let index = 0; index < cliArgs.length; index += 1) {
    if (["--artifact", "--previous-artifact", "--release-metadata"].includes(cliArgs[index])) {
      const argument = cliArgs[index];
      const value = cliArgs[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--artifact") parsed.artifact = value;
      else if (argument === "--previous-artifact") parsed.previousArtifact = value;
      else parsed.releaseMetadata = value;
      index += 1;
    } else if (cliArgs[index] === "--pull") {
      parsed.pull = true;
    } else {
      throw new Error(`Unknown container smoke option: ${cliArgs[index]}`);
    }
  }
  return parsed;
}
