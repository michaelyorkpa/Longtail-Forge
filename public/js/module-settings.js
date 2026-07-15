const moduleSettingsForm = document.querySelector("[data-module-settings-form]");
const moduleSettingsStatus = document.querySelector("[data-module-settings-status]");
const moduleSettingsFields = document.querySelector('[data-settings-attachment="module"]');

let currentSettings = null;
let settingsCatalog = null;

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
  } catch (error) {
    setStatus(error.message || "Settings could not be loaded.", { isError: true });
  }
}

async function saveSettings() {
  if (!currentSettings) {
    return;
  }
  if (!window.LongtailForge.settingsRenderer.validate(moduleSettingsForm)) {
    setStatus("Review the highlighted settings.", { isError: true });
    return;
  }

  const payload = {
    workspaceName: currentSettings.workspaceName,
    workspaceType: currentSettings.workspaceType,
    moduleSettings: window.LongtailForge.settingsRenderer.collectPayload(moduleSettingsForm),
    audit: currentSettings.audit,
  };

  setSaveButtonsDisabled(true);
  setStatus("Saving settings...");

  try {
    const result = await window.LongtailForge.api.putJson("/api/settings", payload);
    currentSettings = normalizeSettings(result.data || result);
    settingsCatalog = await window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" });
    renderModuleSettings();
    flashSavedState();
  } catch (error) {
    window.LongtailForge.settingsRenderer.showValidationErrors(moduleSettingsForm, error);
    setStatus(error.message || "Settings were not saved.", { isError: true });
  } finally {
    setSaveButtonsDisabled(false);
  }
}

function renderModuleSettings() {
  const moduleId = moduleSettingsForm?.dataset.moduleSettingsForm || "";
  window.LongtailForge.settingsRenderer.renderSections(
    moduleSettingsFields,
    window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "module", moduleId),
    { emptyText: "No configurable module settings are available." },
  );
}

function normalizeSettings(settings) {
  return {
    workspaceName: String(settings?.workspaceName || "").trim(),
    workspaceType: normalizeWorkspaceType(settings?.workspaceType || settings?.workspace_type),
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
  const buttons = getSaveButtons();
  const labels = buttons.map((button) => button.textContent);
  buttons.forEach((button) => {
    button.textContent = "Saved.";
    button.classList.add("is-saved");
  });
  setStatus("");

  window.setTimeout(() => {
    buttons.forEach((button, index) => {
      button.textContent = labels[index];
      button.classList.remove("is-saved");
    });
  }, 1600);
}

function getSaveButtons() {
  return [...moduleSettingsForm.querySelectorAll("[data-settings-save]")];
}

function setSaveButtonsDisabled(disabled) {
  getSaveButtons().forEach((button) => {
    button.disabled = disabled;
  });
}

function setStatus(message, options = {}) {
  window.LongtailForge.status.set(moduleSettingsStatus, message, options.isError ? { type: "error" } : options);
}
