(function attachOverlayHost(global) {
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserOverlayController} BrowserOverlayController */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserOverlayHandle} BrowserOverlayHandle */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserOverlayHost} BrowserOverlayHost */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserOverlayHostOptions} BrowserOverlayHostOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserOverlayRegistration} BrowserOverlayRegistration */

  /**
   * One host's shared registry entry.
   *
   * Keyed by the host element, so two controllers over the same host reach the same overlays and
   * the same single active slot - which is what makes "one open overlay per host" true across
   * separate `create` calls.
   * @typedef {{ active: BrowserOverlayHandle | null, host: Element, overlays: Map<string, BrowserOverlayHandle> }} OverlayHostState
   */

  const root = global.LongtailForge || {};
  /** @type {WeakMap<Element, OverlayHostState>} */
  const registry = new WeakMap();

  /**
   * Whether a value can be focused, without assuming which element class it is.
   *
   * `document.activeElement` is an `Element`, and `focus` lives on `HTMLElement`, `SVGElement`
   * and `MathMLElement` rather than on `Element` itself. This is the same test the writer already
   * made, expressed so the compiler can follow it.
   * @param {Element | null | undefined} value
   * @returns {value is Element & { focus: () => void }}
   */
  function canFocus(value) {
    return value !== null && value !== undefined && "focus" in value && typeof value.focus === "function";
  }

  /**
   * An event target as a node, or `null`.
   *
   * `Element.contains` accepts `Node | null` and answers `false` for `null`, which is exactly what
   * a non-node target produced before. Narrowed rather than cast: an `EventTarget` is not a `Node`.
   * @param {EventTarget | null} value @returns {Node | null}
   */
  function nodeTarget(value) {
    return value instanceof Node ? value : null;
  }

  /**
   * An element's `offsetParent`, or `undefined` where the property does not exist.
   *
   * **Preserves the original visibility test exactly.** `offsetParent` is an `HTMLElement`
   * property; on an SVG element the old read produced `undefined`, which is not `null`, so such
   * elements passed the filter. They still do.
   * @param {Element} element @returns {Element | null | undefined}
   */
  function offsetParentOf(element) {
    return element instanceof HTMLElement ? element.offsetParent : undefined;
  }

  /** @param {BrowserOverlayHostOptions} [options] @returns {BrowserOverlayController} */
  function create(options = {}) {
    const host = options.host;

    if (!host || host.nodeType !== 1) {
      throw new Error("Overlay host requires a host element.");
    }

    let state = registry.get(host);
    if (!state) {
      /** @type {OverlayHostState} */
      state = {
        active: null,
        host,
        overlays: new Map(),
      };
      registry.set(host, state);
      host.classList.add("surface-overlay-host");
    }

    return {
      closeAll: () => closeActive(state),
      register: (overlayOptions) => registerOverlay(state, overlayOptions),
      toggle: (name) => toggleOverlay(state, name),
    };
  }

  /**
   * @param {OverlayHostState} state @param {BrowserOverlayRegistration} [options]
   * @returns {BrowserOverlayHandle}
   */
  function registerOverlay(state, options = {}) {
    const name = String(options.name || "").trim();
    const panel = options.panel;
    const trigger = options.trigger;
    const title = String(options.title || "").trim();

    if (!name || !panel || !trigger) {
      throw new Error("Overlay registration requires a name, panel, and trigger.");
    }

    panel.classList.add("surface-overlay-panel");
    panel.dataset.overlayPanel = name;
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("tabindex", "-1");

    if (title) {
      panel.setAttribute("aria-label", title);
    }

    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", ensurePanelId(panel, name));

    // Built in one step so `close` is a function from the moment the record exists. The arrow
    // closes over `overlay` and is never called before this statement completes, so this is the
    // same object with the same close behaviour the two-step assignment produced.
    /** @type {BrowserOverlayHandle} */
    const overlay = {
      close: () => closeOverlay(state, overlay, { returnFocus: true }),
      host: state.host,
      name,
      panel,
      previousFocus: null,
      title,
      trigger,
    };

    state.overlays.set(name, overlay);
    return overlay;
  }

  /** @param {OverlayHostState} state @param {string} name @returns {void} */
  function toggleOverlay(state, name) {
    const overlay = state.overlays.get(name);

    if (!overlay) {
      return;
    }

    if (state.active?.name === name) {
      closeOverlay(state, overlay, { returnFocus: true });
      return;
    }

    openOverlay(state, overlay);
  }

  /** @param {OverlayHostState} state @param {BrowserOverlayHandle} overlay */
  function openOverlay(state, overlay) {
    closeActive(state);

    state.active = overlay;
    overlay.previousFocus = document.activeElement;
    overlay.panel.hidden = false;
    overlay.panel.dataset.overlayOpen = "true";
    overlay.trigger.setAttribute("aria-expanded", "true");
    positionOverlay(overlay);

    const controller = new global.AbortController();
    overlay.abortController = controller;

    document.addEventListener("keydown", (event) => handleKeydown(event, state, overlay), { signal: controller.signal });
    document.addEventListener("pointerdown", (event) => handlePointerDown(event, state, overlay), {
      capture: true,
      signal: controller.signal,
    });
    global.addEventListener("resize", () => positionOverlay(overlay), { signal: controller.signal });

    focusFirst(overlay.panel);
  }

  /** @param {OverlayHostState} state @returns {void} */
  function closeActive(state) {
    if (state.active) {
      closeOverlay(state, state.active, { returnFocus: false });
    }
  }

  /**
   * @param {OverlayHostState} state @param {BrowserOverlayHandle} overlay
   * @param {{ returnFocus: boolean }} options
   */
  function closeOverlay(state, overlay, { returnFocus }) {
    overlay.abortController?.abort();
    overlay.abortController = null;
    overlay.panel.hidden = true;
    overlay.panel.dataset.overlayOpen = "false";
    overlay.panel.classList.remove("surface-overlay-panel--bottom-sheet");
    overlay.panel.style.removeProperty("--overlay-anchor-left");
    overlay.panel.style.removeProperty("--overlay-anchor-top");
    overlay.panel.style.removeProperty("--overlay-anchor-width");
    overlay.trigger.setAttribute("aria-expanded", "false");

    if (state.active === overlay) {
      state.active = null;
    }

    if (returnFocus && canFocus(overlay.previousFocus)) {
      overlay.previousFocus.focus();
    }
  }

  /**
   * @param {KeyboardEvent} event @param {OverlayHostState} state
   * @param {BrowserOverlayHandle} overlay
   */
  function handleKeydown(event, state, overlay) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay(state, overlay, { returnFocus: true });
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event, overlay.panel);
    }
  }

  /**
   * @param {PointerEvent} event @param {OverlayHostState} state
   * @param {BrowserOverlayHandle} overlay
   */
  function handlePointerDown(event, state, overlay) {
    const target = nodeTarget(event.target);

    if (overlay.panel.contains(target) || overlay.trigger.contains(target)) {
      return;
    }

    closeOverlay(state, overlay, { returnFocus: false });
  }

  /** @param {KeyboardEvent} event @param {HTMLElement} panel */
  function trapFocus(event, panel) {
    const focusables = focusableElements(panel);

    if (focusables.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** @param {HTMLElement} panel */
  function focusFirst(panel) {
    const focusTarget = focusableElements(panel)[0] || panel;
    focusTarget.focus();
  }

  /**
   * The focusable descendants, in document order.
   *
   * The `.filter(canFocus)` is a narrowing rather than a change of set: every selector here
   * matches an element class that carries `focus`, so nothing the query can return is dropped.
   * @param {HTMLElement} panel @returns {Array<Element & { focus: () => void }>}
   */
  function focusableElements(panel) {
    return [...panel.querySelectorAll([
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(","))]
      .filter((element) => offsetParentOf(element) !== null || element === document.activeElement)
      .filter(canFocus);
  }

  /** @param {BrowserOverlayHandle} overlay */
  function positionOverlay(overlay) {
    if (global.matchMedia?.("(max-width: 700px)")?.matches) {
      overlay.panel.classList.add("surface-overlay-panel--bottom-sheet");
      overlay.panel.style.removeProperty("--overlay-anchor-left");
      overlay.panel.style.removeProperty("--overlay-anchor-top");
      overlay.panel.style.removeProperty("--overlay-anchor-width");
      return;
    }

    overlay.panel.classList.remove("surface-overlay-panel--bottom-sheet");

    const hostRect = overlay.host.getBoundingClientRect();
    const triggerRect = overlay.trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(triggerRect.left - hostRect.left, hostRect.width - 432));
    const top = Math.max(12, triggerRect.bottom - hostRect.top + 8);

    overlay.panel.style.setProperty("--overlay-anchor-left", `${Math.round(left)}px`);
    overlay.panel.style.setProperty("--overlay-anchor-top", `${Math.round(top)}px`);
    overlay.panel.style.setProperty("--overlay-anchor-width", `${Math.max(280, Math.round(triggerRect.width))}px`);
  }

  /** @param {HTMLElement} panel @param {string} name @returns {string} */
  function ensurePanelId(panel, name) {
    if (!panel.id) {
      panel.id = `overlay-panel-${name}-${Date.now()}`;
    }
    return panel.id;
  }

  /**
   * The published hook, annotated on the literal so the compiler checks membership in both
   * directions: a missing method fails, a second one fails as an unknown property, and a changed
   * signature fails. Left unfrozen, because it always has been.
   * @type {BrowserOverlayHost}
   */
  const overlayHostApi = {
    create,
  };

  root.overlayHost = overlayHostApi;
  global.LongtailForge = root;
}(window));
