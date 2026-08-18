import { listsRepository } from "./lists.repo.js";
import { createCatalogItemsService } from "./catalog-items.service.js";
import { createListItemsService } from "./list-items.service.js";
import {
  CreateListLinkSchema,
  CreateListSchema,
  DuplicateListSchema,
  UpdateListSchema,
  parseListsEdgePayload,
} from "./lists.contracts.js";
import {
  LIST_PERMISSIONS,
  canAccessList,
  canManageListItem,
  itemResource,
  listResource,
  sanitizeListLifecyclePayload,
} from "./access-policy.js";
import {
  LIST_ITEM_PURCHASE_STATUSES,
  LIST_ITEM_PURCHASE_STATUS_VALUES,
  LIST_MODULE_ID,
  LIST_STATUSES,
  LIST_STATUS_VALUES,
  LIST_TYPES,
  LIST_TYPE_VALUES,
  defaultListTypeForWorkspaceType,
  validateListContext,
  validateListItemContext,
} from "./storage-contract.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import {
  createVisibleRecordBatch,
  mapVisibleRecordBatch,
} from "../../core/list-enrichment.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { reserveAdditionalPublicDemoBudgetUnits } from "../../core/public-demo-budgets.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { tasksRepository } from "../tasks/tasks.repo.js";
import { notesService } from "../notes/index.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { tagsService } from "../../services/tags.service.js";
import { resolveClientProjectFilterScope } from "../../core/client-project-filter-scope.js";
import { assertLinkedContextTargetContract } from "../../core/linked-context/provider-contract.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogItemRecord} ListsCatalogItemRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsLinkRecord} ListsLinkRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsLinkPersistenceInput} ListsLinkPersistenceInput */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsBrowserLink} ListsBrowserLink */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsBrowserRecord} ListsBrowserRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsNormalizedQuery} ListsNormalizedQuery */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRecord} ListsRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRepositoryFilters} ListsRepositoryFilters */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsServiceQuery} ListsServiceQuery */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsServiceSession} ListsServiceSession */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsSourceContext} ListsSourceContext */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsSourceSummary} ListsSourceSummary */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsVisibleBatch} ListsVisibleBatch */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsItemPersistenceInput} ListsItemPersistenceInput */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemOrder} ListsItemOrder */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemProgressBatch} ListsItemProgressBatch */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemProgressSummary} ListsItemProgressSummary */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemRecord} ListsItemRecord */
/** @typedef {import("../../types/framework-contracts.js").LinkedContextProviderContribution} LinkedContextProviderContribution */
/** @typedef {Record<string, unknown>} ListsRawQuery */
/** @typedef {{ includeItems?: boolean, includeDeletedItems?: boolean, includeDeleted?: boolean }} ListsReadOptions */
/** @typedef {{ action: string, changeType: string, eventName: string, operation: string, options?: ListsReadOptions, patch: (previousList: ListsRecord, now: string) => Partial<ListsRecord> }} ListsTransition */
/** @typedef {{ module_id: string, target_id: string, target_type: string }} ListsLinkTargetIdentity */
/** @typedef {ReturnType<typeof assertLinkedContextTargetContract> & { ariaLabel: string, fullLabel: string, title: string }} LinkedTargetSummary */
/** @typedef {{ label: string, module_id: string, target_id: string, target_type: string, url: string }} LinkedTargetRecord */
/** @typedef {{ client_id?: string | null, client_name?: string | null, name?: string | null, project_id?: string | null, project_name?: string | null, workspace_id?: string | null }} ListsContextRecord */
/** @typedef {{ record: ListsContextRecord, projectsById: Map<string, ListsContextRecord>, clientsById: Map<string, ListsContextRecord>, isBusiness: boolean, provider: LinkedContextProviderContribution, workspaceId: string, title: unknown, targetType: string, moduleId: string, recordId: string, statusRank: string, sourceUrl: string }} ContextualListLinkTargetOptions */
/** @typedef {{ moduleId: string, targetType: string, targetId: string, displayLabel: string, secondaryLabel: string, sortKey: string, sourceUrl: string, clientId: string, projectId: string, workspaceId: string, title: string }} LinkedTargetShapeInput */

/** @type {Set<string>} */
const LIST_TYPE_SET = new Set(LIST_TYPE_VALUES);
/** @type {Set<string>} */
const LIST_STATUS_SET = new Set(LIST_STATUS_VALUES);
/** @type {Set<string>} */
const PURCHASE_STATUS_SET = new Set(LIST_ITEM_PURCHASE_STATUS_VALUES);
const LIST_LINK_TARGET_TYPES = new Set(["client", "note", "project", "task"]);
const catalogItemsService = createCatalogItemsService({
  assertCanAccessList,
  assertCanManageCatalog,
  assertListsReadable,
  emitCatalogEvent,
  readClientById: clientsRepository.readById,
  readListOrThrow,
  readProjectById: projectsRepository.readById,
  recordCatalogAudit,
  repository: listsRepository,
});
const listItemsService = createListItemsService({
  assertCanManageItem,
  catalogItems: catalogItemsService,
  emitItemEvent,
  emitListEvent,
  nextSortOrder,
  normalizeItemOrders,
  normalizeItemPayload,
  readListOrThrow,
  recordItemAudit,
  recordListAudit,
  repository: listsRepository,
  syncListSearchIndex,
});

/** @param {ListsServiceSession} session @param {ListsRawQuery} [query] */
async function list(session, query = {}) {
  await assertListsReadable(session);
  const normalizedQuery = await normalizeListQuery(session, query);
  const lists = await listsRepository.list(session.workspace_id, normalizedQuery.repositoryFilters);
  const readableLists = [];

  for (const listRecord of lists) {
    if (await canReadList(session, listRecord)) {
      readableLists.push(listRecord);
    }
  }

  const shapedLists = await shapeListsForBrowser(session, readableLists);
  const taggedLists = await tagsService.decorateRecordsForTarget(
    session,
    "list",
    await tagsService.filterRecordsByTags(session, "list", shapedLists, normalizedQuery.tagIds, { idField: "list_id" }),
    { idField: "list_id" },
  );
  const filteredLists = taggedLists.filter((listRecord) => listMatchesCanonicalQuery(listRecord, normalizedQuery, session));

  return {
    lists: sortCanonicalLists(filteredLists, normalizedQuery),
    query: normalizedQuery.response,
  };
}

// Batched existence/status/readability check for resume-state scans: one
// IN-query over the record ids, module status from the cached context, and
// the in-memory permission evaluators feeding the same canAccessList policy
// the single-list read enforces.
/** @param {ListsServiceSession} session @param {string[]} [listIds] */
async function readLifecycleForIds(session, listIds = []) {
  const [listRecords, moduleEnabled, canViewList, canViewAllLists] = await Promise.all([
    listsRepository.readByIds(session.workspace_id, listIds),
    modulesService.canWriteModule(session.workspace_id, LIST_MODULE_ID),
    permissionsService.createPermissionEvaluator(session, LIST_PERMISSIONS.VIEW),
    permissionsService.createPermissionEvaluator(session, LIST_PERMISSIONS.VIEW_ALL),
  ]);
  const lifecycleByListId = new Map();

  for (const listRecord of listRecords) {
    const resource = listResource(listRecord);
    const permissions = [
      canViewList(resource) ? LIST_PERMISSIONS.VIEW : "",
      canViewAllLists(resource) ? LIST_PERMISSIONS.VIEW_ALL : "",
    ].filter(Boolean);
    const access = canAccessList({
      historicalReadAccess: true,
      list: listRecord,
      listsModuleEnabled: moduleEnabled,
      operation: "read",
      permissions,
      session,
    });

    lifecycleByListId.set(listRecord.list_id, access.allowed
      ? {
          archived: listRecord.status === LIST_STATUSES.ARCHIVED,
          completed: listRecord.status === LIST_STATUSES.COMPLETED,
          deleted: listRecord.status === LIST_STATUSES.DELETED,
          finalized: listRecord.status === LIST_STATUSES.FINALIZED,
          readable: true,
          status: listRecord.status || LIST_STATUSES.ACTIVE,
        }
      : { readable: false });
  }

  return lifecycleByListId;
}

/** @param {string} listId @param {ListsServiceSession} session @param {ListsReadOptions} [options] */
async function read(listId, session, options = {}) {
  const listRecord = await readListOrThrow(session, listId, options);
  await assertCanAccessList(session, listRecord, "read");
  const items = options.includeItems === false
    ? []
    : await listsRepository.listItems(session.workspace_id, listRecord.list_id, {
        includeDeleted: options.includeDeletedItems === true,
      });

  return {
    list: await shapeListForBrowser(session, listRecord),
    items: items.map(shapeItemForBrowser),
    links: await readPermissionSafeLinks(session, listRecord),
  };
}

