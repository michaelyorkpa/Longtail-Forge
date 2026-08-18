#!/usr/bin/env node
/* global fetch */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validatePublishedReleaseMetadata } from "./published-container-image.mjs";

/** @typedef {{ metadata?: string, mode?: string }} DeployOptions */
/** @typedef {{ composeHelper: string, composeInbox: string, host: string, knownHosts: string, port: number, privateKey: string, publicUrl: string, user: string }} DeployConfig */
/** @typedef {{ commitSha: string, imageDigest: string, ok: boolean }} ComposeHelperResult */
/** @typedef {import("./published-container-image.mjs").PublishedReleaseMetadata} PublishedReleaseMetadata */

const options = parseArgs(process.argv.slice(2));
const config = readConfig(process.env);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-deploy-ssh-"));

try {
  const keyPath = path.join(tempDir, "deploy-key");
  const knownHostsPath = path.join(tempDir, "known-hosts");
  await fs.writeFile(keyPath, `${config.privateKey.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(knownHostsPath, `${config.knownHosts.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  const sshArgs = ["-i", keyPath, "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", `UserKnownHostsFile=${knownHostsPath}`, "-p", String(config.port)];
  const destination = `${config.user}@${config.host}`;

  // parseArgs throws unless --metadata was supplied, so this is always set.
  const metadata = path.resolve(/** @type {string} */ (options.metadata));
  await fs.access(metadata);
  const metadataJson = /** @type {PublishedReleaseMetadata} */ (JSON.parse(await fs.readFile(metadata, "utf8")));
  const identity = validatePublishedReleaseMetadata(metadataJson);
  run("scp", [...sshArgs.slice(0, -2), "-P", String(config.port), metadata, `${destination}:${config.composeInbox}/`]);
  const helperMode = options.mode === "compose-deploy" ? "deploy" : "rollback";
  const helperOutput = run("ssh", [...sshArgs, destination, remoteCommand(config.composeHelper, [
    helperMode,
    "--metadata", path.basename(metadata),
    "--expected-version", identity.version,
    "--expected-source-branch", "main",
    "--expected-commit", identity.commitSha,
    "--expected-artifact-sha256", identity.artifactSha256,
    "--expected-image-digest", identity.digest,
    "--expected-platform-manifest-digest", identity.platformManifestDigest,
  ])]);
  const helperResult = parseHelperResult(helperOutput);
  if (helperResult.imageDigest !== identity.digest || helperResult.commitSha !== identity.commitSha) {
    throw new Error("Compose host helper result does not match the selected immutable image identity.");
  }
  await verifyPublic(config.publicUrl, metadataJson);
  console.log(JSON.stringify({ ok: true, mode: options.mode, ...identity }));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {string[]} args @returns {DeployOptions} */
function parseArgs(args) {
  /** @type {DeployOptions} */
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--mode", "--metadata"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[/** @type {"metadata" | "mode"} */ (arg.slice(2))] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown SSH deployment argument: ${arg}`);
  }
  if (!/^(compose-deploy|compose-rollback)$/.test(options.mode || "")) throw new Error("--mode must be compose-deploy or compose-rollback.");
  if (!options.metadata) throw new Error("Compose deploy and rollback modes require --metadata.");
  return options;
}

/** @param {NodeJS.ProcessEnv} env @returns {DeployConfig} */
function readConfig(env) {
  // Required values are cast at construction because the loop below throws
  // unless each one is a non-empty string.
  /** @type {DeployConfig} */
  const values = {
    host: /** @type {string} */ (env.LTF_DEPLOY_HOST),
    port: Number(env.LTF_DEPLOY_PORT || 22),
    user: /** @type {string} */ (env.LTF_DEPLOY_USER),
    privateKey: /** @type {string} */ (env.LTF_DEPLOY_SSH_PRIVATE_KEY),
    knownHosts: /** @type {string} */ (env.LTF_DEPLOY_KNOWN_HOSTS),
    composeInbox: env.LTF_COMPOSE_DEPLOY_INBOX || "/var/lib/longtail-forge-compose-deploy/inbox",
    composeHelper: env.LTF_COMPOSE_DEPLOY_HELPER || "/usr/local/sbin/longtail-forge-compose-deploy",
    publicUrl: String(env.LTF_DEPLOY_PUBLIC_URL || "").replace(/\/$/, ""),
  };
  for (const key of /** @type {ReadonlyArray<keyof DeployConfig>} */ (["host", "user", "privateKey", "knownHosts", "publicUrl"])) {
    if (!String(values[key] || "").trim()) throw new Error(`Missing SSH deployment configuration: ${key}.`);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(values.host)) throw new Error("Deployment host contains unsupported characters.");
  if (!/^[a-z_][a-z0-9_-]*$/i.test(values.user)) throw new Error("Deployment user contains unsupported characters.");
  if (!Number.isInteger(values.port) || values.port < 1 || values.port > 65535) throw new Error("Deployment port is invalid.");
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(values.composeInbox) || values.composeInbox.includes("..")) throw new Error("Compose deployment inbox must be a safe absolute path.");
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(values.composeHelper) || values.composeHelper.includes("..")) throw new Error("Compose deployment helper must be a safe absolute path.");
  const url = new URL(values.publicUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Deployment public URL must be a clean HTTPS origin.");
  return values;
}

/** @param {string} helper @param {readonly string[]} args */
function remoteCommand(helper, args) {
  return ["sudo", "-n", helper, ...args].map(shellQuote).join(" ");
}

/** @param {unknown} value */
function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

/** @param {string} command @param {readonly string[]} args @returns {string} */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout).trim()}`);
  if (result.stdout) process.stdout.write(result.stdout);
  return String(result.stdout || "");
}

/** @param {unknown} output @returns {ComposeHelperResult} */
function parseHelperResult(output) {
  const lines = String(output || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const result = /** @type {ComposeHelperResult} */ (JSON.parse(lines[index]));
      if (result?.ok === true && typeof result.imageDigest === "string" && typeof result.commitSha === "string") return result;
    } catch {
      // Retain earlier helper diagnostics and continue to the final structured line.
    }
  }
  throw new Error("Compose host helper did not return its structured immutable-image result.");
}

/** @param {string} publicUrl @param {PublishedReleaseMetadata} metadata */
async function verifyPublic(publicUrl, metadata) {
  await requireOk(`${publicUrl}/healthz`, "ok");
  await requireOk(`${publicUrl}/readyz`, "ready");
  const appInfo = await readJson(`${publicUrl}/api/app-info`);
  if (appInfo.canonicalVersion !== metadata.version || appInfo.sourceBranch !== metadata.sourceBranch || appInfo.version !== `${metadata.version}-${metadata.sourceBranch}` || appInfo.commitSha !== metadata.commitSha || appInfo.artifactSha256 !== metadata.artifact.sha256) {
    throw new Error("Deployed /api/app-info identity does not match the selected release metadata.");
  }
}

/** @param {string} url @param {string} expectedStatus */
async function requireOk(url, expectedStatus) {
  const body = await readJson(url);
  if (body.status !== expectedStatus) throw new Error(`${url} did not report ${expectedStatus}.`);
}

/** @param {string} url @returns {Promise<Record<string, unknown>>} */
async function readJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

export const __test = { parseArgs, parseHelperResult, readConfig, shellQuote };
