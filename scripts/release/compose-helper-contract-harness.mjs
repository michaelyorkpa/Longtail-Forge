#!/usr/bin/env node
// Executable contract for the root-owned Compose host helper (the `v0.33.33` post-release patch).
//
// The helper validates release identity, native proof, demo classification, and the ordering of its
// curtain, backup, recovery, and rollback paths. A source-text contract cannot prove any of that:
// v0.33.33 shipped a helper whose own release failed its native check. This harness runs the actual
// helper bytes as root, with the real bash, jq, coreutils, and flock, against the retained published
// metadata of real releases. Only Docker, HTTP, and the public-demo isolation helper are fakes, and
// every fake call records whether the deployment marker existed at that moment, so "refused before
// pull", "refused before the curtain", and "curtained through the outage" are observed, not inferred.
//
// It needs native Linux and passwordless sudo, uses the helper's fixed backup root under
// /var/backups/longtail-forge, and refuses a host that may already hold real backups there. Run it
// only on a disposable machine, such as the maintenance rehearsal's clean runner.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const BACKUP_PARENT = "/var/backups/longtail-forge";
const BACKUP_ROOT = `${BACKUP_PARENT}/compose`;
const BACKUP_CONTAINER_ROOT = "/var/backups/longtail-forge";
const HARNESS_OWNERSHIP_MARKER = `${BACKUP_PARENT}/.ltf-helper-harness`;
const REPOSITORY = "ghcr.io/michaelyorkpa/longtail-forge";
const DEPLOY_ACCOUNT = "ltf-harness-deploy";
const PREVIEW_ORIGIN = "https://preview.harness.test";
const DEMO_ORIGIN = "https://demo.longtailforge.com";
const APP_CONTAINER = "harness-longtail-forge";
const REPAIRED_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-compose-deploy-host.example");
const ORIGINAL_HELPER = path.join(repoRoot, "tests/fixtures/compose-helper/v0.33.33-longtail-forge-compose-deploy-host.example");
const PREVIOUS_METADATA = path.join(repoRoot, "tests/fixtures/release-metadata/v0.33.32.45-release-metadata.json");
const CURRENT_METADATA = path.join(repoRoot, "tests/fixtures/release-metadata/v0.33.33-release-metadata.json");

/** @typedef {{ driver: string, sqlite: string }} NativeTruth */
/** @typedef {{ platform: string, labels: { revision: string, artifact: string, branch: string }, native: NativeTruth | null, health: "healthy" | "unhealthy", identity: { version: string, commit: string, artifact: string } }} FakeImage */
/** @typedef {{ images: Record<string, FakeImage>, demoMode: string | null, restoreFails: boolean, markerPath: string, publicOrigin: string }} FakeScenario */
/** @typedef {{ running: string | null, state: "running" | "stopped" | "absent", records: string[] }} FakeRuntime */
/** @typedef {{ tool: string, action: string, markerPresent: boolean, ref?: string, image?: string | null, archive?: string, preRestore?: string, keyBackup?: boolean, url?: string, mode?: string }} FakeCall */
/** @typedef {{ version: string, commitSha: string, channel: string, sourceBranch: string, schemaVersion: number, application: string, artifact: { sha256: string }, image: { repository: string, digest: string, reference: string, platform: string, platformManifest: { digest: string, os: string, architecture: string }, nativeDependency?: { betterSqlite3Version: string, sqliteVersion: string, execution: string, platform: string, architecture: string }, attestations: { sbom?: { predicateType: string }, provenance?: { predicateType: string } } } }} ReleaseMetadata */
/** @typedef {{ version: string, commit: string, artifact: string, digest: string, platformManifestDigest: string, reference: string }} ReleaseIdentity */
/** @typedef {{ root: string, fakeBin: string, helperEnv: string, deployRoot: string, stateRoot: string, releaseRoot: string, inbox: string, marker: string, harnessState: string, origin: string }} Sandbox */
/** @typedef {{ status: number, stdout: string, stderr: string, calls: FakeCall[], backupsBefore: string[], backupsAfter: string[] }} HelperResult */

if (process.argv[2] === "--fake") {
  process.exitCode = runFake(String(process.argv[3]), process.argv.slice(4));
} else {
  await main();
}

// ---------------------------------------------------------------------------------------------
// Fakes. Each runs as a child of the helper, as root, and reads the scenario the harness wrote.
// ---------------------------------------------------------------------------------------------

/** @param {string} tool @param {string[]} args @returns {number} */
function runFake(tool, args) {
  const stateDir = String(process.env.HARNESS_STATE || "");
  const scenario = /** @type {FakeScenario} */ (readJson(path.join(stateDir, "scenario.json")));
  const runtime = /** @type {FakeRuntime} */ (readJson(path.join(stateDir, "runtime.json")));
  /** @param {Omit<FakeCall, "tool" | "markerPresent">} entry */
  const record = (entry) => {
    const call = { tool, markerPresent: fs.existsSync(scenario.markerPath), ...entry };
    fs.appendFileSync(path.join(stateDir, "calls.jsonl"), `${JSON.stringify(call)}\n`);
    fs.chmodSync(path.join(stateDir, "calls.jsonl"), 0o644);
  };
  /** @param {FakeRuntime} next */
  const save = (next) => {
    fs.writeFileSync(path.join(stateDir, "runtime.json"), JSON.stringify(next));
    fs.chmodSync(path.join(stateDir, "runtime.json"), 0o644);
  };
  if (tool === "docker") return fakeDocker(args, scenario, runtime, record, save);
  if (tool === "curl") return fakeCurl(args, scenario, runtime, record);
  if (tool === "isolation") {
    record({ action: "isolation", mode: args[0] });
    return 0;
  }
  process.stderr.write(`unknown fake tool ${tool}\n`);
  return 2;
}

