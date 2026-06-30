import { config } from "../config.js";
import { createSqliteAdapter } from "./adapters/sqlite-adapter.js";
import {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sql-literals.js";

const db = createDatabaseAdapter(config.databaseProvider);

function createDatabaseAdapter(provider) {
  if (provider === "sqlite") {
    return createSqliteAdapter();
  }

  throw new Error(`Unsupported database provider "${provider}". Only sqlite is implemented in this version.`);
}

function querySql(sql, params = undefined) {
  return db.query(sql, params);
}

function getSql(sql, params = undefined) {
  return db.get(sql, params);
}

function runSql(sql, params = undefined) {
  return db.run(sql, params);
}

function closeDatabase() {
  return db.close();
}

async function initializeDatabaseRuntime() {
  if (typeof db.initializeRuntime !== "function") {
    return db.health();
  }

  return db.initializeRuntime();
}

function readDatabaseHealth() {
  return db.health();
}

function getLastDatabaseHealth() {
  return typeof db.getLastHealth === "function" ? db.getLastHealth() : null;
}

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
  formatDatabaseHealth,
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
