/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

// The Lists records these envelopes carry are the module's own published
// contracts, proved against the repository at 0.33.33.32.15, rather than a
// second description of the same rows written from the assertions upward.
/** @typedef {import("../src/types/lists-catalog-item-contracts.js").ListsCatalogItemRecord} ListsCatalogItemRecord */
/** @typedef {import("../src/types/lists-domain-contracts.js").ListsBrowserLink} ListsBrowserLink */
/** @typedef {import("../src/types/lists-domain-contracts.js").ListsBrowserRecord} ListsBrowserRecord */
/** @typedef {import("../src/types/lists-item-contracts.js").ListsItemRecord} ListsItemRecord */
/** @typedef {import("../src/types/link-target-directory-contracts.js").LinkTarget} LinkTarget */

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} ListsApiApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} ListsApiClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} ListsApiResponse */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} ListsApiServer */

/** @typedef {ReturnType<typeof createApi>} ListsApi */

/**
 * The fixture record the flows share. The three list and item identifiers are
 * optional because the flow that creates each one attaches it after seeding,
 * and each is proven present where a later flow depends on it.
 * @typedef {Awaited<ReturnType<typeof seedFixtures>> & {
 *   businessItemId?: string,
 *   businessListId?: string,
 *   familyListId?: string,
 * }} ListsApiFixtures
 */

/** @typedef {{ error: { message: string } }} ErrorEnvelope */
/** @typedef {{ list: ListsBrowserRecord }} ListEnvelope */
/** @typedef {{ items: ListsItemRecord[], list: ListsBrowserRecord }} ListItemsEnvelope */
/** @typedef {{ links: ListsBrowserLink[], list: ListsBrowserRecord }} ListLinksEnvelope */
/** @typedef {{ item: ListsItemRecord }} ItemEnvelope */
/** @typedef {{ items: ListsItemRecord[] }} ItemsEnvelope */
/** @typedef {{ link: ListsBrowserLink }} LinkEnvelope */
/** @typedef {{ links: ListsBrowserLink[] }} LinksEnvelope */
/** @typedef {{ catalogItem: ListsCatalogItemRecord }} CatalogItemEnvelope */
/** @typedef {{ catalogItems: ListsCatalogItemRecord[] }} CatalogItemsEnvelope */
/** @typedef {{ suggestions: ListsCatalogItemRecord[] }} SuggestionsEnvelope */

/**
 * The link-target picker envelope, as `listsService.listLinkTargets` builds
 * it: the active providers it offers and the targets it resolved for the
 * requested type.
 * @typedef {{
 *   providers: Array<{ id: string, label: string, moduleId: string, providerId: string, targetType: string }>,
 *   targets: LinkTarget[],
 * }} LinkTargetsEnvelope
 */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-api-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-api.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Api-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

