// Runtime image layer inspection and flattened-image equivalence.
//
// The preview host's Docker storage could not unpack v0.33.33.50: its image removed the base image's
// package managers in a later layer, and that layer's whiteouts named non-empty lower directories. The
// runtime image now carries its filesystem in one layer, image builds refuse any layer with a whiteout,
// and an equivalence check proves the flattened image keeps its reference stage's files, metadata,
// and configuration. These cases drive both checks with tar archives built here. They cover the
// naming rules of Go's archive/tar, which the consumer uses, and each malformed or unsupported form
// the reader must refuse.

import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  classifyWhiteout,
  describeWhiteouts,
  inspectLayer,
  inspectSavedImageArchive,
  readTarEntries,
} from "../../scripts/release/image-layers.mjs";
import {
  compareFilesystems,
  compareImageConfigurations,
  exportManifest,
  layersManifest,
} from "../../scripts/release/runtime-image-equivalence.mjs";

/**
 * @typedef {object} FixtureEntry
 * @property {string} name
 * @property {string} [type]
 * @property {Buffer | string} [data]
 * @property {number} [mode]
 * @property {number} [uid]
 * @property {number} [gid]
 * @property {string} [linkname]
 * @property {number} [headerSize] the header's size field, when it differs from the data
 * @property {number} [devmajor]
 * @property {number} [devminor]
 * @property {"posix" | "gnu" | "star" | "v7"} [format]
 * @property {string} [prefix]
 * @property {string} [trailing] bytes written at offset 345 of a GNU header, where its atime field begins
 * @property {(block: Buffer) => void} [edit] a change to the header block before its checksum is computed
 * @property {"unsigned" | "signed"} [checksum]
 */

/**
 * @param {Buffer} block
 * @param {number} offset
 * @param {number} length
 * @param {number} value
 */
function writeOctal(block, offset, length, value) {
  block.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "latin1");
}