/**
 * @param {string[]} args @param {FakeScenario} scenario @param {FakeRuntime} runtime
 * @param {(entry: Omit<FakeCall, "tool" | "markerPresent">) => void} record @param {(next: FakeRuntime) => void} save
 * @returns {number}
 */
function fakeDocker(args, scenario, runtime, record, save) {
  if (args[0] === "compose") return fakeCompose(args.slice(1), scenario, runtime, record, save);
  if (args[0] === "pull") {
    const ref = String(args.at(-1));
    record({ action: "pull", ref });
    if (!scenario.images[ref]) return refuse(`manifest unknown: ${ref}`);
    return 0;
  }
  if (args[0] === "image" && args[1] === "inspect") {
    const ref = String(args[2]);
    const image = scenario.images[ref];
    if (!image) return refuse(`no such image: ${ref}`);
    const format = valueAfter(args, "--format");
    if (format === "{{json .RepoDigests}}") return emit(JSON.stringify([ref]));
    if (format === "{{.Os}}/{{.Architecture}}") return emit(image.platform);
    if (format.includes("org.opencontainers.image.revision")) return emit(image.labels.revision);
    if (format.includes("com.longtailforge.runtime-artifact.sha256")) return emit(image.labels.artifact);
    if (format.includes("com.longtailforge.source-branch")) return emit(image.labels.branch);
    return refuse(`unsupported image inspect format ${format}`);
  }
  if (args[0] === "run") {
    const scriptIndex = args.indexOf("-e");
    const ref = String(args[scriptIndex - 1]);
    const image = scenario.images[ref];
    if (args.includes("--network") && valueAfter(args, "--network") === "none") {
      record({ action: "native-probe", ref });
      if (!image?.native) return refuse("Error: Cannot find module 'better-sqlite3'");
      return emit(JSON.stringify({ architecture: "x64", packageVersion: image.native.driver, platform: "linux", sqliteVersion: image.native.sqlite }));
    }
    record({ action: "scanner-probe", ref });
    return image ? 0 : 1;
  }
  if (args[0] === "network" && args[1] === "inspect") {
    record({ action: "network-inspect" });
    return 0;
  }
  if (args[0] === "inspect") {
    const format = args.includes("--format") ? valueAfter(args, "--format") : "";
    const image = runtime.running ? scenario.images[runtime.running] : undefined;
    if (format.includes(".State.Health")) {
      record({ action: "health", image: runtime.running });
      return emit(runtime.state === "running" && image ? image.health : "missing");
    }
    record({ action: "posture", image: runtime.running });
    return emit(JSON.stringify([{
      Config: { Image: runtime.running, User: "10001:10001" },
      HostConfig: {
        ReadonlyRootfs: true,
        Privileged: false,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001" },
      },
      NetworkSettings: { Ports: { "8001/tcp": [{ HostIp: "127.0.0.1", HostPort: "8001" }] } },
      Mounts: [
        { Type: "volume", Destination: "/var/lib/longtail-forge" },
        { Type: "bind", Source: BACKUP_ROOT, Destination: BACKUP_CONTAINER_ROOT },
      ],
    }]));
  }
  return refuse(`unexpected docker invocation: ${args.join(" ")}`);
}

/**
 * @param {string[]} args @param {FakeScenario} scenario @param {FakeRuntime} runtime
 * @param {(entry: Omit<FakeCall, "tool" | "markerPresent">) => void} record @param {(next: FakeRuntime) => void} save
 * @returns {number}
 */
function fakeCompose(args, scenario, runtime, record, save) {
  if (args[0] === "version") return emit("Docker Compose version v2.29.7");
  /** @type {string[]} */
  const envFiles = [];
  let index = 0;
  while (["--project-directory", "--file", "--env-file"].includes(String(args[index]))) {
    if (args[index] === "--env-file") envFiles.push(String(args[index + 1]));
    index += 2;
  }
  const command = args.slice(index);
  const releaseEnv = envFiles.at(-1);
  const image = releaseEnv ? readReleaseImage(releaseEnv) : null;
  if (command[0] === "config") {
    if (command.includes("--quiet")) return 0;
    return emit(JSON.stringify(composeConfig(scenario)));
  }
  if (command[0] === "stop") {
    record({ action: "stop", image: runtime.running });
    if (runtime.state === "running") save({ ...runtime, state: "stopped" });
    return 0;
  }
  if (command[0] === "up") {
    record({ action: "up", image });
    save({ ...runtime, running: image, state: "running" });
    return 0;
  }
  if (command[0] === "ps") {
    return emit(runtime.state === "absent" ? "" : APP_CONTAINER);
  }
  if (command[0] === "run") {
    const service = command.indexOf("longtail-forge");
    const program = command.slice(service + 1);
    const keyBackup = program.includes("--secure-notes-key-backup");
    if (program[0] === "node" && program[1] === "scripts/backup.mjs") {
      const action = String(program[2]);
      if (action === "create") {
        const archive = hostBackupPath(valueAfter(program, "--output"));
        record({ action: "backup-create", image, archive, keyBackup });
        fs.writeFileSync(archive, JSON.stringify({ image, records: runtime.records }));
        return 0;
      }
      if (action === "inspect") {
        const archive = hostBackupPath(valueAfter(program, "--archive"));
        record({ action: "backup-inspect", image, archive, keyBackup });
        return fs.existsSync(archive) ? 0 : refuse(`archive is missing: ${archive}`);
      }
      if (action === "restore") {
        const archive = hostBackupPath(valueAfter(program, "--archive"));
        const preRestore = hostBackupPath(valueAfter(program, "--pre-restore-backup"));
        record({ action: "backup-restore", image, archive, preRestore, keyBackup });
        if (scenario.restoreFails || !fs.existsSync(archive)) return refuse("restore failed");
        fs.writeFileSync(preRestore, JSON.stringify({ image, records: runtime.records }));
        const restored = /** @type {{ records: string[] }} */ (readJson(archive));
        save({ ...runtime, records: restored.records });
        return 0;
      }
    }
    if (command.includes("--user") && valueAfter(command, "--user") === "0:0" && program[0] === "node" && program[1] === "-e") {
      record({ action: "demo-data-root", image });
      return 0;
    }
  }
  return refuse(`unexpected docker compose invocation: ${command.join(" ")}`);
}

