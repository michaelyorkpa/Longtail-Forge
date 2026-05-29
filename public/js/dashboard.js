// Dashboard is a summary view built from the same shared billing source as Reporting.
const activeClientCount = document.querySelector("[data-active-client-count]");
const clientReportOptions = document.querySelector("[data-client-report-options]");
const openClientReportButton = document.querySelector("[data-open-client-report]");
const currentMonthBillables = document.querySelector("[data-current-month-billables]");
const currentMonthHours = document.querySelector("[data-current-month-hours]");
const currentMonthAmount = document.querySelector("[data-current-month-amount]");
const billablesChart = document.querySelector("[data-billables-chart]");
const dashboardStatus = document.querySelector("[data-dashboard-status]");

let dashboardSettings = window.LongtailForge.billing.normalizeSettings({});
let dashboardClients = [];
let dashboardEntries = [];

loadDashboardData();

clientReportOptions.addEventListener("change", () => {
  openClientReportButton.disabled = !getSelectedReportClientId();
});

openClientReportButton.addEventListener("click", () => {
  const clientId = getSelectedReportClientId();

  if (!clientId) {
    return;
  }

  window.location.href = `reporting.html?client=${encodeURIComponent(clientId)}`;
});

async function loadDashboardData() {
  setDashboardStatus("Loading dashboard...");

  try {
    const [settingsResponse, clientsResponse, entriesResponse] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("/api/client-projects", { cache: "no-store" }),
      fetch("/api/time-entries", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    dashboardSettings = settingsResponse.ok
      ? window.LongtailForge.billing.normalizeSettings(await settingsResponse.json())
      : window.LongtailForge.billing.normalizeSettings({});
    dashboardClients = window.LongtailForge.billing.normalizeClients(await clientsResponse.json(), {
      includeInactive: true,
    });
    dashboardEntries = entriesResponse.ok
      ? window.LongtailForge.billing.normalizeTimeEntries(await entriesResponse.json())
      : [];

    renderActiveClients();
    renderCurrentMonthBillables();
    renderBillablesChart();
    setDashboardStatus("");
  } catch (error) {
    setDashboardStatus("Dashboard data could not be loaded.");
    console.error(error);
  }
}

function renderActiveClients() {
  const activeClients = sortByName(dashboardClients.filter((client) => client.status === "Active"));
  activeClientCount.textContent = String(activeClients.length);
  clientReportOptions.replaceChildren(createLegend("Client Reporting"));

  activeClients.forEach((client) => {
    clientReportOptions.appendChild(createClientRadio(client));
  });

  openClientReportButton.disabled = true;
}

function renderCurrentMonthBillables() {
  const range = window.LongtailForge.billing.getMonthRange(new Date());
  const rows = window.LongtailForge.billing
    .summarizeClientsForRange(dashboardSettings, dashboardClients, dashboardEntries, range)
    .filter((row) => row.billableSeconds > 0);
  currentMonthBillables.innerHTML = "";

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "No billables for the current month.";
    row.appendChild(cell);
    currentMonthBillables.appendChild(row);
    currentMonthHours.textContent = formatHours(0);
    currentMonthAmount.textContent = formatCurrency(0);
    return;
  }

  const totals = rows.reduce((summary, row) => ({
    amount: summary.amount + row.amount,
    seconds: summary.seconds + row.billableSeconds,
  }), { amount: 0, seconds: 0 });

  rows.forEach((billableRow) => {
    const row = document.createElement("tr");
    row.append(
      createClientLinkCell(billableRow.client),
      createTableCell(formatHours(billableRow.billableSeconds)),
      createTableCell(formatCurrency(billableRow.amount)),
    );
    row.firstElementChild.scope = "row";
    currentMonthBillables.appendChild(row);
  });

  currentMonthHours.textContent = formatHours(totals.seconds);
  currentMonthAmount.textContent = formatCurrency(totals.amount);
}

function renderBillablesChart() {
  const months = window.LongtailForge.billing.getTrailingMonthStarts(12);
  const points = months.map((monthStart) => {
    const range = window.LongtailForge.billing.getMonthRange(monthStart);
    const totals = window.LongtailForge.billing
      .summarizeClientsForRange(dashboardSettings, dashboardClients, dashboardEntries, range)
      .reduce((summary, row) => ({
        amount: summary.amount + row.amount,
        seconds: summary.seconds + row.displaySeconds,
      }), { amount: 0, seconds: 0 });

    return {
      label: formatMonthLabel(monthStart),
      hours: totals.seconds / 3600,
      amount: totals.amount,
    };
  });

  billablesChart.innerHTML = createBillablesSvg(points);
}

function createBillablesSvg(points) {
  // Inline SVG keeps the dashboard self-contained and avoids a chart dependency.
  const width = 900;
  const height = 340;
  const padding = { top: 64, right: 122, bottom: 48, left: 96 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxHours = Math.max(1, ...points.map((point) => point.hours));
  const maxAmount = Math.max(1, ...points.map((point) => point.amount));
  const groupWidth = chartWidth / points.length;
  const hourBarWidth = Math.min(18, groupWidth * 0.28);
  const amountBarWidth = Math.min(18, groupWidth * 0.28);
  const monthLabels = points.map((point, index) => {
    const x = padding.left + groupWidth * index + groupWidth / 2;
    return `<text x="${x}" y="${height - 18}" text-anchor="middle">${point.label}</text>`;
  }).join("");
  const bars = points.map((point, index) => {
    const centerX = padding.left + groupWidth * index + groupWidth / 2;
    const hourHeight = (point.hours / maxHours) * chartHeight;
    const amountHeight = (point.amount / maxAmount) * chartHeight;
    const hourX = centerX - hourBarWidth - 2;
    const amountX = centerX + 2;
    const hourY = padding.top + chartHeight - hourHeight;
    const amountY = padding.top + chartHeight - amountHeight;

    return `
      <rect class="chart-hours" x="${hourX}" y="${hourY}" width="${hourBarWidth}" height="${hourHeight}"></rect>
      <rect class="chart-amount" x="${amountX}" y="${amountY}" width="${amountBarWidth}" height="${amountHeight}"></rect>
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

function getSelectedReportClientId() {
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

function createLegend(text) {
  const legend = document.createElement("legend");
  legend.textContent = text;
  return legend;
}

function createClientRadio(client) {
  const label = document.createElement("label");
  label.className = "client-radio-option";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = "dashboard-report-client";
  input.value = client.id;

  label.append(input, document.createTextNode(client.name));
  return label;
}

function createTableCell(text, tagName = "td") {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function createClientLinkCell(client) {
  const cell = document.createElement("th");
  const link = document.createElement("a");
  link.href = `reporting.html?client=${encodeURIComponent(client.id)}`;
  link.textContent = client.name;
  cell.scope = "row";
  cell.appendChild(link);
  return cell;
}

function sortByName(items) {
  return window.LongtailForge.records.sortByName(items);
}

function setDashboardStatus(message) {
  dashboardStatus.textContent = message;
}
