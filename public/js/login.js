// Login is the only public form that creates a session cookie.
const THEME_STORAGE_KEY = "lf_theme";
const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const requiredPasswordForm = document.querySelector("[data-required-password-form]");
const requiredCurrentPasswordInput = document.querySelector("[data-required-current-password]");
const requiredNewPasswordInput = document.querySelector("[data-required-new-password]");
const requiredConfirmPasswordInput = document.querySelector("[data-required-confirm-password]");
const requiredPasswordStatus = document.querySelector("[data-required-password-status]");
const rememberMeInput = loginForm?.querySelector('[name="rememberMe"]');
let pendingLoginLandingPath = "/dashboard.html";

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("");

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    const rememberMe = Boolean(rememberMeInput?.checked);

    submitButton.disabled = true;

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Login failed.");
      }

      const themeMode = normalizeThemeMode(body.user?.themeMode);
      const themeAutoSource = normalizeThemeAutoSource(body.user?.themeAutoSource);
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
      window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, themeAutoSource);
      window.localStorage.setItem("lf_timezone", body.user?.timezone || "America/New_York");
      if (body.user?.workspaceContext) {
        window.localStorage.setItem("lf_workspace_context", JSON.stringify(body.user.workspaceContext));
      }
      pendingLoginLandingPath = normalizeLandingPath(body.user?.loginLandingPath);
      if (body.user?.passwordChangeRequired) {
        showRequiredPasswordChange(password);
      } else {
        window.location.assign(pendingLoginLandingPath);
      }
    } catch (error) {
      setLoginStatus(error.message || "Login failed.");
    } finally {
      submitButton.disabled = false;
    }
  });
}

requiredPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPassword = requiredCurrentPasswordInput.value;
  const newPassword = requiredNewPasswordInput.value;
  const confirmPassword = requiredConfirmPasswordInput.value;
  const submitButton = requiredPasswordForm.querySelector('button[type="submit"]');

  if (newPassword !== confirmPassword) {
    setRequiredPasswordStatus("New passwords do not match.");
    return;
  }

  submitButton.disabled = true;
  setRequiredPasswordStatus("Changing password...");

  try {
    const response = await fetch("/api/user/password", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || "Password was not changed.");
    }

    requiredPasswordForm.reset();
    window.location.replace(pendingLoginLandingPath);
  } catch (error) {
    setRequiredPasswordStatus(error.message || "Password was not changed.");
  } finally {
    submitButton.disabled = false;
  }
});

async function redirectIfLoggedIn() {
  try {
    // Keep returning users out of the login form when their cookie is still valid.
    const response = await fetch("/api/session", { cache: "no-store" });

    if (response.ok) {
      const body = await response.json().catch(() => ({}));

      const themeMode = normalizeThemeMode(body.user?.themeMode);
      const themeAutoSource = normalizeThemeAutoSource(body.user?.themeAutoSource);
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
      window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, themeAutoSource);
      window.localStorage.setItem("lf_timezone", body.user?.timezone || "America/New_York");
      if (body.user?.workspaceContext) {
        window.localStorage.setItem("lf_workspace_context", JSON.stringify(body.user.workspaceContext));
      }
      pendingLoginLandingPath = normalizeLandingPath(body.user?.loginLandingPath);
      if (body.user?.passwordChangeRequired) {
        showRequiredPasswordChange();
      } else {
        window.location.replace(pendingLoginLandingPath);
      }
    }
  } catch {
    // The login page is the fallback when session lookup fails.
  }
}

function showRequiredPasswordChange(currentPassword = "") {
  loginForm.hidden = true;
  requiredPasswordForm.hidden = false;
  requiredCurrentPasswordInput.value = currentPassword;
  loginForm.reset();
  (currentPassword ? requiredNewPasswordInput : requiredCurrentPasswordInput).focus();
}

function setLoginStatus(message) {
  if (loginStatus) {
    loginStatus.textContent = message;
  }
}

function setRequiredPasswordStatus(message) {
  if (requiredPasswordStatus) {
    requiredPasswordStatus.textContent = message;
  }
}

function normalizeThemeMode(value) {
  return ["light", "auto", "dark"].includes(value) ? value : "light";
}

function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
}

function normalizeLandingPath(value) {
  return [
    "/dashboard.html",
    "/workbench.html",
    "/tasks.html",
    "/notes.html",
    "/lists.html",
    "/account-recovery.html",
  ].includes(value) ? value : "/dashboard.html";
}

redirectIfLoggedIn();
