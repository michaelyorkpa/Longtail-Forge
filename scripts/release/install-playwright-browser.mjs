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
// This entry point owns the whole policy once instead of three times: configure
// apt to wait for a contended lock, hard-kill a timed-out attempt, then wait for
// the package manager a cancelled attempt left behind before retrying. Waiting
// rather than force-unlocking is deliberate - a slow mirror is the common cause,
// and letting the previous apt-get finish makes the retry a fast no-op.
//
// The first repair waited by taking the lock files with flock(1). CI proved that
// wrong: flock(1) uses flock(2) while apt uses fcntl record locks, so the wait
// returned instantly and the retry still raced the previous attempt.
//
// Test seams: every subprocess and bound is overridable so a regression can
// prove the ordering and the failure modes without a runner. They are read only
// from the environment and default to real values.

import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import process from "node:process";

/** @typedef {{ code: number | null, timedOut: boolean }} AttemptResult */

const DEFAULT_INSTALL_COMMAND = Object.freeze(["npx", "playwright", "install", "--with-deps", "chromium"]);
// Probe whether a package manager is still running. Exit code 0 means busy.
//
// The first attempt at this waited by taking the lock files with flock(1).
// That was a no-op: flock(1) uses flock(2) while apt uses fcntl record locks,
// and the two do not conflict, so the wait returned instantly and the retry
// raced the previous attempt anyway. Waiting on the process is independent of
// which locking primitive apt happens to use.
const DEFAULT_BUSY_PROBE_COMMAND = Object.freeze(["sh", "-c", "pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || pgrep -x unattended-upgrade >/dev/null"]);
const KILL_GRACE_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

/** @param {string} name @param {readonly string[]} fallback @returns {string[]} */
function commandFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (!raw) return [...fallback];
  /** @type {unknown} */
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a JSON array of command strings.`);
  }
  return /** @type {string[]} */ (parsed);
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
const busyProbeCommand = commandFromEnvironment("LTF_PACKAGE_BUSY_PROBE_COMMAND", DEFAULT_BUSY_PROBE_COMMAND);
// Bounds are stall detectors, not deadlines for a healthy install. Four CI runs
// showed the 0.33.33.29 value of 240s was below the real cost of this step when
// the azure mirror is unreachable and apt falls back: attempts were killed
// mid-fetch and mid-unpack while still making progress, and the 60s wait then
// gave up on an apt that was still installing. Two long attempts beat three
// short ones once apt itself waits for a contended lock.
const attempts = numberFromEnvironment("LTF_PLAYWRIGHT_ATTEMPTS", 2);
const attemptTimeoutMs = numberFromEnvironment("LTF_PLAYWRIGHT_ATTEMPT_TIMEOUT_MS", 540_000);
const lockTimeoutMs = numberFromEnvironment("LTF_PACKAGE_LOCK_TIMEOUT_MS", 180_000);

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
 * Wait until no package manager is running, so a retry does not race the
 * apt-get a cancelled attempt left behind.
 * @returns {Promise<boolean>}
 */
async function waitForPackageManager() {
  const deadline = Date.now() + lockTimeoutMs;
  while (Date.now() < deadline) {
    const busy = await runBounded(busyProbeCommand, POLL_INTERVAL_MS * 4);
    if (busy.code !== 0) {
      return true;
    }
    // Never sleep past the deadline: a short bound must still report promptly.
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => { setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingMs)); });
  }
  console.error(`A package manager was still running after ${Math.ceil(lockTimeoutMs / 1000)} seconds; the cancelled install has not released its locks.`);
  return false;
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = await runBounded(installCommand, attemptTimeoutMs);
  if (result.code === 0) {
    process.exit(0);
  }
  const reason = result.timedOut ? "exceeded its bound" : `exited with code ${result.code}`;
  console.error(`Playwright browser install attempt ${attempt} ${reason}.`);
  if (attempt < attempts) {
    console.error("Waiting for the package manager the cancelled attempt left behind before retrying.");
    if (!await waitForPackageManager()) {
      process.exit(1);
    }
  }
}

console.error(`Playwright browser install did not complete after ${attempts} bounded attempts.`);
process.exit(1);
