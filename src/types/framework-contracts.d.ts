/**
 * Framework contract shapes (type-only).
 *
 * These describe the highest-value cross-module contracts stabilized through
 * 0.33.5-0.33.6. They are consumed from JSDoc in `// @ts-check`-opted
 * JavaScript via `import("../types/framework-contracts.js")` type references;
 * runtime JavaScript must never import this file directly.
 *
 * Modeling rules:
 * - Dual-cased fields are modeled explicitly where the runtime still accepts
 *   or emits both casings (resume payloads, job options); do not pretend a
 *   shape is camelCase-only when snake_case is still live.
 * - Extensible validator-passthrough bags keep an index signature rather than
 *   inventing fields the validator does not enforce.
 */

// ---------------------------------------------------------------------------
// Module manifest
// ---------------------------------------------------------------------------

export interface ModuleManifest {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  terminology?: TerminologyMap;
  category?: string;
  version?: string;
  enabledByDefault?: boolean;
  canDisable?: boolean;
  historicalReadAccess?: boolean;
  browserApiRoutes?: unknown[];
  publicApiRoutes?: unknown[];
  migrationsDir?: string | URL | null;
  protectedViewsDir?: string | URL | null;
  publicViewsDir?: string | URL | null;
  browserAssetsDir?: string | URL | null;
  protectedViews?: unknown[];
  publicViews?: unknown[];
  viewSurfaces?: ViewSurfaceDescriptor[];
  browserAssets?: unknown[];
  navigation?: NavigationContribution[];
  dashboard?: DashboardContribution[];
  reporting?: unknown[];
  workbench?: WorkbenchContribution[];
  settings?: ModuleSettingDefinition[];
  permissions?: unknown[];
  requiredPermissions?: string[];
  defaultRolePermissions?: { roleId: string; permissions: string[] }[];
  resourceDefinitions?: unknown[];
  publicApiEndpoints?: unknown[];
  apiScopes?: unknown[];
  auditRecordTypes?: readonly {
    recordType: string;
    moduleId: string;
    label: string;
    description: string;
    terminology?: TerminologyMap;
    [key: string]: unknown;
  }[];
  eventTypes?: readonly {
    event: string;
    moduleId: string;
    label: string;
    description: string;
    recordType?: string;
    [key: string]: unknown;
  }[];
  eventSummaries?: Record<string, unknown> | readonly unknown[];
  timerSources?: unknown[];
  workItemSources?: unknown[];
  linkedContextProviders?: unknown[];
  taggableTypes?: TaggableTypeContribution[];
  tagPropagation?: unknown;
  searchableTypes?: SearchableTypeContribution[];
  attachableTypes?: AttachableTypeContribution[];
  help?: {
    sections?: readonly Record<string, unknown>[];
    articles?: readonly Record<string, unknown>[];
    [key: string]: unknown;
  };
  hooks?: {
    events?: readonly Record<string, any>[];
    [key: string]: unknown;
  };
  frameworkDependencies?: string[];
  moduleDependencies?: string[];
  seedHooks?: unknown[];
  repairHooks?: unknown[];
  workspaceCapabilityRequirements?: string[];
}

export type TerminologyMap = Partial<
  Record<"default" | "business" | "personal" | "family", Record<string, string>>
>;

export interface NavigationContribution {
  label: string;
  href: string;
  parent?: string;
  terminology?: TerminologyMap;
  requiredPermissions?: string[];
  [key: string]: unknown;
}

