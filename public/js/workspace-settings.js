// Workspace settings are shared defaults used by navigation, reports, and billing.
const settingsForm = document.querySelector("[data-workspace-settings-form]");
const workspaceNameInput = document.querySelector("[data-workspace-name-input]");
const workspaceTypeSelect = document.querySelector("[data-workspace-type-input]");
const fiscalYearStartMonthSelect = document.querySelector("[data-fiscal-year-start-month]");
const fiscalYearStartDaySelect = document.querySelector("[data-fiscal-year-start-day]");
const defaultBillingRateInput = document.querySelector("[data-default-billing-rate-input]");
const billingPeriodTypeSelect = document.querySelector("[data-billing-period-type]");
const billingPeriodStartDaySelect = document.querySelector("[data-billing-period-start-day]");
const billingRoundingEnabledInput = document.querySelector("[data-billing-rounding-enabled]");
const billingRoundingIncrementSelect = document.querySelector("[data-billing-rounding-increment]");
const moduleSettingsContainer = document.querySelector("[data-module-settings]");
const auditLoggingEnabledInput = document.querySelector("[data-audit-logging-enabled]");
const auditRetentionDaysSelect = document.querySelector("[data-audit-retention-days]");
const workspaceReminderDateTimeHours1Input = document.querySelector("[data-workspace-reminder-date-time-hours-1]");
const workspaceReminderDateTimeHours2Input = document.querySelector("[data-workspace-reminder-date-time-hours-2]");
const workspaceReminderDateOnlyDays1Input = document.querySelector("[data-workspace-reminder-date-only-days-1]");
const workspaceReminderDateOnlyDays2Input = document.querySelector("[data-workspace-reminder-date-only-days-2]");
const billingSettingsFieldset = document.querySelector("[data-billing-settings-fieldset]");
const billingSettingsLegend = document.querySelector("[data-billing-settings-legend]");
const billingPeriodControl = document.querySelector("[data-billing-period-control]");
const billingPeriodLabel = document.querySelector("[data-billing-period-label]");
const defaultBillingRateControl = document.querySelector("[data-default-billing-rate-control]");
const fiscalYearFieldset = document.querySelector("[data-fiscal-year-fieldset]");
const openWorkspaceUsersButton = document.querySelector("[data-open-workspace-users]");
const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");
const workspaceUsersList = document.querySelector("[data-workspace-users-list]");
const closeWorkspaceUsersButton = document.querySelector("[data-close-workspace-users]");
const workspaceSettingsStatus = document.querySelector("[data-workspace-settings-status]");
const saveSettingsButton = document.querySelector("[data-save-settings]");
const runtimeDiagnosticsSummary = document.querySelector("[data-runtime-diagnostics-summary]");
const runtimeDiagnosticsWarnings = document.querySelector("[data-runtime-diagnostics-warnings]");
let activeWorkspaceId = "";
let currentTaskReminderDefaults = normalizeReminderPolicy();

populateFiscalYearStartMonths();
populateFiscalYearStartDays();
populateBillingPeriodStartDays();
loadSettingsForm();
loadRuntimeDiagnostics();

fiscalYearStartMonthSelect.addEventListener("change", () => {
  populateFiscalYearStartDays(fiscalYearStartDaySelect.value);
});
billingPeriodTypeSelect.addEventListener("change", updateBillingPeriodStartDayState);
billingRoundingEnabledInput.addEventListener("change", updateBillingRoundingState);
workspaceTypeSelect?.addEventListener("change", updateWorkspaceTypeDependentControls);
openWorkspaceUsersButton?.addEventListener("click", openWorkspaceUsersDialog);
closeWorkspaceUsersButton?.addEventListener("click", () => workspaceUsersDialog?.close());

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

async function loadSettingsForm() {
  setWorkspaceSettingsStatus("Loading workspace settings...");

  try {
    const settings = normalizeSettings(await window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }));
    activeWorkspaceId = settings.workspaceId || settings.workspace_id || "";
    workspaceNameInput.value = settings.workspaceName;
    setWorkspaceTypeValue(settings.workspaceType);
    fiscalYearStartMonthSelect.value = String(settings.fiscalYear.startMonth);
    populateFiscalYearStartDays(settings.fiscalYear.startDay);
    defaultBillingRateInput.value = settings.defaultBillingRate;
    billingPeriodTypeSelect.value = settings.billingPeriod.type;
    billingPeriodStartDaySelect.value = String(settings.billingPeriod.startDay);
    billingRoundingEnabledInput.checked = settings.billingRounding.enabled;
    billingRoundingIncrementSelect.value = settings.billingRounding.increment;
    renderModuleSettings(settings);
    auditLoggingEnabledInput.checked = settings.audit.loggingEnabled;
    auditRetentionDaysSelect.value = String(settings.audit.retentionDays);
    currentTaskReminderDefaults = normalizeReminderPolicy(settings.taskReminderDefaults);
    writeReminderDefaults(currentTaskReminderDefaults);
    updateBillingPeriodStartDayState();
    updateBillingRoundingState();
    updateWorkspaceTypeDependentControls();
    setWorkspaceSettingsStatus("");
  } catch (error) {
    handleApiError(error, "Workspace settings could not be loaded.");
    console.error(error);
  }
}

