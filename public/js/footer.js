/* global CustomEvent */

// Shared footer for public and authenticated pages.
(function attachSiteFooter() {
  const footer = document.createElement("footer");
  footer.className = "site-footer";

  const footerInner = document.createElement("div");
  footerInner.className = "site-footer-inner";

  const footerBrand = document.createElement("p");
  footerBrand.className = "site-footer-brand";
  footerBrand.textContent = "Longtail Forge";

  const footerLicense = document.createElement("p");
  footerLicense.className = "site-footer-license";
  footerLicense.append("Licensed under AGPL-3.0-only. ");

  const footerSourceLink = document.createElement("a");
  footerSourceLink.textContent = "Corresponding Source for this running version";

  const footerLegal = document.createElement("nav");
  footerLegal.className = "site-footer-legal";
  footerLegal.setAttribute("aria-label", "Legal");

  const termsLink = document.createElement("a");
  termsLink.href = "/terms.html";
  termsLink.textContent = "Terms";

  const privacyLink = document.createElement("a");
  privacyLink.href = "/privacy.html";
  privacyLink.textContent = "Privacy";

  footerLicense.append(footerSourceLink);
  footerLegal.append(termsLink, privacyLink);

  footerInner.append(footerBrand, footerLicense, footerLegal);
  footer.appendChild(footerInner);
  document.body.appendChild(footer);

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * One quick action, proved to be a record and read member by member.
   *
   * **The estate publishes no quick-action record, and that is deliberate.**
   * `BrowserStoredWorkspaceContext.quickActions` is `unknown[]` because the list is restored
   * from stored settings: the server builds it from a frozen in-repo definition set, but
   * nothing between that producer and this file proves what survived the round trip. So the
   * members are named here, as the reads this file actually makes, and every one of them is
   * `unknown` - this narrowing buys member access, not trust. Each read below coerces or
   * guards at the point of use.
   * @typedef {Record<string, unknown>} FooterQuickAction
   */

  /**
   * The drawer controls `setQuickActionDrawerOpen` needs, which is not the whole shell.
   *
   * Three of its four callers hand it a literal holding only the two elements it sets
   * attributes on, so requiring the whole shell would describe a caller that does not exist.
   * `list` is optional for the same reason, and is already read with `?.`.
   * @typedef {object} QuickActionDrawerControls
   * @property {HTMLElement} drawer
   * @property {HTMLElement} toggle
   * @property {HTMLElement} [list]
   */

  /**
   * The mounted quick-action capture surface.
   * @typedef {object} QuickActionShell
   * @property {HTMLElement} drawer
   * @property {HTMLElement} list
   * @property {HTMLElement} root
   * @property {HTMLElement} status
   * @property {HTMLButtonElement} toggle
   */

  /**
   * One script a quick action needs before its dialog can open.
   * @typedef {object} QuickActionDependency
   * @property {string} src
   * @property {boolean} [module]
   * @property {() => unknown} [test]
   */

  /**
   * The status and refresh channels this host hands the module registry.
   *
   * **`BrowserModuleActions.open` declares `options` as `unknown` on purpose.** Its published
   * comment records that naming the shape was tried and withdrawn, because `refresh` is
   * supplied by the host but called by the module dialog with a detail neither validates. So
   * no contextual type reaches these two callbacks and the host names them itself. Annotating
   * the object through this alias, rather than each parameter inline, is also what keeps the
   * pinned `refresh: (detail) => ...` spelling intact.
   * @typedef {object} QuickActionHostChannels
   * @property {(detail?: unknown) => void} refresh
   * @property {(message?: unknown, options?: { isError?: unknown }) => void} setStatus
   */

  /**
   * A value read as a record, or `null` when it is not one.
   * @param {unknown} value
   * @returns {Record<string, unknown> | null}
   */
  function footerRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  }

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
      throw new Error("The site footer requires LongtailForge.errors.");
    }
    return errors;
  }

  function updateFooterMetrics() {
    const root = document.documentElement;
    const viewportHeight = window.innerHeight || root.clientHeight || 0;
    // The fallback stands in for a host with no layout box at all. It carried only `top`
    // while the reader below asks for `bottom` too, so `bottom` was `undefined`, failed the
    // `Number.isFinite` check, and collapsed to `footerTop` - which on this path *is*
    // `viewportHeight`. Naming `bottom` states the shape the reader already assumed and
    // answers the same number, because `viewportHeight` is always finite.
    const footerRect = typeof footer.getBoundingClientRect === "function"
      ? footer.getBoundingClientRect()
      : { bottom: viewportHeight, top: viewportHeight };
    const footerTop = Number.isFinite(footerRect.top) ? footerRect.top : viewportHeight;
    const footerBottom = Number.isFinite(footerRect.bottom) ? footerRect.bottom : footerTop;
    const visibleFooterOffset = Math.max(
      0,
      Math.min(viewportHeight, footerBottom) - Math.max(footerTop, 0),
    );

    root.style.setProperty("--site-footer-visible-offset", `${Math.ceil(visibleFooterOffset)}px`);
  }

  async function updateFooterBrand() {
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
      const name = appInfo.name || "Longtail Forge";
      const displayVersion = appInfo.displayVersion || appInfo.version;
      const version = displayVersion ? ` v${displayVersion}` : "";

      footerBrand.textContent = [
        `${name}${version}`,
        "Copyright \u00a9 2026 Michael York d/b/a Raymond Tec",
      ].join("\n");
      footerSourceLink.href = appInfo.correspondingSourceUrl || "#";
    } catch {
      footerBrand.textContent = [
        "Longtail Forge",
        "Copyright \u00a9 2026 Michael York d/b/a Raymond Tec",
      ].join("\n");
      footerSourceLink.removeAttribute("href");
    } finally {
      updateFooterMetrics();
    }
  }

  updateFooterBrand();
  updateFooterMetrics();
  /** @type {QuickActionShell | null} */
  let quickActionCaptureShell = null;
  mountQuickActionCapture();
  window.addEventListener?.("resize", updateFooterMetrics);
  window.addEventListener?.("scroll", updateFooterMetrics, { passive: true });
  window.addEventListener?.("longtailforge:workspace-context-updated", () => {
    syncQuickActionCapture(quickActionCaptureShell);
  });

  const quickActionScriptLoads = new Map();
  const moduleActionBaseDependencies = [
    { src: "js/shared/api-client.js", test: () => window.LongtailForge?.api },
    { src: "js/shared/module-actions.js", test: () => window.LongtailForge?.moduleActions },
    { src: "js/shared/icons.js", test: () => window.LongtailForge?.icons },
    { src: "js/shared/view-builder.js", test: () => window.LongtailForge?.view },
    { src: "js/shared/view-renderer.js", test: () => window.LongtailForge?.view?.renderSurface },
  ];
  const quickActionDependencySets = {
    "time-tracking.timer.create": [
      { src: "js/shared/page-controller.js", test: () => window.LongtailForge?.pageController },
      ...moduleActionBaseDependencies,
      { src: "js/shared/client-project-options.js", test: () => window.LongtailForge?.clientProjectOptions },
      { src: "js/time-tracking-timer-dialog.js", test: () => window.LongtailForge?.timeTrackingTimerDialog?.openCreate },
    ],
    "tasks.add": [
      { src: "js/shared/modal.js", test: () => window.LongtailForge?.modal },
      { src: "js/shared/api-client.js", test: () => window.LongtailForge?.api },
      { src: "js/shared/page-controller.js", test: () => window.LongtailForge?.pageController },
      { src: "js/shared/module-actions.js", test: () => window.LongtailForge?.moduleActions },
      { src: "js/shared/icons.js", test: () => window.LongtailForge?.icons },
      { src: "js/shared/timezones.js", test: () => window.LongtailForge?.timezones },
      { src: "js/shared/tags.js", test: () => window.LongtailForge?.tags },
      { src: "js/shared/file-attachments.js", test: () => window.LongtailForge?.fileAttachments },
      { src: "js/shared/notes-linked-panel.js", test: () => window.LongtailForge?.notesLinkedPanel },
      { src: "js/shared/view-builder.js", test: () => window.LongtailForge?.view },
      { src: "js/shared/view-renderer.js", test: () => window.LongtailForge?.view?.renderSurface },
      { src: "js/shared/capture-prompt.js", test: () => window.LongtailForge?.capturePrompt },
      { src: "js/task-resume-note-capture.js", test: () => window.LongtailForge?.taskResumeNoteCapture },
      { src: "js/shared/file-preview.js", test: () => window.LongtailForge?.filePreview },
      { src: "js/task-dialog.js", test: () => window.LongtailForge?.tasksDialog?.openTaskEditor },
    ],
    "notes.add": [
      { src: "js/shared/modal.js", test: () => window.LongtailForge?.modal },
      ...moduleActionBaseDependencies,
      { src: "js/shared/tags.js", test: () => window.LongtailForge?.tags },
      { src: "js/shared/file-attachments.js", test: () => window.LongtailForge?.fileAttachments },
      { src: "js/shared/notification-subscriptions.js", test: () => window.LongtailForge?.notificationSubscriptions },
      { src: "js/shared/notes-editor.js", test: () => window.LongtailForge?.notesEditor },
      { src: "js/shared/file-preview.js", test: () => window.LongtailForge?.filePreview },
      { module: true, src: "js/notes.js", test: () => window.LongtailForge?.notesDialog?.openNoteEditor },
    ],
    "lists.add": [
      ...moduleActionBaseDependencies,
      { src: "js/shared/client-project-options.js", test: () => window.LongtailForge?.clientProjectOptions },
      { module: true, src: "js/lists.js", test: () => window.LongtailForge?.listsDialog?.openListEditor },
    ],
  };

  function mountQuickActionCapture() {
    if (!window.LongtailForge?.workspaceContextReady || !document.querySelector(".site-header")) {
      return;
    }

    const shell = createQuickActionShell();
    quickActionCaptureShell = shell;
    document.body.append(shell.root);

    window.LongtailForge.workspaceContextReady
      .catch(() => null)
      .finally(() => {
        syncQuickActionCapture(shell);
      });
  }

  /** @param {QuickActionShell | null | undefined} shell */
  function syncQuickActionCapture(shell) {
    if (!shell) {
      return;
    }

    const actions = readQuickActions();
    if (actions.length === 0) {
      setQuickActionDrawerOpen(shell, false, { returnFocus: false });
      shell.list.replaceChildren();
      shell.root.hidden = true;
      updateFooterMetrics();
      return;
    }

    renderQuickActions(shell, actions);
    shell.root.hidden = false;
    updateFooterMetrics();
  }

  /** @returns {QuickActionShell} */
  function createQuickActionShell() {
    const root = document.createElement("section");
    const toggle = createQuickActionToggle();
    const drawer = document.createElement("div");
    const header = document.createElement("div");
    const title = document.createElement("h2");
    const close = document.createElement("button");
    const body = document.createElement("div");
    const list = document.createElement("div");
    const status = document.createElement("p");

    root.className = "quick-action-capture";
    root.dataset.quickActionCapture = "";
    root.hidden = true;

    drawer.className = "quick-action-capture-drawer surface-drawer";
    drawer.id = "quick-action-capture-drawer";
    drawer.dataset.quickActionDrawer = "";
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("aria-labelledby", "quick-action-capture-title");
    drawer.setAttribute("role", "dialog");

    header.className = "quick-action-capture-header surface-drawer-header";
    title.id = "quick-action-capture-title";
    title.textContent = "Quick actions";

    close.className = "quick-action-capture-close";
    close.type = "button";
    close.dataset.quickActionClose = "";
    close.setAttribute("aria-label", "Close quick actions");
    close.title = "Close quick actions";
    decorateQuickActionButton(close, { icon: "close", label: "Close quick actions" });
    close.addEventListener("click", () => setQuickActionDrawerOpen({ drawer, toggle }, false));

    body.className = "quick-action-capture-body surface-drawer-body";
    list.className = "quick-action-capture-list";
    list.dataset.quickActionList = "";

    status.className = "quick-action-capture-status";
    status.dataset.quickActionStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    header.append(title, close);
    body.append(list, status);
    drawer.append(header, body);
    root.append(toggle, drawer);

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setQuickActionDrawerOpen({ drawer, list, toggle }, !isOpen);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setQuickActionDrawerOpen({ drawer, toggle }, false);
      }
    });
    document.addEventListener("click", (event) => {
      // `contains` takes a `Node | null`, and an event target is only an `EventTarget`. The
      // two values a document click can actually carry are unchanged by this: a node inside
      // the drawer still keeps it open, and `null` still answers `false` and closes it. A
      // target that is an `EventTarget` but not a `Node` now closes the drawer where it used
      // to throw inside the listener - no click on `document` produces one.
      const clickedNode = event.target instanceof Node ? event.target : null;
      if (toggle.getAttribute("aria-expanded") !== "true" || root.contains(clickedNode)) {
        return;
      }

      setQuickActionDrawerOpen({ drawer, toggle }, false, { returnFocus: false });
    });

    return { drawer, list, root, status, toggle };
  }

  function createQuickActionToggle() {
    const button = document.createElement("button");

    button.className = "quick-action-capture-toggle";
    button.type = "button";
    button.dataset.quickActionToggle = "";
    button.setAttribute("aria-controls", "quick-action-capture-drawer");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Quick actions");
    button.title = "Quick actions";
    decorateQuickActionButton(button, {
      icon: "bolt",
      label: "Quick actions",
      text: "Capture",
    });

    return button;
  }

  /** @param {QuickActionShell} shell @param {FooterQuickAction[]} actions */
  function renderQuickActions(shell, actions) {
    const actionButtons = actions.map((action) => createQuickActionItem(action, shell));
    shell.list.replaceChildren(...actionButtons);
  }

  /**
   * A value as `textContent` accepts it.
   *
   * **`textContent` is a nullable IDL attribute**, so assigning `undefined` sets `null` and
   * empties the element - it does not render the word "undefined" the way `title` and
   * `dataset` do. Reproducing that conversion here keeps every read below answering exactly
   * what the untyped page answered.
   * @param {unknown} value
   * @returns {string | null}
   */
  function footerText(value) {
    return value === null || value === undefined ? null : String(value);
  }

  /** @param {FooterQuickAction} action @param {QuickActionShell} shell */
  function createQuickActionItem(action, shell) {
    const button = document.createElement("button");
    const body = document.createElement("span");
    const label = document.createElement("span");
    const description = document.createElement("span");

    button.className = "quick-action-capture-action";
    button.type = "button";
    button.dataset.quickActionId = String(action.id);
    button.dataset.quickActionType = String(action.actionType);
    button.title = String(action.temporaryFallback && action.temporaryLabel ? action.temporaryLabel : action.description || action.label);
    decorateQuickActionButton(button, {
      // `|| "add"` already decided the falsy cases, so the coercion only reaches a truthy
      // value - and a truthy non-string name is one the icon registry throws on either way.
      icon: String(action.icon || "add"),
      // An absent label stays absent, so the icon writer still refuses a button with neither
      // a label nor text, exactly as it did when this read was untyped.
      label: footerText(action.label) ?? undefined,
    });

    body.className = "quick-action-capture-action-body";
    label.className = "quick-action-capture-action-label";
    label.textContent = footerText(action.label);
    description.className = "quick-action-capture-action-description";
    description.textContent = footerText(action.temporaryFallback && action.temporaryLabel
      ? action.temporaryLabel
      : action.description || "");

    body.append(label);
    if (description.textContent) {
      body.append(description);
    }
    button.append(body);
    button.addEventListener("click", () => activateQuickAction(action, button, shell));
    return button;
  }

  /** @param {FooterQuickAction} action @param {HTMLButtonElement} button @param {QuickActionShell} shell */
  async function activateQuickAction(action, button, shell) {
    // The truthiness check is unchanged, and `String` reproduces the coercion the assignment
    // to `location.href` already performed, so a non-string href still navigates where it did.
    if (action.actionType === "fallback-link" && action.href) {
      window.location.href = String(action.href);
      return;
    }

    // `open` takes the action id as a `string`, and the truthiness check alone never proved
    // one. Both guards refuse the same stored payloads they always did; the only value whose
    // treatment moves is a truthy non-string id, which now reports "not available yet"
    // instead of being handed to the registry. The producer emits `""` or a string literal.
    if (action.actionType !== "module-action" || typeof action.moduleActionId !== "string" || !action.moduleActionId) {
      setQuickActionStatus(shell.status, "This quick action is not available yet.", true);
      return;
    }

    button.disabled = true;
    setQuickActionStatus(shell.status, `Opening ${String(action.label)}...`);

    try {
      const moduleActions = await ensureQuickActionDependencies(action.moduleActionId);
      /** @type {QuickActionHostChannels} */
      const hostChannels = {
        refresh: (detail) => notifyQuickActionHostRefresh(action, detail),
        setStatus: (message, options = {}) => setQuickActionStatus(shell.status, message, options.isError),
      };
      await moduleActions.open(action.moduleActionId, {
        context: {
          currentPage: readQuickActionPageContext(),
          source: "quick-action-capture",
        },
      }, hostChannels);
      setQuickActionStatus(shell.status, "");
    } catch (error) {
      setQuickActionStatus(shell.status, requireErrors().caughtMessage(error, `${String(action.label)} could not be opened.`), true);
    } finally {
      button.disabled = false;
    }
  }

  /**
   * Announce that a quick action's dialog finished, carrying whatever detail it handed back.
   *
   * **The detail is the module dialog's, and nothing validates it** - the registry's own
   * contract says so. Spreading is the only thing this function does with it, so the guard is
   * written to match what a spread already does: **any non-null object**, arrays included,
   * because `{...[1, 2]}` really does contribute indices. The four in-tree callers all pass a
   * record, so that path is unchanged, and `null`, `undefined` and every non-string primitive
   * contributed no members before and contribute none now. **A string detail is the one value
   * whose treatment moves**: spreading one used to scatter its character indices into the
   * event detail, and now contributes nothing. No caller sends one.
   * @param {FooterQuickAction} action
   * @param {unknown} [detail]
   */
  function notifyQuickActionHostRefresh(action, detail = {}) {
    const registeredAction = window.LongtailForge?.moduleActions?.list?.({ includeUnavailable: true })
      ?.find((entry) => entry.actionId === action.moduleActionId);
    window.dispatchEvent?.(new CustomEvent("longtailforge:quick-action-refresh", {
      detail: {
        actionId: action.moduleActionId || action.id,
        recordType: registeredAction?.recordType || "",
        quickActionId: action.id,
        ...(typeof detail === "object" && detail !== null ? detail : {}),
      },
    }));
  }

  /**
   * The dependency list this map declares for an action, or none.
   *
   * The map was indexed with the caller's string, which read through the prototype as well as
   * the map's own keys - `toString` would have answered a function rather than nothing. Walking
   * its entries answers only for the keys it actually declares.
   * @param {string} moduleActionId
   * @returns {QuickActionDependency[]}
   */
  function quickActionDependenciesFor(moduleActionId) {
    for (const [actionId, dependencies] of Object.entries(quickActionDependencySets)) {
      if (actionId === moduleActionId) {
        return dependencies;
      }
    }

    return [];
  }

  // Loads the quick action's scripts, then returns the registry those scripts published.
  // The check was already here and already threw; it now hands back what it proved rather
  // than leaving its caller to re-read the global on trust.
  /** @param {string} moduleActionId */
  async function ensureQuickActionDependencies(moduleActionId) {
    const dependencies = quickActionDependenciesFor(moduleActionId);

    for (const dependency of dependencies) {
      await loadQuickActionScript(dependency);
    }

    const moduleActions = window.LongtailForge?.moduleActions;

    if (!moduleActions?.open) {
      throw new Error("Quick action registry is unavailable.");
    }

    return moduleActions;
  }

  /** @param {QuickActionDependency} dependency */
  function loadQuickActionScript(dependency) {
    if (dependency.test?.()) {
      return Promise.resolve();
    }

    const versionedSrc = window.LongtailForge?.assetVersion?.url(dependency.src) || dependency.src;
    const key = new window.URL(versionedSrc, document.baseURI).href;
    if (quickActionScriptLoads.has(key)) {
      return quickActionScriptLoads.get(key);
    }

    const promise = dependency.module
      ? import(key)
      : appendQuickActionScriptTag(dependency, versionedSrc);

    const checkedPromise = promise.then(() => {
      if (!dependency.test?.()) {
        throw new Error(`Loaded ${dependency.src}, but the expected helper is unavailable.`);
      }
    });

    quickActionScriptLoads.set(key, checkedPromise);
    return checkedPromise;
  }

  /**
   * Append the script tag this dependency names, resolving once it loads.
   *
   * **Extracted for the declared return type, and it must stay a function.** `resolve()` is
   * called with no argument, which needs a `Promise<void>` to be legal; hoisting the
   * `new Promise` into an annotated local instead would have built the tag - and appended it
   * to the document - even for the `import()` branch that never wants one.
   * @param {QuickActionDependency} dependency
   * @param {string} versionedSrc
   * @returns {Promise<void>}
   */
  function appendQuickActionScriptTag(dependency, versionedSrc) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = versionedSrc;
      script.async = false;
      script.addEventListener("load", () => resolve());
      script.addEventListener("error", () => reject(new Error(`Could not load ${dependency.src}.`)));
      document.body.appendChild(script);
    });
  }

  /**
   * The quick actions this workspace published, each read as a record.
   *
   * A malformed entry becomes an empty record rather than being dropped, which is what the
   * untyped page did: it read `entry.label` off whatever the list held, got `undefined`, and
   * drew the button anyway. Filtering here would remove an affordance the footer has always
   * shown. This mirrors the same decision in `time-tracking-dashboard.js`.
   * @returns {FooterQuickAction[]}
   */
  function readQuickActions() {
    const actions = window.LongtailForge?.workspaceContext?.quickActions || [];
    return Array.isArray(actions) ? actions.map((entry) => footerRecord(entry) || {}) : [];
  }

  function readQuickActionPageContext() {
    return {
      path: window.location.pathname,
      query: window.location.search,
      title: document.body.dataset.pageTitle || document.title || "",
    };
  }

  /**
   * @param {QuickActionDrawerControls} shell
   * @param {boolean} isOpen
   * @param {{ returnFocus?: boolean }} [options]
   */
  function setQuickActionDrawerOpen(shell, isOpen, options = {}) {
    shell.toggle.setAttribute("aria-expanded", String(isOpen));
    shell.drawer.hidden = !isOpen;
    shell.drawer.setAttribute("aria-hidden", String(!isOpen));

    if (isOpen) {
      // `querySelector` answers an `Element`, and only an `HTMLElement` can take focus. The
      // selector asks for a button, so this narrowing refuses nothing the drawer can hold.
      window.setTimeout(() => {
        const firstAction = shell.list?.querySelector("button:not(:disabled)");
        if (firstAction instanceof HTMLElement) {
          firstAction.focus();
        }
      }, 0);
    } else if (options.returnFocus !== false && typeof shell.toggle.focus === "function") {
      shell.toggle.focus();
    }
  }

  /**
   * @param {HTMLElement | null | undefined} status
   * @param {unknown} message
   * @param {unknown} [isError]
   */
  function setQuickActionStatus(status, message, isError = false) {
    if (!status) {
      return;
    }

    status.textContent = String(message || "");
    status.classList.toggle("is-error", Boolean(isError));
  }

  /**
   * Hand a button to the icon surface, or write plain text when that surface is absent.
   *
   * **The options are `string` because `BrowserIconButtonOptions` is.** Two of the three
   * callers pass literals; the third is the only one holding stored values, so it coerces
   * there rather than widening this signature and pushing the problem into the published
   * contract's own reads.
   * @param {HTMLButtonElement} button
   * @param {{ icon?: string, label?: string, text?: string }} options
   */
  function decorateQuickActionButton(button, options) {
    if (!window.LongtailForge?.icons?.decorateButton) {
      button.textContent = options.text || options.label || "";
      return button;
    }

    return window.LongtailForge.icons.decorateButton(button, {
      icon: options.icon,
      iconOnly: !options.text,
      label: options.label,
      text: options.text || "",
      title: options.label,
    });
  }
})();
