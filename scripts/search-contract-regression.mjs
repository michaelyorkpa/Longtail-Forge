import assert from "node:assert/strict";
import { validateModuleManifest } from "../src/core/modules/manifest-contract.js";
import { modulesService } from "../src/core/modules/modules.service.js";
import { listSearchBackendAdapters } from "../src/core/search/adapters/registry.js";
import { clearSqliteSearchAdapterCapabilityCacheForTests } from "../src/core/search/adapters/sqlite-search-adapter.js";
import {
  clearSearchIndexersForTests,
  getSearchIndexer,
  hasSearchIndexer,
  registerSearchIndexer,
} from "../src/core/search/indexer-registry.js";
import { initializeDatabase, querySql, runSql, sqlText } from "../src/db/index.js";
import { registerClientProjectsSearchIndexers } from "../src/modules/client-projects/search-indexers.js";
import { registerTasksSearchIndexers } from "../src/modules/tasks/search-indexers.js";
import { registerTimeTrackingSearchIndexers } from "../src/modules/time-tracking/search-indexers.js";
import { searchService } from "../src/services/search.service.js";

await initializeDatabase();

let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

const sampleSearchableType = {
  recordType: "example_record",
  moduleId: "developer-example",
  idField: "example_id",
  titleField: "title",
  summaryField: "summary",
  bodyFields: ["body", "notes"],
  workspaceField: "workspace_id",
  clientField: "client_id",
  projectField: "project_id",
  requiredReadPermission: "developer_example.view",
  indexer: "developer-example.records",
  requiredModules: ["developer-example"],
  tagsTextField: "tags_text",
  visibilityField: "visibility",
  recordStatusField: "status",
  sourceLabel: "Example",
};

check("search capabilities expose framework-owned adapter-backed boundary", () => {
  const capabilities = searchService.getCapabilities();

  assert.equal(capabilities.owner, "framework");
  assert.equal(capabilities.serviceVersion, "0.32.9.3");
  assert.equal(capabilities.workspaceAware, true);
  assert.equal(capabilities.moduleAware, true);
  assert.equal(capabilities.permissionAware, true);
  assert.equal(capabilities.tagAware, true);
  assert.equal(capabilities.notificationRecordSearchDeferred, true);
  assert.equal(capabilities.adapterBacked, true);
  assert.equal(capabilities.canonicalIndexEnabled, true);
  assert.equal(capabilities.canonicalIndexTable, "search_index");
  assert.equal(capabilities.prototypeIndexWritesEnabled, true);
  assert.equal(capabilities.prototypeSearchEnabled, true);
  assert.equal(capabilities.defaultAdapterId, "sqlite");
  assert.equal(capabilities.backendNeutralQueryModel, true);
  assert.equal(capabilities.disabledModulesHiddenFromActiveSearch, true);
  assert.equal(
    capabilities.metadataSemantics.visibility,
    "search_visibility_metadata_not_permission_source",
  );
  assert.equal(capabilities.globalApiEnabled, true);
  assert.equal(capabilities.globalBrowserUiEnabled, false);
  assert.equal(capabilities.recordIndexingEnabled, true);
  assert.equal(capabilities.rebuildToolsEnabled, true);
  assert.equal(capabilities.ftsRepairToolsEnabled, true);
  assert.ok(capabilities.availableAdapters.some((adapter) => adapter.id === "sqlite"));
});

check("search backend adapter registry exposes the SQLite adapter contract", () => {
  const adapters = listSearchBackendAdapters();
  const sqliteAdapter = adapters.find((adapter) => adapter.id === "sqlite");

  assert.ok(sqliteAdapter);
  assert.equal(sqliteAdapter.engine, "sqlite");
  assert.equal(sqliteAdapter.label, "SQLite Search Adapter");
});

check("search indexer registry resolves stable string IDs to backend functions", () => {
  clearSearchIndexersForTests();

  const indexer = () => ({ documents: [] });
  const unregister = registerSearchIndexer("developer-example.records", indexer);

  assert.equal(hasSearchIndexer("developer-example.records"), true);
  assert.equal(getSearchIndexer("developer-example.records"), indexer);
  assert.deepEqual(searchService.getCapabilities().registeredIndexerIds, ["developer-example.records"]);

  unregister();

  assert.equal(hasSearchIndexer("developer-example.records"), false);
});

