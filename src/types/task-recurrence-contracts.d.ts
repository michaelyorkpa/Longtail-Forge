import type {
  AuthorizationSession,
  PermissionResource,
  WorkspaceRequestSession,
} from "./http-contracts.d.ts";

export type NullableText = string | null | undefined;
export type DateInput = Date | string | number | null | undefined;

export type TaskRecurrenceSession = WorkspaceRequestSession & {
  role?: string;
};

export interface TaskRecurrenceReadSession {
  workspace_id: string;
}

export interface TaskRecord extends PermissionResource {
  task_id: string;
  workspace_id: string;
  client_id?: NullableText;
  client_name?: NullableText;
  project_id?: NullableText;
  project_name?: NullableText;
  project_client_id?: NullableText;
  title: string;
  description?: NullableText;
  next_action?: NullableText;
  blocked_reason?: NullableText;
  resume_note?: NullableText;
  status: string;
  priority?: NullableText;
  estimate_minutes?: number | null;
  due_date?: NullableText;
  due_time?: NullableText;
  due_timezone?: NullableText;
  due_at_utc?: NullableText;
  source_type?: NullableText;
  source_id?: NullableText;
  recurrence_template_id?: NullableText;
  recurrence_instance_date?: NullableText;
  reminder_override_enabled?: boolean;
  assignee_ids?: string[];
  created_by_user_id?: NullableText;
  updated_by_user_id?: NullableText;
  completed_by_user_id?: NullableText;
  archived_by_user_id?: NullableText;
  completed_at?: NullableText;
  archived_at?: NullableText;
  last_worked_at?: NullableText;
  created_at?: NullableText;
  updated_at?: NullableText;
  checklistItems?: TaskChecklistSourceItem[];
}

export interface TaskRecurrenceTemplate extends Omit<TaskRecord, "task_id"> {
  recurrence_template_id: string;
  recurrence_anchor_date: string;
  rrule: string;
  recurrence_end_date: string;
  recovery_checkpoint_date: string;
  template_status: string;
  assignee_ids: string[];
  checklistItems?: TaskRecurrenceChecklistItem[];
  noteLinks?: TaskRecurrenceNoteLink[];
}

export interface TaskRecurrenceTemplateWrite extends Partial<Omit<TaskRecurrenceTemplate, "recurrence_template_id" | "checklistItems" | "noteLinks">> {
  recurrence_template_id?: NullableText;
  checklistItems?: TaskChecklistSourceItem[];
  noteLinks?: TaskRecurrenceNoteLinkWrite[];
  title: string;
  recurrence_anchor_date: string;
  rrule: string;
}

export interface TaskRecurrenceTemplateUpdate extends TaskRecurrenceTemplateWrite {
  recurrence_template_id: string;
  updated_by_user_id: string;
}

export interface TaskChecklistSourceItem {
  label?: NullableText;
  sort_order?: string | number | null;
}

