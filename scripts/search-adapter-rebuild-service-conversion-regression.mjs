import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-adapter-rebuild-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-adapter-rebuild-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Search-Adapter-Rebuild-Conversion-Test-123!";

const rebuildServiceSource = readText("src/services/search-index-rebuild.service.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const tagTextSource = readText("src/core/search/tag-text.js");
const searchServiceSource = readText("src/services/search.service.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");
const { searchService } = await import("../src/services/search.service.js");
const { registerFrameworkHelpSearchIndexers } = await import("../src/core/help/search-indexers.js");
const { activateModuleRuntime } = await import("../src/core/modules/module-runtime.js");

try {
  assertStaticContract();

  await initializeDatabase();
  registerFrameworkHelpSearchIndexers();
  activateModuleRuntime("worker");
  await seedWorkspace();
  await assertRebuildServiceRuntime();
  await assertIntegrity();

  console.log("Search adapter and rebuild service conversion regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

  assert.match(rebuildServiceSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "search rebuild service should import the provider-neutral db facade");
  assert.doesNotMatch(rebuildServiceSource, /\.\.\/db\/index\.js/, "search rebuild service should not import legacy db helpers after conversion");
  assert.doesNotMatch(rebuildServiceSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "search rebuild service should be fully off literal helpers");
  assert.equal(countMatches(rebuildServiceSource, /\bdb\.query\(/g), 2, "search rebuild service should keep the two search_index reads as bound db.query calls");
  assert.match(rebuildServiceSource, /WHERE workspace_id = :workspaceId[\s\S]*moduleFilter[\s\S]*ORDER BY module_id, record_type, record_id/, "inactive-row cleanup should bind workspace/module filters");
  assert.match(rebuildServiceSource, /WHERE workspace_id = :workspaceId[\s\S]*AND module_id = :moduleId[\s\S]*AND record_type = :recordType/, "stale record cleanup should bind workspace, module, and record type");

  assert.match(sqliteSearchAdapterSource, /import \{ createBulkValuesBindings, db \} from "\.\.\/\.\.\/database\.js";/, "SQLite search adapter should keep the core search adapter db seam");
  assert.doesNotMatch(sqliteSearchAdapterSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "SQLite search adapter should remain off literal helpers");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.createVirtualTable/, "SQLite search adapter should own provider search storage through the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.match/, "SQLite search adapter should own MATCH lowering through the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.search\.rank/, "SQLite search adapter should own ranking lowering through the dialect seam");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.comparison\.containsNoCase/, "SQLite search adapter should own indexed LIKE fallback lowering through the comparison seam");
  assert.match(sqliteSearchAdapterSource, /createBulkValuesBindings/, "canonical search_index upserts should keep the bulk VALUES binding helper");

  assert.match(tagTextSource, /import \{ db \} from "\.\.\/database\.js";/, "search tag-text helper should keep the provider-neutral db facade");
  assert.doesNotMatch(tagTextSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "search tag-text helper should remain off literal helpers");
  assert.match(tagTextSource, /workspace_id = :workspaceId[\s\S]*target_type = :targetType[\s\S]*target_id = :targetId/, "search tag-text helper should keep bound workspace/target reads");

  assert.match(searchServiceSource, /backendNeutralQueryModel: true/, "search service should keep callers on backend-neutral request models");
  assert.match(searchServiceSource, /adapterSyntax: null/, "permission-safe search request shaping should not emit backend syntax");

  assert.match(auditDocs, /## Baseline-driven workflow[\s\S]*npm run audit:params:check[\s\S]*Do not update the baseline in unrelated feature work/, "audit docs should record the current baseline-driven parameter-binding ratchet");
  assert.match(auditDocs, /\| services\/search-index-rebuild\.service \| Converted \| 0 \| 0 \| 2 \| 2 \|/, "audit inventory should mark the search rebuild service converted");
  assert.match(auditDocs, /\| core\/search\/adapters\/sqlite-search-adapter \| Converted \| 0 \| 0 \| 13 \| 17 \|/, "audit inventory should keep the SQLite search adapter converted");
  assert.match(auditDocs, /\| core\/search\/tag-text \| Converted \| 0 \| 0 \| 1 \| 1 \|/, "audit inventory should keep search tag-text converted");
  assert.match(auditDocs, /0\.33\.5\.27\.25 Search Adapter and Rebuild Service Conversion[\s\S]*`services\/search-index-rebuild\.service` is converted[\s\S]*362 runtime literal-helper invocations[\s\S]*66 direct interpolated SQL operation sites[\s\S]*293 existing bound operation sites/, "audit docs should record the Search adapter/rebuild service conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.25[\s\S]*`services\/search-index-rebuild\.service` is converted[\s\S]*362 remaining helper invocations/, "database docs should record the concrete Search adapter/rebuild service conversion");
}

async function seedWorkspace() {
  const now = "2026-07-06T16:00:00.000Z";
  const workspaceId = "search-adapter-rebuild-conversion-workspace";

  await db.run(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (:workspaceId, 'Search Adapter Rebuild Conversion Workspace', 'Active', 'business', :now, :now);
`, {
    now,
    workspaceId,
  });

  for (const moduleId of ["tasks", "time-tracking"]) {
    await db.run(`
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (:workspaceId, :moduleId, 'enabled', :now, NULL, :now)
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(workspace_modules.enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;
`, {
      moduleId,
      now,
      workspaceId,
    });
  }
}

async function assertRebuildServiceRuntime() {
  const workspaceId = "search-adapter-rebuild-conversion-workspace";
  const staleTaskRecordId = "stale-task-conversion";
  const inactiveTaskRecordId = "inactive-task-type-conversion";
  const staleTimeEntryRecordId = "stale-time-entry-conversion";

  await insertSearchRow({
    moduleId: "tasks",
    recordId: staleTaskRecordId,
    recordType: "task",
    title: "Stale task conversion row",
    workspaceId,
  });
  await insertSearchRow({
    moduleId: "tasks",
    recordId: inactiveTaskRecordId,
    recordType: "legacy_task_type",
    title: "Inactive task type conversion row",
    workspaceId,
  });
  await insertSearchRow({
    moduleId: "time-tracking",
    recordId: staleTimeEntryRecordId,
    recordType: "time_entry",
    title: "Stale time entry conversion row",
    workspaceId,
  });

  const moduleSummary = await searchIndexRebuildService.rebuildModule({
    audit: false,
    moduleId: "tasks",
    workspaceId,
  });
  const afterTaskModuleRows = await readRows(workspaceId, [
    inactiveTaskRecordId,
    staleTaskRecordId,
    staleTimeEntryRecordId,
  ]);

  assert.equal(moduleSummary.moduleId, "tasks");
  assert.equal(moduleSummary.counts.failed, 0, "module rebuild should complete without failures");
  assert.equal(moduleSummary.counts.removed, 2, "module rebuild should remove stale task rows and inactive task record types");
  assert.deepEqual(
    afterTaskModuleRows.map((row) => `${row.module_id}:${row.record_type}:${row.record_id}`),
    [`time-tracking:time_entry:${staleTimeEntryRecordId}`],
    "module rebuild should keep other modules untouched by the bound module filter",
  );

  const workspaceSummary = await searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    workspaceId,
  });
  const afterWorkspaceRows = await readRows(workspaceId, [
    inactiveTaskRecordId,
    staleTaskRecordId,
    staleTimeEntryRecordId,
  ]);
  const searchResult = await searchService.executeSearch({
    limit: 10,
    offset: 0,
    targets: [{ moduleId: "tasks", recordType: "task" }],
    text: "Stale task conversion row",
    workspaceId,
  }, {
    forceFallback: true,
  });

  assert.equal(workspaceSummary.counts.failed, 0, "workspace rebuild should complete without failures");
  assert.ok(workspaceSummary.counts.removed >= 1, "workspace rebuild should remove the remaining stale time-entry row");
  assert.deepEqual(afterWorkspaceRows, [], "workspace rebuild should remove remaining stale canonical rows through bound reads");
  assert.deepEqual(searchResult.results, [], "stale canonical rows should not remain discoverable through indexed LIKE fallback");
}

/**
 * One canonical `search_index` row this owner seeds, named as a single seam
 * input rather than five separately annotated bindings.
 * @typedef {{
 *   moduleId: string,
 *   recordId: string,
 *   recordType: string,
 *   title: string,
 *   workspaceId: string,
 * }} SeamRowInput
 */

/** @param {SeamRowInput} input */
async function insertSearchRow({
  moduleId,
  recordId,
  recordType,
  title,
  workspaceId,
}) {
  const now = "2026-07-06T16:05:00.000Z";

  await db.run(`
INSERT OR REPLACE INTO search_index (
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
VALUES (
  :searchIndexId,
  :workspaceId,
  :moduleId,
  :recordType,
  :recordId,
  :title,
  '',
  :title,
  '',
  NULL,
  NULL,
  'normal',
  'active',
  'Regression',
  NULL,
  NULL,
  :now
);
`, {
    moduleId,
    now,
    recordId,
    recordType,
    searchIndexId: `${workspaceId}:${moduleId}:${recordType}:${recordId}`,
    title,
    workspaceId,
  });
}

/** @param {string} workspaceId @param {string[]} recordIds */
async function readRows(workspaceId, recordIds) {
  return db.query(`
SELECT module_id, record_type, record_id
FROM search_index
WHERE workspace_id = :workspaceId
  AND record_id IN (:recordIds)
ORDER BY module_id, record_type, record_id;
`, {
    recordIds,
    workspaceId,
  });
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "Search adapter/rebuild service conversion database should pass integrity check");
}

/** @param {string} source @param {RegExp} pattern @returns {number} */
function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
