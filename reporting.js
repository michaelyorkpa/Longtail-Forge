const reportPeriodSelect = document.querySelector("[data-report-period]");
const reportCustomDates = document.querySelector("[data-report-custom-dates]");
const reportStartDateInput = document.querySelector("[data-report-start-date]");
const reportEndDateInput = document.querySelector("[data-report-end-date]");
const reportClientSelect = document.querySelector("[data-report-client]");
const reportProjectSelect = document.querySelector("[data-report-projects]");
const reportStatus = document.querySelector("[data-report-status]");
const reportTableWrap = document.querySelector("[data-report-table-wrap]");
const reportTableBody = document.querySelector("[data-report-table-body]");
const reportTotalTime = document.querySelector("[data-report-total-time]");
const reportTotalBillableAmount = document.querySelector(
  "[data-report-total-billable-amount]",
);

let reportClients = [];
let reportEntries = [];
let reportSettings = {
  defaultBillingRate: 0,
  billingPeriod: { type: "calendarMonth", startDay: 1 },
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
};

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

async function loadReportData() {
  setReportStatus("Loading report data...");

  try {
    const [settingsResponse, clientsResponse, entriesResponse] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("data/client-project.json", { cache: "no-store" }),
      fetch("data/time-entries.csv", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    reportSettings = settingsResponse.ok
      ? normalizeSettings(await settingsResponse.json())
      : normalizeSettings({});
    reportClients = normalizeClients(await clientsResponse.json());
    reportEntries = entriesResponse.ok
      ? parseTimeEntriesCsv(await entriesResponse.text())
      : [];

    renderClientFilter();
    applyReportQueryParams();
    setReportStatus("");
  } catch (error) {
    setReportStatus("Report data could not be loaded.");
    console.error(error);
  }
}

function applyReportQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("client");

  if (!clientId || !reportClients.some((client) => client.id === clientId)) {
    return;
  }

  reportClientSelect.value = clientId;
  renderProjectFilter();
  renderReport();
}

function renderClientFilter() {
  reportClientSelect.replaceChildren(createOption("", "Select a client"));

  sortByName(reportClients).forEach((client) => {
    reportClientSelect.appendChild(createOption(client.id, client.name));
  });
}

function renderProjectFilter() {
  const client = getSelectedClient();
  reportProjectSelect.replaceChildren();
  reportProjectSelect.disabled = !client;

  if (!client) {
    return;
  }

  sortByName(getReportProjects(client)).forEach((project) => {
    const option = createOption(project.id, project.name);
    option.selected = true;
    reportProjectSelect.appendChild(option);
  });
}

function renderReport() {
  const client = getSelectedClient();
  reportTableBody.innerHTML = "";
  reportTableWrap.hidden = true;

  if (!client) {
    setReportStatus("");
    return;
  }

  const selectedProjectIds = getSelectedProjectIds();
  const projects = sortByName(getReportProjects(client)).filter((project) =>
    selectedProjectIds.includes(project.id),
  );

  if (projects.length === 0) {
    setReportStatus("Select at least one project.");
    return;
  }

  const clientEntries = reportEntries.filter((entry) => matchesClient(entry, client));
  let totalSeconds = 0;
  let totalBillableAmount = 0;

  projects.forEach((project) => {
    const range = getSelectedDateRange(client, project);
    const projectSeconds = clientEntries
      .filter((entry) => matchesProject(entry, project) && isEntryInRange(entry, range))
      .reduce((seconds, entry) => seconds + entry.durationSeconds, 0);

    if (projectSeconds === 0) {
      return;
    }

    const roundedProjectSeconds = roundSeconds(
      projectSeconds,
      getEffectiveProjectBillingRounding(client, project),
    );
    const rate = getProjectBillingRate(client, project);
    const billableAmount = (roundedProjectSeconds / 3600) * rate;

    totalSeconds += roundedProjectSeconds;
    totalBillableAmount += billableAmount;
    reportTableBody.appendChild(createReportRow(
      project,
      rate,
      roundedProjectSeconds,
      billableAmount,
    ));
  });

  if (reportPeriodSelect.value === "custom" && !getCustomDateRange()) {
    setReportStatus("Choose a valid custom start and end date.");
    return;
  }

  if (!reportTableBody.children.length) {
    setReportStatus("No time entries match these filters.");
    return;
  }

  reportTotalTime.textContent = formatHours(totalSeconds);
  reportTotalBillableAmount.textContent = formatCurrency(totalBillableAmount);
  reportTableWrap.hidden = false;
  setReportStatus("");
}

