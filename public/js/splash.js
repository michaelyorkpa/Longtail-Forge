(function attachSplashPage() {
  /**
   * The two controls this page writes to, narrowed to what `views/public/index.html` renders: the
   * version line is a `p` this page hides and reveals, and the action is an `a` whose `href` it
   * rewrites once the session is known.
   *
   * Narrowing only, with no refusal: both reads are already guarded - `updateSplashVersion`
   * checks `splashVersion` on both its branches and `updateSplashAction` returns early - so a
   * control of the wrong subtype now takes the absent path this page already has rather than
   * throwing at the member write.
   */
  const splashVersionElement = document.querySelector("[data-splash-version]");
  const splashVersion = splashVersionElement instanceof HTMLElement ? splashVersionElement : null;
  const splashActionElement = document.querySelector("[data-splash-action]");
  const splashAction = splashActionElement instanceof HTMLAnchorElement ? splashActionElement : null;

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

      const displayVersion = appInfo.displayVersion || appInfo.version;
      if (splashVersion && displayVersion) {
        splashVersion.textContent = `Version ${displayVersion}`;
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
})();
