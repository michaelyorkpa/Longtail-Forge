export const regressionMeta = Object.freeze({
  id: "database.verified-regression-baseline-fast-path",
  area: "database",
  tier: "release-gate",
  tags: ["baseline-bypass", "checksum", "database", "foreign-keys", "integrity", "migration", "regression", "security"],
  description: "Proves only a runner-attested copied baseline can bypass the full migration chain and that absent, direct, existing-target, forged, stale, and tampered cases fall back or fail closed.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { prepareRegressionBaselineDatabase } from "../../test-support/database-fixture.mjs";

const PRELOADER = "./scripts/test-support/regression-child-bootstrap.mjs";
const PROBE = "scripts/test-support/verified-regression-baseline-probe.mjs";
const baseline = await prepareRegressionBaselineDatabase();

try {
  const validLaunch = await baseline.createScriptLaunch(PROBE, 1);
  const valid = await runProbe(validLaunch);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(valid.probe.decision, { fastPathUsed: true, reason: "runner-verified-copy" });
  assert.equal(valid.probe.integrity, "ok");
  assert.equal(valid.probe.foreignKeys, 1);
  assert.equal(valid.probe.foreignKeyViolations, 0);
  assert.equal(valid.probe.migrationCount, baseline.verifiedBaselineHandshake.migrationCount);
  assert.equal(valid.probe.migrationIdentitySha256, baseline.verifiedBaselineHandshake.migrationIdentitySha256);

  const directLaunch = await baseline.createScriptLaunch(PROBE, 2, { useBaseline: false });
  const direct = await runProbe(directLaunch, { usePreloader: false });
  assert.equal(direct.status, 0, direct.stderr);
  assert.deepEqual(direct.probe.decision, { fastPathUsed: false, reason: "no-runner-handshake" });

  const environmentOnlyLaunch = await baseline.createScriptLaunch(PROBE, 3);
  const environmentOnly = await runProbe(environmentOnlyLaunch, { usePreloader: false });
  assert.equal(environmentOnly.status, 0, environmentOnly.stderr);
  assert.deepEqual(environmentOnly.probe.decision, { fastPathUsed: false, reason: "no-runner-handshake" });

  const existingTargetLaunch = await baseline.createScriptLaunch(PROBE, 4);
  await fs.writeFile(existingTargetLaunch.env.LONGTAIL_DATABASE_FILE, "");
  const existingTarget = await runProbe(existingTargetLaunch);
  assert.equal(existingTarget.status, 0, existingTarget.stderr);
  assert.deepEqual(existingTarget.probe.decision, { fastPathUsed: false, reason: "target-already-materialized" });

  const staleHandshake = {
    ...baseline.verifiedBaselineHandshake,
    migrationIdentitySha256: "0".repeat(64),
  };
  const staleLaunch = await baseline.createScriptLaunch(PROBE, 5);
  staleLaunch.verifiedBaselineHandshake = staleHandshake;
  const stale = await runProbe(staleLaunch);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /attestation does not match/i);

  const missingDescriptorLaunch = await baseline.createScriptLaunch(PROBE, 6);
  delete missingDescriptorLaunch.env.LTF_REGRESSION_VERIFIED_BASELINE_FD;
  const missingDescriptor = await runProbe(missingDescriptorLaunch, { usePreloader: true, sendHandshake: false });
  assert.equal(missingDescriptor.status, 0, missingDescriptor.stderr);
  assert.deepEqual(missingDescriptor.probe.decision, { fastPathUsed: false, reason: "no-runner-handshake" });

  await fs.appendFile(baseline.baselineDb, "tampered");
  const tamperedLaunch = await baseline.createScriptLaunch(PROBE, 7);
  const tampered = await runProbe(tamperedLaunch);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /size changed|checksum changed/i);
} finally {
  await baseline.cleanup();
}

console.log("Verified regression baseline fast-path regression passed.");

async function runProbe(launch, { usePreloader = true, sendHandshake = true } = {}) {
  const handshake = sendHandshake ? launch.verifiedBaselineHandshake : null;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(process.execPath, usePreloader ? ["--import", PRELOADER, PROBE] : [PROBE], {
      env: launch.env,
      stdio: handshake ? ["ignore", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });
    if (handshake) {
      child.stdio[3].end(`${JSON.stringify(handshake)}\n`);
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => {
      const marker = stdout.split(/\r?\n/).find((line) => line.startsWith("VERIFIED_BASELINE_PROBE="));
      resolve({
        probe: marker ? JSON.parse(marker.slice("VERIFIED_BASELINE_PROBE=".length)) : null,
        status,
        stderr,
        stdout,
      });
    });
  });
}
