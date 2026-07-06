import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.28";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-relationships-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-relationships-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Relationships-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const taskRelationshipsRepoSource = readText("src/modules/tasks/task-relationships.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const tasksDocs = readText("docs/tasks-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { taskRelationshipsRepository } = await import("../src/modules/tasks/task-relationships.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRepositoryLifecycle(session);

  console.log("Task relationships repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Task relationships repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Task relationships repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task relationships repository conversion version");

  assert.match(taskRelationshipsRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Task relationships repository should import only the provider-neutral db facade");
  assert.doesNotMatch(taskRelationshipsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Task relationships repository should not use SQL literal helpers or compatibility query wrappers");
  assert.match(taskRelationshipsRepoSource, /task_relationships\.parent_task_id IN \(:taskIds\)/, "Relationship summary batches should use array-valued named params for parent task ids");
  assert.match(taskRelationshipsRepoSource, /task_relationships\.child_task_id IN \(:taskIds\)/, "Relationship summary batches should use array-valued named params for child task ids");
  assert.match(taskRelationshipsRepoSource, /db\.dialect\.boolean\.bind\(true\)/, "Relationship blocking reads should compare blocking state through the boolean seam");
  assert.match(taskRelationshipsRepoSource, /db\.dialect\.boolean\.bind\(Boolean\(value\)\)/, "Relationship writes should bind logical blocking booleans through the dialect seam");
  assert.match(taskRelationshipsRepoSource, /db\.dialect\.boolean\.read\(row\.is_blocking\)/, "Relationship row mapping should read blocking state through the boolean seam");
  assert.match(taskRelationshipsRepoSource, /async function hasPath[\s\S]*db\.get\(`/, "Cycle/path checks should use the provider-neutral single-row read helper");
  assert.doesNotMatch(taskRelationshipsRepoSource, /is_blocking\s*(?:=|!=)\s*1|Number\(row\.is_blocking\)\s*===\s*1/, "Relationship blocking logic should not spell SQLite boolean storage directly");

  assert.match(auditDocs, /0\.33\.5\.27\.10 Task Relationships Repository Conversion[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*1,285 runtime literal-helper invocations[\s\S]*204 direct interpolated SQL operation sites[\s\S]*134 existing bound operation sites/, "audit docs should retain the Task relationships conversion ratchet");
  assert.match(auditDocs, /\| tasks\/task-relationships\.repo \| Converted \| 0 \| 0 \| 12 \| 12 \|/, "audit inventory should mark tasks/task-relationships.repo converted");
  assert.match(auditDocs, /0\.33\.5\.27\.10 Task Relationships Repository Conversion[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*1,285 runtime literal-helper invocations[\s\S]*204 direct interpolated SQL operation sites[\s\S]*134 existing bound operation sites/, "audit docs should record the Task relationships repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.10[\s\S]*`tasks\/task-relationships\.repo`[\s\S]*named params[\s\S]*1,285 remaining helper invocations/, "database docs should record the Task relationships repository conversion");
  assert.match(tasksDocs, /As of version 0\.33\.5\.27\.10[\s\S]*task relationships repository uses named bound params[\s\S]*array-valued task-id params[\s\S]*boolean seam/, "Tasks docs should describe the converted relationship persistence boundary");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.10 - Conversion wave: Task relationships repository[\s\S]*- \[x\] Convert `tasks\/task-relationships\.repo`[\s\S]*- \[x\] Preserve parent\/child reads[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Task relationships repository slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.10 - [\s\S]*Task relationships repository conversion[\s\S]*1,285 helper invocations[\s\S]*204 direct interpolated operation sites[\s\S]*134 bound operation sites/, "changelog should record the Task relationships conversion burndown");
  assert.match(regressionSuite, /scripts\/task-relationships-repository-conversion-regression\.mjs/, "regression suite should include the Task relationships repository conversion proof");
}

async function assertRepositoryLifecycle(session) {
  const parent = (await tasksService.create({ title: "Relationship conversion parent" }, session)).task;
  const blockingChild = (await tasksService.create({ title: "Blocking relationship child" }, session)).task;
  const nonBlockingChild = (await tasksService.create({ title: "Non-blocking relationship child" }, session)).task;
  const grandchild = (await tasksService.create({ title: "Relationship conversion grandchild" }, session)).task;

  assert.equal((await taskRelationshipsRepository.relationshipSummariesForTasks(session.workspace_id, [])).size, 0, "empty relationship summary batches should stay a no-op");

  const blocking = await taskRelationshipsRepository.create(session.workspace_id, {
    child_task_id: blockingChild.task_id,
    created_by_user_id: session.user_id,
    is_blocking: true,
    parent_task_id: parent.task_id,
    updated_by_user_id: session.user_id,
  });
  const nonBlocking = await taskRelationshipsRepository.create(session.workspace_id, {
    child_task_id: nonBlockingChild.task_id,
    created_by_user_id: session.user_id,
    is_blocking: false,
    parent_task_id: parent.task_id,
    updated_by_user_id: session.user_id,
  });
  await taskRelationshipsRepository.create(session.workspace_id, {
    child_task_id: grandchild.task_id,
    created_by_user_id: session.user_id,
    is_blocking: true,
    parent_task_id: blockingChild.task_id,
    updated_by_user_id: session.user_id,
  });

  assert.equal(blocking.is_blocking, true, "created blocking relationship should round-trip as a logical boolean");
  assert.equal(nonBlocking.is_blocking, false, "created non-blocking relationship should round-trip as a logical boolean");
  assert.equal((await taskRelationshipsRepository.readActivePair(session.workspace_id, parent.task_id, blockingChild.task_id)).task_relationship_id, blocking.task_relationship_id);

  const parentRelationships = await taskRelationshipsRepository.readForTask(session.workspace_id, parent.task_id);
  assert.deepEqual(
    new Set(parentRelationships.map((relationship) => relationship.child_task_id)),
    new Set([blockingChild.task_id, nonBlockingChild.task_id]),
    "task relationship reads should include active parent-side children",
  );
  assert.deepEqual(
    new Set((await taskRelationshipsRepository.readChildren(session.workspace_id, parent.task_id)).map((relationship) => relationship.child_task_id)),
    new Set([blockingChild.task_id, nonBlockingChild.task_id]),
    "child reads should preserve both blocking and non-blocking active children",
  );
  assert.deepEqual(
    (await taskRelationshipsRepository.readParents(session.workspace_id, blockingChild.task_id)).map((relationship) => relationship.parent_task_id),
    [parent.task_id],
    "parent reads should expose the active parent relationship",
  );
  assert.deepEqual(
    (await taskRelationshipsRepository.readBlockingChildren(session.workspace_id, parent.task_id)).map((relationship) => relationship.child_task_id),
    [blockingChild.task_id],
    "blocking-child reads should filter through the dialect boolean seam",
  );
  assert.equal(await taskRelationshipsRepository.hasPath(session.workspace_id, parent.task_id, grandchild.task_id), true, "recursive path checks should preserve descendant detection");
  assert.equal(await taskRelationshipsRepository.hasPath(session.workspace_id, grandchild.task_id, parent.task_id), false, "recursive path checks should not invent reverse ancestry");

  assertSummary(await taskRelationshipsRepository.relationshipSummary(session.workspace_id, parent.task_id), {
    blockingChild: 1,
    blockingParent: 0,
    child: 2,
    incompleteBlockingChild: 1,
    parent: 0,
  });
  assertSummary(await taskRelationshipsRepository.relationshipSummary(session.workspace_id, blockingChild.task_id), {
    blockingChild: 1,
    blockingParent: 1,
    child: 1,
    incompleteBlockingChild: 1,
    parent: 1,
  });
  const summaries = await taskRelationshipsRepository.relationshipSummariesForTasks(session.workspace_id, [
    parent.task_id,
    blockingChild.task_id,
    parent.task_id,
  ]);
  assertSummary(summaries.get(parent.task_id), {
    blockingChild: 1,
    blockingParent: 0,
    child: 2,
    incompleteBlockingChild: 1,
    parent: 0,
  });
  assertSummary(summaries.get(blockingChild.task_id), {
    blockingChild: 1,
    blockingParent: 1,
    child: 1,
    incompleteBlockingChild: 1,
    parent: 1,
  });

  const updated = await taskRelationshipsRepository.update(session.workspace_id, {
    ...blocking,
    is_blocking: false,
    updated_by_user_id: session.user_id,
  });
  assert.equal(updated.is_blocking, false, "relationship updates should preserve logical boolean reads");
  assert.deepEqual(await taskRelationshipsRepository.readBlockingChildren(session.workspace_id, parent.task_id), [], "updated non-blocking relationships should leave blocking-child reads");
  assertSummary(await taskRelationshipsRepository.relationshipSummary(session.workspace_id, parent.task_id), {
    blockingChild: 0,
    blockingParent: 0,
    child: 2,
    incompleteBlockingChild: 0,
    parent: 0,
  });

  const removed = await taskRelationshipsRepository.remove(session.workspace_id, blocking.task_relationship_id, session.user_id);
  assert.ok(removed.removed_at, "removed relationship should remain readable by id with lifecycle metadata");
  assert.equal(await taskRelationshipsRepository.readActivePair(session.workspace_id, parent.task_id, blockingChild.task_id), null, "active pair reads should exclude removed relationships");
  assert.deepEqual(
    (await taskRelationshipsRepository.readForTask(session.workspace_id, parent.task_id)).map((relationship) => relationship.child_task_id),
    [nonBlockingChild.task_id],
    "task relationship reads should exclude removed relationships",
  );
  assertSummary(await taskRelationshipsRepository.relationshipSummary(session.workspace_id, parent.task_id), {
    blockingChild: 0,
    blockingParent: 0,
    child: 1,
    incompleteBlockingChild: 0,
    parent: 0,
  });
}

function assertSummary(summary, expected) {
  assert.ok(summary, "relationship summary should be present");
  assert.equal(summary.child_count, expected.child);
  assert.equal(summary.blocking_child_count, expected.blockingChild);
  assert.equal(summary.incomplete_blocking_child_count, expected.incompleteBlockingChild);
  assert.equal(summary.parent_count, expected.parent);
  assert.equal(summary.blocking_parent_count, expected.blockingParent);
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
