(function attachUserSettingsPage() {
// User settings owns per-user preferences and password changes for the signed-in account.
const THEME_STORAGE_KEY = "lf_theme";
const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const OPEN_EXTERNAL_LINKS_STORAGE_KEY = "lf_open_external_links_new_tab";
const themeForm = document.querySelector("[data-user-theme-form]");
const themeModeInputs = [...document.querySelectorAll("[data-theme-mode-option]")];
const themeAutoSourceControls = document.querySelector("[data-theme-auto-source-controls]");
const themeAutoSourceInputs = [...document.querySelectorAll("[data-theme-auto-source]")];
const markdownRenderingForm = document.querySelector("[data-user-markdown-rendering-form]");
const openExternalLinksNewTabToggle = document.querySelector("[data-open-external-links-new-tab]");
const preferredLoginLandingSelect = document.querySelector("[data-preferred-login-landing]");
const preferredWorkspaceSwitchLandingSelect = document.querySelector("[data-preferred-workspace-switch-landing]");
const preferredCalendarViewSelect = document.querySelector("[data-preferred-calendar-view]");
const passwordForm = document.querySelector("[data-user-password-form]");
const currentPasswordInput = document.querySelector("[data-current-password]");
const newPasswordInput = document.querySelector("[data-new-password]");
const confirmPasswordInput = document.querySelector("[data-confirm-password]");
const savePasswordButton = document.querySelector("[data-save-password]");
const profileForm = document.querySelector("[data-user-profile-form]");
const profileUsernameInput = document.querySelector("[data-profile-username]");
const profileDisplayNameInput = document.querySelector("[data-profile-display-name]");
const profileAltEmailInput = document.querySelector("[data-profile-alt-email]");
const profileTimezoneSelect = document.querySelector("[data-profile-timezone]");
const notificationPreferencesForm = document.querySelector("[data-user-notification-preferences-form]");
const notificationGroupingPreferences = document.querySelector("[data-user-notification-grouping-preferences]");
const notificationPreferenceList = document.querySelector("[data-user-notification-preference-list]");
const workspaceCreateForm = document.querySelector("[data-workspace-create-form]");
const newWorkspaceTypeSelect = document.querySelector("[data-new-workspace-type]");
const newWorkspaceNameInput = document.querySelector("[data-new-workspace-name]");
const newWorkspaceModuleSettingsContainer = document.querySelector('[data-settings-attachment="new-workspace"]');
const userSettingsContributionContainer = document.querySelector('[data-settings-attachment="user"]');
const createWorkspaceButton = document.querySelector("[data-create-workspace]");
const openWorkspaceRemovalButton = document.querySelector("[data-open-workspace-removal]");
const deleteAccountButton = document.querySelector("[data-delete-account]");
const workspaceRemovalDialog = document.querySelector("[data-workspace-removal-dialog]");
const workspaceRemovalList = document.querySelector("[data-workspace-removal-list]");
const closeWorkspaceRemovalButton = document.querySelector("[data-close-workspace-removal]");
const calendarSubscriptionForm = document.querySelector("[data-calendar-subscription-form]");
const calendarSubscriptionState = document.querySelector("[data-calendar-subscription-state]");
const calendarSubscriptionDetail = document.querySelector("[data-calendar-subscription-detail]");
const calendarSubscriptionUrlField = document.querySelector("[data-calendar-subscription-url-field]");
const calendarSubscriptionUrlInput = document.querySelector("[data-calendar-subscription-url]");
const calendarSubscriptionStatus = document.querySelector("[data-calendar-subscription-status]");
const enableCalendarSubscriptionButton = document.querySelector("[data-enable-calendar-subscription]");
const revealCalendarSubscriptionButton = document.querySelector("[data-reveal-calendar-subscription]");
const copyCalendarSubscriptionButton = document.querySelector("[data-copy-calendar-subscription]");
const rotateCalendarSubscriptionButton = document.querySelector("[data-rotate-calendar-subscription]");
const disableCalendarSubscriptionButton = document.querySelector("[data-disable-calendar-subscription]");
const userSettingsStatus = document.querySelector("[data-user-settings-status]");
let workspaceCreationTypes = [];
let currentWorkspaces = [];
let activeWorkspaceId = "";
let canEnterAccountExportRecovery = false;
let lastSuggestedWorkspaceName = "";
let workspaceNameEditedByUser = false;
let systemThemeModeQuery = null;
let systemThemeModeListenerAttached = false;
let settingsCatalog = null;
let calendarSubscriptionEnabled = false;
let calendarSubscriptionUrl = "";
const settingsPageController = window.LongtailForge.settingsPageController.create({
  root: document.querySelector("[data-settings-host='user']"),
  onSave: saveAllSettings,
  onRevert: applyPendingPreferencePreview,
});

loadUserSettings();
loadNotificationPreferences();
loadCalendarSubscription();

themeForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-theme-mode-option], [data-theme-auto-source]")) {
    applyPendingPreferencePreview();
  }
});

