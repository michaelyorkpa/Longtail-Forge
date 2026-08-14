import type { Buffer as NodeBuffer } from "node:buffer";
import type { DatabaseNamedParameterInput, DatabaseRow, TransactionClient } from "./database-contracts.js";
import type { WorkspaceRequestSession } from "./http-contracts.js";
import type { NoteCollectionRecord, NoteLibraryBucket } from "./notes-collections-contracts.js";

export type NoteStatus = "active" | "pinned" | "archived" | "deleted";
export type NoteVisibility = "internal" | "private" | "workspace" | "client_visible" | "public";
export type NoteSecurityMode = "normal" | "secure";
export type NoteType = "general" | "meeting" | "research" | "decision" | "procedure" | "reference" | "idea" | "log" | "client" | "project" | "task" | "ticket" | "user";
export type NoteAccessOperation = "read" | "create" | "update" | "archive" | "restore" | "delete" | "view_history" | "restore_revision" | "manage_links" | "manage_library";

export interface NoteSecuritySourceRecord {
  workspace_id?: string | null;
  security_mode?: string | null;
  effective_security_mode?: string | null;
  note_collection_id?: string | null;
  owner_user_id?: string | null;
  status?: string | null;
  visibility?: string | null;
}

export interface NoteSecurityCollectionRecord {
  note_library_collection_id?: string | null;
  workspace_id?: string | null;
  parent_collection_id?: string | null;
  security_policy?: string | null;
  security_transition_state?: string | null;
}

export type NoteSecurityCollectionMap = Map<string, NoteSecurityCollectionRecord>;
export type NoteSecurityResolutionState = "cycle" | "missing_ancestor" | "missing_collection" | "resolved" | "workspace_mismatch";

export interface CollectionEffectiveSecurityResult {
  effectiveSecurityMode: NoteSecurityMode;
  inherited: boolean;
  resolutionState: NoteSecurityResolutionState;
  securityCatalogId: string | null;
}

export type NoteSecuritySource = "explicit_note" | "catalog" | "ancestor_catalog" | "none" | "unresolved_catalog";

export interface NoteEffectiveSecurityProjection {
  effective_security_mode: NoteSecurityMode;
  explicit_security_mode: string;
  security_catalog_id: string | null;
  security_inherited: boolean;
  security_resolution_state: NoteSecurityResolutionState;
  security_source: NoteSecuritySource;
}

export interface NoteAccessRecord extends NoteSecuritySourceRecord {
  workspace_id?: string | null;
  status?: string | null;
  visibility?: string | null;
  owner_user_id?: string | null;
  created_by_user_id?: string | null;
  library_bucket?: string | null;
}

export interface NoteAccessOptions {
  note?: NoteAccessRecord;
  operation?: NoteAccessOperation | string;
  session?: Partial<WorkspaceRequestSession>;
  permissions?: Set<string> | string[] | string | null;
  workspaceType?: string;
  linkedRecordAccess?: boolean;
  notesModuleEnabled?: boolean;
  historicalReadAccess?: boolean;
}

export interface NoteAggregateAccessOptions extends Omit<NoteAccessOptions, "operation" | "notesModuleEnabled" | "historicalReadAccess"> {
  includeSecureMetadata?: boolean;
}

export type NoteAccessResult =
  | { allowed: true; reason: "allowed" }
  | { allowed: false; reason: string };

export interface NoteLifecycleChanges {
  title?: unknown;
  body_markdown?: unknown;
  encrypted_payload?: unknown;
  library_bucket?: unknown;
  storage_key?: unknown;
  status?: unknown;
  visibility?: unknown;
  security_mode?: unknown;
}

export interface NoteLifecyclePayload {
  workspace_id?: unknown;
  actor_user_id?: unknown;
  note_id?: unknown;
  title?: unknown;
  body_markdown?: unknown;
  encrypted_payload?: unknown;
  storage_key?: unknown;
  body_excerpt?: unknown;
  library_bucket?: unknown;
  visibility?: unknown;
  security_mode?: unknown;
  effective_security_mode?: unknown;
  client_id?: unknown;
  project_id?: unknown;
  task_id?: unknown;
  ticket_id?: unknown;
  previous_values?: NoteLifecycleChanges | null;
  new_values?: NoteLifecycleChanges | null;
  occurred_at?: unknown;
}

