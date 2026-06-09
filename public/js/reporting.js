// Reporting renders server-aggregated project/time/billing summaries.
const reportPeriodSelect = document.querySelector("[data-report-period]");
const reportCustomDates = document.querySelector("[data-report-custom-dates]");
const reportStartDateInput = document.querySelector("[data-report-start-date]");
const reportEndDateInput = document.querySelector("[data-report-end-date]");
const reportScopeControl = document.querySelector("[data-report-scope-control]");
const reportClientSelect = document.querySelector("[data-report-client]");
const reportProjectSelect = document.querySelector("[data-report-projects]");
const reportTagControl = document.querySelector("[data-report-tag-control]");
const reportTagFilterSelect = document.querySelector("[data-report-tag-filter]");
const reportIncludeDescendantsInput = document.querySelector("[data-report-include-descendants]");
const reportStatus = document.querySelector("[data-report-status]");
const reportExtensionPanels = document.querySelector("[data-report-extension-panels]");
const reportTableWrap = document.querySelector("[data-report-table-wrap]");
const reportTableBody = document.querySelector("[data-report-table-body]");
const reportTotalTime = document.querySelector("[data-report-total-time]");
const reportTotalBillableAmount = document.querySelector("[data-report-total-billable-amount]");

let reportBootstrap = {
  clientFiltersVisible: true,
  defaultScopeId: "",
  reportPanels: [],
  scopes: [],
};
let reportTagOptions = [];
const expandedProjectRows = new Set();
let currentProjectSummary = null;

setDefaultCustomDates();
updateCustomDateState();
loadReportData();

reportPeriodSelect.addEventListener("change", () => {
  updateCustomDateState();
  renderReport();
});
reportStartDateInput.addEventListener("change", renderReport);
reportEndDateInput.addEventListener("change", renderReport);

reportClientSelect.addEventListener("change", () => {
  renderProjectFilter();
  renderReport();
});

reportProjectSelect.addEventListener("change", renderReport);
reportTagFilterSelect?.addEventListener("change", renderReport);
reportIncludeDescendantsInput?.addEventListener("change", renderReport);