/**
 * @param {string[]} args @param {FakeScenario} scenario @param {FakeRuntime} runtime
 * @param {(entry: Omit<FakeCall, "tool" | "markerPresent">) => void} record
 * @returns {number}
 */
function fakeCurl(args, scenario, runtime, record) {
  const url = String(args.at(-1));
  record({ action: "http", url });
  const origin = url.startsWith("http://127.0.0.1:8001/") ? "http://127.0.0.1:8001" : scenario.publicOrigin;
  if (!url.startsWith(`${origin}/`)) return refuse(`curl: (6) Could not resolve host for ${url}`, 6);
  const image = runtime.running ? scenario.images[runtime.running] : undefined;
  if (runtime.state !== "running" || !image || image.health !== "healthy") {
    return refuse("curl: (22) The requested URL returned error: 503", 22);
  }
  const route = url.slice(origin.length);
  if (route === "/healthz") return emit(JSON.stringify({ status: "ok" }));
  if (route === "/readyz") return emit(JSON.stringify({ status: "ready" }));
  if (route === "/api/app-info") {
    return emit(JSON.stringify({
      canonicalVersion: image.identity.version,
      sourceBranch: "main",
      commitSha: image.identity.commit,
      artifactSha256: image.identity.artifact,
    }));
  }
  return refuse(`curl: (22) unexpected route ${route}`, 22);
}

/** @param {FakeScenario} scenario */
function composeConfig(scenario) {
  /** @type {Record<string, string>} */
  const environment = { LONGTAIL_CLAMD_HOST: "172.30.17.1", LONGTAIL_CLAMD_PORT: "3310" };
  if (scenario.demoMode !== null) environment.DEMO_MODE = scenario.demoMode;
  return {
    name: "longtail-forge",
    services: {
      "longtail-forge": {
        environment,
        user: "10001:10001",
        read_only: true,
        cap_drop: ["ALL"],
        security_opt: ["no-new-privileges:true"],
        tmpfs: ["/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001"],
        ports: [{ host_ip: "127.0.0.1", target: 8001, published: "8001", protocol: "tcp", mode: "ingress" }],
        volumes: [
          { type: "volume", source: "longtail-data", target: "/var/lib/longtail-forge" },
          { type: "bind", source: BACKUP_ROOT, target: BACKUP_CONTAINER_ROOT },
        ],
        networks: { "preview-internal": null },
      },
    },
    networks: { "preview-internal": { name: "longtail-forge-preview", external: true } },
    volumes: { "longtail-data": { name: "longtail-forge-data" } },
  };
}

/** @param {string} releaseEnv @returns {string | null} */
function readReleaseImage(releaseEnv) {
  const line = fs.readFileSync(releaseEnv, "utf8").split("\n").find((entry) => entry.startsWith("LONGTAIL_IMAGE="));
  return line ? line.slice("LONGTAIL_IMAGE=".length) : null;
}

/** @param {string} containerPath */
function hostBackupPath(containerPath) {
  assert.ok(containerPath.startsWith(`${BACKUP_CONTAINER_ROOT}/`), `backup path escaped the container root: ${containerPath}`);
  return path.posix.join(BACKUP_ROOT, path.posix.basename(containerPath));
}

/** @param {string[]} args @param {string} flag */
function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1]) : "";
}

/** @param {string} text */
function emit(text) {
  process.stdout.write(`${text}\n`);
  return 0;
}

/** @param {string} message @param {number} [code] */
function refuse(message, code = 1) {
  process.stderr.write(`${message}\n`);
  return code;
}

/** @param {string} filePath @returns {unknown} */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ---------------------------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------------------------

