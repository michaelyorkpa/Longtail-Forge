// Consolidated under views.current-static-contracts by 0.33.33.9.
export const regressionMeta = Object.freeze({
  id: "views.mobile-foundation",
  area: "views",
  tier: "focused",
  tags: ["css", "mobile", "responsive", "views"],
  description: "Pins the mobile foundation: exact viewport meta on every view, shared breakpoint/tap-target tokens, base media constraints, and a frozen media-query allowlist in the framework CSS.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const viewDirs = [
  path.join(root, "views", "public"),
  path.join(root, "views", "protected"),
];
const frameworkCssPath = path.join(root, "public", "css", "longtail-forge.css");

// Every view (the framework serves the same shell to all of them) must carry
// the exact mobile-safe viewport meta. The accessibility regression only
// requires that some viewport meta exists; this pins the content.
const CANONICAL_VIEWPORT_META = /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1"\s*\/?>/;

// Canonical shared breakpoints. New @media rules must use these values (or a
// prefers-* feature query); the frozen legacy set below may only shrink.
const CANONICAL_MEDIA_PARAMS = new Set([
  "(max-width: 700px)",
  "(min-width: 701px)",
  "(max-width: 1024px)",
  "(min-width: 1025px)",
]);

// Frozen legacy media queries predating the shared breakpoints, with their
// maximum allowed occurrence counts. Reduce a count when a surface migrates
// to the canonical breakpoints; never raise one and never add an entry.
const FROZEN_LEGACY_MEDIA_PARAMS = new Map([
  ["(max-width: 640px)", 2],
  ["(max-width: 720px)", 1],
  ["(max-width: 760px)", 2],
  ["(max-width: 899px)", 1],
  ["(min-width: 900px)", 1],
  ["(max-width: 1099px)", 1],
  ["(min-width: 1100px)", 1],
  ["(max-width: 1366px)", 1],
]);

let checks = 0;

const viewFiles = (await Promise.all(viewDirs.map(listHtmlFiles))).flat();

assert.ok(viewFiles.length > 0, "view discovery should find HTML views");

for (const filePath of viewFiles) {
  const html = await fs.readFile(filePath, "utf8");
  const label = path.relative(root, filePath);

  assert.match(
    html,
    CANONICAL_VIEWPORT_META,
    `${label} must declare the exact mobile-safe viewport meta (width=device-width, initial-scale=1)`,
  );
  checks += 1;
}

const css = await fs.readFile(frameworkCssPath, "utf8");

// Shared responsive tokens are the single source of responsive truth.
for (const token of ["--breakpoint-mobile: 700px", "--breakpoint-tablet: 1024px", "--tap-target-min: 44px"]) {
  assert.ok(css.includes(token), `framework CSS must pin the shared responsive token ${token}`);
  checks += 1;
}

assert.match(css, /Responsive foundation/, "framework CSS must document the responsive foundation section");
checks += 1;

// Breakpoint utility classes exist for surfaces to consume.
for (const utility of [".u-hide-mobile", ".u-mobile-only"]) {
  assert.ok(css.includes(utility), `framework CSS must provide the ${utility} breakpoint utility class`);
  checks += 1;
}

// Base media constraint: embedded media never forces horizontal scroll.
assert.match(
  css,
  /img,\s*\nsvg,\s*\nvideo,\s*\ncanvas \{\s*\n\s*max-width: 100%;/,
  "framework CSS must constrain embedded media to max-width: 100%",
);
checks += 1;

// Mobile base typography and tap-target floor at the shell level.
assert.match(
  css,
  /button \{\s*\n\s*min-height: var\(--tap-target-min\);/,
  "framework CSS must give buttons the shared tap-target floor at the mobile breakpoint",
);
assert.match(
  css,
  /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\) \{\s*\n\s*min-height: var\(--tap-target-min\);/,
  "framework CSS must give text-style inputs the shared tap-target floor at the mobile breakpoint",
);
checks += 2;

// Every media query in the framework CSS is either canonical, a prefers-*
// feature query, or within the frozen legacy allowance above.
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const mediaParams = [...cssWithoutComments.matchAll(/@media([^{]+)\{/g)].map((match) => normalizeMediaParams(match[1]));
const legacyCounts = new Map();

for (const params of mediaParams) {
  if (params.startsWith("(prefers-") || CANONICAL_MEDIA_PARAMS.has(params)) {
    continue;
  }

  assert.ok(
    FROZEN_LEGACY_MEDIA_PARAMS.has(params),
    `framework CSS media query ${params} is neither a canonical shared breakpoint nor a frozen legacy value; use the documented breakpoints`,
  );
  legacyCounts.set(params, (legacyCounts.get(params) || 0) + 1);
}

for (const [params, count] of legacyCounts) {
  assert.ok(
    // Every key in legacyCounts passed the FROZEN_LEGACY_MEDIA_PARAMS.has(params)
    // admission above, so the allowance lookup is always present here.
    count <= /** @type {number} */ (FROZEN_LEGACY_MEDIA_PARAMS.get(params)),
    `framework CSS uses the frozen legacy media query ${params} ${count} times; the frozen allowance is ${FROZEN_LEGACY_MEDIA_PARAMS.get(params)} and may only shrink`,
  );
}
checks += mediaParams.length;

console.log(`Mobile foundation regression passed ${checks} checks across ${viewFiles.length} views and ${mediaParams.length} media queries.`);

/** @param {string} directory @returns {Promise<string[]>} */
async function listHtmlFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(directory, entry.name));
}

/** @param {string} rawParams @returns {string} */
function normalizeMediaParams(rawParams) {
  return rawParams.replace(/\s+/g, " ").trim();
}