check("searchable declaration validation requires registry string IDs instead of functions", () => {
  const invalid = searchService.validateSearchableTypeDeclaration({
    ...sampleSearchableType,
    indexer: () => ({ documents: [] }),
  });

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("not a direct function reference")));

  const valid = searchService.validateSearchableTypeDeclaration(sampleSearchableType);

  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.declaration.indexer, "developer-example.records");
});

check("searchable declaration validation can require a registered indexer", () => {
  clearSearchIndexersForTests();

  const missing = searchService.validateSearchableTypeDeclaration(sampleSearchableType, {
    requireRegisteredIndexer: true,
  });

  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.includes("is not registered")));

  const unregister = registerSearchIndexer("developer-example.records", () => ({ documents: [] }));
  const valid = searchService.validateSearchableTypeDeclaration(sampleSearchableType, {
    requireRegisteredIndexer: true,
  });

  assert.equal(valid.valid, true);
  unregister();
});

check("manifest validation accepts well-formed searchableTypes and rejects direct function indexers", () => {
  const manifest = {
    id: "developer-example",
    name: "Developer Example",
    displayName: "Developer Example",
    description: "Example module.",
    category: "example",
    version: "0.32.8.6",
    enabledByDefault: false,
    searchableTypes: [sampleSearchableType],
  };

  assert.deepEqual(validateModuleManifest(manifest, new Set(["developer-example"])), []);

  const invalidManifest = {
    ...manifest,
    searchableTypes: [{
      ...sampleSearchableType,
      indexer: () => ({ documents: [] }),
    }],
  };

  assert.ok(validateModuleManifest(invalidManifest, new Set(["developer-example"]))
    .some((error) => error.includes("searchableTypes[0].indexer")));
});

check("search service composes permission-safe filter models inside the active workspace", () => {
  const request = searchService.composePermissionSafeSearchFilters({
    session: {
      workspace_id: "workspace-1",
      user_id: "user-1",
    },
    searchableType: sampleSearchableType,
    filters: {
      text: "  invoice copy ",
      clientId: "client-1",
      projectId: "project-1",
      tagIds: ["tag-1", "", "tag-2"],
      status: "active",
      visibility: "normal",
    },
  });

  assert.equal(request.workspaceId, "workspace-1");
  assert.equal(request.moduleId, "developer-example");
  assert.equal(request.recordType, "example_record");
  assert.equal(request.requiredReadPermission, "developer_example.view");
  assert.deepEqual(request.requiredModules, ["developer-example"]);
  assert.equal(request.permissionFilterRequired, true);
  assert.equal(request.moduleMustBeEnabled, true);
  assert.equal(request.text, "invoice copy");
  assert.deepEqual(request.scopes, {
    clientId: "client-1",
    projectId: "project-1",
  });
  assert.deepEqual(request.exactTagIds, ["tag-1", "tag-2"]);
  assert.equal(request.recordStatus, "active");
  assert.equal(request.visibility, "normal");
  assert.equal(request.source, null);
  assert.equal(request.tagFilterSource, "canonical_tag_assignments");
  assert.equal(request.metadataSemantics.source, "display_source_label_not_permission_source");
});

check("search filters cannot escape the active workspace", () => {
  assert.throws(
    () => searchService.composePermissionSafeSearchFilters({
      session: {
        workspace_id: "workspace-1",
      },
      searchableType: sampleSearchableType,
      filters: {
        workspaceId: "workspace-2",
      },
    }),
    /active workspace/,
  );
});

check("registered module searchable type list is registry-driven", () => {
  const searchableTypes = modulesService.listSearchableTypes();
  const serviceTypes = searchService.listSearchableTypes();
  const serviceTypeIds = serviceTypes.map((type) => `${type.moduleId}:${type.recordType}`).sort();

  assert.equal(Array.isArray(searchableTypes), true);
  for (const moduleType of searchableTypes) {
    assert.ok(serviceTypeIds.includes(`${moduleType.moduleId}:${moduleType.recordType}`));
  }
  assert.ok(serviceTypeIds.includes("framework:help_article"));
  assert.ok(serviceTypes.every((type) => type.indexer && type.requiredReadPermission));
});

check("searchable declaration validation requires body fields", () => {
  const result = searchService.validateSearchableTypeDeclaration({
    ...sampleSearchableType,
    bodyFields: undefined,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("bodyFields is required")));
});

