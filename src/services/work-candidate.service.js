// @ts-check
import { modulesService } from "../core/modules/modules.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";
import { activeTimersService } from "../modules/time-tracking/index.js";
import {
  ALLOWED_PAYLOAD_FIELDS,
  isForbiddenField,
  sanitizeMetadata,
} from "./work-resume-state-producers.js";
import { parseWorkCandidateQueryEdge } from "./work-candidate.contracts.js";
import { workResumeStateService } from "./work-resume-state.service.js";

/** @typedef {import("../types/framework-contracts.js").WorkCandidate} WorkCandidate */
/** @typedef {Partial<WorkCandidate> & Record<string, unknown>} CandidateShape */
/** @typedef {Record<PropertyKey, unknown>} CandidateQueryInput */
/** @typedef {{clientId: string, clientIds: string[], clientProjectIds: string[], distantCreationOnlyFallback: boolean, dueBefore: string, dueFrom: string, dueOn: string, dueTo: string, excludeDistantCreationOnly: boolean, excludePassiveRecurringCreated: boolean, excludePassiveRecurringCreatedAlways: boolean, excludeStatusFilters: string[], includeTaskCandidates: boolean, limit: number, mode: string, moduleId: string, projectId: string, projectIds: string[], rankBuckets: string[], recordType: string, sort: string, statusFilters: string[], timezone: string, today: string, [NORMALIZED_QUERY_MARKER]: true}} CandidateQuery */
/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {{manualTimerSourceAvailable: boolean, timerSourceKeys: Set<string>, workItemSourceKeys: Set<string>}} CandidateSourceContext */
/** @typedef {Record<string, unknown> & {disabled?: boolean, href?: string, id?: string, label?: string, method?: string, params?: unknown, payload?: unknown, route?: string, type?: string}} ActionDescriptor */
/** @typedef {{dueThisWeekEndDateKey: string, recentSinceDateKey: string, sort: string, staleBeforeDateKey: string, timezone: string, today: string}} RankContext */
/** @typedef {{bucket: number, bucketId: string, dueDateKey: string, dueTime: number|null, lastActivityDateKey: string, lastActivityTime: number, priorityRank: number, rankHint: number, sort: string}} RankFacts */
/** @typedef {{candidate: WorkCandidate, facts: RankFacts, index: number}} RankedCandidate */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SECOND_UPDATED_TASK_SCAN_LIMIT = 5;
/** @type {Readonly<Record<string, number>>} */
const TEXT_LIMITS = Object.freeze({
  blockedReason: 1000,
  candidateId: 240,
  contextLabel: 240,
  dueAt: 80,
  handoffNote: 1000,
  id: 120,
  label: 160,
  lastActionLabel: 160,
  lastActionType: 80,
  method: 12,
  moduleId: 80,
  nextAction: 1000,
  priority: 80,
  recordId: 160,
  recordType: 80,
  reason: 1000,
  route: 1000,
  sourceKind: 80,
  sourceUrl: 1000,
  status: 80,
  title: 240,
  type: 40,
});
const CANDIDATE_ALLOWED_FIELDS = new Set([
  ...ALLOWED_PAYLOAD_FIELDS,
  "candidateId",
  "contextLabel",
  "createdAt",
  "dismissedAt",
  "dueAt",
  "lastWorkedAt",
  "primaryAction",
  "priority",
  "rankHint",
  "reason",
  "resumeStateId",
  "sourceKind",
  "status",
  "updatedAt",
]);
const ALLOWED_ACTION_FIELDS = new Set([
  "disabled",
  "href",
  "id",
  "label",
  "method",
  "params",
  "payload",
  "route",
  "type",
]);
const ALLOWED_ACTION_METHODS = new Set(["GET", "POST", "PUT", "PATCH"]);
const DEFAULT_OPEN_ACTION_ID = "work.open";
const DEFAULT_TIMEZONE = "America/New_York";
const DUE_THIS_WEEK_DAYS = 7;
const LIVE_TIMER_SOURCE_KIND = "live_timer";
const PRIORITY_RANKS = Object.freeze({
  urgent: 4,
  high: 3,
  normal: 2,
  medium: 2,
  low: 1,
});
const RANK_BUCKETS = Object.freeze({
  runningTimer: 10,
  pausedTimer: 20,
  overdueAssignedWork: 30,
  dueToday: 40,
  blockedOrStale: 50,
  recentlyTouched: 60,
  dueThisWeek: 70,
  later: 80,
});
const WORK_CANDIDATE_RANK_BUCKETS = Object.freeze({
  runningTimer: "running_timer",
  pausedTimer: "paused_timer",
  overdueAssignedWork: "overdue_assigned_work",
  dueToday: "due_today",
  blockedOrStale: "blocked_or_stale",
  recentlyTouched: "recently_touched",
  dueThisWeek: "due_this_week",
  later: "later",
});
const WORK_CANDIDATE_SORTS = Object.freeze({
  dueDatetime: "due_datetime",
  ranked: "ranked",
  resume: "resume",
});
const RANK_BUCKET_ID_BY_VALUE = Object.freeze({
  [RANK_BUCKETS.runningTimer]: WORK_CANDIDATE_RANK_BUCKETS.runningTimer,
  [RANK_BUCKETS.pausedTimer]: WORK_CANDIDATE_RANK_BUCKETS.pausedTimer,
  [RANK_BUCKETS.overdueAssignedWork]: WORK_CANDIDATE_RANK_BUCKETS.overdueAssignedWork,
  [RANK_BUCKETS.dueToday]: WORK_CANDIDATE_RANK_BUCKETS.dueToday,
  [RANK_BUCKETS.blockedOrStale]: WORK_CANDIDATE_RANK_BUCKETS.blockedOrStale,
  [RANK_BUCKETS.recentlyTouched]: WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched,
  [RANK_BUCKETS.dueThisWeek]: WORK_CANDIDATE_RANK_BUCKETS.dueThisWeek,
  [RANK_BUCKETS.later]: WORK_CANDIDATE_RANK_BUCKETS.later,
});
const RECENTLY_TOUCHED_DAYS = 2;
const RESUME_SOURCE_KIND = "resume_state";
const STALE_DAYS = 7;
const TASK_UPDATED_BOOST_SOURCE_KIND = "task_updated_boost";
const TASK_WORK_ITEM_SOURCE_KIND = "task_work_item";
const TASK_WORK_ITEM_SOURCE_KEY = "tasks:task";
const NORMALIZED_QUERY_MARKER = Symbol("normalizedWorkCandidateQuery");

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 */
/** @param {WorkspaceRequestSession} session @param {CandidateQueryInput} [query] */
async function listResumeCandidates(session, query = {}) {
  const normalizedQuery = normalizeListQuery(query, { timezone: session?.timezone });
  // Over-fetch stays at limit x 4 (capped) with the resume scan's own x 3:
  // both only compensate for rows the query/read filters drop, trimming them
  // could lose tail candidates, and with batched read checks the scanned rows
  // cost a constant number of IN-queries rather than one read per row.
  const result = await workResumeStateService.listResumeState(session, {
    ...stripScopeFilters(query),
    limit: Math.min(MAX_LIMIT, normalizedQuery.limit * 4),
  });
  const candidates = (result.items || [])
    .map((row) => candidateFromResumeRow(row))
    .filter((candidate) => matchesCandidateQuery(candidate, normalizedQuery));
  const orderedCandidates = normalizedQuery.sort
    ? rankWorkCandidates(candidates, {
        sort: normalizedQuery.sort,
        today: normalizedQuery.today,
        timezone: session?.timezone,
      })
    : candidates;

  return {
    items: orderedCandidates.slice(0, normalizedQuery.limit),
    mode: result.mode || normalizedQuery.mode,
  };
}