/** @param {unknown} rawPayload */
/** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function create(rawPayload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  await permissionsService.assertCanInAnyScope(session, LIST_PERMISSIONS.CREATE, {
    operation: "create",
    workspace_id: session.workspace_id,
  });
  const payload = parseListsEdgePayload(CreateListSchema, rawPayload);
  const normalized = await normalizeListPayload(payload, session, {
    list_id: payload?.list_id || payload?.id,
    status: LIST_STATUSES.ACTIVE,
    is_reusable: false,
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  await permissionsService.assertCan(session, LIST_PERMISSIONS.CREATE, {
    ...listResource(normalized),
    operation: "create",
  });

  if (normalized.status !== LIST_STATUSES.ACTIVE) {
    throw new AppError("New lists must start active in this release.", 400);
  }

  const listRecord = await listsRepository.create(session.workspace_id, normalized);
  if (!listRecord) {
    throw new AppError("List creation did not return a record.", 500);
  }
  await recordListAudit(session, "list_created", "create", null, listRecord);
  await emitListEvent("lists.list.created", session, null, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.created");

  return { list: await shapeListForBrowser(session, listRecord) };
}

/** @param {unknown} rawPayload */
/** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function update(listId, rawPayload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const previousList = await readListOrThrow(session, listId);
  await assertCanAccessList(session, previousList, "update");
  const payload = parseListsEdgePayload(UpdateListSchema, rawPayload);
  const normalized = await normalizeListPayload(payload, session, {
    ...previousList,
    updated_by_user_id: session.user_id,
  });
  if (normalized.status === LIST_STATUSES.FINALIZED && previousList.status !== LIST_STATUSES.FINALIZED) {
    throw new AppError("Finalize lists through the finalized-list workflow.", 400);
  }
  await assertCanAccessList(session, normalized, "update");

  const listRecord = await listsRepository.update(session.workspace_id, normalized);
  if (!listRecord) {
    throw new AppError("List update did not return a record.", 500);
  }
  await recordListAudit(session, "list_updated", "update", previousList, listRecord);
  await emitListEvent("lists.list.updated", session, previousList, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.updated");

  return { list: await shapeListForBrowser(session, listRecord) };
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function complete(listId, session) {
  return transitionList(listId, session, {
    action: "list_completed",
    changeType: "update",
    eventName: "lists.list.completed",
    operation: "complete",
    patch: (previousList, now) => ({
      status: LIST_STATUSES.COMPLETED,
      completed_at: previousList.completed_at || now,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function finalize(listId, session) {
  return transitionList(listId, session, {
    action: "list_finalized",
    changeType: "update",
    eventName: "lists.list.finalized",
    operation: "finalize",
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.FINALIZED,
      completed_at: now,
      finalized_at: now,
      finalized_by_user_id: session.user_id,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function reopen(listId, session) {
  return transitionList(listId, session, {
    action: "list_reopened",
    changeType: "update",
    eventName: "lists.list.reopened",
    operation: "complete",
    patch: () => ({
      status: LIST_STATUSES.ACTIVE,
      completed_at: null,
      finalized_at: null,
      finalized_by_user_id: null,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function markReusable(listId, session) {
  return transitionList(listId, session, {
    action: "list_reusable_marked",
    changeType: "update",
    eventName: "lists.list.reusable_marked",
    operation: "manage_reusable",
    patch: () => ({
      is_reusable: true,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function unmarkReusable(listId, session) {
  return transitionList(listId, session, {
    action: "list_reusable_unmarked",
    changeType: "update",
    eventName: "lists.list.reusable_unmarked",
    operation: "manage_reusable",
    patch: () => ({
      is_reusable: false,
    }),
  });
}

/** @param {unknown} rawPayload */
/** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function duplicate(listId, rawPayload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const sourceList = await readListOrThrow(session, listId);
  await assertCanAccessList(session, sourceList, "duplicate");
  const payload = parseListsEdgePayload(DuplicateListSchema, rawPayload);

  const sourceItems = await listsRepository.listItems(session.workspace_id, sourceList.list_id);
  await reserveAdditionalPublicDemoBudgetUnits(sourceItems.length);
  const title = normalizeOptionalText(payload.title || payload.copyTitle) || `Copy of ${sourceList.title}`;
  const duplicatedList = await normalizeListPayload({
    client_id: sourceList.client_id,
    description: sourceList.description,
    duplicated_from_list_id: sourceList.list_id,
    is_reusable: false,
    list_id: payload.list_id || payload.id,
    list_type: sourceList.list_type,
    project_id: sourceList.project_id,
    source_list_id: sourceList.is_reusable ? sourceList.list_id : sourceList.source_list_id,
    title,
  }, session, {
    created_by_user_id: session.user_id,
    status: LIST_STATUSES.ACTIVE,
    updated_by_user_id: session.user_id,
  });

  const createdList = await listsRepository.create(session.workspace_id, {
    ...duplicatedList,
    completed_at: null,
    finalized_at: null,
    finalized_by_user_id: null,
    archived_at: null,
    deleted_at: null,
  });
  if (!createdList) {
    throw new AppError("List duplication did not return a record.", 500);
  }

  const copiedItems = [];
  for (const [index, item] of sourceItems.entries()) {
    const copiedItem = await listsRepository.createItem(session.workspace_id, duplicateItemPayload(item, createdList, session, index));
    if (!copiedItem) {
      throw new AppError("List item duplication did not return a record.", 500);
    }
    copiedItems.push(copiedItem);
  }

  await recordListAudit(session, "list_duplicated", "create", sourceList, createdList, {
    duplicated_from_list_id: sourceList.list_id,
    source_list_id: createdList.source_list_id,
  });
  await emitListEvent("lists.list.duplicated", session, sourceList, createdList, {
    duplicated_from_list_id: sourceList.list_id,
    source_list_id: createdList.source_list_id,
  });
  await syncListSearchIndex(session.workspace_id, createdList.list_id, "list.duplicated");

  return {
    items: copiedItems.map(shapeItemForBrowser),
    list: await shapeListForBrowser(session, createdList),
  };
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function archive(listId, session) {
  return transitionList(listId, session, {
    action: "list_archived",
    changeType: "archive",
    eventName: "lists.list.archived",
    operation: "archive",
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.ARCHIVED,
      archived_at: now,
      deleted_at: null,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function restore(listId, session) {
  return transitionList(listId, session, {
    action: "list_restored",
    changeType: "restore",
    eventName: "lists.list.restored",
    operation: "restore",
    options: { includeDeleted: true },
    patch: () => ({
      status: LIST_STATUSES.ACTIVE,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

/** @param {string} listId @param {WorkspaceRequestSession} session */
async function softDelete(listId, session) {
  return transitionList(listId, session, {
    action: "list_deleted",
    changeType: "delete",
    eventName: "lists.list.deleted",
    operation: "delete",
    options: { includeDeleted: true },
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.DELETED,
      deleted_at: now,
    }),
  });
}

/** @param {string} listId @param {ListsServiceSession} session */
async function listLinks(listId, session) {
  const listRecord = await readListOrThrow(session, listId, { includeDeleted: true });
  await assertCanAccessList(session, listRecord, "read");

  return { links: await readPermissionSafeLinks(session, listRecord) };
}

/** @param {WorkspaceRequestSession} session @param {ListsRawQuery} [query] */
async function listLinkTargets(session, query = {}) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  await permissionsService.assertCanInAnyScope(session, LIST_PERMISSIONS.MANAGE_LINKS, {
    operation: "manage_links",
    workspace_id: session.workspace_id,
  });

  const activeProviders = (await modulesService.listActiveLinkedContextProviders(session.workspace_id, session))
    .filter((provider) => LIST_LINK_TARGET_TYPES.has(provider.targetType));
  const targetType = normalizeOptionalText(query.targetType || query.target_type) || activeProviders[0]?.targetType || "";

  if (!targetType || !activeProviders.some((provider) => provider.targetType === targetType)) {
    throw new AppError("Linked target type is not available for this list.", 400);
  }

  const search = normalizeOptionalText(query.q || query.query || query.search).toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? ""), 10) || 20, 1), 50);
  const provider = activeProviders.find((entry) => entry.targetType === targetType);
  if (!provider) {
    throw new AppError("Linked target provider is not available for this list.", 400);
  }
  const targets = await listLinkTargetsByType(session, targetType, provider);

  return {
    providers: activeProviders.map((entry) => ({
      id: entry.id,
      label: entry.label,
      moduleId: entry.moduleId,
      providerId: entry.provider,
      targetType: entry.targetType,
    })),
    targets: targets
      .filter((target) => !search || [target.displayLabel, target.secondaryLabel, target.title]
        .some((value) => String(value || "").toLowerCase().includes(search)))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey) || left.targetId.localeCompare(right.targetId))
      .slice(0, limit),
  };
}

/** @param {unknown} rawPayload */
/** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function createLink(listId, rawPayload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanAccessList(session, listRecord, "manage_links");
  const payload = parseListsEdgePayload(CreateListLinkSchema, rawPayload);
  const link = normalizeLinkPayload(payload, listRecord, session);
  await assertLinkTargetProviderAvailable(session, link);
  const target = await readLinkedTargetSummary(session, link, { requireAccess: true });
  const createdLink = await listsRepository.createLink(session.workspace_id, link);
  if (!createdLink) {
    throw new AppError("List link creation did not return a record.", 500);
  }
  await recordLinkAudit(session, "list_link_created", "create", null, createdLink, listRecord);
  await emitListEvent("lists.link.created", session, null, listRecord, {
    link: sanitizeLinkForAudit(createdLink),
  });
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.linked");

  return { link: shapeLinkForBrowser(createdLink, target) };
}

/** @param {string} listId @param {string} linkId @param {WorkspaceRequestSession} session */
async function removeLink(listId, linkId, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanAccessList(session, listRecord, "manage_links");
  const previousLink = await listsRepository.readLinkById(session.workspace_id, listRecord.list_id, normalizeRequiredText(linkId, "List link ID"));

  if (!previousLink || previousLink.removed_at) {
    throw new AppError("List link not found.", 404);
  }

  const link = await listsRepository.removeLink(session.workspace_id, listRecord.list_id, previousLink.list_link_id);
  if (!link) {
    throw new AppError("List link removal did not return a record.", 500);
  }
  await recordLinkAudit(session, "list_link_removed", "delete", previousLink, link, listRecord);
  await emitListEvent("lists.link.removed", session, listRecord, listRecord, {
    link: sanitizeLinkForAudit(link),
  });
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.unlinked");

  return { link: shapeLinkForBrowser(link, null) };
}

/** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function createCatalogItem(rawPayload, session) {
  return catalogItemsService.createCatalogItem(rawPayload, session);
}

/** @param {unknown} catalogItemId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function updateCatalogItem(catalogItemId, rawPayload, session) {
  return catalogItemsService.updateCatalogItem(catalogItemId, rawPayload, session);
}

/** @param {WorkspaceRequestSession} session @param {ListsRawQuery} [query] */
async function suggestItems(session, query = {}) {
  return catalogItemsService.suggestItems(session, query);
}

/** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function createItem(listId, rawPayload, session) {
  return listItemsService.createItem(listId, rawPayload, session);
}

/** @param {string} listId @param {string} itemId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function updateItem(listId, itemId, rawPayload, session) {
  return listItemsService.updateItem(listId, itemId, rawPayload, session);
}

/** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function reorderItems(listId, rawPayload, session) {
  return listItemsService.reorderItems(listId, rawPayload, session);
}

/** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
async function checkItem(listId, itemId, session) {
  return listItemsService.checkItem(listId, itemId, session);
}

/** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
async function uncheckItem(listId, itemId, session) {
  return listItemsService.uncheckItem(listId, itemId, session);
}

/** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
async function completeItem(listId, itemId, session) {
  return listItemsService.completeItem(listId, itemId, session);
}

/** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
async function deleteItem(listId, itemId, session) {
  return listItemsService.deleteItem(listId, itemId, session);
}

/** @param {string} listId @param {WorkspaceRequestSession} session @param {ListsTransition} transition */
async function transitionList(listId, session, transition) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const previousList = await readListOrThrow(session, listId, transition.options || {});
  await assertCanAccessList(session, previousList, transition.operation);
  if (transition.operation === "finalize" && previousList.status === LIST_STATUSES.FINALIZED) {
    throw new AppError("List is already finalized.", 400);
  }
  const now = new Date().toISOString();
  const listRecord = await listsRepository.update(session.workspace_id, {
    ...previousList,
    ...transition.patch(previousList, now),
    updated_by_user_id: session.user_id,
  });
  if (!listRecord) throw new AppError("List transition did not return a record.", 500);

  await recordListAudit(session, transition.action, transition.changeType, previousList, listRecord);
  await emitListEvent(transition.eventName, session, previousList, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, transition.eventName);
  return { list: await shapeListForBrowser(session, listRecord) };
}

/** @param {ListsServiceSession} session @param {unknown} listId @param {ListsReadOptions} [options] @returns {Promise<ListsRecord>} */
async function readListOrThrow(session, listId, options = {}) {
  await assertListsReadable(session);
  const normalizedId = normalizeRequiredText(listId, "List ID");
  const listRecord = await listsRepository.readById(session.workspace_id, normalizedId);

  if (!listRecord || (!options.includeDeleted && listRecord.status === LIST_STATUSES.DELETED)) {
    throw new AppError("List not found.", 404);
  }

  return listRecord;
}

