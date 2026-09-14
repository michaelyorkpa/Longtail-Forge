import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { classifySuiteRun, createSourceBackup, hashBytes, runBoundedProbe } from "../../scripts/test-support/mutation-runner.mjs";

/**
 * These prove the runner's own judgement, not any page's behaviour.
 *
 * They are deliberately few. The point is that the five outcomes a campaign can reach are each
 * reachable and distinguishable - not to build a second proof framework around the first.
 */

/** @param {string} name @param {string} contents */
function tempFile(name, contents) {
  const path = join(mkdtempSync(join(tmpdir(), "ltf-runner-selftest-")), name);
  writeFileSync(path, contents, "utf8");
  return path;
}

/** A finished vitest run, as `spawnSync` reports it. */
const run = (/** @type {Partial<Parameters<typeof classifySuiteRun>[0]>} */ fields) => classifySuiteRun({
  status: 0, signal: null, error: null, stdout: "", stderr: "", ...fields,
});

describe("mutation runner outcome classification", () => {
  it("reads a green suite as a survivor, which is a mutation nothing noticed", () => {
    const verdict = run({ status: 0, stdout: " Test Files  1 passed (1)\n      Tests  44 passed (44)\n" });
    assert.equal(verdict.outcome, "survivor");
  });

  it("credits a failure only when an assertion is what failed", () => {
    const failing = " Test Files  1 failed (1)\n      Tests  1 failed | 43 passed (44)\nAssertionError: expected 3 to equal 2\n";
    assert.equal(run({ status: 1, stdout: failing }).outcome, "assertion");
  });

  /**
   * **A crash the mutation caused is not proof the test would have caught it.** The suite can fail
   * because a guard removal threw somewhere the assertion never reached, which says nothing about
   * whether anything was actually checked.
   */
  it("separates an incidental crash from an assertion", () => {
    const crashed = " Test Files  1 failed (1)\n      Tests  1 failed (1)\nTypeError: Cannot read properties of null\n";
    assert.equal(run({ status: 1, stdout: crashed }).outcome, "incidental-error");
  });

  /** Every shape of "the runner never got far enough to have an opinion". */
  it("refuses to read a runner failure as behavioural detection", () => {
    assert.equal(run({ status: 1, stderr: "Error: Cannot find module 'vitest'\n" }).outcome, "infrastructure");
    assert.equal(run({ status: 1, stdout: "No test files found, exiting with code 1\n" }).outcome, "infrastructure");
    assert.equal(run({ status: 0, stdout: "" }).outcome, "infrastructure");
    assert.equal(run({ status: null, signal: "SIGTERM" }).outcome, "infrastructure");
    assert.equal(run({ status: null, error: Object.assign(new Error("stdout maxBuffer exceeded"), { code: "ENOBUFS" }) }).outcome, "infrastructure");
    assert.equal(run({ status: null, error: new Error("spawn ENOENT") }).outcome, "infrastructure");
  });

  it("reads a killed-on-timeout run as nontermination rather than a crash", () => {
    assert.equal(run({ status: null, signal: "SIGKILL" }).outcome, "nontermination");
    assert.equal(run({ status: null, error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) }).outcome, "nontermination");
  });
});

describe("mutation runner bounded probe", () => {
  /** The case the probe exists for: a removed loop guard, bounded in a second rather than a minute. */
  it("answers nontermination for a lifted call that never returns, within its own bound", () => {
    const path = tempFile("spin.js", "function spin(limit) {\n  let n = 0;\n  while (n < limit) {}\n  return n;\n}\n");
    const started = Date.now();
    const probe = runBoundedProbe({ sourcePath: path, lift: ["spin"], invoke: "spin(1);", timeoutMs: 1500 });
    assert.equal(probe.outcome, "nontermination");
    assert.ok(Date.now() - started < 10000, "the probe must be bounded by its own timeout, not the suite's");
  });

  it("answers nothing for a lifted call that returns, so the suite still decides", () => {
    const path = tempFile("fine.js", "function total(rows) {\n  return rows.length;\n}\n");
    assert.equal(runBoundedProbe({ sourcePath: path, lift: ["total"], invoke: "total([1, 2]);", timeoutMs: 5000 }).outcome, null);
  });

  it("answers infrastructure when the probe itself cannot run", () => {
    const path = tempFile("fine.js", "function total(rows) {\n  return rows.length;\n}\n");
    assert.equal(runBoundedProbe({ sourcePath: path, lift: ["total"], invoke: "missing();", timeoutMs: 5000 }).outcome, "infrastructure");
  });
});

describe("mutation runner source restoration", () => {
  it("verifies its retained backup before anything is mutated, and restores byte-for-byte", () => {
    const contents = "const answer = 42;\n";
    const path = tempFile("subject.js", contents);
    const backup = createSourceBackup(path);
    assert.equal(backup.sha, hashBytes(Buffer.from(contents)));
    assert.notEqual(backup.backupPath, path);

    writeFileSync(path, "const answer = 0;\n", "utf8");
    assert.notEqual(readFileSync(path, "utf8"), contents);
    backup.restore();
    assert.equal(readFileSync(path, "utf8"), contents);
    backup.verifyBackup();
  });

  it("refuses a restore it cannot prove, rather than reporting a clean campaign", () => {
    const path = tempFile("subject.js", "const answer = 42;\n");
    const backup = createSourceBackup(path);
    writeFileSync(backup.backupPath, "const answer = 0;\n", "utf8");
    assert.throws(() => backup.verifyBackup(), /no longer matches/);
  });
});