await checkAsync("active searchable type list excludes disabled or missing modules", async () => {
  const rawTypes = searchService.listSearchableTypes();
  const activeTypes = await searchService.listActiveSearchableTypes("workspace-with-no-enabled-modules");

  assert.ok(rawTypes.some((type) => type.moduleId === "developer-example"));
  assert.deepEqual(activeTypes, []);
});

await checkAsync("permission-safe search request hides disabled modules and stays adapter-neutral", async () => {
  const inactiveRequest = await searchService.composePermissionSafeSearchRequest({
    session: {
      workspace_id: "workspace-with-no-enabled-modules",
      user_id: "user-1",
    },
    filters: {
      text: "alpha NEAR beta",
      moduleId: "developer-example",
      recordType: "developer_example",
      tagIds: ["tag-1", "", "tag-2"],
      status: "active",
      visibility: "normal",
    },
  });

  assert.equal(inactiveRequest.workspaceId, "workspace-with-no-enabled-modules");
  assert.equal(inactiveRequest.backendNeutral, true);
  assert.equal(inactiveRequest.adapterSyntax, null);
  assert.equal(inactiveRequest.text, "alpha NEAR beta");
  assert.equal(inactiveRequest.disabledModulePolicy, "hide_active_search_results");
  assert.equal(inactiveRequest.permissionPolicy, "require_declared_read_permission_per_target");
  assert.equal(inactiveRequest.tagFilterSource, "canonical_tag_assignments");
  assert.deepEqual(inactiveRequest.exactTagIds, ["tag-1", "tag-2"]);
  assert.equal(inactiveRequest.recordStatus, "active");
  assert.equal(inactiveRequest.visibility, "normal");
  assert.deepEqual(inactiveRequest.targets, []);
});

