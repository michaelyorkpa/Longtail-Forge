import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.27";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-fts-seams-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-fts-seams.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Search-Fts-Seams-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const searchServiceSource = readText("src/services/search.service.js");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const {
  buildSqliteSearchReadStatementsForTests,
  clearSqliteSearchAdapterCapabilityCacheForTests,
} = await import("../src/core/search/adapters/sqlite-search-adapter.js");
const { searchService } = await import("../src/services/search.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  assertSearchLoweringHelpers();
  await assertSearchReadAndRepairBehavior();
  await assertIntegrity();

  console.log("Search FTS seam regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the search FTS seam version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the search FTS seam version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the search FTS seam version");

  assert.match(sqliteDialectSource, new RegExp(`contractVersion: "${escapeRegExp(appVersion)}"`), "SQLite dialect contract should report the current seam contract version");
  assert.match(sqliteDialectSource, /createVirtualTable/, "SQLite search dialect should own FTS virtual table creation syntax");
  assert.match(sqliteDialectSource, /dropVirtualTable/, "SQLite search dialect should own FTS virtual table cleanup syntax");
  assert.match(sqliteDialectSource, /function match/, "SQLite search dialect should own MATCH lowering");
  assert.match(sqliteDialectSource, /function rank/, "SQLite search dialect should own rank lowering");

  assert.match(sqliteSearchAdapterSource, /import \{ createBulkValuesBindings, db \}/, "SQLite search adapter should use the core db seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.createVirtualTable/, "SQLite search adapter should delegate FTS table creation to the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.match/, "SQLite search adapter should delegate MATCH lowering to the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.rank/, "SQLite search adapter should delegate rank lowering to the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.comparison\.likePattern/, "SQLite search adapter should delegate fallback LIKE pattern construction to the comparison seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.comparison\.containsNoCase/, "SQLite search adapter should delegate fallback LIKE lowering to the comparison seam");
  assert.match(sqliteSearchAdapterSource, /buildSqliteSearchReadStatementsForTests/, "SQLite search adapter should expose focused query-lowering test hooks");
  assert.doesNotMatch(sqliteSearchAdapterSource, /\b(?:querySql|runSql|sqlText)\b/, "SQLite search adapter should not use literal-helper compatibility APIs");
  assert.doesNotMatch(sqliteSearchAdapterSource, /\bMATCH\b/, "SQLite search adapter source should not own raw FTS MATCH syntax");
  assert.doesNotMatch(sqliteSearchAdapterSource, /\bbm25\b/, "SQLite search adapter source should not own raw FTS rank syntax");
  assert.doesNotMatch(sqliteSearchAdapterSource, /USING fts5/, "SQLite search adapter source should not own raw FTS5 virtual table syntax");
  assert.doesNotMatch(sqliteSearchAdapterSource, /function sqlLikePattern/, "SQLite search adapter should not keep local LIKE escaping");

  assert.match(searchServiceSource, /backendNeutralQueryModel: true/, "search service should keep callers on a backend-neutral query model");
  assert.match(searchServiceSource, /adapterSyntax: null/, "permission-safe search request shaping should not emit backend syntax");
  assert.match(regressionSuite, /scripts\/search-fts-seam-regression\.mjs/, "regression suite should include search FTS seam coverage");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.6 - Search\/FTS seam extraction[\s\S]*- \[x\] Move backend search syntax ownership[\s\S]*- \[x\] Keep canonical `search_index` rows[\s\S]*- \[x\] Add focused search regressions/, "roadmap should mark the search FTS seam slice complete");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.6[\s\S]*SQLite search adapter[\s\S]*`db\.dialect\.search\.match\(\.\.\.\)`[\s\S]*indexed `LIKE` fallback/, "database docs should describe the search FTS seam extraction");
  assert.match(auditDocs, /0\.33\.5\.27\.6 Search\/FTS Seam Extraction[\s\S]*`core\/search\/adapters\/sqlite-search-adapter`[\s\S]*1,441 runtime literal-helper invocations[\s\S]*228 direct interpolated SQL operation sites/, "audit docs should record the search adapter conversion");
  assert.match(changelog, /## Version 0\.33\.5\.27\.6 - [\s\S]*Search\/FTS seam extraction[\s\S]*canonical `search_index`[\s\S]*indexed LIKE fallback/, "changelog should record the search FTS seam slice");
}