markdownRenderingForm?.addEventListener("change", (event) => {
  if (event.target.matches("[data-open-external-links-new-tab]")) {
    applyPendingPreferencePreview();
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

notificationPreferencesForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

workspaceCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createWorkspace();
});

newWorkspaceNameInput.addEventListener("input", () => {
  workspaceNameEditedByUser = newWorkspaceNameInput.value.trim() !== lastSuggestedWorkspaceName;
});

newWorkspaceTypeSelect.addEventListener("change", () => {
  updateSuggestedWorkspaceName();
  renderCreateWorkspaceModuleSettings();
});

openWorkspaceRemovalButton?.addEventListener("click", openWorkspaceRemovalDialog);
deleteAccountButton?.addEventListener("click", deleteAccount);
closeWorkspaceRemovalButton?.addEventListener("click", () => workspaceRemovalDialog?.close());
calendarSubscriptionForm?.addEventListener("submit", (event) => event.preventDefault());
enableCalendarSubscriptionButton?.addEventListener("click", enableCalendarSubscription);
revealCalendarSubscriptionButton?.addEventListener("click", toggleCalendarSubscriptionVisibility);
copyCalendarSubscriptionButton?.addEventListener("click", copyCalendarSubscriptionUrl);
rotateCalendarSubscriptionButton?.addEventListener("click", rotateCalendarSubscription);
disableCalendarSubscriptionButton?.addEventListener("click", disableCalendarSubscription);

async function deleteAccount() {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Delete your account?",
    message: "This permanently retires your password, sessions, API keys, roles, and access to every workspace. Your email address, display name, contributions, and attribution are retained in workspace history. This cannot be undone.",
    confirmLabel: "Delete Account",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  deleteAccountButton.disabled = true;
  setUserSettingsStatus("Deleting account...");

  try {
    await window.LongtailForge.api.deleteJson("/api/user/account");
    window.location.replace("/login.html");
  } catch (error) {
    deleteAccountButton.disabled = false;
    handleApiError(error, "Account could not be deleted.");
  }
}

async function loadUserSettings() {
  try {
    const [body, catalog] = await Promise.all([
      window.LongtailForge.api.getJson("/api/user/settings", { cache: "no-store" }),
      window.LongtailForge.api.getJson("/api/settings/catalog", { cache: "no-store" }),
    ]);
    settingsCatalog = catalog;

    applyThemeMode(body.themeMode, body.themeAutoSource);
    applyMarkdownRendering(body);
    applyAppPreferences(body);
    applyProfile(body);
    applyWorkspaceAccess(body);
    applyWorkspaceCreation(body.workspaceCreation);
    renderUserSettingsContributions();
    setUserSettingsStatus("");
    settingsPageController.setClean();
  } catch (error) {
    handleApiError(error, "User settings could not be loaded.");
  }
}

async function loadNotificationPreferences() {
  if (!notificationPreferenceList) {
    return;
  }

  try {
    await window.LongtailForge?.workspaceContextReady;
    const body = await window.LongtailForge.notificationPreferences.loadPreferences();

    window.LongtailForge.notificationPreferences.renderGroupingPreferences(
      notificationGroupingPreferences,
      body.groupingPreferences,
      { workspaceType: window.LongtailForge?.workspaceContext?.workspaceType || "business" },
    );
    window.LongtailForge.notificationPreferences.renderPreferenceGroups(notificationPreferenceList, body.events, {
      canManageWorkspaceDefaults: false,
      emptyText: "No configurable notification types are available.",
      headingLevel: "h3",
      includeWorkspaceDefaults: false,
    });
    settingsPageController.setClean();
  } catch (error) {
    notificationPreferenceList.replaceChildren(createPlaceholder("Notification preferences could not be loaded."));
    handleApiError(error, "Notification preferences could not be loaded.");
  }
}

async function loadCalendarSubscription() {
  if (!calendarSubscriptionForm) {
    return;
  }

  setCalendarSubscriptionStatus("Loading calendar subscription...");
  setCalendarSubscriptionBusy(true);

  try {
    const body = await window.LongtailForge.api.getJson("/api/private-feeds/calendar", { cache: "no-store" });
    applyCalendarSubscriptionStatus(body.status);
    setCalendarSubscriptionStatus("");
  } catch (error) {
    handleCalendarSubscriptionError(error, "Calendar subscription could not be loaded.");
  } finally {
    setCalendarSubscriptionBusy(false);
  }
}

async function enableCalendarSubscription() {
  setCalendarSubscriptionStatus("Enabling calendar subscription...");
  setCalendarSubscriptionBusy(true);

  try {
    const body = await window.LongtailForge.api.postJson("/api/private-feeds/calendar");
    applyCalendarSubscriptionStatus(body.status, body.feedUrl);
    setCalendarSubscriptionStatus("Calendar subscription enabled. Copy the private URL now.", {
      clearAfter: 2400,
      type: "success",
    });
  } catch (error) {
    handleCalendarSubscriptionError(error, "Calendar subscription could not be enabled.");
  } finally {
    setCalendarSubscriptionBusy(false);
  }
}

async function rotateCalendarSubscription() {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Rotate calendar subscription URL?",
    message: "The current private URL will stop working immediately. Calendar apps using it will no longer receive updates until you replace it with the new URL.",
    confirmLabel: "Rotate URL",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setCalendarSubscriptionStatus("Rotating calendar subscription URL...");
  setCalendarSubscriptionBusy(true);

  try {
    const body = await window.LongtailForge.api.postJson("/api/private-feeds/calendar/rotate");
    applyCalendarSubscriptionStatus(body.status, body.feedUrl);
    setCalendarSubscriptionStatus("Calendar subscription URL rotated. Copy the replacement URL now.", {
      clearAfter: 2400,
      type: "success",
    });
  } catch (error) {
    handleCalendarSubscriptionError(error, "Calendar subscription URL could not be rotated.");
  } finally {
    setCalendarSubscriptionBusy(false);
  }
}

async function disableCalendarSubscription() {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Disable calendar subscription?",
    message: "The current private URL will stop working immediately. You can enable a new subscription later.",
    confirmLabel: "Disable Subscription",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setCalendarSubscriptionStatus("Disabling calendar subscription...");
  setCalendarSubscriptionBusy(true);

  try {
    const body = await window.LongtailForge.api.deleteJson("/api/private-feeds/calendar");
    applyCalendarSubscriptionStatus(body.status);
    setCalendarSubscriptionStatus("Calendar subscription disabled.", {
      clearAfter: 2000,
      type: "success",
    });
  } catch (error) {
    handleCalendarSubscriptionError(error, "Calendar subscription could not be disabled.");
  } finally {
    setCalendarSubscriptionBusy(false);
  }
}

function applyCalendarSubscriptionStatus(status, feedUrl = "") {
  calendarSubscriptionEnabled = status?.enabled === true;
  calendarSubscriptionUrl = calendarSubscriptionEnabled ? String(feedUrl || "") : "";

  if (calendarSubscriptionState) {
    calendarSubscriptionState.textContent = calendarSubscriptionEnabled ? "Enabled" : "Disabled";
  }

  if (calendarSubscriptionDetail) {
    calendarSubscriptionDetail.textContent = calendarSubscriptionEnabled
      ? (calendarSubscriptionUrl
        ? "Copy this URL now. For security, Longtail Forge stores only its hash and will not show it again after you leave this page."
        : "The subscription is active. Its existing URL cannot be shown again because Longtail Forge stores only its hash. Rotate it to issue a replacement URL.")
      : "No private calendar subscription URL is active for this workspace.";
  }

  if (calendarSubscriptionUrlInput) {
    calendarSubscriptionUrlInput.value = calendarSubscriptionUrl;
    calendarSubscriptionUrlInput.type = "password";
  }
  if (calendarSubscriptionUrlField) {
    calendarSubscriptionUrlField.hidden = !calendarSubscriptionUrl;
  }
  if (revealCalendarSubscriptionButton) {
    revealCalendarSubscriptionButton.textContent = "Reveal URL";
  }

  renderCalendarSubscriptionActions();
}

function renderCalendarSubscriptionActions() {
  if (enableCalendarSubscriptionButton) {
    enableCalendarSubscriptionButton.hidden = calendarSubscriptionEnabled;
  }
  for (const button of [
    revealCalendarSubscriptionButton,
    copyCalendarSubscriptionButton,
    rotateCalendarSubscriptionButton,
    disableCalendarSubscriptionButton,
  ]) {
    if (button) {
      button.hidden = !calendarSubscriptionEnabled;
    }
  }
  if (revealCalendarSubscriptionButton) {
    revealCalendarSubscriptionButton.disabled = !calendarSubscriptionUrl;
  }
  if (copyCalendarSubscriptionButton) {
    copyCalendarSubscriptionButton.disabled = !calendarSubscriptionUrl;
  }
}

function setCalendarSubscriptionBusy(isBusy) {
  for (const button of [
    enableCalendarSubscriptionButton,
    revealCalendarSubscriptionButton,
    copyCalendarSubscriptionButton,
    rotateCalendarSubscriptionButton,
    disableCalendarSubscriptionButton,
  ]) {
    if (button) {
      button.disabled = isBusy;
    }
  }

  if (!isBusy) {
    renderCalendarSubscriptionActions();
  }
}

function toggleCalendarSubscriptionVisibility() {
  if (!calendarSubscriptionUrlInput || !calendarSubscriptionUrl) {
    return;
  }

  const reveal = calendarSubscriptionUrlInput.type === "password";
  calendarSubscriptionUrlInput.type = reveal ? "text" : "password";
  revealCalendarSubscriptionButton.textContent = reveal ? "Hide URL" : "Reveal URL";
}

async function copyCalendarSubscriptionUrl() {
  if (!calendarSubscriptionUrlInput || !calendarSubscriptionUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(calendarSubscriptionUrl);
  } catch {
    calendarSubscriptionUrlInput.select();
    document.execCommand("copy");
    calendarSubscriptionUrlInput.setSelectionRange(0, 0);
  }

  setCalendarSubscriptionStatus("Calendar subscription URL copied.", {
    clearAfter: 1600,
    type: "success",
  });
}

function setCalendarSubscriptionStatus(message, options = {}) {
  window.LongtailForge.status.set(calendarSubscriptionStatus, message, options);
}

function handleCalendarSubscriptionError(error, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  setCalendarSubscriptionStatus(error?.message || fallbackMessage, { type: "error" });
}

function applyPendingPreferencePreview() {
  applyThemeMode(getSelectedThemeMode(), getSelectedThemeAutoSource());
  applyMarkdownRendering({ openExternalLinksNewTab: openExternalLinksNewTabToggle?.checked === true });
}

async function saveAllSettings() {
  const username = profileUsernameInput.value.trim().toLowerCase();
  const displayName = profileDisplayNameInput.value.trim();
  const altEmail = profileAltEmailInput.value.trim().toLowerCase();
  if (!isValidEmail(username)) {
    setUserSettingsStatus("Enter a valid email address.", true);
    return false;
  }
  if (!displayName) {
    setUserSettingsStatus("Display name is required.", true);
    return false;
  }
  if (altEmail && !isValidEmail(altEmail)) {
    setUserSettingsStatus("Enter a valid alternate email address or leave it blank.", true);
    return false;
  }

  setUserSettingsStatus("Saving user settings...");
  try {
    const body = await window.LongtailForge.api.putJson("/api/user/settings", {
      altEmail,
      displayName,
      openExternalLinksNewTab: openExternalLinksNewTabToggle?.checked === true,
      preferredLoginLanding: preferredLoginLandingSelect?.value || "dashboard",
      preferredWorkspaceSwitchLanding: preferredWorkspaceSwitchLandingSelect?.value || "dashboard",
      preferredCalendarView: normalizeCalendarViewPreference(preferredCalendarViewSelect?.value),
      themeAutoSource: getSelectedThemeAutoSource(),
      themeMode: getSelectedThemeMode(),
      timezone: profileTimezoneSelect.value,
      username,
    });
    const preferences = window.LongtailForge.notificationPreferences.readUserPreferencesPayload(notificationPreferenceList);
    const groupingPreferences = window.LongtailForge.notificationPreferences.readGroupingPreferencesPayload(notificationGroupingPreferences);
    await window.LongtailForge.notificationPreferences.saveUserPreferences(preferences, groupingPreferences);
    applyThemeMode(body.themeMode, body.themeAutoSource);
    applyMarkdownRendering(body);
    applyAppPreferences(body);
    applyProfile(body);
    await loadNotificationPreferences();
    setUserSettingsStatus("User settings saved.", false, { type: "success", clearAfter: 1600 });
    return true;
  } catch (error) {
    handleApiError(error, "User settings were not saved.");
    return false;
  }
}

function applyThemeMode(themeMode, themeAutoSource = "system") {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  const normalizedThemeAutoSource = normalizeThemeAutoSource(themeAutoSource);
  const effectiveTheme = resolveThemeMode(normalizedThemeMode, normalizedThemeAutoSource);

  document.documentElement.dataset.themeMode = normalizedThemeMode;
  document.documentElement.dataset.themeAutoSource = normalizedThemeAutoSource;
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizedThemeMode);
  window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, normalizedThemeAutoSource);
  themeModeInputs.forEach((input) => {
    input.checked = input.value === normalizedThemeMode;
  });
  themeAutoSourceInputs.forEach((input) => {
    input.checked = input.value === normalizedThemeAutoSource;
    input.disabled = normalizedThemeMode !== "auto";
  });
  if (themeAutoSourceControls) {
    themeAutoSourceControls.hidden = normalizedThemeMode !== "auto";
  }
  ensureSystemThemeModeWatcher();
}

