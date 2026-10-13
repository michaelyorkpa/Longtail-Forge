// Runtime image layer inspection and flattened-image equivalence.
//
// The preview host's Docker storage could not unpack v0.33.33.50: its image removed the base image's
// package managers in a later layer, and that layer's whiteouts named non-empty lower directories. The
// runtime image now carries its filesystem in one layer, image builds refuse any layer with a whiteout,
// and an equivalence check proves the flattened image keeps its reference stage's files and
// configuration. These cases drive both checks with tar archives built here, so each reader path -
// POSIX prefixes, GNU long names, PAX records, gzip, malformed input - is exercised.

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
 * @property {number} [headerSize] the header's size field, when a PAX record carries the real size
 * @property {"posix" | "gnu"} [format]
 * @property {string} [prefix]
 * @property {string} [trailing] bytes written over the prefix field, to prove GNU headers ignore it
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
  block.write(entry.name, 0, 100, "utf8");
  writeOctal(block, 100, 8, entry.mode ?? 0o644);
  writeOctal(block, 108, 8, entry.uid ?? 0);
  writeOctal(block, 116, 8, entry.gid ?? 0);
  writeOctal(block, 124, 12, entry.size);
  writeOctal(block, 136, 12, 0);
  block.write(entry.type ?? "0", 156, 1, "latin1");
  block.write(entry.linkname ?? "", 157, 100, "utf8");
  if ((entry.format ?? "posix") === "posix") {
    block.write("ustar\0", 257, 6, "latin1");
    block.write("00", 263, 2, "latin1");
    block.write(entry.prefix ?? "", 345, 155, "utf8");
  } else {
    block.write("ustar  \0", 257, 8, "latin1");
    block.write(entry.trailing ?? "", 345, 155, "latin1");
  }
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return block;
}

/** @param {Buffer} data */
function padded(data) {
  return Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

/** @param {readonly FixtureEntry[]} entries */
function tar(entries) {
  return Buffer.concat([
    ...entries.flatMap((entry) => {
      const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "", "utf8");
      return [header({ ...entry, size: entry.headerSize ?? data.length }), padded(data)];
    }),
    Buffer.alloc(1024),
  ]);
}

/**
 * A PAX record, whose leading length counts the whole record, its own digits included.
 * @param {string} key
 * @param {string} value
 */
