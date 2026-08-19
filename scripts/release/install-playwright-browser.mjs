// Bounded, retrying Playwright browser install for the protected browser gate.
//
// 0.33.33.29 bounded each attempt with `timeout 240` inline in three workflow
// files. That fixed the original symptom - one stalled download consuming the
// whole job budget - but introduced a worse one. `timeout` terminates the
// wrapper it launched, not the `apt-get` that Playwright's `--with-deps` runs
// under sudo, so a cancelled attempt leaves that process holding
// /var/lib/apt/lists/lock. Attempts two and three then failed instantly with
// "Could not get lock", spending the entire retry budget in six seconds and
// reporting a bounded-attempt exhaustion that never really retried.
//
// This entry point owns the whole policy once instead of three times: hard-kill
// a timed-out attempt, then wait for the package locks a cancelled attempt may
// have left behind before retrying. Waiting rather than force-unlocking is
// deliberate - a slow mirror is the common cause, and letting the previous
// apt-get finish makes the retry's dependency step a fast no-op.
//
// Test seams: every subprocess and bound is overridable so a regression can
// prove the ordering and the failure modes without a runner. They are read only
// from the environment and default to real values.

import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import process from "node:process";

/** @typedef {{ code: number | null, timedOut: boolean }} AttemptResult */

const DEFAULT_INSTALL_COMMAND = Object.freeze(["npx", "playwright", "install", "--with-deps", "chromium"]);
const DEFAULT_LOCK_COMMAND = Object.freeze(["sudo", "flock", "--timeout", "{seconds}", "{lock}", "true"]);
// apt takes the dpkg frontend lock first and the lists lock while fetching, so a
// cancelled attempt can be holding either one.
const DEFAULT_PACKAGE_LOCKS = Object.freeze(["/var/lib/dpkg/lock-frontend", "/var/lib/apt/lists/lock"]);
const KILL_GRACE_MS = 30_000;

/** @param {string} name @param {readonly string[]} fallback @returns {string[]} */
function commandFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (!raw) return [...fallback];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a JSON array of command strings.`);
  }
  return parsed;
}

/** @param {string} name @param {number} fallback @returns {number} */
function numberFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const installCommand = commandFromEnvironment("LTF_PLAYWRIGHT_INSTALL_COMMAND", DEFAULT_INSTALL_COMMAND);
const lockCommand = commandFromEnvironment("LTF_PACKAGE_LOCK_COMMAND", DEFAULT_LOCK_COMMAND);
const packageLocks = commandFromEnvironment("LTF_PACKAGE_LOCK_PATHS", DEFAULT_PACKAGE_LOCKS);
const attempts = numberFromEnvironment("LTF_PLAYWRIGHT_ATTEMPTS", 3);
const attemptTimeoutMs = numberFromEnvironment("LTF_PLAYWRIGHT_ATTEMPT_TIMEOUT_MS", 240_000);
const lockTimeoutMs = numberFromEnvironment("LTF_PACKAGE_LOCK_TIMEOUT_MS", 60_000);

/**
 * Run one command, terminating the whole process group if it outlives its
 * bound. A timed-out attempt is SIGTERMed and then SIGKILLed, so nothing it
 * started survives to hold a lock the next attempt needs.
 * @param {string[]} command
 * @param {number} timeoutMs
 * @returns {Promise<AttemptResult>}
 */
function runBounded(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, { stdio: "inherit", shell: false });
    let timedOut = false;
    /** @param {NodeJS.Signals} signal */
    const stop = (signal) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop("SIGTERM");
      setTimeout(() => stop("SIGKILL"), KILL_GRACE_MS).unref();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    });
  });
}

/**
 * Wait for every package lock a cancelled attempt may still hold. Acquiring and
 * immediately releasing each lock is the wait: it blocks while another process
 * holds it and returns as soon as it does not.
 * @returns {Promise<boolean>}
 */
async function waitForPackageLocks() {
  const seconds = String(Math.ceil(lockTimeoutMs / 1000));
  for (const lock of packageLocks) {
    const command = lockCommand.map((part) => part.replace("{seconds}", seconds).replace("{lock}", lock));
    const result = await runBounded(command, lockTimeoutMs + KILL_GRACE_MS);
    if (result.code !== 0) {
      console.error(`Package lock ${lock} was still held after ${seconds} seconds; a cancelled install is still running.`);
      return false;
    }
  }
  return true;
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = await runBounded(installCommand, attemptTimeoutMs);
  if (result.code === 0) {
    process.exit(0);
  }
  const reason = result.timedOut ? "exceeded its bound" : `exited with code ${result.code}`;
  console.error(`Playwright browser install attempt ${attempt} ${reason}.`);
  if (attempt < attempts) {
    console.error("Waiting for any package lock the cancelled attempt left behind before retrying.");
    if (!await waitForPackageLocks()) {
      process.exit(1);
    }
  }
}

console.error(`Playwright browser install did not complete after ${attempts} bounded attempts.`);
process.exit(1);