function createReportRow(project, rate, seconds, billableAmount) {
  const row = document.createElement("tr");
  row.append(
    createTableCell(project.name, "th"),
    createTableCell(formatRate(rate)),
    createTableCell(formatHours(seconds)),
    createTableCell(formatCurrency(billableAmount)),
  );
  row.firstElementChild.scope = "row";
  return row;
}

function normalizeClients(data) {
  return Array.isArray(data?.clients)
    ? data.clients
        .filter((client) => client.status !== "Inactive")
        .map((client) => ({
          id: String(client.id || "").trim(),
          name: String(client.name || "").trim(),
          billingRate: parseOptionalMoney(client.billing_rate),
          billingPeriod: normalizeOptionalBillingPeriod(client.billing_period),
          billingRounding: normalizeOptionalBillingRounding(client.billing_rounding),
          projects: Array.isArray(client.projects)
            ? client.projects.map((project) => ({
                id: String(project.id || "").trim(),
                name: String(project.name || "").trim(),
                billingRate: parseOptionalMoney(project.billing_rate),
                billingPeriod: normalizeOptionalBillingPeriod(project.billing_period),
                billingRounding: normalizeOptionalBillingRounding(project.billing_rounding),
              }))
            : [],
        }))
    : [];
}

function parseTimeEntriesCsv(csvText) {
  const rows = parseCsvRows(csvText.trim());

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const entry = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));

    return {
      clientId: entry.client_id,
      clientName: entry.client_name,
      projectId: entry.project_id,
      projectName: entry.project_name,
      endTime: new Date(entry.end_time),
      durationSeconds: Number(entry.duration_seconds) || 0,
    };
  });
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function getSelectedClient() {
  return reportClients.find((client) => client.id === reportClientSelect.value);
}

function getSelectedProjectIds() {
  return [...reportProjectSelect.selectedOptions].map((option) => option.value);
}

function getReportProjects(client) {
  const projectsByKey = new Map();

  client.projects.forEach((project) => {
    projectsByKey.set(getProjectMatchKey(project), project);
  });

  reportEntries
    .filter((entry) => matchesClient(entry, client))
    .forEach((entry) => {
      const project = {
        id: entry.projectId || normalizeKey(entry.projectName),
        name: entry.projectName || entry.projectId || "Untitled Project",
        billingRate: null,
        billingPeriod: null,
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
  return project.billingRate ?? client.billingRate ?? reportSettings.defaultBillingRate;
}

function getSelectedDateRange(client, project) {
  if (reportPeriodSelect.value === "custom") {
    return getCustomDateRange();
  }

  const billingPeriod = getEffectiveProjectBillingPeriod(client, project);
  return getBillingPeriodRange(billingPeriod, reportPeriodSelect.value);
}

function getCustomDateRange() {
  const startDate = parseDateInput(reportStartDateInput.value);
  const endDate = parseDateInput(reportEndDateInput.value);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  const exclusiveEndDate = new Date(endDate);
  exclusiveEndDate.setDate(exclusiveEndDate.getDate() + 1);
  return { start: startDate, end: exclusiveEndDate };
}

function getBillingPeriodRange(period, mode) {
  const today = new Date();
  const normalizedPeriod = normalizeBillingPeriod(period);
  let start;

  if (normalizedPeriod.type === "custom") {
    start = getCurrentCustomPeriodStart(today, normalizedPeriod.startDay);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

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

  if (date >= currentMonthStart) {
    return currentMonthStart;
  }

  return new Date(date.getFullYear(), date.getMonth() - 1, startDay);
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

function getEffectiveClientBillingPeriod(client) {
  return client.billingPeriod || reportSettings.billingPeriod;
}

function getEffectiveProjectBillingPeriod(client, project) {
  return project.billingPeriod || getEffectiveClientBillingPeriod(client);
}

function getEffectiveClientBillingRounding(client) {
  return client.billingRounding || reportSettings.billingRounding;
}

function getEffectiveProjectBillingRounding(client, project) {
  return project.billingRounding || getEffectiveClientBillingRounding(client);
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

function normalizeSettings(settings) {
  return {
    defaultBillingRate: parseMoney(settings?.defaultBillingRate),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
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
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatRate(rate) {
  return rate ? `${formatCurrency(rate)}/hr` : "$0.00/hr";
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

function sortByName(items) {
  return [...items].sort((firstItem, secondItem) =>
    firstItem.name.localeCompare(secondItem.name, undefined, {
      sensitivity: "base",
    }),
  );
}

function setReportStatus(message) {
  reportStatus.textContent = message;
}
