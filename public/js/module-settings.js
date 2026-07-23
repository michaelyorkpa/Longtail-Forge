const moduleSettingsForm = document.querySelector("[data-module-settings-form]");
const moduleSettingsStatus = document.querySelector("[data-module-settings-status]");
const moduleSettingsFields = document.querySelector('[data-settings-attachment="module"]');

let currentSettings = null;
let settingsCatalog = null;
const settingsPageController = window.LongtailForge.settingsPageController.create({
  root: document.querySelector("[data-settings-host='module']"),
  onSave: saveSettings,
});

moduleSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

loadSettings();

async function loadSettings() {
  setStatus("Loading settings...");

  try {
    const [settingsResponse, catalog] = await Promise.all([
      window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" }),
    ]);
    currentSettings = normalizeSettings(settingsResponse);
    settingsCatalog = catalog;
    renderModuleSettings();
    setStatus("");
    settingsPageController.setClean();
  } catch (error) {
    setStatus(error.message || "Settings could not be loaded.", { isError: true });
  }
}

async function saveSettings() {
  if (!currentSettings) {
    return false;
  }
  if (!window.LongtailForge.settingsRenderer.validate(moduleSettingsForm)) {
    setStatus("Review the highlighted settings.", { isError: true });
    return false;
  }

  const contributedSettings = collectContributedSettingsPayload();
  const payload = {
    workspaceName: currentSettings.workspaceName,
    workspaceType: currentSettings.workspaceType,
    moduleSettings: contributedSettings.moduleSettings,
    frameworkSettings: contributedSettings.frameworkSettings,
    audit: currentSettings.audit,
  };

  setStatus("Saving settings...");

  try {
    const result = await window.LongtailForge.api.putJson("/api/settings", payload);
    currentSettings = normalizeSettings(result.data || result);
    settingsCatalog = await window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" });
    renderModuleSettings();
    flashSavedState();
    return true;
  } catch (error) {
    window.LongtailForge.settingsRenderer.showValidationErrors(moduleSettingsForm, error);
    setStatus(error.message || "Settings were not saved.", { isError: true });
    return false;
  }
}

function renderModuleSettings() {
  const moduleId = moduleSettingsForm?.dataset.moduleSettingsForm || "";
  const moduleDefinition = currentSettings?.modules.find((module) => module.id === moduleId) || null;
  if (moduleDefinition && moduleDefinition.status !== "enabled") {
    window.LongtailForge.settingsRenderer.renderDisabledModuleRecovery(moduleSettingsFields, moduleDefinition || {
      id: moduleId,
      displayName: moduleId,
    });
    return;
  }
  window.LongtailForge.settingsRenderer.renderSections(
    moduleSettingsFields,
    window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "module", moduleId),
    { emptyText: "No configurable module settings are available." },
  );
}

function collectContributedSettingsPayload() {
  const moduleSettings = window.LongtailForge.settingsRenderer.collectPayload(moduleSettingsForm);
  const frameworkSettings = {};
  const moduleId = moduleSettingsForm?.dataset.moduleSettingsForm || "";
  const sections = window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "module", moduleId);

  sections.flatMap((section) => section.settings || []).forEach((setting) => {
    if (setting.target !== "framework" || !Object.hasOwn(moduleSettings[moduleId] || {}, setting.id)) {
      return;
    }
    frameworkSettings[setting.id] = moduleSettings[moduleId][setting.id];
    delete moduleSettings[moduleId][setting.id];
  });
  if (moduleId && Object.keys(moduleSettings[moduleId] || {}).length === 0) {
    delete moduleSettings[moduleId];
  }

  return { frameworkSettings, moduleSettings };
}

function normalizeSettings(settings) {
  return {
    workspaceName: String(settings?.workspaceName || "").trim(),
    workspaceType: normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type),
    enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
    modules: Array.isArray(settings?.modules) ? settings.modules : [],
    audit: normalizeAuditSettings(settings?.audit),
  };
}

function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim();
  return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";
}

function normalizeAuditSettings(audit) {
  const retentionOptions = [7, 14, 30, 60, 90, 180, 365];
  const retentionDays = Number.parseInt(audit?.retentionDays, 10);
  return {
    loggingEnabled: audit?.loggingEnabled === false ? false : true,
    retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,
  };
}

function flashSavedState() {
  setStatus("Settings saved.", { type: "success", clearAfter: 1600 });
}

function setStatus(message, options = {}) {
  window.LongtailForge.status.set(moduleSettingsStatus, message, options.isError ? { type: "error" } : options);
}
