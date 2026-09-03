(function attachModuleSettingsPage() {
  const moduleSettingsForm = document.querySelector("[data-module-settings-form]");
  const moduleSettingsStatus = asStatusElement(document.querySelector("[data-module-settings-status]"));
  const moduleSettingsFields = document.querySelector('[data-settings-attachment="module"]');

  let currentSettings = null;
  /** @type {unknown} */
  let settingsCatalog = null;
  const settingsPageController = requireSettingsPageController().create({
    root: document.querySelector("[data-settings-host='module']"),
    onSave: saveSettings,
  });

  moduleSettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings();
  });

  loadSettings();

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Module settings requires LongtailForge.errors.");
    }
    return errors;
  }

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Module settings requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsHost} BrowserSettingsHost */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsPageController} BrowserSettingsPageController */

  /**
   * The settings host this page cannot render without. Every page that loads this script also
   * loads `shared/settings-host.js` ahead of it, so a missing host is a delivery failure and
   * the checked read fails exactly where the raw read failed before.
   * @returns {BrowserSettingsHost}
   */
  function requireSettingsHost() {
    const host = window.LongtailForge?.settingsHost;
    if (!host) {
      throw new Error("Module settings requires LongtailForge.settingsHost.");
    }
    return host;
  }

  /** @returns {BrowserSettingsPageController} */
  function requireSettingsPageController() {
    const controller = window.LongtailForge?.settingsPageController;
    if (!controller) {
      throw new Error("Module settings requires LongtailForge.settingsPageController.");
    }
    return controller;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserStatusMessage} BrowserStatusMessage */

  /**
   * The status-message helpers this page cannot report through without. Every page that loads
   * this script also loads `shared/status.js` ahead of it, so the checked read fails exactly
   * where the raw read failed before.
   * @returns {BrowserStatusMessage}
   */
  function requireStatusMessage() {
    const status = window.LongtailForge?.status;
    if (!status) {
      throw new Error("Module settings requires LongtailForge.status.");
    }
    return status;
  }

  /**
   * A status element the message helpers can drive. They set `hidden`, which only an
   * `HTMLElement` has; anything else was already a silent no-op and stays one.
   * @param {Element | null} node
   * @returns {HTMLElement | null}
   */
  function asStatusElement(node) {
    return node && "hidden" in node ? /** @type {HTMLElement} */ (node) : null;
  }

  async function loadSettings() {
    setStatus("Loading settings...");

    try {
      const [settingsResponse, catalog] = await Promise.all([
        requireApi().getJson("/api/settings", { cache: "no-store" }),
        requireApi().getJson("/api/settings/catalog", { cache: "no-store" }),
      ]);
      currentSettings = normalizeSettings(settingsResponse);
      settingsCatalog = catalog;
      renderModuleSettings();
      setStatus("");
      settingsPageController.setClean();
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Settings could not be loaded."), { isError: true });
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
      const saveResult = requireSettingsHost().readWorkspaceSettingsSaveResult(
        await requireApi().putJson("/api/settings", payload),
      );
      // Same producer as Workspace Settings, so the same reader and the same distinction: the
      // write happened either way, and only the refreshed state is in doubt.
      if (!saveResult) {
        setStatus("Settings saved, but the refreshed settings could not be read.");
        return true;
      }
      currentSettings = normalizeSettings(saveResult.data);
      settingsCatalog = await requireApi().getJson("/api/settings/catalog", { cache: "no-store" });
      renderModuleSettings();
      flashSavedState();
      return true;
    } catch (error) {
      window.LongtailForge.settingsRenderer.showValidationErrors(moduleSettingsForm, error);
      setStatus(requireErrors().caughtMessage(error, "Settings were not saved."), { isError: true });
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
      requireSettingsHost().attachmentSections(settingsCatalog, "module", moduleId),
      { emptyText: "No configurable module settings are available." },
    );
  }

  function collectContributedSettingsPayload() {
    const moduleSettings = window.LongtailForge.settingsRenderer.collectPayload(moduleSettingsForm);
    const frameworkSettings = {};
    const moduleId = moduleSettingsForm?.dataset.moduleSettingsForm || "";
    const sections = requireSettingsHost().attachmentSections(settingsCatalog, "module", moduleId);

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
    requireStatusMessage().set(moduleSettingsStatus, message, options.isError ? { type: "error" } : options);
  }
})();
