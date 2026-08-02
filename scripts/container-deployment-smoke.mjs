import assert from "node:assert/strict";
import { get as httpGet, request as httpRequest } from "node:http";
import path from "node:path";
import { buildContainerImage, runDocker } from "./build-container-image.mjs";

const token = `${process.pid}-${Date.now()}`;
const dataVolume = `ltf-smoke-data-${token}`;
const backupVolume = `ltf-smoke-backup-${token}`;
const restoredVolume = `ltf-smoke-restored-${token}`;
const previousContainer = `ltf-smoke-previous-${token}`;
const candidateContainer = `ltf-smoke-candidate-${token}`;
const rollbackContainer = `ltf-smoke-rollback-${token}`;
const previousImage = `longtail-forge:smoke-previous-${token}`;
const candidateImage = `longtail-forge:smoke-candidate-${token}`;
const markerPath = "/var/lib/longtail-forge/files/deployment-smoke-marker.txt";
const markerValue = `persisted-${token}`;
const smokeUsername = "container-smoke-admin@example.test";
const smokePassword = "Container-Smoke-Password-123!";
const args = parseArgs(process.argv.slice(2));

assertDockerAvailable();

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
    tag: candidateImage,
  });

  assert.equal(inspectImageUser(previousImage), "10001:10001");
  assert.equal(inspectImageUser(candidateImage), "10001:10001");

  const previousPort = startContainer(previousContainer, previousImage, dataVolume);
  await verifyContainer(previousContainer, previousPort, previous.version);
  runDocker(["exec", previousContainer, "node", "-e", writeMarkerScript(markerPath, markerValue)]);
  runDocker(["stop", previousContainer]);
  snapshotVolume(previousImage, dataVolume, backupVolume);
  runDocker(["rm", previousContainer]);

  const candidatePort = startContainer(candidateContainer, candidateImage, dataVolume);
  await verifyContainer(candidateContainer, candidatePort, candidate.version);
  assert.equal(readMarker(candidateContainer, markerPath), markerValue, "candidate should retain persisted Files data");
  const candidateWorkflow = await exerciseCandidateWorkflow(candidatePort);
  runDocker(["restart", candidateContainer]);
  const restartedCandidatePort = resolveContainerPort(candidateContainer);
  await verifyContainer(candidateContainer, restartedCandidatePort, candidate.version);
  await verifyCandidateWorkflowAfterRestart(restartedCandidatePort, candidateWorkflow);
  runDocker(["stop", candidateContainer]);
  runDocker(["rm", candidateContainer]);

  restoreVolume(previousImage, backupVolume, restoredVolume);
  const rollbackPort = startContainer(rollbackContainer, previousImage, restoredVolume);
  await verifyContainer(rollbackContainer, rollbackPort, previous.version);
  assert.equal(readMarker(rollbackContainer, markerPath), markerValue, "restored rollback should retain pre-upgrade data");

  console.log(`Container deployment smoke passed: ${previous.version} -> ${candidate.version} -> restored ${previous.version}.`);
} finally {
  cleanupDockerObjects();
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
    "--env", `SUPER_ADMIN_USERNAME=${smokeUsername}`,
    "--env", `SUPER_ADMIN_PASSWORD=${smokePassword}`,
    "--volume", `${volume}:/var/lib/longtail-forge`,
    "--publish", "127.0.0.1::8001",
    image,
  ]);
  return resolveContainerPort(name);
}

function resolveContainerPort(name) {
  const portOutput = runDocker(["port", name, "8001/tcp"]);
  const match = portOutput.match(/127\.0\.0\.1:(\d+)/);
  if (!match) {
    throw new Error(`Unable to resolve the published smoke port from: ${portOutput}`);
  }
  return Number(match[1]);
}

