import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-foundation-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-foundation.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Foundation-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { resolveModuleDefinitionTerminology } = await import("../src/core/modules/terminology.js");
const {
  LIST_ITEM_PURCHASE_STATUS_VALUES,
  LIST_STATUS_VALUES,
  LIST_TYPE_VALUES,
  defaultListTypeForWorkspaceType,
  validateListContext,
  validateListItemContext,
} = await import("../src/modules/lists/storage-contract.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertListsModuleManifest();
  await assertListsMigrationApplied();
  await assertListsSchema();
  await assertListsConstraints();
  await assertStorageContractHelpers();
  await assertModuleLifecycle();
  await assertIntegrity();

  console.log("Lists foundation regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertListsModuleManifest() {
  const listsModule = modulesService.getModule("lists");

  assert.equal(listsModule.id, "lists");
  assert.equal(listsModule.version, "0.33.5.21.7.4");
  assert.equal(listsModule.enabledByDefault, true);
  assert.equal(listsModule.canDisable, true);
  assert.equal(listsModule.historicalReadAccess, true);
  assert.equal(listsModule.migrationsDir, null, "Lists schema is folded into the consolidated fresh baseline");
  assert.equal(listsModule.browserApiRoutes.length, 1, "Lists should expose its browser API router in 0.33.4.3");
  assert.ok(listsModule.navigation.some((item) => item.href === "lists.html" && item.parent === "projects.html"));
  assert.ok(listsModule.protectedViews.some((view) => view.file === "lists.html" && view.allowDisabledRead === true));
  assert.ok(listsModule.browserAssets.some((asset) => asset.path === "/js/lists.js"));
  assert.equal(listsModule.settings.some((setting) => setting.id === "listsEnabled" && setting.moduleStatus === true), true);
  assert.ok(listsModule.taggableTypes.some((target) => target.targetType === "list"));
  assert.ok(listsModule.searchableTypes.some((target) => target.recordType === "list" && target.indexer === "lists.records"));
  assert.ok(listsModule.attachableTypes.some((target) => target.targetType === "list"));

  const businessModule = resolveModuleDefinitionTerminology(listsModule, "business");
  const personalModule = resolveModuleDefinitionTerminology(listsModule, "personal");
  const familyModule = resolveModuleDefinitionTerminology(listsModule, "family");

  assert.equal(businessModule.id, "lists");
  assert.equal(personalModule.id, "lists");
  assert.equal(familyModule.id, "lists");
  assert.equal(businessModule.displayName, "Procurement Lists");
  assert.equal(personalModule.displayName, "Shopping Lists");
  assert.equal(familyModule.displayName, "Shopping Lists");
}

async function assertListsMigrationApplied() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '0.33.5.18.6.5.4';
`);

  assert.deepEqual(rows[0], {
    version: "0.33.5.18.6.5.4",
    module_id: "core",
    name: "current_fresh_start_database",
  });
}

async function assertListsSchema() {
  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('lists', 'list_items', 'list_item_catalog', 'list_links')
ORDER BY name;
`);
  assert.deepEqual(tables.map((row) => row.name), ["list_item_catalog", "list_items", "list_links", "lists"]);

  await assertColumns("lists", [
    "list_id",
    "workspace_id",
    "client_id",
    "project_id",
    "title",
    "description",
    "list_type",
    "status",
    "is_reusable",
    "source_list_id",
    "duplicated_from_list_id",
    "created_by_user_id",
    "updated_by_user_id",
    "finalized_by_user_id",
    "created_at",
    "updated_at",
    "completed_at",
    "finalized_at",
    "archived_at",
    "deleted_at",
    "metadata_json",
  ]);

  await assertColumns("list_items", [
    "list_item_id",
    "workspace_id",
    "list_id",
    "catalog_item_id",
    "item_name",
    "quantity",
    "unit",
    "needed_by_date",
    "vendor_name",
    "url",
    "estimated_cost",
    "actual_cost",
    "purchase_status",
    "tracking_id",
    "notes",
    "assigned_user_id",
    "created_by_user_id",
    "updated_by_user_id",
    "checked_at",
    "checked_by_user_id",
    "completed_at",
    "completed_by_user_id",
    "sort_order",
    "created_at",
    "updated_at",
    "deleted_at",
    "metadata_json",
  ]);

  await assertColumns("list_item_catalog", [
    "catalog_item_id",
    "workspace_id",
    "item_name",
    "normalized_name",
    "list_type",
    "client_id",
    "project_id",
    "quantity",
    "unit",
    "vendor_name",
    "url",
    "estimated_cost",
    "notes",
    "use_count",
    "last_used_at",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
    "metadata_json",
  ]);

  await assertColumns("list_links", [
    "list_link_id",
    "workspace_id",
    "list_id",
    "module_id",
    "target_type",
    "target_id",
    "link_role",
    "created_by_user_id",
    "created_at",
    "removed_at",
    "metadata_json",
  ]);

  const indexes = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_lists_workspace_list',
    'idx_lists_workspace_status',
    'idx_lists_workspace_type',
    'idx_lists_workspace_reusable',
    'idx_lists_workspace_source',
    'idx_lists_workspace_duplicated_from',
    'idx_lists_workspace_client',
    'idx_lists_workspace_project',
    'idx_lists_workspace_created_by',
    'idx_lists_workspace_updated_at',
    'idx_lists_workspace_finalized_at',
    'idx_list_items_workspace_list_sort',
    'idx_list_items_workspace_list_status',
    'idx_list_items_workspace_assigned_user',
    'idx_list_items_workspace_needed_by',
    'idx_list_items_workspace_catalog',
    'idx_list_item_catalog_workspace_name',
    'idx_list_item_catalog_workspace_type',
    'idx_list_item_catalog_workspace_context',
    'idx_list_item_catalog_workspace_usage',
    'idx_list_links_workspace_list',
    'idx_list_links_workspace_target',
    'idx_list_links_workspace_created'
  )
