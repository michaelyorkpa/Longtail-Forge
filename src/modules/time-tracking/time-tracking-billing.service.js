// @ts-check
import { clientProjectSettingsService, clientsService } from "../client-projects/index.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { settingsService } from "../../services/settings.service.js";
import { normalizeTimezone } from "../../utils/normalizers.js";
import {
  DEFAULT_TIMEZONE,
  addLocalDateDays,
  localDateBoundToUtcIso,
  localDateKey,
} from "../../utils/timezones.js";
import { timeTrackingSettingsService } from "./time-tracking-settings.service.js";
import { timeEntriesService } from "./time-entries.service.js";

/** @typedef {import("../../types/http-contracts.js").RequestSession & { workspace_id: string }} WorkspaceRequestSession */

const WORKSPACE_SCOPE_ID = "__workspace_projects__";

/** @param {WorkspaceRequestSession} session */
async function readDashboardBillingSummary(session) {
  await permissionsService.assertCanInAnyScope(session, "reporting.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  const [settings, clientProjectData, timeEntries] = await Promise.all([
    readBillingSettings(session),
    clientsService.readClientProjects(session),
    timeEntriesService.list(session),
  ]);
  const entries = normalizeTimeEntries(timeEntries.entries);
  const activeScopes = buildBillingScopes(clientProjectData, settings, { includeInactive: true })
    .filter((scope) => scope.status === "Active");
  const now = new Date();
  const timezone = normalizeBillingSessionTimezone(session);
  const currentMonthRows = summarizeBillingScopesForRange(settings, activeScopes, entries, getMonthRange(now, timezone))
    .filter((row) => row.billableSeconds > 0);
  const currentMonthTotals = filterRollupScopeSummaries(currentMonthRows).reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.billableSeconds,
  }), { amount: 0, seconds: 0 });
  const chartPoints = getTrailingMonthStarts(12, now, timezone).map((monthStart) => {
    const range = getMonthRange(monthStart, timezone);
    const totals = filterRollupScopeSummaries(summarizeBillingScopesForRange(settings, activeScopes, entries, range))
      .reduce((summary, row) => ({
        amount: summary.amount + row.amount,
        seconds: summary.seconds + row.displaySeconds,
      }), { amount: 0, seconds: 0 });

    return {
      labelDate: monthStart.toISOString(),
      hours: totals.seconds / 3600,
      amount: totals.amount,
    };
  });

  return {
    currentMonthBillables: currentMonthRows.map(toDashboardBillableRow),
    currentMonthTotals,
    chartPoints,
  };
}

/** @param {WorkspaceRequestSession} session */
async function readReportingBootstrap(session) {
  const { settings, scopes, moduleContext } = await readProjectTimeBillingContext(session, {
    includeModuleContext: true,
  });
  const clientFiltersVisible = settings.workspaceType === "business";

  return {
    workspace: workspaceSummary(session, settings),
    clientFiltersVisible,
    defaultScopeId: clientFiltersVisible ? "" : scopes[0]?.id || "",
    scopes,
    reportPanels: readModulePanels(moduleContext.modules, "reporting"),
  };
}

/** @param {WorkspaceRequestSession} session */
async function readProjectSummary(session, query = {}) {
  const { settings, scopes } = await readProjectTimeBillingContext(session);
  const entries = normalizeTimeEntries((await timeEntriesService.list(session, {
    tagIds: query.tagIds || query.tag_ids || query.tags,
  })).entries);
  const scope = scopes.find((item) => item.id === String(query.scopeId || query.scope_id || "").trim());
  const includeDescendants = parseIncludeDescendants(query);

  if (!scope) {
    throw new AppError("Reporting scope not found.", 404);
  }

  const selectedProjectIds = parseSelectedIds(query.projectIds || query.project_ids);
  const selectedTaskIds = parseSelectedIds(query.taskIds || query.task_ids || query.taskId || query.task_id);
  const projects = scope.projects
    .filter((project) => selectedProjectIds.length === 0 || selectedProjectIds.includes(project.id));

  if (projects.length === 0) {
    return emptyProjectSummary(scope, selectedTaskIds);
  }

  const scopeEntries = entries
    .filter((entry) => matchesScope(entry, scope, { includeDescendants }))
    .filter((entry) => selectedTaskIds.length === 0 || selectedTaskIds.includes(entry.taskId));
  const summary = summarizeProjectBillingRows(settings, scope, projects, scopeEntries, query, {
    includeDescendants,
    timezone: normalizeBillingSessionTimezone(session),
  });

  return {
    scope,
    taskFilter: selectedTaskIds,
    ...summary,
  };
}

