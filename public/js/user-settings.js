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
const workspaceCreateForm = document.querySelector("[data-workspace-create-form]");
const newWorkspaceTypeSelect = document.querySelector("[data-new-workspace-type]");
const newWorkspaceNameInput = document.querySelector("[data-new-workspace-name]");
const createWorkspaceButton = document.querySelector("[data-create-workspace]");
const userSettingsStatus = document.querySelector("[data-user-settings-status]");
let workspaceCreationTypes = [];

loadUserSettings();

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

workspaceCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createWorkspace();
});

newWorkspaceTypeSelect.addEventListener("change", () => {
  const selectedType = workspaceCreationTypes.find((type) => type.workspaceType === newWorkspaceTypeSelect.value);

  if (!newWorkspaceNameInput.value.trim()) {
    newWorkspaceNameInput.value = selectedType?.defaultName || selectedType?.label || "Workspace";
  }
});

async function loadUserSettings() {
  try {
    const response = await fetch("/api/user/settings", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "User settings could not be loaded.");
    }

    applyThemeMode(body.themeMode);
    applyProfile(body);
    applyWorkspaceCreation(body.workspaceCreation);
    setUserSettingsStatus("");
  } catch (error) {
    setUserSettingsStatus(error.message || "User settings could not be loaded.", true);
  }
}

async function saveThemeMode() {
  const themeMode = getSelectedThemeMode();
  applyThemeMode(themeMode);
  setUserSettingsStatus("Saving appearance...");

  try {
    const response = await fetch("/api/user/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ themeMode }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "Appearance was not saved.");
    }

    applyThemeMode(body.themeMode);
    setUserSettingsStatus("Appearance saved.");
    window.setTimeout(() => setUserSettingsStatus(""), 1600);
  } catch (error) {
    setUserSettingsStatus(error.message || "Appearance was not saved.", true);
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
    newWorkspaceNameInput.value = workspaceCreationTypes[0].defaultName || workspaceCreationTypes[0].label || "Workspace";
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
    const response = await fetch("/api/user/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        displayName,
        altEmail,
        timezone,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "Profile was not saved.");
    }

    applyProfile(body);
    flashButtonSavedState(saveProfileButton, "Profile saved.");
  } catch (error) {
    setUserSettingsStatus(error.message || "Profile was not saved.", true);
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

  createWorkspaceButton.disabled = true;
  setUserSettingsStatus("Creating workspace...");

  try {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceType,
        workspaceName,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "Workspace was not created.");
    }

    setUserSettingsStatus("Workspace created.");
    window.location.replace("/workspace-settings.html");
  } catch (error) {
    setUserSettingsStatus(error.message || "Workspace was not created.", true);
    createWorkspaceButton.disabled = false;
  }
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
    const response = await fetch("/api/user/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    const body = await response.json().catch(() => ({}));

    // A stale session should always return to login before showing form errors.
    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(body.error || "Password was not changed.");
    }

    passwordForm.reset();
    flashButtonSavedState(savePasswordButton, "Password changed.");
  } catch (error) {
    setUserSettingsStatus(error.message || "Password was not changed.", true);
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

function setUserSettingsStatus(message, isError = false) {
  userSettingsStatus.textContent = message;
  userSettingsStatus.classList.toggle("is-error", isError);
}