await checkAsync("permission-safe search request carries per-target read permissions for enabled modules", async () => {
  const workspaceId = "search-contract-enabled-workspace";
  const now = new Date().toISOString();

  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Contract Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'developer-example', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)})
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;
`);

  const request = await searchService.composePermissionSafeSearchRequest({
    session: {
      workspace_id: workspaceId,
      user_id: "user-1",
    },
    filters: {
      moduleIds: ["developer-example"],
      recordTypes: ["developer_example"],
      clientId: "client-1",
      projectId: "project-1",
    },
  });
  const target = request.targets.find((item) => item.moduleId === "developer-example");

  assert.ok(target);
  assert.equal(target.workspaceId, workspaceId);
  assert.equal(target.recordType, "developer_example");
  assert.equal(target.requiredReadPermission, "developer_example.view");
  assert.equal(target.permissionFilterRequired, true);
  assert.equal(target.moduleMustBeEnabled, true);
  assert.deepEqual(target.scopes, {
    clientId: "client-1",
    projectId: "project-1",
  });
  assert.equal(target.fields.workspace, "workspace_id");
  assert.equal(target.fields.tagsText, null);
});

await checkAsync("permission-safe search request cannot escape the active workspace", async () => {
  await assert.rejects(
    () => searchService.composePermissionSafeSearchRequest({
      session: {
        workspace_id: "workspace-1",
      },
      filters: {
        workspaceId: "workspace-2",
      },
    }),
    /active workspace/,
  );
});

check("module indexer documents normalize to framework search_index shape", () => {
  const normalized = searchService.normalizeSearchDocument(sampleSearchableType, {
    workspace_id: "workspace-1",
    example_id: "record-1",
    title: "  Search Title ",
    summary: " Summary text ",
    body: "Custom body",
    tags_text: ["urgent", { name: "Client" }, { slug: "internal" }],
    client_id: "client-1",
    project_id: "project-1",
    library_bucket: "reference",
    visibility: "",
    status: "open",
    created_at: "2026-06-08T10:00:00.000Z",
    updated_at: "2026-06-08T11:00:00.000Z",
    indexed_at: "2026-06-08T12:00:00.000Z",
  });

  assert.deepEqual(normalized, {
    search_index_id: "workspace-1:developer-example:example_record:record-1",
    workspace_id: "workspace-1",
    module_id: "developer-example",
    record_type: "example_record",
    record_id: "record-1",
    title: "Search Title",
    summary: "Summary text",
    body: "Custom body",
    tags_text: "urgent Client internal",
    client_id: "client-1",
    project_id: "project-1",
    library_bucket: "reference",
    visibility: "normal",
    record_status: "open",
    source: "Example",
    record_created_at: "2026-06-08T10:00:00.000Z",
    record_updated_at: "2026-06-08T11:00:00.000Z",
    indexed_at: "2026-06-08T12:00:00.000Z",
  });

  assert.throws(
    () => searchService.normalizeSearchDocument(sampleSearchableType, {
      workspace_id: "workspace-1",
      recordType: "wrong",
      example_id: "record-1",
    }),
    /recordType must match/,
  );
});

await checkAsync("runtime capabilities report SQLite FTS5 support or indexed LIKE fallback", async () => {
  clearSqliteSearchAdapterCapabilityCacheForTests();

  const capabilities = await searchService.getRuntimeCapabilities({ refresh: true });

  assert.equal(capabilities.serviceVersion, "0.32.9.3");
  assert.equal(capabilities.backend.adapterId, "sqlite");
  assert.equal(capabilities.backend.engine, "sqlite");
  assert.equal(typeof capabilities.backend.fts5Supported, "boolean");
  assert.equal(capabilities.backend.externalSearchRequired, false);
  assert.equal(capabilities.backend.supportsPostgresFullText, false);
  assert.equal(capabilities.backend.supportsExternalSearchEngines, false);
  assert.equal(capabilities.backend.supportsRecordIndexing, true);
  assert.equal(capabilities.backend.supportsRebuildTools, true);
  assert.equal(capabilities.backend.supportsFtsRepair, true);
  assert.equal(capabilities.backend.supportsPrototypeIndexWrites, false);
  assert.equal(capabilities.backend.supportsPrototypeSearch, true);
  assert.ok(["sqlite-fts5", "sqlite-like"].includes(capabilities.backend.activeBackend));
  assert.ok(["none", "indexed-like"].includes(capabilities.backend.fallbackMode));

  if (capabilities.backend.fts5Supported) {
    assert.equal(capabilities.backend.activeBackend, "sqlite-fts5");
    assert.equal(capabilities.backend.fallbackMode, "none");
  } else {
    assert.equal(capabilities.backend.activeBackend, "sqlite-like");
    assert.equal(capabilities.backend.fallbackMode, "indexed-like");
  }
});

await checkAsync("SQLite search backend setup creates FTS storage only when supported", async () => {
  const storage = await searchService.ensureSearchBackendStorage({ refresh: true });
  const ftsTables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name LIKE 'search_index_fts%'
ORDER BY name;
`);
  const ftsTableNames = ftsTables.map((row) => row.name);

  assert.equal(storage.adapterId, "sqlite");
  assert.equal(typeof storage.fts5Supported, "boolean");

  if (storage.fts5Supported) {
    assert.equal(storage.ftsTableReady, true);
    assert.ok(ftsTableNames.includes("search_index_fts"));
  } else {
    assert.equal(storage.ftsTableReady, false);
    assert.deepEqual(ftsTableNames, []);
  }
});

await checkAsync("SQLite search prototype syncs search_index writes and executes FTS or fallback lookup", async () => {
  const workspaceId = "search-contract-lookup-workspace";
  const now = new Date().toISOString();
  const developerSearchableType = searchService
    .listSearchableTypes()
    .find((type) => type.moduleId === "developer-example" && type.recordType === "developer_example");

  assert.ok(developerSearchableType);

  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Lookup Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'developer-example', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)})
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO tags (tag_id, workspace_id, name, slug, description, color, status, created_at, updated_at)
VALUES ('search-contract-tag-1', ${sqlText(workspaceId)}, 'Launch', 'launch', '', NULL, 'active', ${sqlText(now)}, ${sqlText(now)});
`);

  const documents = [
    searchService.normalizeSearchDocument(developerSearchableType, {
      workspace_id: workspaceId,
      developer_example_id: "search-record-1",
      title: "Alpha launch notes",
      summary: "Customer rollout plan",
      body: "The beta customer needs an alpha launch checklist.",
      tags_text: "launch customer",
      client_id: "client-1",
      project_id: "project-1",
      recordStatus: "active",
      indexed_at: "2026-06-08T13:00:00.000Z",
    }),
    searchService.normalizeSearchDocument(developerSearchableType, {
      workspace_id: workspaceId,
      developer_example_id: "search-record-2",
      title: "Billing cleanup",
      summary: "Internal accounting note",
      body: "Remove old setup notes.",
      tags_text: "internal billing",
      client_id: "client-1",
      project_id: "project-1",
      recordStatus: "archived",
      indexed_at: "2026-06-08T13:01:00.000Z",
    }),
    searchService.normalizeSearchDocument(developerSearchableType, {
      workspace_id: workspaceId,
      developer_example_id: "search-record-3",
      title: "Alpha launch follow-up",
      summary: "Different project plan",
      body: "The beta customer needs an alpha launch checklist.",
      tags_text: "launch customer",
      client_id: "client-2",
      project_id: "project-2",
      recordStatus: "active",
      indexed_at: "2026-06-08T13:02:00.000Z",
    }),
  ];

  const writeResult = await searchService.upsertSearchDocuments(documents);

  assert.equal(writeResult.indexedCount, 3);
  assert.equal(writeResult.ftsSyncedCount, writeResult.storage.ftsTableReady ? 3 : 0);

  await runSql(`
