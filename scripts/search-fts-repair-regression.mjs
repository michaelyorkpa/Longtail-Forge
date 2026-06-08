import assert from "node:assert/strict";
import { initializeDatabase, querySql, runSql, sqlText } from "../src/db/index.js";
import { searchService } from "../src/services/search.service.js";

await initializeDatabase();

let checks = 0;
const workspaceId = "search-fts-repair-workspace";
const now = "2026-06-08T17:00:00.000Z";

await seedCanonicalRows();

const storage = await searchService.ensureSearchBackendStorage({ refresh: true });

if (!storage.ftsTableReady) {
  await checkAsync("FTS repair skips cleanly when SQLite FTS5 storage is unavailable", async () => {
    const result = await searchService.repairSearchBackendIndex({
      workspaceId,
      moduleId: "developer-example",
      recordType: "example_record",
    });

    assert.equal(result.skipped, true);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.failedCount || 0, 0);
    assert.equal(result.repairedCount, 0);
  });
} else {
  await checkAsync("SQLite FTS repair rebuilds rows from canonical search_index metadata", async () => {
    await corruptFtsRows();
    const beforeMetadata = await readCanonicalMetadata();
    const result = await searchService.repairSearchBackendIndex({
      workspaceId,
      moduleId: "developer-example",
      recordType: "example_record",
    });
    const ftsRows = await querySql(`
SELECT search_index_id, title, body
FROM search_index_fts
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY search_index_id;
`);
    const afterMetadata = await readCanonicalMetadata();

    assert.equal(result.skipped, false);
    assert.equal(result.scannedCount, 2);
    assert.equal(result.rebuiltCount, 2);
    assert.equal(result.missingCount, 1);
    assert.equal(result.orphanedCount, 1);
    assert.equal(result.repairedCount, 2);
    assert.deepEqual(beforeMetadata, afterMetadata, "FTS repair must not mutate canonical metadata");
    assert.deepEqual(ftsRows, [
      {
        search_index_id: `${workspaceId}:developer-example:example_record:fts-record-1`,
        title: "FTS Repair One",
        body: "Canonical body one",
      },
      {
        search_index_id: `${workspaceId}:developer-example:example_record:fts-record-2`,
        title: "FTS Repair Two",
        body: "Canonical body two",
      },
    ]);
  });

  await checkAsync("SQLite FTS repair dry-run reports work without mutating FTS rows", async () => {
    await corruptFtsRows();
    const beforeRows = await readFtsRows();
    const result = await searchService.repairSearchBackendIndex({
      workspaceId,
      moduleId: "developer-example",
      recordType: "example_record",
    }, {
      dryRun: true,
    });
    const afterRows = await readFtsRows();

    assert.equal(result.rebuiltCount, 0);
    assert.equal(result.missingCount, 1);
    assert.equal(result.orphanedCount, 1);
    assert.equal(result.repairedCount, 2);
    assert.deepEqual(afterRows, beforeRows);
  });
}

console.log(`Search FTS repair regression passed ${checks} checks.`);

async function seedCanonicalRows() {
  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search FTS Repair Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

DELETE FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)};

INSERT INTO search_index (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  client_id,
  project_id,
  visibility,
  record_status,
  source,
  record_created_at,
  record_updated_at,
  indexed_at
)
VALUES
  (
    ${sqlText(`${workspaceId}:developer-example:example_record:fts-record-1`)},
    ${sqlText(workspaceId)},
    'developer-example',
    'example_record',
    'fts-record-1',
    'FTS Repair One',
    'Summary one',
    'Canonical body one',
    'tag one',
    'client-1',
    'project-1',
    'normal',
    'active',
    'Example',
    ${sqlText(now)},
    ${sqlText(now)},
    ${sqlText(now)}
  ),
  (
    ${sqlText(`${workspaceId}:developer-example:example_record:fts-record-2`)},
    ${sqlText(workspaceId)},
    'developer-example',
    'example_record',
    'fts-record-2',
    'FTS Repair Two',
    'Summary two',
    'Canonical body two',
    'tag two',
    'client-2',
    'project-2',
    'private',
    'archived',
    'Example',
    ${sqlText(now)},
    ${sqlText(now)},
    ${sqlText(now)}
  );
`);
}

async function corruptFtsRows() {
  await runSql(`
DELETE FROM search_index_fts
WHERE workspace_id = ${sqlText(workspaceId)};

INSERT INTO search_index_fts (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  summary,
  body,
  tags_text,
  source
)
VALUES
  (
    ${sqlText(`${workspaceId}:developer-example:example_record:fts-record-2`)},
    ${sqlText(workspaceId)},
    'developer-example',
    'example_record',
    'fts-record-2',
    'Wrong Title',
    'Wrong summary',
    'Wrong body',
    '',
    'Example'
  ),
  (
    ${sqlText(`${workspaceId}:developer-example:example_record:orphan-record`)},
    ${sqlText(workspaceId)},
    'developer-example',
    'example_record',
    'orphan-record',
    'Orphan Title',
    '',
    'Orphan body',
    '',
    'Example'
  );
`);
}

async function readCanonicalMetadata() {
  return querySql(`
SELECT search_index_id, client_id, project_id, visibility, record_status, source, indexed_at
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY search_index_id;
`);
}

async function readFtsRows() {
  return querySql(`
SELECT search_index_id, title, body
FROM search_index_fts
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY search_index_id;
`);
}

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  checks += 1;
}
