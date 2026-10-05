import type { DatabaseBooleanInput, DatabaseParams, DatabaseRow } from "./database-contracts.d.ts";
import type { TaskCalendarFeedScope, TaskRecord, TaskRecurrenceContinuity, TaskRecurrenceTemplate } from "./task-recurrence-contracts.d.ts";
import type { TaskListFilterContext, TaskListQuery, TaskListSort } from "./task-list-engine-contracts.d.ts";
import type { TaskChecklistItem, TaskRelationship, TaskRelationshipSummary, TaskReminderDetails, TaskTimerRecord, TaskWorkflowSession } from "./task-workflow-contracts.d.ts";

export type TaskServerSession = TaskWorkflowSession & { api_key_id?: string };
export type TaskServerQuery = TaskListQuery & {
  end?: unknown;
  endDate?: unknown;
  end_date?: unknown;
  includeOptions?: unknown;
  start?: unknown;
  startDate?: unknown;
  start_date?: unknown;
  statuses?: unknown;
  tagIds?: unknown;
  tag_ids?: unknown;
  tags?: unknown;
};

export interface TaskRepositoryOptions extends TaskListQuery {
  assigneeFilter?: string;
  assigneeId?: string;
  candidateLimit?: unknown;
  clientFilterMode?: string;
  clientIds?: string[];
  clientProjectIds?: string[];
  currentUserId?: string;
  currentWeekEnd?: string;
  dueFilter?: string;
  dueSoonCutoff?: string;
  dueWindowEnd?: string;
  dueWindowStart?: string;
  hasClientFilter?: boolean;
  hasProjectFilter?: boolean;
  nowIso?: string;
  omitClientFilterBecauseProjectSelected?: boolean;
  projectFilterMode?: string;
  projectIds?: string[];
  quickFilter?: string;
  requireNextAction?: boolean;
  scope?: Partial<TaskCalendarFeedScope> | null;
  sort?: TaskListSort;
  statusFilter?: string;
  statuses?: string[];
  taskView?: string;
  today?: string;
}

export interface TaskWrite extends Partial<Omit<TaskRecord, "task_id">> {
  task_id?: string;
  title: string;
  status: string;
}

