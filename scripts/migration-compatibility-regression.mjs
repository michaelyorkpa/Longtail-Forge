import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.6a";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-migration-compatibility-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-migration-compatibility.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Migration-Compatibility-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const migrationsSource = readText("src/db/migrations.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertMigrationRows();

  await initializeDatabase();
  await assertMigrationRows();
  await assertIntegrity();

  console.log("Migration compatibility regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the migration compatibility version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the migration compatibility version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the migration compatibility version");

  assertNoLiteralHelperCalls("db/migrations migration compatibility", migrationsSource);
  assert.doesNotMatch(migrationsSource, /\bsqlText\b|\bsqlInteger\b|\bsqlNullableText\b|\bsqlNullableInteger\b/, "migration compatibility should not import or call literal SQL helpers");
  assert.doesNotMatch(migrationsSource, /db\.transaction|\.transaction\(/, "migration startup should not use callback transactions for embedded migration scripts");
  assert.match(migrationsSource, /RECORD_MIGRATION_SQL[\s\S]*databaseDialect\.conflict\.buildInsertOrIgnore/, "schema_migrations record inserts should use the conflict seam");
  assert.match(migrationsSource, /async function recordMigrationApplied\(migration\)[\s\S]*await runSql\(RECORD_MIGRATION_SQL,\s*\{[\s\S]*version: migration\.version/, "schema_migrations record values should be bound params");
  assert.match(migrationsSource, /async function runMigrationScriptTransaction\(callback\)[\s\S]*await runSql\("BEGIN TRANSACTION;"\)[\s\S]*await runSql\("COMMIT;"\)[\s\S]*await runSql\("ROLLBACK;"\)/, "migration scripts should keep explicit BEGIN/COMMIT/ROLLBACK ownership without interpolated values");
  assert.match(migrationsSource, /databaseDialect\.introspection\.tableInfo\(repair\.tableName\)/, "legacy repair table metadata should use the introspection seam");
  assert.match(migrationsSource, /databaseDialect\.introspection\.tableInfo\(tableName\)/, "column checks should use the introspection seam");
  assert.match(migrationsSource, /name IN \(:requiredTables\);[\s\S]*\{ requiredTables \}/, "baseline adoption table probes should bind required table lists");
  assert.match(migrationsSource, /WHERE version = :version[\s\S]*\{ version: BASELINE_VERSION \}/, "baseline marker and checksum reads should bind the baseline version");
  assert.match(migrationsSource, /WHERE version != :baselineVersion[\s\S]*\{ baselineVersion: BASELINE_VERSION \}/, "baseline adoption history reads should bind the baseline version");
  assert.match(migrationsSource, /PRAGMA foreign_keys = OFF;[\s\S]*INSERT OR IGNORE INTO user_workspaces[\s\S]*PRAGMA foreign_keys = ON;/, "legacy FK repair scripts should remain migration-owned compatibility SQL");
  assert.match(migrationsSource, /await runSql\(baseline\.sql\)/, "fresh-start schema scripts should remain migration-owned compatibility SQL");
  assert.match(migrationsSource, /await runSql\(migration\.sql\)/, "future migration SQL files should remain migration-owned compatibility SQL");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.6a:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the current ratchet after interpolation enforcement");
  assert.match(auditDocs, /\| db\/migrations \| Migration compatibility \| 0 \| 0 \| 10 \| 28 \|[\s\S]*\| db\/index \| Startup compatibility \| 0 \| 0 \| 31 \| 40 \|/, "audit inventory should mark migrations as compatibility-tracked with values converted");
  assert.match(auditDocs, /0\.33\.5\.27\.30 Migration Compatibility Path[\s\S]*`src\/db\/migrations\.js` no longer has literal-helper calls or direct interpolated operation sites[\s\S]*0 runtime literal-helper invocations[\s\S]*385 existing bound operation sites/, "audit docs should record the migration compatibility slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.30[\s\S]*`src\/db\/migrations\.js` has no remaining literal-helper calls or direct interpolated operation sites[\s\S]*current baseline SQL[\s\S]*future migration SQL files remain migration-owned compatibility SQL[\s\S]*385 existing bound operation sites/, "database docs should record the migration compatibility outcome");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.30 - Migration compatibility path[\s\S]*- \[x\] Review `src\/db\/migrations\.js`[\s\S]*- \[x\] Convert paths that can safely move[\s\S]*- \[x\] Account for dialect-sensitive migration statements[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.30 - [\s\S]*Migration compatibility path[\s\S]*0 helper invocations[\s\S]*0 direct interpolated operation sites[\s\S]*385 bound operation sites/, "changelog should record the migration compatibility burndown");
  assert.match(regressionSuite, /scripts\/migration-compatibility-regression\.mjs/, "regression suite should include the migration compatibility proof");
}

async function assertMigrationRows() {
  const rows = await db.query(`
SELECT version, module_id, name, checksum
FROM schema_migrations
ORDER BY version;
`);
  const versions = rows.map((row) => row.version);
  assert.deepEqual(versions, [
    "0.33.5.18.6.5.4",
    "065",
    "066",
    "067",
  ], "fresh database should record the consolidated baseline and active core migrations");

  for (const row of rows) {
    assert.equal(row.module_id, "core", `migration ${row.version} should be recorded as a core migration`);
    assert.ok(row.name, `migration ${row.version} should record a migration name`);
    assert.match(row.checksum, /^[0-9a-f]{64}$/i, `migration ${row.version} should record a checksum`);
  }
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row.integrity_check, "ok", "migration compatibility disposable database should pass integrity_check");
}

function assertNoLiteralHelperCalls(label, source) {
  const helperCallPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
  const helperCalls = [...source.matchAll(helperCallPattern)]
    .filter((match) => !/function\s+$/.test(source.slice(Math.max(0, match.index - 16), match.index)))
    .map((match) => match[0]);
  assert.deepEqual(helperCalls, [], `${label} should not call literal SQL helpers`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
