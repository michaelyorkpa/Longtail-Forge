// Behavioural contract for the protected browser gate's Playwright install.
//
// 0.33.33.29 bounded each attempt with `timeout 240` inline in three workflow
// files, where no test could reach it. That hid a worse failure than the one it
// fixed: `timeout` terminates the wrapper, not the `apt-get` Playwright runs
// under sudo, so a cancelled attempt kept holding the dpkg lock and the next two
// attempts failed instantly with "Could not get lock". The whole retry budget
// went in six seconds while reporting bounded-attempt exhaustion.
//
// The first repair waited by taking the lock files with flock(1), which was a
// no-op: flock(1) uses flock(2) while apt uses fcntl record locks, and the two
// do not conflict. CI proved that - the retry ran but still raced the previous
// attempt. The wait is now on the package-manager process, which is independent
// of the primitive apt happens to use.
//
// These cases drive the real entry point with stub subprocesses, so the ordering
// and the failure modes are proven rather than read off its source. They cannot
// prove the production primitives themselves - `pgrep` and apt's own lock
// timeout - which only a runner exercises.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const ENTRY_POINT = "scripts/release/install-playwright-browser.mjs";
const workspace = mkdtempSync(path.join(tmpdir(), "install-playwright-browser-"));
const trailPath = path.join(workspace, "trail.log");
const nodePath = JSON.stringify(process.execPath);

/**
 * Write a stub command that records its label and arguments, optionally
 * outliving its bound, then exits with the given code.
 * @param {string} label @param {number} exitCode @param {{ hangMs?: number }} [options] @returns {string}
 */
function writeStub(label, exitCode, options = {}) {
  const stubPath = path.join(workspace, `${label}.mjs`);
  writeFileSync(stubPath, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(trailPath)}, [${JSON.stringify(label)}, ...process.argv.slice(2)].join(" ") + String.fromCharCode(10));`,
    options.hangMs ? `await new Promise((resolve) => setTimeout(resolve, ${options.hangMs}));` : "",
    `process.exit(${exitCode});`,
  ].join("\n"), "utf8");
  return stubPath;
}

const aptConfStub = writeStub("apt-conf", 0);
const succeedingInstall = writeStub("install-ok", 0);
const failingInstall = writeStub("install-fail", 1);
// The probe reports "a package manager is running" by exiting 0, matching pgrep.
const packageManagerIdle = writeStub("idle", 1);
const packageManagerBusy = writeStub("busy", 0);

/** @param {Record<string, string>} environment @returns {{ output: string, status: number | null }} */
function runEntryPoint(environment) {
  try {
    const stdout = execFileSync(process.execPath, [ENTRY_POINT], {
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });
    return { output: stdout, status: 0 };
  } catch (error) {
    const failure = /** @type {{ status: number | null, stderr?: string, stdout?: string }} */ (error);
    return { output: `${failure.stdout || ""}${failure.stderr || ""}`, status: failure.status };
  }
}

/** @returns {string[]} */
function readTrail() {
  const recorded = existsSync(trailPath) ? readFileSync(trailPath, "utf8") : "";
  writeFileSync(trailPath, "", "utf8");
  return recorded.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** @param {string} installStub @param {string} busyStub @returns {Record<string, string>} */
function environmentFor(installStub, busyStub) {
  return {
    LTF_APT_LOCK_TIMEOUT_COMMAND: `[${nodePath}, ${JSON.stringify(aptConfStub)}, "{seconds}"]`,
    LTF_PACKAGE_BUSY_PROBE_COMMAND: `[${nodePath}, ${JSON.stringify(busyStub)}]`,
    LTF_PLAYWRIGHT_INSTALL_COMMAND: `[${nodePath}, ${JSON.stringify(installStub)}]`,
  };
}

describe("protected browser gate Playwright install", () => {
  it("configures apt to wait for a contended lock before the first attempt", () => {
    const result = runEntryPoint(environmentFor(succeedingInstall, packageManagerIdle));

    expect(result.status).toBe(0);
    // The root-cause fix: apt waits for the lock rather than failing instantly,
    // so a retry does not need the lock free the moment it starts.
    expect(readTrail()).toEqual(["apt-conf 180", "install-ok"]);
  });

  it("waits for the package manager before every retry", () => {
    const result = runEntryPoint(environmentFor(failingInstall, packageManagerIdle));

    expect(result.status).toBe(1);
    expect(readTrail()).toEqual([
      "apt-conf 180",
      "install-fail",
      "idle",
      "install-fail",
    ]);
    expect(result.output).toMatch(/did not complete after 2 bounded attempts/);
  });

  it("stops instead of racing a package manager that never goes idle", () => {
    const result = runEntryPoint({
      ...environmentFor(failingInstall, packageManagerBusy),
      LTF_PACKAGE_LOCK_TIMEOUT_MS: "1000",
    });

    expect(result.status).toBe(1);
    const trail = readTrail();
    expect(trail[0]).toBe("apt-conf 1");
    expect(trail[1]).toBe("install-fail");
    expect(trail.filter((entry) => entry === "busy").length).toBeGreaterThan(0);
    // The run stops after the first failed attempt rather than spending the
    // remaining attempts against a package manager it knows is still running.
    expect(trail.filter((entry) => entry === "install-fail").length).toBe(1);
    expect(result.output).toMatch(/A package manager was still running after \d+ seconds/);
  });

  it("kills an attempt that outlives its bound rather than letting it run on", () => {
    const hangingInstall = writeStub("install-hang", 0, { hangMs: 10_000 });
    const startedAt = Date.now();
    const result = runEntryPoint({
      ...environmentFor(hangingInstall, packageManagerIdle),
      LTF_PLAYWRIGHT_ATTEMPTS: "1",
      LTF_PLAYWRIGHT_ATTEMPT_TIMEOUT_MS: "700",
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/attempt 1 exceeded its bound/);
    expect(elapsedMs).toBeLessThan(9_000);
    readTrail();
  });
});
