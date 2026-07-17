#!/usr/bin/env node
/* global fetch */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

  if (options.mode === "deploy") {
    const artifact = path.resolve(options.artifact);
    const metadata = path.resolve(options.metadata);
    for (const filePath of [artifact, `${artifact}.sha256`, metadata]) await fs.access(filePath);
    run("scp", [...sshArgs.slice(0, -2), "-P", String(config.port), artifact, `${artifact}.sha256`, metadata, `${destination}:${config.inbox}/`]);
    const metadataJson = JSON.parse(await fs.readFile(metadata, "utf8"));
    run("ssh", [...sshArgs, destination, remoteCommand(config, [
      "deploy",
      "--artifact", path.basename(artifact),
      "--metadata", path.basename(metadata),
      "--expected-version", metadataJson.version,
      "--expected-source-branch", metadataJson.sourceBranch,
      "--expected-commit", metadataJson.commitSha,
      "--expected-sha256", metadataJson.artifact.sha256,
    ])]);
    await verifyPublic(config.publicUrl, metadataJson);
    console.log(JSON.stringify({ ok: true, mode: "deploy", version: metadataJson.version, commitSha: metadataJson.commitSha, artifactSha256: metadataJson.artifact.sha256 }));
    process.exit(0);
  }

  run("ssh", [...sshArgs, destination, remoteCommand(config, ["rollback", "--expected-commit", options.revision])]);
  const appInfo = await readJson(`${config.publicUrl}/api/app-info`);
  if (appInfo.commitSha !== options.revision) throw new Error("Rollback target commit does not match /api/app-info.");
  await requireOk(`${config.publicUrl}/healthz`, "ok");
  await requireOk(`${config.publicUrl}/readyz`, "ready");
  console.log(JSON.stringify({ ok: true, mode: "rollback", commitSha: appInfo.commitSha, version: appInfo.version, sourceBranch: appInfo.sourceBranch, artifactSha256: appInfo.artifactSha256 }));
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--mode", "--artifact", "--metadata", "--revision"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown SSH deployment argument: ${arg}`);
  }
  if (!/^(deploy|rollback)$/.test(options.mode || "")) throw new Error("--mode must be deploy or rollback.");
  if (options.mode === "deploy" && (!options.artifact || !options.metadata)) throw new Error("Deploy mode requires --artifact and --metadata.");
  if (options.mode === "rollback" && !/^[a-f0-9]{40}$/i.test(options.revision || "")) throw new Error("Rollback mode requires --revision as a full commit SHA.");
  return options;
}

function readConfig(env) {
  const values = {
    host: env.LTF_DEPLOY_HOST,
    port: Number(env.LTF_DEPLOY_PORT || 22),
    user: env.LTF_DEPLOY_USER,
    privateKey: env.LTF_DEPLOY_SSH_PRIVATE_KEY,
    knownHosts: env.LTF_DEPLOY_KNOWN_HOSTS,
    inbox: env.LTF_DEPLOY_INBOX || "/var/lib/longtail-forge-deploy/inbox",
    helper: env.LTF_DEPLOY_HELPER || "/usr/local/sbin/longtail-forge-deploy",
    publicUrl: String(env.LTF_DEPLOY_PUBLIC_URL || "").replace(/\/$/, ""),
  };
  for (const key of ["host", "user", "privateKey", "knownHosts", "publicUrl"]) {
    if (!String(values[key] || "").trim()) throw new Error(`Missing SSH deployment configuration: ${key}.`);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(values.host)) throw new Error("Deployment host contains unsupported characters.");
  if (!/^[a-z_][a-z0-9_-]*$/i.test(values.user)) throw new Error("Deployment user contains unsupported characters.");
  if (!Number.isInteger(values.port) || values.port < 1 || values.port > 65535) throw new Error("Deployment port is invalid.");
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(values.inbox) || values.inbox.includes("..")) throw new Error("Deployment inbox must be a safe absolute path.");
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(values.helper) || values.helper.includes("..")) throw new Error("Deployment helper must be a safe absolute path.");
  const url = new URL(values.publicUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Deployment public URL must be a clean HTTPS origin.");
  return values;
}

function remoteCommand(config, args) {
  return ["sudo", "-n", config.helper, ...args].map(shellQuote).join(" ");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout).trim()}`);
  if (result.stdout) process.stdout.write(result.stdout);
}

async function verifyPublic(publicUrl, metadata) {
  await requireOk(`${publicUrl}/healthz`, "ok");
  await requireOk(`${publicUrl}/readyz`, "ready");
  const appInfo = await readJson(`${publicUrl}/api/app-info`);
  if (appInfo.canonicalVersion !== metadata.version || appInfo.sourceBranch !== metadata.sourceBranch || appInfo.version !== `${metadata.version}-${metadata.sourceBranch}` || appInfo.commitSha !== metadata.commitSha || appInfo.artifactSha256 !== metadata.artifact.sha256) {
    throw new Error("Deployed /api/app-info identity does not match the selected release metadata.");
  }
}

async function requireOk(url, expectedStatus) {
  const body = await readJson(url);
  if (body.status !== expectedStatus) throw new Error(`${url} did not report ${expectedStatus}.`);
}

async function readJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

export const __test = { parseArgs, readConfig, shellQuote };
