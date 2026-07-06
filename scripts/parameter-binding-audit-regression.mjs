import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.17";
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
const listsCatalogLinksSliceVersion = appVersion;
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
  boundOperationSites: 201,
  dbOperationSites: 417,
  helperCalls: 726,
  interpolatedOperationSites: 149,
}, "parameter-binding audit totals should match the current post-wave runtime inventory");

const expectedTopGroups = [
  ["services/files.service", 140, 26],
  ["notifications.repo", 99, 20],
  ["db/index", 99, 19],
  ["tags.repo", 84, 17],
  ["client-projects/clients.repo", 60, 5],
  ["services/work-resume-state.service", 53, 7],
  ["client-projects/projects.repo", 49, 7],
  ["services/tag-propagation-registry", 32, 15],
  ["core/modules/modules.service", 29, 6],
  ["audit-logs.repo", 28, 3],
];

for (const [group, helperCalls, interpolatedOperationSites] of expectedTopGroups) {
  const row = audit.groups.find((candidate) => candidate.group === group);
  assert.ok(row, `${group} should be present in the parameter-binding audit`);
  assert.equal(row.helperCalls, helperCalls, `${group} helper-call count should match the audit`);
  assert.equal(row.interpolatedOperationSites, interpolatedOperationSites, `${group} interpolated operation-site count should match the audit`);
  assertInventoryRow(group, "Remaining", row);
}

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

const convertedWaveRows = [
  ["app-settings.repo", 2],
  ["lists/lists.repo", 21],
  ["permissions.repo", 8],
  ["settings.repo", 4],
  ["notes/notes.repo", 21],
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
    "src/db/adapters/sqlite-dialect-seams.js:264",
  ],
  "RETURNING inventory should stay provider-owned after durable jobs move to the returning seam",
);
assert.equal(sqliteJsonMatches.length, 0, "runtime SQL should not use SQLite JSON SQL functions in this audit");
assert.equal(updateDeleteLimitMatches.length, 0, "runtime SQL should not use top-level UPDATE/DELETE LIMIT/OFFSET in this audit");

