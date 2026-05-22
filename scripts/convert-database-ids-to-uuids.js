const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const databaseFile = process.env.TIME_TRACKER_DATABASE_FILE
  ? path.resolve(process.env.TIME_TRACKER_DATABASE_FILE)
  : path.join(root, "data", "time-tracker.db");
const sqliteCommand = process.env.SQLITE_COMMAND || "sqlite3";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function query(sql) {
  const output = execFileSync(sqliteCommand, ["-json", databaseFile, sql], {
    encoding: "utf8",
    windowsHide: true,
  });

  return output.trim() ? JSON.parse(output) : [];
}

function execute(sql) {
  execFileSync(sqliteCommand, [databaseFile, sql], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function isUuid(value) {
  return uuidPattern.test(String(value || ""));
}

function addMapping(map, value, usedValues) {
  const id = String(value || "").trim();

  if (!id || isUuid(id) || map.has(id)) {
    return;
  }

  let nextId = randomUUID();

  while (usedValues.has(nextId)) {
    nextId = randomUUID();
  }

  map.set(id, nextId);
  usedValues.add(nextId);
}

if (!fs.existsSync(databaseFile)) {
  throw new Error(`Database not found: ${databaseFile}`);
}

const clientRows = query("SELECT id FROM clients;");
const projectRows = query("SELECT id FROM projects;");
const entryRows = query("SELECT entry_id FROM time_entries;");

const usedValues = new Set([
  ...clientRows.map((row) => row.id),
  ...projectRows.map((row) => row.id),
  ...entryRows.map((row) => row.entry_id),
]);
const clientIdMap = new Map();
const projectIdMap = new Map();
const entryIdMap = new Map();

clientRows.forEach((row) => addMapping(clientIdMap, row.id, usedValues));
projectRows.forEach((row) => addMapping(projectIdMap, row.id, usedValues));
entryRows.forEach((row) => addMapping(entryIdMap, row.entry_id, usedValues));

if (clientIdMap.size === 0 && projectIdMap.size === 0 && entryIdMap.size === 0) {
  console.log("All database record IDs already use UUIDs.");
  process.exit(0);
}

const statements = ["PRAGMA foreign_keys = OFF;", "BEGIN TRANSACTION;"];

clientIdMap.forEach((newId, oldId) => {
  statements.push(`UPDATE clients SET id = ${sqlText(newId)} WHERE id = ${sqlText(oldId)};`);
  statements.push(`UPDATE projects SET client_id = ${sqlText(newId)} WHERE client_id = ${sqlText(oldId)};`);
  statements.push(`UPDATE time_entries SET client_id = ${sqlText(newId)} WHERE client_id = ${sqlText(oldId)};`);
});

projectIdMap.forEach((newId, oldId) => {
  statements.push(`UPDATE projects SET id = ${sqlText(newId)} WHERE id = ${sqlText(oldId)};`);
  statements.push(`UPDATE time_entries SET project_id = ${sqlText(newId)} WHERE project_id = ${sqlText(oldId)};`);
});

entryIdMap.forEach((newId, oldId) => {
  statements.push(`UPDATE time_entries SET entry_id = ${sqlText(newId)} WHERE entry_id = ${sqlText(oldId)};`);
});

statements.push("COMMIT;", "PRAGMA foreign_keys = ON;");
execute(statements.join("\n"));

console.log(
  JSON.stringify(
    {
      converted: {
        clients: clientIdMap.size,
        projects: projectIdMap.size,
        time_entries: entryIdMap.size,
      },
    },
    null,
    2,
  ),
);