/** @type {ListsApiServer | undefined} */
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${listenerPort(server)}`;
  const api = createApi(baseUrl);

  await assertAuthenticationRequired(api);
  await assertBusinessListApiFlow(api, fixtures);
  await assertFamilyListApiFlow(api, fixtures);
  await assertUnauthorizedAndIsolation(api, fixtures);
  await assertDisabledModuleBehavior(api, fixtures);
  await assertIntegrity();

  console.log("Lists API regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {ListsApi} api */
async function assertAuthenticationRequired(api) {
  const response = await api.get("/api/lists");
  assert.equal(response.status, 401);
}

/** @param {ListsApi} api @param {ListsApiFixtures} fixtures */
async function assertBusinessListApiFlow(api, fixtures) {
  const invalidShape = await api.post("/api/lists", {
    title: { nested: true },
  }, { cookie: fixtures.adminSessionId });
  /** @type {ErrorEnvelope} */
  const invalidShapeBody = readPayload(invalidShape, ["error"], "invalid shape");
  assert.equal(invalidShape.status, 400);
  assert.equal(invalidShapeBody.error.message, "List title must be text or a scalar value.");

  const mismatch = await api.post("/api/lists", {
    client_id: fixtures.otherClientId,
    project_id: fixtures.projectId,
    title: "Mismatched procurement list",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ErrorEnvelope} */
  const mismatchBody = readPayload(mismatch, ["error"], "mismatch");
  assert.equal(mismatch.status, 400);
  assert.match(mismatchBody.error.message, /project/i);

  const created = await api.post("/api/lists", {
    description: "API procurement flow",
    list_type: "procurement",
    project_id: fixtures.projectId,
    title: "API Procurement List",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const createdBody = readPayload(created, ["list"], "created");
  assert.equal(created.status, 201);
  assert.equal(createdBody.list.title, "API Procurement List");
  assert.equal(createdBody.list.client_id, fixtures.clientId);
  assert.equal(createdBody.list.project_id, fixtures.projectId);
  fixtures.businessListId = createdBody.list.list_id;

  const item = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "API Widget",
    quantity: 2,
    unit: "box",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemEnvelope} */
  const itemBody = readPayload(item, ["item"], "item");
  assert.equal(item.status, 201);
  assert.equal(itemBody.item.item_name, "API Widget");
  fixtures.businessItemId = itemBody.item.list_item_id;

  const secondItem = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "API Cable",
    quantity: 5,
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemEnvelope} */
  const secondItemBody = readPayload(secondItem, ["item"], "second item");
  assert.equal(secondItem.status, 201);

  const updatedItem = await api.put(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}`, {
    item_name: "API Widget Updated",
    purchase_status: "ordered",
    quantity: 3,
    sort_order: 20,
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemEnvelope} */
  const updatedItemBody = readPayload(updatedItem, ["item"], "updated item");
  assert.equal(updatedItem.status, 200);
  assert.equal(updatedItemBody.item.purchase_status, "ordered");

  const reordered = await api.post(`/api/lists/${fixtures.businessListId}/items/reorder`, {
    items: [
      { list_item_id: secondItemBody.item.list_item_id, sort_order: 0 },
      { list_item_id: fixtures.businessItemId, sort_order: 10 },
    ],
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemsEnvelope} */
  const reorderedBody = readPayload(reordered, ["items"], "reordered");
  assert.equal(reordered.status, 200);
  assert.deepEqual(reorderedBody.items.map((entry) => entry.list_item_id), [
    secondItemBody.item.list_item_id,
    fixtures.businessItemId,
  ]);

  const checked = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/check`, {}, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {ItemEnvelope} */
  const checkedBody = readPayload(checked, ["item"], "checked");
  assert.equal(checked.status, 200);
  assert.ok(checkedBody.item.checked_at);

  const completedItem = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/complete`, {}, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {ItemEnvelope} */
  const completedItemBody = readPayload(completedItem, ["item"], "completed item");
  assert.equal(completedItem.status, 200);
  assert.ok(completedItemBody.item.completed_at);

  const unchecked = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/uncheck`, {}, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {ItemEnvelope} */
  const uncheckedBody = readPayload(unchecked, ["item"], "unchecked");
  assert.equal(unchecked.status, 200);
  assert.equal(uncheckedBody.item.checked_at, null);
  assert.ok(uncheckedBody.item.completed_at);

  const items = await api.get(`/api/lists/${fixtures.businessListId}/items`, { cookie: fixtures.adminSessionId });
  /** @type {ItemsEnvelope} */
  const itemsBody = readPayload(items, ["items"], "items");
  assert.equal(items.status, 200);
  assert.equal(itemsBody.items.length, 2);

  const read = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  /** @type {ListItemsEnvelope} */
  const readBody = readPayload(read, ["items", "list"], "read");
  assert.equal(read.status, 200);
  assert.equal(readBody.items.length, 2);
  assert.equal(readBody.list.progress.totalItemCount, 2);
  assert.equal(readBody.list.progress.nextUncheckedItemLabel, "API Cable");
  assert.equal(readBody.list.resumeContext.sourceUrl, `lists.html?list=${encodeURIComponent(fixtures.businessListId)}`);
  assert.equal(readBody.list.resumeContext.progress.totalItemCount, 2);

  const reusable = await api.post(`/api/lists/${fixtures.businessListId}/mark-reusable`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const reusableBody = readPayload(reusable, ["list"], "reusable");
  assert.equal(reusable.status, 200);
  assert.equal(reusableBody.list.is_reusable, true);

  const duplicated = await api.post(`/api/lists/${fixtures.businessListId}/duplicate`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListItemsEnvelope} */
  const duplicatedBody = readPayload(duplicated, ["items", "list"], "duplicated");
  assert.equal(duplicated.status, 201);
  assert.equal(duplicatedBody.list.status, "active");
  assert.equal(duplicatedBody.list.is_reusable, false);
  assert.equal(duplicatedBody.list.source_list_id, fixtures.businessListId);
  assert.equal(duplicatedBody.list.duplicated_from_list_id, fixtures.businessListId);
  // Both source summaries are nullable on the published record, and these are
  // the assertions proving a duplicate keeps its provenance, so each is proven
  // present rather than read through.
  assert.ok(duplicatedBody.list.sourceContext.duplicatedFrom, "a duplicated list should record what it was duplicated from");
  assert.ok(duplicatedBody.list.sourceContext.sourceList, "a duplicated list should record its source list");
  assert.equal(duplicatedBody.list.sourceContext.duplicatedFrom.title, "API Procurement List");
  assert.equal(duplicatedBody.list.sourceContext.sourceList.title, "API Procurement List");
  assert.equal(duplicatedBody.items.length, 2);
  assert.ok(duplicatedBody.items.every((entry) => entry.purchase_status === "needed"));
  assert.ok(duplicatedBody.items.every((entry) => entry.checked_at === null && entry.completed_at === null));

  const catalog = await api.post("/api/lists/item-catalog", {
    estimated_cost: 9,
    item_name: "API Catalog Tape",
    list_type: "procurement",
    quantity: 6,
    unit: "roll",
  }, { cookie: fixtures.adminSessionId });
  /** @type {CatalogItemEnvelope} */
  const catalogBody = readPayload(catalog, ["catalogItem"], "catalog");
  assert.equal(catalog.status, 201);
  assert.equal(catalogBody.catalogItem.use_count, 0);

  const catalogSuggestions = await api.get(`/api/lists/item-suggestions?listId=${fixtures.businessListId}&q=tape`, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {SuggestionsEnvelope} */
  const catalogSuggestionsBody = readPayload(catalogSuggestions, ["suggestions"], "catalog suggestions");
  assert.equal(catalogSuggestions.status, 200);
  assert.equal(catalogSuggestionsBody.suggestions[0].catalog_item_id, catalogBody.catalogItem.catalog_item_id);
  const catalogList = await api.get(`/api/lists/catalog-items?listId=${fixtures.businessListId}&q=tape`, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {CatalogItemsEnvelope} */
  const catalogListBody = readPayload(catalogList, ["catalogItems"], "catalog list");
  assert.equal(catalogList.status, 200);
  assert.equal(catalogListBody.catalogItems[0].catalog_item_id, catalogBody.catalogItem.catalog_item_id);

  const catalogBackedItem = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    catalog_item_id: catalogBody.catalogItem.catalog_item_id,
    item_name: "API Catalog Tape",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemEnvelope} */
  const catalogBackedItemBody = readPayload(catalogBackedItem, ["item"], "catalog backed item");
  assert.equal(catalogBackedItem.status, 201);
  assert.equal(catalogBackedItemBody.item.quantity, 6);
  assert.equal(catalogBackedItemBody.item.unit, "roll");
  assert.equal(catalogBackedItemBody.item.estimated_cost, 9);

  const usedSuggestions = await api.get(`/api/lists/item-suggestions?listId=${fixtures.businessListId}&q=tape`, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {SuggestionsEnvelope} */
  const usedSuggestionsBody = readPayload(usedSuggestions, ["suggestions"], "used suggestions");
  assert.equal(usedSuggestionsBody.suggestions[0].use_count, 1);

  const updatedCatalog = await api.put(`/api/lists/item-catalog/${catalogBody.catalogItem.catalog_item_id}`, {
    item_name: "API Catalog Tape Revised",
    list_type: "procurement",
    quantity: 100,
    unit: "case",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(updatedCatalog.status, 200);
  const snapshotRead = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  /** @type {ItemsEnvelope} */
  const snapshotReadBody = readPayload(snapshotRead, ["items"], "snapshot read");
  const snapshotItem = snapshotReadBody.items.find((entry) => entry.list_item_id === catalogBackedItemBody.item.list_item_id);
  assert.ok(snapshotItem, "the catalog-backed item should still be readable after the catalog row was revised");
  assert.equal(snapshotItem.item_name, "API Catalog Tape");
  assert.equal(snapshotItem.quantity, 6);
  assert.equal(snapshotItem.unit, "roll");

  const savedCatalogItem = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "API Saved Reusable Item",
    quantity: 2,
    save_to_catalog: true,
    unit: "kit",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ItemEnvelope} */
  const savedCatalogItemBody = readPayload(savedCatalogItem, ["item"], "saved catalog item");
  assert.equal(savedCatalogItem.status, 201);
  assert.ok(savedCatalogItemBody.item.catalog_item_id);

  const projectTargets = await api.get("/api/lists/link-targets?targetType=project&q=Lists%20API", {
    cookie: fixtures.adminSessionId,
  });
  /** @type {LinkTargetsEnvelope} */
  const projectTargetsBody = readPayload(projectTargets, ["providers", "targets"], "project targets");
  assert.equal(projectTargets.status, 200);
  assert.deepEqual(projectTargetsBody.providers.map((provider) => provider.targetType), ["client", "note", "project", "task"]);
  assert.equal(projectTargetsBody.targets[0].targetId, fixtures.projectId);
  assert.equal(projectTargetsBody.targets[0].displayLabel, "Lists API Project - Lists API Client");
  assert.equal(projectTargetsBody.targets[0].isAvailable, true);
  assert.ok(!projectTargetsBody.targets[0].displayLabel.includes(fixtures.projectId));

  const projectLink = await api.post(`/api/lists/${fixtures.businessListId}/links`, {
    targetId: fixtures.projectId,
    targetType: "project",
  }, { cookie: fixtures.adminSessionId });
  /** @type {LinkEnvelope} */
  const projectLinkBody = readPayload(projectLink, ["link"], "project link");
  assert.equal(projectLink.status, 201);
  // A link whose target could not be resolved publishes a null target, and
  // these are the assertions proving the picker resolved a labelled one.
  assert.ok(projectLinkBody.link.target, "creating a project link should resolve its linked target");
  assert.equal(projectLinkBody.link.target.target_type, "project");
  assert.equal(projectLinkBody.link.target.label, "Lists API Project");

  const clientLink = await api.post(`/api/lists/${fixtures.businessListId}/links`, {
    targetId: fixtures.clientId,
    targetType: "client",
  }, { cookie: fixtures.adminSessionId });
  /** @type {LinkEnvelope} */
  const clientLinkBody = readPayload(clientLink, ["link"], "client link");
  assert.equal(clientLink.status, 201);
  assert.ok(clientLinkBody.link.target, "creating a client link should resolve its linked target");
  assert.equal(clientLinkBody.link.target.label, "Lists API Client");

  const mismatchedProviderLink = await api.post(`/api/lists/${fixtures.businessListId}/links`, {
    moduleId: "tasks",
    targetId: fixtures.projectId,
    targetType: "project",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(mismatchedProviderLink.status, 400, "Strict link creation should reject a provider/type mismatch");

  const links = await api.get(`/api/lists/${fixtures.businessListId}/links`, { cookie: fixtures.adminSessionId });
  /** @type {LinksEnvelope} */
  const linksBody = readPayload(links, ["links"], "links");
  assert.equal(links.status, 200);
  assert.equal(linksBody.links.length, 2);

  const readWithLinks = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  /** @type {ListLinksEnvelope} */
  const readWithLinksBody = readPayload(readWithLinks, ["links", "list"], "read with links");
  assert.equal(readWithLinksBody.links.length, 2);
  assert.ok(readWithLinksBody.links.every((link) => link.target?.label));
  assert.equal(readWithLinksBody.list.resumeContext.linkedRecords.length, 2);
  assert.ok(readWithLinksBody.list.resumeContext.linkedRecords.every((link) => link.isAvailable && link.sourceUrl));

  const removedLink = await api.post(`/api/lists/${fixtures.businessListId}/links/${projectLinkBody.link.list_link_id}/remove`, {}, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {LinkEnvelope} */
  const removedLinkBody = readPayload(removedLink, ["link"], "removed link");
  assert.equal(removedLink.status, 200);
  assert.ok(removedLinkBody.link.removed_at);

  const unmarkedReusable = await api.post(`/api/lists/${fixtures.businessListId}/unmark-reusable`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const unmarkedReusableBody = readPayload(unmarkedReusable, ["list"], "unmarked reusable");
  assert.equal(unmarkedReusable.status, 200);
  assert.equal(unmarkedReusableBody.list.is_reusable, false);

  const completed = await api.post(`/api/lists/${fixtures.businessListId}/complete`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const completedBody = readPayload(completed, ["list"], "completed");
  assert.equal(completed.status, 200);
  assert.equal(completedBody.list.status, "completed");

  const reopened = await api.post(`/api/lists/${fixtures.businessListId}/reopen`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const reopenedBody = readPayload(reopened, ["list"], "reopened");
  assert.equal(reopened.status, 200);
  assert.equal(reopenedBody.list.status, "active");

  const archived = await api.post(`/api/lists/${fixtures.businessListId}/archive`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const archivedBody = readPayload(archived, ["list"], "archived");
  assert.equal(archived.status, 200);
  assert.equal(archivedBody.list.status, "archived");

  const restored = await api.post(`/api/lists/${fixtures.businessListId}/restore`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const restoredBody = readPayload(restored, ["list"], "restored");
  assert.equal(restored.status, 200);
  assert.equal(restoredBody.list.status, "active");

  const deletedItem = await api.delete(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}`, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {ItemEnvelope} */
  const deletedItemBody = readPayload(deletedItem, ["item"], "deleted item");
  assert.equal(deletedItem.status, 200);
  assert.ok(deletedItemBody.item.deleted_at);

  const deleted = await api.delete(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const deletedBody = readPayload(deleted, ["list"], "deleted");
  assert.equal(deleted.status, 200);
  assert.equal(deletedBody.list.status, "deleted");

  const hiddenDeleted = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(hiddenDeleted.status, 404);

  const restoredDeleted = await api.post(`/api/lists/${fixtures.businessListId}/restore`, {}, {
    cookie: fixtures.adminSessionId,
  });
  /** @type {ListEnvelope} */
  const restoredDeletedBody = readPayload(restoredDeleted, ["list"], "restored deleted");
  assert.equal(restoredDeleted.status, 200);
  assert.equal(restoredDeletedBody.list.status, "active");

  const bom = await api.post("/api/lists", {
    list_type: "bill_of_materials",
    title: "API BOM",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const bomBody = readPayload(bom, ["list"], "bom");
  assert.equal(bom.status, 201);
  const bomItem = await api.post(`/api/lists/${bomBody.list.list_id}/items`, {
    actual_cost: 32,
    item_name: "BOM Part",
    purchase_status: "received",
    tracking_id: "API-BOM-TRACK",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(bomItem.status, 201);
  const finalizedBom = await api.post(`/api/lists/${bomBody.list.list_id}/finalize`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListEnvelope} */
  const finalizedBomBody = readPayload(finalizedBom, ["list"], "finalized bom");
  assert.equal(finalizedBom.status, 200);
  assert.equal(finalizedBomBody.list.status, "finalized");
  const finalizedEdit = await api.post(`/api/lists/${bomBody.list.list_id}/items`, {
    item_name: "Blocked finalized edit",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ErrorEnvelope} */
  const finalizedEditBody = readPayload(finalizedEdit, ["error"], "finalized edit");
  assert.equal(finalizedEdit.status, 400);
  assert.match(finalizedEditBody.error.message, /finalized/i);
  const duplicatedBom = await api.post(`/api/lists/${bomBody.list.list_id}/duplicate`, {}, { cookie: fixtures.adminSessionId });
  /** @type {ListItemsEnvelope} */
  const duplicatedBomBody = readPayload(duplicatedBom, ["items", "list"], "duplicated bom");
  assert.equal(duplicatedBom.status, 201);
  assert.equal(duplicatedBomBody.list.status, "active");
  assert.ok(duplicatedBomBody.list.sourceContext.duplicatedFrom, "a duplicated bill of materials should record what it was duplicated from");
  assert.equal(duplicatedBomBody.list.sourceContext.duplicatedFrom.title, "API BOM");
  assert.equal(duplicatedBomBody.list.sourceContext.duplicatedFrom.status, "finalized");
  assert.equal(duplicatedBomBody.items[0].actual_cost, null);
  assert.equal(duplicatedBomBody.items[0].purchase_status, "needed");
}

/** @param {ListsApi} api @param {ListsApiFixtures} fixtures */
async function assertFamilyListApiFlow(api, fixtures) {
  const created = await api.post("/api/lists", {
    title: "Family Grocery List",
  }, { cookie: fixtures.familySessionId });
  /** @type {ListEnvelope} */
  const createdBody = readPayload(created, ["list"], "created");
  assert.equal(created.status, 201);
  assert.equal(createdBody.list.list_type, "shopping");
  assert.equal(createdBody.list.client_id, null);
  fixtures.familyListId = createdBody.list.list_id;

  const blockedClientContext = await api.post("/api/lists", {
    client_id: fixtures.clientId,
    title: "Family Client List",
  }, { cookie: fixtures.familySessionId });
  /** @type {ErrorEnvelope} */
  const blockedClientContextBody = readPayload(blockedClientContext, ["error"], "blocked client context");
  assert.equal(blockedClientContext.status, 400);
  assert.match(blockedClientContextBody.error.message, /business workspaces/i);

  const familySuggestions = await api.get(`/api/lists/item-suggestions?listId=${fixtures.familyListId}&q=tape`, {
    cookie: fixtures.familySessionId,
  });
  /** @type {SuggestionsEnvelope} */
  const familySuggestionsBody = readPayload(familySuggestions, ["suggestions"], "family suggestions");
  assert.equal(familySuggestions.status, 200);
  assert.deepEqual(familySuggestionsBody.suggestions, []);
}

/** @param {ListsApi} api @param {ListsApiFixtures} fixtures */
async function assertUnauthorizedAndIsolation(api, fixtures) {
  const externalRead = await api.get(`/api/lists/${fixtures.businessListId}`, {
    cookie: fixtures.externalSessionId,
  });
  assert.equal(externalRead.status, 403);

  const externalCreate = await api.post("/api/lists", {
    title: "External List",
  }, { cookie: fixtures.externalSessionId });
  assert.equal(externalCreate.status, 403);

  const externalInvalidCreate = await api.post("/api/lists", {
    title: { nested: true },
  }, { cookie: fixtures.externalSessionId });
  assert.equal(externalInvalidCreate.status, 403, "Lists validation must not bypass create permission denial");

  const externalLink = await api.post(`/api/lists/${fixtures.businessListId}/links`, {
    targetId: fixtures.projectId,
    targetType: "project",
  }, { cookie: fixtures.externalSessionId });
  assert.equal(externalLink.status, 403);

  const externalTargets = await api.get("/api/lists/link-targets?targetType=project", {
    cookie: fixtures.externalSessionId,
  });
  assert.equal(externalTargets.status, 403, "Users without lists.manage_links must not receive picker targets");

  const crossWorkspaceRead = await api.get(`/api/lists/${fixtures.familyListId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(crossWorkspaceRead.status, 404);
}

/** @param {ListsApi} api @param {ListsApiFixtures} fixtures */
async function assertDisabledModuleBehavior(api, fixtures) {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'lists';
`);

  const read = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(read.status, 200);

  const write = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "Blocked while disabled",
  }, { cookie: fixtures.adminSessionId });
  /** @type {ErrorEnvelope} */
  const writeBody = readPayload(write, ["error"], "write");
  assert.equal(write.status, 403);
  assert.match(writeBody.error.message, /disabled/i);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'lists';
`);
}

async function seedFixtures() {
  const now = new Date().toISOString();
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);
  const workspaceId = rows[0]?.workspace_id;
  assert.ok(workspaceId, "default workspace should exist");

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(workspaceId)};
`);

  const adminRows = await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const admin = adminRows[0];
  assert.ok(admin?.user_id, "protected admin user should exist");

  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const projectId = randomUUID();
  const familyWorkspaceId = randomUUID();
  const familyUserId = randomUUID();
  const externalUserId = randomUUID();

  await runSql(`
INSERT INTO clients (
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
VALUES
  (${sqlText(clientId)}, ${sqlText(workspaceId)}, NULL, 'Lists API Client', 'active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(otherClientId)}, ${sqlText(workspaceId)}, NULL, 'Lists API Other Client', 'active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO projects (
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
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  'Lists API Project',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(familyWorkspaceId)}, 'Lists API Family Workspace', 'active', 'family', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_settings (
  workspace_id,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(familyWorkspaceId)},
  1,
  30,
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES
  (${sqlText(familyUserId)}, ${sqlText(familyWorkspaceId)}, 'lists-api-family@example.test', 'Lists API Family Admin', 'America/New_York', '', 'light', 'active', 'no', ${sqlText(familyWorkspaceId)}),
  (${sqlText(externalUserId)}, ${sqlText(workspaceId)}, 'lists-api-external@example.test', 'Lists API External User', 'America/New_York', '', 'light', 'active', 'no', ${sqlText(workspaceId)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES
  (${sqlText(randomUUID())}, ${sqlText(familyUserId)}, ${sqlText(familyWorkspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(randomUUID())}, ${sqlText(externalUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES
  (${sqlText(randomUUID())}, ${sqlText(familyWorkspaceId)}, ${sqlText(familyUserId)}, 'workspace_admin', 'workspace', ${sqlText(familyWorkspaceId)}, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(externalUserId)}, 'client_external_user', 'all', 'all', NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)});
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const familySession = await createSession({
    active_workspace_id: familyWorkspaceId,
    home_workspace_id: familyWorkspaceId,
    timezone: "America/New_York",
    user_id: familyUserId,
    username: "lists-api-family@example.test",
  });
  const externalSession = await createSession({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: externalUserId,
    username: "lists-api-external@example.test",
  });

  const { modulesService } = await import("../src/core/modules/modules.service.js");
  await modulesService.syncModuleRegistry(familyWorkspaceId);

  return {
    adminSessionId: adminSession.sessionId,
    clientId,
    externalSessionId: externalSession.sessionId,
    familySessionId: familySession.sessionId,
    familyWorkspaceId,
    otherClientId,
    projectId,
    workspaceId,
  };
}

/**
 * @param {string} baseUrl
 * @returns {{
 *   delete: (url: string, options?: ListsApiClientOptions) => Promise<ListsApiResponse>,
 *   get: (url: string, options?: ListsApiClientOptions) => Promise<ListsApiResponse>,
 *   post: (url: string, body?: unknown, options?: ListsApiClientOptions) => Promise<ListsApiResponse>,
 *   put: (url: string, body?: unknown, options?: ListsApiClientOptions) => Promise<ListsApiResponse>,
 * }}
 */
function createApi(baseUrl) {
  return {
    delete: (url, options = {}) => request(baseUrl, "DELETE", url, null, options),
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} body
 * @param {ListsApiClientOptions} [options]
 * @returns {Promise<ListsApiResponse>}
 */
async function request(baseUrl, method, url, body, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  // The parsed body stays `unknown`. Every read below crosses that boundary
  // through `readPayload`, which proves the envelope it names is present, so a
  // route that stops publishing one fails here rather than comparing
  // `undefined` against an expected value further down.
  /** @type {unknown} */
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
    text,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

/** @param {ListsApiApp} app @returns {Promise<ListsApiServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(/** @type {http.RequestListener} */ (/** @type {unknown} */ (app)));
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** @param {ListsApiServer} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the Lists API fixture server should bind a TCP port");
  return address.port;
}

/** @param {ListsApiServer} server @returns {Promise<void>} */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
