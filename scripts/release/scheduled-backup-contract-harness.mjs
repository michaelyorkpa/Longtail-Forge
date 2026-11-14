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
const DEPLOY_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-compose-deploy-host.example");
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
// The local image that reference names, and another one, which the running container's image ID is.
const IMAGE_ID = `sha256:${"7".repeat(64)}`;
const OTHER_IMAGE_ID = `sha256:${"8".repeat(64)}`;
const DATA_VOLUME = "longtail-forge-data";
// A second valid data volume, such as one a recovery restored, which the configuration may name instead.
const RECOVERY_VOLUME = "longtail-forge-recovery";
const STEP_LABEL = "longtail-forge.scheduled-backup.operation";
const DATA_ROOT = "/var/lib/longtail-forge";
const STEP_NAME = /^longtail-forge-scheduled-backup-(\d{8}T\d{6}Z-[a-f0-9]{8})-(create|inspect)$/;
// The running container's environment holds the application's secrets, which no step may receive, and
// five safe runtime classifications, which each step gets, in this order.
const RUNNING_SECRET = "harness-secure-notes-master-key-never-for-a-step";
const STEP_CLASSIFICATIONS = Object.freeze([
  "LONGTAIL_ENV=production", "LONGTAIL_FILE_SCANNER=clamd", "LONGTAIL_SQLITE_FOREIGN_KEYS=on", "LONGTAIL_SQLITE_JOURNAL_MODE=wal", "LONGTAIL_WORKER_MODE=inline",
]);
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
 *   configVolume: string, configImage: string, referenceImageId: string, stepRemovalFails: boolean,
 *   stopFails: boolean, killFails: boolean, inspectHangsAfterStart: boolean, slowHealthMs: number, nameTaken: boolean,
 *   configMounts: ConfigMounts | null, containerMounts: ContainerMounts | null, oddProcesses: boolean,
 *   runningDemoMode: string | null, classification: "unsafe" | "repeated" | null,
 *   markerPath: string, lockPath: string, store: string, stateDir: string,
 * }} FakeScenario
 */
/** @typedef {"bind-over-database" | "volume-over-files" | "tmpfs-over-files" | "subpath" | "volumes-from" | "every-other-setting"} ConfigMounts */
/** @typedef {"bind-over-files" | "tmpfs-over-files" | "subpath" | "aliased-tmpfs" | "aliased-subpath" | "device-over-database"} ContainerMounts */
/** @typedef {{ id: string, name: string, label: string | null, volume: string | null }} FakeStep */
/**
 * @typedef {{ state: "running" | "stopped", healthy: boolean, startedAt: number, restarted: boolean, container: string,
 *   steps: FakeStep[] }} FakeRuntime
 */
/**
 * @typedef {{ tool: string, action: string, markerPresent: boolean, lockHeld: boolean, args?: string[], stdin?: string,
 *   archive?: string, auditLog?: string, volume?: string | null, image?: string }} FakeCall
 */
