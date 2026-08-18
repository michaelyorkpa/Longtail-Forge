/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListCandidateRow} TaskListCandidateRow */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListFilterContext} TaskListFilterContext */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListFilterContextOptions} TaskListFilterContextOptions */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListPagination} TaskListPagination */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListPaginationOptions} TaskListPaginationOptions */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListQuery} TaskListQuery */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListRow} TaskListRow */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListScopeQuery} TaskListScopeQuery */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListSort} TaskListSort */
/** @typedef {import("../../types/task-list-engine-contracts.js").TaskListTimer} TaskListTimer */

const TASK_VIEW_FILTERS = new Set(["my", "all", "unassigned", "overdue", "today", "week", "completed", "archived"]);
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

class TaskListCursorError extends Error {
  constructor() {
    super("Task list cursor is invalid.");
    this.name = "TaskListCursorError";
  }
}

/**
 * Normalize all canonical list decisions once per request. Async hierarchy
 * expansion remains in the Tasks service; this engine consumes only the
 * resolved, permission-neutral scope values.
 *
 * @param {TaskListQuery} [query]
 * @param {TaskListFilterContextOptions} [options]
 * @returns {TaskListFilterContext}
 */
function createTaskListFilterContext(query = {}, options = {}) {
  const taskView = normalizeTaskListView(firstValue(query.taskView, query.task_view, query.view));
  const quickFilter = normalizeTaskListFilter(firstValue(
    query.quickFilter,
    query.quick_filter,
    !taskView ? firstValue(query.assigneeFilter, query.assignee_filter) : "",
  ));
  const dueWindow = taskListDueWindow(query);

  return {
    assigneeFilter: normalizeTaskListFilter(firstValue(query.assignee, query.assignee_scope, query.assignee_filter_value)),
    assigneeId: normalizedText(firstValue(query.assigneeId, query.assignee_id)),
    clientFilterMode: options.scope?.clientFilterMode || "all",
    clientId: options.scope?.clientId || "",
    clientIds: normalizedIds(options.scope?.clientIds),
    clientProjectIds: normalizedIds(options.scope?.clientProjectIds),
    currentUserId: normalizedText(options.currentUserId),
    currentWeekEnd: normalizedText(options.currentWeekEnd),
    dueFilter: normalizeTaskListFilter(firstValue(query.due, query.due_filter)) || quickDueFilter(quickFilter),
    dueSoonCutoff: normalizedText(options.dueSoonCutoff),
    dueWindowEnd: dueWindow.end,
    dueWindowStart: dueWindow.start,
    hasClientFilter: options.scope?.hasClientFilter === true,
    hasProjectFilter: options.scope?.hasProjectFilter === true,
    nowIso: normalizedText(options.nowIso),
    omitClientFilterBecauseProjectSelected: options.scope?.omitClientFilterBecauseProjectSelected === true,
    projectFilterMode: options.scope?.projectFilterMode || "all",
    projectId: options.scope?.projectId || "",
    projectIds: normalizedIds(options.scope?.projectIds),
    quickFilter,
    requireNextAction: query.requireNextAction === true || query.require_next_action === true,
    sort: normalizeTaskListSort(firstValue(query.sort, query.sort_by, query.order)),
    statusFilter: normalizeTaskListFilter(firstValue(query.status, query.status_filter, query.filter)),
    taskView,
    timerFilter: normalizeTaskListFilter(firstValue(query.timer, query.timer_status)),
    today: normalizedText(options.today),
  };
}

/**
 * Apply permission visibility before tag/list enrichment while retaining the
 * repository offset needed for a stable continuation cursor.
 *
 * @template {TaskListRow} T
 * @param {T[]} candidates
 * @param {number} offset
 * @param {(task: TaskListRow) => boolean} isVisible
 * @returns {(T & TaskListCandidateRow)[]}
 */
function visibleTaskListCandidates(candidates, offset, isVisible) {
  const normalizedOffset = nonNegativeInteger(offset, 0);

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      __candidateOffset: normalizedOffset + index,
    }))
    .filter(isVisible);
}

/** @template {TaskListCandidateRow} T @param {T} task @returns {Omit<T, "__candidateOffset">} */
function stripTaskListCandidateMetadata(task) {
  const { __candidateOffset: _candidateOffset, ...publicTask } = task;
  return publicTask;
}

/**
 * @param {TaskListRow} task
 * @param {TaskListFilterContext} context
 * @param {ReadonlyMap<string, TaskListTimer>} [timerByTaskId]
 */