export interface SanitizedNoteLifecyclePayload {
  workspace_id?: string;
  actor_user_id?: string;
  note_id?: string;
  title?: string;
  body_excerpt?: string;
  library_bucket?: string;
  visibility?: string;
  security_mode?: string;
  effective_security_mode?: string;
  client_id?: string;
  project_id?: string;
  task_id?: string;
  ticket_id?: string;
  previous_values?: Partial<Record<"title" | "library_bucket" | "status" | "visibility" | "security_mode", string | null>>;
  new_values?: Partial<Record<"title" | "library_bucket" | "status" | "visibility" | "security_mode", string | null>>;
  occurred_at?: string;
}

export interface NoteLinkContextEntry {
  targetType?: unknown;
  target_type?: unknown;
  targetId?: unknown;
  target_id?: unknown;
  clientId?: unknown;
  client_id?: unknown;
}

export interface NoteLinkContextInput {
  links?: NoteLinkContextEntry[];
  linkedRecords?: NoteLinkContextEntry[];
  clientIds?: unknown | unknown[];
  client_ids?: unknown | unknown[];
  projectIds?: unknown | unknown[];
  project_ids?: unknown | unknown[];
  taskIds?: unknown | unknown[];
  task_ids?: unknown | unknown[];
  ticketIds?: unknown | unknown[];
  ticket_ids?: unknown | unknown[];
  userIds?: unknown | unknown[];
  user_ids?: unknown | unknown[];
  linkedUserIds?: unknown | unknown[];
  linked_user_ids?: unknown | unknown[];
}

export type NoteLinkContext = NoteLinkContextInput | (NoteLinkContextEntry[] & Partial<NoteLinkContextInput>);

export interface NormalizedNoteLinkContext {
  clients: string[];
  projects: Array<{ projectId: string; clientId: string }>;
  tasks: string[];
  tickets: string[];
  users: string[];
}

export interface MarkdownSafetyResult {
  ok: boolean;
  errors: string[];
  markdown: string;
}

export interface WikiLink {
  targetTitle: string;
  targetSlug: string;
  displayText: string;
  raw: string;
  status: "unresolved";
}

export interface MarkdownNoteInput {
  note_id?: string | null;
  noteId?: string | null;
  workspace_id?: string | null;
  workspaceId?: string | null;
  title?: string | null;
  body_markdown?: string | null;
  bodyMarkdown?: string | null;
  body_excerpt?: string | null;
  bodyExcerpt?: string | null;
  note_type?: string | null;
  noteType?: string | null;
  library_bucket?: string | null;
  libraryBucket?: string | null;
  status?: string | null;
  visibility?: string | null;
  security_mode?: string | null;
  securityMode?: string | null;
}

export interface RevisionSnapshotOptions {
  revisionNumber?: number | string | null;
  revision_number?: number | string | null;
  changedByUserId?: string | null;
  changed_by_user_id?: string | null;
  changeSummary?: string | null;
  change_summary?: string | null;
  changeReason?: string | null;
  change_reason?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  metadataJson?: string | null;
  metadata_json?: string | null;
}

export interface NoteRevisionSnapshot {
  note_id: string;
  workspace_id: string;
  revision_number: number;
  title: string;
  body_markdown: string;
  body_excerpt: string;
  note_type: string;
  library_bucket: string;
  status: string;
  visibility: string;
  security_mode: string;
  changed_by_user_id: string;
  change_summary: string;
  change_reason: string;
  created_at: string;
  metadata_json: string | null;
}

export interface RevisionChange {
  field: "title" | "body_markdown" | "note_type" | "library_bucket" | "status" | "visibility" | "security_mode";
  previousValue: string | null;
  nextValue: string | null;
}

export interface RevisionChangelogInput {
  revision_number?: number | null;
  revisionNumber?: number | null;
  changed_by_user_id?: string | null;
  changedByUserId?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  change_summary?: string | null;
  changeSummary?: string | null;
}

