const moduleSettingsForm = document.querySelector("[data-module-settings-form]");
const moduleSettingsStatus = document.querySelector("[data-module-settings-status]");
const moduleSettingsFields = document.querySelector("[data-module-settings-fields]");
const saveModuleSettingsButton = document.querySelector("[data-save-module-settings]");
const reminderDateTimeHours1Input = document.querySelector("[data-workspace-reminder-date-time-hours-1]");
const reminderDateTimeHours2Input = document.querySelector("[data-workspace-reminder-date-time-hours-2]");
const reminderDateOnlyDays1Input = document.querySelector("[data-workspace-reminder-date-only-days-1]");
const reminderDateOnlyDays2Input = document.querySelector("[data-workspace-reminder-date-only-days-2]");

let currentSettings = null;
let currentModule = null;

moduleSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

loadSettings();

async function loadSettings() {
  setStatus("Loading settings...");

  try {
    currentSettings = normalizeSettings(await window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }));
    currentModule = findCurrentModule(currentSettings);
    writeSettings(currentSettings);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Settings could not be loaded.", { isError: true });
  }
}

async function saveSettings() {
  if (!currentSettings) {
    return;
  }

  const payload = {
    ...currentSettings,
    moduleSettings: readModuleSettingsPayload(),
    taskReminderDefaults: readReminderDefaults(),
  };

  saveModuleSettingsButton.disabled = true;
  setStatus("Saving settings...");

  try {
    const result = await window.LongtailForge.api.putJson("/api/settings", payload);
    currentSettings = normalizeSettings(result.data || result);
    currentModule = findCurrentModule(currentSettings);
    writeSettings(currentSettings);
    flashSavedState();
  } catch (error) {
    setStatus(error.message || "Settings were not saved.", { isError: true });
  } finally {
    saveModuleSettingsButton.disabled = false;
  }
}

function writeSettings(settings) {
  renderModuleSettings(settings);
  writeReminderDefaults(settings.taskReminderDefaults);
}

function renderModuleSettings() {
  if (!currentModule) {
    window.LongtailForge.settingsControls.renderModuleSettingFields(
      moduleSettingsFields,
      null,
      { emptyText: "No configurable module settings are available." },
    );
    return;
  }

  window.LongtailForge.settingsControls.renderModuleSettingFields(moduleSettingsFields, currentModule, {
    emptyText: "No configurable module settings are available.",
  });
}

function readModuleSettingsPayload() {
  return window.LongtailForge.settingsControls.readModuleSettingsPayload(moduleSettingsForm);
}

function findCurrentModule(settings) {
  const moduleId = moduleSettingsForm?.dataset.moduleSettingsForm || "";
  return (settings.moduleSettings || []).find((moduleDefinition) => moduleDefinition.moduleId === moduleId) || null;
}

function normalizeSettings(settings) {
  return {
    workspaceName: String(settings?.workspaceName || "").trim(),
    workspaceType: normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type),
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
    timeTrackingEnabled: settings?.timeTrackingEnabled === false ? false : true,
    tasksEnabled: settings?.tasksEnabled === false ? false : true,
    taskTimersEnabled: settings?.taskTimersEnabled === false ? false : true,
    moduleSettings: normalizeModuleSettings(settings?.moduleSettings, settings),
    audit: normalizeAuditSettings(settings?.audit),
    taskReminderDefaults: normalizeReminderPolicy(settings?.taskReminderDefaults),
  };
}

function normalizeModuleSettings(moduleSettings, settings) {
  return window.LongtailForge.settingsControls.normalizeModuleSettings(moduleSettings, settings);
}

function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim();
  return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";
}

function normalizeFiscalYear(fiscalYear) {
  return {
    startMonth: Math.min(12, Math.max(1, Number.parseInt(fiscalYear?.startMonth, 10) || 1)),
    startDay: Math.min(31, Math.max(1, Number.parseInt(fiscalYear?.startDay, 10) || 1)),
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

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment) ? rounding.increment : "nearestQuarterHour";

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
  if (!reminderDateTimeHours1Input) {
    return;
  }

  const normalized = normalizeReminderPolicy(policy);
  const timedHours = normalized.dateTime.map((minutes) => Math.round(minutes / 60));
  const dateOnlyDays = normalized.dateOnly.map((minutes) => Math.round(minutes / 1440));

  reminderDateTimeHours1Input.value = String(timedHours[0] || 2);
  reminderDateTimeHours2Input.value = String(timedHours[1] || 24);
  reminderDateOnlyDays1Input.value = String(dateOnlyDays[0] || 3);
  reminderDateOnlyDays2Input.value = String(dateOnlyDays[1] || 1);
}

function readReminderDefaults() {
  if (!reminderDateTimeHours1Input) {
    return currentSettings.taskReminderDefaults;
  }

  return {
    dateTime: [
      readPositiveInteger(reminderDateTimeHours1Input, 2) * 60,
      readPositiveInteger(reminderDateTimeHours2Input, 24) * 60,
    ],
    dateOnly: [
      readPositiveInteger(reminderDateOnlyDays1Input, 3) * 1440,
      readPositiveInteger(reminderDateOnlyDays2Input, 1) * 1440,
    ],
  };
}

function readPositiveInteger(input, fallback) {
  return Math.max(1, Number.parseInt(input?.value, 10) || fallback);
}

function flashSavedState() {
  const originalText = saveModuleSettingsButton.textContent;
  saveModuleSettingsButton.textContent = "Saved.";
  saveModuleSettingsButton.classList.add("is-saved");
  setStatus("");

  window.setTimeout(() => {
    saveModuleSettingsButton.textContent = originalText;
    saveModuleSettingsButton.classList.remove("is-saved");
  }, 1600);
}

function setStatus(message, options = {}) {
  moduleSettingsStatus.textContent = message;
  moduleSettingsStatus.classList.toggle("is-error", Boolean(options.isError));
}
