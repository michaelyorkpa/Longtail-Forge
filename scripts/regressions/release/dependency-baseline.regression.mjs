export const regressionMeta = Object.freeze({
  id: "release.dependency-baseline",
  area: "release",
  tier: "release-gate",
  tags: ["dependencies", "markdown", "release", "tooling"],
  description: "Pins the reviewed ESLint 10.8, Node types 26.1.2, and Markdown-it 14.3 dependency baseline and keeps obsolete js-yaml out of the resolved graph.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const rootLock = packageLock.packages[""];
const eslintLock = packageLock.packages["node_modules/eslint"];
const eslintConfigHelpersLock = packageLock.packages["node_modules/@eslint/config-helpers"];
const minimatchLock = packageLock.packages["node_modules/minimatch"];
const nodeTypesLock = packageLock.packages["node_modules/@types/node"];
const markdownItLock = packageLock.packages["node_modules/markdown-it"];

assert.equal(packageJson.devDependencies.eslint, "^10.8.0", "ESLint should use the reviewed 10.8 development baseline");
assert.equal(packageJson.dependencies.eslint, undefined, "ESLint must remain development-only tooling");
assert.equal(rootLock.devDependencies.eslint, "^10.8.0", "the lockfile root should match the ESLint package contract");
assert.equal(eslintLock.version, "10.8.0", "the resolved ESLint baseline should remain 10.8.0");
assert.equal(eslintLock.dev, true, "the resolved ESLint package must remain development-only");
assert.match(eslintLock.engines.node, />=24/, "ESLint 10.8 should declare support for the repository's Node 24 runtime line");
assert.equal(eslintLock.dependencies["@eslint/config-helpers"], "^0.7.0", "ESLint should retain its reviewed config-helpers range");
assert.equal(eslintConfigHelpersLock.version, "0.7.0", "config-helpers should resolve to the reviewed 0.7 baseline");
assert.equal(eslintLock.dependencies.minimatch, "^10.2.5", "ESLint should retain its reviewed minimatch range");
assert.equal(minimatchLock.version, "10.2.5", "minimatch should resolve to the reviewed 10.2.5 baseline");

assert.equal(packageJson.devDependencies["@types/node"], "^26.1.2", "Node types should use the reviewed 26.1.2 development baseline");
assert.equal(packageJson.dependencies["@types/node"], undefined, "Node types must remain development-only tooling");
assert.equal(rootLock.devDependencies["@types/node"], "^26.1.2", "the lockfile root should match the Node types package contract");
assert.equal(rootLock.dependencies["@types/node"], undefined, "the lockfile root must not promote Node types to a runtime dependency");
assert.equal(nodeTypesLock.version, "26.1.2", "the resolved Node types baseline should remain 26.1.2");
assert.equal(nodeTypesLock.dev, true, "the resolved Node types package must remain development-only");
assert.equal(packageJson.engines.node, ">=24.7 <25", "the repository should retain its supported Node 24 range");
assert.deepEqual(packageJson.allowScripts, { "better-sqlite3@13.0.1": true }, "the approved lifecycle-script allowlist must remain unchanged");

assert.equal(packageJson.dependencies["markdown-it"], "^14.3.0", "Markdown-it should use the reviewed 14.3 runtime baseline");
assert.equal(rootLock.dependencies["markdown-it"], "^14.3.0", "the lockfile root should match the Markdown-it package contract");
assert.equal(markdownItLock.version, "14.3.0", "the resolved Markdown-it baseline should remain 14.3.0");
assert.equal(markdownItLock.dependencies.entities, "^4.5.0", "Markdown-it should retain its reviewed entities range");
assert.equal(markdownItLock.dependencies["linkify-it"], "^5.0.2", "Markdown-it should retain its reviewed linkify-it range");
assert.equal(packageLock.packages["node_modules/entities"].version, "4.5.0", "entities should resolve to the reviewed 4.5 baseline");
assert.equal(packageLock.packages["node_modules/linkify-it"].version, "5.0.2", "linkify-it should resolve to the reviewed 5.0.2 baseline");

const backslashSpaceHardBreakSource = "Literal backslash\\  \nNext line";
for (const [mode, breaks] of [
  ["document/default", false],
  ["user-authored", true],
]) {
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

assert.equal(packageJson.dependencies["js-yaml"], undefined, "js-yaml should not become a direct runtime dependency");
assert.equal(packageJson.devDependencies["js-yaml"], undefined, "js-yaml should not become a direct development dependency");
assert.equal(packageLock.packages["node_modules/js-yaml"], undefined, "ESLint 10 should remove obsolete js-yaml from the resolved graph");


console.log("Dependency baseline regression passed.");
