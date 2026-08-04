#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectReleaseMetadata,
  inspectRuntimeArtifact,
  supportedPlatform,
} from "../build-container-image.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const IMAGE_INDEX_MEDIA_TYPES = new Set([
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.index.v1+json",
]);
const ATTESTATION_TYPE = "attestation-manifest";
const SBOM_PREDICATE = "https://spdx.dev/Document";
const PROVENANCE_PREDICATES = new Set([
  "https://slsa.dev/provenance/v0.2",
  "https://slsa.dev/provenance/v1",
]);

async function publishContainerImage(options) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const artifact = await inspectRuntimeArtifact(path.resolve(rootDir, options.artifact));
  const baseMetadataPath = path.resolve(rootDir, options.releaseMetadata);
  const baseMetadata = JSON.parse(await fs.readFile(baseMetadataPath, "utf8"));
  const releaseIdentity = await inspectReleaseMetadata(baseMetadataPath, artifact);
  if (releaseIdentity.sourceBranch !== "main" || baseMetadata.channel !== "main") {
    throw new Error("Published release images require exact protected main release metadata.");
  }

  const repository = normalizeImageRepository(options.repository);
  const tag = `${repository}:sha-${releaseIdentity.commitSha}`;
  const sourceUrl = `https://github.com/${repository.slice("ghcr.io/".length)}`;
  ensurePublicationTagAbsent(tag, rootDir);
  const buildMetadataPath = path.resolve(rootDir, options.outputBuildMetadata);
  await fs.mkdir(path.dirname(buildMetadataPath), { recursive: true });

  const buildArgs = [
    "buildx", "build",
    "--platform", supportedPlatform,
    "--file", "Dockerfile",
    "--build-arg", `LTF_RUNTIME_ARTIFACT=${normalizeBuildContextPath(rootDir, artifact.path)}`,
    "--build-arg", `LTF_APP_VERSION=${artifact.version}`,
    "--label", `org.opencontainers.image.version=${artifact.version}`,
    "--label", `org.opencontainers.image.revision=${releaseIdentity.commitSha}`,
    "--label", `org.opencontainers.image.source=${sourceUrl}`,
    "--label", "com.longtailforge.source-branch=main",
    "--label", `com.longtailforge.runtime-artifact.sha256=${artifact.checksum}`,
    "--label", `com.longtailforge.image.platform=${supportedPlatform}`,
    "--tag", tag,
    "--provenance=mode=max",
    "--sbom=true",
    "--metadata-file", buildMetadataPath,
    "--push",
    ".",
  ];
  runDocker(buildArgs, { cwd: rootDir, stdio: options.stdio || "inherit" });

  const buildMetadata = JSON.parse(await fs.readFile(buildMetadataPath, "utf8"));
  const digest = requireDigest(buildMetadata["containerimage.digest"], "published image index");
  const reference = `${repository}@${digest}`;
  const index = JSON.parse(runDocker(["buildx", "imagetools", "inspect", "--raw", reference], { cwd: rootDir }));
  const descriptors = selectPublishedDescriptors(index);
  const attestationEvidence = inspectAttestationEvidence(repository, descriptors.attestations, rootDir);

  runDocker(["pull", "--platform", supportedPlatform, reference], { cwd: rootDir, stdio: options.stdio || "inherit" });
  const image = inspectPublishedImage(reference, {
    artifactChecksum: artifact.checksum,
    commitSha: releaseIdentity.commitSha,
    sourceUrl,
    version: artifact.version,
  }, rootDir);
  const nativeDependency = inspectNativeDependency(reference, rootDir);
  const platformManifest = createPlatformManifest({
    attestationEvidence,
    digest,
    image,
    platformDescriptor: descriptors.platform,
    reference,
    repository,
    nativeDependency,
  });
  const publishedMetadata = createPublishedReleaseMetadata(baseMetadata, platformManifest);
  validatePublishedReleaseMetadata(publishedMetadata, {
    expectedCommit: releaseIdentity.commitSha,
    expectedDigest: digest,
  });

  const outputMetadataPath = path.resolve(rootDir, options.outputMetadata);
  const outputManifestPath = path.resolve(rootDir, options.outputPlatformManifest);
  await Promise.all([
    writeJson(outputMetadataPath, publishedMetadata),
    writeJson(outputManifestPath, platformManifest),
  ]);
  return Object.freeze({
    digest,
    metadataPath: outputMetadataPath,
    platformManifestDigest: descriptors.platform.digest,
    platformManifestPath: outputManifestPath,
    reference,
    tag,
  });
}

