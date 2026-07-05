import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.25.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-parameter-binding-layer-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-binding-layer.db");
process.env.SUPER_ADMIN_PASSWORD = "Parameter-Binding-Layer-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const parameterBindingSource = readText("src/db/parameter-bindings.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const tagTextSource = readText("src/core/search/tag-text.js");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
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

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the parameter-binding layer version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the parameter-binding layer version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the parameter-binding layer version");

  assert.match(parameterBindingSource, /function prepareDatabaseBindings/, "parameter binding layer should expose the shared translator");
  assert.match(parameterBindingSource, /DOLLAR_PLACEHOLDERS/, "binding layer should support future dollar placeholders");
  assert.match(parameterBindingSource, /QUESTION_PLACEHOLDERS/, "binding layer should support SQLite positional placeholders");
  assert.match(sqliteAdapterSource, /prepareDatabaseBindings/, "SQLite adapter should use the shared binding layer");
  assert.match(sqliteAdapterSource, /placeholderStyle: QUESTION_PLACEHOLDERS/, "SQLite adapter should use the same layer with SQLite positional placeholders");
  assert.match(sqliteAdapterSource, /bindingLayer:\s*"named-to-positional"/, "SQLite capabilities should expose the binding layer");
  assert.match(sqliteAdapterSource, /driverParameterStyle:\s*"positional"/, "SQLite capabilities should expose driver positional binding");

  assertBindingTranslation();
  await assertSqliteRuntimeBinding();
  await assertSearchTagProofConversion();

  assert.doesNotMatch(tagTextSource, /\bsqlText\b|\bquerySql\b/, "search tag-text proof conversion should not use interpolation helpers");
  assert.match(tagTextSource, /db\.query\(`[\s\S]*:workspaceId[\s\S]*:targetType[\s\S]*:targetId/, "search tag-text proof conversion should use named params");
  assert.match(databaseDocs, /As of version 0\.33\.5\.23\.2[\s\S]*named-to-positional binding layer/, "database docs should describe the binding layer");
  assert.match(databaseDocs, /`src\/db\/parameter-bindings\.js`/, "database docs should name the shared binding layer module");
  assert.match(databaseDocs, /sqlText[\s\S]*deprecated compatibility escape hatches/, "database docs should record the SQL literal helper migration path");
  assert.match(auditDocs, /0\.33\.5\.23\.2 Proof Conversion/, "audit docs should record the proof conversion");
  assert.match(auditDocs, /Remaining runtime literal-helper invocations after the proof conversion: 1,677/, "audit docs should record the post-proof helper burndown");
  assert.match(roadmap, /^## Version 0\.33\.5\.26 - Parameter-binding gap review/m, "live roadmap should continue past the closed parameter-binding, Node 24, and storage cleanup branches");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the binding-layer slice");
  assert.match(changelog, /## Version 0\.33\.5\.23\.2 - [\s\S]*named-to-positional parameter binding layer/, "changelog should retain the binding-layer slice");
  assert.match(regressionSuite, /scripts\/parameter-binding-layer-regression\.mjs/, "regression suite should include binding-layer coverage");

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
  const compatibilityRow = await db.get("SELECT label FROM binding_layer_multi_statement WHERE id = :id;", {
    id: "literal-path",
  });
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

  const tagCount = await db.get("SELECT COUNT(1) AS count FROM tags;");
  assert.equal(Number(tagCount.count), 3, "tag tables should survive SQL-like bound proof values");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
