#!/usr/bin/env node
// Executable contract for the public-demo boot, alert, scheduler, and reset-hold paths (the
// restart-recovery post-release patch).
//
// The boot helper decides whether a demo may start after a host restart, and the alert helper is
// the only path by which a failure leaves the host. Source-text pins cannot show that a refusal
// happens before anything starts, or that a webhook URL never reaches argv or output. This harness
// runs the actual helper bytes as root, with the real bash, jq, coreutils, flock, and find. Docker,
// HTTP, `ip`, the scanner probe, the clock, the journal, the isolation helper, and the reset the boot
// calls are fakes, and every fake call records whether the curtain was up at that moment.
//
// It needs native Linux and passwordless sudo. It writes the helpers' fixed paths under
// /etc/longtail-forge, /usr/local/sbin, and /var/backups/longtail-forge, and refuses a host where any
// of them already exists. Run it only on a disposable machine, such as the maintenance rehearsal's
// clean runner.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const BOOT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-boot-host.example");
const ALERT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-alert.example");
const SCHEDULER_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-scheduler-host.example");
const RESET_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-host.example");
const ETC = "/etc/longtail-forge";
const FIXED = Object.freeze({
  hold: `${ETC}/public-demo-hold`,
  webhook: `${ETC}/public-demo-alert-webhook`,
  heartbeat: `${ETC}/public-demo-heartbeat-url`,
  schedulerEnv: `${ETC}/public-demo-reset-scheduler.env`,
  installedReset: "/usr/local/sbin/longtail-forge-public-demo-reset",
  installedAlert: "/usr/local/sbin/longtail-forge-public-demo-reset-alert",
});
const BACKUP_PARENT = "/var/backups/longtail-forge";
const BACKUP_ROOT = `${BACKUP_PARENT}/compose`;
const OWNERSHIP_MARKER = `${BACKUP_PARENT}/.ltf-demo-helper-harness`;
const DEMO_ORIGIN = "https://demo.longtailforge.com";
const GATEWAY = "172.30.31.1";
// Synthetic values in the exact shapes the alert helper accepts. No real endpoint is ever contacted.
// The webhook's identifying parts. Leak checks look for these rather than for the host name, which
// would read as an incomplete URL check.
const WEBHOOK_ID = "123456789012345678";
const WEBHOOK_TOKEN = `${"Ab9_-".repeat(13)}xyz`;
const WEBHOOK_URL = `https://discord.com/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`;
const HEARTBEAT_URL = "https://uptime.harness.test/api/push/HarnessToken123?status=up&msg=OK&ping=";
const IMAGE = `ghcr.io/michaelyorkpa/longtail-forge@sha256:${"a".repeat(64)}`;
const IDENTITY = Object.freeze({ version: "1.2.3.4", commitSha: "c".repeat(40), artifact: "d".repeat(64) });
const DEMO_NETWORK = "longtail-forge-public-demo-internal";
const DEMO_VOLUME = "longtail-forge-public-demo-data";
// A secret in the application environment file. No evidence, output, or log may ever contain it.
const CANARY = "Canary-Secret-987-harness";
const RESET_CONFIRMATION = "RESET RT-LTF-DEMO COMPOSE DATA";