async function runProjectTimeBillingReport({ filters, session }) {
  return readProjectSummary(session, filters);
}

/** @param {WorkspaceRequestSession} session */
async function readProjectTimeBillingContext(session, options = {}) {
  await permissionsService.assertCanInAnyScope(session, "reporting.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  const { modulesService } = await import("../../core/modules/modules.service.js");

  if (!(await modulesService.canWriteModule(session.workspace_id, "time-tracking"))) {
    throw new AppError("This report is unavailable for this workspace.", 403);
  }

  const [settings, clientProjectData, moduleContext] = await Promise.all([
    readBillingSettings(session),
    clientsService.readClientProjects(session),
    options.includeModuleContext
      ? modulesService.readWorkspaceModuleContext(session.workspace_id)
      : Promise.resolve(null),
  ]);
  const scopes = buildBillingScopes(clientProjectData, settings, options);

  return { settings, scopes, moduleContext };
}

/** @param {WorkspaceRequestSession} session */
async function readBillingSettings(session) {
  const [workspaceSettings, clientProjectSettings, timeTrackingSettings] = await Promise.all([
    settingsService.read(session),
    clientProjectSettingsService.read(session),
    timeTrackingSettingsService.read(session),
  ]);
  return {
    ...workspaceSettings,
    ...clientProjectSettings,
    ...timeTrackingSettings,
  };
}

/**
 * Normalize persisted session data before billing calendar helpers reach Intl.
 *
 * @param {{ timezone?: unknown } | null | undefined} session
 * @returns {string}
 */
function normalizeBillingSessionTimezone(session) {
  return normalizeTimezone(session?.timezone);
}

function buildBillingScopes(data, settings, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const workspaceProjects = Array.isArray(data.workspaceProjects)
    ? data.workspaceProjects
    : [];
  const workspaceScope = workspaceProjects.length > 0
      ? [normalizeScope({
        id: WORKSPACE_SCOPE_ID,
        name: settings.workspaceName || "Workspace",
        status: "Active",
        billable: "yes",
        isWorkspaceScope: true,
        projects: workspaceProjects,
      }, settings)]
    : [];
  const clientScopes = Array.isArray(data.clients)
    ? data.clients
        .filter((client) => includeInactive || client.status !== "Inactive")
        .map((client) => normalizeScope(client, settings))
    : [];

  if (settings.workspaceType !== "business") {
    return workspaceScope;
  }

  return [...workspaceScope, ...sortScopeTree(attachDescendantClientProjects(decorateScopeDepths(clientScopes)))];
}

function attachDescendantClientProjects(scopes) {
  return scopes.map((scope) => {
    const descendantProjects = scopes
      .filter((candidate) => scope.childScopeIds.includes(candidate.id))
      .flatMap((candidate) => candidate.projects);
    const projectsById = new Map([...scope.projects, ...descendantProjects].map((project) => [project.id, project]));

    return {
      ...scope,
      projects: decorateProjectDescendants([...projectsById.values()]),
    };
  });
}

function normalizeScope(client, settings) {
  const billable = normalizeBillableFlag(client.billable);
  const billingRate = parseOptionalMoney(client.billing_rate);
  const billingPeriod = normalizeOptionalBillingPeriod(client.billing_period);
  const billingRounding = normalizeOptionalBillingRounding(client.billing_rounding);
  const inheritedBilling = {
    rate: billingRate ?? parseMoney(settings.defaultBillingRate),
    period: billingPeriod || normalizeBillingPeriod(settings.billingPeriod),
    rounding: billingRounding || normalizeBillingRounding(settings.billingRounding),
  };

  return {
    id: String(client.id || "").trim(),
    name: String(client.name || "").trim(),
    status: client.status === "Inactive" ? "Inactive" : "Active",
    billable,
    billingRate,
    billingPeriod,
    billingRounding,
    isWorkspaceScope: Boolean(client.isWorkspaceScope),
    parentScopeId: String(client.parent_client_id || "").trim(),
    depth: Number.isFinite(Number(client.depth)) ? Number(client.depth) : 0,
    childScopeIds: Array.isArray(client.childScopeIds) ? client.childScopeIds : [],
    projects: decorateProjectDescendants(Array.isArray(client.projects)
      ? client.projects.map((project) => normalizeProject(project, billable, inheritedBilling))
      : []),
  };
}

function normalizeProject(project, fallbackBillable = "yes", inheritedBilling = {}) {
  const billingRate = parseOptionalMoney(project.billing_rate);
  const billingPeriod = normalizeOptionalBillingPeriod(project.billing_period);
  const billingRounding = normalizeOptionalBillingRounding(project.billing_rounding);

  return {
    id: String(project.id || "").trim(),
    name: String(project.name || "").trim(),
    parentProjectId: String(project.parent_project_id || "").trim(),
    status: project.status === "Inactive" ? "Inactive" : "Active",
    billable: normalizeBillableFlag(project.billable, fallbackBillable),
    billingRate,
    billingPeriod,
    billingRounding,
    effectiveBillingRate: billingRate ?? inheritedBilling.rate ?? 0,
    effectiveBillingPeriod: billingPeriod || inheritedBilling.period || normalizeBillingPeriod(null),
    effectiveBillingRounding: billingRounding || inheritedBilling.rounding || normalizeBillingRounding(null),
  };
}

function normalizeTimeEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        clientId: entry.client_id,
        clientName: entry.client_name,
        projectId: entry.project_id,
        projectName: entry.project_name,
        taskId: entry.task_id,
        endTime: new Date(entry.end_time),
        durationSeconds: Number(entry.duration_seconds) || 0,
        billable: entry.billable === "no" ? "no" : "yes",
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      }))
    : [];
}