assert.match(auditDocs, /Runtime source scan/, "audit docs should describe the scan scope");
assert.match(auditDocs, /Current totals as of 0\.33\.5\.27\.17:[\s\S]*Remaining runtime literal-helper invocations: 726[\s\S]*Remaining direct interpolated SQL operation sites: 149[\s\S]*Existing direct bound-params operation sites: 201[\s\S]*Total runtime database operation calls seen by the audit scanner: 417/, "audit docs should record the current canonical totals");
assert.match(auditDocs, /Total runtime literal-helper invocations: 1,680/, "audit docs should record helper-call totals");
assert.match(auditDocs, /Total direct interpolated SQL operation sites: 262/, "audit docs should record operation-site totals");
assert.match(auditDocs, /Existing direct bound-params operation sites: 49/, "audit docs should record existing bound sites");
assert.match(auditDocs, /The inventory below is the canonical per-owner view/, "audit docs should make the inventory the canonical per-owner view");
assert.match(auditDocs, /Do not add separate per-wave owner tables with different counts/, "audit docs should forbid divergent per-wave owner tables");
assert.match(auditDocs, /0\.33\.5\.26\.3 Inventory Canonicalization[\s\S]*single source of truth/, "audit docs should record the single-source inventory cleanup");
assert.match(auditDocs, /Future Conversion Wave Ratchet Checklist[\s\S]*docs\/database-parameter-binding-audit\.md[\s\S]*scripts\/parameter-binding-audit-regression\.mjs[\s\S]*audit\.totals[\s\S]*expectedTopGroups[\s\S]*CHANGELOG\.md/, "audit docs should name the future-wave ratchet artifacts");
assert.match(auditDocs, /Do not weaken the exact-equality ratchet when it fails/, "audit docs should keep the exact ratchet strict");
assert.match(auditDocs, /Standing query rule from `DECISIONS\.md`:[\s\S]*new or touched single-statement repository queries must use named params[\s\S]*db\.query\(sql, params\)[\s\S]*deprecated compatibility escape hatches/, "audit docs should carry the standing named-params rule for future waves");
assert.match(auditDocs, /0\.33\.5\.27 Conversion Wave Assignments[\s\S]*0\.33\.5\.27\.8 - Tasks primary repository[\s\S]*`tasks\/tasks\.repo`[\s\S]*0\.33\.5\.27\.9 - Task checklist repository[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*0\.33\.5\.27\.10 - Task relationships repository[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*0\.33\.5\.27\.11 - Task recurrence and reminders[\s\S]*`tasks\/task-recurrence\.repo`, `tasks\/task-reminders\.repo`[\s\S]*0\.33\.5\.27\.12 - Active timers[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*0\.33\.5\.27\.13 - Time entries[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*0\.33\.5\.27\.16 - Lists records and items[\s\S]*`lists\/lists\.repo` partial[\s\S]*0\.33\.5\.27\.17 - Lists catalog and linked records[\s\S]*`lists\/lists\.repo` remaining catalog\/link paths[\s\S]*0\.33\.5\.27\.29 - Startup maintenance compatibility path[\s\S]*`db\/index`[\s\S]*0\.33\.5\.27\.30 - Migration compatibility path[\s\S]*`db\/migrations`/, "audit docs should assign every remaining owner to a 0.33.5.27 conversion wave");
assert.match(auditDocs, /only sanctioned interpolation compatibility allowlist[\s\S]*`src\/db\/index\.js`[\s\S]*`src\/db\/migrations\.js`/, "audit docs should record the narrow startup/migration compatibility allowlist");
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
assert.match(databaseDocs, /only sanctioned interpolation compatibility allowlist[\s\S]*`src\/db\/index\.js`[\s\S]*`src\/db\/migrations\.js`/, "database docs should publish the narrow interpolation allowlist");
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

assert.match(roadmap, /^## Version 0\.33\.5\.27 - Database extraction contract/m, "live roadmap should now start at the database extraction contract branch");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.26 - Parameter-binding gap review/m, "live roadmap should not keep the completed parameter-binding gap review branch open");
assert.match(roadmap, /0\.33\.5\.27\.16 - Conversion wave: Lists records and items[\s\S]*Convert list record and list item read\/write paths in `lists\/lists\.repo`/, "live roadmap should give Lists record/item work its own conversion wave");
assert.match(roadmap, /0\.33\.5\.27\.17 - Conversion wave: Lists catalog and linked records[\s\S]*Convert the remaining `lists\/lists\.repo` catalog/, "live roadmap should give Lists catalog/link work its own conversion wave");
assert.match(roadmap, /0\.33\.5\.27\.33 - Docs, decisions, 0\.40\.0 reconciliation, and closeout/, "live roadmap should keep closeout after the enforcement guardrail");
assert.match(roadmap, /Database extraction layer - PostgreSQL adapter and dual-backend support[\s\S]*0\.33\.5\.27 agnostic-by-contract conversion\/seam branch[\s\S]*not an app-wide SQL rewrite[\s\S]*Dialect seam implementation recheck[\s\S]*consume the 0\.33\.5\.27 decisions/, "0.40.0 should be reconciled as PostgreSQL implementation/proof behind the 0.33.5.27 seams");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.23 - SQL Parameter-Binding Migration/m, "live roadmap should not keep the completed parameter-binding branch open");
assert.match(regressionSuite, /scripts\/parameter-binding-audit-regression\.mjs/, "regression suite should include the parameter-binding audit regression");
assert.match(regressionSuite, /scripts\/parameter-binding-layer-regression\.mjs/, "regression suite should include the parameter-binding layer regression");
assert.match(regressionSuite, /scripts\/parameter-binding-conversion-wave-regression\.mjs/, "regression suite should include the parameter-binding conversion-wave regression");

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
