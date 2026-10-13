#!/usr/bin/env node
// Runtime image equivalence.
//
// The published `runtime` stage is the `runtime-filesystem` stage flattened into one filesystem
// layer, so that the image carries no whiteouts. A scratch stage inherits nothing, which makes the
// restated configuration the risky part, and a flattening copy could lose filesystem metadata. This
// check builds the reference stage with exactly the image's build arguments, from the same builder and
// cache, and proves three things:
// - the image-owned filesystems are identical. Each image's layers are applied in order as
//   containerd's applier applies them, whiteouts included. Every path is then compared for type, mode
//   with its special bits, ownership, size, content hash, symlink target, device numbers, hard-link
//   group, and the bytes of every extended attribute the layers carry;
// - Docker's export of a created container from each image is identical by the same fields. It
//   cross-checks the layer reading against Docker's own materialization; the export also carries the
//   engine's mount-point files, identically for both, and of the extended attributes only the
//   capability;
// - the effective configuration is identical, including the defaults the base image passes on:
//   environment, entrypoint, command, healthcheck, user, working directory, ports, volumes, and
//   labels.
// Modification times and owner names are not compared. A reference that was not built from the
// candidate's build cache differs in its Debian-generated files, and is reported as different.

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
import { classifyWhiteout, cleanPath, inspectLayerArchive, readSavedImageLayers, readTarEntries, saveImage } from "./image-layers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const REFERENCE_TARGET = "runtime-filesystem";

/**
 * One path of a filesystem. A hard link shares its file's content and metadata, and every path of a
 * shared file lists the others, so a link and an independent copy compare different.
 * @typedef {object} FileRecord
 * @property {string} type
 * @property {number} mode
 * @property {number} uid
 * @property {number} gid
 * @property {number} size
 * @property {string} linkname
 * @property {number} devmajor
 * @property {number} devminor
 * @property {string} sha256
 * @property {Readonly<Record<string, string>>} xattrs each extended attribute's value, as the hex of its bytes
 * @property {readonly string[]} hardlinks every other path that shares this file, sorted
 */

/**
 * @typedef {Omit<FileRecord, "hardlinks"> & { inode: number }} PathState
 * @typedef {{ paths: Map<string, PathState>, nextInode: number }} FilesystemState
 * @typedef {{ files: Map<string, FileRecord>, hardlinkGroups: number, linkedPaths: number, xattrPaths: number, devices: number }} FilesystemManifest
 * @typedef {{ path: string, field: string, reference: unknown, candidate: unknown }} FileDifference
 * @typedef {{ missing: string[], extra: string[], changed: FileDifference[] }} FilesystemComparison
 * @typedef {{ field: string, reference: unknown, candidate: unknown }} ConfigDifference
 */

/** @type {Readonly<Record<string, string>>} */
const TYPES = Object.freeze({ "0": "file", "2": "symlink", "3": "character-device", "4": "block-device", "5": "directory", "6": "fifo" });
const COMPARED_FIELDS = /** @type {const} */ (["type", "mode", "uid", "gid", "size", "linkname", "devmajor", "devminor", "sha256", "xattrs", "hardlinks"]);

/**
 * The root-relative path containerd writes an entry to, or null for the root itself, which it skips.
 * Leading `/` and `..` elements stay inside the root.
 * @param {string} name
 */
function rootRelative(name) {
  const cleaned = cleanPath(name).replace(/^(?:\/|\.\.\/)+/, "");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? null : cleaned;
}

/** @returns {FilesystemState} */
function createFilesystemState() {
  return { paths: new Map(), nextInode: 1 };
}

/**
 * Remove a path and everything beneath it.
 * @param {FilesystemState} state
 * @param {string} key
 */
function removeTree(state, key) {
  state.paths.delete(key);
  const prefix = `${key}/`;
  for (const existing of [...state.paths.keys()]) {
    if (existing.startsWith(prefix)) state.paths.delete(existing);
  }
}

/**
 * Every ancestor of an entry must already be a directory. containerd would create a missing parent and
 * write through a symlinked one; neither occurs in the layers this check compares, so each is refused
 * rather than modelled.
 * @param {FilesystemState} state
 * @param {string} key
 * @param {string} name
 */
function requireDirectoryParents(state, key, name) {
  for (let parent = path.posix.dirname(key); parent !== "."; parent = path.posix.dirname(parent)) {
    const record = state.paths.get(parent);
    if (!record) throw new Error(`Filesystem entry ${name} has no parent directory ${parent} before it.`);
    if (record.type !== "directory") throw new Error(`Filesystem entry ${name} lies beneath ${parent}, which is a ${record.type}, not a directory.`);
  }
}

