import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { config } from "../config.js";
import {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sql-literals.js";

let sqliteProcess = null;
let currentRequest = null;
let idleCloseTimer = null;
let closingIdleProcess = false;
let requestCounter = 0;
let lastSqliteHealth = null;
const requestQueue = [];

function runSql(sql) {
  return enqueueSql(sql, { json: false });
}

function querySql(sql) {
  return enqueueSql(sql, { json: true });
}

async function closeSqlite() {
  clearIdleCloseTimer();

  if (!sqliteProcess) {
    return;
  }

  const process = sqliteProcess;
  closingIdleProcess = true;
  sqliteProcess = null;
  process.stdin.end(".quit\n");
  await new Promise((resolve) => {
    process.once("exit", resolve);
  });
}

async function initializeSqliteRuntime() {
  await closeSqlite();
  await ensureDatabaseFileWritable();
  await configureSqliteJournalMode();

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

function enqueueSql(sql, options) {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      id: String(++requestCounter),
      options,
      reject,
      resolve,
      sql: String(sql || ""),
      stdout: "",
      stderr: "",
    });
    processQueue();
  });
}

function processQueue() {
  if (currentRequest || requestQueue.length === 0) {
    return;
  }

  clearIdleCloseTimer();
  currentRequest = requestQueue.shift();
  const process = getSqliteProcess();
  const marker = markerToken(currentRequest.id);
  const mode = currentRequest.options.json ? ".mode json" : ".mode list";

  process.stdin.write(`${mode}\n`);
  process.stdin.write(`${currentRequest.sql.trim()}\n`);
  process.stdin.write(`.mode json\nSELECT ${sqlText(marker)} AS __ltf_marker;\n`);
}

function getSqliteProcess() {
  if (sqliteProcess && !sqliteProcess.killed) {
    return sqliteProcess;
  }

  closingIdleProcess = false;
  sqliteProcess = spawn(
    config.sqliteCommand,
    ["-json", config.databaseFile],
    { windowsHide: true },
  );
  sqliteProcess.stdin.write(".bail on\n");
  sqliteProcess.stdin.write(`.timeout ${config.sqlite.busyTimeoutMs}\n`);
  sqliteProcess.stdin.write(`PRAGMA foreign_keys = ${config.sqlite.foreignKeys ? "ON" : "OFF"};\n`);
  sqliteProcess.stdout.on("data", handleStdout);
  sqliteProcess.stderr.on("data", handleStderr);
  sqliteProcess.on("error", handleProcessError);
  sqliteProcess.on("exit", handleProcessExit);
  return sqliteProcess;
}

function handleStdout(chunk) {
  if (!currentRequest) {
    return;
  }

  currentRequest.stdout += chunk.toString();
  finishIfMarkerReceived();
}

function handleStderr(chunk) {
  if (!currentRequest) {
    return;
  }

  currentRequest.stderr += chunk.toString();
}

function finishIfMarkerReceived() {
  if (!currentRequest) {
    return;
  }

  const marker = markerToken(currentRequest.id);
  const markerText = JSON.stringify([{ __ltf_marker: marker }]);
  const markerIndex = currentRequest.stdout.indexOf(markerText);

  if (markerIndex === -1) {
    return;
  }

  const stdout = currentRequest.stdout.slice(0, markerIndex).trim();
  const stderr = currentRequest.stderr.trim();
  const request = currentRequest;

  currentRequest = null;

  if (stderr) {
    request.reject(new Error(stderr));
  } else if (request.options.json) {
    resolveJsonRequest(request, stdout);
  } else {
    request.resolve(stdout);
  }

  processQueue();
  scheduleIdleClose();
}

function resolveJsonRequest(request, stdout) {
  try {
    request.resolve(stdout ? JSON.parse(stdout) : []);
  } catch (error) {
    request.reject(error);
  }
}

function handleProcessError(error) {
  rejectCurrentAndQueued(error);
}

function handleProcessExit(code, signal) {
  if (closingIdleProcess) {
    closingIdleProcess = false;
    sqliteProcess = null;
    return;
  }

  const stderr = currentRequest?.stderr?.trim();
  const error = new Error(stderr || `sqlite3 exited unexpectedly (${signal || code || "unknown"}).`);
  sqliteProcess = null;
  rejectCurrentAndQueued(error);
}

function scheduleIdleClose() {
  if (currentRequest || requestQueue.length > 0 || !sqliteProcess) {
    return;
  }

  idleCloseTimer = setTimeout(() => {
    if (currentRequest || requestQueue.length > 0 || !sqliteProcess) {
      return;
    }

    const process = sqliteProcess;
    closingIdleProcess = true;
    sqliteProcess = null;
    process.stdin.end(".quit\n");
  }, 250);
}

function clearIdleCloseTimer() {
  if (!idleCloseTimer) {
    return;
  }

  clearTimeout(idleCloseTimer);
  idleCloseTimer = null;
}

function rejectCurrentAndQueued(error) {
  if (currentRequest) {
    currentRequest.reject(error);
    currentRequest = null;
  }

  while (requestQueue.length > 0) {
    requestQueue.shift().reject(error);
  }
}

async function configureSqliteJournalMode() {
  await runSqliteStartupScript(`
PRAGMA foreign_keys = ${config.sqlite.foreignKeys ? "ON" : "OFF"};
PRAGMA journal_mode = ${config.sqlite.journalMode};
`);
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

function runSqliteStartupScript(sql) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      config.sqliteCommand,
      ["-json", config.databaseFile],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;

    function settle(error, value = "") {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    process.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", (error) => {
      settle(new Error(`SQLite startup configuration failed: ${error.message || error}`));
    });
    process.on("exit", (code, signal) => {
      const cleanStderr = stderr.trim();

      if (code !== 0 || cleanStderr) {
        settle(new Error(`SQLite startup configuration failed: ${cleanStderr || `sqlite3 exited unexpectedly (${signal || code || "unknown"})`}`));
        return;
      }

      settle(null, stdout.trim());
    });
    process.stdin.end(`
.bail on
.timeout ${config.sqlite.busyTimeoutMs}
${sql.trim()}
`);
  });
}

function markerToken(id) {
  return `__ltf_sqlite_done_${id}__`;
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
