import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeArtifact } from "./build-runtime-artifact.mjs";
import { normalizeReleaseBranch } from "../src/core/version.js";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const supportedPlatform = "linux/amd64";

/**
 * Options accepted by the container image build entry point and produced by its CLI parser.
 * @typedef {object} ContainerBuildOptions
 * @property {string} [rootDir]
 * @property {string} [artifactPath]
 * @property {string} [releaseMetadataPath]
 * @property {string} [provenanceOutput]
 * @property {string} [tag]
 * @property {boolean} [pull]
 * @property {boolean} [noCache]
 * @property {import("node:child_process").StdioOptions} [stdio]
 */

/**
 * Options forwarded to a single `docker` invocation.
 * @typedef {object} DockerCommandOptions
 * @property {string} [cwd]
 * @property {import("node:child_process").StdioOptions} [stdio]
 */

/**
 * The runtime artifact payload a container image is built around.
 * @typedef {object} RuntimeArtifactDescriptor
 * @property {string} checksum
 * @property {string} path
 * @property {string | null} sourceBranch
 * @property {string} version
 */

/**
 * The release metadata document fields this build reads.
 * @typedef {object} ReleaseMetadataDocument
 * @property {number} schemaVersion
 * @property {string} application
 * @property {string} version
 * @property {{ filename: string, sha256: string } | undefined} artifact
 * @property {string} commitSha
 * @property {string} sourceBranch
 */

/**
 * The reviewed release identity bound into the built image labels.
 * @typedef {object} ReleaseMetadataIdentity
 * @property {string} commitSha
 * @property {string} sourceBranch
 */

/**
 * The immutable base image digest the Dockerfile pins.
 * @typedef {object} BaseImageIdentity
 * @property {string} digest
 * @property {string} reference
 */

/**
 * The `docker image inspect` record fields this build reads.
 * @typedef {object} DockerImageInspectRecord
 * @property {string} Architecture
 * @property {{ Labels: Record<string, string> | undefined } | undefined} Config
 * @property {string} Id
 * @property {string} Os
 */

/**
 * The reviewed identity the built image labels and digest must match.
 * @typedef {object} ExpectedImageIdentity
 * @property {string} artifactChecksum
 * @property {string | null} commitSha
 * @property {string | null} sourceBranch
 * @property {string} version
 */

/**
 * The verified identity of the locally built container image.
 * @typedef {object} BuiltImageIdentity
 * @property {string} architecture
 * @property {string} digest
 * @property {Record<string, string>} labels
 * @property {string} os
 */

/**
 * The inputs the image provenance document is derived from.
 * @typedef {object} ImageProvenanceInput
 * @property {RuntimeArtifactDescriptor} artifact
 * @property {BaseImageIdentity} baseImage
 * @property {string | null} commitSha
 * @property {BuiltImageIdentity} image
 * @property {string | null} sourceBranch
 * @property {string} tag
 */

/**
 * The published outcome of a container image build.
 * @typedef {object} ContainerImageBuildResult
 * @property {string} artifactPath
 * @property {string} checksum
 * @property {string} image
 * @property {string} imageDigest
 * @property {string} platform
 * @property {string} provenancePath
 * @property {string} version
 */

/**
 * @param {ContainerBuildOptions} [options]
 * @returns {Promise<ContainerImageBuildResult>}
 */
async function buildContainerImage(options = {}) {
  const rootDir = path.resolve(options.rootDir || defaultRoot);
  const artifact = options.artifactPath
    ? await inspectRuntimeArtifact(path.resolve(rootDir, options.artifactPath))
    : await buildCurrentArtifact(rootDir);
  const releaseMetadata = options.releaseMetadataPath
    ? await inspectReleaseMetadata(path.resolve(rootDir, options.releaseMetadataPath), artifact)
    : null;
  const relativeArtifactPath = normalizeBuildContextPath(rootDir, artifact.path);
  const tag = String(options.tag || `longtail-forge:${artifact.version}`).trim();
  if (!tag) {
    throw new Error("A non-empty container image tag is required.");
  }

  const args = [
    "build",
    "--platform", supportedPlatform,
    "--file", "Dockerfile",
    "--build-arg", `LTF_RUNTIME_ARTIFACT=${relativeArtifactPath}`,
    "--build-arg", `LTF_APP_VERSION=${artifact.version}`,
    "--label", `org.opencontainers.image.version=${artifact.version}`,
    "--label", `com.longtailforge.runtime-artifact.sha256=${artifact.checksum}`,
    "--label", `com.longtailforge.image.platform=${supportedPlatform}`,
    "--tag", tag,
  ];
  const sourceBranch = releaseMetadata?.sourceBranch || artifact.sourceBranch || null;
  const commitSha = releaseMetadata?.commitSha || null;
  if (sourceBranch) {
    args.push("--label", `com.longtailforge.source-branch=${sourceBranch}`);
  }
  if (commitSha) {
    args.push("--label", `org.opencontainers.image.revision=${commitSha}`);
  }
  if (options.pull) {
    args.push("--pull");
  }
  if (options.noCache) {
    args.push("--no-cache");
  }
  args.push(".");
  runDocker(args, { cwd: rootDir, stdio: options.stdio || "inherit" });

  const image = inspectBuiltImage(tag, {
    artifactChecksum: artifact.checksum,
    commitSha,
    sourceBranch,
    version: artifact.version,
  });
  const baseImage = await inspectPinnedBaseImage(rootDir);
  const provenancePath = path.resolve(
    rootDir,
    options.provenanceOutput
      || path.join(path.dirname(path.relative(rootDir, artifact.path)), `${path.basename(artifact.path, ".tgz")}-image-provenance.json`),
  );
  const provenance = createImageProvenance({
    artifact,
    baseImage,
    commitSha,
    image,
    sourceBranch,
    tag,
  });
  await fs.mkdir(path.dirname(provenancePath), { recursive: true });
  await fs.writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  return Object.freeze({
    artifactPath: artifact.path,
    checksum: artifact.checksum,
    image: tag,
    imageDigest: image.digest,
    platform: supportedPlatform,
    provenancePath,
    version: artifact.version,
  });
}

