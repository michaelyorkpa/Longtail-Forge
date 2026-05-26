// Home is a dashboard view built from the same API data used by reporting.
const activeClientCount = document.querySelector("[data-active-client-count]");
const clientReportOptions = document.querySelector("[data-client-report-options]");
const openClientReportButton = document.querySelector("[data-open-client-report]");
const currentMonthBillables = document.querySelector("[data-current-month-billables]");
const currentMonthHours = document.querySelector("[data-current-month-hours]");
const currentMonthAmount = document.querySelector("[data-current-month-amount]");
const billablesChart = document.querySelector("[data-billables-chart]");
const homeStatus = document.querySelector("[data-home-status]");

let homeSettings = {
  defaultBillingRate: 0,
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
};
let homeClients = [];
let homeEntries = [];

loadHomeData();

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

async function loadHomeData() {
  setHomeStatus("Loading dashboard...");

  try {
    const [settingsResponse, clientsResponse, entriesResponse] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("/api/client-projects", { cache: "no-store" }),
      fetch("/api/time-entries", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    homeSettings = settingsResponse.ok
      ? normalizeSettings(await settingsResponse.json())
      : normalizeSettings({});
    homeClients = normalizeClients(await clientsResponse.json());
    homeEntries = entriesResponse.ok
      ? normalizeTimeEntries(await entriesResponse.json())
      : [];

    renderActiveClients();
    renderCurrentMonthBillables();
    renderBillablesChart();
    setHomeStatus("");
  } catch (error) {
    setHomeStatus("Dashboard data could not be loaded.");
    console.error(error);
  }
}

function renderActiveClients() {
  const activeClients = sortByName(homeClients.filter((client) => client.status === "Active"));
  activeClientCount.textContent = String(activeClients.length);
  clientReportOptions.replaceChildren(createLegend("Client Reporting"));

  activeClients.forEach((client) => {
    clientReportOptions.appendChild(createClientRadio(client));
  });

  openClientReportButton.disabled = true;
}

function renderCurrentMonthBillables() {
  // The table shows only clients with current-month billable time.
  const range = getMonthRange(new Date());
  const rows = getClientBillablesForRange(range).filter((row) => row.seconds > 0);
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

  let totalSeconds = 0;
  let totalAmount = 0;

  rows.forEach((billableRow) => {
    totalSeconds += billableRow.seconds;
    totalAmount += billableRow.amount;

    const row = document.createElement("tr");
    row.append(
      createClientLinkCell(billableRow.client),
      createTableCell(formatHours(billableRow.seconds)),
      createTableCell(formatCurrency(billableRow.amount)),
    );
    row.firstElementChild.scope = "row";
    currentMonthBillables.appendChild(row);
  });

  currentMonthHours.textContent = formatHours(totalSeconds);
  currentMonthAmount.textContent = formatCurrency(totalAmount);
}

function renderBillablesChart() {
  const months = getTrailingMonths(12);
  const points = months.map((monthStart) => {
    const range = getMonthRange(monthStart);
    const totals = getClientHoursAndBillablesForRange(range).reduce((summary, row) => ({
      seconds: summary.seconds + row.seconds,
      amount: summary.amount + row.amount,
    }), { seconds: 0, amount: 0 });

    return {
      label: formatMonthLabel(monthStart),
      hours: totals.seconds / 3600,
      amount: totals.amount,
    };
  });

  billablesChart.innerHTML = createBillablesSvg(points);
}

function getClientBillablesForRange(range) {
  return getClientHoursAndBillablesForRange(range)
    .map((row) => ({
      ...row,
      seconds: row.billableSeconds,
    }));
}

function getClientHoursAndBillablesForRange(range) {
  return sortByName(homeClients)
    .filter((client) => client.status === "Active")
    .map((client) => {
      const clientEntries = homeEntries.filter((entry) =>
        matchesClient(entry, client) &&
        isEntryInRange(entry, range),
      );
      const projects = getReportProjects(client);
      let seconds = 0;
      let billableSeconds = 0;
      let amount = 0;

      projects.forEach((project) => {
        const projectEntries = clientEntries
          .filter((entry) => matchesProject(entry, project));
        const projectSeconds = projectEntries
          .reduce((total, entry) => total + entry.durationSeconds, 0);
        const projectBillableSeconds = projectEntries
          .filter((entry) => entry.billable === "yes")
          .reduce((total, entry) => total + entry.durationSeconds, 0);

        if (projectSeconds === 0) {
          return;
        }

        const roundedBillableSeconds = roundSeconds(
          projectBillableSeconds,
          getEffectiveProjectBillingRounding(client, project),
        );
        const rate = getProjectBillingRate(client, project);

        seconds += projectSeconds;
        billableSeconds += roundedBillableSeconds;
        amount += (roundedBillableSeconds / 3600) * rate;
      });

      return { client, seconds, billableSeconds, amount };
    });
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
  return clientReportOptions.querySelector("input[name='home-report-client']:checked")?.value || "";
}

function normalizeSettings(settings) {
  return {
    defaultBillingRate: parseMoney(settings?.defaultBillingRate),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
}

function normalizeClients(data) {
  return Array.isArray(data?.clients)
    ? data.clients.map((client) => ({
        id: String(client.id || "").trim(),
        name: String(client.name || "").trim(),
        status: client.status === "Inactive" ? "Inactive" : "Active",
        billingRate: parseOptionalMoney(client.billing_rate),
        billingRounding: normalizeOptionalBillingRounding(client.billing_rounding),
        projects: Array.isArray(client.projects)
          ? client.projects.map((project) => ({
              id: String(project.id || "").trim(),
              name: String(project.name || "").trim(),
              billingRate: parseOptionalMoney(project.billing_rate),
              billingRounding: normalizeOptionalBillingRounding(project.billing_rounding),
            }))
          : [],
      }))
    : [];
}

function normalizeTimeEntries(data) {
  return Array.isArray(data?.entries)
    ? data.entries.map((entry) => ({
        clientId: entry.client_id,
        clientName: entry.client_name,
        projectId: entry.project_id,
        projectName: entry.project_name,
        endTime: new Date(entry.end_time),
        durationSeconds: Number(entry.duration_seconds) || 0,
        billable: entry.billable === "no" ? "no" : "yes",
      }))
    : [];
}

function getReportProjects(client) {
  // Reconcile configured projects with historic entry names so old work is not dropped.
  const projectsByKey = new Map();

  client.projects.forEach((project) => {
    projectsByKey.set(getProjectMatchKey(project), project);
  });

  homeEntries
    .filter((entry) => matchesClient(entry, client))
    .forEach((entry) => {
      const project = {
        id: entry.projectId || normalizeKey(entry.projectName),
        name: entry.projectName || entry.projectId || "Untitled Project",
        billingRate: null,
        billingRounding: null,
      };
      const key = getProjectMatchKey(project);

      if (!projectsByKey.has(key)) {
        projectsByKey.set(key, project);
      }
    });

  return [...projectsByKey.values()];
}

function getProjectBillingRate(client, project) {
  return project.billingRate ?? client.billingRate ?? homeSettings.defaultBillingRate;
}

function getEffectiveClientBillingRounding(client) {
  return client.billingRounding || homeSettings.billingRounding;
}

function getEffectiveProjectBillingRounding(client, project) {
  return project.billingRounding || getEffectiveClientBillingRounding(client);
}

function getMonthRange(date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

function getTrailingMonths(monthsBack) {
  const today = new Date();
  const months = [];

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    months.push(new Date(today.getFullYear(), today.getMonth() - offset, 1));
  }

  return months;
}

function isEntryInRange(entry, range) {
  return Boolean(
    Number.isFinite(entry.endTime.getTime()) &&
    entry.endTime >= range.start &&
    entry.endTime < range.end,
  );
}

function matchesClient(entry, client) {
  return normalizeKey(entry.clientId) === normalizeKey(client.id) ||
    normalizeKey(entry.clientName) === normalizeKey(client.name);
}

function matchesProject(entry, project) {
  return normalizeKey(entry.projectId) === normalizeKey(project.id) ||
    normalizeKey(entry.projectName) === normalizeKey(project.name);
}

function getProjectMatchKey(project) {
  return normalizeKey(project.id) || normalizeKey(project.name);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseMoney(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function parseOptionalMoney(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const amount = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment)
    ? rounding.increment
    : "nearestQuarterHour";

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
  // Match reporting: round after aggregating project seconds.
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

function formatHours(seconds) {
  return `${(seconds / 3600).toFixed(2)} hrs`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatMonthLabel(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
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
  input.name = "home-report-client";
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
  return [...items].sort((firstItem, secondItem) =>
    firstItem.name.localeCompare(secondItem.name, undefined, {
      sensitivity: "base",
    }),
  );
}

function setHomeStatus(message) {
  homeStatus.textContent = message;
}
