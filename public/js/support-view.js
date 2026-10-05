(function attachSupportViewPage() {
  const entryForm = asForm(document.querySelector("[data-support-view-entry-form]"));
  const actorText = document.querySelector("[data-support-view-actor]");
  const targetSelect = asSelect(document.querySelector("[data-support-view-target]"));
  const workspaceSelect = asSelect(document.querySelector("[data-support-view-workspace]"));
  const passwordInput = asInput(document.querySelector("[data-support-view-password]"));
  const reasonInput = asTextArea(document.querySelector("[data-support-view-reason]"));
  const confirmationInput = asInput(document.querySelector("[data-support-view-confirm]"));
  const expiryText = document.querySelector("[data-support-view-expiry]");
  const startButton = asButton(document.querySelector("[data-support-view-start]"));
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

  required(entryForm, "entry form").addEventListener("submit", startSupportView);
  required(targetSelect, "target list").addEventListener("change", renderWorkspaceOptions);

  /**
   * The narrowings this page's controls need.
   *
   * `querySelector` answers an `Element`, and `value`, `checked`, `disabled`, `options`,
   * `hidden`, `reportValidity` and `focus` belong to the subtypes the Support View entry form
   * renders. Each is narrowed with `instanceof`, which is what the DOM guarantees - not a cast,
   * an assertion, or a type parameter standing in for validation. The three text nodes need no
   * subtype: `textContent` is every element's.
   *
   * These are file-local, as `0.33.33.38.3.1`'s were. This page is the second real consumer of
   * the shape, which is the trigger that shared helpers were to be extracted on; extraction is
   * proposed separately rather than taken here, because a shared module has to be delivered to
   * every page that would use it and that is not this cohort's question.
   *
   * @param {Element | null | undefined} node
   * @returns {HTMLInputElement | null}
   */
  function asInput(node) {
    return node instanceof HTMLInputElement ? node : null;
  }

  /**
   * The reason field is a `textarea`, not an `input`. Traced to the markup rather than taken
   * from the binding's name, which is where this first went wrong.
   * @param {Element | null | undefined} node
   * @returns {HTMLTextAreaElement | null}
   */
  function asTextArea(node) {
    return node instanceof HTMLTextAreaElement ? node : null;
  }

  /** @param {Element | null | undefined} node @returns {HTMLSelectElement | null} */
  function asSelect(node) {
    return node instanceof HTMLSelectElement ? node : null;
  }

  /** @param {Element | null | undefined} node @returns {HTMLButtonElement | null} */
  function asButton(node) {
    return node instanceof HTMLButtonElement ? node : null;
  }

  /** @param {Element | null | undefined} node @returns {HTMLFormElement | null} */
  function asForm(node) {
    return node instanceof HTMLFormElement ? node : null;
  }

  /**
   * One control this page cannot work without, checked where it is used.
   *
   * Checked at the use rather than at the lookup on purpose: `initialize()` runs before the
   * first dereference and reaches the network, so refusing at capture would suppress a request
   * that happens today. The capture lifetime and the failure timing are what they were.
   *
   * @template {Element} T
   * @param {T | null} control
   * @param {string} name
   * @returns {T}
   */
  function required(control, name) {
    if (!control) {
      throw new TypeError(`The Support View page requires its ${name}.`);
    }
    return control;
  }

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
      required(actorText, "administrator label").textContent = `Administrator: ${available.actor?.label || available.actor?.username || "Current administrator"}`;
      required(expiryText, "expiry note").textContent = expiresInSeconds > 0
        ? `The view expires after ${formatDuration(expiresInSeconds)}. The active banner shows the exact remaining time.`
        : "The active banner shows the exact remaining time.";
      renderTargetOptions();
      setStatus(targets.length ? "" : "No active users with an available workspace can be viewed.", !targets.length);
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "Support View targets could not be loaded."), true);
      required(entryForm, "entry form").hidden = true;
    }
  }

  function renderTargetOptions() {
    required(targetSelect, "target list").replaceChildren();
    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.userId;
      option.textContent = target.label;
      required(targetSelect, "target list").appendChild(option);
    });
    required(targetSelect, "target list").disabled = targets.length === 0;
    renderWorkspaceOptions();
  }

  function renderWorkspaceOptions() {
    const target = targets.find((item) => item.userId === required(targetSelect, "target list").value);
    required(workspaceSelect, "workspace list").replaceChildren();
    (target?.workspaces || []).forEach((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.workspaceId;
      option.textContent = workspace.label || workspace.workspaceName;
      required(workspaceSelect, "workspace list").appendChild(option);
    });
    required(workspaceSelect, "workspace list").disabled = required(workspaceSelect, "workspace list").options.length === 0;
  }

  /** @param {Event} event */
  async function startSupportView(event) {
    event.preventDefault();
    if (!required(entryForm, "entry form").reportValidity()) {
      return;
    }

    required(startButton, "start button").disabled = true;
    setStatus("Starting the read-only view...");
    const returnPath = readSafeReturnPath();

    try {
      await requireApi().postJson("/api/support-view/start", {
        currentPassword: required(passwordInput, "password field").value,
        confirmedReadOnly: required(confirmationInput, "read-only confirmation").checked,
        effectiveUserId: required(targetSelect, "target list").value,
        reasonReference: required(reasonInput, "reason field").value.trim(),
        workspaceId: required(workspaceSelect, "workspace list").value,
      });
      required(passwordInput, "password field").value = "";
      window.sessionStorage.setItem(RETURN_PATH_KEY, returnPath);
      window.sessionStorage.setItem(RESTORE_FOCUS_KEY, "true");
      window.location.replace("/dashboard.html");
    } catch (error) {
      required(passwordInput, "password field").value = "";
      required(passwordInput, "password field").focus();
      setStatus(requireErrors().caughtMessage(error, "Support View could not be started."), true);
    } finally {
      required(startButton, "start button").disabled = false;
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

  /** @param {number} totalSeconds */
  function formatDuration(totalSeconds) {
    const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  /** @param {string} message @param {boolean} [isError] */
  function setStatus(message, isError = false) {
    required(statusText, "status line").textContent = message;
    required(statusText, "status line").classList.toggle("error-text", isError);
  }
})();
