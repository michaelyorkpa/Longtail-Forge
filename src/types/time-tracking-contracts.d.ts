import type { ProjectRecord } from "./client-project-contracts.d.ts";
import type { ApiSession, WorkspaceRequestSession } from "./http-contracts.d.ts";

export type TimeTrackingSession = WorkspaceRequestSession;
export type BillableFlag = "yes" | "no";
export type TimerStatus = "running" | "paused";
export type BillingRoundingIncrement = "nearestHour" | "nearestHalfHour" | "nearestQuarterHour";

export interface ActiveTimerSourceLookup {
  sourceId: unknown;
  sourceModuleId: unknown;
  sourceType: unknown;
}

export interface ActiveTimerRecord extends Record<string, unknown> {
  active_timer_id: string;
  workspace_id: string;
  user_id: string;
  timer_slot: string;
  source_module_id: string | null;
  source_type: string;
  source_id: string | null;
  source_label: string;
  source_url: string;
  source_metadata_json?: unknown;
  sourceMetadata?: Record<string, unknown>;
  client_id: string;
  client_name: string;
  project_id: string;
  project_name: string;
  description: string;
  billable: BillableFlag;
  accumulated_elapsed_seconds: number;
  last_active_start_time: string | null;
  timer_status: TimerStatus;
  created_at?: string;
  updated_at?: string;
}

export interface ActiveTimerRow extends Record<string, unknown> {
  active_timer_id: unknown;
  workspace_id: unknown;
  user_id: unknown;
  timer_slot: unknown;
  source_module_id: unknown;
  source_type: unknown;
  source_id: unknown;
  source_label: unknown;
  source_url: unknown;
  source_metadata_json: unknown;
  client_id: unknown;
  client_name: unknown;
  project_id: unknown;
  project_name: unknown;
  description: unknown;
  billable: unknown;
  accumulated_elapsed_seconds: unknown;
  last_active_start_time: unknown;
  timer_status: unknown;
  created_at: unknown;
  updated_at: unknown;
}

export interface TimeEntryRecord extends Record<string, unknown> {
  entry_id: string;
  workspace_id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  project_id: string;
  project_name: string;
  task_id: string;
  description: string;
  start_time: string;
  end_time: string;
  duration_seconds: string;
  duration_hours: string;
  billable: "yes" | "no" | "";
  invoice_status: "unbilled" | "billed" | "paid";
  created_at: string;
  updated_at: string;
  tags?: unknown[];
}

export interface TimeEntryRow extends Record<string, unknown> {
  entry_id: unknown;
  workspace_id: unknown;
  user_id: unknown;
  client_id: unknown;
  client_name: unknown;
  project_id: unknown;
  project_name: unknown;
  task_id: unknown;
  description: unknown;
  start_time: string | number | null;
  end_time: string | number | null;
  duration_seconds: string | number | null;
  duration_hours: string | number | null;
  billable: unknown;
  invoice_status: unknown;
  created_at: unknown;
  updated_at: unknown;
}

export interface TimeEntryVisibility {
  all?: boolean;
  clientIds?: unknown[];
  editAllClientIds?: unknown[];
  editAllProjectIds?: unknown[];
  projectIds?: unknown[];
  userId?: unknown;
}

export interface DashboardEffortReadOptions {
  limit?: unknown;
  todayStart?: unknown;
  visibility?: TimeEntryVisibility | null;
  windowEnd?: unknown;
  windowStart?: unknown;
}

export type TimeEntryWriteParameters = Record<string, string | number | null> & {
  createdAt?: string;
};

export interface ProjectScopeUpdate {
  client_id?: unknown;
  client_name?: unknown;
  project_name?: unknown;
}

export interface BillingReportQuery extends Record<string, unknown> {
  endDate?: unknown;
  end_date?: unknown;
  includeDescendants?: unknown;
  include_descendants?: unknown;
  period?: unknown;
  projectIds?: unknown;
  project_ids?: unknown;
  scopeId?: unknown;
  scope_id?: unknown;
  startDate?: unknown;
  start_date?: unknown;
  tagIds?: unknown;
  tag_ids?: unknown;
  tags?: unknown;
  taskId?: unknown;
  task_id?: unknown;
  taskIds?: unknown;
  task_ids?: unknown;
}

