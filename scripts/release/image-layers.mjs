#!/usr/bin/env node
// Layer inspection for container images.
//
// An image layer deletes a path from the layers beneath it with a whiteout entry, `.wh.<name>`, and
// hides a lower directory's whole contents with the opaque marker `.wh..wh..opq`. Docker storage that
// cannot apply them refuses to unpack the image: the preview host's failed to remove a non-empty lower
// directory that a whiteout named. The published runtime image is therefore one layer, and image
// builds use this module to refuse any layer that carries either kind.
//
// The tar reader is shared with the runtime image equivalence check. It reads POSIX ustar names with
// their prefix, GNU long names, and PAX records, and refuses a header whose checksum does not match
// rather than guessing at a malformed archive.

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const scriptPath = fileURLToPath(import.meta.url);
const BLOCK = 512;
const WHITEOUT_PREFIX = ".wh.";
const OPAQUE_WHITEOUT = ".wh..wh..opq";

/**
 * One archive member, with the metadata the layer and filesystem checks read.
 * @typedef {object} TarEntry
 * @property {string} name
 * @property {string} type
 * @property {number} mode
 * @property {number} uid
 * @property {number} gid
 * @property {number} size
 * @property {string} linkname
 * @property {number} dataOffset
 * @property {Readonly<Record<string, string>>} xattrs
 */

/**
 * @typedef {"whiteout" | "opaque"} WhiteoutKind
 * @typedef {{ path: string, kind: WhiteoutKind }} WhiteoutEntry
 * @typedef {{ layer: string, entries: number, whiteouts: readonly WhiteoutEntry[] }} LayerReport
 */

/**
 * Whether an archive path is a whiteout, and of which kind. Any basename with the reserved `.wh.`
 * prefix counts: the opaque marker hides a directory's lower contents, and every other one deletes
 * the lower path it names.
 * @param {string} entryPath
 * @returns {WhiteoutKind | null}
 */
function classifyWhiteout(entryPath) {
  const name = path.posix.basename(entryPath);
  if (name === OPAQUE_WHITEOUT) return "opaque";
  if (name.startsWith(WHITEOUT_PREFIX)) return "whiteout";
  return null;
}

/**
 * Every member of an uncompressed tar archive, in order.
 * @param {Buffer} archive
 * @returns {Generator<TarEntry>}
 */