async function main() {
  assert.equal(process.platform, "linux", "the Compose helper contract harness requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  for (const command of ["bash", "jq", "flock", "install", "stat", "useradd"]) {
    assert.equal(spawnSync("bash", ["-c", `command -v ${command}`]).status, 0, `${command} is required`);
  }
  const createdAccount = prepareHost();
  const work = fs.mkdtempSync("/tmp/ltf-helper-harness-");
  fs.chmodSync(work, 0o755);
  const fakeBin = path.join(work, "bin");
  fs.mkdirSync(fakeBin, { mode: 0o755 });
  for (const tool of ["docker", "curl"]) {
    fs.writeFileSync(path.join(fakeBin, tool), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake ${tool} "$@"\n`, { mode: 0o755 });
  }
  const previous = loadRelease(PREVIOUS_METADATA);
  const current = loadRelease(CURRENT_METADATA);
  /** @type {{ name: string, ok: boolean, detail?: string }[]} */
  const outcomes = [];
  let ordinal = 0;
  /** @param {string} name @param {(context: { sandbox: (options?: SandboxOptions) => Sandbox }) => void | Promise<void>} run */
  const scenario = async (name, run) => {
    try {
      await run({ sandbox: (options = {}) => createSandbox(work, (ordinal += 1), fakeBin, options) });
      outcomes.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      outcomes.push({ name, ok: false, detail: error instanceof Error ? error.stack || error.message : String(error) });
      console.log(`FAIL ${name}\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    await scenario("the published v0.33.33 helper rejects its own 13.0.3 release before any pull", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      const result = runHelper(box, ORIGINAL_HELPER, "deploy", current.metadata, current.identity);
      assertRefusedBeforePull(box, result, "native better-sqlite3 proof is missing", previous);
    });

    await scenario("the published v0.33.33 helper still deploys a 13.0.1 release, proving the harness runs it faithfully", ({ sandbox }) => {
      const box = sandbox({ images: [previous], baseline: previous });
      const result = runHelper(box, ORIGINAL_HELPER, "deploy", previous.metadata, previous.identity);
      assert.equal(result.status, 0, result.stderr);
    });

    await scenario("the repaired helper deploys the 13.0.3 release over the 13.0.1 baseline, curtained through the outage", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, secureKeyBackup: true });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /"ok":true,"mode":"deploy"/);
      assertDeployOrdering(result.calls, previous, current);
      assert.equal(readState(box, "current.json").commitSha, current.identity.commit);
      const previousState = readState(box, "previous.json");
      assert.equal(previousState.commitSha, previous.identity.commit);
      assert.match(String(previousState.deployment?.rollbackBackup), /pre-upgrade-.*\.ltfbackup\.tgz$/);
      assert.ok(result.calls.filter((call) => call.action === "backup-create" || call.action === "backup-inspect").every((call) => call.keyBackup));
      assert.equal(fs.existsSync(box.marker), false, "the deployment marker must be cleared after verified identity");
      assert.equal(readRuntime(box).running, current.identity.reference);
    });

    await scenario("explicit rollback restores the previous 13.0.1 release and its pre-upgrade data", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      assert.equal(runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity).status, 0);
      const preUpgrade = String(readState(box, "previous.json").deployment?.rollbackBackup);
      writeRuntime(box, { ...readRuntime(box), records: [...readRuntime(box).records, "post-upgrade write"] });
      const result = runHelper(box, REPAIRED_HELPER, "rollback", previous.metadata, previous.identity);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /"ok":true,"mode":"rollback"/);
      const pull = indexOfCall(result.calls, "pull");
      const stop = indexOfCall(result.calls, "stop");
      assert.ok(pull >= 0 && stop > pull && !result.calls[pull]?.markerPresent && result.calls[stop]?.markerPresent);
      const backup = result.calls.find((call) => call.action === "backup-create");
      assert.equal(backup?.image, current.identity.reference, "the current release must back itself up before rollback");
      const restore = result.calls.find((call) => call.action === "backup-restore");
      assert.equal(restore?.image, previous.identity.reference, "the rollback target must restore with its own release");
      assert.equal(restore?.archive, preUpgrade, "rollback must restore the recorded pre-upgrade backup");
      assert.equal(readState(box, "current.json").commitSha, previous.identity.commit);
      assert.equal(readState(box, "previous.json").commitSha, current.identity.commit);
      assert.deepEqual(readRuntime(box).records, ["baseline data"], "rollback must return the pre-upgrade data");
      assert.equal(readRuntime(box).running, previous.identity.reference);
      assert.equal(fs.existsSync(box.marker), false);
    });

    await scenario("a failed candidate is recovered automatically to the prior release and data without a rollback", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, unhealthy: [current] });
      const currentBefore = stateHash(box, "current.json");
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /candidate failed; prior release and data were restored and verified/);
      const restore = result.calls.find((call) => call.action === "backup-restore");
      assert.equal(restore?.image, previous.identity.reference, "recovery must restore with the prior release");
      assert.match(String(restore?.archive), /pre-upgrade-.*\.ltfbackup\.tgz$/, "recovery must use the backup taken by this operation");
      const ups = result.calls.filter((call) => call.action === "up").map((call) => call.image);
      assert.deepEqual(ups, [current.identity.reference, previous.identity.reference]);
      assert.equal(stateHash(box, "current.json"), currentBefore, "a failed deployment must not record the candidate");
      assert.equal(stateExists(box, "previous.json"), false, "a failed deployment must not create a rollback record");
      assert.equal(readRuntime(box).running, previous.identity.reference);
      assert.deepEqual(readRuntime(box).records, ["baseline data"]);
      assert.equal(fs.existsSync(box.marker), false, "a verified recovery clears only the deployment marker");
    });

    await scenario("a failed candidate whose recovery also fails keeps the curtain and the evidence", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, unhealthy: [current], restoreFails: true });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /candidate and verified recovery did not complete; deployment marker and protected evidence remain/);
      assert.equal(fs.existsSync(box.marker), true, "an unrecovered deployment must keep the curtain");
      assert.ok(fs.readdirSync(BACKUP_ROOT).some((name) => /^pre-upgrade-/.test(name)), "the pre-upgrade backup must remain");
    });

    await scenario("a failed rollback target restores the pre-rollback current release and data", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      assert.equal(runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity).status, 0);
      writeRuntime(box, { ...readRuntime(box), records: [...readRuntime(box).records, "post-upgrade write"] });
      markUnhealthy(box, previous);
      const result = runHelper(box, REPAIRED_HELPER, "rollback", previous.metadata, previous.identity);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /rollback target failed; pre-rollback current release and data were restored and verified/);
      const restores = result.calls.filter((call) => call.action === "backup-restore");
      assert.deepEqual(restores.map((call) => call.image), [previous.identity.reference, current.identity.reference]);
      assert.match(String(restores[1]?.archive), /pre-rollback-.*\.ltfbackup\.tgz$/);
      assert.equal(readState(box, "current.json").commitSha, current.identity.commit);
      assert.deepEqual(readRuntime(box).records, ["baseline data", "post-upgrade write"]);
      assert.equal(readRuntime(box).running, current.identity.reference);
      assert.equal(fs.existsSync(box.marker), false);
    });

    for (const [label, mutate, message] of tamperCases(current)) {
      await scenario(`tampered metadata is refused before any pull: ${label}`, ({ sandbox }) => {
        const box = sandbox({ images: [previous, current], baseline: previous });
        const result = runHelper(box, REPAIRED_HELPER, "deploy", mutate(structuredClone(current.metadata)), current.identity);
        assertRefusedBeforePull(box, result, message, previous);
      });
    }

    await scenario("a reviewed native claim that the pulled digest does not execute is refused before the curtain", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      const claim = structuredClone(current.metadata);
      if (claim.image.nativeDependency) Object.assign(claim.image.nativeDependency, { betterSqlite3Version: "13.0.1", sqliteVersion: "3.53.3" });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", claim, current.identity);
      assertRefusedBeforeCurtain(box, result, "native better-sqlite3 execution does not match the release metadata", previous);
      assert.ok(indexOfCall(result.calls, "native-probe") > indexOfCall(result.calls, "pull"));
    });

    await scenario("a digest whose native driver cannot load is refused before the curtain", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, brokenNative: [current] });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assertRefusedBeforeCurtain(box, result, "selected image failed the native better-sqlite3 execution check", previous);
    });

    await scenario("a rollback target other than the recorded previous release is refused before any pull", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      assert.equal(runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity).status, 0);
      const result = runHelper(box, REPAIRED_HELPER, "rollback", current.metadata, current.identity);
      assertRefusedBeforePull(box, result, "rollback target does not match the recorded previous release", current);
    });

    await scenario("a deployment without the recorded known-good baseline is refused before any pull", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: null });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /requires the recorded known-good Compose baseline/);
      assert.equal(indexOfCall(result.calls, "pull"), -1);
      assert.equal(fs.existsSync(box.marker), false);
    });

    await scenario("a missing Secure Notes recovery-key backup is refused before any pull", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, secureKeyBackup: "missing" });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assertRefusedBeforePull(box, result, "Secure Notes recovery-key backup is missing", previous);
    });

    await scenario("an explicit DEMO_MODE=false installation follows the non-demo path", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, demoMode: "false" });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.calls.filter((call) => call.tool === "isolation" || call.action === "demo-data-root").length, 0);
    });

    for (const value of [null, "", "TRUE", "True", "1", "yes", "on", "0", "no", "off", "false "]) {
      const label = value === null ? "missing" : JSON.stringify(value);
      const message = value === null ? "DEMO_MODE is missing" : "DEMO_MODE must be exactly true or false";
      await scenario(`an unclassified installation is refused before the curtain: DEMO_MODE ${label}`, ({ sandbox }) => {
        const box = sandbox({ images: [previous, current], baseline: previous, demoMode: value, isolationHelper: true });
        const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
        assertRefusedBeforeCurtain(box, result, message, previous);
        assert.equal(result.calls.filter((call) => call.tool === "isolation").length, 0);
      });
    }

    await scenario("DEMO_MODE=true outside the exact demo origin is refused before the curtain", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, demoMode: "true", isolationHelper: true });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assertRefusedBeforeCurtain(box, result, "public-demo isolation requires the exact demo origin", previous);
    });

    await scenario("DEMO_MODE=true at the demo origin enforces isolation before the curtain and checks it after startup", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous, demoMode: "true", isolationHelper: true, origin: DEMO_ORIGIN });
      const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
      assert.equal(result.status, 0, result.stderr);
      const isolation = result.calls.filter((call) => call.tool === "isolation");
      assert.deepEqual(isolation.map((call) => [call.mode, call.markerPresent]), [["enforce", false], ["check", true]]);
      const prepare = indexOfCall(result.calls, "demo-data-root");
      assert.ok(prepare > indexOfCall(result.calls, "stop") && prepare < indexOfCall(result.calls, "backup-create"));
    });

    await scenario("a held operation lock refuses the helper before anything else", ({ sandbox }) => {
      const box = sandbox({ images: [previous, current], baseline: previous });
      const lock = path.join(box.deployRoot, "compose-operation.lock");
      fs.writeFileSync(lock, "", { mode: 0o600 });
      const holder = spawn("flock", ["-o", lock, "sleep", "30"], { stdio: "ignore" });
      try {
        waitForLockHolder(lock);
        const result = runHelper(box, REPAIRED_HELPER, "deploy", current.metadata, current.identity);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /holds the host lock/);
        assert.equal(result.calls.length, 0);
      } finally {
        holder.kill("SIGTERM");
      }
    });
  } finally {
    restoreHost(work, createdAccount);
  }

  const failures = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nCompose helper contract: ${outcomes.length - failures.length}/${outcomes.length} scenarios passed.`);
  for (const failure of failures) console.log(`\n--- ${failure.name}\n${failure.detail}`);
  if (failures.length > 0) process.exitCode = 1;
}

/** @typedef {{ name: string, metadata: ReleaseMetadata, identity: ReleaseIdentity }} Release */
/** @typedef {{ images?: Release[], baseline?: Release | null, unhealthy?: Release[], brokenNative?: Release[], restoreFails?: boolean, demoMode?: string | null, isolationHelper?: boolean, origin?: string, secureKeyBackup?: boolean | "missing" }} SandboxOptions */

/** @param {string} filePath @returns {Release} */
function loadRelease(filePath) {
  const metadata = /** @type {ReleaseMetadata} */ (readJson(filePath));
  return {
    name: metadata.version,
    metadata,
    identity: {
      version: metadata.version,
      commit: metadata.commitSha,
      artifact: metadata.artifact.sha256,
      digest: metadata.image.digest,
      platformManifestDigest: metadata.image.platformManifest.digest,
      reference: metadata.image.reference,
    },
  };
}

/**
 * Labelled metadata tampering, each with the refusal the helper must give before any pull.
 * @param {Release} release
 * @returns {[string, (metadata: ReleaseMetadata) => ReleaseMetadata, string][]}
 */
function tamperCases(release) {
  /** @param {(metadata: ReleaseMetadata) => void} change @returns {(metadata: ReleaseMetadata) => ReleaseMetadata} */
  const edit = (change) => (metadata) => {
    change(metadata);
    return metadata;
  };
  /** @param {ReleaseMetadata} metadata @param {Record<string, string>} values */
  const native = (metadata, values) => {
    if (metadata.image.nativeDependency) Object.assign(metadata.image.nativeDependency, values);
  };
  const otherDigest = `sha256:${"e".repeat(64)}`;
  /** @type {[string, (metadata: ReleaseMetadata) => ReleaseMetadata, string][]} */
  const cases = [
    ["unreviewed native driver", edit((metadata) => native(metadata, { betterSqlite3Version: "13.0.9" })), "names an unreviewed profile"],
    ["native driver paired with another release's SQLite", edit((metadata) => native(metadata, { sqliteVersion: "3.53.3" })), "names an unreviewed profile"],
    ["malformed native driver", edit((metadata) => native(metadata, { betterSqlite3Version: "13.0.3; true" })), "names an unreviewed profile"],
    ["native proof not from the published digest", edit((metadata) => native(metadata, { execution: "build-context" })), "native dependency proof is missing"],
    ["native proof for another platform", edit((metadata) => native(metadata, { platform: "darwin" })), "native dependency proof platform is unsupported"],
    ["native proof for another architecture", edit((metadata) => native(metadata, { architecture: "arm64" })), "native dependency proof architecture is unsupported"],
    ["native proof removed", edit((metadata) => { delete metadata.image.nativeDependency; }), "native dependency proof is missing"],
    ["commit", edit((metadata) => { metadata.commitSha = "f".repeat(40); }), "release metadata commit mismatch"],
    ["runtime artifact", edit((metadata) => { metadata.artifact.sha256 = "f".repeat(64); }), "release metadata artifact mismatch"],
    ["version", edit((metadata) => { metadata.version = "0.33.99"; }), "release metadata version mismatch"],
    ["image index digest", edit((metadata) => { metadata.image.digest = otherDigest; }), "release metadata image digest mismatch"],
    ["tag-addressed image reference", edit((metadata) => { metadata.image.reference = `${REPOSITORY}:latest`; }), "image reference must be digest-addressed"],
    ["registry repository", edit((metadata) => { metadata.image.repository = "ghcr.io/other/longtail-forge"; }), "release metadata registry repository mismatch"],
    ["image platform", edit((metadata) => { metadata.image.platform = "linux/arm64"; }), "release metadata platform is unsupported"],
    ["platform manifest digest", edit((metadata) => { metadata.image.platformManifest.digest = otherDigest; }), "release metadata platform manifest mismatch"],
    ["platform manifest architecture", edit((metadata) => { metadata.image.platformManifest.architecture = "arm64"; }), "release metadata platform architecture is unsupported"],
    ["SBOM attestation removed", edit((metadata) => { delete metadata.image.attestations.sbom; }), "registry SBOM attestation is missing"],
    ["provenance attestation replaced", edit((metadata) => { metadata.image.attestations.provenance = { predicateType: "https://example.test/provenance" }; }), "registry provenance attestation is missing"],
    ["nightly channel", edit((metadata) => { metadata.channel = "nightly"; }), "release metadata channel must be main"],
    ["schema version", edit((metadata) => { metadata.schemaVersion = 1; }), "release metadata schema must be 2"],
  ];
  return cases.map(([label, mutate, message]) => /** @type {[string, (metadata: ReleaseMetadata) => ReleaseMetadata, string]} */ (
    [`${label} (${release.name})`, mutate, message]
  ));
}

/** @param {string} work @param {number} ordinal @param {string} fakeBin @param {SandboxOptions} options @returns {Sandbox} */
function createSandbox(work, ordinal, fakeBin, options) {
  fs.rmSync(BACKUP_ROOT, { recursive: true, force: true });
  const root = path.join(work, `sandbox-${ordinal}`);
  const etc = path.join(root, "etc");
  const deployRoot = path.join(root, "deploy");
  const harnessState = path.join(root, "harness");
  const origin = options.origin ?? PREVIEW_ORIGIN;
  for (const [directory, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [etc, 0o755], [path.join(root, "compose"), 0o755], [path.join(root, "sbin"), 0o755],
    [deployRoot, 0o711], [path.join(deployRoot, "state"), 0o700], [path.join(deployRoot, "releases"), 0o700],
    [path.join(deployRoot, "operations"), 0o700], [path.join(root, "maintenance"), 0o711],
    [path.join(root, "maintenance", "deployment"), 0o711], [harnessState, 0o755],
  ])) {
    fs.mkdirSync(directory, { recursive: true });
    fs.chmodSync(directory, mode);
  }
  const inbox = path.join(deployRoot, "inbox");
  fs.mkdirSync(inbox, { mode: 0o700 });
  run("chown", [`${DEPLOY_ACCOUNT}:${DEPLOY_ACCOUNT}`, inbox]);
  fs.writeFileSync(path.join(root, "compose", "compose.yaml"), "name: longtail-forge\n");
  writePrivate(path.join(etc, "compose-host.env"), "LONGTAIL_HOST_PORT=8001\n");
  /** @type {string[]} */
  const environment = [
    `LTF_COMPOSE_DIR=${path.join(root, "compose")}`,
    `LTF_COMPOSE_HOST_ENV=${path.join(etc, "compose-host.env")}`,
    `LTF_DEPLOY_ACCOUNT=${DEPLOY_ACCOUNT}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    `LTF_IMAGE_REPOSITORY=${REPOSITORY}`,
    `LTF_MAINTENANCE_STATE_ROOT=${path.join(root, "maintenance")}`,
    `LTF_PUBLIC_URL=${origin}`,
  ];
  if (options.secureKeyBackup) {
    const keyBackup = path.join(etc, "secure-notes-key.backup");
    if (options.secureKeyBackup === true) writePrivate(keyBackup, "harness recovery key\n");
    environment.push(`LTF_SECURE_KEY_BACKUP=${keyBackup}`);
  }
  if (options.isolationHelper) {
    const isolation = path.join(root, "sbin", "longtail-forge-public-demo-isolation");
    fs.writeFileSync(isolation, `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake isolation "$@"\n`, { mode: 0o755 });
    environment.push(`LTF_PUBLIC_DEMO_ISOLATION_HELPER=${isolation}`);
  }
  const helperEnv = path.join(etc, "compose-deploy-helper.env");
  writePrivate(helperEnv, `${environment.join("\n")}\n`);
  const sandbox = {
    root, fakeBin, helperEnv, deployRoot, inbox, origin,
    stateRoot: path.join(deployRoot, "state"),
    releaseRoot: path.join(deployRoot, "releases"),
    marker: path.join(root, "maintenance", "deployment", "maintenance.on"),
    harnessState,
  };
  /** @type {Record<string, FakeImage>} */
  const images = {};
  for (const release of options.images ?? []) {
    const nativeDependency = release.metadata.image.nativeDependency;
    images[release.identity.reference] = {
      platform: "linux/amd64",
      labels: { revision: release.identity.commit, artifact: release.identity.artifact, branch: "main" },
      native: (options.brokenNative ?? []).includes(release) || !nativeDependency ? null : { driver: nativeDependency.betterSqlite3Version, sqlite: nativeDependency.sqliteVersion },
      health: (options.unhealthy ?? []).includes(release) ? "unhealthy" : "healthy",
      identity: { version: release.identity.version, commit: release.identity.commit, artifact: release.identity.artifact },
    };
  }
  /** @type {FakeScenario} */
  const fakeScenario = {
    images,
    demoMode: options.demoMode === undefined ? "false" : options.demoMode,
    restoreFails: options.restoreFails === true,
    markerPath: sandbox.marker,
    publicOrigin: origin,
  };
  writePublic(path.join(harnessState, "scenario.json"), JSON.stringify(fakeScenario));
  writePublic(path.join(harnessState, "calls.jsonl"), "");
  const baseline = options.baseline === undefined ? null : options.baseline;
  if (baseline) seedBaseline(sandbox, baseline);
  writeRuntime(sandbox, { running: baseline ? baseline.identity.reference : null, state: baseline ? "running" : "absent", records: ["baseline data"] });
  return sandbox;
}