function applyMarkdownRendering(settings) {
  const openExternalLinksNewTab = settings?.openExternalLinksNewTab === true;

  if (openExternalLinksNewTabToggle) {
    openExternalLinksNewTabToggle.checked = openExternalLinksNewTab;
  }

  window.localStorage.setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY, openExternalLinksNewTab ? "true" : "false");
}

function applyAppPreferences(settings) {
  if (preferredLoginLandingSelect) {
    preferredLoginLandingSelect.value = normalizeLandingPreference(settings?.preferredLoginLanding);
  }

  if (preferredWorkspaceSwitchLandingSelect) {
    preferredWorkspaceSwitchLandingSelect.value = normalizeLandingPreference(
      settings?.preferredWorkspaceSwitchLanding,
    );
  }

  if (preferredCalendarViewSelect) {
    preferredCalendarViewSelect.value = normalizeCalendarViewPreference(settings?.preferredCalendarView) || "";
  }
}

function normalizeLandingPreference(value) {
  return ["dashboard", "workbench", "tasks", "notes", "lists"].includes(value)
    ? value
    : "dashboard";
}

function normalizeCalendarViewPreference(value) {
  return ["day", "week", "month"].includes(value) ? value : null;
}

function applyWorkspaceCreation(workspaceCreation) {
  workspaceCreationTypes = Array.isArray(workspaceCreation?.availableTypes)
    ? workspaceCreation.availableTypes
    : [];

  newWorkspaceTypeSelect.replaceChildren(...workspaceCreationTypes.map((type) => {
    const option = document.createElement("option");

    option.value = type.workspaceType;
    option.textContent = type.label || type.workspaceType;
    option.dataset.defaultName = type.defaultName || "";
    return option;
  }));

  const hasAvailableTypes = workspaceCreationTypes.length > 0;
  workspaceCreateForm.hidden = !hasAvailableTypes;
  newWorkspaceTypeSelect.disabled = !hasAvailableTypes;
  newWorkspaceNameInput.disabled = !hasAvailableTypes;
  createWorkspaceButton.disabled = !hasAvailableTypes;

  if (hasAvailableTypes) {
    newWorkspaceTypeSelect.value = workspaceCreationTypes[0].workspaceType;
    setSuggestedWorkspaceName(getWorkspaceTypeSuggestedName(workspaceCreationTypes[0]));
    renderCreateWorkspaceModuleSettings();
  } else {
    renderCreateWorkspaceModuleSettings();
  }
}

