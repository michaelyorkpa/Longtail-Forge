#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeReleaseBranch } from "../../src/core/version.js";

/**
 * Options parsed from the release metadata command line. Every value arrives as
 * a `--flag value` string; the required-flag loop below still throws when one is
 * missing, so consumers may read them as present strings.
 * @typedef {object} ReleaseMetadataOptions
 * @property {string} artifact
 * @property {string} commit
 * @property {string} channel
 * @property {string} sourceBranch
 * @property {string} output
 * @property {string} createdAt
 */

/**
 * The runtime artifact descriptor embedded in the metadata record.
 * @typedef {object} ReleaseArtifactDescriptor
 * @property {string} filename
 * @property {string} sha256
 */

/**
 * The schema-versioned release metadata record written beside a runtime artifact.
 * @typedef {object} ReleaseMetadata
 * @property {number} schemaVersion
 * @property {string} application
 * @property {string} version
 * @property {string} commitSha
 * @property {string} channel
 * @property {string} sourceBranch
 * @property {ReleaseArtifactDescriptor} artifact
 * @property {string} createdAt
 */

/** @typedef {{ version: string }} PackageManifest */

const options = parseArgs(process.argv.slice(2));
const packageJson = /** @type {PackageManifest} */ (JSON.parse(await fs.readFile("package.json", "utf8")));
const artifactPath = path.resolve(options.artifact);
const outputPath = path.resolve(options.output);
const artifactBytes = await fs.readFile(artifactPath);
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
const sidecar = String(await fs.readFile(`${artifactPath}.sha256`, "utf8")).trim();
const sidecarMatch = sidecar.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);

if (!sidecarMatch || sidecarMatch[1].toLowerCase() !== artifactSha256) {
  throw new Error("Runtime artifact checksum sidecar does not match the artifact bytes.");
}
if (path.basename(sidecarMatch[2]) !== path.basename(artifactPath)) {
  throw new Error("Runtime artifact checksum sidecar names a different artifact.");
}

/** @type {ReleaseMetadata} */
const metadata = {
  schemaVersion: 1,
  application: "longtail-forge",
  version: packageJson.version,
  commitSha: options.commit.toLowerCase(),
  channel: options.channel,
  sourceBranch: normalizeReleaseBranch(options.sourceBranch, { required: true }),
  artifact: {
    filename: path.basename(artifactPath),
    sha256: artifactSha256,
  },
  createdAt: options.createdAt || new Date().toISOString(),
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output: outputPath, ...metadata }));

/**
 * @param {readonly string[]} args
 * @returns {ReleaseMetadataOptions}
 */
function parseArgs(args) {
  /** @type {Record<string, string>} */
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--artifact", "--commit", "--channel", "--source-branch", "--output", "--created-at"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (/** @type {string} */ _, /** @type {string} */ letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown release metadata argument: ${arg}`);
  }
  for (const key of ["artifact", "commit", "channel", "sourceBranch", "output"]) {
    if (!options[key]) throw new Error(`--${key} is required.`);
  }
  if (!/^[a-f0-9]{40}$/i.test(options.commit)) throw new Error("--commit must be a full 40-character commit SHA.");
  if (!/^(nightly|main|preview)$/.test(options.channel)) throw new Error("--channel must be nightly, main, or preview.");
  if (options.createdAt && Number.isNaN(Date.parse(options.createdAt))) throw new Error("--created-at must be an ISO-compatible timestamp.");
  return /** @type {ReleaseMetadataOptions} */ (options);
}
