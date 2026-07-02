import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-batched-list-enrichment-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-batched-list-enrichment.db");
process.env.SUPER_ADMIN_PASSWORD = "Batched-List-Enrichment-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listEnrichment = readText("src/core/list-enrichment.js");
const listsServiceSource = readText("src/modules/lists/lists.service.js");
const listsRepoSource = readText("src/modules/lists/lists.repo.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const notesServiceSource = readText("src/modules/notes/notes.service.js");
const tasksRepoSource = readText("src/modules/tasks/tasks.repo.js");
const notesRepoSource = readText("src/modules/notes/notes.repo.js");
const clientsRepoSource = readText("src/modules/client-projects/clients.repo.js");
const projectsRepoSource = readText("src/modules/client-projects/projects.repo.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assertStaticContracts();

const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { listsRepository } = await import("../src/modules/lists/lists.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

const counters = {};
const restoreCounters = [
  wrapCounter(listsRepository, "listItems", counters),
  wrapCounter(listsRepository, "listItemsForLists", counters),
  wrapCounter(listsRepository, "listLinks", counters),
  wrapCounter(listsRepository, "listLinksForLists", counters),
  wrapCounter(listsRepository, "readById", counters, "listsReadById"),
  wrapCounter(listsRepository, "readByIds", counters, "listsReadByIds"),
  wrapCounter(clientsRepository, "readById", counters, "clientsReadById"),
  wrapCounter(clientsRepository, "readByIds", counters, "clientsReadByIds"),
  wrapCounter(projectsRepository, "readById", counters, "projectsReadById"),
  wrapCounter(projectsRepository, "readByIds", counters, "projectsReadByIds"),
  wrapCounter(tasksRepository, "readById", counters, "tasksReadById"),
  wrapCounter(tasksRepository, "readByIds", counters, "tasksReadByIds"),
  wrapCounter(notesRepository, "readById", counters, "notesReadById"),
  wrapCounter(notesRepository, "readByIds", counters, "notesReadByIds"),
];

try {
  await initializeDatabase();
  const session = await readSession();
  const fixtures = await seedVisibleListRows(session);

  resetCounters(counters);
  const result = await listsService.list(session, { status: "active", sort: "updated_desc" });
  assert.equal(result.lists.length >= fixtures.listIds.length, true, "seeded visible lists should be returned");

  for (const listId of fixtures.listIds) {
    const list = result.lists.find((entry) => entry.list_id === listId);
    assert.ok(list, `List ${listId} should be present`);
    assert.equal(list.progress.totalItemCount, 2, "Batched item progress should preserve item counts");
    assert.equal(Array.isArray(list.links), true, "Batched link enrichment should preserve links arrays");
    assert.equal(list.sourceContext && typeof list.sourceContext === "object", true, "Batched source context should be present");
  }

  assert.equal(counters.listItems || 0, 0, "Lists index reads should not call listItems once per visible row");
  assert.equal(counters.listItemsForLists || 0, 1, "Lists index reads should batch item progress for visible rows");
  assert.equal(counters.listLinks || 0, 0, "Lists index reads should not call listLinks once per visible row");
  assert.equal(counters.listLinksForLists || 0, 1, "Lists index reads should batch linked records for visible rows");
  assert.equal(counters.listsReadByIds || 0, 1, "Lists index reads should batch source-list context");
  assert.equal(counters.clientsReadById || 0, 0, "Lists linked client targets should not be read one at a time");
  assert.equal(counters.clientsReadByIds || 0, 1, "Lists linked client targets should use one batch read");
  assert.equal(counters.projectsReadById || 0, 0, "Lists linked project targets should not be read one at a time");
  assert.equal(counters.projectsReadByIds || 0, 1, "Lists linked project targets should use one batch read");
  assert.equal(counters.tasksReadById || 0, 0, "Lists linked task targets should not be read one at a time");
  assert.equal(counters.tasksReadByIds || 0, 1, "Lists linked task targets should use one batch read");
  assert.equal(counters.notesReadById || 0, 0, "Lists linked note targets should not be read one at a time");
  assert.equal(counters.notesReadByIds || 0, 1, "Lists linked note targets should use one batch read");

  await assertIntegrity();
  console.log("Batched list enrichment regression passed.");
} finally {
  restoreCounters.forEach((restore) => restore());
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  assert.equal(packageJson.version, "0.33.5.21.3", "package.json should report the current app version");
  assert.equal(packageLock.version, "0.33.5.21.3", "package-lock root should report the current app version");
  assert.equal(packageLock.packages[""].version, "0.33.5.21.3", "package-lock package entry should report the current app version");

  assert.match(listEnrichment, /function createVisibleRecordBatch/, "Framework should expose a visible-record batch helper");
  assert.match(listEnrichment, /function groupRowsByRecordId/, "Framework should expose shared record-id grouping");
  assert.match(listEnrichment, /function mapVisibleRecordBatch/, "Framework should expose batch map shaping");
  assert.match(tasksServiceSource, /createVisibleRecordBatch\(tasks, \{ idField: "task_id" \}\)/, "Tasks list projection should use the shared visible-record batch helper");
  assert.match(tasksServiceSource, /readProgressForTasks\(tasks\[0\]\.workspace_id, batch\.ids\)/, "Tasks checklist progress should remain batched by visible task ids");
  assert.match(tasksRepoSource, /readAssigneesForTasks\([\s\S]*taskRows\.map\(\(task\) => task\.task_id\)/, "Tasks assignee labels should remain batch-read for list rows");
  assert.match(notesServiceSource, /createVisibleRecordBatch\(notes, \{ idField: "note_id" \}\)/, "Notes list access should use the shared visible-record batch helper");
  assert.match(notesServiceSource, /groupRowsByRecordId\(links, \{ idField: "note_id" \}\)/, "Notes linked-context access should use shared batch grouping");
  assert.match(listsRepoSource, /async function listItemsForLists/, "Lists repository should batch item reads for visible lists");
  assert.match(listsRepoSource, /async function listLinksForLists/, "Lists repository should batch link reads for visible lists");
  assert.match(listsRepoSource, /async function readByIds/, "Lists repository should batch source-list reads");
  assert.match(clientsRepoSource, /async function readByIds/, "Clients repository should batch linked client target reads");
  assert.match(projectsRepoSource, /async function readByIds/, "Projects repository should batch linked project target reads");
  assert.match(tasksRepoSource, /async function readByIds/, "Tasks repository should batch linked task target reads");
  assert.match(notesRepoSource, /async function readByIds/, "Notes repository should batch linked note target reads");
  assert.match(listsServiceSource, /async function shapeListsForBrowser/, "Lists service should shape visible rows through one batch pass");
  assert.match(listsServiceSource, /readListProgressSummaries\(session, batch\)/, "Lists service should batch progress enrichment");
  assert.match(listsServiceSource, /readPermissionSafeLinksForLists\(session, listRecords\)/, "Lists service should batch linked-record enrichment");
  assert.match(listsServiceSource, /readLinkedTargetSummariesForLinks\(session, links\)/, "Lists service should batch linked target summaries");
  assert.match(listsServiceSource, /readSourceContextsForLists\(session, batch\)/, "Lists service should batch source-list context");
  assert.match(listsServiceSource, /tagsService\.decorateRecordsForTarget\([\s\S]*"list"[\s\S]*shapedLists/, "Lists tags should decorate shaped visible rows through the existing multi-record tag path");

  assert.match(roadmap, /Completed 0\.33\.5\.20 bounded queries and small-office scale data work is archived/, "Roadmap should point the completed 0.33.5.20 branch to the archive");
  assert.match(changelog, /Version 0\.33\.5\.20\.4[\s\S]*visible-record batching helper/, "Changelog should record the 0.33.5.20.4 release");
  assert.match(regressionSuite, /scripts\/batched-list-enrichment-regression\.mjs/, "Regression suite should include this batched enrichment regression");
}

async function seedVisibleListRows(session) {
  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);
  const client = (await clientsService.createClient({ name: "Batched Enrichment Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Batched Enrichment Project" }, session)).project;
  const task = (await tasksService.create({ project_id: project.id, title: "Batched Linked Task" }, session)).task;
  const note = (await notesService.create({ project_id: project.id, title: "Batched Linked Note" }, session)).note;
  const source = (await listsService.create({
    list_id: "batched-source-list",
    project_id: project.id,
    title: "Batched Source List",
  }, session)).list;
  const targets = [
    { targetId: client.id, targetType: "client" },
    { targetId: project.id, targetType: "project" },
    { targetId: task.task_id, targetType: "task" },
    { targetId: note.note_id, targetType: "note" },
  ];
  const listIds = [];

  for (let index = 0; index < targets.length; index += 1) {
    const list = (await listsService.create({
      list_id: `batched-visible-list-${index + 1}`,
      project_id: project.id,
      source_list_id: source.list_id,
      title: `Batched Visible List ${index + 1}`,
    }, session)).list;
    listIds.push(list.list_id);
    await listsService.createItem(list.list_id, {
      assigned_user_id: session.user_id,
      item_name: `Visible Item ${index + 1}A`,
      needed_by_date: `2026-07-${String(index + 10).padStart(2, "0")}`,
    }, session);
    await listsService.createItem(list.list_id, {
      item_name: `Visible Item ${index + 1}B`,
    }, session);
    await listsService.createLink(list.list_id, targets[index], session);
  }

  return { listIds };
}

function wrapCounter(object, methodName, counters, counterName = methodName) {
  const original = object[methodName];
  assert.equal(typeof original, "function", `${methodName} should exist for instrumentation`);
  object[methodName] = async function countedMethod(...args) {
    counters[counterName] = (counters[counterName] || 0) + 1;
    return original.apply(this, args);
  };

  return () => {
    object[methodName] = original;
  };
}

function resetCounters(counters) {
  for (const key of Object.keys(counters)) {
    counters[key] = 0;
  }
}

async function readSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, workspaces.workspace_id
FROM users
CROSS JOIN workspaces
WHERE users.protected_user = 'yes'
ORDER BY users.user_id, workspaces.workspace_id
LIMIT 1;
`);

  return {
    timezone: "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function readText(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
