import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-service-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-service.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Service-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const {
  LIST_PERMISSIONS,
  canAccessList,
  canManageListItem,
  sanitizeListLifecyclePayload,
} = await import("../src/modules/lists/access-policy.js");
const { listsRepository } = await import("../src/modules/lists/lists.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const session = await readSession();
  await assertManifestContracts();
  await assertServiceLifecycle(session);
  await assertAccessPolicy();
  await assertDisabledModuleWriteBlocking(session);
  await assertIntegrity();

  console.log("Lists service regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestContracts() {
  const listsModule = modulesService.getModule("lists");
  const permissionIds = new Set(listsModule.permissions.map((permission) => permission.id));

  assert.equal(listsModule.version, "0.33.4.5");
  assert.equal(listsModule.resourceDefinitions[0].key, "lists");
  assert.deepEqual(listsModule.resourceDefinitions[0].operations, [
    "read",
    "create",
    "update",
    "complete",
    "finalize",
    "archive",
    "restore",
    "delete",
    "duplicate",
    "manage_items",
    "manage_reusable",
    "manage_catalog",
    "manage_links",
    "manage",
  ]);

  for (const permission of Object.values(LIST_PERMISSIONS)) {
    assert.ok(permissionIds.has(permission), `${permission} should be declared`);
  }

  assert.ok(listsModule.defaultRolePermissions.some((mapping) => (
    mapping.roleId === "workspace_admin" &&
    Object.values(LIST_PERMISSIONS).every((permission) => mapping.permissions.includes(permission))
  )), "Workspace admins should receive the full Lists permission contract");
  assert.deepEqual(
    listsModule.defaultRolePermissions.find((mapping) => mapping.roleId === "client_external_user")?.permissions,
    [],
    "External client users should not receive default Lists permissions",
  );
  assert.deepEqual(
    listsModule.auditRecordTypes.map((recordType) => recordType.recordType).sort(),
    ["list", "list_item"],
  );
  assert.ok(listsModule.eventTypes.some((event) => event.event === "lists.list.created"));
  assert.ok(listsModule.eventTypes.some((event) => event.event === "lists.list.duplicated"));
  assert.ok(listsModule.eventTypes.some((event) => event.event === "lists.list.finalized"));
  assert.ok(listsModule.eventTypes.some((event) => event.event === "lists.item.checked"));

  const rows = await querySql(`
SELECT permission_id
FROM permissions
WHERE permission_id LIKE 'lists.%'
ORDER BY permission_id;
`);
  assert.deepEqual(rows.map((row) => row.permission_id), Object.values(LIST_PERMISSIONS).sort());
}

async function assertServiceLifecycle(session) {
  const capturedEvents = [];
  const unsubscribe = modulesService.onInternalEvent("lists.list.created", (event) => {
    capturedEvents.push(event);
  }, { id: "lists-service-regression:list-created" });
  const unsubscribeItem = modulesService.onInternalEvent("lists.item.checked", (event) => {
    capturedEvents.push(event);
  }, { id: "lists-service-regression:item-checked" });

  try {
    const created = await listsService.create({
      description: "Parts to buy",
      list_type: "procurement",
      title: "R&D Procurement",
    }, session);
    assert.equal(created.list.title, "R&D Procurement");
    assert.equal(created.list.status, "active");

    const updated = await listsService.update(created.list.list_id, {
      description: "Updated parts to buy",
      title: "R&D Procurement Updated",
    }, session);
    assert.equal(updated.list.description, "Updated parts to buy");

    const item = await listsService.createItem(created.list.list_id, {
      item_name: "Aluminum extrusion",
      purchase_status: "needed",
      quantity: 4,
      unit: "piece",
    }, session);
    assert.equal(item.item.assigned_user_id, session.user_id);

    const checked = await listsService.checkItem(created.list.list_id, item.item.list_item_id, session);
    assert.ok(checked.item.checked_at);
    assert.equal(checked.item.completed_at, null);

    const completedItem = await listsService.completeItem(created.list.list_id, item.item.list_item_id, session);
    assert.ok(completedItem.item.completed_at);

    const unchecked = await listsService.uncheckItem(created.list.list_id, item.item.list_item_id, session);
    assert.equal(unchecked.item.checked_at, null);
    assert.ok(unchecked.item.completed_at, "Unchecking should not silently remove item completion state");

    await listsService.updateItem(created.list.list_id, item.item.list_item_id, {
      actual_cost: 42,
      item_name: "Aluminum extrusion",
      purchase_status: "ordered",
      quantity: 4,
      tracking_id: "TRACK-123",
    }, session);

    const reusable = await listsService.markReusable(created.list.list_id, session);
    assert.equal(reusable.list.is_reusable, true);

    const duplicated = await listsService.duplicate(created.list.list_id, {}, session);
    assert.equal(duplicated.list.status, "active");
    assert.equal(duplicated.list.is_reusable, false);
    assert.equal(duplicated.list.source_list_id, created.list.list_id);
    assert.equal(duplicated.list.duplicated_from_list_id, created.list.list_id);
    assert.equal(duplicated.items.length, 1);
    assert.equal(duplicated.items[0].actual_cost, null);
    assert.equal(duplicated.items[0].checked_at, null);
    assert.equal(duplicated.items[0].completed_at, null);
    assert.equal(duplicated.items[0].purchase_status, "needed");
    assert.equal(duplicated.items[0].tracking_id, null);

    await listsService.updateItem(created.list.list_id, item.item.list_item_id, {
      item_name: "Edited reusable item",
      purchase_status: "planned",
      quantity: 8,
    }, session);
    const duplicatedRead = await listsService.read(duplicated.list.list_id, session);
    assert.equal(duplicatedRead.items[0].item_name, "Aluminum extrusion");
    assert.equal(duplicatedRead.items[0].quantity, 4);

    const normalAgain = await listsService.unmarkReusable(created.list.list_id, session);
    assert.equal(normalAgain.list.is_reusable, false);

    const bom = await listsService.create({
      list_type: "bill_of_materials",
      title: "Prototype BOM",
    }, session);
    await listsService.createItem(bom.list.list_id, {
      actual_cost: 12,
      item_name: "Control board",
      purchase_status: "received",
      tracking_id: "BOM-TRACK",
    }, session);
    const finalizedBom = await listsService.finalize(bom.list.list_id, session);
    assert.equal(finalizedBom.list.status, "finalized");
    await assert.rejects(
      () => listsService.createItem(bom.list.list_id, { item_name: "Should not edit finalized" }, session),
      /finalized_read_only/,
    );
    const duplicatedBom = await listsService.duplicate(bom.list.list_id, {}, session);
    assert.equal(duplicatedBom.list.status, "active");
    assert.equal(duplicatedBom.list.list_type, "bill_of_materials");
    assert.equal(duplicatedBom.items[0].actual_cost, null);
    assert.equal(duplicatedBom.items[0].purchase_status, "needed");

    const completed = await listsService.complete(created.list.list_id, session);
    assert.equal(completed.list.status, "completed");

    const reopened = await listsService.reopen(created.list.list_id, session);
    assert.equal(reopened.list.status, "active");

    await assert.rejects(
      () => listsService.update(created.list.list_id, { status: "finalized", title: "Finalized Attempt" }, session),
      /Finalize lists through the finalized-list workflow/,
    );

    await listsRepository.update(session.workspace_id, {
      ...reopened.list,
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by_user_id: session.user_id,
    });
    await assert.rejects(
      () => listsService.update(created.list.list_id, { title: "Edit Finalized" }, session),
      /finalized_read_only/,
    );

    const archived = await listsService.archive(created.list.list_id, session);
    assert.equal(archived.list.status, "archived");

    const restored = await listsService.restore(created.list.list_id, session);
    assert.equal(restored.list.status, "active");

    const deletedItem = await listsService.deleteItem(created.list.list_id, item.item.list_item_id, session);
    assert.ok(deletedItem.item.deleted_at);

    const deleted = await listsService.softDelete(created.list.list_id, session);
    assert.equal(deleted.list.status, "deleted");
    await assert.rejects(
      () => listsService.read(created.list.list_id, session),
      /List not found/,
    );

    const restoredDeleted = await listsService.restore(created.list.list_id, session);
    assert.equal(restoredDeleted.list.status, "active");

    assert.ok(capturedEvents.some((event) => (
      event.module_id === "lists" &&
      event.record_type === "list" &&
      event.metadata.title === "R&D Procurement"
    )), "List created event should use safe list metadata");
    assert.ok(capturedEvents.some((event) => (
      event.module_id === "lists" &&
      event.record_type === "list_item" &&
      event.metadata.item_name === "Aluminum extrusion" &&
      !("url" in event.metadata)
    )), "Item checked event should use safe item metadata");

    const auditRows = await querySql(`
SELECT action, record_type, record_label, metadata_json
FROM audit_logs
WHERE workspace_id = '${session.workspace_id}'
  AND action IN ('list_created', 'list_item_created', 'list_item_checked', 'list_deleted')
ORDER BY created_at;
`);
    assert.ok(auditRows.some((row) => row.action === "list_created" && row.record_type === "list"));
    assert.ok(auditRows.some((row) => row.action === "list_item_checked" && row.record_type === "list_item"));
    assert.ok(auditRows.every((row) => !String(row.metadata_json || "").includes("unsafe")), "Audit metadata should stay sanitized");
  } finally {
    unsubscribe();
    unsubscribeItem();
  }
}

function assertAccessPolicy() {
  const session = { workspace_id: "workspace-1", user_id: "user-1" };
  const activeList = {
    list_id: "list-1",
    workspace_id: "workspace-1",
    status: "active",
  };
  const finalizedList = {
    ...activeList,
    status: "finalized",
  };

  assert.equal(canAccessList({
    list: activeList,
    operation: "read",
    permissions: [LIST_PERMISSIONS.VIEW],
    session,
  }).allowed, true);
  assert.equal(canAccessList({
    list: activeList,
    operation: "update",
    permissions: [LIST_PERMISSIONS.VIEW],
    session,
  }).reason, "missing_permission");
  assert.equal(canAccessList({
    list: finalizedList,
    operation: "update",
    permissions: [LIST_PERMISSIONS.UPDATE],
    session,
  }).reason, "finalized_read_only");
  assert.equal(canManageListItem({
    item: { list_id: "list-1", workspace_id: "workspace-1" },
    list: activeList,
    permissions: [LIST_PERMISSIONS.MANAGE_ITEMS],
    session,
  }).allowed, true);
  assert.equal(canManageListItem({
    item: { list_id: "list-2", workspace_id: "workspace-1" },
    list: activeList,
    permissions: [LIST_PERMISSIONS.MANAGE_ITEMS],
    session,
  }).reason, "item_parent_mismatch");

  assert.deepEqual(sanitizeListLifecyclePayload({
    newValue: {
      item_name: "Part",
      list_id: "list-1",
      url: "https://example.test/private",
      workspace_id: "workspace-1",
    },
    timestamp: "2026-06-11T00:00:00.000Z",
  }), {
    actor_user_id: "",
    client_id: "",
    item_name: "Part",
    list_id: "list-1",
    list_item_id: "",
    list_type: "",
    project_id: "",
    purchase_status: "",
    reason: "",
    status: "",
    timestamp: "2026-06-11T00:00:00.000Z",
    title: "",
    workspace_id: "workspace-1",
  });
}

async function assertDisabledModuleWriteBlocking(session) {
  const created = await listsService.create({ title: "Disable Test" }, session);
  await modulesService.setModuleStatus(session.workspace_id, "lists", false, { actorUserId: session.user_id });

  const readResult = await listsService.read(created.list.list_id, session);
  assert.equal(readResult.list.title, "Disable Test");
  await assert.rejects(
    () => listsService.update(created.list.list_id, { title: "Blocked" }, session),
    /This module is disabled for this workspace/,
  );

  await modulesService.setModuleStatus(session.workspace_id, "lists", true, { actorUserId: session.user_id });
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