function summarizeBillingScopesForRange(settings, scopes, entries, range) {
  return sortScopeTree(scopes).map((scope) => summarizeBillingScopeForRange(settings, scope, entries, range));
}

function summarizeBillingScopeForRange(settings, scope, entries, range) {
  const scopeEntries = entries.filter((entry) => matchesScope(entry, scope, { includeDescendants: true }));
  const projectSummaries = filterRollupProjects(scope.projects, { includeDescendants: true })
    .map((project) => summarizeBillingProjectTree(settings, scope, project, scope.projects, scopeEntries, {
      includeDescendants: true,
      range,
    }))
    .filter(Boolean);
  const totals = projectSummaries.reduce((summary, projectSummary) => ({
    amount: summary.amount + projectSummary.amount,
    billableSeconds: summary.billableSeconds + projectSummary.billableSeconds,
    displaySeconds: summary.displaySeconds + projectSummary.displaySeconds,
    rawSeconds: summary.rawSeconds + projectSummary.rawSeconds,
  }), {
    amount: 0,
    billableSeconds: 0,
    displaySeconds: 0,
    rawSeconds: 0,
  });

  return {
    ...totals,
    scope,
    projectSummaries,
  };
}

function summarizeProjectBillingRows(settings, scope, selectedProjects, entries, query = {}, options = {}) {
  const includeDescendants = Boolean(options.includeDescendants);
  const rows = filterRollupProjects(selectedProjects, { includeDescendants })
    .map((project) => summarizeBillingProjectTree(settings, scope, project, scope.projects, entries, {
      includeDescendants,
      query,
      today: options.today,
      timezone: options.timezone,
    }))
    .filter(Boolean);
  const totals = rows.reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.displaySeconds,
  }), { amount: 0, seconds: 0 });

  return { rows, totals };
}

function summarizeBillingProjectTree(settings, scope, project, projects, entries, options = {}) {
  const includeDescendants = Boolean(options.includeDescendants);
  const range = options.range || readSelectedDateRange(
    settings,
    scope,
    project,
    options.query,
    options.today,
    options.timezone,
  );
  const direct = summarizeDirectBillingProject(settings, scope, project, entries, range);
  const childRows = includeDescendants
    ? sortProjectTree(projects)
        .filter((candidate) => candidate.parentProjectId === project.id)
        .map((childProject) => summarizeBillingProjectTree(
          settings,
          scope,
          childProject,
          projects,
          entries,
          {
            ...options,
            depth: Number(options.depth || 0) + 1,
            preserveEmpty: true,
          },
        ))
    : [];
  const branch = [direct || emptyProjectRow(settings, scope, project), ...childRows]
    .reduce((summary, row) => ({
      amount: summary.amount + row.amount,
      billableSeconds: summary.billableSeconds + row.billableSeconds,
      displaySeconds: summary.displaySeconds + row.displaySeconds,
      rawBillableSeconds: summary.rawBillableSeconds + row.rawBillableSeconds,
      rawSeconds: summary.rawSeconds + row.rawSeconds,
    }), {
      amount: 0,
      billableSeconds: 0,
      displaySeconds: 0,
      rawBillableSeconds: 0,
      rawSeconds: 0,
    });

  if (branch.rawSeconds === 0 && !options.preserveEmpty) {
    return null;
  }

  return {
    ...branch,
    project,
    rate: getProjectBillingRate(settings, scope, project),
    childRows,
    ...(options.depth ? { depth: options.depth } : {}),
  };
}

