(function attachFilesSettingsPage() {
  const filesSettingsForm = document.querySelector("[data-module-settings-form='files']");
  const filesSettingsFields = document.querySelector('[data-settings-attachment="module"][data-settings-module-id="files"]');
  const filesSettingsAuxiliary = document.querySelector("[data-module-settings-legacy='files']");
  const filesSettingsStatus = asStatusElement(document.querySelector("[data-module-settings-status]"));

  let settingsCatalog = null;
  /**
   * The storage readout, or `null` when the server has not given one this browser can vouch for.
   *
   * `null` is not "no storage used" - it is "usage unknown", and the readout says so. A real
   * accounting record whose totals are all zero is a different value and still renders zeros.
   * @type {BrowserFileStorageAccounting | null}
   */
  let accounting = null;
  const settingsPageController = requireSettingsPageController().create({
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
      throw new Error("Files settings requires LongtailForge.errors.");
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
      throw new Error("Files settings requires LongtailForge.api.");
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
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsRenderer} BrowserSettingsRenderer */

  /**
   * The shared settings renderer this page requires.
   *
   * Files Settings loads `settings-renderer.js` before its controller, so an absent surface is a
   * delivery failure rather than a condition to render around. This fails where the raw
   * property read already failed, and says what is missing.
   * @returns {BrowserSettingsRenderer}
   */
  function requireSettingsRenderer() {
    const renderer = window.LongtailForge?.settingsRenderer;
    if (!renderer) {
      throw new Error("Files settings requires LongtailForge.settingsRenderer.");
    }
    return renderer;
  }

  /**
   * The form the renderer collects and validates against.
   *
   * The renderer walks this element; a missing one threw on the first DOM read before and
   * throws here instead, named.
   * @returns {Element}
   */
  function requireFilesSettingsForm() {
    if (!filesSettingsForm) {
      throw new Error("Files settings requires its module settings form.");
    }
    return filesSettingsForm;
  }

  function requireSettingsHost() {
    const host = window.LongtailForge?.settingsHost;
    if (!host) {
      throw new Error("Files settings requires LongtailForge.settingsHost.");
    }
    return host;
  }

  /** @returns {BrowserSettingsPageController} */
  function requireSettingsPageController() {
    const controller = window.LongtailForge?.settingsPageController;
    if (!controller) {
      throw new Error("Files settings requires LongtailForge.settingsPageController.");
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
      throw new Error("Files settings requires LongtailForge.status.");
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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceFileSettingsResponse} BrowserWorkspaceFileSettingsResponse */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFileStorageAccounting} BrowserFileStorageAccounting */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFileStorageAccountingTotals} BrowserFileStorageAccountingTotals */

  /** The five members the totals reducer seeds, so the five it always answers. */
  const ACCOUNTING_TOTALS = Object.freeze([
    "externalFileCount", "externalReportedBytes", "fileCount", "internalBytes", "internalFileCount",
  ]);

  /**
   * A plain JSON object, which is the least a wire value can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isSettingsRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * What both Files settings routes answered, or `null` when it cannot be vouched for.
   *
   * **Refused rather than defaulted, because the default invented a number.** Treating a missing
   * accounting record as an empty object and each missing total as zero rendered "0 internal
   * files, 0 B internal storage" - a specific, reassuring claim about a workspace's storage that
   * the server never made. The readout now says usage is unavailable instead.
   *
   * Totals are checked for finiteness rather than for being non-negative integers, because the
   * row shaper coerces with `Number(column || 0)` and clamps nothing. `entries` is checked as a
   * container only: nothing here reads into one.
   * @param {unknown} body
   * @returns {BrowserWorkspaceFileSettingsResponse | null}
   */
  function readWorkspaceFileSettingsResponse(body) {
    if (!isSettingsRecord(body)) {
      return null;
    }
    const { accounting: rawAccounting, settings } = body;
    if (!isSettingsRecord(rawAccounting) || settings === undefined) {
      return null;
    }
    const { entries, totals } = rawAccounting;
    if (!Array.isArray(entries) || !isSettingsRecord(totals)
      || !ACCOUNTING_TOTALS.every((key) => typeof totals[key] === "number" && Number.isFinite(totals[key]))) {
      return null;
    }
    return {
      accounting: {
        entries,
        totals: {
          externalFileCount: Number(totals.externalFileCount),
          externalReportedBytes: Number(totals.externalReportedBytes),
          fileCount: Number(totals.fileCount),
          internalBytes: Number(totals.internalBytes),
          internalFileCount: Number(totals.internalFileCount),
        },
      },
      settings,
    };
  }

  async function loadFilesSettings() {
    const api = requireApi();
    setStatus("Loading Files settings...");
    try {
      const [catalog, result] = await Promise.all([
        api.getJson("/api/settings/catalog", { cache: "no-store" }),
        api.getJson("/api/files/settings", { cache: "no-store" }),
      ]);
      const response = readWorkspaceFileSettingsResponse(result);
      if (!response) {
        throw new Error("Files settings could not be read.");
      }
      settingsCatalog = catalog;
      accounting = response.accounting;
      renderSettings();
      setStatus("");
      settingsPageController.setClean();
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }
      setStatus(requireErrors().caughtMessage(error, "Files settings could not be loaded."), true);
    }
  }

  async function saveFilesSettings() {
    const api = requireApi();
    if (!requireSettingsRenderer().validate(requireFilesSettingsForm())) {
      setStatus("Review the highlighted Files settings.", true);
      return false;
    }
    const values = requireSettingsRenderer().collectPayload(requireFilesSettingsForm()).files || {};
    setStatus("Saving Files settings...");
    try {
      const result = await api.putJson("/api/files/settings", {
        allowedExtensions: parseExtensions(values["files.allowedExtensions"]),
        blockedExtensions: parseExtensions(values["files.blockedExtensions"]),
        fileTypePolicyMode: values["files.fileTypePolicyMode"] || "safe_default",
        internalStorageLimitBytes: nullableInteger(values["files.internalStorageLimitBytes"]),
        perUserStorageLimitBytes: nullableInteger(values["files.perUserStorageLimitBytes"]),
      });
      // The write has already happened, so an unreadable body is not a failed save. The readout
      // drops to unavailable and the status says exactly that, rather than claiming the settings
      // were not saved or inventing zero usage beside them.
      const response = readWorkspaceFileSettingsResponse(result);
      accounting = response ? response.accounting : null;
      settingsCatalog = await api.getJson("/api/settings/catalog", { cache: "no-store" });
      renderSettings();
      setStatus(response
        ? "Files settings saved."
        : "Files settings saved. Storage usage could not be read.");
      return true;
    } catch (error) {
      requireSettingsRenderer().showValidationErrors(requireFilesSettingsForm(), error);
      setStatus(requireErrors().caughtMessage(error, "Files settings were not saved."), true);
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
    requireSettingsRenderer().renderSections(
      filesSettingsFields,
      requireSettingsHost().attachmentSections(settingsCatalog, "module", "files"),
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
    const view = requireView();
    if (!accounting) {
      container.replaceChildren(view.createElement("p", {
        className: "settings-help",
        text: "Storage usage is unavailable.",
      }));
      return;
    }
    const totals = accounting.totals;
    const items = [
      ["Internal files", totals.internalFileCount],
      ["Internal storage", formatBytes(totals.internalBytes)],
      ["External files", totals.externalFileCount],
      ["External reported", formatBytes(totals.externalReportedBytes)],
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
    requireStatusMessage().set(filesSettingsStatus, message, isError ? { type: "error" } : {});
  }
})();
