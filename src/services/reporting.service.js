import { clientsService } from "../modules/client-projects/clients.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";
import { timeEntriesService } from "../modules/time-tracking/time-entries.service.js";
import { modulesService } from "../core/modules/modules.service.js";
import { AppError } from "../core/errors.js";
import { permissionsService } from "../core/permissions.js";
import { settingsService } from "./settings.service.js";

const WORKSPACE_SCOPE_ID = "__workspace_projects__";
const TIME_TRACKING_MODULE_ID = "time-tracking";
const TASKS_MODULE_ID = "tasks";

async function readReportingBootstrap(session) {
  const { settings, scopes, moduleContext } = await readReportContext(session);
  const clientFiltersVisible = settings.workspaceType === "business";

  return {
    workspace: workspaceSummary(session, settings),
    clientFiltersVisible,
    defaultScopeId: clientFiltersVisible ? "" : scopes[0]?.id || "",
    scopes,
    reportPanels: readModulePanels(moduleContext.modules, "reporting"),
  };
}

async function readProjectSummary(session, query = {}) {
  const { settings, scopes } = await readReportContext(session);
  const entries = normalizeTimeEntries((await timeEntriesService.list(session)).entries);
  const scope = scopes.find((item) => item.id === String(query.scopeId || query.scope_id || "").trim());
  const includeDescendants = parseIncludeDescendants(query);

  if (!scope) {
    throw new AppError("Reporting scope not found.", 404);
  }

  const selectedProjectIds = parseSelectedProjectIds(query.projectIds || query.project_ids);
  const selectedTaskIds = parseSelectedTaskIds(query.taskIds || query.task_ids || query.taskId || query.task_id);
  const projects = scope.projects
    .filter((project) => selectedProjectIds.length === 0 || selectedProjectIds.includes(project.id));

  if (projects.length === 0) {
    return emptyProjectSummary(scope, selectedTaskIds);
  }

  const scopeEntries = entries
    .filter((entry) => matchesScope(entry, scope, { includeDescendants }))
    .filter((entry) => selectedTaskIds.length === 0 || selectedTaskIds.includes(entry.taskId));
  const rows = projects
    .map((project) => summarizeProject(
      settings,
      scope,
      project,
      scopeEntries,
      readSelectedDateRange(settings, scope, project, query),
      { includeDescendants },
    ))
    .filter(Boolean);
  const totals = rows.reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.displaySeconds,
  }), { amount: 0, seconds: 0 });

  return {
    scope,
    taskFilter: selectedTaskIds,
    rows,
    totals,
  };
}