/**
 * @param {string} rootDir
 * @returns {Promise<RuntimeArtifactDescriptor>}
 */
async function buildCurrentArtifact(rootDir) {
  const result = await buildRuntimeArtifact({ rootDir, outputDir: "dist" });
  return {
    checksum: result.checksum,
    path: result.artifactPath,
    sourceBranch: result.manifest.sourceBranch,
    version: result.version,
  };
}

/**
 * @param {string} artifactPath
 * @returns {Promise<RuntimeArtifactDescriptor>}
 */
async function inspectRuntimeArtifact(artifactPath) {
  const match = path.basename(artifactPath).match(/^longtail-forge-(.+)\.tgz$/);
  if (!match) {
    throw new Error("Runtime artifact filename must be longtail-forge-<version>.tgz.");
  }
  const checksumPath = `${artifactPath}.sha256`;
  const [artifactBytes, checksumSource] = await Promise.all([
    fs.readFile(artifactPath),
    fs.readFile(checksumPath, "utf8"),
  ]);
  const checksum = createHash("sha256").update(artifactBytes).digest("hex");
  const checksumParts = checksumSource.trim().split(/\s+/);
  if (checksumParts[0] !== checksum || checksumParts.at(-1) !== path.basename(artifactPath)) {
    throw new Error(`Runtime artifact checksum verification failed for ${artifactPath}.`);
  }
  return { checksum, path: artifactPath, sourceBranch: null, version: match[1] };
}

/**
 * @param {string} metadataPath
 * @param {RuntimeArtifactDescriptor} artifact
 * @returns {Promise<ReleaseMetadataIdentity>}
 */
async function inspectReleaseMetadata(metadataPath, artifact) {
  const metadata = /** @type {ReleaseMetadataDocument} */ (JSON.parse(await fs.readFile(metadataPath, "utf8")));
  if (metadata.schemaVersion !== 1 || metadata.application !== "longtail-forge") {
    throw new Error("Release metadata must use the Longtail Forge schema version 1 contract.");
  }
  if (metadata.version !== artifact.version) {
    throw new Error("Release metadata version does not match the runtime artifact.");
  }
  if (metadata.artifact?.filename !== path.basename(artifact.path)
      || metadata.artifact?.sha256 !== artifact.checksum) {
    throw new Error("Release metadata artifact identity does not match the runtime artifact.");
  }
  if (!/^[a-f0-9]{40}$/.test(metadata.commitSha || "")) {
    throw new Error("Release metadata commit must be a full lowercase SHA.");
  }
  return Object.freeze({
    commitSha: metadata.commitSha,
    sourceBranch: normalizeReleaseBranch(metadata.sourceBranch, { required: true }),
  });
}

/**
 * @param {string} rootDir
 * @returns {Promise<BaseImageIdentity>}
 */
async function inspectPinnedBaseImage(rootDir) {
  const dockerfile = await fs.readFile(path.join(rootDir, "Dockerfile"), "utf8");
  const match = dockerfile.match(/^ARG NODE_IMAGE=([^\s@]+)@(sha256:[a-f0-9]{64})$/m);
  if (!match) {
    throw new Error("Dockerfile must pin NODE_IMAGE to an exact sha256 digest.");
  }
  return Object.freeze({ digest: match[2], reference: match[1] });
}

/**
 * @param {string} tag
 * @param {ExpectedImageIdentity} expected
 * @returns {BuiltImageIdentity}
 */
