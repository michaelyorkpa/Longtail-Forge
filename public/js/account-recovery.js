(function attachAccountRecoveryPage() {
  /**
   * The two controls this page disables while its request is in flight, narrowed to what
   * `views/protected/account-recovery.html` renders: both are `button type="button"`.
   *
   * Narrowing only, with no refusal: both listeners are registered through `?.`, so a control of
   * the wrong subtype is simply never wired - the absent path this page already has - rather than
   * throwing. The status line needs no subtype; `textContent` is every element's.
   *
   * @param {string} selector
   * @returns {HTMLButtonElement | null}
   */
  function findRecoveryButton(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLButtonElement ? element : null;
  }

  const downloadButton = findRecoveryButton("[data-download-account-export]");
  const logoutButton = findRecoveryButton("[data-account-recovery-logout]");
  const status = document.querySelector("[data-account-recovery-status]");

  downloadButton?.addEventListener("click", async () => {
    downloadButton.disabled = true;
    setStatus("Preparing account data...");
    try {
      const response = await fetch("/api/user/portable-account-export", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw window.LongtailForge?.errors?.createError?.(
          body,
          "Account data could not be exported.",
          response.status,
        ) || new Error("Account data could not be exported.");
      }
      const blob = new window.Blob([`${JSON.stringify(body, null, 2)}\n`], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "longtail-forge-account-data.json";
      link.click();
      window.URL.revokeObjectURL(url);
      setStatus("Account data downloaded.");
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Account data could not be exported."));
    } finally {
      downloadButton.disabled = false;
    }
  });

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      window.localStorage.removeItem("lf_theme");
      window.localStorage.removeItem("lf_theme_auto_source");
      window.localStorage.removeItem("lf_timezone");
      window.localStorage.removeItem("lf_workspace_context");
      window.location.replace("/login.html");
    }
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Account recovery requires LongtailForge.errors.");
    }
    return errors;
  }

  /** @param {string} message */
  function setStatus(message) {
    if (status) status.textContent = message;
  }
})();
