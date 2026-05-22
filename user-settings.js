// User settings currently owns password changes for the signed-in account.
const passwordForm = document.querySelector("[data-user-password-form]");
const currentPasswordInput = document.querySelector("[data-current-password]");
const newPasswordInput = document.querySelector("[data-new-password]");
const confirmPasswordInput = document.querySelector("[data-confirm-password]");
const savePasswordButton = document.querySelector("[data-save-password]");
const userSettingsStatus = document.querySelector("[data-user-settings-status]");

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword();
});

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
