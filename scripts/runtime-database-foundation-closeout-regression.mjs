import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.7";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const architectureDocs = readText("docs/architecture.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the runtime/database closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the runtime/database closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the runtime/database closeout version");

assert.doesNotMatch(
  roadmap,
  /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed runtime/database archive breadcrumbs",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.19 - Runtime Configuration and SQLite Small-Office Foundation/m,
  "live roadmap should not keep the completed runtime/database foundation branch open",
);
assert.doesNotMatch(
  roadmap,
  /Completed 0\.33\.5\.20 bounded queries and small-office scale data work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed bounded-query archive breadcrumbs",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.20 - Bounded Queries and Small-Office Scale Data/m,
  "live roadmap should not keep the completed bounded-query branch open",
);
assert.doesNotMatch(
  roadmap,
  /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed durable-jobs archive breadcrumbs",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.21 - Durable Jobs and Outbox Foundation/m,
  "live roadmap should not keep the completed durable-jobs branch open",
);
assert.doesNotMatch(
  roadmap,
  /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed storage/scanner archive breadcrumbs",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.22 - Storage Provider and Scanner Runtime/m,
  "live roadmap should not keep the completed storage/scanner branch open",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.25 - Storage branch cleanup/m,
  "live roadmap should not keep the completed storage cleanup branch open",
);
assert.match(
  roadmap,
  /^Active cursor: `0\.33\.6`\. Completed `0\.33\.5\.29` is archived in `ROADMAP-ARCHIVE\.md`\./m,
  "live roadmap should record the archived 0.33.5.29 handoff",
);
assert.match(
  roadmap,
  /^## Version 0\.33\.6 - Dashboard and Workbench Formalization as Project hub and work center/m,
  "live roadmap should advance after database extraction contract closeout",
);
assert.match(
  roadmap,
  /### Database extraction layer - PostgreSQL adapter and dual-backend support[\s\S]*database seam from 0\.33\.5\.19[\s\S]*advisory-lock/,
  "the deferred PostgreSQL/database-extraction work should inherit the 0.33.5.19 seam and carry the migration advisory-lock boundary",
);

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the runtime/database closeout");
assert.match(changelog, /archived the completed 0\.33\.5\.19 roadmap branch/, "changelog should record the roadmap archive handoff");
assert.match(changelog, /Runtime configuration, SQLite hardening, database adapter, parameter pilot, transaction pilot, migration locking, diagnostics, and small-office readout/, "changelog should summarize the verified foundation");

assert.match(runtimeDocs, new RegExp(`As of ${escapeRegExp(appVersion)}`), "runtime docs should report the current runtime contract version");
assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
assert.match(runtimeDocs, /Reserved settings may appear in `config`[\s\S]*does not implement PostgreSQL/, "runtime docs should keep reserved settings dormant");
assert.match(runtimeDocs, /The completed 0\.33\.5\.19 runtime\/database foundation[\s\S]*does not:/, "runtime docs should state the completed foundation scope boundary");
assert.match(runtimeDocs, /`GET \/api\/runtime-diagnostics`[\s\S]*workspace_settings\.manage/, "runtime docs should document diagnostics permission");

assert.match(databaseDocs, /As of version 0\.33\.5\.19\.9/, "database docs should report the closeout database version");
assert.match(databaseDocs, /The completed 0\.33\.5\.19 foundation covers runtime config[\s\S]*SQLite startup hardening[\s\S]*provider-neutral adapter boundary[\s\S]*parameterized-query and transaction pilots[\s\S]*SQLite migration locking[\s\S]*runtime diagnostics\/admin readout/, "database docs should summarize shipped runtime/database foundation behavior");
assert.match(databaseDocs, /Later durable-job work consumes this boundary[\s\S]*completed 0\.33\.5\.22 storage\/scanner runtime branch makes local Files storage-provider selection[\s\S]*optional `clamscan` executable adapter active[\s\S]*optional `clamd` TCP adapter active[\s\S]*S3-compatible adapter scaffolding[\s\S]*S3 object operations contract-tested through a mocked client path[\s\S]*S3 diagnostics\/signature-boundary documentation active[\s\S]*LONGTAIL_STORAGE_PROVIDER=s3[\s\S]*fails app and worker startup[\s\S]*PostgreSQL[\s\S]*provider-specific hosted S3 client rollout[\s\S]*actual signed URL\/direct-transfer routes[\s\S]*stored-object relocation on quarantine[\s\S]*remain future branches/, "database docs should keep provider/storage/scanner branch handoffs current");
assert.match(databaseDocs, /As of version 0\.33\.5\.20\.5[\s\S]*bounded-query branch covers[\s\S]*Audit Log[\s\S]*Notifications[\s\S]*Search results[\s\S]*Files browse/, "database docs should record the shipped bounded-query branch");
assert.match(databaseDocs, /Parameterized Query Style/, "database docs should keep the parameterized query style");
assert.match(databaseDocs, /Transaction Style/, "database docs should keep the transaction style");
assert.match(databaseDocs, /Migration Locking and Startup Ownership/, "database docs should keep migration locking guidance");

assert.match(architectureDocs, /As of 0\.33\.5\.19\.9[\s\S]*SQLite is still the only implemented provider/, "architecture docs should summarize the active provider boundary");
assert.match(architectureDocs, /src\/core\/database\.js[\s\S]*health\/capability reporting[\s\S]*named-parameter support[\s\S]*callback transactions[\s\S]*SQLite migration locking/, "architecture docs should document the shipped adapter foundation");
assert.match(architectureDocs, /0\.33\.5\.20 bounded-query branch consumes that foundation[\s\S]*0\.33\.5\.21\.1 adds the first checksum-tracked durable job\/outbox schema migration[\s\S]*0\.33\.5\.21\.2 adds the v1 inline\/separate worker runner[\s\S]*completed 0\.33\.5\.22 storage\/scanner runtime branch closes[\s\S]*Files scanner mode resolution[\s\S]*safe scanner health diagnostics[\s\S]*optional `clamscan` executable scanning[\s\S]*optional `clamd` TCP scanning[\s\S]*S3-compatible adapter scaffolding[\s\S]*mocked S3 object operations[\s\S]*signed URL exception boundary[\s\S]*S3 remains deferred[\s\S]*provider-specific hosted S3 client rollout[\s\S]*actual signed URL\/direct-transfer routes[\s\S]*alternate database providers remain later work/, "architecture docs should hand off later provider branches");

assert.match(sqliteDocs, /one Longtail Forge app process\/server/i, "SQLite small-office docs should keep the one-server boundary");
assert.match(sqliteDocs, /roughly 50 total users[\s\S]*5-15 concurrent users/i, "SQLite small-office docs should keep the support target");
assert.match(sqliteDocs, /Runtime Diagnostics panel[\s\S]*does not edit runtime configuration/i, "SQLite docs should keep diagnostics read-only");

assert.match(regressionSuite, /scripts\/static-contract-closeout-regression\.mjs/, "regression suite should include the consolidated static closeout regression");

console.log("Runtime/database foundation closeout regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
