export const regressionMeta = Object.freeze({
  id: "framework.typecheck-seams",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "typecheck"],
  description: "Proves the high-value framework seams stay @ts-check opted-in against the shared contract types, without ts-nocheck/ts-ignore escapes or runtime .ts imports.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const CHECKED_SEAM_FILES = [
  "src/core/files/files.contracts.js",
  "src/core/modules/manifest-contract.js",
  "src/core/modules/registry.js",
  "src/core/search/indexer-registry.js",
  "src/services/notifications.service.js",
  "src/services/search.service.js",
  "src/services/tag-propagation-registry.js",
  "src/services/tags.service.js",
  "src/services/work-candidate.service.js",
  "src/services/work-focus-modes.service.js",
  "src/services/work-resume-state-producers.js",
  "src/services/work-resume-state.service.js",
];

const CONTRACT_TYPE_EXPORTS = [
  "ModuleManifest",
  "ViewSurfaceDescriptor",
  "DashboardContribution",
  "WorkbenchContribution",
  "WorkCandidate",
  "FocusModeDefinition",
  "FocusModeContext",
  "ResumeStatePayload",
  "SearchRecord",
  "SearchReference",
  "SearchResult",
  "SearchIndexer",
  "NotificationEventPayload",
  "TaggableTypeContribution",
  "SearchableTypeContribution",
  "AttachableTypeContribution",
  "PublicApiListEnvelope",
  "PublicApiErrorEnvelope",
  "JobEnqueueOptions",
  "JobRecord",
  "JobHandler",
  "DatabaseSeam",
];

// Every selected seam file keeps its @ts-check opt-in.
for (const seamFile of CHECKED_SEAM_FILES) {
  const source = readFileSync(seamFile, "utf8");
  assert.ok(
    source.startsWith("// @ts-check"),
    `${seamFile} must keep its // @ts-check pragma on the first line`,
  );
}

// The shared contract definitions exist and export the expected shapes.
const contractSource = readFileSync("src/types/framework-contracts.d.ts", "utf8");
for (const typeName of CONTRACT_TYPE_EXPORTS) {
  assert.match(
    contractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `framework-contracts.d.ts must export ${typeName}`,
  );
}

// tsconfig keeps the dev-check dials this checking regime depends on.
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
assert.equal(tsconfig.compilerOptions.noEmit, true);
assert.equal(tsconfig.compilerOptions.allowJs, true);
assert.notEqual(tsconfig.compilerOptions.checkJs, true, "checkJs stays per-file opt-in");
assert.equal(tsconfig.compilerOptions.strict, true, "strict stays on; type conflicts must keep firing");
assert.equal(
  tsconfig.compilerOptions.noImplicitAny,
  false,
  "noImplicitAny stays off for incremental JS checking; JSDoc adds annotations progressively",
);
assert.ok(tsconfig.compilerOptions.types.includes("node"));
assert.ok(tsconfig.include.includes("src/**/*.d.ts"), "contract .d.ts files must stay in the typecheck scope");

// No escape hatches: seams must not silence the checker, and runtime JS
// must not import .ts files.
const violations = { runtimeTsImports: [], tsIgnore: [], tsNocheck: [] };
for (const filePath of walkJsFiles("src")) {
  const source = readFileSync(filePath, "utf8");
  if (source.includes("@ts-nocheck")) {
    violations.tsNocheck.push(filePath);
  }
  if (source.includes("@ts-ignore")) {
    violations.tsIgnore.push(filePath);
  }
  if (/(?:import|export)\s[^;]*?from\s*["'][^"']+\.ts["']/.test(source)) {
    violations.runtimeTsImports.push(filePath);
  }
}
assert.deepEqual(violations.tsNocheck, [], "no runtime file may opt out with @ts-nocheck");
assert.deepEqual(violations.tsIgnore, [], "no runtime file may silence errors with @ts-ignore");
assert.deepEqual(violations.runtimeTsImports, [], "runtime JavaScript must not import .ts files");

console.log(`Typecheck seams guardrail passed: ${CHECKED_SEAM_FILES.length} seam files checked, ${CONTRACT_TYPE_EXPORTS.length} contract types exported, no checker escapes.`);

function walkJsFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkJsFiles(fullPath));
    } else if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
      files.push(fullPath.split(path.sep).join("/"));
    }
  }
  return files;
}
