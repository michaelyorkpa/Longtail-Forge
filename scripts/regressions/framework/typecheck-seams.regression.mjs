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
  "NotificationEventContribution",
  "NotificationFollowTargetContribution",
  "NotificationTemplateContribution",
  "ProtectedContentConsumerContribution",
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
  "DatabaseAdapter",
  "DatabaseDialect",
  "DatabaseInsertOptions",
  "DatabaseParameterToken",
  "DatabaseRowIdOptions",
  "DatabaseSeam",
  "NamedBindingEntry",
  "PreparedDatabaseBindings",
  "TransactionClient",
];
const REQUIRED_MODULE_MANIFEST_FIELDS = [
  ["id", "string"],
  ["name", "string"],
  ["displayName", "string"],
  ["description", "string"],
  ["category", "string"],
  ["version", "string"],
  ["enabledByDefault", "boolean"],
];
const HTTP_CONTRACT_TYPE_EXPORTS = [
  "SessionMode",
  "AuthenticatedIdentity",
  "SupportViewSession",
  "RequestSession",
  "SupportViewRequestSession",
  "ApiSession",
  "PermissionResource",
  "ActiveApiKey",
  "SessionRotation",
  "SessionRotationState",
  "SessionInvalidationState",
  "JsonBodyRequest",
  "ReadJsonBodyOptions",
  "SupportViewGateOutcome",
  "SupportViewGateReasonClass",
  "HttpIdentityRequest",
];

const normalizersSource = readFileSync("src/utils/normalizers.js", "utf8");
assert.match(normalizersSource, /@typedef \{"yes" \| "no" \| ""\} TimeEntryBillable/);
assert.match(normalizersSource, /@property \{string\} duration_seconds/);
assert.match(normalizersSource, /@property \{string\} duration_hours/);
assert.match(normalizersSource, /@returns \{TimeEntry\}/);

const timezonesSource = readFileSync("src/utils/timezones.js", "utf8");
assert.match(timezonesSource, /@typedef \{"start" \| "end"\} DateBoundEdge/);
assert.match(timezonesSource, /@typedef \{string \| number \| null \| undefined\} DateTimeInput/);
assert.match(timezonesSource, /@returns \{DateTimeParts \| null\}/);

