export const regressionMeta = Object.freeze({
  id: "release.dependency-baseline",
  area: "release",
  tier: "release-gate",
  tags: ["dependencies", "markdown", "release", "tooling"],
  description: "Pins the reviewed ESLint 10.8, Node types 26.2.0, and Markdown-it 15 dependency baseline and keeps obsolete js-yaml and redundant Markdown types out of the resolved graph.",
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

assert.equal(requireDevDependencies(packageJson).eslint, "^10.8.1", "ESLint should use the reviewed 10.8 development baseline");
assert.equal(requireDependencies(packageJson).eslint, undefined, "ESLint must remain development-only tooling");
assert.equal(requireDevDependencies(rootLock, "package-lock.json root").eslint, "^10.8.1", "the lockfile root should match the ESLint package contract");
assert.equal(eslintLock.version, "10.8.1", "the resolved ESLint baseline should remain 10.8.1");
assert.equal(eslintLock.dev, true, "the resolved ESLint package must remain development-only");
assert.match(requireEngines(eslintLock, "eslint lock entry").node, />=24/, "ESLint 10.8 should declare support for the repository's Node 24 runtime line");
assert.equal(requireDependencies(eslintLock, "eslint lock entry")["@eslint/config-helpers"], "^0.7.0", "ESLint should retain its reviewed config-helpers range");
assert.equal(eslintConfigHelpersLock.version, "0.7.0", "config-helpers should resolve to the reviewed 0.7 baseline");
assert.equal(requireDependencies(eslintLock, "eslint lock entry").minimatch, "^10.2.5", "ESLint should retain its reviewed minimatch range");
assert.equal(minimatchLock.version, "10.2.5", "minimatch should resolve to the reviewed 10.2.5 baseline");

assert.equal(requireDevDependencies(packageJson)["@types/node"], "^26.2.0", "Node types should use the reviewed 26.2.0 development baseline");
assert.equal(requireDependencies(packageJson)["@types/node"], undefined, "Node types must remain development-only tooling");
assert.equal(requireDevDependencies(rootLock, "package-lock.json root")["@types/node"], "^26.2.0", "the lockfile root should match the Node types package contract");
assert.equal(requireDependencies(rootLock, "package-lock.json root")["@types/node"], undefined, "the lockfile root must not promote Node types to a runtime dependency");
assert.equal(nodeTypesLock.version, "26.2.0", "the resolved Node types baseline should remain 26.2.0");
assert.equal(nodeTypesLock.dev, true, "the resolved Node types package must remain development-only");
assert.equal(requireEngines(packageJson).node, ">=24.7 <25", "the repository should retain its supported Node 24 range");
assert.deepEqual(packageJson.allowScripts, { "better-sqlite3@13.0.3": true }, "the approved lifecycle-script allowlist must remain unchanged");

assert.equal(requireDependencies(packageJson)["markdown-it"], "^15.0.0", "Markdown-it should use the reviewed 15.0 runtime baseline");
assert.equal(requireDevDependencies(packageJson)["markdown-it"], undefined, "Markdown-it must remain runtime parser infrastructure");
assert.equal(requireDependencies(rootLock, "package-lock.json root")["markdown-it"], "^15.0.0", "the lockfile root should match the Markdown-it package contract");
assert.equal(markdownItLock.version, "15.0.0", "the resolved Markdown-it baseline should remain 15.0.0");
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
