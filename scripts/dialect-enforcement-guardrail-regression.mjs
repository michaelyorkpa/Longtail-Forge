import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  lineNumber,
  readRuntimeSourceEntries,
} from "./test-support/source-scan.mjs";

const root = process.cwd();
const appVersion = "0.33.6.6";
const dialectGuardrailSliceVersion = "0.33.5.27.32";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const moduleContractDocs = readText("docs/module-contract.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const permissionsRepoSource = readText("src/repositories/permissions.repo.js");
const appSettingsRepoSource = readText("src/repositories/app-settings.repo.js");
const workspacesRepoSource = readText("src/repositories/workspaces.repo.js");
const userWorkspacesRepoSource = readText("src/repositories/user-workspaces.repo.js");
const jobQueueSource = readText("src/core/jobs/job-queue.js");
const jobRunnerSource = readText("src/core/jobs/job-runner.js");
const jobsServiceSource = readText("src/services/jobs.service.js");

const DIALECT_ALLOWLIST = new Set([
  "src/core/search/adapters/sqlite-search-adapter.js",
  "src/db/adapters/sqlite-dialect-seams.js",
  "src/db/index.js",
  "src/db/migrations.js",
  "src/db/sqlite.js",
]);

const DIALECT_PATTERNS = Object.freeze([
  {
    label: "insert-or-ignore",
    pattern: /\bINSERT\s+OR\s+IGNORE\b/g,
  },
  {
    label: "on-conflict",
    pattern: /\bON\s+CONFLICT\b/g,
  },
  {
    label: "excluded-column",
    pattern: /\bexcluded\.[A-Za-z_][A-Za-z0-9_]*\b/g,
  },
  {
    label: "collate-nocase",
    pattern: /\bCOLLATE\s+NOCASE\b/g,
  },
  {
    label: "julianday",
    pattern: /\bjulianday\s*\(/g,
  },
  {
    label: "fts-match",
    pattern: /\bMATCH\b/g,
  },
  {
    label: "fts-rank",
    pattern: /\bbm25\s*\(/g,
  },
  {
    label: "fts5",
    pattern: /\b(?:USING\s+fts5|fts5\s*\()/g,
  },
  {
    label: "sqlite-json",
    pattern: /\bjson_(?:extract|set|each|object|array|remove|insert|replace|valid|type|quote|group)\s*\(|->>|->/g,
  },
  {
    label: "pragma",
    pattern: /\bPRAGMA\b/g,
  },
  {
    label: "rowid",
    pattern: /\browid\b/g,
  },
  {
    label: "returning",
    pattern: /\bRETURNING\b/g,
  },
]);

const runtimeViolations = findDialectViolations(readRuntimeSourceEntries({ root }));

assert.equal(packageJson.version, appVersion, "package.json should report the dialect enforcement guardrail version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the dialect enforcement guardrail version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the dialect enforcement guardrail version");
assert.match(sqliteDialectSource, new RegExp(`contractVersion: "${escapeRegExp(appVersion)}"`), "SQLite dialect contract should report the dialect enforcement guardrail version");

assert.deepEqual(runtimeViolations, [], "runtime source should have no raw seam-backed dialect outside the provider/startup/migration/search-adapter allowlist");
assertSyntheticRejections();
assertConvertedRepositoriesUseDialectSeams();
assertDurableJobReturningStaysProviderOwned();
assertDocumentationContract();

console.log("Dialect enforcement guardrail regression passed.");

function assertSyntheticRejections() {
  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/repositories/proof.repo.js",
        source: "await db.run(`INSERT OR IGNORE INTO proof (id) VALUES (:id);`, { id });",
      },
    ]).map((violation) => violation.label),
    ["insert-or-ignore"],
    "guardrail should reject raw INSERT OR IGNORE in an application repository",
  );

  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/repositories/proof.repo.js",
        source: "await db.run(`INSERT INTO proof (id, value) VALUES (:id, :value) ON CONFLICT(id) DO UPDATE SET value = excluded.value;`, params);",
      },
    ]).map((violation) => violation.label),
    ["excluded-column", "on-conflict"],
    "guardrail should reject raw ON CONFLICT and excluded column syntax in an application repository",
  );

  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/services/proof.service.js",
        source: [
          "await db.get(`SELECT id FROM proof WHERE name = :name COLLATE NOCASE;`, params);",
          "await db.get(`SELECT CAST((julianday(:now) - julianday(created_at)) * 86400 AS INTEGER) AS age FROM proof;`);",
          "await db.get(`INSERT INTO proof (id) VALUES (:id) RETURNING id;`, params);",
        ].join("\n"),
      },
    ]).map((violation) => violation.label),
    ["collate-nocase", "julianday", "julianday", "returning"],
    "guardrail should reject case-insensitive, time, and returning dialect use outside the dialect seam",
  );

  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/modules/proof/proof.repo.js",
        source: [
          "await db.query(`PRAGMA table_info(proof);`);",
          "await db.get(`SELECT rowid AS physical_row_id FROM proof LIMIT 1;`);",
          "await db.get(`SELECT json_extract(payload_json, '$.name') AS name FROM proof;`);",
        ].join("\n"),
      },
    ]).map((violation) => violation.label),
    ["pragma", "rowid", "sqlite-json"],
    "guardrail should reject raw PRAGMA, rowid, and SQLite JSON use outside the allowlist",
  );

  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/services/search-caller.js",
        source: "await db.query(`SELECT bm25(search_fts) AS rank FROM search_fts WHERE search_fts MATCH :query;`, { query });",
      },
    ]).map((violation) => violation.label),
    ["fts-match", "fts-rank"],
    "guardrail should reject raw FTS rank and match syntax outside the provider-owned search adapter",
  );

  assert.deepEqual(
    findDialectViolations([
      {
        file: "src/db/adapters/sqlite-dialect-seams.js",
        source: [
          "return `INSERT OR IGNORE INTO proof (id) VALUES (:id) RETURNING id`;",
          "return `PRAGMA table_info(proof);`;",
        ].join("\n"),
      },
      {
        file: "src/db/migrations.js",
        source: "const repairSql = `PRAGMA foreign_keys = OFF; INSERT OR IGNORE INTO user_workspaces (user_id) SELECT user_id FROM users;`;",
      },
      {
        file: "src/core/search/adapters/sqlite-search-adapter.js",
        source: "await db.query(`SELECT bm25(search_fts) AS rank FROM search_fts WHERE search_fts MATCH :query;`, { query });",
      },
    ]),
    [],
    "guardrail should permit provider-owned dialect seams and sanctioned migration/search-adapter compatibility",
  );
}