function summarizeDirectBillingProject(settings, scope, project, entries, range) {
  const projectEntries = entries.filter((entry) => (
    matchesProject(entry, project) && isEntryInRange(entry, range)
  ));
  const rawSeconds = projectEntries.reduce((seconds, entry) => seconds + entry.durationSeconds, 0);
  const rawBillableSeconds = projectEntries
    .filter((entry) => entry.billable === "yes")
    .reduce((seconds, entry) => seconds + entry.durationSeconds, 0);

  if (rawSeconds === 0) {
    return null;
  }

  const rounding = getEffectiveProjectBillingRounding(settings, scope, project);
  const billableSeconds = roundSeconds(rawBillableSeconds, rounding);
  const displaySeconds = rawBillableSeconds > 0 ? billableSeconds : roundSeconds(rawSeconds, rounding);
  const rate = getProjectBillingRate(settings, scope, project);
  const amount = (billableSeconds / 3600) * rate;

  return {
    amount,
    billableSeconds,
    displaySeconds,
    project,
    rate,
    rawBillableSeconds,
    rawSeconds,
  };
}

function emptyProjectRow(settings, scope, project) {
  return {
    amount: 0,
    billableSeconds: 0,
    displaySeconds: 0,
    project,
    rate: getProjectBillingRate(settings, scope, project),
    rawBillableSeconds: 0,
    rawSeconds: 0,
  };
}

function readSelectedDateRange(
  settings,
  scope,
  project,
  query = {},
  today = new Date(),
  timezone = DEFAULT_TIMEZONE,
) {
  if (query.period === "custom") {
    return getCustomDateRange(
      query.startDate || query.start_date,
      query.endDate || query.end_date,
      timezone,
    );
  }

  return getBillingPeriodRange(
    getEffectiveProjectBillingPeriod(settings, scope, project),
    query.period === "last" ? "last" : "current",
    today,
    timezone,
  );
}

function getCustomDateRange(startValue, endValue, timezone = DEFAULT_TIMEZONE) {
  const startDateKey = parseDateInput(startValue);
  const endDateKey = parseDateInput(endValue);

  if (!startDateKey || !endDateKey || startDateKey > endDateKey) {
    throw new AppError("Choose a valid custom start and end date.", 400);
  }

  return dateKeyRange(startDateKey, addLocalDateDays(endDateKey, 1), timezone);
}

function parseDateInput(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function getBillingPeriodRange(period, mode, today = new Date(), timezone = DEFAULT_TIMEZONE) {
  const normalizedPeriod = normalizeBillingPeriod(period);
  const todayKey = localDateKey(today, timezone);
  let startKey = normalizedPeriod.type === "custom"
    ? getCurrentCustomPeriodStart(todayKey, normalizedPeriod.startDay)
    : monthStartKey(todayKey);

  if (mode === "last") {
    startKey = addMonthsKey(startKey, -1);
  }

  return dateKeyRange(startKey, addMonthsKey(startKey, 1), timezone);
}

function getCurrentCustomPeriodStart(dateKey, startDay) {
  const currentMonthStart = `${dateKey.slice(0, 8)}${String(startDay).padStart(2, "0")}`;

  return dateKey >= currentMonthStart
    ? currentMonthStart
    : addMonthsKey(currentMonthStart, -1);
}

function addMonthsKey(dateKey, monthCount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + monthCount, day)).toISOString().slice(0, 10);
}

function getMonthRange(date, timezone = DEFAULT_TIMEZONE) {
  const startKey = monthStartKey(localDateKey(date, timezone));
  return dateKeyRange(startKey, addMonthsKey(startKey, 1), timezone);
}

function getTrailingMonthStarts(monthsBack, today = new Date(), timezone = DEFAULT_TIMEZONE) {
  const months = [];
  const currentMonthStart = monthStartKey(localDateKey(today, timezone));

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    months.push(new Date(localDateBoundToUtcIso(addMonthsKey(currentMonthStart, -offset), timezone)));
  }

  return months;
}

