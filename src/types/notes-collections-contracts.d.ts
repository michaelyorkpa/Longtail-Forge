import type { ApiSession, ServiceAuthorizationSession, WorkspaceRequestSession } from "./http-contracts.js";

export type NoteLibraryBucket = "active_work" | "ongoing_area" | "reference";
export type NoteCollectionStatus = "active" | "archived" | "deleted";
export type NoteCollectionSecurityMode = "normal" | "secure";
export type NoteCollectionTransitionState = "stable" | "securing" | "removing" | "failed";
export type NoteCollectionTransitionAction = "none" | "enable" | "remove";
export type NoteCollectionSource = "manual" | "imported";

export type NoteCollectionMetadataValue =
  | boolean
  | number
  | string
  | null
  | NoteCollectionMetadataValue[]
  | { [key: string]: NoteCollectionMetadataValue };

export interface NoteCollectionMetadata {
  [key: string]: NoteCollectionMetadataValue;
}

export interface NoteCollectionRecord {
  note_library_collection_id: string;
  workspace_id: string;
  title: string;
  slug: string;
  description: string | null;
  library_bucket: NoteLibraryBucket;
  parent_collection_id: string | null;
  path_cache: string | null;
  depth: number;
  sort_order: number;
  collection_source: NoteCollectionSource;
  status: NoteCollectionStatus;
  security_policy: NoteCollectionSecurityMode;
  security_transition_state: NoteCollectionTransitionState;
  security_transition_action: NoteCollectionTransitionAction;
  security_transition_version: number;
  security_transition_job_id: string | null;
  security_transition_actor_user_id: string | null;
  security_transition_started_at: string | null;
  security_transition_error_code: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  metadata_json: string | null;
  metadata: NoteCollectionMetadata;
  effective_security_mode: NoteCollectionSecurityMode;
  security_inherited: boolean;
  security_resolution_state: string;
  security_source_catalog_id: string | null;
}

export interface NoteCollectionCountNote {
  note_id: string;
  note_collection_id: string | null;
}

export interface NoteCollectionCountFilters {
  includeDeleted: false;
  libraryBucket: NoteLibraryBucket | "";
  status: "active" | "";
}

export interface NoteCollectionReadRow extends NoteCollectionRecord {
  accessibleNoteCount: number;
  directAccessibleNoteCount: number;
}

export interface NoteCollectionTreeNode extends NoteCollectionReadRow {
  children: NoteCollectionTreeNode[];
}

export interface NoteCollectionReadModel {
  collections: NoteCollectionReadRow[];
  tree: NoteCollectionTreeNode[];
  defaults: {
    libraries: {
      all: { label: string; value: string };
      buckets: Array<{ label: string; value: NoteLibraryBucket }>;
    };
    collections: {
      all: { label: string; value: string };
      uncategorized: { label: string; value: string };
    };
    activeLibraryBucket: NoteLibraryBucket | "all";
  };
  uncategorized: {
    count: number;
    libraryBucket: NoteLibraryBucket | "";
    label: string;
    value: string;
  };
}

export interface NoteCollectionResult {
  collection: NoteCollectionRecord;
}

export interface NoteCollectionArchiveResult extends NoteCollectionResult {
  archivedCount: number;
}

export interface NoteCollectionDeleteResult extends NoteCollectionResult {
  deleted: true;
}

export interface NoteCollectionImportResult extends NoteCollectionResult {
  collections: NoteCollectionRecord[];
}

export interface NoteCatalogSettingsRow {
  catalogId: string;
  title: string;
  description: string;
  libraryBucket: NoteLibraryBucket;
  parentCatalogId: string | null;
  path: string;
  depth: number;
  sortOrder: number;
  source: NoteCollectionSource;
  status: NoteCollectionStatus;
  securityPolicy: NoteCollectionSecurityMode;
  effectiveSecurityMode: NoteCollectionSecurityMode;
  securityInherited: boolean;
  securityTransitionState: NoteCollectionTransitionState;
  securityTransitionAction: NoteCollectionTransitionAction;
  securityTransitionVersion: number;
  securityTransitionJobId: string | null;
  securityTransitionStartedAt: string | null;
  securityTransitionErrorCode: string | null;
  updatedAt: string | null;
}

export interface NoteCatalogSettingsResult {
  catalogs: NoteCatalogSettingsRow[];
  capabilities: { manageSecurity: boolean };
  limits: { bulkSelection: number };
}

export interface NoteCatalogBulkError {
  catalogId: string;
  message: string;
}

export interface NoteCatalogBulkResult {
  action: "archive" | "restore";
  affectedCount: number;
  catalogs: NoteCatalogSettingsRow[];
  errors: NoteCatalogBulkError[];
  requestedCount: number;
}

export interface NoteCollectionSelection {
  libraryBucket: NoteLibraryBucket | "";
  noteCollectionId: string;
}

export interface NoteCollectionListFilter {
  uncategorizedCollection?: boolean;
  noteCollectionIds?: string[];
}

export interface NoteCollectionAssignment {
  library_bucket: NoteLibraryBucket;
  note_collection_id: string | null;
}

export interface NotesCollectionsDependencies {
  listAccessibleNotes(
    session: WorkspaceRequestSession,
    filters: NoteCollectionCountFilters,
  ): Promise<NoteCollectionCountNote[]>;
  recordAudit(
    session: WorkspaceRequestSession,
    action: string,
    changeType: string,
    previousValue: NoteCollectionRecord | null,
    newValue: NoteCollectionRecord | null,
  ): Promise<void>;
}

export interface NotesCollectionsService {
  archiveCollection(collectionId: string, session: WorkspaceRequestSession): Promise<NoteCollectionArchiveResult>;
  assertNoteAssignment(session: WorkspaceRequestSession, assignment: NoteCollectionAssignment): Promise<void>;
  bulkManageCatalogs(rawPayload: unknown, session: WorkspaceRequestSession): Promise<NoteCatalogBulkResult>;
  createCollection(rawPayload: unknown, session: WorkspaceRequestSession): Promise<NoteCollectionResult>;
  deleteEmptyCollection(collectionId: string, session: WorkspaceRequestSession): Promise<NoteCollectionDeleteResult>;
  ensureCollectionsForImportPath(session: WorkspaceRequestSession, rawPayload: unknown): Promise<NoteCollectionImportResult>;
  listCatalogSettings(session: WorkspaceRequestSession): Promise<NoteCatalogSettingsResult>;
  listCollections(session: WorkspaceRequestSession, rawQuery?: unknown): Promise<NoteCollectionReadModel>;
  moveCollection(collectionId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<NoteCollectionResult>;
  readAssignableCollection(session: WorkspaceRequestSession, collectionId: string): Promise<NoteCollectionRecord>;
  resolveListFilter(session: WorkspaceRequestSession | ApiSession | ServiceAuthorizationSession, selection: NoteCollectionSelection): Promise<NoteCollectionListFilter>;
  restoreCollection(collectionId: string, session: WorkspaceRequestSession): Promise<NoteCollectionResult>;
  updateCollection(collectionId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<NoteCollectionResult>;
}
