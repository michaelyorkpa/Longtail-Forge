import { createAppStartupActions } from "./app-startup-maintenance.js";
import { runMigrations } from "./migrations.js";
import {
  closeDatabase,
  databaseDialect,
  db,
  formatDatabaseHealth,
  getDatabaseDialect,
  getLastDatabaseHealth,
  getSql,
  initializeDatabaseRuntime,
  querySql,
  readDatabaseHealth,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./provider.js";
import { runStartupActions, STARTUP_LIFECYCLES } from "./startup-coordinator.js";
import { verifyWorkerSchemaReady } from "./startup-readiness.js";

export {
  createBulkValuesBindings,
} from "./parameter-bindings.js";

async function initializeDatabase(options = {}) {
  return ensureDatabase(options);
}

async function ensureDatabase(options = {}) {
  const context = {};
  await runStartupActions(createDatabaseStartupActions(), {
    context,
    now: options.now,
    report: options.report,
  });
  return context.databaseHealth;
}

function createDatabaseStartupActions() {
  return [
    {
      id: "database.initialize-runtime",
      lifecycle: STARTUP_LIFECYCLES.EVERY_BOOT,
      owner: "database-provider",
      async run(context) {
        context.databaseHealth = await initializeDatabaseRuntime();
      },
    },
    {
      id: "database.run-migrations",
      lifecycle: STARTUP_LIFECYCLES.VERSIONED_REPAIR,
      owner: "migration-runner",
      run: runMigrations,
    },
    ...createAppStartupActions(),
  ];
}

async function initializeWorkerDatabase(options = {}) {
  const context = {};
  await runStartupActions(createWorkerStartupActions(), {
    context,
    now: options.now,
    report: options.report,
  });
  return context.databaseHealth;
}

function createWorkerStartupActions() {
  return [
    {
      id: "worker.initialize-database-runtime",
      lifecycle: STARTUP_LIFECYCLES.EVERY_BOOT,
      owner: "database-provider",
      async run(context) {
        context.databaseHealth = await initializeDatabaseRuntime();
      },
    },
    {
      id: "worker.verify-schema-readiness",
      lifecycle: STARTUP_LIFECYCLES.READINESS_ASSERTION,
      owner: "worker-schema-readiness",
      run: verifyWorkerSchemaReady,
    },
  ];
}

function formatStartupPhase(event) {
  return [
    "[startup-phase]",
    `id=${event.id}`,
    `lifecycle=${event.lifecycle}`,
    `owner=${event.owner}`,
    `status=${event.status}`,
    `duration_ms=${event.durationMs}`,
    event.reason ? `reason=${event.reason}` : "",
    event.errorType ? `error_type=${event.errorType}` : "",
  ].filter(Boolean).join(" ");
}

export {
  closeDatabase,
  createDatabaseStartupActions,
  createWorkerStartupActions,
  ensureDatabase,
  databaseDialect,
  formatDatabaseHealth,
  formatStartupPhase,
  getDatabaseDialect,
  getLastDatabaseHealth,
  getSql,
  initializeDatabase,
  initializeDatabaseRuntime,
  initializeWorkerDatabase,
  closeDatabase as closeSqlite,
  db,
  formatDatabaseHealth as formatSqliteHealth,
  getLastDatabaseHealth as getLastSqliteHealth,
  initializeDatabaseRuntime as initializeSqliteRuntime,
  querySql,
  readDatabaseHealth,
  readDatabaseHealth as readSqliteHealth,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