function assertConvertedRepositoriesUseDialectSeams() {
  assert.doesNotMatch(permissionsRepoSource, /\bINSERT\s+OR\s+IGNORE\b/, "permissions repository should not hardcode raw insert-or-ignore syntax");
  assert.match(permissionsRepoSource, /db\.dialect\.conflict\.buildInsertOrIgnore/, "permissions repository should use the insert-or-ignore seam");
  assert.match(permissionsRepoSource, /db\.dialect\.conflict\.insertOrIgnoreInto/, "permissions role mapping repair should use the insert-or-ignore prefix seam");

  for (const [label, source] of [
    ["app settings repository", appSettingsRepoSource],
    ["workspaces repository", workspacesRepoSource],
    ["user workspaces repository", userWorkspacesRepoSource],
  ]) {
    assert.doesNotMatch(source, /\bON\s+CONFLICT\b/, `${label} should not hardcode raw ON CONFLICT syntax`);
    assert.doesNotMatch(source, /\bexcluded\.[A-Za-z_][A-Za-z0-9_]*\b/, `${label} should not hardcode raw excluded column syntax`);
    assert.match(source, /db\.dialect\.conflict\.buildInsertOnConflictDo(?:Nothing|Update)/, `${label} should use the conflict seam`);
  }
}

function assertDurableJobReturningStaysProviderOwned() {
  assert.doesNotMatch(jobQueueSource, /\bRETURNING\b/, "job queue should not reintroduce raw RETURNING");
  assert.doesNotMatch(jobRunnerSource, /\bRETURNING\b/, "job runner should not reintroduce raw RETURNING");
  assert.doesNotMatch(jobsServiceSource, /\bRETURNING\b/, "jobs service should not reintroduce raw RETURNING");
  assert.match(jobQueueSource, /transaction\.dialect\.returning\.columns/, "job queue should keep using the returning seam");
  assert.match(jobRunnerSource, /transaction\.dialect\.returning\.columns/, "job runner should keep using the returning seam");
  assert.match(jobsServiceSource, /transaction\.dialect\.returning\.columns/, "jobs service should keep using the returning seam");
}

function assertDocumentationContract() {
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.32 - Dialect enforcement guardrail[\s\S]*- \[x\] Extend the enforcement guardrail[\s\S]*- \[x\] Critically, run the dialect guardrail[\s\S]*whole-tree sweep[\s\S]*- \[x\] Add a distinct dialect-adoption axis[\s\S]*- \[x\] Reconcile the guardrail[\s\S]*durable-job[\s\S]*- \[x\] Add regressions proving the guardrail rejects raw dialect use[\s\S]*- \[x\] Document the dialect guardrail/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(auditDocs, /Current totals as of 0\.33\.6\.6:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 386[\s\S]*Total runtime database operation calls seen by the audit scanner: 430/, "audit docs should keep the current parameter-binding totals");
  assert.match(auditDocs, /## Dialect Adoption Guardrail[\s\S]*Current totals as of 0\.33\.5\.28\.2:[\s\S]*Remaining raw seam-backed dialect sites at application call sites: 0[\s\S]*Whole runtime source sweep/, "audit docs should record the distinct dialect-adoption axis");
  assert.match(auditDocs, /0\.33\.5\.27\.32 - Dialect enforcement guardrail \| Whole runtime dialect sweep and converted-owner re-audit/, "audit docs should assign the dialect enforcement guardrail wave");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.32[\s\S]*whole-tree dialect enforcement guardrail[\s\S]*raw seam-backed SQLite dialect[\s\S]*[Pp]rovider-owned or sanctioned compatibility paths/, "database docs should describe the dialect guardrail");
  assert.match(moduleContractDocs, /As of 0\.33\.5\.27\.32[\s\S]*must not hardcode raw seam-backed SQLite dialect[\s\S]*`db\.dialect` seams/, "module contract should tell future modules to use the agnostic dialect contract");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(dialectGuardrailSliceVersion)} - [\\s\\S]*Dialect enforcement guardrail[\\s\\S]*Remaining raw seam-backed dialect sites at application call sites: 0`), "changelog should record the dialect guardrail slice");
  assert.match(regressionSuite, /scripts\/dialect-enforcement-guardrail-regression\.mjs/, "regression suite should include the dialect guardrail regression");
}

function findDialectViolations(entries) {
  const violations = [];

  for (const entry of entries) {
    if (DIALECT_ALLOWLIST.has(entry.file)) {
      continue;
    }

    for (const check of DIALECT_PATTERNS) {
      check.pattern.lastIndex = 0;

      for (const match of entry.source.matchAll(check.pattern)) {
        violations.push({
          file: entry.file,
          label: check.label,
          line: lineNumber(entry.source, match.index),
          match: match[0],
        });
      }
    }
  }

  return violations.sort((left, right) => (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.label.localeCompare(right.label)
  ));
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
