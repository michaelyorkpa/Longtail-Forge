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
 * @property {Record<string, boolean>} [allowScripts]
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [engines]
 * @property {string} [license]
 * @property {string} [name]
 * @property {Record<string, string>} [scripts]
 * @property {string} [type]
 * @property {string} [version]
 */

/**
 * One entry in a package-lock.json `packages` map. The root entry, keyed by
 * the empty string, is the one regression owners read.
 * @typedef {object} PackageLockEntry
 * @property {Record<string, string>} [dependencies]
 * @property {boolean} [dev]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [engines]
 * @property {string} [license]
 * @property {string} [name]
 * @property {string} [version]
 */

/**
 * The package-lock.json fields regression owners assert on.
 * @typedef {object} PackageLockManifest
 * @property {number} [lockfileVersion]
 * @property {string} [name]
 * @property {Record<string, PackageLockEntry>} [packages]
 * @property {string} [version]
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

/**
 * Prove and return one object-valued section of a parsed manifest.
 *
 * Every member of these shapes is optional, because npm does not require any
 * of them and most owners read one or two. An owner that reads a section must
 * therefore say so: before this checkpoint the parse answered `any` and
 * `manifest.scripts.start` on a manifest without `scripts` would have thrown
 * at runtime with nothing in the type system to warn about it.
 * @template {Record<string, unknown>} Section
 * @param {Section | undefined} value
 * @param {string} label
 * @returns {Section}
 */
function requireSection(value, label) {
  assert.ok(value && typeof value === "object", `${label} should be declared`);
  return value;
}

/**
 * A parsed manifest or lockfile entry carries the same optional sections, so
 * these accessors are written against the member rather than against either
 * shape - `PackageManifest` and `PackageLockEntry` both satisfy them.
 * @param {{ dependencies?: Record<string, string> }} carrier
 * @param {string} [label]
 * @returns {Record<string, string>}
 */
function requireDependencies(carrier, label = "package.json") {
  return requireSection(carrier.dependencies, `${label} dependencies`);
}

/**
 * @param {{ devDependencies?: Record<string, string> }} carrier
 * @param {string} [label]
 * @returns {Record<string, string>}
 */
function requireDevDependencies(carrier, label = "package.json") {
  return requireSection(carrier.devDependencies, `${label} devDependencies`);
}

/**
 * @param {{ engines?: Record<string, string> }} carrier
 * @param {string} [label]
 * @returns {Record<string, string>}
 */
function requireEngines(carrier, label = "package.json") {
  return requireSection(carrier.engines, `${label} engines`);
}

/**
 * @param {PackageManifest} manifest
 * @param {string} [label]
 * @returns {Record<string, string>}
 */
function requireScripts(manifest, label = "package.json") {
  return requireSection(manifest.scripts, `${label} scripts`);
}

/**
 * Prove and return a string-valued manifest member.
 *
 * `name` and `version` are optional on both shapes because npm does not
 * require them of every manifest, but an owner that copies one into an
 * artifact, a report, or an operation's options needs a string rather than a
 * `string | undefined` it would otherwise have to default away.
 * @param {{ name?: string, version?: string }} carrier
 * @param {"name" | "version"} member
 * @param {string} [label]
 * @returns {string}
 */
function requireManifestString(carrier, member, label = "package.json") {
  const value = carrier[member];
  assert.equal(typeof value, "string", `${label} ${member} should be a string`);
  return /** @type {string} */ (value);
}

/**
 * @param {PackageLockManifest} lock
 * @param {string} [label]
 * @returns {Record<string, PackageLockEntry>}
 */
function requireLockPackages(lock, label = "package-lock.json") {
  return requireSection(lock.packages, `${label} packages`);
}

/**
 * Prove and return one entry of a lockfile's `packages` map.
 *
 * The root entry is keyed by the empty string, so a caller asking for a path
 * npm never resolved is a real failure rather than an `undefined` that every
 * later read then repeats. An owner proving a package is *absent* should read
 * `requireLockPackages` directly instead.
 * @param {PackageLockManifest} lock
 * @param {string} packagePath
 * @param {string} [label]
 * @returns {PackageLockEntry}
 */
function requireLockEntry(lock, packagePath, label = "package-lock.json") {
  const entry = requireLockPackages(lock, label)[packagePath];
  assert.ok(entry && typeof entry === "object", `${label} should resolve ${packagePath || "its root package"}`);
  return entry;
}

export {
  requireDependencies,
  requireDevDependencies,
  requireEngines,
  requireLockEntry,
  requireLockPackages,
  requireManifest,
  requireManifestString,
  requirePackageLock,
  requirePackageManifest,
  requireScripts,
};
