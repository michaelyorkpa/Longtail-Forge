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
  displayName: string;
  description: string;
  terminology?: TerminologyMap;
  category: string;
  version: string;
  enabledByDefault: boolean;
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
  protectedContentConsumers?: readonly ProtectedContentConsumerContribution[];
  notificationEvents?: readonly NotificationEventContribution[];
  notificationTemplates?: readonly NotificationTemplateContribution[];
  notificationFollowTargets?: readonly NotificationFollowTargetContribution[];
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

export interface NotificationEventContribution {
  id: string;
  moduleId: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultPriority: string;
  recipientResolver?: string;
  recipientMode?: string;
  suppressActorSubscriptions?: boolean;
  terminology?: TerminologyMap;
}

export interface NotificationTemplateContribution {
  id: string;
  moduleId: string;
  event: string;
  title: string;
  body: string;
  url?: string;
  recordLinkPattern?: string;
  terminology?: TerminologyMap;
}

export interface NotificationFollowTargetContribution {
  targetType: string;
  moduleId: string;
  label: string;
  description: string;
  requiredReadPermission: string;
  eventTypes?: string[];
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

export interface ViewLabelDescriptor {
  label?: string;
  labelKey?: string;
  title?: string;
  titleKey?: string;
  description?: string;
  descriptionKey?: string;
}

export interface ViewVisibleWhenDescriptor {
  field: string;
  equals?: unknown;
  in?: unknown[];
  truthy?: boolean;
  falsy?: boolean;
}

export interface ViewActionDescriptor extends ViewLabelDescriptor {
  publicDemoCapability?: string;
  id: string;
  role?: "primary" | "secondary" | "destructive" | "utility";
  icon?: string;
  iconOnly?: boolean;
  title?: string;
  route?: string;
  method?: string;
  confirm?: string | Record<string, unknown>;
  requiredPermissions?: string[];
  behavior?: string;
  visibleWhen?: ViewVisibleWhenDescriptor;
}

export interface ViewPageHeaderDescriptor extends ViewLabelDescriptor {
  primaryAction?: ViewActionDescriptor;
}

export interface ViewFilterDescriptor {
  id?: string;
  field: string;
  type: string;
  label?: string;
  labelKey?: string;
  options?: unknown[];
  optionsSource?: string;
  default?: unknown;
  queryKey?: string;
}

export interface ViewRegionDescriptor extends ViewLabelDescriptor {
  id: string;
  behavior: string;
  placement?: string;
  className?: string;
  ariaLabel?: string;
}

export interface ViewSidebarPanelFooterDescriptor extends ViewLabelDescriptor {
  id?: string;
  behavior?: string;
  className?: string;
  ariaLabel?: string;
}

export interface ViewSidebarPanelDescriptor extends ViewLabelDescriptor {
  id: string;
  type: "filters" | "navigation" | "index";
  behavior?: string;
  collapsible?: boolean;
  open?: boolean;
  emptyState?: Record<string, unknown>;
  className?: string;
  ariaLabel?: string;
  footer?: ViewSidebarPanelFooterDescriptor;
}

export interface ViewIndexPanelDescriptor extends ViewLabelDescriptor {
  items?: string;
  itemTitleField?: string;
  itemSubtitleField?: string;
  itemMetaFields?: string[];
  itemDepthField?: string;
  itemParentField?: string;
  itemPathField?: string;
  emptyState?: Record<string, unknown>;
  initialSelection?: "first" | "none";
  collapseOnSelect?: boolean;
}

export interface ViewTableHierarchyDescriptor {
  depthField?: string;
  parentField?: string;
  pathField?: string;
}

export interface ViewTableSelectionDescriptor {
  enabled?: boolean;
  label?: string;
  labelKey?: string;
  headerLabel?: string;
  recordType?: string;
  labelField?: string;
}

export interface ViewTableColumnDescriptor {
  id?: string;
  field: string;
  label?: string;
  labelKey?: string;
  formatter?: "text" | "hierarchy-label" | "chip-list";
  width?: string;
  widthHint?: string;
  align?: string;
  depthField?: string;
  chipsField?: string;
  chipLabelField?: string;
}

export interface ViewTableSecondaryRowDescriptor extends ViewLabelDescriptor {
  id: string;
  field?: string;
  formatter?: "text" | "hierarchy-label" | "chip-list";
  chipsField?: string;
  chipLabelField?: string;
  startColumn?: string;
  endBeforeColumn?: string;
  hideWhenEmpty?: boolean;
  className?: string;
}

export interface ViewTableDescriptor {
  columns?: ViewTableColumnDescriptor[];
  secondaryRows?: ViewTableSecondaryRowDescriptor[];
  rowActions?: ViewActionDescriptor[];
  rowActionsHeaderLabel?: string;
  emptyState?: Record<string, unknown>;
  overflow?: boolean;
  hierarchy?: ViewTableHierarchyDescriptor;
  selection?: ViewTableSelectionDescriptor;
}

export type ViewFieldType =
  | "text"
  | "number"
  | "select"
  | "multi-select"
  | "boolean"
  | "checkbox"
  | "toggle"
  | "switch"
  | "radio"
  | "textarea"
  | "date"
  | "time"
  | "hidden"
  | "search"
  | "url";

export interface ViewFieldDescriptor {
  id?: string;
  field: string;
  type: ViewFieldType;
  label?: string;
  labelKey?: string;
  required?: boolean;
  options?: unknown[];
  optionsSource?: string;
  default?: unknown;
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  inputmode?: string;
  rows?: number | string;
  autocomplete?: string;
  placement?: string;
  behavior?: string;
  hidden?: boolean;
  width?: string;
}

export interface ViewLinkedRecordsDescriptor {
  title?: string;
  label?: string;
  recordsField?: string;
  targetTypeField?: string;
  targetLabelField?: string;
  targetUrlField?: string;
  targetIdField?: string;
  emptyState?: Record<string, unknown>;
  fields?: ViewFieldDescriptor[];
  actions?: ViewActionDescriptor[];
}

export interface ViewItemFormDescriptor {
  title?: string;
  label?: string;
  fields?: ViewFieldDescriptor[];
  actions?: ViewActionDescriptor[];
  emptyState?: Record<string, unknown>;
  editable?: boolean;
}

export interface ViewChipDescriptor {
  field: string;
  label?: string;
  labelKey?: string;
}

export interface ViewItemRowColumnDescriptor {
  id: string;
  field?: string;
  label?: string;
  labelKey?: string;
  type?: string;
  formatter?: string;
}

export interface ViewItemRowsDescriptor {
  itemsField?: string;
  columns?: ViewItemRowColumnDescriptor[];
  actions?: ViewActionDescriptor[];
  emptyState?: Record<string, unknown>;
  itemTitleField?: string;
  itemSubtitleField?: string;
  chips?: ViewChipDescriptor[];
  metaFields?: string[];
  rowActions?: ViewActionDescriptor[];
  actionsLabel?: string;
}

export interface ViewSummaryPanelItemDescriptor {
  label?: string;
  field?: string;
  value?: unknown;
}

export interface ViewSummaryPanelDescriptor extends ViewLabelDescriptor {
  messageField?: string;
  items?: ViewSummaryPanelItemDescriptor[];
}

export interface ViewDetailDescriptor {
  header?: Record<string, unknown>;
  badgeRow?: Record<string, unknown>;
  metadataRow?: Record<string, unknown>;
  actionStrip?: Record<string, unknown> & { actions?: ViewActionDescriptor[] };
  summaryPanels?: ViewSummaryPanelDescriptor[];
  linkedRecords?: ViewLinkedRecordsDescriptor;
  itemForm?: ViewItemFormDescriptor;
  itemRows?: ViewItemRowsDescriptor;
  emptyState?: Record<string, unknown>;
  regions?: ViewRegionDescriptor[];
}

export interface ViewModalDescriptor {
  id: string;
  label?: string;
  labelKey?: string;
  title?: string;
  titleKey?: string;
  size?: "wide";
  fields?: ViewFieldDescriptor[];
  footerActions?: ViewActionDescriptor[];
  actions?: ViewActionDescriptor[];
}

export interface ViewSurfaceDataSource {
  route: string;
  method?: string;
  recordsKey?: string;
  fieldBindings: Record<string, string>;
}

export interface ViewSurfaceDescriptor {
  id: string;
  moduleId: string;
  viewId: string;
  layout: "single-column" | "stacked" | "sidebar-detail" | "slide-out-sidebar" | "table-page";
  filterPlacement?: "inline" | "slide-out-sidebar";
  pageHeader?: ViewPageHeaderDescriptor;
  sidebarLabel?: string;
  sidebarPanels?: ViewSidebarPanelDescriptor[];
  filters?: ViewFilterDescriptor[];
  indexPanel?: ViewIndexPanelDescriptor;
  table?: ViewTableDescriptor;
  detail?: ViewDetailDescriptor;
  modals?: ViewModalDescriptor[];
  dataSource?: ViewSurfaceDataSource;
  actions?: ViewActionDescriptor[];
  regions?: ViewRegionDescriptor[];
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
  counts?: string[];
  links?: string[];
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
  actions?: { id: string; label: string; route?: string; publicDemoCapability?: string }[];
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

export interface ResumeStateProducerResult extends ResumeStatePayload {
  action?: string;
  title?: string;
}

export interface ResumeStateReadCheck {
  archived?: boolean;
  canRead?: boolean;
  completed?: boolean;
  deleted?: boolean;
  finalized?: boolean;
  readable?: boolean;
  source_url?: boolean;
  status?: string;
  title?: boolean;
  [key: string]: unknown;
}

export interface ResumeStateReadResolverContext {
  moduleId: string;
  recordId: string;
  recordType: string;
  row: DatabaseRow;
  session: Record<string, any>;
  userId: string;
  workspaceId: string;
}

export interface ResumeStateBatchReadResolverContext {
  recordIds: string[];
  rows: DatabaseRow[];
  session: Record<string, any>;
  workspaceId: string;
}

export type ResumeStateReadResolver = (
  context: ResumeStateReadResolverContext,
) => ResumeStateReadCheck | boolean | Promise<ResumeStateReadCheck | boolean>;

export type ResumeStateBatchReadResolver = (
  context: ResumeStateBatchReadResolverContext,
) => Map<string, ResumeStateReadCheck> | Promise<Map<string, ResumeStateReadCheck>>;

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
  workspaceId: string;
  moduleId?: string;
  recordType?: string;
  recordId?: string;
  declaration?: SearchableTypeContribution;
  rebuild?: boolean;
  record?: unknown;
  searchService?: Record<string, unknown>;
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
// Internal event summaries seam
// ---------------------------------------------------------------------------

export interface InternalEvent {
  name: string;
  event?: string;
  workspace_id?: string;
  workspaceId?: string;
  actor_user_id?: string;
  actorUserId?: string;
  actor_user_name?: string;
  actorUserName?: string;
  module_id?: string;
  moduleId?: string;
  record_type?: string;
  recordType?: string;
  record_id?: string;
  recordId?: string;
  record_label?: string;
  recordLabel?: string;
  previous_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  source?: string;
  metadata?: Record<string, any>;
  session?: Record<string, any> | null;
  emitted_at?: string;
}

export interface EventSummaryResolverContext {
  event: InternalEvent;
}

export type EventSummaryText = string | ((context: EventSummaryResolverContext) => unknown);
export type EventSummaryRecipientHints = string[] | ((context: EventSummaryResolverContext) => unknown);

export interface EventSummarySection {
  label?: EventSummaryText;
  summary?: EventSummaryText;
  title?: EventSummaryText;
  body?: EventSummaryText;
  url?: EventSummaryText;
  recipientHints?: EventSummaryRecipientHints;
}

export interface EventSummaryDeclaration {
  event: string;
  moduleId?: string;
  activity?: EventSummarySection;
  notification?: EventSummarySection;
}

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

export interface ApiErrorDetails {
  code: string;
  fields?: unknown[];
  message: string;
  requestId: string;
  [key: string]: unknown;
}

export interface ApiErrorEnvelope {
  apiVersion?: string;
  error?: ApiErrorDetails | string;
  message?: string;
  [key: string]: unknown;
}

export interface AppShellBootstrapUser {
  preferredCalendarView: string;
  themeAutoSource: string;
  themeMode: string;
  timezone: string;
  user_id: string;
  username: string;
}

export interface AppShellBootstrap {
  activeWorkspaceId: string;
  app: Record<string, unknown>;
  enabledModules: string[];
  moduleNavigation: unknown[];
  moduleSettingsNavigation: unknown[];
  navigation: unknown[];
  notificationSummary: Record<string, unknown>;
  permissionHints: Record<string, unknown>;
  quickActions: unknown[];
  searchTargets: unknown[];
  supportView: Record<string, unknown> | null;
  themeAutoSource: string;
  themeMode: string;
  timezone: string;
  user: AppShellBootstrapUser;
  viewSurfaces: unknown[];
  workspaceContext: Record<string, unknown>;
  workspaces: unknown[];
}

export interface PublicApiErrorEnvelope extends ApiErrorEnvelope {
  apiVersion: "v1";
  error: ApiErrorDetails;
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
  jobId?: string;
  job_id?: string;
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
  dedupe_key?: string | null;
  payload_json?: string;
  priority?: number;
  attempt_count?: number;
  max_attempts?: number;
  available_at?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  dead_at?: string | null;
  [key: string]: unknown;
}

export interface JobExecutionRecord {
  attemptCount: number;
  dedupeKey: string | null;
  id: string;
  jobId: string;
  jobType: string;
  maxAttempts: number;
  payload: Record<string, any>;
  priority: number;
  type: string;
  workspaceId: string;
}

export interface JobHandlerContext {
  job: JobExecutionRecord;
  payload: Record<string, any>;
}

export type JobHandler = (context: JobHandlerContext) => Promise<unknown> | unknown;

export interface JobHandlerOptions {
  publicDemoCapability?: string;
  replace?: boolean;
}

export type JobWorkerMode = "inline" | "separate" | "disabled";

export interface JobWorkerLogger {
  warn?: (...values: any[]) => void;
}

export interface JobWorkerOptions {
  mode?: unknown;
  workerId?: unknown;
  pollIntervalMs?: unknown;
  claimLimit?: unknown;
  lockTtlSeconds?: unknown;
  logger?: JobWorkerLogger;
}

export interface JobRunSummary {
  claimed: number;
  completed: number;
  dead: number;
  failed: number;
  skipped: boolean;
}

export interface JobWorkerStatus {
  mode: JobWorkerMode;
  workerId: string;
  state: "disabled" | "stopped" | "idle" | "running";
  running: boolean;
  timerActive: boolean;
  pollIntervalMs: number;
  startedAt: string | null;
  stoppedAt: string | null;
  lastPollAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastClaimedCount: number;
  lockTtlSeconds: number;
  claimedCount: number;
  completedCount: number;
  failedCount: number;
  deadCount: number;
  registeredJobTypes?: string[];
}

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
