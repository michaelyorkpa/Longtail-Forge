import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.21.7.6";
const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tasks-server-side-paging-"));
const disposableDb = path.join(tempDir, "longtail-forge-tasks-server-side-paging-demo.db");

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksRepositorySource = readText("src/modules/tasks/tasks.repo.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const tasksDocs = readText("docs/tasks-module.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assertStaticContract();
runSeed();

process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
process.env.LONGTAIL_DATABASE_FILE = disposableDb;
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.SUPER_ADMIN_PASSWORD = "Scale-Seed-Password-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const { closeSqlite, getSql, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const taskCount = await getTaskCount();
  const originalReadAll = tasksRepository.readAll;

  tasksRepository.readAll = async () => {
    throw new Error("Tasks list should use queryList instead of readAll.");
  };

  try {
    await assertPagedList(session, taskCount);
    await assertPermissionPruning(session);
  } finally {
    tasksRepository.readAll = originalReadAll;
  }

  console.log("Tasks server-side list paging regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Tasks server-side paging version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Tasks server-side paging version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Tasks server-side paging version");

  assert.match(tasksRepositorySource, /async function queryList\(workspaceId, options = \{\}\)/, "Tasks repository should expose a bounded list query");
  assert.match(tasksRepositorySource, /LIMIT :limit OFFSET :offset/, "Tasks repository list query should use bounded SQL paging");
  assert.match(tasksRepositorySource, /function taskListWhereSql\(options, params\)/, "Tasks repository should own SQL list filters");
  assert.match(tasksRepositorySource, /function taskListOrderSql\(sort\)/, "Tasks repository should own stable SQL list sorting");

  const queryTasksBody = tasksServiceSource.match(/async function queryTasks\(session, query = \{\}, options = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(queryTasksBody, /tasksRepository\.queryList/, "Tasks list service should consume the bounded repository query");
  assert.doesNotMatch(queryTasksBody, /tasksRepository\.readAll/, "Tasks list service should not load all workspace tasks");
  assert.match(tasksServiceSource, /TASK_LIST_MAX_PAGE_SIZE = 200/, "Tasks service should cap requested page sizes");
  assert.match(tasksServiceSource, /await canReadTask\(session, task\)/, "Tasks service should keep permission pruning authoritative");
  assert.match(tasksServiceSource, /attachTaskListProjectionDetails/, "Tasks list should use projection hydration instead of full detail reads");

  assert.match(tasksScript, /params\.set\("limit", String\(TASK_LIST_PAGE_SIZE\)\)/, "Tasks browser should request a bounded list page");
  assert.match(tasksScript, /params\.set\("cursor", cursor\)/, "Tasks browser should request subsequent pages by cursor");
  assert.match(tasksScript, /data-task-load-more/, "Tasks browser should expose a load-more control for additional pages");
  assert.match(tasksView, /css\/longtail-forge\.css\?v=73[\s\S]*js\/tasks\.js\?v=21/, "Tasks host should cache-bust list paging assets");
  assert.match(tasksDocs, /current Tasks module behavior as of 0\.33\.5\.21\.7\.6/, "Tasks docs should report the current implementation version");
  assert.match(tasksDocs, /As of 0\.33\.5\.20\.2, the protected Tasks list route returns bounded server-side pages/, "Tasks docs should keep the server-side paging version on the shipped list contract");
  assert.match(regressionSuite, /scripts\/tasks-server-side-list-paging-regression\.mjs/, "Regression suite should include Tasks server-side paging coverage");
}

async function assertPagedList(session, taskCount) {
  assert.ok(taskCount >= 80, "scale seed should provide a non-trivial task set");

  const firstPage = await tasksService.list(session, {
    task_view: "all",
    status: "active",
    sort: "created_asc",
    limit: 15,
  });

  assert.equal(firstPage.tasks.length, 15, "first page should honor the requested bounded page size");
  assert.equal(firstPage.pagination.limit, 15, "pagination should report the effective page size");
  assert.equal(firstPage.pagination.hasMore, true, "seeded task set should expose a next page");
  assert.ok(firstPage.pagination.nextCursor, "pagination should return an opaque cursor");
  assert.ok(firstPage.tasks.length < taskCount, "normal list reads should not return the whole task table");
  assert.ok(firstPage.tasks.every((task) => !["complete", "archived"].includes(task.status)), "All view should stay active-only");

  const secondPage = await tasksService.list(session, {
    task_view: "all",
    status: "active",
    sort: "created_asc",
    limit: 15,
    cursor: firstPage.pagination.nextCursor,
  });
  const firstIds = new Set(firstPage.tasks.map((task) => task.task_id));
  const secondIds = new Set(secondPage.tasks.map((task) => task.task_id));

  assert.ok(secondPage.tasks.length > 0, "second page should return additional tasks");
  assert.equal([...secondIds].some((taskId) => firstIds.has(taskId)), false, "cursor paging should not duplicate the first page");
}

async function assertPermissionPruning(session) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const result = await tasksService.list(noRoleSession, {
    task_view: "all",
    status: "all",
    limit: 20,
  });

  assert.equal(result.tasks.length, 0, "server-side paging should still prune unreadable tasks");
}

async function getTaskCount() {
  const row = await getSql("SELECT COUNT(*) AS count FROM tasks;");
  return Number(row?.count) || 0;
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "seeded database should include a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`tasks-paging-no-role-${userId}@example.test`)},
  'Tasks Paging No Role',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
`);

  await runSql(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `tasks-paging-no-role-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

function runSeed() {
  const result = spawnSync(process.execPath, [
    "scripts/seed-scale.mjs",
    "--profile",
    "dev-demo",
    "--provider",
    "sqlite",
    "--database",
    disposableDb,
    "--json",
  ], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_ENV: "test",
      SUPER_ADMIN_PASSWORD: "Scale-Seed-Password-123!",
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  return env;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
