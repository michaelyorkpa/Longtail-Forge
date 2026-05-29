// Reporting combines settings, client/project data, and time entries into billable totals.
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
let reportSettings = window.LongtailForge.billing.normalizeSettings({});

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
      fetch("/api/client-projects", { cache: "no-store" }),
      fetch("/api/time-entries", { cache: "no-store" }),
    ]);

    if (!clientsResponse.ok) {
      throw new Error(`Could not load client data: ${clientsResponse.status}`);
    }

    reportSettings = settingsResponse.ok
      ? window.LongtailForge.billing.normalizeSettings(await settingsResponse.json())
      : window.LongtailForge.billing.normalizeSettings({});
    reportClients = window.LongtailForge.billing.normalizeClients(await clientsResponse.json());
    reportEntries = entriesResponse.ok
      ? window.LongtailForge.billing.normalizeTimeEntries(await entriesResponse.json())
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

  sortByName(window.LongtailForge.billing.getReportProjects(client, reportEntries)).forEach((project) => {
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

  if (reportPeriodSelect.value === "custom" && !getCustomDateRange()) {
    setReportStatus("Choose a valid custom start and end date.");
    return;
  }

  const selectedProjectIds = getSelectedProjectIds();
  const projects = sortByName(window.LongtailForge.billing.getReportProjects(client, reportEntries))
    .filter((project) => selectedProjectIds.includes(project.id));

  if (projects.length === 0) {
    setReportStatus("Select at least one project.");
    return;
  }

  const clientEntries = reportEntries.filter((entry) =>
    window.LongtailForge.records.matchesClient(entry, client),
  );
  const summaries = projects
    .map((project) => window.LongtailForge.billing.summarizeProject(
      reportSettings,
      client,
      project,
      clientEntries,
      getSelectedDateRange(client, project),
    ))
    .filter(Boolean);

  if (!summaries.length) {
    setReportStatus("No time entries match these filters.");
    return;
  }

  const totals = summaries.reduce((summary, projectSummary) => ({
    amount: summary.amount + projectSummary.amount,
    seconds: summary.seconds + projectSummary.displaySeconds,
  }), { amount: 0, seconds: 0 });

  summaries.forEach((summary) => {
    reportTableBody.appendChild(createReportRow(
      summary.project,
      summary.rate,
      summary.displaySeconds,
      summary.billableSeconds,
      summary.amount,
    ));
  });

  reportTotalTime.textContent = formatHours(totals.seconds);
  reportTotalBillableAmount.textContent = formatCurrency(totals.amount);
  reportTableWrap.hidden = false;
  setReportStatus("");
}

function createReportRow(project, rate, seconds, billableSeconds, billableAmount) {
  const hasBillableTime = billableSeconds > 0;
  const row = document.createElement("tr");
  row.append(
    createTableCell(project.name, "th"),
    createTableCell(hasBillableTime ? formatRate(rate) : ""),
    createTableCell(formatHours(seconds)),
    createTableCell(hasBillableTime ? formatCurrency(billableAmount) : ""),
  );
  row.firstElementChild.scope = "row";
  return row;
}

function getSelectedClient() {
  return reportClients.find((client) => client.id === reportClientSelect.value);
}

function getSelectedProjectIds() {
  return [...reportProjectSelect.selectedOptions].map((option) => option.value);
}

function getSelectedDateRange(client, project) {
  if (reportPeriodSelect.value === "custom") {
    return getCustomDateRange();
  }

  const billingPeriod = window.LongtailForge.billing.getEffectiveProjectBillingPeriod(
    reportSettings,
    client,
    project,
  );
  return window.LongtailForge.billing.getBillingPeriodRange(billingPeriod, reportPeriodSelect.value);
}

function getCustomDateRange() {
  const startDate = parseDateInput(reportStartDateInput.value);
  const endDate = parseDateInput(reportEndDateInput.value);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  const exclusiveEndDate = new Date(endDate);
  // Make the end date inclusive for the user by using an exclusive midnight boundary.
  exclusiveEndDate.setDate(exclusiveEndDate.getDate() + 1);
  return { start: startDate, end: exclusiveEndDate };
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

function sortByName(items) {
  return window.LongtailForge.records.sortByName(items);
}

function setReportStatus(message) {
  reportStatus.textContent = message;
}
