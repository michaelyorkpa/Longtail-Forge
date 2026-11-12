#!/usr/bin/env node
// Executable contract for the scheduled backup, its off-server copy hook, and the receiver on the
// destination, the durability patch's host tooling.
//
// It runs the actual bytes of all three as root, with the real bash, jq, coreutils, flock, tar, and
// timeout. Docker, HTTP, age, and the SSH client are fakes: the fake SSH client runs the real receiver
// with the request the hook made, and every fake call records whether the maintenance curtain was up,
// and whether the lifecycle lock was held, at that moment, so "refused before the curtain",
// "curtained through the outage", and "recovered under the lock" are observed. A fake `rm` fails on the
// paths a scenario names, and otherwise runs the real one. Scenarios about time limits run a copy of
// the helper or the receiver whose one limit is scaled down, each replacement applied exactly once.
//
// It needs native Linux and passwordless sudo, uses the fixed backup root under
// /var/backups/longtail-forge, the fixed alert files under /etc/longtail-forge, and the copy hook's
// staging root, and refuses a host where any of them already exists. Run it only on a disposable
// machine, such as the maintenance rehearsal's clean runner.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const SCHEDULED_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-scheduled-backup-host.example");
const COPY_HOOK = path.join(repoRoot, "scripts/release/longtail-forge-offsite-copy-host.example");
const RECEIVER = path.join(repoRoot, "scripts/release/longtail-forge-offsite-receive-host.example");
const BACKUP_PARENT = "/var/backups/longtail-forge";
const BACKUP_ROOT = `${BACKUP_PARENT}/compose`;
const BACKUP_CONTAINER_ROOT = "/var/backups/longtail-forge";
const OWNERSHIP_MARKER = `${BACKUP_PARENT}/.ltf-scheduled-backup-harness`;
const ETC = "/etc/longtail-forge";
const FIXED = Object.freeze({ webhook: `${ETC}/scheduled-backup-alert-webhook`, heartbeat: `${ETC}/scheduled-backup-heartbeat-url` });
const STAGE_ROOT = "/var/lib/longtail-forge-offsite-copy";
const PENDING_ROOT = `${BACKUP_ROOT}/.scheduled-pending`;
const ORIGIN = "https://preview.harness.test";
const CONTAINER = "c0ffee".repeat(10).concat("c0ff");
const OTHER_CONTAINER = "d1ce".repeat(16);
const TMPFS = "rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001";
const IMAGE = `ghcr.io/michaelyorkpa/longtail-forge@sha256:${"6".repeat(64)}`;
const IDENTITY = Object.freeze({ version: "0.33.99.1", commit: "4f0c2d9a7b1e3c5d8e6f0a2b4c6d8e0f1a3b5c7d", artifact: "e".repeat(64) });
const WEBHOOK_TOKEN = `${"Hk7_-".repeat(13)}abc`;
const WEBHOOK_URL = `https://discord.com/api/webhooks/987654321098765432/${WEBHOOK_TOKEN}`;
const HEARTBEAT_URL = "https://status.harness.test/api/push/scheduled-backup-push-token?status=up";
const RECIPIENT = "age1e5d6nkxxg88uf58dgrp6pyguwxt8swr9qadqktd2nfu97udkmflsct49j9";
const SCHEDULED_ARCHIVE = /^scheduled-\d{8}T\d{6}Z-[a-f0-9]{12}\.ltfbackup\.tgz$/;
const STORED_COPY = /^\d{8}T\d{6}Z-[a-f0-9]{16}\.ltfbackup\.tar\.age$/;

/** @typedef {"verified" | "root-user" | "public-port"} FakePosture */
/**
 * @typedef {{
 *   demoMode: string | null, backupFails: "create" | "inspect" | null, restartFails: boolean,
 *   curlFails: boolean, ageFails: boolean, sshFails: boolean, hookFails: boolean, freeBytes: number | null,
 *   backupHangs: boolean, killBackup: boolean, healthyAfterMs: number, posture: FakePosture,
 *   postureAfterStart: FakePosture | null, recreated: boolean,
 *   markerPath: string, lockPath: string, store: string, stateDir: string,
 * }} FakeScenario
 */
/** @typedef {{ state: "running" | "stopped", healthy: boolean, startedAt: number, restarted: boolean, container: string }} FakeRuntime */
/**
 * @typedef {{ tool: string, action: string, markerPresent: boolean, lockHeld: boolean, args?: string[], stdin?: string,
 *   archive?: string, auditLog?: string }} FakeCall
 */
/**
 * @typedef {{ root: string, helperEnv: string, scheduleEnv: string, hookEnv: string, deployRoot: string,
 *   marker: string, state: string, store: string, sbin: string, identity: string, knownHosts: string }} Sandbox
 */
/** @typedef {{ status: number, stdout: string, stderr: string, calls: FakeCall[] }} RunResult */

if (process.argv[2] === "--fake") {
  process.exitCode = runFake(String(process.argv[3]), process.argv.slice(4));
} else {
  await main();
}

// ---------------------------------------------------------------------------------------------
// Fakes. Each runs as a child of the helper, the hook, or the receiver, and reads its scenario.
// ---------------------------------------------------------------------------------------------

/** @param {string} tool @param {string[]} args @returns {number} */
function runFake(tool, args) {
  const stateDir = String(process.env.HARNESS_STATE || "");
  const scenario = /** @type {FakeScenario} */ (readJson(path.join(stateDir, "scenario.json")));
  const runtimePath = path.join(stateDir, "runtime.json");
  const runtime = /** @type {FakeRuntime} */ (readJson(runtimePath));
  /** @param {Omit<FakeCall, "tool" | "markerPresent" | "lockHeld">} entry */
  const record = (entry) => {
    // A new open of the lock file cannot take it while the helper, or a child that inherited its
    // descriptor, holds it. The lock is never created here: before the helper makes it, it is not held.
    const lockHeld = fs.existsSync(scenario.lockPath) && spawnSync("flock", ["-n", scenario.lockPath, "true"]).status !== 0;
    fs.appendFileSync(path.join(stateDir, "calls.jsonl"), `${JSON.stringify({ tool, markerPresent: fs.existsSync(scenario.markerPath), lockHeld, ...entry })}\n`);
  };
  /** @param {FakeRuntime} next */
  const save = (next) => fs.writeFileSync(runtimePath, JSON.stringify(next));
  if (tool === "docker") return fakeDocker(args, scenario, runtime, record, save);
  if (tool === "curl") return fakeCurl(args, scenario, runtime, record);
  if (tool === "age") return fakeAge(args, scenario, record);
  if (tool === "ssh") return fakeSsh(args, scenario, record);
  if (tool === "df") return emit(`Avail\n${scenario.freeBytes ?? 50 * 1024 ** 3}\n`);
  process.stderr.write(`unknown fake tool ${tool}\n`);
  return 2;
}

/**
 * @param {string[]} args @param {FakeScenario} scenario @param {FakeRuntime} runtime
 * @param {(entry: Omit<FakeCall, "tool" | "markerPresent" | "lockHeld">) => void} record @param {(next: FakeRuntime) => void} save
 */
function fakeDocker(args, scenario, runtime, record, save) {
  if (args[0] === "inspect" && args[1] === "--format") {
    record({ action: "health" });
    // A release that never becomes healthy reports so at once, as Docker's health check does after its
    // retries, so a scenario never waits out the helper's whole deadline. One that is slow to start
    // reports `starting` until the scenario's delay has passed.
    if (runtime.state !== "running") return emit("starting");
    if (Date.now() - runtime.startedAt < scenario.healthyAfterMs) return emit("starting");
    return emit(runtime.healthy ? "healthy" : "unhealthy");
  }
  if (args[0] === "inspect") {
    record({ action: "posture", args: args.slice(1) });
    if (args[1] !== runtime.container) return refuse(`Error: No such object: ${args[1]}`);
    const posture = runtime.restarted && scenario.postureAfterStart ? scenario.postureAfterStart : scenario.posture;
    return emit(JSON.stringify([{
      Id: runtime.container,
      Config: { Image: IMAGE, User: posture === "root-user" ? "0:0" : "10001:10001" },
      HostConfig: { ReadonlyRootfs: true, Privileged: false, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Tmpfs: { "/tmp": TMPFS } },
      NetworkSettings: { Ports: { "8001/tcp": [{ HostIp: posture === "public-port" ? "0.0.0.0" : "127.0.0.1", HostPort: "8001" }] } },
      Mounts: [{ Type: "volume", Destination: "/var/lib/longtail-forge" }, { Type: "bind", Source: BACKUP_ROOT, Destination: "/var/backups/longtail-forge" }],
    }]));
  }
  if (args[0] === "rm") {
    record({ action: "remove-step", args: args.slice(1) });
    return refuse(`Error response from daemon: No such container: ${args.at(-1)}`);
  }
  if (args[0] !== "compose") return refuse(`unexpected docker invocation: ${args.join(" ")}`);
  if (args[1] === "version") return emit("Docker Compose version v2.29.7");
  let index = 1;
  while (["--project-directory", "--file", "--env-file"].includes(String(args[index]))) index += 2;
  const command = args.slice(index);
  if (command[0] === "config") {
    if (command.includes("--quiet")) return 0;
    /** @type {Record<string, string>} */
    const environment = {};
    if (scenario.demoMode !== null) environment.DEMO_MODE = scenario.demoMode;
    return emit(JSON.stringify({
      services: { "longtail-forge": { environment, volumes: [{ type: "bind", source: BACKUP_ROOT, target: BACKUP_CONTAINER_ROOT }] } },
    }));
  }
  if (command[0] === "stop") {
    record({ action: "stop" });
    save({ ...runtime, state: "stopped" });
    return 0;
  }
  if (command[0] === "up") {
    record({ action: "up", args: command });
    save({ ...runtime, state: "running", healthy: !scenario.restartFails, startedAt: Date.now(), restarted: true });
    return 0;
  }
  if (command[0] === "start") {
    record({ action: "start", args: command });
    save({
      state: "running", healthy: !scenario.restartFails, startedAt: Date.now(), restarted: true,
      container: scenario.recreated ? OTHER_CONTAINER : runtime.container,
    });
    return 0;
  }
  // Like Compose, only a running container is listed.
  if (command[0] === "ps") return emit(runtime.state === "running" ? `${runtime.container}\n` : "");
  if (command[0] === "run") {
    const program = command.slice(command.indexOf("longtail-forge") + 1);
    if (program[0] === "node" && program[1] === "scripts/backup.mjs" && program[2] === "create") {
      const archive = hostBackupPath(valueAfter(program, "--output"));
      record({ action: "backup-create", archive, auditLog: valueAfter(program, "--audit-log"), args: command });
      assert.equal(runtime.state, "stopped", "a backup must never run against a running application");
      if (scenario.backupFails === "create") return refuse("ENOSPC: no space left on device, write");
      if (scenario.killBackup) return killBackupProcess();
      if (scenario.backupHangs) {
        // A partial archive, then no progress: only the helper's time limit ends this step.
        fs.writeFileSync(archive, "a partial archive", { mode: 0o600 });
        fs.chownSync(archive, 10001, 10001);
        hangUntilReleased(scenario.stateDir);
        return 0;
      }
      writeContainerBackup(archive, `archive of ${path.basename(archive)}`);
      return 0;
    }
    if (program[0] === "node" && program[1] === "scripts/backup.mjs" && program[2] === "inspect") {
      const archive = hostBackupPath(valueAfter(program, "--archive"));
      record({ action: "backup-inspect", archive });
      if (scenario.backupFails === "inspect") return refuse("Backup checksum does not match its manifest: database/longtail-forge.db");
      return fs.existsSync(archive) ? 0 : refuse("archive is missing");
    }
  }
  return refuse(`unexpected docker compose invocation: ${command.join(" ")}`);
}

