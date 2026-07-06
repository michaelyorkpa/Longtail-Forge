import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.33";
const caseInsensitiveSliceVersion = "0.33.5.27.4";
const booleanTimeSliceVersion = "0.33.5.27.5";
const searchFtsSliceVersion = "0.33.5.27.6";
const introspectionSliceVersion = "0.33.5.27.7";
const tasksPrimarySliceVersion = "0.33.5.27.8";
const taskChecklistSliceVersion = "0.33.5.27.9";
const taskRelationshipsSliceVersion = "0.33.5.27.10";
const taskRecurrenceRemindersSliceVersion = "0.33.5.27.11";
const activeTimersSliceVersion = "0.33.5.27.12";
const timeEntriesSliceVersion = "0.33.5.27.13";
const notesRecordsFiltersSliceVersion = "0.33.5.27.14";
const notesWritesSliceVersion = "0.33.5.27.15";
const listsRecordsItemsSliceVersion = "0.33.5.27.16";
const listsCatalogLinksSliceVersion = "0.33.5.27.17";
const filesBrowseReadsSliceVersion = "0.33.5.27.18";
const filesContextTargetsSliceVersion = "0.33.5.27.19";
const filesLifecycleSettingsQuotaSliceVersion = "0.33.5.27.20";
const notificationsInboxLifecycleSliceVersion = "0.33.5.27.21";
const notificationsPreferencesSubscriptionsSliceVersion = "0.33.5.27.22";
const tagsRepositorySliceVersion = "0.33.5.27.23";
const tagPropagationServiceSliceVersion = "0.33.5.27.24";
const searchAdapterRebuildServiceSliceVersion = "0.33.5.27.25";
const workResumeStateSliceVersion = "0.33.5.27.26";
const clientProjectsRepositoriesSliceVersion = "0.33.5.27.27";
const frameworkAdminLowCountSliceVersion = "0.33.5.27.28";
const startupMaintenanceSliceVersion = "0.33.5.27.29";
const migrationCompatibilitySliceVersion = "0.33.5.27.30";
const interpolationEnforcementGuardrailSliceVersion = "0.33.5.27.31";
const dialectEnforcementGuardrailSliceVersion = "0.33.5.27.32";
const databaseAgnosticContractCloseoutSliceVersion = appVersion;
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const audit = buildParameterBindingAudit();
const returningMatches = listSourceMatches(/\bRETURNING\b/g);
const sqliteJsonMatches = listSourceMatches(/\bjson_(?:extract|set|each|object|array|remove|insert|replace|valid|type|quote|group)\b|->>|->/g);
const updateDeleteLimitMatches = listSourceMatches(/\b(?:UPDATE|DELETE)\b(?:(?!;|\bSELECT\b)[\s\S]){0,240}\b(?:LIMIT|OFFSET)\b/gi);

assert.equal(packageJson.version, appVersion, "package.json should report the parameter-binding audit version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the parameter-binding audit version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the parameter-binding audit version");

assert.deepEqual(audit.totals, {
  boundOperationSites: 385,
  dbOperationSites: 429,
  helperCalls: 0,
  interpolatedOperationSites: 0,
}, "parameter-binding audit totals should match the current post-wave runtime inventory");

const expectedTopGroups = [];

for (const [group, helperCalls, interpolatedOperationSites] of expectedTopGroups) {
  const row = audit.groups.find((candidate) => candidate.group === group);
  assert.ok(row, `${group} should be present in the parameter-binding audit`);
  assert.equal(row.helperCalls, helperCalls, `${group} helper-call count should match the audit`);
  assert.equal(row.interpolatedOperationSites, interpolatedOperationSites, `${group} interpolated operation-site count should match the audit`);
  assertInventoryRow(group, "Remaining", row);
}

assert.equal(audit.groups.every((row) => row.helperCalls === 0), true, "all runtime source groups should have zero literal-helper calls after migration compatibility conversion");
assert.equal(audit.groups.every((row) => row.interpolatedOperationSites === 0), true, "all runtime source groups should have zero direct interpolated operation sites after migration compatibility conversion");

const dbMigrationsRow = audit.groups.find((candidate) => candidate.group === "db/migrations");
assert.equal(dbMigrationsRow.helperCalls, 0, "migration compatibility should remove literal helpers after conversion");
assert.equal(dbMigrationsRow.interpolatedOperationSites, 0, "migration compatibility should remove direct interpolated operation sites after conversion");
assert.equal(dbMigrationsRow.boundOperationSites, 10, "migration compatibility should bind migration metadata values");
assert.equal(dbMigrationsRow.dbOperationSites, 28, "migration compatibility operation count should include bound metadata reads/writes plus no-value schema scripts");
assertInventoryRow("db/migrations", "Migration compatibility", dbMigrationsRow);

const dbIndexRow = audit.groups.find((candidate) => candidate.group === "db/index");
assert.equal(dbIndexRow.helperCalls, 0, "startup maintenance should remove literal helpers after the compatibility-path conversion");
assert.equal(dbIndexRow.interpolatedOperationSites, 0, "startup maintenance should remove direct interpolated operation sites after conversion");
assert.equal(dbIndexRow.boundOperationSites, 31, "startup maintenance should keep converted value-bearing startup operations visible");
assert.equal(dbIndexRow.dbOperationSites, 40, "startup maintenance operation count should include bound startup repairs plus no-value compatibility statements");
assertInventoryRow("db/index", "Startup compatibility", dbIndexRow);

const sessionsRow = audit.groups.find((candidate) => candidate.group === "sessions.repo");
assert.equal(sessionsRow.helperCalls, 0, "sessions repository should remain a converted bound-params pilot");
assert.equal(sessionsRow.boundOperationSites, 8, "sessions repository should keep bound operation sites visible");
assertInventoryRow("sessions.repo", "Already bound", sessionsRow);
assert.match(auditDocs, /`sessions\.repo` is not part of this converted wave; it was already a bound-params pilot/, "audit should record sessions as an already-bound pilot, not a converted wave row");

const tagTextRow = audit.groups.find((candidate) => candidate.group === "core/search/tag-text");
assert.equal(tagTextRow.helperCalls, 0, "search tag-text proof conversion should remove literal helpers from the current audit");
assert.equal(tagTextRow.interpolatedOperationSites, 0, "search tag-text proof conversion should remove interpolated operation sites");
assert.equal(tagTextRow.boundOperationSites, 1, "search tag-text proof conversion should add one bound operation site");
assertInventoryRow("core/search/tag-text", "Converted", tagTextRow);

const sqliteSearchAdapterRow = audit.groups.find((candidate) => candidate.group === "core/search/adapters/sqlite-search-adapter");
assert.equal(sqliteSearchAdapterRow.helperCalls, 0, "SQLite search adapter should remove literal helpers after the Search/FTS seam extraction");
assert.equal(sqliteSearchAdapterRow.interpolatedOperationSites, 0, "SQLite search adapter should remove direct interpolated operation sites after the Search/FTS seam extraction");
assert.equal(sqliteSearchAdapterRow.boundOperationSites, 13, "SQLite search adapter should route touched search reads, FTS sync, and repair statements through bound params");
assert.equal(sqliteSearchAdapterRow.dbOperationSites, 17, "SQLite search adapter operation count should include the bound search seam statements");
assertInventoryRow("core/search/adapters/sqlite-search-adapter", "Converted", sqliteSearchAdapterRow);

