// User settings owns per-user preferences and password changes for the signed-in account.
const THEME_STORAGE_KEY = "lf_theme";
const themeForm = document.querySelector("[data-user-theme-form]");
const themeModeInputs = [...document.querySelectorAll("[data-theme-mode-option]")];
const passwordForm = document.querySelector("[data-user-password-form]");
const currentPasswordInput = document.querySelector("[data-current-password]");
const newPasswordInput = document.querySelector("[data-new-password]");
const confirmPasswordInput = document.querySelector("[data-confirm-password]");
const savePasswordButton = document.querySelector("[data-save-password]");
const userSettingsStatus = document.querySelector("[data-user-settings-status]");

loadUserSettings();

themeForm.addEventListener("change", async (event) => {
  if (event.target.matches("[data-theme-mode-option]")) {
    await saveThemeMode();
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword();
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

  themeModeInputs.forEach((input) => {
    input.checked = input.value === normalizedThemeMode;
  });
}

function getSelectedThemeMode() {
  return normalizeThemeMode(
    themeModeInputs.find((input) => input.checked)?.value,
  );
}

function normalizeThemeMode(value) {
  return ["light", "dark", "auto"].includes(value) ? value : "light";
}

function resolveThemeMode(themeMode) {
  if (themeMode !== "auto") {
    return themeMode;
  }

  return isAfterSundown(new Date()) ? "dark" : "light";
}

function isAfterSundown(date) {
  const hour = date.getHours();

  return hour >= 18 || hour < 6;
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
    flashSavedState();
  } catch (error) {
    setUserSettingsStatus(error.message || "Password was not changed.", true);
  } finally {
    savePasswordButton.disabled = false;
  }
}

function flashSavedState() {
  // Match the app's button-local save feedback pattern.
  const originalText = savePasswordButton.textContent;
  savePasswordButton.textContent = "Saved.";
  savePasswordButton.classList.add("is-saved");
  setUserSettingsStatus("Password changed.");

  window.setTimeout(() => {
    savePasswordButton.textContent = originalText;
    savePasswordButton.classList.remove("is-saved");
    setUserSettingsStatus("");
  }, 1600);
}

function setUserSettingsStatus(message, isError = false) {
  userSettingsStatus.textContent = message;
  userSettingsStatus.classList.toggle("is-error", isError);
}
