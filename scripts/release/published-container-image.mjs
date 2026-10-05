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

/**
 * The reviewed schema-1 release metadata record, reused from the writer that
 * emits it so the published record cannot drift from it.
 * @typedef {import("./create-release-metadata.mjs").ReleaseMetadata} ReleaseMetadata
 */

/**
 * The schema-1 record as publication consumes it: the schema version is raised
 * to 2 here, and `createdAt` is carried through when the writer recorded one.
 * @typedef {Omit<ReleaseMetadata, "createdAt"> & { createdAt?: string }} PublishedReleaseBase
 */

/**
 * One descriptor inside a published image index.
 * @typedef {object} ImageIndexDescriptor
 * @property {string} digest
 * @property {string} [mediaType]
 * @property {{ os?: string, architecture?: string, variant?: string }} [platform]
 * @property {Record<string, string>} [annotations]
 */

/**
 * The registry image index reported by `buildx imagetools inspect --raw`,
 * limited to the fields this publication proof reads.
 * @typedef {object} PublishedImageIndex
 * @property {string} mediaType
 * @property {readonly ImageIndexDescriptor[]} manifests
 */

/**
 * The attestation manifest fetched for one attestation descriptor.
 * @typedef {object} AttestationManifest
 * @property {readonly { annotations?: Record<string, string> }[]} [layers]
 */

/**
 * One registry-attached attestation bound into the published release metadata.
 * @typedef {object} AttestationRecord
 * @property {string} [manifestDigest]
 * @property {string | null} [predicateType]
 */

/**
 * The SPDX SBOM and SLSA provenance attestations proven on the published digest.
 * @typedef {object} AttestationEvidence
 * @property {AttestationRecord | null} provenance
 * @property {AttestationRecord | null} sbom
 */

/**
 * The reviewed platform manifest descriptor bound into release metadata.
 * @typedef {object} PublishedPlatformDescriptor
 * @property {string} digest
 * @property {string} [mediaType]
 * @property {string} [os]
 * @property {string} [architecture]
 */

/**
 * The `docker image inspect` fields the publication proof reads.
 * @typedef {object} DockerImageInspection
 * @property {string} Os
 * @property {string} Architecture
 * @property {string} Id
 * @property {readonly string[]} [RepoDigests]
 * @property {{ Labels?: Record<string, string> }} [Config]
 */

/**
 * The labels and identities a published image must carry.
 * @typedef {object} PublishedImageExpectations
 * @property {string} artifactChecksum
 * @property {string} commitSha
 * @property {string} sourceUrl
 * @property {string} version
 */

/**
 * The published image runtime identity proven by `docker image inspect`.
 * @typedef {object} PublishedImageRuntime
 * @property {string} architecture
 * @property {string} configDigest
 * @property {string} os
 */

/**
 * The better-sqlite3 execution proof emitted by the published digest itself.
 * @typedef {object} NativeDependencyProof
 * @property {string} architecture
 * @property {string} packageVersion
 * @property {string} platform
 * @property {string} returning
 * @property {string} sqliteVersion
 */

/**
 * The native dependency proof bound into the published release metadata.
 * @typedef {object} PublishedNativeDependency
 * @property {string} architecture
 * @property {string} betterSqlite3Version
 * @property {string} execution
 * @property {string} platform
 * @property {string} sqliteVersion
 */

/**
 * The platform manifest record written beside the published release metadata.
 * @typedef {object} PublishedPlatformManifest
 * @property {number} schemaVersion
 * @property {string} application
 * @property {string} repository
 * @property {string} digest
 * @property {string} reference
 * @property {string} platform
 * @property {PublishedPlatformDescriptor} platformManifest
 * @property {string} imageConfigDigest
 * @property {PublishedNativeDependency} nativeDependency
 * @property {AttestationEvidence} attestations
 */

/**
 * The immutable image binding embedded in schema-2 release metadata.
 * @typedef {object} PublishedImageBinding
 * @property {string} repository
 * @property {string} digest
 * @property {string} reference
 * @property {string} platform
 * @property {PublishedPlatformDescriptor} platformManifest
 * @property {string} imageConfigDigest
 * @property {PublishedNativeDependency | null} nativeDependency
 * @property {AttestationEvidence | null} attestations
 */

/**
 * Schema-2 published release metadata: the reviewed schema-1 record plus the
 * immutable image binding.
 * @typedef {PublishedReleaseBase & { schemaVersion: number, image: PublishedImageBinding }} PublishedReleaseMetadata
 */

