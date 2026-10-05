import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ACTIVE_SOURCE_ROOTS = Object.freeze(["public/js", "src", "views"]);
const RAW_ASSET_VERSION_REFERENCE = /[A-Za-z0-9_./-]+\.(?:css|js)\?(?:v|cache)=[A-Za-z0-9._-]+/g;

/**
 * Raw asset cache-key references found in one source file.
 * @typedef {object} RawAssetVersionFinding
 * @property {number} count
 * @property {readonly string[]} references
 * @property {string} sha256
 */

/**
 * Frozen legacy baseline of reviewed inert raw asset cache keys.
 * @typedef {object} LegacyAssetBaseline
 * @property {number} schemaVersion
 * @property {string} [rationale]
 * @property {Record<string, { count: number, sha256: string }>} files
 */

/**
 * Scan the active source roots for raw versioned asset references.
 * @param {{ rootDir?: string }} [options]
 * @returns {Promise<Map<string, RawAssetVersionFinding>>} findings keyed by project-relative path
 */
async function collectRawAssetVersionReferences({ rootDir = process.cwd() } = {}) {
  /** @type {Map<string, RawAssetVersionFinding>} */
  const findings = new Map();

  for (const relativeRoot of ACTIVE_SOURCE_ROOTS) {
    const absoluteRoot = path.join(rootDir, relativeRoot);
    for (const filePath of await listSourceFiles(absoluteRoot)) {
      const source = await fs.readFile(filePath, "utf8");
      const references = [...source.matchAll(RAW_ASSET_VERSION_REFERENCE)].map((match) => match[0]).sort();
      if (references.length === 0) {
        continue;
      }

      const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
      findings.set(relativePath, Object.freeze({
        count: references.length,
        references: Object.freeze(references),
        sha256: hashReferences(references),
      }));
    }
  }

  return findings;
}

/**
 * Recursively list .html/.js files beneath a root, sorted per directory.
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function listSourceFiles(rootDir) {
  /** @type {string[]} */
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return files;
    }
    throw error;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(filePath));
      continue;
    }
    if (entry.isFile() && [".html", ".js"].includes(path.extname(entry.name).toLowerCase())) {
      files.push(filePath);
    }
  }
  return files;
}

/**
 * Build the serializable legacy baseline document from current findings.
 * @param {ReadonlyMap<string, RawAssetVersionFinding>} findings
 * @returns {LegacyAssetBaseline}
 */
function buildLegacyAssetBaseline(findings) {
  return {
    schemaVersion: 1,
    rationale: "Frozen inert cache keys retained only for source-reading regression compatibility; served and runtime-injected asset URLs are overwritten from the canonical application version.",
    files: Object.fromEntries([...findings.entries()].map(([filePath, finding]) => [
      filePath,
      { count: finding.count, sha256: finding.sha256 },
    ])),
  };
}

/**
 * Compare current findings against the frozen legacy baseline.
 * @param {{ baseline: LegacyAssetBaseline, findings: ReadonlyMap<string, RawAssetVersionFinding> }} input
 * @returns {string[]} guard errors; empty when the baseline is exact
 */
function collectAssetCacheGuardErrors({ baseline, findings }) {
  /** @type {string[]} */
  const errors = [];
  if (baseline?.schemaVersion !== 1 || !baseline.files || typeof baseline.files !== "object") {
    return ["asset cache legacy baseline must use schemaVersion 1 and define files"];
  }

  const currentFiles = new Set(findings.keys());
  const approvedFiles = new Set(Object.keys(baseline.files));

  for (const filePath of [...currentFiles].sort()) {
    const finding = /** @type {RawAssetVersionFinding} */ (findings.get(filePath));
    const approved = baseline.files[filePath];
    if (!approved) {
      errors.push(`${filePath} contains ${finding.count} unapproved raw asset cache key(s)`);
      continue;
    }
    if (approved.count !== finding.count || approved.sha256 !== finding.sha256) {
      errors.push(`${filePath} raw asset cache keys differ from the frozen legacy exception`);
    }
  }

  for (const filePath of [...approvedFiles].filter((item) => !currentFiles.has(item)).sort()) {
    errors.push(`${filePath} no longer needs its legacy asset cache exception; shrink the baseline`);
  }

  return errors;
}

/**
 * Stable digest of a sorted reference list.
 * @param {readonly string[]} references
 * @returns {string}
 */
function hashReferences(references) {
  return crypto.createHash("sha256").update(references.join("\n")).digest("hex");
}

export {
  ACTIVE_SOURCE_ROOTS,
  RAW_ASSET_VERSION_REFERENCE,
  buildLegacyAssetBaseline,
  collectAssetCacheGuardErrors,
  collectRawAssetVersionReferences,
};
