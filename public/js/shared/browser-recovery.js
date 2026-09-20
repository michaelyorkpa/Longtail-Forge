(function initializeBrowserRecovery(global) {
  const namespace = global.LongtailForge || {};
  const STYLE_MARKER = "framework-recovery-style";
  /** @type {{ dialog: HTMLDialogElement, promise: Promise<void> } | null} */
  let activePermissionDialog = null;
  let activeSurface = false;

  installFetchGuard();
  global.addEventListener("error", handleWindowError, true);
  global.addEventListener("unhandledrejection", handleUnhandledRejection);

  /**
   * @param {unknown} [error] whatever reached the boundary
   * @param {unknown} [options]
   */
  function present(error, options = {}) {
    const status = Number.parseInt(
      `${requiredMember(options, "status") || optionalMember(error, "status")}`,
      10,
    ) || 0;

    if (status === 403) {
      return showPermissionDenied();
    }

    const kind = recoveryKind(status, error);
    return render({
      kind,
      requestId: String(
        requiredMember(options, "requestId") || optionalMember(error, "requestId") || "",
      ).trim(),
    });
  }

  /** @param {unknown} [options] */
  function render(options = {}) {
    if (activeSurface) {
      return Promise.resolve(null);
    }

    activeSurface = true;
    return whenBodyReady().then(() => {
      ensureStyles();
      const surface = surfaceCopy(requiredMember(options, "kind"));
      const main = document.createElement("main");
      const brand = document.createElement("p");
      const heading = document.createElement("h1");
      const message = document.createElement("p");
      const action = document.createElement("a");

      main.className = `framework-recovery-page framework-recovery-page--${surface.kind}`;
      main.dataset.frameworkRecovery = "";
      main.dataset.recoveryKind = surface.kind;
      main.setAttribute("role", "alert");
      main.setAttribute("aria-live", "assertive");
      main.setAttribute("aria-atomic", "true");

      brand.className = "framework-recovery-brand";
      brand.textContent = "Longtail Forge";
      heading.tabIndex = -1;
      heading.textContent = surface.title;
      message.className = "framework-recovery-message";
      message.textContent = surface.message;
      action.className = "framework-recovery-action";
      action.href = surface.actionHref;
      action.textContent = surface.actionLabel;

      main.append(brand, heading, message);
      if (surface.kind === "unexpected" && requiredMember(options, "requestId")) {
        const requestId = document.createElement("p");
        const code = document.createElement("code");
        requestId.className = "framework-recovery-request-id";
        requestId.append("Request ID: ", code);
        Reflect.set(code, "textContent", requiredMember(options, "requestId"));
        main.appendChild(requestId);
      }
      main.appendChild(action);

      document.title = `${surface.title} | Longtail Forge`;
      document.body.className = "framework-recovery-body";
      document.body.replaceChildren(main);
      heading.focus();
      return main;
    });
  }

  /** @returns {Promise<void>} the dialog resolves on close, carrying nothing */
  function showPermissionDenied() {
    if (activePermissionDialog) {
      return activePermissionDialog.promise;
    }

    ensureStyles();
    const trigger = document.activeElement;
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const message = document.createElement("p");
    const status = document.createElement("p");
    const actions = document.createElement("div");
    const closeButton = document.createElement("button");
    const headingId = `framework-permission-title-${Date.now()}`;
    const descriptionId = `framework-permission-description-${Date.now()}`;

    dialog.className = "app-dialog framework-permission-dialog";
    dialog.dataset.frameworkPermissionDenied = "";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", headingId);
    dialog.setAttribute("aria-describedby", descriptionId);

    form.method = "dialog";
    form.className = "app-dialog-form";
    heading.id = headingId;
    heading.textContent = "Permission denied";
    message.id = descriptionId;
    message.textContent = "You do not have permission to complete that action.";
    status.className = "framework-permission-announcement";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "assertive");
    status.textContent = "The action was not completed.";
    actions.className = "form-actions";
    closeButton.type = "button";
    closeButton.textContent = "Close";

    actions.appendChild(closeButton);
    form.append(heading, message, status, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    /** @type {() => void} */
    let resolveDialog;
    /** @type {Promise<void>} */
    const promise = new Promise((resolve) => {
      resolveDialog = resolve;
    });
    activePermissionDialog = { dialog, promise };

    const finish = () => {
      dialog.remove();
      activePermissionDialog = null;
      if (trigger?.isConnected && isFocusableTrigger(trigger)) {
        trigger.focus();
      }
      resolveDialog();
    };
    closeButton.addEventListener("click", () => {
      if (typeof dialog.close === "function") {
        dialog.close("close");
      } else {
        finish();
      }
    });
    dialog.addEventListener("close", finish, { once: true });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (typeof dialog.close === "function") {
        dialog.close("cancel");
      } else {
        finish();
      }
    });

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    closeButton.focus();
    return promise;
  }

  function installFetchGuard() {
    if (typeof global.fetch !== "function" || Reflect.get(global.fetch, "__longtailRecoveryGuard")) {
      return;
    }

    const originalFetch = global.fetch.bind(global);
    /** @type {(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>} */
    const guardedFetch = async (input, init = {}) => {
      const response = await originalFetch(input, init);
      if (
        response?.status === 403
        && isAppApiRequest(input)
        && isMutationMethod(requestMethod(input, init))
      ) {
        void showPermissionDenied();
      }
      return response;
    };

    Object.defineProperty(guardedFetch, "__longtailRecoveryGuard", {
      value: true,
    });
    global.fetch = guardedFetch;
  }

  /** @param {ErrorEvent} event */
  function handleWindowError(event) {
    if (activeSurface || event?.target === global) {
      if (!activeSurface) {
        event.preventDefault?.();
        void present(event.error);
      }
      return;
    }

    event.preventDefault?.();
    void render({ kind: "unexpected" });
  }

  /** @param {PromiseRejectionEvent} event */
  function handleUnhandledRejection(event) {
    event.preventDefault?.();
    void present(event.reason);
  }

  /** @param {number} status @param {unknown} error */
  function recoveryKind(status, error) {
    if (status === 401) return "login-required";
    if (status === 403 || status === 404) return "unavailable";
    if (status === 409) return "conflict";
    if (status === 502 || status === 503 || optionalMember(error, "name") === "TypeError") {
      return "dependency-unavailable";
    }
    return "unexpected";
  }

  /** @param {unknown} kind */
  function surfaceCopy(kind) {
    if (kind === "login-required") {
      return {
        actionHref: "/login.html",
        actionLabel: "Sign in",
        kind,
        message: "Your session is no longer available. Sign in again to continue.",
        title: "Sign in required",
      };
    }
    if (kind === "unavailable") {
      return {
        actionHref: "/dashboard.html",
        actionLabel: "Return to Dashboard",
        kind,
        message: "This page is unavailable or you may not have access to it.",
        title: "Page unavailable",
      };
    }
    if (kind === "conflict") {
      return {
        actionHref: safeCurrentPath(),
        actionLabel: "Reload page",
        kind,
        message: "This page changed since it was loaded. Reload it before continuing.",
        title: "That changed",
      };
    }
    if (kind === "dependency-unavailable") {
      return {
        actionHref: safeCurrentPath(),
        actionLabel: "Try again",
        kind,
        message: "A required service is temporarily unavailable. Wait a moment, then try again.",
        title: "Temporarily unavailable",
      };
    }
    return {
      actionHref: "/dashboard.html",
      actionLabel: "Return to Dashboard",
      kind: "unexpected",
      message: "Longtail Forge could not complete this page safely. Return to the Dashboard and try again.",
      title: "Something went wrong",
    };
  }

  function ensureStyles() {
    if (document.querySelector(`[data-${STYLE_MARKER}]`)) {
      return;
    }

    const style = document.createElement("style");
    style.dataset.frameworkRecoveryStyle = "";
    style.textContent = `
      .framework-recovery-body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #f5f7fb; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .framework-recovery-page { box-sizing: border-box; width: min(100%, 620px); padding: clamp(28px, 6vw, 52px); border: 1px solid #d8deea; border-radius: 20px; background: #fff; box-shadow: 0 20px 60px rgba(22, 34, 58, .12); }
      .framework-recovery-brand { margin: 0 0 28px; color: #526079; font-size: .82rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .framework-recovery-page h1 { margin: 0; font-size: clamp(2rem, 8vw, 3.5rem); line-height: 1.05; letter-spacing: -.04em; }
      .framework-recovery-message { margin: 20px 0 0; color: #526079; font-size: 1.05rem; line-height: 1.65; }
      .framework-recovery-request-id { margin: 20px 0 0; color: #526079; font-size: .85rem; overflow-wrap: anywhere; }
      .framework-recovery-request-id code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      .framework-recovery-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 30px; padding: 10px 18px; border-radius: 10px; background: #315ee8; color: #fff; font-weight: 700; text-decoration: none; }
      .framework-recovery-action:hover { background: #244cc7; }
      .framework-recovery-action:focus-visible { outline: 3px solid #f0b429; outline-offset: 3px; }
      .framework-permission-dialog { width: min(calc(100% - 32px), 500px); padding: 0; border: 1px solid #d8deea; border-radius: 16px; background: #fff; color: #172033; box-shadow: 0 22px 70px rgba(22, 34, 58, .28); }
      .framework-permission-dialog::backdrop { background: rgba(8, 12, 22, .62); }
      .framework-permission-dialog .app-dialog-form { display: grid; gap: 16px; margin: 0; padding: 26px; }
      .framework-permission-dialog h2, .framework-permission-dialog p { margin: 0; }
      .framework-permission-dialog .form-actions { display: flex; justify-content: flex-end; margin-top: 6px; }
      .framework-permission-dialog button { min-height: 44px; padding: 9px 18px; border: 0; border-radius: 9px; background: #315ee8; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .framework-permission-dialog button:focus-visible { outline: 3px solid #f0b429; outline-offset: 3px; }
      .framework-permission-announcement { margin: 0; color: var(--color-muted, #526079); font-size: .9rem; }
      html[data-theme="dark"] .framework-recovery-body { background: #080b12; color: #f4f7ff; }
      html[data-theme="dark"] .framework-recovery-page { border-color: #2d374a; background: #111722; box-shadow: 0 20px 60px rgba(0, 0, 0, .45); }
      html[data-theme="dark"] .framework-recovery-brand, html[data-theme="dark"] .framework-recovery-message, html[data-theme="dark"] .framework-recovery-request-id { color: #aebbd0; }
      html[data-theme="dark"] .framework-recovery-action { background: #6d8cff; color: #081022; }
      html[data-theme="dark"] .framework-recovery-action:hover { background: #8ba3ff; }
      html[data-theme="dark"] .framework-permission-dialog { border-color: #2d374a; background: #111722; color: #f4f7ff; }
      html[data-theme="dark"] .framework-permission-dialog button { background: #6d8cff; color: #081022; }
      @media (prefers-color-scheme: dark) {
        html[data-theme-mode="auto"] .framework-recovery-body { background: #080b12; color: #f4f7ff; }
        html[data-theme-mode="auto"] .framework-recovery-page { border-color: #2d374a; background: #111722; box-shadow: 0 20px 60px rgba(0, 0, 0, .45); }
        html[data-theme-mode="auto"] .framework-recovery-brand, html[data-theme-mode="auto"] .framework-recovery-message, html[data-theme-mode="auto"] .framework-recovery-request-id { color: #aebbd0; }
        html[data-theme-mode="auto"] .framework-recovery-action { background: #6d8cff; color: #081022; }
        html[data-theme-mode="auto"] .framework-recovery-action:hover { background: #8ba3ff; }
        html[data-theme-mode="auto"] .framework-permission-dialog { border-color: #2d374a; background: #111722; color: #f4f7ff; }
        html[data-theme-mode="auto"] .framework-permission-dialog button { background: #6d8cff; color: #081022; }
      }
      @media (max-width: 480px) {
        .framework-recovery-body { padding: 14px; }
        .framework-recovery-page { padding: 28px 22px; border-radius: 16px; }
        .framework-recovery-action { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function whenBodyReady() {
    if (document.body) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  /** @param {unknown} input */
  function isAppApiRequest(input) {
    try {
      // Read inline rather than through `optionalMember`: `framework.fetch-guard-composition`
      // lifts this function by itself, so it may not acquire a free variable. Reading through
      // `Object(input)` with `input` as the receiver is the optional access it replaces, and
      // the URL constructor converts its argument to a string exactly as the template does.
      const raw = typeof input === "string" || input instanceof global.URL
        ? input
        : Reflect.get(Object(input), "url", input);
      const url = new global.URL(`${raw}`, global.location.href);
      return url.origin === global.location.origin && url.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }

  /** @param {unknown} input @param {unknown} init */
  function requestMethod(input, init) {
    const inputMethod = typeof global.Request === "function" && input instanceof global.Request
      ? input.method
      : "GET";
    // Lifted alongside `isAppApiRequest`, and helper-free for the same reason.
    return String(Reflect.get(Object(init), "method", init) || inputMethod || "GET").toUpperCase();
  }

  /** @param {string} method */
  function isMutationMethod(method) {
    return !["GET", "HEAD", "OPTIONS"].includes(method);
  }

  /**
   * `value[key]`, read with `value` as its own receiver.
   *
   * `present` and `render` take `unknown` at the published boundary, so each member is
   * read the way the property access read it - through a getter too, which still sees the
   * value it was called on. An absent value fails as the access failed, named rather than
   * anonymous.
   *
   * @param {unknown} value
   * @param {string} key
   * @returns {unknown}
   */
  function requiredMember(value, key) {
    if (value === null || value === undefined) {
      throw new TypeError(`The recovery boundary cannot read ${key} from ${value}.`);
    }
    return Reflect.get(Object(value), key, value);
  }

  /**
   * `value?.[key]`: the optional access, which answers `undefined` for an absent value.
   *
   * No absence check is needed to do that. `Object(null)` and `Object(undefined)` are each a
   * fresh empty object, so the lookup finds nothing and answers `undefined` - which is what
   * the optional access answered, and why this differs from `requiredMember` only in failing.
   *
   * @param {unknown} value
   * @param {string} key
   * @returns {unknown}
   */
  function optionalMember(value, key) {
    return Reflect.get(Object(value), key, value);
  }

  /**
   * Whether the element that held focus can take it back.
   *
   * `document.activeElement` answers an `Element`, and focusing belongs to `HTMLElement`
   * and `SVGElement` rather than to every element. This reads the member exactly as
   * `typeof trigger.focus === "function"` read it, and claims only what that proves.
   *
   * @param {unknown} value
   * @returns {value is Element & { focus: () => unknown }}
   */
  function isFocusableTrigger(value) {
    return typeof Reflect.get(Object(value), "focus", value) === "function";
  }

  function safeCurrentPath() {
    const pathname = String(global.location.pathname || "");
    return pathname.startsWith("/") && !pathname.startsWith("//")
      ? pathname
      : "/dashboard.html";
  }

  namespace.recovery = Object.freeze({
    permissionDenied: showPermissionDenied,
    present,
    render,
  });
  global.LongtailForge = namespace;
}(window));