/**
 * @typedef {{ root: string, helperEnv: string, scheduleEnv: string, hookEnv: string, deployRoot: string,
 *   marker: string, state: string, store: string, sbin: string, identity: string, knownHosts: string, keyBackup: string }} Sandbox
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
  // A daemon that stops answering about the container once it is started again: only the helper's own
  // time limits end these calls.
  const stalls = () => scenario.inspectHangsAfterStart && runtime.restarted;
  if (args[0] === "image" && args[1] === "inspect") {
    record({ action: "image-id", args: args.slice(2) });
    return args.at(-1) === IMAGE ? emit(scenario.referenceImageId) : refuse(`Error: No such image: ${args.at(-1)}`);
  }
  if (args[0] === "inspect" && args[1] === "--format") {
    record({ action: "health" });
    if (stalls()) return hangUntilReleased(scenario.stateDir);
    // A release that never becomes healthy reports so at once, as Docker's health check does after its
    // retries, so a scenario never waits out the helper's whole deadline. One that is slow to start
    // reports `starting` until the scenario's delay has passed. A slow daemon answers `healthy` only
    // after its delay, by when the helper may no longer accept the answer.
    if (runtime.state !== "running") return emit("starting");
    if (scenario.slowHealthMs > 0) {
      sleepMs(scenario.slowHealthMs);
      return emit("healthy");
    }
    if (Date.now() - runtime.startedAt < scenario.healthyAfterMs) return emit("starting");
    return emit(runtime.healthy ? "healthy" : "unhealthy");
  }
  if (args[0] === "inspect") {
    record({ action: "posture", args: args.slice(1) });
    if (stalls()) return hangUntilReleased(scenario.stateDir);
    if (args[1] !== runtime.container) return refuse(`Error: No such object: ${args[1]}`);
    const posture = runtime.restarted && scenario.postureAfterStart ? scenario.postureAfterStart : scenario.posture;
    // Docker lists what is mounted in `Mounts`, by its cleaned path; what was asked for, with a volume's
    // subpath, in `HostConfig.Mounts`, and `--tmpfs` mounts in `HostConfig.Tmpfs` alone, each as spelled;
    // and devices in `HostConfig.Devices`.
    const mounts = [
      { Type: "volume", Name: DATA_VOLUME, Destination: DATA_ROOT },
      { Type: "bind", Source: BACKUP_ROOT, Destination: "/var/backups/longtail-forge" },
    ];
    /** @type {{ Type: string, Source: string, Target: string, VolumeOptions: { Subpath?: string } }[]} */
    const declared = [
      { Type: "volume", Source: DATA_VOLUME, Target: DATA_ROOT, VolumeOptions: {} },
      { Type: "bind", Source: BACKUP_ROOT, Target: "/var/backups/longtail-forge", VolumeOptions: {} },
    ];
    /** @type {Record<string, string>} */
    const tmpfs = { "/tmp": TMPFS };
    /** @type {{ PathOnHost: string, PathInContainer: string, CgroupPermissions: string }[]} */
    const devices = [];
    if (scenario.containerMounts === "bind-over-files") {
      mounts.push({ Type: "bind", Source: "/srv/other-installation/files", Destination: `${DATA_ROOT}/files` });
      declared.push({ Type: "bind", Source: "/srv/other-installation/files", Target: `${DATA_ROOT}/files`, VolumeOptions: {} });
    }
    if (scenario.containerMounts === "tmpfs-over-files") tmpfs[`${DATA_ROOT}/files`] = "";
    if (scenario.containerMounts === "subpath") declared[0] = { ...declared[0], VolumeOptions: { Subpath: "other-installation" } };
    if (scenario.containerMounts === "aliased-tmpfs") tmpfs["/var/lib//longtail-forge/./files"] = "";
    if (scenario.containerMounts === "aliased-subpath") {
      declared[0] = { ...declared[0], Target: "/var/lib/./longtail-forge", VolumeOptions: { Subpath: "other-installation" } };
    }
    if (scenario.containerMounts === "device-over-database") {
      devices.push({ PathOnHost: "/dev/zero", PathInContainer: `${DATA_ROOT}/longtail-forge.db`, CgroupPermissions: "rwm" });
    }
    // The application's environment: its secrets, its five safe classifications, and its own DEMO_MODE.
    const environment = [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "NODE_ENV=production",
      `LONGTAIL_SECURE_NOTES_MASTER_KEY=${RUNNING_SECRET}`, ...STEP_CLASSIFICATIONS, `LONGTAIL_SESSION_SECRET=${RUNNING_SECRET}`,
      `LONGTAIL_DATABASE_FILE=${DATA_ROOT}/longtail-forge.db`,
    ];
    if (scenario.runningDemoMode !== null) environment.push(`DEMO_MODE=${scenario.runningDemoMode}`);
    if (scenario.classification === "unsafe") environment[environment.indexOf("LONGTAIL_ENV=production")] = "LONGTAIL_ENV=production --privileged";
    if (scenario.classification === "repeated") environment.push("LONGTAIL_WORKER_MODE=separate");
    return emit(JSON.stringify([{
      Id: runtime.container,
      Image: IMAGE_ID,
      Config: { Image: IMAGE, User: posture === "root-user" ? "0:0" : "10001:10001", Env: environment },
      HostConfig: {
        ReadonlyRootfs: true, Privileged: false, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Tmpfs: tmpfs, Mounts: declared,
        Devices: devices,
      },
      NetworkSettings: { Ports: { "8001/tcp": [{ HostIp: posture === "public-port" ? "0.0.0.0" : "127.0.0.1", HostPort: "8001" }] } },
      Mounts: mounts,
    }]));
  }
  if (args[0] === "ps") {
    // `ps --all --quiet [--no-trunc] --filter label=KEY[=VALUE]`: the step containers that carry it.
    const filter = valueAfter(args, "--filter");
    assert.ok(args.includes("--all") && args.includes("--quiet") && filter.startsWith("label="), `unexpected docker ps: ${args.join(" ")}`);
    const wanted = filter.slice("label=".length);
    record({ action: "list-steps", args: args.slice(1) });
    const matching = runtime.steps.filter((step) => step.label !== null
      && (wanted.includes("=") ? step.label === wanted : step.label.split("=")[0] === wanted));
    return emit(matching.map((step) => `${args.includes("--no-trunc") ? step.id : step.id.slice(0, 12)}\n`).join(""));
  }
  if (args[0] === "rm") {
    record({ action: "remove-step", args: args.slice(1) });
    // Like Docker, by ID or by name.
    const id = String(args.at(-1));
    const step = runtime.steps.find((entry) => entry.id === id || entry.name === id);
    if (!step) return refuse(`Error response from daemon: No such container: ${id}`);
    if (scenario.stepRemovalFails) return refuse(`Error response from daemon: cannot remove container "/${step.name}": could not kill: permission denied`);
    save({ ...runtime, steps: runtime.steps.filter((entry) => entry.id !== step.id) });
    return 0;
  }
  // The application container's own lifecycle, by its ID, with Docker alone. Compose's stop, start, and
  // kill, which would run the configuration's lifecycle hooks and copy its content in, are refused below.
  if (["stop", "start", "kill"].includes(String(args[0]))) {
    const action = String(args[0]);
    record({ action, args });
    if (action !== "start" && stalls()) return hangUntilReleased(scenario.stateDir);
    if (args.length !== 2 || args[1] !== runtime.container) return refuse(`Error response from daemon: No such container: ${args.slice(1).join(" ")}`);
    if (action === "start") {
      save({
        ...runtime, state: "running", healthy: !scenario.restartFails, startedAt: Date.now(), restarted: true,
        container: scenario.recreated ? OTHER_CONTAINER : runtime.container,
      });
      return emit(`${args[1]}\n`);
    }
    // A recovery's stop of a release that was started again, which does not take, and a kill that fails.
    if (action === "stop" && scenario.stopFails && runtime.restarted) {
      return refuse("Error response from daemon: cannot stop container: tried to kill container, but did not receive an exit event");
    }
    if (action === "kill" && scenario.killFails) return refuse("Error response from daemon: cannot kill container: permission denied");
    save({ ...runtime, state: "stopped" });
    return emit(`${args[1]}\n`);
  }
  if (args[0] === "run") {
    // A backup step's one-off container, which has exactly what its own flags give it: the volume its
    // volume mount names, and the image its first operand names. It outlives a client that is killed,
    // and `--rm` removes it when it finishes.
    const name = valueAfter(args, "--name");
    if (scenario.nameTaken) {
      // A container this attempt never started already has the name: Docker refuses the step.
      if (!runtime.steps.some((step) => step.name === name)) {
        save({ ...runtime, steps: [...runtime.steps, { id: fakeId(`taken-${name}`), name, label: null, volume: DATA_VOLUME }] });
      }
      record({ action: "step-conflict", args });
      return refuse(`Error response from daemon: Conflict. The container name "/${name}" is already in use by another container`);
    }
    const [image, script, role, ...program] = runOperands(args);
    const step = { id: fakeId(name), name, label: args.includes("--label") ? valueAfter(args, "--label") : null, volume: mountedVolume(args) };
    const started = { ...runtime, steps: [...runtime.steps, step] };
    save(started);
    /** @param {number} status */
    const finish = (status) => {
      save({ ...started, steps: started.steps.filter((entry) => entry.id !== step.id) });
      return status;
    };
    if (script === "/opt/longtail-forge/scripts/backup.mjs" && role === "create") {
      const archive = hostBackupPath(valueAfter(program, "--output"));
      record({ action: "backup-create", archive, auditLog: valueAfter(program, "--audit-log"), args, volume: step.volume, image });
      assert.equal(runtime.state, "stopped", "a backup must never run against a running application");
      if (scenario.backupFails === "create") return finish(refuse("ENOSPC: no space left on device, write"));
      if (scenario.killBackup) {
        killBackupProcess();
        return finish(hangUntilReleased(scenario.stateDir));
      }
      if (scenario.backupHangs) {
        // A partial archive, then no progress: only the helper's time limit ends this step.
        fs.writeFileSync(archive, "a partial archive", { mode: 0o600 });
        fs.chownSync(archive, 10001, 10001);
        hangUntilReleased(scenario.stateDir);
        return finish(0);
      }
      if (scenario.oddProcesses) spawnOddProcesses(scenario.stateDir);
      writeContainerBackup(archive, `archive of ${path.basename(archive)} from the volume ${step.volume} of the image ${image}`);
      return finish(0);
    }
    if (script === "/opt/longtail-forge/scripts/backup.mjs" && role === "inspect") {
      const archive = hostBackupPath(valueAfter(program, "--archive"));
      record({ action: "backup-inspect", archive, args, volume: step.volume, image });
      if (scenario.backupFails === "inspect") return finish(refuse("Backup checksum does not match its manifest: database/longtail-forge.db"));
      return finish(fs.existsSync(archive) ? 0 : refuse("archive is missing"));
    }
    return finish(refuse(`unexpected step program: ${[script, role, ...program].join(" ")}`));
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
    // Compose's resolved form: every mount in its long syntax, and tmpfs mounts as `path:options`.
    /** @type {{ type: string, source: string, target: string, volume?: { subpath?: string } }} */
    const dataMount = { type: "volume", source: "longtail-data", target: DATA_ROOT, volume: {} };
    const volumes = [dataMount, { type: "bind", source: BACKUP_ROOT, target: BACKUP_CONTAINER_ROOT }];
    /** @type {Record<string, { name: string }>} */
    const named = { "longtail-data": { name: scenario.configVolume } };
    /** @type {Record<string, unknown>} */
    const service = { image: scenario.configImage, environment, volumes, tmpfs: [`/tmp:${TMPFS}`] };
    if (scenario.configMounts === "bind-over-database") {
      volumes.push({ type: "bind", source: "/srv/other-installation/longtail-forge.db", target: `${DATA_ROOT}/longtail-forge.db` });
    }
    if (scenario.configMounts === "volume-over-files") {
      volumes.push({ type: "volume", source: "other-files", target: `${DATA_ROOT}/files`, volume: {} });
      named["other-files"] = { name: "longtail-forge-other-files" };
    }
    if (scenario.configMounts === "tmpfs-over-files") service.tmpfs = [`/tmp:${TMPFS}`, `${DATA_ROOT}/files`];
    if (scenario.configMounts === "subpath") dataMount.volume = { subpath: "other-installation" };
    if (scenario.configMounts === "volumes-from") service.volumes_from = ["service:other-installation"];
    /** @type {Record<string, unknown>} */
    const resources = {};
    if (scenario.configMounts === "every-other-setting") {
      // Everything else that would change a container Compose created from this configuration, or that
      // Compose's own stop and start would run in or copy into the application container: a second data
      // volume by another spelling of its path, a file config over the database, a secret over the backup
      // program, another entrypoint, working directory, user, and privileges, an environment that moves
      // the database and names another runtime classification, lifecycle hooks, and inline content.
      volumes.push({ type: "volume", source: "longtail-recovery", target: "/var/./lib/longtail-forge", volume: {} });
      named["longtail-recovery"] = { name: RECOVERY_VOLUME };
      Object.assign(service, {
        configs: [{ source: "other-database", target: `${DATA_ROOT}/longtail-forge.db` }, { source: "injected", target: `${DATA_ROOT}/files/injected` }],
        secrets: [{ source: "other-program", target: "/opt/longtail-forge/scripts/backup.mjs" }],
        entrypoint: ["/bin/false"], working_dir: "/", user: "0:0", privileged: true,
        pre_stop: [{ command: ["sh", "-c", `rm -rf ${DATA_ROOT}/files`] }],
        post_start: [{ command: ["sh", "-c", `echo replaced > ${DATA_ROOT}/longtail-forge.db`] }],
      });
      Object.assign(environment, { LONGTAIL_ENV: "development", LONGTAIL_DATABASE_FILE: `${DATA_ROOT}/other.db` });
      resources.configs = { "other-database": { file: "/srv/other-installation/longtail-forge.db" }, injected: { content: "injected by Compose" } };
      resources.secrets = { "other-program": { file: "/srv/other-installation/backup.mjs" } };
    }
    return emit(JSON.stringify({ services: { "longtail-forge": service }, volumes: named, ...resources }));
  }
  if (command[0] === "up") {
    record({ action: "up", args: command });
    save({ ...runtime, state: "running", healthy: !scenario.restartFails, startedAt: Date.now(), restarted: true });
    return 0;
  }
  // Like Compose, only a container that is not stopped is listed.
  if (command[0] === "ps") {
    record({ action: "list-running" });
    if (stalls()) return hangUntilReleased(scenario.stateDir);
    return emit(runtime.state === "running" ? `${runtime.container}\n` : "");
  }
  // A Compose-created one-off container is never a backup step: Compose's `run` is refused.
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