async function loadReportData() {
  setReportStatus("Loading report data...");

  try {
    const response = await fetch("/api/reporting/bootstrap", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load report data: ${response.status}`);
    }

    reportBootstrap = await response.json();
    reportTagOptions = await loadTagOptions();
    renderExtensionPanels();
    renderClientFilter();
    renderTagFilter();
    applyReportQueryParams();
    renderProjectFilter();
    await renderReport();
  } catch (error) {
    setReportStatus("Report data could not be loaded.");
    console.error(error);
  }
}

function applyReportQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const scopeId = params.get("client") || params.get("scope") || "";
  const fallbackScopeId = reportBootstrap.defaultScopeId || "";
  const nextScopeId = reportBootstrap.scopes.some((scope) => scope.id === scopeId)
    ? scopeId
    : fallbackScopeId;

  if (nextScopeId) {
    reportClientSelect.value = nextScopeId;
  }
}

function renderClientFilter() {
  reportClientSelect.replaceChildren(createOption("", "Select a reporting scope"));
  reportScopeControl.hidden = reportBootstrap.clientFiltersVisible === false;

  sortScopeTree(reportBootstrap.scopes).forEach((scope) => {
    const optionLabel = scope.isWorkspaceScope
      ? workspaceProjectsLabel()
      : `${treeIndent(getScopeDepth(scope, reportBootstrap.scopes))}${scope.name}`;
    reportClientSelect.appendChild(createOption(scope.id, optionLabel));
  });

  if (reportBootstrap.defaultScopeId) {
    reportClientSelect.value = reportBootstrap.defaultScopeId;
  }
}

function workspaceProjectsLabel() {
  return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
}

function renderProjectFilter() {
  const scope = getSelectedScope();
  reportProjectSelect.replaceChildren();
  reportProjectSelect.disabled = !scope;

  if (!scope) {
    return;
  }

  sortProjectTree(scope.projects).forEach((project) => {
    const option = createOption(project.id, `${treeIndent(getProjectDepth(project, scope.projects))}${project.name}`);
    option.selected = true;
    reportProjectSelect.appendChild(option);
  });
}

async function renderReport() {
  const scope = getSelectedScope();
  reportTableBody.innerHTML = "";
  reportTableWrap.hidden = true;

  if (!scope) {
    setReportStatus("");
    return;
  }

  if (reportPeriodSelect.value === "custom" && !getCustomDateRange()) {
    setReportStatus("Choose a valid custom start and end date.");
    return;
  }

  const selectedProjectIds = getSelectedProjectIds();

  if (selectedProjectIds.length === 0) {
    setReportStatus("Select at least one project.");
    return;
  }

  setReportStatus("Loading report summary...");

  try {
    const params = new URLSearchParams({
      period: reportPeriodSelect.value,
      scopeId: scope.id,
      projectIds: selectedProjectIds.join(","),
      includeDescendants: reportIncludeDescendantsInput?.checked ? "true" : "false",
    });
    const selectedTagId = String(reportTagFilterSelect?.value || "").trim();

    if (selectedTagId) {
      params.set("tagIds", selectedTagId);
    }

    if (reportPeriodSelect.value === "custom") {
      params.set("startDate", reportStartDateInput.value);
      params.set("endDate", reportEndDateInput.value);
    }

    const response = await fetch(`/api/reporting/project-summary?${params.toString()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load report summary: ${response.status}`);
    }

    renderProjectSummary(await response.json());
  } catch (error) {
    setReportStatus("Report summary could not be loaded.");
    console.error(error);
  }
}

function renderProjectSummary(summary) {
  currentProjectSummary = summary;
  reportTableBody.innerHTML = "";

  if (!summary.rows?.length) {
    reportTotalTime.textContent = formatHours(0);
    reportTotalBillableAmount.textContent = formatCurrency(0);
    reportTableWrap.hidden = true;
    setReportStatus("No time entries match these filters.");
    return;
  }

  summary.rows.forEach((row) => {
    appendReportRow(row, { depth: 0 });
  });

  reportTotalTime.textContent = formatHours(summary.totals?.seconds || 0);
  reportTotalBillableAmount.textContent = formatCurrency(summary.totals?.amount || 0);
  reportTableWrap.hidden = false;
  setReportStatus("");
}

function appendReportRow(row, options = {}) {
  const depth = Number(options.depth) || 0;
  const childRows = Array.isArray(row.childRows) ? row.childRows : [];
  const rowId = getReportRowId(row);
  const isExpanded = expandedProjectRows.has(rowId);
  const tableRow = createReportRow(row, { depth, hasChildren: childRows.length > 0, isExpanded });

  reportTableBody.appendChild(tableRow);

  if (!isExpanded) {
    return;
  }

  childRows.forEach((childRow) => {
    appendReportRow(childRow, { depth: depth + 1 });
  });
}

function createReportRow(row, options = {}) {
  const { rate, displaySeconds, billableSeconds, amount } = row;
  const hasBillableTime = billableSeconds > 0;
  const tableRow = document.createElement("tr");
  tableRow.className = options.depth > 0 ? "report-child-row" : "report-parent-row";
  tableRow.append(
    createProjectCell(row, options),
    createTableCell(hasBillableTime ? formatRate(rate) : ""),
    createTableCell(formatHours(displaySeconds)),
    createTableCell(hasBillableTime ? formatCurrency(amount) : ""),
  );
  tableRow.firstElementChild.scope = "row";
  return tableRow;
}

function createProjectCell(row, options = {}) {
  const cell = document.createElement("th");
  const projectName = row.project?.name || "";
  const depth = Number(options.depth) || 0;
  const rowId = getReportRowId(row);
  const wrapper = document.createElement("span");
  wrapper.className = "report-project-cell";
  wrapper.style.setProperty("--report-project-depth", String(depth));

  if (options.hasChildren) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "report-project-toggle";
    button.setAttribute("aria-expanded", options.isExpanded ? "true" : "false");
    button.setAttribute("aria-label", `${options.isExpanded ? "Collapse" : "Expand"} ${projectName}`);
    button.textContent = options.isExpanded ? "v" : ">";
    button.addEventListener("click", () => {
      if (expandedProjectRows.has(rowId)) {
        expandedProjectRows.delete(rowId);
      } else {
        expandedProjectRows.add(rowId);
      }

      renderProjectSummary(currentProjectSummary);
    });
    wrapper.appendChild(button);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "report-project-toggle-spacer";
    wrapper.appendChild(spacer);
  }

  const label = document.createElement("span");
  label.textContent = projectName;
  wrapper.appendChild(label);
  cell.appendChild(wrapper);
  return cell;
}

function getReportRowId(row) {
  return `${row.project?.id || row.project?.name || ""}`;
}

function renderExtensionPanels() {
  reportExtensionPanels.replaceChildren();

  if (!Array.isArray(reportBootstrap.reportPanels) || reportBootstrap.reportPanels.length === 0) {
    reportExtensionPanels.hidden = true;
    return;
  }

  reportBootstrap.reportPanels.forEach((panel) => {
    const marker = document.createElement("div");
    marker.dataset.reportPanel = panel.id;
    marker.dataset.moduleId = panel.moduleId;
    reportExtensionPanels.appendChild(marker);
  });
  reportExtensionPanels.hidden = false;
}

function getSelectedScope() {
  return reportBootstrap.scopes.find((scope) => scope.id === reportClientSelect.value);
}

async function loadTagOptions() {
  return window.LongtailForge?.tags?.loadTags
    ? window.LongtailForge.tags.loadTags({ status: "active" })
    : [];
}

function renderTagFilter() {
  if (!reportTagFilterSelect || !reportTagControl) {
    return;
  }

  reportTagFilterSelect.replaceChildren(createOption("", "All tags"));
  reportTagOptions.forEach((tag) => {
    reportTagFilterSelect.appendChild(createOption(tag.tag_id, tag.name));
  });
  reportTagControl.hidden = reportTagOptions.length === 0;
}

function getSelectedProjectIds() {
  return [...reportProjectSelect.selectedOptions].map((option) => option.value);
}

function getCustomDateRange() {
  const startDate = parseDateInput(reportStartDateInput.value);
  const endDate = parseDateInput(reportEndDateInput.value);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  return { start: startDate, end: endDate };
}

function updateCustomDateState() {
  const isCustom = reportPeriodSelect.value === "custom";
  reportCustomDates.hidden = !isCustom;
  reportStartDateInput.disabled = !isCustom;
  reportEndDateInput.disabled = !isCustom;
}

function setDefaultCustomDates() {
  const today = new Date();
  reportStartDateInput.value = formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
  reportEndDateInput.value = formatDateInput(today);
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date) {
  return window.LongtailForge.formatters.dateInput(date);
}

function formatRate(rate) {
  return rate ? `${formatCurrency(rate)}/hr` : "$0.00/hr";
}

function formatHours(seconds) {
  return window.LongtailForge.formatters.hours(seconds);
}

function formatCurrency(amount) {
  return window.LongtailForge.formatters.currency(amount);
}

function createOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function createTableCell(text, tagName = "td") {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
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

function getScopeDepth(scope, scopes, visited = new Set()) {
  if (Number.isFinite(Number(scope?.depth))) {
    return Number(scope.depth);
  }

  if (!scope?.parentScopeId || visited.has(scope.id)) {
    return 0;
  }

  visited.add(scope.id);
  const parent = scopes.find((item) => item.id === scope.parentScopeId);
  return parent ? 1 + getScopeDepth(parent, scopes, visited) : 0;
}

function getProjectDepth(project, projects, visited = new Set()) {
  if (!project?.parentProjectId || visited.has(project.id)) {
    return 0;
  }

  visited.add(project.id);
  const parent = projects.find((item) => item.id === project.parentProjectId);
  return parent ? 1 + getProjectDepth(parent, projects, visited) : 0;
}

function treeIndent(depth) {
  return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
}

function setReportStatus(message) {
  reportStatus.textContent = message;
}