/** @param {ListsServiceSession} session */
async function assertListsReadable(session) {
  if (await modulesService.canReadModule(session?.workspace_id, LIST_MODULE_ID)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord */
async function canReadList(session, listRecord) {
  if (await permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(listRecord))) {
    return true;
  }

  return permissionsService.can(session, LIST_PERMISSIONS.VIEW, listResource(listRecord));
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord @param {string} operation */
async function assertCanAccessList(session, listRecord, operation) {
  const moduleEnabled = await modulesService.canWriteModule(session.workspace_id, LIST_MODULE_ID);
  const permissions = await readRelevantPermissions(session, listRecord);
  const access = canAccessList({
    historicalReadAccess: true,
    list: listRecord,
    listsModuleEnabled: moduleEnabled,
    operation,
    permissions,
    session,
  });

  if (!access.allowed) {
    throw new AppError(access.reason === "missing_permission" ? "You do not have permission to perform that action." : `List access denied: ${access.reason}.`, access.reason === "missing_permission" ? 403 : 400);
  }

  const permission = operation === "read"
    ? LIST_PERMISSIONS.VIEW
    : {
        create: LIST_PERMISSIONS.CREATE,
        update: LIST_PERMISSIONS.UPDATE,
        complete: LIST_PERMISSIONS.COMPLETE,
        duplicate: LIST_PERMISSIONS.DUPLICATE,
        finalize: LIST_PERMISSIONS.FINALIZE,
        archive: LIST_PERMISSIONS.ARCHIVE,
        restore: LIST_PERMISSIONS.RESTORE,
        delete: LIST_PERMISSIONS.DELETE,
        manage_items: LIST_PERMISSIONS.MANAGE_ITEMS,
        manage_links: LIST_PERMISSIONS.MANAGE_LINKS,
        manage_reusable: LIST_PERMISSIONS.MANAGE_REUSABLE,
      }[operation] || LIST_PERMISSIONS.VIEW;

  if (operation === "read" && await permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(listRecord))) {
    return;
  }

  await permissionsService.assertCan(session, permission, {
    ...listResource(listRecord),
    operation,
  });
}

/** @param {WorkspaceRequestSession} session @param {ListsRecord} listRecord @param {ListsItemRecord | null} item */
async function assertCanManageItem(session, listRecord, item) {
  const moduleEnabled = await modulesService.canWriteModule(session.workspace_id, LIST_MODULE_ID);
  const permissions = await readRelevantPermissions(session, listRecord);
  const access = canManageListItem({
    historicalReadAccess: true,
    item: item || {},
    list: listRecord,
    listsModuleEnabled: moduleEnabled,
    operation: "manage_items",
    permissions,
    session,
  });

  if (!access.allowed) {
    throw new AppError(`List item access denied: ${access.reason}.`, access.reason === "missing_permission" ? 403 : 400);
  }

  await permissionsService.assertCan(session, LIST_PERMISSIONS.MANAGE_ITEMS, itemResource(listRecord, item || {}));
}

/** @param {WorkspaceRequestSession} session */
async function assertCanManageCatalog(session) {
  await permissionsService.assertCan(session, LIST_PERMISSIONS.MANAGE_CATALOG, {
    operation: "manage_catalog",
    workspace_id: session.workspace_id,
  });
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord @returns {Promise<string[]>} */
async function readRelevantPermissions(session, listRecord) {
  const checks = await Promise.all(Object.values(LIST_PERMISSIONS).map(async (permission) => /** @type {[string, boolean]} */ ([
    permission,
    await permissionsService.can(session, permission, listResource(listRecord)),
  ])));

  return checks.filter(([, allowed]) => allowed).map(([permission]) => permission);
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord */
async function readPermissionSafeLinks(session, listRecord) {
  const linksByListId = await readPermissionSafeLinksForLists(session, [listRecord]);
  return linksByListId.get(listRecord.list_id) || [];
}

/** @param {ListsServiceSession} session @param {ListsRecord[]} [listRecords] */
async function readPermissionSafeLinksForLists(session, listRecords = []) {
  const batch = createVisibleRecordBatch(listRecords, { idField: "list_id" });
  const linksByListId = mapVisibleRecordBatch(batch, () => /** @type {ListsBrowserLink[]} */ ([]));

  if (batch.isEmpty) {
    return linksByListId;
  }

  const links = await listsRepository.listLinksForLists(session.workspace_id, batch.ids);
  const targetSummaries = await readLinkedTargetSummariesForLinks(session, links);

  for (const link of links) {
    const target = normalizeTarget(link);
    const key = linkedTargetKey(target);
    const listId = String(link.list_id || "").trim();
    const shaped = shapeLinkForBrowser(link, targetSummaries.get(key) || null);

    if (!linksByListId.has(listId)) {
      linksByListId.set(listId, []);
    }

    linksByListId.get(listId)?.push(shaped);
  }

  return linksByListId;
}

/** @param {ListsServiceSession} session @param {ListsLinkRecord | ListsLinkPersistenceInput} link @param {{requireAccess?: boolean}} [options] */
async function readLinkedTargetSummary(session, link, options = {}) {
  const target = normalizeTarget(link);
  const summary = await readLinkedTargetRecord(session, target);

  if (!summary && options.requireAccess) {
    throw new AppError("You do not have access to the linked list target.", 403);
  }

  return summary;
}

/** @param {ListsServiceSession} session @param {ListsLinkTargetIdentity} target */
async function readLinkedTargetRecord(session, target) {
  const summaries = await readLinkedTargetRecordsByType(session, target.target_type, [target.target_id]);
  return summaries.get(target.target_id) || null;
}

/** @param {ListsServiceSession} session @param {ListsLinkRecord[]} [links] */
async function readLinkedTargetSummariesForLinks(session, links = []) {
  /** @type {Map<string, Set<string>>} */
  const targetIdsByType = new Map();

  for (const link of links) {
    const target = normalizeTarget(link);
    if (!target.target_type || !target.target_id) {
      continue;
    }

    const ids = targetIdsByType.get(target.target_type) || new Set();
    ids.add(target.target_id);
    targetIdsByType.set(target.target_type, ids);
  }

  /** @type {Array<Array<[string, LinkedTargetRecord]>>} */
  const summaryEntries = await Promise.all([...targetIdsByType.entries()].map(async ([targetType, ids]) => {
    const summaries = await readLinkedTargetRecordsByType(session, targetType, [...ids]);
    return [...summaries.entries()].map(([targetId, summary]) => [linkedTargetKey({ target_type: targetType, target_id: targetId }), summary]);
  }));

  return new Map(summaryEntries.flat());
}

/** @param {ListsServiceSession} session @param {string} targetType @param {string[]} [targetIds] */
async function readLinkedTargetRecordsByType(session, targetType, targetIds = []) {
  const ids = [...new Set((Array.isArray(targetIds) ? targetIds : [])
    .map((targetId) => String(targetId || "").trim())
    .filter(Boolean))];
  /** @type {Map<string, LinkedTargetRecord>} */
  const summaries = new Map();

  if (ids.length === 0) {
    return summaries;
  }

  if (targetType === "client") {
    const clients = await clientsRepository.readByIds(session.workspace_id, ids);
    for (const client of clients) {
      if (!client || !(await permissionsService.can(session, "clients.manage", {
        client_id: client.id,
        operation: "read",
        workspace_id: session.workspace_id,
      }))) {
        continue;
      }

      summaries.set(client.id, {
        label: client.name,
        module_id: "client-projects",
        target_id: client.id,
        target_type: "client",
        url: `clients.html?client=${encodeURIComponent(client.id)}`,
      });
    }

    return summaries;
  }

  if (targetType === "project") {
    const projects = await projectsRepository.readByIds(session.workspace_id, ids);
    for (const project of projects) {
      if (!project || !(await permissionsService.can(session, "projects.manage", {
        client_id: project.client_id,
        operation: "read",
        project_id: project.id,
        workspace_id: session.workspace_id,
      }))) {
        continue;
      }

      summaries.set(project.id, {
        label: project.name,
        module_id: "client-projects",
        target_id: project.id,
        target_type: "project",
        url: `projects.html?project=${encodeURIComponent(project.id)}`,
      });
    }

    return summaries;
  }

  if (targetType === "task") {
    const tasks = await tasksRepository.readByIds(session.workspace_id, ids);
    for (const task of tasks) {
      if (!task) {
        continue;
      }
      const taskResource = {
        client_id: task.client_id,
        operation: "read",
        project_id: task.project_id,
        task_id: task.task_id,
        workspace_id: session.workspace_id,
      };
      if (!(await permissionsService.can(session, "tasks.view", taskResource))) {
        continue;
      }

      summaries.set(task.task_id, {
        label: task.title,
        module_id: "tasks",
        target_id: task.task_id,
        target_type: "task",
        url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
      });
    }

    return summaries;
  }

  if (targetType === "note") {
    const notes = await notesService.listConsumerSummaries(session, {
      consumerId: "notes.provider-catalogs",
      noteIds: ids,
    });
    for (const note of notes) {
      if (!note || note.status === "deleted" || note.deleted_at) {
        continue;
      }

      summaries.set(note.note_id, {
        label: note.title,
        module_id: "notes",
        target_id: note.note_id,
        target_type: "note",
        url: `notes.html?note=${encodeURIComponent(note.note_id)}`,
      });
    }

    return summaries;
  }

  return summaries;
}

/** @param {ListsServiceSession} session @param {string} targetType @param {LinkedContextProviderContribution} provider */
async function listLinkTargetsByType(session, targetType, provider) {
  if (targetType === "client") {
    const clients = await permissionsService.filterReadableClients(
      session,
      await clientsRepository.readAll(session.workspace_id),
    );
    return clients.map((client) => shapeListLinkTarget({
      moduleId: "client-projects",
      targetType,
      targetId: client.id,
      displayLabel: client.name || "Unavailable client",
      secondaryLabel: "",
      sortKey: `client:${sortableTargetText(client.name)}:${client.id}`,
      sourceUrl: `clients.html?client=${encodeURIComponent(client.id)}`,
      clientId: client.id,
      projectId: "",
      workspaceId: session.workspace_id,
      title: client.name || "Unavailable client",
    }, provider));
  }

  const [clients, projects] = await Promise.all([
    clientsRepository.readAll(session.workspace_id),
    projectsRepository.readAll(session.workspace_id),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const workspaceType = String((await settingsRepository.readWorkspaceSettings(session.workspace_id)).workspaceType || "business").toLowerCase();
  const isBusiness = workspaceType === "business";

  if (targetType === "project") {
    const readableProjects = await permissionsService.filterReadableProjects(session, projects);
    return readableProjects.map((project) => {
      const clientName = clientsById.get(project.client_id)?.name || project.client_name || "";
      const contextLabel = isBusiness ? clientName || "Workspace" : "";
      const displayLabel = contextLabel ? `${project.name} - ${contextLabel}` : project.name;
      return shapeListLinkTarget({
        moduleId: "client-projects",
        targetType,
        targetId: project.id,
        displayLabel: displayLabel || "Unavailable project",
        secondaryLabel: "",
        sortKey: `project:${sortableTargetText(contextLabel)}:${sortableTargetText(project.name)}:${project.id}`,
        sourceUrl: `projects.html?project=${encodeURIComponent(project.id)}`,
        clientId: project.client_id || "",
        projectId: project.id,
        workspaceId: session.workspace_id,
        title: project.name || "Unavailable project",
      }, provider);
    });
  }

  if (targetType === "task") {
    const tasks = await tasksRepository.readAll(session.workspace_id);
    const readableTasks = [];
    for (const task of tasks) {
      const taskResource = {
        client_id: task.client_id,
        operation: "read",
        project_id: task.project_id,
        task_id: task.task_id,
        workspace_id: session.workspace_id,
      };
      if (await permissionsService.can(session, "tasks.view", taskResource)) {
        readableTasks.push(task);
      }
    }
    return readableTasks.map((task) => shapeContextualListLinkTarget({
      record: task,
      recordId: task.task_id,
      title: task.title,
      targetType,
      moduleId: "tasks",
      sourceUrl: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
      statusRank: task.archived_at || task.status === "archived" ? "2" : task.status === "complete" ? "1" : "0",
      clientsById,
      projectsById,
      isBusiness,
      provider,
      workspaceId: session.workspace_id,
    }));
  }

  const readableNotes = (await notesService.listConsumerSummaries(session, {
    consumerId: "notes.provider-catalogs",
  })).filter((note) => note.status !== "deleted" && !note.deleted_at);
  return readableNotes.map((note) => shapeContextualListLinkTarget({
    record: note,
    recordId: note.note_id,
    title: note.title,
    targetType,
    moduleId: "notes",
    sourceUrl: `notes.html?note=${encodeURIComponent(note.note_id)}`,
    statusRank: note.status === "archived" ? "1" : "0",
    clientsById,
    projectsById,
    isBusiness,
    provider,
    workspaceId: session.workspace_id,
  }));
}

/** @param {ContextualListLinkTargetOptions} options */
function shapeContextualListLinkTarget(options) {
  const record = options.record || {};
  const project = options.projectsById.get(record.project_id || "") || {};
  const clientId = record.client_id || project.client_id || "";
  const clientName = options.clientsById.get(clientId)?.name || project.client_name || "";
  const projectName = project.name || record.project_name || "";
  const contextParts = options.isBusiness
    ? [clientName || (projectName ? "Workspace" : ""), projectName].filter(Boolean)
    : [projectName].filter(Boolean);
  const secondaryLabel = contextParts.join(" | ");
  const safeTitle = normalizeOptionalText(options.title) || `Unavailable ${options.targetType}`;
  const compactTitle = compactLinkedTargetTitle(safeTitle);

  return shapeListLinkTarget({
    moduleId: options.moduleId,
    targetType: options.targetType,
    targetId: options.recordId,
    displayLabel: secondaryLabel ? `${compactTitle} - ${secondaryLabel}` : compactTitle,
    secondaryLabel,
    sortKey: `${options.statusRank}:${sortableTargetText(secondaryLabel)}:${sortableTargetText(safeTitle)}:${options.recordId}`,
    sourceUrl: options.sourceUrl,
    clientId,
    projectId: record.project_id || "",
    workspaceId: options.workspaceId,
    title: safeTitle,
  }, options.provider);
}

/** @param {LinkedTargetShapeInput} target @param {LinkedContextProviderContribution} provider @returns {LinkedTargetSummary} */
function shapeListLinkTarget(target, provider) {
  const normalized = assertLinkedContextTargetContract({
    ...target,
    isAvailable: true,
  }, provider);
  const title = normalizeOptionalText(target.title) || normalized.displayLabel;
  return {
    ...normalized,
    ariaLabel: title,
    fullLabel: title,
    title,
  };
}

/** @param {unknown} value */
function compactLinkedTargetTitle(value) {
  const title = normalizeOptionalText(value);
  return title.length > 20 ? `${title.slice(0, 20).trimEnd()}...` : title;
}

/** @param {unknown} value */
function sortableTargetText(value) {
  return normalizeOptionalText(value).toLowerCase();
}

/** @param {Partial<ListsLinkTargetIdentity>} [target] */
function linkedTargetKey(target = {}) {
  return `${target.target_type || ""}:${target.target_id || ""}`;
}

/** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session @param {Record<string, unknown>} [fallback] @returns {Promise<ListsRecord>} */
async function normalizeListPayload(payload = {}, session, fallback = {}) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const workspaceType = settings.workspaceType || "business";
  const title = normalizeRequiredText(valueOrFallback(payload, "title", fallback.title), "List title");
  const listType = normalizeEnum(valueOrFallback(payload, "list_type", fallback.list_type) || defaultListTypeForWorkspaceType(workspaceType), LIST_TYPE_SET, "List type");
  const status = normalizeEnum(valueOrFallback(payload, "status", fallback.status) || LIST_STATUSES.ACTIVE, LIST_STATUS_SET, "List status");
  const projectId = normalizeOptionalText(valueOrFallback(payload, "project_id", fallback.project_id));
  const explicitClientId = normalizeOptionalText(valueOrFallback(payload, "client_id", fallback.client_id));
  const project = projectId ? await projectsRepository.readById(session.workspace_id, projectId) : null;

  if (projectId && !project) {
    throw new AppError("Project not found.", 404);
  }

  const context = validateListContext({
    clientId: explicitClientId,
    project: project ? { workspace_id: project.workspace_id, client_id: project.client_id || "" } : null,
    workspaceId: session.workspace_id,
    workspaceType,
  });

  if (!context.ok) {
    throw new AppError(context.message || "List context is invalid.", 400);
  }

  if (explicitClientId && !project) {
    const client = await clientsRepository.readById(session.workspace_id, explicitClientId);

    if (!client) {
      throw new AppError("Client not found.", 404);
    }
  }

  const now = new Date().toISOString();

  return {
    list_id: normalizeOptionalText(fallback.list_id || payload.list_id || payload.id),
    workspace_id: session.workspace_id,
    client_id: context.clientId ?? null,
    project_id: projectId || "",
    title,
    description: normalizeOptionalText(valueOrFallback(payload, "description", fallback.description)),
    list_type: listType,
    status,
    is_reusable: Boolean(valueOrFallback(payload, "is_reusable", fallback.is_reusable)),
    source_list_id: normalizeOptionalText(valueOrFallback(payload, "source_list_id", fallback.source_list_id)),
    duplicated_from_list_id: normalizeOptionalText(valueOrFallback(payload, "duplicated_from_list_id", fallback.duplicated_from_list_id)),
    created_by_user_id: normalizeOptionalText(fallback.created_by_user_id) || session.user_id,
    updated_by_user_id: session.user_id,
    finalized_by_user_id: normalizeOptionalText(valueOrFallback(payload, "finalized_by_user_id", fallback.finalized_by_user_id)),
    created_at: normalizeOptionalText(fallback.created_at) || now,
    updated_at: now,
    completed_at: normalizeOptionalText(valueOrFallback(payload, "completed_at", fallback.completed_at)),
    finalized_at: normalizeOptionalText(valueOrFallback(payload, "finalized_at", fallback.finalized_at)),
    archived_at: normalizeOptionalText(valueOrFallback(payload, "archived_at", fallback.archived_at)),
    deleted_at: normalizeOptionalText(valueOrFallback(payload, "deleted_at", fallback.deleted_at)),
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
  };
}

/** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session @param {ListsRecord} listRecord @param {Record<string, unknown>} [fallback] @returns {ListsItemPersistenceInput} */
function normalizeItemPayload(payload = {}, session, listRecord, fallback = {}) {
  const context = validateListItemContext({
    itemWorkspaceId: session.workspace_id,
    list: listRecord,
  });

  if (!context.ok) {
    throw new AppError(context.message || "List item context is invalid.", 400);
  }

  const itemName = normalizeRequiredText(valueOrFallback(payload, "item_name", fallback.item_name) || payload.itemName || payload.name, "Item name");
  const purchaseStatus = normalizeEnum(valueOrFallback(payload, "purchase_status", fallback.purchase_status) || LIST_ITEM_PURCHASE_STATUSES.NEEDED, PURCHASE_STATUS_SET, "Purchase status");

  return {
    list_item_id: normalizeOptionalText(fallback.list_item_id || payload.list_item_id || payload.id),
    workspace_id: listRecord.workspace_id,
    list_id: listRecord.list_id,
    catalog_item_id: normalizeOptionalText(valueOrFallback(payload, "catalog_item_id", fallback.catalog_item_id)),
    item_name: itemName,
    quantity: normalizeNonNegativeNumber(valueOrFallback(payload, "quantity", fallback.quantity) ?? 1, "Quantity"),
    unit: normalizeOptionalText(valueOrFallback(payload, "unit", fallback.unit)),
    needed_by_date: normalizeOptionalDate(valueOrFallback(payload, "needed_by_date", fallback.needed_by_date), "Needed by date"),
    vendor_name: normalizeOptionalText(valueOrFallback(payload, "vendor_name", fallback.vendor_name)),
    url: normalizeOptionalText(valueOrFallback(payload, "url", fallback.url)),
    estimated_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "estimated_cost", fallback.estimated_cost), "Estimated cost"),
    actual_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "actual_cost", fallback.actual_cost), "Actual cost"),
    purchase_status: purchaseStatus,
    tracking_id: normalizeOptionalText(valueOrFallback(payload, "tracking_id", fallback.tracking_id)),
    notes: normalizeOptionalText(valueOrFallback(payload, "notes", fallback.notes)),
    assigned_user_id: normalizeOptionalText(valueOrFallback(payload, "assigned_user_id", fallback.assigned_user_id)),
    created_by_user_id: normalizeOptionalText(fallback.created_by_user_id) || session.user_id,
    updated_by_user_id: session.user_id,
    checked_at: normalizeOptionalText(valueOrFallback(payload, "checked_at", fallback.checked_at)),
    checked_by_user_id: normalizeOptionalText(valueOrFallback(payload, "checked_by_user_id", fallback.checked_by_user_id)),
    completed_at: normalizeOptionalText(valueOrFallback(payload, "completed_at", fallback.completed_at)),
    completed_by_user_id: normalizeOptionalText(valueOrFallback(payload, "completed_by_user_id", fallback.completed_by_user_id)),
    sort_order: normalizeInteger(valueOrFallback(payload, "sort_order", fallback.sort_order) || 0, "Sort order"),
    deleted_at: normalizeOptionalText(valueOrFallback(payload, "deleted_at", fallback.deleted_at)),
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
  };
}