async function loadRuntimeDiagnostics() {
  if (!runtimeDiagnosticsSummary) {
    return;
  }

  renderRuntimeDiagnosticsLoading();

  try {
    const result = await window.LongtailForge.api.getJson("/api/runtime-diagnostics", { cache: "no-store" });
    renderRuntimeDiagnostics(result.diagnostics || {});
  } catch (error) {
    renderRuntimeDiagnosticsError(error);
  }
}

async function saveSettings() {
  // Normalize before saving so the server receives the same shape the UI expects back.
  const settings = normalizeSettings({
    workspaceName: workspaceNameInput.value,
    workspaceType: workspaceTypeSelect?.value,
    fiscalYear: {
      startMonth: fiscalYearStartMonthSelect.value,
      startDay: fiscalYearStartDaySelect.value,
    },
    defaultBillingRate: defaultBillingRateInput.value,
    billingPeriod: {
      type: billingPeriodTypeSelect.value,
      startDay: billingPeriodStartDaySelect.value,
    },
    billingRounding: {
      enabled: billingRoundingEnabledInput.checked,
      increment: billingRoundingIncrementSelect.value,
    },
    moduleSettings: readModuleSettingsPayload(),
    audit: {
      loggingEnabled: auditLoggingEnabledInput.checked,
      retentionDays: auditRetentionDaysSelect.value,
    },
    taskReminderDefaults: readReminderDefaults(),
  });
  settings.moduleSettings = readModuleSettingsPayload();

  if (!settings.workspaceName) {
    setWorkspaceSettingsStatus("Workspace name is required.");
    return;
  }

  saveSettingsButton.disabled = true;
  setWorkspaceSettingsStatus("Saving workspace settings...");

  try {
    const result = await window.LongtailForge.api.putJson("/api/settings", settings);
    const savedSettings = normalizeSettings(result.data);
    workspaceNameInput.value = savedSettings.workspaceName;
    setWorkspaceTypeValue(savedSettings.workspaceType);
    fiscalYearStartMonthSelect.value = String(savedSettings.fiscalYear.startMonth);
    populateFiscalYearStartDays(savedSettings.fiscalYear.startDay);
    defaultBillingRateInput.value = savedSettings.defaultBillingRate;
    billingPeriodTypeSelect.value = savedSettings.billingPeriod.type;
    billingPeriodStartDaySelect.value = String(savedSettings.billingPeriod.startDay);
    billingRoundingEnabledInput.checked = savedSettings.billingRounding.enabled;
    billingRoundingIncrementSelect.value = savedSettings.billingRounding.increment;
    renderModuleSettings(savedSettings);
    auditLoggingEnabledInput.checked = savedSettings.audit.loggingEnabled;
    auditRetentionDaysSelect.value = String(savedSettings.audit.retentionDays);
    currentTaskReminderDefaults = normalizeReminderPolicy(savedSettings.taskReminderDefaults);
    writeReminderDefaults(currentTaskReminderDefaults);
    updateBillingPeriodStartDayState();
    updateBillingRoundingState();
    updateWorkspaceTypeDependentControls();

    if (typeof window.applyWorkspaceName === "function") {
      window.applyWorkspaceName(savedSettings.workspaceName);
    }

    flashSavedState();
  } catch (error) {
    handleApiError(error, "Workspace settings were not saved. Start the local server and try again.");
    console.error(error);
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function normalizeSettings(settings) {
  // Keep one canonical client-side settings shape even when the API omits older fields.
  const workspaceName = String(settings?.workspaceName || "").trim();
  const workspaceType = normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type);

  return {
    workspaceId: String(settings?.workspaceId || settings?.workspace_id || "").trim(),
    workspaceName,
    workspaceType,
    fiscalYear: workspaceType === "business" ? normalizeFiscalYear(settings?.fiscalYear) : { startMonth: 1, startDay: 1 },
    defaultBillingRate: workspaceType === "business" ? String(settings?.defaultBillingRate || "").trim() : "",
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
    moduleSettings: normalizeModuleSettings(settings?.moduleSettings, settings),
    modules: Array.isArray(settings?.modules) ? settings.modules : [],
    audit: normalizeAuditSettings(settings?.audit),
    taskReminderDefaults: normalizeReminderPolicy(settings?.taskReminderDefaults),
  };
}

function renderModuleSettings(settings) {
  window.LongtailForge.settingsControls.renderModuleSettingsGroups(
    moduleSettingsContainer,
    settings.moduleSettings || [],
    { emptyText: "No configurable modules are available for this workspace.", settings },
  );
}

function renderRuntimeDiagnosticsLoading() {
  runtimeDiagnosticsSummary.replaceChildren(createRuntimeDiagnosticItem("Runtime", "Loading..."));
  renderRuntimeDiagnosticWarnings([]);
}

function renderRuntimeDiagnosticsError(error) {
  runtimeDiagnosticsSummary.replaceChildren(createRuntimeDiagnosticItem("Runtime", "Unavailable"));

  const message = error?.status === 403
    ? "Runtime diagnostics require workspace settings access."
    : error?.message || "Runtime diagnostics could not be loaded.";
  renderRuntimeDiagnosticWarnings([message]);
}

function renderRuntimeDiagnostics(diagnostics) {
  const database = diagnostics.database || {};
  const sqlite = database.sqlite || {};
  const data = diagnostics.data || {};
  const storage = diagnostics.storage || {};
  const scanner = diagnostics.scanner || {};

  runtimeDiagnosticsSummary.replaceChildren(
    createRuntimeDiagnosticItem("Database Provider", formatRuntimeValue(database.provider)),
    createRuntimeDiagnosticItem("SQLite Journal", formatRuntimeValue(sqlite.journalMode)),
    createRuntimeDiagnosticItem("Foreign Keys", sqlite.foreignKeysEnabled ? "Enabled" : "Disabled"),
    createRuntimeDiagnosticItem("Database File", formatRuntimeLocation(database.fileLocation)),
    createRuntimeDiagnosticItem("Data Directory", formatRuntimeLocation(data.directoryLocation)),
    createRuntimeDiagnosticItem("Storage Provider", formatRuntimeValue(storage.provider)),
    createRuntimeDiagnosticItem("Scanner Mode", formatRuntimeValue(scanner.mode)),
  );
  renderRuntimeDiagnosticWarnings(readRuntimeDiagnosticWarnings(diagnostics));
}

function createRuntimeDiagnosticItem(label, value) {
  const item = document.createElement("div");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");

  item.className = "settings-summary-item runtime-diagnostics-item";
  labelElement.textContent = label;
  valueElement.textContent = value || "Unavailable";
  item.append(labelElement, valueElement);
  return item;
}

function readRuntimeDiagnosticWarnings(diagnostics) {
  const warnings = [];
  const database = diagnostics.database || {};
  const storage = diagnostics.storage || {};
  const scanner = diagnostics.scanner || {};
  const worker = diagnostics.worker || {};
  const runtimeWarnings = Array.isArray(diagnostics.runtime?.configurationWarnings)
    ? diagnostics.runtime.configurationWarnings
    : [];

  if (database.provider && database.provider !== "sqlite") {
    warnings.push("This database provider is outside SQLite small-office mode.");
  }

  if (storage.provider && storage.provider !== "local") {
    warnings.push("Review this storage provider before relying on SQLite small-office mode.");
  }

  if (scanner.mode && !["none", "local"].includes(scanner.mode)) {
    warnings.push("Review this scanner mode before relying on SQLite small-office mode.");
  }

  if (worker.mode && !["inline", "local"].includes(worker.mode)) {
    warnings.push("Review this worker mode before relying on SQLite small-office mode.");
  }

  if (database.fileLocation?.relativeTo === "outside-app-root" || diagnostics.data?.directoryLocation?.relativeTo === "outside-app-root") {
    warnings.push("Confirm redacted runtime paths are on local or attached storage.");
  }

  return [...runtimeWarnings, ...warnings];
}

function renderRuntimeDiagnosticWarnings(warnings) {
  if (!runtimeDiagnosticsWarnings) {
    return;
  }

  runtimeDiagnosticsWarnings.replaceChildren();

  if (warnings.length === 0) {
    const message = document.createElement("p");
    message.className = "runtime-diagnostics-note";
    message.textContent = "No runtime support warnings.";
    runtimeDiagnosticsWarnings.appendChild(message);
    return;
  }

  for (const warning of warnings) {
    const message = document.createElement("p");
    message.className = "runtime-diagnostics-warning";
    message.textContent = warning;
    runtimeDiagnosticsWarnings.appendChild(message);
  }
}

function formatRuntimeLocation(location) {
  return String(location?.display || "").trim() || "Unavailable";
}

function formatRuntimeValue(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "Unavailable";
  }

  if (normalized.toLowerCase() === "sqlite") {
    return "SQLite";
  }

  if (normalized.toLowerCase() === "wal") {
    return "WAL";
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeModuleSettings(moduleSettings, settings) {
  return window.LongtailForge.settingsNormalizers.normalizeModuleSettings(moduleSettings, {
    modules: settings?.modules,
  });
}

function readModuleSettingsPayload() {
  return window.LongtailForge.settingsControls.readModuleSettingsPayload(settingsForm);
}

function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim();
  return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";
}

function setWorkspaceTypeValue(workspaceType) {
  if (workspaceTypeSelect) {
    workspaceTypeSelect.value = normalizeWorkspaceType(workspaceType);
  }
}

function normalizeFiscalYear(fiscalYear) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(fiscalYear?.startMonth, 10) || 1));
  const startDay = Math.min(
    getDaysInFiscalYearMonth(startMonth),
    Math.max(1, Number.parseInt(fiscalYear?.startDay, 10) || 1),
  );

  return {
    startMonth,
    startDay,
  };
}