function* readTarEntries(archive) {
  let offset = 0;
  /** @type {Record<string, string>} */
  let pax = {};
  /** @type {string | null} */
  let longName = null;
  /** @type {string | null} */
  let longLink = null;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      offset += BLOCK;
      continue;
    }
    verifyHeaderChecksum(header, offset);
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156] ?? 0x30);
    const headerSize = readNumber(header, 124, 12);
    // A PAX `size` record describes the member that follows the extended header, never a header itself.
    const isMetadata = type === "x" || type === "g" || type === "L" || type === "K";
    const size = isMetadata || pax.size === undefined ? headerSize : Number(pax.size);
    const dataOffset = offset + BLOCK;
    if (!Number.isSafeInteger(size) || size < 0 || dataOffset + size > archive.length) {
      throw new Error(`Tar member at byte ${offset} is truncated or has an invalid size.`);
    }
    const data = archive.subarray(dataOffset, dataOffset + size);
    offset = dataOffset + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      pax = { ...pax, ...parsePaxRecords(data) };
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      longName = readCString(data);
      continue;
    }
    if (type === "K") {
      longLink = readCString(data);
      continue;
    }
    const posix = header.subarray(257, 263).toString("latin1") === "ustar\0";
    const prefix = posix ? readCString(header.subarray(345, 500)) : "";
    const shortName = readCString(header.subarray(0, 100));
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${shortName}` : shortName);
    /** @type {Record<string, string>} */
    const xattrs = {};
    for (const [key, value] of Object.entries(pax)) {
      if (key.startsWith("SCHILY.xattr.")) xattrs[key.slice("SCHILY.xattr.".length)] = value;
    }
    yield Object.freeze({
      name,
      type,
      mode: readNumber(header, 100, 8) & 0o7777,
      uid: pax.uid === undefined ? readNumber(header, 108, 8) : Number(pax.uid),
      gid: pax.gid === undefined ? readNumber(header, 116, 8) : Number(pax.gid),
      size,
      linkname: pax.linkpath ?? longLink ?? readCString(header.subarray(157, 257)),
      dataOffset,
      xattrs: Object.freeze(xattrs),
    });
    pax = {};
    longName = null;
    longLink = null;
  }
}

/**
 * @param {Buffer} header
 * @param {number} offset
 */
function verifyHeaderChecksum(header, offset) {
  const recorded = readNumber(header, 148, 8);
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1) sum += index >= 148 && index < 156 ? 0x20 : header[index] ?? 0;
  if (sum !== recorded) {
    throw new Error(`Tar header at byte ${offset} fails its checksum; the archive is malformed or not a tar archive.`);
  }
}

/**
 * An octal header number, or a GNU base-256 one when its high bit is set.
 * @param {Buffer} header
 * @param {number} start
 * @param {number} length
 */
function readNumber(header, start, length) {
  const field = header.subarray(start, start + length);
  if ((field[0] ?? 0) & 0x80) {
    let value = (field[0] ?? 0) & 0x7f;
    for (let index = 1; index < field.length; index += 1) value = value * 256 + (field[index] ?? 0);
    return value;
  }
  const text = field.toString("latin1").replace(/\0.*$/s, "").trim();
  return text ? Number.parseInt(text, 8) : 0;
}

/** @param {Buffer} bytes */
function readCString(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf8");
}

/**
 * The records of one PAX extended header: `<length> <key>=<value>\n`, where the length counts the
 * whole record in bytes.
 * @param {Buffer} data
 * @returns {Record<string, string>}
 */
function parsePaxRecords(data) {
  /** @type {Record<string, string>} */
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString("latin1"), 10);
    if (!Number.isSafeInteger(length) || length <= space - offset || offset + length > data.length) {
      throw new Error("PAX extended header record is malformed.");
    }
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    const separator = record.indexOf("=");
    if (separator === -1) throw new Error("PAX extended header record has no key.");
    records[record.slice(0, separator)] = record.slice(separator + 1);
    offset += length;
  }
  return records;
}

/**
 * The uncompressed bytes of a layer blob, gzip or plain tar.
 * @param {Buffer} blob
 */
function layerArchive(blob) {
  if (blob[0] === 0x1f && blob[1] === 0x8b) return gunzipSync(blob);
  if (blob[0] === 0x28 && blob[1] === 0xb5 && blob[2] === 0x2f && blob[3] === 0xfd) {
    throw new Error("Image layer uses zstd compression, which this inspection does not read.");
  }
  return blob;
}

/**
 * The whiteouts one layer carries.
 * @param {string} layer
 * @param {Buffer} blob
 * @returns {LayerReport}
 */
function inspectLayer(layer, blob) {
  /** @type {WhiteoutEntry[]} */
  const whiteouts = [];
  let entries = 0;
  for (const entry of readTarEntries(layerArchive(blob))) {
    entries += 1;
    const kind = classifyWhiteout(entry.name);
    if (kind) whiteouts.push(Object.freeze({ path: entry.name, kind }));
  }
  return Object.freeze({ layer, entries, whiteouts: Object.freeze(whiteouts) });
}

/**
 * The layer reports of a `docker save` archive, in the order its manifest applies them. Both the
 * classic archive (`<id>/layer.tar`) and the OCI layout (`blobs/sha256/<hex>`) list their layers in
 * `manifest.json`.
 * @param {Buffer} archive
 * @returns {LayerReport[]}
 */
function inspectSavedImageArchive(archive) {
  /** @type {Map<string, Buffer>} */
  const members = new Map();
  for (const entry of readTarEntries(archive)) {
    if (entry.type === "0" || entry.type === "7") {
      members.set(path.posix.normalize(entry.name), archive.subarray(entry.dataOffset, entry.dataOffset + entry.size));
    }
  }
  const manifestBytes = members.get("manifest.json");
  if (!manifestBytes) throw new Error("Saved image archive has no manifest.json.");
  const manifest = /** @type {unknown} */ (JSON.parse(manifestBytes.toString("utf8")));
  if (!Array.isArray(manifest) || manifest.length !== 1) {
    throw new Error("Saved image archive must describe exactly one image.");
  }
  const image = /** @type {unknown} */ (manifest[0]);
  const layers = image && typeof image === "object" && "Layers" in image ? image.Layers : undefined;
  if (!Array.isArray(layers) || layers.length === 0 || !layers.every((layer) => typeof layer === "string")) {
    throw new Error("Saved image manifest must list the image's layers.");
  }
  return layers.map((layer) => {
    const blob = members.get(path.posix.normalize(layer));
    if (!blob) throw new Error(`Saved image archive is missing layer ${layer}.`);
    return inspectLayer(layer, blob);
  });
}

/**
 * The layer reports of a local image, read through `docker save`.
 * @param {string} reference
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<LayerReport[]>}
 */
async function inspectImageLayers(reference, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-image-layers-"));
  try {
    const archivePath = path.join(directory, "image.tar");
    const result = spawnSync("docker", ["save", "--output", archivePath, reference], { cwd: options.cwd, encoding: "utf8" });
    if (/** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === "ENOENT") {
      throw new Error("Docker is required for this command, but the docker executable was not found.");
    }
    if (result.status !== 0) {
      throw new Error(`docker save failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
    }
    return inspectSavedImageArchive(await fs.readFile(archivePath));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Why an image's layers are refused, or null when they carry no whiteout.
 * @param {string} reference
 * @param {readonly LayerReport[]} reports
 * @returns {string | null}
 */