function monthStartKey(dateKey) {
  return `${dateKey.slice(0, 7)}-01`;
}

function dateKeyRange(startKey, endKey, timezone) {
  return {
    start: new Date(localDateBoundToUtcIso(startKey, timezone)),
    end: new Date(localDateBoundToUtcIso(endKey, timezone)),
  };
}

function isEntryInRange(entry, range) {
  return Boolean(
    range &&
    Number.isFinite(entry.endTime.getTime()) &&
    entry.endTime >= range.start &&
    entry.endTime < range.end,
  );
}

function matchesScope(entry, scope, options = {}) {
  if (scope.isWorkspaceScope) {
    return !normalizeKey(entry.clientId) && !normalizeKey(entry.clientName);
  }

  if (options.includeDescendants && scope.childScopeIds.includes(entry.clientId)) {
    return true;
  }

  return normalizeKey(entry.clientId) === normalizeKey(scope.id) ||
    normalizeKey(entry.clientName) === normalizeKey(scope.name);
}

function matchesProject(entry, project, options = {}) {
  if (options.includeDescendants && project.childProjectIds.includes(entry.projectId)) {
    return true;
  }

  return normalizeKey(entry.projectId) === normalizeKey(project.id) ||
    normalizeKey(entry.projectName) === normalizeKey(project.name);
}

function decorateProjectDescendants(projects) {
  const descendantsByProjectId = new Map(projects.map((project) => [project.id, []]));

  projects.forEach((project) => {
    let parentId = project.parentProjectId;

    while (parentId) {
      const descendants = descendantsByProjectId.get(parentId);
      if (!descendants) {
        break;
      }

      descendants.push(project.id);
      parentId = projects.find((candidate) => candidate.id === parentId)?.parentProjectId || "";
    }
  });

  return projects.map((project) => ({
    ...project,
    childProjectIds: descendantsByProjectId.get(project.id) || [],
  }));
}

function filterRollupProjects(projects, options = {}) {
  if (!options.includeDescendants) {
    return projects;
  }

  const selectedIds = new Set(projects.map((project) => project.id));

  return projects.filter((project) => !hasSelectedProjectAncestor(project, projects, selectedIds));
}

function filterRollupScopeSummaries(summaries) {
  const includedScopeIds = new Set(summaries.map((summary) => summary.scope.id));

  return summaries.filter((summary) => (
    !summary.scope.parentScopeId || !includedScopeIds.has(summary.scope.parentScopeId)
  ));
}

function hasSelectedProjectAncestor(project, projects, selectedIds) {
  let parentId = project.parentProjectId;
  const visited = new Set();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);

    if (selectedIds.has(parentId)) {
      return true;
    }

    parentId = projects.find((candidate) => candidate.id === parentId)?.parentProjectId || "";
  }

  return false;
}

function decorateScopeDepths(scopes) {
  return scopes.map((scope) => ({
    ...scope,
    depth: getScopeDepth(scope, scopes),
  }));
}

function getScopeDepth(scope, scopes, visited = new Set()) {
  if (!scope?.parentScopeId || visited.has(scope.id)) {
    return 0;
  }

  visited.add(scope.id);
  const parent = scopes.find((item) => item.id === scope.parentScopeId);
  return parent ? 1 + getScopeDepth(parent, scopes, visited) : 0;
}

function sortScopeTree(scopes) {
  return [...scopes].sort((left, right) =>
    getScopeTreeSortKey(left, scopes).localeCompare(getScopeTreeSortKey(right, scopes), undefined, {
      sensitivity: "base",
    }),
  );
}

function sortProjectTree(projects) {
  const projectsByParentId = new Map();
  const sortedProjects = [];
  const visited = new Set();

  projects.forEach((project) => {
    const parentId = project.parentProjectId || "";
    const siblings = projectsByParentId.get(parentId) || [];
    siblings.push(project);
    projectsByParentId.set(parentId, siblings);
  });

  const appendBranch = (parentId) => {
    const siblings = [...(projectsByParentId.get(parentId) || [])].sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" }),
    );

    siblings.forEach((project) => {
      if (visited.has(project.id)) {
        return;
      }

      visited.add(project.id);
      sortedProjects.push(project);
      appendBranch(project.id);
    });
  };

  appendBranch("");

  projects.forEach((project) => {
    if (!visited.has(project.id)) {
      visited.add(project.id);
      sortedProjects.push(project);
      appendBranch(project.id);
    }
  });

  return sortedProjects;
}