const publicTimeEntryServiceSource = readFileSync("src/modules/time-tracking/public-api.service.js", "utf8");
assert.match(publicTimeEntryServiceSource, /const duration = normalizePublicApiDuration\(payload\)/);
assert.match(publicTimeEntryServiceSource, /duration_seconds: duration\.durationSeconds/);
assert.match(publicTimeEntryServiceSource, /duration_hours: duration\.durationHours/);
assert.match(publicTimeEntryServiceSource, /@typedef \{import\("zod"\)\.infer<typeof PublicApiTimeEntryCreateSchema>\} PublicApiTimeEntryCreatePayload/);
const timeEntryRepositorySource = readFileSync("src/modules/time-tracking/time-entries.repo.js", "utf8");
assert.match(timeEntryRepositorySource, /@typedef \{import\("\.\.\/\.\.\/utils\/normalizers\.js"\)\.TimeEntry\} TimeEntry/);
assert.match(timeEntryRepositorySource, /@param \{TimeEntry\} entry/);
const taskTimersServiceSource = readFileSync("src/modules/tasks/task-timers.service.js", "utf8");
assert.match(taskTimersServiceSource, /import \{ activeTimersService \} from "\.\.\/time-tracking\/index\.js"/);
assert.doesNotMatch(taskTimersServiceSource, /time-tracking\/active-timers\.service\.js/);
assert.match(taskTimersServiceSource, /function taskTimerBillable\(task\)[\s\S]*normalizeTimeEntryBillable\(task\?\.billable\) \|\| "yes"/);
const activeTimersServiceSource = readFileSync("src/modules/time-tracking/active-timers.service.js", "utf8");
assert.match(activeTimersServiceSource, /timer\.billable = normalizeTimeEntryBillable\(payload\?\.billable\) \|\| "yes"/);
assert.match(activeTimersServiceSource, /@typedef \{import\("\.\/active-timers\.repo\.js"\)\.ActiveTimer\} ActiveTimer/);
assert.match(activeTimersServiceSource, /function finalizedTimerFacts[\s\S]*durationHours: \(durationSeconds \/ 3600\)\.toFixed\(4\)/);
assert.doesNotMatch(activeTimersServiceSource, /durationHours: payload\?\.duration_hours/);
const activeTimersRepositorySource = readFileSync("src/modules/time-tracking/active-timers.repo.js", "utf8");
assert.match(activeTimersRepositorySource, /@typedef \{Object\} ActiveTimer/);
assert.match(activeTimersRepositorySource, /@param \{ActiveTimer\} timer[\s\S]*async function upsert\(timer\)/);
const billingServiceSource = readFileSync("src/modules/time-tracking/time-tracking-billing.service.js", "utf8");
assert.match(billingServiceSource, /timezone: session\.timezone \|\| DEFAULT_TIMEZONE/);
assert.match(billingServiceSource, /function getBillingPeriodRange[\s\S]*localDateKey\(today, timezone\)[\s\S]*dateKeyRange/);
assert.match(billingServiceSource, /function getCustomDateRange[\s\S]*addLocalDateDays\(endDateKey, 1\)[\s\S]*timezone/);
assert.doesNotMatch(billingServiceSource, /new Date\(today\.getFullYear\(\), today\.getMonth\(\)/);
const dashboardServiceSource = readFileSync("src/modules/time-tracking/time-tracking-dashboard.service.js", "utf8");
assert.match(dashboardServiceSource, /function dashboardEffortDateWindow[\s\S]*localDateKey\(now, effectiveTimezone\)/);
assert.match(dashboardServiceSource, /todayStart: localDateBoundToUtcIso\(today, effectiveTimezone\)/);
assert.doesNotMatch(dashboardServiceSource, /function localDateKey\(/);

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
const moduleManifestDeclaration = contractSource.match(/export interface ModuleManifest \{([\s\S]*?)\n\}/);
assert.ok(moduleManifestDeclaration, "framework-contracts.d.ts must declare ModuleManifest");
for (const [fieldName, fieldType] of REQUIRED_MODULE_MANIFEST_FIELDS) {
  assert.match(
    moduleManifestDeclaration[1],
    new RegExp(`^  ${fieldName}: ${fieldType};$`, "m"),
    `ModuleManifest.${fieldName} must remain required before runtime validation`,
  );
}
const modulesServiceSource = readFileSync("src/core/modules/modules.service.js", "utf8");
assert.match(
  modulesServiceSource,
  /^\/\/ @ts-check\r?\n/,
  "the framework-facing module registry service must remain in the checked seam inventory",
);
assert.match(
  modulesServiceSource,
  /@typedef \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.ModuleManifest\} ModuleManifest/,
  "the registry service must derive module definitions from the shared ModuleManifest contract",
);
assert.match(
  modulesServiceSource,
  /@typedef \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.TransactionClient\} TransactionClient/,
  "registry synchronization helpers must accept the callback-scoped database contract",
);
assert.match(
  modulesServiceSource,
  /function registeredModuleEventHooks\(\)[\s\S]*?@type \{ModuleEventHook\[\]\}/,
  "event hook execution must retain its checked private catalog projection",
);
const terminologySource = readFileSync("src/core/modules/terminology.js", "utf8");
assert.match(
  terminologySource,
  /@template \{Record<string, any>\} Definition[\s\S]*?@returns \{Definition\}[\s\S]*?function resolveModuleDefinitionTerminology/,
  "workspace terminology resolution must preserve the checked manifest projection it decorates",
);
const httpContractSource = readFileSync("src/types/http-contracts.d.ts", "utf8");
for (const typeName of HTTP_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    httpContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `http-contracts.d.ts must export ${typeName}`,
  );
}
assert.deepEqual(
  readStringUnion(httpContractSource, "SupportViewGateOutcome"),
  ["allowed", "denied"],
  "Support View outcomes must remain an exhaustive checked allow/deny vocabulary",
);
assert.deepEqual(
  readStringUnion(httpContractSource, "SupportViewGateReasonClass"),
  ["declared_read_safe", "mutation_denied", "sensitive_read_excluded", "undeclared_read_denied"],
  "Support View reasons must keep the checked 403/404 classification vocabulary",
);
assert.match(
  httpContractSource,
  /namespace Express[\s\S]+interface Request extends SessionRotationState, SessionInvalidationState/,
  "the HTTP contract must augment Express.Request with identity and session lifecycle state",
);
const httpUtilitySource = readFileSync("src/utils/http.js", "utf8");
assert.match(
  httpUtilitySource,
  /@returns \{Promise<unknown>\}[\s\S]{0,120}function readJsonBody/,
  "readJsonBody must preserve unknown at the checked request-body boundary",
);
const checkedJsonBodyConsumers = CHECKED_SEAM_FILES.filter((filePath) => (
  filePath !== "src/utils/http.js" && readFileSync(filePath, "utf8").includes("readJsonBody")
));
assert.deepEqual(
  checkedJsonBodyConsumers,
  ["src/routes/support-view.routes.js"],
  "every checked readJsonBody consumer must be inventoried for explicit unknown narrowing",
);
assert.match(
  readFileSync("src/routes/support-view.routes.js", "utf8"),
  /if \(!isJsonObject\(payload\) \|\| payload\.confirmedReadOnly !== true\)/,
  "the checked Support View route must narrow unknown JSON before property access",
);

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
  `Typecheck seams guardrail passed: ${CHECKED_SEAM_FILES.length} files inventoried at floor ${seamInventory.minimumOptedInFiles}, ${checkedTestFiles.length} tests explicitly opted in, ${CONTRACT_TYPE_EXPORTS.length + HTTP_CONTRACT_TYPE_EXPORTS.length} contract types exported, no checker escapes.`,
);

function readStringUnion(source, typeName) {
  const declaration = source.match(new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?);`));
  assert.ok(declaration, `${typeName} must remain a named type union`);
  return [...declaration[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

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