/** @param {WorkspaceRequestSession} session @param {CandidateQueryInput} [query] */
async function listWorkCandidates(session, query = {}) {
  const normalizedQuery = normalizeListQuery(query, { timezone: session?.timezone });
  const sourceContext = await readCandidateSourceContext(session);
  const [resumeResult, liveTimers, taskWorkItems] = await Promise.all([
    listResumeCandidates(session, { ...query, limit: Math.min(MAX_LIMIT, normalizedQuery.limit * 4) }),
    listLiveTimerCandidates(session, normalizedQuery, sourceContext),
    listTaskWorkItemCandidates(session, normalizedQuery, sourceContext),
  ]);
  const bySource = new Map();

  for (const candidate of [...liveTimers, ...(resumeResult.items || []), ...taskWorkItems]) {
    if (!candidate) continue;
    if (!matchesCandidateQuery(candidate, normalizedQuery) || !isCandidateSourceAvailable(candidate, sourceContext)) {
      continue;
    }

    const key = candidateSourceKey(candidate);

    if (!bySource.has(key)) {
      bySource.set(key, candidate);
    }
  }

  return {
    items: rankWorkCandidates([...bySource.values()], {
      sort: normalizedQuery.sort,
      today: normalizedQuery.today,
      timezone: session?.timezone,
    }).slice(0, normalizedQuery.limit),
    mode: normalizedQuery.mode || resumeResult.mode,
  };
}

/** @param {WorkspaceRequestSession} session @param {CandidateQueryInput} [query] @param {CandidateSourceContext|null} [sourceContext] */
async function listTaskWorkItemCandidates(session, query = {}, sourceContext = null) {
  const normalizedQuery = normalizeListQuery(query, { timezone: session?.timezone });
  const resolvedSourceContext = sourceContext || await readCandidateSourceContext(session);

  if (!normalizedQuery.includeTaskCandidates || !resolvedSourceContext.workItemSourceKeys.has(TASK_WORK_ITEM_SOURCE_KEY)) {
    return [];
  }

  const result = await tasksService.listWorkbenchItems(session, {
    ...optionalContextFilter("clientId", normalizedQuery.clientId),
    ...optionalContextFilter("projectId", normalizedQuery.projectId),
    ...optionalContextFilter("dueBefore", normalizedQuery.dueBefore),
    ...optionalContextFilter("dueFrom", normalizedQuery.dueFrom),
    ...optionalContextFilter("dueOn", normalizedQuery.dueOn),
    ...optionalContextFilter("dueTo", normalizedQuery.dueTo),
    sort: "due_at",
    status: "active",
  });

  if (result.source_enabled === false) {
    return [];
  }

  return (result.items || []).map((item) => candidateFromTaskWorkItem(item));
}

/** @param {WorkspaceRequestSession} session @param {CandidateQueryInput} [query] @param {CandidateSourceContext|null} [sourceContext] */
async function listLiveTimerCandidates(session, query = {}, sourceContext = null) {
  const normalizedQuery = normalizeListQuery(query, { timezone: session?.timezone });
  const resolvedSourceContext = sourceContext || await readCandidateSourceContext(session);

  if (resolvedSourceContext.timerSourceKeys.size === 0) {
    return [];
  }

  const result = await activeTimersService.listAll(session);
  const taskTimerIds = [...new Set((result.timers || [])
    .map((timer) => taskTimerSourceId(timer))
    .filter(Boolean))];
  const taskLifecycleById = taskTimerIds.length > 0
    ? await tasksService.readLifecycleForIds(session, taskTimerIds)
    : new Map();

  return (result.timers || [])
    .map((timer) => {
      const taskId = taskTimerSourceId(timer);
      if (!taskId) {
        return candidateFromTimer(timer);
      }

      const taskLifecycle = taskLifecycleById.get(taskId);
      if (!taskLifecycle?.readable || taskLifecycle.completed || taskLifecycle.archived) {
        return null;
      }

      return candidateFromTimer(timer, { taskLifecycle });
    })
    .filter((candidate) => candidate !== null)
    .filter((candidate) => isCandidateSourceAvailable(candidate, resolvedSourceContext))
    .filter((candidate) => matchesCandidateQuery(candidate, normalizedQuery));
}

/** @param {WorkspaceRequestSession} session @param {CandidateQueryInput} [query] @param {CandidateSourceContext|null} [sourceContext] */
async function readSecondMostRecentUpdatedTaskCandidate(session, query = {}, sourceContext = null) {
  const normalizedQuery = normalizeListQuery(query, { timezone: session?.timezone });
  const resolvedSourceContext = sourceContext || await readCandidateSourceContext(session);

  if (!resolvedSourceContext.workItemSourceKeys.has(TASK_WORK_ITEM_SOURCE_KEY)) {
    return null;
  }

  // The boost needs only the top two eligible tasks; the SQL page bound keeps
  // this an ORDER BY updated_at DESC LIMIT scan (the pagination machinery
  // scans further only when permission filtering drops candidates).
  const result = await tasksService.listWorkbenchItems(session, {
    ...optionalContextFilter("clientId", normalizedQuery.clientId),
    ...optionalContextFilter("projectId", normalizedQuery.projectId),
    limit: SECOND_UPDATED_TASK_SCAN_LIMIT,
    sort: "updated",
    status: "active",
  });

  if (result.source_enabled === false) {
    return null;
  }

  const eligibleTasks = (result.items || [])
    .filter((item) => item?.task_id || item?.source_id)
    .filter((item) => !["complete", "archived"].includes(normalizeFilterToken(item.status)))
    .filter((item) => matchesCandidateQuery(candidateFromTaskWorkItem(item), normalizedQuery));
  const secondMostRecentTask = eligibleTasks[1];

  return secondMostRecentTask
    ? candidateFromTaskWorkItem(secondMostRecentTask, {
        reason: "Recover the work before the latest update.",
        sourceKind: TASK_UPDATED_BOOST_SOURCE_KIND,
      })
    : null;
}

/** @param {Array<CandidateShape|null>} [candidates] @param {CandidateQueryInput} [options] */
function rankWorkCandidates(candidates = [], options = {}) {
  const context = rankContext(options);

  return [...candidates]
    .filter((candidate) => candidate !== null)
    .map((candidate, index) => ({
      candidate: normalizeWorkCandidate(candidate),
      index,
    }))
    .map((entry) => ({
      ...entry,
      facts: candidateRankFacts(entry.candidate, context),
    }))
    .sort(compareRankedCandidates)
    .map((entry) => entry.candidate);
}

/** @param {Record<string, unknown>} [item] @param {CandidateQueryInput} [options] */
function candidateFromTaskWorkItem(item = {}, options = {}) {
  const taskId = textValue(firstValue(item.task_id, item.source_id), TEXT_LIMITS.recordId);
  const recordType = textValue(item.source_type, TEXT_LIMITS.recordType) || "task";
  const sourceUrl = safeUrl(item.source_url) || (taskId ? `tasks.html?task=${encodeURIComponent(taskId)}` : "");
  const title = textValue(firstValue(item.title, item.source_label), TEXT_LIMITS.title) || "Task";
  const sourceKind = textValue(options.sourceKind, TEXT_LIMITS.sourceKind) || TASK_WORK_ITEM_SOURCE_KIND;

  return normalizeWorkCandidate({
    blockedReason: item.blocked_reason,
    candidateId: `${sourceKind}:tasks:${recordType}:${taskId}`,
    clientId: item.client_id,
    contextLabel: taskWorkItemContextLabel(item),
    createdAt: item.created_at,
    dueAt: firstNonEmptyValue(item.due_at_utc, item.due_at, item.due_date),
    handoffNote: item.resume_note,
    lastWorkedAt: item.last_worked_at,
    metadata: {
      assigned_to_current_user: item.assigned_to_current_user === true,
      checklist_progress: item.checklist_progress || item.checklistProgress || null,
      recurrence_instance_date: item.recurrence_instance_date || "",
      recurrence_template_id: item.recurrence_template_id || "",
      timer_status: item.timer_status || "",
    },
    moduleId: "tasks",
    nextAction: item.next_action,
    primaryAction: item.primary_action || openPrimaryAction(sourceUrl),
    priority: item.priority,
    projectId: item.project_id,
    reason: options.reason || taskWorkItemReason(item),
    recordId: taskId,
    recordType,
    sourceKind,
    sourceUrl,
    status: item.status,
    title,
    updatedAt: item.updated_at,
  });
}

