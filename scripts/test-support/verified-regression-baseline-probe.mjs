import { createHash } from "node:crypto";
import { closeSqlite, initializeDatabase, querySql } from "../../src/db/index.js";
import { readVerifiedRegressionBaselineDecision } from "../../src/db/regression-baseline-fast-path.js";

try {
  await initializeDatabase();
  const integrityRows = await querySql("PRAGMA integrity_check;");
  const foreignKeyViolations = await querySql("PRAGMA foreign_key_check;");
  const foreignKeys = await querySql("PRAGMA foreign_keys;");
  const migrationRows = await querySql(`
SELECT version, module_id, checksum
FROM schema_migrations
ORDER BY version, module_id;
`);
  console.log(`VERIFIED_BASELINE_PROBE=${JSON.stringify({
    decision: readVerifiedRegressionBaselineDecision(),
    foreignKeyViolations: foreignKeyViolations.length,
    foreignKeys: Number(foreignKeys[0]?.foreign_keys),
    integrity: integrityRows[0]?.integrity_check,
    migrationCount: migrationRows.length,
    migrationIdentitySha256: createHash("sha256").update(JSON.stringify(migrationRows)).digest("hex"),
  })}`);
} finally {
  await closeSqlite();
}