// Each seed is one defect in a real helper, with the scenario that must catch it. The harness applies
// it to a copy of the helper, reruns every scenario, and fails if the named one still passes.
/** @typedef {{ label: string, helper: "boot" | "alert" | "scheduler" | "reset", from: string, to: string, caughtBy: string }} Seed */
/** @type {readonly Seed[]} */
const SEEDS = Object.freeze([
  { label: "the boot ignores an operator hold", helper: "boot", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then\n  stop_with_alert 'boot-held'", to: "if false; then\n  stop_with_alert 'boot-held'", caughtBy: "an operator hold stops the boot" },
  { label: "the boot ignores a deployment marker", helper: "boot", from: "if test -e \"$DEPLOYMENT_MARKER\" || test -L \"$DEPLOYMENT_MARKER\"; then\n  stop_with_alert 'boot-marker-present'", to: "if false; then\n  stop_with_alert 'boot-marker-present'", caughtBy: "a deployment marker stops the boot" },
  {
    label: "the boot does not check the database",
    helper: "boot",
    // Every database check goes, or a remaining one would still refuse the missing file.
    from: "  test -f \"$mountpoint/longtail-forge.db\" && test ! -L \"$mountpoint/longtail-forge.db\"\n  test -d \"$mountpoint/files\" && test ! -L \"$mountpoint/files\"\n  test \"$(stat -c '%u' \"$mountpoint/longtail-forge.db\")\" = '10001'\n  test \"$(stat -c '%u' \"$mountpoint/files\")\" = '10001'\n  test -s \"$mountpoint/longtail-forge.db\"\n",
    to: "  test -d \"$mountpoint/files\" && test ! -L \"$mountpoint/files\"\n  test \"$(stat -c '%u' \"$mountpoint/files\")\" = '10001'\n",
    caughtBy: "a missing database stops the boot",
  },
  { label: "the boot does not check the cached image", helper: "boot", from: "  docker image inspect --format '{{.Id}}' \"$IMAGE_REFERENCE\" >/dev/null\n", to: "", caughtBy: "an image missing from the local cache" },
  { label: "the boot skips its scanner wait", helper: "boot", from: "wait_until scanner \"$SCANNER_WAIT\" scanner_answers ||", to: "true ||", caughtBy: "a scanner that never answers" },
  { label: "the boot starts without enforcing isolation", helper: "boot", from: "run_check isolation public_demo_isolation enforce", to: "run_check isolation true", caughtBy: "a boot with no missed boundary" },
  { label: "the boot starts without the curtain", helper: "boot", from: "install -o root -g root -m 0644 /dev/null \"$DEPLOYMENT_MARKER\"\nstart_and_verify() {", to: "true\nstart_and_verify() {", caughtBy: "a boot with no missed boundary" },
  { label: "the boot never resets after a missed boundary", helper: "boot", from: "[[ \"$LATEST_COMPLETED\" < \"$LAST_BOUNDARY\" ]]", to: "[[ \"$LATEST_COMPLETED\" < \"0\" ]]", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot's reset does not inherit the lock", helper: "boot", from: "--caller boot --confirm \"$RESET_CONFIRMATION\" > \"$WORK/reset.out\"", to: "--caller boot --confirm \"$RESET_CONFIRMATION\" 9>&- > \"$WORK/reset.out\"", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot's reset is not its delegate", helper: "boot", from: "    --caller boot --confirm", to: "    --confirm", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot accepts a second network", helper: "boot", from: "      and (.networks | type == \"object\" and length == 1)\n", to: "", caughtBy: "an extra network stops the boot" },
  { label: "the boot accepts another data volume", helper: "boot", from: "$root.volumes[.source].name == $volume and ", to: "", caughtBy: "another data volume stops the boot" },
  { label: "the boot accepts another image", helper: "boot", from: "      .image == $image\n      and .restart", to: "      .restart", caughtBy: "an image other than the recorded release stops the boot" },
  { label: "the boot may pull", helper: "boot", from: "--force-recreate --pull never \"${SQLITE_SERVICES[@]}\"", to: "--force-recreate \"${SQLITE_SERVICES[@]}\"", caughtBy: "a boot with no missed boundary" },
  { label: "the boot leaves an unverified container running", helper: "boot", from: "  run_check stop-unverified compose stop \"${SQLITE_SERVICES[@]}\"\n", to: "", caughtBy: "a container that fails its post-start isolation check" },
  { label: "the boot lets a failed reset lift its curtain", helper: "boot", from: "    ensure_curtain\n", to: "", caughtBy: "a failed fresh reset that lifted the curtain" },
  { label: "the boot keeps raw check output", helper: "boot", from: "  keep_redacted \"$WORK/check.err\" \"$OPERATION_DIR/$name.err\"", to: "  cp \"$WORK/check.err\" \"$OPERATION_DIR/$name.err\"", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot keeps the Compose parser's output", helper: "boot", from: "  compose config --quiet >/dev/null 2>&1 || {", to: "  compose config --quiet || {", caughtBy: "a Compose parser error is not kept by the boot" },
  { label: "alerts allow mentions", helper: "alert", from: "allowed_mentions:{parse:[]}", to: "allowed_mentions:{parse:[\"everyone\"]}", caughtBy: "notify posts the bounded fields" },
  { label: "the URL reaches curl's argv", helper: "alert", from: "printf 'url = \"%s\"\\n' \"$url\" | curl --config -", to: "printf '' | curl \"$url\" --config -", caughtBy: "notify posts the bounded fields" },
  { label: "a readable webhook file is accepted", helper: "alert", from: "test \"$(stat -c '%u:%g:%a' \"$file\")\" = '0:0:600' ||", to: "true ||", caughtBy: "notify refuses a webhook file another user could read" },
  { label: "any https URL passes as a Discord webhook", helper: "alert", from: "  [[ \"$url\" =~ $pattern ]] || fail", to: "  true || fail", caughtBy: "notify refuses a non-Discord host" },
  { label: "the scheduler ignores an operator hold", helper: "scheduler", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then\n  append_event 'finished' 'skipped-held'", to: "if false; then\n  append_event 'finished' 'skipped-held'", caughtBy: "the scheduler records a held run" },
  { label: "the boot sends no heartbeat", helper: "boot", from: "\"$ALERT_HELPER\" heartbeat --target \"$DEMO_TARGET\"", to: "true heartbeat --target \"$DEMO_TARGET\"", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the scheduler sends no heartbeat", helper: "scheduler", from: "    \"$ALERT_HELPER\" heartbeat --target", to: "    true heartbeat --target", caughtBy: "the scheduler sends the heartbeat" },
  { label: "the reset ignores an operator hold", helper: "reset", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then fail", to: "if false; then fail", caughtBy: "the reset helper refuses under a hold" },
  { label: "a boot-delegated recovery lifts the curtain", helper: "reset", from: "    if test \"$LIFT_CURTAIN_ON_RECOVERY\" = true; then\n      clear_marker", to: "    if true; then\n      clear_marker", caughtBy: "a boot-delegated reset that fails verification" },
  { label: "a boot-delegated reset verifies the public edge", helper: "reset", from: "  test \"$CALLER\" != 'boot' || return 0\n", to: "", caughtBy: "a boot-delegated reset ignores a failing public edge" },
  { label: "a boot-delegated reset lifts the curtain itself", helper: "reset", from: "if test \"$CALLER\" != 'boot'; then clear_marker; fi", to: "clear_marker", caughtBy: "a boot-delegated reset leaves the curtain to the boot" },
  { label: "a stopped-app start lifts the curtain before the fresh baseline", helper: "reset", from: "  start_sqlite_users\n  verify_runtime\n}\n", to: "  start_sqlite_users\n  verify_runtime\n  clear_marker\n}\n", caughtBy: "a reset that starts a stopped app keeps the curtain up" },
  { label: "a recovery after a stopped-app start lifts the curtain", helper: "reset", from: "  APP_STARTED_BY_RESET=true\n  LIFT_CURTAIN_ON_RECOVERY=false\n", to: "  APP_STARTED_BY_RESET=true\n", caughtBy: "a reset that started a stopped app restores the prior unit behind its curtain" },
  { label: "the reset keeps the Compose parser's output", helper: "reset", from: "compose config --quiet >/dev/null 2>&1 \\\n", to: "compose config --quiet \\\n", caughtBy: "the reset keeps no Compose parser output" },
  { label: "the scheduler reads a curtained recovery as a lifted one", helper: "scheduler", from: "elif grep -Fq 'prior unit was restored and verified behind the retained maintenance curtain' \"$RUN_ROOT/reset.err\"; then", to: "elif false; then", caughtBy: "the scheduler records a recovery behind the retained curtain" },
]);

/**
 * @typedef {{ extraNetwork?: boolean, dataVolume?: string, image?: string }} ProfileDrift
 * @typedef {{
 *   dockerDown?: boolean, imageMissing?: boolean, health?: string, bridgeAfter?: number | null, scannerAfter?: number | null,
 *   curlFails?: boolean, resetExit?: number, resetFailure?: "unrecovered" | "recovered" | "recovered-curtained", resetRemovesMarker?: boolean,
 *   profile?: ProfileDrift, configCanary?: boolean, imageInspectCanary?: boolean, isolationCheckFails?: boolean,
 *   running?: boolean, identityFailCalls?: number[], publicFails?: boolean, candidateBuildFails?: boolean,
 * }} Scenario
 */
/** @typedef {{ running: boolean, isolationEnforced: boolean, probes: Record<string, number>, clock: number, identityCalls: number }} Runtime */
/** @typedef {{ tool: string, markerPresent: boolean, args: string[], stdin?: string, lockInherited?: boolean, isolationEnforced?: boolean }} Call */
/** @typedef {{ root: string, state: string, helperEnv: string, deployRoot: string, volume: string, marker: string, isolation: string }} Sandbox */

if (process.argv[2] === "--fake") {
  process.exitCode = runFake(String(process.argv[3]), process.argv.slice(4));
} else {
  await main();
}

// ---------------------------------------------------------------------------------------------
// Fakes. Each runs as a child of a helper, as root, and reads the scenario the harness wrote.
// ---------------------------------------------------------------------------------------------

/** @param {string} tool @param {string[]} args @returns {number} */
function runFake(tool, args) {
  const state = String(process.env.HARNESS_STATE || "");
  const scenario = /** @type {Scenario} */ (readJson(path.join(state, "scenario.json")));
  const runtime = /** @type {Runtime} */ (readJson(path.join(state, "runtime.json")));
  const markerPath = String(readJson(path.join(state, "paths.json")).marker);
  /** @param {Partial<Call>} extra */
  const record = (extra = {}) => {
    fs.appendFileSync(path.join(state, "calls.jsonl"), `${JSON.stringify({ tool, markerPresent: fs.existsSync(markerPath), args, ...extra })}\n`);
  };
  const save = () => fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify(runtime));
  /** @param {string} name @param {number | null | undefined} after */
  const available = (name, after) => {
    runtime.probes[name] = (runtime.probes[name] || 0) + 1;
    save();
    return after !== null && runtime.probes[name] > Number(after ?? 0);
  };

  if (tool === "sleep") {
    runtime.clock += Math.ceil(Number(args[0] || 0));
    save();
    return 0;
  }
  if (tool === "date") {
    if (args.length === 2 && args[0] === "-u" && args[1] === "+%s") return emit(`${runtime.clock}\n`);
    return spawnSync("/usr/bin/date", args, { stdio: "inherit" }).status ?? 1;
  }
  if (tool === "logger") {
    record();
    return 0;
  }
  if (tool === "ip") {
    record();
    if (!available("bridge", scenario.bridgeAfter)) return 1;
    return emit(`7: ltf-demo0    inet ${GATEWAY}/24 brd 172.30.31.255 scope global ltf-demo0\\       valid_lft forever preferred_lft forever\n`);
  }
  if (tool === "timeout") {
    record();
    return available("scanner", scenario.scannerAfter) ? emit("PONG") : 1;
  }
  if (tool === "isolation") {
    if (args[0] === "enforce") runtime.isolationEnforced = true;
    save();
    record();
    return args[0] === "check" && args.includes("--container") && scenario.isolationCheckFails ? 1 : 0;
  }
  if (tool === "reset") {
    let lockInherited = false;
    try {
      const lockPath = String(readJson(path.join(state, "paths.json")).lock);
      const sameFile = fs.readlinkSync("/proc/self/fd/9") === lockPath;
      const held = spawnSync("flock", ["-n", "9"], { stdio: ["ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", 9] }).status === 0;
      lockInherited = sameFile && held;
    } catch {
      lockInherited = false;
    }
    record({ lockInherited });
    if ((scenario.resetExit ?? 0) !== 0) {
      // A recovery that lifts the curtain, as a reset not acting for the boot would.
      if (scenario.resetRemovesMarker) fs.rmSync(markerPath, { force: true });
      const message = {
        unrecovered: "reset and automatic recovery failed; maintenance curtain and protected evidence remain",
        recovered: "reset failed; prior unit was restored and verified",
        "recovered-curtained": "reset failed; prior unit was restored and verified behind the retained maintenance curtain",
      }[scenario.resetFailure || "unrecovered"];
      process.stderr.write(`longtail-forge-public-demo-reset: ${message}\n`);
      return Number(scenario.resetExit);
    }
    // A reset acting for the boot leaves the curtain to it; any other lifts it on success.
    if (!args.includes("--caller")) fs.rmSync(markerPath, { force: true });
    return emit(`${JSON.stringify({ ok: true, mode: "reset", target: "rt-ltf-demo", operationId: args[args.indexOf("--operation-id") + 1], semanticFingerprint: "f".repeat(64) })}\n`);
  }
  if (tool === "curl") return fakeCurl(args, scenario, runtime, record, save);
  if (tool === "docker") return fakeDocker(args, scenario, runtime, record, save, state);
  process.stderr.write(`unknown fake tool ${tool}\n`);
  return 2;
}

/**
 * @param {string[]} args @param {Scenario} scenario @param {Runtime} runtime
 * @param {(extra?: Partial<Call>) => void} record @param {() => void} save
 */
function fakeCurl(args, scenario, runtime, record, save) {
  if (args.includes("--config")) {
    const stdin = fs.readFileSync(0, "utf8");
    record({ stdin });
    return scenario.curlFails ? 22 : 0;
  }
  record();
  const url = String(args.findLast((arg) => /^https?:\/\//.test(arg)) || "");
  const output = args.includes("--output") ? String(args[args.indexOf("--output") + 1]) : "";
  const isPublic = onDemoOrigin(url);
  if (isPublic && scenario.publicFails) return 7;
  if (url.endsWith("/readyz")) return emit('{"status":"ready"}\n');
  if (url.endsWith("/healthz")) return emit('{"status":"ok"}\n');
  if (url.endsWith("/api/app-info")) {
    let identity = IDENTITY;
    if (!isPublic) {
      // The direct runtime's identity calls are counted, so a scenario can fail exactly one of them.
      runtime.identityCalls += 1;
      save();
      if ((scenario.identityFailCalls || []).includes(runtime.identityCalls)) identity = { ...IDENTITY, commitSha: "0".repeat(40) };
    }
    return emit(`${JSON.stringify({ canonicalVersion: identity.version, sourceBranch: "main", commitSha: identity.commitSha, artifactSha256: identity.artifact })}\n`);
  }
  // The reset's session capture and its read-only role proof, through the direct runtime.
  if (url.endsWith("/api/public-demo/accounts")) {
    return emit(`${JSON.stringify({ accounts: [{ roleName: "Workspace Administrator", username: "admin@example.test", password: "HarnessPassword-42" }] })}\n`);
  }
  if (url.endsWith("/api/login") || url.endsWith("/api/session")) {
    if (output) fs.writeFileSync(output, "{}\n");
    return emit(url.endsWith("/api/login") ? "200" : "401");
  }
  if (url.endsWith("/api/csrf-token")) return emit('{"csrfToken":"harness"}\n');
  if (url.includes("/api/files/attachments")) return emit('{"attachments":[{}]}\n');
  if (url.includes("/api/tasks") || url.endsWith("/api/client-projects") || url.endsWith("/api/logout")) return emit("{}\n");
  return 7;
}

/**
 * The resolved Compose profile, in the shape `docker compose config --format json` gives for the
 * shipped compose.yaml and the exact demo environment, with any drift the scenario asks for.
 * @param {Scenario} scenario
 */
function resolvedProfile(scenario) {
  const drift = scenario.profile || {};
  return {
    name: "longtail-forge",
    services: {
      "longtail-forge": {
        image: drift.image || IMAGE,
        restart: "no",
        read_only: true,
        dns: ["127.0.0.1"],
        networks: drift.extraNetwork ? { demo: null, other: null } : { demo: null },
        volumes: [
          { type: "volume", source: "data", target: "/var/lib/longtail-forge", volume: {} },
          { type: "bind", source: BACKUP_ROOT, target: "/var/backups/longtail-forge" },
        ],
        ports: [{ mode: "ingress", host_ip: "127.0.0.1", target: 8001, published: "8001", protocol: "tcp" }],
        logging: { driver: "local", options: { "max-file": "7", "max-size": "10m" } },
        environment: {
          DEMO_MODE: "true", HOST: "0.0.0.0", PORT: "8001", LONGTAIL_ENV: "production", LONGTAIL_DEPLOYMENT_MODE: "compose",
          LONGTAIL_PUBLIC_URL: DEMO_ORIGIN, LONGTAIL_DATABASE_PROVIDER: "sqlite", LONGTAIL_STORAGE_PROVIDER: "local",
          LONGTAIL_FILE_SCANNER: "clamd", LONGTAIL_CLAMD_HOST: GATEWAY, LONGTAIL_CLAMD_PORT: "3310", LONGTAIL_WORKER_MODE: "inline",
          LONGTAIL_SUPPORT_VIEW_ENABLED: "false", LONGTAIL_DATA_DIR: "/var/lib/longtail-forge",
          LONGTAIL_DATABASE_FILE: "/var/lib/longtail-forge/longtail-forge.db", LONGTAIL_LOCAL_STORAGE_ROOT: "/var/lib/longtail-forge/files",
          LONGTAIL_WORKSPACE_BACKUP_ROOT: "/var/backups/longtail-forge/workspaces", SUPER_ADMIN_PASSWORD: CANARY,
        },
      },
    },
    networks: { demo: { name: DEMO_NETWORK, external: true }, other: { name: "longtail-forge-other", external: true } },
    volumes: { data: { name: drift.dataVolume || DEMO_VOLUME } },
  };
}

/**
 * @param {string[]} args @param {Scenario} scenario @param {Runtime} runtime
 * @param {(extra?: Partial<Call>) => void} record @param {() => void} save @param {string} state
 */
function fakeDocker(args, scenario, runtime, record, save, state) {
  if (args[0] === "compose") {
    let index = 1;
    while (["--project-directory", "--file", "--env-file"].includes(String(args[index]))) index += 2;
    const sub = args[index];
    if (sub === "up") {
      record({ isolationEnforced: runtime.isolationEnforced });
      runtime.running = true;
      save();
      return 0;
    }
    record();
    if (sub === "config" && args.includes("--quiet") && scenario.configCanary) {
      // Compose quotes the offending value when an environment file does not parse.
      process.stderr.write(`failed to read /etc/longtail-forge/public-demo.env: Invalid template: "${CANARY}"\n`);
      return 1;
    }
    if (sub === "config" && args.includes("--services")) return emit("longtail-forge\n");
    if (sub === "config" && args.includes("json")) return emit(JSON.stringify(resolvedProfile(scenario)));
    if (sub === "ps") return emit(runtime.running ? `${"e".repeat(64)}\n` : "");
    if (sub === "stop") {
      runtime.running = false;
      save();
      return 0;
    }
    if (sub === "run") return fakeComposeRun(args, scenario);
    return 0;
  }
  record();
  if (args[0] === "info") return scenario.dockerDown ? 1 : 0;
  if (args[0] === "volume" && args[1] === "inspect") return emit(`${String(readJson(path.join(state, "paths.json")).volume)}\n`);
  if (args[0] === "image" && args[1] === "inspect") {
    if (scenario.imageInspectCanary) {
      process.stderr.write(`Error response from daemon: registry credential ${CANARY} was refused\n`);
      return 1;
    }
    return scenario.imageMissing ? 1 : emit(`sha256:${"b".repeat(64)}\n`);
  }
  if (args[0] === "network" && args[1] === "inspect") return emit("[]\n");
  if (args[0] === "inspect") {
    if (args.join(" ").includes(".State.Running")) return emit(`${runtime.running ? "true" : "false"}\n`);
    return emit(`${scenario.health || "healthy"}\n`);
  }
  return 0;
}

/** The one-off containers a reset runs: candidate, activation, and backup. @param {string[]} args @param {Scenario} scenario */
function fakeComposeRun(args, scenario) {
  const at = args.indexOf("node");
  const script = String(args[at + 1] || "");
  const action = String(args[at + 2] || "");
  if (script.endsWith("public-demo-baseline-activation.mjs")) {
    return emit(action === "inspect" ? '{"active":false}\n' : `${JSON.stringify({ ok: true, action, status: "no-stale-candidate", moved: 0 })}\n`);
  }
  if (script.endsWith("public-demo-baseline-candidate.mjs")) {
    if (action === "build" && scenario.candidateBuildFails) {
      process.stderr.write("candidate build failed\n");
      return 1;
    }
    return emit(`${JSON.stringify({ ok: true, action, semanticFingerprint: "f".repeat(64) })}\n`);
  }
  if (script.endsWith("backup.mjs")) {
    if (action === "create") fs.writeFileSync(path.join(BACKUP_ROOT, path.basename(String(args[args.indexOf("--output") + 1]))), "archive\n");
    return emit('{"ok":true}\n');
  }
  return 0;
}

/** Whether an argument is a URL on exactly the public demo's origin. @param {string} value */
function onDemoOrigin(value) {
  try {
    return new URL(value).origin === DEMO_ORIGIN;
  } catch {
    return false;
  }
}

/** @param {string} text */
function emit(text) {
  process.stdout.write(text);
  return 0;
}

/** @param {string} filePath @returns {Record<string, unknown>} */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ---------------------------------------------------------------------------------------------
// Sandboxes and scenarios.
// ---------------------------------------------------------------------------------------------

async function main() {
  assert.equal(process.platform, "linux", "the public-demo helper harness requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  for (const command of ["bash", "jq", "flock", "find", "install", "stat"]) {
    assert.equal(spawnSync("bash", ["-c", `command -v ${command}`]).status, 0, `${command} is required`);
  }
  const created = prepareHost();
  const work = fs.mkdtempSync("/tmp/ltf-demo-helper-harness-");
  fs.chmodSync(work, 0o755);
  const fakeBin = path.join(work, "bin");
  fs.mkdirSync(fakeBin, { mode: 0o755 });
  for (const tool of ["docker", "curl", "ip", "timeout", "logger", "sleep", "date", "isolation", "reset"]) {
    fs.writeFileSync(path.join(fakeBin, tool), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake ${tool} "$@"\n`, { mode: 0o755 });
  }
  install(path.join(fakeBin, "reset"), FIXED.installedReset, 0o755);
  install(ALERT_HELPER, FIXED.installedAlert, 0o755);

  /** @type {{ name: string, ok: boolean, detail?: string }[]} */
  const outcomes = [];
  let recorded = outcomes;
  let quiet = false;
  // While a seed is applied, only the scenario that must catch it runs.
  let focus = "";
  let ordinal = 0;
  const helpers = { boot: BOOT_HELPER, alert: ALERT_HELPER, scheduler: SCHEDULER_HELPER, reset: RESET_HELPER };
  /** @param {string} name @param {(box: Sandbox) => void} body @param {Scenario} [scenario] */
  const scenario = (name, body, scenario = {}) => {
    if (focus && !name.startsWith(focus)) return;
    const box = createSandbox(work, (ordinal += 1), scenario);
    try {
      body(box);
      recorded.push({ name, ok: true });
      if (!quiet) console.log(`PASS ${name}`);
    } catch (error) {
      recorded.push({ name, ok: false, detail: error instanceof Error ? error.stack || error.message : String(error) });
      if (!quiet) console.log(`FAIL ${name}\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      for (const fixed of [FIXED.hold, FIXED.webhook, FIXED.heartbeat, FIXED.schedulerEnv]) fs.rmSync(fixed, { force: true });
    }
  };
  /** @param {Sandbox} box @param {string} helper @param {string[]} args */
  const runHelper = (box, helper, args) => {
    const result = spawnSync("bash", [helper, ...args], {
      encoding: "utf8",
      env: { PATH: `${fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`, HOME: "/root", LANG: "C.UTF-8", HARNESS_STATE: box.state, LTF_COMPOSE_HELPER_ENV: box.helperEnv },
    });
    return { status: result.status ?? 1, stdout: String(result.stdout), stderr: String(result.stderr), calls: readCalls(box) };
  };
  /** @param {Sandbox} box */
  const boot = (box) => runHelper(box, helpers.boot, ["run"]);
  /** @param {Sandbox} box @param {string[]} [extra] */
  const reset = (box, extra = []) => runHelper(box, helpers.reset, ["reset", "--target", "rt-ltf-demo", "--anchor-date", "today", ...extra, "--confirm", RESET_CONFIRMATION]);
  /** @param {Call[]} calls */
  const publicCalls = (calls) => calls.filter((call) => call.tool === "curl" && call.args.some(onDemoOrigin));
  const notifyArgs = ["notify", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-scheduled-42", "--trigger", "scheduled",
    "--scheduled-boundary", "2026-11-03T17:00:00Z", "--failure-class", "reset-failed-unrecovered", "--recovery-status", "maintenance-curtain-retained", "--exit-code", "1"];

  const runScenarios = () => {
    // The alert boundary.
    scenario("notify posts the bounded fields to Discord, with mentions disabled and the URL only on standard input", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${WEBHOOK_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes(WEBHOOK_TOKEN) || arg.includes(WEBHOOK_ID)), "the webhook must never reach argv");
      const payload = JSON.parse(String(curl.args[curl.args.indexOf("--data-binary") + 1]));
      assert.deepEqual(payload.allowed_mentions, { parse: [] });
      assert.match(payload.content, /failureClass=reset-failed-unrecovered recoveryStatus=maintenance-curtain-retained exitCode=1$/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(WEBHOOK_TOKEN), "the webhook must never reach output");
      assert.match(only(result.calls, "logger").args.join(" "), /failureClass=reset-failed-unrecovered/);
    });
    scenario("notify without a webhook file reaches only the journal, and reports failure", (box) => {
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not configured; the alert reached only the local journal/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
      assert.equal(result.calls.filter((call) => call.tool === "logger").length, 1);
    });
    scenario("notify refuses a webhook file another user could read, before any request", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`, 0o644);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /must be root:root with mode 0600/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
    });
    for (const [label, url] of [["a non-Discord host", "https://discord.example.com/api/webhooks/123456789012345678/abc"], ["plain HTTP", WEBHOOK_URL.replace("https:", "http:")], ["a second line", `${WEBHOOK_URL}\n${WEBHOOK_URL}`]]) {
      scenario(`notify refuses ${label} in the webhook file, before any request`, (box) => {
        writeFixed(FIXED.webhook, `${url}\n`);
        const result = runHelper(box, helpers.alert, notifyArgs);
        assert.equal(result.status, 1);
        assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
        assert.ok(!`${result.stdout}${result.stderr}`.includes("123456789012345678"), "a refused URL must not be echoed");
      });
    }
    scenario("a rejected delivery reports failure without naming the URL", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Discord did not accept the alert/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(WEBHOOK_TOKEN), "the webhook must never reach output");
    }, { curlFails: true });
    scenario("notify refuses an unbounded field before the journal", (box) => {
      const result = runHelper(box, helpers.alert, notifyArgs.map((arg) => (arg === "reset-failed-unrecovered" ? "reset failed; see /etc/shadow" : arg)));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /failure class is invalid/);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat sends one GET with the URL only on standard input", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${HEARTBEAT_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes("HarnessToken123") || arg === "--data-binary"), "the heartbeat sends no data and no URL in argv");
    });
    scenario("heartbeat without a URL file reports not configured", (box) => {
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "reset"]);
      assert.equal(result.status, 2);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat refuses alert fields", (box) => {
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot", "--failure-class", "boot-held"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /heartbeat accepts only/);
    });

    // Boot refusals: each stops with its own class, before anything starts.
    /** @param {ReturnType<typeof runHelper>} result @param {number} status @param {string} failureClass */
    const assertRefused = (result, status, failureClass) => {
      assert.equal(result.status, status, `${failureClass}: ${result.stderr}`);
      assert.match(JSON.parse(lastLine(result.stdout)).failureClass, new RegExp(`^${failureClass}$`));
      assert.match(only(result.calls, "logger").args.join(" "), new RegExp(`trigger=boot .*failureClass=${failureClass} `));
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args.includes("up")).length, 0, "nothing may start");
      assert.equal(result.calls.filter((call) => call.tool === "isolation" && call.args[0] === "enforce").length, 0, "nothing may be enforced");
    };
    scenario("an operator hold stops the boot with its own alert, before Docker is touched", (box) => {
      writeFixed(FIXED.hold, "");
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = boot(box);
      assertRefused(result, 3, "boot-held");
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
      assert.match(JSON.parse(String(only(result.calls, "curl").args[only(result.calls, "curl").args.indexOf("--data-binary") + 1])).content, /failureClass=boot-held recoveryStatus=demo-stopped/);
      assert.equal(fs.existsSync(box.marker), false);
    });
    scenario("a deployment marker stops the boot", (box) => {
      fs.writeFileSync(box.marker, "");
      assertRefused(boot(box), 4, "boot-marker-present");
    });
    scenario("an uncertain recorded release stops the boot", (box) => {
      const state = readJson(path.join(box.deployRoot, "state", "current.json"));
      writePrivate(path.join(box.deployRoot, "state", "current.json"), JSON.stringify({ ...state, deployment: { releaseEnv: "/etc/passwd" } }));
      assertRefused(boot(box), 5, "boot-release-uncertain");
    });
    scenario("a missing database stops the boot and creates no substitute", (box) => {
      fs.rmSync(path.join(box.volume, "longtail-forge.db"));
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      assert.deepEqual(fs.readdirSync(box.volume).sort(), ["files"], "the boot must not create a database");
    });
    scenario("an image missing from the local cache stops the boot, which never pulls", (box) => {
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args[0] === "pull").length, 0);
    }, { imageMissing: true });
    scenario("an active reset marker in the data volume stops the boot", (box) => {
      fs.writeFileSync(path.join(box.volume, ".longtail-public-demo-reset-active.json"), "{}");
      assertRefused(boot(box), 4, "boot-marker-present");
    });
    scenario("Docker that never becomes available stops the boot after its bounded wait", (box) => {
      const result = boot(box);
      assertRefused(result, 6, "boot-dependency-unavailable");
      const waits = readJsonLines(path.join(box.deployRoot, "demo-boot-operations", bootOperation(box), "dependencies.jsonl"));
      assert.equal(waits[0].dependency, "docker");
      assert.equal(waits[0].outcome, "unavailable");
      assert.ok(Number(waits[0].attempts) >= 30, `the wait must retry within its bound, not ${waits[0].attempts} times`);
    }, { dockerDown: true });
    scenario("a scanner that never answers stops the boot before isolation or start", (box) => {
      assertRefused(boot(box), 6, "boot-dependency-unavailable");
    }, { scannerAfter: null });
    scenario("a start that does not become healthy keeps the curtain up", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { health: "unhealthy" });

    // The complete resolved profile is checked before anything starts.
    /** @param {Sandbox} box */
    const assertProfileRefused = (box) => {
      const result = boot(box);
      assertRefused(result, 11, "boot-profile-invalid");
      assert.equal(result.calls.filter((call) => call.tool === "ip").length, 0, "the profile must be refused before the dependency waits");
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "profile-check.err"), "utf8"), /not the exact isolated public demo/);
    };
    scenario("an extra network stops the boot before anything starts", assertProfileRefused, { profile: { extraNetwork: true } });
    scenario("another data volume stops the boot before anything starts", assertProfileRefused, { profile: { dataVolume: "longtail-forge-other-data" } });
    scenario("an image other than the recorded release stops the boot before anything starts", assertProfileRefused, { profile: { image: IMAGE.replace(/a{64}$/, "b".repeat(64)) } });
    scenario("a container that fails its post-start isolation check is stopped again, behind the curtain", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      const started = result.calls.findIndex((call) => call.tool === "docker" && call.args.includes("up"));
      const stopped = result.calls.findIndex((call) => call.tool === "docker" && call.args.includes("stop"));
      assert.ok(started >= 0 && stopped > started, "the unverified container must be stopped after its start");
      assert.equal(readJson(path.join(box.state, "runtime.json")).running, false, "nothing may be left running");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true });

    // Diagnostics reach evidence only redacted, and a Compose parser error never does.
    scenario("a Compose parser error is not kept by the boot, because it can quote a secret", (box) => {
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      const directory = bootDirectory(box);
      assert.match(fs.readFileSync(path.join(directory, "storage-check.err"), "utf8"), /did not parse; its output is not kept/);
      for (const text of [readTree(directory), result.stdout, result.stderr]) {
        assert.ok(!text.includes(CANARY) && !text.includes("Invalid template"), "no part of the parser's output may be kept");
      }
    }, { configCanary: true });
    scenario("a check's diagnostics are redacted before they are kept", (box) => {
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      const directory = bootDirectory(box);
      assert.match(fs.readFileSync(path.join(directory, "storage-check.err"), "utf8"), /registry credential \[redacted\] was refused/);
      assert.ok(!readTree(directory).includes(CANARY), "a secret value must never reach the boot's evidence");
    }, { imageInspectCanary: true });

    // Boot success paths.
    scenario("a boot with no missed boundary waits for its dependencies, isolates before starting, and lifts the curtain", (box) => {
      completedReset(box, new Date());
      const result = boot(box);
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([outcome.ok, outcome.baseline, outcome.heartbeatOutcome], [true, "not-required", "not-configured"]);
      const up = only(result.calls, "docker", (call) => call.args.includes("up"));
      assert.deepEqual([up.isolationEnforced, up.markerPresent], [true, true], "isolation and the curtain must precede the start");
      assert.deepEqual(up.args.slice(up.args.indexOf("--pull"), up.args.indexOf("--pull") + 2), ["--pull", "never"], "the boot must never pull");
      assert.equal(result.calls.filter((call) => call.tool === "reset").length, 0);
      assert.equal(fs.existsSync(box.marker), false, "the curtain must be lifted");
      const waits = readJsonLines(path.join(box.deployRoot, "demo-boot-operations", bootOperation(box), "dependencies.jsonl"));
      assert.deepEqual(waits.map((wait) => [wait.dependency, wait.outcome, Number(wait.attempts) > 1]), [["docker", "available", false], ["bridge", "available", true], ["scanner", "available", true]]);
    }, { bridgeAfter: 2, scannerAfter: 3 });
    scenario("a missed boundary runs a fresh reset that inherits the boot's lifecycle lock", (box) => {
      completedReset(box, new Date(Date.now() - 3 * 3_600_000));
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      const result = boot(box);
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([outcome.baseline, outcome.heartbeatOutcome], ["fresh-baseline", "delivered"]);
      assert.equal(String(only(result.calls, "curl", (call) => call.args.includes("--config")).stdin), `url = "${HEARTBEAT_URL}"\n`, "the boot's heartbeat must reach the push monitor");
      const reset = only(result.calls, "reset");
      assert.equal(reset.lockInherited, true, "the reset must run under the boot's own hold on the lock");
      assert.equal(reset.markerPresent, true, "the fresh reset runs behind the curtain");
      assert.match(reset.args.join(" "), /--operation-id \d{8}T\d{6}Z-boot-\d+ --caller boot /, "the reset must run as the boot's delegate");
      assert.equal(fs.existsSync(box.marker), false, "the boot lifts its own curtain after the fresh baseline");
    });
    scenario("a failed fresh reset stops the boot with its own alert", (box) => {
      const result = boot(box);
      assert.equal(result.status, 10, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-reset-failed");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { resetExit: 1 });
    scenario("a failed fresh reset that lifted the curtain still leaves it up, and serves nobody", (box) => {
      const result = boot(box);
      assert.equal(result.status, 10, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-reset-failed");
      assert.ok(fs.existsSync(box.marker), "the boot must put its curtain back");
      assert.match(only(result.calls, "logger").args.join(" "), /recoveryStatus=prior-unit-healthy-curtain-retained exitCode=10/);
    }, { resetExit: 1, resetFailure: "recovered", resetRemovesMarker: true });

    // The scheduler and the reset honour the hold.
    scenario("the scheduler records a held run, without a reset or an alert", (box) => {
      writeFixed(FIXED.hold, "");
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const log = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl"));
      assert.equal(log.at(-1)?.outcome, "skipped-held");
      assert.equal(result.calls.filter((call) => ["reset", "logger", "curl"].includes(call.tool)).length, 0);
    });
    scenario("the scheduler sends the heartbeat after a successful reset, and records it", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual([finished?.outcome, finished?.heartbeatOutcome], ["succeeded", "delivered"]);
      assert.equal(String(only(result.calls, "curl").stdin), `url = "${HEARTBEAT_URL}"\n`, "the heartbeat must reach the push monitor, not only be recorded");
    });
    scenario("the reset helper refuses under a hold before any Docker call", (box) => {
      writeFixed(FIXED.hold, "");
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /an operator hold is in place/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    });
    scenario("the scheduler records a recovery behind the retained curtain", (box) => {
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual([finished?.failureClass, finished?.recoveryStatus, finished?.rollbackStatus], ["reset-failed-recovered", "prior-unit-healthy-curtain-retained", "prior-unit-restored"]);
      assert.match(only(result.calls, "logger").args.join(" "), /recoveryStatus=prior-unit-healthy-curtain-retained /);
    }, { resetExit: 1, resetFailure: "recovered-curtained" });

    // The real reset, end to end, owning or not owning the curtain.
    /** @param {Sandbox} box */
    const resetState = (box) => {
      const root = path.join(box.deployRoot, "demo-reset-operations");
      return readJson(path.join(root, fs.readdirSync(root).sort().at(-1) || "", "state.json"));
    };
    scenario("a standalone reset lifts the curtain once its fresh baseline passes, with every runtime check bounded", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.existsSync(box.marker), false, "a standalone reset lifts its own curtain");
      const checks = result.calls.filter((call) => call.tool === "curl" && call.args.some((arg) => /\/(healthz|readyz|api\/app-info)$/.test(arg)));
      assert.ok(checks.length >= 6 && checks.every((call) => call.args.includes("--max-time")), "every runtime check must carry a time limit");
      assert.ok(publicCalls(result.calls).length >= 3, "a standalone reset still proves the public edge");
      assert.deepEqual([resetState(box).phase, JSON.parse(lastLine(result.stdout)).appStartedByReset], ["completed", false]);
    }, { running: true });
    scenario("a boot-delegated reset leaves the curtain to the boot, and never asks the public edge", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(fs.existsSync(box.marker), "the boot lifts its own curtain");
      assert.equal(publicCalls(result.calls).length, 0);
    }, { running: true });
    scenario("a boot-delegated reset that fails verification restores the prior unit behind the boot's curtain", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /prior unit was restored and verified behind the retained maintenance curtain/);
      assert.ok(fs.existsSync(box.marker), "a failed fresh reset must never serve the prior unit");
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["recovered", "prior-unit-healthy-curtain-retained"]);
    }, { running: true, identityFailCalls: [1] });
    scenario("a standalone reset that fails verification lifts the curtain on the restored prior unit", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed; prior unit was restored and verified\n/);
      assert.equal(fs.existsSync(box.marker), false);
    }, { running: true, identityFailCalls: [1] });
    scenario("a boot-delegated reset ignores a failing public edge", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(publicCalls(result.calls).length, 0);
    }, { running: true, publicFails: true });
    scenario("a boot-delegated reset refuses to run without the boot's curtain", (box) => {
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires the boot's curtain/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    }, { running: true });
    scenario("a reset that starts a stopped app keeps the curtain up until its fresh baseline passes", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      const build = only(result.calls, "docker", (call) => call.args.includes("scripts/public-demo-baseline-candidate.mjs") && call.args.includes("build"));
      assert.equal(build.markerPresent, true, "the candidate is built behind the curtain the start raised");
      assert.equal(fs.existsSync(box.marker), false, "the fresh baseline lifts the curtain");
      assert.equal(JSON.parse(lastLine(result.stdout)).appStartedByReset, true);
    }, { running: false });
    scenario("a reset that started a stopped app restores the prior unit behind its curtain", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /prior unit was restored and verified behind the retained maintenance curtain/);
      assert.ok(fs.existsSync(box.marker), "the stale unit the reset started must not be served");
    }, { running: false, identityFailCalls: [2] });
    scenario("a reset that fails after starting a stopped app keeps the curtain up", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed after it started the stopped app; maintenance curtain and protected evidence remain/);
      assert.ok(fs.existsSync(box.marker));
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["failed", "maintenance-curtain-retained"]);
    }, { running: false, candidateBuildFails: true });
    scenario("the reset keeps no Compose parser output, because it can quote a secret", (box) => {
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /did not parse; its output is not kept/);
      for (const text of [readTree(path.join(box.deployRoot, "demo-reset-operations")), result.stdout, result.stderr]) {
        assert.ok(!text.includes(CANARY) && !text.includes("Invalid template"), "no part of the parser's output may be kept");
      }
    }, { running: true, configCanary: true });
  };

  /** @type {{ label: string, caught: boolean, failed: string[] }[]} */
  const seedResults = [];
  try {
    runScenarios();
    if (outcomes.every((outcome) => outcome.ok)) {
      for (const seed of SEEDS) {
        const source = fs.readFileSync(helpers[seed.helper], "utf8");
        const occurrences = source.split(seed.from).length - 1;
        assert.equal(occurrences, 1, `seed "${seed.label}": its anchor occurs ${occurrences} times`);
        const mutated = path.join(work, `seed-${seedResults.length + 1}-${path.basename(helpers[seed.helper])}`);
        fs.writeFileSync(mutated, source.replace(seed.from, () => seed.to), { mode: 0o755 });
        const original = helpers[seed.helper];
        helpers[seed.helper] = mutated;
        if (seed.helper === "alert") install(mutated, FIXED.installedAlert, 0o755);
        recorded = [];
        quiet = true;
        focus = seed.caughtBy;
        try {
          runScenarios();
        } finally {
          quiet = false;
          focus = "";
          helpers[seed.helper] = original;
          if (seed.helper === "alert") install(original, FIXED.installedAlert, 0o755);
        }
        const failed = recorded.filter((outcome) => !outcome.ok).map((outcome) => outcome.name);
        const caught = failed.some((name) => name.startsWith(seed.caughtBy));
        seedResults.push({ label: seed.label, caught, failed });
        console.log(`${caught ? "CAUGHT  " : "SURVIVED"} seed: ${seed.label}${caught ? "" : ` (failed: ${failed.join("; ") || "nothing"})`}`);
      }
    }
  } finally {
    restoreHost(work, created);
  }

  const failures = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nPublic-demo helper contract: ${outcomes.length - failures.length}/${outcomes.length} scenarios passed.`);
  for (const failure of failures) console.log(`\n--- ${failure.name}\n${failure.detail}`);
  const survivors = seedResults.filter((seed) => !seed.caught);
  if (failures.length === 0) console.log(`Seeded helper defects: ${seedResults.length - survivors.length}/${SEEDS.length} caught.`);
  if (failures.length > 0 || survivors.length > 0 || seedResults.length !== SEEDS.length) process.exitCode = 1;
}

/**
 * A complete root-owned demo host: helper environment, recorded release, lock, data volume, and
 * curtain directory, all inside the work directory.
 * @param {string} work @param {number} ordinal @param {Scenario} scenario @returns {Sandbox}
 */
function createSandbox(work, ordinal, scenario) {
  const root = path.join(work, `box-${ordinal}`);
  const state = path.join(root, "harness");
  const deployRoot = path.join(root, "deploy");
  const volume = path.join(root, "volume");
  const maintenance = path.join(root, "maintenance");
  for (const [dir, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [state, 0o777], [path.join(root, "etc"), 0o755], [path.join(root, "compose"), 0o755], [path.join(root, "secrets"), 0o700],
    [deployRoot, 0o711], [path.join(deployRoot, "state"), 0o700], [path.join(deployRoot, "releases"), 0o700],
    [volume, 0o755], [path.join(volume, "files"), 0o750], [maintenance, 0o711], [path.join(maintenance, "deployment"), 0o711],
    [path.join(root, "log"), 0o700],
  ])) {
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, mode);
  }
  fs.writeFileSync(path.join(volume, "longtail-forge.db"), "SQLite format 3\0");
  fs.chownSync(path.join(volume, "longtail-forge.db"), 10001, 10001);
  fs.chownSync(path.join(volume, "files"), 10001, 10001);
  fs.writeFileSync(path.join(root, "compose", "compose.yaml"), "services: {}\n");
  const releaseEnv = path.join(deployRoot, "releases", "harness.env");
  writePrivate(releaseEnv, `LONGTAIL_IMAGE=${IMAGE}\nLONGTAIL_RELEASE_BRANCH=main\nLONGTAIL_RELEASE_COMMIT=${IDENTITY.commitSha}\nLONGTAIL_RELEASE_ARTIFACT_SHA256=${IDENTITY.artifact}\n`);
  writePrivate(path.join(deployRoot, "state", "current.json"), JSON.stringify({ version: IDENTITY.version, commitSha: IDENTITY.commitSha, artifact: { sha256: IDENTITY.artifact }, deployment: { releaseEnv, rollbackBackup: "" } }));
  writePrivate(path.join(deployRoot, "compose-operation.lock"), "");
  // The application environment file the host environment names carries the canary secret, so
  // both helpers' redaction lists hold it.
  const appEnv = path.join(root, "etc", "public-demo.env");
  writePrivate(appEnv, `DEMO_MODE=true\nSUPER_ADMIN_PASSWORD=${CANARY}\n`);
  const hostEnv = path.join(root, "etc", "compose-host.env");
  writePrivate(hostEnv, `LONGTAIL_ENV_FILE=${appEnv}\nLONGTAIL_HOST_PORT=8001\n`);
  const roleCredentials = path.join(root, "secrets", "demo-role-credentials.json");
  writePrivate(roleCredentials, JSON.stringify({ passwords: { super_admin: "HarnessPassword-42" } }));
  const isolation = path.join(root, "isolation");
  fs.writeFileSync(isolation, `#!/usr/bin/env bash\nexec ${shellQuote(path.join(work, "bin", "isolation"))} "$@"\n`, { mode: 0o755 });
  const helperEnv = path.join(root, "etc", "compose-deploy-helper.env");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${path.join(root, "compose")}`,
    `LTF_COMPOSE_HOST_ENV=${hostEnv}`,
    `LTF_DEMO_ROLE_CREDENTIALS=${roleCredentials}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    `LTF_MAINTENANCE_STATE_ROOT=${maintenance}`,
    `LTF_PUBLIC_DEMO_ISOLATION_HELPER=${isolation}`,
    `LTF_PUBLIC_URL=${DEMO_ORIGIN}`,
    "",
  ].join("\n"));
  const marker = path.join(maintenance, "deployment", "maintenance.on");
  fs.writeFileSync(path.join(state, "scenario.json"), JSON.stringify({ bridgeAfter: 0, scannerAfter: 0, ...scenario }));
  fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify({ running: Boolean(scenario.running), isolationEnforced: false, probes: {}, clock: Math.floor(Date.now() / 1000), identityCalls: 0 }));
  fs.writeFileSync(path.join(state, "paths.json"), JSON.stringify({ marker, volume, lock: path.join(deployRoot, "compose-operation.lock") }));
  fs.writeFileSync(path.join(state, "calls.jsonl"), "");
  for (const file of ["scenario.json", "runtime.json", "paths.json", "calls.jsonl"]) fs.chmodSync(path.join(state, file), 0o666);
  return { root, state, helperEnv, deployRoot, volume, marker, isolation };
}

