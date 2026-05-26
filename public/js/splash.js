const splashVersion = document.querySelector("[data-splash-version]");
const splashAction = document.querySelector("[data-splash-action]");

async function updateSplashVersion() {
  try {
    const response = await fetch("/api/app-info", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("App info unavailable");
    }

    const appInfo = await response.json();

    if (splashVersion && appInfo.version) {
      splashVersion.textContent = `Version ${appInfo.version}`;
      splashVersion.hidden = false;
    }
  } catch {
    if (splashVersion) {
      splashVersion.hidden = true;
    }
  }
}

async function updateSplashAction() {
  if (!splashAction) {
    return;
  }

  try {
    const response = await fetch("/api/session", { cache: "no-store" });

    if (response.ok) {
      splashAction.href = "/dashboard.html";
      splashAction.textContent = "Open App";
    }
  } catch {
    splashAction.href = "/login.html";
    splashAction.textContent = "Log In";
  }
}

updateSplashVersion();
updateSplashAction();
