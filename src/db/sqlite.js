import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { config } from "../config.js";

let sqliteProcess = null;
let currentRequest = null;
let idleCloseTimer = null;
let closingIdleProcess = false;
let requestCounter = 0;
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
  sqliteProcess.stdin.write(".timeout 5000\n");
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

function markerToken(id) {
  return `__ltf_sqlite_done_${id}__`;
}

function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlNullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "NULL"
    : sqlText(value);
}

function sqlInteger(value) {
  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "0";
}

function sqlNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "NULL";
}

export {
  querySql,
  runSql,
  closeSqlite,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