/**
 * Apply one uncompressed archive to a filesystem as containerd's applier does. Entries apply in
 * order, a whiteout removes the path it names, and an opaque marker removes everything beneath its
 * directory that this archive did not itself write. A directory over a directory keeps its contents,
 * and any other entry replaces what was there.
 * @param {FilesystemState} state
 * @param {Buffer} archive
 * @param {{ whiteouts: boolean }} options whether whiteouts may appear, as in a layer but not an export
 */
function applyArchive(state, archive, options) {
  /** @type {Set<string>} */
  const written = new Set();
  for (const entry of readTarEntries(archive)) {
    const key = rootRelative(entry.name);
    if (key === null) continue;
    requireDirectoryParents(state, key, entry.name);
    const kind = classifyWhiteout(entry.name);
    if (kind) {
      if (!options.whiteouts) throw new Error(`Exported filesystem unexpectedly carries the whiteout ${entry.name}.`);
      const directory = path.posix.dirname(key);
      if (kind === "whiteout") {
        removeTree(state, path.posix.join(directory, path.posix.basename(key).slice(".wh.".length)));
        continue;
      }
      const prefix = directory === "." ? "" : `${directory}/`;
      for (const existing of [...state.paths.keys()].sort()) {
        if (existing.startsWith(prefix) && state.paths.has(existing) && !written.has(existing)) removeTree(state, existing);
      }
      continue;
    }
    const existing = state.paths.get(key);
    if (entry.type === "1") {
      // containerd removes what the link replaces, then links to a target that must still exist.
      if (existing) removeTree(state, key);
      const targetKey = rootRelative(entry.linkname);
      const target = targetKey === null ? undefined : state.paths.get(targetKey);
      if (!target || target.type === "directory") throw new Error(`Hard link ${entry.name} names no file to share: ${entry.linkname}`);
      state.paths.set(key, target);
      written.add(key);
      continue;
    }
    const type = TYPES[entry.type];
    if (!type) throw new Error(`Filesystem entry ${entry.name} has the unexpected tar type ${JSON.stringify(entry.type)}.`);
    const mergesDirectory = existing?.type === "directory" && type === "directory";
    if (existing && !mergesDirectory) removeTree(state, key);
    const isDevice = type === "character-device" || type === "block-device";
    state.paths.set(key, Object.freeze({
      type,
      mode: entry.mode,
      uid: entry.uid,
      gid: entry.gid,
      size: type === "file" ? entry.size : 0,
      linkname: type === "symlink" ? entry.linkname : "",
      devmajor: isDevice ? entry.devmajor : 0,
      devminor: isDevice ? entry.devminor : 0,
      sha256: type === "file" ? createHash("sha256").update(archive.subarray(entry.dataOffset, entry.dataOffset + entry.size)).digest("hex") : "",
      // containerd sets an entry's attributes without clearing a merged directory's earlier ones.
      xattrs: Object.freeze(mergesDirectory && existing ? { ...existing.xattrs, ...entry.xattrs } : entry.xattrs),
      // Any non-directory can be hard-linked, so each has its own inode for links to share.
      inode: type === "directory" ? 0 : state.nextInode++,
    }));
    written.add(key);
  }
}

/**
 * The comparable records of a filesystem, with each shared file's other paths.
 * @param {FilesystemState} state
 * @returns {FilesystemManifest}
 */
function finalizeFilesystem(state) {
  /** @type {Map<number, string[]>} */
  const groups = new Map();
  for (const [key, record] of state.paths) {
    if (!record.inode) continue;
    const members = groups.get(record.inode);
    if (members) members.push(key);
    else groups.set(record.inode, [key]);
  }
  /** @type {Map<string, FileRecord>} */
  const files = new Map();
  let xattrPaths = 0;
  let devices = 0;
  for (const key of [...state.paths.keys()].sort()) {
    const { inode, ...record } = /** @type {PathState} */ (state.paths.get(key));
    const members = inode ? groups.get(inode) ?? [] : [];
    files.set(key, Object.freeze({ ...record, hardlinks: Object.freeze(members.filter((member) => member !== key).sort()) }));
    if (Object.keys(record.xattrs).length > 0) xattrPaths += 1;
    if (record.type === "character-device" || record.type === "block-device") devices += 1;
  }
  const shared = [...groups.values()].filter((members) => members.length > 1);
  return {
    files,
    hardlinkGroups: shared.length,
    linkedPaths: shared.reduce((sum, members) => sum + members.length, 0),
    xattrPaths,
    devices,
  };
}

/**
 * The filesystem recorded in a single archive, such as a `docker export`, which carries no whiteouts.
 * @param {Buffer} archive
 * @returns {FilesystemManifest}
 */
