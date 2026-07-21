import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { analyzeSqlStatement } from "./parameter-bindings.js";
import {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sql-literals.js";

const STATEMENT_CACHE_LIMIT = 512;

let sqliteDatabase = null;
let lastSqliteHealth = null;
let executedStatementCount = 0;
const statementCache = new Map();

// Monotonic count of executed driver calls (multi-statement exec scripts
// count once); consumed by query-count budget regressions.
function readSqliteStatementCount() {
  return executedStatementCount;
}

async function runSql(sql, params = undefined, analysis = undefined) {
  executeRunSql(sql, normalizeSqliteParameters(params), analysis);
  return "";
}

async function querySql(sql, params = undefined, analysis = undefined) {
  return executeQuerySql(sql, normalizeSqliteParameters(params), analysis);
}

async function getSql(sql, params = undefined, analysis = undefined) {
  return executeGetSql(sql, normalizeSqliteParameters(params), analysis);
}

async function closeSqlite() {
  if (!sqliteDatabase) {
    return;
  }

  const database = sqliteDatabase;
  sqliteDatabase = null;
  statementCache.clear();
  database.close();
}

async function initializeSqliteRuntime() {
  await closeSqlite();
  await ensureDatabaseFileWritable();

  const database = getSqliteDatabase();
  applyStartupPragmas(database);

  const health = await readSqliteHealth();
  validateSqliteHealth(health);
  lastSqliteHealth = health;
  return health;
}

async function readSqliteHealth() {
  const [
    databaseRows,
    foreignKeyRows,
    journalRows,
    busyTimeoutRows,
    synchronousRows,
    cacheSizeRows,
    pageSizeRows,
    tempStoreRows,
    mmapSizeRows,
  ] = await Promise.all([
    querySql("PRAGMA database_list;"),
    querySql("PRAGMA foreign_keys;"),
    querySql("PRAGMA journal_mode;"),
    querySql("PRAGMA busy_timeout;"),
    querySql("PRAGMA synchronous;"),
    querySql("PRAGMA cache_size;"),
    querySql("PRAGMA page_size;"),
    querySql("PRAGMA temp_store;"),
    querySql("PRAGMA mmap_size;"),
  ]);
  const databaseFile = databaseRows.find((row) => row.name === "main")?.file || config.databaseFile;

  return {
    provider: "sqlite",
    databaseFile,
    databaseFileWritable: await checkDatabaseFileWritable(),
    foreignKeysEnabled: Number(foreignKeyRows[0]?.foreign_keys) === 1,
    journalMode: String(journalRows[0]?.journal_mode || "").toLowerCase(),
    busyTimeoutMs: Number.parseInt(String(busyTimeoutRows[0]?.timeout ?? ""), 10),
    synchronous: sqliteSynchronousModeName(synchronousRows[0]?.synchronous),
    cacheSizeKib: sqliteCacheSizeKib(cacheSizeRows[0]?.cache_size, pageSizeRows[0]?.page_size),
    tempStore: sqliteTempStoreName(tempStoreRows[0]?.temp_store),
    mmapSizeBytes: Number(mmapSizeRows[0]?.mmap_size ?? 0),
  };
}

function sqliteSynchronousModeName(value) {
  const names = ["off", "normal", "full", "extra"];
  return names[Number(value)] || "unknown";
}

function sqliteTempStoreName(value) {
  const names = ["default", "file", "memory"];
  return names[Number(value)] || "unknown";
}

function sqliteCacheSizeKib(cacheSize, pageSize) {
  const value = Number(cacheSize);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return -value;
  }

  const bytesPerPage = Number(pageSize) > 0 ? Number(pageSize) : 4096;
  return Math.round((value * bytesPerPage) / 1024);
}

function getLastSqliteHealth() {
  return lastSqliteHealth;
}