/** @param {Record<string, unknown>} [row] */
function candidateFromResumeRow(row = {}) {
  const sourceUrl = safeUrl(row.source_url);
  const nextAction = textValue(row.next_action, TEXT_LIMITS.nextAction);
  const candidate = normalizeWorkCandidate({
    blockedReason: row.blocked_reason,
    candidateId: row.resume_state_id ? `${RESUME_SOURCE_KIND}:${row.resume_state_id}` : "",
    clientId: row.client_id,
    contextLabel: row.context_label_snapshot,
    createdAt: row.created_at,
    dismissedAt: row.dismissed_at,
    dueAt: row.due_at_snapshot,
    handoffNote: row.handoff_note,
    lastActionLabel: row.last_action_label,
    lastActionType: row.last_action_type,
    lastWorkedAt: row.last_worked_at,
    metadata: row.metadata,
    moduleId: row.module_id,
    nextAction,
    primaryAction: openPrimaryAction(sourceUrl),
    priority: row.priority_snapshot,
    projectId: row.project_id,
    rankHint: row.resume_rank_hint,
    recordId: row.record_id,
    recordType: row.record_type,
    resumeStateId: row.resume_state_id,
    sourceKind: RESUME_SOURCE_KIND,
    sourceUrl,
    status: row.status_snapshot,
    title: row.title_snapshot,
    updatedAt: row.updated_at,
  });

  return {
    ...candidate,
    reason: candidate.reason || resumeReason(candidate),
  };
}

/** @param {Record<string, unknown>} [item] */
function taskWorkItemContextLabel(item = {}) {
  return [item.client_name, item.project_name]
    .map((value) => textValue(value, 120))
    .filter(Boolean)
    .join(" / ");
}

/** @param {Record<string, unknown>} [item] */
function taskWorkItemReason(item = {}) {
  if (item.next_action) {
    return textValue(item.next_action, TEXT_LIMITS.reason);
  }
  if (item.blocked_reason) {
    return `Blocked: ${item.blocked_reason}`.slice(0, TEXT_LIMITS.reason);
  }
  if (item.due_at || item.due_at_utc || item.due_date) {
    return "Due work is ready to focus.";
  }

  return "Task work is ready to focus.";
}

/** @param {Record<string, unknown>} [timer] @param {CandidateQueryInput} [options] */
function candidateFromTimer(timer = {}, options = {}) {
  const resumeContext = objectValue(timer.resumeContext || timer.resume_context);
  const timerStatus = timer.timer_status === "running" || resumeContext.timerStatus === "running"
    ? "running"
    : "paused";
  const taskId = taskTimerSourceId(timer);
  const taskLifecycle = objectValue(options.taskLifecycle);
  const isTaskTimer = Boolean(taskId && taskLifecycle.readable);
  const timerSlot = textValue(timer.timer_slot, 80);
  const sourceUrl = safeUrl(timer.source_url) || (isTaskTimer
    ? `tasks.html?task=${encodeURIComponent(taskId)}`
    : "time-tracker.html");
  const description = textValue(timer.description, 240);
  const sourceLabel = textValue(timer.source_label || resumeContext.sourceLabel, 240);
  const title = sourceLabel || description || "Active timer";
  const contextLabel = [timer.client_name, timer.project_name]
    .map((value) => textValue(value, 120))
    .filter(Boolean)
    .join(" / ");
  const actionStatus = timerStatus === "running" ? "paused" : "running";

  return normalizeWorkCandidate({
    blockedReason: isTaskTimer && taskLifecycle.status === "blocked" ? "Blocked" : "",
    candidateId: `${LIVE_TIMER_SOURCE_KIND}:${timer.active_timer_id || timerSlot}`,
    clientId: timer.client_id || resumeContext.clientId,
    contextLabel,
    lastWorkedAt: timer.updated_at,
    metadata: {
      accumulated_elapsed_seconds: Number(timer.accumulated_elapsed_seconds) || 0,
      source_module_id: timer.source_module_id || resumeContext.sourceModuleId || "",
      source_id: timer.source_id || resumeContext.sourceId || "",
      source_type: timer.source_type || resumeContext.sourceType || "manual",
      timer_slot: timerSlot,
      timer_status: timerStatus,
    },
    moduleId: isTaskTimer ? "tasks" : "time-tracking",
    primaryAction: isTaskTimer
      ? openPrimaryAction(sourceUrl)
      : {
          id: timerStatus === "running" ? "timer.pause" : "timer.resume",
          label: timerStatus === "running" ? "Pause timer" : "Resume timer",
          method: "POST",
          params: { timerSlot },
          payload: { timer_status: actionStatus },
          route: `/api/active-timers/${encodeURIComponent(timerSlot)}/${timerStatus === "running" ? "pause" : "start"}`,
          type: "route",
        },
    projectId: timer.project_id || resumeContext.projectId,
    rankHint: timerStatus === "running" ? 1000 : 800,
    reason: timerStatus === "running" ? "Timer is running." : "Timer is paused.",
    recordId: isTaskTimer ? taskId : timer.active_timer_id,
    recordType: isTaskTimer ? "task" : "active_work_timer",
    sourceKind: LIVE_TIMER_SOURCE_KIND,
    sourceUrl,
    status: isTaskTimer ? taskLifecycle.status || "in_progress" : timerStatus,
    title,
    updatedAt: timer.updated_at,
  });
}

/** @param {Record<string, unknown>} [timer] */
function taskTimerSourceId(timer = {}) {
  const resumeContext = objectValue(timer.resumeContext || timer.resume_context);
  const sourceModuleId = textValue(timer.source_module_id || resumeContext.sourceModuleId, TEXT_LIMITS.moduleId);
  const sourceType = textValue(timer.source_type || resumeContext.sourceType, TEXT_LIMITS.recordType);

  if (sourceModuleId !== "tasks" || sourceType !== "task") {
    return "";
  }

  return textValue(timer.source_id || resumeContext.sourceId, TEXT_LIMITS.recordId);
}