/**
 * @param {string[]} args @param {FakeScenario} scenario @param {FakeRuntime} runtime
 * @param {(entry: Omit<FakeCall, "tool" | "markerPresent" | "lockHeld">) => void} record
 */
function fakeCurl(args, scenario, runtime, record) {
  if (args.includes("--config")) {
    const stdin = fs.readFileSync(0, "utf8");
    record({ action: args.includes("--data-binary") ? "notify" : "heartbeat", args, stdin });
    return scenario.curlFails ? 22 : 0;
  }
  const url = String(args.at(-1));
  record({ action: "http", args: [url] });
  const origin = url.startsWith("http://127.0.0.1:8001/") ? "http://127.0.0.1:8001" : ORIGIN;
  if (!url.startsWith(`${origin}/`)) return refuse(`curl: (6) Could not resolve host for ${url}`, 6);
  if (runtime.state !== "running" || !runtime.healthy) return refuse("curl: (22) The requested URL returned error: 503", 22);
  const route = url.slice(origin.length);
  if (route === "/healthz") return emit(JSON.stringify({ status: "ok" }));
  if (route === "/readyz") return emit(JSON.stringify({ status: "ready" }));
  if (route === "/api/app-info") {
    return emit(JSON.stringify({ canonicalVersion: IDENTITY.version, sourceBranch: "main", commitSha: IDENTITY.commit, artifactSha256: IDENTITY.artifact }));
  }
  return refuse(`curl: (22) unexpected route ${route}`, 22);
}

/**
 * Writes an age-shaped file: the real header line, then the plaintext, so the harness can read back
 * exactly what was packed.
 * @param {string[]} args @param {FakeScenario} scenario @param {(entry: Omit<FakeCall, "tool" | "markerPresent" | "lockHeld">) => void} record
 */
function fakeAge(args, scenario, record) {
  record({ action: "encrypt", args });
  if (scenario.ageFails) return refuse("age: error: failed to parse recipient");
  assert.deepEqual([args[0], args[2], args.length], ["-r", "-o", 4], `unexpected age invocation: ${args.join(" ")}`);
  fs.writeFileSync(String(args[3]), Buffer.concat([Buffer.from(`age-encryption.org/v1\n-> X25519 harness\n`), fs.readFileSync(0)]));
  return 0;
}

/**
 * Records the client's options, then runs the real receiver as the forced command would: with the
 * request in SSH_ORIGINAL_COMMAND, the store as its one argument, and the copy on standard input.
 * @param {string[]} args @param {FakeScenario} scenario @param {(entry: Omit<FakeCall, "tool" | "markerPresent" | "lockHeld">) => void} record
 */
function fakeSsh(args, scenario, record) {
  record({ action: "ssh", args });
  if (scenario.sshFails) return refuse("ssh: connect to host 203.0.113.10 port 22: Connection refused", 255);
  const result = spawnSync("bash", [RECEIVER, scenario.store], {
    env: { PATH: String(process.env.PATH), SSH_ORIGINAL_COMMAND: String(args.at(-1)), HARNESS_STATE: scenario.stateDir },
    stdio: ["inherit", "inherit", "inherit"],
  });
  return result.status ?? 1;
}

/** A backup as the container writes it: archive and sidecar, private, owned by UID and GID 10001. @param {string} archive @param {string} content */
function writeContainerBackup(archive, content) {
  fs.writeFileSync(archive, content, { mode: 0o600 });
  fs.writeFileSync(`${archive}.sha256`, `${sha256(content)}  ${path.basename(archive)}\n`, { mode: 0o600 });
  for (const file of [archive, `${archive}.sha256`]) fs.chownSync(file, 10001, 10001);
}

/** The host path of a path under the container's backup mount, which binds the host backup root. @param {string} containerPath */
function hostBackupPath(containerPath) {
  assert.ok(containerPath.startsWith(`${BACKUP_CONTAINER_ROOT}/`) && !containerPath.split("/").includes(".."), `backup path escaped the container root: ${containerPath}`);
  return `${BACKUP_ROOT}${containerPath.slice(BACKUP_CONTAINER_ROOT.length)}`;
}

/** Makes no progress until the scenario releases it, or 30 seconds pass. @param {string} stateDir */
function hangUntilReleased(stateDir) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !fs.existsSync(path.join(stateDir, "release"))) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}

/**
 * Kills the backup's own process outright, as the kernel's out-of-memory killer would, long before any
 * time limit. This fake runs under the backup step's `timeout`, whose parent is that process.
 */
function killBackupProcess() {
  const stepTimeout = process.ppid;
  const stat = fs.readFileSync(`/proc/${stepTimeout}/stat`, "utf8");
  const backup = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  const commandLine = fs.readFileSync(`/proc/${backup}/cmdline`, "utf8").split("\0");
  assert.equal(commandLine.at(-2), "backup", `the fake's grandparent must be the backup itself: ${commandLine.join(" ")}`);
  process.kill(backup, "SIGKILL");
  return 0;
}

/** @param {string[]} args @param {string} flag */
function valueAfter(args, flag) {
  return String(args[args.indexOf(flag) + 1]);
}

/** @param {string} text */
function emit(text) {
  process.stdout.write(text);
  return 0;
}

/** @param {string} message @param {number} [status] */
function refuse(message, status = 1) {
  process.stderr.write(`${message}\n`);
  return status;
}

/** @param {string} filePath @returns {unknown} */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** @param {string | Buffer} content */
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// Sandboxes and runs.
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{ demoMode?: string | null, backupFails?: "create" | "inspect" | null, restartFails?: boolean, curlFails?: boolean,
 *   ageFails?: boolean, sshFails?: boolean, hookFails?: boolean, freeBytes?: number | null, hook?: "none" | "recording" | "real",
 *   enabled?: boolean, alerts?: boolean, backupHangs?: boolean, killBackup?: boolean, healthyAfterMs?: number,
 *   posture?: FakePosture, postureAfterStart?: FakePosture | null, recreated?: boolean }} SandboxOptions
 */

