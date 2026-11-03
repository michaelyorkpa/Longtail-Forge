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
const WEBHOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${"Ab9_-".repeat(13)}xyz`;
const HEARTBEAT_URL = "https://uptime.harness.test/api/push/HarnessToken123?status=up&msg=OK&ping=";
const IMAGE = `ghcr.io/michaelyorkpa/longtail-forge@sha256:${"a".repeat(64)}`;
const IDENTITY = Object.freeze({ version: "0.33.33.53", commitSha: "c".repeat(40), artifact: "d".repeat(64) });

/** @typedef {{ dockerDown?: boolean, imageMissing?: boolean, health?: string, bridgeAfter?: number | null, scannerAfter?: number | null, curlFails?: boolean, resetExit?: number }} Scenario */
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
  const runtime = /** @type {{ running: boolean, isolationEnforced: boolean, probes: Record<string, number>, clock: number }} */ (readJson(path.join(state, "runtime.json")));
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
    return 0;
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
      process.stderr.write("longtail-forge-public-demo-reset: reset and automatic recovery failed; maintenance curtain and protected evidence remain\n");
      return Number(scenario.resetExit);
    }
    fs.rmSync(markerPath, { force: true });
    return emit(`${JSON.stringify({ ok: true, mode: "reset", target: "rt-ltf-demo", operationId: args[args.indexOf("--operation-id") + 1], semanticFingerprint: "f".repeat(64) })}\n`);
  }
  if (tool === "curl") return fakeCurl(args, scenario, record);
  if (tool === "docker") return fakeDocker(args, scenario, runtime, record, save, state);
  process.stderr.write(`unknown fake tool ${tool}\n`);
  return 2;
}

/** @param {string[]} args @param {Scenario} scenario @param {(extra?: Partial<Call>) => void} record */
function fakeCurl(args, scenario, record) {
  if (args.includes("--config")) {
    const stdin = fs.readFileSync(0, "utf8");
    record({ stdin });
    return scenario.curlFails ? 22 : 0;
  }
  record();
  const url = String(args.findLast((arg) => /^https?:\/\//.test(arg)) || "");
  if (url.endsWith("/readyz")) return emit('{"status":"ready"}\n');
  if (url.endsWith("/healthz")) return emit('{"status":"ok"}\n');
  if (url.endsWith("/api/app-info")) {
    return emit(`${JSON.stringify({ canonicalVersion: IDENTITY.version, sourceBranch: "main", commitSha: IDENTITY.commitSha, artifactSha256: IDENTITY.artifact })}\n`);
  }
  return 7;
}

/**
 * @param {string[]} args @param {Scenario} scenario
 * @param {{ running: boolean, isolationEnforced: boolean }} runtime
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
    if (sub === "config" && args.includes("--services")) return emit("longtail-forge\n");
    if (sub === "config" && args.includes("json")) {
      return emit(JSON.stringify({
        services: { "longtail-forge": { environment: { LONGTAIL_CLAMD_HOST: GATEWAY, LONGTAIL_CLAMD_PORT: "3310" }, networks: { demo: {} } } },
        networks: { demo: { name: "longtail-forge-public-demo-internal" } },
      }));
    }
    if (sub === "ps") return emit(runtime.running ? `${"e".repeat(64)}\n` : "");
    return 0;
  }
  record();
  if (args[0] === "info") return scenario.dockerDown ? 1 : 0;
  if (args[0] === "volume" && args[1] === "inspect") return emit(`${String(readJson(path.join(state, "paths.json")).volume)}\n`);
  if (args[0] === "image" && args[1] === "inspect") return scenario.imageMissing ? 1 : emit(`sha256:${"b".repeat(64)}\n`);
  if (args[0] === "network" && args[1] === "inspect") return emit("[]\n");
  if (args[0] === "inspect") return emit(`${scenario.health || "healthy"}\n`);
  return 0;
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
  let ordinal = 0;
  /** @param {string} name @param {(box: Sandbox) => void} body @param {Scenario} [scenario] */
  const scenario = (name, body, scenario = {}) => {
    const box = createSandbox(work, (ordinal += 1), scenario);
    try {
      body(box);
      outcomes.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      outcomes.push({ name, ok: false, detail: error instanceof Error ? error.stack || error.message : String(error) });
      console.log(`FAIL ${name}\n${error instanceof Error ? error.message : String(error)}`);
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
  const boot = (box) => runHelper(box, BOOT_HELPER, ["run"]);
  const notifyArgs = ["notify", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-scheduled-42", "--trigger", "scheduled",
    "--scheduled-boundary", "2026-11-03T17:00:00Z", "--failure-class", "reset-failed-unrecovered", "--recovery-status", "maintenance-curtain-retained", "--exit-code", "1"];

  try {
    // The alert boundary.
    scenario("notify posts the bounded fields to Discord, with mentions disabled and the URL only on standard input", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, ALERT_HELPER, notifyArgs);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${WEBHOOK_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes("discord.com") || arg.includes("123456789012345678")), "the webhook must never reach argv");
      const payload = JSON.parse(String(curl.args[curl.args.indexOf("--data-binary") + 1]));
      assert.deepEqual(payload.allowed_mentions, { parse: [] });
      assert.match(payload.content, /failureClass=reset-failed-unrecovered recoveryStatus=maintenance-curtain-retained exitCode=1$/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes("discord.com"), "the webhook must never reach output");
      assert.match(only(result.calls, "logger").args.join(" "), /failureClass=reset-failed-unrecovered/);
    });
    scenario("notify without a webhook file reaches only the journal, and reports failure", (box) => {
      const result = runHelper(box, ALERT_HELPER, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not configured; the alert reached only the local journal/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
      assert.equal(result.calls.filter((call) => call.tool === "logger").length, 1);
    });
    scenario("notify refuses a webhook file another user could read, before any request", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`, 0o644);
      const result = runHelper(box, ALERT_HELPER, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /must be root:root with mode 0600/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
    });
    for (const [label, url] of [["a non-Discord host", "https://discord.example.com/api/webhooks/123456789012345678/abc"], ["plain HTTP", WEBHOOK_URL.replace("https:", "http:")], ["a second line", `${WEBHOOK_URL}\n${WEBHOOK_URL}`]]) {
      scenario(`notify refuses ${label} in the webhook file, before any request`, (box) => {
        writeFixed(FIXED.webhook, `${url}\n`);
        const result = runHelper(box, ALERT_HELPER, notifyArgs);
        assert.equal(result.status, 1);
        assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
        assert.ok(!`${result.stdout}${result.stderr}`.includes("123456789012345678"), "a refused URL must not be echoed");
      });
    }
    scenario("a rejected delivery reports failure without naming the URL", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, ALERT_HELPER, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Discord did not accept the alert/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes("discord.com/api"), "the webhook must never reach output");
    }, { curlFails: true });
    scenario("notify refuses an unbounded field before the journal", (box) => {
      const result = runHelper(box, ALERT_HELPER, notifyArgs.map((arg) => (arg === "reset-failed-unrecovered" ? "reset failed; see /etc/shadow" : arg)));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /failure class is invalid/);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat sends one GET with the URL only on standard input", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      const result = runHelper(box, ALERT_HELPER, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${HEARTBEAT_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes("HarnessToken123") || arg === "--data-binary"), "the heartbeat sends no data and no URL in argv");
    });
    scenario("heartbeat without a URL file reports not configured", (box) => {
      const result = runHelper(box, ALERT_HELPER, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "reset"]);
      assert.equal(result.status, 2);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat refuses alert fields", (box) => {
      const result = runHelper(box, ALERT_HELPER, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot", "--failure-class", "boot-held"]);
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

    // Boot success paths.
    scenario("a boot with no missed boundary waits for its dependencies, isolates before starting, and lifts the curtain", (box) => {
      completedReset(box, new Date());
      const result = boot(box);
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([outcome.ok, outcome.baseline, outcome.heartbeatOutcome], [true, "not-required", "not-configured"]);
      const up = only(result.calls, "docker", (call) => call.args.includes("up"));
      assert.deepEqual([up.isolationEnforced, up.markerPresent], [true, true], "isolation and the curtain must precede the start");
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
      const reset = only(result.calls, "reset");
      assert.equal(reset.lockInherited, true, "the reset must run under the boot's own hold on the lock");
      assert.equal(reset.markerPresent, true, "the fresh reset runs behind the curtain");
      assert.match(reset.args.join(" "), /--operation-id \d{8}T\d{6}Z-boot-\d+ /);
    });
    scenario("a failed fresh reset stops the boot with its own alert", (box) => {
      const result = boot(box);
      assert.equal(result.status, 10, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-reset-failed");
    }, { resetExit: 1 });

    // The scheduler and the reset honour the hold.
    scenario("the scheduler records a held run, without a reset or an alert", (box) => {
      writeFixed(FIXED.hold, "");
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, SCHEDULER_HELPER, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const log = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl"));
      assert.equal(log.at(-1)?.outcome, "skipped-held");
      assert.equal(result.calls.filter((call) => ["reset", "logger", "curl"].includes(call.tool)).length, 0);
    });
    scenario("the scheduler sends the heartbeat after a successful reset, and records it", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, SCHEDULER_HELPER, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual([finished?.outcome, finished?.heartbeatOutcome], ["succeeded", "delivered"]);
    });
    scenario("the reset helper refuses under a hold before any Docker call", (box) => {
      writeFixed(FIXED.hold, "");
      const result = runHelper(box, RESET_HELPER, ["reset", "--target", "rt-ltf-demo", "--anchor-date", "today", "--confirm", "RESET RT-LTF-DEMO COMPOSE DATA"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /an operator hold is in place/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    });
  } finally {
    restoreHost(work, created);
  }

  const failures = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nPublic-demo helper contract: ${outcomes.length - failures.length}/${outcomes.length} scenarios passed.`);
  for (const failure of failures) console.log(`\n--- ${failure.name}\n${failure.detail}`);
  if (failures.length > 0) process.exitCode = 1;
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
  const hostEnv = path.join(root, "etc", "compose-host.env");
  writePrivate(hostEnv, "LONGTAIL_HOST_PORT=8001\n");
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
  fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify({ running: false, isolationEnforced: false, probes: {}, clock: Math.floor(Date.now() / 1000) }));
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
