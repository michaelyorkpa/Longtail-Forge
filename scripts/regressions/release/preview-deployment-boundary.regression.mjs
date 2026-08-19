export const regressionMeta = Object.freeze({
  id: "release.preview-deployment-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["container", "deployment", "docker", "release"],
  description: "Proves the sole supported Compose path stays controlled-artifact-based, native, persistent, non-root, provenance-retained, and rollback-ready after bare-metal production support retirement.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createImageProvenance,
  inspectPinnedBaseImage,
  inspectReleaseMetadata,
  inspectRuntimeArtifact,
  normalizeBuildContextPath,
  parseCliArgs,
  supportedPlatform,
} from "../../build-container-image.mjs";

/** @param {string} filePath */
const read = (filePath) => fs.readFile(filePath, "utf8");
const [dockerfile, dockerignore, compose, docs, envExample, packageJsonSource, containerBuild, containerSmoke, workflow, selfHosting, runtimeArtifact] = await Promise.all([
  read("Dockerfile"),
  read(".dockerignore"),
  read("compose.yaml"),
  read("docs/preview-deployment.md"),
  read("docs/compose.env.example"),
  read("package.json"),
  read("scripts/build-container-image.mjs"),
  read("scripts/container-deployment-smoke.mjs"),
  read(".github/workflows/promotion.yml"),
  read("docs/self-hosting.md"),
  read("docs/runtime-artifact.md"),
]);

for (const requirement of [
  /node:24\.18\.0-bookworm-slim@sha256:[a-f0-9]{64}/,
  /FROM \$\{NODE_IMAGE\} AS runtime-build/,
  /apt-get install --yes --no-install-recommends python3 make g\+\+/,
  /ARG LTF_RUNTIME_ARTIFACT/,
  /COPY \$\{LTF_RUNTIME_ARTIFACT\} \/tmp\/longtail-forge-runtime\.tgz/,
  /npm ci --omit=dev --no-audit --no-fund/,
  /FROM \$\{NODE_IMAGE\} AS runtime/,
  /COPY --from=runtime-build \/opt\/longtail-forge \/opt\/longtail-forge/,
  /USER 10001:10001/,
  /VOLUME \["\/var\/lib\/longtail-forge", "\/var\/backups\/longtail-forge"\]/,
  /HEALTHCHECK[\s\S]*\/readyz/,
  /CMD \["node", "server\.js"\]/,
]) {
  assert.match(dockerfile, requirement);
}
assert.doesNotMatch(dockerfile, /COPY \. /, "the image must consume the runtime artifact instead of copying the repository");
assert.doesNotMatch(dockerfile, /postgres/i, "the image must not add PostgreSQL before its implementation branch");
assert.match(dockerignore, /^\*\*/m);
assert.match(dockerignore, /!dist\/\*\.tgz/);

for (const requirement of [
  /127\.0\.0\.1:\$\{LONGTAIL_HOST_PORT:-8001\}:8001/,
  /read_only: true/,
  /cap_drop:[\s\S]*- ALL/,
  /no-new-privileges:true/,
  /\/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001/,
  /longtail-data:\/var\/lib\/longtail-forge/,
  /LONGTAIL_BACKUP_DIR:-\.\/backups/,
  /LONGTAIL_WORKSPACE_BACKUP_ROOT: \/var\/backups\/longtail-forge\/workspaces/,
  /restart: \$\{LONGTAIL_RESTART_POLICY:-unless-stopped\}/,
  /\/readyz/,
  /172\.30\.17\.1\/32/,
  /LONGTAIL_CLAMD_HOST: \$\{LONGTAIL_CLAMD_HOST:-172\.30\.17\.1\}/,
  /LONGTAIL_RELEASE_BRANCH: \$\{LONGTAIL_RELEASE_BRANCH:-\}/,
  /LONGTAIL_RELEASE_COMMIT: \$\{LONGTAIL_RELEASE_COMMIT:-\}/,
  /LONGTAIL_RELEASE_ARTIFACT_SHA256: \$\{LONGTAIL_RELEASE_ARTIFACT_SHA256:-\}/,
  /preview-internal:[\s\S]*external: true/,
]) {
  assert.match(compose, requirement);
}
assert.doesNotMatch(compose, /postgres/i, "Compose must remain SQLite-only");
assert.doesNotMatch(compose, /host\.docker\.internal|host-gateway/, "the scanner handoff must use the reviewed application-network gateway");
assert.doesNotMatch(compose, /format:\s*raw/, "raw env parsing would preserve quotes from a compatible systemd environment file");

for (const requirement of [
  /Docker Compose is the sole supported production and self-hosted deployment/i,
  /Direct Node\/systemd operation remains technically possible but is unsupported/i,
  /Retired production paths/i,
  /Both current preview hosts reported native `x86_64`/i,
  /Caddy owns public TCP 80\/443/i,
  /Do not place the database or WAL\/SHM sidecars on NFS, SMB/i,
  /backup-first upgrade/i,
  /image-only rollback and is permitted only when the release record explicitly proves every migration/i,
  /restore the verified pre-upgrade database and Files together/i,
  /512 MB private tmpfs/i,
  /Direct Node\/systemd production operation has no release gate/i,
  /supported platform decision is `linux\/amd64` only/i,
  /disposable builder stage installs Python 3, `make`, and `g\+\+`/i,
  /final stage copies only the root-owned read-only installed application tree/i,
  /registry-attached SPDX SBOM and SLSA provenance/i,
  /absence of an engine, an unsupported architecture, or emulation-only execution is a failed prerequisite/i,
  /does not authorize invitations/i,
]) {
  assert.match(docs, requirement);
}
assert.match(selfHosting, /Docker Compose on `linux\/amd64` is the sole supported production\/self-hosted path/);
assert.match(runtimeArtifact, /artifact is not a supported production installer/);
assert.match(envExample, /LONGTAIL_DOCKER_TRUST_PROXY=172\.30\.17\.1\/32/);
assert.match(envExample, /LONGTAIL_FILE_SCANNER=clamd/);
assert.match(envExample, /LONGTAIL_CLAMD_HOST=172\.30\.17\.1/);
assert.equal(JSON.parse(packageJsonSource).scripts["bare-metal:smoke"], undefined);

assert.match(containerSmoke, /--read-only/);
assert.match(containerSmoke, /\/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001/);
assert.match(containerSmoke, /assertNativePlatform\(\)/);
assert.match(containerSmoke, /releaseMetadataPath: args\.releaseMetadata/);
assert.match(containerSmoke, /10001:10001/);
assert.match(containerSmoke, /nativeBinding[\s\S]*linux-x64/);
assert.match(containerSmoke, /the final runtime image should contain neither the native build toolchain nor repository development dependencies/);
assert.match(containerSmoke, /compose\(\["config", "--quiet"\]\)/);
assert.match(containerSmoke, /createSmokeNetwork\(\)/);
assert.match(containerSmoke, /"network", "create"/);
assert.match(containerSmoke, /compose\(\["up", "-d", "--no-deps", "--force-recreate", "longtail-forge"\]\)/);
assert.match(containerSmoke, /candidate\.image, dataVolume, `missing-\$\{scannerContainer\}`/);
assert.match(containerSmoke, /LONGTAIL_CLAMD_HOST=missing-/);
assert.match(containerSmoke, /state\.Restarting === true && state\.ExitCode !== 0/);
assert.match(containerSmoke, /createBackup\(previous\.image, dataVolume\)/);
assert.match(containerSmoke, /inspectBackup\(previous\.image, dataVolume\)/);
assert.match(containerSmoke, /restoreBackup\(previous\.image, recoveryVolume\)/);
assert.match(containerSmoke, /normalizeRestoredVolumePermissions\(previous\.image, recoveryVolume\)/);
assert.match(containerSmoke, /the generated local tag must resolve to the reviewed image ID/);
assert.match(containerSmoke, /RESTORE LONGTAIL FORGE BACKUP/);
assert.match(containerSmoke, /pre-restore-clean\.ltfbackup\.tgz/);
assert.match(containerSmoke, /verifyMaintenanceCurtain/);
assert.match(containerSmoke, /longtail_maintenance_curtain/);
assert.match(containerSmoke, /longtail_unavailable_diagnostic/);
assert.match(containerSmoke, /spawnSync\("caddy", \["validate"/);
assert.match(containerSmoke, /spawn\("caddy", \["run"/);
assert.match(containerSmoke, /exerciseWorkflow/);
assert.match(containerSmoke, /uploadRepresentativeFile/);
assert.match(containerSmoke, /verifyWorkflow/);
assert.match(containerSmoke, /\/api\/files\/upload/);
assert.match(containerSmoke, /\/download/);
assert.match(containerSmoke, /verifyDatabaseIntegrity/);
assert.match(containerSmoke, /integrity_check/);
assert.match(containerSmoke, /foreign_key_check/);
assert.match(containerSmoke, /waitForJson\(port, "\/healthz"\)/);
assert.match(containerSmoke, /\/api\/login/);
assert.match(containerSmoke, /const backupVolume = `ltf-smoke-backup-\$\{token\}`/);
assert.match(containerSmoke, /const recoveryVolume = `ltf-smoke-recovery-\$\{token\}`/);
assert.match(containerSmoke, /for \(const volume of \[dataVolume, backupVolume, recoveryVolume\]\)/);
assert.match(containerSmoke, /finally \{[\s\S]*cleanupDockerObjects\(\);[\s\S]*\}/);
assert.doesNotMatch(containerSmoke, /snapshotVolume|restoreVolume|cp -a \/source/);
assert.match(containerBuild, /"--platform", supportedPlatform/);
assert.match(containerBuild, /com\.longtailforge\.runtime-artifact\.sha256/);
assert.match(containerBuild, /org\.opencontainers\.image\.revision/);
assert.match(containerBuild, /createImageProvenance/);
assert.match(containerBuild, /status: "registry-publication-only"/);
assert.match(workflow, /--release-metadata dist\/release-metadata\.json/);
assert.match(workflow, /container-provenance-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
assert.match(workflow, /retention-days: 30/);

assert.deepEqual(parseCliArgs(["--tag", "ltf:test", "--artifact", "dist/example.tgz", "--release-metadata", "dist/release-metadata.json", "--provenance-output", "dist/provenance.json", "--no-cache", "--pull"]), {
  tag: "ltf:test",
  artifactPath: "dist/example.tgz",
  releaseMetadataPath: "dist/release-metadata.json",
  provenanceOutput: "dist/provenance.json",
  noCache: true,
  pull: true,
});
assert.throws(() => parseCliArgs(["--release-metadata"]), /requires a value/);
assert.equal(supportedPlatform, "linux/amd64");
assert.deepEqual(await inspectPinnedBaseImage(process.cwd()), {
  digest: "sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5",
  reference: "node:24.18.0-bookworm-slim",
});
assert.equal(normalizeBuildContextPath(process.cwd(), path.join(process.cwd(), "dist", "example.tgz")), "dist/example.tgz");
assert.throws(() => normalizeBuildContextPath(process.cwd(), path.resolve(process.cwd(), "..", "example.tgz")), /inside the repository Docker build context/);

const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-container-artifact-fixture-"));
try {
  const artifactPath = path.join(fixtureDir, "longtail-forge-9.8.7.tgz");
  const bytes = Buffer.from("fixture artifact");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(artifactPath, bytes);
  await fs.writeFile(`${artifactPath}.sha256`, `${checksum}  ${path.basename(artifactPath)}\n`, "utf8");
  const inspected = await inspectRuntimeArtifact(artifactPath);
  assert.equal(inspected.version, "9.8.7");
  assert.equal(inspected.checksum, checksum);
  const metadataPath = path.join(fixtureDir, "release-metadata.json");
  const commitSha = "a".repeat(40);
  await fs.writeFile(metadataPath, `${JSON.stringify({
    application: "longtail-forge",
    artifact: { filename: path.basename(artifactPath), sha256: checksum },
    commitSha,
    schemaVersion: 1,
    sourceBranch: "main",
    version: "9.8.7",
  })}\n`, "utf8");
  assert.deepEqual(await inspectReleaseMetadata(metadataPath, inspected), {
    commitSha,
    sourceBranch: "main",
  });
  const provenance = createImageProvenance({
    artifact: inspected,
    baseImage: { digest: `sha256:${"b".repeat(64)}`, reference: "node:test" },
    commitSha,
    image: {
      architecture: "amd64",
      digest: `sha256:${"c".repeat(64)}`,
      labels: { "org.opencontainers.image.version": "9.8.7" },
      os: "linux",
    },
    sourceBranch: "main",
    tag: "longtail-forge:9.8.7",
  });
  assert.equal(provenance.image.platform, "linux/amd64");
  assert.equal(provenance.runtimeArtifact.sha256, checksum);
  assert.equal(provenance.sbom.status, "registry-publication-only");
  await fs.writeFile(`${artifactPath}.sha256`, `${"0".repeat(64)}  ${path.basename(artifactPath)}\n`, "utf8");
  await assert.rejects(() => inspectRuntimeArtifact(artifactPath), /checksum verification failed/);
} finally {
  await fs.rm(fixtureDir, { recursive: true, force: true });
}

console.log("Preview deployment boundary regression passed.");
