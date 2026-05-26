// Login is the only public form that creates a session cookie.
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

      const themeMode = ["light", "dark", "auto"].includes(body.user?.themeMode)
        ? body.user.themeMode
        : "light";
      window.localStorage.setItem("lf_theme", themeMode);
      window.location.assign("/home.html");
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
      window.location.replace("/home.html");
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

redirectIfLoggedIn();