INSERT OR REPLACE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source,
  created_at
)
VALUES (
  'search-contract-assignment-1',
  ${sqlText(workspaceId)},
  'search-contract-tag-1',
  'developer_example',
  'search-record-1',
  'manual',
  ${sqlText(now)}
);

INSERT OR REPLACE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source,
  created_at
)
VALUES (
  'search-contract-assignment-3',
  ${sqlText(workspaceId)},
  'search-contract-tag-1',
  'developer_example',
  'search-record-3',
  'manual',
  ${sqlText(now)}
);
`);

  const request = await searchService.composePermissionSafeSearchRequest({
    session: {
      workspace_id: workspaceId,
      user_id: "user-1",
    },
    filters: {
      text: "alpha launch",
      moduleId: "developer-example",
      recordType: "developer_example",
      clientId: "client-1",
      projectId: "project-1",
      tagIds: ["search-contract-tag-1"],
      recordStatus: "active",
    },
  });
  const fallbackResult = await searchService.executeSearch(request, { forceFallback: true });
  const preferredResult = await searchService.executeSearch(request);

  assert.equal(fallbackResult.backend, "sqlite-like");
  assert.equal(fallbackResult.fallbackMode, "indexed-like");
  assert.deepEqual(fallbackResult.results.map((result) => result.record_id), ["search-record-1"]);
  assert.ok(["sqlite-fts5", "sqlite-like"].includes(preferredResult.backend));
  assert.deepEqual(preferredResult.results.map((result) => result.record_id), ["search-record-1"]);

  if (writeResult.storage.ftsTableReady) {
    assert.equal(preferredResult.backend, "sqlite-fts5");
  } else {
    assert.equal(preferredResult.backend, "sqlite-like");
  }
});

await checkAsync("search indexing write methods upsert, remove, and re-index one record predictably", async () => {
  clearSearchIndexersForTests();

  const workspaceId = "search-indexing-write-workspace";
  const now = new Date().toISOString();
  const searchableType = {
    ...sampleSearchableType,
    moduleId: "developer-example",
    recordType: "example_record",
    indexer: "developer-example.records",
  };

  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Indexing Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});
`);

  const firstDocument = searchService.normalizeSearchDocument(searchableType, {
    workspace_id: workspaceId,
    example_id: "write-record-1",
    title: "First indexed title",
    summary: "Initial summary",
    body: "Initial searchable body",
    tags_text: "first tag",
    indexed_at: "2026-06-08T14:00:00.000Z",
  });
  const firstResult = await searchService.indexSearchDocument(firstDocument);

  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.operation, "index_one");
  assert.equal(firstResult.indexedCount, 1);

  const updatedDocument = {
    ...firstDocument,
    title: "Updated indexed title",
    body: "Updated searchable body",
    indexed_at: "2026-06-08T14:01:00.000Z",
  };
  const secondResult = await searchService.indexSearchDocument(updatedDocument);
  const canonicalRows = await querySql(`
SELECT title, body, COUNT(*) OVER () AS row_count
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'write-record-1';
`);

  assert.equal(secondResult.ok, true);
  assert.equal(canonicalRows.length, 1);
  assert.equal(Number(canonicalRows[0].row_count), 1);
  assert.equal(canonicalRows[0].title, "Updated indexed title");
  assert.equal(canonicalRows[0].body, "Updated searchable body");

  const removeResult = await searchService.removeSearchDocument({
    workspaceId,
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "write-record-1",
  });
  const removedRows = await querySql(`
SELECT search_index_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'write-record-1';
`);

  assert.equal(removeResult.ok, true);
  assert.equal(removeResult.operation, "remove_one");
  assert.equal(removeResult.removedCount, 1);
  assert.deepEqual(removedRows, []);

  if (firstResult.storage.ftsTableReady) {
    const removedFtsRows = await querySql(`
SELECT search_index_id
FROM search_index_fts
WHERE search_index_id = ${sqlText(firstDocument.search_index_id)};
`);

    assert.deepEqual(removedFtsRows, []);
  }

  const unregister = registerSearchIndexer("developer-example.records", async ({ recordId }) => ({
    workspace_id: workspaceId,
    example_id: recordId,
    title: "Re-indexed title",
    summary: "Re-indexed summary",
    body: "Re-indexed body",
    tags_text: "reindexed",
    indexed_at: "2026-06-08T14:02:00.000Z",
  }));
  const reindexResult = await searchService.reindexSearchRecord({
    searchableType,
    workspaceId,
    recordId: "write-record-1",
  });
  const reindexedRows = await querySql(`
SELECT title, summary, body
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'write-record-1';
`);

  assert.equal(reindexResult.ok, true);
  assert.equal(reindexResult.operation, "reindex_one");
  assert.equal(reindexResult.indexedCount, 1);
  assert.deepEqual(reindexedRows, [{
    title: "Re-indexed title",
    summary: "Re-indexed summary",
    body: "Re-indexed body",
  }]);

  unregister();

  const removeStaleUnregister = registerSearchIndexer("developer-example.records", async () => null);
  const staleRemovalResult = await searchService.reindexSearchRecord({
    searchableType,
    workspaceId,
    recordId: "write-record-1",
  });
  const staleRows = await querySql(`
SELECT search_index_id
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example'
  AND record_type = 'example_record'
  AND record_id = 'write-record-1';
`);

  assert.equal(staleRemovalResult.ok, true);
  assert.equal(staleRemovalResult.operation, "reindex_one");
  assert.equal(staleRemovalResult.removedStaleIndex, true);
  assert.deepEqual(staleRows, []);

  removeStaleUnregister();

  const errorResult = await searchService.reindexSearchRecord({
    searchableType,
    workspaceId,
    recordId: "write-record-2",
  });

  assert.equal(errorResult.ok, false);
  assert.equal(errorResult.operation, "reindex_one");
  assert.ok(errorResult.errors[0].message.includes("is not registered"));

  clearSearchIndexersForTests();
});

