export const regressionMeta = Object.freeze({
  id: "framework.typecheck-seams",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "typecheck"],
  description: "Proves the complete first-party checked-seam inventory and compiler settings stay monotonic without checker escapes or runtime TypeScript imports.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const seamInventory = JSON.parse(readFileSync("scripts/typecheck-seam-inventory.json", "utf8"));
const CHECKED_SEAM_FILES = seamInventory.checkedFiles;
const EXPECTED_TYPECHECK_INCLUDES = [
  "server.js",
  "worker.js",
  "src/**/*.js",
  "src/**/*.d.ts",
  "tests/**/*.mjs",
];
const EXPECTED_TYPECHECK_EXCLUDES = [
  "node_modules",
  "archive",
  "data",
  "logs",
  "images",
  "public",
  "styles",
  "views",
];
const EXPECTED_COMPILER_OPTION_KEYS = [
  "allowJs",
  "checkJs",
  "forceConsistentCasingInFileNames",
  "module",
  "moduleResolution",
  "noEmit",
  "noImplicitAny",
  "resolveJsonModule",
  "skipLibCheck",
  "strict",
  "target",
  "types",
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

// The checked-in inventory is the complete review surface, not a hand-picked
// subset. Its floor can rise with later slices but cannot silently fall.
assert.equal(seamInventory.schemaVersion, 1, "the checked-seam inventory schema must stay explicit");
assert.ok(
  Number.isInteger(seamInventory.minimumOptedInFiles) && seamInventory.minimumOptedInFiles >= 23,
  "the checked-seam floor must never fall below the initial baseline of 23 files",
);
assert.deepEqual(
  CHECKED_SEAM_FILES,
  [...new Set(CHECKED_SEAM_FILES)].sort(),
  "checkedFiles must stay unique and sorted for reviewable diffs",
);
assert.ok(
  CHECKED_SEAM_FILES.length >= seamInventory.minimumOptedInFiles,
  `checked-seam inventory fell below its monotonic floor of ${seamInventory.minimumOptedInFiles}`,
);

const discoveredCheckedFiles = [
  "server.js",
  "worker.js",
  ...walkScriptFiles("src", new Set([".js"])),
  ...walkScriptFiles("tests", new Set([".mjs"])),
]
  .filter((filePath) => readFileSync(filePath, "utf8").startsWith("// @ts-check"))
  .sort();
assert.deepEqual(
  discoveredCheckedFiles,
  CHECKED_SEAM_FILES,
  "every first-party // @ts-check file must appear in the checked-seam inventory, and every inventoried file must keep its pragma",
);

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
assert.deepEqual(
  Object.keys(tsconfig.compilerOptions).sort(),
  EXPECTED_COMPILER_OPTION_KEYS,
  "compiler options must not add an unreviewed override that weakens a preserved checking dial",
);
assert.equal(tsconfig.compilerOptions.target, "es2023");
assert.equal(tsconfig.compilerOptions.module, "nodenext");
assert.equal(tsconfig.compilerOptions.moduleResolution, "nodenext");
assert.equal(tsconfig.compilerOptions.noEmit, true);
assert.equal(tsconfig.compilerOptions.allowJs, true);
assert.equal(tsconfig.compilerOptions.checkJs, false, "checkJs stays per-file opt-in");
assert.equal(tsconfig.compilerOptions.strict, true, "strict stays on; type conflicts must keep firing");
assert.equal(
  tsconfig.compilerOptions.noImplicitAny,
  false,
  "noImplicitAny stays off for incremental JS checking; JSDoc adds annotations progressively",
);
assert.equal(tsconfig.compilerOptions.skipLibCheck, true);
assert.equal(tsconfig.compilerOptions.resolveJsonModule, true);
assert.deepEqual(tsconfig.compilerOptions.types, ["node"]);
assert.equal(tsconfig.compilerOptions.forceConsistentCasingInFileNames, true);
assert.deepEqual(tsconfig.include, EXPECTED_TYPECHECK_INCLUDES, "the complete checked source and declaration scope must stay explicit");
assert.deepEqual(tsconfig.exclude, EXPECTED_TYPECHECK_EXCLUDES, "the typecheck scope must not gain an unreviewed exclusion");

const checkedTestFiles = CHECKED_SEAM_FILES.filter((filePath) => filePath.startsWith("tests/"));
assert.ok(
  tsconfig.include.includes("tests/**/*.mjs") && tsconfig.compilerOptions.checkJs === false,
  "tests/**/*.mjs stays a nominal per-file opt-in scope; unchecked tests do not provide type coverage",
);

// No escape hatches: seams must not silence the checker, and runtime JS
// must not import .ts files.
const violations = { runtimeTsImports: [], tsIgnore: [], tsNocheck: [] };
const runtimeFiles = [
  "server.js",
  "worker.js",
  ...walkScriptFiles("src", new Set([".js", ".mjs"])),
  ...walkScriptFiles("public", new Set([".js", ".mjs"])),
];
for (const filePath of runtimeFiles) {
  const source = readFileSync(filePath, "utf8");
  if (source.includes("@ts-nocheck")) {
    violations.tsNocheck.push(filePath);
  }
  if (source.includes("@ts-ignore")) {
    violations.tsIgnore.push(filePath);
  }
  if (/(?:from\s*|import\s*(?:\(\s*)?)["'][^"']+\.ts["']/.test(source)) {
    violations.runtimeTsImports.push(filePath);
  }
}
assert.deepEqual(violations.tsNocheck, [], "no runtime file may opt out with @ts-nocheck");
assert.deepEqual(violations.tsIgnore, [], "no runtime file may silence errors with @ts-ignore");
assert.deepEqual(violations.runtimeTsImports, [], "runtime JavaScript must not import .ts files");

console.log(
  `Typecheck seams guardrail passed: ${CHECKED_SEAM_FILES.length} files inventoried at floor ${seamInventory.minimumOptedInFiles}, ${checkedTestFiles.length} tests explicitly opted in, ${CONTRACT_TYPE_EXPORTS.length} contract types exported, no checker escapes.`,
);

function walkScriptFiles(directory, extensions) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkScriptFiles(fullPath, extensions));
    } else if (extensions.has(path.extname(entry))) {
      files.push(fullPath.split(path.sep).join("/"));
    }
  }
  return files;
}
