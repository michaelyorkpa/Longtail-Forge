import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sql-literals.js";

let sqliteDatabase = null;
let lastSqliteHealth = null;

async function runSql(sql, params = undefined) {
  executeRunSql(sql, normalizeSqliteParameters(params));
  return "";
}

async function querySql(sql, params = undefined) {
  return executeQuerySql(sql, normalizeSqliteParameters(params));
}

async function closeSqlite() {
  if (!sqliteDatabase) {
    return;
  }

  const database = sqliteDatabase;
  sqliteDatabase = null;
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
  const [databaseRows, foreignKeyRows, journalRows, busyTimeoutRows] = await Promise.all([
    querySql("PRAGMA database_list;"),
    querySql("PRAGMA foreign_keys;"),
    querySql("PRAGMA journal_mode;"),
    querySql("PRAGMA busy_timeout;"),
  ]);
  const databaseFile = databaseRows.find((row) => row.name === "main")?.file || config.databaseFile;

  return {
    provider: "sqlite",
    databaseFile,
    databaseFileWritable: await checkDatabaseFileWritable(),
    foreignKeysEnabled: Number(foreignKeyRows[0]?.foreign_keys) === 1,
    journalMode: String(journalRows[0]?.journal_mode || "").toLowerCase(),
    busyTimeoutMs: Number.parseInt(String(busyTimeoutRows[0]?.timeout ?? ""), 10),
  };
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
  ].join(" ");
}

function getSqliteDatabase() {
  if (sqliteDatabase?.open) {
    return sqliteDatabase;
  }

  sqliteDatabase = new Database(config.databaseFile);
  applyConnectionPragmas(sqliteDatabase);
  return sqliteDatabase;
}

function applyConnectionPragmas(database) {
  database.pragma(`busy_timeout = ${config.sqlite.busyTimeoutMs}`);
  database.pragma(`foreign_keys = ${config.sqlite.foreignKeys ? "ON" : "OFF"}`);
}

function applyStartupPragmas(database) {
  applyConnectionPragmas(database);
  database.pragma(`journal_mode = ${config.sqlite.journalMode}`);
}

function executeRunSql(sql, parameters) {
  const text = String(sql || "").trim();

  if (!text) {
    return;
  }

  const statementCount = countSqlStatements(text);

  if (statementCount === 0) {
    return;
  }

  const bindings = resolveStatementBindings(text, parameters);

  if (bindings.hasBindings) {
    if (statementCount > 1) {
      throw new Error("Parameterized SQLite statements must be single statements.");
    }

    executePreparedRun(text, bindings.values);
    return;
  }

  getSqliteDatabase().exec(text);
}

function executeQuerySql(sql, parameters) {
  const text = String(sql || "").trim();

  if (!text) {
    return [];
  }

  const statementCount = countSqlStatements(text);

  if (statementCount === 0) {
    return [];
  }

  const bindings = resolveStatementBindings(text, parameters);

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

function executePreparedRun(sql, bindings = undefined) {
  const statement = getSqliteDatabase().prepare(sql);

  if (statement.reader) {
    allStatement(statement, bindings);
    return;
  }

  runStatement(statement, bindings);
}

function executePreparedQuery(sql, bindings = undefined) {
  const statement = getSqliteDatabase().prepare(sql);

  if (!statement.reader) {
    runStatement(statement, bindings);
    return [];
  }

  return allStatement(statement, bindings);
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

function resolveStatementBindings(sql, parameters) {
  const expected = collectSqlParameters(sql);

  if (expected.named.size > 0 && expected.positionalCount > 0) {
    throw new Error("SQLite statements cannot mix named and positional parameters.");
  }

  if (expected.named.size > 0) {
    return resolveNamedStatementBindings(expected.named, parameters);
  }

  if (expected.positionalCount > 0) {
    return resolvePositionalStatementBindings(expected.positionalCount, parameters);
  }

  assertNoProvidedParameters(parameters);
  return {
    hasBindings: false,
    values: undefined,
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

  throw new Error("Database query parameters must be strings, numbers, booleans, dates, null, or undefined.");
}

function collectSqlParameters(sql) {
  const named = new Set();
  let anonymousIndex = 0;
  let positionalCount = 0;
  let index = 0;
  let state = "sql";

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1] || "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "sql";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      if (char === "'" && next === "'") {
        index += 2;
      } else if (char === "'") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "double-quote") {
      if (char === "\"" && next === "\"") {
        index += 2;
      } else if (char === "\"") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "backtick") {
      if (char === "`" && next === "`") {
        index += 2;
      } else if (char === "`") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "bracket") {
      if (char === "]") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }

    if (char === "'") {
      state = "single-quote";
      index += 1;
      continue;
    }

    if (char === "\"") {
      state = "double-quote";
      index += 1;
      continue;
    }

    if (char === "`") {
      state = "backtick";
      index += 1;
      continue;
    }

    if (char === "[") {
      state = "bracket";
      index += 1;
      continue;
    }

    if ([":", "@", "$"].includes(char) && /[A-Za-z_]/.test(next)) {
      const parameter = readNamedParameter(sql, index);
      named.add(parameter.name);
      index = parameter.end;
      continue;
    }

    if (char === "?") {
      const parameter = readQuestionParameter(sql, index, ++anonymousIndex);
      positionalCount = Math.max(positionalCount, parameter.position);
      index = parameter.end;
      continue;
    }

    index += 1;
  }

  return {
    named,
    positionalCount,
  };
}

function readNamedParameter(sql, start) {
  let end = start + 2;

  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    name: sql.slice(start + 1, end),
  };
}

function readQuestionParameter(sql, start, fallbackPosition) {
  let end = start + 1;

  while (end < sql.length && /\d/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    position: end === start + 1 ? fallbackPosition : Number.parseInt(sql.slice(start + 1, end), 10),
  };
}

function countSqlStatements(sql) {
  let count = 0;
  let hasStatementText = false;
  let index = 0;
  let state = "sql";

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1] || "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "sql";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      if (char === "'" && next === "'") {
        index += 2;
      } else if (char === "'") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "double-quote") {
      if (char === "\"" && next === "\"") {
        index += 2;
      } else if (char === "\"") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "backtick") {
      if (char === "`" && next === "`") {
        index += 2;
      } else if (char === "`") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "bracket") {
      if (char === "]") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }

    if (char === "'") {
      hasStatementText = true;
      state = "single-quote";
      index += 1;
      continue;
    }

    if (char === "\"") {
      hasStatementText = true;
      state = "double-quote";
      index += 1;
      continue;
    }

    if (char === "`") {
      hasStatementText = true;
      state = "backtick";
      index += 1;
      continue;
    }

    if (char === "[") {
      hasStatementText = true;
      state = "bracket";
      index += 1;
      continue;
    }

    if (char === ";") {
      if (hasStatementText) {
        count += 1;
        hasStatementText = false;
      }
      index += 1;
      continue;
    }

    if (!/\s/.test(char)) {
      hasStatementText = true;
    }

    index += 1;
  }

  if (hasStatementText) {
    count += 1;
  }

  return count;
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
}

export {
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