/** @param {ListsItemRecord} item @param {ListsRecord} listRecord @param {WorkspaceRequestSession} session @param {number} index @returns {ListsItemPersistenceInput} */
function duplicateItemPayload(item, listRecord, session, index) {
  return {
    assigned_user_id: item.assigned_user_id || "",
    actual_cost: null,
    catalog_item_id: item.catalog_item_id || "",
    checked_at: null,
    checked_by_user_id: null,
    completed_at: null,
    completed_by_user_id: null,
    created_by_user_id: session.user_id,
    deleted_at: null,
    estimated_cost: item.estimated_cost,
    item_name: item.item_name,
    list_id: listRecord.list_id,
    metadata_json: {
      ...(item.metadata_json || {}),
      duplicated_from_list_item_id: item.list_item_id,
      source_list_id: listRecord.source_list_id || listRecord.duplicated_from_list_id || "",
    },
    needed_by_date: item.needed_by_date || "",
    notes: item.notes || "",
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
    quantity: item.quantity ?? 1,
    sort_order: index * 10,
    tracking_id: "",
    unit: item.unit || "",
    updated_by_user_id: session.user_id,
    url: item.url || "",
    vendor_name: item.vendor_name || "",
    workspace_id: listRecord.workspace_id,
  };
}

/** @param {string} workspaceId @param {string} listId @returns {Promise<number>} */
async function nextSortOrder(workspaceId, listId) {
  const items = await listsRepository.listItems(workspaceId, listId);
  return items.length === 0 ? 0 : Math.max(...items.map((item) => Number(item.sort_order) || 0)) + 10;
}

/** @param {ListsServiceSession} session @param {ListsRawQuery} [query] @returns {Promise<ListsNormalizedQuery>} */
async function normalizeListQuery(session, query = {}) {
  const status = normalizeListStatusFilter(query.status || query.status_filter);
  const archiveState = normalizeToken(query.archiveState || query.archive_state || query.archive || query.archivedState || query.archived_state);
  const effectiveStatus = archiveState === "archived" || archiveState === "deleted"
    ? archiveState
    : status;
  const reusable = normalizeReusableFilter(query.reusable || query.reusableFilter || query.reusable_filter || query.isReusable || query.is_reusable);
  const listType = normalizeListTypeFilter(query.listType || query.list_type || query.type);
  const clientId = hasQueryField(query, ["clientId", "client_id", "client"])
    ? normalizeOptionalText(query.clientId ?? query.client_id ?? query.client)
    : "all";
  const projectId = hasQueryField(query, ["projectId", "project_id", "project"])
    ? normalizeOptionalText(query.projectId ?? query.project_id ?? query.project)
    : "all";
  const assigneeId = hasQueryField(query, ["assigneeId", "assignee_id", "assignee"])
    ? normalizeOptionalText(query.assigneeId ?? query.assignee_id ?? query.assignee)
    : "all";
  const neededByDate = normalizeOptionalDate(query.neededByDate || query.needed_by_date || query.needed || "", "Needed by date");
  const sort = normalizeListSort(query.sort || query.sortBy || query.sort_by);
  const targetType = normalizeOptionalText(query.targetType || query.target_type || query.linkedTargetType || query.linked_target_type);
  const targetId = normalizeOptionalText(query.targetId || query.target_id || query.linkedTargetId || query.linked_target_id);
  const moduleId = normalizeOptionalText(query.moduleId || query.module_id || query.linkedModuleId || query.linked_module_id);
  const tagIds = query.tagIds || query.tag_ids || query.tags || query.tag || query.tag_id || [];
  const includeDeleted = effectiveStatus === "deleted" || effectiveStatus === "all" ||
    archiveState === "all" ||
    query.includeDeleted === true ||
    query.include_deleted === "true";
  const scope = await resolveClientProjectFilterScope(session, {
    clientId: clientId === "all" ? "" : clientId,
    hasClientFilter: hasQueryField(query, ["clientId", "client_id", "client"]),
    hasProjectFilter: hasQueryField(query, ["projectId", "project_id", "project"]),
    projectId: projectId === "all" ? "" : projectId,
  });

  return {
    archiveState,
    assigneeId,
    clientFilterMode: scope.clientFilterMode,
    clientId,
    clientIds: scope.clientIds,
    clientProjectIds: scope.clientProjectIds,
    hasClientFilter: scope.hasClientFilter,
    hasProjectFilter: scope.hasProjectFilter,
    listType,
    neededByDate,
    omitClientFilterBecauseProjectSelected: scope.omitClientFilterBecauseProjectSelected,
    projectFilterMode: scope.projectFilterMode,
    projectId,
    projectIds: scope.projectIds,
    repositoryFilters: {
      clientFilterMode: scope.clientFilterMode,
      clientId: scope.clientId,
      clientIds: scope.clientIds,
      clientProjectIds: scope.clientProjectIds,
      createdByUserId: normalizeOptionalText(query.createdByUserId || query.created_by_user_id),
      hasClientFilter: scope.hasClientFilter,
      hasProjectFilter: scope.hasProjectFilter,
      includeDeleted,
      isReusable: reusable === "all" ? undefined : reusable === "yes",
      listType: listType === "all" ? "" : listType,
      omitClientFilterBecauseProjectSelected: scope.omitClientFilterBecauseProjectSelected,
      projectFilterMode: scope.projectFilterMode,
      projectId: scope.projectId,
      projectIds: scope.projectIds,
      status: effectiveStatus === "all" ? "" : effectiveStatus,
    },
    response: {
      archiveState: archiveState || "current",
      assigneeId,
      clientId,
      listType,
      neededByDate,
      reusable,
      sort,
      status: effectiveStatus,
      targetId,
      targetType,
    },
    reusable,
    sort,
    status: effectiveStatus,
    tagIds,
    targetId,
    targetType,
    moduleId,
  };
}

