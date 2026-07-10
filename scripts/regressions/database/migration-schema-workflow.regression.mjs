export const regressionMeta = Object.freeze({
  id: "database.migration-schema-workflow",
  area: "database",
  tier: "release-gate",
  tags: ["database", "migrations", "release", "schema"],
  description: "Proves deterministic migration creation and generated final-schema drift detection without changing the SQLite runtime contract.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkGeneratedSchema,
  collectSchemaWorkflowGuardErrors,
  createMigrationFile,
  generateCurrentSchema,
  listMigrationFiles,
  planMigrationCreation,
  refreshGeneratedSchema,
} from "../../lib/migration-schema-workflow.mjs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const databaseDocs = readFileSync("docs/database.md", "utf8");
const tempRoots = [];

try {
  assert.equal(packageJson.scripts["db:migration:create"], "node scripts/create-migration.mjs");
  assert.equal(packageJson.scripts["db:schema:refresh"], "node scripts/schema-snapshot.mjs --refresh");
  assert.equal(packageJson.scripts["db:schema:check"], "node scripts/schema-snapshot.mjs --check");

  const liveMigrations = await listMigrationFiles();
  assert.deepEqual(liveMigrations.map((migration) => migration.version), ["065", "066", "067", "068", "069"]);
  assert.equal(planMigrationCreation("Add Widget Status", liveMigrations).fileName, "070_add_widget_status.sql");

  await assertMigrationCreation();
  await assertDuplicateVersionsFail();
  await assertSchemaRefreshAndDriftDetection();

  assert.deepEqual(
    collectSchemaWorkflowGuardErrors({ changedPaths: ["src/db/schema/current.sql"] }),
    [
      "src/db/schema/current.sql changed without a migration. Add a forward migration or rerun only explicitly allowed test/maintenance work with --allow-schema-without-migration.",
    ],
  );
  assert.deepEqual(
    collectSchemaWorkflowGuardErrors({
      allowSchemaWithoutMigration: true,
      changedPaths: ["src/db/schema/current.sql"],
    }),
    [],
  );
  assert.deepEqual(
    collectSchemaWorkflowGuardErrors({
      changedPaths: ["src/db/schema/current.sql", "src/db/migrations/070_example.sql"],
    }),
    [],
  );

  const liveSchema = await checkGeneratedSchema();
  assert.equal(liveSchema.matches, true, "checked-in generated schema should match the baseline plus all migrations");
  assert.match(liveSchema.sql, /CREATE TABLE jobs/);
  assert.match(liveSchema.sql, /CREATE TABLE task_recurrence_note_links/);

  for (const requiredPath of [
    "scripts/fresh-database-regression.mjs",
    "scripts/migration-compatibility-regression.mjs",
    "scripts/scale-seed-framework-regression.mjs",
    "scripts/sqlite-small-office-performance-regression.mjs",
  ]) {
    assert.ok(REGRESSION_ENTRIES.some((entry) => entry.path === requiredPath), `${requiredPath} should remain registered`);
  }

  assert.match(databaseDocs, /npm run db:migration:create -- <name>/);
  assert.match(databaseDocs, /npm run db:schema:refresh/);
  assert.match(databaseDocs, /npm run db:schema:check/);
  assert.match(databaseDocs, /manually maintained fresh-start baseline/);
  assert.match(databaseDocs, /current\.generated\.sql/);

  console.log("Migration creation and generated schema workflow passed.");
} finally {
  await Promise.all(tempRoots.map((tempRoot) => fs.rm(tempRoot, { recursive: true, force: true })));
}

async function assertMigrationCreation() {
  const root = await makeTempRoot();
  await write(root, "src/db/migrations/007_existing.sql", "CREATE TABLE existing (id TEXT PRIMARY KEY);\n");

  const first = await createMigrationFile("Add Widget Status", { root });
  assert.equal(first.relativePath, "src/db/migrations/008_add_widget_status.sql");
  assert.match(await fs.readFile(path.join(root, first.relativePath), "utf8"), /Migration 008: add_widget_status[\s\S]*Forward-only/);

  const second = await createMigrationFile("Create audit queue", { root });
  assert.equal(second.relativePath, "src/db/migrations/009_create_audit_queue.sql");
}

async function assertDuplicateVersionsFail() {
  const root = await makeTempRoot();
  await write(root, "src/db/migrations/009_core_change.sql", "SELECT 1;\n");
  await write(root, "src/modules/example/migrations/009_module_change.sql", "SELECT 1;\n");
  await assert.rejects(
    () => listMigrationFiles({ root }),
    /Duplicate migration version 009:[\s\S]*009_core_change\.sql[\s\S]*009_module_change\.sql/,
  );
}

async function assertSchemaRefreshAndDriftDetection() {
  const root = await makeTempRoot();
  await write(root, "src/db/schema/current.sql", `
CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
CREATE TABLE widgets (widget_id TEXT PRIMARY KEY, name TEXT NOT NULL);
`);
  await write(root, "src/db/migrations/007_widget_status.sql", "ALTER TABLE widgets ADD COLUMN status TEXT NOT NULL DEFAULT 'active';\n");
  await write(root, "src/db/migrations/009_widget_events.sql", "CREATE TABLE widget_events (event_id TEXT PRIMARY KEY, widget_id TEXT NOT NULL);\n");
  await write(root, "src/modules/example/migrations/010_module_items.sql", "CREATE TABLE module_items (item_id TEXT PRIMARY KEY);\n");

  const generated = await generateCurrentSchema({ root });
  assert.match(generated.sql, /status TEXT NOT NULL DEFAULT 'active'/);
  assert.match(generated.sql, /CREATE TABLE module_items/);
  assert.deepEqual(generated.migrations.map((migration) => migration.version), ["007", "009", "010"]);

  await refreshGeneratedSchema({ root });
  assert.equal((await checkGeneratedSchema({ root })).matches, true);

  await fs.appendFile(
    path.join(root, "src/db/migrations/009_widget_events.sql"),
    "CREATE TABLE schema_drift_probe (probe_id TEXT PRIMARY KEY);\n",
    "utf8",
  );
  assert.equal((await checkGeneratedSchema({ root })).matches, false, "migration changes should make the checked-in generated snapshot stale");
}

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-migration-schema-workflow-"));
  tempRoots.push(root);
  await write(root, "src/db/schema/current.sql", "CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);\n");
  return root;
}

async function write(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}
