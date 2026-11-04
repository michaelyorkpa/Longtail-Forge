#!/usr/bin/env node
// Scanner cold-start reproducer (the restart-recovery post-release patch).
//
// On 2026-10-14 both hosts booted after a power loss and their scanners never came up. ClamAV's
// socket binds the exact Docker gateway address, with FreeBind off, and Docker had not yet created
// that address, so the bind failed with "Cannot assign requested address" and nothing retried it.
//
// This runs Ubuntu's own ClamAV package under real systemd on a disposable runner. The socket listens
// on an address that does not exist yet, as the gateway does not during boot:
//   1. without the reviewed drop-in, the socket fails exactly as it did on the hosts;
//   2. with it, the socket starts, and listens only on that exact address, never a wildcard;
//   3. once the bridge carrying the address appears, clamd answers PING there.
// The test-only parts are a one-signature database, because a fresh runner has no downloaded
// signatures, and drop-ins that clear both packaged units' signature-file condition for the same
// reason. The socket under test is the packaged one.
//
// It needs native Linux, root, and the clamav-daemon package, and it refuses a host that already has
// either drop-in, the bridge, or the address. Run it only on a disposable machine.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const FREEBIND_SOURCE = path.join(repoRoot, "scripts/release/clamav-daemon-socket-freebind.conf.example");
const ADDRESS = "172.30.99.1";
const PORT = 3310;
const BRIDGE = "ltf-repro0";
const SOCKET_DROP_INS = "/etc/systemd/system/clamav-daemon.socket.d";
const SERVICE_DROP_INS = "/etc/systemd/system/clamav-daemon.service.d";
const LISTEN = `${SOCKET_DROP_INS}/zz-ltf-reproducer-listen.conf`;
const FREEBIND = `${SOCKET_DROP_INS}/zz-ltf-freebind.conf`;
const CONDITION = `${SERVICE_DROP_INS}/zz-ltf-reproducer-signatures.conf`;
const SOCKET_CONDITION = `${SOCKET_DROP_INS}/zz-ltf-reproducer-signatures.conf`;
// The packaged signature directory. Ubuntu's AppArmor profile lets clamd read signatures only there,
// so the one test signature goes beside whatever freshclam may have fetched, and clamd.conf is
// left unchanged.
const SIGNATURE = "/var/lib/clamav/ltf-reproducer.hdb";

const options = parseOptions(process.argv.slice(2));
/** @type {Record<string, unknown>} */
const evidence = { startedAt: new Date().toISOString() };
/** @type {(() => void)[]} */
const cleanups = [];

await main();

