import type {
  DatabaseNamedParameterInput,
  DatabaseBooleanInput,
  DatabaseRow,
  TransactionClient,
} from "./database-contracts.js";
import type { WorkspaceRequestSession } from "./http-contracts.js";
import type { TaskReminderPolicy, TaskReminderPolicyInput, TaskReminderTargetType } from "./task-workflow-contracts.js";

export interface BillingContact {
  name: string;
  email: string;
  alternate_name: string;
  alternate_email: string;
  phone_number: string;
  alternate_phone_number: string;
  street_address_1: string;
  street_address_2: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface BillingPeriod {
  type: string;
  startDay: number;
}

export interface BillingRounding {
  enabled: boolean;
  increment: string;
}

export interface ProjectTaskDefaults {
  priority: string;
  status: string;
  sortOrder: string[];
  defaultAssigneeMode: string;
}

export interface TagSummaryRecord {
  id?: string;
  tag_id?: string;
  name?: string;
  slug?: string;
}

export interface AttachedReminderPolicy {
  inherited: boolean;
  offsets: TaskReminderPolicy;
  source: TaskReminderTargetType;
}

export interface ClientRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  parent_client_id: string;
  name: string;
  status: string;
  billable: string;
  billing_rate: string | null;
  billing_period: BillingPeriod | null;
  billing_rounding: BillingRounding | null;
  billing_contact: BillingContact;
  created_at?: string;
  updated_at?: string;
  childScopeIds?: string[];
  projects?: ProjectRecord[];
  tags?: TagSummaryRecord[];
  taskReminderPolicy?: AttachedReminderPolicy;
  can_create_child?: boolean;
  can_create_project?: boolean;
  can_manage?: boolean;
  can_manage_projects?: boolean;
  depth?: number;
  display_label?: string;
  display_path?: string[];
  sort_key?: string;
  billing_display?: string;
  tag_summary?: string;
  children?: ClientRecord[];
}

export interface ClientAggregateRecord extends ClientRecord {
  projects: ProjectRecord[];
}

export interface ClientWriteRecord extends Omit<Partial<ClientRecord>, "billing_contact"> {
  billing_contact?: Partial<BillingContact>;
  billing_period?: BillingPeriod | null;
  billing_rounding?: BillingRounding | null;
  id: string;
  name: string;
}

export interface ProjectWriteRecord extends Omit<Partial<ProjectRecord>, "taskDefaults"> {
  billing_period?: BillingPeriod | null;
  billing_rounding?: BillingRounding | null;
  client_id?: string;
  id: string;
  name: string;
  taskDefaults?: Partial<ProjectTaskDefaults>;
}

export interface ProjectRecord extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  client_id: string;
  client_name?: string;
  parent_project_id: string;
  parent_project_name?: string;
  name: string;
  status: string;
  billable: string;
  billing_rate: string | null;
  billing_period: BillingPeriod | null;
  billing_rounding: BillingRounding | null;
  taskDefaults: ProjectTaskDefaults;
  created_at?: string;
  updated_at?: string;
  tags?: TagSummaryRecord[];
  taskReminderPolicy?: AttachedReminderPolicy;
  can_manage?: boolean;
  depth?: number;
  display_label?: string;
  display_path?: string[];
  billing_display?: string;
  tag_summary?: string;
  children?: ProjectRecord[];
}

