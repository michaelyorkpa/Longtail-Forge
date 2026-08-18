import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { get as httpGet } from "node:http";
import os from "node:os";
import path from "node:path";
import { buildRuntimeArtifact } from "./build-runtime-artifact.mjs";
import { inspectRuntimeArtifact } from "./build-container-image.mjs";

/**
 * The smoke server is spawned with piped stdout and stderr, so both streams are
 * always present.
 * @typedef {import("node:child_process").ChildProcessByStdio<null, import("node:stream").Readable, import("node:stream").Readable>} SmokeServerProcess
 */

/**
 * Options parsed from the runtime artifact smoke command line.
 * @typedef {object} RuntimeArtifactSmokeOptions
 * @property {string | undefined} artifact
 */

/**
 * The runtime artifact under smoke: a freshly built artifact reports
 * `artifactPath`, while an inspected tarball reports `path`.
 * @typedef {object} SmokeArtifactDescriptor
 * @property {string} [artifactPath]
 * @property {string} [path]
 */

/**
 * A completed HTTP text response captured by the smoke client.
 * @typedef {object} SmokeTextResponse
 * @property {string} body
 * @property {number | undefined} statusCode
 */

const options = parseArgs(process.argv.slice(2));
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-runtime-smoke-"));
const artifactDir = path.join(workspace, "artifact");
const installDir = path.join(workspace, "install");
const dataDir = path.join(workspace, "data");
const port = await findAvailablePort();
const smokeSuperAdminPassword = "Runtime-Artifact-Smoke-Password-123!";
/** @type {SmokeServerProcess | undefined} */
let server;

try {
  const artifact = options.artifact
    ? await inspectRuntimeArtifact(path.resolve(options.artifact))
    : await buildRuntimeArtifact({ outputDir: artifactDir });
  await fs.mkdir(installDir, { recursive: true });
  const artifactPath = /** @type {string} */ (/** @type {SmokeArtifactDescriptor} */ (artifact).artifactPath || /** @type {SmokeArtifactDescriptor} */ (artifact).path);
  runCommand("tar", ["-xzf", artifactPath, "--strip-components=1", "-C", installDir], workspace);
  runNpm(["ci", "--omit=dev"], installDir);

  const installedPackage = JSON.parse(await fs.readFile(path.join(installDir, "package.json"), "utf8"));
  assert.equal(installedPackage.version, artifact.version);
  assert.equal(installedPackage.scripts.start, "node server.js");
  assert.equal(installedPackage.devDependencies, undefined);
  for (const dependencyName of ["vitest", "typescript", "eslint", "@playwright/test", "@axe-core/playwright"]) {
    await assertPathMissing(path.join(installDir, "node_modules", ...dependencyName.split("/")));
  }

  server = spawn(process.execPath, ["server.js"], {
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
      SUPER_ADMIN_PASSWORD: smokeSuperAdminPassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(server);
  const appInfo = await waitForJson(`http://127.0.0.1:${port}/api/app-info`, server, output);
  assert.equal(appInfo.version, artifact.version);
  assert.match(appInfo.correspondingSourceUrl, new RegExp(`/tree/v${escapeRegExp(artifact.version)}$`));
  const ready = await waitForJson(`http://127.0.0.1:${port}/readyz`, server, output);
  assert.deepEqual(ready, { status: "ready" });
  const terms = await requestText(`http://127.0.0.1:${port}/terms.html`);
  const privacy = await requestText(`http://127.0.0.1:${port}/privacy.html`);
  assert.equal(terms.statusCode, 200);
  assert.match(terms.body, /Operator Terms Template/);
  assert.equal(privacy.statusCode, 200);
  assert.match(privacy.body, /Operator Privacy Notice Template/);

  console.log(`Runtime artifact smoke passed for ${artifact.version}.`);
  console.log(`Artifact SHA-256: ${artifact.checksum}`);
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => /** @type {SmokeServerProcess} */ (server).once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  await fs.rm(workspace, { recursive: true, force: true });
}

/**
 * @param {readonly string[]} args
 * @param {string} cwd
 */
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

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 */
function runCommand(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
}

function resolveWindowsNpmCli() {
  return process.env.npm_execpath
    || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

/**
 * @param {readonly string[]} cliArgs
 * @returns {RuntimeArtifactSmokeOptions}
 */
function parseArgs(cliArgs) {
  /** @type {RuntimeArtifactSmokeOptions} */
  const parsed = { artifact: undefined };
  for (let index = 0; index < cliArgs.length; index += 1) {
    if (cliArgs[index] === "--artifact") {
      parsed.artifact = cliArgs[++index];
    } else {
      throw new Error(`Unknown runtime artifact smoke option: ${cliArgs[index]}`);
    }
  }
  return parsed;
}

/**
 * @param {string} targetPath
 */
async function assertPathMissing(targetPath) {
  try {
    await fs.access(targetPath);
    assert.fail(`${targetPath} should not be installed in the runtime artifact.`);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * @param {SmokeServerProcess} child
 * @returns {() => string}
 */
function collectOutput(child) {
  /** @type {string[]} */
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  return () => chunks.join("");
}

/**
 * @param {string} url
 * @param {SmokeServerProcess} child
 * @param {() => string} output
 * @returns {Promise<Record<string, string>>}
 */
async function waitForJson(url, child, output) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Runtime artifact exited before ${url} became ready.\n${output()}`);
    }
    try {
      const response = await requestJson(url);
      if (response) {
        return response;
      }
    } catch {
      // The clean server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${output()}`);
}

/**
 * @param {string} url
 * @returns {Promise<Record<string, string> | null>}
 */
function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        if (/** @type {number} */ (response.statusCode) < 200 || /** @type {number} */ (response.statusCode) >= 300) {
          resolve(null);
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

/**
 * @param {string} url
 * @returns {Promise<SmokeTextResponse>}
 */
function requestText(url) {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        statusCode: response.statusCode,
      }));
    });
    request.once("error", reject);
  });
}

async function findAvailablePort() {
  const net = await import("node:net");
  return await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close((error) => error ? reject(error) : resolve(/** @type {import("node:net").AddressInfo} */ (address).port));
    });
  });
}
