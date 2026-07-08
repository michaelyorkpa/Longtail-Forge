import { clientsService } from "../client-projects/clients.service.js";
import { permissionsService } from "../../core/permissions.js";
import { settingsService } from "../../services/settings.service.js";
import { timeEntriesService } from "./time-entries.service.js";

const WORKSPACE_SCOPE_ID = "__workspace_projects__";

async function readDashboardBillingSummary(session) {
  await permissionsService.assertCanInAnyScope(session, "reporting.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  const [settings, clientProjectData, timeEntries] = await Promise.all([
    settingsService.read(session),
    clientsService.readClientProjects(session),
    timeEntriesService.list(session),
  ]);
  const entries = normalizeTimeEntries(timeEntries.entries);
  const activeScopes = buildBillingScopes(clientProjectData, settings, { includeInactive: true })
    .filter((scope) => scope.status === "Active");
  const currentMonthRows = summarizeBillingScopesForRange(settings, activeScopes, entries, getMonthRange(new Date()))
    .filter((row) => row.billableSeconds > 0);
  const currentMonthTotals = currentMonthRows.reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.billableSeconds,
  }), { amount: 0, seconds: 0 });
  const chartPoints = getTrailingMonthStarts(12).map((monthStart) => {
    const range = getMonthRange(monthStart);
    const totals = summarizeBillingScopesForRange(settings, activeScopes, entries, range)
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

function buildBillingScopes(data, settings, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const workspaceProjects = Array.isArray(data.workspaceProjects)
    ? data.workspaceProjects.map((project) => normalizeProject(project, "yes"))
    : [];
  const workspaceScope = workspaceProjects.length > 0
      ? [normalizeScope({
        id: WORKSPACE_SCOPE_ID,
        name: settings.workspaceName || "Workspace",
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
    parentScopeId: String(client.parent_client_id || "").trim(),
    depth: Number.isFinite(Number(client.depth)) ? Number(client.depth) : 0,
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
    .map((project) => summarizeBillingProject(settings, scope, project, scopeEntries, range, {
      includeDescendants: true,
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

function summarizeBillingProject(settings, scope, project, entries, range, options = {}) {
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
  return project.billingRate ?? scope.billingRate ?? parseMoney(settings.defaultBillingRate);
}

function getEffectiveScopeBillingRounding(settings, scope) {
  return scope.billingRounding || settings.billingRounding;
}

function getEffectiveProjectBillingRounding(settings, scope, project) {
  return project.billingRounding || getEffectiveScopeBillingRounding(settings, scope);
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

export {
  buildBillingScopes,
  normalizeTimeEntries,
  summarizeBillingScopesForRange,
};

export const timeTrackingBillingService = {
  readDashboardBillingSummary,
};