function getScopeTreeSortKey(scope, scopes) {
  if (scope.isWorkspaceScope) {
    return "";
  }

  const names = [];
  let currentScope = scope;
  const visited = new Set();

  while (currentScope && !visited.has(currentScope.id)) {
    visited.add(currentScope.id);
    names.unshift(currentScope.name || "");
    currentScope = scopes.find((item) => item.id === currentScope.parentScopeId);
  }

  return names.join("/");
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseSelectedIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIncludeDescendants(query = {}) {
  const rawValue = query.includeDescendants ?? query.include_descendants;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return true;
  }

  return rawValue === true || rawValue === "true" || rawValue === "1" || rawValue === 1;
}

function normalizeBillableFlag(value, fallback = "yes") {
  if (value === false || value === "no") {
    return "no";
  }

  if (value === true || value === "yes") {
    return "yes";
  }

  return fallback === "no" ? "no" : "yes";
}

function parseOptionalMoney(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const amount = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function parseMoney(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment) ? rounding.increment : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return {
    type: period.type === "custom" ? "custom" : "calendarMonth",
    startDay: Math.min(28, Math.max(1, Number.parseInt(period.startDay, 10) || 1)),
  };
}

function normalizeOptionalBillingRounding(rounding) {
  if (!rounding || rounding.type === "inherit") {
    return null;
  }

  return normalizeBillingRounding(rounding);
}

function roundSeconds(seconds, rounding) {
  const normalizedRounding = normalizeBillingRounding(rounding);

  if (!normalizedRounding.enabled) {
    return seconds;
  }

  const incrementSeconds = {
    nearestHour: 3600,
    nearestHalfHour: 1800,
    nearestQuarterHour: 900,
  }[normalizedRounding.increment];

  return Math.round(seconds / incrementSeconds) * incrementSeconds;
}

function getProjectBillingRate(settings, scope, project) {
  return project.effectiveBillingRate ?? project.billingRate ?? scope.billingRate ?? parseMoney(settings.defaultBillingRate);
}

function getEffectiveScopeBillingPeriod(settings, scope) {
  return scope.billingPeriod || settings.billingPeriod;
}

function getEffectiveProjectBillingPeriod(settings, scope, project) {
  return project.effectiveBillingPeriod || project.billingPeriod || getEffectiveScopeBillingPeriod(settings, scope);
}

function getEffectiveScopeBillingRounding(settings, scope) {
  return scope.billingRounding || settings.billingRounding;
}

function getEffectiveProjectBillingRounding(settings, scope, project) {
  return project.effectiveBillingRounding || project.billingRounding || getEffectiveScopeBillingRounding(settings, scope);
}

function toDashboardBillableRow(row) {
  return {
    amount: row.amount,
    billableSeconds: row.billableSeconds,
    displaySeconds: row.displaySeconds,
    scope: {
      id: row.scope.id,
      name: row.scope.name,
      isWorkspaceScope: row.scope.isWorkspaceScope,
    },
  };
}

function emptyProjectSummary(scope, taskFilter = []) {
  return {
    scope,
    taskFilter,
    rows: [],
    totals: { amount: 0, seconds: 0 },
  };
}

function readModulePanels(modules, panelGroup) {
  return modules
    .filter((moduleDefinition) => moduleDefinition.status === "enabled" || moduleDefinition.historicalReadAccess === true)
    .flatMap((moduleDefinition) => (
      Array.isArray(moduleDefinition[panelGroup])
        ? moduleDefinition[panelGroup].map((panel) => ({
            ...panel,
            moduleId: moduleDefinition.id,
            moduleName: moduleDefinition.displayName || moduleDefinition.name,
          }))
        : []
    ));
}

function workspaceSummary(session, settings) {
  return {
    id: session.workspace_id,
    name: settings.workspaceName || "Workspace",
    type: settings.workspaceType,
  };
}

export {
  buildBillingScopes,
  normalizeBillingSessionTimezone,
  normalizeTimeEntries,
  summarizeBillingScopesForRange,
  summarizeProjectBillingRows,
};

export const timeTrackingBillingService = {
  readDashboardBillingSummary,
  readProjectSummary,
  readReportingBootstrap,
  runProjectTimeBillingReport,
};
