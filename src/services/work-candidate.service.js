import { modulesService } from "../core/modules/modules.service.js";
import { activeTimersService } from "../modules/time-tracking/active-timers.service.js";
import {
  ALLOWED_PAYLOAD_FIELDS,
  isForbiddenField,
  sanitizeMetadata,
} from "./work-resume-state-producers.js";
import { workResumeStateService } from "./work-resume-state.service.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
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
const RECENTLY_TOUCHED_DAYS = 2;
const RESUME_SOURCE_KIND = "resume_state";
const STALE_DAYS = 7;

async function listResumeCandidates(session, query = {}) {
  const normalizedQuery = normalizeListQuery(query);
  const result = await workResumeStateService.listResumeState(session, query);
  const candidates = (result.items || [])
    .map((row) => candidateFromResumeRow(row))
    .filter((candidate) => matchesCandidateQuery(candidate, normalizedQuery));

  return {
    items: candidates.slice(0, normalizedQuery.limit),
    mode: result.mode || normalizedQuery.mode,
  };
}

async function listWorkCandidates(session, query = {}) {
  const normalizedQuery = normalizeListQuery(query);
  const sourceContext = await readCandidateSourceContext(session);
  const [resumeResult, liveTimers] = await Promise.all([
    listResumeCandidates(session, { ...query, limit: Math.min(MAX_LIMIT, normalizedQuery.limit * 4) }),
    listLiveTimerCandidates(session, normalizedQuery, sourceContext),
  ]);
  const bySource = new Map();

  for (const candidate of [...liveTimers, ...(resumeResult.items || [])]) {
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
      timezone: session?.timezone,
    }).slice(0, normalizedQuery.limit),
    mode: resumeResult.mode || normalizedQuery.mode,
  };
}

async function listLiveTimerCandidates(session, query = {}, sourceContext = null) {
  const normalizedQuery = normalizeListQuery(query);
  const resolvedSourceContext = sourceContext || await readCandidateSourceContext(session);

  if (!resolvedSourceContext.manualTimerSourceAvailable) {
    return [];
  }

  const result = await activeTimersService.listAll(session);
  return (result.timers || [])
    .map((timer) => candidateFromTimer(timer))
    .filter((candidate) => matchesCandidateQuery(candidate, normalizedQuery));
}