async function main() {
  assert.equal(process.platform, "linux", "the scanner reproducer requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  assert.equal(show("clamav-daemon.socket", "LoadState"), "loaded", "the clamav-daemon package is required");
  for (const target of [LISTEN, FREEBIND, CONDITION, SOCKET_CONDITION, SIGNATURE]) assert.equal(fs.existsSync(target), false, `${target} already exists; refusing to run`);
  assert.notEqual(spawnSync("ip", ["link", "show", BRIDGE]).status, 0, `${BRIDGE} already exists; refusing to run`);
  assert.ok(!capture("ip", ["-4", "-o", "addr"]).includes(` ${ADDRESS}/`), `${ADDRESS} already exists; refusing to run`);

  let failure = null;
  try {
    prepare();
    reproduceOctoberFailure();
    startWithFreeBind();
    await answerOnceTheBridgeExists();
  } catch (error) {
    failure = error;
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error(`cleanup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    evidence.finishedAt = new Date().toISOString();
    evidence.outcome = failure ? "failed" : "passed";
    if (failure) evidence.failure = failure instanceof Error ? failure.stack || failure.message : String(failure);
    if (options.evidence) {
      fs.mkdirSync(options.evidence, { recursive: true });
      fs.writeFileSync(path.join(options.evidence, "scanner-cold-start.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    }
  }
  if (failure) throw failure;
  console.log("Scanner cold-start reproducer passed.");
}

function prepare() {
  for (const unit of ["clamav-daemon.socket", "clamav-daemon.service", "clamav-freshclam.service"]) spawnSync("systemctl", ["stop", unit]);
  run("systemctl", ["mask", "clamav-freshclam.service"]);
  cleanups.push(() => { spawnSync("systemctl", ["unmask", "clamav-freshclam.service"]); });
  cleanups.push(() => {
    for (const unit of ["clamav-daemon.service", "clamav-daemon.socket"]) spawnSync("systemctl", ["stop", unit]);
    spawnSync("systemctl", ["reset-failed", "clamav-daemon.socket", "clamav-daemon.service"]);
  });

  cleanups.push(() => { fs.rmSync(SIGNATURE, { force: true }); });
  fs.writeFileSync(SIGNATURE, "44d88612fea8a8f36de82e1278abb02f:68:Ltf.Reproducer.Signature\n", { mode: 0o644 });
  run("chown", ["clamav:clamav", SIGNATURE]);
  evidence.signatureDirectory = fs.readdirSync(path.dirname(SIGNATURE)).sort();

  fs.mkdirSync(SOCKET_DROP_INS, { recursive: true });
  fs.mkdirSync(SERVICE_DROP_INS, { recursive: true });
  cleanups.push(() => {
    for (const file of [LISTEN, FREEBIND, CONDITION, SOCKET_CONDITION]) fs.rmSync(file, { force: true });
    spawnSync("systemctl", ["daemon-reload"]);
  });
  // The hosts' listener: the packaged Unix socket plus one TCP descriptor on the exact gateway.
  fs.writeFileSync(LISTEN, `[Socket]\nListenStream=\nListenStream=/run/clamav/clamd.ctl\nListenStream=${ADDRESS}:${PORT}\n`);
  // Both packaged units are skipped until signatures exist, and a skipped socket is not a started one.
  fs.writeFileSync(CONDITION, "[Unit]\nConditionPathExistsGlob=\n");
  fs.writeFileSync(SOCKET_CONDITION, "[Unit]\nConditionPathExistsGlob=\n");
  run("systemctl", ["daemon-reload"]);
  evidence.listen = fs.readFileSync(LISTEN, "utf8");
}

function reproduceOctoberFailure() {
  const since = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const start = spawnSync("systemctl", ["start", "clamav-daemon.socket"], { encoding: "utf8" });
  const state = show("clamav-daemon.socket", "ActiveState");
  const journal = capture("journalctl", ["--unit", "clamav-daemon.socket", "--since", since, "--utc", "--no-pager", "--output", "cat"]);
  evidence.withoutFreeBind = { exit: start.status, activeState: state, freeBind: show("clamav-daemon.socket", "FreeBind"), journal: journal.trim().split("\n").slice(-6) };
  assert.notEqual(start.status, 0, "without FreeBind the socket must fail to start while its address is absent");
  assert.equal(state, "failed");
  assert.match(journal, /Cannot assign requested address/, "the failure must be the hosts' bind error");
  run("systemctl", ["reset-failed", "clamav-daemon.socket"]);
}

function startWithFreeBind() {
  fs.copyFileSync(FREEBIND_SOURCE, FREEBIND);
  run("systemctl", ["daemon-reload"]);
  run("systemctl", ["start", "clamav-daemon.socket"]);
  const listeners = tcpListenersOn(PORT);
  evidence.withFreeBind = { activeState: show("clamav-daemon.socket", "ActiveState"), freeBind: show("clamav-daemon.socket", "FreeBind"), dropIn: fs.readFileSync(FREEBIND, "utf8"), listeners };
  assert.equal(show("clamav-daemon.socket", "ActiveState"), "active");
  assert.equal(show("clamav-daemon.socket", "FreeBind"), "yes");
  assert.deepEqual(listeners, [`${ADDRESS}:${PORT}`], "the socket must listen only on the exact address, never a wildcard");
}

async function answerOnceTheBridgeExists() {
  run("ip", ["link", "add", BRIDGE, "type", "bridge"]);
  cleanups.push(() => { spawnSync("ip", ["link", "delete", BRIDGE]); });
  run("ip", ["addr", "add", `${ADDRESS}/24`, "dev", BRIDGE]);
  run("ip", ["link", "set", BRIDGE, "up"]);
  const started = Date.now();
  let attempts = 0;
  let reply = "";
  while (Date.now() - started < 120_000) {
    attempts += 1;
    reply = await ping();
    if (reply.startsWith("PONG")) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  const listeners = tcpListenersOn(PORT);
  const serviceJournal = capture("journalctl", ["--unit", "clamav-daemon.service", "--no-pager", "--output", "cat", "--lines", "25"]);
  evidence.afterBridge = { attempts, reply, seconds: Math.round((Date.now() - started) / 1000), service: show("clamav-daemon.service", "ActiveState"), listeners, serviceJournal: serviceJournal.trim().split("\n") };
  assert.ok(reply.startsWith("PONG"), `clamd must answer PING on ${ADDRESS}:${PORT}, last reply ${JSON.stringify(reply)}`);
  assert.deepEqual(listeners, [`${ADDRESS}:${PORT}`], "a running clamd must still listen only on the exact address");
}

/** @returns {Promise<string>} */
function ping() {
  return new Promise((resolve) => {
    let reply = "";
    const socket = net.createConnection({ host: ADDRESS, port: PORT });
    const timer = setTimeout(() => { socket.destroy(); resolve(reply); }, 20_000);
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (chunk) => { reply += chunk.toString("utf8"); });
    socket.on("close", () => { clearTimeout(timer); resolve(reply); });
    socket.on("error", () => { clearTimeout(timer); resolve(reply); });
  });
}

/** @param {number} port @returns {string[]} local addresses listening on the port */
function tcpListenersOn(port) {
  return capture("ss", ["-H", "-t", "-l", "-n"]).split("\n").filter(Boolean)
    .map((line) => line.trim().split(/\s+/)[3])
    .filter((local) => local.endsWith(`:${port}`))
    .sort();
}

/** @param {string} unit @param {string} property */
function show(unit, property) {
  return capture("systemctl", ["show", unit, `--property=${property}`, "--value"]).trim();
}

/** @param {string} command @param {string[]} args */
function capture(command, args) {
  return String(spawnSync(command, args, { encoding: "utf8" }).stdout || "");
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
}

/** @param {string[]} args @returns {{ evidence: string }} */
function parseOptions(args) {
  const parsed = { evidence: "" };
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === "--evidence" && args[index + 1]) parsed.evidence = args[index + 1];
    else throw new Error("Usage: node scripts/release/scanner-cold-start-reproducer.mjs [--evidence <dir>]");
  }
  return parsed;
}