const searchIndexRebuildServiceRow = audit.groups.find((candidate) => candidate.group === "services/search-index-rebuild.service");
assert.equal(searchIndexRebuildServiceRow.helperCalls, 0, "search rebuild service should remove literal helpers after the Search adapter/rebuild service conversion");
assert.equal(searchIndexRebuildServiceRow.interpolatedOperationSites, 0, "search rebuild service should remove direct interpolated operation sites after conversion");
assert.equal(searchIndexRebuildServiceRow.boundOperationSites, 2, "search rebuild service should keep two bound search_index read sites");
assert.equal(searchIndexRebuildServiceRow.dbOperationSites, 2, "search rebuild service operation count should stay unchanged");
assertInventoryRow("services/search-index-rebuild.service", "Converted", searchIndexRebuildServiceRow);

const workResumeStateServiceRow = audit.groups.find((candidate) => candidate.group === "services/work-resume-state.service");
assert.equal(workResumeStateServiceRow.helperCalls, 0, "work resume state service should remove literal helpers after conversion");
assert.equal(workResumeStateServiceRow.interpolatedOperationSites, 0, "work resume state service should remove direct interpolated operation sites after conversion");
assert.equal(workResumeStateServiceRow.boundOperationSites, 7, "work resume state service should keep seven bound operation sites");
assert.equal(workResumeStateServiceRow.dbOperationSites, 7, "work resume state service operation count should stay unchanged");
assertInventoryRow("services/work-resume-state.service", "Converted", workResumeStateServiceRow);

const workResumeStateInitialProducersRow = audit.groups.find((candidate) => candidate.group === "services/work-resume-state-initial-producers");
assert.equal(workResumeStateInitialProducersRow.helperCalls, 0, "work resume initial producers should remove literal helpers after conversion");
assert.equal(workResumeStateInitialProducersRow.interpolatedOperationSites, 0, "work resume initial producers should remove direct interpolated operation sites after conversion");
assert.equal(workResumeStateInitialProducersRow.boundOperationSites, 2, "work resume initial producers should keep two bound read sites");
assert.equal(workResumeStateInitialProducersRow.dbOperationSites, 2, "work resume initial producers operation count should stay unchanged");
assertInventoryRow("services/work-resume-state-initial-producers", "Converted", workResumeStateInitialProducersRow);

const clientsRepoRow = audit.groups.find((candidate) => candidate.group === "client-projects/clients.repo");
assert.equal(clientsRepoRow.helperCalls, 0, "Clients repository should remove literal helpers after conversion");
assert.equal(clientsRepoRow.interpolatedOperationSites, 0, "Clients repository should remove direct interpolated operation sites after conversion");
assert.equal(clientsRepoRow.boundOperationSites, 9, "Clients repository should keep nine bound operation sites after transaction splitting");
assert.equal(clientsRepoRow.dbOperationSites, 9, "Clients repository operation count should reflect transaction-scoped archive and replaceAll statements");
assertInventoryRow("client-projects/clients.repo", "Converted", clientsRepoRow);

const projectsRepoRow = audit.groups.find((candidate) => candidate.group === "client-projects/projects.repo");
assert.equal(projectsRepoRow.helperCalls, 0, "Projects repository should remove literal helpers after conversion");
assert.equal(projectsRepoRow.interpolatedOperationSites, 0, "Projects repository should remove direct interpolated operation sites after conversion");
assert.equal(projectsRepoRow.boundOperationSites, 8, "Projects repository should keep eight bound operation sites");
assert.equal(projectsRepoRow.dbOperationSites, 8, "Projects repository operation count should stay unchanged");
assertInventoryRow("client-projects/projects.repo", "Converted", projectsRepoRow);

const modulesServiceRow = audit.groups.find((candidate) => candidate.group === "core/modules/modules.service");
assert.equal(modulesServiceRow.helperCalls, 0, "modules service should remove literal helpers after framework/admin conversion");
assert.equal(modulesServiceRow.interpolatedOperationSites, 0, "modules service should remove direct interpolated operation sites after conversion");
assert.equal(modulesServiceRow.boundOperationSites, 6, "modules service should keep six bound operation sites plus one no-param registry read");
assert.equal(modulesServiceRow.dbOperationSites, 7, "modules service operation count should reflect transaction-split registry writes");
assertInventoryRow("core/modules/modules.service", "Converted", modulesServiceRow);

const auditLogsRepoRow = audit.groups.find((candidate) => candidate.group === "audit-logs.repo");
assert.equal(auditLogsRepoRow.helperCalls, 0, "audit logs repository should remove literal helpers after framework/admin conversion");
assert.equal(auditLogsRepoRow.interpolatedOperationSites, 0, "audit logs repository should remove direct interpolated operation sites after conversion");
assert.equal(auditLogsRepoRow.boundOperationSites, 10, "audit logs repository should keep ten bound operation sites");
assert.equal(auditLogsRepoRow.dbOperationSites, 10, "audit logs repository operation count should stay unchanged");
assertInventoryRow("audit-logs.repo", "Converted", auditLogsRepoRow);

const apiKeysRepoRow = audit.groups.find((candidate) => candidate.group === "api-keys.repo");
assert.equal(apiKeysRepoRow.helperCalls, 0, "API keys repository should remove literal helpers after framework/admin conversion");
assert.equal(apiKeysRepoRow.interpolatedOperationSites, 0, "API keys repository should remove direct interpolated operation sites after conversion");
assert.equal(apiKeysRepoRow.boundOperationSites, 9, "API keys repository should keep nine bound operation sites after transaction splitting");
assert.equal(apiKeysRepoRow.dbOperationSites, 9, "API keys repository operation count should reflect key and scope creation statements");
assertInventoryRow("api-keys.repo", "Converted", apiKeysRepoRow);

const helpServiceRow = audit.groups.find((candidate) => candidate.group === "services/help.service");
assert.equal(helpServiceRow.helperCalls, 0, "Help service should remove literal helpers after framework/admin conversion");
assert.equal(helpServiceRow.interpolatedOperationSites, 0, "Help service should remove direct interpolated operation sites after conversion");
assert.equal(helpServiceRow.boundOperationSites, 1, "Help service should keep one bound workspace existence read");
assert.equal(helpServiceRow.dbOperationSites, 1, "Help service operation count should stay unchanged");
assertInventoryRow("services/help.service", "Converted", helpServiceRow);

const convertedWaveRows = [
  ["app-settings.repo", 2],
  ["api-keys.repo", 9],
  ["audit-logs.repo", 10],
  ["client-projects/clients.repo", 9],
  ["client-projects/projects.repo", 8],
  ["core/modules/modules.service", 6],
  ["services/files.service", 32],
  ["services/help.service", 1],
  ["services/search-index-rebuild.service", 2],
  ["services/tag-propagation-registry", 15],
  ["services/tags.service", 3],
  ["services/work-resume-state-initial-producers", 2],
  ["services/work-resume-state.service", 7],
  ["lists/lists.repo", 21],
  ["permissions.repo", 8],
  ["settings.repo", 4],
  ["notes/notes.repo", 21],
  ["notifications.repo", 25],
  ["tags.repo", 17],
  ["tasks/task-checklists.repo", 8],
  ["tasks/task-recurrence.repo", 6],
  ["tasks/task-relationships.repo", 12],
  ["tasks/task-reminders.repo", 4],
  ["tasks/tasks.repo", 15],
  ["time-tracking/active-timers.repo", 12],
  ["time-tracking/time-entries.repo", 8],
  ["user-workspaces.repo", 6],
  ["users.repo", 17],
  ["workspaces.repo", 10],
];