function inspectAttestationEvidence(repository, attestations, rootDir) {
  const evidence = { provenance: null, sbom: null };
  for (const descriptor of attestations) {
    const manifest = JSON.parse(runDocker([
      "buildx", "imagetools", "inspect", "--raw", `${repository}@${descriptor.digest}`,
    ], { cwd: rootDir }));
    for (const layer of manifest.layers || []) {
      const predicateType = layer.annotations?.["in-toto.io/predicate-type"] || null;
      if (predicateType === SBOM_PREDICATE) {
        evidence.sbom = Object.freeze({
          manifestDigest: descriptor.digest,
          predicateType,
        });
      } else if (PROVENANCE_PREDICATES.has(predicateType)) {
        evidence.provenance = Object.freeze({
          manifestDigest: descriptor.digest,
          predicateType,
        });
      }
    }
  }
  if (!evidence.sbom || !evidence.provenance) {
    throw new Error("Published image must retain registry-attached SPDX SBOM and SLSA provenance attestations.");
  }
  return Object.freeze(evidence);
}

function selectPublishedDescriptors(index) {
  if (!IMAGE_INDEX_MEDIA_TYPES.has(index?.mediaType) || !Array.isArray(index.manifests)) {
    throw new Error("Published image must be an OCI/Docker index containing one reviewed platform and its attestations.");
  }
  const platformDescriptors = [];
  const attestations = [];
  for (const descriptor of index.manifests) {
    requireDigest(descriptor?.digest, "image index descriptor");
    const isAttestation = descriptor.annotations?.["vnd.docker.reference.type"] === ATTESTATION_TYPE
      || descriptor.platform?.os === "unknown";
    if (isAttestation) {
      attestations.push(Object.freeze({ ...descriptor }));
      continue;
    }
    platformDescriptors.push(descriptor);
  }
  if (platformDescriptors.length !== 1
      || platformDescriptors[0].platform?.os !== "linux"
      || platformDescriptors[0].platform?.architecture !== "amd64"
      || platformDescriptors[0].platform?.variant) {
    throw new Error("Published image index must contain exactly the reviewed linux/amd64 platform manifest.");
  }
  if (attestations.length === 0) {
    throw new Error("Published image index is missing registry-attached attestations.");
  }
  return Object.freeze({
    attestations: Object.freeze(attestations),
    platform: Object.freeze({ ...platformDescriptors[0] }),
  });
}

function inspectPublishedImage(reference, expected, rootDir) {
  const inspected = JSON.parse(runDocker(["image", "inspect", reference], { cwd: rootDir }));
  const image = inspected[0];
  const labels = image?.Config?.Labels || {};
  if (!image || image.Os !== "linux" || image.Architecture !== "amd64") {
    throw new Error(`Published image runtime must execute natively as ${supportedPlatform}.`);
  }
  if (labels["org.opencontainers.image.version"] !== expected.version
      || labels["org.opencontainers.image.revision"] !== expected.commitSha
      || labels["org.opencontainers.image.source"] !== expected.sourceUrl
      || labels["org.opencontainers.image.licenses"] !== "AGPL-3.0-only"
      || labels["com.longtailforge.source-branch"] !== "main"
      || labels["com.longtailforge.runtime-artifact.sha256"] !== expected.artifactChecksum
      || labels["com.longtailforge.image.platform"] !== supportedPlatform) {
    throw new Error("Published image labels do not match the reviewed main source, artifact, version, license, and platform.");
  }
  if (!(image.RepoDigests || []).includes(reference)) {
    throw new Error("Pulled image does not retain the selected immutable registry digest.");
  }
  return Object.freeze({
    architecture: image.Architecture,
    configDigest: requireDigest(image.Id, "published image config"),
    os: image.Os,
  });
}

function ensurePublicationTagAbsent(tag, rootDir) {
  const result = spawnSync("docker", ["buildx", "imagetools", "inspect", tag], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status === 0) {
    throw new Error(`Immutable publication tag already exists and will not be replaced: ${tag}`);
  }
  const diagnostic = String(result.stderr || result.stdout || result.error || "");
  if (!/not found|manifest unknown|no such manifest/i.test(diagnostic)) {
    throw new Error(`Unable to prove publication tag absence: ${diagnostic.trim()}`);
  }
}