/** @param {unknown} value @returns {string} */
function normalizeListStatusFilter(value) {
  const status = normalizeToken(value || LIST_STATUSES.ACTIVE);
  if (!status || status === "current") {
    return LIST_STATUSES.ACTIVE;
  }
  if (status === "all") {
    return "all";
  }
  if (!LIST_STATUS_SET.has(status)) {
    throw new AppError(`List status '${status}' is not supported.`, 400);
  }
  return status;
}

/** @param {unknown} value @returns {string} */
function normalizeListTypeFilter(value) {
  const listType = normalizeToken(value || "all");
  if (!listType || listType === "all") {
    return "all";
  }
  if (!LIST_TYPE_SET.has(listType)) {
    throw new AppError(`List type '${listType}' is not supported.`, 400);
  }
  return listType;
}

/** @param {unknown} value @returns {string} */
function normalizeReusableFilter(value) {
  if (value === true || value === "true" || value === "yes" || value === "reusable") {
    return "yes";
  }
  if (value === false || value === "false" || value === "no" || value === undefined || value === null || value === "") {
    return "no";
  }
  if (value === "all") {
    return "all";
  }
  throw new AppError(`Reusable filter '${value}' is not supported.`, 400);
}

/** @param {unknown} value @returns {string} */
function normalizeListSort(value) {
  const sort = normalizeToken(value || "updated_desc");
  const supportedSorts = new Set([
    "finalized_desc",
    "incomplete_desc",
    "needed_asc",
    "progress_desc",
    "source_asc",
    "status_asc",
    "title_asc",
    "type_asc",
    "updated_desc",
  ]);
  if (!supportedSorts.has(sort)) {
    throw new AppError(`List sort '${sort}' is not supported.`, 400);
  }
  return sort;
}

/** @param {unknown} value @returns {string} */
function normalizeToken(value) {
  return normalizeOptionalText(value).toLowerCase();
}

/** @param {Record<string, unknown>} [query] @param {string[]} [keys] */
function hasQueryField(query = {}, keys = []) {
  return keys.some((key) => Object.hasOwn(query, key));
}

/** @param {ListsBrowserRecord} listRecord @param {ListsNormalizedQuery} query @param {ListsServiceSession} session */
function listMatchesCanonicalQuery(listRecord, query, session) {
  if (query.archiveState === "current" && ["archived", "deleted"].includes(listRecord.status)) {
    return false;
  }
  if (query.status !== "all" && listRecord.status !== query.status) {
    return false;
  }
  if (query.reusable !== "all" && Boolean(listRecord.is_reusable) !== (query.reusable === "yes")) {
    return false;
  }
  if (query.listType !== "all" && listRecord.list_type !== query.listType) {
    return false;
  }
  if (!matchesListContextFilters(listRecord, query)) {
    return false;
  }
  if (query.assigneeId !== "all" && !matchesAssigneeFilter(listRecord, query.assigneeId, session.user_id)) {
    return false;
  }
  if (query.neededByDate && !(listRecord.progress?.neededByDates || []).includes(query.neededByDate)) {
    return false;
  }
  if ((query.targetType || query.targetId || query.moduleId) && !matchesLinkedRecordFilter(listRecord, query)) {
    return false;
  }
  return true;
}

/** @param {ListsBrowserRecord} listRecord @param {ListsNormalizedQuery} query */
function matchesListContextFilters(listRecord, query) {
  if (query.hasProjectFilter) {
    if (query.projectFilterMode === "blank") {
      if (String(listRecord.project_id || "").trim()) {
        return false;
      }
    } else if (query.projectFilterMode === "ids") {
      const scopedProjectIds = Array.isArray(query.projectIds) && query.projectIds.length > 0
        ? query.projectIds
        : [String(query.projectId === "all" ? "" : query.projectId || "").trim()].filter(Boolean);

      if (!scopedProjectIds.includes(String(listRecord.project_id || "").trim())) {
        return false;
      }
    }
  }

  if (!query.hasClientFilter || query.omitClientFilterBecauseProjectSelected) {
    return true;
  }

  if (query.clientFilterMode === "blank") {
    return !String(listRecord.client_id || "").trim();
  }

  if (query.clientFilterMode !== "ids") {
    return true;
  }

  const scopedClientIds = Array.isArray(query.clientIds) && query.clientIds.length > 0
    ? query.clientIds
    : [String(query.clientId === "all" ? "" : query.clientId || "").trim()].filter(Boolean);
  const scopedProjectIds = Array.isArray(query.clientProjectIds) ? query.clientProjectIds : [];

  return scopedClientIds.includes(String(listRecord.client_id || "").trim()) ||
    scopedProjectIds.includes(String(listRecord.project_id || "").trim());
}

/** @param {ListsBrowserRecord} listRecord @param {string} [assigneeId] @param {string} [currentUserId] */
function matchesAssigneeFilter(listRecord, assigneeId = "all", currentUserId = "") {
  if (assigneeId === "all") {
    return true;
  }
  const assignedUserIds = new Set(listRecord.progress?.assignedUserIds || []);
  if (assigneeId === "me") {
    return currentUserId ? assignedUserIds.has(currentUserId) : false;
  }
  if (assigneeId === "") {
    return (listRecord.progress?.unassignedItemCount || 0) > 0;
  }
  return assignedUserIds.has(assigneeId);
}

/** @param {ListsBrowserRecord} listRecord @param {ListsNormalizedQuery} query */
function matchesLinkedRecordFilter(listRecord, query) {
  return (listRecord.links || []).some((link) => {
    const target = link.target;
    if (!target) {
      return false;
    }
    if (query.targetType && target.target_type !== query.targetType) {
      return false;
    }
    if (query.targetId && target.target_id !== query.targetId) {
      return false;
    }
    if (query.moduleId && target.module_id !== query.moduleId) {
      return false;
    }
    return true;
  });
}

/** @param {ListsBrowserRecord[]} lists @param {ListsNormalizedQuery} query @returns {ListsBrowserRecord[]} */
function sortCanonicalLists(lists = [], query) {
  return [...lists].sort((left, right) => {
    const fallback = compareText(left.title, right.title) ||
      compareText(left.list_type, right.list_type) ||
      compareText(left.status, right.status) ||
      compareText(left.list_id, right.list_id);

    if (query.sort === "title_asc") {
      return fallback;
    }
    if (query.sort === "type_asc") {
      return compareText(left.list_type, right.list_type) || fallback;
    }
    if (query.sort === "status_asc") {
      return compareText(left.status, right.status) || fallback;
    }
    if (query.sort === "needed_asc") {
      return compareDateAsc(left.progress?.earliestNeededByDate, right.progress?.earliestNeededByDate) || fallback;
    }
    if (query.sort === "finalized_desc") {
      return compareDateDesc(left.finalized_at, right.finalized_at) || fallback;
    }
    if (query.sort === "progress_desc" || query.sort === "incomplete_desc") {
      return Number(right.progress?.incompleteItemCount || 0) - Number(left.progress?.incompleteItemCount || 0) || fallback;
    }
    if (query.sort === "source_asc") {
      return compareText(sourceSortLabel(left), sourceSortLabel(right)) || fallback;
    }
    return compareDateDesc(left.progress?.lastActivityAt || left.updated_at, right.progress?.lastActivityAt || right.updated_at) || fallback;
  });
}

/** @param {ListsBrowserRecord} listRecord */
function sourceSortLabel(listRecord) {
  return [
    listRecord.is_reusable ? "0-reusable" : "1-working",
    listRecord.sourceContext?.sourceList?.title || listRecord.sourceContext?.duplicatedFrom?.title || "",
    listRecord.title || "",
  ].join(" ");
}

