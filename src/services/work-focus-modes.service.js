// @ts-check
import { db } from "../core/database.js";
import { resolveClientProjectFilterScope } from "../core/client-project-filter-scope.js";
import { AppError } from "../utils/app-error.js";
import { getWorkspaceCapabilities } from "../utils/workspaces.js";
import {
  WORK_CANDIDATE_RANK_BUCKETS,
  WORK_CANDIDATE_SORTS,
  workCandidateService,
} from "./work-candidate.service.js";

const DEFAULT_TIMEZONE = "America/New_York";
const THIS_WEEK_DAYS = 7;
const FOCUS_MODE_IDS = Object.freeze({
  startMyDay: "start-my-day",
  pickUpWhereLeftOff: "pick-up-where-left-off",
  whatsDueNext: "whats-due-next",
  workThisWeek: "work-this-week",
  reviewBlockedWork: "review-blocked-work",
  inProgress: "in-progress",
  projectFocus: "project-focus",
  clientFocus: "client-focus",
});
const FOCUS_SCOPES = Object.freeze({
  client: "client",
  project: "project",
  workspace: "workspace",
});
/**
 * @typedef {Object} FocusModeInternalDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} scope
 * @property {number} sortOrder
 * @property {(context: { dates: any, input: any, workspaceContext: any }) => any} resolve
 * @property {string} [requiredSelection]
 */

/** @type {readonly FocusModeInternalDefinition[]} */
const FOCUS_MODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    description: "Start with active, due, blocked, and recently touched work.",
    id: FOCUS_MODE_IDS.startMyDay,
    label: "Start my day",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 10,
    resolve: ({ dates }) => ({
      filters: {
        excludePassiveRecurringCreated: true,
        includeTaskCandidates: true,
        rankBuckets: [
          WORK_CANDIDATE_RANK_BUCKETS.runningTimer,
          WORK_CANDIDATE_RANK_BUCKETS.pausedTimer,
          WORK_CANDIDATE_RANK_BUCKETS.overdueAssignedWork,
          WORK_CANDIDATE_RANK_BUCKETS.dueToday,
          WORK_CANDIDATE_RANK_BUCKETS.blockedOrStale,
          WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched,
        ],
      },
      summary: `Active, due, blocked, or recently touched work as of ${dates.today}.`,
    }),
  }),
  Object.freeze({
    description: "Resume the strongest left-off work context first.",
    id: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    label: "Pick up where I left off",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 20,
    resolve: () => ({
      filters: {
        rankBuckets: [
          WORK_CANDIDATE_RANK_BUCKETS.runningTimer,
          WORK_CANDIDATE_RANK_BUCKETS.pausedTimer,
          WORK_CANDIDATE_RANK_BUCKETS.overdueAssignedWork,
          WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched,
        ],
      },
      resumeStrategy: {
        fallback: "ranked-candidates",
        fallbackRankBuckets: [
          WORK_CANDIDATE_RANK_BUCKETS.runningTimer,
          WORK_CANDIDATE_RANK_BUCKETS.pausedTimer,
          WORK_CANDIDATE_RANK_BUCKETS.overdueAssignedWork,
          WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched,
        ],
        primary: "work-resume",
      },
      summary: "Use resume state first, then recently touched ranked candidates.",
    }),
  }),
  Object.freeze({
    description: "Review overdue work and the next due items.",
    id: FOCUS_MODE_IDS.whatsDueNext,
    label: "What's due next",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 30,
    resolve: ({ dates }) => ({
      filters: {
        excludePassiveRecurringCreated: true,
        includeTaskCandidates: true,
        date: { dueTo: dates.weekEnd },
        sort: WORK_CANDIDATE_SORTS.dueDatetime,
      },
      summary: `Overdue work and work due through ${dates.weekEnd}.`,
    }),
  }),
  Object.freeze({
    description: "Focus on work due during the current week.",
    id: FOCUS_MODE_IDS.workThisWeek,
    label: "Work this week",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 40,
    resolve: ({ dates }) => ({
      filters: {
        excludePassiveRecurringCreated: true,
        includeTaskCandidates: true,
        date: {
          dueTo: dates.weekEnd,
        },
        sort: WORK_CANDIDATE_SORTS.dueDatetime,
      },
      summary: `Overdue work and work due through ${dates.weekEnd}.`,
    }),
  }),
  Object.freeze({
    description: "Review blocked work that may need recovery.",
    id: FOCUS_MODE_IDS.reviewBlockedWork,
    label: "Review blocked work",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 50,
    resolve: () => ({
      filters: {
        excludePassiveRecurringCreated: true,
        includeTaskCandidates: true,
        status: ["blocked"],
      },
      summary: "Blocked work only.",
    }),
  }),
  Object.freeze({
    description: "Stay with work already active or in progress.",
    id: FOCUS_MODE_IDS.inProgress,
    label: "In progress",
    scope: FOCUS_SCOPES.workspace,
    sortOrder: 60,
    resolve: () => ({
      filters: {
        status: ["running", "paused", "active", "in_progress"],
      },
      summary: "Running, paused, active, or in-progress work.",
    }),
  }),
  Object.freeze({
    description: "Narrow candidate work to one project.",
    id: FOCUS_MODE_IDS.projectFocus,
    label: "Project focus",
    requiredSelection: "project",
    scope: FOCUS_SCOPES.project,
    sortOrder: 70,
    resolve: ({ input }) => {
      const projectId = textValue(firstValue(input.projectId, input.project_id), 160);

      if (!projectId) {
        throw new AppError("Project focus requires a project.", 400);
      }

      return {
        filters: {
          excludePassiveRecurringCreated: true,
          includeTaskCandidates: true,
          projectId,
        },
        scope: { projectId },
        summary: "Work scoped to the selected project.",
      };
    },
  }),
  Object.freeze({
    description: "Narrow candidate work to one client.",
    id: FOCUS_MODE_IDS.clientFocus,
    label: "Client focus",
    requiredSelection: "client",
    scope: FOCUS_SCOPES.client,
    sortOrder: 80,
    workspaceTypes: ["business"],
    resolve: ({ input }) => {
      const clientId = textValue(firstValue(input.clientId, input.client_id), 160);

      if (!clientId) {
        throw new AppError("Client focus requires a client.", 400);
      }

      return {
        filters: {
          clientId,
          excludePassiveRecurringCreated: true,
          includeTaskCandidates: true,
        },
        scope: { clientId },
        summary: "Work scoped to the selected client.",
      };
    },
  }),
]);
const FOCUS_MODE_BY_ID = new Map(FOCUS_MODE_DEFINITIONS.map((definition) => [definition.id, definition]));