function formatSqliteHealth(health = lastSqliteHealth) {
  if (!health) {
    return "[sqlite-health] unavailable";
  }

  return [
    "[sqlite-health]",
    `provider=${health.provider}`,
    `databaseFile=${health.databaseFile}`,
    `writable=${health.databaseFileWritable ? "yes" : "no"}`,
    `foreign_keys=${health.foreignKeysEnabled ? "on" : "off"}`,
    `journal_mode=${health.journalMode}`,
    `busy_timeout_ms=${health.busyTimeoutMs}`,
    `synchronous=${health.synchronous}`,
    `cache_size_kib=${health.cacheSizeKib}`,
    `temp_store=${health.tempStore}`,
    `mmap_size_bytes=${health.mmapSizeBytes}`,
  ].join(" ");
}

function getSqliteDatabase() {
  if (sqliteDatabase?.open) {
    return sqliteDatabase;
  }

  statementCache.clear();
  sqliteDatabase = new Database(config.databaseFile);
  applyConnectionPragmas(sqliteDatabase);
  return sqliteDatabase;
}

function prepareCachedStatement(sql) {
  const database = getSqliteDatabase();
  const cached = statementCache.get(sql);

  if (cached) {
    statementCache.delete(sql);
    statementCache.set(sql, cached);
    return cached;
  }

  const statement = database.prepare(sql);
  statementCache.set(sql, statement);

  if (statementCache.size > STATEMENT_CACHE_LIMIT) {
    statementCache.delete(statementCache.keys().next().value);
  }

  return statement;
}

function applyConnectionPragmas(database) {
  database.pragma(`busy_timeout = ${config.sqlite.busyTimeoutMs}`);
  database.pragma(`foreign_keys = ${config.sqlite.foreignKeys ? "ON" : "OFF"}`);
  database.pragma(`synchronous = ${config.sqlite.synchronous.toUpperCase()}`);
  database.pragma(`cache_size = -${config.sqlite.cacheSizeKib}`);
  database.pragma(`temp_store = ${config.sqlite.tempStore.toUpperCase()}`);
  database.pragma(`mmap_size = ${config.sqlite.mmapSizeBytes}`);
}

function applyStartupPragmas(database) {
  applyConnectionPragmas(database);
  database.pragma(`journal_mode = ${config.sqlite.journalMode}`);
}

function executeRunSql(sql, parameters, analysis = undefined) {
  const text = String(sql || "").trim();

  if (!text) {
    return;
  }

  executedStatementCount += 1;

  const bindings = resolveStatementBindings(text, parameters, analysis);
  const statementCount = bindings.statementCount;

  if (statementCount === 0) {
    return;
  }

  if (bindings.hasBindings) {
    if (statementCount > 1) {
      throw new Error("Parameterized SQLite statements must be single statements.");
    }

    executePreparedRun(text, bindings.values);
    return;
  }

  getSqliteDatabase().exec(text);
}

function executeQuerySql(sql, parameters, analysis = undefined) {
  const text = String(sql || "").trim();

  if (!text) {
    return [];
  }

  executedStatementCount += 1;

  const bindings = resolveStatementBindings(text, parameters, analysis);
  const statementCount = bindings.statementCount;

  if (statementCount === 0) {
    return [];
  }

  if (bindings.hasBindings) {
    if (statementCount > 1) {
      throw new Error("Parameterized SQLite statements must be single statements.");
    }

    return executePreparedQuery(text, bindings.values);
  }

  if (statementCount > 1) {
    getSqliteDatabase().exec(text);
    return [];
  }

  return executePreparedQuery(text);
}

function executeGetSql(sql, parameters, analysis = undefined) {
  const text = String(sql || "").trim();

  if (!text) {
    return null;
  }

  executedStatementCount += 1;

  const bindings = resolveStatementBindings(text, parameters, analysis);
  const statementCount = bindings.statementCount;

  if (statementCount === 0) {
    return null;
  }

  if (bindings.hasBindings) {
    if (statementCount > 1) {
      throw new Error("Parameterized SQLite statements must be single statements.");
    }

    return executePreparedGet(text, bindings.values);
  }

  if (statementCount > 1) {
    getSqliteDatabase().exec(text);
    return null;
  }

  return executePreparedGet(text);
}

