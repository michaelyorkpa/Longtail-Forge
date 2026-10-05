import type { ApiSession, ServiceAuthorizationSession, WorkspaceRequestSession } from "./http-contracts.js";
import type { PublicApiPagination } from "./framework-contracts.js";
import type { DatabaseNamedParameterInput } from "./database-contracts.js";
import type { ListsCatalogItemRecord } from "./lists-catalog-item-contracts.js";
import type { ListsItemOrder, ListsItemProgressSummary, ListsItemRecord } from "./lists-item-contracts.js";

export type ListsServiceSession = WorkspaceRequestSession | ApiSession | ServiceAuthorizationSession;
export type ListsJsonObject = Record<string, unknown>;
export interface ListsQueryParams {
  [key: string]: DatabaseNamedParameterInput;
}

export interface ListsRecord extends Record<string, unknown> {
  list_id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  list_type: string;
  status: string;
  is_reusable: boolean;
  source_list_id: string | null;
  duplicated_from_list_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  finalized_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  finalized_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  metadata_json: ListsJsonObject;
}

export interface ListsBrowserRecord extends ListsRecord {
  id: string;
  isBillOfMaterials: boolean;
  isReusable: boolean;
  links: ListsBrowserLink[];
  progress: ListsItemProgressSummary;
  resumeContext: ListsResumeContext;
  sourceContext: ListsSourceContext;
  tags?: Array<Record<string, unknown> & { tag_id: string }>;
}

export interface ListsResumeLinkedRecord extends Record<string, unknown> {
  id: string;
  isAvailable: boolean;
  label: string;
  linkRole: string;
  moduleId: string;
  sourceUrl: string;
  targetId: string;
  targetType: string;
}

export interface ListsResumeContext extends Record<string, unknown> {
  client_id: string;
  linkedRecords: ListsResumeLinkedRecord[];
  progress: ListsItemProgressSummary;
  project_id: string;
  sourceUrl: string;
  status: string;
  title: string;
}

export interface ListsBrowserLink extends ListsLinkRecord {
  id: string;
  target: ListsLinkedTargetRecord | null;
  targetAccess: "available" | "unavailable";
}

export interface ListsLinkedTargetRecord extends Record<string, unknown> {
  label: string;
  module_id: string;
  target_id: string;
  target_type: string;
  url: string;
}

export interface ListsSourceSummary extends Record<string, unknown> {
  finalized_at: string | null;
  is_reusable: boolean;
  list_id: string;
  list_type: string;
  status: string;
  title: string;
}

export interface ListsSourceContext {
  duplicatedFrom: ListsSourceSummary | null;
  sourceList: ListsSourceSummary | null;
}

export interface ListsVisibleBatch {
  idField: string;
  ids: string[];
  isEmpty: boolean;
  records: ListsRecord[];
}

export interface ListsNormalizedQuery extends Record<string, unknown> {
  archiveState: string;
  assigneeId: string;
  clientFilterMode: string;
  clientId: string;
  clientIds: string[];
  clientProjectIds: string[];
  hasClientFilter: boolean;
  hasProjectFilter: boolean;
  listType: string;
  neededByDate: string;
  omitClientFilterBecauseProjectSelected: boolean;
  projectFilterMode: string;
  projectId: string;
  projectIds: string[];
  repositoryFilters: ListsRepositoryFilters;
  response: Record<string, unknown>;
  reusable: string;
  sort: string;
  status: string;
  tagIds: unknown;
  targetId: string;
  targetType: string;
  moduleId: string;
}

export interface ListsLinkRecord extends Record<string, unknown> {
  list_link_id: string;
  workspace_id: string;
  list_id: string;
  module_id: string;
  target_type: string;
  target_id: string;
  link_role: string;
  created_by_user_id: string;
  created_at: string;
  removed_at: string | null;
  metadata_json: ListsJsonObject;
}

export interface ListsLinkPersistenceInput extends Record<string, unknown> {
  list_link_id?: string;
  workspace_id?: string;
  list_id: string;
  module_id: string;
  target_type: string;
  target_id: string;
  link_role?: string;
  created_by_user_id: string;
  created_at?: string;
  removed_at?: string | null;
  metadata_json?: unknown;
}

export interface ListsItemPersistenceInput extends Record<string, unknown> {
  list_item_id?: string;
  workspace_id?: string;
  list_id: string;
  catalog_item_id?: string | null;
  item_name: string;
  quantity?: unknown;
  unit?: string | null;
  needed_by_date?: string | null;
  vendor_name?: string | null;
  url?: string | null;
  estimated_cost?: unknown;
  actual_cost?: unknown;
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
  sort_order?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  metadata_json?: unknown;
}

export interface ListsItemUpdateInput extends Record<string, unknown> {
  list_item_id?: string;
  workspace_id?: string;
  list_id?: string;
  catalog_item_id?: string | null;
  item_name?: string;
  quantity?: unknown;
  unit?: string | null;
  needed_by_date?: string | null;
  vendor_name?: string | null;
  url?: string | null;
  estimated_cost?: unknown;
  actual_cost?: unknown;
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
  sort_order?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  metadata_json?: unknown;
}

export interface ListsPersistenceInput extends Record<string, unknown> {
  list_id?: string;
  workspace_id?: string;
  client_id?: string | null;
  project_id?: string | null;
  title: string;
  description?: string | null;
  list_type?: string;
  status?: string;
  is_reusable?: boolean;
  source_list_id?: string | null;
  duplicated_from_list_id?: string | null;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  finalized_by_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  finalized_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  metadata_json?: unknown;
}