async function listFocusModes(session, options = {}) {
  const workspaceContext = await readWorkspaceContext(session, options);

  return FOCUS_MODE_DEFINITIONS
    .filter((definition) => focusModeAvailable(definition, workspaceContext))
    .map((definition) => focusModeDescriptor(definition));
}

async function resolveFocusMode(session, input = {}) {
  const workspaceContext = await readWorkspaceContext(session, input);
  const modeId = normalizeFocusModeId(firstValue(input.modeId, input.mode_id, input.id, input.mode)) ||
    FOCUS_MODE_IDS.startMyDay;
  const definition = FOCUS_MODE_BY_ID.get(modeId);

  if (!definition) {
    throw new AppError("Unknown focus mode.", 400);
  }
  if (!focusModeAvailable(definition, workspaceContext)) {
    throw new AppError(`${definition.label} is not available in ${workspaceContext.workspaceType} workspaces.`, 403);
  }

  const dates = focusDates(input, workspaceContext);
  const resolved = definition.resolve({ dates, input, workspaceContext }) || {};
  const filters = normalizeFilters(mergeScopeFilters(resolved.filters, input, workspaceContext));
  const hierarchyScope = await resolveClientProjectFilterScope(session, {
    clientId: filters.clientId,
    hasClientFilter: Boolean(filters.clientId),
    hasProjectFilter: Boolean(filters.projectId),
    projectId: filters.projectId,
  });
  const scope = normalizeScope({
    ...(resolved.scope || {}),
    type: definition.scope,
  }, filters);
  const candidateQuery = buildCandidateQuery(definition, filters, dates, input, workspaceContext, hierarchyScope);

  return {
    candidateQuery,
    description: definition.description,
    filters,
    id: definition.id,
    label: definition.label,
    modeId: definition.id,
    requiredSelection: definition.requiredSelection || "",
    resumeStrategy: normalizeResumeStrategy(resolved.resumeStrategy),
    scope,
    summary: textValue(resolved.summary, 240),
    workspaceType: workspaceContext.workspaceType,
  };
}

async function listFocusCandidates(session, input = {}) {
  const focusContext = await resolveFocusMode(session, input);
  const result = await executeFocusCandidateStrategy(session, focusContext);

  return {
    ...result,
    focusContext,
  };
}

async function executeFocusCandidateStrategy(session, focusContext) {
  if (focusContext.resumeStrategy?.primary === "work-resume") {
    return listResumeFocusCandidates(session, focusContext);
  }

  return workCandidateService.listWorkCandidates(session, focusContext.candidateQuery);
}