export interface TaskDatabaseRow extends DatabaseRow {
  task_id: string;
  workspace_id: string;
  title: string;
  status?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  project_client_id?: string | null;
  description?: string | null;
  next_action?: string | null;
  blocked_reason?: string | null;
  resume_note?: string | null;
  priority?: string | null;
  estimate_minutes?: string | number | null;
  billable?: string | number | null;
  due_date?: string | null;
  due_time?: string | null;
  due_timezone?: string | null;
  due_at_utc?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  archived_at?: string | null;
  reminder_override_enabled?: DatabaseBooleanInput;
  recurrence_template_id?: string | null;
  recurrence_instance_date?: string | null;
  completed_at?: string | null;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  completed_by_user_id?: string | null;
  archived_by_user_id?: string | null;
  last_worked_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaskAssigneeRow extends DatabaseRow {
  task_assignee_id: string;
  task_id: string;
  user_id: string;
  username?: string | null;
  display_name?: string | null;
}

export interface TaskDashboardCountRow extends DatabaseRow {
  workspace_id: string;
  client_id?: string | null;
  project_id?: string | null;
  active_count?: string | number | null;
  assigned_to_me_count?: string | number | null;
  active_timer_count?: string | number | null;
  blocked_count?: string | number | null;
  overdue_count?: string | number | null;
  due_soon_count?: string | number | null;
  completed_count?: string | number | null;
  archived_count?: string | number | null;
}

export type TaskSqlParams = DatabaseParams & Record<string, unknown>;

export interface TaskWriteParamsInput {
  includeCreatedAt?: boolean;
  now: string;
  task: TaskWrite;
  taskId: string;
  workspaceId: string;
}

export interface TaskRecurrenceRecoveryResult {
  status: string;
  taskId?: string;
  completedTaskIds?: string[];
  targetCreated?: boolean;
  targetTaskId?: string;
  completedTasks?: TaskRecord[];
  targetTask?: TaskRecord | null;
}

export interface TaskCompletionMetrics {
  completed_at: string;
  created_at: string;
  duration_label: string;
  duration_seconds: number | null;
}

export interface TaskPublicRecurrenceRecovery {
  available: boolean;
  blockedByActiveTimer: boolean;
  completedTaskCount: number;
  eligible: boolean;
  seriesEnded: boolean;
  skippedOccurrenceCount: number;
  targetDate: string | null;
  unchangedHistoryCount: number;
}

export interface TaskRecurrenceDetails {
  applyTo: "instance";
  enabled: boolean;
  endDate: string;
  frequency: string;
  interval: number;
  rrule: string;
  templateStatus: string;
}

export interface TaskResumeContext extends Record<string, unknown> {
  active_candidate: boolean;
  checklist_progress: {
    completed_count: number;
    next_incomplete_item_label: string;
    total_count: number;
  };
  completion_metrics: TaskCompletionMetrics;
  last_worked_at: string;
  relationship_summary: TaskRelationshipSummary;
}

export interface TaskWithDetails extends TaskRecord {
  task_id: string;
  workspace_id: string;
  title: string;
  status: string;
  assignee_ids?: string[];
  checklistProgress?: { completed_count: number; next_incomplete_item_label: string; total_count: number };
  relationshipSummary?: TaskRelationshipSummary;
  relationships?: TaskRelationship[];
  recurrence?: Record<string, unknown> | null;
  recurrenceContinuity?: TaskRecurrenceContinuity | null;
  recurrenceDetails?: TaskRecurrenceDetails;
  recurrenceRecovery?: TaskPublicRecurrenceRecovery | null;
  directTags?: unknown[];
  propagatedTags?: unknown[];
  reminderDetails?: TaskReminderDetails;
  completionMetrics?: TaskCompletionMetrics;
  parentTask?: TaskWithDetails | null;
  resumeContext?: TaskResumeContext;
  activeTimer?: TaskTimerRecord | null;
}

export interface TaskDetail extends TaskWithDetails {
  archived_at: string;
  blocked_reason: string;
  checklistItems: TaskChecklistItem[];
  checklistProgress: {
    completed_count: number;
    next_incomplete_item_label: string;
    total_count: number;
  };
  client_id: string;
  client_name: string;
  completed_at: string;
  completionMetrics: TaskCompletionMetrics;
  created_at: string;
  description: string;
  due_date: string;
  due_time: string;
  last_worked_at: string;
  next_action: string;
  priority: string;
  project_id: string;
  project_name: string;
  recurrenceDetails: TaskRecurrenceDetails;
  recurrence_instance_date: string;
  recurrence_template_id: string;
  reminderDetails: TaskReminderDetails;
  resume_note: string;
  recurrenceRecovery: TaskPublicRecurrenceRecovery | null;
  relationshipSummary: TaskRelationshipSummary;
  resumeContext: TaskResumeContext;
  tags: import("./task-recurrence-contracts.d.ts").TaskTag[];
  updated_at: string;
}

export interface TaskMaterializationResult {
  task: TaskDetail;
  wasCreated: boolean;
}

export interface TaskMutationResult {
  task: TaskDetail;
}

export interface TaskCompletionResult extends TaskMutationResult {
  createdTask: TaskDetail | null;
  recurrenceContinuity: TaskRecurrenceContinuity | null;
  recurrenceJob: { failed?: boolean; queued: boolean };
}

export interface TaskRecurrenceHandoffResult {
  recurrenceContinuity: TaskRecurrenceContinuity | null;
  recurrenceJob: { failed?: boolean; queued: boolean };
}

export interface TaskSkipToCurrentResult {
  completedTaskCount: number;
  retainedTargetCount: number;
  seriesEnded: boolean;
  skippedOccurrenceCount: number;
  targetTask: TaskDetail | null;
  unchangedHistoryCount: number;
}

export interface TaskChecklistMutationResult {
  item: TaskChecklistItem;
  items: TaskChecklistItem[];
  checklistProgress: {
    completed_count: number;
    next_incomplete_item_label: string;
    total_count: number;
  };
  task: TaskDetail;
}

export interface TaskProjectCascade {
  allPreviousTasks: TaskWithDetails[];
  changedTasks: TaskWithDetails[];
}

export interface TaskDashboardContext {
  currentUserId: string;
  dueSoonCutoff: string;
  now: Date;
  timerByTaskId: Map<string, TaskTimerRecord>;
  today: string;
  workspaceType: string;
  horizon?: string;
  reasons?: string[];
  reasonBadge?: string;
}

export interface TaskFilterShapeInput {
  candidates: TaskWithDetails[];
  offset: number;
  query: TaskServerQuery;
  resolvedQuery: TaskListFilterContext;
  session: TaskServerSession;
  timerByTaskId: Map<string, TaskTimerRecord>;
}

export interface TaskQueryResultInput {
  includeOptions?: boolean;
  pagination: { offset: number; pageSize: number } | null;
  query: TaskServerQuery;
  session: TaskServerSession;
  tasks: TaskWithDetails[];
  timers: TaskTimerRecord[];
  nextCursor?: string;
}

export interface TaskRecurrencePlan extends Record<string, unknown> {
  available: boolean;
  blockedByActiveTimer: boolean;
  checkpointDate: string;
  completedTaskCount: number;
  currentTask?: TaskWithDetails | null;
  eligible: boolean;
  instances: TaskWithDetails[];
  seriesEnded: boolean;
  skippedOccurrenceCount: number;
  targetDate: string | null;
  taskIds: string[];
  targetTask: TaskWithDetails | null;
  template: TaskRecurrenceTemplate;
  unchangedHistoryCount: number;
}

export type { TaskCalendarFeedScope, TaskListFilterContext, TaskListSort, TaskRecurrenceTemplate };