function assertSearchLoweringHelpers() {
  assert.equal(
    db.dialect.search.createVirtualTable("search_index_fts", [
      { name: "search_index_id", unindexed: true },
      "title",
    ]),
    "CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts USING fts5(\n  search_index_id UNINDEXED,\n  title\n)",
    "FTS storage helper should lower to the current SQLite virtual-table syntax",
  );
  assert.equal(
    db.dialect.search.dropVirtualTable("temp.__ltf_search_fts5_probe"),
    "DROP TABLE IF EXISTS temp.__ltf_search_fts5_probe",
    "FTS storage helper should lower temp virtual-table cleanup",
  );

  const statements = buildSqliteSearchReadStatementsForTests({
    workspaceId: "workspace-search-seams",
    text: "alpha launch!!",
    targets: [{
      moduleId: "developer-example",
      recordType: "developer_example",
    }],
    scopes: {
      clientId: "client-1",
      projectId: "project-1",
    },
    exactTagIds: ["tag-1"],
    recordStatus: "active",
    limit: 7,
    offset: 2,
  });

  assert.ok(statements.fts, "FTS statement should be produced for tokenizable text");
  assert.equal(statements.fts.ftsQuery, "\"alpha\" AND \"launch\"");
  assert.match(statements.fts.sql, /search_index_fts MATCH :ftsQuery/, "FTS query should lower through the dialect MATCH seam");
  assert.match(statements.fts.sql, /bm25\(search_index_fts\) AS search_score/, "FTS query should lower rank through the dialect rank seam");
  assert.equal(statements.fts.params.ftsQuery, "\"alpha\" AND \"launch\"");
  assert.equal(statements.fts.params.workspaceId, "workspace-search-seams");
  assert.equal(statements.fts.params.targetModuleId0, "developer-example");
  assert.equal(statements.fts.params.targetRecordType0, "developer_example");
  assert.equal(statements.fts.params.clientId, "client-1");
  assert.equal(statements.fts.params.projectId, "project-1");
  assert.equal(statements.fts.params.tagId0, "tag-1");
  assert.equal(statements.fts.params.limit, 7);
  assert.equal(statements.fts.params.offset, 2);

  assert.match(statements.fallback.sql, /si\.title LIKE :searchTextPattern COLLATE NOCASE ESCAPE '\\'/, "fallback query should lower through the comparison seam");
  assert.match(statements.fallback.sql, /si\.body LIKE :searchTextPattern COLLATE NOCASE ESCAPE '\\'/, "fallback query should search canonical body text");
  assert.equal(statements.fallback.params.searchTextPattern, "%alpha launch!!%");
  assert.equal(statements.fallback.params.limit, 7);
  assert.equal(statements.fallback.params.offset, 2);
}

