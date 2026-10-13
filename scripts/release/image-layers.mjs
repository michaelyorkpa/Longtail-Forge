#!/usr/bin/env node
// Layer inspection for container images.
//
// An image layer deletes a path from the layers beneath it with a whiteout entry, `.wh.<name>`, and
// hides a lower directory's whole contents with the opaque marker `.wh..wh..opq`. Docker storage that
// cannot apply them refuses to unpack the image: the preview host's failed to remove a non-empty lower
// directory that a whiteout named. The published runtime image therefore carries its whole filesystem
// in one layer, and image builds use this module to refuse any layer that carries either kind.
//
// An entry counts as a whiteout exactly when the consumer would treat it as one. Docker and containerd
// read layers with Go's archive/tar, then clean each name before whiteout conversion. This reader
// names entries by Go's rules:
// - a PAX `path` record replaces the header name, and a GNU long name replaces both;
// - an empty PAX value keeps the header's value;
// - the header-only types (links, devices, directories, and FIFOs) have no data, whatever their size
//   field says;
// - a whiteout is recognized by the base name of the cleaned path.
// It validates framing as Go reads it: an unsigned or signed header checksum, strictly parsed numbers,
// complete data and padding, well-formed PAX records, and the end-of-archive marker, after which only
// zero bytes may follow. It refuses the forms it does not support rather than guessing at them:
// repeated or global metadata, sparse files, metadata with no entry to describe, entry types
// containerd does not unpack, and pre-Go 1.8 GNU headers. A layer that uses one fails the gate until a
// reviewed change supports it.
//
// The reader is shared with the runtime image equivalence check. Every string holds the archive's
// bytes one for one (latin1), so text decoding can neither lose nor merge a byte.

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const scriptPath = fileURLToPath(import.meta.url);
const BLOCK = 512;
// Go refuses a PAX record set or GNU long name larger than this.
const MAX_SPECIAL_FILE_SIZE = 1 << 20;
const WHITEOUT_PREFIX = ".wh.";
const OPAQUE_WHITEOUT = ".wh..wh..opq";
const XATTR_PREFIX = "SCHILY.xattr.";
// The entry types containerd unpacks, after a legacy NUL type becomes a file or directory.
const ENTRY_TYPES = new Set(["0", "1", "2", "3", "4", "5", "6"]);
// Go's header-only types: their data section is empty whatever the size field says.
const HEADER_ONLY_TYPES = new Set(["1", "2", "3", "4", "5", "6"]);

/**
 * One archive entry, named and sized as the consumer reads it.
 * @typedef {object} TarEntry
 * @property {string} name the effective name, before path cleaning
 * @property {string} type "0" file, "1" hard link, "2" symlink, "3" character device, "4" block device, "5" directory, or "6" FIFO
 * @property {number} mode permission and special bits
 * @property {number} uid
 * @property {number} gid
 * @property {number} size the data size, zero for every header-only type
 * @property {string} linkname
 * @property {number} devmajor
 * @property {number} devminor
 * @property {number} dataOffset
 * @property {Readonly<Record<string, string>>} xattrs each extended attribute's value, as the hex of its bytes
 */

/**
 * @typedef {"whiteout" | "opaque"} WhiteoutKind
 * @typedef {{ path: string, kind: WhiteoutKind }} WhiteoutEntry
 * @typedef {{ layer: string, entries: number, whiteouts: readonly WhiteoutEntry[] }} LayerReport
 * @typedef {{ layer: string, archive: Buffer }} SavedLayer
 */

/**
 * A path cleaned as Go's `path.Clean` does: duplicate slashes, `.` elements, and resolvable `..`
 * elements removed, and no trailing slash except on the root.
 * @param {string} entryPath
 */
