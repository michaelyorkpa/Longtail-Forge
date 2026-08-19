// Behavioural contract for the protected browser gate's Playwright install.
//
// 0.33.33.29 bounded each attempt with `timeout 240` inline in three workflow
// files, where no test could reach it. That hid a worse failure than the one it
// fixed: `timeout` terminates the wrapper, not the `apt-get` Playwright runs
// under sudo, so a cancelled attempt kept holding /var/lib/apt/lists/lock and
// the next two attempts failed instantly with "Could not get lock". The whole
// retry budget went in six seconds while reporting bounded-attempt exhaustion.
//
// These cases drive the real entry point with stub subprocesses, so the
// ordering and the failure modes are proven rather than read off its source.

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

/** @param {string} installStub @param {string} lockStub @returns {Record<string, string>} */
function environmentFor(installStub, lockStub) {
  return {
    LTF_PACKAGE_LOCK_COMMAND: `[${nodePath}, ${JSON.stringify(lockStub)}, "{seconds}", "{lock}"]`,
    LTF_PLAYWRIGHT_INSTALL_COMMAND: `[${nodePath}, ${JSON.stringify(installStub)}]`,
  };
}

describe("protected browser gate Playwright install", () => {
  const succeedingInstall = writeStub("install-ok", 0);
  const failingInstall = writeStub("install-fail", 1);
  const freeLock = writeStub("lock-free", 0);
  const heldLock = writeStub("lock-held", 1);

  it("does not retry or wait on a package lock when the first attempt succeeds", () => {
    const result = runEntryPoint(environmentFor(succeedingInstall, freeLock));

    expect(result.status).toBe(0);
    expect(readTrail()).toEqual(["install-ok"]);
  });

  it("waits for both package locks before every retry", () => {
    const result = runEntryPoint(environmentFor(failingInstall, freeLock));

    expect(result.status).toBe(1);
    // The corrected defect: before 0.33.33.30.3.1 each retry ran immediately and
    // failed against the lock the cancelled attempt was still holding.
    expect(readTrail()).toEqual([
      "install-fail",
      "lock-free 60 /var/lib/dpkg/lock-frontend",
      "lock-free 60 /var/lib/apt/lists/lock",
      "install-fail",
      "lock-free 60 /var/lib/dpkg/lock-frontend",
      "lock-free 60 /var/lib/apt/lists/lock",
      "install-fail",
    ]);
    expect(result.output).toMatch(/did not complete after 3 bounded attempts/);
  });

  it("stops with the lock named instead of burning the remaining attempts against it", () => {
    const result = runEntryPoint(environmentFor(failingInstall, heldLock));

    expect(result.status).toBe(1);
    expect(readTrail()).toEqual(["install-fail", "lock-held 60 /var/lib/dpkg/lock-frontend"]);
    expect(result.output).toMatch(/Package lock \/var\/lib\/dpkg\/lock-frontend was still held after 60 seconds/);
  });

  it("kills an attempt that outlives its bound rather than letting it run on", () => {
    const hangingInstall = writeStub("install-hang", 0, { hangMs: 10_000 });
    const startedAt = Date.now();
    const result = runEntryPoint({
      ...environmentFor(hangingInstall, freeLock),
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