/** @param {Sandbox} box @param {Date} when */
function completedReset(box, when) {
  const stamp = when.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dir = path.join(box.deployRoot, "demo-reset-operations", `${stamp}-scheduled-1`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writePrivate(path.join(dir, "state.json"), JSON.stringify({ phase: "completed", outcome: "baseline-healthy" }));
}

/** @param {Sandbox} box @param {string} fakeBin */
function writeSchedulerEnv(box, fakeBin) {
  const reset = path.join(box.root, "scheduler-reset");
  fs.writeFileSync(reset, `#!/usr/bin/env bash\nexec ${shellQuote(path.join(fakeBin, "reset"))} "$@"\n`, { mode: 0o755 });
  writeFixed(FIXED.schedulerEnv, [
    `LTF_PUBLIC_DEMO_RESET_HELPER=${reset}`,
    `LTF_PUBLIC_DEMO_RESET_ALERT_HELPER=${FIXED.installedAlert}`,
    `LTF_PUBLIC_DEMO_RESET_LOG=${path.join(box.root, "log", "public-demo-reset.jsonl")}`,
    "",
  ].join("\n"));
}

/** @param {Sandbox} box */
function bootOperation(box) {
  return fs.readdirSync(path.join(box.deployRoot, "demo-boot-operations")).sort().at(-1) || "";
}

/** @param {Sandbox} box */
function bootDirectory(box) {
  return path.join(box.deployRoot, "demo-boot-operations", bootOperation(box));
}

/** Every regular file's text beneath a directory, so a leak check sees all of the evidence. @param {string} directory @returns {string} */
function readTree(directory) {
  if (!fs.existsSync(directory)) return "";
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readTree(entryPath);
    return entry.isFile() ? fs.readFileSync(entryPath, "utf8") : "";
  }).join("\n");
}