export interface TaskRecurrenceChecklistItem {
  recurrence_checklist_item_id: string;
  recurrence_template_id: string;
  workspace_id: string;
  label: string;
  sort_order: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  deleted_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

export interface TaskRecurrenceChecklistWrite {
  recurrence_checklist_item_id?: NullableText;
  label?: NullableText;
  sort_order?: string | number | null;
  created_by_user_id?: NullableText;
}

export interface TaskRecurrenceNoteLink extends Record<string, unknown> {
  recurrence_note_link_id: string;
  recurrence_template_id: string;
  workspace_id: string;
  note_id: string;
  link_role: string;
  scope_role: string;
  sort_order: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  deleted_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

export interface TaskRecurrenceNoteLinkWrite {
  recurrence_note_link_id?: NullableText;
  note_id?: NullableText;
  noteId?: NullableText;
  link_role?: NullableText;
  linkRole?: NullableText;
  scope_role?: NullableText;
  scopeRole?: NullableText;
  sort_order?: string | number | null;
  sortOrder?: string | number | null;
  created_by_user_id?: NullableText;
}

export interface TaskRecurrenceTemplateRow extends Record<string, unknown> {
  recurrence_template_id: string;
  workspace_id: string;
  client_id: NullableText;
  client_name: NullableText;
  project_id: NullableText;
  project_name: NullableText;
  project_client_id: NullableText;
  title: string;
  description: NullableText;
  status: NullableText;
  priority: NullableText;
  estimate_minutes: number | string | null;
  recurrence_anchor_date: NullableText;
  due_time: NullableText;
  due_timezone: NullableText;
  due_at_utc: NullableText;
  rrule: NullableText;
  recurrence_end_date: NullableText;
  recovery_checkpoint_date: NullableText;
  template_status: NullableText;
  created_by_user_id: NullableText;
  updated_by_user_id: NullableText;
  created_at: string;
  updated_at: string;
}

export interface TaskRecurrenceChecklistRow extends Record<string, unknown> {
  recurrence_checklist_item_id: string;
  recurrence_template_id: string;
  workspace_id: string;
  label: NullableText;
  sort_order: number | string | null;
  created_by_user_id: NullableText;
  updated_by_user_id: NullableText;
  deleted_by_user_id: NullableText;
  created_at: NullableText;
  updated_at: NullableText;
  deleted_at: NullableText;
}

export interface TaskRecurrenceNoteLinkRow extends Record<string, unknown> {
  recurrence_note_link_id: string;
  recurrence_template_id: string;
  workspace_id: string;
  note_id: NullableText;
  link_role: NullableText;
  scope_role: NullableText;
  sort_order: number | string | null;
  created_by_user_id: NullableText;
  updated_by_user_id: NullableText;
  deleted_by_user_id: NullableText;
  created_at: NullableText;
  updated_at: NullableText;
  deleted_at: NullableText;
}

export interface TaskRecurrenceReadOptions {
  fromDate?: NullableText;
  throughDate?: NullableText;
  includeAssignees?: boolean;
  scope?: Partial<TaskCalendarFeedScope> | null;
}

export interface TaskCalendarFeedScope {
  type: "workspace" | "client" | "project";
  clientId: string | null;
  projectId: string | null;
}

export interface TaskCalendarScopeSqlOptions {
  projectAlias?: string;
  recordAlias?: string;
}

export interface TaskCalendarScopeSql {
  sql: string;
  params: Record<string, string | null>;
}

export interface TaskCalendarSubscription {
  name?: NullableText;
  scope?: Partial<TaskCalendarFeedScope> | null;
  workspaceId?: NullableText;
  workspace_id?: NullableText;
}

export interface TaskCalendarFeedSession {
  workspace_id: string;
  user_id: string;
  timezone: string;
}

export interface TaskCalendarWindow {
  startDate: string;
  endDate: string;
}

export interface TaskCalendarSuppressedInstance {
  recurrence_template_id: string;
  recurrence_instance_date: string;
}

export interface TaskCalendarRow {
  task_id: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  due_time: string;
  client_name: string;
  project_name: string;
  allDay: boolean;
  endDate: string;
  startDate: string;
  templateId?: string;
  instanceDate?: string;
  virtual?: true;
}

export interface TaskRecurrencePayload {
  enabled?: boolean;
  frequency?: NullableText;
  interval?: string | number | null;
  endDate?: NullableText;
  end_date?: NullableText;
  recurrence_end_date?: NullableText;
  rrule?: NullableText;
}

export interface NormalizedTaskRecurrence {
  enabled: boolean;
  frequency: string;
  interval: number;
  endDate: string;
}

export interface ParsedTaskRRule {
  frequency: string;
  interval: number;
  endDate: string;
}

export interface TaskRecurrenceProjectionTemplate {
  recurrence_anchor_date?: NullableText;
  rrule?: NullableText;
  recurrence_end_date?: NullableText;
  recovery_checkpoint_date?: NullableText;
  due_time?: NullableText;
  due_timezone?: NullableText;
}

export interface TaskRecurrenceContinuity {
  checklistTemplateSeeded: boolean;
  followUpFailed: boolean;
  followUpQueued: boolean;
  isRecurring: true;
  nextScheduledDate: string;
  nextTask: TaskRecurrenceNextTask | null;
  status: "available" | "ended" | "handoff_failed" | "pending";
}

export interface TaskRecurrenceNextTask {
  due_date: string;
  task_id: string;
  title: string;
  url: string;
}

export interface TaskRecurrenceCreateAdapter {
  findExisting(templateId: string, instanceDate: string): Promise<TaskRecord | null | undefined>;
  create(task: TaskRecurrenceInstanceDraft): Promise<TaskRecord | { task: TaskRecord; wasCreated?: boolean }>;
}

export interface TaskRecurrenceInstanceDraft extends Partial<TaskRecord> {
  title: string;
  status: string;
  due_date: string;
  source_type: string;
  source_id: string;
  recurrence_template_id: string;
  recurrence_instance_date: string;
  assignee_ids: string[];
}

export interface TaskRecurrenceMaterializationResult {
  task: TaskRecord;
  wasCreated: boolean;
}

export interface TaskRecurrenceInstanceStats {
  openCount: number;
  total: number;
  latestInstanceDate: string;
}

export interface TaskRecurrenceRecoveryWrite {
  actorUserId: string;
  expectedTaskIds?: string[];
  checkpointDate: string;
  expectedTemplate: TaskRecurrenceTemplate;
  targetTask?: TaskRecurrenceInstanceDraft | null;
  templateId: string;
}

export interface ReminderOccurrence {
  due_at_utc: string;
  due_kind: string;
  offset_minutes: number;
  reminder_at_utc: string;
}

export interface TaskJobOptions {
  replace?: boolean;
  workspaceId?: NullableText;
  workspace_id?: NullableText;
  workspaceIds?: string[];
  workspace_ids?: string[];
  taskId?: NullableText;
  task_id?: NullableText;
  availableAt?: DateInput;
  available_at?: DateInput;
  now?: DateInput;
  horizonEnd?: DateInput;
  horizon_end?: DateInput;
  horizonDays?: string | number | null;
  horizon_days?: string | number | null;
  batchSize?: string | number | null;
  batch_size?: string | number | null;
  maxAttempts?: number;
  max_attempts?: number;
  priority?: number;
  reason?: NullableText;
  source?: NullableText;
  reschedule?: boolean;
  session?: TaskRecurrenceSession;
  requestedByUserId?: NullableText;
  requested_by_user_id?: NullableText;
}

export interface TaskRecurrenceJobContext extends TaskJobOptions {
  completedTask?: Partial<TaskRecord>;
  task?: Partial<TaskRecord>;
}

export interface TaskJobPayload extends TaskJobOptions {
  operation?: NullableText;
  completedTaskId?: NullableText;
  completed_task_id?: NullableText;
  recurrenceInstanceDate?: NullableText;
  recurrenceTemplateId?: NullableText;
  reminderAtUtc?: NullableText;
  reminder_at_utc?: NullableText;
  dueAtUtc?: NullableText;
  due_at_utc?: NullableText;
  offsetMinutes?: string | number | null;
  offset_minutes?: string | number | null;
}

export interface TaskJobHandlerInput {
  payload?: TaskJobPayload;
}

export interface TaskRecurrenceAuditInput {
  completedTask: Pick<TaskRecord, "task_id">;
  createdTask: TaskRecord;
  session: AuthorizationSession;
}

export interface TaskCalendarEventStart {
  date: string;
  dueAtUtc?: NullableText;
  time?: NullableText;
  timezone?: NullableText;
  useLocalTimezone?: boolean;
}

export interface TaskCalendarSerializationInput {
  canReadTask?: (resource: PermissionResource) => boolean;
  now?: Date;
  session: TaskCalendarFeedSession;
  subscription?: TaskCalendarSubscription | null;
  suppressedInstances?: TaskCalendarSuppressedInstance[];
  tasks?: TaskRecord[];
  templates?: TaskRecurrenceTemplate[];
  window?: TaskCalendarWindow;
}

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface TimezoneTransition {
  fromOffset: number;
  instant: Date;
  toOffset: number;
}