function populateFiscalYearStartMonths() {
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });

  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = monthFormatter.format(new Date(2026, month - 1, 1));
    fiscalYearStartMonthSelect.appendChild(option);
  }
}

function populateFiscalYearStartDays(selectedDay = fiscalYearStartDaySelect.value) {
  // The day list depends on the selected start month, so rebuild it whenever the month changes.
  const maxDay = getDaysInFiscalYearMonth(Number(fiscalYearStartMonthSelect.value) || 1);
  const normalizedDay = Math.min(maxDay, Math.max(1, Number.parseInt(selectedDay, 10) || 1));

  fiscalYearStartDaySelect.replaceChildren();

  for (let day = 1; day <= maxDay; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = formatOrdinal(day);
    fiscalYearStartDaySelect.appendChild(option);
  }

  fiscalYearStartDaySelect.value = String(normalizedDay);
}

function getDaysInFiscalYearMonth(month) {
  return new Date(2026, month, 0).getDate();
}

function normalizeBillingPeriod(period) {
  // Custom periods are capped at day 28 so every month can contain the configured day.
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function populateBillingPeriodStartDays() {
  for (let day = 1; day <= 28; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = formatOrdinal(day);
    billingPeriodStartDaySelect.appendChild(option);
  }
}

function updateBillingPeriodStartDayState() {
  const isCustom = billingPeriodTypeSelect.value === "custom";
  billingPeriodStartDaySelect.disabled = !isCustom;

  if (!isCustom) {
    billingPeriodStartDaySelect.value = "1";
  }
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

function normalizeAuditSettings(audit) {
  const retentionOptions = [7, 14, 30, 60, 90, 180, 365];
  const retentionDays = Number.parseInt(audit?.retentionDays, 10);

  return {
    loggingEnabled: audit?.loggingEnabled === false ? false : true,
    retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,
  };
}

function normalizeReminderPolicy(policy) {
  return {
    dateTime: normalizeOffsetList(policy?.dateTime || policy?.date_time, [120, 1440]),
    dateOnly: normalizeOffsetList(policy?.dateOnly || policy?.date_only, [4320, 1440]),
  };
}

function normalizeOffsetList(values, fallback) {
  const offsets = (Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 2);

  return offsets.length > 0 ? offsets : [...fallback];
}

function writeReminderDefaults(policy) {
  if (!workspaceReminderDateTimeHours1Input) {
    currentTaskReminderDefaults = normalizeReminderPolicy(policy);
    return;
  }

  const normalized = normalizeReminderPolicy(policy);
  const timedHours = normalized.dateTime.map((minutes) => Math.round(minutes / 60));
  const dateOnlyDays = normalized.dateOnly.map((minutes) => Math.round(minutes / 1440));

  workspaceReminderDateTimeHours1Input.value = String(timedHours[0] || 2);
  workspaceReminderDateTimeHours2Input.value = String(timedHours[1] || 24);
  workspaceReminderDateOnlyDays1Input.value = String(dateOnlyDays[0] || 3);
  workspaceReminderDateOnlyDays2Input.value = String(dateOnlyDays[1] || 1);
}

function readReminderDefaults() {
  if (!workspaceReminderDateTimeHours1Input) {
    return currentTaskReminderDefaults;
  }

  return {
    dateTime: [
      readPositiveInteger(workspaceReminderDateTimeHours1Input, 2) * 60,
      readPositiveInteger(workspaceReminderDateTimeHours2Input, 24) * 60,
    ],
    dateOnly: [
      readPositiveInteger(workspaceReminderDateOnlyDays1Input, 3) * 1440,
      readPositiveInteger(workspaceReminderDateOnlyDays2Input, 1) * 1440,
    ],
  };
}

function readPositiveInteger(input, fallback) {
  return Math.max(1, Number.parseInt(input?.value, 10) || fallback);
}

function updateBillingRoundingState() {
  billingRoundingIncrementSelect.disabled = !billingRoundingEnabledInput.checked;
}

function updateWorkspaceTypeDependentControls() {
  const usesRoundingOnly = normalizeWorkspaceType(workspaceTypeSelect?.value) !== "business";

  if (defaultBillingRateControl) {
    defaultBillingRateControl.hidden = usesRoundingOnly;
  }

  if (fiscalYearFieldset) {
    fiscalYearFieldset.hidden = usesRoundingOnly;
  }

  if (billingSettingsFieldset) {
    billingSettingsFieldset.classList.toggle("is-time-reporting-settings", usesRoundingOnly);
  }

  if (billingSettingsLegend) {
    billingSettingsLegend.textContent = usesRoundingOnly
      ? "Rounding"
      : "Billing Settings";
  }

  if (billingPeriodLabel) {
    billingPeriodLabel.textContent = usesRoundingOnly
      ? "Time Reporting Period"
      : "Billing Period";
  }

  if (billingPeriodControl) {
    billingPeriodControl.hidden = false;
  }

  if (usesRoundingOnly) {
    fiscalYearStartMonthSelect.value = "1";
    populateFiscalYearStartDays(1);
    defaultBillingRateInput.value = "";
  }
}

async function openWorkspaceUsersDialog() {
  if (!workspaceUsersDialog || !workspaceUsersList) {
    return;
  }

  workspaceUsersList.replaceChildren(createWorkspaceUsersPlaceholder("Loading users..."));

  if (typeof workspaceUsersDialog.showModal === "function") {
    workspaceUsersDialog.showModal();
  } else {
    workspaceUsersDialog.setAttribute("open", "");
  }

  try {
    const result = await window.LongtailForge.api.getJson("/api/users", { cache: "no-store" });
    renderWorkspaceUsers(result.users || []);
  } catch (error) {
    workspaceUsersList.replaceChildren(createWorkspaceUsersPlaceholder(error.message || "Workspace users could not be loaded."));
  }
}

function renderWorkspaceUsers(users) {
  const activeUsers = users.filter((user) =>
    (user.workspaceMemberships || []).some((membership) =>
      membership.workspaceId === activeWorkspaceId && membership.status !== "inactive",
    ),
  );

  workspaceUsersList.replaceChildren();

  if (activeUsers.length === 0) {
    workspaceUsersList.appendChild(createWorkspaceUsersPlaceholder("No users are assigned to this workspace."));
    return;
  }

  activeUsers.forEach((user) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const editButton = document.createElement("button");

    row.className = "workspace-user-row";
    name.textContent = user.displayName || user.username || user.user_id;
    editButton.type = "button";
    editButton.textContent = "Edit Permissions";
    editButton.addEventListener("click", () => {
      window.location.href = `user-admin.html?user=${encodeURIComponent(user.user_id)}`;
    });
    row.append(name, editButton);
    workspaceUsersList.appendChild(row);
  });
}

function createWorkspaceUsersPlaceholder(message) {
  const placeholder = document.createElement("p");

  placeholder.className = "placeholder-copy";
  placeholder.textContent = message;
  return placeholder;
}

function formatOrdinal(day) {
  const suffix = day % 10 === 1 && day !== 11
    ? "st"
    : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
        ? "rd"
        : "th";

  return `${day}${suffix}`;
}

function flashSavedState() {
  const originalText = saveSettingsButton.textContent;
  saveSettingsButton.textContent = "Saved.";
  saveSettingsButton.classList.add("is-saved");
  setWorkspaceSettingsStatus("");

  window.setTimeout(() => {
    saveSettingsButton.textContent = originalText;
    saveSettingsButton.classList.remove("is-saved");
  }, 1600);
}

function setWorkspaceSettingsStatus(message) {
  window.LongtailForge.status.set(workspaceSettingsStatus, message);
}

function handleApiError(error, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  window.LongtailForge.status.set(workspaceSettingsStatus, error?.message || fallbackMessage, { type: "error" });
}
