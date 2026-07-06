import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.18";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-checklists-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-checklists-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Checklists-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const taskChecklistsRepoSource = readText("src/modules/tasks/task-checklists.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const tasksDocs = readText("docs/tasks-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { taskChecklistsRepository } = await import("../src/modules/tasks/task-checklists.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRepositoryLifecycle(session);

  console.log("Task checklists repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Task checklist repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Task checklist repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task checklist repository conversion version");

  assert.match(taskChecklistsRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Task checklist repository should import only the provider-neutral db facade");
  assert.doesNotMatch(taskChecklistsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Task checklist repository should not use SQL literal helpers or compatibility query wrappers");
  assert.match(taskChecklistsRepoSource, /task_checklist_items\.task_id IN \(:taskIds\)/, "Checklist progress reads should use array-valued named params");
  assert.match(taskChecklistsRepoSource, /db\.dialect\.boolean\.bind\(true\)/, "Checklist progress reads should compare checked state through the boolean seam");
  assert.match(taskChecklistsRepoSource, /db\.dialect\.boolean\.bind\(Boolean\(value\)\)/, "Checklist writes should bind logical booleans through the dialect seam");
  assert.match(taskChecklistsRepoSource, /db\.dialect\.boolean\.read\(row\.is_checked\)/, "Checklist row mapping should read checked state through the dialect seam");
  assert.match(taskChecklistsRepoSource, /db\.transaction\(async \(transaction\)/, "Checklist reorder should use the provider-neutral transaction helper");
  assert.match(taskChecklistsRepoSource, /transaction\.run\(`[\s\S]*UPDATE task_checklist_items/, "Checklist reorder should update rows through bound transaction.run calls");
  assert.doesNotMatch(taskChecklistsRepoSource, /BEGIN TRANSACTION|COMMIT;|ROLLBACK;/, "Checklist repository should not hand-compose transaction scripts");
  assert.doesNotMatch(taskChecklistsRepoSource, /is_checked\s*(?:=|!=)\s*1|Number\(row\.is_checked\)\s*===\s*1/, "Checklist checked-state logic should not spell SQLite boolean storage directly");

  assert.match(auditDocs, /0\.33\.5\.27\.9 Task Checklist Repository Conversion[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*1,331 runtime literal-helper invocations[\s\S]*215 direct interpolated SQL operation sites[\s\S]*123 existing bound operation sites/, "audit docs should retain the Task checklist conversion ratchet");
  assert.match(auditDocs, /\| tasks\/task-checklists\.repo \| Converted \| 0 \| 0 \| 8 \| 8 \|/, "audit inventory should mark tasks/task-checklists.repo converted");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.9[\s\S]*`tasks\/task-checklists\.repo`[\s\S]*1,331 remaining helper invocations/, "database docs should record the Task checklist repository conversion");
  assert.match(tasksDocs, /As of version 0\.33\.5\.27\.9[\s\S]*task checklist repository uses named bound params[\s\S]*`db\.transaction\(callback\)`[\s\S]*boolean seam/, "Tasks docs should describe the converted checklist persistence boundary");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.9 - Conversion wave: Task checklist repository[\s\S]*- \[x\] Convert `tasks\/task-checklists\.repo`[\s\S]*- \[x\] Preserve checklist read\/progress[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Task checklist repository slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.9 - [\s\S]*Task checklist repository conversion[\s\S]*1,331 helper invocations[\s\S]*215 direct interpolated operation sites[\s\S]*123 bound operation sites/, "changelog should record the Task checklist conversion burndown");
  assert.match(regressionSuite, /scripts\/task-checklists-repository-conversion-regression\.mjs/, "regression suite should include the Task checklist repository conversion proof");
}

async function assertRepositoryLifecycle(session) {
  const task = (await tasksService.create({
    next_action: "Verify converted checklist persistence.",
    title: "Checklist repository conversion parent task",
  }, session)).task;

  assert.equal((await taskChecklistsRepository.readProgressForTasks(session.workspace_id, [])).size, 0, "empty progress reads should stay a no-op");

  const first = await taskChecklistsRepository.create(session.workspace_id, task.task_id, {
    created_by_user_id: session.user_id,
    label: "First converted checklist item",
    updated_by_user_id: session.user_id,
  });
  const second = await taskChecklistsRepository.create(session.workspace_id, task.task_id, {
    created_by_user_id: session.user_id,
    label: "Second converted checklist item",
    sort_order: 2500,
    updated_by_user_id: session.user_id,
  });

  assert.equal(first.sort_order, 1000, "first implicit checklist sort order should start at 1000");
  assert.equal(second.sort_order, 2500, "explicit checklist sort order should be preserved");
  assert.deepEqual(
    (await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id)).map((item) => item.label),
    ["First converted checklist item", "Second converted checklist item"],
    "checklist reads should preserve active sort order",
  );
  assertProgress(
    await taskChecklistsRepository.readProgressForTasks(session.workspace_id, [task.task_id, task.task_id]),
    task.task_id,
    {
      completed: 0,
      next: "First converted checklist item",
      total: 2,
    },
  );

  const completedAt = new Date().toISOString();
  const updatedFirst = await taskChecklistsRepository.update(session.workspace_id, {
    ...first,
    completed_at: completedAt,
    completed_by_user_id: session.user_id,
    is_checked: true,
    label: "First converted checklist item done",
    updated_by_user_id: session.user_id,
  });
  assert.equal(updatedFirst.is_checked, true, "checked state should round-trip as a logical boolean");
  assert.equal(updatedFirst.completed_at, completedAt, "checked item completion timestamp should be preserved");
  assertProgress(
    await taskChecklistsRepository.readProgressForTasks(session.workspace_id, [task.task_id]),
    task.task_id,
    {
      completed: 1,
      next: "Second converted checklist item",
      total: 2,
    },
  );

  const reordered = await taskChecklistsRepository.reorder(session.workspace_id, task.task_id, [
    second.task_checklist_item_id,
    first.task_checklist_item_id,
  ], session.user_id);
  assert.deepEqual(
    reordered.map((item) => `${item.label}:${item.sort_order}`),
    [
      "Second converted checklist item:1000",
      "First converted checklist item done:2000",
    ],
    "reorder should preserve the 1000-step sort contract inside a transaction",
  );
  assertProgress(
    await taskChecklistsRepository.readProgressForTasks(session.workspace_id, [task.task_id]),
    task.task_id,
    {
      completed: 1,
      next: "Second converted checklist item",
      total: 2,
    },
  );

  const deletedSecond = await taskChecklistsRepository.softDelete(session.workspace_id, second.task_checklist_item_id, session.user_id);
  assert.ok(deletedSecond.deleted_at, "soft delete should preserve deleted metadata on direct item reads");
  assert.equal(
    (await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id))
      .some((item) => item.task_checklist_item_id === second.task_checklist_item_id),
    false,
    "active task checklist reads should exclude soft-deleted items",
  );

  const third = await taskChecklistsRepository.create(session.workspace_id, task.task_id, {
    created_by_user_id: session.user_id,
    label: "Third converted checklist item",
    updated_by_user_id: session.user_id,
  });
  assert.equal(third.sort_order, 3000, "implicit next-sort-order should ignore deleted rows and continue after active rows");
  assert.deepEqual(
    (await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id)).map((item) => item.label),
    ["First converted checklist item done", "Third converted checklist item"],
    "post-delete checklist reads should preserve active display order",
  );
  assertProgress(
    await taskChecklistsRepository.readProgressForTasks(session.workspace_id, [task.task_id]),
    task.task_id,
    {
      completed: 1,
      next: "Third converted checklist item",
      total: 2,
    },
  );
}

function assertProgress(progressByTaskId, taskId, expected) {
  const progress = progressByTaskId.get(taskId);
  assert.ok(progress, "progress map should include the converted task");
  assert.equal(progress.total_count, expected.total);
  assert.equal(progress.completed_count, expected.completed);
  assert.equal(progress.next_incomplete_item_label, expected.next);
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