/** @param {string} work @param {number} ordinal @param {string} fakeBin @param {SandboxOptions} options @returns {Sandbox} */
function createSandbox(work, ordinal, fakeBin, options) {
  for (const target of [BACKUP_ROOT, STAGE_ROOT, FIXED.webhook, FIXED.heartbeat]) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  fs.chownSync(BACKUP_ROOT, 10001, 10001);
  const root = path.join(work, `sandbox-${ordinal}`);
  const etc = path.join(root, "etc");
  const deployRoot = path.join(root, "deploy");
  const state = path.join(root, "harness");
  const sbin = path.join(root, "sbin");
  const store = path.join(root, "store");
  for (const [directory, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [etc, 0o755], [path.join(root, "compose"), 0o755], [sbin, 0o755], [deployRoot, 0o711],
    [path.join(deployRoot, "state"), 0o700], [path.join(deployRoot, "releases"), 0o700],
    [path.join(root, "maintenance"), 0o711], [path.join(root, "maintenance", "deployment"), 0o711], [state, 0o755], [store, 0o700],
  ])) {
    fs.mkdirSync(directory, { recursive: true });
    fs.chmodSync(directory, mode);
  }
  fs.writeFileSync(path.join(root, "compose", "compose.yaml"), "name: longtail-forge\n");
  writePrivate(path.join(etc, "compose-host.env"), "LONGTAIL_HOST_PORT=8001\n");
  const helperEnv = path.join(etc, "compose-deploy-helper.env");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${path.join(root, "compose")}`,
    `LTF_COMPOSE_HOST_ENV=${path.join(etc, "compose-host.env")}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    "LTF_IMAGE_REPOSITORY=ghcr.io/michaelyorkpa/longtail-forge",
    `LTF_MAINTENANCE_STATE_ROOT=${path.join(root, "maintenance")}`,
    `LTF_PUBLIC_URL=${ORIGIN}`,
    "",
  ].join("\n"));
  const key = IMAGE.slice(IMAGE.indexOf("sha256:") + "sha256:".length);
  const releaseEnv = path.join(deployRoot, "releases", `${key}.env`);
  writePrivate(releaseEnv, `LONGTAIL_IMAGE=${IMAGE}\nLONGTAIL_RELEASE_BRANCH=main\nLONGTAIL_RELEASE_COMMIT=${IDENTITY.commit}\n`);
  writePrivate(path.join(deployRoot, "releases", `${key}.json`), JSON.stringify({
    version: IDENTITY.version, commitSha: IDENTITY.commit, artifact: { sha256: IDENTITY.artifact }, image: { digest: `sha256:${key}`, reference: IMAGE },
  }));
  writePrivate(path.join(deployRoot, "state", "current.json"), JSON.stringify({
    version: IDENTITY.version, commitSha: IDENTITY.commit, image: { digest: `sha256:${key}`, reference: IMAGE }, deployment: { releaseEnv, rollbackBackup: "" },
  }));

  // The copy hook the schedule names: none, one that records what it was given, or the real hook.
  const hook = options.hook ?? "recording";
  let hookPath = "";
  if (hook === "recording") {
    hookPath = path.join(sbin, "longtail-forge-offsite-copy");
    fs.writeFileSync(hookPath, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `state=${shellQuote(state)}`,
      `marker=${shellQuote(path.join(root, "maintenance", "deployment", "maintenance.on"))}`,
      "archive=\"$2\"",
      "name=\"$(basename \"$archive\")\"",
      "sidecar_ok=false",
      "if (cd \"$(dirname \"$archive\")\" && sha256sum --check --status \"$name.sha256\"); then sidecar_ok=true; fi",
      "marker_present=false; if test -e \"$marker\"; then marker_present=true; fi",
      // Each argument as a value, never as a jq option: the first is `--archive`.
      "jq -cn --arg count \"$#\" --arg first \"${1:-}\" --arg second \"${2:-}\" --argjson curtain \"$marker_present\" --argjson sidecar \"$sidecar_ok\" '{count: ($count | tonumber), args: [$first, $second], markerPresent: $curtain, sidecarVerified: $sidecar}' >> \"$state/hook.jsonl\"",
      options.hookFails ? "echo 'longtail-forge-offsite-copy: the destination refused the copy: the store already holds as many copies as it keeps' >&2; exit 1" : "",
      "printf '{\"ok\":true,\"archive\":\"%s\",\"stored\":\"20261112T083000Z-0123456789abcdef.ltfbackup.tar.age\",\"sha256\":\"%s\",\"bytes\":1}\\n' \"$name\" \"$(printf '%064d' 0)\"",
      "",
    ].join("\n"), { mode: 0o755 });
  } else if (hook === "real") {
    hookPath = path.join(sbin, "longtail-forge-offsite-copy");
    // Written, not copied: run through sudo, `copyFileSync` keeps the checkout owner's account, and the
    // scheduled backup rightly refuses a hook that another account could replace.
    fs.writeFileSync(hookPath, fs.readFileSync(COPY_HOOK), { mode: 0o755 });
    fs.chmodSync(hookPath, 0o755);
  }
  const scheduleEnv = path.join(etc, "scheduled-backup.env");
  writePrivate(scheduleEnv, `LTF_SCHEDULED_BACKUP_ENABLED=${options.enabled === false ? "false" : "true"}\nLTF_SCHEDULED_BACKUP_COPY_HOOK=${hookPath}\n`);

  // The real hook's own configuration: a key and pinned host keys only root may change.
  const offsite = path.join(etc, "offsite-copy");
  fs.mkdirSync(offsite, { mode: 0o755 });
  const identity = path.join(offsite, "id_ed25519");
  writePrivate(identity, "-----BEGIN OPENSSH PRIVATE KEY-----\nharness\n-----END OPENSSH PRIVATE KEY-----\n");
  const knownHosts = path.join(offsite, "known_hosts");
  fs.writeFileSync(knownHosts, "[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHarnessHostKey\n", { mode: 0o644 });
  const hookEnv = path.join(etc, "offsite-copy.env");
  writePrivate(hookEnv, [
    "LTF_OFFSITE_HOST=203.0.113.10", "LTF_OFFSITE_PORT=22", "LTF_OFFSITE_USER=ltf-offsite",
    `LTF_OFFSITE_IDENTITY=${identity}`, `LTF_OFFSITE_KNOWN_HOSTS=${knownHosts}`, `LTF_OFFSITE_RECIPIENT=${RECIPIENT}`, "",
  ].join("\n"));

  if (options.alerts !== false) {
    fs.mkdirSync(ETC, { recursive: true, mode: 0o755 });
    writePrivate(FIXED.webhook, `${WEBHOOK_URL}\n`);
    writePrivate(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
  }
  const marker = path.join(root, "maintenance", "deployment", "maintenance.on");
  /** @type {FakeScenario} */
  const scenario = {
    demoMode: options.demoMode === undefined ? "false" : options.demoMode,
    backupFails: options.backupFails ?? null,
    restartFails: options.restartFails === true,
    curlFails: options.curlFails === true,
    ageFails: options.ageFails === true,
    sshFails: options.sshFails === true,
    hookFails: options.hookFails === true,
    freeBytes: options.freeBytes ?? null,
    backupHangs: options.backupHangs === true,
    killBackup: options.killBackup === true,
    healthyAfterMs: options.healthyAfterMs ?? 0,
    posture: options.posture ?? "verified",
    postureAfterStart: options.postureAfterStart ?? null,
    recreated: options.recreated === true,
    markerPath: marker,
    lockPath: path.join(deployRoot, "compose-operation.lock"),
    store,
    stateDir: state,
  };
  fs.writeFileSync(path.join(state, "scenario.json"), JSON.stringify(scenario));
  /** @type {FakeRuntime} */
  const runtime = { state: "running", healthy: true, startedAt: 0, restarted: false, container: CONTAINER };
  fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify(runtime));
  fs.writeFileSync(path.join(state, "calls.jsonl"), "");
  void fakeBin;
  return { root, helperEnv, scheduleEnv, hookEnv, deployRoot, marker, state, store, sbin, identity, knownHosts };
}

/**
 * @param {Sandbox} box @param {string} fakeBin @param {string[]} args @param {string} [helper]
 * @returns {RunResult & { seconds: number }}
 */
function runScheduled(box, fakeBin, args, helper = SCHEDULED_HELPER) {
  const offset = fs.readFileSync(path.join(box.state, "calls.jsonl"), "utf8").length;
  const started = Date.now();
  const result = spawnSync("bash", [helper, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      PATH: `${fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`,
      HOME: "/root",
      LANG: "C.UTF-8",
      LTF_COMPOSE_HELPER_ENV: box.helperEnv,
      LTF_SCHEDULED_BACKUP_ENV: box.scheduleEnv,
      LTF_OFFSITE_COPY_ENV: box.hookEnv,
      HARNESS_STATE: box.state,
    },
  });
  return {
    status: result.status ?? 1, stdout: String(result.stdout || ""), stderr: String(result.stderr || ""), calls: callsSince(box, offset),
    seconds: (Date.now() - started) / 1000,
  };
}

/**
 * A copy of a host script with its limits scaled down for a scenario, each replacement applied exactly
 * once, so a scenario never runs against a limit the source no longer has.
 * @param {string} work @param {string} source @param {string} name @param {[string, string][]} replacements
 */
function scaledCopy(work, source, name, replacements) {
  let text = fs.readFileSync(source, "utf8");
  for (const [from, to] of replacements) {
    assert.equal(text.split(from).length - 1, 1, `${path.basename(source)} must contain exactly one ${JSON.stringify(from)}`);
    text = text.split(from).join(to);
  }
  const target = path.join(work, name);
  fs.writeFileSync(target, text, { mode: 0o755 });
  return target;
}

/** Makes the fake `rm` fail on every path matching one of these shell patterns. @param {Sandbox} box @param {string[]} patterns */
function failRemovals(box, patterns) {
  fs.writeFileSync(path.join(box.state, "rm-fails"), patterns.map((pattern) => `${pattern}\n`).join(""));
}

/** @param {Sandbox} box */
function allowRemovals(box) {
  fs.rmSync(path.join(box.state, "rm-fails"), { force: true });
}

/** The summary line of the run's Discord alert, or "" when it sent none. @param {RunResult} result */
function alertSummary(result) {
  const payload = result.calls.find((call) => call.action === "notify")?.args?.at(-1);
  if (payload === undefined) return "";
  return String(/** @type {{ content?: unknown }} */ (JSON.parse(payload)).content).replace(/^Scheduled-backup alert: /, "");
}

/** Changes a sandbox's scenario between runs. @param {Sandbox} box @param {Partial<FakeScenario>} changes */
function updateScenario(box, changes) {
  const file = path.join(box.state, "scenario.json");
  fs.writeFileSync(file, JSON.stringify({ .../** @type {FakeScenario} */ (readJson(file)), ...changes }));
}

/** @param {Sandbox} box @param {number} offset @returns {FakeCall[]} */
function callsSince(box, offset) {
  return fs.readFileSync(path.join(box.state, "calls.jsonl"), "utf8").slice(offset).split("\n").filter(Boolean)
    .map((line) => /** @type {FakeCall} */ (JSON.parse(line)));
}

/** @param {Sandbox} box @param {string} fakeBin @param {string[]} args @returns {RunResult} */
function runHook(box, fakeBin, args) {
  const offset = fs.readFileSync(path.join(box.state, "calls.jsonl"), "utf8").length;
  const result = spawnSync("bash", [path.join(box.sbin, "longtail-forge-offsite-copy"), ...args], {
    encoding: "utf8",
    timeout: 120_000,
    env: { PATH: `${fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`, HOME: "/root", LANG: "C.UTF-8", LTF_OFFSITE_COPY_ENV: box.hookEnv, HARNESS_STATE: box.state },
  });
  return { status: result.status ?? 1, stdout: String(result.stdout || ""), stderr: String(result.stderr || ""), calls: callsSince(box, offset) };
}

/**
 * Runs the real receiver as its forced command would. Free space comes from the fake `df`, so a
 * runner's own disk never decides a scenario.
 * @param {Sandbox} box @param {string} dfBin @param {string} request @param {Buffer | string} input @param {string} [store]
 */