async function readDashboard(session) {
  const { settings, scopes, moduleContext } = await readReportContext(session, { includeInactive: true });
  const entries = normalizeTimeEntries((await timeEntriesService.list(session)).entries);
  const clientFiltersVisible = settings.workspaceType === "business";
  const activeScopes = scopes.filter((scope) => scope.status === "Active");
  const currentMonthRange = getMonthRange(new Date());
  const currentMonthRows = summarizeScopesForRange(settings, activeScopes, entries, currentMonthRange)
    .filter((row) => row.billableSeconds > 0);
  const currentMonthTotals = currentMonthRows.reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.billableSeconds,
  }), { amount: 0, seconds: 0 });
  const chartPoints = getTrailingMonthStarts(12).map((monthStart) => {
    const range = getMonthRange(monthStart);
    const totals = summarizeScopesForRange(settings, activeScopes, entries, range)
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
  const taskSummary = moduleHasPanel(moduleContext.modules, TASKS_MODULE_ID, "dashboard", "task-summary")
    ? await tasksService.summary(session)
    : null;

  return {
    workspace: workspaceSummary(session, settings),
    hub: {
      clientFiltersVisible,
      countLabel: clientFiltersVisible ? "Active Clients" : "Active Projects",
      reportLegend: clientFiltersVisible ? "Client Reporting" : "Project Reporting",
      activeCount: clientFiltersVisible
        ? activeScopes.filter((scope) => !scope.isWorkspaceScope).length
        : activeScopes.flatMap((scope) => scope.projects).filter((project) => project.status !== "Inactive").length,
      reportScopes: clientFiltersVisible ? activeScopes.filter((scope) => !scope.isWorkspaceScope) : activeScopes,
      defaultReportScopeId: clientFiltersVisible ? "" : activeScopes[0]?.id || "",
    },
    timeTracking: {
      available: moduleHasPanel(moduleContext.modules, TIME_TRACKING_MODULE_ID, "dashboard", "billing-summary"),
      currentMonthBillables: currentMonthRows,
      currentMonthTotals,
      chartPoints,
    },
    tasks: {
      available: Boolean(taskSummary),
      summary: taskSummary,
    },
    extensionPoints: {
      dashboardPanels: readModulePanels(moduleContext.modules, "dashboard"),
      reportingPanels: readModulePanels(moduleContext.modules, "reporting"),
      reserved: ["tasks", "notes", "tickets", "notifications", "activity-feed"],
    },
  };
}

async function readReportContext(session, options = {}) {
  await permissionsService.assertCanInAnyScope(session, "reporting.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });
  const settings = await settingsService.read(session);
  const moduleContext = await modulesService.readWorkspaceModuleContext(session.workspace_id);
  const clientProjectData = await clientsService.readClientProjects(session);
  const scopes = buildReportingScopes(clientProjectData, settings, options);

  return { settings, scopes, moduleContext };
}

function buildReportingScopes(data, settings, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const workspaceProjects = Array.isArray(data.workspaceProjects)
    ? data.workspaceProjects.map((project) => normalizeProject(project, "yes"))
    : [];
  const workspaceScope = workspaceProjects.length > 0
      ? [normalizeScope({
        id: WORKSPACE_SCOPE_ID,
        name: `${settings.workspaceName || "Workspace"} Projects`,
        status: "Active",
        billable: "yes",
        isWorkspaceScope: true,
        projects: workspaceProjects,
      })]
    : [];
  const clientScopes = Array.isArray(data.clients)
    ? data.clients
        .filter((client) => includeInactive || client.status !== "Inactive")
        .map((client) => normalizeScope(client))
    : [];

  if (settings.workspaceType !== "business") {
    return workspaceScope;
  }

  return [...workspaceScope, ...sortByName(clientScopes)];
}

function normalizeScope(client) {
  const billable = normalizeBillableFlag(client.billable);

  return {
    id: String(client.id || "").trim(),
    name: String(client.name || "").trim(),
    status: client.status === "Inactive" ? "Inactive" : "Active",
    billable,
    billingRate: parseOptionalMoney(client.billing_rate),
    billingPeriod: normalizeOptionalBillingPeriod(client.billing_period),
    billingRounding: normalizeOptionalBillingRounding(client.billing_rounding),
    isWorkspaceScope: Boolean(client.isWorkspaceScope),
    childScopeIds: Array.isArray(client.childScopeIds) ? client.childScopeIds : [],
    projects: decorateProjectDescendants(Array.isArray(client.projects)
      ? client.projects.map((project) => normalizeProject(project, billable))
      : []),
  };
}

function normalizeProject(project, fallbackBillable = "yes") {
  return {
    id: String(project.id || "").trim(),
    name: String(project.name || "").trim(),
    parentProjectId: String(project.parent_project_id || "").trim(),
    status: project.status === "Inactive" ? "Inactive" : "Active",
    billable: normalizeBillableFlag(project.billable, fallbackBillable),
    billingRate: parseOptionalMoney(project.billing_rate),
    billingPeriod: normalizeOptionalBillingPeriod(project.billing_period),
    billingRounding: normalizeOptionalBillingRounding(project.billing_rounding),
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
      }))
    : [];
}

function summarizeScopesForRange(settings, scopes, entries, range) {
  return sortByName(scopes).map((scope) => summarizeScopeForRange(settings, scope, entries, range));
}

