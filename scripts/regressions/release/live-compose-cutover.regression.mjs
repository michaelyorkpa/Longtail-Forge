export const regressionMeta = Object.freeze({
  id: "release.live-compose-cutover",
  area: "release",
  tier: "release-gate",
  tags: ["compose", "deployment", "recovery", "retirement", "security"],
  description: "Proves the completed live Compose cutover retired bare-metal production support without weakening the immutable digest deployment and recovery contract.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [packageSource, promotion, nightly, manualRelease, deployTransport, composeHelper, composeEnvironment, docs, attributes] = await Promise.all([
  read("package.json"),
  read(".github/workflows/promotion.yml"),
  read(".github/workflows/nightly.yml"),
  read(".github/workflows/manual-release.yml"),
  read("scripts/release/deploy-via-ssh.mjs"),
  read("scripts/release/longtail-forge-compose-deploy-host.example"),
  read("docs/longtail-forge-compose-deploy-helper.env.example"),
  read("docs/preview-deployment.md"),
  read(".gitattributes"),
]);

for (const retiredPath of [
  "scripts/bare-metal-deployment-smoke.mjs",
  "scripts/release/longtail-forge-deploy-host.example",
  "scripts/release/longtail-forge-compose-cutover-host.example",
  "docs/longtail-forge-deploy-helper.env.example",
  "docs/longtail-forge-compose-cutover-helper.env.example",
  "docs/longtail-forge.service.example",
]) {
  await assert.rejects(() => fs.access(retiredPath), undefined, `${retiredPath} must stay retired`);
}

assert.equal(JSON.parse(packageSource).scripts["bare-metal:smoke"], undefined);
assert.doesNotMatch(promotion, /bare-metal-recovery|bare-metal:smoke|BARE_METAL_RESULT/);
assert.doesNotMatch(nightly, /Deploy demo development|ssh-root-owned-host-helper|LTF_DEPLOY_INBOX|LTF_DEPLOY_HELPER|--mode deploy/);
assert.doesNotMatch(manualRelease, /compose-cutover|longtail-forge-deploy-host/);
assert.match(manualRelease, /longtail-forge-compose-deploy-host\.example/);

for (const requirement of [
  /--mode must be compose-deploy or compose-rollback/,
  /validatePublishedReleaseMetadata/,
  /LTF_COMPOSE_DEPLOY_INBOX/,
  /LTF_COMPOSE_DEPLOY_HELPER/,
  /--expected-image-digest/,
  /BatchMode=yes/,
  /UserKnownHostsFile=/,
]) assert.match(deployTransport, requirement);
assert.doesNotMatch(deployTransport, /LTF_DEPLOY_INBOX|LTF_DEPLOY_HELPER|--artifact|--revision/);

for (const requirement of [
  /only protected main release metadata is accepted/,
  /image reference must be digest-addressed/,
  /native better-sqlite3 proof is missing/,
  /registry SBOM attestation is missing/,
  /registry provenance attestation is missing/,
  /deployment\/maintenance\.on/,
  /backup_with_state/,
  /restore_with_state/,
  /verify_container_posture/,
  /resolved Compose application posture is not the reviewed non-root read-only loopback contract/,
  /automated deployment requires the recorded known-good Compose baseline/,
  /candidate and verified recovery did not complete; deployment marker and protected evidence remain/,
  /rollback and current-state recovery failed; deployment marker and all protected evidence remain/,
]) assert.match(composeHelper, requirement);

assert.match(composeEnvironment, /root:root[\s\S]*ownership and mode 0600/);
assert.match(composeEnvironment, /LTF_BACKUP_ROOT=\/var\/backups\/longtail-forge\/compose/);
assert.doesNotMatch(composeEnvironment, /LONGTAIL_SECURE_NOTES_MASTER_KEY|PASSWORD=|TOKEN=/);
assert.match(docs, /Retired production paths/);
assert.match(docs, /Direct Node\/systemd production operation has no release gate/);
assert.doesNotMatch(docs, /Transition-only bare-metal installation|Existing-host initial cutover/);
assert.match(attributes, /^scripts\/release\/longtail-forge-compose-deploy-host\.example text eol=lf$/m);
assert.doesNotMatch(attributes, /longtail-forge-(?:deploy|compose-cutover)-host\.example/);

console.log("Live Compose cutover retirement regression passed.");
