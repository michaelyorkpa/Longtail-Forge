(function attachSupportViewPage() {
  const entryForm = document.querySelector("[data-support-view-entry-form]");
  const actorText = document.querySelector("[data-support-view-actor]");
  const targetSelect = document.querySelector("[data-support-view-target]");
  const workspaceSelect = document.querySelector("[data-support-view-workspace]");
  const passwordInput = document.querySelector("[data-support-view-password]");
  const reasonInput = document.querySelector("[data-support-view-reason]");
  const confirmationInput = document.querySelector("[data-support-view-confirm]");
  const expiryText = document.querySelector("[data-support-view-expiry]");
  const startButton = document.querySelector("[data-support-view-start]");
  const statusText = document.querySelector("[data-support-view-status]");
  const RETURN_PATH_KEY = "lf_support_view_return_path";
  const RESTORE_FOCUS_KEY = "lf_support_view_restore_focus";

  let targets = [];
  let expiresInSeconds = 0;

  initialize();

  entryForm.addEventListener("submit", startSupportView);
  targetSelect.addEventListener("change", renderWorkspaceOptions);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Support view requires LongtailForge.api.");
    }
    return apiClient;
  }
  async function initialize() {
    setStatus("Loading available support targets...");
    try {
      const result = await requireApi().getJson("/api/support-view/targets", { cache: "no-store" });
      targets = Array.isArray(result.targets) ? result.targets : [];
      expiresInSeconds = Number.parseInt(result.expiresInSeconds, 10) || 0;
      actorText.textContent = `Administrator: ${result.actor?.label || result.actor?.username || "Current administrator"}`;
      expiryText.textContent = expiresInSeconds > 0
        ? `The view expires after ${formatDuration(expiresInSeconds)}. The active banner shows the exact remaining time.`
        : "The active banner shows the exact remaining time.";
      renderTargetOptions();
      setStatus(targets.length ? "" : "No active users with an available workspace can be viewed.", !targets.length);
    } catch (error) {
      setStatus(error.message || "Support View targets could not be loaded.", true);
      entryForm.hidden = true;
    }
  }

  function renderTargetOptions() {
    targetSelect.replaceChildren();
    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.userId;
      option.textContent = target.label;
      targetSelect.appendChild(option);
    });
    targetSelect.disabled = targets.length === 0;
    renderWorkspaceOptions();
  }

  function renderWorkspaceOptions() {
    const target = targets.find((item) => item.userId === targetSelect.value);
    workspaceSelect.replaceChildren();
    (target?.workspaces || []).forEach((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.workspaceId;
      option.textContent = workspace.label || workspace.workspaceName;
      workspaceSelect.appendChild(option);
    });
    workspaceSelect.disabled = workspaceSelect.options.length === 0;
  }

  async function startSupportView(event) {
    event.preventDefault();
    if (!entryForm.reportValidity()) {
      return;
    }

    startButton.disabled = true;
    setStatus("Starting the read-only view...");
    const returnPath = readSafeReturnPath();

    try {
      await requireApi().postJson("/api/support-view/start", {
        currentPassword: passwordInput.value,
        confirmedReadOnly: confirmationInput.checked,
        effectiveUserId: targetSelect.value,
        reasonReference: reasonInput.value.trim(),
        workspaceId: workspaceSelect.value,
      });
      passwordInput.value = "";
      window.sessionStorage.setItem(RETURN_PATH_KEY, returnPath);
      window.sessionStorage.setItem(RESTORE_FOCUS_KEY, "true");
      window.location.replace("/dashboard.html");
    } catch (error) {
      passwordInput.value = "";
      passwordInput.focus();
      setStatus(error.message || "Support View could not be started.", true);
    } finally {
      startButton.disabled = false;
    }
  }

  function readSafeReturnPath() {
    try {
      const referrer = new URL(document.referrer || "", window.location.href);
      const blocked = new Set(["/login.html", "/support-view.html", "/support-view-audit.html"]);
      if (referrer.origin === window.location.origin && referrer.pathname.endsWith(".html") && !blocked.has(referrer.pathname)) {
        return `${referrer.pathname}${referrer.search}`;
      }
    } catch {
      // Direct entry uses the safe default.
    }
    return "/dashboard.html";
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.classList.toggle("error-text", isError);
  }
})();
