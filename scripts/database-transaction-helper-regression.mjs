import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const appVersion = "0.33.5.21.7.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-transaction-helper-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-transaction-helper.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Transaction-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const tasksSource = readText("src/modules/tasks/tasks.repo.js");
const notesRepoSource = readText("src/modules/notes/notes.repo.js");
const notesServiceSource = readText("src/modules/notes/notes.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the transaction helper version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the transaction helper version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the transaction helper version");

  assert.equal(typeof db.transaction, "function", "provider-neutral db should expose db.transaction(callback)");
  assert.equal(db.capabilities.transactions, true, "SQLite adapter should report transaction support");
  assert.equal(db.capabilities.transactionApi, "callback", "SQLite adapter should document the callback transaction API");
  assert.match(sqliteAdapterSource, /AsyncLocalStorage/, "SQLite adapter should track transaction callback context");
  assert.match(sqliteAdapterSource, /BEGIN TRANSACTION/, "SQLite adapter should begin transactions explicitly");
  assert.match(sqliteAdapterSource, /COMMIT/, "SQLite adapter should commit successful transactions");
  assert.match(sqliteAdapterSource, /ROLLBACK/, "SQLite adapter should roll back failed transactions");
  assert.match(sqliteAdapterSource, /Nested database transactions are not supported/, "SQLite adapter should document nested transaction behavior in code");
  assert.doesNotMatch(sqliteAdapterSource, /operationChain|enqueueAdapterOperation/, "SQLite adapter should retire the global operation queue after the synchronous driver swap");
  assert.match(sqliteAdapterSource, /transactionTail/, "SQLite adapter should keep a transaction-only tail so outside calls do not interleave with open transactions");

  assertTaskAssigneePilotSource();
  assertNoteCreateLinkPilotSource();

  await initializeDatabase();
  const session = await readProtectedSession();

  await assertAdapterTransactionCommitAndRollback();
  await assertOutsideOperationsWaitForOpenTransaction();
  await assertNestedTransactionFailsClearly();
  await assertTaskAssigneeReplacementCommits(session);
  await assertNoteCreateWithLinksCommits(session);
  await assertNoteCreateWithDuplicateLinksRollsBack(session);

  assert.match(databaseDocs, /As of version 0\.33\.5\.19\.5[\s\S]*`db\.transaction\(callback\)`/, "database docs should describe the transaction helper");
  assert.match(databaseDocs, /Nested transactions are not supported/, "database docs should document nested transaction behavior");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.0\.4[\s\S]*transaction-only tail[\s\S]*migration scripts/, "database docs should describe the transaction and migration fidelity slice");
  assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed transaction helper branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the transaction helper slice");
  assert.match(regressionSuite, /scripts\/database-transaction-helper-regression\.mjs/, "regression suite should include transaction helper coverage");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "transaction helper regression database should pass integrity check");

  console.log("Database transaction helper regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertTaskAssigneePilotSource() {
  const replaceAssignees = functionBlock(tasksSource, "replaceAssignees");
  assert.match(replaceAssignees, /db\.transaction\(async \(transaction\)/, "task assignee replacement should use db.transaction");
  assert.match(replaceAssignees, /transaction\.run\(`[\s\S]*UPDATE task_assignees/, "task assignee replacement should update inside the transaction client");
  assert.match(replaceAssignees, /transaction\.run\(`[\s\S]*INSERT INTO task_assignees/, "task assignee replacement should insert inside the transaction client");
  assert.doesNotMatch(replaceAssignees, /BEGIN TRANSACTION|COMMIT|ROLLBACK/, "task assignee replacement should not keep raw transaction SQL");
}

function assertNoteCreateLinkPilotSource() {
  const createWithLinks = functionBlock(notesRepoSource, "createWithLinks");
  assert.match(createWithLinks, /db\.transaction\(async \(transaction\)/, "note create/link workflow should use db.transaction");
  assert.match(createWithLinks, /insertNote\(transaction/, "note create/link workflow should insert the note through the transaction client");
  assert.match(createWithLinks, /insertNoteLink\(transaction/, "note create/link workflow should insert links through the transaction client");
  assert.match(notesServiceSource, /prepareCreateLinksFromPayload/, "notes service should validate staged create links before the repository transaction");
  assert.match(notesServiceSource, /notesRepository\.createWithLinks/, "notes service should persist create-time links atomically");
}

async function assertAdapterTransactionCommitAndRollback() {
  await db.run(`
CREATE TABLE transaction_probe (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

  await db.transaction(async (transaction) => {
    await transaction.run("INSERT INTO transaction_probe (id, value) VALUES (:id, :value);", {
      id: "commit-one",
      value: "first committed row",
    });
    await transaction.run("INSERT INTO transaction_probe (id, value) VALUES (:id, :value);", {
      id: "commit-two",
      value: "second committed row",
    });
  });

  const committed = await db.get("SELECT COUNT(1) AS count FROM transaction_probe WHERE id LIKE 'commit-%';");
  assert.equal(Number(committed.count), 2, "successful transaction should commit all changes");

  await assert.rejects(
    () => db.transaction(async (transaction) => {
      await transaction.run("INSERT INTO transaction_probe (id, value) VALUES (:id, :value);", {
        id: "rollback-one",
        value: "this row should roll back",
      });
      throw new Error("intentional transaction rollback");
    }),
    /intentional transaction rollback/,
  );

  const rolledBack = await db.get("SELECT COUNT(1) AS count FROM transaction_probe WHERE id = :id;", {
    id: "rollback-one",
  });
  assert.equal(Number(rolledBack.count), 0, "failed transaction should roll back all changes");

  await assert.rejects(
    () => db.transaction(async () => {
      await db.run("INSERT INTO transaction_probe (id, value) VALUES ('direct-db-run', 'not allowed');");
    }),
    /transaction client/,
    "db.run inside a transaction callback should fail clearly instead of deadlocking",
  );
}

async function assertOutsideOperationsWaitForOpenTransaction() {
  await db.run(`
CREATE TABLE transaction_wait_probe (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

  let releaseTransaction;
  let markTransactionStarted;
  const releasePromise = new Promise((resolve) => {
    releaseTransaction = resolve;
  });
  const transactionStarted = new Promise((resolve) => {
    markTransactionStarted = resolve;
  });

  const transactionPromise = db.transaction(async (transaction) => {
    await transaction.run("INSERT INTO transaction_wait_probe (id, value) VALUES (:id, :value);", {
      id: "inside-start",
      value: "inside transaction before release",
    });
    markTransactionStarted();
    await releasePromise;
    await transaction.run("INSERT INTO transaction_wait_probe (id, value) VALUES (:id, :value);", {
      id: "inside-finish",
      value: "inside transaction after release",
    });
  });

  await transactionStarted;

  const outsideReadPromise = db.get("SELECT COUNT(1) AS count FROM transaction_wait_probe;");
  const resolvedBeforeRelease = await Promise.race([
    outsideReadPromise.then(() => true),
    delay(75).then(() => false),
  ]);
  assert.equal(resolvedBeforeRelease, false, "outside database calls should wait while a transaction callback is open");

  releaseTransaction();
  await transactionPromise;

  const outsideRead = await outsideReadPromise;
  assert.equal(Number(outsideRead.count), 2, "outside database calls should run after the open transaction commits");
}

async function assertNestedTransactionFailsClearly() {
  await assert.rejects(
    () => db.transaction(async () => db.transaction(async () => {})),
    /Nested database transactions are not supported/,
    "nested db.transaction calls should fail clearly",
  );
}

async function assertTaskAssigneeReplacementCommits(session) {
  const task = await tasksRepository.create(session.workspace_id, {
    task_id: `transaction-task-${randomUUID()}`,
    title: "Transaction helper assignee task",
    description: "",
    next_action: "",
    blocked_reason: "",
    resume_note: "",
    status: "open",
    priority: "normal",
    billable: "yes",
    assignee_ids: [session.user_id],
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  let activeAssignees = await readActiveTaskAssignees(session.workspace_id, task.task_id);
  assert.deepEqual(activeAssignees.map((row) => row.user_id), [session.user_id], "transactional create should commit the initial assignee");

  const unassigned = await tasksRepository.update(session.workspace_id, {
    ...task,
    assignee_ids: [],
    updated_by_user_id: session.user_id,
  });
  assert.deepEqual(unassigned.assignee_ids, [], "transactional assignee replacement should commit removals");
  activeAssignees = await readActiveTaskAssignees(session.workspace_id, task.task_id);
  assert.equal(activeAssignees.length, 0, "removed assignees should no longer be active");

  const reassigned = await tasksRepository.update(session.workspace_id, {
    ...unassigned,
    assignee_ids: [session.user_id],
    updated_by_user_id: session.user_id,
  });
  assert.deepEqual(reassigned.assignee_ids, [session.user_id], "transactional assignee replacement should commit new assignees");
}

async function assertNoteCreateWithLinksCommits(session) {
  const created = await notesService.create({
    body_markdown: "The note and its workspace link should commit together.",
    links: [
      {
        targetId: session.workspace_id,
        targetType: "workspace",
      },
    ],
    title: `Transaction linked note ${randomUUID()}`,
  }, session);

  const linkCount = await db.get(`
SELECT COUNT(1) AS count
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND removed_at IS NULL;
`, {
    noteId: created.note.note_id,
    workspaceId: session.workspace_id,
  });

  assert.equal(Number(linkCount.count), 1, "successful note create/link transaction should commit the note link");
}

async function assertNoteCreateWithDuplicateLinksRollsBack(session) {
  const title = `Transaction duplicate link rollback ${randomUUID()}`;
  const duplicateLink = {
    targetId: session.workspace_id,
    targetType: "workspace",
  };

  await assert.rejects(
    () => notesService.create({
      body_markdown: "A duplicate staged link should roll back the whole note create.",
      links: [duplicateLink, duplicateLink],
      title,
    }, session),
    /UNIQUE constraint failed|constraint/i,
  );

  const leftoverNote = await db.get(`
SELECT note_id
FROM notes
WHERE workspace_id = :workspaceId
  AND title = :title
LIMIT 1;
`, {
    title,
    workspaceId: session.workspace_id,
  });
  assert.equal(leftoverNote, null, "failed note create/link transaction should not leave the note behind");

  const leftoverLinks = await db.get(`
SELECT COUNT(1) AS count
FROM note_links
WHERE workspace_id = :workspaceId
  AND target_type = 'workspace'
  AND target_id = :workspaceId
  AND note_id NOT IN (
    SELECT note_id
    FROM notes
    WHERE workspace_id = :workspaceId
  );
`, { workspaceId: session.workspace_id });
  assert.equal(Number(leftoverLinks.count), 0, "failed note create/link transaction should not leave orphan links behind");
}

async function readActiveTaskAssignees(workspaceId, taskId) {
  return db.query(`
SELECT user_id
FROM task_assignees
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND removed_at IS NULL
ORDER BY assigned_at, task_assignee_id;
`, { taskId, workspaceId });
}

async function readProtectedSession() {
  const user = await db.get(`
SELECT user_id, username, display_name, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(user?.user_id, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name || user.username,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function functionBlock(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = pattern.exec(source);
  assert.ok(match, `Expected function ${name} to exist.`);

  let depth = 0;
  for (let index = match.index; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  assert.fail(`Expected function ${name} to close.`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