function applyWorkspaceAccess(settings) {
  activeWorkspaceId = String(settings?.activeWorkspaceId || settings?.active_workspace_id || "");
  if (Object.hasOwn(settings || {}, "canEnterAccountExportRecovery")) {
    canEnterAccountExportRecovery = settings.canEnterAccountExportRecovery === true;
  }
  currentWorkspaces = Array.isArray(settings?.workspaces)
    ? settings.workspaces.map(normalizeWorkspaceAccess).filter((workspace) => workspace.workspaceId)
    : [];

  if (openWorkspaceRemovalButton) {
    openWorkspaceRemovalButton.disabled = currentWorkspaces.length === 0;
  }
}

function applyProfile(profile) {
  profileUsernameInput.value = profile.username || "";
  profileDisplayNameInput.value = profile.displayName || "";
  profileAltEmailInput.value = profile.altEmail || "";
  setTimezoneValue(profile.timezone || "America/New_York");

  if (window.LongtailForge?.timezones) {
    window.LongtailForge.timezones.setUserTimezone(profile.timezone || "America/New_York");
  }
}

function setTimezoneValue(timezone) {
  const matchingOption = [...profileTimezoneSelect.options].find((option) => option.value === timezone);

  if (!matchingOption) {
    const option = document.createElement("option");

    option.value = timezone;
    option.textContent = `${timezone} (${window.LongtailForge.timezones.formatUtcOffset(new Date(), timezone)})`;
    profileTimezoneSelect.appendChild(option);
  }

  profileTimezoneSelect.value = timezone;
}

