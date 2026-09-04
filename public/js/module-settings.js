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

  /**
   * The module this settings form configures.
   *
   * Read in one place because this page now needs it wherever the catalog is selected: the
   * initial load, the post-save refresh, the render and the collector.
   * @returns {string}
   */
  function currentModuleSettingsId() {
    return moduleSettingsForm?.dataset.moduleSettingsForm || "";
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModuleSettingsSection} BrowserModuleSettingsSection */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModuleSettingsSetting} BrowserModuleSettingsSetting */

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isCatalogRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One contributed setting, in the members this page's collector trusts.
   *
   * Nothing else is checked. A setting also carries its label, type, options and value, and the
   * settings renderer owns all of those - re-checking them here would publish a second copy of
   * a contract this child does not own.
   * @param {unknown} value
   * @returns {value is BrowserModuleSettingsSetting}
   */
  function isModuleSettingsSetting(value) {
    return isCatalogRecord(value)
      && typeof value.id === "string"
      && value.id !== ""
      && typeof value.target === "string"
      && value.target !== "";
  }

  /**
   * One section of the module placement.
   *
   * `placement` and `moduleId` are checked against the bucket the section was read from,
   * because the producer keys that bucket on the same module it hands `findOrCreateSection`
   * and passes the placement straight through. A section that disagrees with its own bucket is
   * not one this producer built.
   * @param {unknown} value
   * @param {string} moduleId
   * @returns {value is BrowserModuleSettingsSection}
   */
  function isModuleSettingsSection(value, moduleId) {
    return isCatalogRecord(value)
      && typeof value.id === "string"
      && value.id !== ""
      && value.placement === "module"
      && value.moduleId === moduleId
      && typeof value.name === "string"
      && typeof value.displayName === "string"
      && Array.isArray(value.settings)
      && value.settings.every(isModuleSettingsSetting);
  }

  /**
   * The module's contributed sections, or `null` when the catalog is not one this producer sent.
   *
   * **The raw catalog is inspected before any fallback.** `settingsHost.attachmentSections`
   * answers `[]` for a body it cannot use, which is the right answer for a picker and the wrong
   * one here: by the time this page sees that `[]` it can no longer tell "this module
   * contributes no settings" from "the catalog could not be read", and it renders the same
   * sentence for both.
   *
   * A module with no entry, and a module whose entry is an empty list, are both real answers
   * and both come back as `[]`. What is refused is a catalog whose shape this page cannot
   * vouch for.
   *
   * **The producer's own sections and settings are answered, not rebuilt.** The renderer reads
   * labels, types, values, options and whatever a module contributes next; rebuilding to the
   * two members this collector needs would strip all of it.
   * @param {unknown} catalog
   * @param {string} moduleId
   * @returns {BrowserModuleSettingsSection[] | null}
   */
  function readModuleSettingsSections(catalog, moduleId) {
    if (!isCatalogRecord(catalog) || !isCatalogRecord(catalog.attachments)) {
      return null;
    }

    const moduleAttachments = catalog.attachments.module;

    if (!isCatalogRecord(moduleAttachments)) {
      return null;
    }

    if (!Object.hasOwn(moduleAttachments, moduleId)) {
      return [];
    }

    const sections = moduleAttachments[moduleId];

    if (!Array.isArray(sections) || !sections.every((section) => isModuleSettingsSection(section, moduleId))) {
      return null;
    }

    return /** @type {BrowserModuleSettingsSection[]} */ (sections);
  }

  async function loadSettings() {
    setStatus("Loading settings...");

    try {
      const [settingsResponse, catalog] = await Promise.all([
        requireApi().getJson("/api/settings", { cache: "no-store" }),
        requireApi().getJson("/api/settings/catalog", { cache: "no-store" }),
      ]);
      currentSettings = normalizeSettings(settingsResponse);
      if (!readModuleSettingsSections(catalog, currentModuleSettingsId())) {
        throw new Error("The settings catalog could not be read.");
      }
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
      const refreshedCatalog = await requireApi().getJson("/api/settings/catalog", { cache: "no-store" });
      if (!readModuleSettingsSections(refreshedCatalog, currentModuleSettingsId())) {
        setStatus("Settings saved, but the refreshed settings catalog could not be read.");
        return true;
      }
      settingsCatalog = refreshedCatalog;
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
    const moduleId = currentModuleSettingsId();
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
    /** @type {Record<string, unknown>} */
    const frameworkSettings = {};
    const moduleId = currentModuleSettingsId();
    const sections = readModuleSettingsSections(settingsCatalog, moduleId) || [];

    sections.flatMap((section) => section.settings).forEach((setting) => {
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
