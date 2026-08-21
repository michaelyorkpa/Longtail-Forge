// Shared narrowing for the package manifests regression owners read.
//
// Several owners prove dependency decisions by reading package.json and
// package-lock.json. Those reads go through JSON.parse, which resolves `any`,
// so a probe that reads `manifest.dependencies` straight off the result makes a
// claim the compiler never checks: a renamed field, a manifest that failed to
// parse into the expected shape, or a read that returned a string would all
// look identical to TypeScript.
//
// These cross that boundary on purpose. The parsed value enters as `unknown`,
// object-ness is proven at runtime, and only the fields these owners actually
// read are named. This is deliberately not a manifest schema: npm publishes far
// more than this, and claiming the rest would be inventing a contract.

import assert from "node:assert/strict";

/**
 * The package.json fields regression owners assert on.
 * @typedef {object} PackageManifest
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 * @property {string} [version]
 */

/**
 * The package-lock.json fields regression owners assert on.
 * @typedef {object} PackageLockManifest
 * @property {Record<string, unknown>} [packages]
 */

/**
 * Narrow a parsed JSON manifest to a record.
 *
 * The parameter is the open parsed value rather than a shape, so the annotation
 * on the receiving binding decides the result instead of being overridden here.
 * @template {object} [ManifestShape=Record<string, unknown>]
 * @param {unknown} parsed
 * @param {string} label
 * @returns {ManifestShape}
 */
function requireManifest(parsed, label) {
  assert.ok(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    `${label} should parse to a JSON object`,
  );
  return /** @type {ManifestShape} */ (parsed);
}

/**
 * Narrow a parsed package.json.
 * @param {unknown} parsed
 * @param {string} [label]
 * @returns {PackageManifest}
 */
function requirePackageManifest(parsed, label = "package.json") {
  return requireManifest(parsed, label);
}

/**
 * Narrow a parsed package-lock.json.
 * @param {unknown} parsed
 * @param {string} [label]
 * @returns {PackageLockManifest}
 */
function requirePackageLock(parsed, label = "package-lock.json") {
  return requireManifest(parsed, label);
}

export { requireManifest, requirePackageLock, requirePackageManifest };
