import { describe, expect, it } from "vitest";
import {
  CreateListCatalogItemSchema,
  CreateListItemSchema,
  CreateListLinkSchema,
  CreateListSchema,
  DuplicateListSchema,
  ReorderListItemsSchema,
  UpdateListCatalogItemSchema,
  UpdateListItemSchema,
  UpdateListSchema,
  parseListsEdgePayload,
} from "../../src/modules/lists/lists.contracts.js";
import { AppError } from "../../src/utils/app-error.js";

const browserListPayload = {
  client_id: "client-1",
  description: "  Installation supplies  ",
  list_type: "procurement",
  project_id: "project-1",
  title: "  Site preparation  ",
};

const browserItemPayload = {
  actual_cost: "10.50",
  assigned_user_id: "user-1",
  catalog_item_id: "catalog-1",
  estimated_cost: "12.00",
  item_name: "  Cable ties  ",
  needed_by_date: "2026-08-20",
  notes: "  Black, 8 inch  ",
  purchase_status: "ordered",
  quantity: "4",
  save_to_catalog: false,
  tracking_id: "TRACK-1",
  unit: "pack",
  url: "https://example.test/item",
  vendor_name: "Supply Co",
};

describe("Lists create and update payload corpus", () => {
  it("accepts the current browser list body and trims text inputs", () => {
    const created = parseListsEdgePayload(CreateListSchema, browserListPayload);
    const updated = parseListsEdgePayload(UpdateListSchema, {
      ...browserListPayload,
      description: "Updated",
    });

    expect(created.title).toBe("Site preparation");
    expect(created.description).toBe("Installation supplies");
    expect(created.project_id).toBe("project-1");
    expect(updated.description).toBe("Updated");
  });

  it("preserves dual casing, nullable context, and liberal scalar values", () => {
    const parsed = parseListsEdgePayload(UpdateListSchema, {
      clientId: null,
      description: 42,
      listType: "checklist",
      projectId: "",
      title: true,
    });

    expect(parsed.clientId).toBeNull();
    expect(parsed.description).toBe(42);
    expect(parsed.title).toBe(true);
  });

  it("retains service-recognized lifecycle fields while stripping unknown/audit fields", () => {
    const parsed = parseListsEdgePayload(UpdateListSchema, {
      ...browserListPayload,
      archived_at: "spoof",
      completed_at: "spoof",
      created_by_user_id: "spoof",
      is_reusable: true,
      status: "finalized",
      workspace_id: "spoof",
      unexpected: true,
    });

    expect(parsed).toMatchObject({
      archived_at: "spoof",
      completed_at: "spoof",
      is_reusable: true,
      status: "finalized",
    });
    for (const field of ["created_by_user_id", "workspace_id", "unexpected"]) {
      expect(parsed).not.toHaveProperty(field);
    }
  });

  it("keeps required values and enum membership in the service", () => {
    expect(parseListsEdgePayload(CreateListSchema, {})).toEqual({});
    expect(parseListsEdgePayload(CreateListSchema, { title: "   ", list_type: "future-type" }))
      .toEqual({ title: "", list_type: "future-type" });
  });

  it("rejects structured junk in known scalar fields through a 400 AppError", () => {
    expect(() => parseListsEdgePayload(CreateListSchema, { title: { nested: true } }))
      .toThrow("List title must be text or a scalar value.");
    try {
      parseListsEdgePayload(UpdateListSchema, { project_id: ["project-1"] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      if (!(error instanceof AppError)) throw error;
      expect(error.statusCode).toBe(400);
    }
  });
});

describe("Lists item payload corpus", () => {
  it("accepts the complete browser item body for create and update", () => {
    const created = parseListsEdgePayload(CreateListItemSchema, browserItemPayload);
    const updated = parseListsEdgePayload(UpdateListItemSchema, {
      ...browserItemPayload,
      itemName: "Cable ties revised",
      purchaseStatus: "received",
      quantity: 6,
      saveToCatalog: "true",
    });

    expect(created.item_name).toBe("Cable ties");
    expect(created.quantity).toBe("4");
    expect(created.save_to_catalog).toBe(false);
    expect(updated.itemName).toBe("Cable ties revised");
    expect(updated.quantity).toBe(6);
  });

  it("retains service-recognized item lifecycle/order fields while stripping audit fields", () => {
    const parsed = parseListsEdgePayload(UpdateListItemSchema, {
      ...browserItemPayload,
      checked_at: "spoof",
      completed_by_user_id: "spoof",
      deleted_at: "spoof",
      sort_order: -100,
      workspace_id: "spoof",
    });

    expect(parsed).toMatchObject({
      checked_at: "spoof",
      completed_by_user_id: "spoof",
      deleted_at: "spoof",
      sort_order: -100,
    });
    expect(parsed).not.toHaveProperty("workspace_id");
  });

  it("rejects structured junk while leaving numeric/date semantics to the service", () => {
    expect(() => parseListsEdgePayload(CreateListItemSchema, { item_name: ["Cable"] }))
      .toThrow("Item name must be text or a scalar value.");
    expect(parseListsEdgePayload(CreateListItemSchema, {
      item_name: "Cable",
      needed_by_date: "not-a-date",
      quantity: "not-a-number",
    })).toMatchObject({ needed_by_date: "not-a-date", quantity: "not-a-number" });
  });
});

describe("Lists reorder, catalog, duplicate, and linked-context payloads", () => {
  it("accepts each retained item-order alias and strips entry junk", () => {
    const snake = parseListsEdgePayload(ReorderListItemsSchema, {
      items: [{ list_item_id: "item-1", sort_order: 10, workspace_id: "spoof" }],
    });
    const camel = parseListsEdgePayload(ReorderListItemsSchema, {
      itemOrders: [{ itemId: "item-2", sortOrder: "20" }],
    });
    const retained = parseListsEdgePayload(ReorderListItemsSchema, {
      item_orders: [{ item_id: "item-3", sort_order: 30 }],
    });

    expect(snake.items?.[0]).toEqual({ list_item_id: "item-1", sort_order: 10 });
    expect(camel.itemOrders?.[0]).toEqual({ itemId: "item-2", sortOrder: "20" });
    expect(retained.item_orders?.[0]?.item_id).toBe("item-3");
  });

  it("keeps the established reorder-array error envelope", () => {
    expect(() => parseListsEdgePayload(ReorderListItemsSchema, { items: "item-1" }))
      .toThrow("Item order payload must be an array.");
  });

  it("accepts catalog create/update shapes and retains service-managed usage fields", () => {
    const created = parseListsEdgePayload(CreateListCatalogItemSchema, {
      client_id: "client-1",
      estimated_cost: "9.00",
      item_name: "  Gaffer tape  ",
      list_type: "procurement",
      metadata_json: { source: "item-editor" },
      project_id: "project-1",
      quantity: 2,
      unit: "roll",
      vendor_name: "Supply Co",
    });
    const updated = parseListsEdgePayload(UpdateListCatalogItemSchema, {
      archivedAt: null,
      catalogItemId: "catalog-1",
      itemName: "Gaffer tape revised",
      last_used_at: "spoof",
      use_count: 999,
    });

    expect(created.item_name).toBe("Gaffer tape");
    expect(created.metadata_json).toEqual({ source: "item-editor" });
    expect(updated.archivedAt).toBeNull();
    expect(updated.last_used_at).toBe("spoof");
    expect(updated.use_count).toBe(999);
  });

  it("accepts duplicate and linked-context aliases while stripping unrelated state", () => {
    const duplicate = parseListsEdgePayload(DuplicateListSchema, {
      copyTitle: "  Working copy  ",
      id: "new-list-id",
      status: "deleted",
    });
    const link = parseListsEdgePayload(CreateListLinkSchema, {
      link_role: "related",
      metadata: { source: "editor" },
      moduleId: "tasks",
      targetId: "task-1",
      targetType: "task",
      workspace_id: "spoof",
    });

    expect(duplicate).toEqual({ copyTitle: "Working copy", id: "new-list-id" });
    expect(link).toMatchObject({ moduleId: "tasks", targetId: "task-1", targetType: "task" });
    expect(link).not.toHaveProperty("workspace_id");
  });

  it("rejects structured junk in catalog and link scalar fields", () => {
    expect(() => parseListsEdgePayload(CreateListCatalogItemSchema, { quantity: { value: 2 } }))
      .toThrow("Quantity must be text or a scalar value.");
    expect(() => parseListsEdgePayload(CreateListLinkSchema, { targetId: ["task-1"] }))
      .toThrow("Target ID must be text or a scalar value.");
  });
});
