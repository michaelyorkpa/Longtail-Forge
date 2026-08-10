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
  browserAssets?: BrowserAssetContribution[];
  navigation?: NavigationContribution[];
  dashboard?: DashboardContribution[];
  reporting?: ReportingContribution[];
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
  protectedContentConsumers?: ProtectedContentConsumerContribution[];
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

export interface ProtectedContentConsumerContribution {
  id: string;
  moduleId: string;
  recordType: string;
  surface: string;
  behavior: "authorize" | "exclude";
  assertion: string;
}

export interface ModuleStartupTask {
  id: string;
  run: () => unknown | Promise<unknown>;
  formatSuccess?: (result: any) => string;
  failureMessage?: string;
}

export interface ModuleActivationContext {
  moduleId: string;
  runtime: "app" | "worker";
  registerStartupTask: (task: ModuleStartupTask) => void;
}

export interface ModuleEntry {
  manifest: ModuleManifest;
  activateApp?: (context: ModuleActivationContext) => unknown;
  activateWorker?: (context: ModuleActivationContext) => unknown;
}

export interface BundledModuleCatalogEntry {
  directoryName: string;
  moduleEntry: ModuleEntry;
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
  type: "boolean" | "toggle" | "text" | "textarea" | "number" | "select" | "multi-select" | "radio" | "info" | (string & {});
  placement: "workspace" | "user" | "module" | "new-workspace" | (string & {});
  target?: "module";
  protected?: false;
  ownerOnly?: boolean;
  readOnly?: boolean;
  description?: string;
  placeholder?: string;
  inputmode?: string;
  readOnlyReason?: string;
  disabledReason?: string;
  requiredPermissions?: string[];
  requiredWorkspaceCapabilities?: string[];
  requiresEnabledModules?: string[];
  requiredModules?: string[];
  handler?: string;
  onChangeEffect?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  spellcheck?: boolean;
  default?: boolean | string | number | string[];
  visibleWhen?: { settingId: string; equals: boolean | string | number };
  required?: boolean;
  moduleStatus?: boolean;
  terminology?: TerminologyMap;
  [key: string]: unknown;
}