/**
 * Makes no progress until the scenario releases it, or 30 seconds pass, and then fails, as a call that
 * never answered would.
 * @param {string} stateDir @returns {number}
 */
function hangUntilReleased(stateDir) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !fs.existsSync(path.join(stateDir, "release"))) sleepMs(100);
  return 1;
}

/** @param {number} milliseconds */
function sleepMs(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Leaves two processes whose names hold a newline. One is in the backup's session, so the sweep must
 * find and kill it. The other is in a session of its own, named so that the first line of its stat
 * record reads as a member of the backup's session, so the sweep must leave it alone. Each is a Node
 * process that names itself in one write, since a shell's printf writes a newline separately and only
 * the last write names a process, and then waits, starting no other process. Records both once their
 * names are set.
 * @param {string} stateDir
 */
function spawnOddProcesses(stateDir) {
  const session = sessionOf(process.pid);
  const names = { inside: "node\nworker", outside: `) S 1 1 ${session}\n` };
  assert.ok(Buffer.byteLength(names.outside) <= 15, `the session ID ${session} does not fit a 15-byte name`);
  const hold = "require('node:fs').writeFileSync('/proc/self/comm', process.env.ODD_NAME); setInterval(() => {}, 2 ** 30);";
  const inside = spawn(process.execPath, ["-e", hold], { stdio: "ignore", env: { ODD_NAME: names.inside } });
  const outside = spawn(process.execPath, ["-e", hold], { stdio: "ignore", detached: true, env: { ODD_NAME: names.outside } });
  inside.unref();
  outside.unref();
  /** @param {number | undefined} pid @param {string} name */
  const named = (pid, name) => {
    try {
      return fs.readFileSync(`/proc/${pid}/comm`, "utf8") === `${name}\n`;
    } catch {
      return false;
    }
  };
  const deadline = Date.now() + 5000;
  while (!(named(inside.pid, names.inside) && named(outside.pid, names.outside))) {
    assert.ok(Date.now() < deadline, "the odd processes never took their names");
    sleepMs(20);
  }
  fs.writeFileSync(path.join(stateDir, "odd.json"), JSON.stringify({ inside: inside.pid, outside: outside.pid, session }));
}

/** A process's stat fields after its command name, from the whole record, or null once it is gone. @param {number} pid */
function statFields(pid) {
  try {
    const record = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return record.slice(record.lastIndexOf(") ") + 2).trim().split(" ");
  } catch {
    return null;
  }
}

/** @param {number} pid */
function sessionOf(pid) {
  return Number(statFields(pid)?.[3]);
}

/** Whether a process is running, as opposed to gone or a zombie. @param {number} pid */
function liveProcess(pid) {
  const fields = statFields(pid);
  return fields !== null && fields[0] !== "Z";
}

/** A container ID, 64 hexadecimal characters, that a name always gives. @param {string} name */
function fakeId(name) {
  return sha256(`container ${name}`);
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
}

/** @param {string[]} args @param {string} flag */
function valueAfter(args, flag) {
  return String(args[args.indexOf(flag) + 1]);
}

/** The operands of `docker run` after its options: the image, then the program and its arguments. @param {string[]} args */
function runOperands(args) {
  const valued = new Set(["--cap-drop", "--entrypoint", "--env", "--label", "--log-driver", "--mount", "--name", "--network", "--pull",
    "--security-opt", "--tmpfs", "--user", "--volume", "--workdir"]);
  let index = 1;
  while (index < args.length && String(args[index]).startsWith("--")) index += valued.has(String(args[index])) ? 2 : 1;
  return args.slice(index);
}

/** The volume a step's volume mount names, or null when it has none. @param {string[]} args */
function mountedVolume(args) {
  for (let index = 1; index < args.length - 1; index += 1) {
    if (args[index] !== "--mount") continue;
    const fields = new Map(String(args[index + 1]).split(",").map((field) => /** @type {[string, string]} */ ([field.split("=")[0] ?? "", field.slice(field.indexOf("=") + 1)])));
    if (fields.get("type") === "volume") return fields.get("source") ?? null;
  }
  return null;
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
 *   posture?: FakePosture, postureAfterStart?: FakePosture | null, recreated?: boolean, configVolume?: string,
 *   configImage?: string, referenceImageId?: string, stepRemovalFails?: boolean, stopFails?: boolean, killFails?: boolean,
 *   inspectHangsAfterStart?: boolean, slowHealthMs?: number, nameTaken?: boolean, steps?: FakeStep[],
 *   configMounts?: ConfigMounts, containerMounts?: ContainerMounts, oddProcesses?: boolean, runningDemoMode?: string | null,
 *   classification?: "unsafe" | "repeated" | null, keyBackup?: boolean }} SandboxOptions
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
  // The Secure Notes recovery-key backup, when the scenario configures one.
  const keyBackup = options.keyBackup ? path.join(etc, "secure-notes-key.backup") : "";
  if (keyBackup) writePrivate(keyBackup, "harness recovery key\n");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${path.join(root, "compose")}`,
    `LTF_COMPOSE_HOST_ENV=${path.join(etc, "compose-host.env")}`,
    // The deploy helper, which reads this file too, needs an account that exists.
    "LTF_DEPLOY_ACCOUNT=root",
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    "LTF_IMAGE_REPOSITORY=ghcr.io/michaelyorkpa/longtail-forge",
    `LTF_MAINTENANCE_STATE_ROOT=${path.join(root, "maintenance")}`,
    `LTF_PUBLIC_URL=${ORIGIN}`,
    ...(keyBackup ? [`LTF_SECURE_KEY_BACKUP=${keyBackup}`] : []),
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
    configVolume: options.configVolume ?? DATA_VOLUME,
    configImage: options.configImage ?? IMAGE,
    referenceImageId: options.referenceImageId ?? IMAGE_ID,
    stepRemovalFails: options.stepRemovalFails === true,
    stopFails: options.stopFails === true,
    killFails: options.killFails === true,
    inspectHangsAfterStart: options.inspectHangsAfterStart === true,
    slowHealthMs: options.slowHealthMs ?? 0,
    nameTaken: options.nameTaken === true,
    configMounts: options.configMounts ?? null,
    containerMounts: options.containerMounts ?? null,
    oddProcesses: options.oddProcesses === true,
    runningDemoMode: options.runningDemoMode === undefined ? "false" : options.runningDemoMode,
    classification: options.classification ?? null,
    markerPath: marker,
    lockPath: path.join(deployRoot, "compose-operation.lock"),
    store,
    stateDir: state,
  };
  fs.writeFileSync(path.join(state, "scenario.json"), JSON.stringify(scenario));
  /** @type {FakeRuntime} */
  const runtime = { state: "running", healthy: true, startedAt: 0, restarted: false, container: CONTAINER, steps: options.steps ?? [] };
  fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify(runtime));
  fs.writeFileSync(path.join(state, "calls.jsonl"), "");
  void fakeBin;
  return { root, helperEnv, scheduleEnv, hookEnv, deployRoot, marker, state, store, sbin, identity, knownHosts, keyBackup };
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
 * The one approved profile of a backup step: every setting the step runs with, in order. Nothing else
 * may reach it, from the Compose configuration or anywhere.
 * @param {"create" | "inspect"} role @param {string} operation @param {string[]} program @param {string} keyBackup
 */
function approvedStep(role, operation, program, keyBackup) {
  const key = "/run/secrets/secure-notes-key.backup";
  return [
    "run", "--rm", "--pull", "never", "--name", `longtail-forge-scheduled-backup-${operation}-${role}`, "--label", `${STEP_LABEL}=${operation}`,
    "--network", "none", "--user", "10001:10001", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--init",
    "--log-driver", "local", "--tmpfs", `/tmp:${TMPFS}`,
    "--mount", `type=volume,source=${DATA_VOLUME},target=${DATA_ROOT},volume-nocopy`,
    "--mount", `type=bind,source=${BACKUP_ROOT},target=${BACKUP_CONTAINER_ROOT}`,
    ...(keyBackup ? ["--mount", `type=bind,source=${keyBackup},target=${key},readonly`] : []),
    ...STEP_CLASSIFICATIONS.flatMap((entry) => ["--env", entry]),
    "--workdir", "/opt/longtail-forge", "--entrypoint", "node", IMAGE_ID, "/opt/longtail-forge/scripts/backup.mjs", role,
    ...program, ...(keyBackup ? ["--secure-notes-key-backup", key] : []),
  ];
}

/**
 * Asserts that both steps of a run ran with exactly the approved profile, from the running container's
 * own image and data volume, and received none of the application's secrets. Returns the archive's name.
 * @param {RunResult} result @param {Sandbox} box
 */
function assertApprovedSteps(result, box) {
  const create = result.calls.find((call) => call.action === "backup-create");
  const inspect = result.calls.find((call) => call.action === "backup-inspect");
  const archive = path.basename(String(create?.archive));
  assert.ok(SCHEDULED_ARCHIVE.test(archive), `the create step names a scheduled archive: ${archive}`);
  const operation = STEP_NAME.exec(valueAfter(create?.args ?? [], "--name"))?.[1];
  assert.ok(operation, `the create step is named for this attempt: ${valueAfter(create?.args ?? [], "--name")}`);
  assert.ok(operation.startsWith(archive.slice("scheduled-".length, "scheduled-".length + 16)), "after the backup's own time");
  const staged = `${BACKUP_CONTAINER_ROOT}/.scheduled-pending/${archive}`;
  assert.deepEqual(create?.args, approvedStep("create", operation, [
    "--confirm-stopped", "--database", `${DATA_ROOT}/longtail-forge.db`, "--files-root", `${DATA_ROOT}/files`,
    "--output", staged, "--audit-log", `${BACKUP_CONTAINER_ROOT}/backup-operations.jsonl`,
  ], box.keyBackup), "the create step has exactly the approved profile");
  assert.deepEqual(inspect?.args, approvedStep("inspect", operation, ["--archive", staged], box.keyBackup), "and so does the inspect step");
  for (const call of [create, inspect]) {
    assert.deepEqual([call?.volume, call?.image], [DATA_VOLUME, IMAGE_ID], "each step reads the running container's own volume, from its own image");
  }
  assert.ok(!JSON.stringify(result.calls).includes(RUNNING_SECRET) && !`${result.stdout}${result.stderr}`.includes(RUNNING_SECRET),
    "no step receives, and nothing records, the application's secrets");
  return archive;
}

/**
 * Runs the real deploy helper against the same sandbox and fakes, as the deployment account's sudo rule
 * would. Its arguments name a release; a refusal under the lock comes before it reads them.
 * @param {Sandbox} box @param {string} fakeBin @param {"deploy" | "rollback"} mode @returns {RunResult}
 */
function runDeployHelper(box, fakeBin, mode) {
  const offset = fs.readFileSync(path.join(box.state, "calls.jsonl"), "utf8").length;
  const result = spawnSync("bash", [DEPLOY_HELPER, mode, "--metadata", "release-metadata.json",
    "--expected-version", IDENTITY.version, "--expected-source-branch", "main", "--expected-commit", IDENTITY.commit,
    "--expected-artifact-sha256", IDENTITY.artifact, "--expected-image-digest", `sha256:${"6".repeat(64)}`,
    "--expected-platform-manifest-digest", `sha256:${"5".repeat(64)}`], {
    encoding: "utf8",
    timeout: 120_000,
    env: { PATH: `${fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`, HOME: "/root", LANG: "C.UTF-8", LTF_COMPOSE_HELPER_ENV: box.helperEnv, HARNESS_STATE: box.state },
  });
  return { status: result.status ?? 1, stdout: String(result.stdout || ""), stderr: String(result.stderr || ""), calls: callsSince(box, offset) };
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

/** What the fake Docker daemon holds now. @param {Sandbox} box @returns {FakeRuntime} */
function runtimeOf(box) {
  return /** @type {FakeRuntime} */ (readJson(path.join(box.state, "runtime.json")));
}

/**
 * The live processes whose command line holds this text, apart from this one. A command line's
 * arguments are separated by NUL characters.
 * @param {string} text @returns {string[]}
 */
function processesNaming(text) {
  /** @type {string[]} */
  const found = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    let commandLine = "";
    try {
      commandLine = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue;
    }
    if (commandLine.includes(text)) found.push(`${entry}: ${commandLine.split("\0").join(" ").trim()}`);
  }
  return found;
}

/** The fakes still running, which only a call the helper failed to end would leave. */
function liveFakes() {
  return processesNaming(`${scriptPath}\0--fake\0`);
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
      assert.equal(create?.volume, DATA_VOLUME, "the backup reads the running container's own data volume");
      const binding = indexOf(result.calls, "image-id");
      assert.ok(binding >= 0 && result.calls[binding]?.markerPresent === false, "the image and volume binding is checked before any outage");
      // Both steps belong to this one attempt, never pull, and have nothing but the approved profile.
      assert.equal(assertApprovedSteps(result, box), archive);
      assert.deepEqual(runtimeOf(box).steps, [], "no step container outlives its step");
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
      assert.deepEqual(result.calls.slice(lastHealth).filter((call) => ["stop", "list-running", "kill"].includes(call.action)).map((call) => call.action),
        ["list-running", "stop", "list-running"], "the unverified container is stopped, so it never serves, and the stop is proved");
      const lifecycle = result.calls.filter((call) => ["stop", "start", "kill"].includes(call.action));
      assert.ok(lifecycle.length >= 3 && lifecycle.every((call) => JSON.stringify(call.args) === JSON.stringify([call.action, CONTAINER])),
        `each stop and start names the container, with Docker alone: ${JSON.stringify(lifecycle.map((call) => call.args))}`);
      assert.equal(runtimeOf(box).state, "stopped");
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

    // The steps' containers are made from the running container itself, never from the Compose
    // configuration, so nothing that configuration says reaches them. Each arrangement below would give a
    // container Compose created other data, another program, or another classification; the backup
    // still reads the running container's own volume, from its own image, with its own classifications.
    for (const [label, options] of /** @type {[string, SandboxOptions][]} */ ([
      ["a Compose configuration that names another valid data volume", { configVolume: RECOVERY_VOLUME }],
      ["a Compose configuration that names another image", { configImage: `ghcr.io/michaelyorkpa/longtail-forge@sha256:${"9".repeat(64)}` }],
      ["a Compose configuration that binds another database over the data volume's", { configMounts: "bind-over-database" }],
      ["a Compose configuration that mounts another volume over the Files tree", { configMounts: "volume-over-files" }],
      ["a Compose configuration that mounts a tmpfs over the Files tree", { configMounts: "tmpfs-over-files" }],
      ["a Compose configuration that mounts only a subpath of the data volume", { configMounts: "subpath" }],
      ["a Compose configuration that takes mounts from another container", { configMounts: "volumes-from" }],
      ["a Compose configuration with an aliased second data volume, a config over the database, a secret over the backup program, another entrypoint, directory, user, and environment, lifecycle hooks, and inline content",
        { configMounts: "every-other-setting" }],
    ])) {
      await scenario(`${label} never reaches a step: the backup reads the running container's own data`, () => {
        const box = sandbox(options);
        const result = run(box);
        assert.equal(result.status, 0, result.stderr);
        assertApprovedSteps(result, box);
        assert.equal(runRecords(box)[0]?.outcome, "succeeded");
        assert.equal(fs.existsSync(box.marker), false);
      });
    }

    await scenario("a configured Secure Notes recovery-key backup reaches both steps, read-only, in the approved profile", () => {
      const box = sandbox({ keyBackup: true });
      const result = run(box);
      assert.equal(result.status, 0, result.stderr);
      assertApprovedSteps(result, box);
    });

    // What the steps read must be the whole of what the running container serves, and the recorded
    // release's image. Each arrangement below refuses before any outage: otherwise a step would back up
    // other data, or carry a value into its command line that is not a plain classification.
    for (const [label, options] of /** @type {[string, SandboxOptions][]} */ ([
      ["the recorded image, which is no longer the running container's local image", { referenceImageId: OTHER_IMAGE_ID }],
      ["a running container with another bind over its Files tree", { containerMounts: "bind-over-files" }],
      ["a running container with a tmpfs over its Files tree", { containerMounts: "tmpfs-over-files" }],
      ["a running container that mounts only a subpath of its data volume", { containerMounts: "subpath" }],
      ["a running container with a tmpfs over its Files tree, by another spelling of the path", { containerMounts: "aliased-tmpfs" }],
      ["a running container that mounts a subpath of its data volume, by another spelling of the path", { containerMounts: "aliased-subpath" }],
      ["a running container with a device over its database", { containerMounts: "device-over-database" }],
      ["a running container whose runtime classification is not a plain value", { classification: "unsafe" }],
      ["a running container with a runtime classification set twice", { classification: "repeated" }],
    ])) {
      await scenario(`${label} refuses the backup before any outage, and backs up nothing`, () => {
        const box = sandbox(options);
        const result = run(box);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /the running container's data is not one whole volume of its recorded image, or its runtime classifications are not plain values; a backup of it could capture other data, so nothing was stopped/);
        assert.equal(result.calls.filter((call) => call.markerPresent).length, 0, "the curtain never rises");
        assert.deepEqual(["stop", "backup-create"].map((action) => indexOf(result.calls, action)), [-1, -1]);
        assert.deepEqual([backups(), pending()], [[], []]);
        assert.equal(runtimeOf(box).state, "running", "the running application is never stopped");
        assert.match(alertSummary(result), /failureClass=backup-failed exitCode=1 curtain=down$/);
      });
    }

    // The running container's own classification must agree with the configuration's.
    for (const [label, runningDemoMode, message, failureClass] of /** @type {[string, string | null, RegExp, string][]} */ ([
      ["a running container classified as the demo, whatever the configuration says", "true", /refuses the public demo: the running container is classified as the demo/, "refused-public-demo"],
      ["a running container with no classification of its own", null, /the running container's own DEMO_MODE must be exactly false/, "backup-failed"],
    ])) {
      await scenario(`${label} is refused before the curtain, and the run alerts`, () => {
        const box = sandbox({ runningDemoMode });
        const result = run(box);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, message);
        assert.equal(result.calls.filter((call) => call.markerPresent).length, 0, "the curtain never rises");
        assert.equal(indexOf(result.calls, "stop"), -1);
        assert.deepEqual(backups(), []);
        assert.match(alertSummary(result), new RegExp(`failureClass=${failureClass} `));
      });
    }

    await scenario("a step container an earlier backup left refuses the backup before any outage, and is never removed", () => {
      /** @type {FakeStep} */
      const leftover = {
        id: fakeId("leftover"), name: "longtail-forge-scheduled-backup-20261101T020000Z-0badc0de-create",
        label: `${STEP_LABEL}=20261101T020000Z-0badc0de`, volume: DATA_VOLUME,
      };
      const box = sandbox({ steps: [leftover] });
      const result = run(box);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`a step container an earlier scheduled backup started still exists; it is never removed automatically, so nothing was stopped: ${leftover.id.slice(0, 12)}`),
        "the refusal names the container, for the guide's supervised recovery");
      assert.equal(result.calls.filter((call) => call.markerPresent).length, 0, "the curtain never rises");
      assert.equal(indexOf(result.calls, "remove-step"), -1);
      assert.deepEqual(runtimeOf(box).steps, [leftover]);
    });

    await scenario("a step whose name another container holds fails, and recovery removes only what this attempt started", () => {
      const box = sandbox({ nameTaken: true });
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /the unchanged release was restarted and verified/);
      assert.ok(indexOf(result.calls, "step-conflict") >= 0);
      assert.equal(indexOf(result.calls, "remove-step"), -1, "recovery never removes a container this attempt did not start");
      assert.equal(runtimeOf(box).steps.length, 1, "the container that holds the name is still there");
      assert.match(alertSummary(result), /failureClass=backup-failed-recovered exitCode=1 curtain=down$/);
    });

    await scenario("a cut-off step container that cannot be removed keeps the release stopped behind the curtain, never started beside it", () => {
      const box = sandbox({ backupHangs: true, stepRemovalFails: true });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-limit-2-removal", [["readonly BACKUP_LIMIT=7200\n", "readonly BACKUP_LIMIT=2\n"]]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 1, result.stderr);
      const operation = STEP_NAME.exec(valueAfter(result.calls.find((call) => call.action === "backup-create")?.args ?? [], "--name"))?.[1];
      assert.ok(operation, "the step was named for its operation");
      assert.ok(result.stderr.includes(`a step container of this backup, operation ${operation}, could not be proved removed, so the release was not started beside it`),
        "the journal names the operation, for the guide's supervised recovery");
      assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
      assert.ok(indexOf(result.calls, "remove-step") >= 0, "its removal was attempted");
      assert.equal(indexOf(result.calls, "start"), -1, "the release is never started beside a step container that may still be writing");
      assert.equal(runtimeOf(box).state, "stopped");
      assert.equal(runtimeOf(box).steps.length, 1, "the step container is still there, for the operator");
      assert.equal(fs.existsSync(box.marker), true);
      assert.match(alertSummary(result), /failureClass=backup-timed-out-unrecovered,step-container-not-cleared exitCode=1 curtain=up$/);
    });

    // Once the backup has exited, nothing holds the lifecycle lock, and the step container it could not
    // remove holds none of its own. The deploy helper, the next to take the lock, must itself refuse to
    // deploy, roll back, restore, or start anything beside it.
    await scenario("after a step container that could not be removed, the deploy helper refuses a deploy and a rollback under the lock, and changes nothing", () => {
      const box = sandbox({ backupHangs: true, stepRemovalFails: true });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-limit-2-then-deploy", [["readonly BACKUP_LIMIT=7200\n", "readonly BACKUP_LIMIT=2\n"]]);
      waitForNextSecond();
      const backup = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.match(alertSummary(backup), /failureClass=backup-timed-out-unrecovered,step-container-not-cleared /, backup.stderr);
      const [left, ...others] = runtimeOf(box).steps;
      assert.ok(left && others.length === 0, "the one step container is still there");
      const current = fs.readFileSync(path.join(box.deployRoot, "state", "current.json"), "utf8");
      for (const mode of /** @type {const} */ (["deploy", "rollback"])) {
        const result = runDeployHelper(box, fakeBin, mode);
        assert.equal(result.status, 1, result.stderr);
        assert.ok(result.stderr.includes(`a step container a scheduled backup started still exists; no deploy or rollback runs beside it, so nothing was changed: ${left.id.slice(0, 12)}`),
          `${mode} names the container, for the guide's supervised recovery:\n${result.stderr}`);
        assert.deepEqual(result.calls.map((call) => [call.action, call.lockHeld]), [["list-steps", true]], `${mode} lists the step containers under the lock, and does nothing else`);
        assert.deepEqual(runtimeOf(box), { ...runtimeOf(box), state: "stopped", steps: [left] }, `${mode} leaves the release stopped and the step container where it is`);
        assert.equal(fs.existsSync(box.marker), true, `${mode} leaves the curtain up`);
        assert.equal(fs.readFileSync(path.join(box.deployRoot, "state", "current.json"), "utf8"), current, `${mode} records nothing`);
        assert.deepEqual(fs.readdirSync(path.join(box.deployRoot, "operations")), [], `${mode} opens no operation`);
      }
    });

    await scenario("a release that does not stop when asked is killed, and counts as stopped only once that is proved", () => {
      const box = sandbox({ restartFails: true, stopFails: true });
      const result = run(box);
      assert.equal(result.status, 1);
      const recovery = result.calls.slice(result.calls.map((call) => call.action).lastIndexOf("health"));
      assert.deepEqual(recovery.filter((call) => ["stop", "list-running", "kill"].includes(call.action)).map((call) => call.action),
        ["list-running", "stop", "list-running", "kill", "list-running"]);
      assert.deepEqual(recovery.find((call) => call.action === "kill")?.args, ["kill", CONTAINER], "the kill names the container");
      assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
      assert.equal(runtimeOf(box).state, "stopped");
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered exitCode=1 curtain=up$/);
    });

    await scenario("a release that cannot be proved stopped is reported so, and never as stopped", () => {
      const box = sandbox({ restartFails: true, stopFails: true, killFails: true });
      const result = run(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /could not be proved stopped; it may still be running, and the maintenance curtain and protected evidence remain/);
      assert.doesNotMatch(result.stderr, /it was stopped/);
      assert.equal(runtimeOf(box).state, "running");
      assert.equal(fs.existsSync(box.marker), true);
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered,release-not-stopped exitCode=1 curtain=up$/);
    });

    await scenario("stalled Docker queries end within recovery's own limit, and a release that then cannot be proved stopped is reported so", () => {
      const box = sandbox({ inspectHangsAfterStart: true });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-stalled", [
        ["readonly QUERY_LIMIT=30\n", "readonly QUERY_LIMIT=2\n"],
        ["readonly STOP_LIMIT=120\n", "readonly STOP_LIMIT=2\n"],
        ["readonly RECOVERY_LIMIT=1200\n", "readonly RECOVERY_LIMIT=16\n"],
        ["readonly STOP_RESERVE=300\n", "readonly STOP_RESERVE=8\n"],
      ]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      const leftovers = liveFakes();
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 1, result.stderr);
      // Every stalled call would otherwise wait 30 seconds; the restart after the backup and recovery's
      // restart and stop are each bounded by recovery's scaled limit.
      assert.ok(result.seconds < 25, `the run took ${result.seconds}s`);
      assert.match(result.stderr, /could not be proved stopped/);
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered,release-not-stopped exitCode=1 curtain=up$/);
      assert.deepEqual(leftovers, [], "no stalled call outlives the run");
    });

    await scenario("a restart that uses all of recovery's time still leaves its reserve to stop the release and prove it", () => {
      const box = sandbox({ healthyAfterMs: 600_000 });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-reserve", [
        ["readonly RECOVERY_LIMIT=1200\n", "readonly RECOVERY_LIMIT=10\n"],
        ["readonly STOP_RESERVE=300\n", "readonly STOP_RESERVE=4\n"],
      ]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /the restarted release did not verify/);
      assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
      assert.equal(runtimeOf(box).state, "stopped");
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered exitCode=1 curtain=up$/);
      assert.ok(result.seconds < 30, `the run took ${result.seconds}s`);
    });

    await scenario("a health answer that would come after the health deadline is never accepted", () => {
      const box = sandbox({ slowHealthMs: 4000 });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-health-2", [["readonly HEALTH_LIMIT=90\n", "readonly HEALTH_LIMIT=2\n"]]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /the restarted release did not verify/);
      assert.match(result.stderr, /it was stopped, and the maintenance curtain and protected evidence remain/);
      assert.equal(indexOf(result.calls, "http"), -1, "a release whose health was not answered in time is never asked whether it is ready");
      assert.match(alertSummary(result), /failureClass=backup-failed-unrecovered exitCode=1 curtain=up$/);
    });

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
      const createName = valueAfter(result.calls.find((call) => call.action === "backup-create")?.args ?? [], "--name");
      assert.deepEqual(result.calls.filter((call) => call.action === "remove-step").map((call) => String(call.args?.at(-1))), [fakeId(createName)],
        "the cut-off step's container, and only it, is removed");
      assert.ok(result.calls.map((call) => call.action).lastIndexOf("list-steps") < indexOf(result.calls, "start"), "and proved gone before the release starts");
      assert.deepEqual(runtimeOf(box).steps, []);
      const recovery = result.calls.slice(indexOf(result.calls, "start"));
      assert.ok(recovery.filter((call) => call.action === "health").length >= 2, "the release took longer than the backup's limit to become healthy");
      assert.ok(recovery.every((call) => call.tool !== "docker" || call.lockHeld), "recovery runs under the lock the backup holds");
      assert.equal(fs.existsSync(box.marker), false, "the curtain lifts once the release verifies");
      assert.deepEqual(backups(), []);
      assert.deepEqual(pending(), [], "the partial archive is discarded");
      assert.match(alertSummary(result), /failureClass=backup-timed-out-recovered exitCode=1 curtain=down$/);
      assert.ok(result.seconds < 60, `the run took ${result.seconds}s`);
    });

    // The step's own time limit runs it in a process group of its own, which the backstop's kill never
    // reaches, so the step outlives the backup, holding the lifecycle lock, until the run sweeps it.
    await scenario("a backup the run's own backstop kills is reported as that limit's expiry, with the curtain up, and leaves nothing holding the lock", () => {
      const box = sandbox({ backupHangs: true });
      const helper = scaledCopy(work, SCHEDULED_HELPER, "scheduled-backup-run-limit-3", [
        ["readonly RUN_LIMIT=$((PREFLIGHT_LIMIT + BACKUP_LIMIT + RECOVERY_LIMIT + COPY_LIMIT + 600))\n", "readonly RUN_LIMIT=3\n"],
        ["timeout --kill-after=60 \"$RUN_LIMIT\"", "timeout --kill-after=1 \"$RUN_LIMIT\""],
      ]);
      waitForNextSecond();
      const result = runScheduled(box, fakeBin, ["run", "--trigger", "manual"], helper);
      const lockFree = spawnSync("flock", ["-n", path.join(box.deployRoot, "compose-operation.lock"), "true"]).status === 0;
      const leftovers = liveFakes();
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 137, result.stderr);
      assert.ok(lockFree, "nothing of the backup still holds the lifecycle lock when the run reports");
      assert.deepEqual(leftovers, [], "no process of the backup outlives the run");
      assert.match(result.stderr, /processes of the backup outlived it, and were killed/);
      assert.match(alertSummary(result), /failureClass=backup-run-limit-expired,processes-swept exitCode=137 curtain=up$/);
      assert.deepEqual([runRecords(box)[0]?.failureClass, runRecords(box)[0]?.curtain], ["backup-run-limit-expired,processes-swept", "up"]);
    });

    // A step still running when the backup itself is killed outlives it too, as a real step would.
    await scenario("a backup killed before any limit is reported as killed, never as timed out, and leaves nothing holding the lock", () => {
      const box = sandbox({ killBackup: true });
      const result = run(box);
      const lockFree = spawnSync("flock", ["-n", path.join(box.deployRoot, "compose-operation.lock"), "true"]).status === 0;
      const leftovers = liveFakes();
      fs.writeFileSync(path.join(box.state, "release"), "");
      assert.equal(result.status, 137, result.stderr);
      assert.ok(result.seconds < 60);
      assert.ok(lockFree, "nothing of the backup still holds the lifecycle lock when the run reports");
      assert.deepEqual(leftovers, []);
      assert.match(alertSummary(result), /failureClass=backup-killed,processes-swept exitCode=137 curtain=up$/);
      assert.equal(runRecords(box)[0]?.failureClass, "backup-killed,processes-swept");
    });

    // A command name may hold a newline. The sweep reads each whole stat record, so it finds the backup's
    // own process by its session, and never takes another session's for one by what its name says.
    await scenario("processes named with a newline are swept by their own session, never by what their names say", () => {
      const box = sandbox({ oddProcesses: true });
      const result = run(box);
      assert.ok(fs.existsSync(path.join(box.state, "odd.json")), `the odd processes were never recorded:\n${result.stderr}`);
      const odd = /** @type {{ inside: number, outside: number, session: number }} */ (readJson(path.join(box.state, "odd.json")));
      const insideLive = liveProcess(odd.inside);
      const outsideLive = liveProcess(odd.outside);
      const lockFree = spawnSync("flock", ["-n", path.join(box.deployRoot, "compose-operation.lock"), "true"]).status === 0;
      try {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(sessionOf(odd.outside) === odd.session, false, "the other process is in a session of its own");
        assert.equal(insideLive, false, "the backup's own process, named with a newline, is killed");
        assert.equal(outsideLive, true, "a process outside the backup's session is never killed, whatever its name says");
        assert.ok(lockFree, "nothing of the backup still holds the lifecycle lock when the run reports");
        assert.match(alertSummary(result), /failureClass=processes-swept exitCode=0 archive=/);
        assert.equal(runRecords(box)[0]?.failureClass, "processes-swept");
      } finally {
        for (const pid of [odd.inside, odd.outside]) {
          if (liveProcess(pid)) process.kill(pid, "SIGKILL");
        }
      }
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
