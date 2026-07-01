import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.20.6";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-params-pilot-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-params-pilot.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Params-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const sqliteSource = readText("src/db/sqlite.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const sessionsSource = readText("src/repositories/sessions.repo.js");
const workspacesSource = readText("src/repositories/workspaces.repo.js");
const tasksSource = readText("src/modules/tasks/tasks.repo.js");
const notesSource = readText("src/modules/notes/notes.repo.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { sessionsRepository } = await import("../src/repositories/sessions.repo.js");
const { workspacesRepository } = await import("../src/repositories/workspaces.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the parameterized query pilot version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the parameterized query pilot version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the parameterized query pilot version");

  assert.equal(db.capabilities.provider, "sqlite");
  assert.equal(db.capabilities.parameterizedQueries, true, "SQLite adapter should report parameterized query support");
  assert.equal(db.capabilities.parameterStyle, "named", "SQLite adapter should document named parameter style");
  assert.doesNotMatch(sqliteSource, /\.parameter set/, "raw SQLite process helper should stay unaware of app-level parameter binding");
  assert.match(sqliteAdapterSource, /expandSqlParameters/, "SQLite adapter should expand request parameters before sending SQL to the process helper");
  assert.match(sqliteAdapterSource, /addNamedBinding/, "SQLite adapter should validate named parameter keys");
  assert.match(sqliteAdapterSource, /sqliteParameterLiteral/, "SQLite adapter should centralize parameter literal escaping");
  assert.doesNotMatch(sqliteAdapterSource, /parameter binding is reserved/, "SQLite adapter should no longer reject bound params");
  assert.match(sqliteAdapterSource, /parameterizedQueries: true/, "SQLite adapter capabilities should expose parameterized query support");

  assertPilotSourceShape();

  const hostileValue = "quoted ' value; DROP TABLE sessions; -- ? :workspaceId";
  const directRow = await db.get(
    "SELECT :hostileValue AS hostile_value, :countValue AS count_value, :nullValue AS null_value;",
    {
      countValue: 42,
      hostileValue,
      nullValue: null,
    },
  );
  assert.deepEqual(directRow, {
    count_value: 42,
    hostile_value: hostileValue,
    null_value: null,
  }, "adapter should return bound values without interpreting SQL-like text");

  await initializeDatabase();
  const workspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  const user = await db.get(`
SELECT user_id, username, timezone
FROM users
WHERE home_workspace_id = :workspaceId
ORDER BY rowid
LIMIT 1;
`, { workspaceId: workspace.workspace_id });

  assert.ok(workspace?.workspace_id, "fresh startup should create a workspace");
  assert.ok(user?.user_id, "fresh startup should create a user");

  await assertSessionRepositoryParams(workspace.workspace_id, user);
  await assertWorkspaceRepositoryParams(workspace.workspace_id);
  await assertTaskReadParams(workspace.workspace_id);
  await assertNoteReadParams(workspace.workspace_id);

  assert.match(databaseDocs, /Parameterized Query Style/, "database docs should include the parameterized query style");
  assert.match(databaseDocs, /Use named parameters for values/, "database docs should tell new code to use parameters for values");
  assert.match(databaseDocs, /Table and column names must stay static or come from validated allowlists/, "database docs should keep identifiers out of value params");
  assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed parameterized query branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the parameterized query pilot");
  assert.match(regressionSuite, /scripts\/database-parameterized-query-pilot-regression\.mjs/, "regression suite should include parameterized query pilot coverage");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "parameterized query pilot database should pass integrity check");

  console.log("Database parameterized query pilot regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertPilotSourceShape() {
  assert.doesNotMatch(sessionsSource, /\bsqlText\b|\bsqlNullableText\b|\bquerySql\b|\brunSql\b/, "sessions repository should use the adapter parameter style");
  assert.match(sessionsSource, /db\.run\(`[\s\S]*:sessionId[\s\S]*`, \{/, "sessions writes should use named params");
  assert.match(sessionsSource, /db\.get\(`[\s\S]*WHERE session_id = :sessionId[\s\S]*`, \{ sessionId \}\)/, "sessions reads should use named params");

  assert.match(workspacesSource, /db\.query\(`[\s\S]*user_workspaces\.user_id = :userId/, "workspace list reads should use named params");
  assert.match(workspacesSource, /db\.get\(`[\s\S]*workspace_id = :workspaceId/, "workspace single reads should use named params");
  assert.match(workspacesSource, /createWorkspace[\s\S]*BEGIN TRANSACTION/, "workspace creation should remain on compatibility helpers because it is not a transaction pilot path");

  assert.match(tasksSource, /db\.query\(taskSelectSql\(`[\s\S]*tasks\.workspace_id = :workspaceId[\s\S]*tasks\.task_id = :taskId/, "Tasks readById should use named params");
  assert.match(notesSource, /db\.get\(`[\s\S]*workspace_id = :workspaceId[\s\S]*note_id = :noteId/, "Notes readById should use named params");
}

async function assertSessionRepositoryParams(workspaceId, user) {
  const sessionId = `session-${randomUUID()}-' ; DROP TABLE sessions; --`;
  const username = `name ${randomUUID()} ' ; DROP TABLE users; --`;

  await sessionsRepository.create({
    active_workspace_id: workspaceId,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1'; DROP TABLE sessions; --",
    session_id: sessionId,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username,
  });

  const readBack = await sessionsRepository.readById(sessionId);
  assert.equal(readBack.session_id, sessionId);
  assert.equal(readBack.username, username);
  assert.equal(readBack.ip_address, "127.0.0.1'; DROP TABLE sessions; --");

  await sessionsRepository.updateUsernameForUser(workspaceId, user.user_id, "updated '; DROP TABLE sessions; --");
  const updated = await sessionsRepository.readById(sessionId);
  assert.equal(updated.username, "updated '; DROP TABLE sessions; --");

  await sessionsRepository.remove(`${sessionId}-missing`);
  assert.ok(await sessionsRepository.readById(sessionId), "SQL-like missing session IDs should not affect existing rows");
  await sessionsRepository.remove(sessionId);
  assert.equal(await sessionsRepository.readById(sessionId), null);

  const sessionsTable = await db.get("SELECT COUNT(1) AS count FROM sessions;");
  assert.ok(Number(sessionsTable.count) >= 0, "sessions table should survive SQL-like bound values");
}

async function assertWorkspaceRepositoryParams(workspaceId) {
  const existing = await workspacesRepository.readById(workspaceId);
  assert.equal(existing.workspace_id, workspaceId);

  const hostileWorkspace = await workspacesRepository.readById("missing'; DROP TABLE workspaces; --");
  assert.equal(hostileWorkspace, null);

  const workspacesTable = await db.get("SELECT COUNT(1) AS count FROM workspaces;");
  assert.ok(Number(workspacesTable.count) >= 1, "workspaces table should survive SQL-like bound values");
}

async function assertTaskReadParams(workspaceId) {
  const taskId = `task-${randomUUID()}-' ; DROP TABLE tasks; --`;
  const title = "Task title '; DROP TABLE tasks; --";
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  title,
  created_at,
  updated_at
)
VALUES (
  :taskId,
  :workspaceId,
  :title,
  :createdAt,
  :updatedAt
);
`, { createdAt: now, taskId, title, updatedAt: now, workspaceId });

  const task = await tasksRepository.readById(workspaceId, taskId);
  assert.equal(task.task_id, taskId);
  assert.equal(task.title, title);

  const missing = await tasksRepository.readById(workspaceId, "missing'; DROP TABLE tasks; --");
  assert.equal(missing, null);

  const tasksTable = await db.get("SELECT COUNT(1) AS count FROM tasks;");
  assert.ok(Number(tasksTable.count) >= 1, "tasks table should survive SQL-like bound values");
}

async function assertNoteReadParams(workspaceId) {
  const noteId = `note-${randomUUID()}-' ; DROP TABLE notes; --`;
  const title = "Note title '; DROP TABLE notes; --";
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  created_at,
  updated_at
)
VALUES (
  :noteId,
  :workspaceId,
  :title,
  :createdAt,
  :updatedAt
);
`, { createdAt: now, noteId, title, updatedAt: now, workspaceId });

  const note = await notesRepository.readById(workspaceId, noteId);
  assert.equal(note.note_id, noteId);
  assert.equal(note.title, title);

  const missing = await notesRepository.readById(workspaceId, "missing'; DROP TABLE notes; --");
  assert.equal(missing, null);

  const notesTable = await db.get("SELECT COUNT(1) AS count FROM notes;");
  assert.ok(Number(notesTable.count) >= 1, "notes table should survive SQL-like bound values");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