await checkAsync("initial module-owned indexers normalize tasks, time entries, clients, and projects", async () => {
  clearSearchIndexersForTests();
  const unregisterClientProjects = registerClientProjectsSearchIndexers();
  const unregisterTasks = registerTasksSearchIndexers();
  const unregisterTimeTracking = registerTimeTrackingSearchIndexers();
  const workspaceId = "search-module-indexers-workspace";
  const now = "2026-06-08T14:30:00.000Z";

  await runSql(`
INSERT OR IGNORE INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, 'Search Module Indexers Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES
  (${sqlText(workspaceId)}, 'client-projects', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspaceId)}, 'tasks', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspaceId)}, 'time-tracking', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)})
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;

INSERT OR REPLACE INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  'search-client-1',
  ${sqlText(workspaceId)},
  NULL,
  'Acme Client',
  'Active',
  'yes',
  '125',
  'monthly',
  1,
  1,
  '0.25',
  'Ada Account',
  'ada@example.test',
  '',
  '',
  '555-0100',
  '',
  '1 Main',
  '',
  'Forge City',
  'PA',
  '17000',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  task_default_priority,
  task_default_status,
  task_default_sort_order_json,
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES
  (
    'search-project-parent',
    ${sqlText(workspaceId)},
    'search-client-1',
    NULL,
    'Parent Launch',
    'Active',
    'yes',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'normal',
    'open',
    '["due_date","priority"]',
    'creator',
    ${sqlText(now)},
    ${sqlText(now)}
  ),
  (
    'search-project-1',
    ${sqlText(workspaceId)},
    'search-client-1',
    'search-project-parent',
    'Website Launch',
    'Completed',
    'yes',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'high',
    'open',
    '["due_date","priority"]',
    'creator',
    ${sqlText(now)},
    ${sqlText(now)}
  );

INSERT OR REPLACE INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  billable,
  due_date,
  due_time,
  due_timezone,
  due_at_utc,
  source_type,
  source_id,
  archived_at,
  reminder_override_enabled,
  recurrence_template_id,
  recurrence_instance_date,
  completed_at,
  created_by_user_id,
  updated_by_user_id,
  completed_by_user_id,
  archived_by_user_id,
  created_at,
  updated_at
)
VALUES (
  'search-task-1',
  ${sqlText(workspaceId)},
  'search-client-1',
  'search-project-1',
  'Draft launch checklist',
  'Write the preflight launch checklist.',
  'open',
  'high',
  'yes',
  '2026-06-09',
  '10:00',
  'America/New_York',
  '2026-06-09T14:00:00.000Z',
  'manual',
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  'search-user-1',
  'search-user-1',
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  'search-user-1',
  ${sqlText(workspaceId)},
  'search-user@example.test',
  'Search User',
  NULL,
  'America/New_York',
  'hash',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT OR REPLACE INTO task_assignees (
  task_assignee_id,
  workspace_id,
  task_id,
  assignee_type,
  user_id,
  role_id,
  assigned_by_user_id,
  assigned_at,
  removed_at
)
VALUES (
  'search-task-assignee-1',
  ${sqlText(workspaceId)},
  'search-task-1',
  'user',
  'search-user-1',
  NULL,
  'search-user-1',
  ${sqlText(now)},
  NULL
);

INSERT OR REPLACE INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  'search-time-entry-1',
  ${sqlText(workspaceId)},
  'search-user-1',
  'search-client-1',
  'Acme Client',
  'search-project-1',
  'Website Launch',
  'search-task-1',
  'Implementation meeting',
  '2026-06-08T13:00:00.000Z',
  '2026-06-08T14:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT OR REPLACE INTO tags (tag_id, workspace_id, name, slug, description, color, status, created_at, updated_at)
VALUES
  ('search-module-tag-client', ${sqlText(workspaceId)}, 'VIP', 'vip', '', NULL, 'active', ${sqlText(now)}, ${sqlText(now)}),
  ('search-module-tag-project', ${sqlText(workspaceId)}, 'Launch', 'launch', '', NULL, 'active', ${sqlText(now)}, ${sqlText(now)}),
  ('search-module-tag-task', ${sqlText(workspaceId)}, 'Checklist', 'checklist', '', NULL, 'active', ${sqlText(now)}, ${sqlText(now)}),
  ('search-module-tag-time', ${sqlText(workspaceId)}, 'Meeting', 'meeting', '', NULL, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT OR REPLACE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source,
  created_at
)
VALUES
  ('search-module-tag-assignment-client', ${sqlText(workspaceId)}, 'search-module-tag-client', 'client', 'search-client-1', 'manual', ${sqlText(now)}),
  ('search-module-tag-assignment-project', ${sqlText(workspaceId)}, 'search-module-tag-project', 'project', 'search-project-1', 'manual', ${sqlText(now)}),
  ('search-module-tag-assignment-task', ${sqlText(workspaceId)}, 'search-module-tag-task', 'task', 'search-task-1', 'manual', ${sqlText(now)}),
  ('search-module-tag-assignment-time', ${sqlText(workspaceId)}, 'search-module-tag-time', 'time_entry', 'search-time-entry-1', 'manual', ${sqlText(now)});
`);

  const activeTypes = await searchService.listActiveSearchableTypes(workspaceId);
  const expectedTypes = [
    "client-projects:client",
    "client-projects:project",
    "framework:help_article",
    "tasks:task",
    "time-tracking:time_entry",
  ];

  for (const expectedType of expectedTypes) {
    assert.ok(
      activeTypes.some((type) => `${type.moduleId}:${type.recordType}` === expectedType),
      `${expectedType} should be active and searchable`,
    );
  }

  const records = [
    { moduleId: "client-projects", recordType: "client", recordId: "search-client-1" },
    { moduleId: "client-projects", recordType: "project", recordId: "search-project-1" },
    { moduleId: "tasks", recordType: "task", recordId: "search-task-1" },
    { moduleId: "time-tracking", recordType: "time_entry", recordId: "search-time-entry-1" },
  ];

  for (const record of records) {
    const result = await searchService.reindexSearchRecord({
      workspaceId,
      ...record,
    });

    assert.equal(result.ok, true, `${record.recordType} reindex should succeed`);
    assert.equal(result.indexedCount, 1, `${record.recordType} reindex should upsert one row`);
  }

  const indexedRows = await querySql(`
SELECT module_id, record_type, record_id, title, summary, body, tags_text, client_id, project_id, record_status, source
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND record_id IN ('search-client-1', 'search-project-1', 'search-task-1', 'search-time-entry-1')
ORDER BY record_type;
`);

  assert.deepEqual(indexedRows.map((row) => `${row.module_id}:${row.record_type}`).sort(), [
    "client-projects:client",
    "client-projects:project",
    "tasks:task",
    "time-tracking:time_entry",
  ].sort());

  const rowsByType = new Map(indexedRows.map((row) => [row.record_type, row]));

  assert.equal(rowsByType.get("client").title, "Acme Client");
  assert.equal(rowsByType.get("client").record_status, "active");
  assert.match(rowsByType.get("client").body, /Ada Account/);
  assert.match(rowsByType.get("client").tags_text, /VIP/);

  assert.equal(rowsByType.get("project").title, "Website Launch");
  assert.equal(rowsByType.get("project").record_status, "completed");
  assert.equal(rowsByType.get("project").client_id, "search-client-1");
  assert.match(rowsByType.get("project").body, /Parent Launch/);
  assert.match(rowsByType.get("project").tags_text, /Launch/);

  assert.equal(rowsByType.get("task").title, "Draft launch checklist");
  assert.equal(rowsByType.get("task").record_status, "open");
  assert.equal(rowsByType.get("task").client_id, "search-client-1");
  assert.equal(rowsByType.get("task").project_id, "search-project-1");
  assert.match(rowsByType.get("task").body, /Search User/);
  assert.match(rowsByType.get("task").tags_text, /Checklist/);

  assert.equal(rowsByType.get("time_entry").title, "Implementation meeting");
  assert.equal(rowsByType.get("time_entry").record_status, "active");
  assert.equal(rowsByType.get("time_entry").client_id, "search-client-1");
  assert.equal(rowsByType.get("time_entry").project_id, "search-project-1");
  assert.match(rowsByType.get("time_entry").body, /Website Launch/);
  assert.match(rowsByType.get("time_entry").tags_text, /Meeting/);

  unregisterClientProjects();
  unregisterTasks();
  unregisterTimeTracking();
});

