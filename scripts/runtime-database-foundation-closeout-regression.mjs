import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.20.1";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const architectureDocs = readText("docs/architecture.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const archiveFileNamePattern = "ROADMAP" + "-ARCHIVE\\.md";

assert.equal(packageJson.version, appVersion, "package.json should report the runtime/database closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the runtime/database closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the runtime/database closeout version");

assert.match(
  roadmap,
  new RegExp(`Completed 0\\.33\\.5\\.19 runtime configuration and SQLite small-office foundation work is archived in \`${archiveFileNamePattern}\``),
  "roadmap should point the completed runtime/database foundation branch to the archive",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.19 - Runtime Configuration and SQLite Small-Office Foundation/m,
  "live roadmap should not keep the completed runtime/database foundation branch open",
);
assert.match(
  roadmap,
  /## Version 0\.33\.5\.20 - Bounded Queries and Small-Office Scale Data[\s\S]*Entry contract from 0\.33\.5\.19:[\s\S]*database health\/capability information[\s\S]*without requiring PostgreSQL/,
  "0.33.5.20 should inherit the database health and capability boundary",
);
assert.match(
  roadmap,
  /## Version 0\.33\.5\.21 - Durable Jobs and Outbox Foundation[\s\S]*Entry contract from 0\.33\.5\.19:[\s\S]*transaction helper[\s\S]*reserved worker runtime config names/,
  "0.33.5.21 should inherit transaction and worker runtime config boundaries",
);
assert.match(
  roadmap,
  /## Version 0\.33\.5\.22 - Storage Provider and Scanner Runtime[\s\S]*Entry contract from 0\.33\.5\.19:[\s\S]*storage and scanner runtime config keys/,
  "0.33.5.22 should inherit storage and scanner runtime config keys",
);
assert.match(
  roadmap,
  /## Version 0\.33\.5\.23 - PostgreSQL Adapter and SaaS Runtime Proof[\s\S]*Entry contract from 0\.33\.5\.19:[\s\S]*database provider config[\s\S]*adapter boundary[\s\S]*migration-lock strategy/,
  "0.33.5.23 should inherit provider, adapter, health, and migration-lock boundaries",
);

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the runtime/database closeout");
assert.match(changelog, /archived the completed 0\.33\.5\.19 roadmap branch/, "changelog should record the roadmap archive handoff");
assert.match(changelog, /Runtime configuration, SQLite hardening, database adapter, parameter pilot, transaction pilot, migration locking, diagnostics, and small-office readout/, "changelog should summarize the verified foundation");

assert.match(runtimeDocs, /As of 0\.33\.5\.19\.9/, "runtime docs should report the closeout contract version");
assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
assert.match(runtimeDocs, /Reserved settings may appear in `config`[\s\S]*does not implement PostgreSQL/, "runtime docs should keep reserved settings dormant");
assert.match(runtimeDocs, /The completed 0\.33\.5\.19 runtime\/database foundation[\s\S]*does not:/, "runtime docs should state the completed foundation scope boundary");
assert.match(runtimeDocs, /`GET \/api\/runtime-diagnostics`[\s\S]*workspace_settings\.manage/, "runtime docs should document diagnostics permission");

assert.match(databaseDocs, /As of version 0\.33\.5\.19\.9/, "database docs should report the closeout database version");
assert.match(databaseDocs, /The completed 0\.33\.5\.19 foundation covers runtime config[\s\S]*SQLite startup hardening[\s\S]*provider-neutral adapter boundary[\s\S]*parameterized-query and transaction pilots[\s\S]*SQLite migration locking[\s\S]*runtime diagnostics\/admin readout/, "database docs should summarize shipped runtime/database foundation behavior");
assert.match(databaseDocs, /does not implement PostgreSQL[\s\S]*durable jobs\/outbox processing[\s\S]*storage-provider switching[\s\S]*scanner adapters[\s\S]*bounded query rewrites/, "database docs should keep future branches out of the closeout scope");
assert.match(databaseDocs, /Parameterized Query Style/, "database docs should keep the parameterized query style");
assert.match(databaseDocs, /Transaction Style/, "database docs should keep the transaction style");
assert.match(databaseDocs, /Migration Locking and Startup Ownership/, "database docs should keep migration locking guidance");

assert.match(architectureDocs, /As of 0\.33\.5\.19\.9[\s\S]*SQLite is still the only implemented provider/, "architecture docs should summarize the active provider boundary");
assert.match(architectureDocs, /src\/core\/database\.js[\s\S]*health\/capability reporting[\s\S]*named-parameter support[\s\S]*callback transactions[\s\S]*SQLite migration locking/, "architecture docs should document the shipped adapter foundation");
assert.match(architectureDocs, /Future bounded-query, jobs\/outbox, storage\/scanner, and PostgreSQL work should consume that foundation/, "architecture docs should hand off future branches");

assert.match(sqliteDocs, /one Longtail Forge app process\/server/i, "SQLite small-office docs should keep the one-server boundary");
assert.match(sqliteDocs, /roughly 50 total users[\s\S]*5-15 concurrent users/i, "SQLite small-office docs should keep the support target");
assert.match(sqliteDocs, /Runtime Diagnostics panel[\s\S]*does not edit runtime configuration/i, "SQLite docs should keep diagnostics read-only");

assert.match(regressionSuite, /scripts\/runtime-database-foundation-closeout-regression\.mjs/, "regression suite should include the runtime/database closeout regression");

console.log("Runtime/database foundation closeout regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