/** @param {unknown} left @param {unknown} right */
function compareDateAsc(left, right) {
  return String(left || "9999-12-31T23:59:59.999Z").localeCompare(String(right || "9999-12-31T23:59:59.999Z"));
}

/** @param {unknown} left @param {unknown} right */
function compareDateDesc(left, right) {
  return String(right || "").localeCompare(String(left || ""));
}

/** @param {unknown} left @param {unknown} right */
function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

/** @param {unknown} value @returns {ListsItemOrder[]} */
function normalizeItemOrders(value) {
  if (!Array.isArray(value)) {
    throw new AppError("Item order payload must be an array.", 400);
  }

  return value.map((entry) => ({
    list_item_id: normalizeRequiredText(entry.list_item_id || entry.itemId || entry.item_id || entry.id, "List item ID"),
    sort_order: normalizeInteger(entry.sort_order ?? entry.sortOrder, "Sort order"),
  }));
}

/** @param {Record<string, unknown>} object @param {string} snakeKey @param {unknown} fallbackValue @returns {unknown} */
function valueOrFallback(object = {}, snakeKey, fallbackValue) {
  const camelKey = snakeKey.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

  if (Object.hasOwn(object, snakeKey)) {
    return object[snakeKey];
  }

  if (Object.hasOwn(object, camelKey)) {
    return object[camelKey];
  }

  return fallbackValue;
}

/** @param {unknown} value @param {string} label @returns {string} */
function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    throw new AppError(`${label} is required.`, 400);
  }

  return text;
}

/** @param {unknown} value @returns {string} */
function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/** @param {unknown} value @param {Set<string>} allowedValues @param {string} label @returns {string} */
function normalizeEnum(value, allowedValues, label) {
  const text = normalizeRequiredText(value, label);

  if (!allowedValues.has(text)) {
    throw new AppError(`${label} '${text}' is not supported.`, 400);
  }

  return text;
}

/** @param {unknown} value @param {string} label @returns {string} */
function normalizeOptionalDate(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(`${label} must use YYYY-MM-DD format.`, 400);
  }

  return text;
}

/** @param {unknown} value @param {string} label @returns {number} */
function normalizeNonNegativeNumber(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new AppError(`${label} must be a non-negative number.`, 400);
  }

  return number;
}

/** @param {unknown} value @param {string} label @returns {number | null} */
function normalizeOptionalNonNegativeNumber(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return normalizeNonNegativeNumber(value, label);
}

/** @param {unknown} value @param {string} label @returns {number} */
function normalizeInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new AppError(`${label} must be an integer.`, 400);
  }

  return number;
}

/** @param {Record<string, unknown>} payload @param {ListsRecord} listRecord @param {WorkspaceRequestSession} session @returns {ListsLinkPersistenceInput} */
function normalizeLinkPayload(payload = {}, listRecord, session) {
  const target = normalizeTarget(payload);

  return {
    created_by_user_id: session.user_id,
    link_role: normalizeOptionalText(payload.linkRole || payload.link_role) || "related",
    list_id: listRecord.list_id,
    list_link_id: normalizeOptionalText(payload.listLinkId || payload.list_link_id || payload.id),
    metadata_json: normalizeMetadata(payload.metadata_json || payload.metadata),
    module_id: target.module_id,
    target_id: target.target_id,
    target_type: target.target_type,
    workspace_id: session.workspace_id,
  };
}

/** @param {Record<string, unknown>} [payload] @returns {ListsLinkTargetIdentity} */
function normalizeTarget(payload = {}) {
  const targetType = normalizeRequiredText(payload.targetType || payload.target_type, "Target type");
  const targetId = normalizeRequiredText(payload.targetId || payload.target_id, "Target ID");
  const expectedModuleId = moduleIdForTargetType(targetType);
  const requestedModuleId = normalizeOptionalText(payload.moduleId || payload.module_id);
  const moduleId = requestedModuleId || expectedModuleId;

  if (!["client", "project", "task", "note"].includes(targetType)) {
    throw new AppError(`Linked target type '${targetType}' is not supported for Lists.`, 400);
  }

  if (!moduleId || (requestedModuleId && requestedModuleId !== expectedModuleId)) {
    throw new AppError(`Linked target type '${targetType}' is not supported for Lists.`, 400);
  }

  return {
    module_id: moduleId,
    target_id: targetId,
    target_type: targetType,
  };
}

/** @param {WorkspaceRequestSession} session @param {ListsLinkTargetIdentity} target */
async function assertLinkTargetProviderAvailable(session, target) {
  const providers = await modulesService.listActiveLinkedContextProviders(session.workspace_id, session);
  if (!providers.some((provider) => (
    provider.targetType === target.target_type &&
    provider.moduleId === target.module_id &&
    LIST_LINK_TARGET_TYPES.has(provider.targetType)
  ))) {
    throw new AppError("Linked target provider is not available for this list.", 400);
  }
}

/** @param {string} targetType @returns {string} */
function moduleIdForTargetType(targetType) {
  return {
    client: "client-projects",
    note: "notes",
    project: "client-projects",
    task: "tasks",
  }[targetType] || "";
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function normalizeMetadata(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord @returns {Promise<ListsBrowserRecord>} */
async function shapeListForBrowser(session, listRecord) {
  const shapedLists = await shapeListsForBrowser(session, [listRecord]);
  return shapedLists[0] || {
    ...listRecord,
    id: listRecord.list_id,
    isBillOfMaterials: listRecord.list_type === LIST_TYPES.BILL_OF_MATERIALS,
    isReusable: Boolean(listRecord.is_reusable),
    links: [],
    progress: listProgressSummaryFromItems(listRecord, []),
    resumeContext: buildListResumeContext(listRecord, listProgressSummaryFromItems(listRecord, []), []),
    sourceContext: { duplicatedFrom: null, sourceList: null },
  };
}

/** @param {ListsServiceSession} session @param {ListsRecord[]} [listRecords] @returns {Promise<ListsBrowserRecord[]>} */
async function shapeListsForBrowser(session, listRecords = []) {
  const batch = createVisibleRecordBatch(listRecords, { idField: "list_id" });
  const [progressByListId, linksByListId, sourceContextByListId] = await Promise.all([
    readListProgressSummaries(session, batch),
    readPermissionSafeLinksForLists(session, listRecords),
    readSourceContextsForLists(session, batch),
  ]);

  return listRecords.map((listRecord) => {
    const progress = progressByListId.get(listRecord.list_id) || listProgressSummaryFromItems(listRecord, []);
    const linkedRecords = linksByListId.get(listRecord.list_id) || [];
    return {
      ...listRecord,
      id: listRecord.list_id,
      isBillOfMaterials: listRecord.list_type === LIST_TYPES.BILL_OF_MATERIALS,
      isReusable: Boolean(listRecord.is_reusable),
      links: linkedRecords,
      progress,
      resumeContext: buildListResumeContext(listRecord, progress, linkedRecords),
      sourceContext: sourceContextByListId.get(listRecord.list_id) || { duplicatedFrom: null, sourceList: null },
    };
  });
}

/** @param {ListsServiceSession} session @param {ListsRecord} listRecord @returns {Promise<ListsItemProgressSummary>} */
async function readListProgressSummary(session, listRecord) {
  return listItemsService.readProgressSummary(session, /** @type {import("../../types/lists-item-contracts.js").ListsItemListRecord} */ (listRecord));
}

/** @param {ListsServiceSession} session @param {ListsVisibleBatch} batch @returns {Promise<Map<string, ListsItemProgressSummary>>} */
async function readListProgressSummaries(session, batch) {
  return listItemsService.readProgressSummaries(session, batch);
}

/** @param {ListsRecord} listRecord @param {ListsItemRecord[]} [items] @returns {ListsItemProgressSummary} */
function listProgressSummaryFromItems(listRecord, items = []) {
  return listItemsService.progressSummaryFromItems(
    /** @type {import("../../types/lists-item-contracts.js").ListsItemListRecord} */ (listRecord),
    /** @type {import("../../types/lists-item-contracts.js").ListsItemRecord[]} */ (items),
  );
}

/** @param {ListsRecord} listRecord @param {ListsItemProgressSummary} progress @param {ListsBrowserLink[]} [links] @returns {import("../../types/lists-domain-contracts.js").ListsResumeContext} */
function buildListResumeContext(listRecord, progress, links = []) {
  const sourceUrl = listRecord.list_id ? `lists.html?list=${encodeURIComponent(listRecord.list_id)}` : "lists.html";

  return {
    client_id: listRecord.client_id || "",
    linkedRecords: links.map((link) => ({
      id: link.list_link_id || link.id || "",
      isAvailable: Boolean(link.target),
      label: link.target?.label || "",
      linkRole: link.link_role || "",
      moduleId: link.module_id || link.target?.module_id || "",
      sourceUrl: link.target?.url || "",
      targetId: link.target_id || link.target?.target_id || "",
      targetType: link.target_type || link.target?.target_type || "",
    })),
    project_id: listRecord.project_id || "",
    progress: { ...progress },
    sourceUrl,
    status: listRecord.status || "",
    title: listRecord.title || "",
  };
}

/** @param {ListsServiceSession} session @param {ListsVisibleBatch} batch @returns {Promise<Map<string, ListsSourceContext>>} */
async function readSourceContextsForLists(session, batch) {
  const contexts = mapVisibleRecordBatch(batch, () => ({ duplicatedFrom: null, sourceList: null }));
  const sourceIds = [...new Set((batch.records || [])
    .flatMap((listRecord) => [listRecord.duplicated_from_list_id, listRecord.source_list_id])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];

  if (sourceIds.length === 0) {
    return contexts;
  }

  const sourceRecords = await listsRepository.readByIds(session.workspace_id, sourceIds);
  const readableSourceSummaries = new Map();

  for (const sourceRecord of sourceRecords) {
    if (await canReadList(session, sourceRecord)) {
      readableSourceSummaries.set(sourceRecord.list_id, shapeSourceSummary(sourceRecord));
    }
  }

  return mapVisibleRecordBatch(batch, (listRecord) => ({
    duplicatedFrom: readableSourceSummaries.get(listRecord.duplicated_from_list_id) || null,
    sourceList: readableSourceSummaries.get(listRecord.source_list_id) || null,
  }));
}

/** @param {ListsRecord} sourceList @returns {ListsSourceSummary} */
function shapeSourceSummary(sourceList) {
  return {
    finalized_at: sourceList.finalized_at || null,
    is_reusable: Boolean(sourceList.is_reusable),
    list_id: sourceList.list_id,
    list_type: sourceList.list_type,
    status: sourceList.status,
    title: sourceList.title,
  };
}

/** @param {ListsItemRecord} item @returns {ListsItemRecord & { id: string }} */
function shapeItemForBrowser(item) {
  return {
    ...item,
    id: item.list_item_id,
  };
}

/** @param {ListsLinkRecord} link @param {LinkedTargetRecord | null} [target] @returns {ListsBrowserLink} */
function shapeLinkForBrowser(link, target = null) {
  return {
    ...link,
    id: link.list_link_id,
    target: target ? { ...target } : null,
    targetAccess: target ? "available" : "unavailable",
  };
}

/** @param {ListsLinkRecord} link @returns {Record<string, unknown>} */
function sanitizeLinkForAudit(link) {
  return {
    link_role: link.link_role || "",
    list_link_id: link.list_link_id || "",
    module_id: link.module_id || "",
    target_id: link.target_id || "",
    target_type: link.target_type || "",
  };
}

/** @param {string} workspaceId @param {string} listId @param {string} reason */
async function syncListSearchIndex(workspaceId, listId, reason) {
  await searchIndexSyncService.reindexRecord({
    moduleId: LIST_MODULE_ID,
    reason,
    recordId: listId,
    recordType: "list",
    workspaceId,
  }, { swallowErrors: true });
}

/** @param {ListsServiceSession} session @param {string} action @param {string} changeType @param {ListsRecord | null} previousValue @param {ListsRecord} newValue @param {Record<string, unknown>} [metadata] */
async function recordListAudit(session, action, changeType, previousValue, newValue, metadata = {}) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list",
    recordId: newValue?.list_id || previousValue?.list_id,
    recordLabel: newValue?.title || previousValue?.title || "List",
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata,
      newValue,
      previousValue,
    }),
  });
}