async function createWorkspace() {
  const workspaceType = newWorkspaceTypeSelect.value;
  const workspaceName = newWorkspaceNameInput.value.trim();

  if (!workspaceType) {
    setUserSettingsStatus("Choose a workspace type.", true);
    return;
  }

  if (!workspaceName) {
    setUserSettingsStatus("Workspace name is required.", true);
    return;
  }

  if (workspaceNameExists(workspaceName)) {
    setUserSettingsStatus("Workspace name already exists.", true);
    return;
  }

  if (!window.LongtailForge.settingsRenderer.validate(workspaceCreateForm)) {
    setUserSettingsStatus("Review the highlighted module settings.", true);
    return;
  }

  createWorkspaceButton.disabled = true;
  setUserSettingsStatus("Creating workspace...");

  try {
    await window.LongtailForge.api.postJson("/api/workspaces", {
      workspaceType,
      workspaceName,
      moduleSettings: window.LongtailForge.settingsRenderer.collectPayload(workspaceCreateForm),
    });

    setUserSettingsStatus("Workspace created.");
    window.location.replace("/workspace-settings.html");
  } catch (error) {
    window.LongtailForge.settingsRenderer.showValidationErrors(workspaceCreateForm, error);
    handleApiError(error, "Workspace was not created.");
    createWorkspaceButton.disabled = false;
  }
}

