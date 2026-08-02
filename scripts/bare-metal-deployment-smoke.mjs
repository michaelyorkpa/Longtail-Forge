import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { get as httpGet } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { buildRuntimeArtifact } from "./build-runtime-artifact.mjs";
import { inspectRuntimeArtifact } from "./build-container-image.mjs";

const options = parseArgs(process.argv.slice(2));
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-bare-metal-smoke-"));
const previousInstall = path.join(workspace, "releases", "previous");
const candidateInstall = path.join(workspace, "releases", "candidate");
const liveData = path.join(workspace, "live-data");
const backupData = path.join(workspace, "backup", "data");
const restoredData = path.join(workspace, "restored-data");
const markerRelativePath = path.join("files", "deployment-smoke-marker.txt");
const markerValue = `persisted-${process.pid}-${Date.now()}`;
let server;

try {
  const currentArtifact = options.artifact
    ? await inspectRuntimeArtifact(path.resolve(options.artifact))
    : await buildRuntimeArtifact({ outputDir: path.join(workspace, "artifacts") });
  const currentArtifactPath = currentArtifact.artifactPath || currentArtifact.path;
  const previousArtifact = options.previousArtifact
    ? await inspectRuntimeArtifact(path.resolve(options.previousArtifact))
    : await inspectRuntimeArtifact(currentArtifactPath);

  await installArtifact(previousArtifact.path, previousInstall);
  await installArtifact(currentArtifactPath, candidateInstall);
  await assertDevelopmentDependenciesMissing(previousInstall);
  await assertDevelopmentDependenciesMissing(candidateInstall);

  server = await startInstalledRelease(previousInstall, liveData);
  await verifyInstalledRelease(server.port, previousArtifact.version);
  await fs.mkdir(path.dirname(path.join(liveData, markerRelativePath)), { recursive: true });
  await fs.writeFile(path.join(liveData, markerRelativePath), markerValue, "utf8");
  await stopInstalledRelease(server);
  server = undefined;

  await fs.cp(liveData, backupData, { recursive: true, force: true });
  server = await startInstalledRelease(candidateInstall, liveData);
  await verifyInstalledRelease(server.port, currentArtifact.version);
  assert.equal(await fs.readFile(path.join(liveData, markerRelativePath), "utf8"), markerValue);
  await stopInstalledRelease(server);
  server = undefined;

  await fs.cp(backupData, restoredData, { recursive: true, force: true });
  server = await startInstalledRelease(previousInstall, restoredData);
  await verifyInstalledRelease(server.port, previousArtifact.version);
  assert.equal(await fs.readFile(path.join(restoredData, markerRelativePath), "utf8"), markerValue);

  console.log(`Bare-metal deployment smoke passed: ${previousArtifact.version} -> ${currentArtifact.version} -> restored ${previousArtifact.version}.`);
} finally {
  if (server) {
    await stopInstalledRelease(server);
  }
  await fs.rm(workspace, { recursive: true, force: true });
}

async function installArtifact(artifactPath, installDir) {
  await fs.mkdir(installDir, { recursive: true });
  runCommand("tar", ["-xzf", artifactPath, "--strip-components=1", "-C", installDir]);
  runNpm(["ci", "--omit=dev"], installDir);
}

function runNpm(args, cwd) {
  const environment = {
    ...process.env,
    npm_config_cache: process.env.LTF_NPM_CACHE_DIR || path.join(os.tmpdir(), "ltf-npm-cache"),
    npm_config_update_notifier: "false",
  };
  if (process.platform === "win32") {
    runCommand(process.execPath, [resolveWindowsNpmCli(), ...args], cwd, environment);
    return;
  }
  runCommand("npm", args, cwd, environment);
}

function runCommand(command, args, cwd = process.cwd(), env = process.env) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
}

function resolveWindowsNpmCli() {
  return process.env.npm_execpath
    || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

async function assertDevelopmentDependenciesMissing(installDir) {
  const packageJson = JSON.parse(await fs.readFile(path.join(installDir, "package.json"), "utf8"));
  assert.equal(packageJson.devDependencies, undefined);
  for (const dependencyName of ["vitest", "typescript", "eslint", "@playwright/test", "@axe-core/playwright"]) {
    await assertPathMissing(path.join(installDir, "node_modules", ...dependencyName.split("/")));
  }
}

async function assertPathMissing(targetPath) {
  try {
    await fs.access(targetPath);
    assert.fail(`${targetPath} should not be installed.`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function startInstalledRelease(installDir, dataDir) {
  const port = await findAvailablePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: installDir,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      LONGTAIL_ENV: "test",
      LONGTAIL_DATA_DIR: dataDir,
      LONGTAIL_DATABASE_FILE: path.join(dataDir, "longtail-forge.db"),
      LONGTAIL_LOCAL_STORAGE_ROOT: path.join(dataDir, "files"),
      LONGTAIL_FILE_SCANNER: "none",
      LONGTAIL_WORKER_MODE: "inline",
      SUPER_ADMIN_PASSWORD: "Bare-Metal-Smoke-Password-123!",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(child);
  await waitForJson(port, "/readyz", child, output);
  return { child, output, port };
}

async function verifyInstalledRelease(port, version) {
  assert.deepEqual(await requestJson(port, "/healthz"), { status: "ok" });
  assert.deepEqual(await requestJson(port, "/readyz"), { status: "ready" });
  assert.equal((await requestJson(port, "/api/app-info")).version, version);
}

async function stopInstalledRelease(activeServer) {
  if (!activeServer || activeServer.child.exitCode !== null) {
    return;
  }
  activeServer.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => activeServer.child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Server did not stop cleanly.\n${activeServer.output()}`)), 10000)),
  ]);
}

function collectOutput(child) {
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  return () => chunks.join("");
}

async function waitForJson(port, pathname, child, output) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Installed release exited before ${pathname} became ready.\n${output()}`);
    }
    try {
      return await requestJson(port, pathname);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${pathname}.\n${output()}`);
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

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function parseArgs(cliArgs) {
  const parsed = { artifact: undefined, previousArtifact: undefined };
  for (let index = 0; index < cliArgs.length; index += 1) {
    if (cliArgs[index] === "--artifact") {
      parsed.artifact = cliArgs[++index];
    } else if (cliArgs[index] === "--previous-artifact") {
      parsed.previousArtifact = cliArgs[++index];
    } else {
      throw new Error(`Unknown bare-metal smoke option: ${cliArgs[index]}`);
    }
  }
  return parsed;
}
