import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
import { requireRow } from "./test-support/database-row-assertions.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-parameter-binding-layer-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-binding-layer.db");
process.env.SUPER_ADMIN_PASSWORD = "Parameter-Binding-Layer-Test-123!";

const parameterBindingSource = readText("src/db/parameter-bindings.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const tagTextSource = readText("src/core/search/tag-text.js");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");

const {
  createBulkValuesBindings,
  DOLLAR_PLACEHOLDERS,
  QUESTION_PLACEHOLDERS,
  prepareDatabaseBindings,
} = await import("../src/db/parameter-bindings.js");
const {
  closeDatabase,
  db,
  querySql,
} = await import("../src/db/index.js");
const { readSearchTagsText } = await import("../src/core/search/tag-text.js");
const {
  clearSqliteSearchAdapterCapabilityCacheForTests,
  createSqliteSearchAdapter,
} = await import("../src/core/search/adapters/sqlite-search-adapter.js");

try {

  assert.match(parameterBindingSource, /function prepareDatabaseBindings/, "parameter binding layer should expose the shared translator");
  assert.match(parameterBindingSource, /createNamedBindingEntries/, "binding layer should centralize named list expansion");
  assert.match(parameterBindingSource, /function createBulkValuesBindings/, "binding layer should expose the shared bulk VALUES helper");
  assert.match(parameterBindingSource, /BULK_VALUES_SAFE_PLACEHOLDER_BUDGET = 32766/, "bulk VALUES helper should define the SQLite-safe placeholder budget");
  assert.match(parameterBindingSource, /assertBulkValuesPlaceholderBudget\(rows\.length, normalizedColumns\.length\)/, "bulk VALUES helper should check the placeholder budget before generating params");
  assert.match(parameterBindingSource, /DOLLAR_PLACEHOLDERS/, "binding layer should support future dollar placeholders");
  assert.match(parameterBindingSource, /QUESTION_PLACEHOLDERS/, "binding layer should support SQLite positional placeholders");
  assert.match(sqliteAdapterSource, /prepareDatabaseBindings/, "SQLite adapter should use the shared binding layer");
  assert.match(sqliteAdapterSource, /placeholderStyle: QUESTION_PLACEHOLDERS/, "SQLite adapter should use the same layer with SQLite positional placeholders");
  assert.match(sqliteAdapterSource, /bindingLayer:\s*"named-to-positional"/, "SQLite capabilities should expose the binding layer");
  assert.match(sqliteAdapterSource, /driverParameterStyle:\s*"positional"/, "SQLite capabilities should expose driver positional binding");

  assertBindingTranslation();
  assertArrayBindingTranslation();
  assertBulkValuesBindingTranslation();
  await assertSqliteRuntimeBinding();
  await assertSqliteRuntimeArrayBinding();
  await assertSqliteRuntimeBulkValuesBinding();
  await assertSqliteSearchAdapterBulkValuesProof();
  await assertSearchTagProofConversion();

  assert.match(sqliteSearchAdapterSource, /createBulkValuesBindings/, "SQLite search adapter should use the bulk VALUES helper for canonical upserts");
  assert.doesNotMatch(sqliteSearchAdapterSource, /VALUES \(\$\{values\.join\(", "\)\}\)/, "SQLite search adapter should not build canonical VALUES rows by joining literal values");
  assert.doesNotMatch(tagTextSource, /\bsqlText\b|\bquerySql\b/, "search tag-text proof conversion should not use interpolation helpers");
  assert.match(tagTextSource, /db\.query\(`[\s\S]*:workspaceId[\s\S]*:targetType[\s\S]*:targetId/, "search tag-text proof conversion should use named params");
  assert.match(databaseDocs, /As of version 0\.33\.5\.23\.2[\s\S]*named-to-positional binding layer/, "database docs should describe the binding layer");
  assert.match(databaseDocs, /As of version 0\.33\.5\.26\.1[\s\S]*array-valued named parameters/, "database docs should describe array-valued named params");
  assert.match(databaseDocs, /As of version 0\.33\.5\.26\.2[\s\S]*`createBulkValuesBindings\(\)`/, "database docs should describe the bulk VALUES helper");
  assert.match(databaseDocs, /As of version 0\.33\.5\.28\.1[\s\S]*safe placeholder budget of 32,766[\s\S]*`search_index` upsert remains safe because current rebuild indexing calls one document per statement/, "database docs should describe the bulk VALUES placeholder ceiling guard");
  assert.match(databaseDocs, /As of version 0\.33\.5\.28\.2[\s\S]*variable-length `NOT IN \(:ids\)` filters[\s\S]*empty-list guardrail[\s\S]*No current runtime query uses `NOT IN \(:boundArray\)`/, "database docs should describe the empty-list NOT IN guardrail");
  assert.match(databaseDocs, /Do not mechanically convert variable-length exclusion filters to `NOT IN \(:ids\)` without an explicit empty-array branch/, "database query style should warn future authors about NOT IN empty-list semantics");
  assert.match(databaseDocs, /`src\/db\/parameter-bindings\.js`/, "database docs should name the shared binding layer module");
  assert.match(databaseDocs, /sqlText[\s\S]*deprecated compatibility escape hatches/, "database docs should record the SQL literal helper migration path");
  assert.match(auditDocs, /0\.33\.5\.23\.2 Proof Conversion/, "audit docs should record the proof conversion");
  assert.match(auditDocs, /0\.33\.5\.26\.1 Array-Expansion Binding/, "audit docs should record the array-expansion helper");
  assert.match(auditDocs, /0\.33\.5\.26\.2 Bulk VALUES Binding/, "audit docs should record the bulk VALUES helper");
  assert.match(auditDocs, /0\.33\.5\.28\.1 Bulk VALUES Placeholder Ceiling Guard[\s\S]*32,766 placeholders[\s\S]*callers must split larger writes before calling `createBulkValuesBindings\(\)`/, "audit docs should record the bulk VALUES placeholder ceiling guard");
  assert.match(auditDocs, /0\.33\.5\.28\.2 Empty-List NOT IN Guardrail[\s\S]*documentation-only guardrail[\s\S]*empty exclusion set should normally preserve all rows/, "audit docs should record the empty-list NOT IN guardrail");
  assert.match(auditDocs, /Remaining runtime literal-helper invocations after the proof conversion: 1,677/, "audit docs should record the post-proof helper burndown");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "parameter-binding layer database should pass integrity check");

  console.log("Parameter-binding layer regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertBindingTranslation() {
  const hostileValue = "quoted ' value; DROP TABLE tags; -- :ignored ?";
  const sql = `
SELECT :value AS first_value,
  :value AS repeated_value,
  @other AS other_value,
  ':literal :value ?' AS literal_value,
  "quoted :value ?" AS quoted_identifier
-- :comment ? should stay comment text
/* @comment ? should stay block comment */
WHERE cast_probe::text = :castProbe;
`;

  const dollar = prepareDatabaseBindings(sql, {
    castProbe: "cast-value",
    other: 7,
    value: hostileValue,
  }, {
    placeholderStyle: DOLLAR_PLACEHOLDERS,
  });
  assert.match(dollar.sql, /SELECT \$1 AS first_value,[\s\S]*\$1 AS repeated_value,[\s\S]*\$2 AS other_value/, "dollar translation should reuse named params by name");
  assert.match(dollar.sql, /':literal :value \?'/, "dollar translation should not rewrite string literals");
  assert.match(dollar.sql, /-- :comment \? should stay comment text/, "dollar translation should not rewrite line comments");
  assert.match(dollar.sql, /\/\* @comment \? should stay block comment \*\//, "dollar translation should not rewrite block comments");
  assert.match(dollar.sql, /cast_probe::text = \$3/, "dollar translation should ignore PostgreSQL casts while rewriting named params");
  assert.deepEqual(dollar.params, [hostileValue, 7, "cast-value"], "dollar translation should order distinct names by first use");

  const question = prepareDatabaseBindings(sql, {
    castProbe: "cast-value",
    other: 7,
    value: hostileValue,
  }, {
    placeholderStyle: QUESTION_PLACEHOLDERS,
  });
  assert.match(question.sql, /SELECT \? AS first_value,[\s\S]*\? AS repeated_value,[\s\S]*\? AS other_value/, "question translation should rewrite named params to SQLite positional placeholders");
  assert.deepEqual(question.params, [hostileValue, hostileValue, 7, "cast-value"], "question translation should duplicate repeated named values for positional binding");

  const positionalDollar = prepareDatabaseBindings("SELECT ? AS first_value, ?2 AS second_value;", ["first", "second"], {
    placeholderStyle: DOLLAR_PLACEHOLDERS,
  });
  assert.equal(positionalDollar.sql, "SELECT $1 AS first_value, $2 AS second_value;");
  assert.deepEqual(positionalDollar.params, ["first", "second"]);
}

function assertArrayBindingTranslation() {
  const sql = `
SELECT record_id
FROM binding_layer_records
WHERE record_id IN (:ids)
  OR parent_id IN (:ids)
  OR workspace_id = :workspaceId
  OR record_id IN (:emptyIds);
`;

  const dollar = prepareDatabaseBindings(sql, {
    emptyIds: [],
    ids: ["record-1", "record-2"],
    workspaceId: "workspace-1",
  }, {
    placeholderStyle: DOLLAR_PLACEHOLDERS,
  });
  assert.match(dollar.sql, /record_id IN \(\$1, \$2\)[\s\S]*parent_id IN \(\$1, \$2\)/, "dollar translation should reuse one named array sequence by name");
  assert.match(dollar.sql, /workspace_id = \$3/, "dollar translation should continue numbering after array values");
  assert.match(dollar.sql, /record_id IN \(NULL\)/, "empty named arrays should expand to a SQL-safe NULL list");
  assert.deepEqual(dollar.params, ["record-1", "record-2", "workspace-1"], "dollar array params should be flattened once per distinct name");

  const question = prepareDatabaseBindings(sql, {
    emptyIds: [],
    ids: ["record-1", "record-2"],
    workspaceId: "workspace-1",
  }, {
    placeholderStyle: QUESTION_PLACEHOLDERS,
  });
  assert.match(question.sql, /record_id IN \(\?, \?\)[\s\S]*parent_id IN \(\?, \?\)/, "question translation should expand arrays into SQLite placeholders");
  assert.match(question.sql, /record_id IN \(NULL\)/, "empty SQLite arrays should expand to a SQL-safe NULL list");
  assert.deepEqual(
    question.params,
    ["record-1", "record-2", "record-1", "record-2", "workspace-1"],
    "SQLite positional binding should duplicate reused named array values per occurrence",
  );

  const single = prepareDatabaseBindings("SELECT id FROM records WHERE id IN (:ids);", {
    ids: ["record-1"],
  }, {
    placeholderStyle: QUESTION_PLACEHOLDERS,
  });
  assert.equal(single.sql, "SELECT id FROM records WHERE id IN (?);");
  assert.deepEqual(single.params, ["record-1"], "single-element arrays should use one placeholder");

  const emptyOnly = prepareDatabaseBindings("SELECT id FROM records WHERE id IN (:ids);", {
    ids: [],
  }, {
    placeholderStyle: DOLLAR_PLACEHOLDERS,
  });
  assert.equal(emptyOnly.sql, "SELECT id FROM records WHERE id IN (NULL);");
  assert.deepEqual(emptyOnly.params, [], "empty arrays should not add driver params");

  assert.throws(
    () => prepareDatabaseBindings("SELECT ? AS nested_value;", /** @type {never} */ ([["nested"]])),
    /Database query parameters must be strings, numbers, booleans, buffers, dates, null, or undefined/,
    "top-level positional params should not treat nested arrays as expansion lists",
  );
}

function assertBulkValuesBindingTranslation() {
  const rows = [
    {
      id: "bulk-1",
      label: "Alpha ' value; DROP TABLE binding_layer_bulk_records; --",
      optionalNote: "",
    },
    {
      id: "bulk-2",
      label: "Beta",
      optionalNote: "kept",
    },
  ];
  const bulkValues = createBulkValuesBindings(rows, ["id", "label", "optionalNote"], {
    paramPrefix: "bulkProbe",
    /** @param {Record<string, unknown>} row @param {string} columnName @returns {import("../src/types/database-contracts.js").DatabaseParameterInput} */
    valueForColumn(row, columnName) {
      if (columnName === "optionalNote" && !row.optionalNote) {
        return null;
      }

      return /** @type {import("../src/types/database-contracts.js").DatabaseParameterInput} */ (/** @type {Record<string, unknown>} */ (row)[columnName]);
    },
  });
  const sql = `
INSERT INTO binding_layer_bulk_records (id, label, optional_note)
VALUES ${bulkValues.sql};
`;
  const dollar = prepareDatabaseBindings(sql, bulkValues.params, {
    placeholderStyle: DOLLAR_PLACEHOLDERS,
  });
  const question = prepareDatabaseBindings(sql, bulkValues.params, {
    placeholderStyle: QUESTION_PLACEHOLDERS,
  });

  assert.equal(
    bulkValues.sql,
    "(:bulkProbe_0_0, :bulkProbe_0_1, :bulkProbe_0_2),\n(:bulkProbe_1_0, :bulkProbe_1_1, :bulkProbe_1_2)",
    "bulk VALUES helper should build stable row placeholder groups",
  );
  assert.deepEqual(bulkValues.params, {
    bulkProbe_0_0: "bulk-1",
    bulkProbe_0_1: "Alpha ' value; DROP TABLE binding_layer_bulk_records; --",
    bulkProbe_0_2: null,
    bulkProbe_1_0: "bulk-2",
    bulkProbe_1_1: "Beta",
    bulkProbe_1_2: "kept",
  }, "bulk VALUES helper should return scalar params for every row/column intersection");
  assert.match(dollar.sql, /VALUES \(\$1, \$2, \$3\),\n\(\$4, \$5, \$6\);/, "bulk VALUES helper should translate to dollar placeholders");
  assert.deepEqual(dollar.params, [
    "bulk-1",
    "Alpha ' value; DROP TABLE binding_layer_bulk_records; --",
    null,
    "bulk-2",
    "Beta",
    "kept",
  ]);
  assert.match(question.sql, /VALUES \(\?, \?, \?\),\n\(\?, \?, \?\);/, "bulk VALUES helper should translate to SQLite placeholders");
  assert.deepEqual(question.params, dollar.params);

  assert.throws(
    () => createBulkValuesBindings([], ["id"]),
    /Bulk VALUES binding requires at least one row/,
    "bulk VALUES helper should require explicit rows",
  );
  assert.throws(
    () => createBulkValuesBindings([{ id: "bulk-1" }], []),
    /Bulk VALUES binding requires at least one column/,
    "bulk VALUES helper should require explicit columns",
  );
  assert.throws(
    () => createBulkValuesBindings([{ id: ["nested"] }], ["id"]),
    /Database query parameters must be strings, numbers, booleans, buffers, dates, null, or undefined/,
    "bulk VALUES helper should reject nested cell arrays instead of treating them as list expansion",
  );
  assert.throws(
    () => createBulkValuesBindings([{ id: "bulk-1" }], ["id"], { paramPrefix: "bulk-value" }),
    /Invalid database query parameter name: bulk-value/,
    "bulk VALUES helper should keep generated parameter names valid",
  );
  assert.throws(
    () => createBulkValuesBindings(
      Array.from({ length: 32767 }, (_, index) => ({ id: `bulk-too-large-${index}` })),
      ["id"],
      { paramPrefix: "bulkTooLarge" },
    ),
    /Bulk VALUES binding would create 32767 parameters[\s\S]*safe placeholder budget of 32766[\s\S]*Split the write into smaller batches/,
    "bulk VALUES helper should reject row groups that exceed the SQLite-safe placeholder budget",
  );
}

async function assertSqliteRuntimeBinding() {
  const hostileValue = "quoted ' value; DROP TABLE sqlite_master; -- :value ?";
  const timestamp = new Date("2026-07-04T12:03:04.005Z");
  const row = await db.get(`
SELECT
  :hostileValue AS hostile_value,
  :hostileValue AS repeated_value,
  :trueValue AS true_value,
  :timestampValue AS timestamp_value,
  :undefinedValue AS undefined_value;
`, {
    hostileValue,
    timestampValue: timestamp,
    trueValue: true,
    undefinedValue: undefined,
  });

  assert.deepEqual(row, {
    hostile_value: hostileValue,
    repeated_value: hostileValue,
    timestamp_value: timestamp.toISOString(),
    true_value: 1,
    undefined_value: null,
  }, "SQLite adapter should execute translated named params without interpreting SQL-like text");

  const positionalRow = await db.get("SELECT ? AS first_value, ?2 AS second_value;", ["first", "second"]);
  assert.deepEqual(positionalRow, {
    first_value: "first",
    second_value: "second",
  }, "SQLite adapter should preserve positional array compatibility through the binding layer");

  await db.run(`
CREATE TABLE binding_layer_multi_statement (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
INSERT INTO binding_layer_multi_statement (id, label)
VALUES ('literal-path', 'multi statement compatibility');
`);
  const compatibilityRow = requireRow(await db.get("SELECT label FROM binding_layer_multi_statement WHERE id = :id;", {
    id: "literal-path",
  }), "compatibilityRow");
  assert.equal(compatibilityRow.label, "multi statement compatibility", "no-parameter multi-statement compatibility SQL should still execute");

  await assert.rejects(
    () => db.get("SELECT :missingValue AS value;", {}),
    /Missing database query parameter: :missingValue/,
    "missing named parameters should fail clearly",
  );
  await assert.rejects(
    () => db.get("SELECT :value AS value;", { extra: "unused", value: "present" }),
    /Unknown database query parameter: extra/,
    "unknown named parameters should fail clearly",
  );
  await assert.rejects(
    () => db.get("SELECT :value AS value;", { "invalid-name": "bad", value: "present" }),
    /Invalid database query parameter name: invalid-name/,
    "invalid named parameter keys should fail clearly",
  );
  await assert.rejects(
    () => db.get("SELECT :value AS value, ? AS other_value;", { value: "mixed" }),
    /Database statements cannot mix named and positional parameters/,
    "mixed named and positional parameters should fail before execution",
  );
  await assert.rejects(
    () => db.run(`
CREATE TABLE binding_layer_parameterized_multi (
  id TEXT PRIMARY KEY
);
INSERT INTO binding_layer_parameterized_multi (id)
VALUES (:id);
`, { id: "blocked" }),
    /Parameterized SQLite statements must be single statements/,
    "parameterized multi-statement SQL should stay blocked",
  );
}

async function assertSqliteRuntimeArrayBinding() {
  await db.run(`
CREATE TABLE binding_layer_array_records (
  record_id TEXT PRIMARY KEY,
  parent_id TEXT,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL
);
INSERT INTO binding_layer_array_records (record_id, parent_id, workspace_id, label)
VALUES
  ('record-1', NULL, 'workspace-1', 'Alpha'),
  ('record-2', 'record-1', 'workspace-1', 'Beta'),
  ('record-3', 'record-9', 'workspace-1', 'Gamma'),
  ('record-4', 'record-2', 'workspace-2', 'Delta');
`);

  const multiRows = await db.query(`
SELECT record_id
FROM binding_layer_array_records
WHERE workspace_id = :workspaceId
  AND record_id IN (:ids)
ORDER BY record_id;
`, {
    ids: ["record-1", "record-3"],
    workspaceId: "workspace-1",
  });
  assert.deepEqual(
    multiRows.map((row) => row.record_id),
    ["record-1", "record-3"],
    "SQLite runtime should bind multi-element named arrays in IN lists",
  );

  const singleRows = await db.query(`
SELECT record_id
FROM binding_layer_array_records
WHERE record_id IN (:ids);
`, {
    ids: ["record-2"],
  });
  assert.deepEqual(
    singleRows.map((row) => row.record_id),
    ["record-2"],
    "SQLite runtime should bind single-element named arrays",
  );

  const reusedRows = await db.query(`
SELECT record_id
FROM binding_layer_array_records
WHERE workspace_id = :workspaceId
  AND (
    record_id IN (:ids)
    OR parent_id IN (:ids)
  )
ORDER BY record_id;
`, {
    ids: ["record-1"],
    workspaceId: "workspace-1",
  });
  assert.deepEqual(
    reusedRows.map((row) => row.record_id),
    ["record-1", "record-2"],
    "SQLite runtime should duplicate reused named arrays for positional driver binding",
  );

  const emptyRows = await db.query(`
SELECT record_id
FROM binding_layer_array_records
WHERE record_id IN (:ids);
`, {
    ids: [],
  });
  assert.deepEqual(emptyRows, [], "empty named arrays should execute as an empty result set for IN lists");
}

async function assertSqliteRuntimeBulkValuesBinding() {
  await db.run(`
CREATE TABLE binding_layer_bulk_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL,
  optional_note TEXT,
  created_at TEXT NOT NULL
);
`);
  const createdAt = new Date("2026-07-05T15:00:00.000Z");
  const bulkValues = createBulkValuesBindings([
    {
      createdAt,
      id: "bulk-runtime-1",
      label: "Runtime ' bulk; DROP TABLE binding_layer_bulk_records; --",
      optionalNote: "",
      workspaceId: "workspace-bulk",
    },
    {
      createdAt,
      id: "bulk-runtime-2",
      label: "Runtime bulk two",
      optionalNote: "kept",
      workspaceId: "workspace-bulk",
    },
  ], ["id", "workspaceId", "label", "optionalNote", "createdAt"], {
    paramPrefix: "bulkRuntime",
    /** @param {Record<string, unknown>} row @param {string} columnName @returns {import("../src/types/database-contracts.js").DatabaseParameterInput} */
    valueForColumn(row, columnName) {
      if (columnName === "optionalNote" && !row.optionalNote) {
        return null;
      }

      return /** @type {import("../src/types/database-contracts.js").DatabaseParameterInput} */ (/** @type {Record<string, unknown>} */ (row)[columnName]);
    },
  });

  await db.run(`
INSERT INTO binding_layer_bulk_records (id, workspace_id, label, optional_note, created_at)
VALUES ${bulkValues.sql};
`, bulkValues.params);

  const rows = await db.query(`
SELECT id, label, optional_note, created_at
FROM binding_layer_bulk_records
WHERE workspace_id = :workspaceId
ORDER BY id;
`, {
    workspaceId: "workspace-bulk",
  });

  assert.deepEqual(rows, [
    {
      created_at: createdAt.toISOString(),
      id: "bulk-runtime-1",
      label: "Runtime ' bulk; DROP TABLE binding_layer_bulk_records; --",
      optional_note: null,
    },
    {
      created_at: createdAt.toISOString(),
      id: "bulk-runtime-2",
      label: "Runtime bulk two",
      optional_note: "kept",
    },
  ], "SQLite runtime should execute bound bulk VALUES row groups without interpreting SQL-like text");
}

async function assertSqliteSearchAdapterBulkValuesProof() {
  clearSqliteSearchAdapterCapabilityCacheForTests();
  await db.run(`
CREATE TABLE search_index (
  search_index_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags_text TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  project_id TEXT,
  library_bucket TEXT,
  note_collection_id TEXT,
  collection_path TEXT,
  visibility TEXT NOT NULL DEFAULT 'normal',
  record_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT '',
  record_created_at TEXT,
  record_updated_at TEXT,
  indexed_at TEXT NOT NULL,
  UNIQUE (workspace_id, module_id, record_type, record_id)
);
`);
  const adapter = createSqliteSearchAdapter({ refresh: true });
  const documents = [
    {
      body: "Body with SQL-like text; DELETE FROM search_index; --",
      client_id: "",
      collection_path: "",
      indexed_at: "2026-07-05T15:10:00.000Z",
      library_bucket: "",
      module_id: "developer-example",
      note_collection_id: undefined,
      project_id: null,
      record_created_at: "",
      record_id: "bulk-record-1",
      record_status: "active",
      record_type: "example_record",
      record_updated_at: "2026-07-05T15:09:00.000Z",
      search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-1",
      source: "regression",
      summary: "Summary one",
      tags_text: "alpha",
      title: "Bulk ' canonical one",
      visibility: "normal",
      workspace_id: "workspace-search-bulk",
    },
    {
      body: "Second body",
      client_id: "client-1",
      collection_path: "Collection / Path",
      indexed_at: "2026-07-05T15:11:00.000Z",
      library_bucket: "reference",
      module_id: "developer-example",
      note_collection_id: "collection-1",
      project_id: "project-1",
      record_created_at: "2026-07-05T15:08:00.000Z",
      record_id: "bulk-record-2",
      record_status: "archived",
      record_type: "example_record",
      record_updated_at: "2026-07-05T15:10:00.000Z",
      search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-2",
      source: "regression",
      summary: "Summary two",
      tags_text: "beta",
      title: "Bulk canonical two",
      visibility: "normal",
      workspace_id: "workspace-search-bulk",
    },
  ];
  const result = await adapter.upsertDocuments(documents, { refresh: true });

  assert.equal(result.indexedCount, 2, "SQLite search adapter should bulk-upsert canonical rows");
  assert.equal(result.ftsSyncedCount, result.storage.ftsTableReady ? 2 : 0);

  const rows = await db.query(`
SELECT
  search_index_id,
  record_id,
  title,
  body,
  client_id,
  project_id,
  library_bucket,
  note_collection_id,
  collection_path,
  record_created_at,
  record_updated_at
FROM search_index
WHERE workspace_id = :workspaceId
ORDER BY record_id;
`, {
    workspaceId: "workspace-search-bulk",
  });

  assert.deepEqual(rows, [
    {
      body: "Body with SQL-like text; DELETE FROM search_index; --",
      client_id: null,
      collection_path: null,
      library_bucket: null,
      note_collection_id: null,
      project_id: null,
      record_created_at: null,
      record_id: "bulk-record-1",
      record_updated_at: "2026-07-05T15:09:00.000Z",
      search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-1",
      title: "Bulk ' canonical one",
    },
    {
      body: "Second body",
      client_id: "client-1",
      collection_path: "Collection / Path",
      library_bucket: "reference",
      note_collection_id: "collection-1",
      project_id: "project-1",
      record_created_at: "2026-07-05T15:08:00.000Z",
      record_id: "bulk-record-2",
      record_updated_at: "2026-07-05T15:10:00.000Z",
      search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-2",
      title: "Bulk canonical two",
    },
  ], "SQLite search adapter should preserve bulk-bound canonical search metadata");

  const updated = await adapter.upsertDocuments([{
    ...documents[0],
    body: "Updated body",
    indexed_at: "2026-07-05T15:12:00.000Z",
    title: "Updated bulk canonical one",
  }], { refresh: true });
  const updatedRows = await db.query(`
SELECT title, body, COUNT(*) OVER () AS row_count
FROM search_index
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id = :recordId;
`, {
    moduleId: "developer-example",
    recordId: "bulk-record-1",
    recordType: "example_record",
    workspaceId: "workspace-search-bulk",
  });

  assert.equal(updated.indexedCount, 1, "SQLite search adapter should upsert an existing canonical row");
  assert.deepEqual(updatedRows, [{
    body: "Updated body",
    row_count: 1,
    title: "Updated bulk canonical one",
  }], "canonical search bulk upsert should update the existing conflict target without duplicating rows");

  if (result.storage.ftsTableReady) {
    const ftsRows = await db.query(`
SELECT search_index_id, title
FROM search_index_fts
WHERE workspace_id = :workspaceId
ORDER BY record_id;
`, {
      workspaceId: "workspace-search-bulk",
    });

    assert.deepEqual(ftsRows, [
      {
        search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-1",
        title: "Updated bulk canonical one",
      },
      {
        search_index_id: "workspace-search-bulk:developer-example:example_record:bulk-record-2",
        title: "Bulk canonical two",
      },
    ], "SQLite FTS sync should remain compatible after the canonical bulk upsert");
  }

  clearSqliteSearchAdapterCapabilityCacheForTests();
}

async function assertSearchTagProofConversion() {
  const workspaceId = "workspace-' ; DROP TABLE tags; --";
  const targetType = "note";
  const targetId = "target-' ; DROP TABLE tag_assignments; --";

  await db.run(`
CREATE TABLE tags (
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE tag_assignments (
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL
);
`);
  await db.run(`
INSERT INTO tags (workspace_id, tag_id, name, slug, status)
VALUES
  (:workspaceId, 'tag-alpha', 'Alpha', 'alpha', 'active'),
  (:workspaceId, 'tag-beta', 'Beta', 'beta', 'active'),
  (:workspaceId, 'tag-archived', 'Archived', 'archived', 'archived');
`, { workspaceId });
  await db.run(`
INSERT INTO tag_assignments (workspace_id, tag_id, target_type, target_id)
VALUES
  (:workspaceId, 'tag-beta', :targetType, :targetId),
  (:workspaceId, 'tag-alpha', :targetType, :targetId),
  (:workspaceId, 'tag-archived', :targetType, :targetId),
  (:workspaceId, 'tag-alpha', :targetType, 'other-target');
`, {
    targetId,
    targetType,
    workspaceId,
  });

  assert.equal(
    await readSearchTagsText({ targetId, targetType, workspaceId }),
    "Alpha alpha Beta beta",
    "proof-converted tag text query should preserve active tag ordering and text output",
  );
  assert.equal(
    await readSearchTagsText({
      targetId: "missing'; DROP TABLE tags; --",
      targetType,
      workspaceId,
    }),
    "",
    "SQL-like missing target IDs should not broaden tag reads",
  );

  const tagCount = requireRow(await db.get("SELECT COUNT(1) AS count FROM tags;"), "tagCount");
  assert.equal(Number(tagCount.count), 3, "tag tables should survive SQL-like bound proof values");
}
