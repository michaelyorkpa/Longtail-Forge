import type { WorkspaceRequestSession } from "./http-contracts.d.ts";
import type { PrivateFeedSubscriptionDescriptor } from "./private-feed-contracts.d.ts";
import type { DateInput, NullableText, TaskRecord } from "./task-recurrence-contracts.d.ts";
import type { DatabaseBooleanInput } from "./database-contracts.d.ts";

export type TaskWorkflowSession = WorkspaceRequestSession & { workspace_id: string };
export type TaskReminderTargetType = "workspace" | "client" | "project" | "task";
export type TaskReminderDueKind = "date_only" | "date_time";

export interface TaskChecklistItem extends Record<string, unknown> {
  task_checklist_item_id: string;
  workspace_id: string;
  task_id: string;
  label: string;
  is_checked: boolean;
  completed_at: string;
  completed_by_user_id: string;
  sort_order: number;
  deleted_at: string;
  deleted_by_user_id: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface TaskChecklistRow extends Record<string, unknown> {
  task_checklist_item_id: string;
  workspace_id: string;
  task_id: string;
  label: NullableText;
  is_checked: DatabaseBooleanInput;
  completed_at: NullableText;
  completed_by_user_id: NullableText;
  sort_order: string | number | null;
  deleted_at: NullableText;
  deleted_by_user_id: NullableText;
  created_by_user_id: NullableText;
  updated_by_user_id: NullableText;
  created_at: NullableText;
  updated_at: NullableText;
}

export interface TaskChecklistWrite {
  task_checklist_item_id?: NullableText;
  label?: NullableText;
  is_checked?: boolean;
  completed_at?: NullableText;
  completed_by_user_id?: NullableText;
  sort_order?: string | number | null;
  created_by_user_id?: NullableText;
  updated_by_user_id?: NullableText;
}

export interface TaskChecklistProgress {
  completed_count: number;
  next_incomplete_item_label: string;
  total_count: number;
}

export interface TaskRelationship extends Record<string, unknown> {
  task_relationship_id: string;
  workspace_id: string;
  parent_task_id: string;
  parent_title: string;
  parent_status: string;
  parent_client_id: string;
  parent_project_id: string;
  child_task_id: string;
  child_title: string;
  child_status: string;
  child_client_id: string;
  child_project_id: string;
  is_blocking: boolean;
  created_by_user_id: string;
  updated_by_user_id: string;
  removed_at: string;
  removed_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRelationshipRow extends Record<string, unknown> {
  task_relationship_id: string;
  workspace_id: string;
  parent_task_id: string;
  parent_title: NullableText;
  parent_status: NullableText;
  parent_client_id: NullableText;
  parent_project_id: NullableText;
  child_task_id: string;
  child_title: NullableText;
  child_status: NullableText;
  child_client_id: NullableText;
  child_project_id: NullableText;
  is_blocking: DatabaseBooleanInput;
  created_by_user_id: NullableText;
  updated_by_user_id: NullableText;
  removed_at: NullableText;
  removed_by_user_id: NullableText;
  created_at: string;
  updated_at: string;
}

export interface TaskRelationshipWrite {
  task_relationship_id?: NullableText;
  parent_task_id?: NullableText;
  child_task_id?: NullableText;
  is_blocking?: boolean;
  created_by_user_id?: NullableText;
  updated_by_user_id?: NullableText;
}

export interface TaskRelationshipSummary {
  child_count: number;
  blocking_child_count: number;
  incomplete_blocking_child_count: number;
  parent_count: number;
  blocking_parent_count: number;
}

export interface TaskReminderTarget {
  targetType: TaskReminderTargetType;
  targetId: string;
}

export interface TaskReminderTargetInput {
  targetType: string;
  targetId: unknown;
}

export interface TaskReminderOffset {
  reminder_offset_id: string;
  workspace_id: string;
  target_type: TaskReminderTargetType;
  target_id: string;
  due_kind: TaskReminderDueKind;
  offset_minutes: number;
  sort_order: number;
}

export interface TaskReminderOffsetWrite {
  due_kind?: unknown;
  offset_minutes?: unknown;
}

export interface TaskReminderPolicy {
  dateTime: number[];
  dateOnly: number[];
}

export interface TaskReminderPolicyInput {
  dateTime?: unknown;
  date_time?: unknown;
  dateOnly?: unknown;
  date_only?: unknown;
}

export interface TaskReminderPayload extends TaskReminderPolicyInput {
  overrideEnabled?: unknown;
  override_enabled?: unknown;
  policy?: TaskReminderPolicyInput;
  reminderPolicy?: TaskReminderPolicyInput;
}

export interface TaskReminderEffectivePolicy {
  source: string;
  targetId: string;
  offsets: TaskReminderPolicy;
}

export interface TaskReminderPolicyChainEntry extends TaskReminderTarget {
  policy: TaskReminderPolicy;
  hasOffsets: boolean;
}

export interface TaskReminderOccurrence {
  task_id: string;
  workspace_id: string;
  due_kind: TaskReminderDueKind;
  due_at_utc: string;
  reminder_at_utc: string;
  offset_minutes: number;
  source: string;
  status: "pending";
}

export interface TaskReminderDetails {
  computedOccurrences: TaskReminderOccurrence[];
  effectivePolicy: TaskReminderEffectivePolicy;
  inheritedFrom: string;
  overrideEnabled: boolean;
  taskPolicy: TaskReminderPolicy;
}

export interface TaskReminderRecord extends TaskRecord {
  due_at_utc?: NullableText;
  due_time?: NullableText;
  due_timezone?: NullableText;
  reminder_override_enabled?: boolean;
}

export interface TaskTimerRecord extends Record<string, unknown> {
  active_timer_id: string;
  active_task_timer_id: string;
  workspace_id: string;
  user_id: string;
  task_id: string;
  client_id: string;
  client_name: string;
  project_id: string;
  project_name: string;
  description: string;
  billable: "yes" | "no";
  accumulated_elapsed_seconds: number;
  last_active_start_time: DateInput;
  timer_status: "running" | "paused";
  source_module_id: string;
  source_type: string;
  source_id: string;
  source_label: string;
  source_url: string;
  source_metadata_json: string;
  sourceMetadata: Record<string, unknown>;
  resumeContext: TaskTimerResumeContext;
  resume_context: TaskTimerResumeContext;
  created_at: string;
  updated_at: string;
}

export interface TaskTimerResumeContext {
  accumulatedElapsedSeconds: number;
  clientId: string;
  clientName: string;
  lastActiveStartTime: DateInput;
  projectId: string;
  projectName: string;
  sourceId: string;
  sourceLabel: string;
  sourceModuleId: string;
  sourceType: string;
  sourceUrl: string;
  timerStatus: "running" | "paused";
}

export interface TaskTimerTransition {
  movedTaskToInProgress: boolean;
  movedTaskFromOpen: boolean;
  movedTaskFromBlocked: boolean;
  previousBlockedReason: string;
  previousStatus: string;
}

export interface TaskTimerTransitionMetadata {
  taskTimerStatusTransition?: Partial<TaskTimerTransition>;
}

export interface TaskTimerSourceTask extends TaskRecord {
  task_id: string;
  workspace_id: string;
  title: string;
  billable?: TaskRecord["billable"];
}

export interface TaskTimerSavePayload {
  accumulated_elapsed_seconds?: string | number | null;
  active_timer_id?: string | null;
  active_task_timer_id?: string | null;
  last_active_start_time?: DateInput;
  timer_status?: string | null;
}

export interface TaskTimerLinkPayload {
  timer_slot?: unknown;
  timerSlot?: unknown;
}

export interface TaskSettingsContext {
  workspace_id?: NullableText;
  workspaceId?: NullableText;
}

export interface TaskStartedWorkEvidence {
  hasActiveTimer: boolean;
  hasCheckedChecklistItem: boolean;
  hasPersistedTime: boolean;
  hasStartedWork: boolean;
}

export interface TaskPrivateFeedRenderContext {
  providerId?: string;
  session: {
    active_workspace_id?: unknown;
    home_workspace_id?: unknown;
    timezone: string;
    user_id: string;
    username: string;
    workspace_id: unknown;
  };
  subscription: PrivateFeedSubscriptionDescriptor;
}

export interface TaskTimerAuditInput {
  session: TaskWorkflowSession;
  action: string;
  previousTask: TaskTimerSourceTask;
  nextTask: TaskTimerSourceTask | null;
  transition: { from: string; to: string };
}

export interface TaskTimerSaveResult extends Record<string, unknown> {
  task: TaskTimerSourceTask;
  timer: TaskTimerRecord;
}

export interface TaskTimerLinkResult extends TaskTimerSaveResult {
  linked: true;
  manual_timers: Array<Record<string, unknown> & { timer_slot: string }>;
  previous_timer_slot: string;
}

export interface TaskTimerRemoveResult extends Record<string, unknown> {
  task: TaskTimerSourceTask;
  task_id: string;
  removed: true;
}

export interface TaskTimerFinalizeResult extends Record<string, unknown> {
  task: TaskTimerSourceTask;
  task_timer_removed: true;
  task_id: string;
  entry_id: string;
  duration_seconds: number;
}

export interface TaskTimersService {
  finalize(taskId: string, payload: unknown, session: TaskWorkflowSession): Promise<TaskTimerFinalizeResult>;
  hasActiveTaskTimers(workspaceId: string, taskId: string): Promise<boolean>;
  linkManualTimer(taskId: string, payload: TaskTimerLinkPayload, session: TaskWorkflowSession): Promise<TaskTimerLinkResult>;
  list(session: TaskWorkflowSession): Promise<{ timers: TaskTimerRecord[] }>;
  pauseRunningForBlockedTask(task: TaskTimerSourceTask, session: TaskWorkflowSession): Promise<unknown>;
  remove(taskId: string, session: TaskWorkflowSession): Promise<TaskTimerRemoveResult>;
  save(taskId: string, payload: TaskTimerSavePayload, session: TaskWorkflowSession): Promise<TaskTimerSaveResult>;
}
