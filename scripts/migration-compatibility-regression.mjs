import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-migration-compatibility-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-migration-compatibility.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Migration-Compatibility-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const migrationsSource = readText("src/db/migrations.js");
const projectAdminScopeMigration = readText("src/db/migrations/074_project_admin_project_scope.sql");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const previousRoleSeedBaselineChecksum = "1268626e1b685969642bcf1bf560e40fa59cf27618e958da4c0172f2a309882c";

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertMigrationRows();
  await installPreviousRoleSeedBaselineState();

  await initializeDatabase();
  await assertMigrationRows();
  await assertPreviousRoleSeedBaselineUpgraded();
  const compatibleLineEndingChecksums = await installCompatibleLineEndingChecksums();

  await initializeDatabase();
  await assertMigrationRows();
  await assertCompatibleLineEndingChecksumsPreserved(compatibleLineEndingChecksums);
  await assertIntegrity();

  console.log("Migration compatibility regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

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
  assert.match(migrationsSource, /normalizeMigrationSqlForChecksum[\s\S]*replace\(\/\\r\\n\?\/g, "\\n"\)/, "migration checksums should canonicalize Windows and Unix line endings");
  assert.match(migrationsSource, /createCompatibleMigrationChecksums[\s\S]*replace\(\/\\n\/g, "\\r\\n"\)/, "migration validation should accept previously recorded CRLF checksums");
  assert.match(migrationsSource, /LEGACY_ROLE_SEED_BASELINE_CHECKSUMS[\s\S]*1268626e1b685969642bcf1bf560e40fa59cf27618e958da4c0172f2a309882c[\s\S]*67ec76af2c94f84eff8b5c90191e652ec4a449177317547da95eb0c159ca5d2c/, "the baseline checksum contract should recognize both line-ending forms of the previous role seed");
  assert.match(migrationsSource, /readBaselineSchema[\s\S]*LEGACY_ROLE_SEED_BASELINE_CHECKSUMS[\s\S]*compatibleChecksums\.add/, "baseline validation should add only the reviewed pre-role-repair checksums to the compatibility set");
  assert.match(migrationsSource, /migration-foreign-keys: off[\s\S]*PRAGMA foreign_keys = OFF[\s\S]*PRAGMA foreign_key_check[\s\S]*PRAGMA foreign_keys = ON/, "parent-table rebuild migrations should disable SQLite foreign keys only outside their transaction and validate them before commit");
  assert.match(projectAdminScopeMigration, /INSERT INTO user_role_assignments[\s\S]*INNER JOIN projects[\s\S]*legacy\.role_id = 'project_admin'[\s\S]*legacy\.scope_type = 'client'/, "project administrator migration should expand legacy client scopes across their existing projects");
  assert.match(projectAdminScopeMigration, /DELETE FROM user_role_assignments[\s\S]*role_id = 'project_admin'[\s\S]*scope_type = 'client'/, "project administrator migration should retire the superseded client scopes");
  assert.match(projectAdminScopeMigration, /UPDATE roles[\s\S]*assignable_scope_type = 'project'[\s\S]*role_id = 'project_admin'/, "project administrator migration should publish the project-scope role contract");

  assert.match(auditDocs, /## Baseline-driven workflow[\s\S]*npm run audit:params:check[\s\S]*Do not update the baseline in unrelated feature work/, "audit docs should record the current baseline-driven parameter-binding ratchet");
  assert.match(auditDocs, /\| db\/migrations \| Migration compatibility \| 0 \| 0 \| 10 \| 28 \|[\s\S]*\| db\/index \| Startup compatibility \| 0 \| 0 \| 31 \| 40 \|/, "audit inventory should mark migrations as compatibility-tracked with values converted");
  assert.match(auditDocs, /0\.33\.5\.27\.30 Migration Compatibility Path[\s\S]*`src\/db\/migrations\.js` no longer has literal-helper calls or direct interpolated operation sites[\s\S]*0 runtime literal-helper invocations[\s\S]*385 existing bound operation sites/, "audit docs should record the migration compatibility slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.30[\s\S]*`src\/db\/migrations\.js` has no remaining literal-helper calls or direct interpolated operation sites[\s\S]*current baseline SQL[\s\S]*future migration SQL files remain migration-owned compatibility SQL[\s\S]*385 existing bound operation sites/, "database docs should record the migration compatibility outcome");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.30 - Migration compatibility path[\s\S]*- \[x\] Review `src\/db\/migrations\.js`[\s\S]*- \[x\] Convert paths that can safely move[\s\S]*- \[x\] Account for dialect-sensitive migration statements[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.30 - [\s\S]*Migration compatibility path[\s\S]*0 helper invocations[\s\S]*0 direct interpolated operation sites[\s\S]*385 bound operation sites/, "changelog should record the migration compatibility burndown");
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
    "068",
    "069",
    "070",
    "071",
    "072",
    "073",
    "074",
    "075",
    "076",
    "077",
    "078",
    "079",
    "080",
    "081",
    "082",
    "083",
    "084",
    "085",
    "086",
  ], "fresh database should record the consolidated baseline and active core migrations");

  const projectAdminRole = await db.get(`
SELECT assignable_scope_type
FROM roles
WHERE role_id = 'project_admin';
`);
  assert.equal(projectAdminRole.assignable_scope_type, "project", "fresh databases should publish Project Administrator as project-scoped");

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

async function installCompatibleLineEndingChecksums() {
  const fixtures = new Map([
    ["0.33.5.18.6.5.4", "src/db/schema/current.sql"],
    ["073", "src/db/migrations/073_user_landing_preferences.sql"],
  ]);
  const checksums = new Map();

  for (const [version, filePath] of fixtures) {
    const normalizedSql = readText(filePath).replace(/\r\n?/g, "\n");
    const checksum = createHash("sha256")
      .update(normalizedSql.replace(/\n/g, "\r\n"))
      .digest("hex");
    checksums.set(version, checksum);
    await db.run(`
UPDATE schema_migrations
SET checksum = :checksum
WHERE version = :version;
`, { checksum, version });
  }

  return checksums;
}

async function installPreviousRoleSeedBaselineState() {
  await db.run(`
UPDATE schema_migrations
SET checksum = :checksum
WHERE version = :baselineVersion;
`, {
    baselineVersion: "0.33.5.18.6.5.4",
    checksum: previousRoleSeedBaselineChecksum,
  });
  await db.run("DELETE FROM schema_migrations WHERE version = :version;", { version: "086" });
  await db.run(`
UPDATE roles
SET description = 'Controls projects and project assignments for one client.',
    assignable_scope_type = 'client'
WHERE role_id = 'project_admin';
`);
}

async function assertPreviousRoleSeedBaselineUpgraded() {
  const baseline = await db.get(`
SELECT checksum
FROM schema_migrations
WHERE version = :version;
`, { version: "0.33.5.18.6.5.4" });
  assert.equal(
    baseline.checksum,
    previousRoleSeedBaselineChecksum,
    "the recognized historical baseline checksum should remain preserved after the forward repair",
  );

  const role = await db.get(`
SELECT description, assignable_scope_type
FROM roles
WHERE role_id = 'project_admin';
`);
  assert.deepEqual(role, {
    assignable_scope_type: "project",
    description: "Controls one project and its project assignments.",
  }, "migration 086 should repair Project Administrator metadata after a prior-baseline install starts");
}

async function assertCompatibleLineEndingChecksumsPreserved(expectedChecksums) {
  for (const [version, checksum] of expectedChecksums) {
    const row = await db.get(`
SELECT checksum
FROM schema_migrations
WHERE version = :version;
`, { version });
    assert.equal(row.checksum, checksum, `migration ${version} should accept and preserve its compatible CRLF checksum`);
  }
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