export interface ModuleSettingDefinition {
  id: string;
  label: string;
  type: "boolean" | "text" | "number" | "select" | "multi-select" | "info" | (string & {});
  description?: string;
  placeholder?: string;
  inputmode?: string;
  readOnlyReason?: string;
  disabledReason?: string;
  moduleStatus?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Declarative view surfaces
// ---------------------------------------------------------------------------

export interface ViewSurfaceDescriptor {
  id: string;
  moduleId: string;
  viewId: string;
  layout: "single-column" | "stacked" | "sidebar-detail" | "slide-out-sidebar" | "table-page" | (string & {});
  filterPlacement?: "inline" | "slide-out-sidebar" | (string & {});
  pageHeader?: Record<string, unknown>;
  sidebarLabel?: string;
  sidebarPanels?: Record<string, unknown>[];
  filters?: Record<string, unknown>[];
  indexPanel?: Record<string, unknown>;
  table?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  modals?: Record<string, unknown>[];
  dataSource?: Record<string, unknown>;
  actions?: Record<string, unknown>[];
  regions?: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Dashboard / Workbench contributions
// ---------------------------------------------------------------------------

export interface DashboardContribution {
  id: string;
  label: string;
  renderer: string;
  moduleId: string;
  description?: string;
  dataRoute?: string;
  placement?: "pulse" | "attention" | "today" | "main" | "activity" | "secondary" | "reporting" | (string & {});
  requiredPermissions?: string[];
  requiredWorkspaceCapabilities?: string[];
  requiresEnabledModules?: string[];
  sortOrder?: number;
  terminology?: TerminologyMap;
}

export interface WorkbenchContribution {
  id: string;
  label: string;
  renderer: string;
  moduleId: string;
  description?: string;
  sourceType?: string;
  listRoute?: string;
  requiredPermissions?: string[];
  requiredWorkspaceCapabilities?: string[];
  requiresEnabledModules?: string[];
  actions?: { id: string; label: string; route?: string }[];
  defaultCollapsed?: boolean;
  sortOrder?: number;
  terminology?: TerminologyMap;
}

// ---------------------------------------------------------------------------
// Work candidates / focus modes / resume state
// ---------------------------------------------------------------------------

export interface WorkCandidate {
  candidateId: string;
  sourceKind: string;
  recordType: string;
  recordId: string;
  moduleId: string;
  title: string;
  reason?: string;
  status?: string;
  priority?: string;
  clientId?: string;
  projectId?: string;
  contextLabel?: string;
  blockedReason?: string;
  nextAction?: string;
  handoffNote?: string;
  lastActionLabel?: string;
  lastActionType?: string;
  lastWorkedAt?: string;
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
  dismissedAt?: string;
  resumeStateId?: string;
  rankHint?: number | string;
  sourceUrl?: string;
  primaryAction?: {
    id?: string;
    label?: string;
    type?: string;
    href?: string;
    route?: string;
    [key: string]: unknown;
  } | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FocusModeDefinition {
  id: string;
  label: string;
  description?: string;
  moduleId?: string;
  requiredPermissions?: string[];
  [key: string]: unknown;
}

export interface FocusModeContext {
  focusModeId?: string;
  candidateQuery?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Resume-state producer payload. Dual-cased on purpose: producers may emit
 * either casing and the service normalizes; both remain part of the accepted
 * edge shape until producers are converted.
 */
export interface ResumeStatePayload {
  module_id?: string;
  moduleId?: string;
  record_type?: string;
  recordType?: string;
  record_id?: string;
  recordId?: string;
  title_snapshot?: string;
  titleSnapshot?: string;
  status_snapshot?: string;
  statusSnapshot?: string;
  priority_snapshot?: string;
  prioritySnapshot?: string;
  context_label_snapshot?: string;
  contextLabelSnapshot?: string;
  due_at_snapshot?: string;
  dueAtSnapshot?: string;
  blocked_reason?: string;
  blockedReason?: string;
  next_action?: string;
  nextAction?: string;
  handoff_note?: string;
  handoffNote?: string;
  last_action_label?: string;
  lastActionLabel?: string;
  last_action_type?: string;
  lastActionType?: string;
  last_worked_at?: string;
  lastWorkedAt?: string;
  source_url?: string;
  sourceUrl?: string;
  resume_rank_hint?: number | string;
  resumeRankHint?: number | string;
  client_id?: string;
  clientId?: string;
  project_id?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  metadata_json?: string;
  metadataJson?: string;
}

// ---------------------------------------------------------------------------
// Search seam
// ---------------------------------------------------------------------------

export interface SearchRecord {
  record_type: string;
  record_id: string;
  workspace_id?: string;
  module_id?: string;
  title?: string;
  body?: string;
  record_status?: string;
  record_created_at?: string;
  record_updated_at?: string;
  [key: string]: unknown;
}

export interface SearchReference {
  record_type: string;
  record_id: string;
  [key: string]: unknown;
}

export interface SearchResult {
  record_type: string;
  record_id: string;
  module_id?: string;
  title?: string;
  snippet?: string;
  url?: string;
  [key: string]: unknown;
}

/** A registered indexer receives a reference and re-reads canonical state. */
export type SearchIndexer = (reference: SearchReference, context?: Record<string, unknown>) => unknown;

// ---------------------------------------------------------------------------
// Notifications seam
// ---------------------------------------------------------------------------

export interface NotificationEventPayload {
  workspaceId?: string;
  workspace_id?: string;
  eventType?: string;
  event_type?: string;
  recordType?: string;
  record_type?: string;
  recordId?: string;
  record_id?: string;
  actorUserId?: string;
  actor_user_id?: string;
  priority?: "low" | "normal" | "high" | "urgent" | string;
  recipients?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Taggable / searchable / attachable manifest contributions
// ---------------------------------------------------------------------------

export interface TaggableTypeContribution {
  moduleId?: string;
  recordType?: string;
  targetType?: string;
  label?: string;
  [key: string]: unknown;
}

export interface SearchableTypeContribution {
  moduleId?: string;
  recordType?: string;
  indexerId?: string;
  label?: string;
  [key: string]: unknown;
}

export interface AttachableTypeContribution {
  moduleId?: string;
  targetType?: string;
  label?: string;
  allowedFileCategories?: string[];
  maxFileSizeBytes?: number | string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API envelope
// ---------------------------------------------------------------------------

export interface PublicApiPagination {
  limit: number;
  offset: number;
  total?: number;
  [key: string]: unknown;
}

export interface PublicApiListEnvelope<Item = unknown> {
  items?: Item[];
  data?: Item[];
  pagination: PublicApiPagination;
  [key: string]: unknown;
}

export interface PublicApiErrorEnvelope {
  error: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Jobs seam
// ---------------------------------------------------------------------------

/** Dual-cased on purpose: enqueue accepts either casing today. */
export interface JobEnqueueOptions {
  workspaceId?: string;
  workspace_id?: string;
  jobType?: string;
  job_type?: string;
  dedupeKey?: string | null;
  dedupe_key?: string | null;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  max_attempts?: number;
  availableAt?: string | null;
  available_at?: string | null;
}

export interface JobRecord {
  job_id: string;
  workspace_id: string;
  job_type: string;
  status: string;
  payload_json?: string;
  priority?: number;
  attempts?: number;
  max_attempts?: number;
  available_at?: string;
  [key: string]: unknown;
}

export type JobHandler = (job: JobRecord, context?: Record<string, unknown>) => Promise<unknown> | unknown;

// ---------------------------------------------------------------------------
// Database adapter/dialect seam
// ---------------------------------------------------------------------------

export interface DatabaseDialect {
  returning: {
    columns(columns: readonly string[]): string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DatabaseTransaction {
  query(sql: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  dialect: DatabaseDialect;
  [key: string]: unknown;
}

export interface DatabaseSeam {
  run(sql: string, params?: Record<string, unknown>): Promise<unknown>;
  get(sql: string, params?: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
  all(sql: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  transaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
  [key: string]: unknown;
}
