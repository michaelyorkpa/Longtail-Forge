import { config } from "../config.js";
import { createSqliteAdapter } from "./adapters/sqlite-adapter.js";
import { assertRegressionDatabaseTarget } from "./regression-database-safety.js";
import {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sql-literals.js";

/** @typedef {import("../types/database-contracts.js").DatabaseAdapter} DatabaseAdapter */
/** @typedef {import("../types/database-contracts.js").DatabaseDialect} DatabaseDialect */
/** @typedef {import("../types/database-contracts.js").DatabaseHealth} DatabaseHealth */
/** @typedef {import("../types/database-contracts.js").DatabaseParams} DatabaseParams */
/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */

assertRegressionDatabaseTarget(config.databaseFile);

/** @type {DatabaseAdapter} */
const db = createDatabaseAdapter(config.databaseProvider);
const databaseDialect = db.dialect;

/**
 * @param {string} provider
 * @returns {DatabaseAdapter}
 */
function createDatabaseAdapter(provider) {
  if (provider === "sqlite") {
    return createSqliteAdapter();
  }

  throw new Error(`Unsupported database provider "${provider}". Only sqlite is implemented in this version.`);
}

/**
 * @param {string} sql
 * @param {DatabaseParams} [params]
 * @returns {Promise<DatabaseRow[]>}
 */
function querySql(sql, params = undefined) {
  return db.query(sql, params);
}

/**
 * @param {string} sql
 * @param {DatabaseParams} [params]
 * @returns {Promise<DatabaseRow | null>}
 */
function getSql(sql, params = undefined) {
  return db.get(sql, params);
}

/**
 * @param {string} sql
 * @param {DatabaseParams} [params]
 * @returns {Promise<unknown>}
 */
function runSql(sql, params = undefined) {
  return db.run(sql, params);
}

/** @returns {Promise<void>} */
function closeDatabase() {
  return db.close();
}

/** @returns {DatabaseDialect} */
function getDatabaseDialect() {
  return db.dialect;
}

/** @returns {Promise<DatabaseHealth>} */
async function initializeDatabaseRuntime() {
  if (typeof db.initializeRuntime !== "function") {
    return db.health();
  }

  return db.initializeRuntime();
}

/** @returns {Promise<DatabaseHealth>} */
function readDatabaseHealth() {
  return db.health();
}

/** @returns {DatabaseHealth | null} */
function getLastDatabaseHealth() {
  return typeof db.getLastHealth === "function" ? db.getLastHealth() : null;
}

/**
 * @param {DatabaseHealth | null} [health]
 * @returns {string}
 */
function formatDatabaseHealth(health = getLastDatabaseHealth()) {
  if (typeof db.formatHealth === "function") {
    return db.formatHealth(health);
  }

  if (!health) {
    return `[database-health] provider=${db.provider} unavailable`;
  }

  return `[database-health] provider=${health.provider || db.provider}`;
}

export {
  closeDatabase,
  createDatabaseAdapter,
  db,
  db as databaseAdapter,
  db as database,
  databaseDialect,
  formatDatabaseHealth,
  getDatabaseDialect,
  getDatabaseDialect as readDatabaseDialect,
  getDatabaseDialect as resolveDatabaseDialect,
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
};
