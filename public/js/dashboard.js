// Dashboard renders a workspace/project hub plus module-provided widgets.
const dashboardHubCountLabel = document.querySelector("[data-dashboard-hub-count-label]");
const activeClientCount = document.querySelector("[data-active-client-count]");
const clientReportOptions = document.querySelector("[data-client-report-options]");
const openClientReportButton = document.querySelector("[data-open-client-report]");
const dashboardExtensionPanels = document.querySelector("[data-dashboard-extension-panels]");
const currentMonthBillables = document.querySelector("[data-current-month-billables]");
const currentMonthHours = document.querySelector("[data-current-month-hours]");
const currentMonthAmount = document.querySelector("[data-current-month-amount]");
const billablesChart = document.querySelector("[data-billables-chart]");
const dashboardStatus = document.querySelector("[data-dashboard-status]");

let dashboardData = null;

loadDashboardData();

clientReportOptions.addEventListener("change", () => {
  openClientReportButton.disabled = !getSelectedReportScopeId();
});

openClientReportButton.addEventListener("click", () => {
  const scopeId = getSelectedReportScopeId();

  if (!scopeId) {
    return;
  }

  window.location.href = `reporting.html?scope=${encodeURIComponent(scopeId)}`;
});

async function loadDashboardData() {
  setDashboardStatus("Loading dashboard...");

  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load dashboard data: ${response.status}`);
    }

    dashboardData = await response.json();
    renderProjectHub();
    renderExtensionPanels();
    renderCurrentMonthBillables();
    renderBillablesChart();
    setDashboardStatus("");
  } catch (error) {
    setDashboardStatus("Dashboard data could not be loaded.");
    console.error(error);
  }
}

function renderProjectHub() {
  const hub = dashboardData?.hub || {};
  const reportScopes = Array.isArray(hub.reportScopes) ? hub.reportScopes : [];
  dashboardHubCountLabel.textContent = hub.countLabel || "Active Projects";
  activeClientCount.textContent = String(hub.activeCount || 0);
  clientReportOptions.replaceChildren(createLegend(hub.reportLegend || "Project Reporting"));

  reportScopes.forEach((scope) => {
    clientReportOptions.appendChild(createScopeRadio(scope));
  });

  const defaultScopeId = hub.defaultReportScopeId || "";

  if (defaultScopeId) {
    const defaultInput = [...clientReportOptions.querySelectorAll("input[name='dashboard-report-client']")]
      .find((input) => input.value === defaultScopeId);

    if (defaultInput) {
      defaultInput.checked = true;
    }
  }

  openClientReportButton.disabled = !getSelectedReportScopeId();
}

function renderCurrentMonthBillables() {
  const rows = dashboardData?.timeTracking?.currentMonthBillables || [];
  currentMonthBillables.innerHTML = "";

  if (!dashboardData?.timeTracking?.available) {
    renderEmptyBillableRow("Time Tracking is not available for this workspace.");
    return;
  }

  if (!rows.length) {
    renderEmptyBillableRow("No billables for the current month.");
    return;
  }

  rows.forEach((billableRow) => {
    const row = document.createElement("tr");
    row.append(
      createScopeLinkCell(billableRow.scope),
      createTableCell(formatHours(billableRow.billableSeconds)),
      createTableCell(formatCurrency(billableRow.amount)),
    );
    row.firstElementChild.scope = "row";
    currentMonthBillables.appendChild(row);
  });

  currentMonthHours.textContent = formatHours(dashboardData.timeTracking.currentMonthTotals?.seconds || 0);
  currentMonthAmount.textContent = formatCurrency(dashboardData.timeTracking.currentMonthTotals?.amount || 0);
}

function renderEmptyBillableRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 3;
  cell.textContent = message;
  row.appendChild(cell);
  currentMonthBillables.appendChild(row);
  currentMonthHours.textContent = formatHours(0);
  currentMonthAmount.textContent = formatCurrency(0);
}

function renderBillablesChart() {
  const points = (dashboardData?.timeTracking?.chartPoints || []).map((point) => ({
    label: formatMonthLabel(new Date(point.labelDate)),
    hours: Number(point.hours) || 0,
    amount: Number(point.amount) || 0,
  }));

  billablesChart.innerHTML = createBillablesSvg(points);
}

function renderExtensionPanels() {
  const panels = dashboardData?.extensionPoints?.dashboardPanels || [];
  dashboardExtensionPanels.replaceChildren();

  if (!Array.isArray(panels) || panels.length === 0) {
    dashboardExtensionPanels.hidden = true;
    return;
  }

  panels.forEach((panel) => {
    const marker = document.createElement("div");
    marker.dataset.dashboardPanel = panel.id;
    marker.dataset.moduleId = panel.moduleId;
    dashboardExtensionPanels.appendChild(marker);
  });
  dashboardExtensionPanels.hidden = false;
}

function createBillablesSvg(points) {
  const width = 900;
  const height = 340;
  const padding = { top: 64, right: 122, bottom: 48, left: 96 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const normalizedPoints = points.length > 0 ? points : [{ label: "", hours: 0, amount: 0 }];
  const maxHours = Math.max(1, ...normalizedPoints.map((point) => point.hours));
  const maxAmount = Math.max(1, ...normalizedPoints.map((point) => point.amount));
  const groupWidth = chartWidth / normalizedPoints.length;
  const hourBarWidth = Math.min(18, groupWidth * 0.28);
  const amountBarWidth = Math.min(18, groupWidth * 0.28);
  const monthLabels = normalizedPoints.map((point, index) => {
    const x = padding.left + groupWidth * index + groupWidth / 2;
    return `<text x="${x}" y="${height - 18}" text-anchor="middle">${point.label}</text>`;
  }).join("");
  const bars = normalizedPoints.map((point, index) => {
    const centerX = padding.left + groupWidth * index + groupWidth / 2;
    const hourHeight = (point.hours / maxHours) * chartHeight;
    const amountHeight = (point.amount / maxAmount) * chartHeight;
    const hourX = centerX - hourBarWidth - 2;
    const amountX = centerX + 2;
    const hourY = padding.top + chartHeight - hourHeight;
    const amountY = padding.top + chartHeight - amountHeight;

    return `
      <rect class="chart-hours" x="${hourX}" y="${hourY}" width="${hourBarWidth}" height="${hourHeight}">
        <title>${formatChartHours(point.hours)}</title>
      </rect>
      <rect class="chart-amount" x="${amountX}" y="${amountY}" width="${amountBarWidth}" height="${amountHeight}">
        <title>${formatCurrency(point.amount)}</title>
      </rect>
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Hours and billables by month">
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}"></line>
      <line class="chart-axis" x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>
      <text class="chart-axis-label" x="${padding.left - 54}" y="${padding.top + 22}">Hours</text>
      <text class="chart-axis-label" x="${width - padding.right + 54}" y="${padding.top + 22}" text-anchor="middle">Dollars</text>
      <text x="${padding.left - 8}" y="${padding.top + 4}" text-anchor="end">${maxHours.toFixed(1)}</text>
      <text x="${width - padding.right + 8}" y="${padding.top + 4}">${formatCurrency(maxAmount)}</text>
      ${bars}
      ${monthLabels}
      <g class="chart-legend">
        <rect class="chart-hours" x="${padding.left}" y="28" width="12" height="12"></rect>
        <text x="${padding.left + 18}" y="38">Hours</text>
        <rect class="chart-amount" x="${padding.left + 86}" y="28" width="12" height="12"></rect>
        <text x="${padding.left + 104}" y="38">Billable</text>
      </g>
    </svg>
  `;
}

function getSelectedReportScopeId() {
  return clientReportOptions.querySelector("input[name='dashboard-report-client']:checked")?.value || "";
}

function formatHours(seconds) {
  return window.LongtailForge.formatters.hours(seconds);
}

function formatCurrency(amount) {
  return window.LongtailForge.formatters.currency(amount);
}

function formatMonthLabel(date) {
  return window.LongtailForge.formatters.monthLabel(date);
}

function formatChartHours(hours) {
  const value = Number(hours) || 0;
  return `${value.toFixed(1)} hours`;
}

function createLegend(text) {
  const legend = document.createElement("legend");
  legend.textContent = text;
  return legend;
}

function createScopeRadio(scope) {
  const label = document.createElement("label");
  label.className = "client-radio-option";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = "dashboard-report-client";
  input.value = scope.id;

  label.append(input, document.createTextNode(scope.isWorkspaceScope ? "Workspace Projects" : scope.name));
  return label;
}

function createTableCell(text, tagName = "td") {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function createScopeLinkCell(scope) {
  const cell = document.createElement("th");
  const link = document.createElement("a");
  link.href = `reporting.html?scope=${encodeURIComponent(scope.id)}`;
  link.textContent = scope.isWorkspaceScope ? "Workspace Projects" : scope.name;
  cell.scope = "row";
  cell.appendChild(link);
  return cell;
}

function setDashboardStatus(message) {
  dashboardStatus.textContent = message;
}
