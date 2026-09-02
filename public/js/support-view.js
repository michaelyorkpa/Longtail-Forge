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

  /**
   * The eligible targets this administrator may view.
   *
   * Annotated because the narrowed response is what fills it: an untyped `[]` infers a list
   * that can hold nothing, and this is the one direct handoff the truthful response type
   * requires. It is not a page-state contract - the rest of this page's state is untouched.
   * @type {BrowserSupportViewTarget[]}
   */
  let targets = [];
  let expiresInSeconds = 0;

  initialize();

  entryForm.addEventListener("submit", startSupportView);
  targetSelect.addEventListener("change", renderWorkspaceOptions);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

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
      throw new Error("Support view requires LongtailForge.errors.");
    }
    return errors;
  }

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
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewTarget} BrowserSupportViewTarget */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewTargetWorkspace} BrowserSupportViewTargetWorkspace */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewActor} BrowserSupportViewActor */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewTargetEnvelope} BrowserSupportViewTargetEnvelope */

  /** The three members the producer writes for every eligible workspace. */
  const TARGET_WORKSPACE_TEXT = Object.freeze(["label", "workspaceId", "workspaceName"]);

  /** The four text members the producer writes beside a target's workspace list. */
  const TARGET_TEXT = Object.freeze(["displayName", "label", "userId", "username"]);

  /** The three members the producer names for the viewing administrator. */
  const ACTOR_TEXT = Object.freeze(["label", "userId", "username"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One workspace a target may be viewed in.
   *
   * `workspaceId` must be non-empty because it is what the start request sends: a blank one
   * could never name a workspace, so it is not a choice this page may offer.
   * @param {unknown} value
   * @returns {value is BrowserSupportViewTargetWorkspace}
   */
  function isTargetWorkspace(value) {
    return isResponseRecord(value)
      && TARGET_WORKSPACE_TEXT.every((member) => typeof value[member] === "string")
      && value.workspaceId !== "";
  }

  /**
   * One Support View target.
   *
   * **Fail-closed on purpose**: `userId` and `label` must be non-empty because one names the
   * account the start request would act on and the other is the only thing the administrator
   * sees before choosing it. A record the browser cannot vouch for is not offered as a target.
   * @param {unknown} value
   * @returns {value is BrowserSupportViewTarget}
   */
  function isSupportViewTarget(value) {
    return isResponseRecord(value)
      && TARGET_TEXT.every((member) => typeof value[member] === "string")
      && value.userId !== ""
      && value.label !== ""
      && Array.isArray(value.workspaces)
      && value.workspaces.every(isTargetWorkspace);
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserSupportViewActor}
   */
  function isSupportViewActor(value) {
    return isResponseRecord(value) && ACTOR_TEXT.every((member) => typeof value[member] === "string");
  }

  /**
   * The target envelope, read totally.
   *
   * Total rather than refusing, because the failure this page must avoid is the opposite of the
   * audit page's: **dropping an entry here removes a candidate rather than hiding a record**,
   * which is the fail-closed direction for a picker. An unusable body yields no targets and the
   * page shows the same "no active users" state it already showed for a non-list member.
   * @param {unknown} body
   * @returns {BrowserSupportViewTargetEnvelope}
   */
  function readSupportViewTargets(body) {
    const envelope = isResponseRecord(body) ? body : null;
    const rawTargets = envelope ? envelope.targets : null;
    const expiry = envelope ? envelope.expiresInSeconds : null;
    return {
      actor: envelope && isSupportViewActor(envelope.actor) ? envelope.actor : null,
      expiresInSeconds: typeof expiry === "number" && Number.isFinite(expiry) && expiry > 0 ? expiry : 0,
      targets: Array.isArray(rawTargets) ? rawTargets.filter(isSupportViewTarget) : [],
    };
  }

  async function initialize() {
    setStatus("Loading available support targets...");
    try {
      const available = readSupportViewTargets(
        await requireApi().getJson("/api/support-view/targets", { cache: "no-store" }),
      );
      targets = available.targets;
      expiresInSeconds = available.expiresInSeconds;
      actorText.textContent = `Administrator: ${available.actor?.label || available.actor?.username || "Current administrator"}`;
      expiryText.textContent = expiresInSeconds > 0
        ? `The view expires after ${formatDuration(expiresInSeconds)}. The active banner shows the exact remaining time.`
        : "The active banner shows the exact remaining time.";
      renderTargetOptions();
      setStatus(targets.length ? "" : "No active users with an available workspace can be viewed.", !targets.length);
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Support View targets could not be loaded."), true);
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
      setStatus(requireErrors().caughtMessage(error, "Support View could not be started."), true);
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