/** @param {FixtureEntry & { size: number }} entry */
function header(entry) {
  const block = Buffer.alloc(512);
  block.write(entry.name, 0, 100, "latin1");
  writeOctal(block, 100, 8, entry.mode ?? 0o644);
  writeOctal(block, 108, 8, entry.uid ?? 0);
  writeOctal(block, 116, 8, entry.gid ?? 0);
  writeOctal(block, 124, 12, entry.size);
  writeOctal(block, 136, 12, 0);
  block.write(entry.type ?? "0", 156, 1, "latin1");
  block.write(entry.linkname ?? "", 157, 100, "latin1");
  const format = entry.format ?? "posix";
  if (format === "posix" || format === "star") {
    block.write("ustar\0", 257, 6, "latin1");
    block.write("00", 263, 2, "latin1");
  } else if (format === "gnu") {
    block.write("ustar  \0", 257, 8, "latin1");
  }
  if (format !== "v7") {
    writeOctal(block, 329, 8, entry.devmajor ?? 0);
    writeOctal(block, 337, 8, entry.devminor ?? 0);
  }
  if (format === "posix") block.write(entry.prefix ?? "", 345, 155, "latin1");
  if (format === "star") {
    block.write(entry.prefix ?? "", 345, 131, "latin1");
    writeOctal(block, 476, 12, 0);
    writeOctal(block, 488, 12, 0);
    block.write("tar\0", 508, 4, "latin1");
  }
  if (format === "gnu") block.write(entry.trailing ?? "", 345, 155, "latin1");
  entry.edit?.(block);
  block.fill(0x20, 148, 156);
  let unsigned = 0;
  let signed = 0;
  for (const byte of block) {
    unsigned += byte;
    signed += byte >= 0x80 ? byte - 0x100 : byte;
  }
  block.write(`${(entry.checksum === "signed" ? signed : unsigned).toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return block;
}

/** @param {Buffer} data */
function padded(data) {
  return Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

/** @param {Buffer | string | undefined} data */
function bytes(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data ?? "", "latin1");
}

/**
 * Entries, then the end-of-archive marker unless another ending is given.
 * @param {readonly FixtureEntry[]} entries
 * @param {Buffer} [ending]
 */
function tar(entries, ending = Buffer.alloc(1024)) {
  return Buffer.concat([
    ...entries.flatMap((entry) => {
      const data = bytes(entry.data);
      return [header({ ...entry, size: entry.headerSize ?? data.length }), padded(data)];
    }),
    ending,
  ]);
}

/**
 * A PAX record, whose leading length counts the whole record, its own digits included.
 * @param {string} key
 * @param {Buffer | string} value
 */
function paxRecord(key, value) {
  const body = Buffer.concat([Buffer.from(` ${key}=`, "latin1"), bytes(value), Buffer.from("\n")]);
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return Buffer.concat([Buffer.from(String(length)), body]);
}

/** @param {...Buffer} records */
const pax = (...records) => ({ name: "PaxHeader/entry", type: "x", data: Buffer.concat(records) });

/** @param {Buffer} archive */
const whiteoutPaths = (archive) => inspectLayer("fixture", archive).whiteouts.map((whiteout) => whiteout.path);

const LONG_DIRECTORY = `${"nested-directory-name/".repeat(6)}deep`;
// The layer that failed to unpack on the preview host: the removal of the base image's package managers.
const FAILED_PREVIEW_LAYER = [
  "opt/.wh.yarn-v1.22.22",
  "usr/local/bin/.wh.corepack",
  "usr/local/bin/.wh.npm",
  "usr/local/bin/.wh.npx",
  "usr/local/bin/.wh.yarn",
  "usr/local/bin/.wh.yarnpkg",
  "usr/local/lib/node_modules/.wh.corepack",
  "usr/local/lib/node_modules/.wh.npm",
];

describe("whiteout classification", () => {
  it("recognizes ordinary and opaque whiteouts by the base name of the cleaned path, as containerd does", () => {
    for (const name of [".wh.removed", "opt/.wh.yarn-v1.22.22", "./usr/local/bin/.wh.npm", "var/lib/apt/lists/.wh.auxfiles/", "opt/.wh.removed-tree/.", "opt//.wh.removed-tree//", "opt/.wh.removed-tree/x/..", "../.wh.escape"]) {
      expect(classifyWhiteout(name), name).toBe("whiteout");
    }
    for (const name of ["srv/data/.wh..wh..opq", ".wh..wh..opq", "/srv/.wh..wh..opq/."]) expect(classifyWhiteout(name), name).toBe("opaque");
  });

  it("leaves ordinary names alone, including ones that merely contain .wh. or name a whiteout only as a directory", () => {
    for (const name of ["usr/bin/node", "srv/data/", "notes.wh.txt", "a/b.wh.c", "wh.x", "opt/.wh.removed-tree/kept", ".", "/", "..", ""]) {
      expect(classifyWhiteout(name), name).toBeNull();
    }
  });
});

describe("layer inspection", () => {
  it("accepts a layer with no whiteout and counts its entries", () => {
    const report = inspectLayer("clean", tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "opt/longtail-forge/server.js", data: "console.log('ok');\n" },
      { name: "usr/local/bin/node", data: "binary", mode: 0o755 },
    ]));
    expect(report).toEqual({ layer: "clean", entries: 3, whiteouts: [] });
  });

  it("finds every whiteout of the layer that failed on the preview host, in plain and gzip layers", () => {
    const layer = tar(FAILED_PREVIEW_LAYER.map((name) => ({ name })));
    for (const blob of [layer, gzipSync(layer)]) {
      const report = inspectLayer("failed", blob);
      expect(report.whiteouts.map((whiteout) => whiteout.path)).toEqual(FAILED_PREVIEW_LAYER);
      expect(report.whiteouts.every((whiteout) => whiteout.kind === "whiteout")).toBe(true);
    }
  });

  it("finds an opaque whiteout beside ordinary files, and a hard link whose own name is a whiteout", () => {
    const report = inspectLayer("opaque", tar([
      { name: "srv/data/", type: "5" },
      { name: "srv/data/.wh..wh..opq" },
      { name: "srv/data/fresh.txt", data: "new" },
      { name: "srv/.wh.linked", type: "1", linkname: "srv/data/fresh.txt" },
    ]));
    expect(report.whiteouts).toEqual([{ path: "srv/data/.wh..wh..opq", kind: "opaque" }, { path: "srv/.wh.linked", kind: "whiteout" }]);
  });

  it("names an entry by its PAX path, or by a GNU long name, which overrides the PAX path as in Go", () => {
    const longPath = `${LONG_DIRECTORY}/.wh.removed-tree`;
    expect(whiteoutPaths(tar([pax(paxRecord("path", longPath)), { name: "truncated-visible-name" }]))).toEqual([longPath]);
    expect(whiteoutPaths(tar([
      { name: "././@LongLink", type: "L", data: `${longPath}\0`, format: "gnu" },
      { name: "truncated-visible-name", format: "gnu" },
    ]))).toEqual([longPath]);
    // Codex's reproduction: a safe PAX path, then a GNU long name that is a whiteout.
    expect(whiteoutPaths(tar([
      pax(paxRecord("path", "opt/safe")),
      { name: "././@LongLink", type: "L", data: "opt/.wh.removed-tree\0", format: "gnu" },
      { name: "short", format: "gnu" },
    ]))).toEqual(["opt/.wh.removed-tree"]);
  });

  it("takes a link target from a PAX linkpath, or from a GNU long link, which overrides it", () => {
    const target = `${LONG_DIRECTORY}/target`;
    const [fromPax] = [...readTarEntries(tar([pax(paxRecord("linkpath", target)), { name: "opt/link", type: "2", linkname: "short" }]))];
    expect(fromPax?.linkname).toBe(target);
    const [fromGnu] = [...readTarEntries(tar([
      pax(paxRecord("linkpath", "opt/pax-target")),
      { name: "././@LongLink", type: "K", data: `${target}\0`, format: "gnu" },
      { name: "opt/link", type: "2", linkname: "short", format: "gnu" },
    ]))];
    expect(fromGnu?.linkname).toBe(target);
  });

  it("keeps the header's value for an empty PAX record or an empty GNU long name, as Go does", () => {
    // Codex's reproduction: an empty PAX path must not hide the header's whiteout name.
    expect(whiteoutPaths(tar([pax(paxRecord("path", "")), { name: "opt/.wh.removed-tree" }]))).toEqual(["opt/.wh.removed-tree"]);
    expect(whiteoutPaths(tar([
      pax(paxRecord("path", "opt/.wh.from-pax")),
      { name: "././@LongLink", type: "L", data: "\0", format: "gnu" },
      { name: "short", format: "gnu" },
    ]))).toEqual(["opt/.wh.from-pax"]);
    // An empty PAX size keeps the header's size, so the next header is read where it is.
    expect(whiteoutPaths(tar([pax(paxRecord("size", "")), { name: "opt/file", data: "x".repeat(600) }, { name: "opt/.wh.after" }]))).toEqual(["opt/.wh.after"]);
  });

  it("finds a whiteout that an unnormalized name spells, as containerd cleans it", () => {
    // Codex's reproduction: the raw base name is ".", but the cleaned path is a whiteout.
    expect(whiteoutPaths(tar([{ name: "opt/.wh.removed-tree/." }]))).toEqual(["opt/.wh.removed-tree/."]);
    expect(whiteoutPaths(tar([{ name: "opt//.wh.removed-tree//", type: "5" }]))).toEqual(["opt//.wh.removed-tree//"]);
  });

  it("reads no data for a header-only entry, whatever its size field says", () => {
    for (const type of ["1", "2", "3", "4", "5", "6"]) {
      const archive = tar([
        { name: "opt/entry", type, linkname: type === "1" ? "opt/entry" : "", headerSize: 512 },
        { name: "opt/.wh.hidden-behind-a-size" },
      ]);
      expect(whiteoutPaths(archive), type).toEqual(["opt/.wh.hidden-behind-a-size"]);
    }
    // A legacy NUL-type entry whose name ends in a slash is a directory, with no data either.
    expect(whiteoutPaths(tar([{ name: "opt/legacy/", type: "\0", headerSize: 512 }, { name: "opt/.wh.after-legacy" }]))).toEqual(["opt/.wh.after-legacy"]);
  });

  it("joins a POSIX prefix or a shorter STAR prefix to the name, and reads a V7 header without one", () => {
    expect([...readTarEntries(tar([{ name: ".wh.gone", prefix: "usr/local/lib/node_modules" }]))].map((entry) => entry.name)).toEqual(["usr/local/lib/node_modules/.wh.gone"]);
    // A STAR prefix that fills its 131 bytes ends where the STAR access time begins.
    const starPrefix = `${"p".repeat(127)}/opt`;
    expect(whiteoutPaths(tar([{ name: ".wh.star", prefix: starPrefix, format: "star" }]))).toEqual([`${starPrefix}/.wh.star`]);
    expect([...readTarEntries(tar([{ name: "plain-file", format: "gnu" }, { name: "v7/.wh.old", format: "v7" }]))].map((entry) => entry.name)).toEqual(["plain-file", "v7/.wh.old"]);
  });

  it("accepts a checksum computed with signed bytes, and reads numbers as Go does", () => {
    expect(whiteoutPaths(tar([{ name: "opt/.wh.café", checksum: "signed" }]))).toEqual(["opt/.wh.café"]);
    // Leading and trailing spaces and NULs around an octal number are ignored.
    const spaced = tar([{ name: "opt/file", data: "x".repeat(600), edit: (block) => block.write("\0\0 0001130 \0", 124, 12, "latin1") }, { name: "opt/.wh.after-spaced" }]);
    expect(whiteoutPaths(spaced)).toEqual(["opt/.wh.after-spaced"]);
    // A size in base-256.
    const binary = tar([{ name: "opt/file", data: "x".repeat(600), edit: (block) => { block.fill(0, 124, 136); block[124] = 0x80; block.writeUInt16BE(600, 134); } }, { name: "opt/.wh.after-binary" }]);
    expect(whiteoutPaths(binary)).toEqual(["opt/.wh.after-binary"]);
  });

  it("applies PAX ownership, size, and extended attribute bytes to the member that follows", () => {
    const capability = Buffer.from([0x01, 0x00, 0x00, 0x02, 0x80, 0xff]);
    const entries = [...readTarEntries(tar([
      pax(paxRecord("uid", "10001"), paxRecord("gid", "10001"), paxRecord("size", "6"), paxRecord("SCHILY.xattr.security.capability", capability), paxRecord("SCHILY.xattr.user.empty", "")),
      { name: "usr/local/bin/node", data: "binary", mode: 0o755, headerSize: 0 },
      { name: "usr/local/bin/after", data: "next" },
    ]))];
    expect(entries.map((entry) => entry.name)).toEqual(["usr/local/bin/node", "usr/local/bin/after"]);
    expect(entries[0]).toMatchObject({ uid: 10001, gid: 10001, size: 6, mode: 0o755, xattrs: { "security.capability": capability.toString("hex"), "user.empty": "" } });
    expect(entries[1]).toMatchObject({ uid: 0, gid: 0, size: 4, xattrs: {} });
  });

  it("keeps a PAX size for its member, not for the GNU long name between them", () => {
    const longPath = `${LONG_DIRECTORY}/.wh.removed-tree`;
    const [entry] = [...readTarEntries(tar([
      pax(paxRecord("size", "6")),
      { name: "././@LongLink", type: "L", data: `${longPath}\0` },
      { name: "truncated-visible-name", data: "binary", headerSize: 0 },
    ]))];
    expect(entry).toMatchObject({ name: longPath, size: 6 });
  });

  it("accepts PAX times within a signed 64-bit range, and refuses any beyond it, as Go does", () => {
    for (const value of ["9223372036854775807", "-9223372036854775808", "+0.5", "1700000000.123456789", "7."]) {
      expect(inspectLayer(value, tar([pax(paxRecord("mtime", value)), { name: "opt/file", data: "x" }])).entries, value).toBe(1);
    }
    // Codex's reproduction, and each boundary overflowed by one.
    for (const value of ["99999999999999999999999999999999999999", "9223372036854775808", "-9223372036854775809"]) {
      expect(() => inspectLayer(value, tar([pax(paxRecord("atime", value)), { name: "opt/file", data: "x" }])), value).toThrow(/the PAX atime record is not a time/);
    }
  });

  it("accepts an empty archive, a lone zero block, and the empty WORKDIR layer with zero padding", () => {
    for (const archive of [Buffer.alloc(0), Buffer.alloc(512), Buffer.alloc(1024), Buffer.alloc(10240)]) {
      expect(inspectLayer("empty", archive)).toEqual({ layer: "empty", entries: 0, whiteouts: [] });
    }
  });

  it("refuses metadata it cannot read unambiguously: repeated, global, or sparse", () => {
    const refusals = /** @type {const} */ ([
      ["a second PAX header", [pax(paxRecord("path", "opt/safe")), pax(paxRecord("mtime", "1")), { name: "opt/.wh.x" }], /second PAX header/],
      ["a second GNU long name", [{ name: "L", type: "L", data: "a\0", format: "gnu" }, { name: "L", type: "L", data: "b\0", format: "gnu" }, { name: "x", format: "gnu" }], /second GNU long name/],
      ["a second GNU long link", [{ name: "K", type: "K", data: "a\0", format: "gnu" }, { name: "K", type: "K", data: "b\0", format: "gnu" }, { name: "x", type: "2", format: "gnu" }], /second GNU long link/],
      ["a global header", [{ name: "pax_global_header", type: "g", data: paxRecord("path", "opt/.wh.global") }], /global header/],
      ["a GNU sparse entry", [{ name: "opt/sparse", type: "S" }], /GNU sparse entry/],
      ["a GNU sparse PAX record", [pax(paxRecord("GNU.sparse.name", "opt/.wh.renamed")), { name: "opt/safe" }], /GNU sparse PAX record/],
      ["a contiguous file", [{ name: "opt/contiguous", type: "7" }], /not one containerd unpacks/],
      ["a GNU directory dump", [{ name: "opt/dump", type: "D" }], /not one containerd unpacks/],
      ["a pre-Go 1.8 GNU prefix", [{ name: "plain-file", format: "gnu", trailing: "usr/local/.wh.prefix" }], /pre-Go 1\.8 prefix form/],
    ]);
    for (const [label, entries, message] of refusals) {
      expect(() => inspectLayer(label, tar(entries)), label).toThrow(message);
    }
  });

  it("refuses malformed PAX records and values", () => {
    const records = /** @type {const} */ ([
      ["a wrong length", Buffer.from("99 path=opt/x\n")],
      ["no newline", Buffer.from("14 path=opt/xy")],
      ["no key", Buffer.from("10 =opt/x\n")],
      ["trailing bytes", Buffer.concat([paxRecord("path", "opt/x"), Buffer.from("junk")])],
      ["a NUL in a path", paxRecord("path", "opt/x\0y")],
      ["a uid that is not a number", paxRecord("uid", "ten")],
      ["a size that is not a number", paxRecord("size", "6 bytes")],
      ["a time that is not a time", paxRecord("mtime", "1.2.3")],
    ]);
    for (const [label, data] of records) {
      expect(() => inspectLayer(label, tar([{ name: "PaxHeader/entry", type: "x", data }, { name: "opt/x", data: "abcdef" }])), label).toThrow(/Tar archive is malformed or unsupported/);
    }
    expect(() => inspectLayer("huge", tar([{ name: "PaxHeader/entry", type: "x", data: Buffer.alloc((1 << 20) + 1, 0x41) }, { name: "opt/x" }]))).toThrow(/exceeds 1 MiB/);
  });

  it("refuses broken framing: short, partial, or corrupt blocks, dangling metadata, and data after the end", () => {
    const valid = tar([{ name: "opt/x", data: "x" }]);
    const framing = /** @type {const} */ ([
      ["a short buffer that is not a tar archive", Buffer.from("this is not a tar file"), /ends inside a header block/],
      ["a partial final header", Buffer.concat([valid.subarray(0, 1024), Buffer.alloc(100, 0x41)]), /ends inside a header block/],
      ["a zero block followed by a header", Buffer.concat([valid.subarray(0, 1024), Buffer.alloc(512), header({ name: "opt/.wh.after-zero", size: 0 })]), /zero block is followed by a header/],
      ["data after the end-of-archive marker", Buffer.concat([valid, Buffer.from("trailer")]), /data follows the end-of-archive marker/],
      ["a truncated end-of-archive marker", Buffer.concat([valid.subarray(0, 1024), Buffer.alloc(600)]), /end-of-archive marker is truncated/],
      ["truncated data", tar([{ name: "usr/bin/node", data: "x".repeat(2000) }]).subarray(0, 1024), /truncated or has an invalid size/],
      ["truncated padding", tar([{ name: "usr/bin/node", data: "x".repeat(600) }], Buffer.alloc(0)).subarray(0, 1200), /truncated or has an invalid size/],
      ["a PAX header with no entry", tar([pax(paxRecord("path", "opt/.wh.dangling"))]), /without an entry to describe/],
      ["a GNU long name with no entry", tar([{ name: "L", type: "L", data: "opt/.wh.dangling\0", format: "gnu" }], Buffer.alloc(0)), /without an entry to describe/],
      ["an invalid octal number", tar([{ name: "opt/x", edit: (block) => block.write("0006x4\0", 100, 8, "latin1") }]), /mode field is not an octal number/],
      ["a negative size", tar([{ name: "opt/x", edit: (block) => block.fill(0xff, 124, 136) }]), /size is negative/],
    ]);
    for (const [label, archive, message] of framing) {
      expect(() => inspectLayer(label, archive), label).toThrow(message);
    }
    const corrupt = tar([{ name: "usr/bin/node", data: "binary" }]);
    corrupt.write("x", 0, 1, "latin1");
    expect(() => inspectLayer("corrupt", corrupt)).toThrow(/fails its checksum/);
    expect(() => inspectLayer("zstd", Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]))).toThrow(/zstd/);
  });
});

describe("saved image archives", () => {
  const failedLayer = gzipSync(tar(FAILED_PREVIEW_LAYER.map((name) => ({ name }))));
  const cleanLayer = tar([{ name: "opt/longtail-forge/server.js", data: "ok" }]);

  it("reports each layer in the order the manifest applies them, for the OCI layout and the classic archive", () => {
    const layouts = /** @type {const} */ ([["blobs/sha256/aaaa", "blobs/sha256/bbbb"], ["aaaa/layer.tar", "bbbb/layer.tar"]]);
    for (const [first, second] of layouts) {
      const archive = tar([
        { name: "manifest.json", data: JSON.stringify([{ Config: "config.json", RepoTags: ["probe:latest"], Layers: [first, second] }]) },
        { name: first, data: cleanLayer },
        { name: second, data: failedLayer },
      ]);
      const reports = inspectSavedImageArchive(archive);
      expect(reports.map((report) => [report.layer, report.whiteouts.length])).toEqual([[first, 0], [second, FAILED_PREVIEW_LAYER.length]]);
    }
  });

  it("follows a classic archive's link to an identical layer", () => {
    const archive = tar([
      { name: "manifest.json", data: JSON.stringify([{ Layers: ["aaaa/layer.tar", "bbbb/layer.tar"] }]) },
      { name: "aaaa/", type: "5" },
      { name: "aaaa/layer.tar", data: failedLayer },
      { name: "bbbb/", type: "5" },
      { name: "bbbb/layer.tar", type: "2", linkname: "../aaaa/layer.tar" },
    ]);
    expect(inspectSavedImageArchive(archive).map((report) => report.whiteouts.length)).toEqual([FAILED_PREVIEW_LAYER.length, FAILED_PREVIEW_LAYER.length]);
  });

  it("refuses an archive without its manifest, or missing a listed layer", () => {
    expect(() => inspectSavedImageArchive(tar([{ name: "blobs/sha256/aaaa", data: cleanLayer }]))).toThrow(/no manifest\.json/);
    const missing = tar([{ name: "manifest.json", data: JSON.stringify([{ Layers: ["blobs/sha256/absent"] }]) }]);
    expect(() => inspectSavedImageArchive(missing)).toThrow(/missing layer blobs\/sha256\/absent/);
    const two = tar([{ name: "manifest.json", data: JSON.stringify([{ Layers: ["a"] }, { Layers: ["b"] }]) }]);
    expect(() => inspectSavedImageArchive(two)).toThrow(/exactly one image/);
  });

  it("refuses an image with the failed layer, or with a whiteout only Go's naming reveals, and accepts one that has none", () => {
    const refusal = describeWhiteouts("ghcr.io/example/runtime@sha256:failed", [
      inspectLayer("base", cleanLayer),
      inspectLayer("package-managers", failedLayer),
    ]);
    expect(refusal).toMatch(/carries 8 whiteout\(s\) in 1 of 2 layer\(s\)/);
    expect(refusal).toContain("opt/.wh.yarn-v1.22.22");
    // Codex's reproduction: the empty-PAX whiteout inside a saved image.
    const hidden = tar([pax(paxRecord("path", "")), { name: "opt/.wh.removed-tree" }]);
    const saved = tar([{ name: "manifest.json", data: JSON.stringify([{ Layers: ["layer.tar"] }]) }, { name: "layer.tar", data: hidden }]);
    expect(describeWhiteouts("fixture:whiteout", inspectSavedImageArchive(saved))).toMatch(/carries 1 whiteout\(s\) in 1 of 1 layer\(s\).*opt\/\.wh\.removed-tree/);
    expect(describeWhiteouts("ghcr.io/example/runtime@sha256:flattened", [inspectLayer("only", cleanLayer)])).toBeNull();
  });
});

describe("flattened image equivalence", () => {
  /** @param {readonly FixtureEntry[]} extra */
  const filesystem = (extra = []) => exportManifest(tar([
    { name: "opt/", type: "5", mode: 0o755 },
    { name: "opt/longtail-forge/", type: "5", mode: 0o555 },
    { name: "opt/longtail-forge/server.js", data: "console.log('ok');\n", mode: 0o444 },
    { name: "usr/", type: "5", mode: 0o755 },
    { name: "usr/local/", type: "5", mode: 0o755 },
    { name: "usr/local/bin/", type: "5", mode: 0o755 },
    { name: "usr/local/bin/node", data: "binary", mode: 0o755 },
    { name: "usr/local/bin/nodejs", type: "2", linkname: "node", mode: 0o777 },
    { name: "var/", type: "5", mode: 0o755 },
    { name: "var/lib/", type: "5", mode: 0o755 },
    { name: "var/lib/longtail-forge/", type: "5", mode: 0o700, uid: 10001, gid: 10001 },
    ...extra,
  ]));
  const none = { missing: [], extra: [], changed: [] };
  /** @param {ReturnType<typeof compareFilesystems>} comparison */
  const fields = (comparison) => comparison.changed.map((difference) => `${difference.path}:${difference.field}`).sort();

  it("records types, ownership, content, symlinks, devices, attribute bytes, and hard-link groups", () => {
    const manifest = filesystem([
      { name: "usr/local/bin/node-link", type: "1", linkname: "usr/local/bin/node", mode: 0o755 },
      { name: "dev/", type: "5" },
      { name: "dev/null", type: "3", mode: 0o666, devmajor: 1, devminor: 3 },
      pax(paxRecord("SCHILY.xattr.security.capability", Buffer.from([0x01, 0x00, 0x00, 0x02, 0x80]))),
      { name: "usr/local/bin/capable", data: "cap", mode: 0o755 },
      // containerd writes an absolute or escaping name beneath the root.
      { name: "/usr/local/bin/absolute", data: "a" },
      { name: "../../escaped", data: "e" },
    ]);
    expect(manifest.files.get("usr/local/bin/absolute")).toMatchObject({ type: "file", size: 1 });
    expect(manifest.files.get("escaped")).toMatchObject({ type: "file", size: 1 });
    expect(manifest.files.get("usr/local/bin/node")).toMatchObject({ type: "file", size: 6, hardlinks: ["usr/local/bin/node-link"] });
    expect(manifest.files.get("usr/local/bin/node-link")).toMatchObject({ type: "file", size: 6, hardlinks: ["usr/local/bin/node"] });
    expect(manifest.files.get("usr/local/bin/nodejs")).toMatchObject({ type: "symlink", linkname: "node", hardlinks: [] });
    expect(manifest.files.get("var/lib/longtail-forge")).toMatchObject({ type: "directory", mode: 0o700, uid: 10001, gid: 10001 });
    expect(manifest.files.get("dev/null")).toMatchObject({ type: "character-device", devmajor: 1, devminor: 3 });
    expect(manifest.files.get("usr/local/bin/capable")?.xattrs).toEqual({ "security.capability": "0100000280" });
    expect(manifest).toMatchObject({ hardlinkGroups: 1, linkedPaths: 2, xattrPaths: 1, devices: 1 });
  });

  it("finds identical filesystems equal", () => {
    expect(compareFilesystems(filesystem(), filesystem())).toEqual(none);
  });

  it("finds a hard link and an independent copy with the same bytes different", () => {
    // Codex's reproduction: replacing a hard link with a copy.
    const linked = filesystem([{ name: "usr/local/bin/copy", type: "1", linkname: "usr/local/bin/node", mode: 0o755 }]);
    const copied = filesystem([{ name: "usr/local/bin/copy", data: "binary", mode: 0o755 }]);
    expect(fields(compareFilesystems(linked, copied))).toEqual(["usr/local/bin/copy:hardlinks", "usr/local/bin/node:hardlinks"]);
  });

  it("finds changed device numbers, capability bytes, and an extended attribute present on one side only", () => {
    // Codex's reproductions: device 1:3 against 1:5, and permitted capabilities 0x80 against 0x81,
    // which differ only in bytes that are not valid UTF-8.
    /** @param {number} minor */
    const device = (minor) => filesystem([{ name: "dev/", type: "5" }, { name: "dev/test", type: "3", mode: 0o666, devmajor: 1, devminor: minor }]);
    expect(fields(compareFilesystems(device(3), device(5)))).toEqual(["dev/test:devminor"]);
    /** @param {number} permitted */
    const capability = (permitted) => {
      const value = Buffer.alloc(20);
      value.writeUInt32LE(0x02000001, 0);
      value[4] = permitted;
      return filesystem([pax(paxRecord("SCHILY.xattr.security.capability", value)), { name: "opt/capable", data: "x" }]);
    };
    expect(fields(compareFilesystems(capability(0x80), capability(0x81)))).toEqual(["opt/capable:xattrs"]);
    const plain = filesystem([{ name: "opt/labelled", data: "x" }]);
    const labelled = filesystem([pax(paxRecord("SCHILY.xattr.user.mime_type", "text/plain")), { name: "opt/labelled", data: "x" }]);
    expect(fields(compareFilesystems(labelled, plain))).toEqual(["opt/labelled:xattrs"]);
  });

  it("reports every changed, missing, and extra path", () => {
    const reference = filesystem([{ name: "etc/", type: "5" }, { name: "etc/keep", data: "a" }, { name: "etc/os-release", type: "2", linkname: "../usr/lib/os-release", mode: 0o777 }]);
    const candidate = exportManifest(tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "opt/longtail-forge/", type: "5", mode: 0o555 },
      { name: "opt/longtail-forge/server.js", data: "console.log('changed');\n", mode: 0o444 },
      { name: "usr/", type: "5", mode: 0o755 },
      { name: "usr/local/", type: "5", mode: 0o755 },
      { name: "usr/local/bin/", type: "5", mode: 0o755 },
      pax(paxRecord("SCHILY.xattr.security.capability", "cap")),
      { name: "usr/local/bin/node", data: "binary", mode: 0o755, uid: 10001 },
      { name: "usr/local/bin/nodejs", type: "2", linkname: "node-24", mode: 0o777 },
      { name: "var/", type: "5", mode: 0o755 },
      { name: "var/lib/", type: "5", mode: 0o755 },
      { name: "var/lib/longtail-forge/", type: "5", mode: 0o755, uid: 10001, gid: 0 },
      { name: "etc/", type: "5" },
      { name: "etc/os-release", type: "5", mode: 0o777 },
      { name: "usr/local/bin/npm", data: "package manager", mode: 0o755 },
    ]));
    const comparison = compareFilesystems(reference, candidate);
    expect(comparison.missing).toEqual(["etc/keep"]);
    expect(comparison.extra).toEqual(["usr/local/bin/npm"]);
    expect(fields(comparison)).toEqual([
      "etc/os-release:linkname",
      "etc/os-release:type",
      "opt/longtail-forge/server.js:sha256",
      "opt/longtail-forge/server.js:size",
      "usr/local/bin/node:uid",
      "usr/local/bin/node:xattrs",
      "usr/local/bin/nodejs:linkname",
      "var/lib/longtail-forge:gid",
      "var/lib/longtail-forge:mode",
    ]);
  });

  it("applies layers as containerd does: whiteouts, opaque directories, replacements, and links", () => {
    const base = tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "opt/yarn/", type: "5" },
      { name: "opt/yarn/bin/", type: "5" },
      { name: "opt/yarn/bin/yarn", data: "yarn" },
      { name: "srv/", type: "5", mode: 0o755 },
      { name: "srv/old", data: "old" },
      { name: "srv/older/", type: "5" },
      { name: "srv/older/file", data: "older" },
      { name: "usr/", type: "5" },
      { name: "usr/bin/", type: "5" },
      { name: "usr/bin/perl", data: "perl 1" },
      { name: "usr/bin/perl5", type: "1", linkname: "usr/bin/perl" },
      { name: "usr/bin/gunzip", data: "gunzip" },
      { name: "usr/bin/uncompress", type: "1", linkname: "usr/bin/gunzip" },
      { name: "var/", type: "5", mode: 0o755 },
      pax(paxRecord("SCHILY.xattr.user.lower", "1")),
      { name: "var/data/", type: "5", mode: 0o700 },
      { name: "var/data/kept", data: "kept" },
    ]);
    const changes = tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "opt/.wh.yarn" },
      { name: "srv/", type: "5", mode: 0o750 },
      { name: "srv/new", data: "new" },
      { name: "srv/.wh..wh..opq" },
      { name: "usr/", type: "5" },
      { name: "usr/bin/", type: "5" },
      { name: "usr/bin/perl", data: "perl 2" },
      { name: "usr/bin/perl5", type: "1", linkname: "usr/bin/perl" },
      { name: "usr/bin/gunzip", data: "gunzip 2" },
      { name: "var/", type: "5", mode: 0o755 },
      pax(paxRecord("SCHILY.xattr.user.upper", "2")),
      { name: "var/data/", type: "5", mode: 0o750 },
    ]);
    const merged = layersManifest([base, changes]);
    // A directory over a directory keeps the lower one's extended attributes beside its own.
    expect(merged.files.get("var/data")?.xattrs).toEqual({ "user.lower": "31", "user.upper": "32" });
    expect([...merged.files.keys()]).toEqual(["opt", "srv", "srv/new", "usr", "usr/bin", "usr/bin/gunzip", "usr/bin/perl", "usr/bin/perl5", "usr/bin/uncompress", "var", "var/data", "var/data/kept"]);
    expect(merged.files.get("srv")).toMatchObject({ mode: 0o750 });
    expect(merged.files.get("var/data")).toMatchObject({ mode: 0o750 });
    expect(merged.files.get("usr/bin/perl5")).toMatchObject({ hardlinks: ["usr/bin/perl"] });
    // Rewriting one path of a shared file breaks the link: the other path keeps the old file.
    expect(merged.files.get("usr/bin/uncompress")).toMatchObject({ hardlinks: [] });
    expect(merged.files.get("usr/bin/gunzip")).toMatchObject({ hardlinks: [] });
    expect(merged.files.get("usr/bin/gunzip")?.sha256).not.toBe(merged.files.get("usr/bin/uncompress")?.sha256);

    // The same final state written as one layer, as the flattening copy writes it, is equivalent.
    const flattened = layersManifest([tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "srv/", type: "5", mode: 0o750 },
      { name: "srv/new", data: "new" },
      { name: "usr/", type: "5" },
      { name: "usr/bin/", type: "5" },
      { name: "usr/bin/gunzip", data: "gunzip 2" },
      { name: "usr/bin/perl", data: "perl 2" },
      { name: "usr/bin/perl5", type: "1", linkname: "usr/bin/perl" },
      { name: "usr/bin/uncompress", data: "gunzip" },
      { name: "var/", type: "5", mode: 0o755 },
      pax(paxRecord("SCHILY.xattr.user.lower", "1"), paxRecord("SCHILY.xattr.user.upper", "2")),
      { name: "var/data/", type: "5", mode: 0o750 },
      { name: "var/data/kept", data: "kept" },
    ])]);
    expect(compareFilesystems(merged, flattened)).toEqual(none);

    // An opaque marker at the root removes everything below it that its own layer did not write.
    const rooted = layersManifest([base, tar([{ name: "fresh", data: "f" }, { name: ".wh..wh..opq" }, { name: "later", data: "l" }])]);
    expect([...rooted.files.keys()]).toEqual(["fresh", "later"]);
  });

  it("refuses a hard link whose header changes its target's metadata, and a hard link to a symlink", () => {
    // Codex's reproductions: containerd applies a link header's mode, ownership, and attributes to the
    // shared file, so a header that differs from its target would change it. The user attribute is one
    // that Docker's export omits. Each is refused with the target in the same layer and in a lower one.
    const directory = { name: "opt/", type: "5", mode: 0o755 };
    const target = { name: "opt/a", data: "payload", mode: 0o644 };
    const link = { name: "opt/b", type: "1", linkname: "opt/a", mode: 0o644 };
    const changed = /** @type {const} */ ([
      ["mode", [{ ...link, mode: 0o600 }]],
      ["uid", [{ ...link, uid: 10001 }]],
      ["gid", [{ ...link, gid: 10001 }]],
      ["a user attribute", [pax(paxRecord("SCHILY.xattr.user.review", "changed")), link]],
    ]);
    for (const [label, linkEntries] of changed) {
      expect(() => layersManifest([tar([directory, target, ...linkEntries])]), `${label} in the same layer`).toThrow(/carries metadata that differs from its target/);
      expect(() => layersManifest([tar([directory, target]), tar(linkEntries)]), `${label} over a lower layer`).toThrow(/carries metadata that differs from its target/);
    }
    // A link that repeats its target's metadata, attribute bytes included, shares the file.
    const capability = pax(paxRecord("SCHILY.xattr.security.capability", Buffer.from([0x01, 0x00, 0x00, 0x02, 0x80])));
    const shared = layersManifest([tar([directory, capability, target, capability, link])]);
    expect(shared.files.get("opt/b")).toMatchObject({ hardlinks: ["opt/a"], mode: 0o644, xattrs: { "security.capability": "0100000280" } });
    expect(() => exportManifest(tar([directory, { name: "opt/symlink", type: "2", linkname: "a", mode: 0o777 }, { name: "opt/linked", type: "1", linkname: "opt/symlink", mode: 0o777 }]))).toThrow(/names the symlink opt\/symlink/);
  });

  it("refuses filesystems it cannot model: a dangling hard link, a missing or symlinked parent, an opaque marker without its directory, and a whiteout in an export", () => {
    expect(() => exportManifest(tar([{ name: "orphan", type: "1", linkname: "absent" }]))).toThrow(/names no file to share/);
    expect(() => exportManifest(tar([{ name: "opt/", type: "5" }, { name: "linked-directory", type: "1", linkname: "opt" }]))).toThrow(/names no file to share/);
    expect(() => exportManifest(tar([{ name: "opt/x", data: "x" }]))).toThrow(/has no parent directory opt/);
    expect(() => exportManifest(tar([{ name: "lib", type: "2", linkname: "usr/lib" }, { name: "lib/x", data: "x" }]))).toThrow(/beneath lib, which is a symlink/);
    expect(() => layersManifest([tar([{ name: "opt", data: "file" }]), tar([{ name: "opt/.wh..wh..opq" }])])).toThrow(/beneath opt, which is a file/);
    expect(() => exportManifest(tar([{ name: "opt/", type: "5" }, { name: "opt/.wh.x" }]))).toThrow(/unexpectedly carries the whiteout/);
  });

  // The configuration of the published v0.33.33.50 runtime, which the flattened image must restate.
  const runtime = {
    Os: "linux",
    Architecture: "amd64",
    Config: {
      User: "10001:10001",
      ExposedPorts: { "8001/tcp": {} },
      Env: [
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "NODE_VERSION=24.21.0",
        "YARN_VERSION=1.22.22",
        "NODE_ENV=production",
        "HOST=0.0.0.0",
        "PORT=8001",
        "LONGTAIL_DATA_DIR=/var/lib/longtail-forge",
        "LONGTAIL_DATABASE_FILE=/var/lib/longtail-forge/longtail-forge.db",
        "LONGTAIL_LOCAL_STORAGE_ROOT=/var/lib/longtail-forge/files",
      ],
      Entrypoint: ["docker-entrypoint.sh"],
      Cmd: ["node", "server.js"],
      Volumes: { "/var/backups/longtail-forge": {}, "/var/lib/longtail-forge": {} },
      WorkingDir: "/opt/longtail-forge",
      Labels: { "org.opencontainers.image.title": "Longtail Forge", "org.opencontainers.image.licenses": "AGPL-3.0-only" },
      ArgsEscaped: true,
      Healthcheck: { Test: ["CMD", "node", "-e", "probe"], Interval: 15000000000, Timeout: 5000000000, StartPeriod: 30000000000, Retries: 4 },
    },
  };

  it("finds an identical configuration equal", () => {
    expect(compareImageConfigurations(runtime, structuredClone(runtime))).toEqual([]);
  });

  it("reports a lost inherited default, an added setting, and a reordered environment", () => {
    // A scratch stage that forgot the base image's ENTRYPOINT would lose it exactly like this.
    const withoutEntrypoint = Object.fromEntries(Object.entries(runtime.Config).filter(([key]) => key !== "Entrypoint"));
    const candidate = {
      ...runtime,
      Config: { ...withoutEntrypoint, Env: [...runtime.Config.Env].reverse(), Healthcheck: { ...runtime.Config.Healthcheck, Retries: 3 }, StopSignal: "SIGQUIT" },
    };
    expect(compareImageConfigurations(runtime, candidate).map((difference) => difference.field).sort()).toEqual([
      "Config.Entrypoint",
      "Config.Env",
      "Config.Healthcheck",
      "Config.StopSignal",
    ]);
  });

  it("reports each platform field that differs", () => {
    for (const [field, value] of [["Os", "windows"], ["Architecture", "arm64"], ["Variant", "v8"]]) {
      expect(compareImageConfigurations(runtime, { ...runtime, [field]: value }).map((difference) => difference.field)).toEqual([field]);
    }
  });
});