export interface SecureNoteEncryptedFields {
  secure_payload?: string | null;
  secure_payload_version?: string | null;
  encrypted_data_key?: string | null;
  encryption_key_version?: string | null;
  encryption_algorithm?: "aes-256-gcm" | null;
  key_wrapping_algorithm?: "aes-256-gcm" | null;
  encryption_nonce?: string | null;
  encryption_auth_tag?: string | null;
  key_wrapping_nonce?: string | null;
  key_wrapping_auth_tag?: string | null;
  encrypted_at?: string | null;
}

export interface CompleteSecureNoteEncryptedFields extends SecureNoteEncryptedFields {
  secure_payload: string;
  encrypted_data_key: string;
  encryption_algorithm?: "aes-256-gcm" | null;
  key_wrapping_algorithm?: "aes-256-gcm" | null;
  encryption_nonce: string;
  encryption_auth_tag: string;
  key_wrapping_nonce: string;
  key_wrapping_auth_tag: string;
}

export interface SecureNoteEnvelope {
  secure_payload: string;
  secure_payload_version: string;
  encrypted_data_key: string;
  encryption_key_version: string;
  encryption_algorithm: "aes-256-gcm";
  key_wrapping_algorithm: "aes-256-gcm";
  encryption_nonce: string;
  encryption_auth_tag: string;
  key_wrapping_nonce: string;
  key_wrapping_auth_tag: string;
  encrypted_at: string;
}

export interface SecureNotesConfiguration {
  configured: boolean;
  bodyAlgorithm: "aes-256-gcm";
  keyVersion: string;
  keyWrappingAlgorithm: "aes-256-gcm";
  payloadVersion: "1";
  reason?: string;
}

export interface NoteConsumerPolicy {
  readonly id: string;
  readonly moduleId: "notes";
  readonly recordType: "note";
  readonly surface: string;
  readonly behavior: "authorize" | "exclude";
  readonly assertion: "notes.effective-security";
}

export interface NoteConsumerOptions {
  authorized?: boolean;
}

export interface NotesDomainSupportService {
  removeExcludedConsumerArtifacts(workspaceId: string, noteIds?: string | string[]): Promise<void>;
}

export type NotesWorkspaceSession = WorkspaceRequestSession;
export type NotesCollectionRecord = NoteCollectionRecord;
export type NotesLibraryBucket = NoteLibraryBucket;
export type NodeCryptoKey = NodeBuffer;

export type NoteJsonValue = boolean | number | string | null | NoteJsonValue[] | { [key: string]: NoteJsonValue };
export interface NoteJsonObject { [key: string]: NoteJsonValue }

export interface NoteDatabaseRow extends DatabaseRow {
  note_id: string;
  workspace_id: string;
  title: string;
  slug: string | null;
  body_markdown: string;
  body_excerpt: string | null;
  body_plaintext_index: string | null;
  note_type: string;
  library_bucket: string;
  library_bucket_source: string;
  status: string;
  visibility: string;
  security_mode: string;
  secure_payload: string | null;
  secure_payload_version: string | null;
  encrypted_data_key: string | null;
  encryption_key_version: string | null;
  encryption_algorithm: "aes-256-gcm" | null;
  key_wrapping_algorithm: "aes-256-gcm" | null;
  encryption_nonce: string | null;
  encryption_auth_tag: string | null;
  key_wrapping_nonce: string | null;
  key_wrapping_auth_tag: string | null;
  encrypted_at: string | null;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  ticket_id: string | null;
  linked_user_id: string | null;
  note_collection_id: string | null;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  metadata_json: string | null;
  import_source: string | null;
  import_source_id: string | null;
  import_source_path: string | null;
  imported_at: string | null;
  import_batch_id: string | null;
  original_notebook: string | null;
  original_section_group: string | null;
  original_section: string | null;
  original_page_id: string | null;
}

export interface NoteRecord extends NoteDatabaseRow, NoteEffectiveSecurityProjection {
  metadata: NoteJsonObject;
}

export interface NoteStoredRecord extends NoteDatabaseRow {
  metadata: NoteJsonObject;
}

export type NotePersistenceInput = Partial<NoteDatabaseRow> & Pick<NoteDatabaseRow, "title">;