/** @param {Record<string, unknown>} [input] @returns {WorkCandidate} */
function normalizeWorkCandidate(input = {}) {
  const picked = pickAllowedCandidateFields(input);
  const sourceUrl = safeUrl(firstValue(picked.sourceUrl, picked.source_url));
  const moduleId = textValue(firstValue(picked.moduleId, picked.module_id), TEXT_LIMITS.moduleId);
  const recordType = textValue(firstValue(picked.recordType, picked.record_type), TEXT_LIMITS.recordType);
  const recordId = textValue(firstValue(picked.recordId, picked.record_id), TEXT_LIMITS.recordId);
  const title = textValue(firstValue(picked.title, picked.titleSnapshot, picked.title_snapshot), TEXT_LIMITS.title) || "Untitled work";
  const nextAction = textValue(firstValue(picked.nextAction, picked.next_action), TEXT_LIMITS.nextAction);
  const lastActionLabel = textValue(firstValue(picked.lastActionLabel, picked.last_action_label), TEXT_LIMITS.lastActionLabel);
  const lastActionType = textValue(firstValue(picked.lastActionType, picked.last_action_type), TEXT_LIMITS.lastActionType);
  const blockedReason = textValue(firstValue(picked.blockedReason, picked.blocked_reason), TEXT_LIMITS.blockedReason);
  const contextLabel = textValue(firstValue(picked.contextLabel, picked.contextLabelSnapshot, picked.context_label_snapshot), TEXT_LIMITS.contextLabel);
  const reason = textValue(picked.reason, TEXT_LIMITS.reason) || defaultReason({
    blockedReason,
    lastActionLabel,
    nextAction,
  });
  const primaryAction = normalizePrimaryAction(picked.primaryAction, sourceUrl);

  return {
    blockedReason,
    candidateId: textValue(picked.candidateId, TEXT_LIMITS.candidateId) || candidateIdFor({
      moduleId,
      recordId,
      recordType,
      sourceKind: textValue(picked.sourceKind, TEXT_LIMITS.sourceKind),
    }),
    clientId: textValue(firstValue(picked.clientId, picked.client_id), TEXT_LIMITS.recordId),
    contextLabel,
    createdAt: textValue(firstValue(picked.createdAt, picked.created_at), TEXT_LIMITS.dueAt),
    dismissedAt: textValue(firstValue(picked.dismissedAt, picked.dismissed_at), TEXT_LIMITS.dueAt),
    dueAt: textValue(firstValue(picked.dueAt, picked.due_at_snapshot, picked.dueAtSnapshot), TEXT_LIMITS.dueAt),
    handoffNote: textValue(firstValue(picked.handoffNote, picked.handoff_note), TEXT_LIMITS.handoffNote),
    lastActionLabel,
    lastActionType,
    lastWorkedAt: textValue(firstValue(picked.lastWorkedAt, picked.last_worked_at), TEXT_LIMITS.dueAt),
    metadata: readSafeMetadata(picked),
    moduleId,
    nextAction,
    primaryAction,
    priority: textValue(firstValue(picked.priority, picked.prioritySnapshot, picked.priority_snapshot), TEXT_LIMITS.priority),
    projectId: textValue(firstValue(picked.projectId, picked.project_id), TEXT_LIMITS.recordId),
    rankHint: boundedInteger(firstValue(picked.rankHint, picked.resumeRankHint, picked.resume_rank_hint), 0, 1000),
    reason,
    recordId,
    recordType,
    resumeStateId: textValue(firstValue(picked.resumeStateId, picked.resume_state_id), TEXT_LIMITS.recordId),
    sourceKind: textValue(picked.sourceKind, TEXT_LIMITS.sourceKind),
    sourceUrl,
    status: textValue(firstValue(picked.status, picked.statusSnapshot, picked.status_snapshot), TEXT_LIMITS.status),
    title,
    updatedAt: textValue(firstValue(picked.updatedAt, picked.updated_at), TEXT_LIMITS.dueAt),
  };
}

/** @param {Record<string, unknown>} [input] @returns {Record<string, unknown>} */
function pickAllowedCandidateFields(input = {}) {
  /** @type {Record<string, unknown>} */
  const picked = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (!CANDIDATE_ALLOWED_FIELDS.has(key) || isForbiddenField(key)) {
      continue;
    }

    picked[key] = value;
  }

  return picked;
}

/**
 * @param {unknown} value
 * @param {string} sourceUrl
 * @returns {ActionDescriptor}
 */
function normalizePrimaryAction(value, sourceUrl) {
  const action = value && typeof value === "object" && !Array.isArray(value)
    ? sanitizeActionDescriptor(/** @type {Record<string, unknown>} */ (value))
    : {};

  if (!action.id) {
    action.id = DEFAULT_OPEN_ACTION_ID;
  }
  if (!action.label) {
    action.label = sourceUrl ? "Open work" : "Open";
  }
  if (!action.type) {
    action.type = sourceUrl ? "link" : "none";
  }
  if (!action.href && action.type === "link") {
    action.href = sourceUrl;
  }
  if (!action.href && !action.route && sourceUrl) {
    action.href = sourceUrl;
  }
  if (!action.href && !action.route) {
    action.disabled = true;
  }

  return action;
}

/** @param {Record<string, unknown>} [action] @returns {ActionDescriptor} */
function sanitizeActionDescriptor(action = {}) {
  /** @type {ActionDescriptor} */
  const sanitized = {};

  for (const [key, value] of Object.entries(action)) {
    if (!ALLOWED_ACTION_FIELDS.has(key) || isForbiddenField(key)) {
      continue;
    }

    if (key === "params" || key === "payload") {
      sanitized[key] = sanitizeMetadata(value) || {};
      continue;
    }

    if (key === "href" || key === "route") {
      sanitized[key] = safeUrl(value);
      continue;
    }

    if (key === "disabled") {
      sanitized.disabled = Boolean(value);
      continue;
    }

    if (key === "method") {
      const method = textValue(value, TEXT_LIMITS.method).toUpperCase();
      sanitized.method = ALLOWED_ACTION_METHODS.has(method) ? method : "GET";
      continue;
    }

    sanitized[key] = textValue(value, TEXT_LIMITS[key] || 160);
  }

  return sanitized;
}

/**
 * @param {string} sourceUrl
 */
function openPrimaryAction(sourceUrl) {
  return {
    disabled: !sourceUrl,
    href: sourceUrl,
    id: DEFAULT_OPEN_ACTION_ID,
    label: sourceUrl ? "Open work" : "Open",
    type: sourceUrl ? "link" : "none",
  };
}

/**
 * @param {{ blockedReason?: string | undefined; lastActionLabel?: string | undefined; nextAction?: string | undefined; } | undefined} candidate
 */
/** @param {CandidateShape} candidate */
function resumeReason(candidate) {
  if (candidate.nextAction) {
    return candidate.nextAction;
  }

  return defaultReason(candidate);
}

function defaultReason({ blockedReason = "", lastActionLabel = "", nextAction = "" } = {}) {
  if (nextAction) {
    return nextAction;
  }
  if (blockedReason) {
    return `Blocked: ${blockedReason}`.slice(0, TEXT_LIMITS.reason);
  }
  if (lastActionLabel) {
    return `Last activity: ${lastActionLabel}`.slice(0, TEXT_LIMITS.reason);
  }

  return "Recent work is ready to resume.";
}

/** @param {CandidateShape} [input] @returns {Record<string, unknown>} */
function readSafeMetadata(input = {}) {
  const metadata = firstValue(input.metadata, parseMetadataJson(firstValue(input.metadataJson, input.metadata_json)));
  const sanitized = sanitizeMetadata(metadata);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? /** @type {Record<string, unknown>} */ (sanitized)
    : {};
}

/** @param {WorkspaceRequestSession} session @returns {Promise<CandidateSourceContext>} */
async function readCandidateSourceContext(session) {
  if (!session?.workspace_id) {
    return {
      manualTimerSourceAvailable: false,
      timerSourceKeys: new Set(),
      workItemSourceKeys: new Set(),
    };
  }

  const [timerSources, workItemSources] = await Promise.all([
    modulesService.listTimerSources(session.workspace_id, session),
    modulesService.listWorkItemSources(session.workspace_id, session),
  ]);
  const timerSourceKeys = new Set(timerSources.map((source) => contributionSourceKey(source)));
  const workItemSourceKeys = new Set(workItemSources.map((source) => contributionSourceKey(source)));

  return {
    manualTimerSourceAvailable: timerSourceKeys.has("time-tracking:manual"),
    timerSourceKeys,
    workItemSourceKeys,
  };
}

/** @param {CandidateShape} candidate @param {CandidateSourceContext} sourceContext */
function isCandidateSourceAvailable(candidate, sourceContext) {
  if (candidate.sourceKind === LIVE_TIMER_SOURCE_KIND) {
    const sourceKey = timerCandidateSourceKey(candidate);
    return sourceKey === "time-tracking:manual"
      ? sourceContext.manualTimerSourceAvailable
      : sourceContext.timerSourceKeys.has(sourceKey);
  }

  if (isTimerCandidate(candidate)) {
    return sourceContext.timerSourceKeys.has(timerCandidateSourceKey(candidate));
  }

  return sourceContext.workItemSourceKeys.has(candidateContributionKey(candidate));
}

