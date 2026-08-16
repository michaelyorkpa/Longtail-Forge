export type TaskListSort =
  | "context"
  | "created"
  | "created_asc"
  | "due_at"
  | "last_worked"
  | "priority"
  | "status"
  | "updated"
  | string;

export interface TaskListQuery {
  assignee?: unknown;
  assigneeFilter?: unknown;
  assigneeId?: unknown;
  assignee_filter?: unknown;
  assignee_filter_value?: unknown;
  assignee_id?: unknown;
  assignee_scope?: unknown;
  clientId?: unknown;
  client_id?: unknown;
  cursor?: unknown;
  due?: unknown;
  dueBefore?: unknown;
  dueFrom?: unknown;
  dueOn?: unknown;
  dueTo?: unknown;
  due_before?: unknown;
  due_filter?: unknown;
  due_from?: unknown;
  due_on?: unknown;
  due_to?: unknown;
  filter?: unknown;
  limit?: unknown;
  offset?: unknown;
  order?: unknown;
  pageSize?: unknown;
  page_size?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  quickFilter?: unknown;
  quick_filter?: unknown;
  requireNextAction?: unknown;
  require_next_action?: unknown;
  sort?: unknown;
  sort_by?: unknown;
  status?: unknown;
  status_filter?: unknown;
  taskView?: unknown;
  task_view?: unknown;
  timer?: unknown;
  timer_status?: unknown;
  view?: unknown;
  [key: string | symbol]: unknown;
}

export interface TaskListScopeQuery {
  clientFilterMode?: string;
  clientId?: string;
  clientIds?: string[];
  clientProjectIds?: string[];
  hasClientFilter?: boolean;
  hasProjectFilter?: boolean;
  omitClientFilterBecauseProjectSelected?: boolean;
  projectFilterMode?: string;
  projectId?: string;
  projectIds?: string[];
}

export interface TaskListFilterContext extends TaskListScopeQuery {
  assigneeFilter: string;
  assigneeId: string;
  currentUserId: string;
  currentWeekEnd: string;
  dueFilter: string;
  dueSoonCutoff: string;
  dueWindowEnd: string;
  dueWindowStart: string;
  nowIso: string;
  quickFilter: string;
  requireNextAction: boolean;
  sort: TaskListSort;
  statusFilter: string;
  taskView: string;
  timerFilter: string;
  today: string;
}

export interface TaskListRow {
  assignee_ids?: string[] | null;
  blocked_reason?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  created_at?: string | null;
  due_at_utc?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  last_worked_at?: string | null;
  estimate_minutes?: number | null;
  next_action?: string | null;
  parentTask?: {
    status?: string | null;
    task_id?: string | null;
    title?: string | null;
  } | null;
  priority?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  status?: string | null;
  task_id?: string | null;
  title?: string | null;
  updated_at?: string | null;
  resumeContext?: Record<string, unknown> | null;
  resume_note?: string | null;
}

export interface TaskListCandidateRow extends TaskListRow {
  __candidateOffset: number;
}

export interface TaskListTimer {
  task_id?: string | null;
  timer_status?: string | null;
  [key: string]: unknown;
}

export interface TaskListPagination {
  offset: number;
  pageSize: number;
}

export interface TaskListPaginationEnvelope {
  hasMore: boolean;
  limit: number;
  nextCursor: string;
  pageSize: number;
}

export interface TaskListResult {
  currentUserId: string;
  options: unknown;
  pagination: TaskListPaginationEnvelope;
  tasks: TaskListRow[];
}

export interface TaskListAllResult {
  currentUserId: string;
  options: unknown;
  tasks: TaskListRow[];
}

export interface TaskListPaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
  paginate?: boolean;
}

export interface TaskListFilterContextOptions {
  currentWeekEnd?: string;
  currentUserId?: string;
  dueSoonCutoff?: string;
  nowIso?: string;
  scope?: TaskListScopeQuery;
  today?: string;
}
