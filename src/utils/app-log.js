import fs from "node:fs/promises";
import { config } from "../config.js";
import { toCsvValue } from "./csv.js";

const APP_LOG_HEADER =
  "timestamp,username,action,client_id,client_name,project_id,project_name,details";

async function readExistingCsv(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function appendAppLog(event) {
  const existingLog = await readExistingCsv(config.appLogFile);
  const row = [
    new Date().toISOString(),
    event.username || "",
    event.action || "",
    event.client_id || "",
    event.client_name || "",
    event.project_id || "",
    event.project_name || "",
    event.details || "",
  ]
    .map(toCsvValue)
    .join(",");

  await fs.mkdir(config.logDir, { recursive: true });
  await fs.appendFile(config.appLogFile, buildAppLogAppend(existingLog, row), "utf8");
}

function buildAppLogAppend(existingLog, row) {
  if (!existingLog.trimEnd()) {
    return `${APP_LOG_HEADER}\n${row}\n`;
  }

  return `${existingLog.endsWith("\n") ? "" : "\n"}${row}\n`;
}

export { appendAppLog, readExistingCsv };