/** @param {Sandbox} box @returns {Call[]} */
function readCalls(box) {
  return /** @type {Call[]} */ (readJsonLines(path.join(box.state, "calls.jsonl")));
}

/** @param {string} filePath @returns {Record<string, unknown>[]} */
function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** @param {Call[]} calls @param {string} tool @param {(call: Call) => boolean} [filter] */
function only(calls, tool, filter = () => true) {
  const matches = calls.filter((call) => call.tool === tool && filter(call));
  assert.equal(matches.length, 1, `expected exactly one ${tool} call, saw ${matches.length}: ${JSON.stringify(calls.filter((call) => call.tool === tool))}`);
  return matches[0];
}

/** @param {string} text */
function lastLine(text) {
  return text.trim().split("\n").at(-1) || "";
}

/** @returns {{ etc: boolean }} what the harness created, so that it removes only that */
function prepareHost() {
  for (const target of Object.values(FIXED)) {
    assert.equal(fs.existsSync(target), false, `${target} already exists; refusing to run where a real demo host may live`);
  }
  if (fs.existsSync(BACKUP_PARENT) && !fs.existsSync(OWNERSHIP_MARKER)) {
    throw new Error(`${BACKUP_PARENT} already exists; refusing to run where real Longtail Forge backups may live.`);
  }
  fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  fs.writeFileSync(OWNERSHIP_MARKER, "created by scripts/release/public-demo-helper-contract-harness.mjs\n");
  const etc = !fs.existsSync(ETC);
  fs.mkdirSync(ETC, { recursive: true, mode: 0o755 });
  fs.mkdirSync("/usr/local/sbin", { recursive: true, mode: 0o755 });
  return { etc };
}

/** @param {string} work @param {{ etc: boolean }} created */
function restoreHost(work, created) {
  for (const target of Object.values(FIXED)) fs.rmSync(target, { force: true });
  if (created.etc) fs.rmSync(ETC, { recursive: true, force: true });
  if (fs.existsSync(OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
}

/** @param {string} source @param {string} target @param {number} mode */
function install(source, target, mode) {
  fs.writeFileSync(target, fs.readFileSync(source));
  fs.chownSync(target, 0, 0);
  fs.chmodSync(target, mode);
}

/** @param {string} target @param {string} content @param {number} [mode] */
function writeFixed(target, content, mode = 0o600) {
  fs.writeFileSync(target, content);
  fs.chownSync(target, 0, 0);
  fs.chmodSync(target, mode);
}

/** @param {string} filePath @param {string} content */
function writePrivate(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chownSync(filePath, 0, 0);
  fs.chmodSync(filePath, 0o600);
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