function updateSuggestedWorkspaceName() {
  const selectedType = workspaceCreationTypes.find((type) => type.workspaceType === newWorkspaceTypeSelect.value);
  const nextSuggestion = getAvailableWorkspaceName(getWorkspaceTypeSuggestedName(selectedType));
  const currentName = newWorkspaceNameInput.value.trim();

  if (!workspaceNameEditedByUser || !currentName || currentName === lastSuggestedWorkspaceName) {
    setSuggestedWorkspaceName(nextSuggestion);
    return;
  }

  lastSuggestedWorkspaceName = nextSuggestion;
}

function renderCreateWorkspaceModuleSettings() {
  const selectedType = workspaceCreationTypes.find((type) => type.workspaceType === newWorkspaceTypeSelect.value);

  window.LongtailForge.settingsRenderer.renderSections(
    newWorkspaceModuleSettingsContainer,
    selectedType?.moduleSettings || [],
    { emptyText: "No module controls are available for this workspace type.", showSaveAction: false },
  );
}

function renderUserSettingsContributions() {
  window.LongtailForge.settingsRenderer.renderSections(
    userSettingsContributionContainer,
    window.LongtailForge.settingsHost.attachmentSections(settingsCatalog, "user"),
    { hideEmpty: true, showSaveAction: false },
  );
}

