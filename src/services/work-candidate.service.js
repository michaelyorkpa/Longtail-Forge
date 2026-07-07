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
const LIVE_TIMER_SOURCE_KIND = "live_timer";
const RESUME_SOURCE_KIND = "resume_state";

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
  const [resumeResult, liveTimers] = await Promise.all([
    listResumeCandidates(session, { ...query, limit: normalizedQuery.limit * 2 }),
    listLiveTimerCandidates(session, normalizedQuery),
  ]);
  const bySource = new Map();

  for (const candidate of [...liveTimers, ...(resumeResult.items || [])]) {
    if (!matchesCandidateQuery(candidate, normalizedQuery)) {
      continue;
    }

    const key = candidateSourceKey(candidate);

    if (!bySource.has(key)) {
      bySource.set(key, candidate);
    }
  }

  return {
    items: [...bySource.values()].slice(0, normalizedQuery.limit),
    mode: resumeResult.mode || normalizedQuery.mode,
  };
}

async function listLiveTimerCandidates(session, query = {}) {
  const normalizedQuery = normalizeListQuery(query);

  if (!await hasActiveTimerSource(session)) {
    return [];
  }

  const result = await activeTimersService.listAll(session);
  return (result.timers || [])
    .map((timer) => candidateFromTimer(timer))
    .filter((candidate) => matchesCandidateQuery(candidate, normalizedQuery));
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

async function hasActiveTimerSource(session) {
  if (!session?.workspace_id) {
    return false;
  }

  const sources = await modulesService.listTimerSources(session.workspace_id, session);

  return sources.some((source) => (
    source.moduleId === "time-tracking" &&
    source.sourceType === "manual"
  ));
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
};

export {
  candidateFromResumeRow,
  candidateFromTimer,
  normalizeWorkCandidate,
  workCandidateService,
};
