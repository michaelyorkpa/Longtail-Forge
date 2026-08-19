export const regressionMeta = Object.freeze({
  id: "framework.module-import-boundaries",
  area: "framework",
  tier: "release-gate",
  tags: ["framework", "imports", "modules"],
  description: "Rejects new cross-module internal imports: modules must consume another module's capabilities through its public index.js entry point; pre-existing deep imports are baseline-managed.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const MODULES_ROOT = "src/modules";
const BASELINE_PATH = "scripts/baselines/module-internal-import-baseline.json";
const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;

const moduleNames = readdirSync(MODULES_ROOT).filter((entry) =>
  statSync(path.join(MODULES_ROOT, entry)).isDirectory(),
);

// Public entry points must exist for the modules other code consumes today.
for (const expected of ["client-projects", "lists", "notes", "tasks", "time-tracking", "users"]) {
  const entryPath = path.join(MODULES_ROOT, expected, "index.js");
  assert.ok(statSync(entryPath).isFile(), `${entryPath} public entry point must exist`);
  const entrySource = readFileSync(entryPath, "utf8");
  assert.match(entrySource, /Public entry point/, `${entryPath} should document that it is the module's public entry`);
}

const notesServiceSource = readFileSync(path.join(MODULES_ROOT, "notes", "notes.service.js"), "utf8");
const linkTargetDirectorySource = readFileSync(path.join(MODULES_ROOT, "notes", "link-target-directory.service.js"), "utf8");
assert.match(notesServiceSource, /linkTargetDirectory/, "Notes should consume the extracted link-target directory");
assert.doesNotMatch(
  notesServiceSource,
  /\.\.\/client-projects\/(?:clients|projects)|\.\.\/tasks\/tasks\.repo|\.\.\/lists\/(?:lists\.repo|access-policy)/,
  "Notes must not read another module's link-target rows directly",
);
for (const publicEntry of ["client-projects", "lists", "tasks", "users"]) {
  assert.match(
    linkTargetDirectorySource,
    new RegExp(`from ["']\\.\\.\\/${publicEntry}\\/index\\.js["']`),
    `Link-target directory should consume ${publicEntry} through its public entry point`,
  );
}

const findings = [];
for (const moduleName of moduleNames) {
  for (const filePath of walkJsFiles(path.join(MODULES_ROOT, moduleName))) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) {
        continue;
      }
      const resolved = path
        .normalize(path.join(path.dirname(filePath), specifier))
        .split(path.sep)
        .join("/");
      const target = resolved.match(/^src\/modules\/([^/]+)\/(.+)$/);
      if (!target) {
        continue;
      }
      const [, targetModule, targetFile] = target;
      if (targetModule === moduleName || targetFile === "index.js") {
        continue;
      }
      findings.push({
        file: filePath.split(path.sep).join("/"),
        specifier,
      });
    }
  }
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const baselineKeys = new Set(baseline.deepImports.map((/** @type {{ file: string, specifier: string }} */ entry) => `${entry.file} -> ${entry.specifier}`));
const foundKeys = new Set(findings.map((entry) => `${entry.file} -> ${entry.specifier}`));

const newViolations = [...foundKeys].filter((key) => !baselineKeys.has(key)).toSorted();
const resolvedLegacy = [...baselineKeys].filter((key) => !foundKeys.has(key)).toSorted();

if (resolvedLegacy.length > 0) {
  console.log(`Resolved legacy deep imports no longer present (${resolvedLegacy.length}); shrink the baseline in a dedicated cleanup:`);
  for (const key of resolvedLegacy) {
    console.log(`- ${key}`);
  }
}

assert.deepEqual(
  newViolations,
  [],
  `New cross-module internal import(s) found. Import the other module's public entry point (src/modules/<module>/index.js) instead, or extend that entry point if the capability is genuinely public:\n${newViolations.join("\n")}`,
);

console.log(
  `Module import boundaries passed: ${moduleNames.length} modules scanned, ${foundKeys.size} baseline-managed legacy deep imports, 0 new violations.`,
);

/** @param {string} directory @returns {string[]} */
function walkJsFiles(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkJsFiles(fullPath));
    } else if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
      files.push(fullPath);
    }
  }
  return files;
}
