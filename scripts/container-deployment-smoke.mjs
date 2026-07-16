import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { get as httpGet } from "node:http";
import os from "node:os";
import path from "node:path";
import { buildContainerImage, runDocker } from "./build-container-image.mjs";

const token = `${process.pid}-${Date.now()}`;
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-container-smoke-"));
const backupDir = path.join(workspace, "backup");
const dataVolume = `ltf-smoke-data-${token}`;
const restoredVolume = `ltf-smoke-restored-${token}`;
const previousContainer = `ltf-smoke-previous-${token}`;
const candidateContainer = `ltf-smoke-candidate-${token}`;
const rollbackContainer = `ltf-smoke-rollback-${token}`;
const previousImage = `longtail-forge:smoke-previous-${token}`;
const candidateImage = `longtail-forge:smoke-candidate-${token}`;
const markerPath = "/var/lib/longtail-forge/files/deployment-smoke-marker.txt";
const markerValue = `persisted-${token}`;
const args = parseArgs(process.argv.slice(2));

await fs.mkdir(backupDir, { recursive: true });
assertDockerAvailable();

try {
  const previous = await buildContainerImage({
    artifactPath: args.previousArtifact,
    noCache: true,
    pull: args.pull,
    tag: previousImage,
  });
  const candidate = await buildContainerImage({
    noCache: true,
    pull: args.pull,
    tag: candidateImage,
  });

  assert.equal(inspectImageUser(previousImage), "10001:10001");
  assert.equal(inspectImageUser(candidateImage), "10001:10001");

  const previousPort = startContainer(previousContainer, previousImage, dataVolume);
  await verifyContainer(previousContainer, previousPort, previous.version);
  runDocker(["exec", previousContainer, "node", "-e", writeMarkerScript(markerPath, markerValue)]);
  runDocker(["stop", previousContainer]);
  snapshotVolume(previousImage, dataVolume, backupDir);
  runDocker(["rm", previousContainer]);

  const candidatePort = startContainer(candidateContainer, candidateImage, dataVolume);
  await verifyContainer(candidateContainer, candidatePort, candidate.version);
  assert.equal(readMarker(candidateContainer, markerPath), markerValue, "candidate should retain persisted Files data");
  runDocker(["stop", candidateContainer]);
  runDocker(["rm", candidateContainer]);

  restoreVolume(previousImage, backupDir, restoredVolume);
  const rollbackPort = startContainer(rollbackContainer, previousImage, restoredVolume);
  await verifyContainer(rollbackContainer, rollbackPort, previous.version);
  assert.equal(readMarker(rollbackContainer, markerPath), markerValue, "restored rollback should retain pre-upgrade data");

  console.log(`Container deployment smoke passed: ${previous.version} -> ${candidate.version} -> restored ${previous.version}.`);
} finally {
  cleanupBindMountedBackup();
  cleanupDockerObjects();
  await fs.rm(workspace, { recursive: true, force: true });
}

function assertDockerAvailable() {
  runDocker(["version", "--format", "{{.Server.Version}}"]);
  runDocker(["compose", "version"]);
}

function startContainer(name, image, volume) {
  runDocker([
    "run", "--detach",
    "--name", name,
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m,mode=0700,uid=10001,gid=10001",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--user", "10001:10001",
    "--env", "LONGTAIL_ENV=test",
    "--env", "HOST=0.0.0.0",
    "--env", "PORT=8001",
    "--env", "LONGTAIL_FILE_SCANNER=none",
    "--env", "LONGTAIL_WORKER_MODE=inline",
    "--volume", `${volume}:/var/lib/longtail-forge`,
    "--publish", "127.0.0.1::8001",
    image,
  ]);
  const portOutput = runDocker(["port", name, "8001/tcp"]);
  const match = portOutput.match(/127\.0\.0\.1:(\d+)/);
  if (!match) {
    throw new Error(`Unable to resolve the published smoke port from: ${portOutput}`);
  }
  return Number(match[1]);
}

async function verifyContainer(name, port, version) {
  await waitForHealthy(name);
  assert.deepEqual(await requestJson(port, "/healthz"), { status: "ok" });
  assert.deepEqual(await requestJson(port, "/readyz"), { status: "ready" });
  assert.equal((await requestJson(port, "/api/app-info")).version, version);
  assert.equal(runDocker(["inspect", "--format", "{{.HostConfig.ReadonlyRootfs}}", name]), "true");
}

async function waitForHealthy(name) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const status = runDocker(["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}", name]);
    if (status === "healthy") {
      return;
    }
    if (["unhealthy", "missing"].includes(status)) {
      throw new Error(`Container ${name} reported health status ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${name} to become healthy.`);
}

function snapshotVolume(image, volume, destination) {
  runDocker([
    "run", "--rm", "--user", "0:0", "--entrypoint", "sh",
    "--volume", `${volume}:/source:ro`,
    "--volume", `${destination}:/backup`,
    image, "-c", "mkdir -p /backup/data && cp -a /source/. /backup/data/",
  ]);
}

function restoreVolume(image, source, volume) {
  runDocker(["volume", "create", volume]);
  runDocker([
    "run", "--rm", "--user", "0:0", "--entrypoint", "sh",
    "--volume", `${source}:/backup:ro`,
    "--volume", `${volume}:/target`,
    image, "-c", "cp -a /backup/data/. /target/ && chown -R 10001:10001 /target",
  ]);
}

function writeMarkerScript(filePath, value) {
  return `const fs=require('node:fs');fs.mkdirSync(${JSON.stringify(path.posix.dirname(filePath))},{recursive:true});fs.writeFileSync(${JSON.stringify(filePath)},${JSON.stringify(value)});`;
}

function readMarker(container, filePath) {
  return runDocker(["exec", container, "node", "-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(filePath)},'utf8'))`]);
}

function inspectImageUser(image) {
  return runDocker(["image", "inspect", "--format", "{{.Config.User}}", image]);
}

function cleanupBindMountedBackup() {
  tryRunDocker([
    "run", "--rm", "--user", "0:0", "--entrypoint", "sh",
    "--volume", `${backupDir}:/backup`,
    previousImage, "-c", "rm -rf /backup/data",
  ]);
}

function cleanupDockerObjects() {
  for (const container of [previousContainer, candidateContainer, rollbackContainer]) {
    tryRunDocker(["rm", "--force", container]);
  }
  for (const volume of [dataVolume, restoredVolume]) {
    tryRunDocker(["volume", "rm", "--force", volume]);
  }
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

function parseArgs(cliArgs) {
  const parsed = { previousArtifact: undefined, pull: false };
  for (let index = 0; index < cliArgs.length; index += 1) {
    if (cliArgs[index] === "--previous-artifact") {
      parsed.previousArtifact = cliArgs[++index];
    } else if (cliArgs[index] === "--pull") {
      parsed.pull = true;
    } else {
      throw new Error(`Unknown container smoke option: ${cliArgs[index]}`);
    }
  }
  return parsed;
}
