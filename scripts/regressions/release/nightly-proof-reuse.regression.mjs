export const regressionMeta = Object.freeze({
  id: "release.nightly-proof-reuse",
  area: "release",
  tier: "release-gate",
  tags: ["artifacts", "ci", "github-actions", "promotion", "security"],
  description: "Proves exact-SHA nightly proof reuse is checksum-bound, policy-versioned, expiring, and fail-closed while hotfixes retain the full path.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNightlyProof, POLICY_VERSION, REQUIRED_JOBS, verifyNightlyProof } from "../../release/nightly-proof.mjs";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-nightly-proof-regression-"));
const commit = "a".repeat(40);
const repository = "example/longtail-forge";
const workflowRef = `${repository}/.github/workflows/nightly.yml@refs/heads/nightly`;
const artifactFilename = "longtail-forge-9.8.7.tgz";
const artifactBytes = Buffer.from("immutable runtime artifact fixture");
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
const proofPath = path.join(workspace, "nightly-proof.json");

try {
  await fs.writeFile(path.join(workspace, artifactFilename), artifactBytes);
  await fs.writeFile(path.join(workspace, `${artifactFilename}.sha256`), `${artifactSha256}  ${artifactFilename}\n`);
  await fs.writeFile(path.join(workspace, "release-metadata.json"), `${JSON.stringify({
    schemaVersion: 1,
    application: "longtail-forge",
    version: "9.8.7",
    commitSha: commit,
    channel: "nightly",
    sourceBranch: "nightly",
    artifact: { filename: artifactFilename, sha256: artifactSha256 },
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`);

  const proof = await createNightlyProof({
    commit,
    directory: workspace,
    output: proofPath,
    repository,
    runId: 12345,
    workflowRef,
  });
  assert.equal(proof.policyVersion, POLICY_VERSION);
  assert.deepEqual(proof.requiredJobs, Object.fromEntries(REQUIRED_JOBS.map((name) => [name, "success"])));
  await verifyNightlyProof({
    commit,
    directory: workspace,
    maxAgeHours: 168,
    proof: proofPath,
    repository,
    runId: 12345,
    workflowRef,
  });

  const promotion = await fs.readFile(".github/workflows/promotion.yml", "utf8");
  const nightly = await fs.readFile(".github/workflows/nightly.yml", "utf8");
  const codeql = await fs.readFile(".github/workflows/codeql.yml", "utf8");
  for (const requirement of [
    /reuse_nightly_proof/,
    /Expected exactly one unexpired successful exact-SHA nightly run|nightly-proof\.mjs select/,
    /hotfix\/\*/,
    /needs\.promotion-source\.outputs\.reuse_nightly_proof != 'true'[\s\S]*npm run test:regressions/,
    /name: Packaging and recovery/,
    /needs: \[artifact-smoke, backup-recovery, bare-metal-recovery, container-recovery\]/,
    /artifact:smoke -- --artifact/,
    /bare-metal:smoke -- --artifact/,
    /container:smoke -- --artifact/,
  ]) assert.match(promotion, requirement);
  assert.match(nightly, /name: Publish exact-SHA nightly proof/);
  assert.match(nightly, /GITHUB_EVENT_NAME" != "schedule/);
  assert.doesNotMatch(codeql, /^\s*push:/m, "duplicate CodeQL push runs should remain retired after protected PR contexts were verified");

  const tampered = { ...proof, policyVersion: "stale-policy" };
  await fs.writeFile(proofPath, `${JSON.stringify(tampered, null, 2)}\n`);
  await assert.rejects(() => verifyNightlyProof({
    commit,
    directory: workspace,
    maxAgeHours: 168,
    proof: proofPath,
    repository,
    runId: 12345,
    workflowRef,
  }), /proof policy version mismatch/);

  await fs.writeFile(proofPath, `${JSON.stringify({ ...proof, createdAt: "2000-01-01T00:00:00.000Z" }, null, 2)}\n`);
  await assert.rejects(() => verifyNightlyProof({
    commit,
    directory: workspace,
    maxAgeHours: 168,
    proof: proofPath,
    repository,
    runId: 12345,
    workflowRef,
  }), /older than 168 hours/);
} finally {
  await fs.rm(workspace, { force: true, recursive: true });
}

console.log("Nightly proof reuse regression passed.");