function describeWhiteouts(reference, reports) {
  const offending = reports.filter((report) => report.whiteouts.length > 0);
  if (offending.length === 0) return null;
  const paths = offending.flatMap((report) => report.whiteouts.map((whiteout) => whiteout.path));
  return `Image ${reference} carries ${paths.length} whiteout(s) in ${offending.length} of ${reports.length} layer(s), which Docker storage on the preview host cannot unpack: ${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ", ..." : ""}`;
}

/**
 * Refuse an image whose layers carry any whiteout.
 * @param {string} reference
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<LayerReport[]>}
 */
async function assertImageHasNoWhiteouts(reference, options = {}) {
  const reports = await inspectImageLayers(reference, options);
  const refusal = describeWhiteouts(reference, reports);
  if (refusal) throw new Error(refusal);
  return reports;
}

/**
 * @param {string[]} args
 * @returns {{ reference: string, expect: "absent" | "present", report: string | null }}
 */
function parseCliArgs(args) {
  /** @type {string | null} */
  let reference = null;
  /** @type {"absent" | "present"} */
  let expect = "absent";
  /** @type {string | null} */
  let report = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--expect" || argument === "--report") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--report") report = value;
      else if (value === "absent" || value === "present") expect = value;
      else throw new Error("--expect must be absent or present.");
      index += 1;
    } else if (argument && !argument.startsWith("--") && reference === null) {
      reference = argument;
    } else {
      throw new Error(`Unknown image layer option: ${argument}`);
    }
  }
  if (!reference) throw new Error("Usage: node scripts/release/image-layers.mjs <image-reference> [--expect absent|present] [--report <path>]");
  return { reference, expect, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const reports = await inspectImageLayers(options.reference);
    const total = reports.reduce((sum, report) => sum + report.whiteouts.length, 0);
    for (const [index, report] of reports.entries()) {
      console.log(`layer ${index + 1}/${reports.length} ${report.layer}: ${report.entries} entries, ${report.whiteouts.length} whiteouts`);
      for (const whiteout of report.whiteouts.slice(0, 20)) console.log(`    ${whiteout.kind} ${whiteout.path}`);
    }
    if (options.report) {
      await fs.mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
      await fs.writeFile(options.report, `${JSON.stringify({ reference: options.reference, layers: reports, whiteouts: total }, null, 2)}\n`);
    }
    const refusal = describeWhiteouts(options.reference, reports);
    if (options.expect === "absent" && refusal) {
      console.error(refusal);
      process.exitCode = 1;
    } else if (options.expect === "present" && !refusal) {
      console.error(`${options.reference} carries no whiteout, but this control expects the inspection to find some.`);
      process.exitCode = 1;
    } else {
      console.log(`${options.reference}: ${total} whiteout(s) in ${reports.length} layer(s), as expected (${options.expect}).`);
    }
  } catch (error) {
    console.error(/** @type {Error} */ (error).message);
    process.exitCode = 1;
  }
}

export {
  assertImageHasNoWhiteouts,
  classifyWhiteout,
  describeWhiteouts,
  inspectImageLayers,
  inspectLayer,
  inspectSavedImageArchive,
  parseCliArgs,
  readTarEntries,
};