function cleanPath(entryPath) {
  const normalized = path.posix.normalize(entryPath);
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

/**
 * Whether an archive path is a whiteout, and of which kind, judged as containerd judges it: by the
 * base name of the cleaned path. The opaque marker hides a directory's lower contents, and any other
 * base name with the reserved `.wh.` prefix deletes the lower path it names.
 * @param {string} entryPath
 * @returns {WhiteoutKind | null}
 */
function classifyWhiteout(entryPath) {
  const name = path.posix.basename(cleanPath(entryPath));
  if (name === OPAQUE_WHITEOUT) return "opaque";
  if (name.startsWith(WHITEOUT_PREFIX)) return "whiteout";
  return null;
}

/**
 * @param {number} offset
 * @param {string} reason
 */
function tarError(offset, reason) {
  return new Error(`Tar archive is malformed or unsupported at byte ${offset}: ${reason}.`);
}

/**
 * Go's `parseString`: the bytes up to the first NUL.
 * @param {Buffer} bytes
 */
function parseString(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("latin1");
}

/**
 * Go's `parseOctal`: trim leading and trailing spaces and NULs, cut at any NUL left, and read the
 * rest as a strict octal number. An empty field is zero.
 * @param {Buffer} field
 * @param {string} label
 * @param {number} offset
 */
function parseOctal(field, label, offset) {
  let start = 0;
  let end = field.length;
  while (start < end && (field[start] === 0x20 || field[start] === 0)) start += 1;
  while (end > start && (field[end - 1] === 0x20 || field[end - 1] === 0)) end -= 1;
  if (start === end) return 0;
  const text = parseString(field.subarray(start, end));
  const value = /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : Number.NaN;
  if (!Number.isSafeInteger(value)) throw tarError(offset, `the ${label} field is not an octal number this reader supports`);
  return value;
}

/**
 * Go's `parseNumeric`: a base-256 two's complement number when the first byte's high bit is set,
 * and otherwise octal.
 * @param {Buffer} field
 * @param {string} label
 * @param {number} offset
 */
function parseNumeric(field, label, offset) {
  const first = field[0] ?? 0;
  if ((first & 0x80) === 0) return parseOctal(field, label, offset);
  const invert = (first & 0x40) === 0 ? 0 : 0xff;
  let value = 0n;
  for (const [index, byte] of field.entries()) {
    const digit = index === 0 ? (byte ^ invert) & 0x7f : byte ^ invert;
    if (value >> 56n > 0n) throw tarError(offset, `the ${label} field overflows`);
    value = (value << 8n) | BigInt(digit);
  }
  if (value >> 63n > 0n) throw tarError(offset, `the ${label} field overflows`);
  const signed = invert === 0 ? value : -value - 1n;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw tarError(offset, `the ${label} field is beyond the range this reader supports`);
  }
  return Number(signed);
}

/**
 * A decimal PAX integer, as Go's `strconv.ParseInt` reads it.
 * @param {Buffer} value
 * @param {string} key
 * @param {number} offset
 */
function parsePaxInteger(value, key, offset) {
  const text = value.toString("latin1");
  const number = /^[+-]?\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw tarError(offset, `the PAX ${key} record is not an integer this reader supports`);
  return number;
}

/**
 * A PAX time, validated as Go's `parsePAXTime` reads it: decimal seconds that fit a signed 64-bit
 * integer, then an optional fraction of digits. The value itself is not compared, only validated.
 * @param {Buffer} value
 * @param {string} key
 * @param {number} offset
 */
function verifyPaxTime(value, key, offset) {
  const seconds = /^([+-]?\d+)(?:\.\d*)?$/.exec(value.toString("latin1"))?.[1];
  const number = seconds === undefined ? null : BigInt(seconds);
  if (number === null || number < -(2n ** 63n) || number > 2n ** 63n - 1n) throw tarError(offset, `the PAX ${key} record is not a time`);
}

/**
 * The header block's checksum must match its unsigned or its signed byte sum, as Go accepts either.
 * @param {Buffer} header
 * @param {number} offset
 */
function verifyHeaderChecksum(header, offset) {
  let recorded = Number.NaN;
  try {
    recorded = parseOctal(header.subarray(148, 156), "checksum", offset);
  } catch {
    // An unreadable checksum fails like a wrong one.
  }
  let unsigned = 0;
  let signed = 0;
  for (let index = 0; index < BLOCK; index += 1) {
    const byte = index >= 148 && index < 156 ? 0x20 : header[index] ?? 0;
    unsigned += byte;
    signed += byte >= 0x80 ? byte - 0x100 : byte;
  }
  if (recorded !== unsigned && recorded !== signed) {
    throw new Error(`Tar header at byte ${offset} fails its checksum; the archive is malformed or not a tar archive.`);
  }
}

