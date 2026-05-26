import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT) || 8001,
  root,
  dataDir: path.join(root, "data"),
  logDir: path.join(root, "logs"),
  databaseFile: path.join(root, "data", "time-tracker.db"),
  migrationsDir: path.join(root, "src", "db", "migrations"),
  clientProjectFile: path.join(root, "data", "client-project.json"),
  settingsFile: path.join(root, "data", "settings.json"),
  timeEntriesFile: path.join(root, "data", "time-entries.csv"),
  appLogFile: path.join(root, "logs", "app-events.csv"),
  sqliteCommand: process.env.SQLITE_COMMAND || "sqlite3",
};

export { config };
