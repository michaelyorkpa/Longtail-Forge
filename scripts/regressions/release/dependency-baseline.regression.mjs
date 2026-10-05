export const regressionMeta = Object.freeze({
  id: "release.dependency-baseline",
  area: "release",
  tier: "release-gate",
  tags: ["dependencies", "markdown", "release", "tooling"],
  description: "Pins the reviewed ESLint 10.11, Node types 26.6.3, and Markdown-it 15 dependency baseline, ESLint's development-only cache graph at its pre-compromise releases, the development-only espree and advisory-patched brace-expansion, and keeps obsolete js-yaml and redundant Markdown types out of the resolved graph.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { requireDependencies, requireDevDependencies, requireEngines, requireLockEntry, requireLockPackages, requirePackageLock, requirePackageManifest } from "../../test-support/package-manifest-assertions.mjs";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";

const packageJson = requirePackageManifest(JSON.parse(readFileSync("package.json", "utf8")));
const packageLock = requirePackageLock(JSON.parse(readFileSync("package-lock.json", "utf8")));
const rootLock = requireLockEntry(packageLock, "");
const eslintLock = requireLockEntry(packageLock, "node_modules/eslint");
const eslintConfigHelpersLock = requireLockEntry(packageLock, "node_modules/@eslint/config-helpers");
const minimatchLock = requireLockEntry(packageLock, "node_modules/minimatch");
const nodeTypesLock = requireLockEntry(packageLock, "node_modules/@types/node");
const markdownItLock = requireLockEntry(packageLock, "node_modules/markdown-it");
const argparseLock = requireLockEntry(packageLock, "node_modules/argparse");
const entitiesLock = requireLockEntry(packageLock, "node_modules/entities");
const linkifyItLock = requireLockEntry(packageLock, "node_modules/linkify-it");
const mdurlLock = requireLockEntry(packageLock, "node_modules/mdurl");
const ucMicroLock = requireLockEntry(packageLock, "node_modules/uc.micro");

assert.equal(requireDevDependencies(packageJson).eslint, "^10.11.0", "ESLint should use the reviewed 10.11 development baseline");
assert.equal(requireDependencies(packageJson).eslint, undefined, "ESLint must remain development-only tooling");
assert.equal(requireDevDependencies(rootLock, "package-lock.json root").eslint, "^10.11.0", "the lockfile root should match the ESLint package contract");
assert.equal(eslintLock.version, "10.11.0", "the resolved ESLint baseline should remain 10.11.0");
assert.equal(eslintLock.dev, true, "the resolved ESLint package must remain development-only");
assert.match(requireEngines(eslintLock, "eslint lock entry").node, />=24/, "ESLint 10.11 should declare support for the repository's Node 24 runtime line");
assert.equal(requireDependencies(eslintLock, "eslint lock entry")["@eslint/config-helpers"], "^0.7.0", "ESLint should retain its reviewed config-helpers range");
assert.equal(eslintConfigHelpersLock.version, "0.7.0", "config-helpers should resolve to the reviewed 0.7 baseline");
assert.equal(requireDependencies(eslintLock, "eslint lock entry").minimatch, "^10.2.5", "ESLint should retain its reviewed minimatch range");
assert.equal(minimatchLock.version, "10.2.5", "minimatch should resolve to the reviewed 10.2.5 baseline");

// `0.33.33.49`: ESLint 10.10 moved its result cache to file-entry-cache 11, whose graph comes from
// jaredwray/cacheable and jaredwray/keyv. Ten of those packages were compromised on 2026-08-04 with a
// preinstall dropper; npm has since removed every poisoned version. ESLint's range skips the poisoned
// file-entry-cache 11.1.6, and each version pinned here is the last stable release published before the
// compromise, inspected without execution: its integrity matched, and it had no install script and
// no dropper files. Moving any of them is a new supply-chain review, not routine drift.
assert.equal(requireDependencies(eslintLock, "eslint lock entry")["file-entry-cache"], "11.1.5 || >11.1.6 <12", "ESLint should keep the range that skips the poisoned file-entry-cache 11.1.6");
for (const [packagePath, version] of /** @type {const} */ ([
  ["node_modules/file-entry-cache", "11.1.5"],
  ["node_modules/flat-cache", "6.1.23"],
  ["node_modules/cacheable", "2.5.0"],
  ["node_modules/@cacheable/memory", "2.2.0"],
  ["node_modules/@cacheable/utils", "2.5.0"],
  ["node_modules/keyv", "5.6.0"],
])) {
  const cacheLock = requireLockEntry(packageLock, packagePath);
  assert.equal(cacheLock.version, version, `${packagePath} should resolve to the reviewed pre-compromise ${version}`);
  assert.equal(cacheLock.dev, true, `${packagePath} must remain development-only`);
}

// `0.33.33.48`: brace-expansion reaches the tree only through ESLint's minimatch. 5.0.12 is the
// first release outside GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p and GHSA-q2hr-2g5m-vwhr, the high
// finding that failed `npm audit --audit-level=high`.
const braceExpansionLock = requireLockEntry(packageLock, "node_modules/brace-expansion");
assert.equal(requireDependencies(minimatchLock, "minimatch lock entry")["brace-expansion"], "^5.0.5", "minimatch should retain its reviewed brace-expansion range");
assert.equal(braceExpansionLock.version, "5.0.12", "brace-expansion should resolve to the advisory-patched 5.0.12");
assert.equal(braceExpansionLock.dev, true, "the resolved brace-expansion package must remain development-only");

// `0.33.33.48`: the dependency-cycle gate and the regression source measure parse JavaScript with
// espree, and no runtime file imports it. It is a declared development dependency rather than one
// ESLint happens to install, and it stays out of the production install.
const espreeLock = requireLockEntry(packageLock, "node_modules/espree");
assert.equal(requireDevDependencies(packageJson).espree, "^11.2.0", "the cycle gate's parser must be a declared development dependency");
assert.equal(requireDependencies(packageJson).espree, undefined, "espree must remain development-only tooling");
assert.equal(requireDevDependencies(rootLock, "package-lock.json root").espree, "^11.2.0", "the lockfile root should match the espree package contract");
assert.equal(espreeLock.version, "11.2.0", "the resolved espree should remain the version ESLint already uses");
assert.equal(espreeLock.dev, true, "the resolved espree package must remain development-only");

assert.equal(requireDevDependencies(packageJson)["@types/node"], "^26.6.3", "Node types should use the reviewed 26.6.3 development baseline");
assert.equal(requireDependencies(packageJson)["@types/node"], undefined, "Node types must remain development-only tooling");
assert.equal(requireDevDependencies(rootLock, "package-lock.json root")["@types/node"], "^26.6.3", "the lockfile root should match the Node types package contract");
assert.equal(requireDependencies(rootLock, "package-lock.json root")["@types/node"], undefined, "the lockfile root must not promote Node types to a runtime dependency");
// `0.33.33.49`: newer Node declarations do not widen the supported runtime; the engine pin below stays Node 24.
assert.equal(nodeTypesLock.version, "26.6.3", "the resolved Node types baseline should remain 26.6.3");
assert.equal(nodeTypesLock.dev, true, "the resolved Node types package must remain development-only");
assert.equal(requireEngines(packageJson).node, ">=24.7 <25", "the repository should retain its supported Node 24 range");
assert.deepEqual(packageJson.allowScripts, { "better-sqlite3@13.0.3": true }, "the approved lifecycle-script allowlist must remain unchanged");

assert.equal(requireDependencies(packageJson)["markdown-it"], "^15.0.2", "Markdown-it should use the reviewed 15.0.2 runtime baseline");
assert.equal(requireDevDependencies(packageJson)["markdown-it"], undefined, "Markdown-it must remain runtime parser infrastructure");
assert.equal(requireDependencies(rootLock, "package-lock.json root")["markdown-it"], "^15.0.2", "the lockfile root should match the Markdown-it package contract");
// `0.33.33.49`: 15.0.2 is outside GHSA-253c-mchw-3w2r (=15.0.0) and keeps the reviewed v15 graph below.
assert.equal(markdownItLock.version, "15.0.2", "the resolved Markdown-it baseline should remain 15.0.2");
assert.deepEqual(markdownItLock.dependencies, {
  argparse: "^3.0.0",
  entities: "^8.0.0",
  "linkify-it": "^6.0.0",
  mdurl: "^2.1.0",
  "punycode.js": "^2.3.1",
  "uc.micro": "^3.0.0",
}, "Markdown-it should retain its complete reviewed v15 production dependency graph");
assert.equal(argparseLock.version, "3.0.0", "argparse should resolve to the reviewed 3.0 baseline");
assert.equal(entitiesLock.version, "8.0.0", "entities should resolve to the reviewed 8.0 baseline");
assert.equal(requireEngines(entitiesLock, "entities lock entry").node, ">=20.19.0", "entities 8 should retain a Node range supported by the repository's Node 24 runtime");
assert.equal(linkifyItLock.version, "6.1.0", "linkify-it should resolve to the reviewed 6.1 baseline");
assert.equal(requireDependencies(linkifyItLock, "linkify-it lock entry")["uc.micro"], "^3.0.0", "linkify-it should share the reviewed uc.micro 3 range");
assert.equal(mdurlLock.version, "2.1.0", "mdurl should resolve to the reviewed 2.1 baseline");
assert.equal(ucMicroLock.version, "3.0.0", "uc.micro should resolve to the reviewed 3.0 baseline");
assert.equal(requireDependencies(packageJson)["@types/markdown-it"], undefined, "Markdown-it's bundled declarations should not add a redundant runtime types package");
assert.equal(requireDevDependencies(packageJson)["@types/markdown-it"], undefined, "Markdown-it's bundled declarations should not add a redundant development types package");
assert.equal(requireLockPackages(packageLock)["node_modules/@types/markdown-it"], undefined, "the resolved graph should not include redundant Markdown-it types");

const backslashSpaceHardBreakSource = "Literal backslash\\  \nNext line";
for (const [mode, breaks] of /** @type {readonly (readonly [string, boolean])[]} */ ([
  ["document/default", false],
  ["user-authored", true],
])) {
  const rendered = MarkdownIt("commonmark", {
    html: false,
    linkify: false,
    typographer: false,
    breaks,
  }).render(backslashSpaceHardBreakSource);

  assert.match(
    rendered,
    /Literal backslash\\<br\s*\/?>\s*Next line/,
    `${mode} parser configuration should preserve a literal backslash before a two-space CommonMark hard break`,
  );
  assert.doesNotMatch(
    rendered,
    /Literal backslash\\\s+<br/,
    `${mode} parser configuration should consume both hard-break spaces without consuming the literal backslash`,
  );
}

assert.equal(requireDependencies(packageJson)["js-yaml"], undefined, "js-yaml should not become a direct runtime dependency");
assert.equal(requireDevDependencies(packageJson)["js-yaml"], undefined, "js-yaml should not become a direct development dependency");
assert.equal(requireLockPackages(packageLock)["node_modules/js-yaml"], undefined, "ESLint 10 should remove obsolete js-yaml from the resolved graph");


console.log("Dependency baseline regression passed.");