export interface BillingPeriod {
  type: "calendarMonth" | "custom";
  startDay: number;
}

export interface BillingRounding {
  enabled: boolean;
  increment: BillingRoundingIncrement;
}

export interface BillingPeriodInput {
  type?: unknown;
  startDay?: unknown;
}

export interface BillingRoundingInput {
  enabled?: unknown;
  increment?: unknown;
  type?: unknown;
}

export interface BillingSettings extends Record<string, unknown> {
  workspaceName?: string;
  workspaceType?: string;
  defaultBillingRate?: unknown;
  billingPeriod?: BillingPeriodInput | null;
  billingRounding?: BillingRoundingInput | null;
}

export interface BillingProjectInput extends Partial<ProjectRecord> {
  id: string;
  name: string;
}

export interface BillingScopeInput extends Record<string, unknown> {
  id: string;
  name: string;
  status?: string;
  billable?: unknown;
  billing_rate?: unknown;
  billing_period?: BillingPeriodInput | null;
  billing_rounding?: BillingRoundingInput | null;
  parent_client_id?: unknown;
  depth?: unknown;
  childScopeIds?: string[];
  isWorkspaceScope?: boolean;
  projects?: BillingProjectInput[];
}

export interface BillingClientProjectData {
  clients: BillingScopeInput[];
  workspaceProjects: BillingProjectInput[];
}

export interface BillingProject {
  id: string;
  name: string;
  parentProjectId: string;
  status: "Active" | "Inactive";
  billable: BillableFlag;
  billingRate: number | null;
  billingPeriod: BillingPeriod | null;
  billingRounding: BillingRounding | null;
  effectiveBillingRate: number;
  effectiveBillingPeriod: BillingPeriod;
  effectiveBillingRounding: BillingRounding;
  childProjectIds: string[];
}

export interface BillingScope {
  id: string;
  name: string;
  status: "Active" | "Inactive";
  billable: BillableFlag;
  billingRate: number | null;
  billingPeriod: BillingPeriod | null;
  billingRounding: BillingRounding | null;
  isWorkspaceScope: boolean;
  parentScopeId: string;
  depth: number;
  childScopeIds: string[];
  projects: BillingProject[];
}

export interface BillingEntry {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  taskId: string;
  endTime: Date;
  durationSeconds: number;
  billable: BillableFlag;
  tags: unknown[];
}

export interface BillingTimeEntryInput extends Record<string, unknown> {
  client_id?: unknown;
  client_name?: unknown;
  project_id?: unknown;
  project_name?: unknown;
  task_id?: unknown;
  end_time?: string | number | null;
  duration_seconds?: unknown;
  billable?: unknown;
  tags?: unknown;
}

export interface BillingDateRange {
  start: Date;
  end: Date;
}

export interface BillingProjectRow {
  amount: number;
  billableSeconds: number;
  displaySeconds: number;
  project: BillingProject;
  rate: number;
  rawBillableSeconds: number;
  rawSeconds: number;
  childRows?: BillingProjectRow[];
  depth?: number;
}

export interface BillingScopeSummary {
  amount: number;
  billableSeconds: number;
  displaySeconds: number;
  rawSeconds: number;
  scope: BillingScope;
  projectSummaries: BillingProjectRow[];
}

export interface BillingTreeOptions {
  depth?: number;
  includeDescendants?: boolean;
  preserveEmpty?: boolean;
  query?: BillingReportQuery;
  range?: BillingDateRange;
  today?: Date;
  timezone?: string;
}

export interface BillingScopeOptions {
  includeInactive?: boolean;
  includeModuleContext?: boolean;
}

export interface PublicApiContext extends ApiSession {
  timezone?: string;
}

export interface PublicApiQuery {
  limit?: unknown;
  offset?: unknown;
}

export interface PublicApiPage<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
}

export interface ReportRunnerContext {
  filters?: BillingReportQuery;
  session: TimeTrackingSession;
}

export interface TimeTrackingModuleDefinition extends Record<string, unknown> {
  id: string;
  name?: string;
  displayName?: string;
  status?: string;
  historicalReadAccess?: boolean;
}

export interface TimeTrackingSettingsContext {
  workspace_id?: unknown;
  workspaceId?: unknown;
}

export type TimeTrackingSettingsReadContext = string | TimeTrackingSettingsContext;