function taskMatchesCanonicalQuery(task, context, timerByTaskId = new Map()) {
  const statusOverridesActiveScope = taskStatusFilterOverridesActiveScope(context.statusFilter);

  if (context.taskView && !matchesTaskView(
    task,
    context.taskView,
    context.currentUserId,
    context.today,
    context.currentWeekEnd,
    statusOverridesActiveScope,
  )) {
    return false;
  }

  if (!matchesStatusFilter(task, context.statusFilter)) {
    return false;
  }

  if (!context.taskView && !matchesQuickFilter(task, context.quickFilter, context.currentUserId)) {
    return false;
  }

  if (!matchesDueFilter(task, context.dueFilter, context.nowIso, context.today, context.dueSoonCutoff)) {
    return false;
  }

  if (!matchesTaskContextFilters(task, context)) {
    return false;
  }

  if (!matchesAdvancedAssigneeFilter(task, context.assigneeFilter, context.assigneeId, context.currentUserId)) {
    return false;
  }

  if (context.timerFilter) {
    const timer = timerByTaskId.get(normalizedText(task.task_id));
    if (context.timerFilter === "has_timer" && !timer) {
      return false;
    }
    if (["running", "paused"].includes(context.timerFilter) && timer?.timer_status !== context.timerFilter) {
      return false;
    }
  }

  return true;
}

/** @template {TaskListRow} T @param {T[]} tasks @param {TaskListQuery | TaskListFilterContext} [query] @returns {T[]} */
function sortCanonicalTasks(tasks, query = {}) {
  const querySource = /** @type {TaskListQuery} */ (query);
  const sort = normalizeTaskListSort(firstValue(querySource.sort, querySource.sort_by, querySource.order));
  return [...tasks].sort((left, right) => compareCanonicalTasks(left, right, sort));
}

/** @param {TaskListRow} left @param {TaskListRow} right @param {TaskListSort} sort */
function compareCanonicalTasks(left, right, sort) {
  if (sort === "priority") {
    return priorityRank(right.priority) - priorityRank(left.priority) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }
  if (sort === "status") {
    return statusRank(left.status) - statusRank(right.status) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }
  if (sort === "last_worked") {
    return compareDesc(left.last_worked_at, right.last_worked_at) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }
  if (sort === "updated") {
    return compareDesc(left.updated_at, right.updated_at) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }
  if (sort === "context") {
    return normalizedText(left.client_name).localeCompare(normalizedText(right.client_name)) ||
      normalizedText(left.project_name).localeCompare(normalizedText(right.project_name)) ||
      compareByDueAt(left, right) || compareByStableTitle(left, right);
  }
  if (sort === "created") {
    return compareDesc(left.created_at, right.created_at) || compareByStableTitle(left, right);
  }
  if (sort === "created_asc") {
    return normalizedText(left.created_at).localeCompare(normalizedText(right.created_at)) || compareByStableTitle(left, right);
  }
  return compareByDueAt(left, right) || priorityRank(right.priority) - priorityRank(left.priority) || compareByStableTitle(left, right);
}

/** @param {TaskListQuery} [query] @param {TaskListPaginationOptions} [options] @returns {TaskListPagination | null} */
function normalizeTaskListPagination(query = {}, options = {}) {
  if (options.paginate !== true) {
    return null;
  }
  const defaultPageSize = positiveInteger(options.defaultPageSize, DEFAULT_PAGE_SIZE);
  const maxPageSize = positiveInteger(options.maxPageSize, MAX_PAGE_SIZE);
  const requestedPageSize = firstValue(query.limit, query.page_size, query.pageSize);
  const pageSize = Math.min(maxPageSize, Math.max(1, positiveInteger(requestedPageSize, defaultPageSize)));
  const cursorText = normalizedText(query.cursor);
  const cursorOffset = cursorText ? decodeTaskCursor(cursorText) : null;
  if (cursorText && cursorOffset === null) {
    throw new TaskListCursorError();
  }
  return {
    offset: cursorOffset ?? nonNegativeInteger(query.offset, 0),
    pageSize,
  };
}

/** @param {unknown} offset */
function encodeTaskCursor(offset) {
  return Buffer.from(JSON.stringify({ offset: nonNegativeInteger(offset, 0) })).toString("base64url");
}

