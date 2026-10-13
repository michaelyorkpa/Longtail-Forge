#!/usr/bin/env node
// Runtime image equivalence.
//
// The published `runtime` stage is the `runtime-filesystem` stage flattened into one filesystem
// layer, so that the image carries no whiteouts. A scratch stage inherits nothing, which makes the restated
// configuration the risky part. This check builds the reference stage with exactly the image's build
// arguments, and proves two things:
// - every path has the same type, mode, ownership, link target, size, content, and extended
//   attributes in both images;
// - the effective configuration is identical, including the defaults the base image passes on:
//   environment, entrypoint, command, healthcheck, user, working directory, ports, volumes, and
//   labels.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  buildContainerImage,
  containerBuildArguments,
  inspectReleaseMetadata,
  inspectRuntimeArtifact,
  normalizeBuildContextPath,
  runDocker,
} from "../build-container-image.mjs";
import { inspectImageLayers, readTarEntries } from "./image-layers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const REFERENCE_TARGET = "runtime-filesystem";

/**
 * One path of an exported filesystem. A hard link is recorded as the file it shares, so a link and a
 * copy with the same bytes and metadata compare equal; the manifest counts links separately.
 * @typedef {object} FileRecord
 * @property {string} type
 * @property {number} mode
 * @property {number} uid
 * @property {number} gid
 * @property {number} size
 * @property {string} linkname
 * @property {string} sha256
 * @property {Readonly<Record<string, string>>} xattrs
 */

/**
 * @typedef {{ files: Map<string, FileRecord>, hardlinks: number }} FilesystemManifest
 * @typedef {{ path: string, field: string, reference: unknown, candidate: unknown }} FileDifference
 * @typedef {{ missing: string[], extra: string[], changed: FileDifference[] }} FilesystemComparison
 * @typedef {{ field: string, reference: unknown, candidate: unknown }} ConfigDifference
 */

/** @type {Readonly<Record<string, string>>} */
const TYPES = Object.freeze({ "0": "file", "7": "file", "2": "symlink", "3": "character-device", "4": "block-device", "5": "directory", "6": "fifo" });

/**
 * An archive path without its leading `./` or trailing `/`; the root itself is `.`.
 * @param {string} name
 */
