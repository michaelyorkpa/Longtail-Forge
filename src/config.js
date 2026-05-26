import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

function toDisplayName(packageName) {
  return String(packageName)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const config = {
  appName: toDisplayName(packageJson.name),
  appVersion: packageJson.version,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT) || 8001,
  root,
  publicDir: path.join(root, "public"),
  viewsDir: path.join(root, "views"),
  dataDir: path.join(root, "data"),
  logsDir: path.join(root, "logs"),
  logDir: path.join(root, "logs"),
  databaseFile: path.join(root, "data", "time-tracker.db"),
  migrationsDir: path.join(root, "src", "db", "migrations"),
  settingsFile: path.join(root, "data", "settings.json"),
  clientProjectFile: path.join(root, "data", "client-project.json"),
  timeEntriesFile: path.join(root, "data", "time-entries.csv"),
  appLogFile: path.join(root, "logs", "app-events.csv"),
  sqliteCommand: process.env.SQLITE_COMMAND || "sqlite3",
  cookies: {
    sessionName: "longtail_forge_session",
    themeName: "lf_theme",
    httpOnly: true,
    sameSite: "Lax",
  },
};

export { config };