function inspectNativeDependency(reference, rootDir) {
  const proofScript = [
    "const Database=require('better-sqlite3');",
    "const packageVersion=require('better-sqlite3/package.json').version;",
    "const db=new Database(':memory:');",
    "const sqliteVersion=db.prepare('SELECT sqlite_version() AS version').get().version;",
    "const returning=db.prepare('CREATE TABLE proof(id INTEGER PRIMARY KEY, value TEXT)').run();",
    "const row=db.prepare(\"INSERT INTO proof(value) VALUES ('ok') RETURNING value\").get();",
    "db.close();",
    "process.stdout.write(JSON.stringify({architecture:process.arch,packageVersion,platform:process.platform,returning:row.value,sqliteVersion}));",
  ].join("");
  const result = JSON.parse(runDocker([
    "run", "--rm", "--platform", supportedPlatform,
    "--entrypoint", "node", reference, "-e", proofScript,
  ], { cwd: rootDir }));
  if (result.platform !== "linux" || result.architecture !== "x64"
      || result.packageVersion !== "13.0.1" || result.returning !== "ok"
      || !/^\d+\.\d+\.\d+$/.test(result.sqliteVersion || "")) {
    throw new Error("Published digest failed the native better-sqlite3 linux/amd64 execution proof.");
  }
  return Object.freeze({
    architecture: result.architecture,
    betterSqlite3Version: result.packageVersion,
    execution: "published-digest",
    platform: result.platform,
    sqliteVersion: result.sqliteVersion,
  });
}

function createPlatformManifest({ attestationEvidence, digest, image, platformDescriptor, reference, repository, nativeDependency }) {
  return Object.freeze({
    schemaVersion: 1,
    application: "longtail-forge",
    repository,
    digest,
    reference,
    platform: supportedPlatform,
    platformManifest: {
      digest: platformDescriptor.digest,
      mediaType: platformDescriptor.mediaType,
      os: "linux",
      architecture: "amd64",
    },
    imageConfigDigest: image.configDigest,
    nativeDependency,
    attestations: attestationEvidence,
  });
}

function createPublishedReleaseMetadata(baseMetadata, platformManifest) {
  return Object.freeze({
    ...baseMetadata,
    schemaVersion: 2,
    image: {
      repository: platformManifest.repository,
      digest: platformManifest.digest,
      reference: platformManifest.reference,
      platform: platformManifest.platform,
      platformManifest: platformManifest.platformManifest,
      imageConfigDigest: platformManifest.imageConfigDigest,
      nativeDependency: platformManifest.nativeDependency,
      attestations: platformManifest.attestations,
    },
  });
}

function validatePublishedReleaseMetadata(metadata, expected = {}) {
  if (metadata?.schemaVersion !== 2 || metadata.application !== "longtail-forge") {
    throw new Error("Published release metadata must use Longtail Forge schema version 2.");
  }
  if (metadata.channel !== "main" || metadata.sourceBranch !== "main") {
    throw new Error("Published images require reviewed main release metadata.");
  }
  if (!COMMIT_PATTERN.test(metadata.commitSha || "")
      || !/^[a-f0-9]{64}$/.test(metadata.artifact?.sha256 || "")) {
    throw new Error("Published release metadata is missing exact source and runtime-artifact identities.");
  }
  const repository = normalizeImageRepository(metadata.image?.repository);
  const digest = requireDigest(metadata.image?.digest, "published release image");
  if (metadata.image.reference !== `${repository}@${digest}` || /:latest(?:@|$)/i.test(metadata.image.reference)) {
    throw new Error("Published release image must use its exact registry digest and never latest.");
  }
  const platformManifest = metadata.image.platformManifest;
  if (metadata.image.platform !== supportedPlatform
      || platformManifest?.os !== "linux"
      || platformManifest?.architecture !== "amd64"
      || !DIGEST_PATTERN.test(platformManifest?.digest || "")) {
    throw new Error("Published release metadata must bind the reviewed linux/amd64 platform manifest.");
  }
  const nativeDependency = metadata.image.nativeDependency;
  if (nativeDependency?.execution !== "published-digest"
      || nativeDependency?.platform !== "linux"
      || nativeDependency?.architecture !== "x64"
      || nativeDependency?.betterSqlite3Version !== "13.0.1") {
    throw new Error("Published release metadata is missing the native better-sqlite3 digest proof.");
  }
  if (metadata.image.attestations?.sbom?.predicateType !== SBOM_PREDICATE
      || !PROVENANCE_PREDICATES.has(metadata.image.attestations?.provenance?.predicateType)
      || !DIGEST_PATTERN.test(metadata.image.attestations?.sbom?.manifestDigest || "")
      || !DIGEST_PATTERN.test(metadata.image.attestations?.provenance?.manifestDigest || "")) {
    throw new Error("Published release metadata must bind registry-attached SBOM and provenance attestations.");
  }
  if (expected.expectedCommit && metadata.commitSha !== expected.expectedCommit.toLowerCase()) {
    throw new Error("Published release metadata commit does not match the selected main revision.");
  }
  if (expected.expectedDigest && digest !== expected.expectedDigest.toLowerCase()) {
    throw new Error("Published release metadata digest does not match the selected immutable image.");
  }
  return Object.freeze({
    artifactSha256: metadata.artifact.sha256,
    commitSha: metadata.commitSha,
    digest,
    platformManifestDigest: platformManifest.digest,
    reference: metadata.image.reference,
    repository,
    version: metadata.version,
  });
}