/**
 * The known-good Compose baseline the initial cutover recorded: the release environment, its
 * metadata, and the current state, in exactly the shape earlier helpers wrote them.
 * @param {Sandbox} sandbox @param {Release} release
 */
function seedBaseline(sandbox, release) {
  const key = release.identity.digest.slice("sha256:".length);
  const releaseEnv = path.join(sandbox.releaseRoot, `${key}.env`);
  writePrivate(releaseEnv, [
    `LONGTAIL_IMAGE=${release.identity.reference}`,
    "LONGTAIL_RELEASE_BRANCH=main",
    `LONGTAIL_RELEASE_COMMIT=${release.identity.commit}`,
    `LONGTAIL_RELEASE_ARTIFACT_SHA256=${release.identity.artifact}`,
    "",
  ].join("\n"));
  writePrivate(path.join(sandbox.releaseRoot, `${key}.json`), JSON.stringify(release.metadata));
  writePrivate(path.join(sandbox.stateRoot, "current.json"), JSON.stringify({ ...release.metadata, deployment: { releaseEnv, rollbackBackup: "" } }));
}

/**
 * Stage metadata in the private inbox as the deployment account, then run the helper as root with
 * the fakes first on PATH.
 * @param {Sandbox} sandbox @param {string} helper @param {"deploy" | "rollback"} mode
 * @param {ReleaseMetadata} metadata @param {ReleaseIdentity} expected
 * @returns {HelperResult}
 */