/**
 * @param {import("../types/framework-contracts.js").WorkCandidate | { reason: string; candidateId: string; sourceKind: string; recordType: string; recordId: string; moduleId: string; title: string; status?: string | undefined; priority?: string | undefined; clientId?: string | undefined; projectId?: string | undefined; contextLabel?: string | undefined; blockedReason?: string | undefined; nextAction?: string | undefined; handoffNote?: string | undefined; lastActionLabel?: string | undefined; lastActionType?: string | undefined; lastWorkedAt?: string | undefined; dueAt?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined; dismissedAt?: string | undefined; resumeStateId?: string | undefined; rankHint?: string | number | undefined; sourceUrl?: string | undefined; primaryAction?: { [key: string]: unknown; id?: string | undefined; label?: string | undefined; type?: string | undefined; href?: string | undefined; route?: string | undefined; } | null | undefined; metadata?: Record<string, unknown> | undefined; } | null} candidate
 */
/** @param {CandidateShape} candidate @param {CandidateQueryInput} [query] */
function matchesCandidateQuery(candidate, query = {}) {
  const normalizedQuery = normalizeListQuery(query);

  return matchesTextFilter(candidate.moduleId, normalizedQuery.moduleId) &&
    matchesTextFilter(candidate.recordType, normalizedQuery.recordType) &&
    matchesClientScopeFilter(candidate, normalizedQuery) &&
    matchesProjectScopeFilter(candidate, normalizedQuery) &&
    matchesStatusFilters(candidate, normalizedQuery) &&
    matchesExcludedStatusFilters(candidate, normalizedQuery) &&
    matchesDueDateFilters(candidate, normalizedQuery) &&
    matchesPassiveRecurringCreated(candidate, normalizedQuery) &&
    matchesDistantCreationOnly(candidate, normalizedQuery) &&
    matchesDistantCreationOnlyFallback(candidate, normalizedQuery) &&
    matchesRankBucketFilters(candidate, normalizedQuery);
}

