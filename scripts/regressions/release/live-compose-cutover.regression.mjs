export const regressionMeta = Object.freeze({
  id: "release.live-compose-cutover",
  area: "release",
  tier: "release-gate",
  tags: ["backup", "compose", "cutover", "deployment", "recovery", "security"],
  description: "Proves the initial Compose cutover preserves the bare-metal recovery path and establishes the constrained digest baseline safely.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [cutover, cutoverEnvironment, deploy, deployEnvironment, releaseWorkflow, attributes] = await Promise.all([
  read("scripts/release/longtail-forge-compose-cutover-host.example"),
  read("docs/longtail-forge-compose-cutover-helper.env.example"),
  read("scripts/release/longtail-forge-compose-deploy-host.example"),
  read("docs/longtail-forge-compose-deploy-helper.env.example"),
  read(".github/workflows/manual-release.yml"),
  read(".gitattributes"),
]);

for (const requirement of [
  /cutover must run directly as root and must not be exposed through the deployment-account sudo rule/,
  /Compose cutover environment contains unsupported key/,
  /Compose cutover environment contains duplicate key/,
  /only protected main release metadata is accepted/,
  /image reference must be digest-addressed/,
  /native better-sqlite3 proof is missing/,
  /registry SBOM attestation is missing/,
  /registry provenance attestation is missing/,
  /LONGTAIL_RELEASE_BRANCH=main/,
  /LONGTAIL_RELEASE_COMMIT=%s/,
  /LONGTAIL_RELEASE_ARTIFACT_SHA256=%s/,
  /CUT OVER LONGTAIL FORGE TO COMPOSE/,
  /initial cutover requires no existing Compose application containers/,
  /initial cutover requires a new empty named data volume/,
  /reviewed Compose network must exist before scanner and cutover preflight/,
  /existing Compose network does not match the reviewed subnet and gateway/,
  /deployment\/maintenance\.on/,
  /pre-compose-cutover-\$OPERATION_ID\.ltfbackup\.tgz/,
  /scripts\/backup\.mjs "\$\{backup_args\[@\]\}"/,
  /scripts\/backup\.mjs "\$\{inspect_args\[@\]\}"/,
  /resolve_compose_volume_mountpoint/,
  /Compose data volume is not a reviewed local Docker volume/,
  /\(cd "\$BARE_METAL_CURRENT" && node scripts\/backup\.mjs "\$\{restore_args\[@\]\}"\)/,
  /--database "\$COMPOSE_VOLUME_MOUNTPOINT\/longtail-forge\.db"/,
  /restored Compose data volume contains an unsupported symbolic link/,
  /chown -R 10001:10001 -- "\$COMPOSE_VOLUME_MOUNTPOINT"/,
  /--confirm-destructive "RESTORE LONGTAIL FORGE BACKUP"/,
  /container could not reach the reviewed host ClamAV handoff/,
  /require\("node:net"\)/,
  /docker run --rm --platform linux\/amd64 --network "\$COMPOSE_NETWORK"/,
  /resolved Compose application posture is not the reviewed non-root read-only loopback contract/,
  /size=512m,mode=0700,uid=10001,gid=10001/,
  /verify_container_posture/,
  /\.HostConfig\.ReadonlyRootfs == true/,
  /\.NetworkSettings\.Ports\["8001\/tcp"\]/,
  /compose up -d --no-deps --force-recreate longtail-forge/,
  /verify_runtime \|\| fail "Compose runtime identity or readiness did not match/,
  /systemctl disable "\$BARE_METAL_SERVICE"/,
  /compose_verified_bare_metal_retained/,
  /deployment marker did not produce the reviewed public maintenance status/,
  /Retry-After:\[\[:space:\]\]\*60/,
  /Cache-Control:\.\*no-store/,
  /candidate_failed_bare_metal_recovered/,
  /candidate_and_bare_metal_recovery_failed/,
  /systemctl start "\$BARE_METAL_SERVICE"/,
  /systemctl enable "\$BARE_METAL_SERVICE"/,
  /verify_original_runtime/,
  /rm -f -- "\$CURRENT_STATE"/,
  /maintenance and protected evidence remain/,
]) assert.match(cutover, requirement);

assert.match(cutover, /if test "\$MODE" = "preflight"; then[\s\S]*nextAction/);
assert.match(cutover, /RELEASE_ENV="\$\(mktemp \/run\/longtail-forge-compose-cutover/);
assert.ok(
  cutover.includes("grep -Eiq '^Retry-After:[[:space:]]*60[[:space:]]*$'"),
  "the maintenance header proof must accept curl's CRLF line ending portably",
);
assert.doesNotMatch(cutover, /deployment\/active|docker login|PASSWORD=|TOKEN=|:latest/i);
assert.doesNotMatch(
  cutover,
  /compose run --rm --no-deps[^\n]*longtail-forge node scripts\/backup\.mjs restore/,
  "the newer candidate must not reject the existing release's exact-version backup before startup migration",
);
assert.match(cutoverEnvironment, /root:root[\s\S]*mode 0600/);
assert.match(cutoverEnvironment, /LTF_COMPOSE_BACKUP_ROOT=\/var\/backups\/longtail-forge\/compose/);
assert.match(cutoverEnvironment, /separately protected Secure Notes recovery-key evidence/i);
assert.doesNotMatch(cutoverEnvironment, /LONGTAIL_SECURE_NOTES_MASTER_KEY|PASSWORD=|TOKEN=/);

for (const requirement of [
  /BACKUP_ROOT="\$\{LTF_BACKUP_ROOT:-\/var\/backups\/longtail-forge\/compose\}"/,
  /BACKUP_CONTAINER_ROOT="\/var\/backups\/longtail-forge"/,
  /deployment\/maintenance\.on/,
  /backup output escaped the protected Compose backup root/,
  /restore archive escaped the protected Compose backup root/,
  /container_output="\$BACKUP_CONTAINER_ROOT\/\$output_name"/,
  /container_archive="\$BACKUP_CONTAINER_ROOT\/\$archive_name"/,
  /candidate container could not reach the reviewed host ClamAV handoff/,
  /LONGTAIL_RELEASE_BRANCH=main/,
  /LONGTAIL_RELEASE_COMMIT=%s/,
  /LONGTAIL_RELEASE_ARTIFACT_SHA256=%s/,
  /resolved Compose application posture is not the reviewed non-root read-only loopback contract/,
  /size=512m,mode=0700,uid=10001,gid=10001/,
  /verify_container_posture/,
]) assert.match(deploy, requirement);
assert.doesNotMatch(deploy, /deployment\/active/);
assert.match(deployEnvironment, /parent retains the root-owned bare-metal backups/);

for (const requirement of [
  /docs\/longtail-forge-compose-cutover-helper\.env\.example/,
  /scripts\/release\/longtail-forge-compose-cutover-host\.example/,
]) assert.match(releaseWorkflow, requirement);
assert.match(attributes, /^scripts\/release\/longtail-forge-compose-cutover-host\.example text eol=lf$/m);

console.log("Live Compose cutover regression passed.");
