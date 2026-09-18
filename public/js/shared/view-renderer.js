(function attachViewRenderer(global) {
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceElement} BrowserViewSurfaceElement */
  // 0.33.33.35.2 moved three responsibilities out of this file behind published contracts:
  // permission/route security, field option hydration, and descriptor data binding. They are
  // reached lazily through the namespace, the way every classic script reaches a sibling, and
  // none of them publishes onto the frozen `LongtailForge.view` factory.
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewActionSecurity} BrowserViewActionSecurity */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewDataBinding} BrowserViewDataBinding */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewSearchOptions} BrowserViewSearchOptions */

  const root = global.LongtailForge || {};
  const behaviors = new Map();

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
    const apiClient = root?.api;
    if (!apiClient) {
      throw new Error("View surface rendering requires LongtailForge.api.");
    }
    return apiClient;
  }
  function registerBehavior(id, handler) {
    const behaviorId = String(id || "").trim();
    if (!behaviorId) {
      throw new Error("View behaviors require an id.");
    }
    if (typeof handler !== "function") {
      throw new Error("View behaviors require a handler function.");
    }
    behaviors.set(behaviorId, handler);
    return () => behaviors.delete(behaviorId);
  }

  /**
   * @param {unknown} [deliveredDescriptor]
   * @param {{ appendChild?: HTMLElement["appendChild"] } | null} [host]
   */
  function renderSurface(deliveredDescriptor = {}, host) {
    const view = requireViewPrimitives();
    if (!host || typeof host.appendChild !== "function") {
      throw new Error("View surface rendering requires a host element.");
    }
    const descriptor = view.normalizeSurfaceDescriptor(deliveredDescriptor);

    clearHost(host);

    const state = {
      descriptor,
      /** @type {unknown} */
      actionError: null,
      /** @type {unknown} */
      error: null,
      filterValues: initialFilterValues(descriptor),
      loading: Boolean(descriptor.dataSource?.route),
      pendingMounts: [],
      /** @type {Record<string, unknown>[]} */
      records: [],
      /** @type {unknown} */
      selectedRecord: null,
      selectedRecordId: "",
      slideOutSidebarOpen: false,
      /** @type {HTMLElement | null} */
      surface: null,
      /** @type {HTMLElement | null} */
      body: null,
      view,
    };
    /** @type {Promise<unknown> | null} */
    let inFlightRefresh = null;
    const surface = view.createElement("section", {
      className: ["view-renderer-surface", `view-renderer-layout-${descriptor.layout || "single-column"}`],
      attrs: {
        "data-view-surface-id": descriptor.id || "",
        "data-view-layout": descriptor.layout || "single-column",
      },
    });
    state.surface = surface;

    const body = view.createElement("div", { className: "view-renderer-body" });
    state.body = body;
    const refresh = async () => {
      if (!descriptor.dataSource?.route) {
        return state.records;
      }
      if (inFlightRefresh) {
        return inFlightRefresh;
      }

      inFlightRefresh = (async () => {
        state.loading = true;
        state.actionError = null;
        state.error = null;
        renderInto(body, renderLayout(descriptor, view, state));
        try {
          state.records = await requireDataBinding()
            .loadBoundRecords(descriptor, state.filterValues, requireApiClient());
          state.selectedRecord = initialSelectedRecord(descriptor, state);
          state.selectedRecordId = recordId(state.selectedRecord);
        } catch (error) {
          state.records = [];
          state.selectedRecord = null;
          state.selectedRecordId = "";
          state.error = error;
        } finally {
          state.loading = false;
          renderInto(body, renderLayout(descriptor, view, state));
          flushMounts(state);
          inFlightRefresh = null;
        }

        return state.records;
      })();

      return inFlightRefresh;
    };

    for (const child of renderLayout(descriptor, view, state)) {
      body.appendChild(child);
    }

    surface.appendChild(body);
    Object.defineProperty(surface, "refresh", {
      configurable: true,
      enumerable: false,
      value: refresh,
    });
    Object.defineProperty(surface, "openModal", {
      configurable: true,
      enumerable: false,
      value: (/** @type {unknown} */ modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
    });
    Object.defineProperty(surface, "viewState", {
      configurable: true,
      enumerable: false,
      value: state,
    });

    if (!isSurfaceElement(surface)) {
      throw new Error("View surfaces must carry their refresh, modal, and state channels.");
    }

    host.appendChild(surface);
    flushMounts(state);
    if (descriptor.dataSource?.route) {
      refresh();
    }

    return surface;
  }

  function renderInto(parent, children) {
    clearHost(parent);
    for (const child of children) {
      parent.appendChild(child);
    }
  }

  function renderLayout(descriptor, view, state) {
    const children = [
      renderPageHeader(descriptor.pageHeader, view, state),
      renderActions(descriptor.actions, view, "Surface actions", state),
      renderDataStatus(state, view),
    ].filter(Boolean);

    if (descriptor.layout === "stacked") {
      children.splice(2, 0, renderFilters(descriptor.filters, view, state));
      const container = view.createElement("div", { className: "view-stacked" });
      container.appendChild(
        renderIndexPanel(descriptor.indexPanel, view, state) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view),
      );
      container.appendChild(view.createElement("section", {
        className: ["view-stacked-detail", "surface-main-panel"],
        attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
        children: renderDetailShell(descriptor.detail, view, state),
      }));
      children.push(container);
    } else if (descriptor.layout === "sidebar-detail") {
      const container = view.createElement("div", { className: "view-sidebar-detail" });
      const sidebar = view.createElement("aside", {
        className: "view-sidebar-detail-sidebar",
        attrs: { "aria-label": descriptor.sidebarLabel || "View controls" },
      });
      sidebar.append(...renderSidebarPanels(descriptor, view, state));
      container.appendChild(sidebar);
      container.appendChild(view.createElement("section", {
        className: ["view-sidebar-detail-primary", "surface-main-panel"],
        attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
        children: renderDetailShell(descriptor.detail, view, state),
      }));
      children.push(container);
    } else if (descriptor.layout === "slide-out-sidebar") {
      children.push(renderSlideOutSidebarLayout(descriptor, view, state));
    } else if (descriptor.layout === "table-page") {
      if (descriptor.filterPlacement === "slide-out-sidebar") {
        children.push(renderTablePageSlideOutLayout(descriptor, view, state));
      } else {
        children.splice(2, 0, renderFilters(descriptor.filters, view, state));
        children.push(...renderRegions(regionsForPlacement(descriptor.regions, "before-table"), view, state, state.selectedRecord));
        children.push(renderTableShell(descriptor.table, view, state));
        children.push(...renderDetailShell(descriptor.detail, view, state));
      }
    } else {
      children.splice(2, 0, renderFilters(descriptor.filters, view, state));
      children.push(renderIndexPanel(descriptor.indexPanel, view, state));
      children.push(renderTableShell(descriptor.table, view, state));
      children.push(...renderDetailShell(descriptor.detail, view, state));
    }

    children.push(...renderRegions(regionsForPlacement(descriptor.regions, "default"), view, state, state.selectedRecord));
    children.push(...renderModalShells(descriptor.modals, view));
    return children.filter(Boolean);
  }

  /**
   * @param {readonly ViewRegionDescriptor[] | undefined} regions
   * @param {string} placement
   */
  function regionsForPlacement(regions, placement) {
    const regionList = Array.isArray(regions) ? regions : [];
    if (placement === "default") {
      return regionList.filter((region) => !region.placement || region.placement === "default" || region.placement === "end");
    }
    return regionList.filter((region) => region.placement === placement);
  }

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderSlideOutSidebarLayout(descriptor, view, state) {
    const drawerId = `${descriptor.id || "view"}-slideout-sidebar`;
    const container = view.createElement("div", { className: "view-slideout-sidebar" });
    const trigger = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-toggle",
      icon: "filter",
      label: "Open filters and navigation",
    });
    const backdrop = view.createElement("div", {
      className: "view-slideout-sidebar-backdrop",
      attrs: {
        "aria-hidden": "true",
        "data-view-slideout-sidebar-backdrop": "",
      },
      hidden: true,
    });
    const drawer = view.createElement("aside", {
      id: drawerId,
      className: ["view-slideout-sidebar-drawer", "surface-drawer"],
      attrs: {
        "aria-hidden": "true",
        "aria-label": descriptor.sidebarLabel || "View controls",
        tabindex: "-1",
      },
    });
    const closeButton = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-close",
      icon: "close",
      label: "Close filters and navigation",
    });
    const headingId = `${drawerId}-title`;
    drawer.setAttribute("aria-labelledby", headingId);
    drawer.appendChild(view.createElement("header", {
      className: "view-slideout-sidebar-header",
      children: [
        view.createElement("h2", {
          id: headingId,
          className: "view-slideout-sidebar-title",
          text: descriptor.sidebarLabel || "View controls",
        }),
        closeButton,
      ],
    }));
    drawer.appendChild(view.createElement("div", {
      className: "view-slideout-sidebar-body",
      children: renderSidebarPanels(descriptor, view, state),
    }));
    const main = view.createElement("section", {
      className: ["view-slideout-sidebar-main", "surface-main-panel"],
      attrs: { "aria-label": descriptor.detail?.header?.title || "Detail" },
      children: renderDetailShell(descriptor.detail, view, state),
    });

    trigger.setAttribute("aria-controls", drawerId);
    closeButton.setAttribute("aria-controls", drawerId);

    container.append(trigger, backdrop, drawer, main);
    createSlideOutSidebarController({ backdrop, closeButton, drawer, trigger }, { state });

    return container;
  }

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderTablePageSlideOutLayout(descriptor, view, state) {
    const drawerId = `${descriptor.id || "view"}-slideout-sidebar`;
    const container = view.createElement("div", { className: "view-slideout-sidebar" });
    const trigger = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-toggle",
      icon: "filter",
      label: "Open filters",
    });
    const backdrop = view.createElement("div", {
      className: "view-slideout-sidebar-backdrop",
      attrs: {
        "aria-hidden": "true",
        "data-view-slideout-sidebar-backdrop": "",
      },
      hidden: true,
    });
    const drawer = view.createElement("aside", {
      id: drawerId,
      className: ["view-slideout-sidebar-drawer", "surface-drawer"],
      attrs: {
        "aria-hidden": "true",
        "aria-label": descriptor.sidebarLabel || "Filters",
        tabindex: "-1",
      },
    });
    const closeButton = createSlideOutSidebarButton(view, {
      className: "view-slideout-sidebar-close",
      icon: "close",
      label: "Close filters",
    });
    const headingId = `${drawerId}-title`;
    drawer.setAttribute("aria-labelledby", headingId);
    drawer.appendChild(view.createElement("header", {
      className: "view-slideout-sidebar-header",
      children: [
        view.createElement("h2", {
          id: headingId,
          className: "view-slideout-sidebar-title",
          text: descriptor.sidebarLabel || "Filters",
        }),
        closeButton,
      ],
    }));
    drawer.appendChild(view.createElement("div", {
      className: "view-slideout-sidebar-body",
      children: renderSidebarPanels(descriptor, view, state),
    }));
    const main = view.createElement("section", {
      className: ["view-slideout-sidebar-main", "surface-main-panel"],
      attrs: { "aria-label": descriptor.pageHeader?.title || "Records" },
      children: [
        ...renderRegions(regionsForPlacement(descriptor.regions, "before-table"), view, state, state.selectedRecord),
        renderTableShell(descriptor.table, view, state),
        ...renderDetailShell(descriptor.detail, view, state),
      ].filter(Boolean),
    });

    trigger.setAttribute("aria-controls", drawerId);
    closeButton.setAttribute("aria-controls", drawerId);

    container.append(trigger, backdrop, drawer, main);
    createSlideOutSidebarController({ backdrop, closeButton, drawer, trigger }, { state });

    return container;
  }

  /** @typedef {import("../../../src/types/framework-contracts.js").ViewFilterDescriptor} ViewFilterDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewIndexPanelDescriptor} ViewIndexPanelDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewItemRowsDescriptor} ViewItemRowsDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewDetailDescriptor} ViewDetailDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewRegionDescriptor} ViewRegionDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewSummaryPanelDescriptor} ViewSummaryPanelDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewSummaryPanelItemDescriptor} ViewSummaryPanelItemDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewItemFormDescriptor} ViewItemFormDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewVisibleWhenDescriptor} ViewVisibleWhenDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewSidebarPanelDescriptor} ViewSidebarPanelDescriptor */

  /**
   * One region or field-option mount, queued while a layout renders and flushed afterwards.
   *
   * Two producers build these - a filter field queues a control and its selected value, a region
   * queues a container and its record - and the flush reads every member before it tells them
   * apart by `mountType`. So the shape is one bag of optional members rather than a union, and
   * the container a region renders into is established where it is used instead.
   * @typedef {object} PendingMount
   * @property {{ behavior?: unknown, id?: unknown }} region
   * @property {HTMLElement} [container]
   * @property {Element} [control]
   * @property {unknown} [field]
   * @property {unknown} [mountType]
   * @property {unknown} [record]
   * @property {unknown} [selectedValue]
   */

  /**
   * The container a region mount renders its message into.
   *
   * Every region producer queues one, so this reports a capability failure rather than skipping
   * the message: a mount that cannot show why it failed must not fail silently.
   * @param {PendingMount} mount
   * @returns {HTMLElement}
   */
  function requireMountContainer(mount) {
    const container = mount.container;
    if (!container) {
      throw new Error("View region mounts require a container element.");
    }
    return container;
  }

  /**
   * A surface as this file holds it, which is not always a finished one.
   *
   * Every channel is optional because `renderSurface` installs them last, and because a helper
   * may legitimately be handed a partial context - a behaviour that needs none of them must not
   * be refused for their absence. The element members are optional for the same reason: a caller
   * may supply a stand-in that answers only what its own operation reads.
   * The three channels carry the shapes `renderSurface` installs. The element members carry the
   * DOM's own signatures, so a real element satisfies this shape exactly and a stand-in that
   * answers only what its operation reads satisfies it too.
   * @typedef {object} SurfaceUnderConstruction
   * @property {() => unknown} [refresh]
   * @property {(modalId: unknown, record?: unknown) => unknown} [openModal]
   * @property {unknown} [viewState]
   * @property {HTMLElement["appendChild"]} [appendChild]
   * @property {HTMLElement["querySelector"]} [querySelector]
   * @property {ChildNode | null} [firstChild]
   */

  /** The primitives every layout renderer is handed, derived from the checked accessor. */
  /** @typedef {ReturnType<typeof requireViewPrimitives>} ViewPrimitives */

  /**
   * The surface state, as `renderSurface` builds it and every renderer below reads it.
   *
   * It began as a partial view - what each renderer reads, so they could be typed one at a time
   * while the slot itself stayed untyped. `0.33.33.39.21` completed it: the state object
   * `renderSurface` builds is now this shape, and the five helpers that take it take it as this.
   * `descriptor` and `view` are required because `renderSurface` sets both before anything reads
   * them; everything else stays optional, because two of these renderers are also called with
   * `null` and because a renderer reads only its own few.
   *
   * `indexCollapsed` is written by `selectIndexRecord` and initialised nowhere - **a finding for
   * the state slot, not something this child repairs.**
   *
   * `surface` is a `SurfaceUnderConstruction`, not a finished `BrowserViewSurfaceElement`, and
   * that is the whole of `0.33.33.39.21`'s decision. `renderSurface` creates the element, stores
   * it here, renders through it, and only then installs `refresh`, `openModal` and `viewState` -
   * so for most of this file's work the slot holds an element that does not yet carry them. Each
   * helper therefore establishes the one capability its own operation uses, rather than assuming
   * the completed type. **The completed return contract is unchanged**: `renderSurface` installs
   * all three before publication and still proves it with `isSurfaceElement`.
   * @typedef {object} RendererState
   * @property {unknown} [actionError]
   * @property {HTMLElement | null} [body]
   * @property {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @property {unknown} [error]
   * @property {Record<string, unknown>} [filterValues]
   * @property {boolean} [indexCollapsed]
   * @property {boolean} [loading]
   * @property {PendingMount[]} pendingMounts
   * @property {readonly Record<string, unknown>[]} [records]
   * @property {unknown} [selectedRecord]
   * @property {unknown} [selectedRecordId]
   * @property {unknown} [slideOutSidebarOpen]
   * @property {SurfaceUnderConstruction | null} [surface]
   * @property {ViewPrimitives} view
   */

  /**
   * The layout descriptor fragments, on the same terms `0.33.33.39.8` set: `Partial`, because the
   * callers pass fragments, with each intersection naming a member the renderer reads that the
   * framework descriptor does not declare.
   * @typedef {Partial<ViewIndexPanelDescriptor> & { open?: unknown, title?: unknown }} DescriptorIndexPanel
   */

  /** @typedef {Partial<ViewSidebarPanelDescriptor> & { title?: unknown }} DescriptorSidebarPanel */

  /** @typedef {Partial<ViewItemRowsDescriptor>} DescriptorItemRows */

  /**
   * The four controls a slide-out sidebar wires.
   *
   * **The guard proves presence; the element type is this controller's own requirement.**
   * `createSlideOutSidebarController` checks that each carries `addEventListener` and throws by
   * name when one does not - that is the whole of what it verifies. It then calls `setAttribute`
   * on three of them, `focus` on one and reads `classList` and `hidden` on two, unguarded, and
   * has always done so. Naming them elements states that standing requirement rather than adding
   * a check for it; the published `BrowserViewSlideOutSidebarElements` keeps its `unknown`
   * members, because a caller is not obliged to know what this file requires.
   * @typedef {object} SlideOutSidebarElements
   * @property {HTMLElement} backdrop
   * @property {HTMLElement} closeButton
   * @property {HTMLElement} drawer
   * @property {HTMLElement} trigger
   */

  /**
   * The one flag the sidebar keeps. `unknown` rather than a boolean because the flag is read off
   * whatever surface state the host supplied, and `createSlideOutSidebarController` coerces it
   * on entry precisely because it may arrive as anything.
   * @typedef {object} SlideOutSidebarState
   * @property {unknown} [slideOutSidebarOpen]
   */

  /**
   * One focusable control inside the drawer.
   *
   * The query answers `Element`, which is the honest type for a selector: `[tabindex]` can match
   * a node that is not an HTML control. The three members the focus helpers read are therefore
   * **optional additions, not claims** - `disabled` is declared on no shared element type at all,
   * and `hidden` and `focus` exist on HTML elements but not on every `Element`. Each is read for
   * truthiness or called optionally, so a match without them behaves exactly as it does today.
   * @typedef {Element & { disabled?: unknown, hidden?: unknown, focus?: () => void }} SlideOutFocusTarget
   */

  /**
   * A table's secondary row. `title` is read as a label fallback and the framework descriptor
   * declares only `label`, so it joins the other members named here as findings.
   * @typedef {Partial<import("../../../src/types/framework-contracts.js").ViewTableSecondaryRowDescriptor> & { title?: unknown }} DescriptorSecondaryRow
   */

  /** @typedef {Partial<import("../../../src/types/framework-contracts.js").ViewTableSelectionDescriptor>} DescriptorSelection */

  /**
   * One column as this file hands it to `createDataTable`, which takes them as `unknown`.
   * The selection and row-action columns it prepends and appends carry no `header`, so the
   * member is optional here rather than absent from those two literals.
   * @typedef {object} RenderedTableColumn
   * @property {unknown} key
   * @property {unknown} label
   * @property {unknown} [align]
   * @property {unknown} [header]
   * @property {unknown} [render]
   */

  /** @typedef {Partial<ViewFilterDescriptor>} DescriptorFilter */

  /**
   * What the slide-out toggle is built from. Three text members, because two of them reach
   * `createIconButton`, which requires them, and the third is added as a class.
   * @typedef {object} SlideOutSidebarButtonOptions
   * @property {string} [className]
   * @property {string} [icon]
   * @property {string} [label]
   */

  /**
   * @param {ViewPrimitives} view
   * @param {SlideOutSidebarButtonOptions} [options]
   */
  function createSlideOutSidebarButton(view, options = {}) {
    let button = null;
    if (root.icons?.createIconButton) {
      try {
        button = root.icons.createIconButton({
          icon: options.icon,
          label: options.label,
          title: options.label,
        });
      } catch {
        button = null;
      }
    }
    if (!button) {
      button = view.createElement("button", {
        text: options.label || "Toggle sidebar",
        attrs: { type: "button" },
      });
    }
    button.classList.add(String(options.className));
    return button;
  }

  /**
   * The four checks below were one loop over the names, and are unrolled because a loop's guard
   * cannot narrow the member it checked. Each is the same test on the same member in the same
   * order, throwing the same message; `controls` then carries the four the guard just proved.
   * @param {Partial<SlideOutSidebarElements>} [elements]
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSlideOutSidebarOptions} [options]
   */
  function createSlideOutSidebarController(elements = {}, options = {}) {
    if (!elements.backdrop?.addEventListener) {
      throw new Error("Slide-out sidebar controllers require a backdrop element.");
    }
    if (!elements.closeButton?.addEventListener) {
      throw new Error("Slide-out sidebar controllers require a closeButton element.");
    }
    if (!elements.drawer?.addEventListener) {
      throw new Error("Slide-out sidebar controllers require a drawer element.");
    }
    if (!elements.trigger?.addEventListener) {
      throw new Error("Slide-out sidebar controllers require a trigger element.");
    }

    /** @type {SlideOutSidebarElements} */
    const controls = {
      backdrop: elements.backdrop,
      closeButton: elements.closeButton,
      drawer: elements.drawer,
      trigger: elements.trigger,
    };
    /** @type {SlideOutSidebarState} */
    const state = options.state || { slideOutSidebarOpen: Boolean(options.open) };
    state.slideOutSidebarOpen = Boolean(state.slideOutSidebarOpen);
    wireSlideOutSidebar(state, controls);
    syncSlideOutSidebarState(state, controls, { focus: false });

    // `isOpen` was an enumerable accessor installed with `Object.defineProperty`, which is the
    // same property a literal getter declares once the object is frozen - and unlike the
    // defineProperty form it is part of the object's type.
    const controller = {
      close: (syncOptions = {}) => setSlideOutSidebarOpen(state, controls, false, syncOptions),
      get isOpen() {
        return Boolean(state.slideOutSidebarOpen);
      },
      open: (syncOptions = {}) => setSlideOutSidebarOpen(state, controls, true, syncOptions),
      sync: (syncOptions = {}) => syncSlideOutSidebarState(state, controls, syncOptions),
      toggle: (syncOptions = {}) => setSlideOutSidebarOpen(state, controls, !state.slideOutSidebarOpen, syncOptions),
    };
    return Object.freeze(controller);
  }

  /**
   * @param {SlideOutSidebarState} state
   * @param {SlideOutSidebarElements} elements
   */
  function wireSlideOutSidebar(state, elements) {
    const close = () => setSlideOutSidebarOpen(state, elements, false);
    const toggle = () => setSlideOutSidebarOpen(state, elements, !state.slideOutSidebarOpen);
    const closeOnEscape = (/** @type {KeyboardEvent} */ event) => {
      if (event?.key === "Escape" && state.slideOutSidebarOpen) {
        event.preventDefault?.();
        close();
      }
    };
    const containDrawerFocus = (/** @type {KeyboardEvent} */ event) => {
      if (event?.key === "Tab" && state.slideOutSidebarOpen) {
        containSlideOutSidebarFocus(event, elements.drawer);
      }
    };

    elements.trigger.addEventListener("click", toggle);
    elements.closeButton.addEventListener("click", close);
    elements.backdrop.addEventListener("click", close);
    elements.drawer.addEventListener("keydown", closeOnEscape);
    elements.drawer.addEventListener("keydown", containDrawerFocus);
    elements.trigger.addEventListener("keydown", closeOnEscape);
    elements.backdrop.addEventListener("keydown", closeOnEscape);
    elements.drawer.addEventListener("transitionend", () => {
      if (state.slideOutSidebarOpen) {
        focusSlideOutSidebar(elements.drawer);
      }
    });

    elements.trigger.setAttribute("data-view-slideout-sidebar-trigger", "");
    elements.closeButton.setAttribute("data-view-slideout-sidebar-close", "");
  }

  /**
   * @param {SlideOutSidebarState} state
   * @param {SlideOutSidebarElements} elements
   * @param {unknown} open
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSlideOutSidebarSyncOptions} [options]
   */
  function setSlideOutSidebarOpen(state, elements, open, options = {}) {
    state.slideOutSidebarOpen = Boolean(open);
    syncSlideOutSidebarState(state, elements, { focus: options.focus !== false });
  }

  /**
   * @param {SlideOutSidebarState} state
   * @param {SlideOutSidebarElements} elements
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSlideOutSidebarSyncOptions} [options]
   */
  function syncSlideOutSidebarState(state, elements, options = {}) {
    const open = Boolean(state.slideOutSidebarOpen);
    elements.trigger.setAttribute("aria-expanded", String(open));
    elements.trigger.setAttribute("aria-pressed", String(open));
    elements.closeButton.setAttribute("aria-expanded", String(open));
    elements.drawer.setAttribute("aria-hidden", String(!open));
    setElementHidden(elements.backdrop, !open);
    setElementClass(elements.drawer, "is-open", open);
    setElementClass(elements.backdrop, "is-open", open);
    setElementClass(global.document?.body, "view-slideout-sidebar-lock", open);

    if (options.focus !== false) {
      if (open) {
        focusSlideOutSidebar(elements.drawer);
      } else {
        elements.trigger.focus?.();
      }
    }
  }

  /**
   * @param {HTMLElement | null | undefined} element
   * @param {unknown} hidden
   */
  function setElementHidden(element, hidden) {
    if (!element) {
      return;
    }
    element.hidden = Boolean(hidden);
    if (hidden) {
      element.setAttribute?.("hidden", "");
    } else {
      element.removeAttribute?.("hidden");
    }
  }

  /**
   * @param {Element | null | undefined} element
   * @param {string} className
   * @param {unknown} active
   */
  function setElementClass(element, className, active) {
    if (!element?.classList) {
      return;
    }
    if (typeof element.classList.toggle === "function") {
      element.classList.toggle(className, Boolean(active));
      return;
    }
    if (active) {
      element.classList.add(className);
    } else if (typeof element.classList.remove === "function") {
      element.classList.remove(className);
    }
  }

  /** @param {SlideOutFocusTarget | null | undefined} drawer */
  function focusSlideOutSidebar(drawer) {
    /** @type {SlideOutFocusTarget | null | undefined} */
    const focusTarget = slideOutSidebarFocusTargets(drawer)[0]
      || drawer?.querySelector?.("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      || drawer;
    focusTarget?.focus?.();
  }

  /**
   * @param {KeyboardEvent} event
   * @param {SlideOutFocusTarget | null | undefined} drawer
   */
  function containSlideOutSidebarFocus(event, drawer) {
    const focusTargets = slideOutSidebarFocusTargets(drawer);
    if (focusTargets.length === 0) {
      event.preventDefault?.();
      drawer?.focus?.();
      return;
    }

    /** @type {SlideOutFocusTarget | null | undefined} */
    const activeElement = global.document?.activeElement;
    const first = focusTargets[0];
    const last = focusTargets[focusTargets.length - 1];
    if (event.shiftKey && (activeElement === first || activeElement === drawer)) {
      event.preventDefault?.();
      last.focus?.();
    } else if (!event.shiftKey && (activeElement === last || !(activeElement && focusTargets.includes(activeElement)))) {
      event.preventDefault?.();
      first.focus?.();
    }
  }

  /**
   * @param {SlideOutFocusTarget | null | undefined} drawer
   * @returns {SlideOutFocusTarget[]}
   */
  function slideOutSidebarFocusTargets(drawer) {
    if (!drawer?.querySelectorAll) {
      return [];
    }
    /** @type {SlideOutFocusTarget[]} */
    const matches = [...drawer.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
    return matches
      .filter((element) => !element.disabled && !element.hidden && element.getAttribute?.("aria-hidden") !== "true");
  }

  function renderPageHeader(pageHeader, view, state) {
    if (!pageHeader) {
      return null;
    }

    const primaryAction = pageHeader.primaryAction || null;
    return view.createPageHeader({
      title: pageHeader.title || pageHeader.label || "Untitled view",
      subtitle: pageHeader.description,
      actions: primaryAction ? [normalizeAction(primaryAction, state)] : [],
    });
  }

  /**
   * @param {readonly DescriptorFilter[] | null | undefined} filters
   * @param {ViewPrimitives} view
   * @param {RendererState | null} [state]
   * @param {Record<string, unknown>} [options]
   */
  function renderFilters(filters, view, state = null, options = {}) {
    if (!Array.isArray(filters) || filters.length === 0) {
      return null;
    }

    const panel = view.createFilterPanel({
      title: options.title || "Filters",
      open: options.open === true,
      fields: filters.map((filter) => renderFieldShell(filter, view, { disabled: true })),
    });
    const fieldGrid = panel.querySelector(".view-filter-panel-fields");
    const form = renderFilterForm(filters, view, state, fieldGrid?.className || "view-filter-panel-fields");
    replaceNode(fieldGrid, form);

    return panel;
  }

  /**
   * @param {readonly DescriptorFilter[]} filters
   * @param {ViewPrimitives} view
   * @param {RendererState | null} [state]
   * @param {string} [className]
   */
  function renderFilterForm(filters, view, state = null, className = "view-filter-panel-fields") {
    const form = view.createElement("form", {
      className,
      attrs: {
        "data-view-filter-form": "",
      },
    });
    form.append(...filters.map((filter) => renderFieldShell(filter, view, {
      value: state ? state.filterValues?.[String(filter.field || filter.id)] : undefined,
    })));

    if (state) {
      /** @param {Event} [event] */
      const applyFilters = (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        collectFilterValues(form, filters, state);
        if (state.surface?.refresh) {
          state.surface.refresh();
        }
      };
      form.addEventListener("change", applyFilters);
      form.addEventListener("submit", applyFilters);
      queueFieldOptionSourceMounts(form, filters, state);
    }

    return form;
  }

  function queueFieldOptionSourceMounts(form, fields, state) {
    for (const field of (Array.isArray(fields) ? fields : [])) {
      if (!field?.optionsSource) {
        continue;
      }
      const controlId = field.field || field.id;
      if (!controlId) {
        continue;
      }
      const control = form.querySelector?.(`[data-view-input="${controlId}"]`);
      if (!control) {
        continue;
      }
      state.pendingMounts.push({
        control,
        field,
        mountType: "fieldOptions",
        region: {
          id: field.id || field.field,
          behavior: field.optionsSource,
        },
        selectedValue: state.filterValues?.[controlId] ?? field.default ?? control.value,
      });
    }
  }

  function collectFilterValues(form, filters, state) {
    if (!state.filterValues) {
      state.filterValues = {};
    }
    for (const filter of filters) {
      const key = filter.field || filter.id;
      if (!key) {
        continue;
      }
      const control = form.querySelector?.(`[data-view-input="${key}"]`);
      if (control) {
        state.filterValues[key] = filterControlValue(control, form, key);
      }
    }
  }

  function filterControlValue(control, form = null, fieldKey = "") {
    if (control.type === "checkbox") {
      return Boolean(control.checked);
    }
    if (control.type === "radio") {
      const controls = form?.querySelectorAll?.(`[data-view-input="${fieldKey}"]`) || [control];
      return [...controls].find((candidate) => candidate.checked)?.value || "";
    }
    if (control.multiple) {
      return [...control.selectedOptions].map((option) => option.value);
    }
    if (control.dataset?.viewSearchOptions === "true") {
      const submitMode = control.dataset.viewSearchSubmitMode || "input";
      const selectedLabel = control.dataset.viewSearchOptionLabel || "";
      const selectedValue = control.dataset.viewSearchOptionValue || "";
      const hasSelectedOption = Boolean(selectedValue) && control.value === selectedLabel;
      if (submitMode === "option-value") {
        return hasSelectedOption ? selectedValue : "";
      }
      if (submitMode === "option-or-input") {
        return hasSelectedOption ? selectedValue : control.value;
      }
    }
    return control.value;
  }

  function initialFilterValues(descriptor) {
    const values = {};
    for (const filter of (Array.isArray(descriptor.filters) ? descriptor.filters : [])) {
      const key = filter.field || filter.id;
      if (key && filter.default !== undefined) {
        values[key] = filter.default;
      }
    }
    return values;
  }

  function renderDataStatus(state, view) {
    if (state.loading) {
      return view.createStatusMessage({
        message: "Loading records...",
        tone: "info",
      });
    }

    if (state.error) {
      return view.createStatusMessage({
        message: state.error.message || "Records could not be loaded.",
        tone: "danger",
      });
    }

    if (state.actionError) {
      return view.createStatusMessage({
        message: state.actionError.message || "Action could not be completed.",
        tone: "danger",
      });
    }

    return null;
  }

  /**
   * @param {DescriptorIndexPanel | null | undefined} indexPanel
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   * @param {Record<string, unknown>} [options]
   */
  function renderIndexPanel(indexPanel, view, state, options = {}) {
    if (!indexPanel) {
      return null;
    }

    return view.createCollapsibleIndexPanel({
      title: options.title || indexPanel.title || indexPanel.label || "Index",
      body: renderIndexPanelBody(indexPanel, view, state, options),
      open: state.indexCollapsed ? false : (options.open ?? indexPanel.open),
      className: options.className,
      footer: options.footer,
      footerClassName: options.footerClassName,
    });
  }

  /**
   * `indexPanel` is never absent here: `renderIndexPanel` returns before calling this for a
   * missing panel, and the sidebar's index branch does the same, so the parameter says so.
   * @param {DescriptorIndexPanel} indexPanel
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   * @param {Record<string, unknown>} [options]
   */
  function renderIndexPanelBody(indexPanel, view, state, options = {}) {
    const records = state.records || [];
    const title = options.title || indexPanel?.title || indexPanel?.label || "Index";
    return records.length > 0
      ? [view.createIndexList({
        ariaLabel: title,
        items: records.map((record) => buildIndexItem(indexPanel, record, state)),
      })]
      : [
        renderPlaceholder(
          indexPanel?.emptyState?.title || "No records",
          indexPanel?.emptyState,
          view,
        ),
      ];
  }

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderSidebarPanels(descriptor, view, state) {
    if (!Array.isArray(descriptor.sidebarPanels) || descriptor.sidebarPanels.length === 0) {
      return [
        renderFilters(descriptor.filters, view, state),
        descriptor.indexPanel
          ? renderIndexPanel(descriptor.indexPanel, view, state) || renderPlaceholder("Index", descriptor.indexPanel?.emptyState, view)
          : null,
      ].filter(Boolean);
    }

    return descriptor.sidebarPanels
      .map((panel) => renderSidebarPanel(panel, descriptor, view, state))
      .filter(Boolean);
  }

  /**
   * @param {ViewSidebarPanelDescriptor} panel
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderSidebarPanel(panel, descriptor, view, state) {
    const panelType = panel.type || "navigation";
    if (!panel.id) {
      return null;
    }

    if (panelType === "filters") {
      return renderSidebarPanelShell(panel, view, {
        body: [renderFilterForm(descriptor.filters || [], view, state)],
        fallbackTitle: "Filters",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    if (panelType === "index") {
      if (!descriptor.indexPanel) {
        return null;
      }
      return renderSidebarPanelShell(panel, view, {
        body: renderIndexPanelBody(descriptor.indexPanel, view, state, {
          title: panel.title || panel.label,
        }),
        fallbackTitle: descriptor.indexPanel.title || descriptor.indexPanel.label || "Index",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    if (panelType === "navigation") {
      const body = [];
      if (panel.behavior) {
        const mountTarget = view.createElement("div", {
          className: "view-sidebar-panel-region",
          attrs: { "data-view-sidebar-panel-region": panel.id },
        });
        state.pendingMounts.push({ region: panel, container: mountTarget, record: state.selectedRecord });
        body.push(mountTarget);
      } else {
        body.push(renderPlaceholder(panel.title || panel.label || "Panel", panel.emptyState, view));
      }
      return renderSidebarPanelShell(panel, view, {
        body,
        fallbackTitle: "Navigation",
        footer: renderSidebarPanelFooter(panel, view, state),
      });
    }

    return null;
  }

  /**
   * @param {DescriptorSidebarPanel} panel
   * @param {ViewPrimitives} view
   * @param {Record<string, unknown>} [options]
   */
  function renderSidebarPanelShell(panel, view, options = {}) {
    const title = panel.title || panel.label || options.fallbackTitle || "Panel";
    const body = (Array.isArray(options.body) ? options.body : [options.body]).filter(Boolean);
    const footer = normalizeSidebarPanelFooter(options.footer);
    const className = [
      "view-sidebar-panel",
      panel.type ? `view-sidebar-panel--${panel.type}` : "",
      panel.className,
    ];
    const dataset = {
      viewSidebarPanel: panel.id,
      viewSidebarPanelType: panel.type || "navigation",
    };

    if (panel.collapsible === false) {
      const section = view.createElement("section", {
        className: [...className, "surface-main-panel"],
        dataset,
        attrs: panel.ariaLabel ? { "aria-label": panel.ariaLabel } : {},
      });
      section.appendChild(view.createElement("h3", {
        className: "view-sidebar-panel-title",
        text: title,
      }));
      section.appendChild(view.createElement("div", {
        className: "view-sidebar-panel-body",
        children: body,
      }));
      if (footer) {
        section.appendChild(view.createElement("div", {
          className: ["view-sidebar-panel-footer", "view-collapsible-index-footer"],
          children: footer,
        }));
      }
      return section;
    }

    const details = view.createCollapsibleIndexPanel({
      title,
      body,
      open: panel.open !== false,
      className: className.filter(Boolean).join(" "),
      ariaLabel: panel.ariaLabel,
      footer,
      footerClassName: "view-sidebar-panel-footer",
    });
    details.dataset.viewSidebarPanel = panel.id;
    details.dataset.viewSidebarPanelType = panel.type || "navigation";
    return details;
  }

  /**
   * @param {ViewSidebarPanelDescriptor} panel
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderSidebarPanelFooter(panel, view, state) {
    if (!panel.footer) {
      return [];
    }

    const footer = panel.footer;
    const children = [];
    const label = footer.title || footer.label || footer.description;
    if (label) {
      children.push(view.createElement("span", {
        className: "view-sidebar-panel-footer-text",
        text: label,
      }));
    }
    if (footer.behavior) {
      const footerRegion = {
        ...footer,
        id: footer.id || `${panel.id}-footer`,
      };
      const mountTarget = view.createElement("div", {
        className: "view-sidebar-panel-footer-region",
        attrs: { "data-view-sidebar-panel-footer": footerRegion.id },
      });
      state.pendingMounts.push({ region: footerRegion, container: mountTarget, record: state.selectedRecord });
      children.push(mountTarget);
    }
    return children;
  }

  /** @param {unknown} footer */
  function normalizeSidebarPanelFooter(footer) {
    if (!footer || (Array.isArray(footer) && footer.length === 0)) {
      return null;
    }
    return footer;
  }

  /**
   * @param {DescriptorIndexPanel} indexPanel
   * @param {Record<string, unknown>} record
   * @param {RendererState} state
   */
  function buildIndexItem(indexPanel, record, state) {
    const title = readDescriptorValue(record, indexPanel.itemTitleField, record.title || record.label || record.id || "Record");
    const subtitle = readDescriptorValue(record, indexPanel.itemSubtitleField, "");
    const meta = (indexPanel.itemMetaFields || [])
      .map((field) => readDescriptorValue(record, field, ""))
      .filter(Boolean);

    return {
      id: record.id || "",
      label: title,
      meta: [subtitle, ...meta].filter(Boolean),
      depth: readDescriptorValue(record, indexPanel.itemDepthField, 0),
      parentId: readDescriptorValue(record, indexPanel.itemParentField, ""),
      path: readDescriptorValue(record, indexPanel.itemPathField, ""),
      selected: recordId(record) === state.selectedRecordId,
      onSelect: () => selectIndexRecord(state, record),
    };
  }

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewSurfaceDescriptor} descriptor
   * @param {RendererState} state
   */
  function initialSelectedRecord(descriptor, state) {
    const records = state.records || [];
    // `(indexPanel || {}).initialSelection` and `indexPanel?.initialSelection` answer the same
    // value for every panel, present or not; only the second names the member it reads.
    if (descriptor.indexPanel?.initialSelection === "none") {
      return null;
    }
    if (state.selectedRecordId) {
      return records.find((record) => recordId(record) === state.selectedRecordId) || records[0] || null;
    }
    return records[0] || null;
  }

  /**
   * @param {RendererState} state
   * @param {unknown} record
   */
  function selectIndexRecord(state, record) {
    state.selectedRecord = record || null;
    state.selectedRecordId = recordId(record);
    if (state.descriptor.indexPanel?.collapseOnSelect) {
      state.indexCollapsed = true;
    }
    if (state.body) {
      renderInto(state.body, renderLayout(state.descriptor, state.view, state));
      flushMounts(state);
    }
  }

  /**
   * A record this file reads members off without having proved any of them.
   *
   * Every consumer here is handed whatever the data source answered, so the proof answers what
   * the optional chaining it replaced answered: `undefined` for every member of a non-record.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isDescriptorRecord(value) {
    return value !== null && typeof value === "object";
  }

  /** @param {unknown} record @returns {string} */
  function recordId(record) {
    const fields = isDescriptorRecord(record) ? record : {};
    return String(fields.id || fields.record_id || fields.list_id || fields.note_id || "");
  }

  /**
   * @param {DescriptorTable | null | undefined} table
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderTableShell(table, view, state) {
    if (!table) {
      return null;
    }

    const emptyState = table.emptyState || {};
    const columns = tableColumns(table, view, state);
    return view.createDataTable({
      caption: table.title || "",
      hierarchy: table.hierarchy,
      columns,
      secondaryRows: tableSecondaryRows(table, view),
      rows: state.records || [],
      emptyMessage: emptyState.message || emptyState.description || emptyState.title || "No records found.",
    });
  }

  /**
   * @param {DescriptorTable} table
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function tableColumns(table, view, state) {
    /** @type {RenderedTableColumn[]} */
    const columns = (table.columns || []).map((column) => ({
      key: column.field || column.id,
      label: column.label || column.field || column.id || "",
      align: column.align,
      header: column.header,
      render: tableColumnRenderer(column, table, view),
    }));
    const selection = tableSelection(table);
    if (selection) {
      columns.unshift({
        key: "__view_row_selection",
        label: Object.hasOwn(selection, "headerLabel") ? selection.headerLabel : selection.label || "Select",
        align: "center",
        render: (/** @type {unknown} */ record) => renderRowSelection(selection, view, record),
      });
    }
    const rowActions = Array.isArray(table.rowActions) ? table.rowActions : [];
    if (rowActions.length > 0) {
      columns.push({
        key: "__view_row_actions",
        label: Object.hasOwn(table, "rowActionsHeaderLabel") ? table.rowActionsHeaderLabel : "Actions",
        align: "right",
        render: (/** @type {unknown} */ record) => renderActions(rowActions, view, "Row actions", state, record),
      });
    }
    return columns;
  }

  /**
   * @param {DescriptorTable} table
   * @param {ViewPrimitives} view
   */
  function tableSecondaryRows(table, view) {
    return (Array.isArray(table.secondaryRows) ? table.secondaryRows : []).map((row) => ({
      id: row.id,
      className: row.className,
      startColumn: row.startColumn,
      endBeforeColumn: row.endBeforeColumn,
      hideWhenEmpty: row.hideWhenEmpty !== false,
      render: (/** @type {unknown} */ record) => renderTableSecondaryRow(row, view, record),
    }));
  }

  /**
   * @param {DescriptorSecondaryRow} row
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderTableSecondaryRow(row, view, record) {
    const hasValue = descriptorHasValue(readDescriptorValue(record, row.chipsField || row.field || row.id, []));
    if (!hasValue && row.hideWhenEmpty !== false) {
      return null;
    }

    const body = row.formatter === "chip-list"
      ? renderChipList(row, view, record)
      : view.createElement("span", {
          className: "view-table-secondary-row-value",
          text: readDescriptorValue(record, row.field || row.id, ""),
        });
    const label = row.label || row.title || "";
    return view.createElement("div", {
      className: "view-table-secondary-row-content",
      children: [
        label ? view.createElement("span", { className: "view-table-secondary-row-label", text: label }) : null,
        body,
      ].filter(Boolean),
    });
  }

  /** @param {unknown} value */
  function descriptorHasValue(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.some((item) => item !== null && item !== undefined && item !== false && item !== "");
  }

  /**
   * @param {DescriptorTable} [table]
   * @returns {DescriptorSelection | null}
   */
  function tableSelection(table = {}) {
    if (!table.selection || table.selection.enabled === false) {
      return null;
    }
    return table.selection;
  }

  /**
   * @param {DescriptorSelection} selection
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderRowSelection(selection, view, record) {
    const id = recordId(record);
    const labelField = selection.labelField || "name";
    const recordLabel = readDescriptorValue(record, labelField, readDescriptorValue(record, "displayLabel", id));
    return view.createElement("input", {
      className: "view-row-select",
      attrs: {
        type: "checkbox",
        value: id,
        "aria-label": `${selection.label || "Select"} ${recordLabel || id}`.trim(),
        "data-view-row-select": "",
      },
      dataset: {
        viewRowSelectId: id,
        viewRowSelectType: selection.recordType || "",
      },
    });
  }

  /**
   * @param {DescriptorColumn} column
   * @param {DescriptorTable} table
   * @param {ViewPrimitives} view
   */
  function tableColumnRenderer(column = {}, table = {}, view) {
    if (column.formatter === "hierarchy-label") {
      return (/** @type {unknown} */ record) => renderHierarchyLabel(column, table, view, record);
    }
    if (column.formatter === "chip-list") {
      return (/** @type {unknown} */ record) => renderChipList(column, view, record);
    }
    return undefined;
  }

  /**
   * @param {DescriptorColumn} column
   * @param {DescriptorTable | null | undefined} table
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderHierarchyLabel(column, table, view, record) {
    const value = readDescriptorValue(record, column.field || column.id, "");
    const depthField = column.depthField || table?.hierarchy?.depthField;
    const depth = normalizedHierarchyDepth(readDescriptorValue(record, depthField, 0));
    return view.createElement("span", {
      className: "view-hierarchy-label",
      text: value,
      attrs: depth > 0 ? { style: `--view-hierarchy-depth: ${depth};` } : {},
      dataset: depth > 0 ? { viewHierarchyDepth: depth } : {},
    });
  }

  /**
   * Called with a column and with a secondary row, which is why the parameter is the union:
   * `tableColumnRenderer` routes a chip-list column here, and `renderTableSecondaryRow` routes
   * a chip-list row here.
   * @param {DescriptorColumn | DescriptorSecondaryRow} column
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderChipList(column, view, record) {
    const chips = readDescriptorValue(record, column.chipsField || column.field || column.id, []);
    const chipList = Array.isArray(chips) ? chips : [chips];
    return view.createElement("span", {
      className: ["view-table-chip-list", "surface-chip-row"],
      children: chipList
        .filter((chip) => chip !== null && chip !== undefined && chip !== false && chip !== "")
        .map((chip) => view.createElement("span", {
          className: "surface-chip",
          text: chipDisplayLabel(chip, column.chipLabelField),
        })),
    });
  }

  /**
   * @param {unknown} chip
   * @param {unknown} labelField
   * @returns {string}
   */
  function chipDisplayLabel(chip, labelField) {
    if (isDescriptorRecord(chip)) {
      return String(readDescriptorValue(chip, labelField || "label", chip.name || chip.title || chip.value || chip.id || ""));
    }
    return String(chip ?? "");
  }

  /** @param {unknown} value @returns {number} */
  function normalizedHierarchyDepth(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 12);
  }

  /**
   * @param {ViewDetailDescriptor | undefined} detail
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderDetailShell(detail, view, state) {
    if (!detail) {
      return [];
    }

    const children = [
      renderDetailHeader(detail.header, view, state.selectedRecord),
      renderActions(detail.actionStrip?.actions, view, detail.actionStrip?.label || "Detail actions", state),
      renderSummaryPanels(detail.summaryPanels, view, state.selectedRecord),
      renderFieldGridShell(detail.itemForm, view, state.selectedRecord),
      detail.itemRows
        ? renderItemCollection(detail.itemRows, view, state) ||
          (!state.selectedRecord ? renderPlaceholder("Items", detail.itemRows.emptyState || detail.emptyState, view) : null)
        : null,
      ...renderRegions(detail.regions, view, state, state.selectedRecord),
    ];

    return children.flat().filter(Boolean);
  }

  /**
   * @param {readonly ViewRegionDescriptor[] | undefined} regions
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   * @param {unknown} record
   */
  function renderRegions(regions, view, state, record) {
    if (!Array.isArray(regions) || regions.length === 0) {
      return [];
    }

    return regions.map((region) => {
      const container = view.createElement("section", {
        className: ["view-region", "surface-main-panel", region.className],
        attrs: {
          "data-view-region": region.id || "",
          ...(region.ariaLabel ? { "aria-label": region.ariaLabel } : {}),
        },
      });
      if (region.title || region.label) {
        container.appendChild(view.createElement("h3", {
          className: "view-region-title",
          text: region.title || region.label,
        }));
      }
      const mountTarget = view.createElement("div", {
        className: "view-region-body",
        attrs: { "data-view-region-body": region.id || "" },
      });
      container.appendChild(mountTarget);
      if (region.behavior) {
        state.pendingMounts.push({ region, container: mountTarget, record });
      }
      return container;
    });
  }

  /**
   * The message a failed mount shows.
   *
   * `catch` hands over whatever was thrown, and this answers what `error?.message ||` answered:
   * a record's own message when it has one, and the fallback for everything else - a thrown
   * string, a thrown number, or nothing at all.
   *
   * The `String` is the coercion both consumers already performed. `setFieldOptionsError` writes
   * the message into a control's dataset and the region path hands it to `createElement`'s `text`,
   * so a truthy non-string message reached the page as its own digits either way; declaring the
   * return `string` only stops the published `message?: string` from being handed a number.
   * @param {unknown} error
   * @param {string} fallback
   * @returns {string}
   */
  function mountFailureMessage(error, fallback) {
    const message = isDescriptorRecord(error) ? error.message : undefined;
    return message ? String(message) : fallback;
  }

  /** @param {RendererState} state */
  function flushMounts(state) {
    const pending = state.pendingMounts || [];
    state.pendingMounts = [];
    for (const mount of pending) {
      const handler = behaviors.get(mount.region.behavior);
      if (!handler) {
        if (mount.mountType === "fieldOptions") {
          requireSearchOptions().setFieldOptionsError(mount.control, `Missing view behavior handler: ${mount.region.behavior}`);
        } else {
          requireMountContainer(mount).appendChild(state.view.createElement("p", {
            className: ["view-region-error", "view-status-message"],
            text: `Missing view behavior handler: ${mount.region.behavior}`,
            attrs: { role: "alert" },
          }));
        }
        continue;
      }
      try {
        const result = handler({
          action: null,
          api: root.api || {},
          container: mount.container,
          control: mount.control,
          field: mount.field,
          openModal: (/** @type {unknown} */ modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
          record: mount.record,
          refresh: state.surface?.refresh,
          region: mount.region,
          mountSearchOptions: (/** @type {unknown[]} */ options, optionsConfig = {}) => requireSearchOptions().mountSearchOptions(mount.control, options, {
            ...optionsConfig,
            selectedValue: mount.selectedValue,
          }),
          setOptions: (/** @type {unknown[]} */ options, optionsConfig = {}) => requireSearchOptions()
            .setFieldOptions(mount.control, options, mount.selectedValue, optionsConfig),
          workspaceContext: root.workspaceContext || {},
        });
        if (mount.mountType === "fieldOptions") {
          Promise.resolve(result)
            .then((options) => {
              if (Array.isArray(options)) {
                requireSearchOptions().setFieldOptions(mount.control, options, mount.selectedValue);
              }
            })
            .catch((error) => requireSearchOptions()
              .setFieldOptionsError(mount.control, mountFailureMessage(error, "Options could not be loaded.")));
        }
      } catch (error) {
        if (mount.mountType === "fieldOptions") {
          requireSearchOptions().setFieldOptionsError(mount.control, mountFailureMessage(error, "Options could not be loaded."));
        } else {
          requireMountContainer(mount).appendChild(state.view.createElement("p", {
            className: ["view-region-error", "view-status-message"],
            text: mountFailureMessage(error, "Region could not be mounted."),
            attrs: { role: "alert" },
          }));
        }
      }
    }
  }

  /**
   * @param {ViewDetailDescriptor["header"]} header
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderDetailHeader(header, view, record) {
    if (!header) {
      return null;
    }

    const badges = Array.isArray(header.badges)
      ? header.badges.map((badge) => view.createElement("span", {
        className: "surface-chip",
        text: readDescriptorValue(record, badge.field, badge.label || badge.value || ""),
      }))
      : [];

    return view.createDetailHeader({
      title: readDescriptorValue(record, header.titleField, header.title || header.label || "Detail"),
      meta: readDescriptorValue(record, header.metaField || header.subtitleField, header.description || header.subtitle),
      badges,
    });
  }

  /**
   * @param {readonly ViewSummaryPanelDescriptor[] | undefined} summaryPanels
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderSummaryPanels(summaryPanels, view, record) {
    if (!Array.isArray(summaryPanels)) {
      return [];
    }

    return summaryPanels.map((panel) => view.createInfoPanel({
      title: panel.title || panel.label,
      message: readDescriptorValue(record, panel.messageField, panel.description),
      items: (panel.items || []).map((/** @type {ViewSummaryPanelItemDescriptor} */ item) => ({
        label: item.label || item.field || "",
        value: readDescriptorValue(record, item.field, item.value || ""),
      })),
    }));
  }

  /**
   * @param {ViewItemFormDescriptor | undefined} itemForm
   * @param {ViewPrimitives} view
   * @param {unknown} record
   */
  function renderFieldGridShell(itemForm, view, record) {
    const fields = Array.isArray(itemForm?.fields) ? itemForm.fields : [];
    // An absent form already produced an empty list; naming it here is what lets the read below
    // see a form, and it returns in exactly the cases the empty-list check did.
    if (!itemForm || !fields.length) {
      return null;
    }

    const editable = itemForm.editable === true;
    return view.createFieldGrid({
      editable,
      fields: fields.map((field) => renderFieldShell(field, view, {
        disabled: !editable,
        value: readDescriptorValue(record, field.field, field.default ?? ""),
      })),
    });
  }

  /**
   * @param {DescriptorItemRows} itemRows
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderItemCollection(itemRows, view, state) {
    const record = state.selectedRecord;
    // Read once and narrow: the value reader is contract-typed since 0.33.33.35.2, so the
    // guard has to apply to the value that is actually used rather than to a second call.
    const declaredItems = readDescriptorValue(record, itemRows?.itemsField || "items", []);
    const items = Array.isArray(declaredItems) ? declaredItems : [];

    if (!itemRows || items.length === 0) {
      return null;
    }

    return view.createElement("div", {
      className: "view-renderer-item-collection",
      children: items.map((item) => renderItemRow(itemRows, item, view, state)),
    });
  }

  /**
   * @param {DescriptorItemRows} itemRows
   * @param {Record<string, unknown>} item
   * @param {ViewPrimitives} view
   * @param {RendererState} state
   */
  function renderItemRow(itemRows, item, view, state) {
    const children = [
      view.createElement("strong", {
        className: "view-renderer-item-title",
        text: readDescriptorValue(item, itemRows.itemTitleField || "title", item.title || item.label || "Item"),
      }),
    ];

    const chips = (Array.isArray(itemRows.chips) ? itemRows.chips : [])
      .map((chip) => readDescriptorValue(item, chip.field, chip.label || ""))
      .filter(Boolean);
    if (chips.length > 0) {
      children.push(view.createElement("span", {
        className: ["view-renderer-item-chips", "surface-chip-row"],
        children: chips.map((chip) => view.createElement("span", { className: "surface-chip", text: String(chip) })),
      }));
    }

    const subtitle = readDescriptorValue(item, itemRows.itemSubtitleField || "description", item.description || "");
    if (subtitle) {
      children.push(view.createElement("p", { className: "view-renderer-item-subtitle", text: subtitle }));
    }

    for (const field of (Array.isArray(itemRows.metaFields) ? itemRows.metaFields : [])) {
      const value = readDescriptorValue(item, field, "");
      if (value) {
        children.push(view.createElement("span", { className: "view-renderer-item-meta", text: String(value) }));
      }
    }

    const rowActions = (Array.isArray(itemRows.rowActions) ? itemRows.rowActions : [])
      .filter((action) => evaluateVisibleWhen(action.visibleWhen, item))
      .map((action) => normalizeAction(action, state, item));
    if (rowActions.length > 0) {
      children.push(view.createDetailActionStrip({
        ariaLabel: itemRows.actionsLabel || "Item actions",
        actions: rowActions,
      }));
    }

    return view.createElement("article", {
      className: "view-renderer-item-row surface-card",
      children,
    });
  }

  /**
   * @param {ViewVisibleWhenDescriptor | undefined} condition
   * @param {unknown} record
   */
  function evaluateVisibleWhen(condition, record) {
    if (!condition || typeof condition !== "object") {
      return true;
    }
    const value = readDescriptorValue(record, condition.field, undefined);
    if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
      return value === condition.equals;
    }
    if (Array.isArray(condition.in)) {
      return condition.in.includes(value);
    }
    if (condition.truthy === true) {
      return Boolean(value);
    }
    if (condition.falsy === true) {
      return !value;
    }
    return true;
  }

  /**
   * @param {readonly ViewModalDescriptor[] | undefined} modals
   * @param {ViewPrimitives} view
   */
  function renderModalShells(modals, view) {
    if (!Array.isArray(modals)) {
      return [];
    }

    return modals.map((modal) => view.createModalForm({
      title: modal.title || modal.label || "Modal",
      fields: (modal.fields || []).map((/** @type {ViewFieldDescriptor} */ field) => renderFieldShell(field, view)),
      actions: [...(modal.footerActions || []), ...(modal.actions || [])]
        .map((action) => normalizeAction(action)),
    }));
  }

  /**
   * Descriptor actions, filtered by `visibleWhen` and normalized into builder actions.
   *
   * `actions` is what all three callers pass - a surface's, a detail strip's or a table row's
   * `ViewActionDescriptor[]`, or nothing - and what this body reads: `visibleWhen`, then
   * `normalizeAction`, which takes a `DescriptorAction`. It was annotated as builder actions
   * (`BrowserViewAction`) from `0.33.33.39.9`, which `0.33.33.39.22` carried forward; that is the
   * shape this function produces, not the one it receives. `ariaLabel` is forwarded unchanged to
   * the strip, which takes a `BrowserViewTextValue`, so it is named as that.
   * @param {readonly DescriptorAction[] | undefined} actions
   * @param {ViewPrimitives} view
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewTextValue} ariaLabel
   * @param {RendererState | null} [state]
   * @param {unknown} [recordOverride]
   */
  function renderActions(actions, view, ariaLabel, state = null, recordOverride = undefined) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return null;
    }

    const visibleActions = recordOverride === undefined
      ? actions
      : actions.filter((action) => evaluateVisibleWhen(action.visibleWhen, recordOverride));
    if (visibleActions.length === 0) {
      return null;
    }

    return view.createDetailActionStrip({
      ariaLabel,
      actions: visibleActions.map((action) => normalizeAction(action, state, recordOverride)),
    });
  }

  /**
   * The three published action-list renderers take `readonly BrowserViewAction[]` since
   * `0.33.33.39.25`: a node, used as-is, or an option bag the builder hands to
   * `createActionButton`. The list is forwarded unchanged; the builder still decides at runtime
   * whether an option bag can render, including its accessible-name requirement.
   * @param {readonly BrowserViewAction[]} [actions]
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailActionStripOptions} [options]
   */
  function renderDescriptorActionStrip(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createDetailActionStrip({
      ariaLabel: options.ariaLabel || "Actions",
      className: options.className,
      actions,
    });
  }

  /**
   * @param {readonly BrowserViewAction[]} [actions]
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewDetailActionMenuOptions} [options]
   */
  function renderDescriptorActionMenu(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createDetailActionMenu({
      ariaLabel: options.ariaLabel || "Actions",
      summaryLabel: options.summaryLabel,
      title: options.title,
      className: options.className,
      actions,
    });
  }

  /**
   * @param {readonly BrowserViewAction[]} [actions]
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewInlineActionRowOptions} [options]
   */
  function renderDescriptorInlineActions(actions = [], options = {}) {
    const view = requireViewPrimitives();
    return view.createInlineActionRow({
      ariaLabel: options.ariaLabel || "Actions",
      className: options.className,
      actions,
    });
  }

  /** @typedef {import("../../../src/types/framework-contracts.js").ViewActionDescriptor} ViewActionDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewFieldDescriptor} ViewFieldDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewLinkedRecordsDescriptor} ViewLinkedRecordsDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewModalDescriptor} ViewModalDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewTableColumnDescriptor} ViewTableColumnDescriptor */
  /** @typedef {import("../../../src/types/framework-contracts.js").ViewTableDescriptor} ViewTableDescriptor */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewAction} BrowserViewAction */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewActionButtonOptions} BrowserViewActionButtonOptions */

  /**
   * The descriptor fragments these renderers are actually handed.
   *
   * **`Partial` because the callers pass fragments, not whole framework descriptors.** `lists.js`
   * renders a field grid from `{ fields: modal.fields || [] }` and from an empty `{ fields: [] }`;
   * `files.js` passes a modal descriptor it builds itself. The published renderer signatures take
   * `unknown` for that reason, and these say what each renderer reads without claiming a caller
   * supplied a complete descriptor.
   *
   * **Each intersection names a member the renderer reads that the framework descriptor does not
   * declare** - a table's `title`, a column's `key`, `align` and `header`, a linked-records
   * panel's `ariaLabel`, an action's `modal` and `modalId`. They are read as `unknown` and
   * recorded as findings for the descriptor contract's owner; nothing here repairs one.
   * @typedef {Partial<ViewTableColumnDescriptor> & {
   *   align?: unknown, chipLabelField?: unknown, chipsField?: unknown, depthField?: unknown,
   *   header?: unknown, key?: unknown
   * }} DescriptorColumn
   */

  /** @typedef {Omit<Partial<ViewTableDescriptor>, "columns"> & { columns?: readonly DescriptorColumn[], title?: unknown }} DescriptorTable */

  /** @typedef {{ fields?: readonly Partial<ViewFieldDescriptor>[] }} DescriptorFieldSource */

  /** @typedef {Partial<ViewModalDescriptor>} DescriptorModal */

  /** @typedef {Partial<ViewLinkedRecordsDescriptor> & { ariaLabel?: unknown }} DescriptorLinkedRecords */

  /** @typedef {Partial<ViewActionDescriptor> & { modal?: unknown, modalId?: unknown }} DescriptorAction */

  /**
   * The published option bags, narrowed at the three members these renderers do more than forward.
   *
   * `columns` is mapped member by member, `actions` is filtered, and the two form slots are spread
   * into `append` - each needs a list where the published bag accepts anything. The declarations
   * state the requirement the code already made rather than adding a check to satisfy one.
   * @typedef {import("../../../src/types/browser-contracts.js").BrowserViewDataTableOptions & { columns?: readonly DescriptorColumn[] }} DescriptorTableOptions
   */

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewModalFormOptions & { actions?: readonly unknown[] }} DescriptorModalOptions */

  /**
   * @typedef {import("../../../src/types/browser-contracts.js").BrowserViewDescriptorLinkedRecordsOptions & {
   *   formActions?: readonly (Node | string)[], formFields?: readonly (Node | string)[]
   * }} DescriptorLinkedRecordsOptions
   */

  /**
   * @param {DescriptorTable} [tableDescriptor]
   * @param {DescriptorTableOptions} [options]
   */
  function renderDescriptorDataTable(tableDescriptor = {}, options = {}) {
    const view = requireViewPrimitives();
    return view.createDataTable({
      caption: options.caption || tableDescriptor.title || "",
      className: options.className,
      tableClassName: options.tableClassName,
      hierarchy: tableDescriptor.hierarchy || options.hierarchy,
      columns: (tableDescriptor.columns || options.columns || []).map((column) => ({
        key: column.field || column.id || column.key,
        label: column.label || column.field || column.id || column.key || "",
        align: column.align,
        header: column.header,
        render: tableColumnRenderer(column, tableDescriptor, view),
      })),
      rows: options.rows || [],
      emptyMessage: options.emptyMessage || tableDescriptor.emptyState?.message || tableDescriptor.emptyState?.description || "No records found.",
    });
  }

  /**
   * @param {DescriptorFieldSource} [fieldDescriptor]
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewDescriptorFieldGridOptions} [options]
   */
  function renderDescriptorFieldGrid(fieldDescriptor = {}, options = {}) {
    const view = requireViewPrimitives();
    const values = options.values && typeof options.values === "object" ? options.values : {};
    const fields = options.fields || (fieldDescriptor.fields || []).map((field) => {
      const fieldKey = field.field || field.id || "";
      const fieldOptions = { ...(options.fieldOptions || {}) };
      if (Object.prototype.hasOwnProperty.call(values, fieldKey)) {
        fieldOptions.value = values[fieldKey];
      }
      if (options.editable !== undefined) {
        fieldOptions.disabled = !options.editable;
      }
      return renderFieldShell(field, view, fieldOptions);
    });
    return view.createFieldGrid({
      surface: options.surface,
      className: options.className,
      dataset: options.dataset,
      editable: options.editable,
      fields,
    });
  }

  /**
   * @param {DescriptorModal} [modal]
   * @param {DescriptorModalOptions} [options]
   */
  function renderDescriptorModalForm(modal = {}, options = {}) {
    const view = requireViewPrimitives();
    const actions = options.actions
      ? options.actions
      : [...(modal.footerActions || []), ...(modal.actions || [])]
        .map((action) => normalizeAction(action));
    return view.createModalForm({
      title: options.title || modal.title || modal.label || "Modal",
      className: options.className,
      formClassName: options.formClassName,
      size: options.size || modal.size,
      fields: options.fields || (modal.fields || []).map((field) => renderFieldShell(field, view)),
      actions,
      utilityActions: options.utilityActions,
    });
  }

  /**
   * @param {DescriptorLinkedRecords} [linkedRecords]
   * @param {DescriptorLinkedRecordsOptions} [options]
   */
  function renderDescriptorLinkedRecordsPanel(linkedRecords = {}, options = {}) {
    const view = requireViewPrimitives();
    const section = view.createInfoPanel({
      title: options.title || linkedRecords.title || linkedRecords.label || "Linked Records",
      className: options.className,
      ariaLabel: options.ariaLabel || linkedRecords.ariaLabel || "Linked records",
      collapsible: options.collapsible,
      open: options.open,
    });
    const records = view.createElement("div", {
      className: options.recordsClassName || "view-linked-record-list",
    });
    const recordNodes = Array.isArray(options.recordNodes) ? options.recordNodes : [];
    if (recordNodes.length > 0) {
      records.replaceChildren(...recordNodes);
    } else {
      records.appendChild(view.createElement("p", {
        className: options.emptyClassName || "view-linked-record-empty",
        text: linkedRecords.emptyState?.message || linkedRecords.emptyState?.description || "No linked records yet.",
      }));
    }

    section.dataset.viewLinkedRecordsPanel = "";
    section.appendChild(records);

    if (options.formFields || options.formActions) {
      const form = view.createElement("form", {
        className: options.formClassName || ["view-linked-record-form", "view-field-grid", "surface-modal-section-body"],
        dataset: options.formDataset,
        hidden: options.locked || options.hidden,
      });
      form.append(...(options.formFields || []), ...(options.formActions || []));
      section.appendChild(form);
    }

    return section;
  }

  /**
   * A field through the builder, which takes the descriptor as `unknown` and validates it itself.
   * @param {unknown} field
   * @param {ViewPrimitives} view
   * @param {import("../../../src/types/browser-contracts.js").BrowserViewFieldOptions} [options]
   */
  function renderFieldShell(field, view, options = {}) {
    return view.createField(field, options);
  }

  /**
   * `fieldName` is `unknown` rather than `string` because this reader's own first statement
   * answers the fallback for an absent one, and the published `readPath` it delegates to takes
   * the path as `unknown` too. Four callers compose a name from members that may be absent.
   * @param {unknown} record
   * @param {unknown} fieldName
   * @param {unknown} [fallback]
   * @returns {unknown}
   */
  function readDescriptorValue(record, fieldName, fallback = "") {
    if (!fieldName) {
      return fallback;
    }

    const value = requireDataBinding().readPath(record, fieldName);
    return value === undefined || value === null ? fallback : value;
  }

  /**
   * @param {unknown} title
   * @param {Record<string, unknown> | null | undefined} emptyState
   * @param {ReturnType<typeof requireViewPrimitives>} view
   */
  function renderPlaceholder(title, emptyState, view) {
    return view.createEmptyState({
      title: emptyState?.title || title,
      message: emptyState?.message || emptyState?.description || "No records loaded.",
    });
  }

  /**
   * `state` is nullable because half this file's callers have one and half do not: a modal shell
   * and a descriptor modal-form render their actions with no state at all, and those actions come
   * back `disabled` with no `onClick`. That is the existing behaviour, now named.
   * @param {DescriptorAction} [action]
   * @param {RendererState | null} [state]
   * @param {unknown} [recordOverride]
   * @returns {BrowserViewActionButtonOptions}
   */
  function normalizeAction(action = {}, state = null, recordOverride = undefined) {
    /** @type {BrowserViewActionButtonOptions} */
    const normalized = {
      label: action.label || action.id || "Action",
      role: action.role,
      icon: action.icon,
      iconOnly: action.iconOnly === true,
      title: action.title || action.label || action.id || "Action",
      action: action.behavior || action.id,
      disabled: !state,
      onClick: state ? () => runDescriptorAction(action, state, recordOverride) : undefined,
    };
    if (action.iconOnly === true) {
      normalized.text = "";
    }
    return normalized;
  }

  /**
   * `state` was left uninferred while `0.33.33.39.8` measured the surface slot as a completed
   * element; it is a `SurfaceUnderConstruction` instead, so the slot names what it holds and this
   * reads through it. Neither parameter below is marked optional, because a required `state` sits
   * between them.
   * @param {DescriptorAction} action
   * @param {RendererState} state
   * @param {unknown} recordOverride
   */
  async function runDescriptorAction(action = {}, state, recordOverride = undefined) {
    const record = recordOverride !== undefined ? recordOverride : state.selectedRecord;
    try {
      state.actionError = null;
      const actionSecurity = requireActionSecurity();
      if (action.confirm && !(await actionSecurity.confirmDescriptorAction(action))) {
        return;
      }

      if (action.route) {
        // The capability first, then the write. A route action's normal completion includes the
        // reload, so a surface that cannot refresh fails before anything is sent rather than
        // after it. If the write succeeds and the reload then fails, that rejection travels to
        // the catch below untouched: the write is not replayed and the failure is not cleared.
        const surface = state.surface;
        const refresh = surface?.refresh;
        if (typeof refresh !== "function") {
          throw new Error("View surface refresh is unavailable: the surface has not finished initialising.");
        }
        await actionSecurity.runRouteAction(action, {
          api: requireApiClient(),
          readValue: readDescriptorValue,
          record,
        });
        state.actionError = null;
        await Reflect.apply(refresh, surface, []);
        return;
      }

      if (action.behavior) {
        await runBehaviorAction(action, state, record);
        return;
      }

      if (action.modalId || action.modal) {
        openDescriptorModal(state, action.modalId || action.modal, record);
        return;
      }
    } catch (error) {
      state.actionError = error;
      if (surfaceOwnsRenderedData(state)) {
        rerenderState(state);
      }
    }
  }

  /**
   * @param {{ behavior?: unknown }} action
   * @param {RendererState} state
   * @param {unknown} [recordOverride]
   */
  async function runBehaviorAction(action, state, recordOverride = null) {
    const handler = behaviors.get(action.behavior);
    if (!handler) {
      throw new Error(`Missing view behavior handler: ${action.behavior}`);
    }

    await handler({
      action,
      api: requireApiClient(),
      openModal: (/** @type {unknown} */ modalId, record = state.selectedRecord) => openDescriptorModal(state, modalId, record),
      record: recordOverride !== null ? recordOverride : state.selectedRecord,
      refresh: state.surface?.refresh,
      workspaceContext: root.workspaceContext || {},
    });
    state.actionError = null;
    // Only the framework re-renders surfaces whose data it owns. When dataSource is null the module
    // owns the surface body (mounted chrome + loaded data), so a framework rerender would wipe it.
    if (surfaceOwnsRenderedData(state)) {
      rerenderState(state);
    }
  }

  /**
   * @param {RendererState} state
   * @param {unknown} modalId
   * @param {unknown} [record]
   */
  function openDescriptorModal(state, modalId, record = null) {
    const modal = (state.descriptor.modals || []).find((candidate) => candidate.id === modalId);
    if (!modal) {
      throw new Error(`Descriptor modal not found: ${modalId}`);
    }

    const dialog = state.view.createModalForm({
      title: modal.title || modal.label || "Modal",
      fields: (modal.fields || []).map((field) => renderFieldShell(field, state.view, {
        value: readDescriptorValue(record, field.field, field.default || ""),
      })),
      actions: [...(modal.footerActions || []), ...(modal.actions || [])]
        .map((action) => normalizeAction(action, state)),
    });
    // The modal needs somewhere to append, and nothing else. The body is preferred and the
    // surface stands in for it, exactly as before; only the failure is now described rather
    // than left to the native one, and `Reflect.apply` keeps the original receiver.
    const parent = global.document?.body || state.surface;
    const appendChild = parent?.appendChild;
    if (typeof appendChild !== "function") {
      throw new Error("View surface modals require a host that can append: no document body or surface is available.");
    }
    Reflect.apply(appendChild, parent, [dialog]);
    state.view.showModal(dialog);
    return dialog;
  }

  /** @param {RendererState} [state] */
  function surfaceOwnsRenderedData(state) {
    return Boolean(state?.descriptor?.dataSource?.route);
  }

  /** @param {RendererState} state */
  function rerenderState(state) {
    const body = state.surface?.querySelector?.(".view-renderer-body") || state.surface?.firstChild;
    if (!body) {
      return;
    }
    renderInto(body, renderLayout(state.descriptor, state.view, state));
    flushMounts(state);
  }

  function clearHost(host) {
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
  }

  function replaceNode(existingNode, replacementNode) {
    const parent = existingNode?.parentNode;
    if (!parent) {
      return;
    }
    parent.removeChild(existingNode);
    parent.appendChild(replacementNode);
  }

  /**
   * Whether the three channels `renderSurface` installs are present.
   *
   * They are attached with `Object.defineProperty`, which keeps them off the element's type the
   * same way `viewParts` is kept off a builder result. This checks for them rather than
   * asserting them, so the published return contract is earned.
   * @param {HTMLElement} element
   * @returns {element is BrowserViewSurfaceElement}
   */
  function isSurfaceElement(element) {
    return "refresh" in element && "openModal" in element && "viewState" in element;
  }

  /**
   * The builder primitives this renderer is written against.
   *
   * `root.view || {}` produced a union whose empty branch answered every member read, which is
   * the un-narrowed acquisition `0.33.33.38.1` removed from every other consumer. An absent
   * factory failed the first member check and threw; it now fails one line earlier with the
   * same message from the same call, which is the same observable behaviour.
   * @returns {BrowserViewFactory}
   */
  function requireViewPrimitives() {
    const view = root.view;
    if (!view) {
      throw new Error("View surface rendering requires LongtailForge.view primitives.");
    }
    for (const helperName of [
      "createCollapsibleIndexPanel",
      "createDataTable",
      "createDetailActionStrip",
      "createDetailHeader",
      "createElement",
      "createEmptyState",
      "createField",
      "createFieldGrid",
      "createFilterPanel",
      "createIndexList",
      "createInfoPanel",
      "createInlineActionRow",
      "createModalForm",
      "normalizeSurfaceDescriptor",
      "createPageHeader",
      "createSplitListDetail",
    ]) {
      if (typeof view[helperName] !== "function") {
        throw new Error("View surface rendering requires LongtailForge.view primitives.");
      }
    }
    return view;
  }

  /** @returns {BrowserViewActionSecurity} */
  function requireActionSecurity() {
    const actionSecurity = root.viewActionSecurity;
    if (typeof actionSecurity?.runRouteAction !== "function") {
      throw new Error("View surface actions require LongtailForge.viewActionSecurity.");
    }
    return actionSecurity;
  }

  /** @returns {BrowserViewSearchOptions} */
  function requireSearchOptions() {
    const searchOptions = root.viewSearchOptions;
    if (typeof searchOptions?.setFieldOptions !== "function") {
      throw new Error("View surface fields require LongtailForge.viewSearchOptions.");
    }
    return searchOptions;
  }

  /** @returns {BrowserViewDataBinding} */
  function requireDataBinding() {
    const dataBinding = root.viewDataBinding;
    if (typeof dataBinding?.loadBoundRecords !== "function") {
      throw new Error("View surface data binding requires LongtailForge.viewDataBinding.");
    }
    return dataBinding;
  }

  /** @returns {BrowserApi} */
  function requireApiClient() {
    const api = requireApi();
    if (typeof api?.getJson !== "function") {
      throw new Error("View surface data binding requires LongtailForge.api.getJson.");
    }
    return api;
  }

  // The renderer extends the builder's factory and cannot stand in for it: every function above
  // calls requireViewPrimitives() first, so a renderer-only object was a factory no caller could
  // use. The extension is now guarded by the thing it extends, which also lets the spread name
  // that surface directly - the || {} it replaces was contributing nothing a spread does not.
  if (root.view) {
    root.view = Object.freeze({
      ...root.view,
      createSlideOutSidebarController,
      registerBehavior,
      renderDescriptorActionMenu,
      renderDescriptorActionStrip,
      renderDescriptorDataTable,
      renderDescriptorFieldGrid,
      renderDescriptorInlineActions,
      renderDescriptorLinkedRecordsPanel,
      renderDescriptorModalForm,
      renderSurface,
    });
  }
  global.LongtailForge = root;
})(window);