function rankWorkCandidates(candidates = [], options = {}) {
  const context = rankContext(options);

  return [...candidates]
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

function candidateFromTimer(timer = {}) {
  const resumeContext = timer.resumeContext || timer.resume_context || {};
  const timerStatus = timer.timer_status === "running" || resumeContext.timerStatus === "running"
    ? "running"
    : "paused";
  const timerSlot = textValue(timer.timer_slot, 80);
  const sourceUrl = safeUrl(timer.source_url) || "time-tracker.html";
  const description = textValue(timer.description, 240);
  const sourceLabel = textValue(timer.source_label || resumeContext.sourceLabel, 240);
  const title = sourceLabel || description || "Active timer";
  const contextLabel = [timer.client_name, timer.project_name]
    .map((value) => textValue(value, 120))
    .filter(Boolean)
    .join(" / ");
  const actionStatus = timerStatus === "running" ? "paused" : "running";

  return normalizeWorkCandidate({
    candidateId: `${LIVE_TIMER_SOURCE_KIND}:${timer.active_timer_id || timerSlot}`,
    clientId: timer.client_id || resumeContext.clientId,
    contextLabel,
    lastWorkedAt: timer.updated_at,
    metadata: {
      accumulated_elapsed_seconds: Number(timer.accumulated_elapsed_seconds) || 0,
      source_module_id: timer.source_module_id || resumeContext.sourceModuleId || "",
      source_type: timer.source_type || resumeContext.sourceType || "manual",
      timer_slot: timerSlot,
      timer_status: timerStatus,
    },
    moduleId: "time-tracking",
    primaryAction: {
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
    recordId: timer.active_timer_id,
    recordType: "active_work_timer",
    sourceKind: LIVE_TIMER_SOURCE_KIND,
    sourceUrl,
    status: timerStatus,
    title,
    updatedAt: timer.updated_at,
  });
}

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
      sourceKind: picked.sourceKind,
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

function pickAllowedCandidateFields(input = {}) {
  const picked = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (!CANDIDATE_ALLOWED_FIELDS.has(key) || isForbiddenField(key)) {
      continue;
    }

    picked[key] = value;
  }

  return picked;
}

function normalizePrimaryAction(value, sourceUrl) {
  const action = value && typeof value === "object" && !Array.isArray(value)
    ? sanitizeActionDescriptor(value)
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

function sanitizeActionDescriptor(action = {}) {
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

function openPrimaryAction(sourceUrl) {
  return {
    disabled: !sourceUrl,
    href: sourceUrl,
    id: DEFAULT_OPEN_ACTION_ID,
    label: sourceUrl ? "Open work" : "Open",
    type: sourceUrl ? "link" : "none",
  };
}

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

function readSafeMetadata(input = {}) {
  const metadata = firstValue(input.metadata, parseMetadataJson(firstValue(input.metadataJson, input.metadata_json)));
  return sanitizeMetadata(metadata) || {};
}

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

function isCandidateSourceAvailable(candidate, sourceContext) {
  if (candidate.sourceKind === LIVE_TIMER_SOURCE_KIND) {
    return sourceContext.manualTimerSourceAvailable;
  }

  if (isTimerCandidate(candidate)) {
    return sourceContext.timerSourceKeys.has(timerCandidateSourceKey(candidate));
  }

  return sourceContext.workItemSourceKeys.has(candidateContributionKey(candidate));
}

function matchesCandidateQuery(candidate, query = {}) {
  const normalizedQuery = normalizeListQuery(query);

  return matchesTextFilter(candidate.moduleId, normalizedQuery.moduleId) &&
    matchesTextFilter(candidate.recordType, normalizedQuery.recordType) &&
    matchesTextFilter(candidate.clientId, normalizedQuery.clientId) &&
    matchesTextFilter(candidate.projectId, normalizedQuery.projectId);
}

function normalizeListQuery(query = {}) {
  return {
    clientId: textValue(firstValue(query.clientId, query.client_id), 160),
    limit: boundedInteger(query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    mode: textValue(query.mode, 24) || "left_off",
    moduleId: textValue(firstValue(query.moduleId, query.module_id), TEXT_LIMITS.moduleId),
    projectId: textValue(firstValue(query.projectId, query.project_id), 160),
    recordType: textValue(firstValue(query.recordType, query.record_type), TEXT_LIMITS.recordType),
  };
}

function matchesTextFilter(value, filter) {
  return !filter || String(value || "") === filter;
}

function candidateSourceKey(candidate) {
  return [
    candidate.moduleId,
    candidate.recordType,
    candidate.recordId,
  ].join(":");
}

function candidateRankFacts(candidate, context) {
  const dueDateKey = dateKeyFrom(candidate.dueAt, context.timezone);
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
    dueDateKey,
    lastActivityDateKey,
    lastActivityTime,
    priorityRank: PRIORITY_RANKS[String(candidate.priority || "").toLowerCase()] || 0,
    rankHint: Number.parseInt(candidate.rankHint, 10) || 0,
  };
}

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
    return RANK_BUCKETS.recentlyTouched;
  }
  if (isDueThisWeek(context.dueDateKey, context.today, context.dueThisWeekEndDateKey)) {
    return RANK_BUCKETS.dueThisWeek;
  }

  return RANK_BUCKETS.later;
}

function compareRankedCandidates(left, right) {
  return left.facts.bucket - right.facts.bucket ||
    right.facts.rankHint - left.facts.rankHint ||
    compareOptionalText(left.facts.dueDateKey, right.facts.dueDateKey) ||
    right.facts.priorityRank - left.facts.priorityRank ||
    right.facts.lastActivityTime - left.facts.lastActivityTime ||
    left.candidate.title.localeCompare(right.candidate.title) ||
    left.candidate.candidateId.localeCompare(right.candidate.candidateId) ||
    left.index - right.index;
}

function isRunningTimer(candidate) {
  return isTimerCandidate(candidate) && [
    candidate.status,
    candidate.metadata?.timer_status,
    candidate.metadata?.timerStatus,
  ].some((value) => ["active", "running"].includes(String(value || "").toLowerCase()));
}

function isPausedTimer(candidate) {
  return isTimerCandidate(candidate) && [
    candidate.status,
    candidate.metadata?.timer_status,
    candidate.metadata?.timerStatus,
  ].some((value) => String(value || "").toLowerCase() === "paused");
}

function isTimerCandidate(candidate) {
  return candidate.recordType === "active_work_timer" ||
    String(candidate.metadata?.timer_status || candidate.metadata?.timerStatus || "").trim() !== "";
}

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

function isBlockedOrStaleWork(candidate, context) {
  const status = String(candidate.status || "").toLowerCase();

  return Boolean(candidate.blockedReason) ||
    status === "blocked" ||
    status === "stale" ||
    Boolean(context.lastActivityDateKey && context.lastActivityDateKey < context.staleBeforeDateKey);
}

function isOverdueWork(dueDateKey, today) {
  return Boolean(dueDateKey && dueDateKey < today);
}

function isRecentlyTouched(lastActivityDateKey, recentSinceDateKey, today) {
  return Boolean(lastActivityDateKey && lastActivityDateKey >= recentSinceDateKey && lastActivityDateKey <= today);
}

function isDueThisWeek(dueDateKey, today, dueThisWeekEndDateKey) {
  return Boolean(dueDateKey && dueDateKey > today && dueDateKey <= dueThisWeekEndDateKey);
}

function rankContext(options = {}) {
  const timezone = textValue(options.timezone, 80) || DEFAULT_TIMEZONE;
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now || Date.now());
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const today = dateKeyFrom(options.today, timezone) || localDateKey(safeNow, timezone);

  return {
    dueThisWeekEndDateKey: addCalendarDaysKey(today, DUE_THIS_WEEK_DAYS),
    recentSinceDateKey: addCalendarDaysKey(today, -RECENTLY_TOUCHED_DAYS),
    staleBeforeDateKey: addCalendarDaysKey(today, -STALE_DAYS),
    timezone,
    today,
  };
}

