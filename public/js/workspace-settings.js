// Workspace settings are framework identity, audit, operations, and contributed module defaults.
const settingsForm = document.querySelector("[data-workspace-settings-form]");
const workspaceNameInput = document.querySelector("[data-workspace-name-input]");
const workspaceTypeSelect = document.querySelector("[data-workspace-type-input]");
const moduleSettingsContainer = document.querySelector('[data-settings-attachment="workspace"]');
const auditLoggingEnabledInput = document.querySelector("[data-audit-logging-enabled]");
const auditRetentionDaysSelect = document.querySelector("[data-audit-retention-days]");
const openWorkspaceUsersButton = document.querySelector("[data-open-workspace-users]");
const workspaceUsersDialog = document.querySelector("[data-workspace-users-dialog]");
const workspaceUsersList = document.querySelector("[data-workspace-users-list]");
const closeWorkspaceUsersButton = document.querySelector("[data-close-workspace-users]");
const workspaceSettingsStatus = document.querySelector("[data-workspace-settings-status]");
const saveSettingsButton = document.querySelector("[data-save-settings]");
const runtimeDiagnosticsSummary = document.querySelector("[data-runtime-diagnostics-summary]");
const runtimeDiagnosticsWarnings = document.querySelector("[data-runtime-diagnostics-warnings]");
const jobObservabilitySummary = document.querySelector("[data-job-observability-summary]");
const jobObservabilityFailures = document.querySelector("[data-job-observability-failures]");
const jobObservabilityMoreButton = document.querySelector("[data-job-observability-more]");
const JOB_FAILURE_PAGE_SIZE = 5;
let activeWorkspaceId = "";
let jobObservabilityFailureItems = [];
let jobObservabilityNextCursor = "";
let settingsCatalog = null;

loadSettingsForm();
loadRuntimeDiagnostics();
loadJobObservability();

openWorkspaceUsersButton?.addEventListener("click", openWorkspaceUsersDialog);
closeWorkspaceUsersButton?.addEventListener("click", () => workspaceUsersDialog?.close());
jobObservabilityMoreButton?.addEventListener("click", () => {
  if (jobObservabilityNextCursor) {
    loadJobObservability({ append: true, cursor: jobObservabilityNextCursor });
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

async function loadSettingsForm() {
  setWorkspaceSettingsStatus("Loading workspace settings...");

  try {
    const [settingsResponse, catalog] = await Promise.all([
      window.LongtailForge.api.getJson("/api/settings", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" }),
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
  } catch (error) {
    handleApiError(error, "Workspace settings could not be loaded.");
    console.error(error);
  }
}

async function loadRuntimeDiagnostics() {
  if (!runtimeDiagnosticsSummary) {
    return;
  }

  renderRuntimeDiagnosticsLoading();

  try {
    const result = await window.LongtailForge.api.getJson("/api/runtime-diagnostics", { cache: "no-store" });
    renderRuntimeDiagnostics(result.diagnostics || {});
  } catch (error) {
    renderRuntimeDiagnosticsError(error);
  }
}

async function saveSettings() {
  if (!window.LongtailForge.settingsRenderer.validate(settingsForm)) {
    setWorkspaceSettingsStatus("Review the highlighted module settings.");
    return;
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

  saveSettingsButton.disabled = true;
  setWorkspaceSettingsStatus("Saving workspace settings...");

  try {
    const result = await window.LongtailForge.api.putJson("/api/settings", settings);
    const savedSettings = normalizeSettings(result.data);
    settingsCatalog = await window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" });
    workspaceNameInput.value = savedSettings.workspaceName;
    setWorkspaceTypeValue(savedSettings.workspaceType);
    renderModuleSettings(settingsCatalog);
    auditLoggingEnabledInput.checked = savedSettings.audit.loggingEnabled;
    auditRetentionDaysSelect.value = String(savedSettings.audit.retentionDays);

    if (typeof window.applyWorkspaceName === "function") {
      window.applyWorkspaceName(savedSettings.workspaceName);
    }

    flashSavedState();
  } catch (error) {
    window.LongtailForge.settingsRenderer.showValidationErrors(settingsForm, error);
    handleApiError(error, "Workspace settings were not saved. Start the local server and try again.");
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
    enabledModules: Array.isArray(settings?.enabledModules) ? settings.enabledModules : [],
    moduleSettings: normalizeModuleSettings(settings?.moduleSettings, settings),
    modules: Array.isArray(settings?.modules) ? settings.modules : [],
    audit: normalizeAuditSettings(settings?.audit),
  };
}

function renderModuleSettings(catalog) {
  window.LongtailForge.settingsRenderer.renderSections(
    moduleSettingsContainer,
    window.LongtailForge.settingsHost.attachmentSections(catalog, "workspace"),
    { emptyText: "No configurable modules are available for this workspace." },
  );
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

    const result = await window.LongtailForge.api.getJson(`/api/jobs/status?${params.toString()}`, { cache: "no-store" });
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
  window.LongtailForge.status.set(workspaceSettingsStatus, message);
}

function handleApiError(error, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  window.LongtailForge.status.set(workspaceSettingsStatus, error?.message || fallbackMessage, { type: "error" });
}
