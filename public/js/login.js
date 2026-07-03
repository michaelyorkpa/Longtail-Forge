// Login is the only public form that creates a session cookie.
const THEME_STORAGE_KEY = "lf_theme";
const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("");

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    submitButton.disabled = true;

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
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
      window.location.assign("/dashboard.html");
    } catch (error) {
      setLoginStatus(error.message || "Login failed.");
    } finally {
      submitButton.disabled = false;
    }
  });
}

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
      window.location.replace("/dashboard.html");
    }
  } catch {
    // The login page is the fallback when session lookup fails.
  }
}

function setLoginStatus(message) {
  if (loginStatus) {
    loginStatus.textContent = message;
  }
}

function normalizeThemeMode(value) {
  return ["light", "auto", "dark"].includes(value) ? value : "light";
}

function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
}

redirectIfLoggedIn();