function normalizeArchivePath(name) {
  return name.replace(/^\.\//, "").replace(/\/+$/, "") || ".";
}

/**
 * The filesystem recorded in a `docker export` archive.
 * @param {Buffer} archive
 * @returns {FilesystemManifest}
 */
function exportManifest(archive) {
  /** @type {Map<string, FileRecord>} */
  const files = new Map();
  let hardlinks = 0;
  for (const entry of readTarEntries(archive)) {
    const name = normalizeArchivePath(entry.name);
    if (entry.type === "1") {
      const target = files.get(normalizeArchivePath(entry.linkname));
      if (!target) throw new Error(`Exported hard link ${name} names a target that is not earlier in the archive: ${entry.linkname}`);
      hardlinks += 1;
      files.set(name, target);
      continue;
    }
    const type = TYPES[entry.type];
    if (!type) throw new Error(`Exported path ${name} has an unexpected tar type ${JSON.stringify(entry.type)}.`);
    const content = type === "file" ? archive.subarray(entry.dataOffset, entry.dataOffset + entry.size) : null;
    files.set(name, Object.freeze({
      type,
      mode: entry.mode,
      uid: entry.uid,
      gid: entry.gid,
      size: type === "file" ? entry.size : 0,
      linkname: type === "symlink" ? entry.linkname : "",
      sha256: content ? createHash("sha256").update(content).digest("hex") : "",
      xattrs: entry.xattrs,
    }));
  }
  return { files, hardlinks };
}

/**
 * Every path that is missing, extra, or different between two filesystems.
 * @param {FilesystemManifest} reference
 * @param {FilesystemManifest} candidate
 * @returns {FilesystemComparison}
 */
function compareFilesystems(reference, candidate) {
  /** @type {FilesystemComparison} */
  const comparison = { missing: [], extra: [], changed: [] };
  for (const [name, expected] of reference.files) {
    const actual = candidate.files.get(name);
    if (!actual) {
      comparison.missing.push(name);
      continue;
    }
    for (const field of /** @type {const} */ (["type", "mode", "uid", "gid", "size", "linkname", "sha256", "xattrs"])) {
      if (!isDeepStrictEqual(expected[field], actual[field])) {
        comparison.changed.push({ path: name, field, reference: expected[field], candidate: actual[field] });
      }
    }
  }
  for (const name of candidate.files.keys()) {
    if (!reference.files.has(name)) comparison.extra.push(name);
  }
  return comparison;
}

/**
 * Every configuration field that differs between two `docker image inspect` records: the image
 * platform, and each member of `Config`.
 * @param {Record<string, unknown>} reference
 * @param {Record<string, unknown>} candidate
 * @returns {ConfigDifference[]}
 */
function compareImageConfigurations(reference, candidate) {
  /** @type {ConfigDifference[]} */
  const differences = [];
  for (const field of ["Os", "Architecture", "Variant"]) {
    if (!isDeepStrictEqual(reference[field], candidate[field])) differences.push({ field, reference: reference[field], candidate: candidate[field] });
  }
  const referenceConfig = /** @type {Record<string, unknown>} */ (reference.Config ?? {});
  const candidateConfig = /** @type {Record<string, unknown>} */ (candidate.Config ?? {});
  for (const field of new Set([...Object.keys(referenceConfig), ...Object.keys(candidateConfig)])) {
    if (!isDeepStrictEqual(referenceConfig[field], candidateConfig[field])) {
      differences.push({ field: `Config.${field}`, reference: referenceConfig[field], candidate: candidateConfig[field] });
    }
  }
  return differences;
}

/**
 * @param {string} image
 * @param {string} cwd
 * @returns {Record<string, unknown>}
 */
function inspectImage(image, cwd) {
  const records = /** @type {unknown} */ (JSON.parse(runDocker(["image", "inspect", image], { cwd })));
  if (!Array.isArray(records) || records.length !== 1 || !records[0] || typeof records[0] !== "object") {
    throw new Error(`docker image inspect did not describe exactly one image for ${image}.`);
  }
  return /** @type {Record<string, unknown>} */ (records[0]);
}

/**
 * The filesystem of an image, read from a created (never started) container's export.
 * @param {string} image
 * @param {string} cwd
 * @returns {Promise<FilesystemManifest>}
 */
async function exportImageFilesystem(image, cwd) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-image-export-"));
  const container = runDocker(["create", "--platform", "linux/amd64", image], { cwd });
  try {
    const archivePath = path.join(directory, "filesystem.tar");
    runDocker(["export", "--output", archivePath, container], { cwd });
    return exportManifest(await fs.readFile(archivePath));
  } finally {
    spawnSync("docker", ["rm", "--force", container], { cwd, encoding: "utf8" });
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Build the reference stage beside the runtime image, and compare them.
 * @param {{
 *   rootDir?: string,
 *   artifactPath: string,
 *   releaseMetadataPath?: string | null,
 *   candidateTag?: string | null,
 *   referenceTag?: string,
 * }} options
 */
async function checkRuntimeImageEquivalence(options) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const artifact = await inspectRuntimeArtifact(path.resolve(rootDir, options.artifactPath));
  const releaseMetadata = options.releaseMetadataPath
    ? await inspectReleaseMetadata(path.resolve(rootDir, options.releaseMetadataPath), artifact)
    : null;
  const candidate = options.candidateTag || "longtail-forge:equivalence-candidate";
  if (!options.candidateTag) {
    await buildContainerImage({
      rootDir,
      artifactPath: options.artifactPath,
      ...(options.releaseMetadataPath ? { releaseMetadataPath: options.releaseMetadataPath } : {}),
      tag: candidate,
    });
  }
  const reference = options.referenceTag || "longtail-forge:equivalence-reference";
  runDocker(containerBuildArguments({
    artifact,
    commitSha: releaseMetadata?.commitSha || null,
    noCache: false,
    pull: false,
    relativeArtifactPath: normalizeBuildContextPath(rootDir, artifact.path),
    sourceBranch: releaseMetadata?.sourceBranch || artifact.sourceBranch || null,
    tag: reference,
    target: REFERENCE_TARGET,
  }), { cwd: rootDir, stdio: "inherit" });

  const configuration = compareImageConfigurations(inspectImage(reference, rootDir), inspectImage(candidate, rootDir));
  const [referenceFilesystem, candidateFilesystem] = [
    await exportImageFilesystem(reference, rootDir),
    await exportImageFilesystem(candidate, rootDir),
  ];
  const filesystem = compareFilesystems(referenceFilesystem, candidateFilesystem);
  const [referenceLayers, candidateLayers] = [await inspectImageLayers(reference, { cwd: rootDir }), await inspectImageLayers(candidate, { cwd: rootDir })];
  const count = (/** @type {import("./image-layers.mjs").LayerReport[]} */ reports) => reports.reduce((sum, report) => sum + report.whiteouts.length, 0);
  return Object.freeze({
    reference: Object.freeze({ image: reference, target: REFERENCE_TARGET, paths: referenceFilesystem.files.size, hardlinks: referenceFilesystem.hardlinks, layers: referenceLayers.length, whiteouts: count(referenceLayers) }),
    candidate: Object.freeze({ image: candidate, paths: candidateFilesystem.files.size, hardlinks: candidateFilesystem.hardlinks, layers: candidateLayers.length, whiteouts: count(candidateLayers) }),
    configuration,
    filesystem,
    equivalent: configuration.length === 0 && filesystem.missing.length === 0 && filesystem.extra.length === 0 && filesystem.changed.length === 0 && count(candidateLayers) === 0,
  });
}

/**
 * @param {string[]} args
 */
function parseCliArgs(args) {
  /** @type {{ artifactPath: string | null, releaseMetadataPath: string | null, candidateTag: string | null, report: string | null }} */
  const options = { artifactPath: null, releaseMetadataPath: null, candidateTag: null, report: null };
  /** @type {Record<string, "artifactPath" | "releaseMetadataPath" | "candidateTag" | "report">} */
  const flags = { "--artifact": "artifactPath", "--release-metadata": "releaseMetadataPath", "--candidate": "candidateTag", "--report": "report" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    const key = flags[argument];
    const value = args[index + 1];
    if (!key) throw new Error(`Unknown runtime image equivalence option: ${argument}`);
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    options[key] = value;
    index += 1;
  }
  if (!options.artifactPath) throw new Error("Usage: node scripts/release/runtime-image-equivalence.mjs --artifact <tgz> [--release-metadata <json>] [--candidate <image>] [--report <json>]");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = await checkRuntimeImageEquivalence({
      artifactPath: /** @type {string} */ (options.artifactPath),
      releaseMetadataPath: options.releaseMetadataPath,
      candidateTag: options.candidateTag,
    });
    const report = {
      ...result,
      filesystem: {
        missing: result.filesystem.missing.length,
        extra: result.filesystem.extra.length,
        changed: result.filesystem.changed.length,
        firstDifferences: [
          ...result.filesystem.missing.slice(0, 10).map((name) => ({ path: name, difference: "missing" })),
          ...result.filesystem.extra.slice(0, 10).map((name) => ({ path: name, difference: "extra" })),
          ...result.filesystem.changed.slice(0, 20),
        ],
      },
    };
    if (options.report) {
      await fs.mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
      await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ reference: result.reference, candidate: result.candidate, configurationDifferences: result.configuration.length, filesystem: report.filesystem }, null, 2));
    for (const difference of result.configuration) console.log(`configuration differs: ${difference.field}: ${JSON.stringify(difference.reference)} -> ${JSON.stringify(difference.candidate)}`);
    if (!result.equivalent) {
      console.error("The runtime image is not equivalent to its reference stage.");
      process.exitCode = 1;
    } else {
      console.log(`The runtime image is equivalent to ${REFERENCE_TARGET}: ${result.candidate.paths} paths, identical configuration, ${result.candidate.layers} layer(s), no whiteouts.`);
    }
  } catch (error) {
    console.error(/** @type {Error} */ (error).message);
    process.exitCode = 1;
  }
}

export {
  checkRuntimeImageEquivalence,
  compareFilesystems,
  compareImageConfigurations,
  exportManifest,
  parseCliArgs,
};