function executePreparedRun(sql, bindings = undefined) {
  const statement = prepareCachedStatement(sql);

  if (statement.reader) {
    allStatement(statement, bindings);
    return;
  }

  runStatement(statement, bindings);
}

function executePreparedQuery(sql, bindings = undefined) {
  const statement = prepareCachedStatement(sql);

  if (!statement.reader) {
    runStatement(statement, bindings);
    return [];
  }

  return allStatement(statement, bindings);
}

function executePreparedGet(sql, bindings = undefined) {
  const statement = prepareCachedStatement(sql);

  if (!statement.reader) {
    runStatement(statement, bindings);
    return null;
  }

  const row = getStatement(statement, bindings);
  return row === undefined ? null : row;
}

function runStatement(statement, bindings) {
  if (bindings === undefined) {
    return statement.run();
  }

  return statement.run(bindings);
}

function allStatement(statement, bindings) {
  if (bindings === undefined) {
    return statement.all();
  }

  return statement.all(bindings);
}

function getStatement(statement, bindings) {
  if (bindings === undefined) {
    return statement.get();
  }

  return statement.get(bindings);
}

function normalizeSqliteParameters(params) {
  if (params === undefined || params === null) {
    return {
      kind: "none",
      values: null,
    };
  }

  if (Array.isArray(params)) {
    return {
      kind: "array",
      values: params.map(normalizeSqliteParameterValue),
    };
  }

  if (typeof params !== "object") {
    throw new Error("Database query parameters must be an array or object.");
  }

  const values = new Map();

  for (const [name, value] of Object.entries(params)) {
    values.set(normalizeSqliteParameterName(name), normalizeSqliteParameterValue(value));
  }

  return {
    kind: "object",
    values,
  };
}

function resolveStatementBindings(sql, parameters, analysis = undefined) {
  if (analysis) {
    return resolvePreparedStatementBindings(parameters, analysis);
  }

  const { statementCount, tokens } = analyzeSqlStatement(sql);
  const expected = summarizeSqlParameterTokens(tokens);

  if (expected.named.size > 0 && expected.positionalCount > 0) {
    throw new Error("SQLite statements cannot mix named and positional parameters.");
  }

  if (expected.named.size > 0) {
    return {
      ...resolveNamedStatementBindings(expected.named, parameters),
      statementCount,
    };
  }

  if (expected.positionalCount > 0) {
    return {
      ...resolvePositionalStatementBindings(expected.positionalCount, parameters),
      statementCount,
    };
  }

  assertNoProvidedParameters(parameters);
  return {
    hasBindings: false,
    statementCount,
    values: undefined,
  };
}

function resolvePreparedStatementBindings(parameters, analysis) {
  const statementCount = analysis.statementCount;

  if (!analysis.hasBindings) {
    assertNoProvidedParameters(parameters);
    return {
      hasBindings: false,
      statementCount,
      values: undefined,
    };
  }

  if (parameters.kind !== "array") {
    throw new Error("SQLite positional parameters require an array.");
  }

  return {
    hasBindings: true,
    statementCount,
    values: parameters.values,
  };
}

function summarizeSqlParameterTokens(tokens) {
  const named = new Set();
  let positionalCount = 0;

  for (const token of tokens) {
    if (token.type === "named") {
      named.add(token.name);
      continue;
    }

    positionalCount = Math.max(positionalCount, token.position);
  }

  return {
    named,
    positionalCount,
  };
}

function resolveNamedStatementBindings(expectedNames, parameters) {
  const firstName = [...expectedNames][0];

  if (parameters.kind !== "object") {
    throw new Error(`Missing database query parameter: :${firstName}.`);
  }

  for (const name of expectedNames) {
    if (!parameters.values.has(name)) {
      throw new Error(`Missing database query parameter: :${name}.`);
    }
  }

  for (const name of parameters.values.keys()) {
    if (!expectedNames.has(name)) {
      throw new Error(`Unknown database query parameter: ${name}.`);
    }
  }

  return {
    hasBindings: true,
    values: Object.fromEntries([...expectedNames].map((name) => [name, parameters.values.get(name)])),
  };
}