/** @param {CandidateQueryInput} [query] @param {{timezone?: unknown}} [options] @returns {CandidateQuery} */
function normalizeListQuery(query = {}, options = {}) {
  if (query?.[NORMALIZED_QUERY_MARKER]) {
    return /** @type {CandidateQuery} */ (query);
  }

  const edgeQuery = /** @type {CandidateQueryInput} */ (parseWorkCandidateQueryEdge(query));
  const flattenedQuery = flattenFocusQuery(edgeQuery);
  const timezone = textValue(firstValue(flattenedQuery.timezone, options.timezone), 80) || DEFAULT_TIMEZONE;

  return {
    [NORMALIZED_QUERY_MARKER]: true,
    clientId: textValue(firstValue(flattenedQuery.clientId, flattenedQuery.client_id), 160),
    clientIds: normalizeIdList(firstValue(flattenedQuery.clientIds, flattenedQuery.client_ids)),
    clientProjectIds: normalizeIdList(firstValue(flattenedQuery.clientProjectIds, flattenedQuery.client_project_ids)),
    dueBefore: dateKeyFrom(firstValue(flattenedQuery.dueBefore, flattenedQuery.due_before), timezone),
    excludeStatusFilters: normalizeTextList(firstValue(
      flattenedQuery.excludeStatusFilters,
      flattenedQuery.exclude_status_filters,
      flattenedQuery.excludeStatuses,
      flattenedQuery.exclude_statuses,
    )),
    excludePassiveRecurringCreated: booleanFlag(firstValue(
      flattenedQuery.excludePassiveRecurringCreated,
      flattenedQuery.exclude_passive_recurring_created,
    )),
    excludePassiveRecurringCreatedAlways: booleanFlag(firstValue(
      flattenedQuery.excludePassiveRecurringCreatedAlways,
      flattenedQuery.exclude_passive_recurring_created_always,
    )),
    excludeDistantCreationOnly: booleanFlag(firstValue(
      flattenedQuery.excludeDistantCreationOnly,
      flattenedQuery.exclude_distant_creation_only,
    )),
    distantCreationOnlyFallback: booleanFlag(firstValue(
      flattenedQuery.distantCreationOnlyFallback,
      flattenedQuery.distant_creation_only_fallback,
    )),
    dueFrom: dateKeyFrom(firstValue(flattenedQuery.dueFrom, flattenedQuery.due_from), timezone),
    dueOn: dateKeyFrom(firstValue(flattenedQuery.dueOn, flattenedQuery.due_on), timezone),
    dueTo: dateKeyFrom(firstValue(flattenedQuery.dueTo, flattenedQuery.due_to), timezone),
    includeTaskCandidates: booleanFlag(firstValue(
      flattenedQuery.includeTaskCandidates,
      flattenedQuery.include_task_candidates,
    )),
    limit: boundedInteger(flattenedQuery.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    mode: textValue(flattenedQuery.mode, 40) || "left_off",
    moduleId: textValue(firstValue(flattenedQuery.moduleId, flattenedQuery.module_id), TEXT_LIMITS.moduleId),
    projectId: textValue(firstValue(flattenedQuery.projectId, flattenedQuery.project_id), 160),
    projectIds: normalizeIdList(firstValue(flattenedQuery.projectIds, flattenedQuery.project_ids)),
    rankBuckets: normalizeTextList(firstValue(
      flattenedQuery.rankBuckets,
      flattenedQuery.rank_buckets,
      flattenedQuery.bucketIds,
      flattenedQuery.bucket_ids,
    )),
    recordType: textValue(firstValue(flattenedQuery.recordType, flattenedQuery.record_type), TEXT_LIMITS.recordType),
    sort: normalizeSortMode(firstValue(flattenedQuery.sort, flattenedQuery.orderBy, flattenedQuery.order_by)),
    statusFilters: normalizeTextList(firstValue(
      flattenedQuery.statusFilters,
      flattenedQuery.status_filters,
      flattenedQuery.statuses,
      flattenedQuery.status,
    )),
    timezone,
    today: dateKeyFrom(firstValue(flattenedQuery.today, flattenedQuery.todayDate, flattenedQuery.today_date), timezone),
  };
}

/** @param {unknown} value @param {unknown} filter */
function matchesTextFilter(value, filter) {
  return !filter || String(value || "") === filter;
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesClientScopeFilter(candidate, query) {
  const scopedClientIds = Array.isArray(query.clientIds) ? query.clientIds : [];
  const scopedProjectIds = Array.isArray(query.clientProjectIds) ? query.clientProjectIds : [];

  if (scopedClientIds.length > 0 || scopedProjectIds.length > 0) {
    return scopedClientIds.includes(String(candidate.clientId || "")) ||
      scopedProjectIds.includes(String(candidate.projectId || ""));
  }

  return matchesTextFilter(candidate.clientId, query.clientId);
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesProjectScopeFilter(candidate, query) {
  const scopedProjectIds = Array.isArray(query.projectIds) ? query.projectIds : [];

  if (scopedProjectIds.length > 0) {
    return scopedProjectIds.includes(String(candidate.projectId || ""));
  }

  return matchesTextFilter(candidate.projectId, query.projectId);
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesStatusFilters(candidate, query) {
  if (!query.statusFilters.length) {
    return true;
  }

  const statusValues = candidateStatusValues(candidate, query);
  return query.statusFilters.some((/** @type {string} */ status) => statusValues.has(status));
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesExcludedStatusFilters(candidate, query) {
  if (!query.excludeStatusFilters.length) {
    return true;
  }

  const statusValues = candidateStatusValues(candidate, query);
  return !query.excludeStatusFilters.some((/** @type {string} */ status) => statusValues.has(status));
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesDueDateFilters(candidate, query) {
  if (!query.dueBefore && !query.dueFrom && !query.dueOn && !query.dueTo) {
    return true;
  }

  const dueDateKey = dateKeyFrom(candidate.dueAt, query.timezone);

  if (!dueDateKey) {
    return false;
  }
  if (query.dueOn && dueDateKey !== query.dueOn) {
    return false;
  }
  if (query.dueFrom && dueDateKey < query.dueFrom) {
    return false;
  }
  if (query.dueTo && dueDateKey > query.dueTo) {
    return false;
  }
  if (query.dueBefore && dueDateKey >= query.dueBefore) {
    return false;
  }

  return true;
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesRankBucketFilters(candidate, query) {
  const rankBuckets = Array.isArray(query.rankBuckets) ? query.rankBuckets : [];
  if (!rankBuckets.length) {
    return true;
  }

  if (rankBuckets.includes(resolveWorkCandidateRankBucket(candidate, query))) {
    return true;
  }

  return rankBuckets.includes(WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched) &&
    isNearDueRecurringCreatedCandidate(candidate, rankContext(query));
}

/** @param {CandidateShape} candidate @param {CandidateQueryInput} [options] */
function resolveWorkCandidateRankBucket(candidate, options = {}) {
  return candidateRankFacts(normalizeWorkCandidate(candidate), rankContext(options)).bucketId;
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function candidateStatusValues(candidate, query) {
  const statusValues = new Set([
    candidate.status,
    candidate.metadata?.timer_status,
    candidate.metadata?.timerStatus,
  ].map(normalizeFilterToken).filter(Boolean));
  const context = {
    ...rankContext(query),
    lastActivityDateKey: dateKeyFrom(
      candidate.lastWorkedAt || candidate.updatedAt || candidate.createdAt,
      query.timezone,
    ),
  };

  if (candidate.blockedReason) {
    statusValues.add("blocked");
  }
  if (isStaleWork(context.lastActivityDateKey, context.staleBeforeDateKey)) {
    statusValues.add("stale");
  }

  return statusValues;
}

/** @param {CandidateQueryInput} [query] @returns {CandidateQueryInput} */
function flattenFocusQuery(query = {}) {
  const focusContext = objectValue(firstValue(query.focusContext, query.focus_context));
  const candidateQuery = objectValue(firstValue(focusContext.candidateQuery, focusContext.candidate_query));
  const filters = objectValue(firstValue(
    focusContext.filters,
    focusContext.candidateFilters,
    focusContext.candidate_filters,
  ));

  return {
    ...candidateQuery,
    ...filters,
    ...query,
  };
}

/**
 * @param {import("../types/framework-contracts.js").WorkCandidate | { reason: string; candidateId: string; sourceKind: string; recordType: string; recordId: string; moduleId: string; title: string; status?: string | undefined; priority?: string | undefined; clientId?: string | undefined; projectId?: string | undefined; contextLabel?: string | undefined; blockedReason?: string | undefined; nextAction?: string | undefined; handoffNote?: string | undefined; lastActionLabel?: string | undefined; lastActionType?: string | undefined; lastWorkedAt?: string | undefined; dueAt?: string | undefined; createdAt?: string | undefined; updatedAt?: string | undefined; dismissedAt?: string | undefined; resumeStateId?: string | undefined; rankHint?: string | number | undefined; sourceUrl?: string | undefined; primaryAction?: { [key: string]: unknown; id?: string | undefined; label?: string | undefined; type?: string | undefined; href?: string | undefined; route?: string | undefined; } | null | undefined; metadata?: Record<string, unknown> | undefined; } | null} candidate
 */
/** @param {CandidateShape} candidate */
function candidateSourceKey(candidate) {
  return [
    candidate.moduleId,
    candidate.recordType,
    candidate.recordId,
  ].join(":");
}

/** @param {CandidateShape} candidate @param {RankContext} context @returns {RankFacts} */
function candidateRankFacts(candidate, context) {
  const dueDateKey = dateKeyFrom(candidate.dueAt, context.timezone);
  const dueTime = optionalDateTimeValue(candidate.dueAt);
  const lastActivityDateKey = dateKeyFrom(
    candidate.lastWorkedAt || candidate.updatedAt || candidate.createdAt,
    context.timezone,
  );
  const lastActivityTime = dateTimeValue(candidate.lastWorkedAt || candidate.updatedAt || candidate.createdAt);
  const bucket = rankBucket(candidate, {
    ...context,
    dueDateKey,
    lastActivityDateKey,
  });

  return {
    bucket,
    bucketId: RANK_BUCKET_ID_BY_VALUE[bucket] || WORK_CANDIDATE_RANK_BUCKETS.later,
    dueDateKey,
    dueTime,
    lastActivityDateKey,
    lastActivityTime,
    priorityRank: /** @type {Record<string, number>} */ (PRIORITY_RANKS)[String(candidate.priority || "").toLowerCase()] || 0,
    rankHint: Number.parseInt(String(candidate.rankHint ?? ""), 10) || 0,
    sort: context.sort,
  };
}

/**
 * @param {{ metadata: {}; }} candidate
 * @param {{ dueDateKey: number; today: number; lastActivityDateKey: string | number; recentSinceDateKey: number; dueThisWeekEndDateKey: number; }} context
 */
/** @param {CandidateShape} candidate @param {RankContext & {dueDateKey: string, lastActivityDateKey: string}} context */
function rankBucket(candidate, context) {
  if (isRunningTimer(candidate)) {
    return RANK_BUCKETS.runningTimer;
  }
  if (isPausedTimer(candidate)) {
    return RANK_BUCKETS.pausedTimer;
  }
  if (isOverdueWork(context.dueDateKey, context.today) && isAssignedOrAssignmentUnknown(candidate)) {
    return RANK_BUCKETS.overdueAssignedWork;
  }
  if (context.dueDateKey && context.dueDateKey === context.today) {
    return RANK_BUCKETS.dueToday;
  }
  if (isBlockedOrStaleWork(candidate, context)) {
    return RANK_BUCKETS.blockedOrStale;
  }
  if (isRecentlyTouched(context.lastActivityDateKey, context.recentSinceDateKey, context.today)) {
    if (isPassiveRecurringCreatedCandidate(candidate) && !isWithinRecurringCreatedDueWindow(candidate, context)) {
      return isDueThisWeek(context.dueDateKey, context.today, context.dueThisWeekEndDateKey)
        ? RANK_BUCKETS.dueThisWeek
        : RANK_BUCKETS.later;
    }

    return RANK_BUCKETS.recentlyTouched;
  }
  if (isDueThisWeek(context.dueDateKey, context.today, context.dueThisWeekEndDateKey)) {
    return RANK_BUCKETS.dueThisWeek;
  }

  return RANK_BUCKETS.later;
}

/** @param {RankedCandidate} left @param {RankedCandidate} right */
function compareRankedCandidates(left, right) {
  if (left.facts.sort === WORK_CANDIDATE_SORTS.dueDatetime) {
    return compareDueDatetimeCandidates(left, right);
  }
  if (left.facts.sort === WORK_CANDIDATE_SORTS.resume) {
    return compareResumeCandidates(left, right);
  }

  return left.facts.bucket - right.facts.bucket ||
    right.facts.rankHint - left.facts.rankHint ||
    compareOptionalText(left.facts.dueDateKey, right.facts.dueDateKey) ||
    right.facts.priorityRank - left.facts.priorityRank ||
    right.facts.lastActivityTime - left.facts.lastActivityTime ||
    left.candidate.title.localeCompare(right.candidate.title) ||
    left.candidate.candidateId.localeCompare(right.candidate.candidateId) ||
    left.index - right.index;
}

/** @param {RankedCandidate} left @param {RankedCandidate} right */
function compareResumeCandidates(left, right) {
  return resumePrecedence(left.candidate) - resumePrecedence(right.candidate) ||
    right.facts.priorityRank - left.facts.priorityRank ||
    right.facts.rankHint - left.facts.rankHint ||
    right.facts.lastActivityTime - left.facts.lastActivityTime ||
    compareOptionalText(left.facts.dueDateKey, right.facts.dueDateKey) ||
    left.candidate.title.localeCompare(right.candidate.title) ||
    left.candidate.candidateId.localeCompare(right.candidate.candidateId) ||
    left.index - right.index;
}

/** @param {RankedCandidate} left @param {RankedCandidate} right */
function compareDueDatetimeCandidates(left, right) {
  return compareOptionalText(left.facts.dueDateKey, right.facts.dueDateKey) ||
    compareOptionalNumber(left.facts.dueTime, right.facts.dueTime) ||
    left.facts.bucket - right.facts.bucket ||
    right.facts.rankHint - left.facts.rankHint ||
    right.facts.priorityRank - left.facts.priorityRank ||
    right.facts.lastActivityTime - left.facts.lastActivityTime ||
    left.candidate.title.localeCompare(right.candidate.title) ||
    left.candidate.candidateId.localeCompare(right.candidate.candidateId) ||
    left.index - right.index;
}

/** @param {CandidateShape} candidate */
function isRunningTimer(candidate) {
  return isTimerCandidate(candidate) && [
    candidate.status,
    candidate.metadata?.timer_status,
    candidate.metadata?.timerStatus,
  ].some((value) => ["active", "running"].includes(String(value || "").toLowerCase()));
}

/** @param {CandidateShape} candidate */
function isPausedTimer(candidate) {
  return isTimerCandidate(candidate) && [
    candidate.status,
    candidate.metadata?.timer_status,
    candidate.metadata?.timerStatus,
  ].some((value) => String(value || "").toLowerCase() === "paused");
}

/** @param {CandidateShape} candidate */
function isTimerCandidate(candidate) {
  return candidate.recordType === "active_work_timer" ||
    String(candidate.metadata?.timer_status || candidate.metadata?.timerStatus || "").trim() !== "";
}

/**
 * @param {{ moduleId: string; recordType: string; }} candidate
 */
/** @param {CandidateShape} candidate */
function resumePrecedence(candidate) {
  if (isRunningTimer(candidate)) {
    return 10;
  }
  if (isPausedTimer(candidate)) {
    return 20;
  }
  if (isTaskCandidate(candidate) && hasResumeNote(candidate)) {
    return 30;
  }
  if (isTaskCandidate(candidate) && isInProgressTask(candidate)) {
    return 40;
  }

  return 50;
}

/**
 * @param {{ moduleId: string; recordType: string; }} candidate
 */
/** @param {CandidateShape} candidate */
function isTaskCandidate(candidate) {
  return candidate.moduleId === "tasks" && candidate.recordType === "task";
}

/** @param {CandidateShape} candidate */
function hasResumeNote(candidate) {
  return Boolean(textValue(
    candidate.handoffNote || candidate.metadata?.resume_note || candidate.metadata?.resumeNote,
    TEXT_LIMITS.handoffNote,
  ));
}

/** @param {CandidateShape} candidate */
function isInProgressTask(candidate) {
  return normalizeFilterToken(candidate.status) === "in_progress";
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesPassiveRecurringCreated(candidate, query) {
  if (!query.excludePassiveRecurringCreated || !isPassiveRecurringCreatedCandidate(candidate)) {
    return true;
  }

  return !query.excludePassiveRecurringCreatedAlways &&
    isOverdueOrWithinRecurringCreatedDueWindow(candidate, rankContext(query));
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesDistantCreationOnly(candidate, query) {
  if (!query.excludeDistantCreationOnly || !isCreationOnlyTaskCandidate(candidate)) {
    return true;
  }

  const context = rankContext(query);
  const dueDateKey = dateKeyFrom(
    candidate.dueAt || candidate.metadata?.recurrence_instance_date || candidate.metadata?.recurrenceInstanceDate,
    context.timezone,
  );

  return !dueDateKey || daysBetweenDateKeys(context.today, dueDateKey) <= DUE_THIS_WEEK_DAYS;
}

/** @param {CandidateShape} candidate @param {CandidateQuery} query */
function matchesDistantCreationOnlyFallback(candidate, query) {
  if (!query.distantCreationOnlyFallback || !isTaskCandidate(candidate)) {
    return true;
  }

  if (isPassiveRecurringCreatedCandidate(candidate) || !isCreationOnlyTaskCandidate(candidate)) {
    return false;
  }

  const context = rankContext(query);
  const dueDateKey = dateKeyFrom(candidate.dueAt, context.timezone);
  return Boolean(dueDateKey && daysBetweenDateKeys(context.today, dueDateKey) > DUE_THIS_WEEK_DAYS);
}

/** @param {CandidateShape} candidate @param {RankContext} context */
function isNearDueRecurringCreatedCandidate(candidate, context) {
  return isPassiveRecurringCreatedCandidate(candidate) &&
    isOverdueOrWithinRecurringCreatedDueWindow(candidate, context) &&
    isRecentlyTouched(
      dateKeyFrom(candidate.lastWorkedAt || candidate.updatedAt || candidate.createdAt, context.timezone),
      context.recentSinceDateKey,
      context.today,
    );
}

/**
 * @param {{ metadata: {}; }} candidate
 */
/** @param {CandidateShape} candidate */
function isPassiveRecurringCreatedCandidate(candidate) {
  return isCreationOnlyTaskCandidate(candidate) && isRecurringTaskCandidate(candidate);
}

/** @param {CandidateShape} candidate */
function isCreationOnlyTaskCandidate(candidate) {
  return isTaskCandidate(candidate) &&
    isTaskCreatedSignal(candidate) &&
    !hasResumeNote(candidate) &&
    !candidate.nextAction &&
    !isTimerCandidate(candidate) &&
    !isInProgressTask(candidate);
}

/**
 * @param {{ metadata: {}; }} candidate
 */
/** @param {CandidateShape} candidate */
function isRecurringTaskCandidate(candidate) {
  const metadata = candidate.metadata || {};

  return Boolean(
    metadata.recurrence_template_id ||
      metadata.recurrenceTemplateId ||
      metadata.recurrence_instance_date ||
      metadata.recurrenceInstanceDate,
  );
}

/** @param {CandidateShape} candidate */
function isTaskCreatedSignal(candidate) {
  const actionType = normalizeFilterToken(candidate.lastActionType);
  const actionLabel = normalizeFilterToken(candidate.lastActionLabel);

  return actionType === "task.created" ||
    actionType === "task_created" ||
    actionLabel === "task_created" ||
    isPassiveTaskWorkItemCandidate(candidate);
}

/** @param {CandidateShape} candidate */
function isPassiveTaskWorkItemCandidate(candidate) {
  return candidate.sourceKind === TASK_WORK_ITEM_SOURCE_KIND &&
    normalizeFilterToken(candidate.status) === "open" &&
    !candidate.nextAction &&
    !candidate.handoffNote &&
    !textValue(candidate.metadata?.timer_status || candidate.metadata?.timerStatus, TEXT_LIMITS.status);
}

/** @param {CandidateShape} candidate @param {RankContext} context */
function isOverdueOrWithinRecurringCreatedDueWindow(candidate, context) {
  const dueDateKey = dateKeyFrom(
    candidate.dueAt || candidate.metadata?.recurrence_instance_date || candidate.metadata?.recurrenceInstanceDate,
    context.timezone,
  );

  return isOverdueWork(dueDateKey, context.today) || isWithinRecurringCreatedDueWindow(candidate, context);
}

/** @param {CandidateShape} candidate @param {RankContext} context */
function isWithinRecurringCreatedDueWindow(candidate, context) {
  const dueDateKey = dateKeyFrom(
    candidate.dueAt || candidate.metadata?.recurrence_instance_date || candidate.metadata?.recurrenceInstanceDate,
    context.timezone,
  );
  const dayDistance = daysBetweenDateKeys(context.today, dueDateKey);

  return Number.isFinite(dayDistance) && Math.abs(dayDistance) <= 1;
}

/**
 * @param {{ metadata: {}; }} candidate
 */
/** @param {CandidateShape} candidate */
function isAssignedOrAssignmentUnknown(candidate) {
  const metadata = candidate.metadata || {};

  if (Object.hasOwn(metadata, "assigned_to_current_user")) {
    return metadata.assigned_to_current_user === true;
  }
  if (Object.hasOwn(metadata, "assignedToCurrentUser")) {
    return metadata.assignedToCurrentUser === true;
  }

  return true;
}

/** @param {CandidateShape} candidate @param {RankContext & {lastActivityDateKey: string}} context */
function isBlockedOrStaleWork(candidate, context) {
  const status = String(candidate.status || "").toLowerCase();

  return Boolean(candidate.blockedReason) ||
    status === "blocked" ||
    status === "stale" ||
    isStaleWork(context.lastActivityDateKey, context.staleBeforeDateKey);
}

/**
 * @param {string} lastActivityDateKey
 * @param {string} staleBeforeDateKey
 */
function isStaleWork(lastActivityDateKey, staleBeforeDateKey) {
  return Boolean(lastActivityDateKey && lastActivityDateKey < staleBeforeDateKey);
}

/**
 * @param {string} dueDateKey
 * @param {string} today
 */
function isOverdueWork(dueDateKey, today) {
  return Boolean(dueDateKey && dueDateKey < today);
}

/**
 * @param {string} lastActivityDateKey
 * @param {string} recentSinceDateKey
 * @param {string} today
 */
function isRecentlyTouched(lastActivityDateKey, recentSinceDateKey, today) {
  return Boolean(lastActivityDateKey && lastActivityDateKey >= recentSinceDateKey && lastActivityDateKey <= today);
}

/**
 * @param {string} dueDateKey
 * @param {string} today
 * @param {string} dueThisWeekEndDateKey
 */
function isDueThisWeek(dueDateKey, today, dueThisWeekEndDateKey) {
  return Boolean(dueDateKey && dueDateKey > today && dueDateKey <= dueThisWeekEndDateKey);
}

/** @param {CandidateQueryInput} [options] @returns {RankContext} */
function rankContext(options = {}) {
  const timezone = textValue(options.timezone, 80) || DEFAULT_TIMEZONE;
  const now = options.now instanceof Date
    ? options.now
    : new Date(typeof options.now === "string" || typeof options.now === "number"
      ? options.now
      : Date.now());
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const today = dateKeyFrom(options.today, timezone) || localDateKey(safeNow, timezone);

  return {
    dueThisWeekEndDateKey: addCalendarDaysKey(today, DUE_THIS_WEEK_DAYS),
    recentSinceDateKey: addCalendarDaysKey(today, -RECENTLY_TOUCHED_DAYS),
    sort: normalizeSortMode(options.sort) || WORK_CANDIDATE_SORTS.ranked,
    staleBeforeDateKey: addCalendarDaysKey(today, -STALE_DAYS),
    timezone,
    today,
  };
}

/** @param {CandidateShape} candidate */
function candidateContributionKey(candidate) {
  return `${candidate.moduleId}:${candidate.recordType}`;
}

/** @param {Record<string, unknown>} [source] */
function contributionSourceKey(source = {}) {
  return `${textValue(source.moduleId, TEXT_LIMITS.moduleId)}:${textValue(source.sourceType, TEXT_LIMITS.recordType)}`;
}

/** @param {CandidateShape} candidate */
function timerCandidateSourceKey(candidate) {
  const sourceType = textValue(
    candidate.metadata?.source_type || candidate.metadata?.sourceType,
    TEXT_LIMITS.recordType,
  ) || "manual";

  return `${candidate.moduleId}:${sourceType}`;
}

/** @param {{ moduleId?: string, recordId?: string, recordType?: string, sourceKind?: string }} [parts] */
function candidateIdFor({ moduleId, recordId, recordType, sourceKind } = {}) {
  const prefix = textValue(sourceKind, TEXT_LIMITS.sourceKind) || "candidate";
  return `${prefix}:${moduleId}:${recordType}:${recordId}`.slice(0, TEXT_LIMITS.candidateId);
}

/**
 * @param {unknown} value
 */
function parseMetadataJson(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {unknown} value */
function normalizeTextList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");

  return [...new Set(rawValues
    .map((item) => normalizeFilterToken(item))
    .filter(Boolean))];
}

/** @param {unknown} value */
function normalizeIdList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");

  return [...new Set(rawValues
    .map((item) => textValue(item, TEXT_LIMITS.recordId))
    .filter(Boolean))];
}

/** @param {unknown} value */
function normalizeSortMode(value) {
  const sort = normalizeFilterToken(value);
  const supportedSorts = /** @type {string[]} */ (Object.values(WORK_CANDIDATE_SORTS));
  return supportedSorts.includes(sort) ? sort : "";
}

/**
 * @param {unknown} value
 */
function normalizeFilterToken(value) {
  return textValue(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * @param {unknown} value
 */
function dateKeyFrom(value, timezone = DEFAULT_TIMEZONE) {
  const text = textValue(value, 80);

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }

  return localDateKey(parsed, timezone);
}

/**
 * @param {unknown} value
 */
function dateTimeValue(value) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return 0;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

/**
 * @param {unknown} value
 */
function optionalDateTimeValue(value) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

/**
 * @param {number | Date | undefined} date
 */
function localDateKey(date, timezone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * @param {string} dateKey
 * @param {number} days
 */
function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** @param {string} left @param {string} right */
function compareOptionalText(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
}

/**
 * @param {number | null} left
 * @param {number | null} right
 */
function compareOptionalNumber(left, right) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  return left - right;
}

/**
 * @param {string} left
 * @param {string} right
 */
function daysBetweenDateKeys(left, right) {
  if (!left || !right) {
    return Number.NaN;
  }

  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return Number.NaN;
  }

  return Math.round((rightTime - leftTime) / 86400000);
}

/**
 * @param {unknown} value
 */
function safeUrl(value) {
  const url = textValue(value, TEXT_LIMITS.sourceUrl);

  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || /^\/\//.test(url)) {
    return "";
  }

  return url;
}

/** @param {...unknown} values @returns {unknown} */
function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

/** @param {...unknown} values @returns {unknown} */
function firstNonEmptyValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function optionalContextFilter(key, value) {
  const text = textValue(value, TEXT_LIMITS.recordId);
  return text ? { [key]: text } : {};
}

/** @param {CandidateQueryInput} [query] @returns {CandidateQueryInput} */
function stripScopeFilters(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return {};
  }

  const rest = { ...query };

  for (const key of [
    "clientId",
    "client_id",
    "clientIds",
    "client_ids",
    "clientProjectIds",
    "client_project_ids",
    "projectId",
    "project_id",
    "projectIds",
    "project_ids",
  ]) {
    delete rest[key];
  }

  return rest;
}

/**
 * @param {unknown} value
 */
function textValue(value, limit = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function boundedInteger(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

/** @param {unknown} value */
function booleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

const workCandidateServiceInternal = {
  listLiveTimerCandidates,
  listResumeCandidates,
  listWorkCandidates,
  normalizeWorkCandidate,
  rankWorkCandidates,
  readSecondMostRecentUpdatedTaskCandidate,
  resolveWorkCandidateRankBucket,
};

const workCandidateService = workCandidateServiceInternal;

export {
  candidateFromResumeRow,
  candidateFromTaskWorkItem,
  candidateFromTimer,
  normalizeListQuery,
  normalizeWorkCandidate,
  rankWorkCandidates,
  readSecondMostRecentUpdatedTaskCandidate,
  resolveWorkCandidateRankBucket,
  WORK_CANDIDATE_RANK_BUCKETS,
  WORK_CANDIDATE_SORTS,
  workCandidateService,
};
