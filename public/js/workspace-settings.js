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
let timeTrackingEnabledInput = document.querySelector("[data-time-tracking-enabled]");
let tasksEnabledInput = document.querySelector("[data-tasks-enabled]");
let taskTimersEnabledInput = document.querySelector("[data-task-timers-enabled]");
const auditLoggingEnabledInput = document.querySelector("[data-audit-logging-enabled]");
const auditRetentionDaysSelect = document.querySelector("[data-audit-retention-days]");
const workspaceReminderDateTimeHours1Input = document.querySelector("[data-workspace-reminder-date-time-hours-1]");
const workspaceReminderDateTimeHours2Input = document.querySelector("[data-workspace-reminder-date-time-hours-2]");
const workspaceReminderDateOnlyDays1Input = document.querySelector("[data-workspace-reminder-date-only-days-1]");
const workspaceReminderDateOnlyDays2Input = document.querySelector("[data-workspace-reminder-date-only-days-2]");
const businessBillingControls = document.querySelectorAll("[data-business-billing-control]");
const billingSettingsFieldset = document.querySelector("[data-billing-settings-fieldset]");
const openWorkspaceUsersButton = document.querySelector("[data-open-workspace-users]");
const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");
const workspaceUsersList = document.querySelector("[data-workspace-users-list]");
const closeWorkspaceUsersButton = document.querySelector("[data-close-workspace-users]");
const workspaceSettingsStatus = document.querySelector("[data-workspace-settings-status]");
const saveSettingsButton = document.querySelector("[data-save-settings]");
let activeWorkspaceId = "";
let currentTaskReminderDefaults = normalizeReminderPolicy();