export interface NoteRevisionDatabaseRow extends DatabaseRow, SecureNoteEncryptedFields {
  note_revision_id: string;
  workspace_id: string;
  note_id: string;
  revision_number: number | string;
  title: string;
  body_markdown: string;
  body_excerpt: string | null;
  note_type: string;
  library_bucket: string;
  status: string;
  visibility: string;
  security_mode: string;
  changed_by_user_id: string | null;
  change_summary: string | null;
  change_reason: string | null;
  created_at: string;
  metadata_json: string | null;
  import_source: string | null;
  import_source_id: string | null;
  import_source_path: string | null;
  imported_at: string | null;
  import_batch_id: string | null;
  original_notebook: string | null;
  original_section_group: string | null;
  original_section: string | null;
  original_page_id: string | null;
}

export interface NoteRevisionRecord extends NoteRevisionDatabaseRow {
  metadata: NoteJsonObject;
}

export type NoteRevisionPersistenceInput = Partial<NoteRevisionDatabaseRow> & Pick<NoteRevisionDatabaseRow, "note_id">;

export interface NoteLinkDatabaseRow extends DatabaseRow {
  note_link_id: string;
  workspace_id: string;
  note_id: string;
  module_id: string;
  target_type: string;
  target_id: string;
  link_role: string;
  scope_role: string;
  created_by_user_id: string | null;
  created_at: string;
  removed_at: string | null;
  metadata_json: string | null;
}

export interface NoteLinkRecord extends NoteLinkDatabaseRow {
  metadata: NoteJsonObject;
}

export type NoteLinkPersistenceInput = Partial<NoteLinkDatabaseRow> & Pick<NoteLinkDatabaseRow, "module_id" | "target_type" | "target_id">;

export interface NoteTarget {
  module_id: string;
  target_type: string;
  target_id: string;
}

export interface PropagatedNoteLinkInput {
  note_id?: unknown;
  noteId?: unknown;
  link_role?: unknown;
  linkRole?: unknown;
  scope_role?: unknown;
  scopeRole?: unknown;
}

export interface NormalizedPropagatedNoteLink {
  note_id: string;
  link_role: string;
  scope_role: string;
}

export interface NoteLinkPropagation {
  recurrence_template_id?: string;
  source_task_id?: string;
  created_by_user_id?: string | null;
}

export interface NoteCollectionDatabaseRow extends DatabaseRow {
  note_library_collection_id: string;
  workspace_id: string;
  title: string;
  slug: string;
  description: string | null;
  library_bucket: NoteLibraryBucket;
  parent_collection_id: string | null;
  path_cache: string | null;
  depth: number | string;
  sort_order: number | string;
  collection_source: "manual" | "imported";
  status: "active" | "archived" | "deleted";
  security_policy: "normal" | "secure";
  security_transition_state: "stable" | "securing" | "removing" | "failed";
  security_transition_action: "none" | "enable" | "remove";
  security_transition_version: number | string;
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
}

export type NoteCollectionPersistenceInput = Omit<Partial<NoteCollectionRecord>, "depth" | "security_transition_version" | "sort_order"> & {
  depth?: number | string;
  security_transition_version?: number | string;
  sort_order?: number | string;
} & Pick<NoteCollectionRecord, "title" | "slug" | "library_bucket">;

export interface NoteCollectionStoredRecord extends NoteCollectionDatabaseRow {
  depth: number;
  sort_order: number;
  security_transition_version: number;
  metadata: NoteJsonObject;
}

export interface NoteListFilters {
  includeDeleted?: boolean;
  status?: string | null;
  libraryBucket?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  ticketId?: string | null;
  linkedUserId?: string | null;
  ownerUserId?: string | null;
  noteCollectionId?: string | null;
}

export type NoteListFilterKey = "clientId" | "projectId" | "taskId" | "ticketId" | "linkedUserId" | "ownerUserId" | "noteCollectionId";

