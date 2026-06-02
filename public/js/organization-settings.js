// Workspace settings are shared defaults used by navigation, reports, and billing.
const settingsForm = document.querySelector("[data-workspace-settings-form], [data-organization-settings-form]");
const workspaceNameInput = document.querySelector("[data-workspace-name-input], [data-organization-name-input]");
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
const auditLoggingEnabledInput = document.querySelector("[data-audit-logging-enabled]");
const auditRetentionDaysSelect = document.querySelector("[data-audit-retention-days]");
const businessBillingControls = document.querySelectorAll("[data-business-billing-control]");
const billingSettingsFieldset = document.querySelector("[data-billing-settings-fieldset]");
const openWorkspaceUsersButton = document.querySelector("[data-open-workspace-users]");
const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");
const workspaceUsersList = document.querySelector("[data-workspace-users-list]");
const closeWorkspaceUsersButton = document.querySelector("[data-close-workspace-users]");
const workspaceSettingsStatus = document.querySelector("[data-workspace-settings-status], [data-organization-settings-status]");
const saveSettingsButton = document.querySelector("[data-save-settings]");
let activeWorkspaceId = "";

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
    renderModuleSettings(settings);
    auditLoggingEnabledInput.checked = settings.audit.loggingEnabled;
    auditRetentionDaysSelect.value = String(settings.audit.retentionDays);
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
    audit: {
      loggingEnabled: auditLoggingEnabledInput.checked,
      retentionDays: auditRetentionDaysSelect.value,
    },
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
    renderModuleSettings(savedSettings);
    auditLoggingEnabledInput.checked = savedSettings.audit.loggingEnabled;
    auditRetentionDaysSelect.value = String(savedSettings.audit.retentionDays);
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
  const workspaceName = String(settings?.workspaceName || settings?.organizationName || "").trim();
  const workspaceType = normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type);

  return {
    workspaceId: String(settings?.workspaceId || settings?.workspace_id || "").trim(),
    workspaceName,
    organizationName: workspaceName,
    workspaceType,
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    timeTrackingEnabled: settings?.timeTrackingEnabled === false ? false : true,
    enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
    modules: Array.isArray(settings?.modules) ? settings.modules : [],
    audit: normalizeAuditSettings(settings?.audit),
  };
}

function renderModuleSettings(settings) {
  if (!moduleSettingsContainer) {
    return;
  }

  const moduleSettings = readRenderableModuleSettings(settings);
  moduleSettingsContainer.replaceChildren();

  if (moduleSettings.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder-copy";
    placeholder.textContent = "No configurable modules are available for this workspace.";
    moduleSettingsContainer.appendChild(placeholder);
    return;
  }

  moduleSettings.forEach((setting) => {
    const label = document.createElement("label");
    const input = document.createElement("input");

    label.className = "inline-option";
    input.type = "checkbox";
    input.checked = setting.value;
    input.dataset.moduleSetting = setting.id;
    input.dataset.moduleId = setting.moduleId;

    if (setting.id === "timeTrackingEnabled") {
      timeTrackingEnabledInput = input;
    }

    label.append(input, document.createTextNode(` ${setting.label}`));
    moduleSettingsContainer.appendChild(label);
  });
}

function readRenderableModuleSettings(settings) {
  return (settings.modules || []).flatMap((moduleDefinition) => {
    const moduleSettings = Array.isArray(moduleDefinition.settings) ? moduleDefinition.settings : [];

    return moduleSettings
      .filter((setting) => setting.type === "boolean")
      .map((setting) => ({
        id: setting.id,
        label: setting.label || moduleDefinition.displayName || moduleDefinition.name || setting.id,
        moduleId: moduleDefinition.id,
        value: setting.id === "timeTrackingEnabled"
          ? settings.timeTrackingEnabled !== false
          : moduleDefinition.status === "enabled",
      }));
  });
}

function readModuleBooleanSetting(settingId, fallback) {
  const input = document.querySelector(`[data-module-setting="${settingId}"]`);

  return input ? input.checked : fallback;
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
