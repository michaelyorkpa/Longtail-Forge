export const regressionMeta = Object.freeze({
  id: "release.immutable-image-publication",
  area: "release",
  tier: "release-gate",
  tags: ["compose", "deployment", "github", "image", "registry"],
  description: "Proves release publication binds the reviewed main source and runtime artifact to one GHCR digest, linux/amd64 platform manifest, native dependency proof, attestations, and backup-first constrained host handoff.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  PROVENANCE_PREDICATES,
  SBOM_PREDICATE,
  createPublishedReleaseMetadata,
  normalizeImageRepository,
  parseCliArgs,
  selectPublishedDescriptors,
  validatePublishedReleaseMetadata,
} from "../../release/published-container-image.mjs";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [
  publisher,
  deployClient,
  hostHelper,
  helperEnvironment,
  manualRelease,
  manualPreview,
  configScript,
  compose,
  packageSource,
] = await Promise.all([
  read("scripts/release/published-container-image.mjs"),
  read("scripts/release/deploy-via-ssh.mjs"),
  read("scripts/release/longtail-forge-compose-deploy-host.example"),
  read("docs/longtail-forge-compose-deploy-helper.env.example"),
  read(".github/workflows/manual-release.yml"),
  read(".github/workflows/manual-preview.yml"),
  read("scripts/release/configure-github-release-operations.mjs"),
  read("compose.yaml"),
  read("package.json"),
]);

for (const requirement of [
  /"buildx", "build"/,
  /"--platform", supportedPlatform/,
  /"--provenance=mode=max"/,
  /"--sbom=true"/,
  /"--push"/,
  /ensurePublicationTagAbsent/,
  /org\.opencontainers\.image\.source/,
  /Published release images require exact protected main release metadata/,
  /Published image index must contain exactly the reviewed linux\/amd64 platform manifest/,
  /registry-attached SPDX SBOM and SLSA provenance attestations/,
  /"pull", "--platform", supportedPlatform, reference/,
  /"run", "--rm", "--platform", supportedPlatform/,
  /better-sqlite3\/package\.json/,
  /execution: "published-digest"/,
  /metadata\.image\.reference !== `\$\{repository\}@\$\{digest\}`/,
  /:latest/,
]) assert.match(publisher, requirement);

for (const requirement of [
  /packages: write/,
  /docker login ghcr\.io --username "\$GITHUB_ACTOR" --password-stdin/,
  /IMAGE_REPOSITORY="ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}"/,
  /npm run image:publish -- publish/,
  /npm run artifact:smoke -- --artifact/,
  /--output-platform-manifest dist\/platform-manifest\.json/,
  /npm run image:publish -- verify --metadata dist\/release-metadata\.json --expected-commit "\$REVISION"/,
  /dist\/platform-manifest\.json/,
  /compose\.yaml docs\/compose\.env\.example docs\/longtail-forge-compose-deploy-helper\.env\.example/,
]) assert.match(manualRelease, requirement);
assert.doesNotMatch(manualRelease, /:latest/);

for (const requirement of [
  /image_digest:/,
  /ssh-compose-digest-host-helper/,
  /gh release download "v\$\(node -p/,
  /--expected-commit "\$REVISION" --expected-digest "\$IMAGE_DIGEST"/,
  /--mode compose-deploy --metadata dist\/release-metadata\.json/,
  /--mode compose-rollback --metadata dist\/release-metadata\.json/,
  /LTF_COMPOSE_DEPLOY_HELPER/,
]) assert.match(manualPreview, requirement);
assert.doesNotMatch(manualPreview, /artifact:build|create-release-metadata|--artifact "dist\/longtail-forge/);

for (const requirement of [
  /compose-deploy\|compose-rollback/,
  /validatePublishedReleaseMetadata/,
  /config\.composeHelper/,
  /config\.composeInbox/,
  /--expected-image-digest/,
  /--expected-platform-manifest-digest/,
  /Compose host helper result does not match/,
]) assert.match(deployClient, requirement);

for (const requirement of [
  /helper must run as root through the constrained sudo rule/,
  /compose helper environment contains unsupported key/,
  /metadata filename is invalid/,
  /release metadata schema must be 2/,
  /only protected main release metadata is accepted/,
  /image reference must be digest-addressed/,
  /native better-sqlite3 proof is missing/,
  /registry SBOM attestation is missing/,
  /docker pull --platform linux\/amd64/,
  /backup root must be owner-only for container UID\/GID 10001/,
  /resolved Compose backup mount must bind the protected host backup root/,
  /compose "\$release_env" stop longtail-forge/,
  /scripts\/backup\.mjs create/,
  /scripts\/backup\.mjs inspect/,
  /scripts\/backup\.mjs restore/,
  /requires the recorded known-good Compose baseline established by the initial cutover/,
  /--confirm-destructive "RESTORE LONGTAIL FORGE BACKUP"/,
  /assert_marker/,
  /clear_marker/,
  /verify_runtime/,
  /prior release and data were restored and verified/,
  /pre-rollback current release and data were restored and verified/,
  /deployment marker and all protected evidence remain/,
]) assert.match(hostHelper, requirement);
assert.doesNotMatch(hostHelper, /PASSWORD=|TOKEN=|docker login|latest/i);

assert.match(helperEnvironment, /pull-only credential scoped to this package/i);
assert.match(helperEnvironment, /rotate it by[\s\S]*proving a digest pull[\s\S]*revoking[\s\S]*the old value/i);
assert.doesNotMatch(helperEnvironment, /PASSWORD=|TOKEN=/i);
assert.match(configScript, /"friends-and-family-preview", "main", "ssh-compose-digest-host-helper"/);
assert.match(configScript, /"demo-development", "nightly", "ssh-compose-digest-host-helper"/);
assert.match(configScript, /COMPOSE_DEPLOY_HELPER/);
assert.match(configScript, /COMPOSE_DEPLOY_INBOX/);
assert.match(compose, /image: \$\{LONGTAIL_IMAGE:-longtail-forge:local\}/);
assert.equal(JSON.parse(packageSource).scripts["image:publish"], "node scripts/release/published-container-image.mjs");

const digest = `sha256:${"a".repeat(64)}`;
const platformDigest = `sha256:${"b".repeat(64)}`;
const sbomDigest = `sha256:${"c".repeat(64)}`;
const provenanceDigest = `sha256:${"d".repeat(64)}`;
const commitSha = "e".repeat(40);
const artifactSha256 = "f".repeat(64);
const repository = "ghcr.io/example/longtail-forge";

assert.equal(normalizeImageRepository("GHCR.IO/Example/Longtail-Forge"), repository);
assert.throws(() => normalizeImageRepository("docker.io/example/longtail-forge"), /lowercase ghcr\.io/);
assert.throws(() => normalizeImageRepository(`${repository}:latest`), /without a tag or digest/);

const descriptors = selectPublishedDescriptors({
  mediaType: "application/vnd.oci.image.index.v1+json",
  manifests: [
    { digest: platformDigest, mediaType: "application/vnd.oci.image.manifest.v1+json", platform: { os: "linux", architecture: "amd64" } },
    { digest: sbomDigest, mediaType: "application/vnd.oci.image.manifest.v1+json", platform: { os: "unknown", architecture: "unknown" }, annotations: { "vnd.docker.reference.type": "attestation-manifest" } },
  ],
});
assert.equal(descriptors.platform.digest, platformDigest);
assert.equal(descriptors.attestations.length, 1);
assert.throws(() => selectPublishedDescriptors({
  mediaType: "application/vnd.oci.image.index.v1+json",
  manifests: [
    { digest: platformDigest, platform: { os: "linux", architecture: "arm64" } },
  ],
}), /exactly the reviewed linux\/amd64/);

const platformManifest = {
  repository,
  digest,
  reference: `${repository}@${digest}`,
  platform: "linux/amd64",
  platformManifest: { digest: platformDigest, mediaType: "application/vnd.oci.image.manifest.v1+json", os: "linux", architecture: "amd64" },
  imageConfigDigest: `sha256:${"1".repeat(64)}`,
  nativeDependency: { architecture: "x64", betterSqlite3Version: "13.0.1", execution: "published-digest", platform: "linux", sqliteVersion: "3.53.3" },
  attestations: {
    sbom: { manifestDigest: sbomDigest, predicateType: SBOM_PREDICATE },
    provenance: { manifestDigest: provenanceDigest, predicateType: [...PROVENANCE_PREDICATES][0] },
  },
};
const metadata = createPublishedReleaseMetadata({
  schemaVersion: 1,
  application: "longtail-forge",
  version: "9.8.7",
  commitSha,
  channel: "main",
  sourceBranch: "main",
  artifact: { filename: "longtail-forge-9.8.7.tgz", sha256: artifactSha256 },
}, platformManifest);
assert.deepEqual(validatePublishedReleaseMetadata(metadata, { expectedCommit: commitSha, expectedDigest: digest }), {
  artifactSha256,
  commitSha,
  digest,
  platformManifestDigest: platformDigest,
  reference: `${repository}@${digest}`,
  repository,
  version: "9.8.7",
});
assert.throws(() => validatePublishedReleaseMetadata({ ...metadata, sourceBranch: "nightly" }), /reviewed main/);
assert.throws(() => validatePublishedReleaseMetadata({
  ...metadata,
  image: { ...metadata.image, reference: `${repository}:latest` },
}), /exact registry digest and never latest/);
assert.throws(() => validatePublishedReleaseMetadata({
  ...metadata,
  image: { ...metadata.image, nativeDependency: null },
}), /native better-sqlite3/);
assert.throws(() => validatePublishedReleaseMetadata(metadata, { expectedDigest: `sha256:${"9".repeat(64)}` }), /does not match/);

assert.deepEqual(parseCliArgs([
  "publish",
  "--artifact", "dist/app.tgz",
  "--release-metadata", "dist/base.json",
  "--repository", repository,
  "--output-metadata", "dist/release.json",
  "--output-platform-manifest", "dist/platform.json",
  "--output-build-metadata", "dist/buildx.json",
]), {
  command: "publish",
  artifact: "dist/app.tgz",
  releaseMetadata: "dist/base.json",
  repository,
  outputMetadata: "dist/release.json",
  outputPlatformManifest: "dist/platform.json",
  outputBuildMetadata: "dist/buildx.json",
});
assert.deepEqual(parseCliArgs(["verify", "--metadata", "dist/release.json", "--expected-commit", commitSha, "--expected-digest", digest]), {
  command: "verify",
  metadata: "dist/release.json",
  expectedCommit: commitSha,
  expectedDigest: digest,
});
assert.throws(() => parseCliArgs(["publish", "--repository", repository]), /--artifact is required/);

console.log("Immutable image publication regression passed.");