function candidateContributionKey(candidate) {
  return `${candidate.moduleId}:${candidate.recordType}`;
}

function contributionSourceKey(source = {}) {
  return `${textValue(source.moduleId, TEXT_LIMITS.moduleId)}:${textValue(source.sourceType, TEXT_LIMITS.recordType)}`;
}

function timerCandidateSourceKey(candidate) {
  const sourceType = textValue(
    candidate.metadata?.source_type || candidate.metadata?.sourceType,
    TEXT_LIMITS.recordType,
  ) || "manual";

  return `${candidate.moduleId}:${sourceType}`;
}

function candidateIdFor({ moduleId, recordId, recordType, sourceKind } = {}) {
  const prefix = textValue(sourceKind, TEXT_LIMITS.sourceKind) || "candidate";
  return `${prefix}:${moduleId}:${recordType}:${recordId}`.slice(0, TEXT_LIMITS.candidateId);
}

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

function dateKeyFrom(value, timezone = DEFAULT_TIMEZONE) {
  const text = textValue(value, 80);

  if (!text) {
    return "";
  }

  const dateOnlyMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnlyMatch) {
    return dateOnlyMatch[1];
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }

  return localDateKey(parsed, timezone);
}

function dateTimeValue(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

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

function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

function safeUrl(value) {
  const url = textValue(value, TEXT_LIMITS.sourceUrl);

  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || /^\/\//.test(url)) {
    return "";
  }

  return url;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function textValue(value, limit = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedInteger(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

const workCandidateService = {
  listLiveTimerCandidates,
  listResumeCandidates,
  listWorkCandidates,
  normalizeWorkCandidate,
  rankWorkCandidates,
};

export {
  candidateFromResumeRow,
  candidateFromTimer,
  normalizeWorkCandidate,
  rankWorkCandidates,
  workCandidateService,
};
