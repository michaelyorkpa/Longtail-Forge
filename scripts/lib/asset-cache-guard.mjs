import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ACTIVE_SOURCE_ROOTS = Object.freeze(["public/js", "src", "views"]);
const RAW_ASSET_VERSION_REFERENCE = /[A-Za-z0-9_./-]+\.(?:css|js)\?(?:v|cache)=[A-Za-z0-9._-]+/g;

async function collectRawAssetVersionReferences({ rootDir = process.cwd() } = {}) {
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

async function listSourceFiles(rootDir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
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

function collectAssetCacheGuardErrors({ baseline, findings }) {
  const errors = [];
  if (baseline?.schemaVersion !== 1 || !baseline.files || typeof baseline.files !== "object") {
    return ["asset cache legacy baseline must use schemaVersion 1 and define files"];
  }

  const currentFiles = new Set(findings.keys());
  const approvedFiles = new Set(Object.keys(baseline.files));

  for (const filePath of [...currentFiles].sort()) {
    const finding = findings.get(filePath);
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
