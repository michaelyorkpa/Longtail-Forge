export const regressionMeta = Object.freeze({
  id: "database.migration-runner-checked-boundary",
  area: "database",
  tier: "release-gate",
  tags: ["checksums", "contracts", "database", "migrations", "transactions", "typecheck"],
  description: "Proves the checked migration runner keeps explicit source, row, checksum, ordering, locking, transaction, rollback, and foreign-key contracts.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const migrationSource = await fs.readFile("src/db/migrations.js", "utf8");
const seamInventory = JSON.parse(await fs.readFile("scripts/typecheck-seam-inventory.json", "utf8"));

assert.match(migrationSource, /^\/\/ @ts-check/);
assert.ok(seamInventory.checkedFiles.includes("src/db/migrations.js"));
assert.ok(seamInventory.minimumOptedInFiles >= 149);
assert.doesNotMatch(migrationSource, /@ts-(?:ignore|expect-error)|\bany\b|as unknown as/);

for (const contractName of [
  "DatabaseRow",
  "MigrationSource",
  "MigrationFile",
  "ForeignKeyRepair",
  "AppliedMigration",
  "RollbackAnnotatedFailure",
]) {
  assert.match(migrationSource, new RegExp(`@typedef \\{[^\\n]*\\} ${contractName}`), `${contractName} must remain explicit`);
}

assert.match(migrationSource, /return withMigrationLock|await withMigrationLock\(runMigrationsWithAcquiredLock\)/);
assert.match(migrationSource, /migrationGroups[\s\S]*?\.flat\(\)[\s\S]*?\.sort\(\(left, right\) => left\.version\.localeCompare\(right\.version\) \|\| left\.moduleId\.localeCompare\(right\.moduleId\)\)/);
assert.match(migrationSource, /\.filter\(\(entry\) => entry\.isFile\(\) && entry\.name\.endsWith\("\.sql"\)\)[\s\S]*?\.sort\(\)/);
assert.match(migrationSource, /validateBaselineChecksum\(\);[\s\S]*?readMigrationFiles\(\);[\s\S]*?backfillMissingChecksums\(migrations\);[\s\S]*?validateAppliedMigrationChecksums\(migrations\);[\s\S]*?readAppliedVersions\(\)/);

assert.match(migrationSource, /normalizeMigrationSqlForChecksum\(sql\)[\s\S]*?replace\(\/\\r\\n\?\/g, "\\n"\)/);
assert.match(migrationSource, /createCompatibleMigrationChecksums[\s\S]*?normalizedSql\.replace\(\/\\n\/g, "\\r\\n"\)/);
assert.match(migrationSource, /compatibleChecksums\.has\(appliedMigration\.checksum\)/);

assert.match(migrationSource, /runMigrationScriptTransaction[\s\S]*?BEGIN TRANSACTION;[\s\S]*?await callback\(\);[\s\S]*?COMMIT;[\s\S]*?ROLLBACK;/);
assert.match(migrationSource, /isRollbackAnnotatedFailure\(error\)[\s\S]*?error\.rollbackError = rollbackError/);
assert.match(migrationSource, /migration-foreign-keys: off[\s\S]*?PRAGMA foreign_keys = OFF;[\s\S]*?PRAGMA foreign_key_check;[\s\S]*?PRAGMA foreign_keys = ON;/);
assert.match(migrationSource, /RECORD_MIGRATION_SQL[\s\S]*?checksum: migration\.checksum[\s\S]*?moduleId: migration\.moduleId[\s\S]*?version: migration\.version/);
assert.match(migrationSource, /readAppliedMigrations[\s\S]*?version: readTextColumn\(row, "version"\)[\s\S]*?checksum: readTextColumn\(row, "checksum"\)/);

console.log("Migration runner checked-boundary regression passed.");