await checkAsync("canonical search_index schema and fallback indexes are present", async () => {
  const columns = await querySql("PRAGMA table_info(search_index);");
  const columnNames = columns.map((column) => column.name);

  assert.deepEqual(columnNames, [
    "search_index_id",
    "workspace_id",
    "module_id",
    "record_type",
    "record_id",
    "title",
    "summary",
    "body",
    "tags_text",
    "client_id",
    "project_id",
    "visibility",
    "record_status",
    "source",
    "record_created_at",
    "record_updated_at",
    "indexed_at",
    "library_bucket",
  ]);

  for (const requiredColumn of [
    "workspace_id",
    "module_id",
    "record_type",
    "record_id",
    "title",
    "summary",
    "body",
    "tags_text",
    "visibility",
    "record_status",
    "source",
    "indexed_at",
  ]) {
    const column = columns.find((item) => item.name === requiredColumn);
    assert.equal(Number(column?.notnull), 1, `${requiredColumn} should be NOT NULL`);
  }

  const indexes = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = 'search_index'
ORDER BY name;
`);
  const indexNames = indexes.map((index) => index.name);

  for (const indexName of [
    "idx_search_index_workspace_body",
    "idx_search_index_workspace_client",
    "idx_search_index_workspace_indexed_at",
    "idx_search_index_workspace_library_bucket",
    "idx_search_index_workspace_module",
    "idx_search_index_workspace_project",
    "idx_search_index_workspace_record_status",
    "idx_search_index_workspace_record_type",
    "idx_search_index_workspace_title",
  ]) {
    assert.ok(indexNames.includes(indexName), `${indexName} should exist`);
  }

  const capabilities = await searchService.getRuntimeCapabilities({ refresh: true });
  const ftsTables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name LIKE 'search_index_fts%'
ORDER BY name;
`);

  if (capabilities.backend.fts5Supported) {
    assert.ok(
      ftsTables.some((table) => table.name === "search_index_fts"),
      "0.32.8.6 should create the SQLite FTS table when supported",
    );
  } else {
    assert.deepEqual(ftsTables, [], "0.32.8.6 should skip FTS tables when SQLite lacks FTS5 support");
  }
});

clearSearchIndexersForTests();

console.log(`Search contract regression passed ${checks} checks.`);

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  checks += 1;
}