async function listResumeFocusCandidates(session, focusContext) {
  const primaryQuery = resumePrimaryQuery(focusContext);
  const primaryResult = await workCandidateService.listResumeCandidates(session, primaryQuery);

  if (primaryResult.items.length > 0) {
    return mergeSecondMostRecentTaskBoost(session, focusContext, primaryResult, primaryQuery);
  }

  if (focusContext.resumeStrategy?.fallback === "ranked-candidates") {
    const fallbackQuery = resumeFallbackQuery(focusContext);
    const fallbackResult = await workCandidateService.listWorkCandidates(session, fallbackQuery);
    return mergeSecondMostRecentTaskBoost(session, focusContext, fallbackResult, fallbackQuery);
  }

  return primaryResult;
}

async function mergeSecondMostRecentTaskBoost(session, focusContext, result, query) {
  if (focusContext?.id !== FOCUS_MODE_IDS.pickUpWhereLeftOff) {
    return result;
  }

  const boostedTask = await workCandidateService.readSecondMostRecentUpdatedTaskCandidate(session, query);

  if (!boostedTask) {
    return result;
  }

  const items = result.items || [];
  const timerItems = [];
  const remainingItems = [];

  for (const item of items) {
    if (isTimerResumeCandidate(item)) {
      timerItems.push(item);
    } else {
      remainingItems.push(item);
    }
  }

  return {
    ...result,
    items: dedupeCandidatesBySource([
      ...timerItems,
      boostedTask,
      ...remainingItems,
    ]).slice(0, focusCandidateLimit(query)),
  };
}

function resumePrimaryQuery(focusContext) {
  const query = { ...(focusContext.candidateQuery || {}) };

  delete query.rankBuckets;

  return {
    ...query,
    excludePassiveRecurringCreated: true,
    sort: WORK_CANDIDATE_SORTS.resume,
  };
}

function resumeFallbackQuery(focusContext) {
  const fallbackRankBuckets = focusContext.resumeStrategy?.fallbackRankBuckets?.length
    ? focusContext.resumeStrategy.fallbackRankBuckets
    : focusContext.candidateQuery?.rankBuckets || [];

  return {
    ...(focusContext.candidateQuery || {}),
    excludePassiveRecurringCreated: true,
    rankBuckets: [...fallbackRankBuckets],
    sort: WORK_CANDIDATE_SORTS.resume,
  };
}

function focusModeDescriptor(definition) {
  return {
    description: definition.description,
    id: definition.id,
    label: definition.label,
    modeId: definition.id,
    requiredSelection: definition.requiredSelection || "",
    scope: definition.scope,
    sortOrder: definition.sortOrder,
  };
}

function focusModeAvailable(definition, workspaceContext) {
  return !definition.workspaceTypes || definition.workspaceTypes.includes(workspaceContext.workspaceType);
}

function normalizeFilters(filters = {}) {
  const date = objectValue(filters.date);

  return {
    clientId: textValue(filters.clientId, 160),
    date: {
      dueBefore: normalizeDateKey(date.dueBefore),
      dueFrom: normalizeDateKey(date.dueFrom),
      dueOn: normalizeDateKey(date.dueOn),
      dueTo: normalizeDateKey(date.dueTo),
    },
    excludePassiveRecurringCreated: Boolean(filters.excludePassiveRecurringCreated),
    includeTaskCandidates: Boolean(filters.includeTaskCandidates),
    projectId: textValue(filters.projectId, 160),
    rankBuckets: normalizeTextList(filters.rankBuckets),
    sort: normalizeSortMode(filters.sort),
    status: normalizeTextList(filters.status),
  };
}

function mergeScopeFilters(filters = {}, input = {}, workspaceContext = {}) {
  const merged = {
    ...objectValue(filters),
  };
  const clientId = workspaceContext.workspaceType === "business"
    ? textValue(firstValue(merged.clientId, input.clientId, input.client_id), 160)
    : "";
  const projectId = textValue(firstValue(merged.projectId, input.projectId, input.project_id), 160);

  if (clientId) {
    merged.clientId = clientId;
  } else {
    delete merged.clientId;
  }
  if (projectId) {
    merged.projectId = projectId;
  } else {
    delete merged.projectId;
  }

  return merged;
}

function normalizeScope(scope, filters) {
  return {
    clientId: textValue(firstValue(scope.clientId, filters.clientId), 160),
    projectId: textValue(firstValue(scope.projectId, filters.projectId), 160),
    type: scope.type || FOCUS_SCOPES.workspace,
  };
}

