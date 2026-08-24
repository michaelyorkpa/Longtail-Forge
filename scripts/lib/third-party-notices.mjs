import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { requireManifestString, requirePackageLock, requirePackageManifest } from "../test-support/package-manifest-assertions.mjs";
import path from "node:path";

const NOTICES_PATH = "THIRD_PARTY_NOTICES.md";
const LOCK_PATH = "package-lock.json";
const LUCIDE_NOTICE_PATH = "public/icons/LUCIDE-LICENSE.md";
const ALLOWED_LICENSES = new Set([
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "Python-2.0",
]);
const LICENSE_FILE_PATTERN = /^(?:licen[sc]e|copying|notice)(?:\..*)?$/i;

/**
 * Result of checking THIRD_PARTY_NOTICES.md against the generated inventory.
 * @typedef {object} ThirdPartyNoticeStatus
 * @property {number} componentCount
 * @property {boolean} current
 * @property {string} message
 */

/**
 * One reviewed shipped component or bundled asset.
 * @typedef {object} ThirdPartyNoticeRecord
 * @property {string} copyright
 * @property {string} license
 * @property {string} licenseHash
 * @property {string} licenseText
 * @property {string} name
 * @property {string} version
 */

/**
 * Hand-reviewed metadata override for one package@version.
 * @typedef {object} ReviewedLicenseOverride
 * @property {string} [copyright]
 * @property {string} [license]
 * @property {string} [licenseText]
 * @property {string} [licenseTextFrom]
 */

/**
 * Components sharing one exact license text.
 * @typedef {object} LicenseTextGroup
 * @property {string[]} components
 * @property {string} hash
 * @property {string} text
 */

/**
 * The package-lock subset the notice generator reads.
 * @typedef {object} PackageLockDocument
 * @property {Record<string, { dev?: boolean, license?: string }>} [packages]
 */

/** @type {Readonly<Record<string, ReviewedLicenseOverride>>} */
const REVIEWED_OVERRIDES = Object.freeze({
  "argparse@2.0.1": Object.freeze({
    copyright: "Python Software Foundation and contributors",
    license: "Python-2.0",
  }),
  "busboy@1.6.0": Object.freeze({
    copyright: "Brian White",
    license: "MIT",
  }),
  "cookie-signature@1.0.6": Object.freeze({
    copyright: "LearnBoost and contributors",
    license: "MIT",
    licenseTextFrom: "node_modules/express/node_modules/cookie-signature/LICENSE",
  }),
  "punycode.js@2.3.1": Object.freeze({
    copyright: "Mathias Bynens and contributors",
    license: "MIT",
    licenseText: standardMitLicense("Mathias Bynens and contributors"),
  }),
  "streamsearch@1.1.0": Object.freeze({
    copyright: "Brian White",
    license: "MIT",
  }),
});

/**
 * Check the checked-in notices file against the generated inventory.
 * @param {{ rootDir?: string }} [options]
 * @returns {ThirdPartyNoticeStatus}
 */
function inspectThirdPartyNotices({ rootDir = process.cwd() } = {}) {
  try {
    const expected = generateThirdPartyNotices({ rootDir });
    const noticesPath = path.join(rootDir, NOTICES_PATH);
    if (!existsSync(noticesPath)) {
      return Object.freeze({
        componentCount: expected.componentCount,
        current: false,
        message: `${NOTICES_PATH} is missing.`,
      });
    }
    const actual = normalizeNewlines(readFileSync(noticesPath, "utf8"));
    if (actual !== expected.content) {
      return Object.freeze({
        componentCount: expected.componentCount,
        current: false,
        message: `${NOTICES_PATH} is stale; run npm run third-party-notices:write and review the diff.`,
      });
    }
    return Object.freeze({
      componentCount: expected.componentCount,
      current: true,
      message: `${NOTICES_PATH} covers ${expected.componentCount} reviewed shipped components/assets.`,
    });
  } catch (error) {
    return Object.freeze({
      componentCount: 0,
      current: false,
      message: `Third-party notice inventory could not be verified: ${/** @type {Error} */ (error).message}`,
    });
  }
}

/**
 * Regenerate and write THIRD_PARTY_NOTICES.md.
 * @param {{ rootDir?: string }} [options]
 */
function writeThirdPartyNotices({ rootDir = process.cwd() } = {}) {
  const result = generateThirdPartyNotices({ rootDir });
  writeFileSync(path.join(rootDir, NOTICES_PATH), result.content, "utf8");
  return result;
}

