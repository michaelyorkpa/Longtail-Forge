(function attachOverlayHost(global) {
  const root = global.LongtailForge || {};
  const registry = new WeakMap();

  function create(options = {}) {
    const host = options.host;

    if (!host || host.nodeType !== 1) {
      throw new Error("Overlay host requires a host element.");
    }

    let state = registry.get(host);
    if (!state) {
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

    const overlay = {
      close: null,
      host: state.host,
      name,
      panel,
      previousFocus: null,
      title,
      trigger,
    };

    overlay.close = () => closeOverlay(state, overlay, { returnFocus: true });
    state.overlays.set(name, overlay);
    return overlay;
  }

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

  function closeActive(state) {
    if (state.active) {
      closeOverlay(state, state.active, { returnFocus: false });
    }
  }

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

    if (returnFocus && overlay.previousFocus && typeof overlay.previousFocus.focus === "function") {
      overlay.previousFocus.focus();
    }
  }

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

  function handlePointerDown(event, state, overlay) {
    const target = event.target;

    if (overlay.panel.contains(target) || overlay.trigger.contains(target)) {
      return;
    }

    closeOverlay(state, overlay, { returnFocus: false });
  }

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

  function focusFirst(panel) {
    const focusTarget = focusableElements(panel)[0] || panel;
    focusTarget.focus();
  }

  function focusableElements(panel) {
    return [...panel.querySelectorAll([
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(","))].filter((element) => element.offsetParent !== null || element === document.activeElement);
  }

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

  function ensurePanelId(panel, name) {
    if (!panel.id) {
      panel.id = `overlay-panel-${name}-${Date.now()}`;
    }
    return panel.id;
  }

  root.overlayHost = {
    create,
  };
  global.LongtailForge = root;
}(window));