export interface BrowserAssetContribution {
  id: string;
  moduleId: string;
  path: string;
  type: "script" | "style" | (string & {});
  views?: string[];
  requiredPermissions?: string[];
  requiredWorkspaceCapabilities?: string[];
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
// Dashboard / Reporting / Workbench contributions
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

export type ReportingFilterType =
  | "billing-period"
  | "custom-date-range"
  | "scope"
  | "project-multi-select"
  | "tag"
  | "boolean";

export interface ReportingFilterContribution {
  id: string;
  label: string;
  type: ReportingFilterType | (string & {});
  queryKeys: string[];
  defaultValue?: string | boolean | string[] | null;
  required?: boolean;
  visibleWhen?: {
    filterId: string;
    equals: string;
  };
}

export interface ReportingContribution {
  id: string;
  moduleId: string;
  label: string;
  description: string;
  category: string;
  renderer: string;
  runner: string;
  requiredPermissions: string[];
  requiredWorkspaceCapabilities: string[];
  requiresEnabledModules: string[];
  sortOrder?: number;
  filters: ReportingFilterContribution[];
  browserAssetIds: string[];
}

export interface ReportRunnerContext {
  filters: Record<string, string | boolean | string[]>;
  report: ReportingContribution;
  reportKey: string;
  session: Record<string, unknown>;
  workspaceId: string;
}

export type ReportRunner = (context: ReportRunnerContext) => unknown | Promise<unknown>;

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

export type DatabaseRow = Record<string, any>;
export type DatabaseParameterInput = string | number | bigint | boolean | Buffer | Date | null | undefined;
export type DatabaseParameterValue = string | number | bigint | Buffer | null;
export type DatabaseNamedParameterInput = DatabaseParameterInput | DatabaseParameterInput[];
export type DatabaseParams = Record<string, DatabaseNamedParameterInput> | DatabaseParameterInput[];
export type DatabasePlaceholderStyle = "dollar" | "question";

export type NormalizedDatabaseParameters =
  | { kind: "none"; values: null }
  | { kind: "array"; values: DatabaseParameterValue[] }
  | { kind: "object"; values: Map<string, DatabaseParameterValue | DatabaseParameterValue[]> };

export interface NamedDatabaseParameterToken {
  end: number;
  name: string;
  start: number;
  type: "named";
}

export interface PositionalDatabaseParameterToken {
  end: number;
  position: number;
  start: number;
  type: "positional";
}

export type DatabaseParameterToken = NamedDatabaseParameterToken | PositionalDatabaseParameterToken;

export interface NamedScalarBinding {
  isArray: false;
  placeholder: string;
  value: DatabaseParameterValue;
  values: [DatabaseParameterValue];
}

export interface NamedArrayBinding {
  isArray: true;
  placeholders: string[];
  values: DatabaseParameterValue[];
}

export type NamedBindingEntry = NamedScalarBinding | NamedArrayBinding;

export type PreparedDatabaseBindings =
  | { hasBindings: false; params: undefined; sql: string; statementCount: number }
  | { hasBindings: true; params: DatabaseParameterValue[]; sql: string; statementCount: number };

export interface PrepareDatabaseBindingsOptions {
  placeholderStyle?: DatabasePlaceholderStyle;
}

export interface BulkValuesBindingOptions<RowType extends object = DatabaseRow> {
  paramPrefix?: string;
  valueForColumn?: (row: RowType, columnName: string, rowIndex: number, columnIndex: number) => DatabaseParameterInput;
}

export interface DatabaseDialectCapabilities {
  booleanStorage: boolean;
  caseInsensitiveComparison: boolean;
  conflictWrites: boolean;
  fullTextSearch: boolean;
  introspection: boolean;
  jsonAccess: boolean;
  physicalIdentity: boolean;
  returningRows: boolean;
  timestampIntervalMath: boolean;
}

export type DatabaseInsertTarget =
  | { tableName: string; table?: never }
  | { table: string; tableName?: never };

export type DatabaseInsertValues = readonly string[] | Readonly<Record<string, string>>;

export type DatabaseInsertOptions = DatabaseInsertTarget & {
  columns: readonly string[];
  returningColumns?: readonly string[];
  valueExpressions?: DatabaseInsertValues;
  values?: DatabaseInsertValues;
};

export type DatabaseInsertConflictNothingOptions = DatabaseInsertOptions & {
  conflictColumns: readonly string[];
};

export type DatabaseInsertConflictUpdateOptions = DatabaseInsertConflictNothingOptions & {
  updateColumns: readonly string[];
};

export type DatabaseInsertAnyConflictUpdateOptions = DatabaseInsertOptions & {
  updateColumns: readonly string[];
};

export interface DatabaseLikeOptions {
  escape?: boolean;
  escapeCharacter?: string;
}

export type DatabaseLikePatternMode =
  | "contains"
  | "exact"
  | "startsWith"
  | "startswith"
  | "starts_with"
  | "starts-with"
  | "endsWith"
  | "endswith"
  | "ends_with"
  | "ends-with";

export interface DatabaseLikePatternOptions {
  escapeCharacter?: string;
  match?: DatabaseLikePatternMode;
  mode?: DatabaseLikePatternMode;
}

export type DatabaseSortDirection = "ASC" | "DESC" | "asc" | "desc";
export type DatabaseBooleanInput = boolean | number | string | null | undefined;
export type DatabaseBooleanStorageValue = 0 | 1 | null;
export type DatabaseBooleanReadValue = boolean | null;
export type DatabaseBooleanBoundFields<RecordType, FieldName extends keyof RecordType> = {
  [Key in keyof RecordType]: Key extends FieldName ? DatabaseBooleanStorageValue : RecordType[Key];
};
export type DatabaseBooleanReadFields<RecordType, FieldName extends keyof RecordType> = {
  [Key in keyof RecordType]: Key extends FieldName ? DatabaseBooleanReadValue : RecordType[Key];
};

export interface DatabaseBooleanReadOptions {
  fallback?: DatabaseBooleanReadValue;
}

export interface DatabaseBooleanFieldsReadOptions<FieldName extends PropertyKey = string> {
  fallbacks?: Partial<Record<FieldName, DatabaseBooleanReadValue>>;
}

export type DatabaseFtsColumn = string | {
  indexed?: boolean;
  name: string;
  unindexed?: boolean;
};

export type DatabaseRowIdOptions = string | (
  { alias?: string } & (
    | { tableAlias?: string; table?: never }
    | { table?: string; tableAlias?: never }
  )
);

export interface DatabaseDialect {
  readonly provider: string;
  readonly contractVersion: string;
  readonly capabilities: Readonly<DatabaseDialectCapabilities>;
  readonly boolean: {
    bind(value: DatabaseBooleanInput): DatabaseBooleanStorageValue;
    bindFields<RecordType extends Record<string, unknown>, FieldName extends Extract<keyof RecordType, string>>(
      values: RecordType,
      fieldNames: readonly FieldName[],
    ): DatabaseBooleanBoundFields<RecordType, FieldName>;
    read(value: DatabaseBooleanInput): DatabaseBooleanReadValue;
    readField(row: DatabaseRow, fieldName: string, options?: DatabaseBooleanReadOptions): DatabaseBooleanReadValue;
    readFields<RecordType extends Record<string, unknown>, FieldName extends Extract<keyof RecordType, string>>(
      row: RecordType,
      fieldNames: readonly FieldName[],
      options?: DatabaseBooleanFieldsReadOptions<FieldName>,
    ): DatabaseBooleanReadFields<RecordType, FieldName>;
  };
  readonly comparison: {
    collateNoCase(expressionSql: string): string;
    containsNoCase(leftSql: string, rightSql: string, options?: DatabaseLikeOptions): string;
    equalsNoCase(leftSql: string, rightSql: string): string;
    escapeLikePattern(value: unknown, options?: Pick<DatabaseLikePatternOptions, "escapeCharacter">): string;
    likePattern(value: unknown, options?: DatabaseLikePatternOptions): string;
    likeNoCase(leftSql: string, rightSql: string, options?: DatabaseLikeOptions): string;
    orderByNoCase(expressionSql: string, direction?: DatabaseSortDirection): string;
  };
  readonly conflict: {
    buildInsertOnAnyConflictDoUpdate(options: DatabaseInsertAnyConflictUpdateOptions): string;
    buildInsertOnConflictDoNothing(options: DatabaseInsertConflictNothingOptions): string;
    buildInsertOnConflictDoUpdate(options: DatabaseInsertConflictUpdateOptions): string;
    buildInsertOrIgnore(options: DatabaseInsertOptions): string;
    excludedColumn(columnName: string): string;
    insertOrIgnoreInto(tableName: string): string;
    onAnyConflictDoUpdateSet(updateColumns: readonly string[]): string;
    onConflictDoNothing(conflictColumns: readonly string[]): string;
    onConflictDoUpdateSet(conflictColumns: readonly string[], updateColumns: readonly string[]): string;
  };
  readonly identity: {
    lastInsertRowId(): string;
    rowId(options?: DatabaseRowIdOptions): string;
  };
  readonly introspection: {
    busyTimeout(): string;
    compileOptions(): string;
    databaseList(): string;
    deferForeignKeys(): string;
    foreignKeyCheck(): string;
    foreignKeys(): string;
    integrityCheck(): string;
    journalMode(): string;
    scopedTableRows(tableName: string, scopeColumn: string): Readonly<{ count: string; delete: string }>;
    tableInfo(tableName: string): string;
    tableNames(): string;
  };
  readonly json: {
    readonly supported: false;
    value(): never;
  };
  readonly returning: {
    columns(columns: readonly string[]): string;
  };
  readonly search: {
    createVirtualTable(tableName: string, columns: readonly DatabaseFtsColumn[]): string;
    dropVirtualTable(tableName: string): string;
    match(tableName: string, queryExpressionSql: string): string;
    rank(tableName: string): string;
  };
  readonly time: {
    elapsedSecondsSince(timestampExpressionSql: string, referenceExpressionSql?: string): string;
    nonNegativeSecondsBetween(laterExpressionSql: string, earlierExpressionSql: string): string;
    secondsBetween(laterExpressionSql: string, earlierExpressionSql: string): string;
  };
}

export interface TransactionClient {
  readonly capabilities: Record<string, unknown>;
  readonly dialect: DatabaseDialect;
  query(sql: string, params?: DatabaseParams): Promise<DatabaseRow[]>;
  get(sql: string, params?: DatabaseParams): Promise<DatabaseRow | null>;
  run(sql: string, params?: DatabaseParams): Promise<unknown>;
}

export interface DatabaseAdapter extends TransactionClient {
  readonly provider: string;
  close(): Promise<void>;
  health(): Promise<DatabaseRow>;
  initializeRuntime?(): Promise<DatabaseRow>;
  getLastHealth?(): DatabaseRow | null;
  formatHealth?(health?: any): string;
  transaction<T>(work: (transaction: TransactionClient) => Promise<T> | T): Promise<T>;
}

// Compatibility names retained for checked consumers converted before the
// adapter and transaction-client distinction was made explicit.
export type DatabaseTransaction = TransactionClient;
export type DatabaseSeam = DatabaseAdapter;
