// User settings owns per-user preferences and password changes for the signed-in account.
const THEME_STORAGE_KEY = "lf_theme";
const themeForm = document.querySelector("[data-user-theme-form]");
const themeModeToggle = document.querySelector("[data-theme-mode-toggle]");
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
const saveProfileButton = document.querySelector("[data-save-profile]");
const notificationPreferencesForm = document.querySelector("[data-user-notification-preferences-form]");
const notificationGroupingPreferences = document.querySelector("[data-user-notification-grouping-preferences]");
const notificationPreferenceList = document.querySelector("[data-user-notification-preference-list]");
const saveNotificationPreferencesButton = document.querySelector("[data-save-notification-preferences]");
const workspaceCreateForm = document.querySelector("[data-workspace-create-form]");
const newWorkspaceTypeSelect = document.querySelector("[data-new-workspace-type]");
const newWorkspaceNameInput = document.querySelector("[data-new-workspace-name]");
const newWorkspaceModuleSettingsContainer = document.querySelector("[data-new-workspace-module-settings]");
const createWorkspaceButton = document.querySelector("[data-create-workspace]");
const openWorkspaceRemovalButton = document.querySelector("[data-open-workspace-removal]");
const workspaceRemovalDialog = document.querySelector("[data-workspace-removal-dialog]");
const workspaceRemovalList = document.querySelector("[data-workspace-removal-list]");
const closeWorkspaceRemovalButton = document.querySelector("[data-close-workspace-removal]");
const userSettingsStatus = document.querySelector("[data-user-settings-status]");
let workspaceCreationTypes = [];
let currentWorkspaces = [];
let activeWorkspaceId = "";
let lastSuggestedWorkspaceName = "";
let workspaceNameEditedByUser = false;

loadUserSettings();
loadNotificationPreferences();

themeForm.addEventListener("change", async (event) => {
  if (event.target.matches("[data-theme-mode-toggle]")) {
    await saveThemeMode();
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile();
});

notificationPreferencesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveNotificationPreferences();
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
closeWorkspaceRemovalButton?.addEventListener("click", () => workspaceRemovalDialog?.close());

async function loadUserSettings() {
  try {
    const body = await window.LongtailForge.api.getJson("/api/user/settings", { cache: "no-store" });

    applyThemeMode(body.themeMode);
    applyProfile(body);
    applyWorkspaceAccess(body);
    applyWorkspaceCreation(body.workspaceCreation);
    setUserSettingsStatus("");
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
  } catch (error) {
    notificationPreferenceList.replaceChildren(createPlaceholder("Notification preferences could not be loaded."));
    handleApiError(error, "Notification preferences could not be loaded.");
  }
}

async function saveNotificationPreferences() {
  if (!notificationPreferenceList) {
    return;
  }

  saveNotificationPreferencesButton.disabled = true;
  setUserSettingsStatus("Saving notification preferences...");

  try {
    const preferences = window.LongtailForge.notificationPreferences.readUserPreferencesPayload(notificationPreferenceList);
    const groupingPreferences = window.LongtailForge.notificationPreferences.readGroupingPreferencesPayload(notificationGroupingPreferences);

    await window.LongtailForge.notificationPreferences.saveUserPreferences(preferences, groupingPreferences);
    await loadNotificationPreferences();
    flashButtonSavedState(saveNotificationPreferencesButton, "Notification preferences saved.");
  } catch (error) {
    handleApiError(error, "Notification preferences were not saved.");
  } finally {
    saveNotificationPreferencesButton.disabled = false;
  }
}

async function saveThemeMode() {
  const themeMode = getSelectedThemeMode();
  applyThemeMode(themeMode);
  setUserSettingsStatus("Saving appearance...");

  try {
    const body = await window.LongtailForge.api.putJson("/api/user/settings", { themeMode });

    applyThemeMode(body.themeMode);
    setUserSettingsStatus("Appearance saved.", false, { type: "success", clearAfter: 1600 });
  } catch (error) {
    handleApiError(error, "Appearance was not saved.");
  }
}

function applyThemeMode(themeMode) {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  const effectiveTheme = resolveThemeMode(normalizedThemeMode);

  document.documentElement.dataset.themeMode = normalizedThemeMode;
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizedThemeMode);
  themeModeToggle.checked = normalizedThemeMode === "dark";
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
    option.textContent = timezone;
    profileTimezoneSelect.appendChild(option);
  }

  profileTimezoneSelect.value = timezone;
}

async function saveProfile() {
  const username = profileUsernameInput.value.trim().toLowerCase();
  const displayName = profileDisplayNameInput.value.trim();
  const altEmail = profileAltEmailInput.value.trim().toLowerCase();
  const timezone = profileTimezoneSelect.value;

  if (!isValidEmail(username)) {
    setUserSettingsStatus("Enter a valid email address.", true);
    return;
  }

  if (!displayName) {
    setUserSettingsStatus("Display name is required.", true);
    return;
  }

  if (altEmail && !isValidEmail(altEmail)) {
    setUserSettingsStatus("Enter a valid alternate email address or leave it blank.", true);
    return;
  }

  saveProfileButton.disabled = true;
  setUserSettingsStatus("Saving profile...");

  try {
    const body = await window.LongtailForge.api.putJson("/api/user/settings", {
      username,
      displayName,
      altEmail,
      timezone,
    });

    applyProfile(body);
    flashButtonSavedState(saveProfileButton, "Profile saved.");
  } catch (error) {
    handleApiError(error, "Profile was not saved.");
  } finally {
    saveProfileButton.disabled = false;
  }
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

  createWorkspaceButton.disabled = true;
  setUserSettingsStatus("Creating workspace...");

  try {
    await window.LongtailForge.api.postJson("/api/workspaces", {
      workspaceType,
      workspaceName,
      moduleSettings: window.LongtailForge.settingsControls.readModuleSettingsPayload(workspaceCreateForm),
    });

    setUserSettingsStatus("Workspace created.");
    window.location.replace("/workspace-settings.html");
  } catch (error) {
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

  window.LongtailForge.settingsControls.renderModuleSettingsGroups(
    newWorkspaceModuleSettingsContainer,
    selectedType?.moduleSettings || [],
    { emptyText: "No module controls are available for this workspace type.", headingLevel: "h3" },
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
  button.textContent = isCurrentWorkspace ? "Current Workspace" : "Remove";
  button.disabled = isCurrentWorkspace || isLastActiveWorkspace;
  button.addEventListener("click", () => removeWorkspaceMembership(workspace.workspaceId));

  if (isLastActiveWorkspace && !isCurrentWorkspace) {
    button.textContent = "Last Workspace";
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

  setUserSettingsStatus(`Removing ${workspace.workspaceName || "workspace"}...`);

  try {
    const body = await window.LongtailForge.api.deleteJson(`/api/user/workspaces/${encodeURIComponent(workspaceId)}`);

    applyWorkspaceAccess(body);
    renderWorkspaceRemovalList();
    setUserSettingsStatus("Workspace removed.", false, { type: "success", clearAfter: 1600 });
  } catch (error) {
    handleApiError(error, "Workspace was not removed.");
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
  return themeModeToggle.checked ? "dark" : "light";
}

function normalizeThemeMode(value) {
  return value === "dark" ? "dark" : "light";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resolveThemeMode(themeMode) {
  return normalizeThemeMode(themeMode);
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