for (const [group, boundOperationSites] of convertedWaveRows) {
  const row = audit.groups.find((candidate) => candidate.group === group);
  assert.ok(row, `${group} should remain visible as a converted wave row`);
  assert.equal(row.helperCalls, 0, `${group} should have no remaining literal-helper calls`);
  assert.equal(row.interpolatedOperationSites, 0, `${group} should have no remaining interpolated operation sites`);
  assert.equal(row.boundOperationSites, boundOperationSites, `${group} bound operation-site count should match the converted wave audit`);
  assertInventoryRow(group, "Converted", row);
}

assert.deepEqual(
  returningMatches.map((match) => `${match.file}:${match.line}`),
  [
    "src/db/adapters/sqlite-dialect-seams.js:284",
  ],
  "RETURNING inventory should stay provider-owned after durable jobs move to the returning seam",
);
assert.equal(sqliteJsonMatches.length, 0, "runtime SQL should not use SQLite JSON SQL functions in this audit");
assert.equal(updateDeleteLimitMatches.length, 0, "runtime SQL should not use top-level UPDATE/DELETE LIMIT/OFFSET in this audit");

assert.match(auditDocs, /Runtime source scan/, "audit docs should describe the scan scope");
assert.match(auditDocs, /Current totals as of 0\.33\.5\.27\.33:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 385[\s\S]*Total runtime database operation calls seen by the audit scanner: 429/, "audit docs should record the current canonical totals");
assert.match(auditDocs, /## Dialect Adoption Guardrail[\s\S]*Current totals as of 0\.33\.5\.27\.33:[\s\S]*Remaining raw seam-backed dialect sites at application call sites: 0[\s\S]*Whole runtime source sweep/, "audit docs should record the distinct dialect-adoption axis");
assert.match(auditDocs, /Total runtime literal-helper invocations: 1,680/, "audit docs should record helper-call totals");
assert.match(auditDocs, /Total direct interpolated SQL operation sites: 262/, "audit docs should record operation-site totals");
assert.match(auditDocs, /Existing direct bound-params operation sites: 49/, "audit docs should record existing bound sites");
assert.match(auditDocs, /The inventory below is the canonical per-owner view/, "audit docs should make the inventory the canonical per-owner view");
assert.match(auditDocs, /Do not add separate per-wave owner tables with different counts/, "audit docs should forbid divergent per-wave owner tables");
assert.match(auditDocs, /0\.33\.5\.26\.3 Inventory Canonicalization[\s\S]*single source of truth/, "audit docs should record the single-source inventory cleanup");
assert.match(auditDocs, /Future Conversion Wave Ratchet Checklist[\s\S]*docs\/database-parameter-binding-audit\.md[\s\S]*scripts\/parameter-binding-audit-regression\.mjs[\s\S]*audit\.totals[\s\S]*expectedTopGroups[\s\S]*CHANGELOG\.md/, "audit docs should name the future-wave ratchet artifacts");
assert.match(auditDocs, /Do not weaken the exact-equality ratchet when it fails/, "audit docs should keep the exact ratchet strict");
assert.match(auditDocs, /Standing query rule from `DECISIONS\.md`:[\s\S]*new or touched single-statement repository queries must use named params[\s\S]*db\.query\(sql, params\)[\s\S]*deprecated compatibility escape hatches/, "audit docs should carry the standing named-params rule for future waves");
assert.match(auditDocs, /0\.33\.5\.27 Conversion Wave Assignments[\s\S]*0\.33\.5\.27\.8 - Tasks primary repository[\s\S]*`tasks\/tasks\.repo`[\s\S]*0\.33\.5\.27\.9 - Task checklist repository[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*0\.33\.5\.27\.10 - Task relationships repository[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*0\.33\.5\.27\.11 - Task recurrence and reminders[\s\S]*`tasks\/task-recurrence\.repo`, `tasks\/task-reminders\.repo`[\s\S]*0\.33\.5\.27\.12 - Active timers[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*0\.33\.5\.27\.13 - Time entries[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*0\.33\.5\.27\.16 - Lists records and items[\s\S]*`lists\/lists\.repo` partial[\s\S]*0\.33\.5\.27\.17 - Lists catalog and linked records[\s\S]*`lists\/lists\.repo` remaining catalog\/link paths[\s\S]*0\.33\.5\.27\.29 - Startup maintenance compatibility path[\s\S]*`db\/index`[\s\S]*0\.33\.5\.27\.30 - Migration compatibility path[\s\S]*`db\/migrations`[\s\S]*0\.33\.5\.27\.31 - Interpolation enforcement guardrail/, "audit docs should assign every remaining owner and guardrail to the 0.33.5.27 conversion wave");
assert.match(auditDocs, /0\.33\.5\.27\.32 - Dialect enforcement guardrail \| Whole runtime dialect sweep and converted-owner re-audit/, "audit docs should assign the dialect enforcement guardrail wave");
assert.match(auditDocs, /0\.33\.5\.27\.33 - Docs, decisions, 0\.40\.0 reconciliation, and closeout \| Branch closeout, docs, and roadmap archive handoff/, "audit docs should assign the closeout wave");
assert.match(auditDocs, /No runtime owner currently has counted literal-helper calls or direct helper-interpolated SQL operation sites[\s\S]*Startup and migration still have sanctioned compatibility ownership[\s\S]*`src\/db\/index\.js`[\s\S]*`src\/db\/migrations\.js`/, "audit docs should record the zero-interpolation startup/migration compatibility boundary");
assert.match(auditDocs, /0\.33\.5\.26\.4 Ratchet Checklist[\s\S]*Future Conversion Wave Ratchet Checklist/, "audit docs should record the checklist slice");
assert.match(auditDocs, /0\.33\.5\.27\.1 Portability Contract and Dialect Seams[\s\S]*single agnostic data-access contract[\s\S]*No runtime SQL behavior changed/, "audit docs should record the plan-only portability contract slice");
assert.match(auditDocs, /0\.33\.5\.27\.2 Dialect Seam Scaffold[\s\S]*SQLite-backed `db\.dialect` seam scaffold[\s\S]*No application repository conversion happened/, "audit docs should record the dialect seam scaffold slice");
assert.match(auditDocs, /0\.33\.5\.27\.3 Upsert\/Conflict and Identity Seams[\s\S]*durable-job `RETURNING` statements are converted to the provider returning seam[\s\S]*94 existing bound operation sites[\s\S]*410 total runtime database operation calls/, "audit docs should record the conflict and identity seam slice");
assert.match(auditDocs, /0\.33\.5\.27\.4 Case-Insensitive Comparison and Ordering Seams[\s\S]*`services\/files\.service` attachable-target option read[\s\S]*1,490 runtime literal-helper invocations[\s\S]*232 direct interpolated SQL operation sites[\s\S]*95 existing bound operation sites/, "audit docs should record the case-insensitive seam proof slice");
assert.match(auditDocs, /0\.33\.5\.27\.5 Boolean and Timestamp\/Interval Seams[\s\S]*`settings\.repo`[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*1,481 runtime literal-helper invocations[\s\S]*230 direct interpolated SQL operation sites[\s\S]*97 existing bound operation sites/, "audit docs should record the boolean/time seam proof slice");
assert.match(auditDocs, /0\.33\.5\.27\.6 Search\/FTS Seam Extraction[\s\S]*`core\/search\/adapters\/sqlite-search-adapter`[\s\S]*1,441 runtime literal-helper invocations[\s\S]*228 direct interpolated SQL operation sites[\s\S]*109 existing bound operation sites/, "audit docs should record the search FTS seam proof slice");
assert.match(auditDocs, /0\.33\.5\.27\.7 PRAGMA, Rowid, and Introspection Boundary[\s\S]*`db\.dialect\.introspection\.compileOptions\(\.\.\.\)`[\s\S]*`users\.repo`[\s\S]*`workspaces\.repo`[\s\S]*1,441 runtime literal-helper invocations[\s\S]*228 direct interpolated SQL operation sites/, "audit docs should record the introspection boundary proof slice");
assert.match(auditDocs, /0\.33\.5\.27\.8 Tasks Primary Repository Conversion[\s\S]*`tasks\/tasks\.repo`[\s\S]*1,370 runtime literal-helper invocations[\s\S]*221 direct interpolated SQL operation sites[\s\S]*116 existing bound operation sites/, "audit docs should record the Tasks repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.9 Task Checklist Repository Conversion[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*1,331 runtime literal-helper invocations[\s\S]*215 direct interpolated SQL operation sites[\s\S]*123 existing bound operation sites/, "audit docs should record the Task checklist repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.10 Task Relationships Repository Conversion[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*1,285 runtime literal-helper invocations[\s\S]*204 direct interpolated SQL operation sites[\s\S]*134 existing bound operation sites/, "audit docs should record the Task relationships repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.11 Task Recurrence and Reminders Repository Conversion[\s\S]*`tasks\/task-recurrence\.repo`[\s\S]*`tasks\/task-reminders\.repo`[\s\S]*1,218 runtime literal-helper invocations[\s\S]*197 direct interpolated SQL operation sites[\s\S]*144 existing bound operation sites/, "audit docs should record the Task recurrence and reminders repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.12 Active Timers Repository Conversion[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*1,165 runtime literal-helper invocations[\s\S]*187 direct interpolated SQL operation sites[\s\S]*154 existing bound operation sites/, "audit docs should record the Active timers repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.13 Time Entries Repository Conversion[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*1,116 runtime literal-helper invocations[\s\S]*180 direct interpolated SQL operation sites[\s\S]*162 existing bound operation sites/, "audit docs should record the Time entries repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.14 Notes Records and Filters Repository Conversion[\s\S]*`notes\/notes\.repo`[\s\S]*1,112 runtime literal-helper invocations[\s\S]*180 direct interpolated SQL operation sites[\s\S]*163 existing bound operation sites/, "audit docs should record the Notes records/filter repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.15 Notes Writes, Revisions, Links, and Collections Repository Conversion[\s\S]*`notes\/notes\.repo`[\s\S]*904 runtime literal-helper invocations[\s\S]*166 direct interpolated SQL operation sites[\s\S]*180 existing bound operation sites/, "audit docs should record the Notes write repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.16 Lists Records and Items Repository Conversion[\s\S]*record and item read\/write paths[\s\S]*`lists\/lists\.repo`[\s\S]*remaining catalog and linked-record paths[\s\S]*798 runtime literal-helper invocations[\s\S]*159 direct interpolated SQL operation sites[\s\S]*191 existing bound operation sites/, "audit docs should record the Lists records/items repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.17 Lists Catalog and Linked Records Repository Conversion[\s\S]*`lists\/lists\.repo` is fully converted[\s\S]*726 runtime literal-helper invocations[\s\S]*149 direct interpolated SQL operation sites[\s\S]*201 existing bound operation sites/, "audit docs should record the Lists catalog/link repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.18 Files Browse and Attachment Reads Conversion[\s\S]*browse\/read metadata paths[\s\S]*709 runtime literal-helper invocations[\s\S]*145 direct interpolated SQL operation sites[\s\S]*206 existing bound operation sites/, "audit docs should record the Files browse/read conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.19 Files Context and Attachable Targets Conversion[\s\S]*File Context attachment update path[\s\S]*687 runtime literal-helper invocations[\s\S]*137 direct interpolated SQL operation sites[\s\S]*214 existing bound operation sites/, "audit docs should record the Files context/targets conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.20 Files Lifecycle, Settings, Quota, and Accounting Conversion[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 runtime literal-helper invocations[\s\S]*123 direct interpolated SQL operation sites[\s\S]*231 existing bound operation sites/, "audit docs should record the Files lifecycle/settings/quota conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.21 Notifications Inbox and Lifecycle Conversion[\s\S]*`notifications\.repo` inbox and lifecycle paths are partially converted[\s\S]*536 runtime literal-helper invocations[\s\S]*111 direct interpolated SQL operation sites[\s\S]*246 existing bound operation sites/, "audit docs should record the Notifications inbox/lifecycle conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.22 Notifications Preferences and Subscriptions Conversion[\s\S]*`notifications\.repo` is fully converted[\s\S]*487 runtime literal-helper invocations[\s\S]*103 direct interpolated SQL operation sites[\s\S]*256 existing bound operation sites/, "audit docs should record the Notifications preferences/subscriptions conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.23 Tags Repository Conversion[\s\S]*`tags\.repo` is fully converted[\s\S]*403 runtime literal-helper invocations[\s\S]*86 direct interpolated SQL operation sites[\s\S]*273 existing bound operation sites/, "audit docs should record the Tags repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.24 Tag Propagation and Tags Service Conversion[\s\S]*`services\/tag-propagation-registry` and `services\/tags\.service` are fully converted[\s\S]*367 runtime literal-helper invocations[\s\S]*68 direct interpolated SQL operation sites[\s\S]*291 existing bound operation sites/, "audit docs should record the Tag propagation service conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.25 Search Adapter and Rebuild Service Conversion[\s\S]*`services\/search-index-rebuild\.service` is converted[\s\S]*362 runtime literal-helper invocations[\s\S]*66 direct interpolated SQL operation sites[\s\S]*293 existing bound operation sites/, "audit docs should record the Search adapter/rebuild service conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.26 Work Resume State Conversion[\s\S]*`services\/work-resume-state\.service` and `services\/work-resume-state-initial-producers` are fully converted[\s\S]*304 runtime literal-helper invocations[\s\S]*57 direct interpolated SQL operation sites[\s\S]*302 existing bound operation sites/, "audit docs should record the Work resume state conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.27 Clients and Projects Repository Conversion[\s\S]*`client-projects\/clients\.repo` and `client-projects\/projects\.repo` are fully converted[\s\S]*195 runtime literal-helper invocations[\s\S]*45 direct interpolated SQL operation sites[\s\S]*319 existing bound operation sites/, "audit docs should record the Clients/Projects repositories conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.28 Framework and Admin Low-Count Repository Conversion[\s\S]*`core\/modules\/modules\.service`, `audit-logs\.repo`, `api-keys\.repo`, and `services\/help\.service` are fully converted[\s\S]*117 runtime literal-helper invocations[\s\S]*27 direct interpolated SQL operation sites[\s\S]*345 existing bound operation sites/, "audit docs should record the framework/admin low-count repository conversion slice");
assert.match(auditDocs, /0\.33\.5\.27\.29 Startup Maintenance Compatibility Path[\s\S]*`src\/db\/index\.js` no longer has literal-helper calls or direct interpolated operation sites[\s\S]*18 runtime literal-helper invocations[\s\S]*8 direct interpolated SQL operation sites[\s\S]*375 existing bound operation sites/, "audit docs should record the startup maintenance compatibility slice");
assert.match(auditDocs, /0\.33\.5\.27\.30 Migration Compatibility Path[\s\S]*`src\/db\/migrations\.js` no longer has literal-helper calls or direct interpolated operation sites[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct interpolated SQL operation sites[\s\S]*385 existing bound operation sites/, "audit docs should record the migration compatibility slice");
assert.match(auditDocs, /0\.33\.5\.27\.31 Interpolation Enforcement Guardrail[\s\S]*merge-blocking guardrail[\s\S]*`sqlText\(\)`, `sqlInteger\(\)`, `sqlNullableText\(\)`, or `sqlNullableInteger\(\)`[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct interpolated operation sites/, "audit docs should record the interpolation enforcement guardrail slice");
assert.match(auditDocs, /0\.33\.5\.27\.32 Dialect Enforcement Guardrail[\s\S]*whole-tree dialect sweep[\s\S]*raw seam-backed SQLite dialect[\s\S]*permissions\.repo[\s\S]*app-settings\.repo[\s\S]*Remaining raw seam-backed dialect sites at application call sites/, "audit docs should record the dialect enforcement guardrail slice");
assert.match(auditDocs, /0\.33\.5\.27\.33 Docs, Decisions, 0\.40\.0 Reconciliation, and Closeout[\s\S]*finished contract[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct helper-interpolated SQL operation sites[\s\S]*0 raw seam-backed dialect sites[\s\S]*0\.40\.0 database-extraction section now starts from this completed branch/, "audit docs should record the database extraction contract closeout");
assert.doesNotMatch(auditDocs, /Converted wave rows in the current runtime audit/, "audit docs should not keep a divergent converted-wave sub-table");
assert.doesNotMatch(auditDocs, /\| users\.repo \| 78 \| 13 \| 0 \| 16 \|/, "audit docs should not keep the stale pre-conversion users row in the canonical inventory");
assert.doesNotMatch(auditDocs, /\| workspaces\.repo \| 30 \| 1 \| 6 \| 7 \|/, "audit docs should not keep the stale pre-conversion workspaces row in the canonical inventory");
assert.match(auditDocs, /Remaining runtime literal-helper invocations after the proof conversion: 1,677/, "audit docs should record current helper-call burndown");
assert.match(auditDocs, /Remaining direct interpolated SQL operation sites after the proof conversion: 261/, "audit docs should record current interpolated-site burndown");
assert.match(auditDocs, /Existing direct bound-params operation sites after the proof conversion: 50/, "audit docs should record current bound-site burndown");
assert.match(auditDocs, /Remaining runtime literal-helper invocations after the conversion wave: 1,499/, "audit docs should record current helper-call wave burndown");
assert.match(auditDocs, /Remaining direct interpolated SQL operation sites after the conversion wave: 233/, "audit docs should record current interpolated-site wave burndown");
assert.match(auditDocs, /Existing direct bound-params operation sites after the conversion wave: 91/, "audit docs should record current bound-site wave burndown");
assert.match(auditDocs, /No SQLite JSON SQL functions were found/, "audit docs should record the JSON-function non-issue");
assert.match(auditDocs, /No top-level `UPDATE` or `DELETE` statements with `LIMIT` or `OFFSET` were found/, "audit docs should record the UPDATE/DELETE LIMIT non-issue");
assert.match(auditDocs, /Raw `RETURNING` is now provider-owned in `src\/db\/adapters\/sqlite-dialect-seams\.js`/, "audit docs should record the provider-owned RETURNING outcome");
assert.match(auditDocs, /0\.33\.5\.23\.2[\s\S]*named-to-positional binding layer/, "audit docs should hand off binding-layer work");
assert.match(auditDocs, /0\.33\.5\.23\.3 Conversion Wave[\s\S]*auth\/workspace\/permission core/, "audit docs should record the first conversion wave");
assert.match(auditDocs, /0\.33\.5\.23\.4 Closeout[\s\S]*final 0\.33\.5\.23 branch burndown remains 1,499/, "audit docs should record the closeout burndown");
assert.match(auditDocs, /0\.33\.5\.25\.2 Quota-Bound Query Update[\s\S]*1,499 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 92 existing bound operation sites, and 408 total runtime database operation calls/, "audit docs should record the current quota-query audit ratchet");
assert.match(auditDocs, /0\.33\.5\.26\.2 Bulk VALUES Binding[\s\S]*1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls/, "audit docs should record the current bulk VALUES audit ratchet");
assert.match(databaseDocs, /As of version 0\.33\.5\.23\.4[\s\S]*SQL parameter-binding branch is closed/, "database docs should record the closeout boundary");
assert.match(databaseDocs, /As of version 0\.33\.5\.25\.2[\s\S]*92 existing bound operation sites, and 408 runtime DB operation calls/, "database docs should record the current quota-query audit ratchet");
assert.match(databaseDocs, /As of version 0\.33\.5\.26\.2[\s\S]*`createBulkValuesBindings\(\)`/, "database docs should record the current bulk VALUES helper contract");
assert.match(databaseDocs, /As of version 0\.33\.5\.26\.4[\s\S]*Future Conversion Wave Ratchet Checklist[\s\S]*expectedTopGroups[\s\S]*CHANGELOG\.md/, "database docs should point future conversion waves to the ratchet checklist");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.1[\s\S]*agnostic by contract and enforcement, not agnostic-proven[\s\S]*0\.40\.0 database-extraction branch/, "database docs should record the agnostic-by-contract boundary and the 0.40.0 proof handoff");
assert.match(databaseDocs, /active agnostic data-access contract[\s\S]*`src\/core\/database\.js`[\s\S]*`db\.query\(sql, params\)`[\s\S]*`sqlText\(\)`[\s\S]*raw SQLite-only dialect/, "database docs should publish the active agnostic data-access contract");
assert.match(databaseDocs, /No runtime owner currently has counted literal-helper calls or direct helper-interpolated SQL operation sites[\s\S]*startup and migration compatibility paths[\s\S]*schema repair scripts[\s\S]*migration SQL-file execution/, "database docs should publish the zero-interpolation compatibility boundary");
assert.match(databaseDocs, /Dialect-sensitive operation seams:[\s\S]*Upsert\/conflict writes[\s\S]*Case-insensitive compare\/order[\s\S]*Boolean storage[\s\S]*Timestamp and interval math[\s\S]*Full-text search[\s\S]*JSON access[\s\S]*`RETURNING` and identity reads[\s\S]*`rowid` \/ physical identity[\s\S]*PRAGMA\/introspection/, "database docs should record every planned dialect seam");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.2[\s\S]*`db\.dialect`[\s\S]*conflict writes[\s\S]*case-insensitive comparison[\s\S]*SQLite `julianday\(\.\.\.\)`[\s\S]*FTS5 `MATCH`\/`bm25\(\)`[\s\S]*PRAGMA\/introspection/, "database docs should record the concrete dialect seam scaffold");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.3[\s\S]*upsert\/conflict statement builders[\s\S]*[Dd]urable job[\s\S]*returning seam/, "database docs should record the concrete conflict and identity seam");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.4[\s\S]*`db\.dialect\.comparison`[\s\S]*`db\.dialect\.comparison\.containsNoCase\(\.\.\.\)`[\s\S]*LIKE pattern[\s\S]*1,490 remaining helper invocations/, "database docs should record the concrete case-insensitive comparison seam");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.5[\s\S]*`db\.dialect\.boolean\.bindFields\(\.\.\.\)`[\s\S]*`db\.dialect\.time\.elapsedSecondsSince\(\.\.\.\)`[\s\S]*1,481 remaining helper invocations/, "database docs should record the concrete boolean and timestamp seam");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.6[\s\S]*`db\.dialect\.search\.createVirtualTable\(\.\.\.\)`[\s\S]*`db\.dialect\.search\.match\(\.\.\.\)`[\s\S]*1,441 remaining helper invocations/, "database docs should record the concrete search FTS seam");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.7[\s\S]*`db\.dialect\.introspection\.compileOptions\(\.\.\.\)`[\s\S]*qualified `rowId\(\.\.\.\)`[\s\S]*provider\/startup\/migration\/repair\/adapter-owned/, "database docs should record the concrete introspection and physical identity boundary");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.8[\s\S]*`tasks\/tasks\.repo`[\s\S]*named params[\s\S]*1,370 remaining helper invocations/, "database docs should record the concrete Tasks repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.9[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*named params[\s\S]*1,331 remaining helper invocations/, "database docs should record the concrete Task checklist repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.10[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*named params[\s\S]*1,285 remaining helper invocations/, "database docs should record the concrete Task relationships repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.11[\s\S]*`tasks\/task-recurrence\.repo`[\s\S]*`tasks\/task-reminders\.repo`[\s\S]*named params[\s\S]*1,218 remaining helper invocations/, "database docs should record the concrete Task recurrence and reminders repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.12[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*named params[\s\S]*conflict seam[\s\S]*1,165 remaining helper invocations/, "database docs should record the concrete Active timers repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.13[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*named params[\s\S]*1,116 remaining helper invocations/, "database docs should record the concrete Time entries repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.14[\s\S]*`notes\/notes\.repo`[\s\S]*record list\/read\/filter paths[\s\S]*1,112 remaining helper invocations/, "database docs should record the concrete Notes records/filter repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.15[\s\S]*`notes\/notes\.repo`[\s\S]*fully converted[\s\S]*904 remaining helper invocations/, "database docs should record the concrete Notes write repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.16[\s\S]*`lists\/lists\.repo`[\s\S]*record and item paths[\s\S]*72 helper invocations remain[\s\S]*798 remaining helper invocations/, "database docs should record the concrete Lists records/items repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.17[\s\S]*`lists\/lists\.repo` is fully converted[\s\S]*726 remaining helper invocations/, "database docs should record the concrete Lists catalog/link repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.18[\s\S]*Files browse and attachment read metadata paths[\s\S]*709 remaining helper invocations/, "database docs should record the concrete Files browse/read conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.19[\s\S]*Files context and attachable-target metadata paths[\s\S]*687 remaining helper invocations/, "database docs should record the concrete Files context/targets conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.20[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 remaining helper invocations/, "database docs should record the concrete Files lifecycle/settings/quota conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.21[\s\S]*Notifications inbox and lifecycle paths in `notifications\.repo` are partially converted[\s\S]*536 remaining helper invocations/, "database docs should record the concrete Notifications inbox/lifecycle conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.22[\s\S]*Notification preferences, display preferences, workspace defaults, follow subscriptions, and subscription write paths in `notifications\.repo` are converted[\s\S]*487 remaining helper invocations/, "database docs should record the concrete Notifications preferences/subscriptions conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.23[\s\S]*`tags\.repo` is converted[\s\S]*403 remaining helper invocations/, "database docs should record the concrete Tags repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.24[\s\S]*`services\/tag-propagation-registry` and `services\/tags\.service` are converted[\s\S]*367 remaining helper invocations/, "database docs should record the concrete Tag propagation service conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.25[\s\S]*`services\/search-index-rebuild\.service` is converted[\s\S]*362 remaining helper invocations/, "database docs should record the concrete Search adapter/rebuild service conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.26[\s\S]*`services\/work-resume-state\.service` and `services\/work-resume-state-initial-producers` are converted[\s\S]*304 remaining helper invocations/, "database docs should record the concrete Work resume state conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.27[\s\S]*`client-projects\/clients\.repo` and `client-projects\/projects\.repo` are converted[\s\S]*195 remaining helper invocations/, "database docs should record the concrete Clients/Projects repositories conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.28[\s\S]*`core\/modules\/modules\.service`, `audit-logs\.repo`, `api-keys\.repo`, and `services\/help\.service` are converted[\s\S]*117 remaining helper invocations/, "database docs should record the concrete framework/admin low-count repository conversion");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.29[\s\S]*`src\/db\/index\.js` startup maintenance has no remaining literal-helper calls or direct interpolated operation sites[\s\S]*18 remaining helper invocations/, "database docs should record the concrete startup maintenance compatibility path");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.30[\s\S]*`src\/db\/migrations\.js` has no remaining literal-helper calls or direct interpolated operation sites[\s\S]*0 remaining helper invocations[\s\S]*385 existing bound operation sites/, "database docs should record the concrete migration compatibility path");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.31[\s\S]*interpolation enforcement guardrail[\s\S]*New runtime source must not call `sqlText\(\)`, `sqlInteger\(\)`, `sqlNullableText\(\)`, or `sqlNullableInteger\(\)`[\s\S]*0 remaining helper invocations[\s\S]*0 direct interpolated SQL operation sites/, "database docs should record the interpolation enforcement guardrail");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.32[\s\S]*whole-tree dialect enforcement guardrail[\s\S]*raw seam-backed SQLite dialect[\s\S]*[Pp]rovider-owned or sanctioned compatibility paths/, "database docs should record the dialect enforcement guardrail");
assert.match(databaseDocs, /As of version 0\.33\.5\.27\.33[\s\S]*database extraction contract branch is complete[\s\S]*zero literal-helper invocations[\s\S]*zero raw seam-backed dialect sites[\s\S]*0\.40\.0 implements and proves PostgreSQL behind these seams/, "database docs should record the closeout boundary");
assert.match(changelog, /## Version 0\.33\.5\.23\.4 - [\s\S]*final branch burndown: 1,499 helper invocations, 233 direct interpolated operation sites, 91 bound operation sites, and 407 runtime DB operation calls/, "changelog should record the parameter-binding closeout");
assert.match(changelog, /## Version 0\.33\.5\.26\.2 - [\s\S]*1,498 helper invocations, 233 direct interpolated operation sites, 93 bound operation sites, and 409 runtime DB operation calls/, "changelog should record the bulk VALUES burndown");
assert.match(changelog, /## Version 0\.33\.5\.27\.3 - [\s\S]*upsert\/conflict and identity seams[\s\S]*durable job[\s\S]*1,498 helper invocations/, "changelog should record the conflict and identity seam slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(caseInsensitiveSliceVersion)} - [\\s\\S]*case-insensitive comparison and ordering seams[\\s\\S]*Files attachable-target option[\\s\\S]*1,490 helper invocations`), "changelog should record the case-insensitive seam proof slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(booleanTimeSliceVersion)} - [\\s\\S]*Boolean and timestamp\\/interval seams[\\s\\S]*1,481 helper invocations[\\s\\S]*230 direct interpolated operation sites[\\s\\S]*97 bound operation sites`), "changelog should record the boolean/time seam proof slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(searchFtsSliceVersion)} - [\\s\\S]*Search\\/FTS seam extraction[\\s\\S]*1,441 helper invocations[\\s\\S]*228 direct interpolated operation sites[\\s\\S]*109 bound operation sites`), "changelog should record the search FTS seam proof slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(introspectionSliceVersion)} - [\\s\\S]*PRAGMA, rowid, and introspection seam boundaries[\\s\\S]*1,441 helper invocations[\\s\\S]*228 direct interpolated operation sites[\\s\\S]*109 bound operation sites`), "changelog should record the introspection boundary proof slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(tasksPrimarySliceVersion)} - [\\s\\S]*Tasks primary repository conversion[\\s\\S]*1,370 helper invocations[\\s\\S]*221 direct interpolated operation sites[\\s\\S]*116 bound operation sites`), "changelog should record the Tasks repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(taskChecklistSliceVersion)} - [\\s\\S]*Task checklist repository conversion[\\s\\S]*1,331 helper invocations[\\s\\S]*215 direct interpolated operation sites[\\s\\S]*123 bound operation sites`), "changelog should record the Task checklist repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(taskRelationshipsSliceVersion)} - [\\s\\S]*Task relationships repository conversion[\\s\\S]*1,285 helper invocations[\\s\\S]*204 direct interpolated operation sites[\\s\\S]*134 bound operation sites`), "changelog should record the Task relationships repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(taskRecurrenceRemindersSliceVersion)} - [\\s\\S]*Task recurrence and reminders repository conversion[\\s\\S]*1,218 helper invocations[\\s\\S]*197 direct interpolated operation sites[\\s\\S]*144 bound operation sites`), "changelog should record the Task recurrence and reminders repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(activeTimersSliceVersion)} - [\\s\\S]*Active timers repository conversion[\\s\\S]*1,165 helper invocations[\\s\\S]*187 direct interpolated operation sites[\\s\\S]*154 bound operation sites`), "changelog should record the Active timers repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(timeEntriesSliceVersion)} - [\\s\\S]*Time entries repository conversion[\\s\\S]*1,116 helper invocations[\\s\\S]*180 direct interpolated operation sites[\\s\\S]*162 bound operation sites`), "changelog should record the Time entries repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(notesRecordsFiltersSliceVersion)} - [\\s\\S]*Notes records and filters repository conversion[\\s\\S]*1,112 helper invocations[\\s\\S]*180 direct interpolated operation sites[\\s\\S]*163 bound operation sites`), "changelog should record the Notes records/filter repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(notesWritesSliceVersion)} - [\\s\\S]*Notes writes, revisions, links, and collections repository conversion[\\s\\S]*904 helper invocations[\\s\\S]*166 direct interpolated operation sites[\\s\\S]*180 bound operation sites`), "changelog should record the Notes write repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(listsRecordsItemsSliceVersion)} - [\\s\\S]*Lists records and items repository conversion[\\s\\S]*798 helper invocations[\\s\\S]*159 direct interpolated operation sites[\\s\\S]*191 bound operation sites`), "changelog should record the Lists records/items repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(listsCatalogLinksSliceVersion)} - [\\s\\S]*Lists catalog and linked records repository conversion[\\s\\S]*726 helper invocations[\\s\\S]*149 direct interpolated operation sites[\\s\\S]*201 bound operation sites`), "changelog should record the Lists catalog/link repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(filesBrowseReadsSliceVersion)} - [\\s\\S]*Files browse and attachment reads conversion[\\s\\S]*709 helper invocations[\\s\\S]*145 direct interpolated operation sites[\\s\\S]*206 bound operation sites`), "changelog should record the Files browse/read conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(filesContextTargetsSliceVersion)} - [\\s\\S]*Files context and attachable targets conversion[\\s\\S]*687 helper invocations[\\s\\S]*137 direct interpolated operation sites[\\s\\S]*214 bound operation sites`), "changelog should record the Files context/targets conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(filesLifecycleSettingsQuotaSliceVersion)} - [\\s\\S]*Files lifecycle, settings, quota, and accounting conversion[\\s\\S]*586 helper invocations[\\s\\S]*123 direct interpolated operation sites[\\s\\S]*231 bound operation sites`), "changelog should record the Files lifecycle/settings/quota conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(notificationsInboxLifecycleSliceVersion)} - [\\s\\S]*Notifications inbox and lifecycle conversion[\\s\\S]*536 helper invocations[\\s\\S]*111 direct interpolated operation sites[\\s\\S]*246 bound operation sites`), "changelog should record the Notifications inbox/lifecycle conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(notificationsPreferencesSubscriptionsSliceVersion)} - [\\s\\S]*Notification preferences and subscriptions conversion[\\s\\S]*487 helper invocations[\\s\\S]*103 direct interpolated operation sites[\\s\\S]*256 bound operation sites`), "changelog should record the Notifications preferences/subscriptions conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(tagsRepositorySliceVersion)} - [\\s\\S]*Tags repository conversion[\\s\\S]*403 helper invocations[\\s\\S]*86 direct interpolated operation sites[\\s\\S]*273 bound operation sites`), "changelog should record the Tags repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(tagPropagationServiceSliceVersion)} - [\\s\\S]*Tag propagation and tags service conversion[\\s\\S]*367 helper invocations[\\s\\S]*68 direct interpolated operation sites[\\s\\S]*291 bound operation sites`), "changelog should record the Tag propagation service conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(searchAdapterRebuildServiceSliceVersion)} - [\\s\\S]*Search adapter and rebuild service conversion[\\s\\S]*362 helper invocations[\\s\\S]*66 direct interpolated operation sites[\\s\\S]*293 bound operation sites`), "changelog should record the Search adapter/rebuild service conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(workResumeStateSliceVersion)} - [\\s\\S]*Work resume state conversion[\\s\\S]*304 helper invocations[\\s\\S]*57 direct interpolated operation sites[\\s\\S]*302 bound operation sites`), "changelog should record the Work resume state conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(clientProjectsRepositoriesSliceVersion)} - [\\s\\S]*Clients and Projects repositories conversion[\\s\\S]*195 helper invocations[\\s\\S]*45 direct interpolated operation sites[\\s\\S]*319 bound operation sites`), "changelog should record the Clients/Projects repositories conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(frameworkAdminLowCountSliceVersion)} - [\\s\\S]*Framework and admin low-count repositories conversion[\\s\\S]*117 helper invocations[\\s\\S]*27 direct interpolated operation sites[\\s\\S]*345 bound operation sites`), "changelog should record the framework/admin low-count repository conversion slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(startupMaintenanceSliceVersion)} - [\\s\\S]*Startup maintenance compatibility path[\\s\\S]*18 helper invocations[\\s\\S]*8 direct interpolated operation sites[\\s\\S]*375 bound operation sites`), "changelog should record the startup maintenance compatibility slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(migrationCompatibilitySliceVersion)} - [\\s\\S]*Migration compatibility path[\\s\\S]*0 helper invocations[\\s\\S]*0 direct interpolated operation sites[\\s\\S]*385 bound operation sites`), "changelog should record the migration compatibility slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(interpolationEnforcementGuardrailSliceVersion)} - [\\s\\S]*Interpolation enforcement guardrail[\\s\\S]*0 helper invocations[\\s\\S]*0 direct interpolated operation sites[\\s\\S]*385 bound operation sites`), "changelog should record the interpolation enforcement guardrail slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(dialectEnforcementGuardrailSliceVersion)} - [\\s\\S]*Dialect enforcement guardrail[\\s\\S]*Remaining raw seam-backed dialect sites at application call sites: 0`), "changelog should record the dialect enforcement guardrail slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(databaseAgnosticContractCloseoutSliceVersion)} - [^\\n]+[\\s\\S]*database extraction contract branch[\\s\\S]*0 runtime literal-helper invocations[\\s\\S]*0 direct helper-interpolated SQL operation sites[\\s\\S]*0 raw seam-backed dialect sites`), "changelog should record the database extraction contract closeout slice");

assert.match(roadmap, /^## Version 0\.33\.5\.28 - Parameter-binding gap closeout/m, "live roadmap should advance after the completed database extraction contract branch");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.27 - Database extraction contract/m, "live roadmap should not keep the completed database extraction contract branch open");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.26 - Parameter-binding gap review/m, "live roadmap should not keep the completed parameter-binding gap review branch open");
assert.doesNotMatch(roadmap, /0\.33\.5\.27\.33 - Docs, decisions, 0\.40\.0 reconciliation, and closeout/, "live roadmap should archive completed database extraction contract slice bodies");
assert.match(roadmap, /Database extraction layer - PostgreSQL adapter and dual-backend support[\s\S]*completed 0\.33\.5\.27 agnostic-by-contract conversion\/seam branch[\s\S]*interpolation and raw-dialect ratchets enforced at zero[\s\S]*not an app-wide SQL rewrite[\s\S]*Dialect seam implementation recheck[\s\S]*consume the closed 0\.33\.5\.27 decisions/, "0.40.0 should be reconciled as PostgreSQL implementation/proof behind the 0.33.5.27 seams");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.23 - SQL Parameter-Binding Migration/m, "live roadmap should not keep the completed parameter-binding branch open");
assert.match(regressionSuite, /scripts\/parameter-binding-audit-regression\.mjs/, "regression suite should include the parameter-binding audit regression");
assert.match(regressionSuite, /scripts\/parameter-binding-layer-regression\.mjs/, "regression suite should include the parameter-binding layer regression");
assert.match(regressionSuite, /scripts\/parameter-binding-conversion-wave-regression\.mjs/, "regression suite should include the parameter-binding conversion-wave regression");
assert.match(regressionSuite, /scripts\/work-resume-state-conversion-regression\.mjs/, "regression suite should include the Work resume state conversion regression");
assert.match(regressionSuite, /scripts\/client-projects-repositories-conversion-regression\.mjs/, "regression suite should include the Clients/Projects repositories conversion regression");
assert.match(regressionSuite, /scripts\/framework-admin-low-count-repositories-conversion-regression\.mjs/, "regression suite should include the framework/admin low-count repositories conversion regression");
assert.match(regressionSuite, /scripts\/startup-maintenance-compatibility-regression\.mjs/, "regression suite should include the startup maintenance compatibility regression");
assert.match(regressionSuite, /scripts\/migration-compatibility-regression\.mjs/, "regression suite should include the migration compatibility regression");
assert.match(regressionSuite, /scripts\/interpolation-enforcement-guardrail-regression\.mjs/, "regression suite should include the interpolation enforcement guardrail regression");
assert.match(regressionSuite, /scripts\/dialect-enforcement-guardrail-regression\.mjs/, "regression suite should include the dialect enforcement guardrail regression");
assert.match(regressionSuite, /scripts\/database-agnostic-contract-closeout-regression\.mjs/, "regression suite should include the database agnostic contract closeout regression");

console.log("Parameter-binding audit regression passed.");

function buildParameterBindingAudit() {
  const groups = new Map();
  const totals = {
    boundOperationSites: 0,
    dbOperationSites: 0,
    helperCalls: 0,
    interpolatedOperationSites: 0,
  };

  for (const filePath of listRuntimeSourceFiles()) {
    const relativePath = normalizePath(filePath);

    if (relativePath === "src/db/sql-literals.js") {
      continue;
    }

    const source = readText(relativePath);
    const row = scanSourceFile(relativePath, source);

    totals.boundOperationSites += row.boundOperationSites;
    totals.dbOperationSites += row.dbOperationSites;
    totals.helperCalls += row.helperCalls;
    totals.interpolatedOperationSites += row.interpolatedOperationSites;

    if (
      row.boundOperationSites === 0 &&
      row.helperCalls === 0 &&
      row.interpolatedOperationSites === 0
    ) {
      continue;
    }

    const group = sourceGroup(relativePath);
    const aggregate = groups.get(group) || {
      boundOperationSites: 0,
      dbOperationSites: 0,
      files: [],
      group,
      helperCalls: 0,
      interpolatedOperationSites: 0,
    };
    aggregate.files.push(relativePath);
    aggregate.boundOperationSites += row.boundOperationSites;
    aggregate.dbOperationSites += row.dbOperationSites;
    aggregate.helperCalls += row.helperCalls;
    aggregate.interpolatedOperationSites += row.interpolatedOperationSites;
    groups.set(group, aggregate);
  }

  return {
    groups: [...groups.values()].sort((left, right) => (
      right.helperCalls - left.helperCalls ||
      right.interpolatedOperationSites - left.interpolatedOperationSites ||
      left.group.localeCompare(right.group)
    )),
    totals,
  };
}

function scanSourceFile(filePath, source) {
  const helperPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
  const operationPattern = /\b(?:db|transaction)\.(?:query|get|run)\s*\(|\b(?:querySql|getSql|runSql)\s*\(/g;
  let helperCalls = 0;
  let boundOperationSites = 0;
  let dbOperationSites = 0;
  let interpolatedOperationSites = 0;

  for (const match of source.matchAll(helperPattern)) {
    const before = source.slice(Math.max(0, match.index - 16), match.index);
    if (!/function\s+$/.test(before)) {
      helperCalls += 1;
    }
  }

  for (const match of source.matchAll(operationPattern)) {
    const call = extractCallExpression(source, match.index);
    const args = splitTopLevelArguments(call.slice(call.indexOf("(") + 1, -1));
    dbOperationSites += 1;

    if (helperPattern.test(call)) {
      interpolatedOperationSites += 1;
    }
    helperPattern.lastIndex = 0;

    if (args.length > 1 && args[1] && args[1] !== "undefined") {
      boundOperationSites += 1;
    }
  }

  return {
    boundOperationSites,
    dbOperationSites,
    filePath,
    helperCalls,
    interpolatedOperationSites,
  };
}

function extractCallExpression(source, startIndex) {
  const openIndex = source.indexOf("(", startIndex);
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let templateDepth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

function splitTopLevelArguments(source) {
  const args = [];
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let start = 0;
  let templateDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const lastArg = source.slice(start).trim();
  if (lastArg) {
    args.push(lastArg);
  }
  return args;
}

function listSourceMatches(pattern) {
  const matches = [];

  for (const filePath of listRuntimeSourceFiles()) {
    const relativePath = normalizePath(filePath);
    const source = readText(relativePath);

    for (const match of source.matchAll(pattern)) {
      matches.push({
        file: relativePath,
        line: lineNumber(source, match.index),
        match: match[0],
      });
    }
  }

  return matches;
}

function listRuntimeSourceFiles() {
  const files = [];
  walk(path.join(root, "src"), files);
  return files;
}

function walk(currentPath, results) {
  const stat = statSync(currentPath);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), results);
    }
    return;
  }

  if (/\.(?:js|mjs)$/.test(currentPath)) {
    results.push(currentPath);
  }
}

function sourceGroup(filePath) {
  if (filePath.startsWith("src/repositories/")) {
    return path.basename(filePath, ".js");
  }

  const moduleMatch = filePath.match(/^src\/modules\/([^/]+)\/([^/]+)$/);
  if (moduleMatch) {
    return `${moduleMatch[1]}/${path.basename(moduleMatch[2], ".js")}`;
  }

  if (filePath.startsWith("src/services/")) {
    return `services/${path.basename(filePath, ".js")}`;
  }

  if (filePath.startsWith("src/core/")) {
    return `core/${filePath.split("/").slice(2).join("/").replace(/\.js$/, "")}`;
  }

  if (filePath.startsWith("src/db/")) {
    return `db/${path.basename(filePath, ".js")}`;
  }

  return filePath.replace(/^src\//, "").replace(/\.js$/, "");
}

function assertInventoryRow(group, status, row) {
  assert.match(
    auditDocs,
    new RegExp(`\\| ${escapeRegExp(group)} \\| ${escapeRegExp(status)} \\| ${row.helperCalls} \\| ${row.interpolatedOperationSites} \\| ${row.boundOperationSites} \\| ${row.dbOperationSites} \\|`),
    `${group} should be documented as ${status} in the canonical audit inventory`,
  );
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function normalizePath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