/** @param {Buffer} bytes */
function isZero(bytes) {
  return bytes.every((byte) => byte === 0);
}

/**
 * One header block, read as Go reads it: format from the magic, name joined to its prefix, and every
 * numeric field parsed strictly.
 * @param {Buffer} header
 * @param {number} offset
 */
function readHeader(header, offset) {
  verifyHeaderChecksum(header, offset);
  const magic = header.subarray(257, 263).toString("latin1");
  const version = header.subarray(263, 265).toString("latin1");
  const trailer = header.subarray(508, 512).toString("latin1");
  const format = magic === "ustar\0" ? (trailer === "tar\0" ? "star" : "ustar") : magic === "ustar " && version === " \0" ? "gnu" : "v7";
  /** @param {number} start @param {number} length */
  const field = (start, length) => header.subarray(start, start + length);
  let name = parseString(field(0, 100));
  const read = {
    typeflag: header[156] === 0 ? "\0" : String.fromCharCode(header[156] ?? 0),
    linkname: parseString(field(157, 100)),
    size: parseNumeric(field(124, 12), "size", offset),
    mode: parseNumeric(field(100, 8), "mode", offset),
    uid: parseNumeric(field(108, 8), "uid", offset),
    gid: parseNumeric(field(116, 8), "gid", offset),
    devmajor: 0,
    devminor: 0,
  };
  parseNumeric(field(136, 12), "mtime", offset);
  if (format !== "v7") {
    read.devmajor = parseNumeric(field(329, 8), "devmajor", offset);
    read.devminor = parseNumeric(field(337, 8), "devminor", offset);
    let prefix = "";
    if (format === "ustar") {
      prefix = parseString(field(345, 155));
    } else if (format === "star") {
      prefix = parseString(field(345, 131));
      parseNumeric(field(476, 12), "atime", offset);
      parseNumeric(field(488, 12), "ctime", offset);
    } else {
      // Go reads a GNU header's atime and ctime, and when either fails to parse, reads those bytes as a
      // prefix that pre-Go 1.8 writers mistakenly wrote. That form is refused rather than reproduced.
      for (const [start, label] of /** @type {const} */ ([[345, "atime"], [357, "ctime"]])) {
        if (header[start] === 0) continue;
        try {
          parseNumeric(field(start, 12), label, offset);
        } catch {
          throw tarError(offset, "a GNU header carries the pre-Go 1.8 prefix form");
        }
      }
    }
    if (prefix) name = `${prefix}/${name}`;
  }
  return { ...read, name };
}

/**
 * The records of one PAX extended header, parsed and validated as Go parses them. Every record is
 * `<length> <key>=<value>\n`, the length counting the whole record in bytes; a later record for the
 * same key replaces an earlier one. GNU sparse records are refused.
 * @param {Buffer} data
 * @param {number} offset
 * @returns {Map<string, Buffer>}
 */
function parsePaxRecords(data, offset) {
  /** @type {Map<string, Buffer>} */
  const records = new Map();
  let position = 0;
  while (position < data.length) {
    const space = data.indexOf(0x20, position);
    const lengthText = space === -1 ? "" : data.subarray(position, space).toString("latin1");
    const length = /^[+-]?\d+$/.test(lengthText) ? Number(lengthText) : Number.NaN;
    if (!Number.isSafeInteger(length) || length < 5 || length > data.length - position || length <= lengthText.length + 1) {
      throw tarError(offset, "a PAX record has an invalid length");
    }
    const end = position + length - 1;
    if (data[end] !== 0x0a) throw tarError(offset, "a PAX record does not end with a newline");
    const record = data.subarray(space + 1, end);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) throw tarError(offset, "a PAX record has no key");
    const key = record.subarray(0, equals).toString("latin1");
    const value = record.subarray(equals + 1);
    const nulForbidden = key === "path" || key === "linkpath" || key === "uname" || key === "gname" ? value.includes(0) : key.includes("\0");
    if (nulForbidden) throw tarError(offset, `the PAX ${key} record contains a NUL byte`);
    if (key.startsWith("GNU.sparse.")) throw tarError(offset, "a GNU sparse PAX record is not supported in an image layer");
    records.set(key, value);
    position += length;
  }
  return records;
}

