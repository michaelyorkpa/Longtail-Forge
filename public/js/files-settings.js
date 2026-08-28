(function attachFilesSettingsPage() {
  const filesSettingsForm = document.querySelector("[data-module-settings-form='files']");
  const filesSettingsFields = document.querySelector('[data-settings-attachment="module"][data-settings-module-id="files"]');
  const filesSettingsAuxiliary = document.querySelector("[data-module-settings-legacy='files']");
  const filesSettingsStatus = document.querySelector("[data-module-settings-status]");

  let settingsCatalog = null;
  let accounting = {};
  const settingsPageController = window.LongtailForge.settingsPageController.create({
    root: document.querySelector("[data-settings-host='module']"),
    onSave: saveFilesSettings,
  });

  mountAccountingReadout();
  filesSettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFilesSettings();
  });
  loadFilesSettings();

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

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
    const client = window.LongtailForge?.api;
    if (!client) {
      throw new Error("Files settings requires LongtailForge.api.");
    }
    return client;
  }
  async function loadFilesSettings() {
    const api = requireApi();
    setStatus("Loading Files settings...");
    try {
      const [catalog, result] = await Promise.all([
        api.getJson("/api/settings/catalog", { cache: "no-store" }),
        api.getJson("/api/files/settings", { cache: "no-store" }),
      ]);
      settingsCatalog = catalog;
      accounting = result.accounting || {};
      renderSettings();
      setStatus("");
      settingsPageController.setClean();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("/login.html");
        return;
      }
      setStatus(error.message || "Files settings could not be loaded.", true);
    }
  }

  async function saveFilesSettings() {
    const api = requireApi();
    if (!window.LongtailForge.settingsRenderer.validate(filesSettingsForm)) {
      setStatus("Review the highlighted Files settings.", true);
      return false;
    }
    const values = window.LongtailForge.settingsRenderer.collectPayload(filesSettingsForm).files || {};
    setStatus("Saving Files settings...");
    try {
      const result = await api.putJson("/api/files/settings", {
        allowedExtensions: parseExtensions(values["files.allowedExtensions"]),
        blockedExtensions: parseExtensions(values["files.blockedExtensions"]),
        fileTypePolicyMode: values["files.fileTypePolicyMode"] || "safe_default",
        internalStorageLimitBytes: nullableInteger(values["files.internalStorageLimitBytes"]),
        perUserStorageLimitBytes: nullableInteger(values["files.perUserStorageLimitBytes"]),
      });
      accounting = result.accounting || {};
      settingsCatalog = await api.getJson("/api/settings/catalog", { cache: "no-store" });
      renderSettings();
      setStatus("Files settings saved.");
      return true;
    } catch (error) {
      window.LongtailForge.settingsRenderer.showValidationErrors(filesSettingsForm, error);
      setStatus(error.message || "Files settings were not saved.", true);
      return false;
    }
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this controller cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it.
   * @returns {BrowserViewFactory}
   */
  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Files settings require LongtailForge.view.");
    }
    return factory;
  }

  function renderSettings() {
    window.LongtailForge.settingsRenderer.renderSections(
      filesSettingsFields,
      window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "module", "files"),
      { emptyText: "No configurable Files settings are available." },
    );
    renderAccounting();
  }

  function mountAccountingReadout() {
    if (!filesSettingsAuxiliary) {
      return;
    }
    const view = requireView();
    filesSettingsAuxiliary.appendChild(view.createElement("fieldset", {
      className: "view-settings-section",
      children: [
        view.createElement("legend", { className: "view-settings-section-legend", text: "Storage Accounting" }),
        view.createElement("div", { className: "settings-summary-grid", dataset: { storageAccounting: "" } }),
      ],
    }));
  }

  function renderAccounting() {
    const container = filesSettingsAuxiliary?.querySelector("[data-storage-accounting]");
    if (!container) {
      return;
    }
    const totals = accounting.totals || {};
    const view = requireView();
    const items = [
      ["Internal files", totals.internalFileCount || 0],
      ["Internal storage", formatBytes(totals.internalBytes || 0)],
      ["External files", totals.externalFileCount || 0],
      ["External reported", formatBytes(totals.externalReportedBytes || 0)],
    ];
    container.replaceChildren(...items.map(([label, value]) => view.createElement("div", {
      className: "settings-summary-item",
      children: [
        view.createElement("span", { text: label }),
        view.createElement("strong", { text: String(value) }),
      ],
    })));
  }

  function parseExtensions(value) {
    return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  }

  function nullableInteger(value) {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function setStatus(message, isError = false) {
    window.LongtailForge.status.set(filesSettingsStatus, message, isError ? { type: "error" } : {});
  }
})();