function runHelper(sandbox, helper, mode, metadata, expected) {
  waitForNextSecond();
  const staged = path.join(sandbox.inbox, "release-metadata.json");
  fs.writeFileSync(staged, JSON.stringify(metadata, null, 2));
  run("chown", [`${DEPLOY_ACCOUNT}:${DEPLOY_ACCOUNT}`, staged]);
  fs.chmodSync(staged, 0o600);
  const callsPath = path.join(sandbox.harnessState, "calls.jsonl");
  const offset = fs.readFileSync(callsPath, "utf8").length;
  const backupsBefore = listBackups();
  const result = spawnSync("/usr/bin/env", ["bash", helper, mode,
    "--metadata", "release-metadata.json",
    "--expected-version", expected.version,
    "--expected-source-branch", "main",
    "--expected-commit", expected.commit,
    "--expected-artifact-sha256", expected.artifact,
    "--expected-image-digest", expected.digest,
    "--expected-platform-manifest-digest", expected.platformManifestDigest,
  ], {
    encoding: "utf8",
    env: {
      PATH: `${sandbox.fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`,
      HOME: "/root",
      LANG: "C.UTF-8",
      LTF_COMPOSE_HELPER_ENV: sandbox.helperEnv,
      HARNESS_STATE: sandbox.harnessState,
    },
    timeout: 120_000,
  });
  const calls = fs.readFileSync(callsPath, "utf8").slice(offset).split("\n").filter(Boolean)
    .map((line) => /** @type {FakeCall} */ (JSON.parse(line)));
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    calls,
    backupsBefore,
    backupsAfter: listBackups(),
  };
}