async function verifyContainer(name, port, version) {
  await waitForHealthy(name);
  assert.deepEqual(await waitForJson(port, "/healthz"), { status: "ok" });
  assert.deepEqual(await waitForJson(port, "/readyz"), { status: "ready" });
  assert.equal((await waitForJson(port, "/api/app-info")).version, version);
  assert.equal(runDocker(["inspect", "--format", "{{.HostConfig.ReadonlyRootfs}}", name]), "true");
  const runtimeProof = JSON.parse(runDocker([
    "exec", name, "node", "-e",
    `const fs=require("node:fs");const Database=require("better-sqlite3");const database=new Database(":memory:");database.close();const nativeBinding=Object.keys(require.cache).find((key)=>key.endsWith(".node"));process.stdout.write(JSON.stringify({driver:require("better-sqlite3/package.json").version,nativeBinding:nativeBinding?.replaceAll("\\\\","/"),python:fs.existsSync("/usr/bin/python3"),make:fs.existsSync("/usr/bin/make"),compiler:fs.existsSync("/usr/bin/g++"),vitest:fs.existsSync("node_modules/vitest"),typescript:fs.existsSync("node_modules/typescript"),eslint:fs.existsSync("node_modules/eslint")}));`,
  ]));
  assert.match(runtimeProof.driver, /^(?:12\.11\.1|13\.0\.1)$/);
  if (runtimeProof.driver === "13.0.1") {
    assert.match(runtimeProof.nativeBinding, /\/prebuilds\/linux-x64\.node$/);
  } else {
    assert.match(runtimeProof.nativeBinding, /\/build\/Release\/better_sqlite3\.node$/);
  }
  assert.deepEqual(
    {
      compiler: runtimeProof.compiler,
      eslint: runtimeProof.eslint,
      make: runtimeProof.make,
      python: runtimeProof.python,
      typescript: runtimeProof.typescript,
      vitest: runtimeProof.vitest,
    },
    {
      compiler: false,
      eslint: false,
      make: false,
      python: false,
      typescript: false,
      vitest: false,
    },
    "the final runtime image should contain neither the native build toolchain nor repository development dependencies",
  );
}

async function exerciseCandidateWorkflow(port) {
  const cookie = await login(port);
  const session = await requestApi(port, "/api/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.body.user.username, smokeUsername);
  assert.ok(session.body.user.workspace_id, "authenticated candidate session should expose its active workspace");

  const existingLists = await requestApi(port, "/api/lists", { cookie });
  assert.equal(existingLists.status, 200);
  assert.ok(Array.isArray(existingLists.body.lists), "candidate should read representative existing module records");

  const createdTitle = `Container qualification ${token}`;
  const created = await requestApi(port, "/api/lists", {
    body: { title: createdTitle },
    cookie,
    method: "POST",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const listId = created.body.list.list_id;
  assert.ok(listId);

  const updatedTitle = `${createdTitle} updated`;
  const updated = await requestApi(port, `/api/lists/${listId}`, {
    body: { title: updatedTitle },
    cookie,
    method: "PUT",
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.list.title, updatedTitle);

  const read = await requestApi(port, `/api/lists/${listId}`, { cookie });
  assert.equal(read.status, 200);
  assert.equal(read.body.list.title, updatedTitle);
  await waitForSearchResult(port, cookie, updatedTitle, listId);

  return { cookie, listId, updatedTitle };
}

async function verifyCandidateWorkflowAfterRestart(port, workflow) {
  const read = await requestApi(port, `/api/lists/${workflow.listId}`, { cookie: workflow.cookie });
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body.list.title, workflow.updatedTitle, "candidate data should persist across container restart");
  await waitForSearchResult(port, workflow.cookie, workflow.updatedTitle, workflow.listId);

  const deleted = await requestApi(port, `/api/lists/${workflow.listId}`, {
    cookie: workflow.cookie,
    method: "DELETE",
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(deleted.body.list.status, "deleted");
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
  assert.ok(sessionCookie, "candidate login should set the session cookie");
  return sessionCookie;
}

async function waitForSearchResult(port, cookie, title, recordId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const response = await requestApi(port, `/api/search?q=${encodeURIComponent(title)}`, { cookie });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    if (response.body.results?.some((result) => result.recordId === recordId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Search did not return persisted candidate record ${recordId}.`);
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
  runDocker(["volume", "create", destination]);
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

function cleanupDockerObjects() {
  for (const container of [previousContainer, candidateContainer, rollbackContainer]) {
    tryRunDocker(["rm", "--force", container]);
  }
  for (const volume of [dataVolume, backupVolume, restoredVolume]) {
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

async function waitForJson(port, pathname) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await requestJson(port, pathname);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${pathname} on port ${port}: ${lastError?.message || "unknown error"}`);
}

function requestApi(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    const headers = {
      accept: "application/json",
      ...(body ? { "content-length": Buffer.byteLength(body), "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
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
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch (error) {
          reject(new Error(`${pathname} returned invalid JSON: ${error.message}`));
          return;
        }
        resolve({
          body: parsed,
          headers: response.headers,
          status: response.statusCode,
        });
      });
    });
    request.once("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function parseArgs(cliArgs) {
  const parsed = { artifact: undefined, previousArtifact: undefined, pull: false };
  for (let index = 0; index < cliArgs.length; index += 1) {
    if (cliArgs[index] === "--artifact") {
      parsed.artifact = cliArgs[++index];
    } else if (cliArgs[index] === "--previous-artifact") {
      parsed.previousArtifact = cliArgs[++index];
    } else if (cliArgs[index] === "--pull") {
      parsed.pull = true;
    } else {
      throw new Error(`Unknown container smoke option: ${cliArgs[index]}`);
    }
  }
  return parsed;
}
