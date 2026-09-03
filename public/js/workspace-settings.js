// Workspace settings are framework identity, audit, operations, and contributed module defaults.
(function attachWorkspaceSettingsPage() {
  const settingsForm = document.querySelector("[data-workspace-settings-form]");
  const workspaceNameInput = document.querySelector("[data-workspace-name-input]");
  const workspaceTypeSelect = document.querySelector("[data-workspace-type-input]");
  const moduleSettingsContainer = document.querySelector('[data-settings-attachment="workspace"]');
  const workspaceCoreSettingsContainer = moduleSettingsContainer?.querySelector("[data-workspace-core-settings]");
  const workspaceModuleSettingsContainer = moduleSettingsContainer?.querySelector("[data-workspace-module-settings]");
  const auditLoggingEnabledInput = document.querySelector("[data-audit-logging-enabled]");
  const auditRetentionDaysSelect = document.querySelector("[data-audit-retention-days]");
  const openWorkspaceUsersButton = document.querySelector("[data-open-workspace-users]");
  const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");
  const workspaceUsersList = document.querySelector("[data-workspace-users-list]");
  const closeWorkspaceUsersButton = document.querySelector("[data-close-workspace-users]");
  const workspaceSettingsStatus = asStatusElement(document.querySelector("[data-workspace-settings-status]"));
  const runtimeDiagnosticsSummary = document.querySelector("[data-runtime-diagnostics-summary]");
  const runtimeDiagnosticsWarnings = document.querySelector("[data-runtime-diagnostics-warnings]");
  const jobObservabilitySummary = document.querySelector("[data-job-observability-summary]");
  const jobObservabilityFailures = document.querySelector("[data-job-observability-failures]");
  const jobObservabilityMoreButton = document.querySelector("[data-job-observability-more]");
  const workspaceBackupSummary = document.querySelector("[data-workspace-backup-summary]");
  const workspaceBackupStatus = asStatusElement(document.querySelector("[data-workspace-backup-status]"));
  const createWorkspaceBackupButton = document.querySelector("[data-create-workspace-backup]");
  const workspaceDeletionSummary = document.querySelector("[data-workspace-deletion-summary]");
  const workspaceDeletionStatus = document.querySelector("[data-workspace-deletion-status]");
  const openWorkspaceDeletionButton = document.querySelector("[data-open-workspace-deletion]");
  const openWorkspaceDeletionCancelButton = document.querySelector("[data-open-workspace-deletion-cancel]");
  const workspaceDeletionDialog = document.querySelector("[data-workspace-deletion-dialog]");
  const workspaceDeletionDialogExplanation = document.querySelector("[data-workspace-deletion-dialog-explanation]");
  const workspaceDeletionNameInput = document.querySelector("[data-workspace-deletion-name]");
  const workspaceDeletionAcknowledgementInput = document.querySelector("[data-workspace-deletion-acknowledgement]");
  const workspaceDeletionAcknowledgementField = document.querySelector("[data-workspace-deletion-acknowledgement-field]");
  const workspaceDeletionDialogStatus = document.querySelector("[data-workspace-deletion-dialog-status]");
  const closeWorkspaceDeletionButton = document.querySelector("[data-close-workspace-deletion]");
  const confirmWorkspaceDeletionButton = document.querySelector("[data-confirm-workspace-deletion]");
  const JOB_FAILURE_PAGE_SIZE = 5;
  let activeWorkspaceId = "";
  let jobObservabilityFailureItems = [];
  let jobObservabilityNextCursor = "";
  let settingsCatalog = null;
  let workspaceDeletionState = null;
  let workspaceDeletionDialogMode = "request";
  const settingsPageController = requireSettingsPageController().create({
    root: document.querySelector("[data-settings-host='workspace']"),
    onSave: saveSettings,
  });

  loadSettingsForm();
  loadRuntimeDiagnostics();
  loadJobObservability();
  loadLatestWorkspaceBackup();
  loadWorkspaceDeletion();

  openWorkspaceUsersButton?.addEventListener("click", openWorkspaceUsersDialog);
  closeWorkspaceUsersButton?.addEventListener("click", () => workspaceUsersDialog?.close());
  jobObservabilityMoreButton?.addEventListener("click", () => {
    if (jobObservabilityNextCursor) {
      loadJobObservability({ append: true, cursor: jobObservabilityNextCursor });
    }
  });
  createWorkspaceBackupButton?.addEventListener("click", createWorkspaceBackup);
  openWorkspaceDeletionButton?.addEventListener("click", () => openWorkspaceDeletionDialog("request"));
  openWorkspaceDeletionCancelButton?.addEventListener("click", () => openWorkspaceDeletionDialog("cancel"));
  closeWorkspaceDeletionButton?.addEventListener("click", () => workspaceDeletionDialog?.close());
  confirmWorkspaceDeletionButton?.addEventListener("click", confirmWorkspaceDeletion);

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings();
  });

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
      throw new Error("Workspace settings requires LongtailForge.errors.");
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
      throw new Error("Workspace settings requires LongtailForge.api.");
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
      throw new Error("Workspace settings requires LongtailForge.settingsHost.");
    }
    return host;
  }

  /** @returns {BrowserSettingsPageController} */
  function requireSettingsPageController() {
    const controller = window.LongtailForge?.settingsPageController;
    if (!controller) {
      throw new Error("Workspace settings requires LongtailForge.settingsPageController.");
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
      throw new Error("Workspace settings requires LongtailForge.status.");
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

  async function loadSettingsForm() {
    setWorkspaceSettingsStatus("Loading workspace settings...");

    try {
      const [settingsResponse, catalog] = await Promise.all([
        requireApi().getJson("/api/settings", { cache: "no-store" }),
        requireApi().getJson("/api/settings/catalog", { cache: "no-store" }),
      ]);
      const settings = normalizeSettings(settingsResponse);
      settingsCatalog = catalog;
      activeWorkspaceId = settings.workspaceId || settings.workspace_id || "";
      workspaceNameInput.value = settings.workspaceName;
      setWorkspaceTypeValue(settings.workspaceType);
      renderModuleSettings(settingsCatalog);
      auditLoggingEnabledInput.checked = settings.audit.loggingEnabled;
      auditRetentionDaysSelect.value = String(settings.audit.retentionDays);
      setWorkspaceSettingsStatus("");
      settingsPageController.setClean();
    } catch (error) {
      handleApiError(error, "Workspace settings could not be loaded.");
      console.error(error);
    }
  }

  async function loadRuntimeDiagnostics() {
    if (!runtimeDiagnosticsSummary) {
      return false;
    }

    renderRuntimeDiagnosticsLoading();

    try {
      const result = await requireApi().getJson("/api/runtime-diagnostics", { cache: "no-store" });
      renderRuntimeDiagnostics(result.diagnostics || {});
    } catch (error) {
      renderRuntimeDiagnosticsError(error);
    }
  }

  async function loadLatestWorkspaceBackup() {
    if (!workspaceBackupSummary) return;
    renderWorkspaceBackupSummary(null, "Loading latest backup...");
    try {
      const result = await requireApi().getJson("/api/settings/workspace-backups/latest", { cache: "no-store" });
      renderWorkspaceBackupSummary(result.backup || null);
    } catch (error) {
      renderWorkspaceBackupError(error);
    }
  }

  async function createWorkspaceBackup() {
    if (!createWorkspaceBackupButton) return;
    createWorkspaceBackupButton.disabled = true;
    renderWorkspaceBackupMessage("Creating and validating a protected workspace package...");
    try {
      const result = await requireApi().postJson("/api/settings/workspace-backups", {});
      renderWorkspaceBackupSummary(result.backup || null);
      renderWorkspaceBackupMessage("Workspace backup created and checksum-verified.", "success");
    } catch (error) {
      renderWorkspaceBackupError(error);
    } finally {
      createWorkspaceBackupButton.disabled = false;
    }
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceDeletionState} BrowserWorkspaceDeletionState */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceDeletionBackup} BrowserWorkspaceDeletionBackup */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceDeletionLifecycle} BrowserWorkspaceDeletionLifecycle */

  /** The two words migration 077's column CHECK admits. */
  const DELETION_STATUSES = Object.freeze(["pending_deletion", "purging"]);

  /** The two decisions the producer chooses between from one recency test. */
  const DELETION_REQUIREMENTS = Object.freeze(["recent_backup", "typed_acknowledgement_required"]);

  /** The two backup members the producer answers as text or `null`. */
  const DELETION_BACKUP_NULLABLE_TEXT = Object.freeze(["createdAt", "createdByName"]);

  /** The three text members every lifecycle summary carries beside its two booleans. */
  const DELETION_LIFECYCLE_TEXT = Object.freeze(["purgeAfter", "requestedAt", "requestedByName"]);

  /** The two booleans the lifecycle summary reports. */
  const DELETION_LIFECYCLE_BOOLEANS = Object.freeze(["backupProtected", "noCurrentBackupAcknowledged"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isDeletionRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * @param {unknown} value @param {readonly string[]} vocabulary
   * @returns {boolean}
   */
  function isDeletionWord(value, vocabulary) {
    return typeof value === "string" && vocabulary.includes(value);
  }

  /**
   * What the latest backup means for a deletion request.
   * @param {unknown} value
   * @returns {value is BrowserWorkspaceDeletionBackup}
   */
  function isDeletionBackup(value) {
    return isDeletionRecord(value)
      && typeof value.current === "boolean"
      && isDeletionWord(value.requirement, DELETION_REQUIREMENTS)
      && typeof value.windowHours === "number"
      && Number.isFinite(value.windowHours)
      && DELETION_BACKUP_NULLABLE_TEXT.every((member) => value[member] === null || typeof value[member] === "string");
  }

  /**
   * A pending deletion, checked member for member.
   * @param {unknown} value
   * @returns {value is BrowserWorkspaceDeletionLifecycle}
   */
  function isDeletionLifecycle(value) {
    return isDeletionRecord(value)
      && DELETION_LIFECYCLE_TEXT.every((member) => typeof value[member] === "string")
      && DELETION_LIFECYCLE_BOOLEANS.every((member) => typeof value[member] === "boolean")
      && isDeletionWord(value.status, DELETION_STATUSES);
  }

  /**
   * The deletion state all three routes answer, or `null` when it cannot be vouched for.
   *
   * **Three members the producer derives from one value are required to agree.** `backup.current`,
   * `backup.requirement` and `acknowledgementPhrase` all come from the same recency test, and
   * `pending` is `Boolean(lifecycle)` from the same value the lifecycle member is built from - so
   * a body where they contradict each other did not come from this producer, and is refused
   * rather than half-believed.
   * @param {unknown} body
   * @returns {BrowserWorkspaceDeletionState | null}
   */
  function readWorkspaceDeletionState(body) {
    const deletion = isDeletionRecord(body) ? body.deletion : null;
    if (!isDeletionRecord(deletion)) {
      return null;
    }
    const { acknowledgementPhrase, backup, lifecycle, pending, workspaceName } = deletion;
    if (!isDeletionBackup(backup)
      || typeof pending !== "boolean"
      || typeof workspaceName !== "string"
      || (acknowledgementPhrase !== null && typeof acknowledgementPhrase !== "string")
      || (lifecycle !== null && !isDeletionLifecycle(lifecycle))) {
      return null;
    }
    if (pending !== (lifecycle !== null)
      || backup.current !== (acknowledgementPhrase === null)
      || backup.current !== (backup.requirement === "recent_backup")) {
      return null;
    }
    return { acknowledgementPhrase, backup, lifecycle, pending, workspaceName };
  }

  async function loadWorkspaceDeletion() {
    if (!workspaceDeletionSummary) return;
    renderWorkspaceDeletionSummary(null, "Loading deletion state...");
    try {
      const deletion = readWorkspaceDeletionState(
        await requireApi().getJson("/api/settings/workspace-deletion", { cache: "no-store" }),
      );
      // Fail closed: a body this page cannot vouch for must not be rendered as "not pending",
      // which is what the raw read's `|| null` fallback did. The catch below hides both
      // destructive controls and says the state could not be loaded, which is the truthful outcome.
      if (!deletion) {
        throw new Error("Workspace deletion state could not be read.");
      }
      renderWorkspaceDeletionSummary(deletion);
    } catch (error) {
      openWorkspaceDeletionButton.hidden = true;
      openWorkspaceDeletionCancelButton.hidden = true;
      renderWorkspaceDeletionMessage(error?.status === 403
        ? "Workspace deletion requires a Workspace Administrator or Super Admin."
        : error?.message || "Workspace deletion state could not be loaded.", "error");
    }
  }

  function renderWorkspaceDeletionSummary(deletion, placeholder = "This workspace is not pending deletion.") {
    if (!workspaceDeletionSummary) return;
    workspaceDeletionState = deletion;
    workspaceDeletionSummary.replaceChildren();
    const lifecycle = deletion?.lifecycle;
    if (!lifecycle) {
      workspaceDeletionSummary.appendChild(createRuntimeDiagnosticItem("Status", placeholder));
      openWorkspaceDeletionButton.hidden = false;
      openWorkspaceDeletionCancelButton.hidden = true;
      renderWorkspaceDeletionMessage(deletion?.backup?.current
        ? `A workspace backup from the last ${deletion.backup.windowHours} hours is available.`
        : "No current workspace backup is available. Scheduling deletion requires the displayed typed acknowledgement.");
      return;
    }
    workspaceDeletionSummary.append(
      createRuntimeDiagnosticItem("Status", "Pending deletion"),
      createRuntimeDiagnosticItem("Requested", formatRuntimeDate(lifecycle.requestedAt)),
      createRuntimeDiagnosticItem("Requested By", lifecycle.requestedByName || "Workspace administrator"),
      createRuntimeDiagnosticItem("Grace Period Ends", formatRuntimeDate(lifecycle.purgeAfter)),
      createRuntimeDiagnosticItem("Backup Protection", lifecycle.backupProtected ? "Current backup recorded" : "No current backup acknowledged"),
    );
    openWorkspaceDeletionButton.hidden = true;
    openWorkspaceDeletionCancelButton.hidden = false;
    renderWorkspaceDeletionMessage("The workspace remains fully operational during the grace period. Cancel before the displayed time to restore its normal lifecycle state.", "warning");
  }

  function openWorkspaceDeletionDialog(mode) {
    if (!workspaceDeletionDialog || !workspaceDeletionState) return;
    workspaceDeletionDialogMode = mode;
    const canceling = mode === "cancel";
    workspaceDeletionDialog.querySelector(".view-modal-title").textContent = canceling ? "Cancel Workspace Deletion" : "Delete Workspace";
    workspaceDeletionDialogExplanation.textContent = canceling
      ? `Cancel the pending deletion of ${workspaceDeletionState.workspaceName}. Its data and access remain unchanged.`
      : `Schedule ${workspaceDeletionState.workspaceName} for deletion after a 30-day grace period. Sessions, memberships, navigation, modules, jobs, Files, Search, and notifications remain operational during the grace period.`;
    workspaceDeletionNameInput.closest(".view-renderer-field")?.toggleAttribute("hidden", canceling);
    workspaceDeletionNameInput.required = !canceling;
    workspaceDeletionAcknowledgementField.hidden = canceling || workspaceDeletionState.backup?.current;
    workspaceDeletionAcknowledgementInput.required = !canceling && !workspaceDeletionState.backup?.current;
    workspaceDeletionAcknowledgementInput.placeholder = workspaceDeletionState.acknowledgementPhrase || "";
    workspaceDeletionNameInput.value = "";
    workspaceDeletionAcknowledgementInput.value = "";
    workspaceDeletionDialogStatus.textContent = "";
    confirmWorkspaceDeletionButton.textContent = canceling ? "Cancel Deletion" : "Schedule Deletion";
    confirmWorkspaceDeletionButton.classList.toggle("danger-button", !canceling);
    workspaceDeletionDialog.showModal();
  }

  async function confirmWorkspaceDeletion() {
    if (!workspaceDeletionState || !confirmWorkspaceDeletionButton) return;
    confirmWorkspaceDeletionButton.disabled = true;
    workspaceDeletionDialogStatus.textContent = workspaceDeletionDialogMode === "cancel"
      ? "Canceling workspace deletion..."
      : "Scheduling workspace deletion...";
    try {
      const deletion = readWorkspaceDeletionState(workspaceDeletionDialogMode === "cancel"
        ? await requireApi().postJson("/api/settings/workspace-deletion/cancel", {})
        : await requireApi().postJson("/api/settings/workspace-deletion/request", {
          acknowledgement: workspaceDeletionAcknowledgementInput.value,
          workspaceName: workspaceDeletionNameInput.value,
        }));
      // Read before closing: an unvouchable body must not close the dialog on a fabricated
      // lifecycle state, in either direction. The mutation itself already happened on the
      // server, so the dialog reports that the state could not be read and a reload shows it.
      if (!deletion) {
        throw new Error("Workspace deletion state could not be read.");
      }
      workspaceDeletionDialog.close();
      renderWorkspaceDeletionSummary(deletion);
      await window.LongtailForge.refreshAppShell?.();
    } catch (error) {
      workspaceDeletionDialogStatus.textContent = error?.message || "Workspace deletion state could not be changed.";
    } finally {
      confirmWorkspaceDeletionButton.disabled = false;
    }
  }

  function renderWorkspaceDeletionMessage(message, type = "info") {
    if (!workspaceDeletionStatus) return;
    workspaceDeletionStatus.replaceChildren();
    if (!message) return;
    const note = document.createElement("p");
    note.className = type === "error" || type === "warning" ? "runtime-diagnostics-warning" : "runtime-diagnostics-note";
    note.textContent = message;
    workspaceDeletionStatus.appendChild(note);
  }

  function renderWorkspaceBackupSummary(backup, placeholder = "No workspace backup has been created yet.") {
    if (!workspaceBackupSummary) return;
    workspaceBackupSummary.replaceChildren();
    if (!backup) {
      workspaceBackupSummary.appendChild(createRuntimeDiagnosticItem("Latest Backup", placeholder));
      renderWorkspaceBackupMessage("");
      return;
    }
    workspaceBackupSummary.append(
      createRuntimeDiagnosticItem("Package", backup.packageLabel || "Workspace backup"),
      createRuntimeDiagnosticItem("Created", formatRuntimeDate(backup.createdAt)),
      createRuntimeDiagnosticItem("Created By", backup.createdByName || "Workspace administrator"),
      createRuntimeDiagnosticItem("Files", `${formatRuntimeNumber(backup.fileObjectCount)} objects (${formatByteCount(backup.fileObjectBytes)})`),
      createRuntimeDiagnosticItem("SHA-256", String(backup.archiveSha256 || "Unavailable")),
    );
    renderWorkspaceBackupMessage(backup.secureNotesRecoveryRequired
      ? "Secure Notes are encrypted in the package. The master key is not included; keep the separately protected installation key backup for recovery."
      : "The package contains no Secure Notes key material.");
  }

  function renderWorkspaceBackupError(error) {
    const message = error?.status === 403
      ? "Workspace backup requires a Workspace Administrator or Super Admin."
      : error?.message || "Workspace backup could not be created.";
    renderWorkspaceBackupMessage(message, "error");
  }

  function renderWorkspaceBackupMessage(message, type = "info") {
    if (!workspaceBackupStatus) return;
    workspaceBackupStatus.replaceChildren();
    if (!message) return;
    const note = document.createElement("p");
    note.className = type === "error" ? "runtime-diagnostics-warning" : "runtime-diagnostics-note";
    note.textContent = message;
    workspaceBackupStatus.appendChild(note);
  }

  function formatByteCount(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  async function saveSettings() {
    if (!window.LongtailForge.settingsRenderer.validate(settingsForm)) {
      setWorkspaceSettingsStatus("Review the highlighted module settings.");
      return false;
    }
    // Normalize before saving so the server receives the same shape the UI expects back.
    const settings = normalizeSettings({
      workspaceName: workspaceNameInput.value,
      workspaceType: workspaceTypeSelect?.value,
      moduleSettings: readModuleSettingsPayload(),
      audit: {
        loggingEnabled: auditLoggingEnabledInput.checked,
        retentionDays: auditRetentionDaysSelect.value,
      },
    });
    settings.moduleSettings = readModuleSettingsPayload();

    if (!settings.workspaceName) {
      setWorkspaceSettingsStatus("Workspace name is required.");
      return;
    }

    setWorkspaceSettingsStatus("Saving workspace settings...");

    try {
      const result = await requireApi().putJson("/api/settings", settings);
      const savedSettings = normalizeSettings(result.data);
      settingsCatalog = await requireApi().getJson("/api/settings/catalog", { cache: "no-store" });
      workspaceNameInput.value = savedSettings.workspaceName;
      setWorkspaceTypeValue(savedSettings.workspaceType);
      renderModuleSettings(settingsCatalog);
      auditLoggingEnabledInput.checked = savedSettings.audit.loggingEnabled;
      auditRetentionDaysSelect.value = String(savedSettings.audit.retentionDays);

      // Bound locally rather than read twice: the surface moved from a bare
      // `window.*` global to a namespace member, and `window.LongtailForge.x`
      // throws when the namespace is absent where the old bare read did not.
      const applyWorkspaceName = window.LongtailForge?.applyWorkspaceName;
      if (typeof applyWorkspaceName === "function") {
        applyWorkspaceName(savedSettings.workspaceName);
      }

      await window.LongtailForge.refreshAppShell?.();

      flashSavedState();
      return true;
    } catch (error) {
      window.LongtailForge.settingsRenderer.showValidationErrors(settingsForm, error);
      handleApiError(error, "Workspace settings were not saved. Start the local server and try again.");
      console.error(error);
      return false;
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
      enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
      moduleSettings: normalizeModuleSettings(settings?.moduleSettings, settings),
      modules: Array.isArray(settings?.modules) ? settings.modules : [],
      audit: normalizeAuditSettings(settings?.audit),
    };
  }

  /**
   * An attachment section carries whatever `GET /api/settings/catalog` delivered, so the two
   * fields this page sorts on are read through a check rather than assumed.
   * @param {unknown} section
   * @returns {section is { moduleId?: unknown, lifecycle?: unknown }}
   */
  function isAttachmentSection(section) {
    return typeof section === "object" && section !== null;
  }

  function renderModuleSettings(catalog) {
    const sections = requireSettingsHost().attachmentSections(catalog, "workspace")
      .filter(isAttachmentSection);
    const clientProjects = sections.filter((section) => section.moduleId === "client-projects");
    const optionalModules = sections
      .filter((section) => section.moduleId !== "client-projects" && section.lifecycle === true)
      .sort(compareOptionalModules);
    const otherWorkspaceSettings = sections.filter((section) => (
      section.moduleId !== "client-projects" && section.lifecycle !== true
    ));

    window.LongtailForge.settingsRenderer.renderSections(
      workspaceCoreSettingsContainer || moduleSettingsContainer,
      [...clientProjects, ...otherWorkspaceSettings],
      { hideEmpty: true },
    );
    window.LongtailForge.settingsRenderer.renderGroupedSections(
      workspaceModuleSettingsContainer || moduleSettingsContainer,
      optionalModules,
      { groupTitle: "Modules", hideEmpty: true },
    );
  }

  function compareOptionalModules(left, right) {
    const leftLast = left.moduleId === "developer-example" ? 1 : 0;
    const rightLast = right.moduleId === "developer-example" ? 1 : 0;
    return leftLast - rightLast ||
      String(left.displayName || left.name || left.moduleId).localeCompare(String(right.displayName || right.name || right.moduleId)) ||
      left.moduleId.localeCompare(right.moduleId);
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
    const worker = diagnostics.worker || {};
    const workerStatus = worker.status || {};

    runtimeDiagnosticsSummary.replaceChildren(
      createRuntimeDiagnosticItem("Database Provider", formatRuntimeValue(database.provider)),
      createRuntimeDiagnosticItem("SQLite Journal", formatRuntimeValue(sqlite.journalMode)),
      createRuntimeDiagnosticItem("Foreign Keys", sqlite.foreignKeysEnabled ? "Enabled" : "Disabled"),
      createRuntimeDiagnosticItem("Database File", formatRuntimeLocation(database.fileLocation)),
      createRuntimeDiagnosticItem("Data Directory", formatRuntimeLocation(data.directoryLocation)),
      createRuntimeDiagnosticItem("Storage Provider", formatStorageProvider(storage)),
      createRuntimeDiagnosticItem("Storage Status", formatStorageStatus(storage.health)),
      createRuntimeDiagnosticItem("Local Storage Root", formatRuntimeLocation(storage.rootLocation)),
      createRuntimeDiagnosticItem("Scanner Mode", formatRuntimeValue(scanner.mode)),
      createRuntimeDiagnosticItem("Scanner Status", formatScannerStatus(scanner.health)),
      createRuntimeDiagnosticItem("Worker Mode", formatRuntimeValue(worker.mode)),
      createRuntimeDiagnosticItem("Worker State", formatRuntimeValue(workerStatus.state)),
      createRuntimeDiagnosticItem("Worker Timer", workerStatus.timerActive ? "Active" : "Inactive"),
      createRuntimeDiagnosticItem("Worker Last Poll", formatRuntimeDate(workerStatus.lastPollAt)),
      createRuntimeDiagnosticItem("Worker Last Run", formatRuntimeDate(workerStatus.lastRunAt)),
      createRuntimeDiagnosticItem("Worker Last Success", formatRuntimeDate(workerStatus.lastSuccessAt)),
      createRuntimeDiagnosticItem("Worker Completed", formatRuntimeNumber(workerStatus.completedCount)),
      createRuntimeDiagnosticItem("Worker Failed", formatRuntimeNumber(workerStatus.failedCount)),
      createRuntimeDiagnosticItem("Worker Dead-letter", formatRuntimeNumber(workerStatus.deadCount)),
      createRuntimeDiagnosticItem("Registered Job Types", formatRuntimeList(workerStatus.registeredJobTypes)),
    );
    renderRuntimeDiagnosticWarnings(readRuntimeDiagnosticWarnings(diagnostics));
  }

  async function loadJobObservability(options = {}) {
    if (!jobObservabilitySummary || !jobObservabilityFailures) {
      return;
    }

    if (!options.append) {
      renderJobObservabilityLoading();
    }

    if (jobObservabilityMoreButton) {
      jobObservabilityMoreButton.disabled = true;
    }

    try {
      const params = new URLSearchParams({
        limit: String(JOB_FAILURE_PAGE_SIZE),
      });

      if (options.cursor) {
        params.set("cursor", options.cursor);
      }

      const result = await requireApi().getJson(`/api/jobs/status?${params.toString()}`, { cache: "no-store" });
      renderJobObservability(result.jobs || {}, { append: Boolean(options.append) });
    } catch (error) {
      renderJobObservabilityError(error);
    }
  }

  function renderJobObservabilityLoading() {
    jobObservabilityFailureItems = [];
    jobObservabilityNextCursor = "";
    jobObservabilitySummary.replaceChildren(createRuntimeDiagnosticItem("Jobs", "Loading..."));
    jobObservabilityFailures.replaceChildren();
    updateJobObservabilityMoreButton(false);
  }

  function renderJobObservabilityError(error) {
    jobObservabilitySummary.replaceChildren(createRuntimeDiagnosticItem("Jobs", "Unavailable"));

    const message = error?.status === 403
      ? "Job observability requires workspace settings access."
      : error?.message || "Job observability could not be loaded.";
    const note = document.createElement("p");
    note.className = "job-observability-note";
    note.textContent = message;
    jobObservabilityFailures.replaceChildren(note);
    updateJobObservabilityMoreButton(false);
  }

  function renderJobObservability(jobs, options = {}) {
    const counts = jobs.counts || {};
    const recentFailures = jobs.recentFailures || {};
    const pagination = recentFailures.pagination || {};
    const incomingItems = Array.isArray(recentFailures.items) ? recentFailures.items : [];

    jobObservabilityFailureItems = options.append
      ? [...jobObservabilityFailureItems, ...incomingItems]
      : incomingItems;
    jobObservabilityNextCursor = String(pagination.nextCursor || "").trim();

    jobObservabilitySummary.replaceChildren(
      createRuntimeDiagnosticItem("Pending", formatRuntimeNumber(counts.pending)),
      createRuntimeDiagnosticItem("Running", formatRuntimeNumber(counts.running)),
      createRuntimeDiagnosticItem("Failed", formatRuntimeNumber(counts.failed)),
      createRuntimeDiagnosticItem("Dead-letter", formatRuntimeNumber(counts.dead)),
      createRuntimeDiagnosticItem("Failures Shown", `${jobObservabilityFailureItems.length} of ${formatRuntimeNumber(pagination.total)}`),
    );

    renderJobFailureItems(jobObservabilityFailureItems);
    updateJobObservabilityMoreButton(Boolean(pagination.hasMore && jobObservabilityNextCursor));
  }

  function renderJobFailureItems(items) {
    jobObservabilityFailures.replaceChildren();

    if (items.length === 0) {
      const note = document.createElement("p");
      note.className = "job-observability-note";
      note.textContent = "No recent failed or dead-letter jobs.";
      jobObservabilityFailures.appendChild(note);
      return;
    }

    const list = document.createElement("div");
    list.className = "job-observability-list";

    for (const item of items) {
      list.appendChild(createJobFailureRow(item));
    }

    jobObservabilityFailures.appendChild(list);
  }

  function createJobFailureRow(item) {
    const row = document.createElement("article");
    const header = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");
    const meta = document.createElement("div");
    const attempts = document.createElement("span");
    const updated = document.createElement("span");
    const message = document.createElement("p");

    row.className = "job-observability-row";
    header.className = "job-observability-row-header";
    title.textContent = formatRuntimeValue(item.jobType);
    status.textContent = formatJobStatus(item.status);
    meta.className = "job-observability-row-meta";
    attempts.textContent = `Attempts ${formatRuntimeNumber(item.attemptCount)}/${formatRuntimeNumber(item.maxAttempts)}`;
    updated.textContent = `Updated ${formatRuntimeDate(item.updatedAt)}`;
    message.className = "job-observability-message";
    message.textContent = String(item.lastError || "").trim() || "No failure summary.";

    header.append(title, status);
    meta.append(attempts, updated);
    row.append(header, meta, message);
    return row;
  }

  function updateJobObservabilityMoreButton(show) {
    if (!jobObservabilityMoreButton) {
      return;
    }

    jobObservabilityMoreButton.hidden = !show;
    jobObservabilityMoreButton.disabled = !show;
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

    if (storage.health?.status === "unavailable") {
      warnings.push("Storage provider health is unavailable.");
    }

    if (scanner.health?.warning) {
      warnings.push(String(scanner.health.warning));
    } else if (scanner.health?.status === "unavailable") {
      warnings.push("Scanner health is unavailable.");
    }

    if (worker.mode === "disabled") {
      warnings.push("Worker mode is disabled; background jobs will not run.");
    } else if (worker.mode && !["inline", "separate"].includes(worker.mode)) {
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

  function formatStorageProvider(storage = {}) {
    const provider = formatRuntimeValue(storage.provider);
    const status = formatStorageStatus(storage.health);

    return status === "Unavailable" ? provider : `${provider} (${status})`;
  }

  function formatStorageStatus(health = {}) {
    const status = String(health.status || "").trim().toLowerCase();

    if (status === "ok" || health.available === true) {
      return "Available";
    }

    if (status === "unavailable" || health.available === false) {
      return "Unavailable";
    }

    return formatRuntimeValue(status);
  }

  function formatScannerStatus(health = {}) {
    const status = String(health.status || "").trim().toLowerCase();

    if (status === "disabled") {
      return "Disabled";
    }

    if (status === "pass_through") {
      return "Pass-through";
    }

    if (status === "ok" || health.available === true) {
      return "Available";
    }

    if (status === "unavailable" || health.available === false) {
      return "Unavailable";
    }

    return formatRuntimeValue(status);
  }

  function formatRuntimeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? String(number) : "0";
  }

  function formatRuntimeDate(value) {
    const text = String(value || "").trim();

    if (!text) {
      return "Never";
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return "Unavailable";
    }

    return date.toLocaleString([], {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatRuntimeList(values) {
    const items = Array.isArray(values)
      ? values.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    return items.length > 0 ? items.join(", ") : "None";
  }

  function formatJobStatus(value) {
    const normalized = String(value || "").trim();

    return normalized === "dead" ? "Dead-letter" : formatRuntimeValue(normalized);
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
      .split(/[._\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function normalizeModuleSettings(moduleSettings, settings) {
    return window.LongtailForge.settingsRenderer.normalizeContributions(moduleSettings, {
      modules: settings?.modules,
    });
  }

  function readModuleSettingsPayload() {
    return window.LongtailForge.settingsRenderer.collectPayload(settingsForm);
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

  function normalizeAuditSettings(audit) {
    const retentionOptions = [7, 14, 30, 60, 90, 180, 365];
    const retentionDays = Number.parseInt(audit?.retentionDays, 10);

    return {
      loggingEnabled: audit?.loggingEnabled === false ? false : true,
      retentionDays: retentionOptions.includes(retentionDays) ? retentionDays : 30,
    };
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
      const result = await requireApi().getJson("/api/users", { cache: "no-store" });
      renderWorkspaceUsers(result.users || []);
    } catch (error) {
      workspaceUsersList.replaceChildren(createWorkspaceUsersPlaceholder(requireErrors().caughtMessage(error, "Workspace users could not be loaded.")));
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

  function flashSavedState() {
    requireStatusMessage().set(workspaceSettingsStatus, "Workspace settings saved.", {
      type: "success",
      clearAfter: 1600,
    });
  }

  function setWorkspaceSettingsStatus(message) {
    requireStatusMessage().set(workspaceSettingsStatus, message);
  }

  function handleApiError(error, fallbackMessage) {
    if (error?.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    requireStatusMessage().set(workspaceSettingsStatus, error?.message || fallbackMessage, { type: "error" });
  }
})();