function exportManifest(archive) {
  const state = createFilesystemState();
  applyArchive(state, archive, { whiteouts: false });
  return finalizeFilesystem(state);
}

/**
 * The filesystem an image's uncompressed layers produce, applied in order.
 * @param {readonly Buffer[]} layers
 * @returns {FilesystemManifest}
 */
function layersManifest(layers) {
  const state = createFilesystemState();
  for (const layer of layers) applyArchive(state, layer, { whiteouts: true });
  return finalizeFilesystem(state);
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
    for (const field of COMPARED_FIELDS) {
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

/** @param {FilesystemComparison} comparison */
function isIdentical(comparison) {
  return comparison.missing.length === 0 && comparison.extra.length === 0 && comparison.changed.length === 0;
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
 * An image's layer reports and the filesystem its layers produce, read through `docker save`.
 * @param {string} image
 * @param {string} cwd
 */
async function readImageLayers(image, cwd) {
  const layers = readSavedImageLayers(await saveImage(image, { cwd }));
  return {
    reports: layers.map(({ layer, archive }) => inspectLayerArchive(layer, archive)),
    filesystem: layersManifest(layers.map(({ archive }) => archive)),
  };
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
 * @param {string} image
 * @param {FilesystemManifest} filesystem
 * @param {import("./image-layers.mjs").LayerReport[]} reports
 * @param {FilesystemManifest} exported
 */
function summarize(image, filesystem, reports, exported) {
  return Object.freeze({
    image,
    layers: reports.length,
    whiteouts: reports.reduce((sum, report) => sum + report.whiteouts.length, 0),
    paths: filesystem.files.size,
    hardlinkGroups: filesystem.hardlinkGroups,
    linkedPaths: filesystem.linkedPaths,
    xattrPaths: filesystem.xattrPaths,
    devices: filesystem.devices,
    exportedPaths: exported.files.size,
  });
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
  const referenceImage = await readImageLayers(reference, rootDir);
  const candidateImage = await readImageLayers(candidate, rootDir);
  const layers = compareFilesystems(referenceImage.filesystem, candidateImage.filesystem);
  const referenceExport = await exportImageFilesystem(reference, rootDir);
  const candidateExport = await exportImageFilesystem(candidate, rootDir);
  const exported = compareFilesystems(referenceExport, candidateExport);
  const candidateSummary = summarize(candidate, candidateImage.filesystem, candidateImage.reports, candidateExport);
  return Object.freeze({
    reference: Object.freeze({ ...summarize(reference, referenceImage.filesystem, referenceImage.reports, referenceExport), target: REFERENCE_TARGET }),
    candidate: candidateSummary,
    configuration,
    filesystem: Object.freeze({ layers, exported }),
    equivalent: configuration.length === 0 && isIdentical(layers) && isIdentical(exported) && candidateSummary.whiteouts === 0,
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

/** @param {FilesystemComparison} comparison */
function reportComparison(comparison) {
  return {
    missing: comparison.missing.length,
    extra: comparison.extra.length,
    changed: comparison.changed.length,
    firstDifferences: [
      ...comparison.missing.slice(0, 10).map((name) => ({ path: name, difference: "missing" })),
      ...comparison.extra.slice(0, 10).map((name) => ({ path: name, difference: "extra" })),
      ...comparison.changed.slice(0, 20),
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = await checkRuntimeImageEquivalence({
      artifactPath: /** @type {string} */ (options.artifactPath),
      releaseMetadataPath: options.releaseMetadataPath,
      candidateTag: options.candidateTag,
    });
    const filesystem = { layers: reportComparison(result.filesystem.layers), exported: reportComparison(result.filesystem.exported) };
    const report = { ...result, filesystem };
    if (options.report) {
      await fs.mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
      await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ reference: result.reference, candidate: result.candidate, configurationDifferences: result.configuration.length, filesystem }, null, 2));
    for (const difference of result.configuration) console.log(`configuration differs: ${difference.field}: ${JSON.stringify(difference.reference)} -> ${JSON.stringify(difference.candidate)}`);
    if (!result.equivalent) {
      console.error("The runtime image is not equivalent to its reference stage.");
      process.exitCode = 1;
    } else {
      const { candidate } = result;
      console.log(`The runtime image is equivalent to ${REFERENCE_TARGET}: ${candidate.paths} image-owned paths with ${candidate.hardlinkGroups} hard-link group(s), ${candidate.xattrPaths} path(s) with extended attributes, and ${candidate.devices} device(s); ${candidate.exportedPaths} exported paths; identical configuration; ${candidate.layers} layer(s) and no whiteouts.`);
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
  layersManifest,
  parseCliArgs,
};