function receive(box, dfBin, request, input, store = box.store) {
  const result = spawnSync("bash", [RECEIVER, store], {
    input,
    encoding: "utf8",
    timeout: 60_000,
    env: { PATH: `${dfBin}:/usr/sbin:/usr/bin:/sbin:/bin`, SSH_ORIGINAL_COMMAND: request, HARNESS_STATE: box.state },
  });
  const line = String(result.stdout || "").trim().split("\n").at(-1) || "{}";
  return { status: result.status ?? 1, reply: /** @type {{ ok?: boolean, reason?: string, stored?: string, kept?: number, expired?: number }} */ (JSON.parse(line)) };
}

/**
 * Runs a receiver as its forced command would, feeding it through `feed`, and stops waiting after
 * `waitMs`: a receiver still running then has not bounded its receipt.
 * @param {string} receiver @param {string} store @param {string} dfBin @param {string} request
 * @param {(stdin: import("node:stream").Writable) => Promise<void>} feed @param {number} waitMs
 * @returns {Promise<{ status: number | "still-running", reply: { ok?: boolean, reason?: string } }>}
 */
async function receiveStreaming(receiver, store, dfBin, request, feed, waitMs) {
  const child = spawn("bash", [receiver, store], {
    env: { PATH: `${dfBin}:/usr/sbin:/usr/bin:/sbin:/bin`, SSH_ORIGINAL_COMMAND: request },
    stdio: ["pipe", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  // The receiver may stop reading at its limit, so a later write may find the pipe closed.
  child.stdin.on("error", () => {});
  /** @type {Promise<number>} */
  const exited = new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  feed(child.stdin).catch(() => {});
  /** @type {number | "still-running"} */
  const status = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve("still-running"), waitMs))]);
  if (status === "still-running") child.kill("SIGKILL");
  child.stdin.destroy();
  const line = stdout.trim().split("\n").at(-1) || "{}";
  return { status, reply: /** @type {{ ok?: boolean, reason?: string }} */ (JSON.parse(line)) };
}

/** An age-shaped copy and the request that declares it. @param {string} [body] */
function ageCopy(body = "a sealed backup") {
  const content = Buffer.from(`age-encryption.org/v1\n-> X25519 harness\n${body}`);
  return { content, request: `receive ${sha256(content)} ${content.length}` };
}

/** A copy received the given number of days ago. @param {string} store @param {number} daysAgo @param {number} [ordinal] */
function seedCopy(store, daysAgo, ordinal = 0) {
  const when = new Date(Date.now() - daysAgo * 86_400_000 - ordinal * 1000);
  const stamp = when.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const name = `${stamp}-${sha256(`${daysAgo}-${ordinal}`).slice(0, 16)}.ltfbackup.tar.age`;
  fs.writeFileSync(path.join(store, name), `age-encryption.org/v1\nseeded ${daysAgo}\n`, { mode: 0o600 });
  return name;
}