/** @param {unknown} cursor */
function decodeTaskCursor(cursor) {
  const text = normalizedText(cursor);
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    const offset = Number.parseInt(String(parsed?.offset ?? ""), 10);
    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

/** @param {TaskListQuery} [query] */
function taskListDueWindow(query = {}) {
  const dueOn = normalizeDateKey(firstValue(query.dueOn, query.due_on));
  const dueFrom = normalizeDateKey(firstValue(query.dueFrom, query.due_from));
  const dueTo = normalizeDateKey(firstValue(query.dueTo, query.due_to));
  const dueBefore = normalizeDateKey(firstValue(query.dueBefore, query.due_before));
  const startCandidates = [dueFrom, dueOn].filter(Boolean).map((dateKey) => addCalendarDaysKey(dateKey, -1));
  const endCandidates = [
    dueTo ? addCalendarDaysKey(dueTo, 1) : "",
    dueOn ? addCalendarDaysKey(dueOn, 1) : "",
    dueBefore,
  ].filter(Boolean);
  return {
    end: endCandidates.length ? endCandidates.reduce((left, right) => (left > right ? left : right)) : "",
    start: startCandidates.length ? startCandidates.reduce((left, right) => (left < right ? left : right)) : "",
  };
}

/** @param {unknown} value */
function normalizeTaskListFilter(value) {
  return normalizedText(value).toLowerCase();
}

/** @param {unknown} value */
function normalizeTaskListView(value) {
  const taskView = normalizeTaskListFilter(value);
  const aliases = {
    assigned: "my",
    assigned_to_me: "my",
    complete: "completed",
    due_today: "today",
    due_this_week: "week",
  };
  const normalized = aliases[/** @type {keyof typeof aliases} */ (taskView)] || taskView;
  return TASK_VIEW_FILTERS.has(normalized) ? normalized : "";
}

/** @param {unknown} value @returns {TaskListSort} */
function normalizeTaskListSort(value) {
  const sort = normalizedText(value || "due_at").toLowerCase();
  const aliases = {
    due: "due_at",
    due_date: "due_at",
    due_time: "due_at",
    priority_desc: "priority",
    last_worked_at: "last_worked",
    recent: "updated",
    recently_updated: "updated",
    project_client: "context",
    client_project: "context",
    oldest: "created_asc",
  };
  return aliases[/** @type {keyof typeof aliases} */ (sort)] || sort;
}

/** @param {unknown} statusFilter */
function taskStatusFilterOverridesActiveScope(statusFilter) {
  return ["complete", "archived", "history", "all"].includes(normalizeTaskListFilter(statusFilter));
}

/** @param {TaskListRow} task @param {string} taskView @param {string} currentUserId @param {string} today @param {string} currentWeekEnd @param {boolean} statusOverridesActiveScope */
function matchesTaskView(task, taskView, currentUserId, today, currentWeekEnd, statusOverridesActiveScope) {
  const inActiveScope = statusOverridesActiveScope || isActiveTask(task);
  const assigneeIds = normalizedIds(task.assignee_ids);
  if (taskView === "my") return inActiveScope && assigneeIds.includes(currentUserId);
  if (taskView === "all") return inActiveScope;
  if (taskView === "unassigned") return inActiveScope && assigneeIds.length === 0;
  if (taskView === "overdue") return inActiveScope && Boolean(task.due_date) && normalizedText(task.due_date) < today;
  if (taskView === "today") return inActiveScope && task.due_date === today;
  if (taskView === "week") return inActiveScope && Boolean(task.due_date) && normalizedText(task.due_date) >= today && normalizedText(task.due_date) <= currentWeekEnd;
  if (taskView === "completed") return task.status === "complete";
  if (taskView === "archived") return task.status === "archived";
  return true;
}

/** @param {TaskListRow} task @param {string} filter */
function matchesStatusFilter(task, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "active") return isActiveTask(task);
  if (filter === "history") return ["complete", "archived"].includes(normalizedText(task.status));
  return task.status === filter;
}

/** @param {TaskListRow} task @param {string} filter @param {string} currentUserId */
function matchesQuickFilter(task, filter, currentUserId) {
  if (!filter || filter === "all") return true;
  const assigneeIds = normalizedIds(task.assignee_ids);
  if (["my", "assigned_to_me", "assigned"].includes(filter)) return assigneeIds.includes(currentUserId);
  if (filter === "unassigned") return assigneeIds.length === 0;
  if (["in_progress", "blocked"].includes(filter)) return task.status === filter;
  return true;
}

/** @param {TaskListRow} task @param {TaskListScopeQuery} query */
function matchesTaskContextFilters(task, query) {
  if (query.hasProjectFilter) {
    if (query.projectFilterMode === "blank" && normalizedText(task.project_id)) return false;
    if (query.projectFilterMode === "ids") {
      const projectIds = query.projectIds?.length ? query.projectIds : normalizedIds([query.projectId]);
      if (!projectIds.includes(normalizedText(task.project_id))) return false;
    }
  }
  if (!query.hasClientFilter || query.omitClientFilterBecauseProjectSelected) return true;
  if (query.clientFilterMode === "blank") return !normalizedText(task.client_id);
  if (query.clientFilterMode !== "ids") return true;
  const clientIds = query.clientIds?.length ? query.clientIds : normalizedIds([query.clientId]);
  return clientIds.includes(normalizedText(task.client_id)) || (query.clientProjectIds || []).includes(normalizedText(task.project_id));
}

