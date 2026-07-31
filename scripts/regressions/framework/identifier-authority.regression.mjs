export const regressionMeta = Object.freeze({
  id: "framework.identifier-authority",
  area: "framework",
  tier: "release-gate",
  tags: ["architecture", "database", "identifiers", "security", "static"],
  description: "Keeps production UUID generation behind the central authority and freezes the temporary direct-generator migration baseline.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const AUTHORITY_PATH = "src/core/identifiers.js";
const BASELINE_PATH = "scripts/identifier-authority-migration-baseline.json";
const PRODUCTION_ROOTS = ["src", "public/js", "scripts/lib", "scripts/release"];
const PACKAGE_SCAN_ROOTS = ["src", "public/js", "scripts", "tests"];

const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
assert.equal(baseline.schemaVersion, 1, "identifier migration baseline schema must remain recognized");

const productionFiles = (await Promise.all(PRODUCTION_ROOTS.map(listCodeFiles))).flat().sort();
const actualDirectCalls = {};
for (const filePath of productionFiles) {
  const source = await fs.readFile(filePath, "utf8");
  const calls = countMatches(source, /\brandomUUID\s*\(/g);
  if (calls > 0) actualDirectCalls[filePath] = calls;
}

const expectedDirectCalls = Object.fromEntries(
  Object.entries(baseline.productionDirectRandomUuid)
    .map(([filePath, entry]) => [filePath, entry.calls])
    .sort(([left], [right]) => left.localeCompare(right)),
);
assert.deepEqual(
  actualDirectCalls,
  expectedDirectCalls,
  "Production direct randomUUID calls must match the temporary exact baseline; migrate and shrink the baseline deliberately, never grow or relocate it.",
);

const packageImportViolations = [];
const packageScanFiles = (await Promise.all(PACKAGE_SCAN_ROOTS.map(listCodeFiles))).flat().sort();
for (const filePath of packageScanFiles) {
  const source = await fs.readFile(filePath, "utf8");
  if (filePath !== AUTHORITY_PATH && hasUuidPackageImport(source)) {
    packageImportViolations.push(filePath);
  }
}
assert.deepEqual(
  packageImportViolations,
  [],
  "Only src/core/identifiers.js may import, require, or dynamically import the uuid package.",
);

const authoritySource = await fs.readFile(AUTHORITY_PATH, "utf8");
assert.match(authoritySource, /import\s*\{\s*v4\s+as\s+uuidv4\s*,\s*v7\s+as\s+uuidv7\s*\}\s*from\s*["']uuid["']/);
assert.match(authoritySource, /export function createRecordId\(/);
assert.match(authoritySource, /export function createOpaqueId\(/);
assert.doesNotMatch(
  authoritySource,
  /export function create(?:Token|Secret|Credential)/,
  "identifier authority must not grow a token, secret, or credential operation",
);

const browserBaseline = baseline.temporaryBrowserGenerator;
const browserSource = await fs.readFile(browserBaseline.path, "utf8");
assert.equal(
  countMatches(browserSource, /(?<!function\s)\bcreateUuid\s*\(/g),
  browserBaseline.createUuidCallSites,
  "The temporary browser createUuid call-site baseline must only shrink before removal.",
);
assert.equal(
  countMatches(browserSource, /10000000-1000-4000-8000-100000000000/g),
  browserBaseline.fallbackTemplates,
  "The temporary browser UUID fallback must not grow or move.",
);

const decisions = await fs.readFile("DECISIONS.md", "utf8");
const databaseDocs = await fs.readFile("docs/database.md", "utf8");
for (const requiredPhrase of [
  "Identifier Authority and Forward UUIDv7 Policy",
  "createRecordId()",
  "createOpaqueId()",
  "UUIDv4 and UUIDv7",
]) {
  assert.ok(decisions.includes(requiredPhrase), `DECISIONS.md must retain ${requiredPhrase}`);
  assert.ok(databaseDocs.includes(requiredPhrase), `docs/database.md must retain ${requiredPhrase}`);
}

console.log("Identifier authority regression checks passed.");

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function hasUuidPackageImport(source) {
  return /\bfrom\s*["']uuid["']|\bimport\s*\(\s*["']uuid["']\s*\)|\brequire\s*\(\s*["']uuid["']\s*\)/.test(source);
}

async function listCodeFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.posix.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCodeFiles(entryPath));
    } else if (/\.(?:js|mjs)$/.test(entry.name) || entry.name.endsWith(".example")) {
      files.push(entryPath);
    }
  }
  return files;
}