/** @param {Sandbox} box */
function hookRecords(box) {
  const file = path.join(box.state, "hook.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .map((line) => /** @type {{ count: number, args: string[], markerPresent: boolean, sidecarVerified: boolean }} */ (JSON.parse(line))) : [];
}

/**
 * @typedef {{ outcome: string, failureClass: string | null, alertOutcome: string, heartbeatOutcome: string, exitCode: number,
 *   curtain: string | null, result: { archive?: string, discardedUninspected?: number,
 *   retention?: { status: string, removed?: number, orphanSidecars?: number, filesRemoved?: number }, copy?: { status: string } } | null }} RunRecord
 */
/** @param {Sandbox} box @returns {RunRecord[]} */
function runRecords(box) {
  const file = path.join(box.deployRoot, "scheduled-backups.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
    .map((line) => /** @type {RunRecord} */ (JSON.parse(line))) : [];
}

/** The backup root's entries, apart from the scheduled backup's staging directory. @returns {string[]} */
function backups() {
  return fs.readdirSync(BACKUP_ROOT).filter((name) => name !== path.basename(PENDING_ROOT)).sort();
}

/** What the staging directory holds. @returns {string[]} */
function pending() {
  return fs.existsSync(PENDING_ROOT) ? fs.readdirSync(PENDING_ROOT).sort() : [];
}

/** @param {FakeCall[]} calls @param {string} action */
function indexOf(calls, action) {
  return calls.findIndex((call) => call.action === action);
}

/** @param {string} target @param {string} content */
function writePrivate(target, content) {
  fs.writeFileSync(target, content, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Waits for the next UTC second, so each run's backup gets a name of its own. */
function waitForNextSecond() {
  const start = Math.floor(Date.now() / 1000);
  while (Math.floor(Date.now() / 1000) === start) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}

/** @param {string} name @param {number} daysAgo */
function scheduledName(name, daysAgo) {
  const stamp = new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `scheduled-${stamp}-${name}.ltfbackup.tgz`;
}

// ---------------------------------------------------------------------------------------------
// Scenarios.
// ---------------------------------------------------------------------------------------------

async function main() {
  assert.equal(process.platform, "linux", "the scheduled-backup contract harness requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  for (const command of ["bash", "jq", "flock", "install", "stat", "tar", "timeout", "sha256sum", "realpath", "hostname"]) {
    assert.equal(spawnSync("bash", ["-c", `command -v ${command}`]).status, 0, `${command} is required`);
  }
  if (fs.existsSync(BACKUP_PARENT) && !fs.existsSync(OWNERSHIP_MARKER)) {
    throw new Error(`${BACKUP_PARENT} already exists; refusing to run where real Longtail Forge backups may live.`);
  }
  for (const fixed of [FIXED.webhook, FIXED.heartbeat, STAGE_ROOT]) {
    if (fs.existsSync(fixed)) throw new Error(`${fixed} already exists; refusing to run on a host with a scheduled backup installed.`);
  }
  const createdEtc = !fs.existsSync(ETC);
  fs.mkdirSync(BACKUP_PARENT, { recursive: true, mode: 0o700 });
  fs.writeFileSync(OWNERSHIP_MARKER, "created by scripts/release/scheduled-backup-contract-harness.mjs\n");
  const work = fs.mkdtempSync("/tmp/ltf-scheduled-backup-harness-");
  fs.chmodSync(work, 0o755);
  const fakeBin = path.join(work, "bin");
  const dfBin = path.join(work, "df-bin");
  for (const directory of [fakeBin, dfBin]) fs.mkdirSync(directory, { mode: 0o755 });
  const staticDfBin = path.join(work, "static-df-bin");
  for (const directory of [staticDfBin]) fs.mkdirSync(directory, { mode: 0o755 });
  for (const tool of ["docker", "curl", "age", "ssh", "df"]) {
    fs.writeFileSync(path.join(fakeBin, tool), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake ${tool} "$@"\n`, { mode: 0o755 });
  }
  // The fake `rm` is plain bash, so that it costs nothing on the many removals that pass straight through.
  const realRm = spawnSync("bash", ["-c", "command -v rm"], { encoding: "utf8" }).stdout.trim();
  assert.match(realRm, /^\/(usr\/)?bin\/rm$/, "the real rm must be found");
  fs.writeFileSync(path.join(fakeBin, "rm"), [
    "#!/usr/bin/env bash",
    "fails=\"${HARNESS_STATE:-/nonexistent}/rm-fails\"",
    "if test -f \"$fails\"; then",
    "  while IFS= read -r pattern; do",
    "    for argument in \"$@\"; do",
    // An unquoted right-hand side is a pattern.
    "      if [[ \"$argument\" == $pattern ]]; then printf \"rm: cannot remove '%s': Read-only file system\\n\" \"$argument\" >&2; exit 1; fi",
    "    done",
    "  done < \"$fails\"",
    "fi",
    `exec ${realRm} "$@"`,
    "",
  ].join("\n"), { mode: 0o755 });
  fs.writeFileSync(path.join(dfBin, "df"), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake df "$@"\n`, { mode: 0o755 });
  // A df with no Node behind it, for a receiver whose address space is limited.
  fs.writeFileSync(path.join(staticDfBin, "df"), `#!/usr/bin/env bash\nprintf 'Avail\\n%s\\n' ${50 * 1024 ** 3}\n`, { mode: 0o755 });

  /** @type {{ name: string, ok: boolean }[]} */
  const outcomes = [];
  let ordinal = 0;
  /** @param {SandboxOptions} [options] */
  const sandbox = (options = {}) => createSandbox(work, (ordinal += 1), fakeBin, options);
  /** @param {string} name @param {() => void | Promise<void>} run */
  const scenario = async (name, run) => {
    try {
      await run();
      outcomes.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      outcomes.push({ name, ok: false });
      console.log(`FAIL ${name}\n${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  };
  /** @param {Sandbox} box @param {string[]} [args] */
  const run = (box, args = ["run", "--trigger", "manual"]) => {
    waitForNextSecond();
    return runScheduled(box, fakeBin, args);
  };

  try {
    // -------------------------------------------------------------------------------------------
    // The scheduled backup.
    // -------------------------------------------------------------------------------------------
    await scenario("a scheduled backup curtains the outage, inspects the backup, restarts the unchanged release, and sends the heartbeat", () => {
      const box = sandbox();
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      const order = ["posture", "stop", "backup-create", "backup-inspect", "start"].map((action) => indexOf(result.calls, action));
      assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > Number(order[index - 1]))), `the backup must run in order: ${order}`);
      assert.equal(result.calls[order[0] ?? -1]?.markerPresent, false, "the running container's posture is checked before any outage");
      for (const action of ["stop", "backup-create", "backup-inspect", "start"]) {
        const call = result.calls.find((entry) => entry.action === action);
        assert.ok(call?.markerPresent, `${action} must happen behind the curtain`);
        assert.ok(call?.lockHeld, `${action} must happen under the lifecycle lock`);
      }
      assert.ok(result.calls.filter((call) => call.action === "http").some((call) => call.markerPresent), "the restart verifies behind the curtain");
      assert.ok(result.calls.some((call) => call.action === "posture" && call.markerPresent && indexOf(result.calls, "start") < result.calls.indexOf(call)),
        "the restarted container's posture verifies behind the curtain");
      assert.equal(indexOf(result.calls, "up"), -1, "the stopped container is started as itself, never recreated or pulled");
      assert.equal(fs.existsSync(box.marker), false, "the curtain must lift once the release verifies");
      const archive = backups().find((name) => SCHEDULED_ARCHIVE.test(name));
      assert.ok(archive, `a scheduled backup must exist: ${backups()}`);
      assert.ok(archive.includes(`-${IDENTITY.commit.slice(0, 12)}.`), "the name carries the release commit");
      assert.ok(backups().includes(`${archive}.sha256`));
      const create = result.calls.find((call) => call.action === "backup-create");
      assert.equal(create?.archive, `${PENDING_ROOT}/${archive}`, "the backup is written in the staging directory");
      assert.equal(create?.auditLog, `${BACKUP_CONTAINER_ROOT}/backup-operations.jsonl`, "the operator audit stays beside the backups");
      assert.ok(create?.args?.includes(`longtail-forge-scheduled-backup-${archive.slice("scheduled-".length, "scheduled-".length + 16)}-create`), "the step's container is named");
      assert.equal(result.calls.find((call) => call.action === "backup-inspect")?.archive, `${PENDING_ROOT}/${archive}`, "and inspected there");
      assert.deepEqual(pending(), [], "only an inspected backup leaves the staging directory, and nothing stays behind");
      assert.equal(spawnSync("stat", ["-c", "%u:%g:%a", PENDING_ROOT], { encoding: "utf8" }).stdout.trim(), "10001:10001:700");
      const heartbeat = result.calls.find((call) => call.action === "heartbeat");
      assert.equal(heartbeat?.stdin, `url = "${HEARTBEAT_URL}"\n`, "the heartbeat reaches the push monitor on standard input");
      assert.equal(indexOf(result.calls, "notify"), -1, "a clean run raises no alert");
      const [recorded] = runRecords(box);
      assert.deepEqual([recorded?.outcome, recorded?.failureClass, recorded?.heartbeatOutcome, recorded?.result?.archive], ["succeeded", null, "delivered", archive]);
    });

    await scenario("a held lifecycle lock exits 75 before the curtain, and the run alerts lifecycle-lock-contended", async () => {
      const box = sandbox();
      const lock = path.join(box.deployRoot, "compose-operation.lock");
      writePrivate(lock, "");
      const holder = spawn("flock", ["-o", lock, "sleep", "30"], { stdio: "ignore" });
      try {
        await waitForLockHolder(lock);
        const result = run(box);
        assert.equal(result.status, 75, result.stderr);
        assert.match(result.stderr, /holds the host lock/);
        assert.equal(indexOf(result.calls, "stop"), -1);
        assert.equal(fs.existsSync(box.marker), false);
        assert.match(String(result.calls.find((call) => call.action === "notify")?.args?.at(-1)), /failureClass=lifecycle-lock-contended/);
      } finally {
        holder.kill("SIGKILL");
      }
    });

    for (const [label, demoMode, message, failureClass] of /** @type {[string, string | null, RegExp, string][]} */ ([
      ["the public demo", "true", /the scheduled backup refuses the public demo/, "refused-public-demo"],
      ["an unclassified installation", null, /DEMO_MODE must be exactly false/, "backup-failed"],
      ["a DEMO_MODE spelled any other way", "TRUE", /DEMO_MODE must be exactly false/, "backup-failed"],
    ])) {
      await scenario(`${label} is refused before the curtain, and the run alerts`, () => {
        const box = sandbox({ demoMode });
        const result = run(box);
        assert.equal(result.status, 1);
        assert.match(result.stderr, message);
        assert.equal(result.calls.filter((call) => call.markerPresent).length, 0, "nothing may happen behind a curtain");
        assert.equal(indexOf(result.calls, "stop"), -1);
        assert.deepEqual(backups(), []);
        assert.match(String(result.calls.find((call) => call.action === "notify")?.args?.at(-1)), new RegExp(`failureClass=${failureClass} `));
      });
    }

    await scenario("another operation's curtain refuses the backup, and stays up", () => {
      const box = sandbox();
      fs.writeFileSync(box.marker, "");
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /never takes over another operation's curtain/);
      assert.equal(indexOf(result.calls, "stop"), -1);
      assert.equal(fs.existsSync(box.marker), true);
    });

    for (const fault of /** @type {const} */ (["create", "inspect"])) {
      await scenario(`a failed backup ${fault} restarts the unchanged release, lifts the curtain, keeps no uninspected archive, and alerts`, () => {
        const box = sandbox({ backupFails: fault });
        const result = run(box);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /the backup failed, and the unchanged release was restarted and verified/);
        assert.ok(indexOf(result.calls, "start") > indexOf(result.calls, `backup-${fault}`));
        assert.equal(indexOf(result.calls, "up"), -1);
        assert.equal(fs.existsSync(box.marker), false);
        assert.deepEqual(backups(), [], "a backup that never passed inspection never joins the backups");
        assert.deepEqual(pending(), [], "and is discarded from the staging directory");
        assert.equal(hookRecords(box).length, 0, "the copy hook never sees an uninspected backup");
        assert.match(alertSummary(result), /failureClass=backup-failed-recovered exitCode=1 curtain=down$/);
      });
    }

    await scenario("a release that does not verify after the backup keeps the curtain, is stopped, and the run alerts unrecovered", () => {
      const box = sandbox({ restartFails: true });
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
      assert.equal(fs.existsSync(box.marker), true, "an unverified release must stay behind the curtain");
      const lastHealth = result.calls.map((call) => call.action).lastIndexOf("health");
      assert.ok(result.calls.slice(lastHealth).some((call) => call.action === "stop"), "the unverified container is stopped, so it never serves");
      assert.equal(hookRecords(box).length, 0);
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered exitCode=1 curtain=up$/);
      assert.equal(runRecords(box)[0]?.curtain, "up");
    });

    for (const [label, options, message] of /** @type {[string, SandboxOptions, RegExp][]} */ ([
      ["whose posture drifted after the restart", { postureAfterStart: "public-port" }, /the restarted release did not verify/],
      ["that is not the container that was stopped", { recreated: true }, /could not be started again as itself/],
    ])) {
      await scenario(`a restarted container ${label} keeps the curtain, is stopped, and the run alerts unrecovered`, () => {
        const box = sandbox(options);
        const result = run(box);
        assert.equal(result.status, 1);
        assert.match(result.stderr, message);
        assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
        assert.equal(fs.existsSync(box.marker), true, "an unverified container must stay behind the curtain");
        assert.equal(indexOf(result.calls, "http"), -1, "an unverified container is never asked whether it is healthy");
        assert.ok(result.calls.slice(indexOf(result.calls, "start") + 1).some((call) => call.action === "stop"), "and is stopped");
        assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered /);
      });
    }

    for (const [label, posture] of /** @type {[string, FakePosture][]} */ ([["as root", "root-user"], ["with its port published to every address", "public-port"]])) {
      await scenario(`a running container ${label} refuses the backup before any outage`, () => {
        const box = sandbox({ posture });
        const result = run(box);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /does not have the identity and posture the deploy helper verifies/);
        assert.equal(result.calls.filter((call) => call.markerPresent).length, 0, "the curtain never rises");
        assert.equal(indexOf(result.calls, "stop"), -1);
        assert.match(alertSummary(result), /failureClass=backup-failed exitCode=1 curtain=down$/);
      });
    }

    await scenario("an uninspected archive whose removal fails stays staged, never counts as a backup, and the release is still restarted", () => {
      const box = sandbox({ backupFails: "inspect" });
      failRemovals(box, [`${PENDING_ROOT}/scheduled-*`]);
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /could not be discarded from the staging directory; it is never counted as a backup/);
      assert.match(result.stderr, /the unchanged release was restarted and verified/);
      assert.ok(indexOf(result.calls, "start") > indexOf(result.calls, "backup-inspect"), "a failed removal never skips the restart");
      assert.equal(fs.existsSync(box.marker), false);
      assert.equal(pending().length, 2, "the rejected archive and its sidecar stay in the staging directory");
      assert.deepEqual(backups(), [], "and never among the backups");
      assert.match(alertSummary(result), /failureClass=backup-failed-recovered,staging-not-cleared /);
      allowRemovals(box);
      updateScenario(box, { backupFails: null });
      const next = run(box);
      assert.equal(next.status, 0, next.stderr);
      assert.match(next.stderr, /discarded 2 files an interrupted run left uninspected/);
      assert.deepEqual(pending(), []);
      const kept = backups().filter((name) => SCHEDULED_ARCHIVE.test(name));
      assert.deepEqual(kept, [runRecords(box)[1]?.result?.archive], "only the inspected backup is a backup");
      assert.equal(runRecords(box)[1]?.result?.discardedUninspected, 2);
    });

    await scenario("a staging directory holding anything else refuses the backup before any outage, and removes nothing", () => {
      const box = sandbox();
      fs.mkdirSync(PENDING_ROOT, { mode: 0o700 });
      fs.chownSync(PENDING_ROOT, 10001, 10001);
      fs.writeFileSync(path.join(PENDING_ROOT, "operator-notes.txt"), "keep me\n");
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /staging directory holds something other than an interrupted run's backup; nothing was removed/);
      assert.equal(result.calls.filter((call) => call.markerPresent).length, 0);
      assert.deepEqual(pending(), ["operator-notes.txt"]);
    });

    await scenario("a backup that runs out of its time is stopped, and recovery restarts the release with its own time, under the lock", () => {
      const box = sandbox({ backupHangs: true, healthyAfterMs: 5000 });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-limit-2", [["readonly BACKUP_LIMIT=7200\n", "readonly BACKUP_LIMIT=2\n"]]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /the backup did not finish within its time limit/);
      assert.match(result.stderr, /the unchanged release was restarted and verified/);
      const removed = result.calls.filter((call) => call.action === "remove-step").map((call) => String(call.args?.at(-1)));
      assert.ok(removed.some((name) => /^longtail-forge-scheduled-backup-\d{8}T\d{6}Z-create$/.test(name)), "the cut-off step's container is removed");
      const recovery = result.calls.slice(indexOf(result.calls, "start"));
      assert.ok(recovery.filter((call) => call.action === "health").length >= 2, "the release took longer than the backup's limit to become healthy");
      assert.ok(recovery.every((call) => call.tool !== "docker" || call.lockHeld), "recovery runs under the lock the backup holds");
      assert.equal(fs.existsSync(box.marker), false, "the curtain lifts once the release verifies");
      assert.deepEqual(backups(), []);
      assert.deepEqual(pending(), [], "the partial archive is discarded");
      assert.match(alertSummary(result), /failureClass=backup-timed-out-recovered exitCode=1 curtain=down$/);
      assert.ok(result.seconds < 60, `the run took ${result.seconds}s`);
    });

    await scenario("a backup the run's own backstop kills is reported as that limit's expiry, with the curtain up", () => {
      const box = sandbox({ backupHangs: true });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-run-limit-3", [
        ["readonly RUN_LIMIT=$((BACKUP_LIMIT + RECOVERY_LIMIT + COPY_LIMIT + 600))\n", "readonly RUN_LIMIT=3\n"],
        ["timeout --kill-after=60 \"$RUN_LIMIT\"", "timeout --kill-after=1 \"$RUN_LIMIT\""],
      ]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 137, result.stderr);
      assert.match(alertSummary(result), /failureClass=backup-run-limit-expired exitCode=137 curtain=up$/);
      assert.deepEqual([runRecords(box)[0]?.failureClass, runRecords(box)[0]?.curtain], ["backup-run-limit-expired", "up"]);
    });

    await scenario("a backup killed before any limit is reported as killed, never as timed out", () => {
      const box = sandbox({ killBackup: true });
      const result = run(box);
      assert.equal(result.status, 137, result.stderr);
      assert.ok(result.seconds < 60);
      assert.match(alertSummary(result), /failureClass=backup-killed exitCode=137 curtain=up$/);
      assert.equal(runRecords(box)[0]?.failureClass, "backup-killed");
    });

    await scenario("a disabled schedule takes no backup and records that it was skipped", () => {
      const box = sandbox({ enabled: false });
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.calls, []);
      assert.equal(runRecords(box)[0]?.outcome, "skipped-disabled");
    });

    await scenario("retention keeps the 14 newest scheduled backups, and never a deployment, reset, or other file", () => {
      const box = sandbox();
      const seeded = Array.from({ length: 15 }, (_, index) => scheduledName(IDENTITY.commit.slice(0, 12), 15 - index));
      for (const name of seeded) writeContainerBackup(path.join(BACKUP_ROOT, name), name);
      const others = ["pre-upgrade-20261104T221907Z-6bc4f62036c2-deploy.ltfbackup.tgz", "pre-demo-reset-20261111T190000Z-scheduled-1.ltfbackup.tgz"];
      for (const name of others) writeContainerBackup(path.join(BACKUP_ROOT, name), name);
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      const archives = backups().filter((name) => SCHEDULED_ARCHIVE.test(name));
      assert.equal(archives.length, 14);
      assert.ok(!archives.includes(String(seeded[0])) && !archives.includes(String(seeded[1])), "the two oldest go");
      assert.ok(!backups().includes(`${seeded[0]}.sha256`), "with their sidecars");
      for (const name of others) assert.ok(backups().includes(name) && backups().includes(`${name}.sha256`), `${name} stays`);
      assert.deepEqual(runRecords(box)[0]?.result?.retention, { status: "pruned", removed: 2, orphanSidecars: 0 });
      assert.equal(indexOf(result.calls, "notify"), -1);
    });

    await scenario("retention that stops part-way reports how far it went, and the next run finishes it, orphaned sidecar included", () => {
      const box = sandbox();
      const seeded = Array.from({ length: 16 }, (_, index) => scheduledName(IDENTITY.commit.slice(0, 12), 16 - index));
      for (const name of seeded) writeContainerBackup(path.join(BACKUP_ROOT, name), name);
      // The run removes the three oldest, newest of them first; the second's sidecar cannot be removed.
      failRemovals(box, [`${BACKUP_ROOT}/${seeded[1]}.sha256`]);
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /retention stopped after removing 3 files; the next run finishes it/);
      assert.doesNotMatch(result.stderr, /nothing was removed/);
      assert.deepEqual(runRecords(box)[0]?.result?.retention, { status: "failed", filesRemoved: 3 });
      assert.match(alertSummary(result), /failureClass=retention-failed /);
      assert.ok(!backups().includes(String(seeded[1])) && backups().includes(`${seeded[1]}.sha256`), "the stopped removal leaves an orphaned sidecar");
      allowRemovals(box);
      const next = run(box);
      assert.equal(next.status, 0, next.stderr);
      assert.deepEqual(runRecords(box)[1]?.result?.retention, { status: "pruned", removed: 2, orphanSidecars: 1 });
      const archives = backups().filter((name) => SCHEDULED_ARCHIVE.test(name));
      assert.equal(archives.length, 14);
      assert.deepEqual(backups().filter((name) => name.endsWith(".sha256")).sort(), archives.map((name) => `${name}.sha256`).sort(), "every archive keeps its sidecar, and no sidecar is left without one");
    });

    for (const [label, tamper] of /** @type {[string, (oldest: string) => void][]} */ ([
      ["a link", (oldest) => {
        fs.rmSync(path.join(BACKUP_ROOT, oldest));
        fs.symlinkSync("/etc/hostname", path.join(BACKUP_ROOT, oldest));
        fs.lchownSync(path.join(BACKUP_ROOT, oldest), 10001, 10001);
      }],
      ["a backup another user owns", (oldest) => fs.chownSync(path.join(BACKUP_ROOT, oldest), 0, 0)],
      ["a backup with a second name", (oldest) => fs.linkSync(path.join(BACKUP_ROOT, oldest), path.join(BACKUP_ROOT, "a-second-name"))],
      ["an unexpected scheduled name", () => {
        fs.writeFileSync(path.join(BACKUP_ROOT, "scheduled-notes.txt"), "operator notes\n", { mode: 0o600 });
        fs.chownSync(path.join(BACKUP_ROOT, "scheduled-notes.txt"), 10001, 10001);
      }],
    ])) {
      await scenario(`retention refuses ${label}, removes nothing, and the completed backup alerts retention-failed`, () => {
        const box = sandbox();
        const seeded = Array.from({ length: 15 }, (_, index) => scheduledName(IDENTITY.commit.slice(0, 12), 15 - index));
        for (const name of seeded) writeContainerBackup(path.join(BACKUP_ROOT, name), name);
        tamper(String(seeded[0]));
        const before = backups();
        const result = run(box);
        assert.equal(result.status, 0, result.stderr);
        const made = backups().filter((name) => !before.includes(name));
        assert.equal(made.length, 2, "only this run's backup and sidecar are new");
        assert.deepEqual(backups().filter((name) => before.includes(name)), before, "nothing is removed");
        assert.match(result.stderr, /retention refused; nothing was removed/);
        assert.deepEqual(runRecords(box)[0]?.result?.retention, { status: "failed", filesRemoved: 0 });
        assert.match(String(result.calls.find((call) => call.action === "notify")?.args?.at(-1)), /failureClass=retention-failed /);
        assert.equal(runRecords(box)[0]?.heartbeatOutcome, "delivered", "the backup itself succeeded");
      });
    }

    await scenario("the copy hook receives exactly the backup the run inspected, after the curtain lifts", () => {
      const box = sandbox();
      writeContainerBackup(path.join(BACKUP_ROOT, scheduledName(IDENTITY.commit.slice(0, 12), 1)), "yesterday");
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      const archive = runRecords(box)[0]?.result?.archive;
      const [call, ...extra] = hookRecords(box);
      assert.equal(extra.length, 0, "the hook runs once");
      assert.deepEqual([call?.count, call?.args], [2, ["--archive", `${BACKUP_ROOT}/${archive}`]], "the hook receives the archive and nothing more");
      assert.equal(call?.markerPresent, false, "the copy never lengthens the outage");
      assert.equal(call?.sidecarVerified, true, "the hook receives an archive whose sidecar verifies");
      assert.deepEqual(runRecords(box)[0]?.result?.copy?.status, "copied");
    });

    await scenario("a failed copy keeps the local backup, still sends the heartbeat, and alerts copy-failed", () => {
      const box = sandbox({ hookFails: true });
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /the off-server copy failed; the local backup is kept/);
      assert.match(result.stderr, /the store already holds as many copies as it keeps/, "the hook's reason reaches the journal");
      assert.equal(backups().filter((name) => SCHEDULED_ARCHIVE.test(name)).length, 1);
      assert.match(String(result.calls.find((call) => call.action === "notify")?.args?.at(-1)), /failureClass=copy-failed /);
      assert.equal(runRecords(box)[0]?.heartbeatOutcome, "delivered");
    });

    for (const [label, change] of /** @type {[string, (hook: string) => void][]} */ ([
      ["another account owns", (hook) => fs.chownSync(hook, 65534, 65534)],
      ["another account may write", (hook) => fs.chmodSync(hook, 0o775)],
    ])) {
      await scenario(`a copy hook ${label} is refused before any backup, and the refusal alerts and is recorded`, () => {
        const box = sandbox();
        change(path.join(box.sbin, "longtail-forge-offsite-copy"));
        const result = run(box);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /the copy hook must be a root-owned executable regular file no one else may write/);
        assert.equal(indexOf(result.calls, "stop"), -1, "no backup may start");
        assert.deepEqual(backups(), []);
        assert.equal(hookRecords(box).length, 0);
        assert.match(alertSummary(result), /failureClass=configuration-refused exitCode=1$/, "the refusal alerts by its class alone");
        assert.ok(!alertSummary(result).includes("copy hook"), "the alert never carries the reason, which the journal has");
        assert.deepEqual([runRecords(box)[0]?.outcome, runRecords(box)[0]?.failureClass, runRecords(box)[0]?.alertOutcome], ["failed", "configuration-refused", "delivered"]);
      });
    }

    await scenario("a refused installation file alerts even before the run log's location is known", () => {
      const box = sandbox();
      fs.chmodSync(box.helperEnv, 0o644);
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /compose helper environment must use mode 0600/);
      assert.match(alertSummary(result), /failureClass=configuration-refused exitCode=1$/);
      assert.deepEqual(runRecords(box), [], "no log is written where the configuration could not say");
    });

    await scenario("with no copy hook configured, the backup stays on this server and no alert is raised", () => {
      const box = sandbox({ hook: "none" });
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(runRecords(box)[0]?.result?.copy, { status: "not-configured" });
      assert.equal(indexOf(result.calls, "notify"), -1);
    });

    await scenario("the webhook reaches curl only on standard input, and never the output", () => {
      const box = sandbox({ demoMode: "true" });
      const result = run(box);
      const notify = result.calls.find((call) => call.action === "notify");
      assert.equal(notify?.stdin, `url = "${WEBHOOK_URL}"\n`);
      assert.ok(!(notify?.args ?? []).some((arg) => arg.includes(WEBHOOK_TOKEN)), "the webhook never reaches argv");
      assert.ok(!`${result.stdout}${result.stderr}`.includes(WEBHOOK_TOKEN), "the webhook never reaches output");
      assert.match(String(notify?.args?.at(-1)), /"allowed_mentions":\{"parse":\[\]\}/, "mentions are disabled");
    });

    await scenario("a webhook file others may read is refused, and the alert reaches only the journal", () => {
      const box = sandbox({ demoMode: "true" });
      fs.chmodSync(FIXED.webhook, 0o644);
      const result = run(box);
      assert.equal(indexOf(result.calls, "notify"), -1);
      assert.equal(runRecords(box)[0]?.alertOutcome, "failed");
    });

    // -------------------------------------------------------------------------------------------
    // The copy hook, end to end against the real receiver.
    // -------------------------------------------------------------------------------------------
    /** A scheduled backup ready for the hook. */
    const readyBackup = () => {
      const name = scheduledName(IDENTITY.commit.slice(0, 12), 0);
      writeContainerBackup(path.join(BACKUP_ROOT, name), `the backup ${name}`);
      return name;
    };

    await scenario("the hook packs the archive and its sidecar, encrypts the pack, and the receiver stores it under its own name", () => {
      const box = sandbox({ hook: "real" });
      const name = readyBackup();
      const result = runHook(box, fakeBin, ["--archive", `${BACKUP_ROOT}/${name}`]);
      assert.equal(result.status, 0, result.stderr);
      const reply = /** @type {{ ok: boolean, archive: string, stored: string, sha256: string, bytes: number }} */ (JSON.parse(result.stdout.trim()));
      assert.equal(reply.archive, name);
      assert.match(reply.stored, STORED_COPY);
      const stored = fs.readFileSync(path.join(box.store, reply.stored));
      assert.equal(sha256(stored), reply.sha256);
      const encrypt = result.calls.find((call) => call.action === "encrypt");
      assert.deepEqual(encrypt?.args?.slice(0, 2), ["-r", RECIPIENT], "the pack is encrypted to the operator's public key");
      // The fake keeps the plaintext after its header, so the pack can be read back.
      const pack = stored.subarray(stored.indexOf("\n", stored.indexOf("\n") + 1) + 1);
      const listing = spawnSync("tar", ["-tf", "-"], { input: pack, encoding: "utf8" });
      assert.deepEqual(listing.stdout.trim().split("\n").sort(), [name, `${name}.sha256`], "the pack holds exactly the archive and its sidecar");
      const ssh = result.calls.find((call) => call.action === "ssh")?.args ?? [];
      for (const option of ["BatchMode=yes", "IdentitiesOnly=yes", "IdentityAgent=none", "StrictHostKeyChecking=yes", `UserKnownHostsFile=${box.knownHosts}`, "GlobalKnownHostsFile=/dev/null", "ClearAllForwardings=yes", "ForwardAgent=no"]) {
        assert.ok(ssh.includes(option), `the SSH client must use ${option}`);
      }
      assert.deepEqual([ssh[0], ssh[1], ssh[2], ssh[3]], ["-F", "/dev/null", "-i", box.identity], "no SSH configuration but the hook's own");
      assert.equal(ssh.at(-2), "ltf-offsite@203.0.113.10");
      assert.deepEqual(fs.readdirSync(STAGE_ROOT), [], "the stage is removed afterwards");
    });

    for (const [label, args, message] of /** @type {[string, (name: string) => string[], RegExp][]} */ ([
      ["an archive outside the backup root", (name) => ["--archive", `/tmp/${name}`], /must be in the protected Compose backup root/],
      ["a deployment backup", () => ["--archive", `${BACKUP_ROOT}/pre-upgrade-20261104T221907Z-6bc4f62036c2-deploy.ltfbackup.tgz`], /only a scheduled backup is copied off the server/],
      ["no archive", () => [], /usage: longtail-forge-offsite-copy --archive/],
    ])) {
      await scenario(`the hook refuses ${label}, and sends nothing`, () => {
        const box = sandbox({ hook: "real" });
        const name = readyBackup();
        const result = runHook(box, fakeBin, args(name));
        assert.equal(result.status, 1);
        assert.match(result.stderr, message);
        assert.equal(indexOf(result.calls, "ssh"), -1);
        assert.equal(indexOf(result.calls, "encrypt"), -1);
      });
    }

    for (const [label, tamper, message] of /** @type {[string, (box: Sandbox, name: string) => void, RegExp][]} */ ([
      ["an archive that does not match its sidecar", (_box, name) => fs.appendFileSync(path.join(BACKUP_ROOT, name), "tampered"), /does not match its checksum sidecar/],
      ["a sidecar that names another archive", (_box, name) => fs.writeFileSync(path.join(BACKUP_ROOT, `${name}.sha256`), `${"0".repeat(64)}  other.ltfbackup.tgz\n`), /does not name this archive/],
      ["a configuration others may read", (box) => fs.chmodSync(box.hookEnv, 0o644), /copy hook configuration must use mode 0600/],
      ["an unknown configuration key", (box) => fs.appendFileSync(box.hookEnv, "LTF_OFFSITE_EXTRA=1\n"), /unsupported key: LTF_OFFSITE_EXTRA/],
      ["a placeholder recipient", (box) => fs.writeFileSync(box.hookEnv, fs.readFileSync(box.hookEnv, "utf8").replace(RECIPIENT, "age1-replace-with-the-operators-public-key")), /must be one age X25519 public key/],
      ["an SSH key others may read", (box) => fs.chmodSync(box.identity, 0o640), /off-server SSH key must use mode 0600/],
      ["pinned host keys anyone may change", (box) => fs.chmodSync(box.knownHosts, 0o666), /pinned destination host keys must not be group- or other-writable/],
    ])) {
      await scenario(`the hook refuses ${label}, and sends nothing`, () => {
        const box = sandbox({ hook: "real" });
        const name = readyBackup();
        tamper(box, name);
        const result = runHook(box, fakeBin, ["--archive", `${BACKUP_ROOT}/${name}`]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, message);
        assert.equal(indexOf(result.calls, "ssh"), -1);
      });
    }

    await scenario("the hook reports the receiver's refusal by its fixed reason, and removes its stage", () => {
      const box = sandbox({ hook: "real" });
      for (let index = 0; index < 20; index += 1) seedCopy(box.store, 2 + index * 0.5, index);
      const result = runHook(box, fakeBin, ["--archive", `${BACKUP_ROOT}/${readyBackup()}`]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /the destination refused the copy: the store already holds as many copies as it keeps/);
      assert.deepEqual(fs.readdirSync(STAGE_ROOT), []);
    });

    await scenario("the hook fails without naming the destination when the connection fails", () => {
      const box = sandbox({ hook: "real", sshFails: true });
      const result = runHook(box, fakeBin, ["--archive", `${BACKUP_ROOT}/${readyBackup()}`]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /the copy did not reach the destination \(exit 255\)/);
      assert.ok(!result.stderr.includes("203.0.113.10"), "the connection's own diagnostics are not repeated");
    });

    await scenario("the scheduled backup and the real hook copy one encrypted backup off the server", () => {
      const box = sandbox({ hook: "real" });
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      const copy = /** @type {{ status: string, stored: string }} */ (runRecords(box)[0]?.result?.copy);
      assert.equal(copy.status, "copied");
      assert.ok(fs.existsSync(path.join(box.store, copy.stored)));
    });

    // -------------------------------------------------------------------------------------------
    // The receiver on the destination.
    // -------------------------------------------------------------------------------------------
    await scenario("the receiver stores a copy under a name it chooses, and reports it", () => {
      const box = sandbox();
      const copy = ageCopy();
      const { status, reply } = receive(box, dfBin, copy.request, copy.content);
      assert.equal(status, 0, JSON.stringify(reply));
      assert.match(String(reply.stored), STORED_COPY);
      assert.equal(sha256(fs.readFileSync(path.join(box.store, String(reply.stored)))), sha256(copy.content));
      assert.equal(fs.statSync(path.join(box.store, String(reply.stored))).mode & 0o777, 0o600);
      assert.deepEqual(fs.readdirSync(box.store).filter((name) => name.startsWith(".incoming-")), []);
    });

    for (const [label, request, input, reason] of /** @type {[string, (copy: { content: Buffer, request: string }) => string, (copy: { content: Buffer }) => Buffer | string, string][]} */ ([
      ["a malformed request", () => "rsync --server -vlogDtpre.iLsfxCIvu . /", (copy) => copy.content, "the request must be: receive <sha256> <bytes>"],
      ["a request for a shell", () => "bash -i", (copy) => copy.content, "the request must be: receive <sha256> <bytes>"],
      ["a shorter copy than declared", (copy) => copy.request, (copy) => copy.content.subarray(0, -1), "the copy is not the declared size"],
      ["a longer copy than declared", (copy) => copy.request, (copy) => Buffer.concat([copy.content, Buffer.from("x")]), "the copy is not the declared size"],
      ["a copy with another SHA-256", (copy) => copy.request.replace(/receive [a-f0-9]{64}/, `receive ${"0".repeat(64)}`), (copy) => copy.content, "the copy does not have the declared SHA-256"],
      ["a copy that is not an age file", () => `receive ${sha256("plain backup")} ${"plain backup".length}`, () => "plain backup", "the copy is not an age file"],
      ["a copy larger than one copy may be", () => `receive ${"0".repeat(64)} ${3 * 1024 ** 3}`, () => "", "the copy is larger than one copy may be"],
    ])) {
      await scenario(`the receiver refuses ${label}, and stores nothing`, () => {
        const box = sandbox();
        const copy = ageCopy();
        const { status, reply } = receive(box, dfBin, request(copy), input(copy));
        assert.equal(status, 1);
        assert.deepEqual(reply, { ok: false, reason });
        assert.deepEqual(fs.readdirSync(box.store).filter((name) => name !== ".lock"), []);
      });
    }

    await scenario("the receiver never overwrites a copy", () => {
      const box = sandbox();
      const copy = ageCopy();
      // A copy already holds the name this receipt will choose: the same SHA-256 prefix, in this second
      // and the next, so the receipt collides whichever of the two it starts in.
      waitForNextSecond();
      const now = Math.floor(Date.now() / 1000);
      const taken = [now, now + 1].map((seconds) => {
        const stamp = new Date(seconds * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
        const name = `${stamp}-${sha256(copy.content).slice(0, 16)}.ltfbackup.tar.age`;
        fs.writeFileSync(path.join(box.store, name), "the original copy\n", { mode: 0o600 });
        return name;
      });
      const { status, reply } = receive(box, dfBin, copy.request, copy.content);
      assert.equal(status, 1);
      assert.deepEqual(reply, { ok: false, reason: "a copy of that name already exists" });
      for (const name of taken) assert.equal(fs.readFileSync(path.join(box.store, name), "utf8"), "the original copy\n", "the existing copy is untouched");
      assert.deepEqual(fs.readdirSync(box.store).filter((name) => name.startsWith(".incoming-")), [], "the refused copy leaves no partial");
    });

    await scenario("the receiver removes copies older than 14 days only when a later copy is stored, and nothing else", () => {
      const box = sandbox();
      const expired = [seedCopy(box.store, 15), seedCopy(box.store, 30)];
      const kept = [seedCopy(box.store, 13), seedCopy(box.store, 1)];
      fs.writeFileSync(path.join(box.store, "operator-note.txt"), "keep me\n");
      const before = fs.readdirSync(box.store).sort();
      const refused = receive(box, dfBin, `receive ${"0".repeat(64)} 5`, "short");
      assert.equal(refused.status, 1);
      assert.deepEqual(fs.readdirSync(box.store).filter((name) => name !== ".lock").sort(), before.filter((name) => name !== ".lock"), "a refused receipt removes nothing");
      const copy = ageCopy();
      const { status, reply } = receive(box, dfBin, copy.request, copy.content);
      assert.equal(status, 0);
      assert.deepEqual([reply.kept, reply.expired], [3, 2]);
      const after = fs.readdirSync(box.store);
      for (const name of expired) assert.ok(!after.includes(name), `${name} expired`);
      for (const name of [...kept, "operator-note.txt", String(reply.stored)]) assert.ok(after.includes(name), `${name} stays`);
    });

    await scenario("the receiver refuses rather than evicts once it keeps its most copies", () => {
      const box = sandbox();
      const seeded = Array.from({ length: 20 }, (_, index) => seedCopy(box.store, 2 + index * 0.5, index));
      const copy = ageCopy();
      const { status, reply } = receive(box, dfBin, copy.request, copy.content);
      assert.equal(status, 1);
      assert.equal(reply.reason, "the store already holds as many copies as it keeps");
      assert.deepEqual(fs.readdirSync(box.store).filter((name) => STORED_COPY.test(name)).sort(), seeded.sort(), "no good copy is evicted");
    });

    await scenario("the receiver refuses a fourth copy within a day", () => {
      const box = sandbox();
      for (let index = 0; index < 3; index += 1) seedCopy(box.store, 0.1, index);
      const copy = ageCopy();
      assert.deepEqual(receive(box, dfBin, copy.request, copy.content).reply, { ok: false, reason: "as many copies as a day allows have already arrived" });
    });

    await scenario("the receiver refuses a copy that would take the store past its size cap", () => {
      const box = sandbox();
      const large = seedCopy(box.store, 3);
      fs.truncateSync(path.join(box.store, large), 10 * 1024 ** 3);
      const copy = ageCopy();
      assert.deepEqual(receive(box, dfBin, copy.request, copy.content).reply, { ok: false, reason: "the copy would take the store past its size cap" });
    });

    await scenario("the receiver refuses a copy that would leave the disk too little free space", () => {
      const box = sandbox({ freeBytes: 10 * 1024 ** 3 + 10 });
      const copy = ageCopy();
      assert.deepEqual(receive(box, dfBin, copy.request, copy.content).reply,
        { ok: false, reason: "the copy would leave the disk too little free space" });
    });

    for (const [label, tamper, reason] of /** @type {[string, (store: string) => string, string][]} */ ([
      ["a store others may enter", (store) => { fs.chmodSync(store, 0o755); return store; }, "the store directory must belong to this account with mode 0700"],
      ["a store that is a link", (store) => { fs.symlinkSync(store, `${store}-link`); return `${store}-link`; }, "the store directory must be a real directory"],
      ["a relative store", () => "store", "the store directory must be a safe absolute path"],
      ["a copy name that is a link", (store) => {
        fs.symlinkSync("/etc/hostname", path.join(store, "20261101T000000Z-0123456789abcdef.ltfbackup.tar.age"));
        return store;
      }, "the store holds a copy that is not a plain file"],
    ])) {
      await scenario(`the receiver refuses ${label}`, () => {
        const box = sandbox();
        const copy = ageCopy();
        const { status, reply } = receive(box, dfBin, copy.request, copy.content, tamper(box.store));
        assert.equal(status, 1);
        assert.equal(reply.reason, reason);
      });
    }

    await scenario("the receiver removes a partial copy an interrupted receipt left", () => {
      const box = sandbox();
      fs.writeFileSync(path.join(box.store, ".incoming-4242"), "partial", { mode: 0o600 });
      const copy = ageCopy();
      assert.equal(receive(box, dfBin, copy.request, copy.content).status, 0);
      assert.ok(!fs.existsSync(path.join(box.store, ".incoming-4242")));
    });

    await scenario("the receiver checks a copy's header without reading its first line into memory", () => {
      const box = sandbox();
      // 64 MiB of address space: room for every command an ordinary receipt runs, and far too little to
      // hold a 96 MiB first line.
      /** @param {string} request @param {Buffer} input */
      const limited = (request, input) => spawnSync("bash", ["-c", "ulimit -v 65536 && exec bash \"$0\" \"$@\"", RECEIVER, box.store], {
        input,
        encoding: "utf8",
        timeout: 120_000,
        env: { PATH: `${staticDfBin}:/usr/sbin:/usr/bin:/sbin:/bin`, SSH_ORIGINAL_COMMAND: request },
      });
      const control = ageCopy();
      const stored = limited(control.request, control.content);
      assert.equal(stored.status, 0, `the limit must leave an ordinary receipt room: ${stored.stdout}${stored.stderr}`);
      const unterminated = Buffer.alloc(96 * 1024 * 1024, 0x61);
      const refused = limited(`receive ${sha256(unterminated)} ${unterminated.length}`, unterminated);
      assert.equal(refused.status, 1, refused.stderr);
      assert.deepEqual(JSON.parse(String(refused.stdout).trim().split("\n").at(-1) || "{}"), { ok: false, reason: "the copy is not an age file" });
      assert.deepEqual(fs.readdirSync(box.store).filter((name) => name.startsWith(".incoming-")), []);
    });

    // The receipt's time limit, scaled from the sender's 1800 seconds to 2.
    const quickReceiver = scaledCopy(work, RECEIVER, "receiver-limit-2", [["readonly RECEIVE_LIMIT=1800\n", "readonly RECEIVE_LIMIT=2\n"]]);
    for (const [label, feed] of /** @type {[string, (stdin: import("node:stream").Writable, content: Buffer) => Promise<void>][]} */ ([
      ["a stream that sends every declared byte and then never closes", async (stdin, content) => {
        stdin.write(content);
      }],
      ["a stream that trickles one byte at a time", async (stdin, content) => {
        for (const byte of content) {
          if (!stdin.writable) return;
          stdin.write(Buffer.from([byte]));
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        stdin.end();
      }],
    ])) {
      await scenario(`the receiver cuts off ${label} at the receipt's time limit, and releases the store`, async () => {
        const box = sandbox();
        const copy = ageCopy("x".repeat(40));
        const { status, reply } = await receiveStreaming(quickReceiver, box.store, staticDfBin, copy.request, (stdin) => feed(stdin, copy.content), 12_000);
        assert.equal(status, 1, `the receipt must end at its limit: ${JSON.stringify(reply)}`);
        assert.deepEqual(reply, { ok: false, reason: "the copy did not arrive within the time a receipt may take" });
        assert.deepEqual(fs.readdirSync(box.store).filter((name) => name.startsWith(".incoming-")), [], "the partial copy is removed");
        assert.equal(spawnSync("flock", ["-n", path.join(box.store, ".lock"), "true"]).status, 0, "the store is released");
        assert.equal(receive(box, dfBin, copy.request, copy.content).status, 0, "the next receipt is stored");
      });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    for (const target of [STAGE_ROOT, FIXED.webhook, FIXED.heartbeat]) fs.rmSync(target, { recursive: true, force: true });
    if (createdEtc) fs.rmSync(ETC, { recursive: true, force: true });
    if (fs.existsSync(OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true });
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nScheduled backup contract: ${outcomes.length - failed.length}/${outcomes.length} scenarios passed.`);
  if (failed.length > 0) process.exit(1);
}

/** @param {string} lock */
async function waitForLockHolder(lock) {
  const deadline = Date.now() + 10_000;
  while (spawnSync("flock", ["-n", lock, "true"]).status === 0) {
    assert.ok(Date.now() < deadline, "the lock holder never took the lock");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