export interface ClientRow extends DatabaseRow {
  id: string;
  workspace_id: string | null;
  parent_client_id: string | null;
  name: string;
  status: string;
  billable: unknown;
  billing_rate: unknown;
  billing_period_type: unknown;
  billing_period_start_day: unknown;
  billing_rounding_enabled: DatabaseBooleanInput;
  billing_rounding_increment: unknown;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_alternate_name: string | null;
  billing_contact_alternate_email: string | null;
  billing_contact_phone_number: string | null;
  billing_contact_alternate_phone_number: string | null;
  billing_contact_street_address_1: string | null;
  billing_contact_street_address_2: string | null;
  billing_contact_city: string | null;
  billing_contact_state: string | null;
  billing_contact_zip_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow extends DatabaseRow {
  id: string;
  workspace_id: string | null;
  client_id: string | null;
  client_name: string | null;
  parent_project_id: string | null;
  parent_project_name: string | null;
  name: string;
  status: string;
  billable: unknown;
  billing_rate: unknown;
  billing_period_type: unknown;
  billing_period_start_day: unknown;
  billing_rounding_enabled: DatabaseBooleanInput;
  billing_rounding_increment: unknown;
  task_default_priority: unknown;
  task_default_status: unknown;
  task_default_sort_order_json: unknown;
  task_default_assignee_mode: unknown;
  created_at: string;
  updated_at: string;
}

export interface RepositoryReadOptions {
  activeOnly?: boolean;
}

export interface ClientWriteContext {
  client: ClientWriteRecord;
  createdAt?: string;
  updatedAt: string;
  workspaceId: unknown;
}

export interface ProjectWriteContext {
  clientId: unknown;
  createdAt?: string;
  project: ProjectWriteRecord;
  updatedAt: string;
  workspaceId: unknown;
}

export interface ClientWriteParameters extends Record<string, DatabaseNamedParameterInput> {
  createdAt?: string;
}

export interface ProjectWriteParameters extends Record<string, DatabaseNamedParameterInput> {
  createdAt?: string;
}

export interface ProjectNameScopeParameters extends Record<string, DatabaseNamedParameterInput> {
  projectName: string;
  workspaceId: string;
  clientId?: string;
  excludeProjectId?: string;
}

export interface ClientProjectsRepository {
  archive(workspaceId: unknown, clientId: unknown): Promise<void>;
  create(workspaceId: unknown, client: ClientWriteRecord): Promise<void>;
  readAll(workspaceId: unknown, options?: RepositoryReadOptions): Promise<ClientRecord[]>;
  readById(workspaceId: unknown, clientId: unknown): Promise<ClientRecord | null>;
  readByIds(workspaceId: unknown, clientIds?: unknown[]): Promise<ClientRecord[]>;
  replaceAll(workspaceId: unknown, clients: ClientAggregateRecord[]): Promise<void>;
  update(workspaceId: unknown, client: ClientWriteRecord): Promise<void>;
}

export interface ProjectsRepository {
  archive(workspaceId: unknown, projectId: unknown): Promise<void>;
  create(workspaceId: unknown, clientId: unknown, project: ProjectWriteRecord): Promise<void>;
  insertProject(databaseClient: TransactionClient, workspaceId: unknown, clientId: unknown, project: ProjectWriteRecord, now: string): Promise<void>;
  readAll(workspaceId: unknown, options?: RepositoryReadOptions): Promise<ProjectRecord[]>;
  readByClientId(workspaceId: unknown, clientId: unknown): Promise<ProjectRecord[]>;
  readById(workspaceId: unknown, projectId: unknown): Promise<ProjectRecord | null>;
  readByIds(workspaceId: unknown, projectIds?: unknown[]): Promise<ProjectRecord[]>;
  readByNameInScope(workspaceId: unknown, clientId: unknown, projectName: unknown, excludeProjectId?: unknown): Promise<ProjectRecord | null>;
  update(workspaceId: unknown, project: ProjectWriteRecord): Promise<void>;
}

export interface ClientProjectPayload extends Record<string, unknown> {
  id?: unknown;
  action?: unknown;
  client_id?: unknown;
  clientId?: unknown;
  parent_client_id?: unknown;
  parentClientId?: unknown;
  parent_project_id?: unknown;
  parentProjectId?: unknown;
  tagIds?: unknown;
  tag_ids?: unknown;
  tags?: unknown;
  taskReminderPolicy?: TaskReminderPolicyInput & { inherited?: boolean };
  task_reminder_policy?: TaskReminderPolicyInput & { inherited?: boolean };
  confirm_downstream_update?: boolean;
}

export interface ClientProjectQuery extends ClientProjectPayload {
  client?: unknown;
  include_depth?: unknown;
  includeDepth?: unknown;
  scope?: unknown;
  shape?: unknown;
  status?: unknown;
}

export interface ClientProjectReadOptions {
  includeInactive?: boolean;
  includeReminderPolicies?: boolean;
}

export interface ClientProjectData {
  clients: ClientAggregateRecord[];
  workspaceProjects: ProjectRecord[];
}

export interface ShapeOptions {
  includeDepth?: boolean;
  scope?: "all" | "top_level";
  shape?: "flat" | "tree";
}

export interface ShapeContext {
  depth: number;
  includeDepth: boolean;
  path: string[];
  sortOrder?: number;
}

export interface ProjectClientFilter {
  type: "all" | "client" | "workspace";
  value: string;
}

export interface HierarchyRecord extends Record<string, unknown> {
  id: string;
  name: string;
}

export interface HierarchySortOptions<RecordType extends HierarchyRecord> {
  idField: keyof RecordType;
  labelField: keyof RecordType;
  parentField: keyof RecordType;
}

export interface NestedTreeOptions<RecordType extends HierarchyRecord> {
  childrenField: keyof RecordType;
  idField: keyof RecordType;
  parentField: keyof RecordType;
}

export type PermissionEvaluator = (resource: {
  workspace_id: string;
  client_id?: string;
  project_id?: string;
}) => boolean;

export interface ProjectMaintenanceInput {
  payload?: ClientProjectPayload;
  previousProject?: ProjectRecord;
  project: ProjectRecord;
  targetClient?: ClientRecord | null;
  updatePlan: ProjectUpdatePlan;
  workspaceId: string;
}

export interface ClientProjectAuditEvent extends Record<string, unknown> {
  action: string;
  changeType: string;
  metadata?: Record<string, unknown>;
  recordId: string;
  recordLabel: string;
  recordType: "client" | "project";
  recordUrl: string;
}

export interface ProjectMoveSummary {
  fromClientId: string;
  toClientId: string;
  isMove: boolean;
  isWorkspaceProject: boolean;
}

export interface ProjectParentMoveSummary {
  fromParentProjectId: string;
  toParentProjectId: string;
  isMove: boolean;
}

export interface ProjectUpdatePlan {
  move: ProjectMoveSummary;
  parentMove: ProjectParentMoveSummary;
  previousProject: ProjectRecord;
  targetClient: ClientRecord | null;
  targetParentProject: ProjectRecord | null;
  downstreamRecords: {
    historicalTimeEntries: string;
    projectHierarchy: string;
    activeTimers: string;
  };
}

export interface ProjectUpdatePlanInput {
  workspaceId: string;
  projectId: string;
  payload?: ClientProjectPayload;
  usesProjectRoundingOnly?: boolean;
}

export interface ClientProjectSettingsContext {
  workspace_id?: unknown;
  workspaceId?: unknown;
}

export type ClientProjectSettingsReadContext = string | ClientProjectSettingsContext;
export type ClientProjectSession = WorkspaceRequestSession;