/** @param {WorkspaceRequestSession} session @param {string} action @param {string} changeType @param {ListsItemRecord | null} previousValue @param {ListsItemRecord} newValue @param {ListsRecord} listRecord */
async function recordItemAudit(session, action, changeType, previousValue, newValue, listRecord) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_item",
    recordId: newValue?.list_item_id || previousValue?.list_item_id,
    recordLabel: newValue?.item_name || previousValue?.item_name || "List Item",
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        title: listRecord?.title,
      },
      newValue,
      previousValue,
    }),
  });
}

/** @param {WorkspaceRequestSession} session @param {string} action @param {string} changeType @param {ListsLinkRecord | null} previousValue @param {ListsLinkRecord} newValue @param {ListsRecord} listRecord */
async function recordLinkAudit(session, action, changeType, previousValue, newValue, listRecord) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_link",
    recordId: newValue?.list_link_id || previousValue?.list_link_id,
    recordLabel: `${newValue?.target_type || previousValue?.target_type || "Link"}:${newValue?.target_id || previousValue?.target_id || ""}`,
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        title: listRecord?.title,
        ...sanitizeLinkForAudit(newValue || previousValue),
      },
      newValue,
      previousValue,
    }),
  });
}

/** @param {WorkspaceRequestSession} session @param {string} action @param {string} changeType @param {ListsCatalogItemRecord | null} previousValue @param {ListsCatalogItemRecord} newValue */
async function recordCatalogAudit(session, action, changeType, previousValue, newValue) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_item_catalog",
    recordId: newValue?.catalog_item_id || previousValue?.catalog_item_id,
    recordLabel: newValue?.item_name || previousValue?.item_name || "Catalog Item",
    recordUrl: "",
    previousValue: previousValue ? sanitizeCatalogForAudit(previousValue) : null,
    newValue: newValue ? sanitizeCatalogForAudit(newValue) : null,
    metadata: sanitizeListLifecyclePayload({
      metadata: sanitizeCatalogForAudit(newValue || previousValue || {}),
      newValue: {
        ...(newValue || previousValue || {}),
        list_id: "",
        list_item_id: "",
        status: "",
      },
    }),
  });
}

/** @param {string} eventName @param {ListsServiceSession} session @param {ListsRecord | null} previousValue @param {ListsRecord} newValue @param {Record<string, unknown>} [metadata] */
async function emitListEvent(eventName, session, previousValue, newValue, metadata = {}) {
  const progress = newValue?.list_id
    ? await readListProgressSummary(session, newValue)
    : listProgressSummaryFromItems(newValue, []);

  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        ...metadata,
        ...safeResumeMetadataForList(newValue || previousValue || {}, progress),
      },
      newValue,
      previousValue,
    }),
    moduleId: LIST_MODULE_ID,
    newValue: sanitizeListLifecyclePayload({ newValue }),
    previousValue: previousValue ? sanitizeListLifecyclePayload({ newValue: previousValue }) : null,
    recordId: newValue?.list_id || previousValue?.list_id || "",
    recordType: "list",
    session,
    workspaceId: session.workspace_id,
  });
}

/** @param {string} eventName @param {WorkspaceRequestSession} session @param {ListsCatalogItemRecord | null} previousValue @param {ListsCatalogItemRecord} newValue */
async function emitCatalogEvent(eventName, session, previousValue, newValue) {
  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: sanitizeCatalogForAudit(newValue || previousValue || {}),
      newValue: {
        ...(newValue || previousValue || {}),
        list_id: "",
        list_item_id: "",
        status: "",
      },
    }),
    moduleId: LIST_MODULE_ID,
    newValue: newValue ? sanitizeCatalogForAudit(newValue) : null,
    previousValue: previousValue ? sanitizeCatalogForAudit(previousValue) : null,
    recordId: newValue?.catalog_item_id || previousValue?.catalog_item_id || "",
    recordType: "list_item_catalog",
    session,
    workspaceId: session.workspace_id,
  });
}

/** @param {string} eventName @param {WorkspaceRequestSession} session @param {ListsItemRecord | null} previousValue @param {ListsItemRecord} newValue @param {ListsRecord} listRecord */
async function emitItemEvent(eventName, session, previousValue, newValue, listRecord) {
  const progress = listRecord?.list_id
    ? await readListProgressSummary(session, listRecord)
    : listProgressSummaryFromItems(listRecord, []);

  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        ...safeResumeMetadataForList(listRecord || {}, progress),
        title: listRecord?.title,
      },
      newValue,
      previousValue,
    }),
    moduleId: LIST_MODULE_ID,
    newValue: sanitizeListLifecyclePayload({ newValue }),
    previousValue: previousValue ? sanitizeListLifecyclePayload({ newValue: previousValue }) : null,
    recordId: newValue?.list_item_id || previousValue?.list_item_id || "",
    recordType: "list_item",
    session,
    workspaceId: session.workspace_id,
  });
}

/** @param {ListsCatalogItemRecord} item @returns {Record<string, unknown>} */
function sanitizeCatalogForAudit(item) {
  return {
    archived_at: item.archived_at || "",
    catalog_item_id: item.catalog_item_id || "",
    client_id: item.client_id || "",
    created_at: item.created_at || "",
    item_name: item.item_name || "",
    list_type: item.list_type || "",
    normalized_name: item.normalized_name || "",
    project_id: item.project_id || "",
    quantity: item.quantity ?? null,
    unit: item.unit || "",
    updated_at: item.updated_at || "",
    use_count: item.use_count ?? 0,
    vendor_name: item.vendor_name || "",
    workspace_id: item.workspace_id || "",
  };
}

/** @param {ListsRecord} listRecord @param {ListsItemProgressSummary} progress @returns {Record<string, unknown>} */
function safeResumeMetadataForList(listRecord, progress) {
  return {
    checked_item_count: progress.checkedItemCount ?? 0,
    client_id: listRecord.client_id || "",
    completed_item_count: progress.completedItemCount ?? 0,
    earliest_needed_by_date: progress.earliestNeededByDate || "",
    last_activity_at: progress.lastActivityAt || listRecord.updated_at || listRecord.created_at || "",
    next_unchecked_item_label: progress.nextUncheckedItemLabel || "",
    project_id: listRecord.project_id || "",
    source_url: listRecord.list_id ? `lists.html?list=${encodeURIComponent(listRecord.list_id)}` : "lists.html",
    total_item_count: progress.totalItemCount ?? 0,
  };
}

const listsService = {
  archive,
  checkItem,
  complete,
  completeItem,
  createCatalogItem,
  create,
  createItem,
  deleteItem,
  duplicate,
  finalize,
  createLink,
  list,
  listLinkTargets,
  listLinks,
  markReusable,
  read,
  readLifecycleForIds,
  reopen,
  reorderItems,
  restore,
  removeLink,
  softDelete,
  suggestItems,
  uncheckItem,
  unmarkReusable,
  update,
  updateCatalogItem,
  updateItem,
};

export { listsService };