function buildCandidateQuery(definition, filters, dates, input, workspaceContext, hierarchyScope = {}) {
  const query = {
    mode: definition.id,
    timezone: workspaceContext.timezone,
    today: dates.today,
  };
  const limit = boundedInteger(firstValue(input.limit, input.pageSize, input.page_size), 1, 100, 0);

  if (limit) {
    query.limit = limit;
  }
  if (filters.clientId && !hierarchyScope.omitClientFilterBecauseProjectSelected) {
    query.clientId = filters.clientId;
    if (Array.isArray(hierarchyScope.clientIds) && hierarchyScope.clientIds.length > 0) {
      query.clientIds = [...hierarchyScope.clientIds];
    }
    if (Array.isArray(hierarchyScope.clientProjectIds) && hierarchyScope.clientProjectIds.length > 0) {
      query.clientProjectIds = [...hierarchyScope.clientProjectIds];
    }
  }
  if (filters.excludePassiveRecurringCreated) {
    query.excludePassiveRecurringCreated = true;
  }
  if (filters.includeTaskCandidates) {
    query.includeTaskCandidates = true;
  }
  if (filters.projectId) {
    query.projectId = filters.projectId;
    if (Array.isArray(hierarchyScope.projectIds) && hierarchyScope.projectIds.length > 0) {
      query.projectIds = [...hierarchyScope.projectIds];
    }
  }
  if (filters.date.dueBefore) {
    query.dueBefore = filters.date.dueBefore;
  }
  if (filters.date.dueFrom) {
    query.dueFrom = filters.date.dueFrom;
  }
  if (filters.date.dueOn) {
    query.dueOn = filters.date.dueOn;
  }
  if (filters.date.dueTo) {
    query.dueTo = filters.date.dueTo;
  }
  if (filters.rankBuckets.length) {
    query.rankBuckets = [...filters.rankBuckets];
  }
  if (filters.sort) {
    query.sort = filters.sort;
  }
  if (filters.status.length) {
    query.statusFilters = [...filters.status];
  }

  return query;
}

function normalizeResumeStrategy(strategy) {
  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
    return null;
  }

  return {
    fallback: textValue(strategy.fallback, 80),
    fallbackRankBuckets: normalizeTextList(strategy.fallbackRankBuckets),
    primary: textValue(strategy.primary, 80),
  };
}

async function readWorkspaceContext(session = {}, options = {}) {
  const workspaceId = textValue(session?.workspace_id, 160);
  const rows = workspaceId
    ? await db.query(`
SELECT workspace_type
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId })
    : [];
  const capabilities = getWorkspaceCapabilities(firstValue(options.workspaceType, options.workspace_type, rows[0]?.workspace_type));

  return {
    availableTools: capabilities.availableTools || [],
    timezone: textValue(firstValue(options.timezone, session?.timezone), 80) || DEFAULT_TIMEZONE,
    workspaceId,
    workspaceType: capabilities.workspaceType,
  };
}

function focusDates(input = {}, workspaceContext = {}) {
  const timezone = workspaceContext.timezone || DEFAULT_TIMEZONE;
  const today = normalizeDateKey(firstValue(input.today, input.todayDate, input.today_date)) ||
    localDateKey(new Date(), timezone);

  return {
    today,
    weekEnd: addCalendarDaysKey(today, THIS_WEEK_DAYS),
  };
}

function normalizeFocusModeId(value) {
  const normalized = textValue(value, 120)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return FOCUS_MODE_BY_ID.has(normalized) ? normalized : "";
}

function normalizeDateKey(value) {
  const text = textValue(value, 80);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);

  return match ? match[1] : "";
}

function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function normalizeTextList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");

  return [...new Set(rawValues
    .map((item) => textValue(item, 80).toLowerCase().replace(/[\s-]+/g, "_"))
    .filter(Boolean))];
}

function normalizeSortMode(value) {
  const sort = textValue(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  const supportedSorts = /** @type {string[]} */ (Object.values(WORK_CANDIDATE_SORTS));
  return supportedSorts.includes(sort) ? sort : "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function dedupeCandidatesBySource(candidates = []) {
  const seen = new Set();
  const deduped = [];

  for (const candidate of candidates) {
    const key = candidateSourceKey(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function candidateSourceKey(candidate = {}) {
  return [
    textValue(candidate.moduleId || candidate.module_id, 80),
    textValue(candidate.recordType || candidate.record_type, 80),
    textValue(candidate.recordId || candidate.record_id, 160),
  ].join(":");
}

function isTimerResumeCandidate(candidate = {}) {
  const recordType = textValue(candidate.recordType || candidate.record_type, 80);
  const timerStatus = textValue(
    candidate.metadata?.timer_status || candidate.metadata?.timerStatus,
    80,
  ).toLowerCase();

  return recordType === "active_work_timer" ||
    ["running", "active", "paused"].includes(timerStatus);
}

function focusCandidateLimit(query = {}) {
  return boundedInteger(firstValue(query.limit, query.pageSize, query.page_size), 1, 100, 25);
}

const workFocusModesService = {
  listFocusCandidates,
  listFocusModes,
  resolveFocusMode,
};

export {
  FOCUS_MODE_IDS,
  FOCUS_SCOPES,
  listFocusCandidates,
  listFocusModes,
  resolveFocusMode,
  workFocusModesService,
};