import { databaseDialect, db, querySql } from "./provider.js";

async function verifyWorkerSchemaReady() {
  if (!(await tableExists("schema_migrations"))) {
    throw new Error("Worker schema is not ready: schema_migrations is missing. Start the app or run migration maintenance before starting node worker.js.");
  }

  const migrationRow = await db.get(`
SELECT version
FROM schema_migrations
WHERE version = :version
LIMIT 1;
`, { version: "065" });

  if (!migrationRow) {
    throw new Error("Worker schema is not ready: migration 065_job_outbox_schema has not been applied. Start the app or run migration maintenance before starting node worker.js.");
  }

  if (!(await tableExists("jobs"))) {
    throw new Error("Worker schema is not ready: jobs table is missing.");
  }

  const requiredColumns = [
    "job_id",
    "workspace_id",
    "job_type",
    "dedupe_key",
    "payload_json",
    "status",
    "priority",
    "available_at",
    "attempt_count",
    "max_attempts",
    "locked_at",
    "locked_by",
    "last_error",
    "created_at",
    "updated_at",
    "completed_at",
    "dead_at",
  ];

  if (!(await columnsExist("jobs", requiredColumns))) {
    throw new Error("Worker schema is not ready: jobs table is missing required columns.");
  }

  return true;
}

async function tableExists(tableName) {
  const row = await db.get(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = :tableName
LIMIT 1;
`, { tableName });

  return Boolean(row);
}

async function columnsExist(tableName, columnNames) {
  const columns = await querySql(databaseDialect.introspection.tableInfo(tableName));
  const existingColumnNames = new Set(columns.map((column) => column.name));

  return columnNames.every((columnName) => existingColumnNames.has(columnName));
}

export { verifyWorkerSchemaReady };
