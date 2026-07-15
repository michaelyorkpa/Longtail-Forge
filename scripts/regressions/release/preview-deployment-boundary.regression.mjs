export const regressionMeta = Object.freeze({
  id: "release.preview-deployment-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["bare-metal", "container", "deployment", "docker", "release"],
  description: "Proves Docker and bare-metal preview deployment stay artifact-based, persistent, non-root, health-checked, and rollback-ready.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  inspectRuntimeArtifact,
  normalizeBuildContextPath,
  parseCliArgs,
} from "../../build-container-image.mjs";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [dockerfile, dockerignore, compose, docs, envExample, service, packageJsonSource, containerSmoke, bareMetalSmoke] = await Promise.all([
  read("Dockerfile"),
  read(".dockerignore"),
  read("compose.yaml"),
  read("docs/preview-deployment.md"),
  read("docs/compose.env.example"),
  read("docs/longtail-forge.service.example"),
  read("package.json"),
  read("scripts/container-deployment-smoke.mjs"),
  read("scripts/bare-metal-deployment-smoke.mjs"),
]);
const packageJson = JSON.parse(packageJsonSource);

for (const requirement of [
  /node:24\.18\.0-bookworm-slim@sha256:[a-f0-9]{64}/,
  /ARG LTF_RUNTIME_ARTIFACT/,
  /COPY \$\{LTF_RUNTIME_ARTIFACT\} \/tmp\/longtail-forge-runtime\.tgz/,
  /npm ci --omit=dev --no-audit --no-fund/,
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
  /longtail-data:\/var\/lib\/longtail-forge/,
  /LONGTAIL_BACKUP_DIR:-\.\/backups/,
  /restart: unless-stopped/,
  /\/readyz/,
  /172\.30\.17\.1\/32/,
]) {
  assert.match(compose, requirement);
}
assert.doesNotMatch(compose, /postgres/i, "Compose must remain SQLite-only");

for (const requirement of [
  /Docker Compose is the primary reproducible path/i,
  /Caddy owns public TCP 80\/443/i,
  /Do not place the database or WAL\/SHM sidecars on NFS, SMB/i,
  /backup-first upgrade/i,
  /previous image is allowed only when rollback compatibility/i,
  /restore the verified pre-upgrade database and Files backup together/i,
  /Bare-metal installation/i,
  /npm ci --omit=dev/,
  /systemd/i,
  /absence of an engine is a failed prerequisite/i,
  /does not authorize invitations/i,
]) {
  assert.match(docs, requirement);
}
assert.match(envExample, /LONGTAIL_DOCKER_TRUST_PROXY=172\.30\.17\.1\/32/);
assert.match(envExample, /LONGTAIL_FILE_SCANNER=clamd/);
assert.match(service, /User=longtail-forge/);
assert.match(service, /WorkingDirectory=\/opt\/longtail-forge\/current/);
assert.match(service, /ExecStart=\/usr\/bin\/node server\.js/);
assert.match(service, /ProtectSystem=strict/);

assert.equal(packageJson.scripts["container:build"], "node scripts/build-container-image.mjs");
assert.equal(packageJson.scripts["container:smoke"], "node scripts/container-deployment-smoke.mjs");
assert.equal(packageJson.scripts["bare-metal:smoke"], "node scripts/bare-metal-deployment-smoke.mjs");
assert.match(containerSmoke, /--read-only/);
assert.match(containerSmoke, /10001:10001/);
assert.match(containerSmoke, /snapshotVolume/);
assert.match(containerSmoke, /restoreVolume/);
assert.match(containerSmoke, /deployment-smoke-marker/);
assert.match(bareMetalSmoke, /previousArtifact/);
assert.match(bareMetalSmoke, /backupData/);
assert.match(bareMetalSmoke, /restoredData/);

assert.deepEqual(parseCliArgs(["--tag", "ltf:test", "--artifact", "dist/example.tgz", "--no-cache", "--pull"]), {
  tag: "ltf:test",
  artifactPath: "dist/example.tgz",
  noCache: true,
  pull: true,
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
  await fs.writeFile(`${artifactPath}.sha256`, `${"0".repeat(64)}  ${path.basename(artifactPath)}\n`, "utf8");
  await assert.rejects(() => inspectRuntimeArtifact(artifactPath), /checksum verification failed/);
} finally {
  await fs.rm(fixtureDir, { recursive: true, force: true });
}

console.log("Preview deployment boundary regression passed.");