/**
 * Generate the full notices document from the production dependency closure.
 * @param {{ rootDir?: string }} [options]
 */
function generateThirdPartyNotices({ rootDir = process.cwd() } = {}) {
  const lock = requirePackageLock(JSON.parse(readFileSync(path.join(rootDir, LOCK_PATH), "utf8")));
  const packageRecords = productionPackageRecords(lock, rootDir);
  const assetRecords = [lucideRecord(rootDir)];
  const records = [...packageRecords, ...assetRecords].sort(compareRecords);
  const licenseGroups = groupLicenseTexts(records);
  const textReferenceByHash = new Map(
    licenseGroups.map((group, index) => [group.hash, `L${String(index + 1).padStart(2, "0")}`]),
  );

  const lines = [
    "# Third-Party Notices",
    "",
    "This file records third-party software and assets shipped with Longtail Forge.",
    "It is generated from the production dependency closure in `package-lock.json`",
    "plus the reviewed bundled-asset inventory. Development-only tooling is excluded.",
    "",
    "Regenerate with `npm run third-party-notices:write`, review every changed",
    "component and license text by hand, then run `npm run licensing:gates`.",
    "",
    "The listed MIT, ISC, BSD-2-Clause, BSD-3-Clause, and Python-2.0 terms are",
    "permissive and compatible with distributing Longtail Forge under",
    "`AGPL-3.0-only`; each component remains governed by its own terms.",
    "",
    "## Reviewed shipped inventory",
    "",
    "| Component | Version | License | Copyright holder(s) | License text |",
    "| --- | --- | --- | --- | --- |",
    ...records.map((record) => {
      const reference = /** @type {string} */ (textReferenceByHash.get(record.licenseHash));
      return `| ${escapeTable(record.name)} | ${escapeTable(record.version)} | ${escapeTable(record.license)} | ${escapeTable(record.copyright)} | [${reference}](#${reference.toLowerCase()}) |`;
    }),
    "",
    "## Bundled-asset audit",
    "",
    "- Bundled third-party asset: the local Lucide-derived inline SVG path subset",
    "  documented in `public/icons/LUCIDE-LICENSE.md`.",
    "- Bundled fonts: none. Runtime CSS uses system font stacks.",
    "- Vendored browser libraries: none. Runtime browser JavaScript is first-party.",
    "- `public/assets/logo.webp` and `public/favicon.ico` are first-party branding,",
    "  not third-party assets. `public/assets/logo-concepts.png` is not included in",
    "  the runtime artifact.",
    "",
    "## Required license and notice texts",
    "",
  ];

  for (const [index, group] of licenseGroups.entries()) {
    const reference = `L${String(index + 1).padStart(2, "0")}`;
    lines.push(
      `### ${reference}`,
      "",
      `Applies to: ${group.components.join(", ")}`,
      "",
      "```text",
      group.text,
      "```",
      "",
    );
  }

  return Object.freeze({
    componentCount: records.length,
    content: `${lines.join("\n").trim()}\n`,
    records: Object.freeze(records),
  });
}

/**
 * Build reviewed records for every shipped production package.
 * @param {PackageLockDocument} lock
 * @param {string} rootDir
 * @returns {ThirdPartyNoticeRecord[]}
 */