/**
 * The exact source and image identity a caller may require the published
 * release metadata to match.
 * @typedef {object} PublishedReleaseExpectations
 * @property {string} [expectedCommit]
 * @property {string} [expectedDigest]
 */

/**
 * The `--metadata-file` record buildx writes for a pushed image index.
 * @typedef {{ "containerimage.digest": string }} BuildxBuildMetadata
 */

/**
 * Options for one docker invocation.
 * @typedef {object} RunDockerOptions
 * @property {string} [cwd]
 * @property {import("node:child_process").StdioOptions} [stdio]
 */

/**
 * Options parsed from the published image command line. The required-flag loop
 * still throws when one is missing, so command-specific consumers may read the
 * flags they require as present strings.
 * @typedef {object} PublishedImageCliOptions
 * @property {string} command
 * @property {string} [artifact]
 * @property {string} [releaseMetadata]
 * @property {string} [repository]
 * @property {string} [outputMetadata]
 * @property {string} [outputPlatformManifest]
 * @property {string} [outputBuildMetadata]
 * @property {string} [metadata]
 * @property {string} [expectedCommit]
 * @property {string} [expectedDigest]
 */

/**
 * The publish command options, whose flags the CLI parser has already proven.
 * @typedef {PublishedImageCliOptions & {
 *   artifact: string,
 *   releaseMetadata: string,
 *   repository: string,
 *   outputMetadata: string,
 *   outputPlatformManifest: string,
 *   outputBuildMetadata: string,
 *   rootDir?: string,
 *   stdio?: import("node:child_process").StdioOptions,
 * }} PublishContainerImageOptions
 */

/**
 * @param {PublishContainerImageOptions} options
 */
async function publishContainerImage(options) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const artifact = await inspectRuntimeArtifact(path.resolve(rootDir, options.artifact));
  const baseMetadataPath = path.resolve(rootDir, options.releaseMetadata);
  const baseMetadata = /** @type {ReleaseMetadata} */ (JSON.parse(await fs.readFile(baseMetadataPath, "utf8")));
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

  const buildMetadata = /** @type {BuildxBuildMetadata} */ (JSON.parse(await fs.readFile(buildMetadataPath, "utf8")));
  const digest = requireDigest(buildMetadata["containerimage.digest"], "published image index");
  const reference = `${repository}@${digest}`;
  const index = /** @type {PublishedImageIndex} */ (JSON.parse(runDocker(["buildx", "imagetools", "inspect", "--raw", reference], { cwd: rootDir })));
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

/**
 * @param {string} repository
 * @param {readonly ImageIndexDescriptor[]} attestations
 * @param {string} rootDir
 * @returns {Readonly<AttestationEvidence>}
 */