export interface NoteQueryOptions extends NoteListFilters {
  limit?: unknown;
  offset?: unknown;
  sort?: string | null;
  securityMode?: unknown;
  hasProjectFilter?: boolean;
  projectFilterMode?: "blank" | "ids" | string;
  projectIds?: unknown[];
  hasClientFilter?: boolean;
  omitClientFilterBecauseProjectSelected?: boolean;
  clientFilterMode?: "blank" | "ids" | string;
  clientIds?: unknown[];
  clientProjectIds?: unknown[];
  uncategorizedCollection?: boolean;
  noteCollectionIds?: unknown[];
  ownerSearch?: unknown;
  updatedSince?: unknown;
  contextSearch?: unknown;
  searchQuery?: unknown;
  noteType?: unknown;
  visibility?: unknown;
}

export interface NoteQueryParams {
  [key: string]: DatabaseNamedParameterInput;
  workspaceId: string;
}

export type NoteExactFilterName = "libraryBucket" | "noteType" | "visibility" | "securityMode" | "taskId" | "ticketId" | "linkedUserId" | "noteCollectionId";

export interface NoteQueryListResult {
  hasMore: boolean;
  nextOffset: number;
  notes: NoteRecord[];
}

export interface NoteCollectionFilters {
  includeDeleted?: boolean;
  includeArchived?: boolean;
  libraryBucket?: NoteLibraryBucket | "";
}

export interface NoteCountFilters {
  includeDeleted?: boolean;
  includeArchived?: boolean;
}

export interface NoteCreateWithLinksOptions {
  initialRevision?: (NoteRevisionPersistenceInput & { note_revision_id: string }) | null;
}

export interface CatalogSecuritySnapshot {
  notes: NoteRecord[];
  revisions: NoteRevisionRecord[];
  searchDocumentCount: number;
}

export interface CatalogSecurityClaimOptions {
  action?: unknown;
  actorUserId?: unknown;
  allowFailed?: boolean;
  expectedPolicy?: unknown;
  startedAt?: string;
  transitionVersion?: unknown;
  jobId?: unknown;
  updatedAt?: string;
}

export interface CatalogSecurityFinalizeOptions {
  action?: unknown;
  actorUserId?: unknown;
  completedAt?: string;
  securityPolicy?: unknown;
  transitionVersion?: unknown;
}

export interface CatalogSecurityFailureOptions {
  action?: unknown;
  errorCode?: unknown;
  failedAt?: string;
  transitionVersion?: unknown;
}

export interface CatalogSecurityClaim {
  action?: unknown;
  collectionId?: unknown;
  transitionVersion?: unknown;
}

export interface CatalogSecurityBatch {
  notes?: Array<NotePersistenceInput & { note_id: string }>;
  revisions?: Array<NoteRevisionPersistenceInput & { note_revision_id: string }>;
}

export interface CatalogSecurityBatchResult {
  applied: boolean;
  noteCount: number;
  revisionCount: number;
}

export interface NotePersistenceIdentity {
  noteId: string;
  updatedAt: string;
  createdAt?: string;
}

export interface NoteCollectionPersistenceIdentity {
  collectionId: string;
  updatedAt: string;
  createdAt?: string;
}

export interface NoteLinkReplacementResult {
  createdLinks: NoteLinkRecord[];
  removedLinks: NoteLinkRecord[];
}

