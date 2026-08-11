// @ts-check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const appVersion = String(packageMetadata.version || "").trim();
const RELEASE_BRANCH_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

if (!appVersion) {
  throw new Error("package.json must define a non-empty version.");
}

function normalizeReleaseBranch(value, { required = false } = {}) {
  const branch = String(value || "").trim().toLowerCase();
  if (!branch) {
    if (required) {
      throw new Error("A source branch is required.");
    }
    return "";
  }
  if (branch.length > 64 || !RELEASE_BRANCH_PATTERN.test(branch)) {
    throw new Error("Source branch must be 1-64 lowercase letters, numbers, dots, underscores, or hyphens, and cannot start or end with punctuation.");
  }
  return branch;
}

function qualifyAppVersion(version = appVersion, sourceBranch = "") {
  const canonicalVersion = String(version || "").trim();
  const branch = normalizeReleaseBranch(sourceBranch);
  return branch ? `${canonicalVersion}-${branch}` : canonicalVersion;
}

export { appVersion, normalizeReleaseBranch, qualifyAppVersion };