function normalizeImageRepository(value) {
  const repository = String(value || "").trim().toLowerCase();
  if (!/^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(repository)) {
    throw new Error("Image repository must be a lowercase ghcr.io/owner/repository path without a tag or digest.");
  }
  return repository;
}

function normalizeBuildContextPath(rootDir, artifactPath) {
  const relativePath = path.relative(rootDir, artifactPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Published runtime artifact must be inside the Docker build context.");
  }
  return relativePath.replaceAll("\\", "/");
}

function requireDigest(value, label) {
  const digest = String(value || "").toLowerCase();
  if (!DIGEST_PATTERN.test(digest)) throw new Error(`${label} must be an exact sha256 digest.`);
  return digest;
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: options.cwd || process.cwd(),
    encoding: options.stdio === "inherit" ? undefined : "utf8",
    stdio: options.stdio || "pipe",
  });
  if (result.error?.code === "ENOENT") throw new Error("Docker is required to publish or verify a container image.");
  if (result.status !== 0) {
    throw new Error(`docker ${args.slice(0, 2).join(" ")} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return String(result.stdout || "").trim();
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseCliArgs(args) {
  const command = args[0];
  if (!/^(publish|verify)$/.test(command || "")) throw new Error("First argument must be publish or verify.");
  const options = { command };
  const valueOptions = new Set(command === "publish"
    ? ["--artifact", "--release-metadata", "--repository", "--output-metadata", "--output-platform-manifest", "--output-build-metadata"]
    : ["--metadata", "--expected-commit", "--expected-digest"]);
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!valueOptions.has(arg)) throw new Error(`Unknown published-image option: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  const required = command === "publish"
    ? ["artifact", "releaseMetadata", "repository", "outputMetadata", "outputPlatformManifest", "outputBuildMetadata"]
    : ["metadata"];
  for (const key of required) if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  if (options.expectedCommit && !COMMIT_PATTERN.test(options.expectedCommit)) throw new Error("--expected-commit must be a full lowercase commit SHA.");
  if (options.expectedDigest && !DIGEST_PATTERN.test(options.expectedDigest)) throw new Error("--expected-digest must be an exact lowercase sha256 digest.");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.command === "publish") {
      const result = await publishContainerImage(options);
      console.log(JSON.stringify({ ok: true, command: "publish", ...result }));
    } else {
      const metadata = JSON.parse(await fs.readFile(path.resolve(options.metadata), "utf8"));
      const result = validatePublishedReleaseMetadata(metadata, {
        expectedCommit: options.expectedCommit,
        expectedDigest: options.expectedDigest,
      });
      console.log(JSON.stringify({ ok: true, command: "verify", ...result }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export {
  PROVENANCE_PREDICATES,
  SBOM_PREDICATE,
  createPlatformManifest,
  createPublishedReleaseMetadata,
  ensurePublicationTagAbsent,
  normalizeImageRepository,
  parseCliArgs,
  publishContainerImage,
  selectPublishedDescriptors,
  validatePublishedReleaseMetadata,
};