export interface NotesRepository {
  applyCatalogSecurityBatch(workspaceId: string, claim?: CatalogSecurityClaim, batch?: CatalogSecurityBatch): Promise<CatalogSecurityBatchResult>;
  claimCatalogSecurityTransition(workspaceId: string, collectionId: string, options?: CatalogSecurityClaimOptions): Promise<NoteCollectionRecord | null>;
  create(workspaceId: string, note: NotePersistenceInput): Promise<NoteRecord>;
  createCollection(workspaceId: string, collection: NoteCollectionPersistenceInput): Promise<NoteCollectionRecord>;
  createLink(workspaceId: string, link: NoteLinkPersistenceInput & { note_id: string }): Promise<NoteLinkRecord>;
  createRevision(workspaceId: string, revision: NoteRevisionPersistenceInput): Promise<NoteRevisionRecord>;
  createWithLinks(workspaceId: string, note: NotePersistenceInput, links?: NoteLinkPersistenceInput[], options?: NoteCreateWithLinksOptions | null): Promise<NoteRecord>;
  countChildCollections(workspaceId: string, collectionId: string, filters?: NoteCountFilters): Promise<number>;
  countNotesInCollection(workspaceId: string, collectionId: string, filters?: NoteCountFilters): Promise<number>;
  countPlaintextSecurePlaceholders(workspaceId: string): Promise<number>;
  failCatalogSecurityTransition(workspaceId: string, collectionId: string, options?: CatalogSecurityFailureOptions): Promise<NoteCollectionStoredRecord | null>;
  finalizeCatalogSecurityTransition(workspaceId: string, collectionId: string, options?: CatalogSecurityFinalizeOptions): Promise<NoteCollectionRecord | null>;
  list(workspaceId: string, filters?: NoteListFilters): Promise<NoteRecord[]>;
  listCollections(workspaceId: string, filters?: NoteCollectionFilters): Promise<NoteCollectionRecord[]>;
  listForTarget(workspaceId: string, target: NoteTarget): Promise<NoteRecord[]>;
  listLinks(workspaceId: string, noteId: string): Promise<NoteLinkRecord[]>;
  listLinksForNotes(workspaceId: string, noteIds: string[]): Promise<NoteLinkRecord[]>;
  listLinksForTarget(workspaceId: string, target: NoteTarget): Promise<NoteLinkRecord[]>;
  listRevisions(workspaceId: string, noteId: string): Promise<NoteRevisionRecord[]>;
  nextRevisionNumber(workspaceId: string, noteId: string): Promise<number>;
  projectEffectiveSecurity<NoteType extends NoteSecuritySourceRecord>(workspaceId: string, note: NoteType): Promise<NoteType & NoteEffectiveSecurityProjection>;
  queryList(workspaceId: string, options?: NoteQueryOptions): Promise<NoteQueryListResult>;
  readById(workspaceId: string, noteId: string): Promise<NoteRecord | null>;
  readByIds(workspaceId: string, noteIds?: string[]): Promise<NoteRecord[]>;
  readCatalogSecuritySnapshot(workspaceId: string, collectionIds?: string[]): Promise<CatalogSecuritySnapshot>;
  readCollectionById(workspaceId: string, collectionId: string): Promise<NoteCollectionRecord | null>;
  readLinkById(workspaceId: string, noteId: string, linkId: string): Promise<NoteLinkRecord | null>;
  readRevisionById(workspaceId: string, noteId: string, revisionId: string): Promise<NoteRevisionRecord | null>;
  removeLink(workspaceId: string, noteId: string, linkId: string): Promise<NoteLinkRecord | null>;
  replacePropagatedLinksForTarget(workspaceId: string, target: NoteTarget, links?: PropagatedNoteLinkInput[], propagation?: NoteLinkPropagation): Promise<NoteLinkReplacementResult>;
  resumeCatalogSecurityTransition(workspaceId: string, collectionId: string, options?: CatalogSecurityClaimOptions): Promise<NoteCollectionStoredRecord | null>;
  secureNoteAndRevisions(workspaceId: string, note: NotePersistenceInput & { note_id: string }, revisions?: Array<NoteRevisionPersistenceInput & { note_revision_id: string }>, transitionRevision?: (NoteRevisionPersistenceInput & { note_revision_id: string }) | null): Promise<NoteRecord>;
  setCatalogSecurityTransitionJob(workspaceId: string, collectionId: string, options?: CatalogSecurityClaimOptions): Promise<NoteCollectionStoredRecord | null>;
  update(workspaceId: string, note: NotePersistenceInput & { note_id: string }): Promise<NoteRecord>;
  updateCollection(workspaceId: string, collection: NoteCollectionPersistenceInput & { note_library_collection_id: string }): Promise<NoteCollectionRecord>;
}

export type NotesTransactionClient = TransactionClient;

export type CatalogSecurityAction = "enable" | "remove";

export interface CatalogSecurityPayload {
  confirmAction?: string;
  confirmAffectedNoteCount?: number | string | null;
  confirmCatalogId?: string;
  confirm_action?: string;
  confirm_affected_note_count?: number | string | null;
  confirm_catalog_id?: string;
  currentPassword?: string;
  current_password?: string;
}

export interface CatalogSecurityQuery {
  action?: unknown;
}

export interface CatalogSecurityBlocker {
  code: "secure_placeholder_requires_recovery" | "secure_payload_missing";
  noteCount: number;
  revisionCount: number;
}

