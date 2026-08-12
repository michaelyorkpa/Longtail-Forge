export const regressionMeta = Object.freeze({
  id: "framework.typecheck-seams",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "typecheck"],
  description: "Proves the server and browser typecheck programs, bounded clean-file passes, complete checked-seam inventory, and escape-hatch prohibitions stay intact.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const seamInventory = JSON.parse(readFileSync("scripts/typecheck-seam-inventory.json", "utf8"));
const cleanFilePassInventory = JSON.parse(readFileSync("scripts/typecheck-clean-file-passes.json", "utf8"));
const CHECKED_SEAM_FILES = seamInventory.checkedFiles;
const BROWSER_CHECKED_FILES = [
  "public/js/shared/api-client.js",
  "public/js/shared/app-shell-bootstrap.js",
  "public/js/shared/cached-fetch.js",
  "public/js/shared/error-contract.js",
  "public/js/shared/formatters.js",
  "public/js/shared/page-controller.js",
  "public/js/shared/records.js",
  "public/js/shared/view-response-records.js",
  "public/js/shared/view-surface-descriptor.js",
];
const RESERVED_CLEAN_FILE_PATHS = new Set();
const SLICE_38_ROUTE_EXCLUSIONS = new Set([
  "src/routes/files.routes.js",
  "src/routes/private-feeds.routes.js",
  "src/routes/search-index.routes.js",
  "src/routes/search.routes.js",
  "src/routes/users.routes.js",
  "src/routes/work-resume.routes.js",
]);
const SLICE_38_ROUTE_TIERS = new Set([
  "framework-protected-administration-routes",
  "framework-protected-work-surface-routes",
  "framework-public-operational-routes",
]);
const SLICE_38_ROUTE_FILES = [
  "src/routes/account-export-recovery.routes.js",
  "src/routes/api-keys.routes.js",
  "src/routes/app-info.routes.js",
  "src/routes/app-shell.routes.js",
  "src/routes/audit.routes.js",
  "src/routes/auth.routes.js",
  "src/routes/dashboard.routes.js",
  "src/routes/help.routes.js",
  "src/routes/jobs.routes.js",
  "src/routes/notifications.routes.js",
  "src/routes/operational-health.routes.js",
  "src/routes/permissions.routes.js",
  "src/routes/public-api.routes.js",
  "src/routes/public-demo-account.routes.js",
  "src/routes/reporting.routes.js",
  "src/routes/runtime-diagnostics.routes.js",
  "src/routes/settings.routes.js",
  "src/routes/static.routes.js",
  "src/routes/tags.routes.js",
  "src/routes/workbench.routes.js",
];
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
  "tests/typecheck/browser-database-boundary.fixture.mjs",
];
const EXPECTED_BROWSER_TYPECHECK_INCLUDES = [
  "public/js/shared/api-client.js",
  "public/js/shared/app-shell-bootstrap.js",
  "public/js/shared/cached-fetch.js",
  "public/js/shared/error-contract.js",
  "public/js/shared/formatters.js",
  "public/js/shared/page-controller.js",
  "public/js/shared/records.js",
  "public/js/shared/view-response-records.js",
  "public/js/shared/view-surface-descriptor.js",
  "src/types/browser-contracts.d.ts",
  "src/types/framework-contracts.d.ts",
  "tests/typecheck/browser-database-boundary.fixture.mjs",
];
const EXPECTED_BROWSER_TYPECHECK_EXCLUDES = ["node_modules"];
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
const EXPECTED_BROWSER_COMPILER_OPTION_KEYS = [
  "allowJs",
  "checkJs",
  "forceConsistentCasingInFileNames",
  "lib",
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
  "ApiErrorDetails",
  "ApiErrorEnvelope",
  "AppShellBootstrap",
  "AppShellBootstrapUser",
  "ModuleManifest",
  "NotificationEventContribution",
  "NotificationFollowTargetContribution",
  "NotificationTemplateContribution",
  "ProtectedContentConsumerContribution",
  "ViewSurfaceDescriptor",
  "ViewSurfaceDataSource",
  "ViewActionDescriptor",
  "ViewDetailDescriptor",
  "ViewFieldDescriptor",
  "ViewFilterDescriptor",
  "ViewIndexPanelDescriptor",
  "ViewModalDescriptor",
  "ViewPageHeaderDescriptor",
  "ViewRegionDescriptor",
  "ViewSidebarPanelDescriptor",
  "ViewSummaryPanelDescriptor",
  "ViewTableDescriptor",
  "DashboardContribution",
  "WorkbenchContribution",
  "WorkCandidate",
  "FocusModeDefinition",
  "FocusModeContext",
  "ResumeStatePayload",
  "ResumeStateProducerResult",
  "ResumeStateReadCheck",
  "ResumeStateReadResolverContext",
  "ResumeStateBatchReadResolverContext",
  "ResumeStateReadResolver",
  "ResumeStateBatchReadResolver",
  "SearchRecord",
  "SearchReference",
  "SearchResult",
  "SearchPermissionTarget",
  "PermissionSafeSearchRequest",
  "SearchExecutionResult",
  "BrowserSearchResult",
  "SearchIndexer",
  "InternalEvent",
  "EventSummaryResolverContext",
  "EventSummaryText",
  "EventSummaryRecipientHints",
  "EventSummarySection",
  "EventSummaryDeclaration",
  "NotificationEventPayload",
  "TaggableTypeContribution",
  "SearchableTypeContribution",
  "AttachableTypeContribution",
  "PublicApiListEnvelope",
  "PublicApiErrorEnvelope",
  "JobEnqueueOptions",
  "JobRecord",
  "JobExecutionRecord",
  "JobHandlerContext",
  "JobHandler",
  "JobHandlerOptions",
  "JobWorkerMode",
  "JobWorkerLogger",
  "JobWorkerOptions",
  "JobRunSummary",
  "JobWorkerStatus",
];
const DATABASE_CONTRACT_TYPE_EXPORTS = [
  "BulkValuesBindingOptions",
  "DatabaseAdapter",
  "DatabaseDialect",
  "DatabaseHealth",
  "DatabaseInsertOptions",
  "DatabaseParameterToken",
  "DatabaseRow",
  "DatabaseRowIdOptions",
  "DatabaseSeam",
  "NamedBindingEntry",
  "PreparedDatabaseBindings",
  "TransactionClient",
];
const HELP_STATIC_CONTRACT_TYPE_EXPORTS = [
  "FrameworkProtectedView",
  "HelpArticle",
  "HelpArticleDetailPayload",
  "HelpArticleListPayload",
  "HelpContribution",
  "HelpListResponse",
  "HelpNavigationItem",
  "HelpReadResponse",
  "HelpRequestSession",
  "HelpSearchDocument",
  "HelpSection",
  "HelpSectionPayload",
  "HydratedHelpArticle",
  "HydratedHelpContribution",
  "InitialTheme",
  "ProtectedModuleViewResolution",
  "StaticPathResolution",
  "StaticReadResponse",
  "StaticResolvedPath",
  "StaticThemeSession",
];
const SEARCH_REBUILD_CONTRACT_TYPE_EXPORTS = [
  "ActiveSearchableTypeDeclaration",
  "InactiveSearchRowsInput",
  "SearchBackendRepairSummary",
  "SearchIndexerDocument",
  "SearchIndexerDocumentEnvelope",
  "SearchRebuildCounts",
  "SearchRebuildError",
  "SearchRebuildOptions",
  "SearchRebuildReference",
  "SearchRebuildScope",
  "SearchRebuildSession",
  "SearchRebuildSummary",
  "SearchRebuildSummaryInput",
  "SearchRebuildTargetSummary",
  "SearchRebuildTypeInput",
  "StaleSearchRecordIdsInput",
];
const BROWSER_CONTRACT_TYPE_EXPORTS = [
  "BrowserApi",
  "BrowserApiError",
  "BrowserApiErrorDetails",
  "BrowserAppShellBootstrapAdapter",
  "BrowserCachedFetch",
  "BrowserErrorContract",
  "BrowserErrorEnvelope",
  "BrowserFormatters",
  "BrowserJsonRequestOptions",
  "BrowserPageController",
  "BrowserRecord",
  "BrowserRecords",
  "BrowserViewResponseRecords",
  "BrowserViewSurfaceDescriptor",
  "BrowserViewSurfaceDescriptorAdapter",
  "CachedFetchOptions",
  "CachedFetchResult",
  "LongtailForgeBrowserNamespace",
  "PageControllerDefinition",
  "PageControllerRegistry",
  "PageSmokeResult",
  "RegisteredPageController",
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
const SEARCH_INDEXER_FILES = [
  "src/core/help/search-indexers.js",
  "src/modules/client-projects/search-indexers.js",
  "src/modules/lists/search-indexers.js",
  "src/modules/notes/search-indexers.js",
  "src/modules/tasks/search-indexers.js",
  "src/modules/time-tracking/search-indexers.js",
];
const HTTP_CONTRACT_TYPE_EXPORTS = [
  "SessionMode",
  "AuthenticatedIdentity",
  "SupportViewSession",
  "RequestSession",
  "LogoutSession",
  "SupportViewRequestSession",
  "PrivateFeedAuthorizationSession",
  "PermissionSession",
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
const ROUTE_CONTRACT_TYPE_EXPORTS = [
  "RouteRequest",
  "RouteResponse",
  "RouteNext",
  "AuthenticatedRouteRequest",
  "WorkspaceRouteRequest",
  "ApiKeyRouteRequest",
  "AsyncRouteResult",
  "AsyncRouteHandler",
  "AuthenticatedAsyncRouteHandler",
  "WorkspaceAsyncRouteHandler",
  "ApiKeyAsyncRouteHandler",
  "AsyncRouteAdapter",
];
const PRIVATE_FEED_CONTRACT_TYPE_EXPORTS = [
  "PrivateFeedScopeType",
  "PrivateFeedManagementSession",
  "PrivateFeedScope",
  "PrivateFeedSubscriptionDescriptor",
  "PrivateFeedSubscriptionDescriptorInput",
  "PrivateFeedProviderRenderContext",
  "PrivateFeedProviderRender",
  "PrivateFeedProviderDefinition",
  "PrivateFeedProvider",
  "PrivateFeedTokenRow",
  "PrivateFeedTokenCreateInput",
  "PrivateFeedTokenListFilters",
  "PrivateFeedTokenMutationResult",
  "PrivateFeedTokenRevokeResult",
  "PrivateFeedSubscriptionPayload",
  "ParsedPrivateFeedToken",
  "PrivateFeedEligibility",
  "PrivateFeedReconcileOptions",
  "PrivateFeedReconcileResult",
  "PrivateFeedPublicSubscription",
  "PrivateFeedAuthentication",
  "PrivateFeedCollectionResponse",
  "PrivateFeedCreateResponse",
  "PrivateFeedRemoveResponse",
  "PrivateFeedPermissionResource",
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
assert.match(taskTimersServiceSource, /@param \{unknown\} payload @param \{WorkspaceRequestSession\} session[\s\S]*async function finalize/);
assert.match(taskTimersServiceSource, /@param \{TaskTimerBillableTask\} task @returns \{"yes" \| "no"\}/);
assert.match(taskTimersServiceSource, /function taskTimerBillable\(task\)[\s\S]*normalizeTimeEntryBillable\(task\?\.billable\) \|\| "yes"/);
const timeTrackingContractsSource = readFileSync("src/modules/time-tracking/time-tracking.contracts.js", "utf8");
assert.match(timeTrackingContractsSource, /const ActiveTimerSourcedSaveSchema = ActiveTimerSaveSchema\.extend/);
assert.match(timeTrackingContractsSource, /@template \{import\("zod"\)\.ZodType\} Schema/);
assert.match(timeTrackingContractsSource, /@returns \{import\("zod"\)\.output<Schema>\}/);
assert.doesNotMatch(timeTrackingContractsSource, /@returns \{any\}/);
const activeTimersServiceSource = readFileSync("src/modules/time-tracking/active-timers.service.js", "utf8");
assert.match(activeTimersServiceSource, /parseTimeTrackingEdgePayload\(ActiveTimerSourcedSaveSchema, rawPayload\)/);
assert.match(activeTimersServiceSource, /billable: normalizeTimeEntryBillable\(payload\?\.billable\) \|\| "yes"/);
assert.match(activeTimersServiceSource, /@typedef \{import\("\.\/active-timers\.repo\.js"\)\.ActiveTimer\} ActiveTimer/);
assert.match(activeTimersServiceSource, /function finalizedTimerFacts[\s\S]*durationHours: \(durationSeconds \/ 3600\)\.toFixed\(4\)/);
assert.doesNotMatch(activeTimersServiceSource, /durationHours: payload\?\.duration_hours/);
const timeEntriesServiceSource = readFileSync("src/modules/time-tracking/time-entries.service.js", "utf8");
assert.match(timeEntriesServiceSource, /@param \{unknown\} rawEntry @param \{WorkspaceRequestSession\} session/);
assert.match(timeEntriesServiceSource, /@param \{TimeEntryCreateInput\} entry @param \{WorkspaceRequestSession\} session/);
const activeTimersRepositorySource = readFileSync("src/modules/time-tracking/active-timers.repo.js", "utf8");
assert.match(activeTimersRepositorySource, /@typedef \{Object\} ActiveTimer/);
assert.match(activeTimersRepositorySource, /@param \{ActiveTimer\} timer[\s\S]*async function upsert\(timer\)/);
const billingServiceSource = readFileSync("src/modules/time-tracking/time-tracking-billing.service.js", "utf8");
assert.match(billingServiceSource, /@param \{WorkspaceRequestSession\} session[\s\S]*async function readDashboardBillingSummary/);
assert.match(billingServiceSource, /function normalizeBillingSessionTimezone[\s\S]*normalizeTimezone\(session\?\.timezone\)/);
assert.equal(
  (billingServiceSource.match(/(?:const timezone =|timezone:)\s*normalizeBillingSessionTimezone\(session\)/g) || []).length,
  2,
  "both billing session-timezone consumers must use the canonical validated boundary",
);
assert.doesNotMatch(billingServiceSource, /session\.timezone \|\| DEFAULT_TIMEZONE/);
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

assert.equal(cleanFilePassInventory.schemaVersion, 1, "the clean-file pass inventory schema must stay explicit");
assert.ok(
  Array.isArray(cleanFilePassInventory.passes) && cleanFilePassInventory.passes.length > 0,
  "at least one bounded clean-file pass must remain recorded",
);
const cleanFilePassPaths = [];
for (const pass of cleanFilePassInventory.passes) {
  assert.match(
    pass.slice,
    /^(?:18(?:\.\d+)?|38)$/,
    "bounded clean-file pass IDs must remain under an explicitly owned checking slice",
  );
  assert.ok(
    typeof pass.ownershipTier === "string" && pass.ownershipTier.length > 0,
    `slice ${pass.slice} must name one coherent ownership tier`,
  );
  assert.ok(
    Array.isArray(pass.files) && pass.files.length > 0 && pass.files.length <= 40,
    `slice ${pass.slice} must retain an explicit path list of at most 40 files`,
  );
  assert.deepEqual(
    pass.files,
    [...new Set(pass.files)].sort(),
    `slice ${pass.slice} clean-file paths must stay unique and sorted`,
  );
  if (pass.ownershipTier === "framework-core-leaf-utilities") {
    for (const filePath of pass.files) {
      assert.match(
        filePath,
        /^src\/core\/[^/]+\.js$/,
        `slice ${pass.slice} must not cross the framework core leaf-utility ownership tier`,
      );
    }
  }
  if (pass.slice === "38") {
    assert.ok(
      SLICE_38_ROUTE_TIERS.has(pass.ownershipTier),
      `slice ${pass.slice} must stay within one of its three recorded route tiers`,
    );
    assert.ok(pass.files.length <= 20, "each slice 38 route pass must contain at most 20 files");
    for (const filePath of pass.files) {
      assert.match(filePath, /^src\/routes\/[^/]+\.routes\.js$/, "slice 38 passes must contain only route adapters");
      assert.ok(
        !SLICE_38_ROUTE_EXCLUSIONS.has(filePath),
        `${filePath} must remain with its separately scoped route owner`,
      );
    }
  }
  for (const filePath of pass.files) {
    assert.ok(
      !RESERVED_CLEAN_FILE_PATHS.has(filePath),
      `${filePath} is reserved for a separately scoped roadmap slice`,
    );
    assert.ok(
      CHECKED_SEAM_FILES.includes(filePath),
      `${filePath} must remain in the complete checked-seam inventory`,
    );
    cleanFilePassPaths.push(filePath);
  }
}
assert.equal(
  cleanFilePassPaths.length,
  new Set(cleanFilePassPaths).size,
  "a checked file may belong to only one bounded clean-file pass",
);
assert.deepEqual(
  cleanFilePassInventory.passes
    .filter((pass) => pass.slice === "38")
    .flatMap((pass) => pass.files)
    .sort(),
  SLICE_38_ROUTE_FILES,
  "slice 38 must retain its exact 20-file framework route ownership boundary",
);

const discoveredCheckedFiles = [
  "server.js",
  "worker.js",
  ...walkScriptFiles("public", new Set([".js", ".mjs"])),
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
assert.deepEqual(
  CHECKED_SEAM_FILES.filter((filePath) => filePath.startsWith("public/")),
  BROWSER_CHECKED_FILES,
  "the browser program must retain exactly the first reviewed shared-utility tier",
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
const databaseContractSource = readFileSync("src/types/database-contracts.d.ts", "utf8");
for (const typeName of DATABASE_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    databaseContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `database-contracts.d.ts must export ${typeName}`,
  );
}
const helpStaticContractSource = readFileSync("src/types/help-static-contracts.d.ts", "utf8");
for (const typeName of HELP_STATIC_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    helpStaticContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `help-static-contracts.d.ts must export ${typeName}`,
  );
}
const searchRebuildContractSource = readFileSync("src/types/search-rebuild-contracts.d.ts", "utf8");
for (const typeName of SEARCH_REBUILD_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    searchRebuildContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `search-rebuild-contracts.d.ts must export ${typeName}`,
  );
}
assert.match(
  helpStaticContractSource,
  /export type StaticPathResolution = StaticResolvedPath \| StaticDeniedPath;/,
  "static delivery must retain an explicit resolved-or-denied path contract",
);
assert.match(
  helpStaticContractSource,
  /section: HelpSectionPayload \| null;/,
  "Help article details must retain their nullable section lookup",
);
assert.match(
  databaseContractSource,
  /^import type \{ Buffer as NodeBuffer \} from "node:buffer";/,
  "the Node-only database contract must name its Buffer authority explicitly",
);
assert.match(
  databaseContractSource,
  /export type DatabaseRow = Record<string, unknown>;/,
  "generic database rows must require checked narrowing",
);
assert.doesNotMatch(
  databaseContractSource,
  /Record<string, any>|\bBuffer\b(?! as NodeBuffer)/,
  "database contracts must not regain open any rows or ambient Buffer types",
);
assert.doesNotMatch(
  contractSource,
  /database-contracts|DatabaseAdapter|TransactionClient|DatabaseRow/,
  "browser-consumed framework exports must not reach the Node-only database contract",
);
const browserContractSource = readFileSync("src/types/browser-contracts.d.ts", "utf8");
for (const typeName of BROWSER_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    browserContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `browser-contracts.d.ts must export ${typeName}`,
  );
}
assert.doesNotMatch(
  browserContractSource,
  /database-contracts|DatabaseAdapter|TransactionClient|DatabaseRow/,
  "browser aliases must remain independent of Node-only database contracts",
);
const databaseTypeFixtureSource = readFileSync("tests/typecheck/database-contracts.fixture.mjs", "utf8");
assert.match(databaseTypeFixtureSource, /@ts-expect-error Generic database fields must be narrowed or projected before use\./);
assert.match(databaseTypeFixtureSource, /@ts-expect-error A callback-scoped transaction client cannot open another transaction\./);
const browserDatabaseFixtureSource = readFileSync("tests/typecheck/browser-database-boundary.fixture.mjs", "utf8");
assert.match(browserDatabaseFixtureSource, /@ts-expect-error Browser-consumed framework contracts must not export the Node-only database adapter\./);
const providerSource = readFileSync("src/db/provider.js", "utf8");
for (const contractName of ["DatabaseAdapter", "DatabaseDialect", "DatabaseHealth", "DatabaseParams", "DatabaseRow"]) {
  assert.match(
    providerSource,
    new RegExp(`@typedef \\{import\\("\\.\\.\\/types\\/database-contracts\\.js"\\)\\.${contractName}\\} ${contractName}`),
    `the public database provider must consume ${contractName}`,
  );
}
for (const returnContract of [
  "Promise<DatabaseRow\\[\\]>",
  "Promise<DatabaseRow \\| null>",
  "Promise<DatabaseHealth>",
  "DatabaseHealth \\| null",
  "DatabaseDialect",
]) {
  assert.match(providerSource, new RegExp(`@returns \\{${returnContract}\\}`), `the public database provider must expose ${returnContract}`);
}
const providerExportBlock = providerSource.match(/export \{([\s\S]*?)\n\};/);
assert.ok(providerExportBlock, "the public database provider must retain an explicit runtime export block");
for (const exportName of [
  "closeDatabase",
  "createDatabaseAdapter",
  "databaseAdapter",
  "databaseDialect",
  "formatDatabaseHealth",
  "getDatabaseDialect",
  "getLastDatabaseHealth",
  "getSql",
  "initializeDatabaseRuntime",
  "querySql",
  "readDatabaseHealth",
  "resolveDatabaseDialect",
  "runSql",
  "sqlInteger",
  "sqlNullableInteger",
  "sqlNullableText",
  "sqlText",
]) {
  assert.match(providerExportBlock[1], new RegExp(`\\b${exportName}\\b`), `src/db/provider.js must retain the ${exportName} runtime export`);
}
for (const filePath of BROWSER_CHECKED_FILES) {
  assert.doesNotMatch(
    readFileSync(filePath, "utf8"),
    /database-contracts\.js/,
    `${filePath} must not import the Node-only database contract`,
  );
}
for (const filePath of [
  "src/db/adapters/sqlite-adapter.js",
  "src/db/parameter-bindings.js",
  "src/db/provider.js",
  "src/db/sqlite.js",
]) {
  const source = readFileSync(filePath, "utf8");
  assert.doesNotMatch(source, /Record<string, any>/, `${filePath} must not reopen generic database rows to any`);
}
assert.match(
  browserContractSource,
  /import type \{ ApiErrorEnvelope \} from "\.\/framework-contracts\.js";/,
  "the browser error boundary must reuse the framework-owned envelope instead of restating it",
);
assert.match(
  browserContractSource,
  /export type BrowserErrorEnvelope = ApiErrorEnvelope;/,
  "the browser parser must expose the framework-owned error envelope through one alias",
);
const browserErrorSource = readFileSync("public/js/shared/error-contract.js", "utf8");
const browserApiSource = readFileSync("public/js/shared/api-client.js", "utf8");
const appShellBootstrapSource = readFileSync("public/js/shared/app-shell-bootstrap.js", "utf8");
const appShellServiceSource = readFileSync("src/services/app-shell.service.js", "utf8");
const navigationSource = readFileSync("public/js/navigation.js", "utf8");
assert.match(browserErrorSource, /@typedef \{import\("\.\.\/\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserErrorEnvelope\}/);
assert.doesNotMatch(
  browserApiSource,
  /body\?\.error|body\.error|envelope\?\.message/,
  "api-client must delegate framework error-envelope parsing to error-contract",
);
assert.match(
  browserApiSource,
  /function requireErrorContract[\s\S]*typeof createError !== "function"[\s\S]*requires the shared error contract/,
  "api-client must fail visibly when its canonical error parser is unavailable",
);
assert.doesNotMatch(
  browserApiSource,
  /error\.(?:body|code|requestId|status)\s*=/,
  "api-client must not retain a partial standalone error fallback",
);
assert.match(
  appShellBootstrapSource,
  /@typedef \{import\("\.\.\/\.\.\/\.\.\/src\/types\/framework-contracts\.js"\)\.AppShellBootstrap\}/,
  "the browser bootstrap adapter must consume the framework-owned app-shell envelope",
);
assert.match(
  appShellServiceSource,
  /^\/\/ @ts-check\r?\n[\s\S]*@returns \{Promise<AppShellBootstrap>\}[\s\S]*async function bootstrap/,
  "the app-shell producing service must return the shared checked envelope",
);
assert.doesNotMatch(
  navigationSource,
  /^\/\/ @ts-check\r?\n/,
  "the giant navigation runtime must remain outside whole-file checking",
);
const moduleManifestDeclaration = contractSource.match(/export interface ModuleManifest \{([\s\S]*?)\n\}/);
assert.ok(moduleManifestDeclaration, "framework-contracts.d.ts must declare ModuleManifest");
for (const [fieldName, fieldType] of REQUIRED_MODULE_MANIFEST_FIELDS) {
  assert.match(
    moduleManifestDeclaration[1],
    new RegExp(`^  ${fieldName}: ${fieldType};$`, "m"),
    `ModuleManifest.${fieldName} must remain required before runtime validation`,
  );
}
const searchReferenceDeclaration = contractSource.match(/export interface SearchReference \{([\s\S]*?)\n\}/);
assert.ok(searchReferenceDeclaration, "framework-contracts.d.ts must declare SearchReference");
assert.match(
  searchReferenceDeclaration[1],
  /^  workspaceId: string;$/m,
  "SearchReference must require the live camelCase workspace identifier",
);
for (const fieldName of ["moduleId", "recordType", "recordId"]) {
  assert.match(
    searchReferenceDeclaration[1],
    new RegExp(`^  ${fieldName}\\?: string;$`, "m"),
    `SearchReference.${fieldName} must preserve the optional rebuild-compatible camelCase shape`,
  );
}
assert.doesNotMatch(
  searchReferenceDeclaration[1],
  /\b(?:workspace_id|module_id|record_type|record_id)\b/,
  "first-party indexers must not consume compatibility snake_case reference fields",
);
for (const filePath of SEARCH_INDEXER_FILES) {
  const source = readFileSync(filePath, "utf8");
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain opted in to the checked Search reference seam`);
  assert.match(source, /@param \{SearchReference\}/, `${filePath} must consume the shared SearchReference contract`);
  assert.doesNotMatch(
    source,
    /function index\w+\(\{[^}]*\b(?:workspace_id|module_id|record_type|record_id)\b/,
    `${filePath} must consume the canonical camelCase indexer payload`,
  );
}
const searchRouteSource = readFileSync("src/routes/search.routes.js", "utf8");
const searchServiceSource = readFileSync("src/services/search.service.js", "utf8");
const searchRebuildServiceSource = readFileSync("src/services/search-index-rebuild.service.js", "utf8");
assert.match(searchRouteSource, /^\/\/ @ts-check\r?\n/, "Search route must remain opted in to the checked permission-safe query seam");
for (const contractName of [
  "BrowserSearchResult",
  "PermissionSafeSearchRequest",
  "SearchPermissionTarget",
  "SearchResult",
  "RequestSession",
]) {
  assert.match(
    searchRouteSource,
    new RegExp(`@typedef \\{import\\([^\\n]+\\)\\.${contractName}\\} ${contractName}`),
    `Search route must consume the shared ${contractName} contract`,
  );
}
assert.match(
  searchRouteSource,
  /Number\.isSafeInteger\(cursorOffset\)[\s\S]*cursorOffset <= MAX_VISIBLE_OFFSET/,
  "Search cursor paging must stay safe and bounded",
);
assert.match(
  searchRouteSource,
  /isPlainObject[\s\S]*Express[\s\S]*extended query parser/,
  "Search query-shape guards must document their application-owned extended-parser provenance",
);
assert.match(
  searchRouteSource,
  /canReadSearchResult\(session, rawResult, target\)[\s\S]*skippedVisible < requestedOffset[\s\S]*toBrowserSearchResult/,
  "Search route must prune permissions before visible offset accounting and browser shaping",
);
assert.match(
  searchServiceSource,
  /@typedef \{import\("\.\.\/types\/http-contracts\.js"\)\.RequestSession\} RequestSession/,
  "Search service must consume the shared request-session contract",
);
assert.match(
  searchServiceSource,
  /@returns \{Promise<ActiveSearchableTypeDeclaration\[\]>\}[\s\S]*function listActiveSearchableTypes/,
  "active Search declaration discovery must expose the normalized rebuild input contract",
);
assert.match(
  searchRebuildServiceSource,
  /^\/\/ @ts-check\r?\n/,
  "the Search rebuild service must remain in the checked seam inventory",
);
assert.doesNotMatch(
  searchRebuildServiceSource,
  /@ts-(?:ignore|nocheck)|\bany\b/,
  "the Search rebuild service must not terminate checking through suppressions or any",
);
assert.match(
  searchRebuildServiceSource,
  /@returns \{Promise<SearchRebuildSummary>\}[\s\S]*async function rebuildWorkspace/,
  "workspace rebuilds must return the named job progress and result summary",
);
assert.match(
  searchRebuildServiceSource,
  /@type \{SearchRebuildReference\}[\s\S]*declaration: searchableType,[\s\S]*rebuild: true,[\s\S]*searchService,[\s\S]*workspaceId/,
  "rebuild indexers must receive the canonical checked camelCase Search reference",
);
assert.doesNotMatch(
  searchRebuildServiceSource,
  /const reference = \{[\s\S]{0,240}\b(?:workspace_id|module_id|record_type|record_id)\b/,
  "rebuild indexer references must not regain persistence casing aliases",
);
assert.match(
  searchRebuildServiceSource,
  /catch \(error\)[\s\S]{0,320}message: getErrorMessage\(error\)/,
  "rebuild failures must narrow unknown errors before returning the checked result",
);
assert.match(
  searchServiceSource,
  /@typedef \{RequestSession & \{ workspace_id: string \}\} WorkspaceRequestSession/,
  "Search service must make its active-workspace refinement explicit",
);
assert.doesNotMatch(
  searchServiceSource,
  /session\??:\s*any|searchableType:\s*any/,
  "Search permission-safe composers must not terminate session or declaration checking at any",
);
assert.match(
  searchServiceSource,
  /@returns \{NormalizedSearchRecordReference\}[\s\S]*function normalizeSearchRecordReference/,
  "the Search record-reference producer must expose its explicit normalized contract",
);
const normalizedSearchReferenceDeclaration = searchServiceSource.match(
  /@typedef \{Object\} NormalizedSearchRecordReference([\s\S]*?)\*\//,
);
assert.ok(normalizedSearchReferenceDeclaration, "Search service must declare its normalized record-reference result");
for (const fieldName of ["searchIndexId", "workspaceId", "moduleId", "recordType", "recordId"]) {
  assert.match(
    normalizedSearchReferenceDeclaration[1],
    new RegExp(`@property \\{string\\} ${fieldName}(?:\\r?\\n|$)`),
    `NormalizedSearchRecordReference.${fieldName} must remain a required canonical camelCase field`,
  );
}
const resumeStateReadChecksSource = readFileSync("src/services/work-resume-state-read-checks.js", "utf8");
assert.match(
  resumeStateReadChecksSource,
  /^\/\/ @ts-check\r?\n/,
  "the Resume State read-resolver registry must remain in the checked seam inventory",
);
assert.match(
  resumeStateReadChecksSource,
  /@type \{Map<string, ResumeStateReadResolver>\}/,
  "per-record Resume State resolvers must retain their shared callback contract",
);
assert.match(
  resumeStateReadChecksSource,
  /@type \{Map<string, ResumeStateBatchReadResolver>\}/,
  "batch Resume State resolvers must retain their shared callback contract",
);
const resumeStateInitialProducersSource = readFileSync("src/services/work-resume-state-initial-producers.js", "utf8");
assert.match(
  resumeStateInitialProducersSource,
  /^\/\/ @ts-check\r?\n/,
  "the first-party Resume State producer assembly must remain in the checked seam inventory",
);
assert.match(
  resumeStateInitialProducersSource,
  /@returns \{ResumeStateProducerResult \| null\}/,
  "first-party Resume State builders must retain the shared producer payload contract",
);
assert.match(
  resumeStateInitialProducersSource,
  /@returns \{Promise<Map<string, ResumeStateReadCheck>>\}/,
  "first-party Resume State batch resolvers must retain the shared read-check contract",
);
const jobHandlerSource = readFileSync("src/core/jobs/job-handlers.js", "utf8");
const jobQueueSource = readFileSync("src/core/jobs/job-queue.js", "utf8");
const jobRunnerSource = readFileSync("src/core/jobs/job-runner.js", "utf8");
const eventSummariesSource = readFileSync("src/core/events/event-summaries.js", "utf8");
for (const [filePath, source] of [
  ["src/core/jobs/job-handlers.js", jobHandlerSource],
  ["src/core/jobs/job-queue.js", jobQueueSource],
  ["src/core/jobs/job-runner.js", jobRunnerSource],
  ["src/core/events/event-summaries.js", eventSummariesSource],
]) {
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain in the checked Jobs/event-summary seam`);
}
assert.match(jobHandlerSource, /@type \{Map<string, JobHandler>\}/, "the job registry must retain the shared handler callback contract");
assert.match(jobQueueSource, /@param \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.JobEnqueueOptions\}/, "the job queue must retain the dual-cased enqueue contract");
assert.match(jobRunnerSource, /@typedef \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.JobRecord\} JobRecord/, "the runner must consume the shared persisted job-row contract");
assert.match(jobRunnerSource, /await handler\(\{[\s\S]*?job: \{[\s\S]*?payload,[\s\S]*?\},[\s\S]*?payload,[\s\S]*?\}\)/, "the runner must deliver the established job and payload handler envelope");
assert.match(jobRunnerSource, /Active run failed during shutdown\.[\s\S]*?summarizeJobError\(error\)/, "shutdown failures must use the checked safe error summary");
assert.match(jobRunnerSource, /Poll failed\.[\s\S]*?summarizeJobError\(error\)/, "poll failures must use the checked safe error summary");
assert.doesNotMatch(jobRunnerSource, /@type \{any\}[\s\S]{0,80}(?:error|summarizeJobError)/, "job failure summaries must not regain an any escape");
assert.match(contractSource, /export interface JobWorkerLogger \{\s*warn\?: \(message: string\) => void;\s*\}/, "job worker warnings must accept only safe string summaries");
assert.match(eventSummariesSource, /@typedef \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.InternalEvent\} InternalEvent/, "event summaries must consume the shared internal-event payload contract");
assert.match(eventSummariesSource, /Raw record ids are identifiers, not labels/, "event summary fallbacks must retain the raw-ID redaction boundary");
const jobEnqueueDeclaration = contractSource.match(/export interface JobEnqueueOptions \{([\s\S]*?)\n\}/);
assert.ok(jobEnqueueDeclaration, "framework-contracts.d.ts must declare JobEnqueueOptions");
assert.match(jobEnqueueDeclaration[1], /^  jobId\?: string;$/m, "enqueue must retain its camelCase caller-supplied job ID");
assert.match(jobEnqueueDeclaration[1], /^  job_id\?: string;$/m, "enqueue must retain its snake_case caller-supplied job ID");
assert.match(contractSource, /export type JobHandler = \(context: JobHandlerContext\)/, "registered job handlers must receive the live context envelope rather than a raw database row");
const authServiceSource = readFileSync("src/services/auth.service.js", "utf8");
const apiKeysServiceSource = readFileSync("src/services/api-keys.service.js", "utf8");
const sessionsServiceSource = readFileSync("src/services/sessions.service.js", "utf8");
for (const [filePath, source] of [
  ["src/services/auth.service.js", authServiceSource],
  ["src/services/api-keys.service.js", apiKeysServiceSource],
  ["src/services/sessions.service.js", sessionsServiceSource],
]) {
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain in the checked authentication seam`);
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)/, `${filePath} must not suppress authentication type failures`);
}
assert.match(sessionsServiceSource, /@typedef \{SessionRevocationInput & \{ preservedSessionId: string \}\} RevokeAllForUserExceptInput/);
assert.match(sessionsServiceSource, /if \(!preservedSessionId\)[\s\S]*The current session changed\. Sign in and try again\./);
assert.doesNotMatch(sessionsServiceSource, /return revokeAllForUser\(\{ actorSession, currentSessionId, reason, targetUser, workspaceId \}\)/);
assert.match(authServiceSource, /preservedSessionId: currentSessionId/);
assert.doesNotMatch(authServiceSource, /@type \{unknown\}[\s\S]*revokeAllForUserExcept/);
assert.match(authServiceSource, /@typedef \{import\("\.\.\/types\/http-contracts\.js"\)\.RequestSession\} RequestSession/, "authentication services must consume the shared request-session identity contract");
assert.match(authServiceSource, /const authenticatedUser = \/\*\* @type \{UserRecord\} \*\//, "successful credential verification must narrow the nullable user before session issuance");
assert.match(authServiceSource, /@param \{RequestSession \| null\} session[\s\S]*?async function readSession/, "session reads must retain the recovery-aware nullable request-session contract");
assert.match(apiKeysServiceSource, /@typedef \{import\("\.\.\/types\/http-contracts\.js"\)\.ActiveApiKey\} ActiveApiKey/, "API-key authentication must consume the shared active-key identity contract");
assert.match(apiKeysServiceSource, /@returns \{Promise<ActiveApiKey \| null>\}[\s\S]*?async function readActiveKey/, "API-key lookup must retain the nullable active-key boundary");
assert.match(apiKeysServiceSource, /RequestSession & \{ workspace_id: string \}/, "API-key management must require a workspace-bound request session");
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
  /@typedef \{import\("\.\.\/\.\.\/types\/database-contracts\.js"\)\.TransactionClient\} TransactionClient/,
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
const routeContractSource = readFileSync("src/types/route-contracts.d.ts", "utf8");
for (const typeName of ROUTE_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    routeContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `route-contracts.d.ts must export ${typeName}`,
  );
}
assert.match(
  httpContractSource,
  /export type PermissionSession = RequestSession \| PrivateFeedAuthorizationSession;/,
  "permission evaluation must admit the narrow private-feed authorization identity without widening browser request sessions",
);
const privateFeedContractSource = readFileSync("src/types/private-feed-contracts.d.ts", "utf8");
for (const typeName of PRIVATE_FEED_CONTRACT_TYPE_EXPORTS) {
  assert.match(
    privateFeedContractSource,
    new RegExp(`export (interface|type) ${typeName}\\b`),
    `private-feed-contracts.d.ts must export ${typeName}`,
  );
}
const privateFeedServiceSource = readFileSync("src/services/private-feeds.service.js", "utf8");
const privateFeedRouteSource = readFileSync("src/routes/private-feeds.routes.js", "utf8");
for (const [filePath, source] of [
  ["src/services/private-feeds.service.js", privateFeedServiceSource],
  ["src/routes/private-feeds.routes.js", privateFeedRouteSource],
]) {
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain opted in to the checked public-feed edge`);
  assert.doesNotMatch(source, /@typedef[^\n]*\bany\b/, `${filePath} must not terminate private-feed contracts through any`);
}
assert.ok(
  !RESERVED_CLEAN_FILE_PATHS.has("src/routes/private-feeds.routes.js"),
  "slice 37 must keep the private-feed route claimed from the reserved-path list",
);
assert.match(
  privateFeedServiceSource,
  /@returns \{PrivateFeedAuthorizationSession\}[\s\S]*?function sessionFromToken/,
  "private-feed permission checks must use the explicit sessionless authorization identity",
);
assert.match(
  privateFeedServiceSource,
  /createPrivateFeedSubscriptionDescriptor\(\{[\s\S]*?ownerUserId:[\s\S]*?subscriptionId:[\s\S]*?workspaceId:/,
  "provider dispatch must receive the secret-free subscription descriptor",
);
assert.match(
  privateFeedRouteSource,
  /function requirePrivateFeedManagementSession\(request\)[\s\S]*?session\?\.workspace_id/,
  "management routes must refine the authenticated active-workspace session before service dispatch",
);
assert.match(
  privateFeedRouteSource,
  /response\.status\(404\)\.send\("Calendar feed not found\."\)/,
  "public token failures must retain one generic response",
);
const supportViewServiceSource = readFileSync("src/services/support-view.service.js", "utf8");
const supportViewGateSource = readFileSync("src/middleware/support-view-request-gate.js", "utf8");
assert.match(
  httpContractSource,
  /export type RequestSession = NormalRequestSession \| SupportViewRequestSession;/,
  "request sessions must be a real normal-or-Support-View union",
);
assert.match(
  httpContractSource,
  /export interface NormalRequestSession[\s\S]*?support_view\?: undefined;/,
  "normal sessions must discriminate Support View identity by an absent support_view field",
);
assert.match(
  httpContractSource,
  /export interface SupportViewRequestSession[\s\S]*?support_view: SupportViewSession;/,
  "Support View sessions must require their actor/effective projection",
);
assert.match(
  supportViewServiceSource,
  /^\/\/ @ts-check\r?\n/,
  "the Support View service must remain in the checked seam inventory",
);
assert.doesNotMatch(
  supportViewServiceSource,
  /@ts-(?:ignore|nocheck)|\bany\b/,
  "the Support View service must not terminate checking through suppressions or any",
);
assert.doesNotMatch(
  supportViewGateSource,
  /@type \{SupportViewRequestSession\}/,
  "the central gate must narrow the request-session union without an assertion cast",
);
assert.match(
  supportViewGateSource,
  /const session = request\.session;[\s\S]*if \(!session\?\.support_view\)/,
  "the central gate must narrow Support View identity through its discriminant",
);
const permissionResourceDeclaration = httpContractSource.match(/export interface PermissionResource \{([\s\S]*?)\n\}/);
assert.ok(permissionResourceDeclaration, "http-contracts.d.ts must declare PermissionResource");
assert.match(
  permissionResourceDeclaration[1],
  /^  workspace_id: string;$/m,
  "PermissionResource must require a non-null workspace scope",
);
const permissionResourceSource = readFileSync("src/core/permission-resource.js", "utf8");
const permissionsServiceSource = readFileSync("src/services/permissions.service.js", "utf8");
for (const [filePath, source] of [
  ["src/core/permission-resource.js", permissionResourceSource],
  ["src/services/permissions.service.js", permissionsServiceSource],
]) {
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain in the checked permission-resource seam`);
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)/, `${filePath} must not suppress permission-resource type failures`);
}
assert.doesNotMatch(permissionsServiceSource, /@param \{\*\} (?:assignment|overrides)/, "permission assignment decisions must not accept wildcard inputs");
assert.match(permissionResourceSource, /@returns \{PermissionResource\}/, "permission-resource constructors must return the shared contract");
assert.match(permissionsServiceSource, /@param \{PermissionResource\} resource[\s\S]*?async function can/, "permission checks must consume a workspace-scoped resource");
const usersServiceSource = readFileSync("src/services/users.service.js", "utf8");
const usersServiceContractSource = readFileSync("src/types/users-service-contracts.d.ts", "utf8");
assert.match(
  usersServiceSource,
  /^\/\/ @ts-check\r?\n/,
  "the Users service must remain in the checked seam inventory",
);
assert.doesNotMatch(
  usersServiceSource,
  /@ts-(?:ignore|nocheck)|\bany\b/,
  "the Users service must not terminate checking through suppressions or any",
);
assert.match(
  usersServiceSource,
  /@param \{UserPayload\} payload @param \{UsersRequestSession\} session/,
  "Users mutations must consume the named payload and authenticated-workspace session contracts",
);
assert.match(
  usersServiceSource,
  /if \(!user\) \{\s*throw new AppError\("User was not found\."[\s\S]{0,420}targetUser: user/,
  "last-membership revocation must narrow the nullable identity row before use",
);
assert.match(
  usersServiceSource,
  /@param \{WorkspaceOwnershipInput\} input @returns \{Promise<OwnerTransferCandidate \| null>\}/,
  "owner transfer must retain an explicit nullable candidate projection",
);
assert.match(
  usersServiceContractSource,
  /export interface UserWorkspaceMembershipRow[\s\S]*?user_workspace_id: string;[\s\S]*?workspace_id: string;/,
  "workspace membership reads must retain their named lifecycle projection",
);
assert.match(
  usersServiceContractSource,
  /export interface WorkspaceValue[\s\S]*?ownerUserId: string \| null;[\s\S]*?workspaceId: string;/,
  "workspace responses must retain their named owner and identity projection",
);
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
assert.match(
  httpUtilitySource,
  /@returns \{Promise<Record<string, unknown>>\}[\s\S]{0,180}async function readJsonObjectBody\(request, options = \{\}\)[\s\S]{0,120}readJsonBody\(request, options\)/,
  "object-bound routes must narrow the shared unknown JSON boundary through readJsonObjectBody",
);
for (const [wrapperName, requestGuard] of [
  ["authenticatedAsyncRoute", "isAuthenticatedRouteRequest"],
  ["workspaceAsyncRoute", "isWorkspaceRouteRequest"],
  ["apiKeyAsyncRoute", "isApiKeyRouteRequest"],
]) {
  assert.match(
    httpUtilitySource,
    new RegExp(`function ${wrapperName}\\(handler\\)[\\s\\S]{0,240}if \\(!${requestGuard}\\(request\\)\\)`),
    `${wrapperName} must keep its defensive runtime request refinement`,
  );
}
for (const filePath of SLICE_38_ROUTE_FILES) {
  const source = readFileSync(filePath, "utf8");
  assert.match(source, /^\/\/ @ts-check\r?\n/, `${filePath} must remain opted in to the checked route tier`);
  assert.doesNotMatch(source, /@typedef[^\n]*\bany\b/, `${filePath} must not terminate route contracts through any`);
}
assert.match(
  readFileSync("src/routes/public-api.routes.js", "utf8"),
  /apiKeyAsyncRoute as asyncRoute/,
  "public API routes must refine their API-key session before dispatch",
);
for (const filePath of [
  "src/routes/account-export-recovery.routes.js",
  "src/routes/static.routes.js",
]) {
  assert.match(
    readFileSync(filePath, "utf8"),
    /authenticatedAsyncRoute as asyncRoute/,
    `${filePath} must admit authenticated recovery sessions without inventing a workspace`,
  );
}
for (const filePath of SLICE_38_ROUTE_FILES.filter((filePath) => ![
  "src/routes/account-export-recovery.routes.js",
  "src/routes/app-info.routes.js",
  "src/routes/auth.routes.js",
  "src/routes/operational-health.routes.js",
  "src/routes/public-api.routes.js",
  "src/routes/public-demo-account.routes.js",
  "src/routes/static.routes.js",
].includes(filePath))) {
  assert.match(
    readFileSync(filePath, "utf8"),
    /workspaceAsyncRoute as asyncRoute/,
    `${filePath} must refine its workspace session before service dispatch`,
  );
}
const errorHandlerSource = readFileSync("src/middleware/error-handler.js", "utf8");
assert.match(errorHandlerSource, /^\/\/ @ts-check\r?\n/, "the final error middleware must remain checked");
assert.match(errorHandlerSource, /@param \{unknown\} error/, "the final error boundary must receive unknown thrown values");
for (const boundaryToken of [
  "response.headersSent",
  "getRequestContext(request)",
  "isApiRequest(request)",
  "isBrowserDocumentRequest(request)",
  "readErrorProperty(error",
  "sendApiError(request, response, {",
  "sendBrowserError(request, response, {",
]) {
  assert.ok(errorHandlerSource.includes(boundaryToken), `the final error middleware must retain ${boundaryToken}`);
}
for (const filePath of ["src/middleware/require-api-key.js", "src/middleware/require-auth.js"]) {
  const source = readFileSync(filePath, "utf8");
  assert.match(source, /RouteResponse/, `${filePath} must use the shared response contract`);
  assert.match(source, /RouteNext/, `${filePath} must use the shared next contract`);
}
const checkedJsonBodyConsumers = CHECKED_SEAM_FILES.filter((filePath) => (
  filePath !== "src/utils/http.js" && readFileSync(filePath, "utf8").includes("readJsonBody")
));
assert.deepEqual(
  checkedJsonBodyConsumers,
  [
    "src/routes/api-keys.routes.js",
    "src/routes/auth.routes.js",
    "src/routes/private-feeds.routes.js",
    "src/routes/public-api.routes.js",
    "src/routes/settings.routes.js",
    "src/routes/support-view.routes.js",
    "src/routes/workbench.routes.js",
  ],
  "every checked readJsonBody consumer must be inventoried for explicit unknown narrowing",
);
const checkedJsonObjectBodyConsumers = CHECKED_SEAM_FILES.filter((filePath) => (
  filePath !== "src/utils/http.js" && readFileSync(filePath, "utf8").includes("readJsonObjectBody")
));
assert.deepEqual(
  checkedJsonObjectBodyConsumers,
  [
    "src/routes/notifications.routes.js",
    "src/routes/permissions.routes.js",
    "src/routes/tags.routes.js",
  ],
  "every checked object-body consumer must remain explicitly inventoried",
);
assert.match(
  privateFeedServiceSource,
  /@param \{unknown\} payloadValue[\s\S]*?readSubscriptionPayload\(payloadValue\)/,
  "private-feed lifecycle payloads must stay unknown until the service performs explicit object-shape narrowing",
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

const browserTsconfig = JSON.parse(readFileSync("tsconfig.public.json", "utf8"));
assert.deepEqual(
  Object.keys(browserTsconfig.compilerOptions).sort(),
  EXPECTED_BROWSER_COMPILER_OPTION_KEYS,
  "browser compiler options must keep every reviewed checking dial explicit",
);
assert.equal(browserTsconfig.compilerOptions.target, "es2023");
assert.equal(browserTsconfig.compilerOptions.module, "esnext");
assert.equal(browserTsconfig.compilerOptions.moduleResolution, "bundler");
assert.equal(browserTsconfig.compilerOptions.noEmit, true);
assert.equal(browserTsconfig.compilerOptions.allowJs, true);
assert.equal(browserTsconfig.compilerOptions.checkJs, false, "browser checkJs stays per-file opt-in");
assert.equal(browserTsconfig.compilerOptions.strict, true);
assert.equal(browserTsconfig.compilerOptions.noImplicitAny, false);
assert.equal(browserTsconfig.compilerOptions.skipLibCheck, true);
assert.equal(browserTsconfig.compilerOptions.resolveJsonModule, true);
assert.deepEqual(browserTsconfig.compilerOptions.lib, ["DOM", "DOM.Iterable", "ES2023"]);
assert.deepEqual(browserTsconfig.compilerOptions.types, [], "browser checking must not inherit Node globals");
assert.equal(browserTsconfig.compilerOptions.forceConsistentCasingInFileNames, true);
assert.deepEqual(browserTsconfig.include, EXPECTED_BROWSER_TYPECHECK_INCLUDES);
assert.deepEqual(browserTsconfig.exclude, EXPECTED_BROWSER_TYPECHECK_EXCLUDES);
const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageManifest.scripts.typecheck,
  "tsc --noEmit && tsc --noEmit -p tsconfig.public.json",
  "the fast typecheck command must run both the server and browser programs",
);

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
  `Typecheck seams guardrail passed: server and ${BROWSER_CHECKED_FILES.length}-file browser programs, ${cleanFilePassInventory.passes.length} bounded clean-file passes recorded, ${CHECKED_SEAM_FILES.length} files inventoried at floor ${seamInventory.minimumOptedInFiles}, ${checkedTestFiles.length} tests explicitly opted in, ${CONTRACT_TYPE_EXPORTS.length + DATABASE_CONTRACT_TYPE_EXPORTS.length + HELP_STATIC_CONTRACT_TYPE_EXPORTS.length + SEARCH_REBUILD_CONTRACT_TYPE_EXPORTS.length + HTTP_CONTRACT_TYPE_EXPORTS.length + ROUTE_CONTRACT_TYPE_EXPORTS.length + PRIVATE_FEED_CONTRACT_TYPE_EXPORTS.length + BROWSER_CONTRACT_TYPE_EXPORTS.length} contract types exported, no checker escapes.`,
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