function setSuggestedWorkspaceName(workspaceName) {
  lastSuggestedWorkspaceName = getAvailableWorkspaceName(workspaceName || "Workspace");
  newWorkspaceNameInput.value = lastSuggestedWorkspaceName;
  workspaceNameEditedByUser = false;
}

function getWorkspaceTypeSuggestedName(workspaceType) {
  return workspaceType?.defaultName || workspaceType?.label || "Workspace";
}

function openWorkspaceRemovalDialog() {
  if (!workspaceRemovalDialog || !workspaceRemovalList) {
    return;
  }

  renderWorkspaceRemovalList();

  if (typeof workspaceRemovalDialog.showModal === "function") {
    workspaceRemovalDialog.showModal();
  } else {
    workspaceRemovalDialog.setAttribute("open", "");
  }
}

function renderWorkspaceRemovalList() {
  workspaceRemovalList.replaceChildren();

  if (currentWorkspaces.length === 0) {
    workspaceRemovalList.appendChild(createWorkspaceRemovalPlaceholder("No workspaces are available."));
    return;
  }

  currentWorkspaces.forEach((workspace) => {
    workspaceRemovalList.appendChild(createWorkspaceRemovalRow(workspace));
  });
}

function createWorkspaceRemovalRow(workspace) {
  const row = document.createElement("div");
  const details = document.createElement("div");
  const name = document.createElement("strong");
  const meta = document.createElement("p");
  const button = document.createElement("button");
  const activeWorkspaceCount = currentWorkspaces.filter((item) => item.status === "active").length;
  const isCurrentWorkspace = workspace.workspaceId === activeWorkspaceId;
  const isLastActiveWorkspace = workspace.status === "active" && activeWorkspaceCount <= 1;

  row.className = "workspace-removal-row";
  name.textContent = workspace.workspaceName || "Workspace";
  meta.textContent = [
    formatWorkspaceType(workspace.workspaceType),
    workspace.status === "inactive" ? "Inactive" : "Active",
    isCurrentWorkspace ? "Current" : "",
  ].filter(Boolean).join(" - ");

  button.type = "button";
  const canLeaveForRecovery = isCurrentWorkspace && isLastActiveWorkspace && canEnterAccountExportRecovery;
  button.textContent = canLeaveForRecovery ? "Leave" : (isCurrentWorkspace ? "Current Workspace" : "Leave");
  button.disabled = (isCurrentWorkspace || isLastActiveWorkspace) && !canLeaveForRecovery;
  button.addEventListener("click", () => removeWorkspaceMembership(workspace.workspaceId));

  if (isLastActiveWorkspace && !isCurrentWorkspace && !canLeaveForRecovery) {
    button.textContent = "Only Active Workspace";
  }

  details.append(name, meta);
  row.append(details, button);
  return row;
}

function createWorkspaceRemovalPlaceholder(message) {
  const placeholder = document.createElement("p");

  placeholder.textContent = message;
  return placeholder;
}

function createPlaceholder(message) {
  const placeholder = document.createElement("p");

  placeholder.className = "placeholder-copy";
  placeholder.textContent = message;
  return placeholder;
}

async function removeWorkspaceMembership(workspaceId) {
  const workspace = currentWorkspaces.find((item) => item.workspaceId === workspaceId);

  if (!workspace) {
    return;
  }

  setUserSettingsStatus(`Leaving ${workspace.workspaceName || "workspace"}...`);

  try {
    const body = await window.LongtailForge.api.deleteJson(`/api/user/workspaces/${encodeURIComponent(workspaceId)}`);

    if (body.accountExportRecovery) {
      window.location.assign("/login.html?accountRecovery=1");
      return;
    }

    applyWorkspaceAccess(body);
    renderWorkspaceRemovalList();
    setUserSettingsStatus("Workspace membership removed.", false, { type: "success", clearAfter: 1600 });
  } catch (error) {
    handleApiError(error, "Workspace membership was not removed.");
  }
}

function normalizeWorkspaceAccess(workspace) {
  return {
    status: String(workspace.status || "active"),
    workspaceId: String(workspace.workspaceId || workspace.workspace_id || ""),
    workspaceName: String(workspace.workspaceName || workspace.workspace_name || "Workspace"),
    workspaceType: String(workspace.workspaceType || workspace.workspace_type || "business"),
  };
}