async function assertSearchReadAndRepairBehavior() {
  clearSqliteSearchAdapterCapabilityCacheForTests();

  const workspaceId = "search-fts-seam-workspace";
  const now = "2026-07-06T00:00:00.000Z";

  await db.run(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (:workspaceId, 'Search FTS Seam Workspace', 'Active', 'business', :now, :now);
`, {
    now,
    workspaceId,
  });

  const documents = [
    createSearchDocument({
      body: "The beta customer needs an alpha launch checklist.",
      indexedAt: "2026-07-06T00:01:00.000Z",
      recordId: "alpha-record",
      source: "Example",
      summary: "Customer rollout plan",
      tagsText: "launch customer",
      title: "Alpha launch notes",
      workspaceId,
    }),
    createSearchDocument({
      body: "Archive old setup notes.",
      indexedAt: "2026-07-06T00:02:00.000Z",
      recordId: "billing-record",
      source: "Example",
      summary: "Internal accounting note",
      tagsText: "billing",
      title: "Billing cleanup",
      workspaceId,
    }),
  ];

  const writeResult = await searchService.upsertSearchDocuments(documents, { refresh: true });
  const request = {
    workspaceId,
    text: "alpha launch",
    targets: [{
      moduleId: "developer-example",
      recordType: "developer_example",
    }],
    limit: 10,
    offset: 0,
  };
  const fallback = await searchService.executeSearch(request, { forceFallback: true });
  const preferred = await searchService.executeSearch(request);

  assert.equal(writeResult.indexedCount, 2);
  assert.equal(fallback.backend, "sqlite-like");
  assert.equal(fallback.fallbackMode, "indexed-like");
  assert.deepEqual(fallback.results.map((row) => row.record_id), ["alpha-record"], "indexed LIKE fallback should read canonical search_index rows");
  assert.ok(["sqlite-fts5", "sqlite-like"].includes(preferred.backend));
  assert.deepEqual(preferred.results.map((row) => row.record_id), ["alpha-record"], "preferred search backend should preserve search result behavior");

  if (!writeResult.storage.ftsTableReady) {
    const repair = await searchService.repairSearchBackendIndex({ workspaceId });
    assert.equal(repair.skipped, true, "repair should skip cleanly when FTS storage is unavailable");
    return;
  }

  await corruptFtsRows(workspaceId, now);
  const beforeMetadata = await readCanonicalMetadata(workspaceId);
  const repair = await searchService.repairSearchBackendIndex({
    workspaceId,
    moduleId: "developer-example",
    recordType: "developer_example",
  });
  const afterMetadata = await readCanonicalMetadata(workspaceId);
  const ftsRows = await db.query(`
SELECT search_index_id, title
FROM search_index_fts
WHERE workspace_id = :workspaceId
ORDER BY search_index_id;
`, { workspaceId });
  const repairedPreferred = await searchService.executeSearch(request);

  assert.equal(repair.skipped, false);
  assert.equal(repair.scannedCount, 2);
  assert.equal(repair.rebuiltCount, 2);
  assert.equal(repair.missingCount, 2);
  assert.equal(repair.orphanedCount, 1);
  assert.equal(repair.repairedCount, 3);
  assert.deepEqual(afterMetadata, beforeMetadata, "FTS repair should not mutate canonical search_index metadata");
  assert.deepEqual(ftsRows, [
    {
      search_index_id: `${workspaceId}:developer-example:developer_example:alpha-record`,
      title: "Alpha launch notes",
    },
    {
      search_index_id: `${workspaceId}:developer-example:developer_example:billing-record`,
      title: "Billing cleanup",
    },
  ]);
  assert.equal(repairedPreferred.backend, "sqlite-fts5");
  assert.deepEqual(repairedPreferred.results.map((row) => row.record_id), ["alpha-record"], "repaired FTS storage should still read from canonical rows");
}

function createSearchDocument({
  body,
  indexedAt,
  recordId,
  source,
  summary,
  tagsText,
  title,
  workspaceId,
}) {
  return {
    body,
    client_id: null,
    collection_path: null,
    indexed_at: indexedAt,
    library_bucket: null,
    module_id: "developer-example",
    note_collection_id: null,
    project_id: null,
    record_created_at: indexedAt,
    record_id: recordId,
    record_status: "active",
    record_type: "developer_example",
    record_updated_at: indexedAt,
    search_index_id: `${workspaceId}:developer-example:developer_example:${recordId}`,
    source,
    summary,
    tags_text: tagsText,
    title,
    visibility: "normal",
    workspace_id: workspaceId,
  };
}

async function corruptFtsRows(workspaceId, now) {
  await db.run(`
DELETE FROM search_index_fts
WHERE workspace_id = :workspaceId;
`, { workspaceId });
  await db.run(`
INSERT INTO search_index_fts (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
)
VALUES (
  :searchIndexId,
  :workspaceId,
  'developer-example',
  'developer_example',
  'orphan-record',
  'Orphan search row',
  '',
  :now,
  '',
  'Example'
);
`, {
    now,
    searchIndexId: `${workspaceId}:developer-example:developer_example:orphan-record`,
    workspaceId,
  });
}

async function readCanonicalMetadata(workspaceId) {
  return db.query(`
SELECT search_index_id, client_id, project_id, visibility, record_status, source, indexed_at
FROM search_index
WHERE workspace_id = :workspaceId
ORDER BY search_index_id;
`, { workspaceId });
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "search FTS seam regression database should pass integrity check");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