populateFiscalYearStartMonths();
populateFiscalYearStartDays();
populateBillingPeriodStartDays();
loadSettingsForm();

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
    const response = await fetch("/api/settings", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load settings: ${response.status}`);
    }

    const settings = normalizeSettings(await response.json());
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
    if (timeTrackingEnabledInput) {
      timeTrackingEnabledInput.checked = settings.timeTrackingEnabled;
    }
    if (tasksEnabledInput) {
      tasksEnabledInput.checked = settings.tasksEnabled;
    }
    if (taskTimersEnabledInput) {
      taskTimersEnabledInput.checked = settings.taskTimersEnabled;
    }
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
    setWorkspaceSettingsStatus("Workspace settings could not be loaded.");
    console.error(error);
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
    timeTrackingEnabled: readModuleBooleanSetting("timeTrackingEnabled", true),
    tasksEnabled: readModuleBooleanSetting("tasksEnabled", true),
    taskTimersEnabled: readModuleBooleanSetting("taskTimersEnabled", true),
    moduleSettings: readModuleSettingsPayload(),
    audit: {
      loggingEnabled: auditLoggingEnabledInput.checked,
      retentionDays: auditRetentionDaysSelect.value,
    },
    taskReminderDefaults: readReminderDefaults(),
  });

  if (!settings.workspaceName) {
    setWorkspaceSettingsStatus("Workspace name is required.");
    return;
  }

  saveSettingsButton.disabled = true;
  setWorkspaceSettingsStatus("Saving workspace settings...");

  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    const result = await response.json();
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
    if (timeTrackingEnabledInput) {
      timeTrackingEnabledInput.checked = savedSettings.timeTrackingEnabled;
    }
    if (tasksEnabledInput) {
      tasksEnabledInput.checked = savedSettings.tasksEnabled;
    }
    if (taskTimersEnabledInput) {
      taskTimersEnabledInput.checked = savedSettings.taskTimersEnabled;
    }
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
    setWorkspaceSettingsStatus("Workspace settings were not saved. Start the local server and try again.");
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
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    timeTrackingEnabled: settings?.timeTrackingEnabled === false ? false : true,
    tasksEnabled: settings?.tasksEnabled === false ? false : true,
    taskTimersEnabled: settings?.taskTimersEnabled === false ? false : true,
    enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
    moduleSettings: normalizeModuleSettings(settings?.moduleSettings, settings),
    modules: Array.isArray(settings?.modules) ? settings.modules : [],
    audit: normalizeAuditSettings(settings?.audit),
    taskReminderDefaults: normalizeReminderPolicy(settings?.taskReminderDefaults),
  };
}

function renderModuleSettings(settings) {
  if (!moduleSettingsContainer) {
    return;
  }

  const moduleSettings = settings.moduleSettings || [];
  moduleSettingsContainer.replaceChildren();

  if (moduleSettings.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder-copy";
    placeholder.textContent = "No configurable modules are available for this workspace.";
    moduleSettingsContainer.appendChild(placeholder);
    return;
  }

  moduleSettings.forEach((moduleDefinition) => {
    const group = document.createElement("section");
    const heading = document.createElement("h2");

    group.className = "module-settings-group";
    heading.textContent = moduleDefinition.displayName || moduleDefinition.name || moduleDefinition.moduleId;
    group.appendChild(heading);

    (moduleDefinition.settings || []).forEach((setting) => {
      group.appendChild(createModuleSettingControl(moduleDefinition, setting));
    });

    moduleSettingsContainer.appendChild(group);
  });
}

function normalizeModuleSettings(moduleSettings, settings) {
  if (Array.isArray(moduleSettings)) {
    return moduleSettings.map((moduleDefinition) => ({
      moduleId: String(moduleDefinition.moduleId || moduleDefinition.id || "").trim(),
      name: String(moduleDefinition.name || "").trim(),
      displayName: String(moduleDefinition.displayName || moduleDefinition.name || "").trim(),
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
      canDisable: moduleDefinition.canDisable !== false,
      settings: Array.isArray(moduleDefinition.settings)
        ? moduleDefinition.settings.map((setting) => normalizeModuleSetting(moduleDefinition, setting, settings))
        : [],
    })).filter((moduleDefinition) => moduleDefinition.moduleId && moduleDefinition.settings.length > 0);
  }

  return (settings?.modules || []).flatMap((moduleDefinition) => {
    const fields = Array.isArray(moduleDefinition.settings) ? moduleDefinition.settings : [];

    return fields.length > 0
      ? [{
          moduleId: moduleDefinition.id,
          name: moduleDefinition.name,
          displayName: moduleDefinition.displayName || moduleDefinition.name,
          status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
          canDisable: moduleDefinition.canDisable !== false,
          settings: fields.map((setting) => normalizeModuleSetting(moduleDefinition, setting, settings)),
        }]
      : [];
  });
}

function normalizeModuleSetting(moduleDefinition, setting, settings) {
  const moduleId = moduleDefinition.moduleId || moduleDefinition.id || setting.moduleId || "";
  const value = Object.hasOwn(setting, "value")
    ? setting.value
    : setting.id === "timeTrackingEnabled"
      ? settings?.timeTrackingEnabled !== false
      : setting.id === "tasksEnabled"
        ? settings?.tasksEnabled !== false
        : setting.id === "taskTimersEnabled"
          ? settings?.taskTimersEnabled !== false
          : moduleDefinition.status === "enabled";

  return {
    id: String(setting.id || "").trim(),
    label: String(setting.label || setting.id || "").trim(),
    description: String(setting.description || "").trim(),
    moduleId,
    moduleStatus: setting.moduleStatus === true,
    options: Array.isArray(setting.options) ? setting.options : [],
    placeholder: String(setting.placeholder || "").trim(),
    readOnly: setting.readOnly === true,
    type: normalizeModuleSettingType(setting.type),
    value,
  };
}

function normalizeModuleSettingType(type) {
  return ["boolean", "text", "number", "select", "multi-select", "info"].includes(type) ? type : "info";
}

function createModuleSettingControl(moduleDefinition, setting) {
  if (setting.type === "info") {
    const paragraph = document.createElement("p");
    paragraph.className = "settings-help";
    paragraph.textContent = setting.description || setting.label;
    return paragraph;
  }

  const label = document.createElement("label");
  const input = createModuleSettingInput(setting);

  label.className = setting.type === "boolean" ? "inline-option" : "";
  input.dataset.moduleSetting = setting.id;
  input.dataset.moduleId = setting.moduleId || moduleDefinition.moduleId;
  input.dataset.moduleSettingType = setting.type;

  if (setting.readOnly) {
    input.disabled = true;
  }

  rememberLegacyModuleInput(setting.id, input);

  if (setting.type === "boolean") {
    label.append(input, document.createTextNode(` ${setting.label}`));
  } else {
    label.append(document.createTextNode(setting.label), input);
  }

  if (setting.description) {
    const help = document.createElement("span");
    help.className = "settings-help";
    help.textContent = setting.description;
    label.appendChild(help);
  }

  return label;
}

function createModuleSettingInput(setting) {
  if (setting.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = setting.value !== false;
    return input;
  }

  if (setting.type === "select" || setting.type === "multi-select") {
    const select = document.createElement("select");
    select.multiple = setting.type === "multi-select";
    (setting.options || []).forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      optionElement.selected = Array.isArray(setting.value)
        ? setting.value.includes(option.value)
        : setting.value === option.value;
      select.appendChild(optionElement);
    });
    return select;
  }

  const input = document.createElement("input");
  input.type = setting.type === "number" ? "number" : "text";
  input.value = setting.value ?? "";
  input.placeholder = setting.placeholder || "";
  return input;
}

function rememberLegacyModuleInput(settingId, input) {
  if (settingId === "timeTrackingEnabled") {
    timeTrackingEnabledInput = input;
  }
  if (settingId === "tasksEnabled") {
    tasksEnabledInput = input;
  }
  if (settingId === "taskTimersEnabled") {
    taskTimersEnabledInput = input;
  }
}

function readModuleBooleanSetting(settingId, fallback) {
  const input = document.querySelector(`[data-module-setting="${settingId}"]`);

  return input ? input.checked : fallback;
}

function readModuleSettingsPayload() {
  const payload = {};

  document.querySelectorAll("[data-module-setting]").forEach((input) => {
    if (input.disabled) {
      return;
    }

    const moduleId = input.dataset.moduleId;
    const settingId = input.dataset.moduleSetting;

    if (!moduleId || !settingId) {
      return;
    }

    payload[moduleId] = payload[moduleId] || {};
    payload[moduleId][settingId] = readModuleSettingInputValue(input);
  });

  return payload;
}

function readModuleSettingInputValue(input) {
  if (input.dataset.moduleSettingType === "boolean") {
    return input.checked;
  }

  if (input.dataset.moduleSettingType === "number") {
    return Number(input.value);
  }

  if (input.dataset.moduleSettingType === "multi-select") {
    return Array.from(input.selectedOptions).map((option) => option.value);
  }

  return input.value;
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

  businessBillingControls.forEach((control) => {
    control.hidden = usesRoundingOnly;
  });

  if (billingSettingsFieldset) {
    billingSettingsFieldset.querySelector("legend").textContent = usesRoundingOnly
      ? "Rounding"
      : "Billing Settings";
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
  workspaceSettingsStatus.textContent = message;
}