function workspaceNameExists(workspaceName) {
  const normalizedName = normalizeWorkspaceName(workspaceName);

  return currentWorkspaces.some((workspace) => normalizeWorkspaceName(workspace.workspaceName) === normalizedName);
}

function getAvailableWorkspaceName(baseName) {
  const normalizedBaseName = String(baseName || "Workspace").trim() || "Workspace";

  if (!workspaceNameExists(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let suffix = 2;
  let suggestedName = `${normalizedBaseName}-${suffix}`;

  while (workspaceNameExists(suggestedName)) {
    suffix += 1;
    suggestedName = `${normalizedBaseName}-${suffix}`;
  }

  return suggestedName;
}

function normalizeWorkspaceName(workspaceName) {
  return String(workspaceName || "").trim().toLowerCase();
}

function formatWorkspaceType(workspaceType) {
  return {
    business: "Business",
    personal: "Personal",
    family: "Family",
  }[workspaceType] || "Workspace";
}

function getSelectedThemeMode() {
  return normalizeThemeMode(themeModeInputs.find((input) => input.checked)?.value);
}

function getSelectedThemeAutoSource() {
  return normalizeThemeAutoSource(themeAutoSourceInputs.find((input) => input.checked)?.value);
}

function normalizeThemeMode(value) {
  return ["light", "auto", "dark"].includes(value) ? value : "light";
}

function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resolveThemeMode(themeMode, themeAutoSource = "system") {
  const normalizedThemeMode = normalizeThemeMode(themeMode);

  if (normalizedThemeMode !== "auto") {
    return normalizedThemeMode;
  }

  return resolveAutoThemeMode(themeAutoSource);
}

function resolveAutoThemeMode(themeAutoSource = "system") {
  if (normalizeThemeAutoSource(themeAutoSource) === "system" && typeof window.matchMedia === "function") {
    return getSystemThemeModeQuery().matches ? "dark" : "light";
  }

  return "light";
}

function getSystemThemeModeQuery() {
  if (!systemThemeModeQuery && typeof window.matchMedia === "function") {
    systemThemeModeQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  }

  return systemThemeModeQuery || { matches: false };
}

function ensureSystemThemeModeWatcher() {
  if (systemThemeModeListenerAttached || typeof window.matchMedia !== "function") {
    return;
  }

  const query = getSystemThemeModeQuery();
  const listener = () => {
    if (
      document.documentElement.dataset.themeMode === "auto" &&
      document.documentElement.dataset.themeAutoSource === "system"
    ) {
      const effectiveTheme = resolveThemeMode("auto", "system");
      document.documentElement.dataset.theme = effectiveTheme;
      document.documentElement.style.colorScheme = effectiveTheme;
    }
  };

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
  } else if (typeof query.addListener === "function") {
    query.addListener(listener);
  }

  systemThemeModeListenerAttached = true;
}

async function changePassword() {
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    setUserSettingsStatus("New passwords do not match.", true);
    return;
  }

  savePasswordButton.disabled = true;
  setUserSettingsStatus("Changing password...");

  try {
    await window.LongtailForge.api.putJson("/api/user/password", {
      currentPassword,
      newPassword,
    });

    passwordForm.reset();
    flashButtonSavedState(savePasswordButton, "Password changed.");
  } catch (error) {
    handleApiError(error, "Password was not changed.");
  } finally {
    savePasswordButton.disabled = false;
  }
}

function flashButtonSavedState(button, message) {
  const originalText = button.textContent;

  button.textContent = "Saved.";
  button.classList.add("is-saved");
  setUserSettingsStatus(message);

  window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove("is-saved");
    setUserSettingsStatus("");
  }, 1600);
}

function setUserSettingsStatus(message, isError = false, options = {}) {
  const statusOptions = typeof isError === "object"
    ? isError
    : { ...options, type: isError ? "error" : options.type || "" };

  window.LongtailForge.status.set(
    userSettingsStatus,
    message,
    statusOptions,
  );
}

function handleApiError(error, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  setUserSettingsStatus(error?.message || fallbackMessage, true);
}
})();
