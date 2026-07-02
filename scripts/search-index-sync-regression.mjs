import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clearSearchIndexersForTests, registerSearchIndexer } from "../src/core/search/indexer-registry.js";
import { initializeDatabase, querySql, runSql, sqlText } from "../src/db/index.js";
import {
  registerSearchIndexJobHandlers,
} from "../src/services/search-index-jobs.service.js";
import { searchIndexSyncService } from "../src/services/search-index-sync.service.js";
import {
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
} from "../src/core/jobs/index.js";

await initializeDatabase();

let checks = 0;

const taskService = readText("src/modules/tasks/tasks.service.js");
const timeEntryService = readText("src/modules/time-tracking/time-entries.service.js");
const clientProjectService = readText("src/modules/client-projects/clients.service.js");
const timeEntryRepository = readText("src/modules/time-tracking/time-entries.repo.js");
const syncService = readText("src/services/search-index-sync.service.js");

check("module services own search index sync side effects", () => {
  assert.match(taskService, /search-index-sync\.service\.js/);
  assert.match(timeEntryService, /search-index-sync\.service\.js/);
  assert.match(clientProjectService, /search-index-sync\.service\.js/);
  assert.doesNotMatch(readPublicJavascript(), /searchIndexSyncService|reindexSearchRecord|removeSearchDocument/);
});

check("task create update archive and restore flows re-index canonical task rows", () => {
  for (const reason of [
    "task.created",
    "task.updated",
    "task.completed",
    "task.reopened",
    "task.archived",
    "task.restored",
    "task.recurrence_instance_created",
  ]) {
    assert.ok(taskService.includes(reason), `${reason} should be wired to task search sync`);
  }
  assert.match(taskService, /moduleId:\s*TASKS_MODULE_ID/);
  assert.match(taskService, /recordType:\s*"task"/);
});

check("time entry create update and hard delete flows update canonical search rows", () => {
  assert.ok(timeEntryService.includes("time_entry.created"));
  assert.ok(timeEntryService.includes("time_entry.updated"));
  assert.ok(timeEntryService.includes("time_entry.deleted"));
  assert.match(timeEntryService, /removeRecord\(\{/);
  assert.match(timeEntryRepository, /async function readByProjectId/);
});

check("client project mutations re-index affected client project and downstream time entry rows", () => {
  for (const reason of [
    "client.created",
    "client.updated",
    "client.archived",
    "client.archived_projects",
    "project.created",
    "project.updated",
    "project.updated_time_entries",
    "project.archived",
  ]) {
    assert.ok(clientProjectService.includes(reason), `${reason} should be wired to client/project search sync`);
  }
  assert.match(clientProjectService, /syncProjectSearchIndexForClient/);
  assert.match(clientProjectService, /syncTimeEntrySearchIndexForProject/);
  assert.match(clientProjectService, /readByProjectId/);
});

check("search sync helper logs failed indexing without throwing", () => {
  assert.match(syncService, /logger\.error/);
  assert.doesNotMatch(syncService, /throw result|throw error/);
  assert.match(syncService, /queueSearchIndexRecord/);
  assert.match(syncService, /queueSearchIndexRemoval/);
});

await checkAsync("search sync helper queues jobs and the worker re-indexes removes and retries failures", async () => {
  resetJobWorkerStatusForTests();
  registerSearchIndexJobHandlers({ replace: true });
  clearSearchIndexersForTests();
  const workspaceId = "search-index-sync-workspace";
  const now = "2026-06-08T15:00:00.000Z";
  const searchableType = {
    recordType: "example_record",
    moduleId: "developer-example",
    idField: "example_id",
    titleField: "title",
    summaryField: "summary",
    bodyFields: ["body"],
    workspaceField: "workspace_id",
    requiredReadPermission: "developer_example.view",
    indexer: "developer-example.records",
    requiredModules: ["developer-example"],
    sourceLabel: "Example",
  };

  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Index Sync Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});
`);

  const unregisterIndexer = registerSearchIndexer("developer-example.records", async ({ workspaceId: indexWorkspaceId, recordId }) => ({
    workspace_id: indexWorkspaceId,
    example_id: recordId,
    title: "Synced event record",
    summary: "Created by sync helper",
    body: "Search index sync regression body",
    indexed_at: now,
  }));
  const reindexResult = await searchIndexSyncService.reindexRecord({
    searchableType,
    workspaceId,
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "sync-record-1",
    reason: "regression.reindex",
  });
  const queuedRows = await querySql(`
SELECT job_type, status, dedupe_key
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'search.index'
  AND status = 'pending';
`);

  assert.equal(reindexResult.ok, true);
  assert.equal(reindexResult.operation, "queue_reindex");
  assert.equal(queuedRows.length, 1);
  assert.match(queuedRows[0].dedupe_key, /search:reindex/);

  const reindexSummary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "search-index-sync-regression",
  });
  const indexedRows = await querySql(`
SELECT title
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'sync-record-1';
`);

  assert.equal(reindexSummary.completed, 1);
  assert.deepEqual(indexedRows, [{ title: "Synced event record" }]);
  unregisterIndexer();

  const removeResult = await searchIndexSyncService.removeRecord({
    workspaceId,
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "sync-record-1",
    reason: "regression.remove",
  });
  const removeSummary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "search-index-sync-regression",
  });
  const removedRows = await querySql(`
SELECT search_index_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'sync-record-1';
`);

  assert.equal(removeResult.ok, true);
  assert.equal(removeResult.operation, "queue_remove");
  assert.equal(removeSummary.completed, 1);
  assert.deepEqual(removedRows, []);

  const loggedMessages = [];
  const missingContextResult = await searchIndexSyncService.reindexRecord({
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "sync-record-missing-workspace",
    reason: "regression.queue_failure",
  }, {
    logger: {
      error(message) {
        loggedMessages.push(message);
      },
    },
  });

  assert.equal(missingContextResult.ok, false);
  assert.match(loggedMessages.join("\n"), /regression\.queue_failure failed for developer-example\/example_record\/sync-record-missing-workspace/);

  const failingUnregister = registerSearchIndexer("developer-example.records", async () => {
    throw new Error("synthetic indexing failure");
  });
  const failedResult = await searchIndexSyncService.reindexRecord({
    searchableType,
    workspaceId,
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "sync-record-fail",
    reason: "regression.failure",
  });
  const beforeFailureRun = Date.now();
  const failedSummary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "search-index-sync-regression",
  });
  const failedJob = (await querySql(`
SELECT status, attempt_count, last_error, available_at
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'search.index'
  AND dedupe_key LIKE '%sync-record-fail'
LIMIT 1;
`))[0];

  assert.equal(failedResult.ok, true);
  assert.equal(failedSummary.failed, 1);
  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.attempt_count, 1);
  assert.match(failedJob.last_error, /synthetic indexing failure/);
  assert.ok(Date.parse(failedJob.available_at) > beforeFailureRun, "failed search jobs should be scheduled for retry");
  failingUnregister();
  clearSearchIndexersForTests();
});

console.log(`Search index sync regression passed ${checks} checks.`);

function check(name, assertion) {
  assert.equal(typeof name, "string");
  assertion();
  checks += 1;
}

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  checks += 1;
}

function readText(relativePath) {
  return readFileSync(relativePath, "utf8");
}

function readPublicJavascript() {
  return collectFiles("public/js")
    .filter((filePath) => filePath.endsWith(".js"))
    .map((filePath) => readText(filePath))
    .join("\n");
}

function collectFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const filePath = join(directory, entry);
      return statSync(filePath).isDirectory() ? collectFiles(filePath) : [filePath];
    });
}