function summarizeScopeForRange(settings, scope, entries, range) {
  const scopeEntries = entries.filter((entry) => matchesScope(entry, scope, { includeDescendants: true }));
  const projectSummaries = scope.projects
    .map((project) => summarizeProject(settings, scope, project, scopeEntries, range, { includeDescendants: true }))
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

function summarizeProject(settings, scope, project, entries, range, options = {}) {
  const projectEntries = entries.filter((entry) => (
    matchesProject(entry, project, options) && isEntryInRange(entry, range)
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

function readSelectedDateRange(settings, scope, project, query = {}) {
  if (query.period === "custom") {
    return getCustomDateRange(query.startDate || query.start_date, query.endDate || query.end_date);
  }

  return getBillingPeriodRange(
    getEffectiveProjectBillingPeriod(settings, scope, project),
    query.period === "last" ? "last" : "current",
  );
}

function getCustomDateRange(startValue, endValue) {
  const start = parseDateInput(startValue);
  const endDate = parseDateInput(endValue);

  if (!start || !endDate || start > endDate) {
    throw new AppError("Choose a valid custom start and end date.", 400);
  }

  const end = new Date(endDate);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function parseDateInput(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function getBillingPeriodRange(period, mode, today = new Date()) {
  const normalizedPeriod = normalizeBillingPeriod(period);
  let start = normalizedPeriod.type === "custom"
    ? getCurrentCustomPeriodStart(today, normalizedPeriod.startDay)
    : new Date(today.getFullYear(), today.getMonth(), 1);

  if (mode === "last") {
    start = addMonths(start, -1);
  }

  return {
    start,
    end: addMonths(start, 1),
  };
}

function getCurrentCustomPeriodStart(date, startDay) {
  const currentMonthStart = new Date(date.getFullYear(), date.getMonth(), startDay);

  return date >= currentMonthStart
    ? currentMonthStart
    : new Date(date.getFullYear(), date.getMonth() - 1, startDay);
}

function getMonthRange(date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

function getTrailingMonthStarts(monthsBack, today = new Date()) {
  const months = [];

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    months.push(new Date(today.getFullYear(), today.getMonth() - offset, 1));
  }

  return months;
}

function addMonths(date, monthCount) {
  return new Date(date.getFullYear(), date.getMonth() + monthCount, date.getDate());
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

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseSelectedProjectIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSelectedTaskIds(value) {
  return parseSelectedProjectIds(value);
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

function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return normalizeBillingPeriod(period);
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment) ? rounding.increment : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
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
  return project.billingRate ?? scope.billingRate ?? parseMoney(settings.defaultBillingRate);
}

function getEffectiveScopeBillingPeriod(settings, scope) {
  return scope.billingPeriod || settings.billingPeriod;
}

function getEffectiveProjectBillingPeriod(settings, scope, project) {
  return project.billingPeriod || getEffectiveScopeBillingPeriod(settings, scope);
}

function getEffectiveScopeBillingRounding(settings, scope) {
  return scope.billingRounding || settings.billingRounding;
}

function getEffectiveProjectBillingRounding(settings, scope, project) {
  return project.billingRounding || getEffectiveScopeBillingRounding(settings, scope);
}

function sortByName(items) {
  return [...items].sort((firstItem, secondItem) =>
    String(firstItem.name || "").localeCompare(String(secondItem.name || ""), undefined, {
      sensitivity: "base",
    }),
  );
}

function emptyProjectSummary(scope, taskFilter = []) {
  return {
    scope,
    taskFilter,
    rows: [],
    totals: { amount: 0, seconds: 0 },
  };
}

function moduleHasPanel(modules, moduleId, panelGroup, panelId) {
  const moduleDefinition = modules.find((item) => item.id === moduleId);
  const moduleAvailable = moduleDefinition?.status === "enabled" || moduleDefinition?.historicalReadAccess === true;
  const panels = Array.isArray(moduleDefinition?.[panelGroup]) ? moduleDefinition[panelGroup] : [];

  return moduleAvailable && panels.some((panel) => panel.id === panelId);
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

export const reportingService = {
  readDashboard,
  readProjectSummary,
  readReportingBootstrap,
};