/** @returns {string[]} */
function listBackups() {
  return fs.existsSync(BACKUP_ROOT) ? fs.readdirSync(BACKUP_ROOT).sort() : [];
}

/** @param {Sandbox} sandbox @param {HelperResult} result @param {string} message @param {Release} running */
function assertRefusedBeforePull(sandbox, result, message, running) {
  assert.notEqual(result.status, 0, `expected a refusal: ${message}`);
  assert.ok(result.stderr.includes(message), `expected "${message}" in:\n${result.stderr}`);
  assert.equal(indexOfCall(result.calls, "pull"), -1, "the helper must refuse before pulling any image");
  assertNoLiveChange(sandbox, result, running);
}

/** @param {Sandbox} sandbox @param {HelperResult} result @param {string} message @param {Release} running */
function assertRefusedBeforeCurtain(sandbox, result, message, running) {
  assert.notEqual(result.status, 0, `expected a refusal: ${message}`);
  assert.ok(result.stderr.includes(message), `expected "${message}" in:\n${result.stderr}`);
  assert.ok(result.calls.every((call) => !call.markerPresent), "no call may run behind the curtain");
  assertNoLiveChange(sandbox, result, running);
}

/** @param {Sandbox} sandbox @param {HelperResult} result @param {Release} running */
function assertNoLiveChange(sandbox, result, running) {
  const live = new Set(["stop", "up", "backup-create", "backup-inspect", "backup-restore", "demo-data-root"]);
  assert.deepEqual(result.calls.filter((call) => live.has(call.action)).map((call) => call.action), [], "no service, backup, or data operation may run");
  assert.equal(fs.existsSync(sandbox.marker), false, "the deployment marker must not be asserted");
  assert.deepEqual(result.backupsAfter, result.backupsBefore, "no backup may be created");
  assert.equal(readRuntime(sandbox).running, running.identity.reference, "the running release must not change");
  assert.equal(readRuntime(sandbox).state, "running");
}