/**
 * The end-of-archive marker: a zero block, then a second zero block or the end of the data. Go stops
 * reading at the marker; anything after it must be zero padding.
 * @param {Buffer} archive
 * @param {number} offset
 */
function verifyEndOfArchive(archive, offset) {
  const second = offset + BLOCK;
  if (second === archive.length) return;
  if (second + BLOCK > archive.length) throw tarError(second, "the end-of-archive marker is truncated");
  if (!isZero(archive.subarray(second, second + BLOCK))) throw tarError(second, "a zero block is followed by a header");
  if (!isZero(archive.subarray(second + BLOCK))) throw tarError(second + BLOCK, "data follows the end-of-archive marker");
}

/**
 * Every entry of an uncompressed tar archive, in order, named and sized as the consumer reads them.
 * @param {Buffer} archive
 * @returns {Generator<TarEntry>}
 */
function* readTarEntries(archive) {
  let offset = 0;
  /** @type {Map<string, Buffer> | null} */
  let pax = null;
  /** @type {string | null} */
  let longName = null;
  /** @type {string | null} */
  let longLink = null;
  for (;;) {
    const pending = pax !== null || longName !== null || longLink !== null;
    if (offset === archive.length) {
      if (pending) throw tarError(offset, "metadata ends the archive without an entry to describe");
      return;
    }
    if (offset + BLOCK > archive.length) throw tarError(offset, "the archive ends inside a header block");
    const block = archive.subarray(offset, offset + BLOCK);
    if (isZero(block)) {
      if (pending) throw tarError(offset, "metadata ends the archive without an entry to describe");
      verifyEndOfArchive(archive, offset);
      return;
    }
    const header = readHeader(block, offset);
    const dataOffset = offset + BLOCK;
    /** @param {number} size */
    const take = (size) => {
      if (size < 0) throw tarError(offset, "the entry's size is negative");
      const end = dataOffset + Math.ceil(size / BLOCK) * BLOCK;
      if (end > archive.length) throw new Error(`Tar member at byte ${offset} is truncated or has an invalid size.`);
      offset = end;
      return archive.subarray(dataOffset, dataOffset + size);
    };

    if (header.typeflag === "x" || header.typeflag === "L" || header.typeflag === "K") {
      if (header.size > MAX_SPECIAL_FILE_SIZE) throw tarError(offset, "a metadata entry exceeds 1 MiB");
      const headerOffset = offset;
      const data = take(header.size);
      if (header.typeflag === "x") {
        if (pax !== null) throw tarError(headerOffset, "a second PAX header precedes one entry");
        pax = parsePaxRecords(data, headerOffset);
      } else if (header.typeflag === "L") {
        if (longName !== null) throw tarError(headerOffset, "a second GNU long name precedes one entry");
        longName = parseString(data);
      } else {
        if (longLink !== null) throw tarError(headerOffset, "a second GNU long link precedes one entry");
        longLink = parseString(data);
      }
      continue;
    }
    if (header.typeflag === "g") throw tarError(offset, "a PAX global header is not supported in an image layer");
    if (header.typeflag === "S") throw tarError(offset, "a GNU sparse entry is not supported in an image layer");

    // Merge as Go does: PAX records over the header, then the GNU long name and link over both.
    let { name, linkname, uid, gid, size } = header;
    /** @type {Record<string, string>} */
    const xattrs = {};
    for (const [key, value] of pax ?? []) {
      // containerd applies every extended attribute record, an empty one included.
      if (key.startsWith(XATTR_PREFIX)) xattrs[key.slice(XATTR_PREFIX.length)] = value.toString("hex");
      if (value.length === 0) continue;
      if (key === "path") name = value.toString("latin1");
      else if (key === "linkpath") linkname = value.toString("latin1");
      else if (key === "uid") uid = parsePaxInteger(value, key, offset);
      else if (key === "gid") gid = parsePaxInteger(value, key, offset);
      else if (key === "size") size = parsePaxInteger(value, key, offset);
      else if (key === "mtime" || key === "atime" || key === "ctime") verifyPaxTime(value, key, offset);
    }
    if (longName) name = longName;
    if (longLink) linkname = longLink;
    const type = header.typeflag === "\0" ? (name.endsWith("/") ? "5" : "0") : header.typeflag;
    if (!ENTRY_TYPES.has(type)) throw tarError(offset, `entry type ${JSON.stringify(type)} is not one containerd unpacks`);
    const dataSize = HEADER_ONLY_TYPES.has(type) ? 0 : size;
    take(dataSize);
    yield Object.freeze({
      name,
      type,
      mode: header.mode & 0o7777,
      uid,
      gid,
      size: dataSize,
      linkname,
      devmajor: header.devmajor,
      devminor: header.devminor,
      dataOffset,
      xattrs: Object.freeze(xattrs),
    });
    pax = null;
    longName = null;
    longLink = null;
  }
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
 * The whiteouts one uncompressed layer carries.
 * @param {string} layer
 * @param {Buffer} archive
 * @returns {LayerReport}
 */
function inspectLayerArchive(layer, archive) {
  /** @type {WhiteoutEntry[]} */
  const whiteouts = [];
  let entries = 0;
  for (const entry of readTarEntries(archive)) {
    entries += 1;
    const kind = classifyWhiteout(entry.name);
    if (kind) whiteouts.push(Object.freeze({ path: entry.name, kind }));
  }
  return Object.freeze({ layer, entries, whiteouts: Object.freeze(whiteouts) });
}

/**
 * The whiteouts one layer blob carries.
 * @param {string} layer
 * @param {Buffer} blob
 * @returns {LayerReport}
 */
function inspectLayer(layer, blob) {
  return inspectLayerArchive(layer, layerArchive(blob));
}

/**
 * The uncompressed layers of a `docker save` archive, in the order its manifest applies them. Both
 * the classic archive (`<id>/layer.tar`, which may be a symlink to an identical layer) and the OCI
 * layout (`blobs/sha256/<hex>`) list their layers in `manifest.json`.
 * @param {Buffer} archive
 * @returns {SavedLayer[]}
 */
function readSavedImageLayers(archive) {
  /** @type {Map<string, Buffer>} */
  const members = new Map();
  /** @type {Map<string, string>} */
  const symlinks = new Map();
  for (const entry of readTarEntries(archive)) {
    const name = cleanPath(entry.name);
    if (entry.type === "0") members.set(name, archive.subarray(entry.dataOffset, entry.dataOffset + entry.size));
    else if (entry.type === "2") symlinks.set(name, cleanPath(path.posix.join(path.posix.dirname(name), entry.linkname)));
  }
  /** @param {string} name */
  const member = (name) => {
    let resolved = cleanPath(name);
    for (let hops = 0; hops < 8 && !members.has(resolved) && symlinks.has(resolved); hops += 1) {
      resolved = /** @type {string} */ (symlinks.get(resolved));
    }
    return members.get(resolved);
  };
  const manifestBytes = member("manifest.json");
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
    const blob = member(layer);
    if (!blob) throw new Error(`Saved image archive is missing layer ${layer}.`);
    return Object.freeze({ layer, archive: layerArchive(blob) });
  });
}

/**
 * The layer reports of a `docker save` archive, in the order its manifest applies them.
 * @param {Buffer} archive
 * @returns {LayerReport[]}
 */
function inspectSavedImageArchive(archive) {
  return readSavedImageLayers(archive).map(({ layer, archive: layerTar }) => inspectLayerArchive(layer, layerTar));
}

/**
 * A local image's `docker save` archive.
 * @param {string} reference
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<Buffer>}
 */
async function saveImage(reference, options = {}) {
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
    return await fs.readFile(archivePath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/**
 * The layer reports of a local image, read through `docker save`.
 * @param {string} reference
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<LayerReport[]>}
 */
async function inspectImageLayers(reference, options = {}) {
  return inspectSavedImageArchive(await saveImage(reference, options));
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
 * Refuse an image whose layers carry any whiteout, or that this inspection cannot read.
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
  cleanPath,
  describeWhiteouts,
  inspectImageLayers,
  inspectLayer,
  inspectLayerArchive,
  inspectSavedImageArchive,
  parseCliArgs,
  readSavedImageLayers,
  readTarEntries,
  saveImage,
};