export interface CatalogSecurityTransitionContext {
  action: CatalogSecurityAction;
  affectedNotes: NoteRecord[];
  affectedRevisions: NoteRevisionRecord[];
  blockers: CatalogSecurityBlocker[];
  collection: NoteCollectionRecord;
  execution: "job" | "synchronous";
  notesToTransform: NoteRecord[];
  revisionsToTransform: NoteRevisionRecord[];
  scopeCollections: NoteCollectionRecord[];
  snapshot: CatalogSecuritySnapshot;
  workRecordCount: number;
}

export interface CatalogSecurityTransitionClaim {
  action: CatalogSecurityAction;
  actorUserId: string | null;
  collectionId: string;
  transitionVersion: number;
  workspaceId: string;
}

export interface CatalogSecurityJobPayload {
  action?: unknown;
  actorUserId?: unknown;
  actor_user_id?: unknown;
  collectionId?: unknown;
  collection_id?: unknown;
  transitionVersion?: unknown;
  transition_version?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface CatalogSecurityJobContext {
  payload?: CatalogSecurityJobPayload;
}

export interface CatalogSecurityJobSession {
  user_id: string | null;
  workspace_id: string;
}

export type CatalogSecurityActorSession = WorkspaceRequestSession | CatalogSecurityJobSession;

export interface CatalogSecurityStartOptions {
  allowFailed?: boolean;
  context?: CatalogSecurityTransitionContext;
}

export interface CatalogSecurityProcessOptions {
  session?: CatalogSecurityActorSession;
}

export interface CatalogSecurityBlockerOptions {
  allowPartialDowngrade?: boolean;
}

export interface CatalogSecurityAuditMetadata {
  action?: CatalogSecurityAction;
  errorCode?: string;
  execution?: string;
  transitionVersion?: number;
}

export interface CatalogSecurityAuditContext {
  affectedNotes?: NoteRecord[];
  affectedRevisions?: NoteRevisionRecord[];
  scopeCollections?: NoteCollectionRecord[];
}

export interface CatalogSecurityPublicPreflight {
  action: CatalogSecurityAction;
  affectedNoteCount: number;
  affectedRevisionCount: number;
  blockerCodes: string[];
  canProceed: boolean;
  catalogCount: number;
  catalogId: string;
  currentPolicy: string;
  execution: "job" | "synchronous";
  noteTransformCount: number;
  revisionTransformCount: number;
  staleSearchDocumentCount: number;
  transitionState: string;
  workRecordCount: number;
}

export interface CatalogSecurityCompletedResult {
  collection: NoteCollectionRecord;
  completed: true;
  transitionVersion: number;
}

export interface CatalogSecuritySkippedResult extends CatalogSecurityTransitionClaim {
  reason: "stale_transition_claim";
  skipped: true;
}

export type CatalogSecurityProcessResult = CatalogSecurityCompletedResult | CatalogSecuritySkippedResult;

export interface CatalogSecurityJobStartResult {
  collection: NoteCollectionRecord | null;
  execution: "job";
  jobId: string;
  preflight: CatalogSecurityPublicPreflight;
  transitionVersion: number;
}

export type CatalogSecuritySynchronousStartResult = CatalogSecurityProcessResult & {
  execution: "synchronous";
  preflight: CatalogSecurityPublicPreflight;
};

export type CatalogSecurityStartResult = CatalogSecurityJobStartResult | CatalogSecuritySynchronousStartResult;

export interface CatalogSecurityService {
  enable(collectionId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<CatalogSecurityStartResult>;
  handleCatalogSecurityJob(context?: CatalogSecurityJobContext): Promise<CatalogSecurityProcessResult>;
  preflight(collectionId: string, query: CatalogSecurityQuery | undefined, session: WorkspaceRequestSession): Promise<{ preflight: CatalogSecurityPublicPreflight }>;
  registerCatalogSecurityJobHandler(options?: { replace?: boolean }): void;
  remove(collectionId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<CatalogSecurityStartResult>;
  retry(collectionId: string, rawPayload: unknown, session: WorkspaceRequestSession): Promise<CatalogSecurityStartResult>;
}