/** @param {TaskListRow} task @param {string} filter @param {string} assigneeId @param {string} currentUserId */
function matchesAdvancedAssigneeFilter(task, filter, assigneeId, currentUserId) {
  const assigneeIds = normalizedIds(task.assignee_ids);
  if (filter === "me" || filter === "assigned_to_me") return assigneeIds.includes(currentUserId);
  if (filter === "unassigned") return assigneeIds.length === 0;
  return !assigneeId || assigneeIds.includes(assigneeId);
}

/** @param {string} filter */
function quickDueFilter(filter) {
  return ["overdue", "today", "week", "next_due"].includes(filter) ? filter : "";
}

/** @param {TaskListRow} task @param {string} filter @param {string} nowIso @param {string} today @param {string} dueSoonCutoff */
function matchesDueFilter(task, filter, nowIso, today, dueSoonCutoff) {
  if (!filter || filter === "all") return true;
  if (filter === "overdue") return isActiveTask(task) && isTaskOverdue(task, nowIso, today);
  if (filter === "today") return isActiveTask(task) && task.due_date === today && !isTaskOverdue(task, nowIso, today);
  if (filter === "week") return isActiveTask(task) && isTaskDueSoon(task, nowIso, today, dueSoonCutoff);
  if (filter === "next_due") return isActiveTask(task) && Boolean(task.due_date);
  return true;
}

/** @param {TaskListRow} task */
function isActiveTask(task) {
  return !["complete", "archived"].includes(normalizedText(task.status));
}

/** @param {TaskListRow} task @param {string} nowIso @param {string} today */
function isTaskOverdue(task, nowIso, today) {
  if (!task.due_date) return false;
  if (task.due_time && task.due_at_utc) {
    const dueAt = Date.parse(task.due_at_utc);
    const now = Date.parse(nowIso);
    return Number.isFinite(dueAt) && Number.isFinite(now) && dueAt < now;
  }
  return normalizedText(task.due_date) < today;
}

/** @param {TaskListRow} task @param {string} nowIso @param {string} today @param {string} dueSoonCutoff */
function isTaskDueSoon(task, nowIso, today, dueSoonCutoff) {
  if (!task.due_date || normalizedText(task.due_date) < today || normalizedText(task.due_date) > dueSoonCutoff) return false;
  return !isTaskOverdue(task, nowIso, today);
}

/** @param {TaskListRow} left @param {TaskListRow} right */
function compareByDueAt(left, right) {
  return taskDueSortValue(left).localeCompare(taskDueSortValue(right));
}

/** @param {TaskListRow} left @param {TaskListRow} right */
function compareByStableTitle(left, right) {
  return normalizedText(left.title).localeCompare(normalizedText(right.title)) ||
    normalizedText(left.created_at).localeCompare(normalizedText(right.created_at)) ||
    normalizedText(left.task_id).localeCompare(normalizedText(right.task_id));
}

/** @param {unknown} leftValue @param {unknown} rightValue */
function compareDesc(leftValue, rightValue) {
  return normalizedText(rightValue).localeCompare(normalizedText(leftValue));
}

/** @param {TaskListRow} task */
function taskDueSortValue(task) {
  return normalizedText(task.due_at_utc) || `${normalizedText(task.due_date) || "9999-12-31"}T${normalizedText(task.due_time) || "23:59"}:00`;
}

/** @param {unknown} priority */
function priorityRank(priority) {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[/** @type {"urgent" | "high" | "normal" | "low"} */ (priority)] || 0;
}

/** @param {unknown} status */
function statusRank(status) {
  return { blocked: 1, in_progress: 2, open: 3, complete: 4, archived: 5 }[/** @type {"blocked" | "in_progress" | "open" | "complete" | "archived"} */ (status)] || 99;
}

/** @param {unknown} value */
function normalizeDateKey(value) {
  const text = normalizedText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

/** @param {string} dateKey @param {number} days */
function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** @param {unknown} value */
function normalizedText(value) {
  return String(value ?? "").trim();
}

/** @param {unknown} value */
function normalizedIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(normalizedText).filter(Boolean))] : [];
}

/** @param {unknown} value @param {number} fallback */
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** @param {unknown} value @param {number} fallback */
function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** @param {...unknown} values */
function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

export {
  TaskListCursorError,
  compareCanonicalTasks,
  compareByDueAt as compareTaskDueOrder,
  compareByStableTitle as compareTaskStableTitle,
  createTaskListFilterContext,
  decodeTaskCursor,
  encodeTaskCursor,
  normalizeTaskListFilter,
  normalizeTaskListPagination,
  normalizeTaskListSort,
  normalizeTaskListView,
  sortCanonicalTasks,
  stripTaskListCandidateMetadata,
  taskListDueWindow,
  matchesTaskContextFilters as taskMatchesContextFilters,
  taskMatchesCanonicalQuery,
  matchesStatusFilter as taskMatchesStatusFilter,
  taskStatusFilterOverridesActiveScope,
  visibleTaskListCandidates,
};