ORDER BY name;
`);

  assert.equal(indexes.length, 23, "Lists foundation should create the expected lookup indexes");
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
}

async function assertListsConstraints() {
  const workspace = await readWorkspace();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO lists (
  list_id,
  workspace_id,
  title,
  description,
  list_type,
  status,
  is_reusable,
  created_at,
  updated_at
) VALUES (
  'list-1',
  ${sqlText(workspace.workspace_id)},
  'Procurement Starter',
  'Foundation list',
  'bill_of_materials',
  'active',
  1,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO list_items (
  list_item_id,
  workspace_id,
  list_id,
  item_name,
  quantity,
  unit,
  purchase_status,
  sort_order,
  created_at,
  updated_at
) VALUES (
  'list-item-1',
  ${sqlText(workspace.workspace_id)},
  'list-1',
  'Aluminum Extrusion',
  4,
  'piece',
  'received',
  10,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const listRows = await querySql("SELECT list_type, status, is_reusable FROM lists WHERE list_id = 'list-1';");
  assert.deepEqual(listRows[0], {
    list_type: "bill_of_materials",
    status: "active",
    is_reusable: 1,
  });

  const itemRows = await querySql("SELECT purchase_status, checked_at, completed_at FROM list_items WHERE list_item_id = 'list-item-1';");
  assert.deepEqual(itemRows[0], {
    purchase_status: "received",
    checked_at: null,
    completed_at: null,
  }, "received purchase status should not silently check or complete an item");

  await assert.rejects(
    () => runSql(`
INSERT INTO lists (
  list_id,
  workspace_id,
  title,
  list_type,
  created_at,
  updated_at
) VALUES (
  'list-invalid-type',
  ${sqlText(workspace.workspace_id)},
  'Invalid',
  'bookmarks',
  ${sqlText(now)},
  ${sqlText(now)}
);
`),
  );

  await assert.rejects(
    () => runSql(`
INSERT INTO list_items (
  list_item_id,
  workspace_id,
  list_id,
  item_name,
  purchase_status,
  created_at,
  updated_at
) VALUES (
  'list-item-invalid-status',
  ${sqlText(workspace.workspace_id)},
  'list-1',
  'Invalid',
  'shipped',
  ${sqlText(now)},
  ${sqlText(now)}
);
`),
  );
}

function assertStorageContractHelpers() {
  assert.deepEqual(LIST_TYPE_VALUES, [
    "shopping",
    "procurement",
    "packing",
    "supplies",
    "parts",
    "checklist",
    "bill_of_materials",
  ]);
  assert.deepEqual(LIST_STATUS_VALUES, ["active", "completed", "finalized", "archived", "deleted"]);
  assert.deepEqual(LIST_ITEM_PURCHASE_STATUS_VALUES, ["needed", "planned", "ordered", "received", "cancelled", "not_needed"]);
  assert.equal(defaultListTypeForWorkspaceType("business"), "procurement");
  assert.equal(defaultListTypeForWorkspaceType("personal"), "shopping");
  assert.equal(defaultListTypeForWorkspaceType("family"), "shopping");

  assert.equal(validateListContext({ workspaceId: "workspace-1", workspaceType: "personal", clientId: "client-1" }).ok, false);
  assert.equal(validateListContext({
    workspaceId: "workspace-1",
    workspaceType: "business",
    clientId: "client-1",
    project: { workspace_id: "workspace-2", client_id: "client-1" },
  }).reason, "project_workspace_mismatch");
  assert.equal(validateListContext({
    workspaceId: "workspace-1",
    workspaceType: "business",
    clientId: "client-2",
    project: { workspace_id: "workspace-1", client_id: "client-1" },
  }).reason, "project_client_mismatch");
  assert.deepEqual(validateListContext({
    workspaceId: "workspace-1",
    workspaceType: "business",
    project: { workspace_id: "workspace-1", client_id: "client-1" },
  }), {
    ok: true,
    clientId: "client-1",
    workspaceId: "workspace-1",
  });

  assert.equal(validateListItemContext({ list: null }).reason, "parent_list_required");
  assert.equal(validateListItemContext({ list: { workspace_id: "workspace-1" }, itemWorkspaceId: "workspace-2" }).reason, "item_workspace_mismatch");
  assert.deepEqual(validateListItemContext({ list: { workspace_id: "workspace-1" }, itemWorkspaceId: "workspace-1" }), {
    ok: true,
    workspaceId: "workspace-1",
  });
}

async function assertModuleLifecycle() {
  const workspace = await readWorkspace();
  const rows = await querySql(`
SELECT status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspace.workspace_id)}
  AND module_id = 'lists';
`);

  assert.equal(rows[0]?.status, "enabled", "Lists should be enabled by default for the workspace");

  await modulesService.setModuleStatus(workspace.workspace_id, "lists", false, { actorUserId: "test" });
  assert.equal(await modulesService.canWriteModule(workspace.workspace_id, "lists"), false);
  assert.equal(await modulesService.canReadModule(workspace.workspace_id, "lists"), true);
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY workspace_id LIMIT 1;");
  return rows[0];
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
