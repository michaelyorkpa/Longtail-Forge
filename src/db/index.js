import { createAppStartupActions } from "./app-startup-maintenance.js";
import { config } from "../config.js";
import { runMigrations } from "./migrations.js";
import { materializeVerifiedRegressionBaseline } from "./regression-baseline-fast-path.js";
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

/** @typedef {import("../types/database-contracts.js").DatabaseStartupAction} DatabaseStartupAction */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupContext} DatabaseStartupContext */
/** @typedef {import("../types/database-contracts.js").DatabaseHealth} DatabaseHealth */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupOptions} DatabaseStartupOptions */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupPhaseEvent} DatabaseStartupPhaseEvent */

export {
  createBulkValuesBindings,
} from "./parameter-bindings.js";

/** @param {DatabaseStartupOptions} [options] @returns {Promise<DatabaseHealth>} */
async function initializeDatabase(options = {}) {
  return ensureDatabase(options);
}

/** @param {DatabaseStartupOptions} [options] @returns {Promise<DatabaseHealth>} */
async function ensureDatabase(options = {}) {
  await materializeVerifiedRegressionBaseline({
    databaseFile: config.databaseFile,
    databaseProvider: config.databaseProvider,
  });
  /** @type {DatabaseStartupContext} */
  const context = {};
  await runStartupActions(createDatabaseStartupActions(), {
    context,
    now: options.now,
    report: options.report,
  });
  if (!context.databaseHealth) {
    throw new Error("Database startup completed without a health result.");
  }
  return context.databaseHealth;
}

/** @returns {DatabaseStartupAction[]} */
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

/** @param {DatabaseStartupOptions} [options] @returns {Promise<DatabaseHealth>} */
async function initializeWorkerDatabase(options = {}) {
  /** @type {DatabaseStartupContext} */
  const context = {};
  await runStartupActions(createWorkerStartupActions(), {
    context,
    now: options.now,
    report: options.report,
  });
  if (!context.databaseHealth) {
    throw new Error("Worker database startup completed without a health result.");
  }
  return context.databaseHealth;
}

/** @returns {DatabaseStartupAction[]} */
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

/** @param {DatabaseStartupPhaseEvent} event */
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