function inspectBuiltImage(tag, expected) {
  const inspected = /** @type {DockerImageInspectRecord[]} */ (JSON.parse(runDocker(["image", "inspect", tag])));
  const image = inspected[0];
  if (!image || image.Os !== "linux" || image.Architecture !== "amd64") {
    throw new Error(`Built image platform must be ${supportedPlatform}.`);
  }
  const labels = /** @type {Record<string, string>} */ (image.Config?.Labels || {});
  if (labels["org.opencontainers.image.version"] !== expected.version
      || labels["org.opencontainers.image.licenses"] !== "AGPL-3.0-only"
      || labels["com.longtailforge.runtime-artifact.sha256"] !== expected.artifactChecksum
      || labels["com.longtailforge.image.platform"] !== supportedPlatform) {
    throw new Error("Built image labels do not match the reviewed version, license, payload, and platform contract.");
  }
  if (expected.sourceBranch && labels["com.longtailforge.source-branch"] !== expected.sourceBranch) {
    throw new Error("Built image source-branch label does not match release metadata.");
  }
  if (expected.commitSha && labels["org.opencontainers.image.revision"] !== expected.commitSha) {
    throw new Error("Built image revision label does not match release metadata.");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(image.Id || "")) {
    throw new Error("Built image did not report a content-addressed image digest.");
  }
  return Object.freeze({
    architecture: image.Architecture,
    digest: image.Id,
    labels: Object.freeze({ ...labels }),
    os: image.Os,
  });
}

/**
 * @param {ImageProvenanceInput} provenanceInput
 */
function createImageProvenance({ artifact, baseImage, commitSha, image, sourceBranch, tag }) {
  return Object.freeze({
    schemaVersion: 1,
    application: "longtail-forge",
    version: artifact.version,
    sourceBranch,
    commitSha,
    runtimeArtifact: {
      filename: path.basename(artifact.path),
      sha256: artifact.checksum,
    },
    baseImage,
    image: {
      tag,
      digest: image.digest,
      platform: supportedPlatform,
      os: image.os,
      architecture: image.architecture,
    },
    labels: image.labels,
    sbom: {
      status: "registry-publication-only",
      publicationCommand: "npm run image:publish",
      reason: "Release publication attaches SPDX SBOM and SLSA provenance attestations to the immutable registry digest; a local-build document is not release evidence.",
    },
  });
}

/**
 * @param {string} rootDir
 * @param {string} artifactPath
 * @returns {string}
 */
function normalizeBuildContextPath(rootDir, artifactPath) {
  const relativePath = path.relative(rootDir, artifactPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("The runtime artifact must be inside the repository Docker build context.");
  }
  return relativePath.replaceAll("\\", "/");
}

/**
 * @param {string[]} args
 * @param {DockerCommandOptions} [options]
 * @returns {string}
 */
function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: options.cwd || defaultRoot,
    encoding: options.stdio === "inherit" ? undefined : "utf8",
    stdio: options.stdio || "pipe",
  });
  if (/** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === "ENOENT") {
    throw new Error("Docker is required for this command, but the docker executable was not found.");
  }
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return String(result.stdout || "").trim();
}

/**
 * @param {string[]} args
 * @returns {ContainerBuildOptions}
 */
function parseCliArgs(args) {
  const options = /** @type {ContainerBuildOptions} */ ({});
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--tag", "--artifact", "--release-metadata", "--provenance-output"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === "--tag") {
        options.tag = value;
      } else if (argument === "--artifact") {
        options.artifactPath = value;
      } else if (argument === "--release-metadata") {
        options.releaseMetadataPath = value;
      } else {
        options.provenanceOutput = value;
      }
      index += 1;
    } else if (argument === "--no-cache") {
      options.noCache = true;
    } else if (argument === "--pull") {
      options.pull = true;
    } else {
      throw new Error(`Unknown container build option: ${argument}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = await buildContainerImage(parseCliArgs(process.argv.slice(2)));
    console.log(`Container image: ${result.image}`);
    console.log(`Application version: ${result.version}`);
    console.log(`Runtime artifact SHA-256: ${result.checksum}`);
    console.log(`Image digest: ${result.imageDigest}`);
    console.log(`Image platform: ${result.platform}`);
    console.log(`Image provenance: ${result.provenancePath}`);
  } catch (error) {
    console.error(/** @type {Error} */ (error).message);
    process.exitCode = 1;
  }
}

export {
  buildContainerImage,
  createImageProvenance,
  inspectBuiltImage,
  inspectPinnedBaseImage,
  inspectReleaseMetadata,
  inspectRuntimeArtifact,
  normalizeBuildContextPath,
  parseCliArgs,
  runDocker,
  supportedPlatform,
};
