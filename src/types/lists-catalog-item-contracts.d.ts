import type { WorkspaceRequestSession } from "./http-contracts.js";

export interface ListsCatalogItemRecord extends Record<string, unknown> {
  archived_at: string | null;
  catalog_item_id: string;
  client_id: string | null;
  created_at: string;
  created_by_user_id: string;
  estimated_cost: number | null;
  item_name: string;
  last_used_at: string | null;
  list_type: string | null;
  metadata_json: Record<string, unknown>;
  normalized_name: string;
  notes: string | null;
  project_id: string | null;
  quantity: number | null;
  unit: string | null;
  updated_at: string;
  updated_by_user_id: string;
  url: string | null;
  use_count: number;
  vendor_name: string | null;
  workspace_id: string;
}

export interface ListsCatalogSuggestionQuery extends Record<string, unknown> {
  clientId?: unknown;
  client_id?: unknown;
  limit?: unknown;
  listId?: unknown;
  list_id?: unknown;
  listType?: unknown;
  list_type?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  q?: unknown;
  query?: unknown;
}

export interface ListsCatalogRepository {
  createCatalogItem(workspaceId: string, item: ListsCatalogItemRecord): Promise<unknown>;
  incrementCatalogUsage(workspaceId: string, catalogItemId: string, userId: string): Promise<unknown>;
  listCatalogSuggestions(workspaceId: string, filters?: Record<string, unknown>): Promise<unknown[]>;
  readCatalogItemById(workspaceId: string, catalogItemId: string): Promise<unknown>;
  updateCatalogItem(workspaceId: string, item: ListsCatalogItemRecord): Promise<unknown>;
}

export interface ListsCatalogAggregateDependencies {
  repository: ListsCatalogRepository;
  assertCanAccessList(session: WorkspaceRequestSession, list: Record<string, unknown>, operation: string): Promise<void>;
  assertCanManageCatalog(session: WorkspaceRequestSession): Promise<void>;
  assertListsReadable(session: WorkspaceRequestSession): Promise<void>;
  emitCatalogEvent(eventName: string, session: WorkspaceRequestSession, previousItem: ListsCatalogItemRecord | null, nextItem: ListsCatalogItemRecord): Promise<void>;
  readClientById(workspaceId: string, clientId: string): Promise<unknown>;
  readListOrThrow(session: WorkspaceRequestSession, listId: unknown, options?: { includeDeleted?: boolean }): Promise<unknown>;
  readProjectById(workspaceId: string, projectId: string): Promise<unknown>;
  recordCatalogAudit(session: WorkspaceRequestSession, action: string, changeType: string, previousItem: ListsCatalogItemRecord | null, nextItem: ListsCatalogItemRecord): Promise<void>;
}

export interface ListsCatalogAggregateService {
  createCatalogItem(rawPayload: unknown, session: WorkspaceRequestSession): Promise<{ catalogItem: ListsCatalogItemRecord & { id: string } }>;
  createFromListItem(payload: Record<string, unknown>, session: WorkspaceRequestSession): Promise<ListsCatalogItemRecord & { id: string }>;
  readSnapshot(payload: Record<string, unknown>, session: WorkspaceRequestSession): Promise<ListsCatalogItemRecord | null>;
  recordUsage(catalogItemId: string, session: WorkspaceRequestSession): Promise<void>;
  suggestItems(session: WorkspaceRequestSession, query?: ListsCatalogSuggestionQuery): Promise<{ suggestions: Array<ListsCatalogItemRecord & { id: string }> }>;
  updateCatalogItem(catalogItemId: unknown, rawPayload: unknown, session: WorkspaceRequestSession): Promise<{ catalogItem: ListsCatalogItemRecord & { id: string } }>;
}
