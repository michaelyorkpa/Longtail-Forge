import type { WorkspaceRequestSession } from "./http-contracts.js";
import type { ListsRecord } from "./lists-domain-contracts.js";

export interface ListsItemListRecord extends ListsRecord {}

export interface ListsItemRecord extends Record<string, unknown> {
  list_item_id: string;
  workspace_id: string;
  list_id: string;
  catalog_item_id?: string | null;
  item_name: string;
  quantity?: number | null;
  unit?: string | null;
  needed_by_date?: string | null;
  vendor_name?: string | null;
  url?: string | null;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  purchase_status?: string;
  tracking_id?: string | null;
  notes?: string | null;
  assigned_user_id?: string | null;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  checked_at?: string | null;
  checked_by_user_id?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  sort_order?: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  metadata_json?: Record<string, unknown>;
}

export interface ListsItemCatalogSnapshot extends Record<string, unknown> {
  catalog_item_id: string;
  item_name?: string;
  estimated_cost?: number | null;
  notes?: string | null;
  quantity?: number | null;
  unit?: string | null;
  url?: string | null;
  vendor_name?: string | null;
}

export interface ListsItemCatalogOrchestration {
  createFromListItem(payload: Record<string, unknown>, session: WorkspaceRequestSession): Promise<ListsItemCatalogSnapshot>;
  readSnapshot(payload: Record<string, unknown>, session: WorkspaceRequestSession): Promise<ListsItemCatalogSnapshot | null>;
  recordUsage(catalogItemId: string, session: WorkspaceRequestSession): Promise<void>;
}

export interface ListsItemOrder {
  list_item_id: string;
  sort_order: number;
}

export interface ListsItemProgressSummary {
  assignedUserIds: string[];
  checkedItemCount: number;
  completedItemCount: number;
  earliestNeededByDate: string | null;
  incompleteItemCount: number;
  lastActivityAt: string | null;
  neededByDates: string[];
  nextUncheckedItemLabel: string;
  totalItemCount: number;
  unassignedItemCount: number;
}

export interface ListsItemProgressBatch {
  ids: string[];
  isEmpty: boolean;
  records: ListsItemListRecord[];
}

export interface ListsItemRepository {
  createItem(workspaceId: string, item: ListsItemRecord): Promise<unknown>;
  listItems(workspaceId: string, listId: string, filters?: { includeDeleted?: boolean }): Promise<unknown[]>;
  listItemsForLists(workspaceId: string, listIds: string[], filters?: { includeDeleted?: boolean }): Promise<unknown[]>;
  readItemById(workspaceId: string, listId: string, itemId: string): Promise<unknown>;
  reorderItems(workspaceId: string, listId: string, itemOrders: ListsItemOrder[], userId: string): Promise<unknown[]>;
  updateItem(workspaceId: string, item: ListsItemRecord): Promise<unknown>;
}

export interface ListsItemAggregateDependencies {
  repository: ListsItemRepository;
  catalogItems: ListsItemCatalogOrchestration;
  assertCanManageItem(session: WorkspaceRequestSession, list: ListsItemListRecord, item: ListsItemRecord | null): Promise<void>;
  emitItemEvent(eventName: string, session: WorkspaceRequestSession, previousItem: ListsItemRecord | null, nextItem: ListsItemRecord, list: ListsItemListRecord): Promise<void>;
  emitListEvent(eventName: string, session: WorkspaceRequestSession, previousList: ListsItemListRecord | null, nextList: ListsItemListRecord, metadata?: Record<string, unknown>): Promise<void>;
  nextSortOrder(workspaceId: string, listId: string): Promise<number>;
  normalizeItemOrders(value: unknown): ListsItemOrder[];
  normalizeItemPayload(payload: Record<string, unknown>, session: WorkspaceRequestSession, list: ListsItemListRecord, fallback?: Record<string, unknown>): unknown;
  readListOrThrow(session: WorkspaceRequestSession, listId: unknown): Promise<unknown>;
  recordItemAudit(session: WorkspaceRequestSession, action: string, changeType: string, previousItem: ListsItemRecord | null, nextItem: ListsItemRecord, list: ListsItemListRecord): Promise<void>;
  recordListAudit(session: WorkspaceRequestSession, action: string, changeType: string, previousList: ListsItemListRecord, nextList: ListsItemListRecord, metadata?: Record<string, unknown>): Promise<void>;
  syncListSearchIndex(workspaceId: string, listId: string, reason: string): Promise<void>;
}

export interface ListsItemAggregateService {
  checkItem(listId: string, itemId: string, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
  completeItem(listId: string, itemId: string, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
  createItem(listId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
  deleteItem(listId: string, itemId: string, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
  progressSummaryFromItems(list: ListsItemListRecord, items: ListsItemRecord[]): ListsItemProgressSummary;
  readProgressSummaries(session: { workspace_id: string }, batch: ListsItemProgressBatch): Promise<Map<string, ListsItemProgressSummary>>;
  readProgressSummary(session: { workspace_id: string }, list: ListsItemListRecord): Promise<ListsItemProgressSummary>;
  reorderItems(listId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<{ items: Array<ListsItemRecord & { id: string }> }>;
  uncheckItem(listId: string, itemId: string, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
  updateItem(listId: string, itemId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<{ item: ListsItemRecord & { id: string } }>;
}