export interface ListsCatalogPersistenceInput extends Record<string, unknown> {
  archived_at?: string | null;
  catalog_item_id?: string;
  client_id?: string | null;
  created_at?: string;
  created_by_user_id?: string;
  estimated_cost?: unknown;
  item_name: string;
  last_used_at?: string | null;
  list_type?: string | null;
  metadata_json?: unknown;
  normalized_name?: string;
  notes?: string | null;
  project_id?: string | null;
  quantity?: unknown;
  unit?: string | null;
  updated_at?: string;
  updated_by_user_id?: string;
  url?: string | null;
  use_count?: unknown;
  vendor_name?: string | null;
  workspace_id?: string;
}

export type ListsDatabaseRow = Omit<ListsRecord, "is_reusable" | "metadata_json"> & {
  is_reusable: unknown;
  metadata_json: string | null;
};

export type ListsItemDatabaseRow = Omit<ListsItemRecord, "quantity" | "estimated_cost" | "actual_cost" | "metadata_json"> & {
  quantity: unknown;
  estimated_cost: unknown;
  actual_cost: unknown;
  metadata_json: string | null;
};

export type ListsCatalogItemDatabaseRow = Omit<ListsCatalogItemRecord, "quantity" | "estimated_cost" | "use_count" | "metadata_json"> & {
  quantity: unknown;
  estimated_cost: unknown;
  use_count: unknown;
  metadata_json: string | null;
};

export type ListsLinkDatabaseRow = Omit<ListsLinkRecord, "metadata_json"> & {
  metadata_json: string | null;
};

export interface ListsRepositoryFilters extends Record<string, unknown> {
  includeDeleted?: boolean;
  status?: string;
  listType?: string;
  createdByUserId?: string;
  isReusable?: boolean;
  clientIds?: string[];
  projectIds?: string[];
  clientProjectIds?: string[];
  updatedAfter?: string;
}

export interface ListsCatalogSuggestionFilters extends Record<string, unknown> {
  clientId?: string;
  limit?: number;
  listType?: string;
  projectId?: string;
  query?: string;
}

export interface ListsRepository {
  create(workspaceId: string, list: ListsPersistenceInput): Promise<ListsRecord | null>;
  createCatalogItem(workspaceId: string, item: ListsCatalogPersistenceInput): Promise<ListsCatalogItemRecord | null>;
  createItem(workspaceId: string, item: ListsItemPersistenceInput): Promise<ListsItemRecord | null>;
  createLink(workspaceId: string, link: ListsLinkPersistenceInput): Promise<ListsLinkRecord | null>;
  incrementCatalogUsage(workspaceId: string, catalogItemId: string, userId?: string): Promise<ListsCatalogItemRecord | null>;
  list(workspaceId: string, filters?: ListsRepositoryFilters): Promise<ListsRecord[]>;
  listCatalogSuggestions(workspaceId: string, filters?: ListsCatalogSuggestionFilters): Promise<ListsCatalogItemRecord[]>;
  listItems(workspaceId: string, listId: string, filters?: { includeDeleted?: boolean; purchaseStatus?: string }): Promise<ListsItemRecord[]>;
  listItemsForLists(workspaceId: string, listIds?: string[], filters?: { includeDeleted?: boolean; purchaseStatus?: string }): Promise<ListsItemRecord[]>;
  listLinks(workspaceId: string, listId: string): Promise<ListsLinkRecord[]>;
  listLinksForLists(workspaceId: string, listIds?: string[]): Promise<ListsLinkRecord[]>;
  readById(workspaceId: string, listId: string): Promise<ListsRecord | null>;
  readByIds(workspaceId: string, listIds?: string[]): Promise<ListsRecord[]>;
  readCatalogItemById(workspaceId: string, catalogItemId: string): Promise<ListsCatalogItemRecord | null>;
  readItemById(workspaceId: string, listId: string, itemId: string): Promise<ListsItemRecord | null>;
  readLinkById(workspaceId: string, listId: string, linkId: string): Promise<ListsLinkRecord | null>;
  removeLink(workspaceId: string, listId: string, linkId: string): Promise<ListsLinkRecord | null>;
  reorderItems(workspaceId: string, listId: string, orders?: ListsItemOrder[], userId?: string): Promise<ListsItemRecord[]>;
  update(workspaceId: string, list: ListsPersistenceInput): Promise<ListsRecord | null>;
  updateCatalogItem(workspaceId: string, item: ListsCatalogPersistenceInput): Promise<ListsCatalogItemRecord | null>;
  updateItem(workspaceId: string, item: ListsItemUpdateInput): Promise<ListsItemRecord | null>;
}

export interface ListsServiceQuery extends Record<string, unknown> {
  limit?: unknown;
  offset?: unknown;
  includeDeleted?: unknown;
  include_deleted?: unknown;
}

export interface ListsPublicApiListResult {
  data: ListsBrowserRecord[];
  pagination: PublicApiPagination & { total: number; has_more: boolean };
}

export interface ListsPublicApiReadResult {
  list: ListsBrowserRecord;
  items: ListsItemRecord[];
  links: ListsLinkRecord[];
}

export interface ListsSearchDocument extends Record<string, unknown> {
  workspace_id: string;
  list_id: string;
  title: string;
  summary: string;
  body: string;
  tags_text: string;
  client_id: string | null;
  project_id: string | null;
  search_status: string;
  source: "Lists";
  record_created_at: string | null;
  record_updated_at: string | null;
}