function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  const bodyLength = Buffer.byteLength(body);
  let length = bodyLength + 1;
  while (String(length).length + bodyLength !== length) length = String(length).length + bodyLength;
  return `${length}${body}`;
}

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
  it("recognizes ordinary and opaque whiteouts by basename, wherever they sit", () => {
    expect(classifyWhiteout(".wh.removed")).toBe("whiteout");
    expect(classifyWhiteout("opt/.wh.yarn-v1.22.22")).toBe("whiteout");
    expect(classifyWhiteout("./usr/local/bin/.wh.npm")).toBe("whiteout");
    expect(classifyWhiteout("var/lib/apt/lists/.wh.auxfiles/")).toBe("whiteout");
    expect(classifyWhiteout("srv/data/.wh..wh..opq")).toBe("opaque");
    expect(classifyWhiteout(".wh..wh..opq")).toBe("opaque");
  });

  it("leaves ordinary names alone, including ones that merely contain .wh.", () => {
    for (const name of ["usr/bin/node", "srv/data/", "notes.wh.txt", "a/b.wh.c", "wh.x", "opt/yarn-v1.22.22/bin/yarn"]) {
      expect(classifyWhiteout(name)).toBeNull();
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

  it("finds an opaque whiteout beside ordinary files", () => {
    const report = inspectLayer("opaque", tar([
      { name: "srv/data/", type: "5" },
      { name: "srv/data/.wh..wh..opq" },
      { name: "srv/data/fresh.txt", data: "new" },
    ]));
    expect(report.whiteouts).toEqual([{ path: "srv/data/.wh..wh..opq", kind: "opaque" }]);
  });

  it("reads a whiteout whose path only a PAX record carries", () => {
    const longPath = `${LONG_DIRECTORY}/.wh.removed-tree`;
    const report = inspectLayer("pax", tar([
      { name: "PaxHeader/entry", type: "x", data: paxRecord("path", longPath) },
      { name: "truncated-visible-name" },
    ]));
    expect(longPath.length).toBeGreaterThan(100);
    expect(report.whiteouts).toEqual([{ path: longPath, kind: "whiteout" }]);
  });

  it("reads a whiteout whose path only a GNU long name carries", () => {
    const longPath = `${LONG_DIRECTORY}/.wh..wh..opq`;
    const report = inspectLayer("gnu", tar([
      { name: "././@LongLink", type: "L", data: `${longPath}\0`, format: "gnu" },
      { name: "truncated-visible-name", format: "gnu" },
    ]));
    expect(report.whiteouts).toEqual([{ path: longPath, kind: "opaque" }]);
  });

  it("joins a POSIX prefix to the name, and ignores those bytes in a GNU header", () => {
    const posix = [...readTarEntries(tar([{ name: ".wh.gone", prefix: "usr/local/lib/node_modules" }]))];
    expect(posix.map((entry) => entry.name)).toEqual(["usr/local/lib/node_modules/.wh.gone"]);
    const gnu = [...readTarEntries(tar([{ name: "plain-file", format: "gnu", trailing: "usr/local/.wh.not-a-prefix" }]))];
    expect(gnu.map((entry) => entry.name)).toEqual(["plain-file"]);
  });

  it("applies PAX ownership, size, and extended attributes to the member that follows", () => {
    const records = [paxRecord("uid", "10001"), paxRecord("gid", "10001"), paxRecord("size", "6"), paxRecord("SCHILY.xattr.security.capability", "cap")];
    const entries = [...readTarEntries(tar([
      { name: "PaxHeader/node", type: "x", data: records.join("") },
      { name: "usr/local/bin/node", data: "binary", mode: 0o755, headerSize: 0 },
      { name: "usr/local/bin/after", data: "next" },
    ]))];
    expect(entries.map((entry) => entry.name)).toEqual(["usr/local/bin/node", "usr/local/bin/after"]);
    expect(entries[0]).toMatchObject({ uid: 10001, gid: 10001, size: 6, mode: 0o755, xattrs: { "security.capability": "cap" } });
    expect(entries[1]).toMatchObject({ uid: 0, gid: 0, size: 4, xattrs: {} });
  });

  it("keeps a PAX size for its member, not for a metadata header in between", () => {
    const longPath = `${LONG_DIRECTORY}/.wh.removed-tree`;
    const [entry] = [...readTarEntries(tar([
      { name: "PaxHeader/entry", type: "x", data: paxRecord("size", "6") },
      { name: "././@LongLink", type: "L", data: `${longPath}\0` },
      { name: "truncated-visible-name", data: "binary", headerSize: 0 },
    ]))];
    expect(entry).toMatchObject({ name: longPath, size: 6 });
  });

  it("refuses a malformed or truncated archive, and a compression it cannot read", () => {
    const corrupt = tar([{ name: "usr/bin/node", data: "binary" }]);
    corrupt.write("x", 0, 1, "latin1");
    expect(() => inspectLayer("corrupt", corrupt)).toThrow(/fails its checksum/);
    const truncated = tar([{ name: "usr/bin/node", data: "x".repeat(2000) }]).subarray(0, 1024);
    expect(() => inspectLayer("truncated", truncated)).toThrow(/truncated or has an invalid size/);
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

  it("refuses an archive without its manifest, or missing a listed layer", () => {
    expect(() => inspectSavedImageArchive(tar([{ name: "blobs/sha256/aaaa", data: cleanLayer }]))).toThrow(/no manifest\.json/);
    const missing = tar([{ name: "manifest.json", data: JSON.stringify([{ Layers: ["blobs/sha256/absent"] }]) }]);
    expect(() => inspectSavedImageArchive(missing)).toThrow(/missing layer blobs\/sha256\/absent/);
    const two = tar([{ name: "manifest.json", data: JSON.stringify([{ Layers: ["a"] }, { Layers: ["b"] }]) }]);
    expect(() => inspectSavedImageArchive(two)).toThrow(/exactly one image/);
  });

  it("refuses an image with the failed layer, and accepts one that has none", () => {
    const refusal = describeWhiteouts("ghcr.io/example/runtime@sha256:failed", [
      inspectLayer("base", cleanLayer),
      inspectLayer("package-managers", failedLayer),
    ]);
    expect(refusal).toMatch(/carries 8 whiteout\(s\) in 1 of 2 layer\(s\)/);
    expect(refusal).toContain("opt/.wh.yarn-v1.22.22");
    expect(describeWhiteouts("ghcr.io/example/runtime@sha256:flattened", [inspectLayer("only", cleanLayer)])).toBeNull();
  });
});

describe("flattened image equivalence", () => {
  /** @param {readonly FixtureEntry[]} extra */
  const filesystem = (extra = []) => exportManifest(tar([
    { name: "opt/", type: "5", mode: 0o755 },
    { name: "opt/longtail-forge/server.js", data: "console.log('ok');\n", mode: 0o444 },
    { name: "usr/local/bin/node", data: "binary", mode: 0o755 },
    { name: "usr/local/bin/nodejs", type: "2", linkname: "node", mode: 0o777 },
    { name: "var/lib/longtail-forge/", type: "5", mode: 0o700, uid: 10001, gid: 10001 },
    ...extra,
  ]));
  const none = { missing: [], extra: [], changed: [] };

  it("records types, ownership, links, and content, resolving hard links to their target", () => {
    const manifest = filesystem([{ name: "usr/bin/perl5", type: "1", linkname: "usr/local/bin/node", mode: 0o755 }]);
    expect(manifest.hardlinks).toBe(1);
    expect(manifest.files.get("usr/bin/perl5")).toEqual(manifest.files.get("usr/local/bin/node"));
    expect(manifest.files.get("usr/local/bin/nodejs")).toMatchObject({ type: "symlink", linkname: "node" });
    expect(manifest.files.get("var/lib/longtail-forge")).toMatchObject({ type: "directory", mode: 0o700, uid: 10001, gid: 10001 });
  });

  it("finds identical filesystems equal, and a hard link equal to a copy with the same bytes", () => {
    expect(compareFilesystems(filesystem(), filesystem())).toEqual(none);
    const linked = filesystem([{ name: "usr/bin/copy", type: "1", linkname: "usr/local/bin/node", mode: 0o755 }]);
    const copied = filesystem([{ name: "usr/bin/copy", data: "binary", mode: 0o755 }]);
    expect(compareFilesystems(linked, copied)).toEqual(none);
  });

  it("reports every changed, missing, and extra path", () => {
    const reference = filesystem([{ name: "etc/keep", data: "a" }, { name: "etc/os-release", type: "2", linkname: "../usr/lib/os-release", mode: 0o777 }]);
    const candidate = exportManifest(tar([
      { name: "opt/", type: "5", mode: 0o755 },
      { name: "opt/longtail-forge/server.js", data: "console.log('changed');\n", mode: 0o444 },
      { name: "PaxHeader/node", type: "x", data: paxRecord("SCHILY.xattr.security.capability", "cap") },
      { name: "usr/local/bin/node", data: "binary", mode: 0o755, uid: 10001 },
      { name: "usr/local/bin/nodejs", type: "2", linkname: "node-24", mode: 0o777 },
      { name: "var/lib/longtail-forge/", type: "5", mode: 0o755, uid: 10001, gid: 0 },
      { name: "etc/os-release", type: "5", mode: 0o777 },
      { name: "usr/local/bin/npm", data: "package manager", mode: 0o755 },
    ]));
    const comparison = compareFilesystems(reference, candidate);
    expect(comparison.missing).toEqual(["etc/keep"]);
    expect(comparison.extra).toEqual(["usr/local/bin/npm"]);
    expect(comparison.changed.map((difference) => `${difference.path}:${difference.field}`).sort()).toEqual([
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

  it("refuses a hard link whose target is not earlier, and an unexpected member type", () => {
    expect(() => exportManifest(tar([{ name: "orphan", type: "1", linkname: "absent" }]))).toThrow(/names a target that is not earlier/);
    expect(() => exportManifest(tar([{ name: "odd", type: "S" }]))).toThrow(/unexpected tar type/);
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