function resolvePositionalStatementBindings(expectedCount, parameters) {
  if (parameters.kind !== "array") {
    throw new Error("SQLite positional parameters require an array.");
  }

  if (parameters.values.length < expectedCount) {
    throw new Error(`Missing database query parameter: ?${parameters.values.length + 1}.`);
  }

  if (parameters.values.length > expectedCount) {
    throw new Error(`Unknown database query parameter: ?${expectedCount + 1}.`);
  }

  return {
    hasBindings: true,
    values: parameters.values,
  };
}

function assertNoProvidedParameters(parameters) {
  if (parameters.kind === "object" && parameters.values.size > 0) {
    throw new Error(`Unknown database query parameter: ${parameters.values.keys().next().value}.`);
  }

  if (parameters.kind === "array" && parameters.values.length > 0) {
    throw new Error("Unknown database query parameter: ?1.");
  }
}

function normalizeSqliteParameterName(name) {
  const text = String(name || "").trim();
  const bareName = text.match(/^[:@$]?([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];

  if (!bareName) {
    throw new Error(`Invalid database query parameter name: ${text || "(empty)"}.`);
  }

  return bareName;
}

function normalizeSqliteParameterValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Database query number parameters must be finite.");
    }

    return value;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error("Database query parameters must be strings, numbers, booleans, buffers, dates, null, or undefined.");
}

async function ensureDatabaseFileWritable() {
  try {
    await fs.mkdir(path.dirname(config.databaseFile), { recursive: true });
    await checkDatabaseFileWritable();
  } catch (error) {
    throw new Error(`SQLite database file is not writable at ${config.databaseFile}: ${error.message || error}`);
  }
}

async function checkDatabaseFileWritable() {
  const handle = await fs.open(config.databaseFile, "a");
  await handle.close();
  return true;
}

function validateSqliteHealth(health) {
  if (!health.databaseFileWritable) {
    throw new Error(`SQLite database file is not writable at ${config.databaseFile}.`);
  }

  if (!health.foreignKeysEnabled) {
    throw new Error("SQLite foreign-key enforcement is disabled; LONGTAIL_SQLITE_FOREIGN_KEYS must be on.");
  }

  if (health.journalMode !== config.sqlite.journalMode) {
    throw new Error(`SQLite journal_mode is ${health.journalMode || "unknown"}; expected ${config.sqlite.journalMode}.`);
  }

  if (!Number.isInteger(health.busyTimeoutMs) || health.busyTimeoutMs !== config.sqlite.busyTimeoutMs) {
    throw new Error(`SQLite busy_timeout is ${health.busyTimeoutMs}; expected ${config.sqlite.busyTimeoutMs}.`);
  }

  if (health.synchronous !== config.sqlite.synchronous) {
    throw new Error(`SQLite synchronous is ${health.synchronous}; expected ${config.sqlite.synchronous}.`);
  }

  if (health.cacheSizeKib !== config.sqlite.cacheSizeKib) {
    throw new Error(`SQLite cache_size is ${health.cacheSizeKib} KiB; expected ${config.sqlite.cacheSizeKib} KiB.`);
  }

  if (health.tempStore !== config.sqlite.tempStore) {
    throw new Error(`SQLite temp_store is ${health.tempStore}; expected ${config.sqlite.tempStore}.`);
  }

  if (config.sqlite.mmapSizeBytes === 0 && health.mmapSizeBytes !== 0) {
    throw new Error(`SQLite mmap_size is ${health.mmapSizeBytes}; expected 0.`);
  }

  if (config.sqlite.mmapSizeBytes > 0
    && (health.mmapSizeBytes <= 0 || health.mmapSizeBytes > config.sqlite.mmapSizeBytes)) {
    throw new Error(`SQLite mmap_size is ${health.mmapSizeBytes}; expected at most ${config.sqlite.mmapSizeBytes} and greater than 0.`);
  }
}

export {
  getSql,
  readSqliteStatementCount,
  querySql,
  runSql,
  closeSqlite,
  formatSqliteHealth,
  getLastSqliteHealth,
  initializeSqliteRuntime,
  readSqliteHealth,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