function inspectAttestationEvidence(repository, attestations, rootDir) {
  /** @type {AttestationEvidence} */
  const evidence = { provenance: null, sbom: null };
  for (const descriptor of attestations) {
    const manifest = /** @type {AttestationManifest} */ (JSON.parse(runDocker([
      "buildx", "imagetools", "inspect", "--raw", `${repository}@${descriptor.digest}`,
    ], { cwd: rootDir })));
    for (const layer of manifest.layers || []) {
      const predicateType = layer.annotations?.["in-toto.io/predicate-type"] || null;
      if (predicateType === SBOM_PREDICATE) {
        evidence.sbom = Object.freeze({
          manifestDigest: descriptor.digest,
          predicateType,
        });
      } else if (PROVENANCE_PREDICATES.has(/** @type {string} */ (predicateType))) {
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

/**
 * @param {PublishedImageIndex} index
 * @returns {Readonly<{ attestations: readonly Readonly<ImageIndexDescriptor>[], platform: Readonly<ImageIndexDescriptor> }>}
 */
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

/**
 * @param {string} reference
 * @param {PublishedImageExpectations} expected
 * @param {string} rootDir
 * @returns {Readonly<PublishedImageRuntime>}
 */
function inspectPublishedImage(reference, expected, rootDir) {
  const inspected = /** @type {readonly DockerImageInspection[]} */ (JSON.parse(runDocker(["image", "inspect", reference], { cwd: rootDir })));
  const image = inspected[0];
  const labels = /** @type {Record<string, string>} */ (image?.Config?.Labels || {});
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

/**
 * @param {string} tag
 * @param {string} rootDir
 */
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

/**
 * @param {string} reference
 * @param {string} rootDir
 * @returns {Readonly<PublishedNativeDependency>}
 */
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
  const result = /** @type {NativeDependencyProof} */ (JSON.parse(runDocker([
    "run", "--rm", "--platform", supportedPlatform,
    "--entrypoint", "node", reference, "-e", proofScript,
  ], { cwd: rootDir })));
  if (result.platform !== "linux" || result.architecture !== "x64"
      || result.packageVersion !== "13.0.3" || result.returning !== "ok"
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

/**
 * @param {object} input
 * @param {AttestationEvidence} input.attestationEvidence
 * @param {string} input.digest
 * @param {PublishedImageRuntime} input.image
 * @param {ImageIndexDescriptor} input.platformDescriptor
 * @param {string} input.reference
 * @param {string} input.repository
 * @param {PublishedNativeDependency} input.nativeDependency
 * @returns {Readonly<PublishedPlatformManifest>}
 */
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

/**
 * @param {PublishedReleaseBase} baseMetadata
 * @param {PublishedImageBinding} platformManifest
 * @returns {Readonly<PublishedReleaseMetadata>}
 */
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

/**
 * @param {PublishedReleaseMetadata} metadata
 * @param {PublishedReleaseExpectations} [expected]
 */
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
      || nativeDependency?.betterSqlite3Version !== "13.0.3") {
    throw new Error("Published release metadata is missing the native better-sqlite3 digest proof.");
  }
  if (metadata.image.attestations?.sbom?.predicateType !== SBOM_PREDICATE
      || !PROVENANCE_PREDICATES.has(/** @type {string} */ (metadata.image.attestations?.provenance?.predicateType))
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

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeImageRepository(value) {
  const repository = String(value || "").trim().toLowerCase();
  if (!/^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(repository)) {
    throw new Error("Image repository must be a lowercase ghcr.io/owner/repository path without a tag or digest.");
  }
  return repository;
}

/**
 * @param {string} rootDir
 * @param {string} artifactPath
 * @returns {string}
 */
function normalizeBuildContextPath(rootDir, artifactPath) {
  const relativePath = path.relative(rootDir, artifactPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Published runtime artifact must be inside the Docker build context.");
  }
  return relativePath.replaceAll("\\", "/");
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireDigest(value, label) {
  const digest = String(value || "").toLowerCase();
  if (!DIGEST_PATTERN.test(digest)) throw new Error(`${label} must be an exact sha256 digest.`);
  return digest;
}

/**
 * @param {readonly string[]} args
 * @param {RunDockerOptions} [options]
 * @returns {string}
 */
function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: options.cwd || process.cwd(),
    encoding: options.stdio === "inherit" ? undefined : "utf8",
    stdio: options.stdio || "pipe",
  });
  if (/** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === "ENOENT") throw new Error("Docker is required to publish or verify a container image.");
  if (result.status !== 0) {
    throw new Error(`docker ${args.slice(0, 2).join(" ")} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return String(result.stdout || "").trim();
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * @param {readonly string[]} args
 * @returns {PublishedImageCliOptions}
 */
function parseCliArgs(args) {
  const command = args[0];
  if (!/^(publish|verify)$/.test(command || "")) throw new Error("First argument must be publish or verify.");
  /** @type {PublishedImageCliOptions} */
  const options = { command };
  const valueOptions = new Set(command === "publish"
    ? ["--artifact", "--release-metadata", "--repository", "--output-metadata", "--output-platform-manifest", "--output-build-metadata"]
    : ["--metadata", "--expected-commit", "--expected-digest"]);
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!valueOptions.has(arg)) throw new Error(`Unknown published-image option: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    /** @type {Record<string, string | undefined>} */ (options)[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  /** @type {readonly (keyof PublishedImageCliOptions)[]} */
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
      const result = await publishContainerImage(/** @type {PublishContainerImageOptions} */ (options));
      console.log(JSON.stringify({ ok: true, command: "publish", ...result }));
    } else {
      const metadata = /** @type {PublishedReleaseMetadata} */ (JSON.parse(await fs.readFile(path.resolve(/** @type {string} */ (options.metadata)), "utf8")));
      const result = validatePublishedReleaseMetadata(metadata, {
        expectedCommit: options.expectedCommit,
        expectedDigest: options.expectedDigest,
      });
      console.log(JSON.stringify({ ok: true, command: "verify", ...result }));
    }
  } catch (error) {
    console.error(/** @type {Error} */ (error).message);
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