/** @param {FakeCall[]} calls @param {Release} previous @param {Release} current */
function assertDeployOrdering(calls, previous, current) {
  const order = ["pull", "native-probe", "scanner-probe", "stop", "backup-create", "backup-inspect", "up"].map((action) => indexOfCall(calls, action));
  for (let index = 1; index < order.length; index += 1) {
    assert.ok((order[index - 1] ?? -1) >= 0 && (order[index] ?? -1) > (order[index - 1] ?? -1), `deploy order broken at ${index}: ${JSON.stringify(calls.map((call) => call.action))}`);
  }
  for (const action of ["pull", "native-probe", "scanner-probe"]) {
    assert.equal(calls[indexOfCall(calls, action)]?.markerPresent, false, `${action} must run before the curtain`);
  }
  for (const action of ["stop", "backup-create", "backup-inspect", "up"]) {
    assert.equal(calls[indexOfCall(calls, action)]?.markerPresent, true, `${action} must run behind the curtain`);
  }
  assert.equal(calls.find((call) => call.action === "backup-create")?.image, previous.identity.reference, "the running prior release must back itself up");
  assert.equal(calls.find((call) => call.action === "up")?.image, current.identity.reference);
  const appInfo = calls.filter((call) => call.action === "http" && String(call.url).endsWith("/api/app-info"));
  assert.equal(appInfo.length, 2, "direct and public identity must both be verified");
}

/** @param {FakeCall[]} calls @param {string} action */
function indexOfCall(calls, action) {
  return calls.findIndex((call) => call.action === action);
}

/** @param {Sandbox} sandbox @param {string} name @returns {{ commitSha?: string, deployment?: { rollbackBackup?: string } }} */
function readState(sandbox, name) {
  return /** @type {{ commitSha?: string, deployment?: { rollbackBackup?: string } }} */ (readJson(path.join(sandbox.stateRoot, name)));
}

/** @param {Sandbox} sandbox @param {string} name */
function stateExists(sandbox, name) {
  return fs.existsSync(path.join(sandbox.stateRoot, name));
}

/** @param {Sandbox} sandbox @param {string} name */
function stateHash(sandbox, name) {
  return createHash("sha256").update(fs.readFileSync(path.join(sandbox.stateRoot, name))).digest("hex");
}

/** @param {Sandbox} sandbox @returns {FakeRuntime} */
function readRuntime(sandbox) {
  return /** @type {FakeRuntime} */ (readJson(path.join(sandbox.harnessState, "runtime.json")));
}

/** @param {Sandbox} sandbox @param {FakeRuntime} runtime */
function writeRuntime(sandbox, runtime) {
  writePublic(path.join(sandbox.harnessState, "runtime.json"), JSON.stringify(runtime));
}

/** @param {Sandbox} sandbox @param {Release} release */
function markUnhealthy(sandbox, release) {
  const scenarioPath = path.join(sandbox.harnessState, "scenario.json");
  const scenario = /** @type {FakeScenario} */ (readJson(scenarioPath));
  const image = scenario.images[release.identity.reference];
  assert.ok(image, `no fake image for ${release.identity.reference}`);
  image.health = "unhealthy";
  writePublic(scenarioPath, JSON.stringify(scenario));
}

/** @param {string} lock */
function waitForLockHolder(lock) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnSync("flock", ["-n", lock, "true"]).status !== 0) return;
    spawnSync("sleep", ["0.1"]);
  }
  throw new Error("the lock holder never acquired the operation lock");
}

function waitForNextSecond() {
  // Operation identities have one-second resolution; never let two runs share one.
  spawnSync("sleep", ["1.05"]);
}

/** @returns {boolean} whether the harness created the deployment account */
function prepareHost() {
  if (fs.existsSync(BACKUP_PARENT) && !fs.existsSync(HARNESS_OWNERSHIP_MARKER)) {
    throw new Error(`${BACKUP_PARENT} already exists; refusing to run where real Longtail Forge backups may live.`);
  }
  fs.mkdirSync(BACKUP_PARENT, { recursive: true, mode: 0o700 });
  fs.writeFileSync(HARNESS_OWNERSHIP_MARKER, "created by scripts/release/compose-helper-contract-harness.mjs\n");
  if (spawnSync("id", [DEPLOY_ACCOUNT]).status === 0) return false;
  run("useradd", ["--system", "--user-group", "--no-create-home", "--shell", "/usr/sbin/nologin", DEPLOY_ACCOUNT]);
  return true;
}

/** @param {string} work @param {boolean} createdAccount */
function restoreHost(work, createdAccount) {
  fs.rmSync(work, { recursive: true, force: true });
  if (fs.existsSync(HARNESS_OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true });
  if (createdAccount) spawnSync("userdel", [DEPLOY_ACCOUNT]);
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
}

/** @param {string} filePath @param {string} content */
function writePrivate(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o600);
}

/** @param {string} filePath @param {string} content */
function writePublic(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o644);
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