function productionPackageRecords(lock, rootDir) {
  /** @type {Map<string, ThirdPartyNoticeRecord>} */
  const byComponent = new Map();
  for (const [packagePath, lockMetadata] of Object.entries(lock.packages || {})) {
    if (!packagePath || lockMetadata?.dev === true) {
      continue;
    }
    const packageDir = path.join(rootDir, ...packagePath.split("/"));
    const packageJson = requirePackageManifest(JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")));
    const key = `${packageJson.name}@${packageJson.version}`;
    if (byComponent.has(key)) {
      continue;
    }
    /** @type {ReviewedLicenseOverride} */
    const override = REVIEWED_OVERRIDES[key] || {};
    const license = override.license || normalizeLicense(packageJson.license || lockMetadata.license);
    if (!ALLOWED_LICENSES.has(license)) {
      throw new Error(`${key} has unreviewed or incompatible license identifier: ${license || "missing"}.`);
    }
    const licenseText = resolveLicenseText({ key, override, packageDir, rootDir });
    const copyright = override.copyright || extractCopyright(licenseText);
    if (!copyright) {
      throw new Error(`${key} has no reviewed copyright holder.`);
    }
    byComponent.set(key, createRecord({
      copyright,
      license,
      licenseText,
      name: requireManifestString(packageJson, "name", "dependency package.json"),
      version: requireManifestString(packageJson, "version", "dependency package.json"),
    }));
  }
  return [...byComponent.values()];
}

/**
 * Resolve the reviewed license text for one package.
 * @param {{ key: string, override: ReviewedLicenseOverride, packageDir: string, rootDir: string }} input
 * @returns {string}
 */
function resolveLicenseText({ key, override, packageDir, rootDir }) {
  if (override.licenseText) {
    return override.licenseText;
  }
  if (override.licenseTextFrom) {
    return readLicenseText(path.join(rootDir, override.licenseTextFrom));
  }
  const licenseFile = readdirSync(packageDir).find((name) => LICENSE_FILE_PATTERN.test(name));
  if (!licenseFile) {
    throw new Error(`${key} has no license text; add a reviewed override.`);
  }
  return readLicenseText(path.join(packageDir, licenseFile));
}

/**
 * Record for the bundled Lucide-derived inline SVG subset.
 * @param {string} rootDir
 * @returns {ThirdPartyNoticeRecord}
 */
function lucideRecord(rootDir) {
  const source = normalizeNewlines(readFileSync(path.join(rootDir, LUCIDE_NOTICE_PATH), "utf8"));
  const marker = "## License text\n\n";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${LUCIDE_NOTICE_PATH} is missing its reviewed license text.`);
  }
  return createRecord({
    copyright: "Lucide Icons and Contributors; Cole Bemis",
    license: "ISC AND MIT",
    licenseText: source.slice(markerIndex + marker.length).trim(),
    name: "Lucide Icons (bundled inline SVG subset)",
    version: "local subset first recorded 2026-06-06",
  });
}

/**
 * Build one normalized, hashed inventory record.
 * @param {{ copyright: string, license: string, licenseText: string, name: string, version: string }} input
 * @returns {ThirdPartyNoticeRecord}
 */
function createRecord({ copyright, license, licenseText, name, version }) {
  const text = normalizeNewlines(licenseText)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return Object.freeze({
    copyright: copyright.replace(/\s+/g, " ").trim(),
    license,
    licenseHash: createHash("sha256").update(text).digest("hex"),
    licenseText: text,
    name,
    version,
  });
}

/**
 * Group records by identical license text, ordered by first component.
 * @param {readonly ThirdPartyNoticeRecord[]} records
 * @returns {LicenseTextGroup[]}
 */
function groupLicenseTexts(records) {
  /** @type {Map<string, LicenseTextGroup>} */
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.licenseHash)) {
      groups.set(record.licenseHash, {
        components: [],
        hash: record.licenseHash,
        text: record.licenseText,
      });
    }
    /** @type {LicenseTextGroup} */ (groups.get(record.licenseHash)).components.push(`${record.name}@${record.version}`);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      components: group.components.sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.components[0].localeCompare(right.components[0]));
}

/**
 * Collect the unique copyright lines from a license text.
 * @param {string} text
 * @returns {string}
 */
function extractCopyright(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^copyright\b(?!\s+(?:notice|holder))/i.test(line))
    .map((line) => line.replace(/^[-*]\s*/, ""));
  return [...new Set(lines)].join("; ");
}

/**
 * Read and normalize a license text file.
 * @param {string} filePath
 * @returns {string}
 */
function readLicenseText(filePath) {
  return normalizeNewlines(readFileSync(filePath, "utf8")).replace(/^\uFEFF/, "").trim();
}

/**
 * Normalize a raw license identifier, unwrapping single-expression parens.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeLicense(value) {
  if (typeof value === "string") {
    return value.replace(/^\((.*)\)$/, "$1");
  }
  return "";
}

/**
 * Convert all newline forms to bare LF.
 * @param {string} value
 * @returns {string}
 */
function normalizeNewlines(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

/**
 * Order records by name@version.
 * @param {ThirdPartyNoticeRecord} left
 * @param {ThirdPartyNoticeRecord} right
 * @returns {number}
 */
function compareRecords(left, right) {
  return `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`);
}

/**
 * Escape a value for a one-line Markdown table cell.
 * @param {string} value
 * @returns {string}
 */
function escapeTable(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/**
 * The standard MIT license text for one copyright holder.
 * @param {string} holder
 * @returns {string}
 */
function standardMitLicense(holder) {
  return `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

export {
  NOTICES_PATH,
  escapeTable,
  generateThirdPartyNotices,
  inspectThirdPartyNotices,
  writeThirdPartyNotices,
};
